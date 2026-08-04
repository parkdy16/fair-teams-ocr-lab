import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SharedRosterUser } from "@/lib/sharedRosterService";
import {
  deleteTaskBoardCard,
  deleteTaskBoardColumn,
  listenToTaskBoard,
  saveTaskBoardCard,
  saveTaskBoardColumn,
  saveTaskBoardColumns,
  saveTaskBoardMeta,
  type TaskBoardActivity,
  type TaskBoardCard,
  type TaskBoardColumn,
  type TaskBoardMeta,
  type TaskBoardSnapshot,
} from "@/lib/taskBoardService";

type Props = {
  rosterName: string;
  workspaceKey: string;
  themeColor?: string;
  scopeId?: string;
  isSharedRoster: boolean;
  user: SharedRosterUser | null;
};

type LocalBoard = TaskBoardSnapshot;

const DEFAULT_COLUMNS = ["Agenda", "To-do", "In progress", "Done"];
const LEGACY_DEFAULT_COLUMNS = ["Inbox", "Agenda", "In progress", "Waiting", "Done"];
const CATEGORIES = ["Administration", "Sports", "Equipment", "Event", "Finance", "Membership", "Other"];
const LONG_PRESS_MS = 560;

function blurOnDoneKey(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.blur();
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value! : "#0f766e";
}

