import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  Gavel,
  Hand,
  Lightbulb,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Vote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SharedRosterUser } from "@/lib/sharedRosterService";
import {
  castTaskBoardVote,
  deleteTaskBoardCard,
  listenToTaskBoard,
  saveTaskBoardCard,
  saveTaskBoardColumn,
  saveTaskBoardMeta,
  type TaskBoardActionItem,
  type TaskBoardActivity,
  type TaskBoardCard,
  type TaskBoardColumn,
  type TaskBoardColumnKind,
  type TaskBoardLink,
  type TaskBoardMeta,
  type TaskBoardSnapshot,
  type TaskBoardVote,
  type TaskBoardVoteKind,
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
type FeedFilter = "active" | "deciding" | "action" | "done";
type DecisionMode = "vote" | "recorded";
type TopicStage = "idea" | "deciding" | "action" | "ready" | "done";

const WORKFLOW: Array<{ kind: TaskBoardColumnKind; name: string }> = [
  { kind: "ideas", name: "Ideas" },
  { kind: "vote", name: "Decide" },
  { kind: "action", name: "Action" },
  { kind: "done", name: "Done" },
];

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

function nowActivity(action: TaskBoardActivity["action"], actorName: string, actorEmail?: string): TaskBoardActivity {
  return { id: id("activity"), action, actorName, actorEmail, at: Date.now() };
}

function actor(user: SharedRosterUser | null) {
  return { name: user?.displayName?.trim() || user?.email || "Organizer", email: user?.email || undefined };
}

function localKey(workspaceKey: string) {
  return `fairteams.taskBoard.v2.${workspaceKey.trim().replace(/[^a-z0-9_-]+/gi, "-") || "roster"}`;
}

function activitySeenKey(workspaceKey: string) {
  return `fairteams.taskBoard.seen.${workspaceKey.trim().replace(/[^a-z0-9_-]+/gi, "-") || "roster"}`;
}

function readActivitySeen(workspaceKey: string) {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(activitySeenKey(workspaceKey)) || 0);
  return Number.isFinite(value) ? value : 0;
}

function createWorkflowColumns(now = Date.now()): TaskBoardColumn[] {
  return WORKFLOW.map((item, index) => ({
    id: id("column"),
    name: item.name,
    kind: item.kind,
    position: (index + 1) * 1000,
    createdAt: now,
    updatedAt: now,
  }));
}

function createDefaultBoard(rosterName: string): LocalBoard {
  const now = Date.now();
  return {
    meta: { name: rosterName.trim() || "Action Board", createdAt: now, updatedAt: now },
    columns: createWorkflowColumns(now),
    cards: [],
  };
}

function normalizeLocalCard(card: TaskBoardCard): TaskBoardCard {
  const decisions = Array.isArray(card.decisions) && card.decisions.length ? card.decisions : card.vote ? [{ ...card.vote, id: card.vote.id || "legacy-vote" }] : [];
  let actions = Array.isArray(card.actions) ? card.actions : [];
  if (!actions.length && card.actionText) {
    actions = [{
      id: "legacy-action",
      text: card.actionText,
      status: card.completedAt ? "done" : "open",
      assignee: card.assignee,
      assigneeEmail: card.assigneeEmail,
      createdAt: card.lastMovedAt || card.createdAt,
      completedAt: card.completedAt,
      completedByName: card.completedByName,
      completedByEmail: card.completedByEmail,
    }];
  }
  return { ...card, decisions, actions, links: Array.isArray(card.links) ? card.links : [] };
}

function readLocalBoard(workspaceKey: string, rosterName: string): LocalBoard {
  if (typeof window === "undefined") return createDefaultBoard(rosterName);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localKey(workspaceKey)) || "null") as LocalBoard | null;
    if (parsed?.meta && Array.isArray(parsed.columns) && Array.isArray(parsed.cards)) {
      return { ...parsed, cards: parsed.cards.map(normalizeLocalCard) };
    }
  } catch {
    // Fall through to a clean board.
  }
  return createDefaultBoard(rosterName);
}

function writeLocalBoard(workspaceKey: string, board: LocalBoard) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(workspaceKey), JSON.stringify(board));
}

function orderedActiveColumns(board: LocalBoard) {
  return board.columns.filter((column) => !column.archived).sort((a, b) => a.position - b.position);
}

function latestOpenDecision(card: TaskBoardCard) {
  return [...(card.decisions || [])].reverse().find((decision) => decision.mode !== "recorded" && decision.status === "open");
}

function latestOpenAction(card: TaskBoardCard) {
  return [...(card.actions || [])].reverse().find((action) => action.status === "open");
}

function topicStage(card: TaskBoardCard): TopicStage {
  if (card.completedAt) return "done";
  if (latestOpenAction(card)) return "action";
  if (latestOpenDecision(card)) return "deciding";
  if ((card.decisions?.length || 0) > 0 || (card.actions?.length || 0) > 0) return "ready";
  return "idea";
}

function stageColumnKind(card: TaskBoardCard): TaskBoardColumnKind {
  const stage = topicStage(card);
  if (stage === "done") return "done";
  if (stage === "action") return "action";
  if (stage === "deciding") return "vote";
  return "ideas";
}

function formatTime(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(date);
}

function activityText(activity: TaskBoardActivity) {
  if (activity.action === "created") return `${activity.actorName} added a topic`;
  if (activity.action === "vote_started") return `${activity.actorName} opened a decision`;
  if (activity.action === "vote_closed") return `${activity.actorName} closed a vote`;
  if (activity.action === "decision_recorded") return `${activity.actorName} recorded a decision`;
  if (activity.action === "action_defined") return `${activity.actorName} added an action`;
  if (activity.action === "claimed") return `${activity.actorName} is handling an action`;
  if (activity.action === "released") return `${activity.actorName} released an action`;
  if (activity.action === "completed") return `${activity.actorName} completed something`;
  if (activity.action === "link_added") return `${activity.actorName} added a link`;
  if (activity.action === "reopened") return `${activity.actorName} reopened the topic`;
  return `${activity.actorName} updated it`;
}

