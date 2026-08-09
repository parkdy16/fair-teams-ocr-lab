import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
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
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Smartphone,
  Tag,
  Trash2,
  Users,
  Vote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RoomPlayer } from "@/lib/localRoster";
import type { SharedRosterUser } from "@/lib/sharedRosterService";
import {
  enablePhoneNotifications,
  getPhoneNotificationStatus,
  sendActionBoardNotification,
  syncPhoneNotificationsIfEnabled,
  type ActionBoardNotificationStepKind,
  type PhoneNotificationStatus,
} from "@/lib/notificationService";
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
  type TaskBoardDecisionQuestion,
  type TaskBoardDecisionType,
  type TaskBoardLink,
  type TaskBoardMeta,
  type TaskBoardNotificationState,
  type TaskBoardPerson,
  type TaskBoardSnapshot,
  type TaskBoardVote,
  type TaskBoardVoteAnswer,
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
  organizerPeople?: TaskBoardPerson[];
  players?: RoomPlayer[];
  equipmentItems?: string[];
};

type LocalBoard = TaskBoardSnapshot;
type MobileFilter = "ideas" | "deciding" | "action" | "done";
type DecisionMode = "vote" | "recorded";
type NewTopicKind = "idea" | "decide" | "action";
type TopicStage = MobileFilter;
type DecisionSetupStep = TaskBoardDecisionType | null;
type DraftQuestion = {
  id: string;
  text: string;
  kind: Exclude<TaskBoardVoteKind, "schedule">;
  options: string;
  maxSelections: string;
};
type ScheduleDateGroup = { id: string; date: string; times: string[] };
type TimelineEntry =
  | { key: string; kind: "decision"; createdAt: number; decision: TaskBoardVote; index: number }
  | { key: string; kind: "action"; createdAt: number; action: TaskBoardActionItem; index: number };

type NotifyTarget = {
  kind: ActionBoardNotificationStepKind;
  id?: string;
  label: string;
  text: string;
  notification?: TaskBoardNotificationState;
  suggestedEmails?: string[];
  topicAlreadyNotified?: boolean;
};

const WORKFLOW: Array<{ kind: TaskBoardColumnKind; name: string }> = [
  { kind: "ideas", name: "Ideas" },
  { kind: "vote", name: "Decide" },
  { kind: "action", name: "Action" },
  { kind: "done", name: "Done" },
];

const TAGS = ["Administration", "Sports", "Equipment", "Event", "Finance", "Membership", "Other"];

