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
  Vote,
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
  castTaskBoardVote,
  saveTaskBoardColumn,
  saveTaskBoardColumns,
  saveTaskBoardMeta,
  type TaskBoardActivity,
  type TaskBoardCard,
  type TaskBoardColumn,
  type TaskBoardMeta,
  type TaskBoardSnapshot,
  type TaskBoardVote,
} from "@/lib/taskBoardService";

type Props = {
  rosterName: string;
  workspaceKey: string;
  themeColor?: string;
  scopeId?: string;
  isSharedRoster: boolean;
  user: SharedRosterUser | null;
  eligibleVoterCount?: number;
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

async function voterHashFor(user: SharedRosterUser | null, workspaceKey: string) {
  const source = user?.uid || user?.email || `local:${workspaceKey}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(`fairteams-vote:${source}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const char of source) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `fallback-${(hash >>> 0).toString(16)}`;
}

export function TaskBoard({ rosterName, workspaceKey, themeColor, scopeId, isSharedRoster, user, eligibleVoterCount = 1 }: Props) {
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
  const [voteEnabled, setVoteEnabled] = useState(false);
  const [voteQuestion, setVoteQuestion] = useState("");
  const [voteOptionsText, setVoteOptionsText] = useState("Yes\nNo\nAbstain");
  const [voteAnonymous, setVoteAnonymous] = useState(true);
  const [voteHideParticipation, setVoteHideParticipation] = useState(false);
  const [voteShowResultsOpen, setVoteShowResultsOpen] = useState(false);
  const [votingCardId, setVotingCardId] = useState<string | null>(null);
  const [selectedVoteOptionId, setSelectedVoteOptionId] = useState("");
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [closeVoteConfirmOpen, setCloseVoteConfirmOpen] = useState(false);
  const [currentVoterHash, setCurrentVoterHash] = useState("");
  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [desktopDragCardId, setDesktopDragCardId] = useState<string | null>(null);
  const [desktopDropColumnId, setDesktopDropColumnId] = useState<string | null>(null);
  const [desktopDragEnabled, setDesktopDragEnabled] = useState(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnNameDraft, setColumnNameDraft] = useState("");
  const pressTimerRef = useRef<number | null>(null);
  const onlineInitializationRef = useRef<string | null>(null);
  const longPressTriggeredRef = useRef(false);
  const desktopDragCompletedRef = useRef(false);
  const background = mixHex(safeColor(themeColor), "#ffffff", 0.84);
  const columnBackground = mixHex(safeColor(themeColor), "#ffffff", 0.94);
  const accent = safeColor(themeColor);


  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const sync = () => setDesktopDragEnabled(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    voterHashFor(user, workspaceKey).then((value) => { if (!cancelled) setCurrentVoterHash(value); });
    return () => { cancelled = true; };
  }, [user, workspaceKey]);

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
    setVoteEnabled(false); setVoteQuestion(""); setVoteOptionsText("Yes\nNo\nAbstain"); setVoteAnonymous(true); setVoteHideParticipation(false); setVoteShowResultsOpen(false);
    setCardColumnId(columnId || activeColumns[0]?.id || "");
    setCardEditorOpen(true);
  };

  const openEditCard = (card: TaskBoardCard) => {
    setEditingCardId(card.id); setCardTitle(card.title); setCardNote(card.note || ""); setCardAssignee(card.assignee || "");
    setCardDueDate(card.dueDate || ""); setCardCategory(card.category || "Administration"); setCardColumnId(card.columnId);
    setVoteEnabled(Boolean(card.vote)); setVoteQuestion(card.vote?.question || ""); setVoteOptionsText(card.vote?.options.map((option) => option.label).join("\n") || "Yes\nNo\nAbstain"); setVoteAnonymous(card.vote?.anonymous !== false); setVoteHideParticipation(Boolean(card.vote?.hideParticipationUntilClosed)); setVoteShowResultsOpen(Boolean(card.vote?.showResultsWhileOpen));
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
    const optionLabels = voteOptionsText.split(/\n/).map((value) => value.trim()).filter(Boolean).slice(0, 8);
    const previousVote = existing?.vote;
    const vote: TaskBoardVote | undefined = voteEnabled && voteQuestion.trim() && optionLabels.length >= 2
      ? {
          question: voteQuestion.trim(), anonymous: true, hideParticipationUntilClosed: voteHideParticipation,
          showResultsWhileOpen: voteShowResultsOpen, status: previousVote?.status || "open",
          eligibleCount: previousVote?.eligibleCount || Math.max(1, eligibleVoterCount), voterHashes: previousVote?.voterHashes || [],
          namedVotes: previousVote?.namedVotes || [], createdAt: previousVote?.createdAt || now, closedAt: previousVote?.closedAt,
          options: optionLabels.map((label, index) => {
            const prior = previousVote?.options[index];
            return { id: prior?.id || id("vote-option"), label, count: prior?.count || 0 };
          }),
        }
      : undefined;
    const card: TaskBoardCard = {
      id: existing?.id || id("card"), title: cardTitle.trim(), note: cardNote.trim() || undefined,
      columnId: cardColumnId, position: existing?.position || (columnCards.length + 1) * 1000,
      assignee: cardAssignee.trim() || undefined, dueDate: cardDueDate || undefined, category: cardCategory,
      createdAt: existing?.createdAt || now, createdByName: existing?.createdByName || currentActor.name,
      createdByEmail: existing?.createdByEmail || currentActor.email, updatedAt: now, updatedByName: currentActor.name,
      lastMovedAt: existing?.lastMovedAt, lastMovedByName: existing?.lastMovedByName,
      activities: [...(existing?.activities || []), activity].slice(-20),
      vote,
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
    if (desktopDragCompletedRef.current) { desktopDragCompletedRef.current = false; return; }
    if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return; }
    setFlippedIds((current) => { const next = new Set(current); next.has(cardId) ? next.delete(cardId) : next.add(cardId); return next; });
  };

  const startDesktopCardDrag = (event: React.DragEvent<HTMLElement>, cardId: string) => {
    if (!desktopDragEnabled || saving) { event.preventDefault(); return; }
    cancelPress();
    desktopDragCompletedRef.current = false;
    setDesktopDragCardId(cardId);
    setDesktopDropColumnId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  };

  const finishDesktopCardDrag = () => {
    setDesktopDragCardId(null);
    setDesktopDropColumnId(null);
    window.setTimeout(() => { desktopDragCompletedRef.current = false; }, 0);
  };

  const dropDesktopCard = async (event: React.DragEvent<HTMLElement>, destinationId: string) => {
    if (!desktopDragEnabled) return;
    event.preventDefault();
    const cardId = desktopDragCardId || event.dataTransfer.getData("text/plain");
    const card = board.cards.find((item) => item.id === cardId);
    desktopDragCompletedRef.current = true;
    setDesktopDragCardId(null);
    setDesktopDropColumnId(null);
    if (card && card.columnId !== destinationId) await moveCard(card, destinationId);
  };

  const currentVotingCard = board.cards.find((card) => card.id === votingCardId) || null;

  const submitVote = async () => {
    const card = currentVotingCard;
    if (!card?.vote || !selectedVoteOptionId) return;
    setVoteSubmitting(true); setError("");
    try {
      const hash = await voterHashFor(user, workspaceKey);
      if (online) {
        await castTaskBoardVote(scopeId!, card.id, hash, actor(user).name, selectedVoteOptionId);
      } else {
        if (card.vote.voterHashes.includes(hash)) throw new Error("Your vote is already recorded.");
        const nextCard = { ...card, updatedAt: Date.now(), vote: { ...card.vote, voterHashes: [...card.vote.voterHashes, hash], options: card.vote.options.map((option) => option.id === selectedVoteOptionId ? { ...option, count: option.count + 1 } : option), namedVotes: card.vote.anonymous ? card.vote.namedVotes : [...(card.vote.namedVotes || []), { voterHash: hash, voterName: actor(user).name, optionId: selectedVoteOptionId }] } };
        await persistCard(nextCard);
      }
      setVotingCardId(null); setSelectedVoteOptionId("");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not record vote."); }
    finally { setVoteSubmitting(false); }
  };

  const closeVote = async () => {
    const existing = board.cards.find((card) => card.id === editingCardId);
    if (!existing?.vote) return;
    setSaving(true);
    try {
      await persistCard({ ...existing, updatedAt: Date.now(), vote: { ...existing.vote, status: "closed", closedAt: Date.now() } });
      setCloseVoteConfirmOpen(false);
      setCardEditorOpen(false);
    }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not close vote."); }
    finally { setSaving(false); }
  };

  const editingVoteLocked = Boolean(editingCardId && board.cards.find((card) => card.id === editingCardId)?.vote?.voterHashes.length);
  const currentMoveCard = board.cards.find((card) => card.id === moveCardId) || null;
  const editingColumn = board.columns.find((column) => column.id === editingColumnId) || null;

  return (
    <>
      <section className="rounded-[1.7rem] border p-3 shadow-sm lg:p-4" style={{ borderColor: mixHex(accent, "#ffffff", 0.72), background }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide lg:text-[20px] lg:normal-case lg:tracking-normal" style={{ color: accent }}>
              <ClipboardList className="fairteams-desktop-balanced-icon h-[18px] w-[18px] lg:h-6 lg:w-6" /> Tasks &amp; Votes
            </div>
            <h2 className="mt-1 truncate text-[17px] font-black leading-tight text-[#102A43] lg:text-[19px]">{board.meta?.name || rosterName}</h2>
          </div>
          <Button type="button" className="h-9 shrink-0 rounded-2xl px-3 text-xs font-black text-white lg:text-sm" style={{ backgroundColor: accent }} onClick={() => setBoardOpen(true)}>
            Open board
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black text-slate-600 lg:text-xs">
          <span className="rounded-full bg-white/75 px-2.5 py-1">{openCards.length} open</span>
          {mineCount > 0 && <span className="rounded-full bg-white/75 px-2.5 py-1">{mineCount} yours</span>}
          {overdueCount > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{overdueCount} overdue</span>}
          <span className="rounded-full bg-white/75 px-2.5 py-1">{online ? "Shared" : isSharedRoster ? "Sign in" : "Private"}</span>
        </div>
        {latestActivity && <div className="mt-2 truncate text-[10px] font-bold text-slate-500 lg:text-xs">Last: “{latestActivity.card.title}” · {activityText(latestActivity.activity)}</div>}
      </section>

      <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
        <DialogContent className="fixed inset-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:inset-2 sm:h-auto sm:w-auto sm:rounded-[2rem] sm:border lg:inset-6 lg:rounded-[2rem]">
          <DialogHeader className="border-b border-white/45 px-3 py-3 pr-12 text-left lg:px-5 lg:py-4 lg:pr-14" style={{ backgroundColor: mixHex(accent, "#ffffff", 0.7) }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-black text-[#102A43] lg:text-[22px] lg:leading-tight">{board.meta?.name || rosterName}</DialogTitle>
                <p className="mt-0.5 text-[10px] font-bold text-slate-600 lg:mt-1 lg:text-[13px]">{online ? "Live collaborator board" : "Organizer board"} · <span className="lg:hidden">long press to move · </span>tap to flip<span className="hidden lg:inline"> · drag to move · right-click for menu</span></p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button type="button" variant="outline" className="h-9 w-9 rounded-2xl bg-white/80 p-0 lg:h-11 lg:w-11" onClick={() => { setBoardNameDraft(board.meta?.name || rosterName); setBoardSettingsOpen(true); }} aria-label="Board settings"><Pencil className="h-4 w-4 lg:h-[18px] lg:w-[18px]" /></Button>
                <Button type="button" className="h-9 rounded-2xl px-3 text-xs font-black text-white lg:h-11 lg:px-4 lg:text-sm" style={{ backgroundColor: accent }} onClick={() => openNewCard()}><Plus className="mr-1 h-4 w-4 lg:h-[18px] lg:w-[18px]" />Card</Button>
              </div>
            </div>
          </DialogHeader>
          {error && <div className="mx-3 mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</div>}
          <div className="flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: background }}>
            {loading ? <div className="p-6 text-center text-sm font-black text-slate-500">Loading task board…</div> : (
              <div className="flex h-full snap-x snap-proximity gap-3 overflow-x-auto overflow-y-hidden px-3 pb-4 pt-3 lg:px-5 lg:pb-5 lg:pt-5" style={{ overscrollBehaviorX: "contain" }}>
                {activeColumns.map((column, columnIndex) => {
                  const cards = board.cards.filter((card) => card.columnId === column.id).sort((a, b) => a.position - b.position);
                  return (
                    <section
                      key={column.id}
                      className={`flex h-full w-[84vw] max-w-[320px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border shadow-sm transition lg:w-[330px] lg:max-w-none ${desktopDropColumnId === column.id ? "border-emerald-300 ring-2 ring-emerald-200" : "border-white/60"}`}
                      style={{ backgroundColor: columnBackground }}
                      onDragOver={(event) => { if (!desktopDragEnabled || !desktopDragCardId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDesktopDropColumnId(column.id); }}
                      onDragEnter={(event) => { if (!desktopDragEnabled || !desktopDragCardId) return; event.preventDefault(); setDesktopDropColumnId(column.id); }}
                      onDragLeave={(event) => { if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; setDesktopDropColumnId((current) => current === column.id ? null : current); }}
                      onDrop={(event) => void dropDesktopCard(event, column.id)}
                    >
                      <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2.5 lg:px-4 lg:py-3.5">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-black text-[#102A43] lg:text-[17px]">{column.name}</h3>
                        <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-black text-slate-500 lg:px-2.5 lg:py-1 lg:text-xs">{cards.length}</span>
                        <button type="button" className="rounded-xl p-1.5 text-slate-500 hover:bg-white/70 lg:p-2" onClick={() => openEditColumn(column)} aria-label={`Edit ${column.name}`}><MoreHorizontal className="h-4 w-4 lg:h-[18px] lg:w-[18px]" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 lg:px-3 lg:py-3">
                        <div className="space-y-2">
                          {cards.map((card) => {
                            const flipped = flippedIds.has(card.id);
                            const createdActivity = [...card.activities]
                              .filter((activity) => activity.action === "created")
                              .sort((a, b) => a.at - b.at)[0];
                            const latestMoveActivity = [...card.activities]
                              .filter((activity) => activity.action === "moved")
                              .sort((a, b) => b.at - a.at)[0];
                            const flippedHeightClass = card.vote ? "min-h-[300px]" : card.note?.trim() ? "min-h-[190px]" : "min-h-[126px]";
                            const titleLength = card.title.trim().length;
                            const hasFrontMetadata = Boolean(card.category || card.assignee || card.dueDate || card.vote);
                            const frontHeightClass = titleLength > 92
                              ? "min-h-[146px] lg:min-h-[174px]"
                              : titleLength > 62
                                ? "min-h-[124px] lg:min-h-[150px]"
                                : titleLength > 34
                                  ? "min-h-[104px] lg:min-h-[126px]"
                                  : hasFrontMetadata
                                    ? "min-h-[88px] lg:min-h-[106px]"
                                    : "min-h-[70px] lg:min-h-[88px]";
                            return (
                              <div key={card.id} className={`relative [perspective:900px] ${flipped ? flippedHeightClass : frontHeightClass}`}>
                                <div className={`relative w-full transition-all duration-300 [transform-style:preserve-3d] ${flipped ? `${flippedHeightClass} [transform:rotateY(180deg)]` : frontHeightClass}`}>
                                  <button type="button" draggable={desktopDragEnabled} className={`absolute inset-0 w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm lg:p-4 [backface-visibility:hidden] active:scale-[0.99] lg:cursor-grab lg:active:cursor-grabbing ${desktopDragCardId === card.id ? "opacity-45 ring-2 ring-emerald-200" : ""}`} onDragStart={(event) => startDesktopCardDrag(event, card.id)} onDragEnd={finishDesktopCardDrag} onPointerDown={() => { if (!desktopDragEnabled) startPress(card.id); }} onPointerUp={() => shortTap(card.id)} onPointerCancel={cancelPress} onPointerLeave={cancelPress} onContextMenu={(event) => { event.preventDefault(); setMoveCardId(card.id); }}>
                                    <div className="text-[13px] font-black leading-snug text-[#102A43] lg:text-[15px] lg:leading-[1.3]">{card.title}</div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      {card.category && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black lg:px-2.5 lg:py-1 lg:text-[11px] text-slate-700 ring-1 ring-slate-300/70">{card.category}</span>}
                                      {card.assignee && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black lg:gap-1.5 lg:px-2.5 lg:py-1 lg:text-[11px] text-slate-600"><UserRound className="h-3 w-3 lg:h-3.5 lg:w-3.5" />{card.assignee}</span>}
                                      {card.dueDate && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black lg:gap-1.5 lg:px-2.5 lg:py-1 lg:text-[11px] ${isOverdue(card.dueDate) ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}><CalendarDays className="h-3 w-3 lg:h-3.5 lg:w-3.5" />{dueText(card.dueDate)}</span>}
                                      {card.vote && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black lg:gap-1.5 lg:px-2.5 lg:py-1 lg:text-[11px] text-violet-700"><Vote className="h-3 w-3 lg:h-3.5 lg:w-3.5" />{card.vote.status === "closed" ? "Result" : "Vote"}</span>}
                                    </div>
                                  </button>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    draggable={desktopDragEnabled}
                                    className={`absolute inset-0 flex w-full flex-col rounded-xl border border-slate-200 bg-white p-0 text-left shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)] active:scale-[0.99] lg:cursor-grab lg:active:cursor-grabbing ${desktopDragCardId === card.id ? "opacity-45 ring-2 ring-emerald-200" : ""}`}
                                    onDragStart={(event) => startDesktopCardDrag(event, card.id)}
                                    onDragEnd={finishDesktopCardDrag}
                                    onPointerDown={() => { if (!desktopDragEnabled) startPress(card.id); }}
                                    onPointerUp={() => shortTap(card.id)}
                                    onPointerCancel={cancelPress}
                                    onPointerLeave={cancelPress}
                                    onContextMenu={(event) => { event.preventDefault(); setMoveCardId(card.id); }}
                                    aria-label={`Show ${card.title} card front`}
                                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") shortTap(card.id); }}
                                  >
                                    <div className="flex min-h-full w-full flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3 pt-3 lg:px-4 lg:pb-4 lg:pt-4">
                                      {card.vote && (() => {
                                        const total = card.vote.options.reduce((sum, option) => sum + option.count, 0);
                                        const canShowResults = card.vote.status === "closed" || card.vote.showResultsWhileOpen;
                                        return (
                                          <div>
                                            <div className="text-[10px] font-black uppercase tracking-wide text-violet-500 lg:text-xs">{card.vote.status === "closed" ? "Result" : "Vote"}</div>
                                            <div className="mt-1 break-words text-[13px] font-black leading-snug text-[#102A43] lg:mt-1.5 lg:text-[16px] lg:leading-[1.35]">{card.vote.question}</div>
                                            {canShowResults ? (
                                              <div className="mt-2 space-y-1.5">{card.vote.options.map((option) => <div key={option.id} className="flex items-start gap-2 text-[10px] font-bold text-slate-600 lg:text-[12px]"><span className="min-w-0 flex-1 break-words">{option.label}</span><span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[#102A43]">{option.count}</span></div>)}</div>
                                            ) : <div className="mt-1.5 text-[10px] font-bold text-slate-500 lg:text-[12px]">{card.vote.hideParticipationUntilClosed ? "Voting in progress" : `${total}${card.vote.eligibleCount ? ` of ${card.vote.eligibleCount}` : ""} voted`}</div>}
                                            {card.vote.status === "open" && (currentVoterHash && card.vote.voterHashes.includes(currentVoterHash) ? (
                                              <div className="mt-2 rounded-xl bg-emerald-50 px-2.5 py-2 text-center text-[10px] font-black text-emerald-700 lg:mt-3 lg:py-2.5 lg:text-[12px]">Vote submitted</div>
                                            ) : (
                                              <button type="button" className="mt-2 w-full rounded-xl bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white lg:mt-3 lg:py-2.5 lg:text-[13px]" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => { event.stopPropagation(); setSelectedVoteOptionId(""); setVotingCardId(card.id); }}>Vote now</button>
                                            ))}
                                          </div>
                                        );
                                      })()}
                                      {card.note?.trim() && (
                                        <div className={card.vote ? "mt-3 border-t border-slate-100 pt-2" : ""}>
                                          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:text-[11px]">{card.vote ? "Context" : "Note"}</div>
                                          <div className="mt-1 max-h-[72px] overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[11px] font-semibold leading-relaxed text-[#102A43] lg:mt-1.5 lg:max-h-[96px] lg:text-[13px]">
                                            {card.note.trim()}
                                          </div>
                                        </div>
                                      )}
                                      <div className={(card.note?.trim() || card.vote) ? "mt-3 border-t border-slate-100 pt-2 lg:mt-auto lg:pt-5" : "lg:mt-auto lg:pt-5"}>
                                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:text-[10px]">Activity</div>
                                        <div className="mt-1.5 space-y-1.5 lg:mt-2 lg:space-y-1">
                                          <div className="text-[10px] font-bold leading-snug text-slate-600 lg:text-[10px] lg:text-slate-500">
                                            <span className="text-[#102A43] lg:text-slate-500">{createdActivity ? `${createdActivity.actorName} created this card` : `Created by ${card.createdByName}`}</span>
                                            <span className="ml-1 text-slate-400">{formatTime(createdActivity?.at || card.createdAt)}</span>
                                          </div>
                                          {latestMoveActivity && (
                                            <div className="text-[10px] font-bold leading-snug text-slate-600 lg:text-[10px] lg:text-slate-500">
                                              <span className="text-[#102A43] lg:text-slate-500">{activityText(latestMoveActivity)}</span>
                                              <span className="ml-1 text-slate-400">{formatTime(latestMoveActivity.at)}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="px-3 pb-2 text-[9px] font-bold text-slate-400 lg:px-4 lg:pb-3 lg:text-[10px]"><span className="lg:hidden">Tap to flip back · Hold to move</span><span className="hidden lg:inline">Click to flip back · Drag to move</span></div>
                                  </div>
                                </div>
                                <button type="button" className="absolute right-1.5 top-1.5 z-10 rounded-full bg-white/90 p-1 text-slate-400 shadow-sm lg:right-2 lg:top-2 lg:p-1.5" onClick={(event) => { event.stopPropagation(); openEditCard(card); }} aria-label={`Edit ${card.title}`}><Pencil className="h-3 w-3 lg:h-3.5 lg:w-3.5" /></button>
                              </div>
                            );
                          })}
                          {!cards.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 px-3 py-5 text-center text-[11px] font-bold text-slate-400 lg:py-4 lg:text-[13px]">No cards here</div>}
                        </div>
                        <button type="button" className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-black text-slate-500 hover:bg-white/60 lg:mt-3 lg:py-2.5 lg:text-[13px]" onClick={() => openNewCard(column.id)}><Plus className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />Add card</button>
                      </div>
                      <div className="flex items-center justify-between border-t border-black/5 px-2 py-1.5 text-slate-400">
                        <button type="button" className="rounded-lg p-1.5 disabled:opacity-25" disabled={columnIndex === 0} onClick={() => shiftColumn(column.id, -1)} aria-label="Move column left"><ChevronLeft className="h-4 w-4" /></button>
                        <span className="text-[9px] font-black uppercase tracking-wide lg:text-[10px]">Column {columnIndex + 1}</span>
                        <button type="button" className="rounded-lg p-1.5 disabled:opacity-25" disabled={columnIndex === activeColumns.length - 1} onClick={() => shiftColumn(column.id, 1)} aria-label="Move column right"><ChevronRight className="h-4 w-4" /></button>
                      </div>
                    </section>
                  );
                })}
                <button type="button" className="flex h-12 w-[76vw] max-w-[280px] shrink-0 snap-start items-center justify-center gap-2 rounded-2xl border border-dashed border-white/80 bg-white/40 text-xs font-black text-slate-600 lg:h-14 lg:w-[280px] lg:text-sm" onClick={openNewColumn}><Plus className="h-4 w-4" />Add another column</button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardEditorOpen} onOpenChange={setCardEditorOpen}>
        <DialogContent className="fixed inset-x-2 bottom-2 top-2 flex w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[2rem] p-0 sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12"><DialogTitle className="text-left text-base font-black text-[#102A43]">{editingCardId ? "Edit card" : "New card"}</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            <div className="grid gap-3">
            <div><Label htmlFor="task-title">Title</Label><Input id="task-title" value={cardTitle} onChange={(event) => setCardTitle(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={120} /></div>
            <div><Label htmlFor="task-note">{voteEnabled ? "Context" : "Notes"}</Label><Textarea id="task-note" value={cardNote} onChange={(event) => setCardNote(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={1200} rows={voteEnabled ? 2 : 3} placeholder={voteEnabled ? "Background, explanation or related information" : "Optional details"} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="task-assignee">Assignee</Label><Input id="task-assignee" value={cardAssignee} onChange={(event) => setCardAssignee(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" maxLength={80} placeholder="Optional" /></div>
              <div><Label htmlFor="task-due">Due date</Label><div className="mt-1 flex w-full min-w-0 rounded-md border border-input bg-background px-3 py-2"><input id="task-due" type="date" className="block w-full min-w-0 border-0 bg-transparent p-0 text-sm" value={cardDueDate} onChange={(event) => setCardDueDate(event.target.value)} /></div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="task-category">Category</Label><select id="task-category" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cardCategory} onChange={(event) => setCardCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><Label htmlFor="task-column">Column</Label><select id="task-column" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cardColumnId} onChange={(event) => setCardColumnId(event.target.value)}>{activeColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></div>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
              <label className="flex items-center gap-2 text-sm font-black text-[#102A43]"><input type="checkbox" checked={voteEnabled} onChange={(event) => setVoteEnabled(event.target.checked)} disabled={editingVoteLocked} /> Add an anonymous vote</label>
              {voteEnabled && <div className="mt-3 grid gap-3">
                <div><Label htmlFor="vote-question">Question</Label><Input id="vote-question" value={voteQuestion} onChange={(event) => setVoteQuestion(event.target.value)} maxLength={180} disabled={editingVoteLocked} placeholder="What should members decide?" /></div>
                <div><Label htmlFor="vote-options">Options — one per line</Label><Textarea id="vote-options" value={voteOptionsText} onChange={(event) => setVoteOptionsText(event.target.value)} rows={3} maxLength={400} disabled={editingVoteLocked} /></div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={voteHideParticipation} onChange={(event) => setVoteHideParticipation(event.target.checked)} disabled={editingVoteLocked} /> Hide participation until closed</label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={voteShowResultsOpen} onChange={(event) => setVoteShowResultsOpen(event.target.checked)} disabled={editingVoteLocked} /> Show results while open</label>
                <div className="text-[10px] font-semibold leading-snug text-slate-500">No per-person vote notifications or vote timestamps are shown.</div>{editingVoteLocked && <div className="text-[10px] font-black text-amber-700">Question, options and anonymity are locked because voting has started.</div>}
                {editingCardId && board.cards.find((card) => card.id === editingCardId)?.vote?.status === "open" && <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => setCloseVoteConfirmOpen(true)}>Close vote</Button>}
              </div>}
            </div>
            <div className="flex gap-2 pt-1">{editingCardId && <Button type="button" variant="outline" className="h-11 rounded-2xl text-red-700" onClick={removeCard}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}<Button type="button" className="h-11 flex-1 rounded-2xl text-white" style={{ backgroundColor: accent }} disabled={!cardTitle.trim() || saving || (voteEnabled && (!voteQuestion.trim() || voteOptionsText.split(/\n/).filter((value) => value.trim()).length < 2))} onClick={saveCard}>{saving ? "Saving…" : "Save card"}</Button></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeVoteConfirmOpen} onOpenChange={setCloseVoteConfirmOpen}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] border border-violet-100 bg-white p-4 shadow-xl sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-left text-base font-black text-[#102A43]">Close vote?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-2xl bg-violet-50 px-3 py-3 text-sm font-bold leading-snug text-violet-900">
              Results will become final and no more votes can be submitted.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setCloseVoteConfirmOpen(false)} disabled={saving}>Keep open</Button>
              <Button type="button" className="h-11 rounded-2xl bg-violet-600 text-white hover:bg-violet-700" onClick={closeVote} disabled={saving}>{saving ? "Closing…" : "Close vote"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(currentVotingCard)} onOpenChange={(open) => { if (!open) { setVotingCardId(null); setSelectedVoteOptionId(""); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Vote</DialogTitle></DialogHeader>
          {currentVotingCard?.vote && <div className="grid gap-3">
            <div className="text-sm font-black leading-snug text-[#102A43]">{currentVotingCard.vote.question}</div>
            <div className="grid gap-2">{currentVotingCard.vote.options.map((option) => <button key={option.id} type="button" className={`rounded-2xl border px-3 py-3 text-left text-sm font-black ${selectedVoteOptionId === option.id ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-[#102A43]"}`} onClick={() => setSelectedVoteOptionId(option.id)}>{option.label}</button>)}</div>
            <div className="text-[10px] font-semibold leading-snug text-slate-500">{currentVotingCard.vote.anonymous ? "Your choice is anonymous. Fair Teams records only a private account hash to prevent duplicate voting." : "This is a named vote."}</div>
            <Button type="button" className="h-11 rounded-2xl bg-violet-600 text-white" disabled={!selectedVoteOptionId || voteSubmitting} onClick={submitVote}>{voteSubmitting ? "Recording…" : "Submit vote"}</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(currentMoveCard)} onOpenChange={(open) => { if (!open) setMoveCardId(null); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Move card</DialogTitle></DialogHeader>
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