function mixHex(base: string, target: string, ratio: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const a = parse(safeColor(base));
  const b = parse(target);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * ratio).toString(16).padStart(2, "0")).join("")}`;
}

function nowActivity(action: TaskBoardActivity["action"], actorName: string, actorEmail?: string, extra: Partial<TaskBoardActivity> = {}): TaskBoardActivity {
  return { id: id("activity"), action, actorName, actorEmail, at: Date.now(), ...extra };
}

function actor(user: SharedRosterUser | null) {
  return { name: user?.displayName?.trim() || user?.email || "Organizer", email: user?.email || undefined };
}

function localKey(workspaceKey: string) {
  return `fairteams.taskBoard.v2.${workspaceKey.trim().replace(/[^a-z0-9_-]+/gi, "-") || "roster"}`;
}

function isUntouchedLegacyBoard(board: LocalBoard) {
  if (board.cards.length > 0 || board.columns.length !== LEGACY_DEFAULT_COLUMNS.length) return false;
  const names = [...board.columns].sort((a, b) => a.position - b.position).map((column) => column.name);
  return names.every((name, index) => name === LEGACY_DEFAULT_COLUMNS[index]);
}

function migrateUntouchedLegacyBoard(board: LocalBoard): LocalBoard {
  if (!isUntouchedLegacyBoard(board)) return board;
  const ordered = [...board.columns].sort((a, b) => a.position - b.position);
  const now = Date.now();
  return {
    ...board,
    columns: DEFAULT_COLUMNS.map((name, index) => ({
      ...ordered[index],
      name,
      position: (index + 1) * 1000,
      updatedAt: now,
    })),
  };
}

function createDefaultBoard(rosterName: string): LocalBoard {
  const now = Date.now();
  return {
    meta: { name: rosterName.trim() || "Tasks", createdAt: now, updatedAt: now },
    columns: DEFAULT_COLUMNS.map((name, index) => ({ id: id("column"), name, position: (index + 1) * 1000, createdAt: now, updatedAt: now })),
    cards: [],
  };
}

function readLocalBoard(workspaceKey: string, rosterName: string): LocalBoard {
  if (typeof window === "undefined") return createDefaultBoard(rosterName);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localKey(workspaceKey)) || "null") as LocalBoard | null;
    if (parsed?.meta && Array.isArray(parsed.columns) && Array.isArray(parsed.cards)) return migrateUntouchedLegacyBoard(parsed);
  } catch {
    // Use clean board.
  }
  return createDefaultBoard(rosterName);
}

function writeLocalBoard(workspaceKey: string, board: LocalBoard) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(workspaceKey), JSON.stringify(board));
}

function formatTime(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(date);
}

function dueText(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function isOverdue(value?: string) {
  if (!value) return false;
  const due = new Date(`${value}T23:59:59`).getTime();
  return Number.isFinite(due) && due < Date.now();
}

function activityText(activity: TaskBoardActivity) {
  if (activity.action === "created") return `${activity.actorName} created this card`;
  if (activity.action === "moved") return `${activity.actorName} moved it from ${activity.fromColumnName || "another column"} to ${activity.toColumnName || "this column"}`;
  if (activity.action === "assigned") return `${activity.actorName} changed the assignee`;
  if (activity.action === "unassigned") return `${activity.actorName} removed the assignee`;
  return `${activity.actorName} edited this card`;
}

export function TaskBoard({ rosterName, workspaceKey, themeColor, scopeId, isSharedRoster, user }: Props) {
  const online = Boolean(scopeId && user?.email);
  const [board, setBoard] = useState<LocalBoard>(() => readLocalBoard(workspaceKey, rosterName));
  const [boardOpen, setBoardOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());
  const [cardEditorOpen, setCardEditorOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardTitle, setCardTitle] = useState("");
  const [cardNote, setCardNote] = useState("");
  const [cardAssignee, setCardAssignee] = useState("");
  const [cardDueDate, setCardDueDate] = useState("");
  const [cardCategory, setCardCategory] = useState("Administration");
  const [cardColumnId, setCardColumnId] = useState("");
  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnNameDraft, setColumnNameDraft] = useState("");
  const pressTimerRef = useRef<number | null>(null);
  const onlineInitializationRef = useRef<string | null>(null);
  const longPressTriggeredRef = useRef(false);
  const background = mixHex(safeColor(themeColor), "#ffffff", 0.84);
  const columnBackground = mixHex(safeColor(themeColor), "#ffffff", 0.94);
  const accent = safeColor(themeColor);

  useEffect(() => {
    setFlippedIds(new Set());
    if (!online) {
      setBoard(readLocalBoard(workspaceKey, rosterName));
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    onlineInitializationRef.current = null;
    return listenToTaskBoard(scopeId!, (snapshot) => {
      if (!snapshot.meta && snapshot.columns.length === 0 && onlineInitializationRef.current !== scopeId) {
        onlineInitializationRef.current = scopeId!;
        const fresh = createDefaultBoard(rosterName);
        setBoard(fresh);
        Promise.all([
          saveTaskBoardMeta(scopeId!, fresh.meta!),
          ...fresh.columns.map((column) => saveTaskBoardColumn(scopeId!, column)),
        ]).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Could not create task board."));
      } else {
        const received = { meta: snapshot.meta || { name: rosterName }, columns: snapshot.columns, cards: snapshot.cards };
        const migrated = migrateUntouchedLegacyBoard(received);
        setBoard(migrated);
        if (migrated !== received && onlineInitializationRef.current !== `migration:${scopeId}`) {
          onlineInitializationRef.current = `migration:${scopeId}`;
          const keptIds = new Set(migrated.columns.map((column) => column.id));
          Promise.all([
            ...migrated.columns.map((column) => saveTaskBoardColumn(scopeId!, column)),
            ...snapshot.columns.filter((column) => !keptIds.has(column.id)).map((column) => deleteTaskBoardColumn(scopeId!, column.id)),
          ]).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Could not update default board columns."));
        }
      }
      setLoading(false);
    }, (nextError) => {
      setLoading(false);
      setError(nextError.message || "Could not load task board.");
    });
  }, [online, rosterName, scopeId, workspaceKey]);

  useEffect(() => {
    if (!online) writeLocalBoard(workspaceKey, board);
  }, [board, online, workspaceKey]);

  const activeColumns = useMemo(() => board.columns.filter((column) => !column.archived).sort((a, b) => a.position - b.position), [board.columns]);
  const openCards = useMemo(() => {
    const doneIds = new Set(activeColumns.filter((column) => /done|complete|finished/i.test(column.name)).map((column) => column.id));
    return board.cards.filter((card) => !doneIds.has(card.columnId));
  }, [activeColumns, board.cards]);
  const overdueCount = openCards.filter((card) => isOverdue(card.dueDate)).length;
  const myName = actor(user).name.toLowerCase();
  const mineCount = openCards.filter((card) => card.assignee?.trim().toLowerCase() === myName).length;
  const latestActivity = useMemo(() => board.cards.flatMap((card) => card.activities.map((activity) => ({ card, activity }))).sort((a, b) => b.activity.at - a.activity.at)[0], [board.cards]);

  const updateBoard = (next: LocalBoard) => setBoard(next);
  const persistMeta = async (meta: TaskBoardMeta) => {
    updateBoard({ ...board, meta });
    if (online) await saveTaskBoardMeta(scopeId!, meta);
  };
  const persistColumn = async (column: TaskBoardColumn) => {
    updateBoard({ ...board, columns: [...board.columns.filter((item) => item.id !== column.id), column] });
    if (online) await saveTaskBoardColumn(scopeId!, column);
  };
  const persistColumns = async (columns: TaskBoardColumn[]) => {
    updateBoard({ ...board, columns });
    if (online) await saveTaskBoardColumns(scopeId!, columns);
  };
  const persistCard = async (card: TaskBoardCard) => {
    updateBoard({ ...board, cards: [...board.cards.filter((item) => item.id !== card.id), card] });
    if (online) await saveTaskBoardCard(scopeId!, card);
  };

  const openNewCard = (columnId?: string) => {
    setEditingCardId(null);
    setCardTitle(""); setCardNote(""); setCardAssignee(""); setCardDueDate(""); setCardCategory("Administration");
    setCardColumnId(columnId || activeColumns[0]?.id || "");
    setCardEditorOpen(true);
  };

  const openEditCard = (card: TaskBoardCard) => {
    setEditingCardId(card.id); setCardTitle(card.title); setCardNote(card.note || ""); setCardAssignee(card.assignee || "");
    setCardDueDate(card.dueDate || ""); setCardCategory(card.category || "Administration"); setCardColumnId(card.columnId);
    setCardEditorOpen(true);
  };

  const saveCard = async () => {
    if (!cardTitle.trim() || !cardColumnId) return;
    const currentActor = actor(user);
    const existing = board.cards.find((card) => card.id === editingCardId);
    const now = Date.now();
    const columnCards = board.cards.filter((card) => card.columnId === cardColumnId);
    const changedAssignee = existing && (existing.assignee || "") !== cardAssignee.trim();
    const activity = existing
      ? nowActivity(changedAssignee ? (cardAssignee.trim() ? "assigned" : "unassigned") : "edited", currentActor.name, currentActor.email)
      : nowActivity("created", currentActor.name, currentActor.email);
    const card: TaskBoardCard = {
      id: existing?.id || id("card"), title: cardTitle.trim(), note: cardNote.trim() || undefined,
      columnId: cardColumnId, position: existing?.position || (columnCards.length + 1) * 1000,
      assignee: cardAssignee.trim() || undefined, dueDate: cardDueDate || undefined, category: cardCategory,
      createdAt: existing?.createdAt || now, createdByName: existing?.createdByName || currentActor.name,
      createdByEmail: existing?.createdByEmail || currentActor.email, updatedAt: now, updatedByName: currentActor.name,
      lastMovedAt: existing?.lastMovedAt, lastMovedByName: existing?.lastMovedByName,
      activities: [...(existing?.activities || []), activity].slice(-20),
    };
    setSaving(true); setError("");
    try { await persistCard(card); setCardEditorOpen(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not save card."); }
    finally { setSaving(false); }
  };

  const moveCard = async (card: TaskBoardCard, destinationId: string) => {
    if (card.columnId === destinationId) { setMoveCardId(null); return; }
    const currentActor = actor(user);
    const from = activeColumns.find((column) => column.id === card.columnId)?.name;
    const to = activeColumns.find((column) => column.id === destinationId)?.name;
    const destinationCards = board.cards.filter((item) => item.columnId === destinationId);
    const moved: TaskBoardCard = {
      ...card, columnId: destinationId, position: (destinationCards.length + 1) * 1000,
      updatedAt: Date.now(), updatedByName: currentActor.name, lastMovedAt: Date.now(), lastMovedByName: currentActor.name,
      activities: [...card.activities, nowActivity("moved", currentActor.name, currentActor.email, { fromColumnName: from, toColumnName: to })].slice(-20),
    };
    setSaving(true); setError("");
    try { await persistCard(moved); setMoveCardId(null); setFlippedIds((current) => { const next = new Set(current); next.delete(card.id); return next; }); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not move card."); }
    finally { setSaving(false); }
  };

  const removeCard = async () => {
    if (!editingCardId || !window.confirm("Delete this card?")) return;
    const previous = board;
    updateBoard({ ...board, cards: board.cards.filter((card) => card.id !== editingCardId) });
    try { if (online) await deleteTaskBoardCard(scopeId!, editingCardId); setCardEditorOpen(false); }
    catch (nextError) { updateBoard(previous); setError(nextError instanceof Error ? nextError.message : "Could not delete card."); }
  };

  const saveBoardName = async () => {
    const name = boardNameDraft.trim();
    if (!name) return;
    setSaving(true);
    try { await persistMeta({ ...(board.meta || {}), name, updatedAt: Date.now(), updatedByName: actor(user).name }); setBoardSettingsOpen(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not rename board."); }
    finally { setSaving(false); }
  };

  const openNewColumn = () => { setEditingColumnId(null); setColumnNameDraft(""); setColumnEditorOpen(true); };
  const openEditColumn = (column: TaskBoardColumn) => { setEditingColumnId(column.id); setColumnNameDraft(column.name); setColumnEditorOpen(true); };
  const saveColumn = async () => {
    const name = columnNameDraft.trim();
    if (!name) return;
    const existing = board.columns.find((column) => column.id === editingColumnId);
    const column: TaskBoardColumn = existing || { id: id("column"), name, position: (activeColumns.length + 1) * 1000, createdAt: Date.now() };
    setSaving(true);
    try { await persistColumn({ ...column, name, updatedAt: Date.now() }); setColumnEditorOpen(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not save column."); }
    finally { setSaving(false); }
  };

  const shiftColumn = async (columnId: string, direction: -1 | 1) => {
    const index = activeColumns.findIndex((column) => column.id === columnId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activeColumns.length) return;
    const ordered = [...activeColumns];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const positions = new Map(ordered.map((column, itemIndex) => [column.id, (itemIndex + 1) * 1000]));
    const nextColumns = board.columns.map((column) => ({ ...column, position: positions.get(column.id) || column.position }));
    try { await persistColumns(nextColumns); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not reorder columns."); }
  };

  const archiveColumn = async () => {
    const column = board.columns.find((item) => item.id === editingColumnId);
    if (!column) return;
    if (board.cards.some((card) => card.columnId === column.id)) { setError("Move this column's cards before archiving it."); return; }
    if (activeColumns.length <= 1) { setError("Keep at least one active column."); return; }
    try { await persistColumn({ ...column, archived: true, updatedAt: Date.now() }); setColumnEditorOpen(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not archive column."); }
  };

  const permanentDeleteColumn = async () => {
    const column = board.columns.find((item) => item.id === editingColumnId);
    if (!column || board.cards.some((card) => card.columnId === column.id) || !window.confirm("Delete this empty column?")) return;
    const previous = board;
    updateBoard({ ...board, columns: board.columns.filter((item) => item.id !== column.id) });
    try { if (online) await deleteTaskBoardColumn(scopeId!, column.id); setColumnEditorOpen(false); }
    catch (nextError) { updateBoard(previous); setError(nextError instanceof Error ? nextError.message : "Could not delete column."); }
  };

  const restoreColumn = async (column: TaskBoardColumn) => {
    try { await persistColumn({ ...column, archived: false, position: (activeColumns.length + 1) * 1000, updatedAt: Date.now() }); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not restore column."); }
  };

  const deleteArchivedColumn = async (column: TaskBoardColumn) => {
    if (board.cards.some((card) => card.columnId === column.id) || !window.confirm(`Delete the empty column “${column.name}”?`)) return;
    const previous = board;
    updateBoard({ ...board, columns: board.columns.filter((item) => item.id !== column.id) });
    try { if (online) await deleteTaskBoardColumn(scopeId!, column.id); }
    catch (nextError) { updateBoard(previous); setError(nextError instanceof Error ? nextError.message : "Could not delete column."); }
  };

  const startPress = (cardId: string) => {
    longPressTriggeredRef.current = false;
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMoveCardId(cardId);
      navigator.vibrate?.(18);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => { if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current); pressTimerRef.current = null; };
  const shortTap = (cardId: string) => {
    cancelPress();
    if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return; }
    setFlippedIds((current) => { const next = new Set(current); next.has(cardId) ? next.delete(cardId) : next.add(cardId); return next; });
  };

  const currentMoveCard = board.cards.find((card) => card.id === moveCardId) || null;
  const editingColumn = board.columns.find((column) => column.id === editingColumnId) || null;

  return (
    <>
      <section className="rounded-[1.7rem] border p-3 shadow-sm" style={{ borderColor: mixHex(accent, "#ffffff", 0.72), background }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide" style={{ color: accent }}>
              <ClipboardList className="h-[18px] w-[18px]" /> Tasks
            </div>
            <h2 className="mt-1 truncate text-[17px] font-black leading-tight text-[#102A43]">{board.meta?.name || rosterName}</h2>
          </div>
          <Button type="button" className="h-9 shrink-0 rounded-2xl px-3 text-xs font-black text-white" style={{ backgroundColor: accent }} onClick={() => setBoardOpen(true)}>
            Open board
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black text-slate-600">
          <span className="rounded-full bg-white/75 px-2.5 py-1">{openCards.length} open</span>
          {mineCount > 0 && <span className="rounded-full bg-white/75 px-2.5 py-1">{mineCount} yours</span>}
          {overdueCount > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{overdueCount} overdue</span>}
          <span className="rounded-full bg-white/75 px-2.5 py-1">{online ? "Shared" : isSharedRoster ? "Sign in" : "Private"}</span>
        </div>
        {latestActivity && <div className="mt-2 truncate text-[10px] font-bold text-slate-500">Last: “{latestActivity.card.title}” · {activityText(latestActivity.activity)}</div>}
      </section>

      <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
        <DialogContent className="fixed inset-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:inset-2 sm:h-auto sm:w-auto sm:rounded-[2rem] sm:border">
          <DialogHeader className="border-b border-white/45 px-3 py-3 pr-12 text-left" style={{ backgroundColor: mixHex(accent, "#ffffff", 0.7) }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-black text-[#102A43]">{board.meta?.name || rosterName}</DialogTitle>
                <p className="mt-0.5 text-[10px] font-bold text-slate-600">{online ? "Live collaborator board" : "Organizer board"} · long press to move · tap to flip</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button type="button" variant="outline" className="h-9 w-9 rounded-2xl bg-white/80 p-0" onClick={() => { setBoardNameDraft(board.meta?.name || rosterName); setBoardSettingsOpen(true); }} aria-label="Board settings"><Pencil className="h-4 w-4" /></Button>
                <Button type="button" className="h-9 rounded-2xl px-3 text-xs font-black text-white" style={{ backgroundColor: accent }} onClick={() => openNewCard()}><Plus className="mr-1 h-4 w-4" />Card</Button>
              </div>
            </div>
          </DialogHeader>
          {error && <div className="mx-3 mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</div>}
          <div className="flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: background }}>
            {loading ? <div className="p-6 text-center text-sm font-black text-slate-500">Loading task board…</div> : (
              <div className="flex h-full snap-x snap-proximity gap-3 overflow-x-auto overflow-y-hidden px-3 pb-4 pt-3" style={{ overscrollBehaviorX: "contain" }}>
                {activeColumns.map((column, columnIndex) => {
                  const cards = board.cards.filter((card) => card.columnId === column.id).sort((a, b) => a.position - b.position);
                  return (
                    <section key={column.id} className="flex h-full w-[84vw] max-w-[320px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/60 shadow-sm" style={{ backgroundColor: columnBackground }}>
                      <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2.5">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-black text-[#102A43]">{column.name}</h3>
                        <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-black text-slate-500">{cards.length}</span>
                        <button type="button" className="rounded-xl p-1.5 text-slate-500 hover:bg-white/70" onClick={() => openEditColumn(column)} aria-label={`Edit ${column.name}`}><MoreHorizontal className="h-4 w-4" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-2.5 py-2.5">
                        <div className="space-y-2">
                          {cards.map((card) => {
                            const flipped = flippedIds.has(card.id);
                            const recent = [...card.activities].sort((a, b) => b.at - a.at).slice(0, 3);
                            return (
                              <div key={card.id} className={`relative [perspective:900px] ${flipped ? "min-h-[126px]" : "min-h-[64px]"}`}>
                                <div className={`relative w-full transition-all duration-300 [transform-style:preserve-3d] ${flipped ? "min-h-[126px] [transform:rotateY(180deg)]" : "min-h-[64px]"}`}>
                                  <button type="button" className="absolute inset-0 w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm [backface-visibility:hidden] active:scale-[0.99]" onPointerDown={() => startPress(card.id)} onPointerUp={() => shortTap(card.id)} onPointerCancel={cancelPress} onPointerLeave={cancelPress} onContextMenu={(event) => { event.preventDefault(); setMoveCardId(card.id); }}>
                                    <div className="text-[13px] font-black leading-snug text-[#102A43]">{card.title}</div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      {card.category && <span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ color: accent, backgroundColor: mixHex(accent, "#ffffff", 0.88) }}>{card.category}</span>}
                                      {card.assignee && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600"><UserRound className="h-3 w-3" />{card.assignee}</span>}
                                      {card.dueDate && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${isOverdue(card.dueDate) ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}><CalendarDays className="h-3 w-3" />{dueText(card.dueDate)}</span>}
                                    </div>
                                  </button>
                                  <div className="absolute inset-0 flex w-full flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Activity</div>
                                      <button type="button" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600" onClick={(event) => { event.stopPropagation(); shortTap(card.id); }}><RotateCcw className="h-3 w-3" />Back</button>
                                    </div>
                                    <div className="mt-1.5 flex-1 space-y-1.5 overflow-hidden">
                                      {recent.length ? recent.map((activity) => <div key={activity.id} className="text-[10px] font-bold leading-snug text-slate-600"><span className="text-[#102A43]">{activityText(activity)}</span><span className="ml-1 text-slate-400">{formatTime(activity.at)}</span></div>) : <div className="text-[10px] font-bold text-slate-500">Created by {card.createdByName}</div>}
                                    </div>
                                    <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
                                      <button type="button" className="flex-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[9px] font-black text-slate-600" onClick={(event) => { event.stopPropagation(); setMoveCardId(card.id); }}>Move</button>
                                      <button type="button" className="flex-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[9px] font-black text-slate-600" onClick={(event) => { event.stopPropagation(); openEditCard(card); }}>Edit</button>
                                    </div>
                                  </div>
                                </div>
                                <button type="button" className="absolute right-1.5 top-1.5 z-10 rounded-full bg-white/90 p-1 text-slate-400 shadow-sm" onClick={(event) => { event.stopPropagation(); openEditCard(card); }} aria-label={`Edit ${card.title}`}><Pencil className="h-3 w-3" /></button>
                              </div>
                            );
                          })}
                          {!cards.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 px-3 py-5 text-center text-[11px] font-bold text-slate-400">No cards here</div>}
                        </div>
                        <button type="button" className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-black text-slate-500 hover:bg-white/60" onClick={() => openNewCard(column.id)}><Plus className="h-4 w-4" />Add card</button>
                      </div>
                      <div className="flex items-center justify-between border-t border-black/5 px-2 py-1.5 text-slate-400">
                        <button type="button" className="rounded-lg p-1.5 disabled:opacity-25" disabled={columnIndex === 0} onClick={() => shiftColumn(column.id, -1)} aria-label="Move column left"><ChevronLeft className="h-4 w-4" /></button>
                        <span className="text-[9px] font-black uppercase tracking-wide">Column {columnIndex + 1}</span>
                        <button type="button" className="rounded-lg p-1.5 disabled:opacity-25" disabled={columnIndex === activeColumns.length - 1} onClick={() => shiftColumn(column.id, 1)} aria-label="Move column right"><ChevronRight className="h-4 w-4" /></button>
                      </div>
                    </section>
                  );
                })}
                <button type="button" className="flex h-12 w-[76vw] max-w-[280px] shrink-0 snap-start items-center justify-center gap-2 rounded-2xl border border-dashed border-white/80 bg-white/40 text-xs font-black text-slate-600" onClick={openNewColumn}><Plus className="h-4 w-4" />Add another column</button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardEditorOpen} onOpenChange={setCardEditorOpen}>
        <DialogContent className="max-w-md rounded-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">{editingCardId ? "Edit card" : "New card"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="task-title">Title</Label><Input id="task-title" value={cardTitle} onChange={(event) => setCardTitle(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={120} /></div>
            <div><Label htmlFor="task-note">Notes</Label><Textarea id="task-note" value={cardNote} onChange={(event) => setCardNote(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={1200} rows={4} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="task-assignee">Assignee</Label><Input id="task-assignee" value={cardAssignee} onChange={(event) => setCardAssignee(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={80} placeholder="Optional" /></div>
              <div><Label htmlFor="task-due">Due date</Label><div className="mt-1 flex w-full min-w-0 rounded-md border border-input bg-background px-3 py-2"><input id="task-due" type="date" className="block w-full min-w-0 border-0 bg-transparent p-0 text-sm" value={cardDueDate} onChange={(event) => setCardDueDate(event.target.value)} /></div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="task-category">Category</Label><select id="task-category" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cardCategory} onChange={(event) => setCardCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><Label htmlFor="task-column">Column</Label><select id="task-column" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cardColumnId} onChange={(event) => setCardColumnId(event.target.value)}>{activeColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></div>
            </div>
            <div className="flex gap-2 pt-1">{editingCardId && <Button type="button" variant="outline" className="h-11 rounded-2xl text-red-700" onClick={removeCard}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}<Button type="button" className="h-11 flex-1 rounded-2xl text-white" style={{ backgroundColor: accent }} disabled={!cardTitle.trim() || saving} onClick={saveCard}>{saving ? "Saving…" : "Save card"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(currentMoveCard)} onOpenChange={(open) => { if (!open) setMoveCardId(null); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Move “{currentMoveCard?.title}”</DialogTitle></DialogHeader>
          <div className="grid gap-2">{activeColumns.map((column) => <button key={column.id} type="button" className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm font-black ${currentMoveCard?.columnId === column.id ? "border-slate-300 bg-slate-100 text-slate-400" : "border-slate-200 bg-white text-[#102A43]"}`} disabled={currentMoveCard?.columnId === column.id || saving} onClick={() => currentMoveCard && moveCard(currentMoveCard, column.id)}><span>{column.name}</span>{currentMoveCard?.columnId === column.id ? <span className="text-[10px]">Current</span> : <ArrowRight className="h-4 w-4" />}</button>)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={boardSettingsOpen} onOpenChange={setBoardSettingsOpen}>
        <DialogContent className="max-w-sm rounded-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Board settings</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="board-name">Board name</Label><Input id="board-name" value={boardNameDraft} onChange={(event) => setBoardNameDraft(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={80} /></div>
            <Button type="button" className="h-11 rounded-2xl text-white" style={{ backgroundColor: accent }} disabled={!boardNameDraft.trim() || saving} onClick={saveBoardName}>Save name</Button>
            {board.columns.some((column) => column.archived) && <div className="border-t border-slate-100 pt-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Archived columns</div>
              <div className="mt-2 grid gap-2">{board.columns.filter((column) => column.archived).map((column) => <div key={column.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2"><span className="min-w-0 flex-1 truncate text-xs font-black text-[#102A43]">{column.name}</span><button type="button" className="rounded-xl p-2 text-emerald-700" onClick={() => restoreColumn(column)} aria-label={`Restore ${column.name}`}><RotateCcw className="h-4 w-4" /></button><button type="button" className="rounded-xl p-2 text-red-600" onClick={() => deleteArchivedColumn(column)} aria-label={`Delete ${column.name}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>
            </div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={columnEditorOpen} onOpenChange={setColumnEditorOpen}>
        <DialogContent className="max-w-sm rounded-3xl" onOpenAutoFocus={(event) => event.preventDefault()}><DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">{editingColumn ? "Column settings" : "Add column"}</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label htmlFor="column-name">Column name</Label><Input id="column-name" value={columnNameDraft} onChange={(event) => setColumnNameDraft(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={50} /></div><div className="flex gap-2">{editingColumn && <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={archiveColumn}><Archive className="mr-1 h-4 w-4" />Archive</Button>}<Button type="button" className="h-11 flex-1 rounded-2xl text-white" style={{ backgroundColor: accent }} disabled={!columnNameDraft.trim() || saving} onClick={saveColumn}>Save column</Button></div>{editingColumn?.archived && <Button type="button" variant="outline" className="h-10 rounded-2xl text-red-700" onClick={permanentDeleteColumn}><Trash2 className="mr-1 h-4 w-4" />Delete empty column</Button>}</div></DialogContent>
      </Dialog>
    </>
  );
}