function tagTone(category?: string) {
  switch ((category || "").toLowerCase()) {
    case "administration": return "bg-slate-100 text-slate-700 ring-slate-200";
    case "sports": return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "equipment": return "bg-sky-50 text-sky-700 ring-sky-100";
    case "event": return "bg-amber-50 text-amber-800 ring-amber-100";
    case "finance": return "bg-teal-50 text-teal-700 ring-teal-100";
    case "membership": return "bg-violet-50 text-violet-700 ring-violet-100";
    default: return "bg-stone-100 text-stone-600 ring-stone-200";
  }
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newDraftQuestion(text = ""): DraftQuestion {
  return { id: id("draft-question"), text, kind: "yes-no-abstain", options: "", maxSelections: "3" };
}

function newScheduleDateGroup(): ScheduleDateGroup {
  return { id: id("schedule-date"), date: "", times: [""] };
}

const TIME_CHOICES = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

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

function actor(user: SharedRosterUser | null): TaskBoardPerson {
  return { name: user?.displayName?.trim() || user?.email || "Organizer", email: user?.email || undefined };
}

function personKey(person: TaskBoardPerson) {
  return (person.email || person.name).trim().toLowerCase();
}

function normalizePeople(people: TaskBoardPerson[] = []) {
  const seen = new Set<string>();
  return people
    .map((person) => ({ name: person.name.trim(), email: person.email?.trim() || undefined }))
    .filter((person) => {
      if (!person.name) return false;
      const key = personKey(person);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  const decisions = Array.isArray(card.decisions) && card.decisions.length
    ? card.decisions
    : card.vote ? [{ ...card.vote, id: card.vote.id || "legacy-vote" }] : [];
  let actions = Array.isArray(card.actions) ? card.actions : [];
  if (!actions.length && card.actionText) {
    actions = [{
      id: "legacy-action",
      text: card.actionText,
      status: card.completedAt ? "done" : "open",
      assignees: card.assignee ? [{ name: card.assignee, email: card.assigneeEmail }] : [],
      assignee: card.assignee,
      assigneeEmail: card.assigneeEmail,
      createdAt: card.lastMovedAt || card.createdAt,
      completedAt: card.completedAt,
      completedByName: card.completedByName,
      completedByEmail: card.completedByEmail,
    }];
  }
  actions = actions.map((action) => {
    const people = normalizePeople(action.assignees?.length ? action.assignees : action.assignee ? [{ name: action.assignee, email: action.assigneeEmail }] : []);
    return { ...action, assignees: people, assignee: people[0]?.name, assigneeEmail: people[0]?.email };
  });
  return {
    ...card,
    people: normalizePeople(card.people || []),
    decisions,
    actions,
    links: Array.isArray(card.links) ? card.links : [],
  };
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
  if (latestOpenDecision(card)) return "deciding";
  if (latestOpenAction(card)) return "action";
  const latestDecision = [...(card.decisions || [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  const latestAction = [...(card.actions || [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latestDecision && (!latestAction || latestDecision.createdAt >= latestAction.createdAt)) return "deciding";
  if (latestAction) return "action";
  return "ideas";
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
  if (activity.action === "created") return `${activity.actorName} added a topic`;
  if (activity.action === "vote_started") return `${activity.actorName} opened a decision`;
  if (activity.action === "vote_closed") return `${activity.actorName} closed a vote`;
  if (activity.action === "decision_recorded") return `${activity.actorName} recorded a decision`;
  if (activity.action === "action_defined") return `${activity.actorName} added an action`;
  if (activity.action === "claimed") return `${activity.actorName} joined an action`;
  if (activity.action === "released") return `${activity.actorName} left an action`;
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
  return raw.split(/\n/).map((value) => value.trim()).filter(Boolean).slice(0, 16);
}

function scheduleLabel(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function scheduleSlotValues(groups: ScheduleDateGroup[]) {
  return [...new Set(groups.flatMap((group) => group.date
    ? group.times.filter(Boolean).map((time) => `${group.date}T${time}`)
    : []))];
}

function decisionQuestions(decision: TaskBoardVote): TaskBoardDecisionQuestion[] {
  if (decision.questions?.length) return decision.questions;
  if (decision.mode === "recorded" || decision.options.length < 2) return [];
  return [{
    id: "question-1",
    text: decision.question,
    kind: decision.kind === "schedule" ? "multi-select" : (decision.kind || "choose-one") as Exclude<TaskBoardVoteKind, "schedule">,
    options: decision.options,
    maxSelections: decision.maxSelections,
    sourcePlayerIds: decision.sourcePlayerIds,
  }];
}

function actionPeople(action?: TaskBoardActionItem) {
  if (!action) return [];
  return normalizePeople(action.assignees?.length ? action.assignees : action.assignee ? [{ name: action.assignee, email: action.assigneeEmail }] : []);
}

function personSummary(people: TaskBoardPerson[] = []) {
  const clean = normalizePeople(people);
  if (!clean.length) return "";
  if (clean.length <= 2) return clean.map((person) => person.name).join(" + ");
  return `${clean.slice(0, 2).map((person) => person.name).join(" + ")} +${clean.length - 2}`;
}

function currentNeed(card: TaskBoardCard) {
  const openDecision = latestOpenDecision(card);
  if (openDecision) {
    if (openDecision.title?.trim()) return openDecision.title.trim();
    if (openDecision.decisionType === "schedule" || openDecision.kind === "schedule") return "Find a time";
    const questions = decisionQuestions(openDecision);
    if (questions.length > 1) return `${questions[0].text} +${questions.length - 1} more`;
    if (openDecision.decisionType === "players") return questions[0]?.text || "Choose players";
    if (openDecision.decisionType === "equipment") return questions[0]?.text || "Choose equipment";
    return questions[0]?.text || openDecision.question;
  }
  const action = latestOpenAction(card);
  if (action) return action.text;
  if (card.completedAt) return "Completed";
  const latestDecision = [...(card.decisions || [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latestDecision) return latestDecision.title?.trim() || (latestDecision.mode === "recorded" ? "Decision recorded · choose next step" : "Vote closed · choose next step");
  const latestAction = [...(card.actions || [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latestAction?.status === "done") return "Action done · choose next step";
  return latestAction?.text || "";
}

function decisionTypeLabel(decision: TaskBoardVote) {
  if (decision.decisionType === "schedule" || decision.kind === "schedule") return "Schedule";
  if (decision.decisionType === "players") return "Players";
  if (decision.decisionType === "equipment") return "Equipment";
  return decision.mode === "recorded" ? "Decision" : "Vote";
}

function timelineEntries(card: TaskBoardCard): TimelineEntry[] {
  const decisions: TimelineEntry[] = (card.decisions || []).map((decision, index) => ({
    key: `decision:${decision.id || index}`,
    kind: "decision",
    createdAt: decision.createdAt || card.createdAt,
    decision,
    index,
  }));
  const actions: TimelineEntry[] = (card.actions || []).map((action, index) => ({
    key: `action:${action.id || index}`,
    kind: "action",
    createdAt: action.createdAt || card.createdAt,
    action,
    index,
  }));
  return [...decisions, ...actions].sort((a, b) => a.createdAt - b.createdAt);
}

function currentTimelineKey(card: TaskBoardCard) {
  if (card.completedAt) return null;
  const openDecision = latestOpenDecision(card);
  if (openDecision) return `decision:${openDecision.id || (card.decisions || []).indexOf(openDecision)}`;
  const openAction = latestOpenAction(card);
  if (openAction) return `action:${openAction.id || (card.actions || []).indexOf(openAction)}`;
  const entries = timelineEntries(card);
  return entries[entries.length - 1]?.key || null;
}

function currentNotifyTarget(card: TaskBoardCard): NotifyTarget | null {
  if (card.completedAt) return null;
  const topicAlreadyNotified = card.topicNotification?.status === "sent"
    || (card.decisions || []).some((decision) => decision.notification?.status === "sent")
    || (card.actions || []).some((action) => action.notification?.status === "sent");
  const openDecision = latestOpenDecision(card);
  if (openDecision) {
    const questions = decisionQuestions(openDecision);
    return {
      kind: "decision",
      id: openDecision.id,
      label: openDecision.kind === "schedule" || openDecision.decisionType === "schedule" ? "Schedule" : "Decision",
      text: openDecision.title?.trim() || (questions.length === 1 ? questions[0].text : openDecision.question || "Decision"),
      notification: openDecision.notification,
      suggestedEmails: openDecision.participantEmails,
      topicAlreadyNotified,
    };
  }
  const openAction = latestOpenAction(card);
  if (openAction) {
    return {
      kind: "action",
      id: openAction.id,
      label: "Action",
      text: openAction.text,
      notification: openAction.notification,
      suggestedEmails: actionPeople(openAction).map((person) => person.email || "").filter(Boolean),
      topicAlreadyNotified,
    };
  }
  const latestEntry = timelineEntries(card).at(-1);
  if (latestEntry?.kind === "decision") {
    const decision = latestEntry.decision;
    const questions = decisionQuestions(decision);
    return {
      kind: "decision",
      id: decision.id,
      label: decision.kind === "schedule" || decision.decisionType === "schedule" ? "Schedule result" : "Decision result",
      text: decision.title?.trim() || (questions.length === 1 ? questions[0].text : decision.question || "Decision"),
      notification: decision.notification,
      suggestedEmails: decision.participantEmails,
      topicAlreadyNotified,
    };
  }
  if (latestEntry?.kind === "action") {
    const action = latestEntry.action;
    return {
      kind: "action",
      id: action.id,
      label: action.status === "done" ? "Action complete" : "Action",
      text: action.text,
      notification: action.notification,
      suggestedEmails: actionPeople(action).map((person) => person.email || "").filter(Boolean),
      topicAlreadyNotified,
    };
  }
  return {
    kind: "topic",
    label: "Idea",
    text: card.title,
    notification: card.topicNotification,
    suggestedEmails: card.people?.map((person) => person.email || "").filter(Boolean),
    topicAlreadyNotified,
  };
}

function notificationSummary(notification?: TaskBoardNotificationState) {
  if (!notification || notification.status !== "sent") return "";
  const recipients = notification.recipientEmails?.length || 0;
  const channels = (notification.channels || []).map((channel) => channel === "email" ? "email" : "phone").join(" + ");
  return `Notified${notification.sentByName ? ` by ${notification.sentByName}` : ""}${notification.sentAt ? ` · ${formatTime(notification.sentAt)}` : ""}${recipients ? ` · ${recipients} organizer${recipients === 1 ? "" : "s"}` : ""}${channels ? ` · ${channels}` : ""}`;
}

function decisionHistoryMeta(decision: TaskBoardVote) {
  if (decision.mode === "recorded") return "Recorded";
  const responses = voteTotal(decision);
  const questions = decisionQuestions(decision);
  const responseText = `${responses} response${responses === 1 ? "" : "s"}`;
  if (decision.status === "open") return `Open · ${responseText}`;
  if (questions.length > 1) return `Closed · ${questions.length} questions · ${responseText}`;
  return `Closed · ${responseText}`;
}

function EmptyActionBoard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm ring-1 ring-slate-200"><Gavel className="h-6 w-6" /></div>
      <h3 className="mt-4 text-lg font-black text-[#102A43]">Keep decisions from getting lost in chat</h3>
      <p className="mt-1 max-w-md text-sm font-semibold leading-relaxed text-slate-500">A topic can collect links, decisions, scheduling and follow-through while the board stays easy to scan.</p>
      <Button type="button" className="mt-5 h-11 w-11 rounded-2xl p-0 font-black text-white" onClick={onCreate} aria-label="New topic"><Plus className="h-5 w-5" /></Button>
    </div>
  );
}

export function TaskBoard({
  rosterName,
  workspaceKey,
  themeColor,
  scopeId,
  isSharedRoster,
  user,
  eligibleVoterCount = 1,
  organizerPeople = [],
  players = [],
  equipmentItems = [],
}: Props) {
  const online = Boolean(scopeId && user?.email);
  const accent = safeColor(themeColor);
  const background = mixHex(accent, "#ffffff", 0.93);
  const currentActor = actor(user);

  const availablePeople = useMemo(
    () => normalizePeople([currentActor, ...organizerPeople]),
    [currentActor.email, currentActor.name, organizerPeople],
  );

  const [board, setBoard] = useState<LocalBoard>(() => readLocalBoard(workspaceKey, rosterName));
  const [boardOpen, setBoardOpen] = useState(false);
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>("deciding");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [lastSeenActivityAt, setLastSeenActivityAt] = useState(() => readActivitySeen(workspaceKey));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentVoterHash, setCurrentVoterHash] = useState("");

  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicKind, setNewTopicKind] = useState<NewTopicKind | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPeopleKeys, setNewPeopleKeys] = useState<string[]>([]);

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPeopleKeys, setEditPeopleKeys] = useState<string[]>([]);

  const [decisionCardId, setDecisionCardId] = useState<string | null>(null);
  const [decisionStep, setDecisionStep] = useState<DecisionSetupStep>(null);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("vote");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionQuestion, setDecisionQuestion] = useState("");
  const [decisionQuestionsDraft, setDecisionQuestionsDraft] = useState<DraftQuestion[]>([newDraftQuestion()]);
  const [decisionOutcome, setDecisionOutcome] = useState("");
  const [decisionKind, setDecisionKind] = useState<TaskBoardVoteKind>("yes-no-abstain");
  const [decisionOptions, setDecisionOptions] = useState("");
  const [decisionMaxSelections, setDecisionMaxSelections] = useState("3");
  const [decisionPeopleKeys, setDecisionPeopleKeys] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [scheduleHostName, setScheduleHostName] = useState("");
  const [scheduleDates, setScheduleDates] = useState<ScheduleDateGroup[]>([newScheduleDateGroup()]);

  const [linkCardId, setLinkCardId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [actionText, setActionText] = useState("");
  const [actionPeopleKeys, setActionPeopleKeys] = useState<string[]>([]);

  const [votingCardId, setVotingCardId] = useState<string | null>(null);
  const [votingDecisionId, setVotingDecisionId] = useState<string | null>(null);
  const [selectedVoteAnswers, setSelectedVoteAnswers] = useState<Record<string, string[]>>({});
  const [voteSubmitting, setVoteSubmitting] = useState(false);

  const [outcomeCardId, setOutcomeCardId] = useState<string | null>(null);
  const [outcomeDecisionId, setOutcomeDecisionId] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");

  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const boardNameSaveTimerRef = useRef<number | null>(null);

  const [notifyCardId, setNotifyCardId] = useState<string | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<NotifyTarget | null>(null);
  const [notifyRecipientMode, setNotifyRecipientMode] = useState<"all" | "selected">("all");
  const [notifyRecipientEmails, setNotifyRecipientEmails] = useState<string[]>([]);
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyByPush, setNotifyByPush] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifySending, setNotifySending] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [phoneStatus, setPhoneStatus] = useState<PhoneNotificationStatus>("available");
  const [phoneEnabling, setPhoneEnabling] = useState(false);

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
    if (!online) return;
    void syncPhoneNotificationsIfEnabled().catch(() => undefined);
  }, [online, user?.uid]);

  useEffect(() => {
    setLastSeenActivityAt(readActivitySeen(workspaceKey));
  }, [workspaceKey]);

  const withDerivedColumn = (card: TaskBoardCard) => {
    const kind = stageColumnKind(card);
    const column = columnByKind.get(kind);
    return column && card.columnId !== column.id
      ? { ...card, columnId: column.id, lastMovedAt: Date.now(), lastMovedByName: currentActor.name }
      : card;
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

  const latestActivity = useMemo(
    () => board.cards.flatMap((card) => card.activities.map((activity) => ({ card, activity }))).sort((a, b) => b.activity.at - a.activity.at)[0],
    [board.cards],
  );
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

  const cardsByStage = useMemo(() => {
    const result: Record<TopicStage, TaskBoardCard[]> = { ideas: [], deciding: [], action: [], done: [] };
    board.cards.forEach((card) => result[topicStage(card)].push(card));
    (Object.keys(result) as TopicStage[]).forEach((stage) => {
      result[stage].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    return result;
  }, [board.cards]);

  const toggleExpanded = (cardId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  const toggleHistoryExpanded = (entryKey: string) => {
    setExpandedHistoryIds((current) => {
      const next = new Set(current);
      next.has(entryKey) ? next.delete(entryKey) : next.add(entryKey);
      return next;
    });
  };

  const resetNewTopic = () => {
    setNewTopicKind(null);
    setNewTitle("");
    setNewCategory("");
    setNewDueDate("");
    setNewPeopleKeys([]);
  };

  const peopleFromKeys = (keys: string[]) => availablePeople.filter((person) => keys.includes(personKey(person)));

  const otherOrganizerPeople = useMemo(
    () => availablePeople.filter((person) => person.email && person.email.toLowerCase() !== currentActor.email?.toLowerCase()),
    [availablePeople, currentActor.email],
  );

  const openNotify = (card: TaskBoardCard) => {
    const target = currentNotifyTarget(card);
    if (!online || !target || target.notification?.status === "sent" || target.notification?.status === "queued") return;
    const allEmails = otherOrganizerPeople.map((person) => person.email!).filter(Boolean);
    const suggested = Array.from(new Set((target.suggestedEmails || []).map((email) => email.trim().toLowerCase()).filter((email) => allEmails.includes(email))));
    setNotifyCardId(card.id);
    setNotifyTarget(target);
    setNotifyRecipientMode(suggested.length && suggested.length < allEmails.length ? "selected" : "all");
    setNotifyRecipientEmails(suggested.length ? suggested : allEmails);
    setNotifyByEmail(true);
    setNotifyByPush(phoneStatus === "enabled");
    setNotifyMessage("");
    setNotifyError("");
    void getPhoneNotificationStatus().then((status) => {
      setPhoneStatus(status);
      if (status === "enabled") setNotifyByPush(true);
    });
  };

  const closeNotify = () => {
    if (notifySending) return;
    setNotifyCardId(null);
    setNotifyTarget(null);
    setNotifyError("");
  };

  const notifyEmailsToSend = notifyRecipientMode === "all"
    ? otherOrganizerPeople.map((person) => person.email!).filter(Boolean)
    : notifyRecipientEmails;

  const toggleNotifyEmail = (email: string) => {
    setNotifyRecipientEmails((current) => current.includes(email) ? current.filter((item) => item !== email) : [...current, email]);
  };

  const sendNotification = async () => {
    if (!scopeId || !notifyCardId || !notifyTarget || notifySending) return;
    if (!notifyEmailsToSend.length) {
      setNotifyError("Choose at least one organizer.");
      return;
    }
    if (!notifyByEmail && !notifyByPush) {
      setNotifyError("Choose email or phone notification.");
      return;
    }
    setNotifySending(true);
    setNotifyError("");
    try {
      await sendActionBoardNotification({
        scopeId,
        cardId: notifyCardId,
        stepKind: notifyTarget.kind,
        stepId: notifyTarget.id,
        recipientEmails: notifyEmailsToSend,
        email: notifyByEmail,
        push: notifyByPush,
        message: notifyMessage,
      });
      setNotifyCardId(null);
      setNotifyTarget(null);
    } catch (nextError) {
      setNotifyError(nextError instanceof Error ? nextError.message : "Could not notify organizers.");
    } finally {
      setNotifySending(false);
    }
  };

  const enablePhone = async () => {
    if (phoneEnabling) return;
    setPhoneEnabling(true);
    setNotifyError("");
    try {
      await enablePhoneNotifications();
      setPhoneStatus("enabled");
    } catch (nextError) {
      setNotifyError(nextError instanceof Error ? nextError.message : "Could not enable phone notifications.");
      setPhoneStatus(await getPhoneNotificationStatus());
    } finally {
      setPhoneEnabling(false);
    }
  };

const togglePersonKey = (key: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const createTopic = async () => {
    if (!newTitle.trim() || !newTopicKind) return;
    const ideasColumn = columnByKind.get("ideas") || activeColumns[0];
    if (!ideasColumn) return;
    const now = Date.now();
    const selectedPeople = peopleFromKeys(newPeopleKeys);
    const initialAction: TaskBoardActionItem | null = newTopicKind === "action" ? {
      id: id("action"),
      text: newTitle.trim(),
      status: "open",
      assignees: selectedPeople,
      assignee: selectedPeople[0]?.name,
      assigneeEmail: selectedPeople[0]?.email,
      createdAt: now,
      createdByName: currentActor.name,
    } : null;
    const card: TaskBoardCard = {
      id: id("topic"),
      title: newTitle.trim(),
      columnId: ideasColumn.id,
      position: now,
      people: selectedPeople,
      links: [],
      decisions: [],
      actions: initialAction ? [initialAction] : [],
      actionText: initialAction?.text,
      assignee: initialAction?.assignee,
      assigneeEmail: initialAction?.assigneeEmail,
      dueDate: newDueDate || undefined,
      category: newCategory || undefined,
      createdAt: now,
      createdByName: currentActor.name,
      createdByEmail: currentActor.email,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [
        nowActivity("created", currentActor.name, currentActor.email),
        ...(initialAction ? [nowActivity("action_defined", currentActor.name, currentActor.email)] : []),
      ],
    };
    const startKind = newTopicKind;
    setSaving(true); setError("");
    try {
      const saved = await persistCard(card);
      setNewTopicOpen(false);
      resetNewTopic();
      setExpandedIds((current) => new Set(current).add(saved.id));
      if (startKind === "idea") setMobileFilter("ideas");
      if (startKind === "action") setMobileFilter("action");
      if (startKind === "decide") startDecision(saved);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not add topic.");
    } finally { setSaving(false); }
  };

  const openEditCard = (card: TaskBoardCard) => {
    setEditingCardId(card.id);
    setEditTitle(card.title);
    setEditCategory(card.category || "");
    setEditDueDate(card.dueDate || "");
    setEditPeopleKeys((card.people || []).map(personKey));
    setEditOpen(true);
  };

  const saveEditedCard = async () => {
    const existing = board.cards.find((card) => card.id === editingCardId);
    if (!existing || !editTitle.trim()) return;
    const next: TaskBoardCard = {
      ...existing,
      title: editTitle.trim(),
      category: editCategory || undefined,
      dueDate: editDueDate || undefined,
      people: peopleFromKeys(editPeopleKeys),
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
    if (latestOpenDecision(card)) return;
    setDecisionCardId(card.id);
    setDecisionStep(null);
    setDecisionMode("vote");
    setDecisionTitle("");
    setDecisionQuestion("");
    setDecisionQuestionsDraft([newDraftQuestion("")]);
    setDecisionOutcome("");
    setDecisionKind("yes-no-abstain");
    setDecisionOptions("");
    setDecisionMaxSelections("3");
    setDecisionPeopleKeys((card.people || []).map(personKey));
    setSelectedPlayerIds([]);
    setPlayerSearch("");
    setScheduleHostName(currentActor.name);
    setScheduleDates([newScheduleDateGroup()]);
  };

  const chooseDecisionType = (kind: TaskBoardDecisionType) => {
    const card = board.cards.find((item) => item.id === decisionCardId);
    if (!card) return;
    setDecisionStep(kind);
    setDecisionMode("vote");
    setDecisionOutcome("");
    setDecisionTitle("");
    if (kind === "schedule") {
      setDecisionKind("schedule");
      setDecisionQuestion("");
      setScheduleHostName(currentActor.name);
      setScheduleDates([newScheduleDateGroup()]);
    } else if (kind === "players") {
      setDecisionKind("multi-select");
      setDecisionQuestion("Who should be selected?");
      setDecisionMaxSelections("3");
    } else if (kind === "equipment") {
      setDecisionKind("choose-one");
      setDecisionQuestion("Which option should we choose?");
      setDecisionOptions("");
    } else {
      setDecisionKind("yes-no-abstain");
      setDecisionQuestionsDraft([newDraftQuestion("")]);
    }
  };

  const addDecision = async () => {
    const card = board.cards.find((item) => item.id === decisionCardId);
    if (!card || !decisionStep) return;
    const now = Date.now();
    const phaseNameRequired = Boolean((card.decisions?.length || 0) + (card.actions?.length || 0));
    if (phaseNameRequired && !decisionTitle.trim()) return;
    let decision: TaskBoardVote;
    let activity: TaskBoardActivity;

    if (decisionMode === "recorded") {
      if (!decisionOutcome.trim()) return;
      decision = {
        id: id("decision"),
        mode: "recorded",
        kind: "choose-one",
        decisionType: decisionStep,
        title: decisionTitle.trim() || undefined,
        question: decisionTitle.trim() || decisionOutcome.trim(),
        outcome: decisionOutcome.trim(),
        options: [],
        questions: [],
        anonymous: true,
        hideParticipationUntilClosed: false,
        showResultsWhileOpen: false,
        status: "closed",
        voterHashes: [],
        ballots: [],
        createdAt: now,
        closedAt: now,
        createdByName: currentActor.name,
        closedByName: currentActor.name,
      };
      activity = nowActivity("decision_recorded", currentActor.name, currentActor.email);
    } else {
      const selectedPeople = peopleFromKeys(decisionPeopleKeys);
      let questions: TaskBoardDecisionQuestion[] = [];
      let sourcePlayerIds: string[] | undefined;
      let rootKind: TaskBoardVoteKind = decisionKind;

      if (decisionStep === "schedule") {
        const values = scheduleSlotValues(scheduleDates);
        const labels = values.map(scheduleLabel).filter(Boolean);
        if (!scheduleHostName.trim() || labels.length < 2) return;
        questions = [{
          id: id("question"),
          text: decisionTitle.trim() || card.title,
          kind: "multi-select",
          options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
          maxSelections: labels.length,
        }];
        rootKind = "schedule";
      } else if (decisionStep === "players") {
        const selected = players.filter((player) => selectedPlayerIds.includes(player.id));
        const labels = selected.map((player) => player.name.trim()).filter(Boolean);
        sourcePlayerIds = selected.map((player) => player.id);
        if (!decisionQuestion.trim() || labels.length < 2) return;
        const max = Math.max(1, Math.min(labels.length, Number(decisionMaxSelections) || labels.length));
        questions = [{
          id: id("question"),
          text: decisionQuestion.trim(),
          kind: "multi-select",
          options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
          maxSelections: max,
          sourcePlayerIds,
        }];
        rootKind = "multi-select";
      } else if (decisionStep === "equipment") {
        const labels = voteOptionLabels("choose-one", decisionOptions);
        if (!decisionQuestion.trim() || labels.length < 2) return;
        questions = [{
          id: id("question"),
          text: decisionQuestion.trim(),
          kind: "choose-one",
          options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
        }];
        rootKind = "choose-one";
      } else {
        const validDrafts = decisionQuestionsDraft.map((draft) => {
          const labels = voteOptionLabels(draft.kind, draft.options);
          const max = draft.kind === "multi-select"
            ? Math.max(1, Math.min(labels.length, Number(draft.maxSelections) || labels.length))
            : undefined;
          return { draft, labels, max };
        });
        if (!validDrafts.length || validDrafts.some(({ draft, labels }) => !draft.text.trim() || labels.length < 2)) return;
        questions = validDrafts.map(({ draft, labels, max }) => ({
          id: id("question"),
          text: draft.text.trim(),
          kind: draft.kind,
          options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
          maxSelections: max,
        }));
        rootKind = questions.length === 1 ? questions[0].kind : "choose-one";
      }

      const primaryQuestion = questions[0];
      decision = {
        id: id("decision"),
        mode: "vote",
        kind: rootKind,
        decisionType: decisionStep,
        title: decisionTitle.trim() || undefined,
        question: decisionTitle.trim() || primaryQuestion.text,
        hostName: decisionStep === "schedule" ? scheduleHostName.trim() : undefined,
        questions,
        options: primaryQuestion.options,
        anonymous: decisionStep !== "schedule",
        hideParticipationUntilClosed: false,
        showResultsWhileOpen: false,
        status: "open",
        eligibleCount: selectedPeople.length || Math.max(1, eligibleVoterCount),
        participantEmails: selectedPeople.map((person) => person.email).filter((email): email is string => Boolean(email)),
        participantNames: selectedPeople.map((person) => person.name),
        sourcePlayerIds,
        maxSelections: primaryQuestion.maxSelections,
        voterHashes: [],
        ballots: [],
        createdAt: now,
        createdByName: currentActor.name,
      };
      activity = nowActivity("vote_started", currentActor.name, currentActor.email);
    }

    const category = card.category || (decisionStep === "players" ? "Membership" : decisionStep === "equipment" ? "Equipment" : undefined);
    const next: TaskBoardCard = {
      ...card,
      category,
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
    try { await persistCard(next); setDecisionCardId(null); setDecisionStep(null); setMobileFilter("deciding"); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not add decision."); }
    finally { setSaving(false); }
  };

  const closeVote = async (card: TaskBoardCard, decision: TaskBoardVote) => {
    if (decision.status !== "open") return;
    const now = Date.now();
    const nextDecisions = (card.decisions || []).map((item) =>
      item.id === decision.id ? { ...item, status: "closed" as const, closedAt: now, closedByName: currentActor.name } : item,
    );
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
    if (!card || !outcomeDecisionId) return;
    const nextDecisions = (card.decisions || []).map((decision) =>
      decision.id === outcomeDecisionId ? { ...decision, outcome: outcomeText.trim() || undefined } : decision,
    );
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
    if ((card.links?.length || 0) >= 5) return;
    setLinkCardId(card.id);
    setLinkUrl("");
    setLinkLabel("");
  };

  const addLink = async () => {
    const card = board.cards.find((item) => item.id === linkCardId);
    if (!card || !validHttpUrl(linkUrl) || (card.links?.length || 0) >= 5) return;
    const now = Date.now();
    const link: TaskBoardLink = {
      id: id("link"),
      url: linkUrl.trim(),
      label: linkLabel.trim() || providerLabel(linkUrl),
      createdAt: now,
      createdByName: currentActor.name,
    };
    const next: TaskBoardCard = {
      ...card,
      links: [...(card.links || []), link],
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("link_added", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setLinkCardId(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not add link."); }
    finally { setSaving(false); }
  };

  const removeLink = async (card: TaskBoardCard, linkId: string) => {
    const next = {
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
    if (latestOpenDecision(card)) return;
    setActionCardId(card.id);
    const hasHistory = Boolean((card.decisions?.length || 0) + (card.actions?.length || 0));
    setActionText(hasHistory ? "" : card.title);
    setActionPeopleKeys((card.people || []).map(personKey));
  };

  const addAction = async () => {
    const card = board.cards.find((item) => item.id === actionCardId);
    if (!card || !actionText.trim()) return;
    const now = Date.now();
    const assignees = peopleFromKeys(actionPeopleKeys);
    const action: TaskBoardActionItem = {
      id: id("action"),
      text: actionText.trim(),
      status: "open",
      assignees,
      assignee: assignees[0]?.name,
      assigneeEmail: assignees[0]?.email,
      createdAt: now,
      createdByName: currentActor.name,
    };
    const next: TaskBoardCard = {
      ...card,
      completedAt: undefined,
      completedByName: undefined,
      completedByEmail: undefined,
      actions: [...(card.actions || []), action],
      actionText: action.text,
      assignee: assignees[0]?.name,
      assigneeEmail: assignees[0]?.email,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("action_defined", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setActionCardId(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not add action."); }
    finally { setSaving(false); }
  };

  const updateAction = async (
    card: TaskBoardCard,
    actionId: string,
    patch: Partial<TaskBoardActionItem>,
    activity: TaskBoardActivity["action"],
  ) => {
    const nextActions = (card.actions || []).map((action) => action.id === actionId ? { ...action, ...patch } : action);
    const nextOpen = [...nextActions].reverse().find((action) => action.status === "open");
    const nextPeople = actionPeople(nextOpen);
    const next: TaskBoardCard = {
      ...card,
      actions: nextActions,
      actionText: nextOpen?.text,
      assignee: nextPeople[0]?.name,
      assigneeEmail: nextPeople[0]?.email,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity(activity, currentActor.name, currentActor.email)].slice(-30),
    };
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not update action."); }
  };

  const isMine = (action: TaskBoardActionItem) => {
    const people = actionPeople(action);
    const myKey = personKey(currentActor);
    return people.some((person) => personKey(person) === myKey);
  };

  const joinAction = (card: TaskBoardCard, action: TaskBoardActionItem) => {
    const people = normalizePeople([...actionPeople(action), currentActor]);
    return updateAction(card, action.id, {
      assignees: people,
      assignee: people[0]?.name,
      assigneeEmail: people[0]?.email,
    }, "claimed");
  };

  const releaseAction = (card: TaskBoardCard, action: TaskBoardActionItem) => {
    const myKey = personKey(currentActor);
    const people = actionPeople(action).filter((person) => personKey(person) !== myKey);
    return updateAction(card, action.id, {
      assignees: people,
      assignee: people[0]?.name,
      assigneeEmail: people[0]?.email,
    }, "released");
  };

  const completeAction = (card: TaskBoardCard, action: TaskBoardActionItem) => updateAction(card, action.id, {
    status: "done",
    completedAt: Date.now(),
    completedByName: currentActor.name,
    completedByEmail: currentActor.email,
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
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not finish topic."); }
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

  const canCurrentUserVote = (decision: TaskBoardVote) => {
    if (!decision.participantEmails?.length || !currentActor.email) return true;
    return decision.participantEmails.some((email) => email.toLowerCase() === currentActor.email?.toLowerCase());
  };

  const openVoteDialog = (card: TaskBoardCard, decision: TaskBoardVote) => {
    if (!canCurrentUserVote(decision)) return;
    setVotingCardId(card.id);
    setVotingDecisionId(decision.id || "");
    const existing = decision.ballots?.find((ballot) => ballot.voterHash === currentVoterHash);
    const questions = decisionQuestions(decision);
    const existingAnswers = existing?.answers?.length
      ? existing.answers
      : existing?.optionIds?.length && questions[0]
        ? [{ questionId: questions[0].id, optionIds: existing.optionIds }]
        : [];
    setSelectedVoteAnswers(Object.fromEntries(existingAnswers.map((answer) => [answer.questionId, answer.optionIds])));
  };

  const votingCard = board.cards.find((card) => card.id === votingCardId);
  const votingDecision = votingCard?.decisions?.find((decision) => decision.id === votingDecisionId);

  const toggleVoteOption = (question: TaskBoardDecisionQuestion, optionId: string) => {
    setSelectedVoteAnswers((current) => {
      const selected = current[question.id] || [];
      if (question.kind !== "multi-select") return { ...current, [question.id]: [optionId] };
      if (selected.includes(optionId)) return { ...current, [question.id]: selected.filter((idValue) => idValue !== optionId) };
      const max = question.maxSelections || question.options.length;
      if (selected.length >= max) return current;
      return { ...current, [question.id]: [...selected, optionId] };
    });
  };

  const submitVote = async () => {
    if (!votingCard || !votingDecision || !votingDecisionId || !currentVoterHash) return;
    const questions = decisionQuestions(votingDecision);
    const answers: TaskBoardVoteAnswer[] = questions.map((question) => ({
      questionId: question.id,
      optionIds: selectedVoteAnswers[question.id] || [],
    }));
    if (!questions.length || answers.some((answer) => !answer.optionIds.length)) return;
    setVoteSubmitting(true); setError("");
    try {
      if (online) {
        await castTaskBoardVote(scopeId!, votingCard.id, votingDecisionId, currentVoterHash, currentActor.name, answers);
      } else {
        const ballots = [...(votingDecision.ballots || [])];
        const existingIndex = ballots.findIndex((ballot) => ballot.voterHash === currentVoterHash);
        const previousAnswers = existingIndex >= 0
          ? ballots[existingIndex].answers?.length
            ? ballots[existingIndex].answers!
            : [{ questionId: questions[0].id, optionIds: ballots[existingIndex].optionIds }]
          : [];
        const nextQuestions = questions.map((question) => {
          const previousIds = previousAnswers.find((answer) => answer.questionId === question.id)?.optionIds || [];
          const nextIds = answers.find((answer) => answer.questionId === question.id)?.optionIds || [];
          return {
            ...question,
            options: question.options.map((option) => ({
              ...option,
              count: Math.max(0, option.count - (previousIds.includes(option.id) ? 1 : 0)) + (nextIds.includes(option.id) ? 1 : 0),
            })),
          };
        });
        const nextBallot = { voterHash: currentVoterHash, optionIds: answers[0]?.optionIds || [], answers };
        if (existingIndex >= 0) ballots[existingIndex] = nextBallot;
        else ballots.push(nextBallot);
        const nextDecisions = (votingCard.decisions || []).map((decision) =>
          decision.id === votingDecisionId
            ? { ...decision, questions: nextQuestions, options: nextQuestions[0]?.options || decision.options, ballots, voterHashes: ballots.map((ballot) => ballot.voterHash) }
            : decision,
        );
        await persistCard({ ...votingCard, decisions: nextDecisions, vote: nextDecisions[nextDecisions.length - 1], updatedAt: Date.now() });
      }
      setVotingCardId(null); setVotingDecisionId(null); setSelectedVoteAnswers({});
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not record vote.");
    } finally { setVoteSubmitting(false); }
  };

  const saveBoardNameValue = async (value: string) => {
    const current = board.meta || { name: rosterName };
    const customName = value.trim() || undefined;
    if ((current.customName?.trim() || undefined) === customName) return;
    const next: TaskBoardMeta = {
      ...current,
      name: current.name || rosterName,
      customName,
      updatedAt: Date.now(),
      updatedByName: currentActor.name,
    };
    try {
      await persistMeta(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not rename board.");
    }
  };

  const changeBoardName = (value: string) => {
    setBoardNameDraft(value);
    setError("");
    if (boardNameSaveTimerRef.current !== null) window.clearTimeout(boardNameSaveTimerRef.current);
    boardNameSaveTimerRef.current = window.setTimeout(() => {
      boardNameSaveTimerRef.current = null;
      void saveBoardNameValue(value);
    }, 500);
  };

  const filteredPlayers = useMemo(() => {
    const needle = playerSearch.trim().toLowerCase();
    return players
      .filter((player) => !needle || player.name.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [playerSearch, players]);

  const updateDraftQuestion = (questionId: string, patch: Partial<DraftQuestion>) => {
    setDecisionQuestionsDraft((current) => current.map((question) => question.id === questionId ? { ...question, ...patch } : question));
  };

  const updateScheduleDate = (groupId: string, patch: Partial<ScheduleDateGroup>) => {
    setScheduleDates((current) => current.map((group) => group.id === groupId ? { ...group, ...patch } : group));
  };

  const renderPeoplePicker = (
    selectedKeys: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    label = "People",
  ) => (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {availablePeople.map((person) => {
          const key = personKey(person);
          const selected = selectedKeys.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={`rounded-full px-2.5 py-1.5 text-[11px] font-black ring-1 ${selected ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-white text-slate-500 ring-slate-200"}`}
              onClick={() => togglePersonKey(key, setter)}
            >
              {selected && <Check className="mr-1 inline h-3 w-3" />}{person.name}
            </button>
          );
        })}
        {!availablePeople.length && <span className="text-[11px] font-semibold text-slate-400">No other organizers available.</span>}
      </div>
    </div>
  );

  const renderDecision = (
    card: TaskBoardCard,
    decision: TaskBoardVote,
    index: number,
    isCurrent: boolean,
    entryKey: string,
  ) => {
    const open = decision.status === "open" && decision.mode !== "recorded";
    const totalVoters = voteTotal(decision);
    const canVote = open && canCurrentUserVote(decision);
    const questions = decisionQuestions(decision);
    const heading = decision.title?.trim() || (questions.length === 1 ? questions[0].text : "Multiple questions");
    const historyExpanded = expandedHistoryIds.has(entryKey);

    const results = (
      <div className="space-y-3">
        {questions.map((question, questionIndex) => (
          <div key={question.id} className={questions.length > 1 ? "rounded-xl bg-slate-50 p-2.5" : ""}>
            {questions.length > 1 && <div className="mb-2 text-xs font-black leading-snug text-[#102A43]">{questionIndex + 1}. {question.text}</div>}
            <div className="grid gap-1.5">
              {question.options.map((option) => {
                const denominator = question.kind === "multi-select" ? Math.max(1, totalVoters) : Math.max(1, question.options.reduce((sum, item) => sum + item.count, 0));
                const percent = Math.round((option.count / denominator) * 100);
                const responderNames = decision.kind === "schedule"
                  ? (decision.ballots || []).filter((ballot) => {
                    const answer = ballot.answers?.find((item) => item.questionId === question.id);
                    return (answer?.optionIds || ballot.optionIds || []).includes(option.id);
                  }).map((ballot) => ballot.voterName).filter(Boolean) as string[]
                  : [];
                return (
                  <div key={option.id} className="rounded-xl bg-white px-2.5 py-2 ring-1 ring-slate-100">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <span className="min-w-0 flex-1 break-words">{option.label}</span>
                      <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 font-black text-[#102A43] ring-1 ring-slate-200">{option.count}</span>
                      {question.kind !== "multi-select" && <span className="w-8 text-right text-[10px] text-slate-400">{percent}%</span>}
                    </div>
                    {responderNames.length > 0 && <div className="mt-1 text-[10px] font-bold text-sky-700">{responderNames.join(" · ")}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {decision.outcome && <button type="button" className="w-full rounded-xl bg-emerald-50 px-3 py-2 text-left text-[11px] font-bold text-emerald-800" onClick={() => openOutcome(card, decision)}><span className="font-black">Note:</span> {decision.outcome}</button>}
        {!decision.outcome && !open && <button type="button" className="px-1 text-[10px] font-black text-slate-400 hover:text-slate-600" onClick={() => openOutcome(card, decision)}>+ Add note</button>}
      </div>
    );

    if (!isCurrent) {
      return (
        <div key={entryKey} className="relative pl-8">
          <div className={`absolute left-0 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border bg-white ${open ? "border-violet-200 text-violet-600" : "border-slate-200 text-slate-400"}`}>
            {open ? <Gavel className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </div>
          <button type="button" className="w-full rounded-xl bg-white/80 px-3 py-2.5 text-left ring-1 ring-slate-200/80 transition hover:bg-white" onClick={() => toggleHistoryExpanded(entryKey)}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400 lg:text-[10px]"><span>{decisionTypeLabel(decision)} · {decision.mode === "recorded" ? "recorded" : decision.status}</span>{decision.notification?.status === "sent" && <span className="inline-flex items-center gap-0.5 text-emerald-600" title={notificationSummary(decision.notification)}><Bell className="h-2.5 w-2.5 fill-emerald-100" /><Check className="h-2.5 w-2.5" /></span>}</div>
                <div className="mt-0.5 whitespace-normal break-words text-[12px] font-black leading-snug text-[#102A43] lg:text-[14px]">{heading}</div>
                <div className="mt-1 text-[9px] font-bold text-slate-400 lg:text-[10px]">{decisionHistoryMeta(decision)} · {historyExpanded ? "Hide details" : open ? "Open details" : "View result"}</div>
              </div>
              {historyExpanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
            </div>
          </button>
          {historyExpanded && <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
            {decision.hostName && <div className="mb-1 text-[10px] font-bold text-slate-500">Host: <span className="font-black text-slate-700">{decision.hostName}</span></div>}
            {decision.participantNames?.length ? <div className="mb-2 text-[10px] font-bold text-slate-500"><Users className="mr-1 inline h-3 w-3" />{personSummary(decision.participantNames.map((name) => ({ name })))}</div> : null}
            {decision.mode === "recorded" ? (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Check className="mr-1 inline h-3.5 w-3.5" />{decision.outcome}</div>
            ) : open ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-[10px] font-bold text-slate-500">{totalVoters}{decision.eligibleCount ? ` of ${decision.eligibleCount}` : ""} responded</span>
                {canVote ? <button type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white" onClick={() => openVoteDialog(card, decision)}>{decision.kind === "schedule" ? "Availability" : "Vote"}</button> : <span className="text-[10px] font-black text-slate-400">Not asking you</span>}
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500" onClick={() => void closeVote(card, decision)}>Close</button>
              </div>
            ) : results}
          </div>}
        </div>
      );
    }

    const currentLabel = decision.mode === "recorded"
      ? "Decision recorded"
      : open
        ? decision.decisionType === "schedule" || decision.kind === "schedule" ? "Current schedule" : "Current decision"
        : "Decision complete";

    return (
      <div key={entryKey} className="relative pl-8">
        <div className={`absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white ${open ? "border-violet-500 text-violet-700" : "border-emerald-400 text-emerald-700"}`}>
          {open ? <Gavel className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </div>
        <div className={`rounded-2xl border p-3 ${open ? "border-violet-200 bg-violet-50/65" : "border-emerald-100 bg-white"}`}>
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400 lg:text-[10px]"><span>{currentLabel}</span>{decision.notification?.status === "sent" && <span className="inline-flex items-center gap-0.5 text-emerald-600" title={notificationSummary(decision.notification)}><Bell className="h-2.5 w-2.5 fill-emerald-100" /><Check className="h-2.5 w-2.5" /></span>}</div>
          <div className="mt-1 whitespace-normal break-words text-sm font-black leading-snug text-[#102A43] lg:text-base">{heading}</div>
          {decision.hostName && <div className="mt-1 text-[10px] font-bold text-slate-500">Host: <span className="font-black text-slate-700">{decision.hostName}</span></div>}
          {decision.participantNames?.length ? <div className="mt-1 text-[10px] font-bold text-slate-500"><Users className="mr-1 inline h-3 w-3" />{personSummary(decision.participantNames.map((name) => ({ name })))}</div> : null}

          {decision.mode === "recorded" ? (
            <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Check className="mr-1 inline h-3.5 w-3.5" />{decision.outcome}</div>
          ) : open ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-auto text-[10px] font-bold text-slate-500">{totalVoters}{decision.eligibleCount ? ` of ${decision.eligibleCount}` : ""} responded</span>
              {canVote ? <button type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white" onClick={() => openVoteDialog(card, decision)}>{decision.kind === "schedule" ? "Availability" : "Vote"}</button> : <span className="text-[10px] font-black text-slate-400">Not asking you</span>}
              <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500" onClick={() => void closeVote(card, decision)}>Close</button>
            </div>
          ) : <div className="mt-3">{results}</div>}
        </div>
      </div>
    );
  };

  const renderAction = (
    card: TaskBoardCard,
    action: TaskBoardActionItem,
    index: number,
    isCurrent: boolean,
    entryKey: string,
    resumed = false,
    waitingOnDecision = false,
  ) => {
    const open = action.status === "open";
    const mine = isMine(action);
    const assignees = actionPeople(action);

    if (!isCurrent) {
      return (
        <div key={entryKey} className="relative pl-8">
          <div className={`absolute left-0 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border bg-white ${open ? "border-sky-200 text-sky-600" : "border-slate-200 text-slate-400"}`}>
            {open ? <Hand className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-slate-200/80">
            <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400 lg:text-[10px]"><span>Action · {open ? waitingOnDecision ? "waiting on decision" : "open" : "done"}</span>{action.notification?.status === "sent" && <span className="inline-flex items-center gap-0.5 text-emerald-600" title={notificationSummary(action.notification)}><Bell className="h-2.5 w-2.5 fill-emerald-100" /><Check className="h-2.5 w-2.5" /></span>}</div>
            <div className="mt-0.5 whitespace-normal break-words text-[12px] font-black leading-snug text-[#102A43] lg:text-[14px]">{action.text}</div>
            {assignees.length > 0 && <div className="mt-1 text-[9px] font-bold text-slate-500"><Users className="mr-1 inline h-3 w-3" />{personSummary(assignees)}</div>}
            {!open && <div className="mt-1 text-[9px] font-bold text-emerald-700">Completed{action.completedByName ? ` by ${action.completedByName}` : ""}</div>}
          </div>
        </div>
      );
    }

    return (
      <div key={entryKey} className="relative pl-8">
        <div className={`absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white ${open ? "border-sky-500 text-sky-700" : "border-emerald-400 text-emerald-700"}`}>
          {open ? <Hand className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </div>
        <div className={`rounded-2xl border p-3 ${open ? "border-sky-200 bg-sky-50/65" : "border-emerald-100 bg-white"}`}>
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400 lg:text-[10px]"><span>{open ? resumed ? "Current action · resumed" : "Current action" : "Action complete"}</span>{action.notification?.status === "sent" && <span className="inline-flex items-center gap-0.5 text-emerald-600" title={notificationSummary(action.notification)}><Bell className="h-2.5 w-2.5 fill-emerald-100" /><Check className="h-2.5 w-2.5" /></span>}</div>
          <div className="mt-1 whitespace-normal break-words text-sm font-black leading-snug text-[#102A43] lg:text-base">{action.text}</div>
          {assignees.length > 0 && <div className="mt-1 text-[10px] font-black text-sky-800"><Users className="mr-1 inline h-3 w-3" />{personSummary(assignees)}</div>}
          {open ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {!mine && <button type="button" className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-black text-white" onClick={() => void joinAction(card, action)}><Hand className="mr-1 inline h-3.5 w-3.5" />{assignees.length ? "Join" : "I’ll handle it"}</button>}
              {mine && <button type="button" className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white" onClick={() => void completeAction(card, action)}><Check className="mr-1 inline h-3.5 w-3.5" />Done</button>}
              {mine && assignees.length > 1 && <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500" onClick={() => void releaseAction(card, action)}><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Leave</button>}
              {!assignees.length && <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600" onClick={() => void completeAction(card, action)}>Already done</button>}
            </div>
          ) : <div className="mt-2 text-xs font-black text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Completed{action.completedByName ? ` by ${action.completedByName}` : ""}</div>}
        </div>
      </div>
    );
  };

  const renderTimeline = (card: TaskBoardCard) => {
    const entries = timelineEntries(card);
    const currentKey = currentTimelineKey(card);
    const currentEntry = currentKey ? entries.find((entry) => entry.key === currentKey) : undefined;
    const historyEntries = currentEntry ? entries.filter((entry) => entry.key !== currentEntry.key) : entries;
    const currentIsDecision = currentEntry?.kind === "decision";
    const currentActionResumed = currentEntry?.kind === "action" && historyEntries.some((entry) => entry.createdAt > currentEntry.createdAt);

    if (!entries.length) return null;

    return (
      <div className="relative">
        <div className="absolute bottom-4 left-[13px] top-4 w-px bg-slate-200" aria-hidden="true" />
        <div className="relative space-y-2">
          {historyEntries.map((entry) => entry.kind === "decision"
            ? renderDecision(card, entry.decision, entry.index, false, entry.key)
            : renderAction(card, entry.action, entry.index, false, entry.key, false, Boolean(currentIsDecision && entry.action.status === "open")))}
          {currentEntry && (currentEntry.kind === "decision"
            ? renderDecision(card, currentEntry.decision, currentEntry.index, true, currentEntry.key)
            : renderAction(card, currentEntry.action, currentEntry.index, true, currentEntry.key, currentActionResumed))}
        </div>
      </div>
    );
  };

  const renderCard = (card: TaskBoardCard, compact = false) => {
    const stage = topicStage(card);
    const expanded = expandedIds.has(card.id);
    const openDecision = latestOpenDecision(card);
    const openAction = latestOpenAction(card);
    const decisions = card.decisions || [];
    const actions = card.actions || [];
    const need = currentNeed(card);
    const displayPeople = card.people?.length ? card.people : actionPeople(openAction);
    const cardNotifyTarget = currentNotifyTarget(card);
    const cardNotification = cardNotifyTarget?.notification;
    const cardNotificationSent = cardNotification?.status === "sent";
    const cardNotificationQueued = cardNotification?.status === "queued";
    const stageStyle = stage === "deciding"
      ? "border-violet-200"
      : stage === "action"
        ? "border-sky-200"
        : stage === "done"
          ? "border-slate-200 bg-slate-50/70"
          : "border-slate-200";

    return (
      <article key={card.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${stageStyle} ${compact ? "" : "lg:rounded-[1.35rem]"}`}>
        <div className="p-3">
          <div className="flex items-start gap-2">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggleExpanded(card.id)}>
              <div className="flex flex-wrap items-center gap-1.5">
                {card.category && <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ring-1 lg:px-2.5 lg:py-1 lg:text-[10px] ${tagTone(card.category)}`}>{card.category}</span>}
                {displayPeople?.length ? <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600 lg:px-2.5 lg:py-1 lg:text-[10px]"><Users className="h-3 w-3 shrink-0" /><span className="truncate">{personSummary(displayPeople)}</span></span> : null}
                {card.dueDate && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black lg:px-2.5 lg:py-1 lg:text-[10px] ${isOverdue(card.dueDate) && stage !== "done" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}><CalendarDays className="h-3 w-3" />{dueText(card.dueDate)}</span>}
              </div>
              <h3 className="mt-2 whitespace-normal break-words text-[14px] font-black leading-snug text-[#102A43] lg:text-[17px] lg:leading-snug">{card.title}</h3>
              {need && !expanded && <div className={`mt-2 whitespace-normal break-words text-[11px] font-black leading-snug lg:text-[13px] ${stage === "deciding" ? "text-violet-700" : stage === "action" ? "text-sky-800" : stage === "done" ? "text-slate-500" : "text-slate-600"}`}>
                {stage === "deciding" && <Gavel className="mr-1 inline h-3.5 w-3.5" />}
                {stage === "action" && <Hand className="mr-1 inline h-3.5 w-3.5" />}
                {stage === "done" && <Check className="mr-1 inline h-3.5 w-3.5" />}
                {need}
              </div>}
              {openDecision && !expanded && <div className="mt-1 text-[9px] font-bold text-slate-400 lg:text-[11px]">{voteTotal(openDecision)}{openDecision.eligibleCount ? ` of ${openDecision.eligibleCount}` : ""} responded</div>}
            </button>
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              {online && cardNotifyTarget && (
                cardNotificationSent ? (
                  <span
                    className="relative rounded-full bg-emerald-50 p-1.5 text-emerald-700"
                    title={notificationSummary(cardNotification)}
                    aria-label={notificationSummary(cardNotification) || "Notified"}
                  >
                    <Bell className="h-3.5 w-3.5 fill-emerald-100" />
                    <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-2 w-2" /></span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`rounded-full p-1.5 ${cardNotificationQueued ? "cursor-wait bg-amber-50 text-amber-600" : "text-slate-400 hover:bg-amber-50 hover:text-amber-700"}`}
                    onClick={() => openNotify(card)}
                    disabled={cardNotificationQueued}
                    aria-label={cardNotificationQueued ? "Notification is being sent" : `Notify organizers about ${cardNotifyTarget.label.toLowerCase()}`}
                    title={cardNotificationQueued ? "Sending notification…" : "Notify organizers"}
                  >
                    <Bell className={`h-3.5 w-3.5 ${cardNotificationQueued ? "animate-pulse" : ""}`} />
                  </button>
                )
              )}
              <button type="button" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50" onClick={() => openEditCard(card)} aria-label={`Edit ${card.title}`}><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50" onClick={() => toggleExpanded(card.id)} aria-label={expanded ? "Collapse topic" : "Expand topic"}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
            </div>
          </div>
        </div>

        {expanded && <div className="border-t border-slate-100 bg-slate-50/35 px-3 pb-3 pt-3">
          {card.note?.trim() && <p className="mb-3 whitespace-pre-wrap break-words text-xs font-semibold leading-relaxed text-slate-500 lg:text-sm">{card.note.trim()}</p>}

          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {card.links?.map((link) => <div key={link.id} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 ring-1 ring-slate-200"><a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-[15rem] items-center gap-1.5 text-[10px] font-black text-slate-600 lg:text-xs"><Link2 className="h-3 w-3 shrink-0 text-slate-400" /><span className="truncate">{link.label}</span><ExternalLink className="h-3 w-3 shrink-0 text-slate-400" /></a><button type="button" className="rounded-full p-0.5 text-slate-300 hover:text-red-600" onClick={() => void removeLink(card, link.id)} aria-label={`Remove ${link.label}`}><Trash2 className="h-3 w-3" /></button></div>)}
            {stage !== "done" && (card.links?.length || 0) < 5 && <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-black text-slate-400 lg:text-xs hover:bg-white hover:text-slate-600" onClick={() => openAddLink(card)}><Link2 className="h-3 w-3" />+ Link</button>}
          </div>

          {(decisions.length > 0 || actions.length > 0) ? renderTimeline(card) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 px-3 py-5 text-center">
              <div className="text-xs font-black text-[#102A43] lg:text-sm">What does this need?</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-400 lg:text-xs">Start a decision or add an action when the topic is ready.</div>
            </div>
          )}

          <div className="mt-3 border-t border-slate-200 pt-3">
            {stage === "done" ? (
              <button type="button" className="rounded-xl bg-white px-3 py-2 text-[11px] font-black text-slate-600 ring-1 ring-slate-200" onClick={() => void reopenTopic(card)}><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Reopen</button>
            ) : openDecision ? null : openAction ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[9px] font-black uppercase tracking-wide text-slate-400">Need a decision first?</span>
                <button type="button" className="rounded-xl bg-white px-3 py-2 text-[11px] font-black text-violet-700 ring-1 ring-violet-100" onClick={() => startDecision(card)}><Gavel className="mr-1 inline h-3.5 w-3.5" />+ Decision</button>
              </div>
            ) : (
              <div>
                {(decisions.length > 0 || actions.length > 0) && <div className="mb-2 text-[9px] font-black uppercase tracking-wide text-slate-400">What next?</div>}
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 ring-1 ring-violet-100" onClick={() => startDecision(card)}><Gavel className="mr-1 inline h-3.5 w-3.5" />{decisions.length || actions.length ? "+ Decision" : "Decide"}</button>
                  <button type="button" className="rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-800 ring-1 ring-sky-100" onClick={() => openAddAction(card)}><Hand className="mr-1 inline h-3.5 w-3.5" />{decisions.length || actions.length ? "+ Action" : "Action"}</button>
                  {(decisions.length > 0 || actions.length > 0) && <button type="button" className="ml-auto rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white" onClick={() => void finishTopic(card)}><Check className="mr-1 inline h-3.5 w-3.5" />Done</button>}
                </div>
              </div>
            )}
          </div>
        </div>}
      </article>
    );
  };

  const boardColumn = (stage: TopicStage, title: string, Icon: React.ComponentType<{ className?: string }>) => (
    <section className={`min-w-0 rounded-[1.35rem] border p-2.5 ${stage === "deciding" ? "border-violet-200 bg-violet-50/35" : stage === "action" ? "border-sky-200 bg-sky-50/35" : stage === "done" ? "border-slate-200 bg-slate-100/50" : "border-slate-200 bg-white/55"}`}>
      <div className={`mb-2 flex items-center gap-1.5 px-1 text-xs font-black lg:text-[14px] ${stage === "deciding" ? "text-violet-700" : stage === "action" ? "text-sky-800" : stage === "done" ? "text-slate-500" : "text-slate-700"}`}><Icon className="h-4 w-4 lg:h-[18px] lg:w-[18px]" /><span>{title}</span><span className="ml-0.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] lg:px-2 lg:text-[10px] font-black text-slate-500 ring-1 ring-slate-200/70">{cardsByStage[stage].length}</span></div>
      <div className="space-y-2">
        {cardsByStage[stage].map((card) => renderCard(card, true))}
        {cardsByStage[stage].length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-2 py-5 text-center text-[10px] font-bold text-slate-400 lg:text-xs">Nothing here</div>}
      </div>
    </section>
  );

  const customBoardName = board.meta?.customName?.trim();
  const decisionSetupCard = board.cards.find((card) => card.id === decisionCardId);
  const decisionPhaseNameRequired = Boolean(decisionSetupCard && ((decisionSetupCard.decisions?.length || 0) + (decisionSetupCard.actions?.length || 0)));
  const decisionPhaseNameValid = !decisionPhaseNameRequired || Boolean(decisionTitle.trim());
  const genericQuestionsValid = decisionQuestionsDraft.length > 0 && decisionQuestionsDraft.every((draft) => {
    const labels = voteOptionLabels(draft.kind, draft.options);
    return Boolean(draft.text.trim()) && labels.length >= 2;
  });
  const scheduleOptionsCount = scheduleSlotValues(scheduleDates).length;
  const decisionSetupValid = decisionMode === "recorded"
    ? decisionPhaseNameValid && Boolean(decisionOutcome.trim())
    : decisionStep === "schedule"
      ? decisionPhaseNameValid && Boolean(scheduleHostName.trim()) && decisionPeopleKeys.length > 0 && scheduleOptionsCount >= 2
      : decisionStep === "players"
        ? decisionPhaseNameValid && Boolean(decisionQuestion.trim()) && selectedPlayerIds.length >= 2
        : decisionStep === "equipment"
          ? decisionPhaseNameValid && Boolean(decisionQuestion.trim()) && voteOptionLabels("choose-one", decisionOptions).length >= 2
          : decisionStep === "vote"
            ? decisionPhaseNameValid && genericQuestionsValid
            : false;

  return (
    <>
      <section className="rounded-[1.7rem] border p-3 shadow-sm lg:p-4" style={{ borderColor: mixHex(accent, "#ffffff", 0.72), background }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide lg:text-[20px] lg:normal-case lg:tracking-normal" style={{ color: accent }}>
              <ClipboardList className="fairteams-desktop-balanced-icon h-[18px] w-[18px] lg:h-6 lg:w-6" /> Action Board
            </div>
            {customBoardName && <div className="mt-1 truncate text-[12px] font-bold leading-tight text-slate-600 lg:text-[14px]">{customBoardName}</div>}
          </div>
          <Button type="button" className="h-9 shrink-0 rounded-2xl px-3 text-xs font-black text-white lg:text-sm" style={{ backgroundColor: accent }} onClick={openBoard}>Open</Button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] font-black text-slate-600 lg:text-xs">
          {hasNewActivity && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />New activity</span>}
          <span className="rounded-full bg-white/75 px-2.5 py-1">{online ? "Shared" : isSharedRoster ? "Sign in" : "Private"}</span>
        </div>
        {latestActivity && <div className="mt-2 truncate text-[10px] font-bold text-slate-500 lg:text-xs">Last: “{latestActivity.card.title}” · {activityText(latestActivity.activity)}</div>}
      </section>

      <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
        <DialogContent className="fixed inset-x-2 inset-y-3 flex h-[calc(100dvh-1.5rem)] max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[1.8rem] border border-white/70 bg-white p-0 shadow-2xl sm:inset-3 sm:h-[calc(100dvh-1.5rem)] sm:w-auto sm:rounded-[2rem] lg:inset-6 lg:h-[calc(100dvh-3rem)] lg:rounded-[2rem]">
          <DialogHeader className="shrink-0 border-b border-white/45 px-3 py-3 pr-12 text-left lg:px-5 lg:py-4 lg:pr-14" style={{ backgroundColor: mixHex(accent, "#ffffff", 0.7) }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle className="text-base font-black text-[#102A43] lg:text-[22px] lg:leading-tight">Action Board</DialogTitle>
                {customBoardName && <p className="mt-0.5 truncate text-[11px] font-black text-slate-600 lg:text-[13px]">{customBoardName}</p>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 rounded-2xl bg-white/80 p-0 lg:h-11 lg:w-11"
                  onClick={() => {
                    setNotifyError("");
                    setBoardNameDraft(customBoardName || "");
                    setBoardSettingsOpen(true);
                    void getPhoneNotificationStatus().then(setPhoneStatus);
                  }}
                  aria-label="Board settings"
                  title="Board settings"
                >
                  <Settings className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
                </Button>
                <Button type="button" className="h-9 w-9 rounded-2xl p-0 font-black text-white lg:h-11 lg:w-11" style={{ backgroundColor: accent }} onClick={() => { resetNewTopic(); setNewTopicOpen(true); }} aria-label="New topic"><Plus className="h-4 w-4 lg:h-5 lg:w-5" /></Button>
              </div>
            </div>
          </DialogHeader>

          <div className="shrink-0 border-b border-slate-200/70 bg-white/90 px-3 py-2 lg:hidden">
            <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
              {([
                ["ideas", "Ideas", Lightbulb],
                ["deciding", "Decide", Gavel],
                ["action", "Action", Hand],
                ["done", "Done", Check],
              ] as Array<[MobileFilter, string, React.ComponentType<{ className?: string }>]>).map(([item, label, Icon]) => (
                <button key={item} type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-black transition ${mobileFilter === item ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setMobileFilter(item)}><Icon className="h-3.5 w-3.5" /><span>{label}</span><span className={`min-w-[18px] rounded-full px-1 py-0.5 text-[9px] ${mobileFilter === item ? "bg-slate-100 text-slate-600" : "bg-white/70 text-slate-400"}`}>{cardsByStage[item].length}</span></button>
              ))}
            </div>
          </div>

          {error && <div className="mx-3 mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 lg:mx-5">{error}</div>}

          <div className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: background }}>
            {loading ? <div className="p-8 text-center text-sm font-black text-slate-500">Loading Action Board…</div> : board.cards.length === 0 ? (
              <EmptyActionBoard onCreate={() => { resetNewTopic(); setNewTopicOpen(true); }} />
            ) : (
              <>
                <div className="px-3 py-3 pb-20 lg:hidden">
                  <div className="space-y-2">{cardsByStage[mobileFilter].map((card) => renderCard(card))}</div>
                  {cardsByStage[mobileFilter].length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white/50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nothing here right now.</div>}
                </div>
                <div className="hidden w-full grid-cols-4 gap-3 p-4 pb-16 lg:grid xl:gap-4 xl:p-5">
                  {boardColumn("ideas", "Ideas", Lightbulb)}
                  {boardColumn("deciding", "Decide", Gavel)}
                  {boardColumn("action", "Action", Hand)}
                  {boardColumn("done", "Done", Check)}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newTopicOpen} onOpenChange={(open) => { setNewTopicOpen(open); if (!open) resetNewTopic(); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[88dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 lg:max-w-xl lg:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43] lg:text-xl">{newTopicKind ? (newTopicKind === "idea" ? "New idea" : newTopicKind === "decide" ? "New decision" : "New action") : "Create"}</DialogTitle></DialogHeader>
          {!newTopicKind ? (
            <div className="grid gap-2.5 lg:gap-3.5">
              <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:bg-slate-50 lg:p-5" onClick={() => setNewTopicKind("idea")}>
                <div className="flex items-start gap-3 lg:gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 lg:h-12 lg:w-12 lg:rounded-2xl"><Lightbulb className="h-5 w-5 lg:h-6 lg:w-6" /></div><div><div className="text-sm font-black text-[#102A43] lg:text-base">Idea</div><div className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-sm">Save something worth thinking about later.</div><div className="mt-1 text-[10px] font-bold text-slate-400 lg:text-xs">Example: Club jerseys</div></div></div>
              </button>
              <button type="button" className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-left transition hover:bg-violet-50 lg:p-5" onClick={() => setNewTopicKind("decide")}>
                <div className="flex items-start gap-3 lg:gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 ring-1 ring-violet-100 lg:h-12 lg:w-12 lg:rounded-2xl"><Gavel className="h-5 w-5 lg:h-6 lg:w-6" /></div><div><div className="text-sm font-black text-[#102A43] lg:text-base">Decide</div><div className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-sm">Ask people to choose, schedule or agree on something.</div><div className="mt-1 text-[10px] font-bold text-slate-400 lg:text-xs">Example: Which players become members?</div></div></div>
              </button>
              <button type="button" className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left transition hover:bg-sky-50 lg:p-5" onClick={() => setNewTopicKind("action")}>
                <div className="flex items-start gap-3 lg:gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-800 ring-1 ring-sky-100 lg:h-12 lg:w-12 lg:rounded-2xl"><Hand className="h-5 w-5 lg:h-6 lg:w-6" /></div><div><div className="text-sm font-black text-[#102A43] lg:text-base">Action</div><div className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-sm">Something important needs to get done.</div><div className="mt-1 text-[10px] font-bold text-slate-400 lg:text-xs">Example: Contact the new members</div></div></div>
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              <button type="button" className="w-fit text-[11px] font-black text-slate-500 lg:text-sm" onClick={() => setNewTopicKind(null)}>← Back</button>
              <div>
                <Label htmlFor="topic-title">{newTopicKind === "idea" ? "What’s the idea?" : newTopicKind === "decide" ? "What are you deciding?" : "What needs to happen?"}</Label>
                <Textarea id="topic-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} rows={2} maxLength={220} placeholder={newTopicKind === "idea" ? "Club jerseys" : newTopicKind === "decide" ? "New club members" : "Contact the new members"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor="topic-tag"><Tag className="mr-1 inline h-3.5 w-3.5" />Tag</Label><select id="topic-tag" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}><option value="">None</option>{TAGS.map((item) => <option key={item}>{item}</option>)}</select></div>
                <div><Label htmlFor="topic-due"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />Due</Label><Input id="topic-due" type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></div>
              </div>
              {renderPeoplePicker(newPeopleKeys, setNewPeopleKeys)}
              <Button type="button" className="h-11 rounded-2xl font-black text-white lg:h-12 lg:text-base" style={{ backgroundColor: accent }} disabled={!newTitle.trim() || saving} onClick={() => void createTopic()}>{saving ? "Saving…" : newTopicKind === "idea" ? "Save idea" : newTopicKind === "decide" ? "Continue to decision" : "Create action"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(decisionCardId)} onOpenChange={(open) => { if (!open) { setDecisionCardId(null); setDecisionStep(null); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[90dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 lg:max-w-2xl lg:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43] lg:text-xl">{decisionStep ? "Set up decision" : "What kind of decision?"}</DialogTitle></DialogHeader>
          {!decisionStep ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("vote")}><Vote className="h-5 w-5 text-violet-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Vote</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">One or more questions</div></button>
              <button type="button" className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("schedule")}><CalendarDays className="h-5 w-5 text-sky-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Schedule</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">Find a time together</div></button>
              <button type="button" className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("players")}><Users className="h-5 w-5 text-emerald-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Players</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">Choose from roster</div></button>
              <button type="button" className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("equipment")}><ClipboardList className="h-5 w-5 text-amber-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Equipment</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">Compare options</div></button>
            </div>
          ) : (
            <div className="grid gap-3">
              <button type="button" className="w-fit text-[11px] font-black text-slate-500" onClick={() => setDecisionStep(null)}>← Change type</button>

              {decisionStep === "vote" && <div className="flex rounded-2xl bg-slate-100 p-1">
                <button type="button" className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${decisionMode === "vote" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDecisionMode("vote")}><Vote className="mr-1 inline h-3.5 w-3.5" />Vote together</button>
                <button type="button" className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${decisionMode === "recorded" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDecisionMode("recorded")}><Check className="mr-1 inline h-3.5 w-3.5" />Record decision</button>
              </div>}

              {decisionMode === "recorded" ? (
                <>
                  {decisionPhaseNameRequired && <div><Label htmlFor="decision-recorded-name">Decision name</Label><Input id="decision-recorded-name" value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} maxLength={120} placeholder="What is this next decision about?" /></div>}
                  <div><Label htmlFor="decision-outcome">What was decided?</Label><Textarea id="decision-outcome" value={decisionOutcome} onChange={(event) => setDecisionOutcome(event.target.value)} rows={3} maxLength={300} placeholder="We will buy the Select Brillant ball." /></div>
                </>
              ) : (
                <>
                  {decisionStep === "schedule" ? <>
                    <div>
                      <Label htmlFor="schedule-title">What are you scheduling? <span className="font-semibold text-slate-400">{decisionPhaseNameRequired ? "" : "optional"}</span></Label>
                      <Input id="schedule-title" value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} maxLength={120} placeholder={decisionSetupCard?.title || "e.g. Club desk tutorial"} />
                      {!decisionPhaseNameRequired && <div className="mt-1 text-[10px] font-semibold text-slate-400">Leave blank to use the topic name.</div>}
                    </div>
                    <div><Label htmlFor="schedule-host">Host</Label><Input id="schedule-host" value={scheduleHostName} onChange={(event) => setScheduleHostName(event.target.value)} maxLength={80} placeholder="e.g. Tanja" /></div>
                    {renderPeoplePicker(decisionPeopleKeys, setDecisionPeopleKeys, "Who needs to respond?")}
                    <div>
                      <Label>Possible dates & times</Label>
                      <div className="mt-1.5 grid gap-2">
                        {scheduleDates.map((group) => <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center gap-2">
                            <Input type="date" value={group.date} onChange={(event) => updateScheduleDate(group.id, { date: event.target.value })} />
                            <button type="button" className="rounded-xl border border-slate-200 p-2 text-slate-400" onClick={() => setScheduleDates((current) => current.filter((item) => item.id !== group.id))} disabled={scheduleDates.length <= 1} aria-label="Remove date"><Trash2 className="h-4 w-4" /></button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {group.times.map((time, timeIndex) => <div key={`${group.id}-${timeIndex}`} className="flex items-center gap-1">
                              <select className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold text-[#102A43]" value={time} onChange={(event) => updateScheduleDate(group.id, { times: group.times.map((item, index) => index === timeIndex ? event.target.value : item) })}>
                                <option value="">Time</option>
                                {TIME_CHOICES.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                              <button type="button" className="rounded-lg p-2 text-slate-400" onClick={() => updateScheduleDate(group.id, { times: group.times.filter((_, index) => index !== timeIndex) })} disabled={group.times.length <= 1} aria-label="Remove time"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>)}
                            <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-600" onClick={() => updateScheduleDate(group.id, { times: [...group.times, ""] })}>+ Time</button>
                          </div>
                        </div>)}
                      </div>
                      <button type="button" className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-600" onClick={() => setScheduleDates((current) => [...current, newScheduleDateGroup()])}>+ Date</button>
                    </div>
                  </> : <>
                    {decisionPhaseNameRequired && <div><Label htmlFor="decision-name">Decision name</Label><Input id="decision-name" value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} maxLength={120} placeholder="What is this next decision about?" /></div>}

                    {decisionStep === "vote" && <>
                      <div className="grid gap-2">
                        {decisionQuestionsDraft.map((draft, questionIndex) => <div key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={`decision-question-${draft.id}`}>Question {questionIndex + 1}</Label>
                            {decisionQuestionsDraft.length > 1 && <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setDecisionQuestionsDraft((current) => current.filter((item) => item.id !== draft.id))} aria-label={`Remove question ${questionIndex + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                          <Textarea id={`decision-question-${draft.id}`} className="mt-1" value={draft.text} onChange={(event) => updateDraftQuestion(draft.id, { text: event.target.value })} rows={2} maxLength={220} placeholder="What should people answer?" />
                          <div className="mt-2 flex rounded-2xl bg-violet-50 p-1">
                            <button type="button" className={`flex-1 rounded-xl px-2 py-2 text-[10px] font-black ${draft.kind === "yes-no-abstain" ? "bg-white text-violet-700 shadow-sm" : "text-violet-500"}`} onClick={() => updateDraftQuestion(draft.id, { kind: "yes-no-abstain" })}>Yes / No</button>
                            <button type="button" className={`flex-1 rounded-xl px-2 py-2 text-[10px] font-black ${draft.kind === "choose-one" ? "bg-white text-violet-700 shadow-sm" : "text-violet-500"}`} onClick={() => updateDraftQuestion(draft.id, { kind: "choose-one" })}>Choose one</button>
                            <button type="button" className={`flex-1 rounded-xl px-2 py-2 text-[10px] font-black ${draft.kind === "multi-select" ? "bg-white text-violet-700 shadow-sm" : "text-violet-500"}`} onClick={() => updateDraftQuestion(draft.id, { kind: "multi-select" })}>Choose several</button>
                          </div>
                          {draft.kind !== "yes-no-abstain" && <div className="mt-2"><Label htmlFor={`decision-options-${draft.id}`}>Choices — one per line</Label><Textarea id={`decision-options-${draft.id}`} className="mt-1" value={draft.options} onChange={(event) => updateDraftQuestion(draft.id, { options: event.target.value })} rows={3} maxLength={700} placeholder="Mauerpark\nTempelhofer Feld" /></div>}
                          {draft.kind === "multi-select" && <div className="mt-2"><Label htmlFor={`decision-max-${draft.id}`}>Maximum choices</Label><Input id={`decision-max-${draft.id}`} type="number" min="1" max="16" value={draft.maxSelections} onChange={(event) => updateDraftQuestion(draft.id, { maxSelections: event.target.value })} inputMode="numeric" /></div>}
                        </div>)}
                      </div>
                      <button type="button" className="w-fit rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 ring-1 ring-violet-100" onClick={() => setDecisionQuestionsDraft((current) => [...current, newDraftQuestion("")])}>+ Add question</button>
                      {renderPeoplePicker(decisionPeopleKeys, setDecisionPeopleKeys, "Who votes?")}
                    </>}

                    {decisionStep === "players" && <>
                      <div><Label htmlFor="decision-player-question">Question</Label><Textarea id="decision-player-question" value={decisionQuestion} onChange={(event) => setDecisionQuestion(event.target.value)} rows={2} maxLength={220} /></div>
                      <div><Label htmlFor="player-search">Players</Label><Input id="player-search" value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Search roster…" /><div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5">{filteredPlayers.map((player) => {
                        const selected = selectedPlayerIds.includes(player.id);
                        return <button key={player.id} type="button" className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-black ${selected ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => setSelectedPlayerIds((current) => current.includes(player.id) ? current.filter((value) => value !== player.id) : [...current, player.id])}><span className="truncate">{player.name}</span>{selected && <Check className="h-4 w-4" />}</button>;
                      })}{filteredPlayers.length === 0 && <div className="px-3 py-6 text-center text-xs font-semibold text-slate-400">No matching players.</div>}</div></div>
                      <div><Label htmlFor="decision-max">Maximum choices</Label><Input id="decision-max" type="number" min="1" max={Math.max(1, selectedPlayerIds.length)} value={decisionMaxSelections} onChange={(event) => setDecisionMaxSelections(event.target.value)} inputMode="numeric" /></div>
                      {renderPeoplePicker(decisionPeopleKeys, setDecisionPeopleKeys, "Who votes?")}
                    </>}

                    {decisionStep === "equipment" && <>
                      {equipmentItems.length > 0 && <div className="rounded-2xl bg-amber-50/70 px-3 py-2 text-[11px] font-semibold text-amber-800"><span className="font-black">Club inventory:</span> {equipmentItems.slice(0, 4).join(" · ")}{equipmentItems.length > 4 ? "…" : ""}</div>}
                      <div><Label htmlFor="decision-equipment-question">Question</Label><Textarea id="decision-equipment-question" value={decisionQuestion} onChange={(event) => setDecisionQuestion(event.target.value)} rows={2} maxLength={220} /></div>
                      <div><Label htmlFor="equipment-options">Options — one per line</Label><Textarea id="equipment-options" value={decisionOptions} onChange={(event) => setDecisionOptions(event.target.value)} rows={4} maxLength={700} placeholder="Select Brillant\nAdidas Tiro\nDerbystar" /></div>
                      <div className="text-[10px] font-semibold text-slate-500">Product and document links stay attached to the topic for comparison.</div>
                      {renderPeoplePicker(decisionPeopleKeys, setDecisionPeopleKeys, "Who votes?")}
                    </>}
                  </>}
                </>
              )}

              <Button
                type="button"
                className={`h-11 rounded-2xl font-black text-white ${decisionMode === "recorded" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-violet-600 hover:bg-violet-700"}`}
                disabled={saving || !decisionSetupValid}
                onClick={() => void addDecision()}
              >
                {saving ? "Saving…" : decisionMode === "recorded" ? "Record decision" : decisionStep === "schedule" ? "Open availability" : "Open vote"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkCardId)} onOpenChange={(open) => { if (!open) setLinkCardId(null); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Add link</DialogTitle></DialogHeader>
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
            <div><Label htmlFor="action-text">What needs to happen next?</Label><Textarea id="action-text" value={actionText} onChange={(event) => setActionText(event.target.value)} rows={2} maxLength={220} /></div>
            {renderPeoplePicker(actionPeopleKeys, setActionPeopleKeys, "Who handles this?")}
            <Button type="button" className="h-11 rounded-2xl bg-sky-700 font-black text-white hover:bg-sky-800" disabled={!actionText.trim() || saving} onClick={() => void addAction()}>{saving ? "Saving…" : "Add action"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(votingCard && votingDecision)} onOpenChange={(open) => { if (!open) { setVotingCardId(null); setVotingDecisionId(null); setSelectedVoteAnswers({}); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[90dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2">
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">{votingDecision?.kind === "schedule" ? "Your availability" : "Vote on FT"}</DialogTitle></DialogHeader>
          {votingDecision && <div className="grid gap-3">
            {votingDecision.title?.trim() && <div className="whitespace-normal break-words text-sm font-black leading-snug text-[#102A43]">{votingDecision.title}</div>}
            {votingDecision.hostName && <div className="rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800">Host: <span className="font-black">{votingDecision.hostName}</span></div>}
            <div className="grid gap-3">{decisionQuestions(votingDecision).map((question, questionIndex) => {
              const selectedIds = selectedVoteAnswers[question.id] || [];
              return <div key={question.id} className={decisionQuestions(votingDecision).length > 1 ? "rounded-2xl border border-slate-200 bg-white p-3" : ""}>
                <div className="whitespace-normal break-words text-sm font-black leading-snug text-[#102A43]">{decisionQuestions(votingDecision).length > 1 ? `${questionIndex + 1}. ` : ""}{question.text}</div>
                {question.kind === "multi-select" && <div className="mt-1 text-[10px] font-bold text-slate-500">{votingDecision.kind === "schedule" ? "Choose every time that works for you." : `Choose up to ${question.maxSelections || question.options.length}.`}</div>}
                <div className="mt-2 grid gap-2">{question.options.map((option) => {
                  const selected = selectedIds.includes(option.id);
                  return <button key={option.id} type="button" className={`rounded-2xl border px-3 py-3 text-left text-sm font-black ${selected ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-[#102A43]"}`} onClick={() => toggleVoteOption(question, option.id)}>{selected && <Check className="mr-1 inline h-4 w-4" />}{option.label}</button>;
                })}</div>
              </div>;
            })}</div>
            <div className="text-[10px] font-semibold leading-snug text-slate-500">{votingDecision.kind === "schedule" ? "Your availability is visible to the organizers in this schedule." : "Anonymous. You can change your answer while it remains open."}</div>
            <Button type="button" className="h-11 rounded-2xl bg-violet-600 font-black text-white" disabled={decisionQuestions(votingDecision).some((question) => !(selectedVoteAnswers[question.id] || []).length) || voteSubmitting} onClick={() => void submitVote()}>{voteSubmitting ? "Recording…" : votingDecision.ballots?.some((ballot) => ballot.voterHash === currentVoterHash) ? "Update" : "Submit"}</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(outcomeCardId && outcomeDecisionId)} onOpenChange={(open) => { if (!open) { setOutcomeCardId(null); setOutcomeDecisionId(null); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Decision note</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="outcome-text">Optional note</Label><Textarea id="outcome-text" value={outcomeText} onChange={(event) => setOutcomeText(event.target.value)} rows={3} maxLength={300} placeholder="Add context only if the result needs explanation." /></div>
            <Button type="button" className="h-11 rounded-2xl bg-emerald-600 font-black text-white" disabled={saving} onClick={() => void saveOutcome()}>{saving ? "Saving…" : outcomeText.trim() ? "Save note" : "Remove note"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(notifyCardId && notifyTarget)} onOpenChange={(open) => { if (!open) closeNotify(); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[90dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 lg:max-w-lg lg:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43] lg:text-xl">Notify organizers</DialogTitle></DialogHeader>
          {notifyTarget && <div className="grid gap-4">
            <div className="rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-100">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{notifyTarget.label}</div>
              <div className="mt-1 whitespace-normal break-words text-sm font-black leading-snug text-[#102A43] lg:text-base">{notifyTarget.text}</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">One notification for this step. A future Decision or Action gets a new Bell.</div>
            </div>

            <div>
              <Label>Who should be notified?</Label>
              <div className="mt-1.5 flex rounded-2xl bg-slate-100 p-1">
                <button type="button" className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${notifyRecipientMode === "all" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setNotifyRecipientMode("all")}>All organizers</button>
                <button type="button" className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${notifyRecipientMode === "selected" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setNotifyRecipientMode("selected")}>Selected</button>
              </div>
              {notifyRecipientMode === "selected" && <div className="mt-2 flex flex-wrap gap-1.5">
                {otherOrganizerPeople.map((person) => {
                  const email = person.email!;
                  const selected = notifyRecipientEmails.includes(email);
                  return <button key={email} type="button" className={`rounded-full px-2.5 py-1.5 text-[11px] font-black ring-1 ${selected ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-white text-slate-500 ring-slate-200"}`} onClick={() => toggleNotifyEmail(email)}>{selected && <Check className="mr-1 inline h-3 w-3" />}{person.name}</button>;
                })}
              </div>}
              {!otherOrganizerPeople.length && <div className="mt-2 text-[11px] font-semibold text-amber-700">No other signed-in organizers are available yet.</div>}
            </div>

            <div>
              <Label>Send by</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button type="button" className={`rounded-2xl border px-3 py-3 text-left transition ${notifyByEmail ? "border-violet-200 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setNotifyByEmail((value) => !value)}>
                  <Mail className="h-4 w-4" />
                  <div className="mt-1 text-xs font-black">Email {notifyByEmail && <Check className="ml-1 inline h-3.5 w-3.5" />}</div>
                  <div className="mt-0.5 text-[9px] font-semibold opacity-75">{notifyTarget.topicAlreadyNotified ? "Continues this topic’s email thread" : "Default · starts one thread for this topic"}</div>
                </button>
                <button type="button" className={`rounded-2xl border px-3 py-3 text-left transition ${notifyByPush ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setNotifyByPush((value) => !value)}>
                  <Smartphone className="h-4 w-4" />
                  <div className="mt-1 text-xs font-black">Phone {notifyByPush && <Check className="ml-1 inline h-3.5 w-3.5" />}</div>
                  <div className="mt-0.5 text-[9px] font-semibold opacity-75">Only devices that opted in</div>
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-bold text-slate-500">
                <span>
                  {phoneStatus === "enabled" ? "Phone alerts are enabled on this device."
                    : phoneStatus === "blocked" ? "Phone alerts are blocked in this browser."
                      : phoneStatus === "unsupported" ? "Phone alerts are not supported on this device/browser."
                        : "Phone alerts are not enabled on this device yet."}
                </span>
                {phoneStatus === "available" && <button type="button" className="shrink-0 rounded-lg bg-white px-2 py-1 font-black text-sky-700 ring-1 ring-sky-100" disabled={phoneEnabling} onClick={() => void enablePhone()}>{phoneEnabling ? "Enabling…" : "Enable"}</button>}
              </div>
            </div>

            <div>
              <Label htmlFor="notify-message">Message <span className="font-semibold text-slate-400">optional</span></Label>
              <Textarea id="notify-message" value={notifyMessage} onChange={(event) => setNotifyMessage(event.target.value)} rows={2} maxLength={500} placeholder="Add a short note, or leave this blank." />
            </div>

            {notifyError && <div className="rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{notifyError}</div>}

            <Button type="button" className="h-11 rounded-2xl bg-[#102A43] font-black text-white lg:h-12 lg:text-base" disabled={notifySending || !notifyEmailsToSend.length || (!notifyByEmail && !notifyByPush)} onClick={() => void sendNotification()}>
              <Bell className="mr-1.5 h-4 w-4" />{notifySending ? "Notifying…" : `Notify ${notifyEmailsToSend.length} organizer${notifyEmailsToSend.length === 1 ? "" : "s"}`}
            </Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="fixed inset-x-2 bottom-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Edit topic</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="edit-title">Topic</Label><Textarea id="edit-title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} rows={2} maxLength={220} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="edit-tag">Tag</Label><select id="edit-tag" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editCategory} onChange={(event) => setEditCategory(event.target.value)}><option value="">None</option>{TAGS.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><Label htmlFor="edit-due">Due</Label><Input id="edit-due" type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></div>
            </div>
            {renderPeoplePicker(editPeopleKeys, setEditPeopleKeys)}
            <div className="flex gap-2"><Button type="button" variant="outline" className="h-11 rounded-2xl text-red-700" onClick={() => void removeCard()}><Trash2 className="mr-1 h-4 w-4" />Delete</Button><Button type="button" className="h-11 flex-1 rounded-2xl font-black text-white" style={{ backgroundColor: accent }} disabled={!editTitle.trim() || saving} onClick={() => void saveEditedCard()}>{saving ? "Saving…" : "Save"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

        <Dialog open={boardSettingsOpen} onOpenChange={setBoardSettingsOpen}>
        <DialogContent className="max-w-sm rounded-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Board settings</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label htmlFor="board-name">Custom name <span className="font-semibold text-slate-400">optional · saves automatically</span></Label><Input id="board-name" value={boardNameDraft} onChange={(event) => changeBoardName(event.target.value)} maxLength={80} placeholder="e.g. Club decisions" /></div>
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#102A43]"><Smartphone className="h-4 w-4 text-sky-700" />Phone notifications</div>
                  <div className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">
                    {phoneStatus === "enabled" ? "Enabled on this device."
                      : phoneStatus === "blocked" ? "Blocked in this browser's notification settings."
                        : phoneStatus === "unsupported" ? "Not supported on this device/browser."
                          : "Optional. Enable this device to receive organizer pings."}
                  </div>
                </div>
                {phoneStatus === "available" && <button type="button" className="shrink-0 rounded-xl bg-white px-3 py-2 text-[11px] font-black text-sky-700 ring-1 ring-sky-100" disabled={phoneEnabling} onClick={() => void enablePhone()}>{phoneEnabling ? "Enabling…" : "Enable"}</button>}
                {phoneStatus === "enabled" && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700"><Check className="h-3 w-3" />On</span>}
              </div>
            </div>
            {notifyError && <div className="rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{notifyError}</div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