async function voterHashFor(user: SharedRosterUser | null, workspaceKey: string) {
  const source = user?.email?.trim().toLowerCase() || `local:${workspaceKey}`;
  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(`fairteams-vote:${source}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const char of source) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `fallback-${(hash >>> 0).toString(16)}`;
}

function voteTotal(vote?: TaskBoardVote) {
  if (!vote) return 0;
  if (vote.ballots?.length) return vote.ballots.length;
  return vote.voterHashes?.length || 0;
}

function totalSelections(vote?: TaskBoardVote) {
  return vote?.options.reduce((sum, option) => sum + option.count, 0) || 0;
}

function stageMeta(stage: TopicStage) {
  if (stage === "deciding") return { label: "Deciding", icon: Gavel, className: "bg-violet-50 text-violet-700 ring-violet-100" };
  if (stage === "action") return { label: "Action", icon: Hand, className: "bg-sky-50 text-sky-800 ring-sky-100" };
  if (stage === "ready") return { label: "Ready", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 ring-emerald-100" };
  if (stage === "done") return { label: "Done", icon: Check, className: "bg-slate-100 text-slate-600 ring-slate-200" };
  return { label: "Idea", icon: Lightbulb, className: "bg-amber-50 text-amber-700 ring-amber-100" };
}

function providerLabel(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "docs.google.com") {
      if (parsed.pathname.startsWith("/document")) return "Google Doc";
      if (parsed.pathname.startsWith("/spreadsheets")) return "Google Sheet";
      if (parsed.pathname.startsWith("/presentation")) return "Google Slides";
      if (parsed.pathname.startsWith("/forms")) return "Google Form";
      return "Google Docs";
    }
    if (host === "drive.google.com") return "Google Drive";
    if (host.endsWith("trello.com")) return "Trello";
    if (host.endsWith("notion.so") || host.endsWith("notion.site")) return "Notion";
    return host;
  } catch {
    return "Link";
  }
}

function validHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function voteOptionLabels(kind: TaskBoardVoteKind, raw: string) {
  if (kind === "yes-no-abstain") return ["Yes", "No", "Abstain"];
  return raw.split(/\n/).map((value) => value.trim()).filter(Boolean).slice(0, 12);
}

function EmptyActionBoard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-8 text-center lg:py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm ring-1 ring-slate-200"><Gavel className="h-6 w-6" /></div>
      <h3 className="mt-4 text-lg font-black text-[#102A43]">Turn a club topic into a decision</h3>
      <p className="mt-1 max-w-md text-sm font-semibold leading-relaxed text-slate-500">Keep the topic, links, votes, outcome and follow-through together instead of losing them across chat messages.</p>
      <Button type="button" className="mt-5 h-11 rounded-2xl px-5 font-black text-white" onClick={onCreate}><Plus className="mr-1 h-4 w-4" />New topic</Button>
      <div className="mt-7 grid w-full gap-2 text-left sm:grid-cols-3">
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-3"><div className="text-xs font-black text-[#102A43]">Replace dead ball</div><div className="mt-1 text-[11px] font-semibold text-slate-500">Compare links → vote → order</div></div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-3"><div className="text-xs font-black text-[#102A43]">New club members</div><div className="mt-1 text-[11px] font-semibold text-slate-500">Choose several → record outcome</div></div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-3"><div className="text-xs font-black text-[#102A43]">Summer BBQ</div><div className="mt-1 text-[11px] font-semibold text-slate-500">Vote → date → place → action</div></div>
      </div>
    </div>
  );
}

export function TaskBoard({ rosterName, workspaceKey, themeColor, scopeId, isSharedRoster, user, eligibleVoterCount = 1 }: Props) {
  const online = Boolean(scopeId && user?.email);
  const accent = safeColor(themeColor);
  const background = mixHex(accent, "#ffffff", 0.91);
  const currentActor = actor(user);

  const [board, setBoard] = useState<LocalBoard>(() => readLocalBoard(workspaceKey, rosterName));
  const [boardOpen, setBoardOpen] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("active");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lastSeenActivityAt, setLastSeenActivityAt] = useState(() => readActivitySeen(workspaceKey));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentVoterHash, setCurrentVoterHash] = useState("");

  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  const [decisionCardId, setDecisionCardId] = useState<string | null>(null);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("vote");
  const [decisionQuestion, setDecisionQuestion] = useState("");
  const [decisionOutcome, setDecisionOutcome] = useState("");
  const [decisionKind, setDecisionKind] = useState<TaskBoardVoteKind>("yes-no-abstain");
  const [decisionOptions, setDecisionOptions] = useState("");
  const [decisionMaxSelections, setDecisionMaxSelections] = useState("3");

  const [linkCardId, setLinkCardId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [actionText, setActionText] = useState("");

  const [votingCardId, setVotingCardId] = useState<string | null>(null);
  const [votingDecisionId, setVotingDecisionId] = useState<string | null>(null);
  const [selectedVoteOptionIds, setSelectedVoteOptionIds] = useState<string[]>([]);
  const [voteSubmitting, setVoteSubmitting] = useState(false);

  const [outcomeCardId, setOutcomeCardId] = useState<string | null>(null);
  const [outcomeDecisionId, setOutcomeDecisionId] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");

  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");

  const activeColumns = useMemo(() => orderedActiveColumns(board), [board.columns]);
  const columnByKind = useMemo(() => {
    const map = new Map<TaskBoardColumnKind, TaskBoardColumn>();
    activeColumns.forEach((column, index) => {
      const kind = column.kind || WORKFLOW[index]?.kind;
      if (kind && !map.has(kind)) map.set(kind, column);
    });
    return map;
  }, [activeColumns]);

  useEffect(() => {
    if (!online) {
      setBoard(readLocalBoard(workspaceKey, rosterName));
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    let initialized = false;
    return listenToTaskBoard(scopeId!, (snapshot) => {
      if (!snapshot.meta && snapshot.columns.length === 0 && !initialized) {
        initialized = true;
        const fresh = createDefaultBoard(rosterName);
        setBoard(fresh);
        Promise.all([
          saveTaskBoardMeta(scopeId!, fresh.meta!),
          ...fresh.columns.map((column) => saveTaskBoardColumn(scopeId!, column)),
        ]).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Could not create Action Board."));
      } else {
        const received: LocalBoard = {
          meta: snapshot.meta || { name: rosterName },
          columns: snapshot.columns,
          cards: snapshot.cards.map(normalizeLocalCard),
        };
        setBoard(received);
        const ordered = orderedActiveColumns(received);
        const columnFixes = ordered.map((column, index) => {
          const target = WORKFLOW[index];
          if (!target) return null;
          if (column.name === target.name && column.kind === target.kind) return null;
          return { ...column, name: target.name, kind: target.kind, position: (index + 1) * 1000, updatedAt: Date.now() };
        }).filter(Boolean) as TaskBoardColumn[];
        if (columnFixes.length) Promise.all(columnFixes.map((column) => saveTaskBoardColumn(scopeId!, column))).catch(() => undefined);
      }
      setLoading(false);
    }, (nextError) => {
      setLoading(false);
      setError(nextError.message || "Could not load Action Board.");
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

  useEffect(() => {
    setLastSeenActivityAt(readActivitySeen(workspaceKey));
  }, [workspaceKey]);

  const withDerivedColumn = (card: TaskBoardCard) => {
    const kind = stageColumnKind(card);
    const column = columnByKind.get(kind);
    return column && card.columnId !== column.id ? { ...card, columnId: column.id, lastMovedAt: Date.now(), lastMovedByName: currentActor.name } : card;
  };

  const updateBoardCard = (card: TaskBoardCard) => {
    setBoard((current) => ({ ...current, cards: [...current.cards.filter((item) => item.id !== card.id), card] }));
  };

  const persistCard = async (rawCard: TaskBoardCard) => {
    const card = withDerivedColumn(rawCard);
    updateBoardCard(card);
    if (online) await saveTaskBoardCard(scopeId!, card);
    return card;
  };

  const persistMeta = async (meta: TaskBoardMeta) => {
    setBoard((current) => ({ ...current, meta }));
    if (online) await saveTaskBoardMeta(scopeId!, meta);
  };

  const latestActivity = useMemo(() => board.cards.flatMap((card) => card.activities.map((activity) => ({ card, activity }))).sort((a, b) => b.activity.at - a.activity.at)[0], [board.cards]);
  const meaningfulActivityActions = new Set<TaskBoardActivity["action"]>(["vote_started", "vote_closed", "decision_recorded", "claimed", "completed"]);
  const hasNewActivity = Boolean(
    latestActivity
    && meaningfulActivityActions.has(latestActivity.activity.action)
    && latestActivity.activity.at > lastSeenActivityAt
    && (!currentActor.email || !latestActivity.activity.actorEmail || latestActivity.activity.actorEmail.toLowerCase() !== currentActor.email.toLowerCase())
  );

  const openBoard = () => {
    const seenAt = Date.now();
    setLastSeenActivityAt(seenAt);
    if (typeof window !== "undefined") window.localStorage.setItem(activitySeenKey(workspaceKey), String(seenAt));
    setBoardOpen(true);
  };

  useEffect(() => {
    if (!boardOpen || !latestActivity?.activity.at) return;
    const seenAt = latestActivity.activity.at;
    setLastSeenActivityAt(seenAt);
    if (typeof window !== "undefined") window.localStorage.setItem(activitySeenKey(workspaceKey), String(seenAt));
  }, [boardOpen, latestActivity?.activity.at, workspaceKey]);

  const openDecisionCount = board.cards.filter((card) => Boolean(latestOpenDecision(card))).length;
  const openActionCount = board.cards.filter((card) => Boolean(latestOpenAction(card))).length;
  const mineCount = board.cards.filter((card) => {
    const action = latestOpenAction(card);
    if (!action) return false;
    return (action.assigneeEmail && currentActor.email && action.assigneeEmail.toLowerCase() === currentActor.email.toLowerCase())
      || (!action.assigneeEmail && action.assignee?.trim().toLowerCase() === currentActor.name.toLowerCase());
  }).length;

  const visibleCards = useMemo(() => {
    const filtered = board.cards.filter((card) => {
      const stage = topicStage(card);
      if (filter === "done") return stage === "done";
      if (filter === "deciding") return stage === "deciding";
      if (filter === "action") return stage === "action";
      return stage !== "done";
    });
    const rank = (card: TaskBoardCard) => {
      const stage = topicStage(card);
      if (stage === "action" && !latestOpenAction(card)?.assignee) return 0;
      if (stage === "deciding") return 1;
      if (stage === "action") return 2;
      if (stage === "ready") return 3;
      if (stage === "idea") return 4;
      return 5;
    };
    return filtered.sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt);
  }, [board.cards, filter]);

  const toggleExpanded = (cardId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  const createTopic = async () => {
    if (!newTitle.trim()) return;
    const ideasColumn = columnByKind.get("ideas") || activeColumns[0];
    if (!ideasColumn) return;
    const now = Date.now();
    const card: TaskBoardCard = {
      id: id("topic"),
      title: newTitle.trim(),
      note: newNote.trim() || undefined,
      columnId: ideasColumn.id,
      position: now,
      links: [],
      decisions: [],
      actions: [],
      createdAt: now,
      createdByName: currentActor.name,
      createdByEmail: currentActor.email,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [nowActivity("created", currentActor.name, currentActor.email)],
    };
    setSaving(true); setError("");
    try {
      await persistCard(card);
      setNewTopicOpen(false);
      setNewTitle(""); setNewNote("");
      setExpandedIds((current) => new Set(current).add(card.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not add topic.");
    } finally { setSaving(false); }
  };

  const openEditCard = (card: TaskBoardCard) => {
    setEditingCardId(card.id);
    setEditTitle(card.title);
    setEditNote(card.note || "");
    setEditOpen(true);
  };

  const saveEditedCard = async () => {
    const existing = board.cards.find((card) => card.id === editingCardId);
    if (!existing || !editTitle.trim()) return;
    const next: TaskBoardCard = {
      ...existing,
      title: editTitle.trim(),
      note: editNote.trim() || undefined,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...existing.activities, nowActivity("edited", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setEditOpen(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not save changes."); }
    finally { setSaving(false); }
  };

  const removeCard = async () => {
    if (!editingCardId || !window.confirm("Delete this topic?")) return;
    const previous = board;
    setBoard((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== editingCardId) }));
    try {
      if (online) await deleteTaskBoardCard(scopeId!, editingCardId);
      setEditOpen(false);
    } catch (nextError) {
      setBoard(previous);
      setError(nextError instanceof Error ? nextError.message : "Could not delete topic.");
    }
  };

  const startDecision = (card: TaskBoardCard) => {
    if (latestOpenAction(card) || latestOpenDecision(card)) return;
    setDecisionCardId(card.id);
    setDecisionMode("vote");
    setDecisionQuestion(card.title);
    setDecisionOutcome("");
    setDecisionKind("yes-no-abstain");
    setDecisionOptions("");
    setDecisionMaxSelections("3");
  };

  const addDecision = async () => {
    const card = board.cards.find((item) => item.id === decisionCardId);
    if (!card) return;
    const now = Date.now();
    let decision: TaskBoardVote;
    let activity: TaskBoardActivity;
    if (decisionMode === "recorded") {
      if (!decisionOutcome.trim()) return;
      decision = {
        id: id("decision"), mode: "recorded", kind: "choose-one", question: decisionOutcome.trim(), outcome: decisionOutcome.trim(), options: [],
        anonymous: true, hideParticipationUntilClosed: false, showResultsWhileOpen: false, status: "closed", voterHashes: [], ballots: [],
        createdAt: now, closedAt: now, createdByName: currentActor.name, closedByName: currentActor.name,
      };
      activity = nowActivity("decision_recorded", currentActor.name, currentActor.email);
    } else {
      const labels = voteOptionLabels(decisionKind, decisionOptions);
      if (!decisionQuestion.trim() || labels.length < 2) return;
      const max = decisionKind === "multi-select" ? Math.max(1, Math.min(labels.length, Number(decisionMaxSelections) || labels.length)) : undefined;
      decision = {
        id: id("decision"), mode: "vote", kind: decisionKind, question: decisionQuestion.trim(), options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
        anonymous: true, hideParticipationUntilClosed: false, showResultsWhileOpen: false, status: "open", eligibleCount: Math.max(1, eligibleVoterCount),
        maxSelections: max, voterHashes: [], ballots: [], createdAt: now, createdByName: currentActor.name,
      };
      activity = nowActivity("vote_started", currentActor.name, currentActor.email);
    }
    const next: TaskBoardCard = {
      ...card,
      completedAt: undefined,
      completedByName: undefined,
      completedByEmail: undefined,
      decisions: [...(card.decisions || []), decision],
      vote: decision,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, activity].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setDecisionCardId(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not add decision."); }
    finally { setSaving(false); }
  };

  const closeVote = async (card: TaskBoardCard, decision: TaskBoardVote) => {
    if (decision.status !== "open") return;
    const now = Date.now();
    const nextDecisions = (card.decisions || []).map((item) => item.id === decision.id ? { ...item, status: "closed" as const, closedAt: now, closedByName: currentActor.name } : item);
    const next: TaskBoardCard = {
      ...card,
      decisions: nextDecisions,
      vote: nextDecisions[nextDecisions.length - 1],
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("vote_closed", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not close vote."); }
    finally { setSaving(false); }
  };

  const openOutcome = (card: TaskBoardCard, decision: TaskBoardVote) => {
    setOutcomeCardId(card.id);
    setOutcomeDecisionId(decision.id || "");
    setOutcomeText(decision.outcome || "");
  };

  const saveOutcome = async () => {
    const card = board.cards.find((item) => item.id === outcomeCardId);
    if (!card || !outcomeDecisionId || !outcomeText.trim()) return;
    const nextDecisions = (card.decisions || []).map((decision) => decision.id === outcomeDecisionId ? { ...decision, outcome: outcomeText.trim() } : decision);
    const next: TaskBoardCard = {
      ...card,
      decisions: nextDecisions,
      vote: nextDecisions[nextDecisions.length - 1],
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("decision_recorded", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setOutcomeCardId(null); setOutcomeDecisionId(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not record outcome."); }
    finally { setSaving(false); }
  };

  const openAddLink = (card: TaskBoardCard) => {
    setLinkCardId(card.id);
    setLinkUrl("");
    setLinkLabel("");
  };

  const addLink = async () => {
    const card = board.cards.find((item) => item.id === linkCardId);
    if (!card || !validHttpUrl(linkUrl) || (card.links?.length || 0) >= 5) return;
    const cleanUrl = linkUrl.trim();
    const link: TaskBoardLink = {
      id: id("link"),
      url: cleanUrl,
      label: linkLabel.trim() || providerLabel(cleanUrl),
      createdAt: Date.now(),
      createdByName: currentActor.name,
    };
    const next: TaskBoardCard = {
      ...card,
      links: [...(card.links || []), link],
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("link_added", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setLinkCardId(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not add link."); }
    finally { setSaving(false); }
  };

  const removeLink = async (card: TaskBoardCard, linkId: string) => {
    const next: TaskBoardCard = {
      ...card,
      links: (card.links || []).filter((link) => link.id !== linkId),
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("link_removed", currentActor.name, currentActor.email)].slice(-30),
    };
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not remove link."); }
  };

  const openAddAction = (card: TaskBoardCard) => {
    if (latestOpenAction(card) || latestOpenDecision(card)) return;
    setActionCardId(card.id);
    setActionText(card.title);
  };

  const addAction = async () => {
    const card = board.cards.find((item) => item.id === actionCardId);
    if (!card || !actionText.trim()) return;
    const action: TaskBoardActionItem = {
      id: id("action"), text: actionText.trim(), status: "open", createdAt: Date.now(), createdByName: currentActor.name,
    };
    const next: TaskBoardCard = {
      ...card,
      completedAt: undefined,
      completedByName: undefined,
      completedByEmail: undefined,
      actions: [...(card.actions || []), action],
      actionText: action.text,
      assignee: undefined,
      assigneeEmail: undefined,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("action_defined", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setActionCardId(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not add action."); }
    finally { setSaving(false); }
  };

  const updateAction = async (card: TaskBoardCard, actionId: string, patch: Partial<TaskBoardActionItem>, activity: TaskBoardActivity["action"]) => {
    const nextActions = (card.actions || []).map((action) => action.id === actionId ? { ...action, ...patch } : action);
    const nextOpen = [...nextActions].reverse().find((action) => action.status === "open");
    const next: TaskBoardCard = {
      ...card,
      actions: nextActions,
      actionText: nextOpen?.text,
      assignee: nextOpen?.assignee,
      assigneeEmail: nextOpen?.assigneeEmail,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity(activity, currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not update action."); }
    finally { setSaving(false); }
  };

  const claimAction = (card: TaskBoardCard, action: TaskBoardActionItem) => updateAction(card, action.id, { assignee: currentActor.name, assigneeEmail: currentActor.email }, "claimed");
  const releaseAction = (card: TaskBoardCard, action: TaskBoardActionItem) => updateAction(card, action.id, { assignee: undefined, assigneeEmail: undefined }, "released");
  const completeAction = (card: TaskBoardCard, action: TaskBoardActionItem) => updateAction(card, action.id, {
    status: "done", completedAt: Date.now(), completedByName: currentActor.name, completedByEmail: currentActor.email,
    assignee: action.assignee || currentActor.name, assigneeEmail: action.assigneeEmail || currentActor.email,
  }, "completed");

  const finishTopic = async (card: TaskBoardCard) => {
    if (latestOpenAction(card) || latestOpenDecision(card)) return;
    const next: TaskBoardCard = {
      ...card,
      completedAt: Date.now(),
      completedByName: currentActor.name,
      completedByEmail: currentActor.email,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("completed", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not finish topic."); }
    finally { setSaving(false); }
  };

  const reopenTopic = async (card: TaskBoardCard) => {
    const next: TaskBoardCard = {
      ...card,
      completedAt: undefined,
      completedByName: undefined,
      completedByEmail: undefined,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("reopened", currentActor.name, currentActor.email)].slice(-30),
    };
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not reopen topic."); }
  };

  const isMine = (action: TaskBoardActionItem) => Boolean(
    (action.assigneeEmail && currentActor.email && action.assigneeEmail.toLowerCase() === currentActor.email.toLowerCase())
    || (!action.assigneeEmail && action.assignee?.trim().toLowerCase() === currentActor.name.toLowerCase())
  );

  const openVoteDialog = (card: TaskBoardCard, decision: TaskBoardVote) => {
    const existingBallot = decision.ballots?.find((ballot) => ballot.voterHash === currentVoterHash);
    setVotingCardId(card.id);
    setVotingDecisionId(decision.id || "");
    setSelectedVoteOptionIds(existingBallot?.optionIds || []);
  };

  const votingCard = board.cards.find((card) => card.id === votingCardId);
  const votingDecision = votingCard?.decisions?.find((decision) => decision.id === votingDecisionId);

  const toggleVoteOption = (optionId: string) => {
    if (!votingDecision) return;
    if (votingDecision.kind !== "multi-select") {
      setSelectedVoteOptionIds([optionId]);
      return;
    }
    setSelectedVoteOptionIds((current) => {
      if (current.includes(optionId)) return current.filter((idValue) => idValue !== optionId);
      const max = votingDecision.maxSelections || votingDecision.options.length;
      if (current.length >= max) return current;
      return [...current, optionId];
    });
  };

  const submitVote = async () => {
    if (!votingCard || !votingDecision || !votingDecisionId || !selectedVoteOptionIds.length || !currentVoterHash) return;
    setVoteSubmitting(true); setError("");
    try {
      if (online) {
        await castTaskBoardVote(scopeId!, votingCard.id, votingDecisionId, currentVoterHash, currentActor.name, selectedVoteOptionIds);
      } else {
        const ballots = [...(votingDecision.ballots || [])];
        const oldIndex = ballots.findIndex((ballot) => ballot.voterHash === currentVoterHash);
        const oldIds = oldIndex >= 0 ? ballots[oldIndex].optionIds : [];
        const nextOptions = votingDecision.options.map((option) => ({
          ...option,
          count: Math.max(0, option.count - (oldIds.includes(option.id) ? 1 : 0)) + (selectedVoteOptionIds.includes(option.id) ? 1 : 0),
        }));
        const nextBallot = { voterHash: currentVoterHash, optionIds: selectedVoteOptionIds };
        if (oldIndex >= 0) ballots[oldIndex] = nextBallot; else ballots.push(nextBallot);
        const nextDecisions = (votingCard.decisions || []).map((decision) => decision.id === votingDecisionId ? { ...decision, options: nextOptions, ballots, voterHashes: ballots.map((ballot) => ballot.voterHash) } : decision);
        await persistCard({ ...votingCard, decisions: nextDecisions, vote: nextDecisions[nextDecisions.length - 1], updatedAt: Date.now() });
      }
      setVotingCardId(null); setVotingDecisionId(null); setSelectedVoteOptionIds([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not record vote.");
    } finally { setVoteSubmitting(false); }
  };

  const saveBoardName = async () => {
    if (!boardNameDraft.trim()) return;
    const meta: TaskBoardMeta = { ...(board.meta || {}), name: boardNameDraft.trim(), updatedAt: Date.now(), updatedByName: currentActor.name };
    setSaving(true); setError("");
    try { await persistMeta(meta); setBoardSettingsOpen(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not rename board."); }
    finally { setSaving(false); }
  };

  const renderDecision = (card: TaskBoardCard, decision: TaskBoardVote, index: number) => {
    const isOpen = decision.mode !== "recorded" && decision.status === "open";
    const totalVoters = voteTotal(decision);
    const userBallot = decision.ballots?.find((ballot) => ballot.voterHash === currentVoterHash);
    const legacyVoted = !decision.ballots?.length && decision.voterHashes.includes(currentVoterHash);
    return (
      <div key={decision.id || `${card.id}-decision-${index}`} className={`rounded-2xl border p-3 lg:p-4 ${isOpen ? "border-violet-200 bg-violet-50/55" : "border-slate-200 bg-slate-50/65"}`}>
        <div className="flex items-start gap-2">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${isOpen ? "bg-violet-100 text-violet-700" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
            <Gavel className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Decision {index + 1}{decision.mode === "recorded" ? " · recorded" : isOpen ? " · voting" : " · closed"}</div>
            <div className="mt-1 whitespace-normal break-words text-sm font-black leading-snug text-[#102A43]">{decision.question}</div>
          </div>
        </div>

        {decision.mode === "recorded" ? (
          <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-slate-100"><Check className="mr-1 inline h-3.5 w-3.5" />{decision.outcome || decision.question}</div>
        ) : isOpen ? (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
              <span>{totalVoters}{decision.eligibleCount ? ` of ${decision.eligibleCount}` : ""} voted</span>
              {decision.kind === "multi-select" && <span>Choose up to {decision.maxSelections || decision.options.length}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" className="flex-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white" onClick={() => openVoteDialog(card, decision)}>{userBallot ? "Change vote" : legacyVoted ? "Vote submitted" : "Vote"}</button>
              <button type="button" className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700" disabled={saving} onClick={() => void closeVote(card, decision)}>Close</button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="space-y-1.5">
              {decision.options.map((option) => {
                const denominator = decision.kind === "multi-select" ? Math.max(1, totalVoters) : Math.max(1, totalSelections(decision));
                const percent = Math.round((option.count / denominator) * 100);
                return <div key={option.id} className="flex items-center gap-2 text-xs font-bold text-slate-600"><span className="min-w-0 flex-1 break-words">{option.label}</span><span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-black text-[#102A43] ring-1 ring-slate-200">{option.count}</span>{decision.kind !== "multi-select" && <span className="w-8 text-right text-[10px] text-slate-400">{percent}%</span>}</div>;
              })}
            </div>
            {decision.outcome ? (
              <button type="button" className="mt-3 w-full rounded-xl bg-emerald-50 px-3 py-2 text-left text-xs font-bold text-emerald-800 ring-1 ring-emerald-100" onClick={() => openOutcome(card, decision)}><span className="font-black">Outcome:</span> {decision.outcome}</button>
            ) : (
              <button type="button" className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600" onClick={() => openOutcome(card, decision)}>Record outcome</button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAction = (card: TaskBoardCard, action: TaskBoardActionItem, index: number) => {
    const open = action.status === "open";
    const mine = isMine(action);
    return (
      <div key={action.id} className={`rounded-2xl border p-3 lg:p-4 ${open ? "border-sky-200 bg-sky-50/55" : "border-slate-200 bg-slate-50/65"}`}>
        <div className="flex items-start gap-2">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${open ? "bg-sky-100 text-sky-800" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}><Hand className="h-3.5 w-3.5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Action {index + 1}{open ? " · open" : " · done"}</div>
            <div className="mt-1 whitespace-normal break-words text-sm font-black leading-snug text-[#102A43]">{action.text}</div>
          </div>
        </div>
        {open ? (
          <div className="mt-3">
            {!action.assignee ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button type="button" className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-black text-white" onClick={() => void claimAction(card, action)}><Hand className="mr-1 inline h-3.5 w-3.5" />I’ll handle it</button>
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600" onClick={() => void completeAction(card, action)}>Already done</button>
              </div>
            ) : mine ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button type="button" className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white" onClick={() => void completeAction(card, action)}><Check className="mr-1 inline h-3.5 w-3.5" />Done</button>
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500" onClick={() => void releaseAction(card, action)}><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Release</button>
              </div>
            ) : <div className="rounded-xl bg-white px-3 py-2 text-xs font-black text-sky-800 ring-1 ring-sky-100"><Hand className="mr-1 inline h-3.5 w-3.5" />{action.assignee} is handling this</div>}
          </div>
        ) : <div className="mt-3 text-xs font-black text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Completed{action.completedByName ? ` by ${action.completedByName}` : ""}</div>}
      </div>
    );
  };

  return (
    <>
      <section className="rounded-[1.7rem] border p-3 shadow-sm lg:p-4" style={{ borderColor: mixHex(accent, "#ffffff", 0.72), background }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide lg:text-[20px] lg:normal-case lg:tracking-normal" style={{ color: accent }}>
              <ClipboardList className="fairteams-desktop-balanced-icon h-[18px] w-[18px] lg:h-6 lg:w-6" /> Action Board
            </div>
            <div className="mt-1 text-[12px] font-bold leading-tight text-slate-600 lg:text-[14px]">Topics → decisions → action</div>
          </div>
          <Button type="button" className="h-9 shrink-0 rounded-2xl px-3 text-xs font-black text-white lg:text-sm" style={{ backgroundColor: accent }} onClick={openBoard}>Open</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black text-slate-600 lg:text-xs">
          {openDecisionCount > 0 && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700"><Gavel className="mr-1 inline h-3 w-3" />{openDecisionCount} deciding</span>}
          {openActionCount > 0 && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800"><Hand className="mr-1 inline h-3 w-3" />{openActionCount} action</span>}
          {mineCount > 0 && <span className="rounded-full bg-white/75 px-2.5 py-1">{mineCount} yours</span>}
          {hasNewActivity && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />New activity</span>}
          <span className="rounded-full bg-white/75 px-2.5 py-1">{online ? "Shared" : isSharedRoster ? "Sign in" : "Private"}</span>
        </div>
        {latestActivity && <div className="mt-2 truncate text-[10px] font-bold text-slate-500 lg:text-xs">Last: “{latestActivity.card.title}” · {activityText(latestActivity.activity)}</div>}
      </section>

      <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
        <DialogContent className="fixed inset-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:inset-2 sm:h-auto sm:w-auto sm:rounded-[2rem] sm:border lg:inset-6 lg:rounded-[2rem]">
          <DialogHeader className="shrink-0 border-b border-white/45 px-3 py-3 pr-12 text-left lg:px-5 lg:py-4 lg:pr-14" style={{ backgroundColor: mixHex(accent, "#ffffff", 0.7) }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-black text-[#102A43] lg:text-[22px] lg:leading-tight">{board.meta?.name || rosterName}</DialogTitle>
                <p className="mt-0.5 text-[10px] font-bold text-slate-600 lg:mt-1 lg:text-[13px]">Keep the whole decision in one place.</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button type="button" variant="outline" className="h-9 w-9 rounded-2xl bg-white/80 p-0 lg:h-11 lg:w-11" onClick={() => { setBoardNameDraft(board.meta?.name || rosterName); setBoardSettingsOpen(true); }} aria-label="Board settings"><Pencil className="h-4 w-4 lg:h-[18px] lg:w-[18px]" /></Button>
                <Button type="button" className="h-9 rounded-2xl px-3 text-xs font-black text-white lg:h-11 lg:px-4 lg:text-sm" style={{ backgroundColor: accent }} onClick={() => { setNewTitle(""); setNewNote(""); setNewTopicOpen(true); }}><Plus className="mr-1 h-4 w-4" />New topic</Button>
              </div>
            </div>
          </DialogHeader>

          <div className="shrink-0 border-b border-slate-200/70 bg-white/90 px-3 py-2 lg:px-5">
            <div className="mx-auto flex max-w-3xl gap-1 rounded-2xl bg-slate-100 p-1">
              {(["active", "deciding", "action", "done"] as FeedFilter[]).map((item) => {
                const label = item === "active" ? "Active" : item === "deciding" ? "Decide" : item === "action" ? "Action" : "Done";
                const count = item === "active" ? board.cards.filter((card) => topicStage(card) !== "done").length : item === "deciding" ? openDecisionCount : item === "action" ? openActionCount : board.cards.filter((card) => topicStage(card) === "done").length;
                return <button key={item} type="button" className={`flex-1 rounded-xl px-2 py-2 text-[11px] font-black transition lg:text-xs ${filter === item ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setFilter(item)}>{label}{count > 0 ? ` · ${count}` : ""}</button>;
              })}
            </div>
          </div>

          {error && <div className="mx-3 mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 lg:mx-auto lg:w-full lg:max-w-3xl">{error}</div>}

          <div className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: background }}>
            {loading ? <div className="p-8 text-center text-sm font-black text-slate-500">Loading Action Board…</div> : board.cards.length === 0 ? (
              <EmptyActionBoard onCreate={() => { setNewTitle(""); setNewNote(""); setNewTopicOpen(true); }} />
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 pb-20 lg:space-y-4 lg:px-5 lg:py-5">
                {visibleCards.map((card) => {
                  const stage = topicStage(card);
                  const meta = stageMeta(stage);
                  const StageIcon = meta.icon;
                  const expanded = expandedIds.has(card.id);
                  const openDecision = latestOpenDecision(card);
                  const openAction = latestOpenAction(card);
                  const decisions = card.decisions || [];
                  const actions = card.actions || [];
                  const latestClosedDecision = [...decisions].reverse().find((decision) => decision.status === "closed");
                  return (
                    <article key={card.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <div className="p-4 lg:p-5">
                        <div className="flex items-start gap-3">
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggleExpanded(card.id)}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${meta.className}`}><StageIcon className="h-3 w-3" />{meta.label}</span>
                              {decisions.length > 0 && <span className="text-[10px] font-black text-slate-400">{decisions.length} decision{decisions.length === 1 ? "" : "s"}</span>}
                              {(card.links?.length || 0) > 0 && <span className="text-[10px] font-black text-slate-400"><Link2 className="mr-0.5 inline h-3 w-3" />{card.links?.length}</span>}
                            </div>
                            <h3 className="mt-2 whitespace-normal break-words text-[15px] font-black leading-snug text-[#102A43] lg:text-[18px]">{card.title}</h3>
                            {!expanded && card.note?.trim() && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-[13px]">{card.note.trim()}</p>}
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-slate-50" onClick={() => openEditCard(card)} aria-label={`Edit ${card.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-slate-50" onClick={() => toggleExpanded(card.id)} aria-label={expanded ? "Collapse topic" : "Expand topic"}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                          </div>
                        </div>

                        {!expanded && openDecision && <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/55 p-3">
                          <div className="text-[10px] font-black uppercase tracking-wide text-violet-600">Voting now</div>
                          <div className="mt-1 whitespace-normal break-words text-xs font-black leading-snug text-[#102A43] lg:text-sm">{openDecision.question}</div>
                          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-slate-500">{voteTotal(openDecision)}{openDecision.eligibleCount ? ` of ${openDecision.eligibleCount}` : ""} voted</span><button type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-[11px] font-black text-white" onClick={() => openVoteDialog(card, openDecision)}>Vote</button></div>
                        </div>}

                        {!expanded && openAction && <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/55 p-3">
                          <div className="text-[10px] font-black uppercase tracking-wide text-sky-700">Next action</div>
                          <div className="mt-1 whitespace-normal break-words text-xs font-black leading-snug text-[#102A43] lg:text-sm">{openAction.text}</div>
                          <div className="mt-2">{!openAction.assignee ? <button type="button" className="rounded-xl bg-sky-700 px-3 py-2 text-[11px] font-black text-white" onClick={() => void claimAction(card, openAction)}><Hand className="mr-1 inline h-3.5 w-3.5" />I’ll handle it</button> : <span className="text-[10px] font-black text-sky-800">{isMine(openAction) ? "You’re handling this" : `${openAction.assignee} is handling this`}</span>}</div>
                        </div>}

                        {!expanded && !openDecision && !openAction && latestClosedDecision?.outcome && <div className="mt-3 rounded-2xl bg-emerald-50/70 px-3 py-2 text-[11px] font-bold text-emerald-800"><span className="font-black">Latest outcome:</span> {latestClosedDecision.outcome}</div>}

                        {!expanded && (card.links?.length || 0) > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{card.links?.slice(0, 3).map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-xl bg-slate-50 px-2.5 py-1.5 text-[10px] font-black text-slate-600 ring-1 ring-slate-200" onClick={(event) => event.stopPropagation()}><Link2 className="h-3 w-3 shrink-0" /><span className="truncate">{link.label}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>)}</div>}
                      </div>

                      {expanded && <div className="border-t border-slate-100 bg-slate-50/35 px-4 pb-4 pt-3 lg:px-5 lg:pb-5 lg:pt-4">
                        {card.note?.trim() && <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Context</div><p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold leading-relaxed text-slate-600 lg:text-sm">{card.note.trim()}</p></div>}

                        {(card.links?.length || 0) > 0 && <div className="mb-4">
                          <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">References</div>
                          <div className="grid gap-2 sm:grid-cols-2">{card.links?.map((link) => <div key={link.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200"><a href={link.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-xs font-black text-[#102A43]"><Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{link.label}</span><ExternalLink className="h-3 w-3 shrink-0 text-slate-400" /></a><button type="button" className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" onClick={() => void removeLink(card, link.id)} aria-label={`Remove ${link.label}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
                        </div>}

                        {(decisions.length > 0 || actions.length > 0) && <div className="mb-4">
                          <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Thread</div>
                          <div className="space-y-2.5">
                            {decisions.map((decision, index) => renderDecision(card, decision, index))}
                            {actions.map((action, index) => renderAction(card, action, index))}
                          </div>
                        </div>}

                        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                          {stage !== "done" && !openDecision && !openAction && <button type="button" className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 ring-1 ring-violet-100" onClick={() => startDecision(card)}><Gavel className="mr-1 inline h-3.5 w-3.5" />+ Decision</button>}
                          {stage !== "done" && !openDecision && !openAction && <button type="button" className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-800 ring-1 ring-sky-100" onClick={() => openAddAction(card)}><Hand className="mr-1 inline h-3.5 w-3.5" />+ Action</button>}
                          {stage !== "done" && (card.links?.length || 0) < 5 && <button type="button" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200" onClick={() => openAddLink(card)}><Link2 className="mr-1 inline h-3.5 w-3.5" />+ Link</button>}
                          {stage !== "done" && !openDecision && !openAction && (decisions.length > 0 || actions.length > 0) && <button type="button" className="ml-auto rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white" onClick={() => void finishTopic(card)}><Check className="mr-1 inline h-3.5 w-3.5" />Finish topic</button>}
                          {stage === "done" && <button type="button" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200" onClick={() => void reopenTopic(card)}><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Reopen</button>}
                        </div>

                        <div className="mt-3 text-[10px] font-bold text-slate-400">Added by {card.createdByName} · {formatTime(card.createdAt)}{card.activities.length > 1 ? ` · ${activityText(card.activities[card.activities.length - 1])}` : ""}</div>
                      </div>}
                    </article>
                  );
                })}
                {visibleCards.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white/50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nothing here right now.</div>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newTopicOpen} onOpenChange={setNewTopicOpen}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">New topic</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="topic-title">Topic</Label><Textarea id="topic-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} rows={2} maxLength={220} placeholder="Replace our dead match ball" /></div>
            <div><Label htmlFor="topic-context">Context <span className="font-semibold text-slate-400">optional</span></Label><Textarea id="topic-context" value={newNote} onChange={(event) => setNewNote(event.target.value)} rows={2} maxLength={700} placeholder="Only what people need to understand the topic" /></div>
            <Button type="button" className="h-11 rounded-2xl font-black text-white" style={{ backgroundColor: accent }} disabled={!newTitle.trim() || saving} onClick={() => void createTopic()}>{saving ? "Saving…" : "Create topic"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(decisionCardId)} onOpenChange={(open) => { if (!open) setDecisionCardId(null); }}>
        <DialogContent className="fixed inset-x-2 bottom-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Add decision</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
              <button type="button" className={`rounded-xl px-3 py-2 text-xs font-black ${decisionMode === "vote" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDecisionMode("vote")}><Vote className="mr-1 inline h-3.5 w-3.5" />Vote together</button>
              <button type="button" className={`rounded-xl px-3 py-2 text-xs font-black ${decisionMode === "recorded" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDecisionMode("recorded")}><Check className="mr-1 inline h-3.5 w-3.5" />Record decision</button>
            </div>
            {decisionMode === "vote" ? <>
              <div><Label htmlFor="decision-question">What are we deciding?</Label><Textarea id="decision-question" value={decisionQuestion} onChange={(event) => setDecisionQuestion(event.target.value)} rows={2} maxLength={220} /><div className="mt-1 text-[10px] font-semibold text-slate-400">Keep the topic title as-is, or make the question more specific.</div></div>
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-violet-50 p-1">
                <button type="button" className={`rounded-xl px-2 py-2 text-[10px] font-black ${decisionKind === "yes-no-abstain" ? "bg-white text-violet-700 shadow-sm" : "text-violet-500"}`} onClick={() => setDecisionKind("yes-no-abstain")}>Yes / No</button>
                <button type="button" className={`rounded-xl px-2 py-2 text-[10px] font-black ${decisionKind === "choose-one" ? "bg-white text-violet-700 shadow-sm" : "text-violet-500"}`} onClick={() => setDecisionKind("choose-one")}>Choose one</button>
                <button type="button" className={`rounded-xl px-2 py-2 text-[10px] font-black ${decisionKind === "multi-select" ? "bg-white text-violet-700 shadow-sm" : "text-violet-500"}`} onClick={() => setDecisionKind("multi-select")}>Choose several</button>
              </div>
              {decisionKind !== "yes-no-abstain" && <div><Label htmlFor="decision-options">Choices — one per line</Label><Textarea id="decision-options" value={decisionOptions} onChange={(event) => setDecisionOptions(event.target.value)} rows={4} maxLength={700} placeholder={decisionKind === "multi-select" ? "Anna\nBen\nChris\nDaniel" : "Mauerpark\nTempelhofer Feld"} /></div>}
              {decisionKind === "multi-select" && <div><Label htmlFor="decision-max">Maximum choices</Label><Input id="decision-max" type="number" min="1" max="12" value={decisionMaxSelections} onChange={(event) => setDecisionMaxSelections(event.target.value)} inputMode="numeric" /></div>}
              <div className="text-[10px] font-semibold leading-snug text-slate-500">Anonymous by default. People can change their vote while it is open. Results appear after closing.</div>
            </> : <div><Label htmlFor="decision-outcome">What was decided?</Label><Textarea id="decision-outcome" value={decisionOutcome} onChange={(event) => setDecisionOutcome(event.target.value)} rows={3} maxLength={300} placeholder="We will buy the Select Brillant ball." /></div>}
            <Button type="button" className={`h-11 rounded-2xl font-black text-white ${decisionMode === "vote" ? "bg-violet-600 hover:bg-violet-700" : "bg-emerald-600 hover:bg-emerald-700"}`} disabled={saving || (decisionMode === "vote" ? !decisionQuestion.trim() || voteOptionLabels(decisionKind, decisionOptions).length < 2 : !decisionOutcome.trim())} onClick={() => void addDecision()}>{saving ? "Saving…" : decisionMode === "vote" ? "Open vote" : "Record decision"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkCardId)} onOpenChange={(open) => { if (!open) setLinkCardId(null); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Add reference link</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="link-url">Paste link</Label><Input id="link-url" type="url" inputMode="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></div>
            <div><Label htmlFor="link-label">Label <span className="font-semibold text-slate-400">optional</span></Label><Input id="link-label" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} maxLength={80} placeholder={validHttpUrl(linkUrl) ? providerLabel(linkUrl) : "e.g. Select Brillant"} /></div>
            <Button type="button" className="h-11 rounded-2xl font-black text-white" style={{ backgroundColor: accent }} disabled={!validHttpUrl(linkUrl) || saving} onClick={() => void addLink()}>{saving ? "Saving…" : "Add link"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionCardId)} onOpenChange={(open) => { if (!open) setActionCardId(null); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Add action</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="action-text">What needs to happen?</Label><Textarea id="action-text" value={actionText} onChange={(event) => setActionText(event.target.value)} rows={2} maxLength={220} /><div className="mt-1 text-[10px] font-semibold text-slate-400">Keep the topic title, or make the follow-through more specific.</div></div>
            <Button type="button" className="h-11 rounded-2xl bg-sky-700 font-black text-white hover:bg-sky-800" disabled={!actionText.trim() || saving} onClick={() => void addAction()}>{saving ? "Saving…" : "Add action"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(votingCard && votingDecision)} onOpenChange={(open) => { if (!open) { setVotingCardId(null); setVotingDecisionId(null); setSelectedVoteOptionIds([]); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Vote on FT</DialogTitle></DialogHeader>
          {votingDecision && <div className="grid gap-3">
            <div className="whitespace-normal break-words text-sm font-black leading-snug text-[#102A43]">{votingDecision.question}</div>
            {votingDecision.kind === "multi-select" && <div className="text-[10px] font-bold text-slate-500">Choose up to {votingDecision.maxSelections || votingDecision.options.length}.</div>}
            <div className="grid gap-2">{votingDecision.options.map((option) => {
              const selected = selectedVoteOptionIds.includes(option.id);
              return <button key={option.id} type="button" className={`rounded-2xl border px-3 py-3 text-left text-sm font-black ${selected ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-[#102A43]"}`} onClick={() => toggleVoteOption(option.id)}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option.label}</button>;
            })}</div>
            <div className="text-[10px] font-semibold leading-snug text-slate-500">Anonymous. You can change your choice while the vote remains open.</div>
            <Button type="button" className="h-11 rounded-2xl bg-violet-600 font-black text-white" disabled={!selectedVoteOptionIds.length || voteSubmitting} onClick={() => void submitVote()}>{voteSubmitting ? "Recording…" : votingDecision.ballots?.some((ballot) => ballot.voterHash === currentVoterHash) ? "Update vote" : "Submit vote"}</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(outcomeCardId && outcomeDecisionId)} onOpenChange={(open) => { if (!open) { setOutcomeCardId(null); setOutcomeDecisionId(null); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Record outcome</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="outcome-text">What did the club decide?</Label><Textarea id="outcome-text" value={outcomeText} onChange={(event) => setOutcomeText(event.target.value)} rows={3} maxLength={300} placeholder="Anna, Chris and Emma become club members." /></div>
            <Button type="button" className="h-11 rounded-2xl bg-emerald-600 font-black text-white" disabled={!outcomeText.trim() || saving} onClick={() => void saveOutcome()}>{saving ? "Saving…" : "Save outcome"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="fixed inset-x-2 bottom-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Edit topic</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="edit-title">Topic</Label><Textarea id="edit-title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} rows={2} maxLength={220} /></div>
            <div><Label htmlFor="edit-note">Context</Label><Textarea id="edit-note" value={editNote} onChange={(event) => setEditNote(event.target.value)} rows={3} maxLength={700} placeholder="Optional" /></div>
            <div className="flex gap-2"><Button type="button" variant="outline" className="h-11 rounded-2xl text-red-700" onClick={() => void removeCard()}><Trash2 className="mr-1 h-4 w-4" />Delete</Button><Button type="button" className="h-11 flex-1 rounded-2xl font-black text-white" style={{ backgroundColor: accent }} disabled={!editTitle.trim() || saving} onClick={() => void saveEditedCard()}>{saving ? "Saving…" : "Save"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={boardSettingsOpen} onOpenChange={setBoardSettingsOpen}>
        <DialogContent className="max-w-sm rounded-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Board name</DialogTitle></DialogHeader>
          <div className="grid gap-3"><div><Label htmlFor="board-name">Name</Label><Input id="board-name" value={boardNameDraft} onChange={(event) => setBoardNameDraft(event.target.value)} maxLength={80} /></div><Button type="button" className="h-11 rounded-2xl font-black text-white" style={{ backgroundColor: accent }} disabled={!boardNameDraft.trim() || saving} onClick={() => void saveBoardName()}>Save name</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
