import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  Gavel,
  Hand,
  History,
  Lightbulb,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Settings,
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
  sendActionBoardNotification,
  type ActionBoardNotificationStepKind,
} from "@/lib/notificationService";
import {
  addTaskBoardComment,
  castTaskBoardVote,
  claimTaskBoardScheduleHost,
  deleteTaskBoardCard,
  deleteTaskBoardComment,
  listenToTaskBoard,
  saveTaskBoardCard,
  saveTaskBoardColumn,
  saveTaskBoardMeta,
  updateTaskBoardComment,
  type TaskBoardActionItem,
  type TaskBoardActivity,
  type TaskBoardCard,
  type TaskBoardColumn,
  type TaskBoardColumnKind,
  type TaskBoardComment,
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

type EquipmentSnapshotItem = {
  label: string;
  quantity: number;
};

type EquipmentSnapshotBag = {
  id: string;
  name: string;
  holder: string;
  color?: string;
  items: EquipmentSnapshotItem[];
};

type EquipmentSnapshot = {
  bags: EquipmentSnapshotBag[];
  totals: EquipmentSnapshotItem[];
};

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
  equipmentSnapshot?: EquipmentSnapshot;
  onOpenEquipmentInventory?: () => void;
};

type LocalBoard = TaskBoardSnapshot;
type MobileFilter = "ideas" | "deciding" | "action" | "done";
type DecisionMode = "vote" | "recorded";
type NewTopicKind = "idea" | "decide" | "action";
type TopicStage = MobileFilter;
type DecisionSetupStep = TaskBoardDecisionType | null;
type ScheduleHostChoice = "me" | "person" | "group" | null;
type ScheduleParticipantMode = "all" | "selected";
type DecisionVoterMode = "all" | "selected";
type EquipmentVoteMode = "rate" | "choose";
type EquipmentDraftItem = { id: string; name: string; quantity: string; price: string; url: string };
type EditSection = "all" | "note" | "assignees" | "due";
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
  { kind: "action", name: "To-do" },
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

function answerLabels(raw: string, fallback: string[] = ["Yes", "No", "Maybe"]) {
  const labels = [...new Set(raw.split(/\n/).map((value) => value.trim()).filter(Boolean))].slice(0, 8);
  return labels.length >= 2 ? labels : fallback;
}

function newEquipmentDraftItem(name = "") : EquipmentDraftItem {
  return { id: id("equipment-item"), name, quantity: "1", price: "", url: "" };
}

function normalizedEquipmentQuantity(value: string | number | undefined) {
  if (value === undefined || value === null || String(value).trim() === "") return 1;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0, Math.floor(numeric));
}

function equipmentSubtotal(price: string | undefined, quantity: string | number | undefined) {
  const raw = String(price || "").trim();
  if (!raw) return "";
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return "";
  const unit = Number(match[0].replace(",", "."));
  if (!Number.isFinite(unit)) return "";
  const qty = normalizedEquipmentQuantity(quantity);
  const total = unit * qty;
  const usesComma = match[0].includes(",");
  const decimals = /[.,]\d{1,2}$/.test(match[0]) ? 2 : Number.isInteger(total) ? 0 : 2;
  const formatted = total.toFixed(decimals).replace(".", usesComma ? "," : ".");
  const prefix = raw.slice(0, match.index || 0).trim();
  const suffix = raw.slice((match.index || 0) + match[0].length).trim();
  const prefixGap = prefix && !/^[€$£¥₩₹]$/.test(prefix) ? " " : "";
  return `${prefix}${prefixGap}${formatted}${suffix ? ` ${suffix}` : ""}`.trim();
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
    comments: Array.isArray(card.comments) ? card.comments : [],
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

function currentStageEnteredAt(card: TaskBoardCard) {
  return card.lastMovedAt || card.createdAt || 0;
}

function latestDecisionInCurrentStage(card: TaskBoardCard) {
  const enteredAt = currentStageEnteredAt(card);
  return [...(card.decisions || [])]
    .filter((decision) => decision.createdAt >= enteredAt)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

function latestActionInCurrentStage(card: TaskBoardCard) {
  const enteredAt = currentStageEnteredAt(card);
  return [...(card.actions || [])]
    .filter((action) => action.createdAt >= enteredAt)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

function repeatDecisionLabel(decision?: TaskBoardVote) {
  if (!decision) return null;
  if (decision.decisionType === "schedule" || decision.kind === "schedule") return "Another schedule";
  if (decision.decisionType === "players") return "Another player decision";
  if (decision.decisionType === "equipment") return "Another equipment decision";
  return null;
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

function formatTime(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(date);
}

function linkifyCommentText(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/gi).map((part, index) => /^https?:\/\//i.test(part)
    ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline decoration-blue-200 underline-offset-2">{part}</a>
    : <React.Fragment key={index}>{part}</React.Fragment>);
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
  if (activity.action === "action_defined") return `${activity.actorName} added to-do details`;
  if (activity.action === "claimed") return `${activity.actorName} was added to a to-do`;
  if (activity.action === "released") return `${activity.actorName} was removed from a to-do`;
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

function normalizeTypedTime(value: string) {
  const raw = value.trim().replace(".", ":");
  let hour = -1;
  let minute = -1;
  if (/^\d{1,2}$/.test(raw)) {
    hour = Number(raw);
    minute = 0;
  } else if (/^\d{3,4}$/.test(raw)) {
    const digits = raw.padStart(4, "0");
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2));
  } else {
    const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      hour = Number(match[1]);
      minute = Number(match[2]);
    }
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function scheduleSlotValues(groups: ScheduleDateGroup[]) {
  return [...new Set(groups.flatMap((group) => group.date
    ? group.times.map(normalizeTypedTime).filter(Boolean).map((time) => `${group.date}T${time}`)
    : []))];
}

function scheduleGroupsFromValues(values: string[] = []): ScheduleDateGroup[] {
  const byDate = new Map<string, string[]>();
  values.forEach((value) => {
    const [date, time] = value.split("T");
    if (!date || !time) return;
    byDate.set(date, [...(byDate.get(date) || []), time.slice(0, 5)]);
  });
  const groups = [...byDate.entries()].map(([date, times]) => ({ id: id("schedule-date"), date, times: [...new Set(times)] }));
  return groups.length ? groups : [newScheduleDateGroup()];
}

function scheduleLocationValues(raw: string) {
  return [...new Set(raw.split(/\n/).map((value) => value.trim()).filter(Boolean))].slice(0, 8);
}

function scheduleIsHost(decision: TaskBoardVote, person: TaskBoardPerson) {
  if (decision.hostEmail && person.email) return decision.hostEmail.toLowerCase() === person.email.toLowerCase();
  return Boolean(decision.hostName && decision.hostName.trim().toLowerCase() === person.name.trim().toLowerCase());
}

function googleCalendarUrl(card: TaskBoardCard, decision: TaskBoardVote) {
  if (!decision.finalizedTime) return "";
  const start = new Date(decision.finalizedTime);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: decision.title?.trim() || card.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: decision.meetingUrl ? `Meeting link: ${decision.meetingUrl}` : "Created in Stripes",
    location: decision.finalizedLocation || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
    if (openDecision.decisionType === "schedule" || openDecision.kind === "schedule") {
      if (openDecision.scheduleState === "waiting-host") return "Waiting for host";
      if (openDecision.scheduleState === "setup") return "Host selected · set up schedule";
      return openDecision.title?.trim() || "Find a time";
    }
    if (openDecision.title?.trim()) return openDecision.title.trim();
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
  if (latestAction?.status === "done") return "To-do complete · choose next step";
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
    if (openDecision.decisionType === "schedule" || openDecision.kind === "schedule") return null;
    const questions = decisionQuestions(openDecision);
    return {
      kind: "decision",
      id: openDecision.id,
      label: "Decision",
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
      label: "To-do",
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
      label: action.status === "done" ? "To-do complete" : "To-do",
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

function decisionEvolutionResult(decision: TaskBoardVote) {
  if (decision.decisionType === "schedule" || decision.kind === "schedule") {
    if (decision.scheduleState === "finalized" || decision.finalizedTime) {
      const parts = [decision.finalizedTime ? scheduleLabel(decision.finalizedTime) : "Time confirmed", decision.finalizedLocation].filter(Boolean);
      return parts.join(" · ");
    }
    if (decision.scheduleState === "waiting-host") return "Waiting for host";
    if (decision.scheduleState === "setup") return decision.hostName ? `Host · ${decision.hostName}` : "Host chosen";
    const responses = voteTotal(decision);
    return decision.status === "open" ? `${responses} response${responses === 1 ? "" : "s"}` : "Schedule closed";
  }
  if (decision.mode === "recorded") return decision.outcome || "Decision recorded";
  if (decision.outcome) return decision.outcome;
  const summaries = decisionQuestions(decision).map((question) => {
    const max = Math.max(0, ...question.options.map((option) => option.count || 0));
    if (!max) return null;
    const winners = question.options.filter((option) => (option.count || 0) === max).map((option) => option.label);
    return winners.length ? `${question.text}: ${winners.join(" / ")}` : null;
  }).filter((value): value is string => Boolean(value));
  return summaries.join(" · ") || decisionHistoryMeta(decision);
}

function evolutionStepCount(card: TaskBoardCard) {
  return 1 + timelineEntries(card).length + (card.completedAt ? 1 : 0);
}

function EmptyActionBoard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm ring-1 ring-slate-200"><Gavel className="h-6 w-6" /></div>
      <h3 className="mt-4 text-lg font-black text-[#102A43]">Start with one line</h3>
      <p className="mt-1 max-w-md text-sm font-semibold leading-relaxed text-slate-500">Capture it now. Add decisions, to-dos and other structure only when the card needs them.</p>
      <Button type="button" className="mt-5 h-11 rounded-2xl px-4 font-black text-white" onClick={onCreate}><Plus className="mr-1.5 h-4 w-4" />Add a card</Button>
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
  equipmentSnapshot,
  onOpenEquipmentInventory,
}: Props) {
  const online = Boolean(scopeId && user?.email);
  // Action Board has a fixed semantic blue identity. Roster color is intentionally ignored
  // so white or very light custom roster colors cannot erase board controls.
  const accent = "#3b82f6";
  const background = mixHex(accent, "#ffffff", 0.93);
  const currentActor = actor(user);

  const availablePeople = useMemo(
    () => normalizePeople([currentActor, ...organizerPeople]),
    [currentActor.email, currentActor.name, organizerPeople],
  );

  const [board, setBoard] = useState<LocalBoard>(() => readLocalBoard(workspaceKey, rosterName));
  const [boardOpen, setBoardOpen] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [evolutionCardId, setEvolutionCardId] = useState<string | null>(null);
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>("deciding");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [lastSeenActivityAt, setLastSeenActivityAt] = useState(() => readActivitySeen(workspaceKey));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentVoterHash, setCurrentVoterHash] = useState("");
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddStage, setQuickAddStage] = useState<TopicStage | null>(null);
  const quickAddInputRefs = useRef<Partial<Record<TopicStage, HTMLInputElement | null>>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentSavingCardId, setCommentSavingCardId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicKind, setNewTopicKind] = useState<NewTopicKind | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPeopleKeys, setNewPeopleKeys] = useState<string[]>([]);

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>("all");
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
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
  const [decisionVoterMode, setDecisionVoterMode] = useState<DecisionVoterMode>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [playerAnswerOptions, setPlayerAnswerOptions] = useState("Yes\nNo\nMaybe");
  const [equipmentVoteMode, setEquipmentVoteMode] = useState<EquipmentVoteMode>("rate");
  const [equipmentAnswerOptions, setEquipmentAnswerOptions] = useState("Yes\nNo\nMaybe");
  const [equipmentAnswersOpen, setEquipmentAnswersOpen] = useState(false);
  const [equipmentAnswerOptionsDraft, setEquipmentAnswerOptionsDraft] = useState("Yes\nNo\nMaybe");
  const [equipmentMaxSelections, setEquipmentMaxSelections] = useState("2");
  const [equipmentDraftItems, setEquipmentDraftItems] = useState<EquipmentDraftItem[]>([newEquipmentDraftItem()]);
  const [equipmentPendingSubject, setEquipmentPendingSubject] = useState("");
  const [equipmentLinkItemId, setEquipmentLinkItemId] = useState<string | null>(null);
  const [equipmentLinkDraft, setEquipmentLinkDraft] = useState("");
  const [scheduleHostName, setScheduleHostName] = useState("");
  const [scheduleHostChoice, setScheduleHostChoice] = useState<ScheduleHostChoice>(null);
  const [scheduleRequestedHostKey, setScheduleRequestedHostKey] = useState("");
  const [scheduleParticipantMode, setScheduleParticipantMode] = useState<ScheduleParticipantMode>("all");
  const [scheduleDates, setScheduleDates] = useState<ScheduleDateGroup[]>([newScheduleDateGroup()]);
  const [scheduleLocations, setScheduleLocations] = useState("");
  const [decisionEditingDecisionId, setDecisionEditingDecisionId] = useState<string | null>(null);
  const [finalizeScheduleCardId, setFinalizeScheduleCardId] = useState<string | null>(null);
  const [finalizeScheduleDecisionId, setFinalizeScheduleDecisionId] = useState<string | null>(null);
  const [finalScheduleTime, setFinalScheduleTime] = useState("");
  const [finalScheduleLocation, setFinalScheduleLocation] = useState("");
  const [finalScheduleMeetingUrl, setFinalScheduleMeetingUrl] = useState("");

  const [linkCardId, setLinkCardId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [actionText, setActionText] = useState("");
  const [actionPeopleKeys, setActionPeopleKeys] = useState<string[]>([]);

  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<TopicStage | null>(null);
  const mobileColumnRefs = useRef<Partial<Record<TopicStage, HTMLElement | null>>>({});

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
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifySending, setNotifySending] = useState(false);
  const [notifyError, setNotifyError] = useState("");

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

  const stageForCard = (card: TaskBoardCard): TopicStage => {
    if (columnByKind.get("done")?.id === card.columnId) return "done";
    if (columnByKind.get("action")?.id === card.columnId) return "action";
    if (columnByKind.get("vote")?.id === card.columnId) return "deciding";
    if (columnByKind.get("ideas")?.id === card.columnId) return "ideas";
    // Legacy cards created before v1.61 can still fall back to their old derived state
    // until they are explicitly moved once.
    return topicStage(card);
  };

  const updateBoardCard = (card: TaskBoardCard) => {
    setBoard((current) => ({ ...current, cards: [...current.cards.filter((item) => item.id !== card.id), card] }));
  };

  const persistCard = async (card: TaskBoardCard) => {
    updateBoardCard(card);
    if (online) await saveTaskBoardCard(scopeId!, card);
    return card;
  };

  const persistMeta = async (meta: TaskBoardMeta) => {
    setBoard((current) => ({ ...current, meta }));
    if (online) await saveTaskBoardMeta(scopeId!, meta);
  };

  const commentIsMine = (comment: TaskBoardComment) => {
    const actorEmail = currentActor.email?.trim().toLowerCase();
    const authorEmail = comment.authorEmail?.trim().toLowerCase();
    if (actorEmail && authorEmail) return actorEmail === authorEmail;
    return comment.authorName.trim().toLowerCase() === currentActor.name.trim().toLowerCase();
  };

  const submitComment = async (card: TaskBoardCard) => {
    const text = (commentDrafts[card.id] || "").trim();
    if (!text || commentSavingCardId) return;
    setCommentSavingCardId(card.id);
    setError("");
    try {
      if (online) {
        await addTaskBoardComment(scopeId!, card.id, text);
      } else {
        const now = Date.now();
        const comment: TaskBoardComment = { id: id("comment"), text: text.slice(0, 3000), authorName: currentActor.name, authorEmail: currentActor.email, createdAt: now };
        await persistCard({ ...card, comments: [...(card.comments || []), comment].slice(-200), updatedAt: now, updatedByName: currentActor.name });
      }
      setCommentDrafts((current) => ({ ...current, [card.id]: "" }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not add comment.");
    } finally {
      setCommentSavingCardId(null);
    }
  };

  const beginEditComment = (comment: TaskBoardComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const saveEditedComment = async (card: TaskBoardCard, comment: TaskBoardComment) => {
    const text = editingCommentText.trim();
    if (!text || commentSavingCardId) return;
    setCommentSavingCardId(card.id);
    setError("");
    try {
      if (online) {
        await updateTaskBoardComment(scopeId!, card.id, comment.id, text);
      } else {
        const now = Date.now();
        const nextComments = (card.comments || []).map((item) => item.id === comment.id ? { ...item, text: text.slice(0, 3000), updatedAt: now } : item);
        await persistCard({ ...card, comments: nextComments, updatedAt: now, updatedByName: currentActor.name });
      }
      setEditingCommentId(null);
      setEditingCommentText("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not edit comment.");
    } finally {
      setCommentSavingCardId(null);
    }
  };

  const removeComment = async (card: TaskBoardCard, comment: TaskBoardComment) => {
    if (!commentIsMine(comment) || commentSavingCardId) return;
    setCommentSavingCardId(card.id);
    setError("");
    try {
      if (online) {
        await deleteTaskBoardComment(scopeId!, card.id, comment.id);
      } else {
        const now = Date.now();
        await persistCard({ ...card, comments: (card.comments || []).filter((item) => item.id !== comment.id), updatedAt: now, updatedByName: currentActor.name });
      }
      if (editingCommentId === comment.id) { setEditingCommentId(null); setEditingCommentText(""); }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete comment.");
    } finally {
      setCommentSavingCardId(null);
    }
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

  const isMobileBoardViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

  const openBoard = () => {
    const seenAt = Date.now();
    setLastSeenActivityAt(seenAt);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(activitySeenKey(workspaceKey), String(seenAt));
      if (isMobileBoardViewport() && !boardOpen) {
        window.history.pushState({ ...(window.history.state || {}), stripesActionBoard: true }, "");
      }
    }
    setBoardOpen(true);
  };

  const openCardDetail = (card: TaskBoardCard) => {
    if (!isMobileBoardViewport()) {
      toggleExpanded(card.id);
      return;
    }
    if (typeof window !== "undefined") {
      window.history.pushState({ ...(window.history.state || {}), stripesActionBoard: true, stripesActionBoardCard: card.id }, "");
    }
    setActiveCardId(card.id);
  };

  const closeCardDetail = () => {
    setActiveCardId(null);
    if (typeof window !== "undefined" && window.history.state?.stripesActionBoardCard) {
      const nextState = { ...(window.history.state || {}) };
      delete nextState.stripesActionBoardCard;
      window.history.replaceState({ ...nextState, stripesActionBoard: true }, "");
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (activeCardId) {
        event.stopImmediatePropagation();
        setActiveCardId(null);
        return;
      }
      if (boardOpen) {
        event.stopImmediatePropagation();
        setBoardOpen(false);
      }
    };
    // Capture first so app-level Back handling cannot jump from a card to Roster.
    window.addEventListener("popstate", handlePopState, true);
    return () => window.removeEventListener("popstate", handlePopState, true);
  }, [activeCardId, boardOpen]);

  useEffect(() => {
    if (!boardOpen || !latestActivity?.activity.at) return;
    const seenAt = latestActivity.activity.at;
    setLastSeenActivityAt(seenAt);
    if (typeof window !== "undefined") window.localStorage.setItem(activitySeenKey(workspaceKey), String(seenAt));
  }, [boardOpen, latestActivity?.activity.at, workspaceKey]);

  const cardsByStage = useMemo(() => {
    const result: Record<TopicStage, TaskBoardCard[]> = { ideas: [], deciding: [], action: [], done: [] };
    board.cards.forEach((card) => result[stageForCard(card)].push(card));
    (Object.keys(result) as TopicStage[]).forEach((stage) => {
      result[stage].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    return result;
  }, [board.cards, columnByKind]);

  const centerMobileStage = (stage: TopicStage, behavior: ScrollBehavior = "smooth") => {
    if (!isMobileBoardViewport()) return;
    window.requestAnimationFrame(() => {
      mobileColumnRefs.current[stage]?.scrollIntoView({ behavior, block: "nearest", inline: "center" });
    });
  };

  const moveCardToStage = async (card: TaskBoardCard, stage: TopicStage) => {
    const kind: TaskBoardColumnKind = stage === "deciding" ? "vote" : stage;
    const column = columnByKind.get(kind);
    if (!column) return null;
    if (card.columnId === column.id) return card;
    const now = Date.now();
    const nextActions = stage === "done"
      ? (card.actions || []).map((action) => action.status === "open" ? {
          ...action,
          status: "done" as const,
          completedAt: now,
          completedByName: currentActor.name,
          completedByEmail: currentActor.email,
        } : action)
      : (card.actions || []);
    const next: TaskBoardCard = {
      ...card,
      columnId: column.id,
      actions: nextActions,
      actionText: stage === "done" ? undefined : card.actionText,
      assignee: stage === "done" ? undefined : card.assignee,
      assigneeEmail: stage === "done" ? undefined : card.assigneeEmail,
      completedAt: stage === "done" ? (card.completedAt || now) : undefined,
      completedByName: stage === "done" ? (card.completedByName || currentActor.name) : undefined,
      completedByEmail: stage === "done" ? (card.completedByEmail || currentActor.email) : undefined,
      lastMovedAt: now,
      lastMovedByName: currentActor.name,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity(stage === "done" ? "completed" : card.completedAt ? "reopened" : "moved", currentActor.name, currentActor.email)].slice(-30),
    };
    setError("");
    try {
      await persistCard(next);
      setMobileFilter(stage);
      centerMobileStage(stage);
      return next;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not move card.");
      return null;
    }
  };

  const openMoveCard = (card: TaskBoardCard) => setMoveCardId(card.id);

  const moveCardFromPicker = async (stage: TopicStage) => {
    const card = board.cards.find((item) => item.id === moveCardId);
    setMoveCardId(null);
    if (!card) return;
    await moveCardToStage(card, stage);
  };

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
    setNotifyMessage("");
    setNotifyError("");
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
    setNotifySending(true);
    setNotifyError("");
    try {
      await sendActionBoardNotification({
        scopeId,
        cardId: notifyCardId,
        stepKind: notifyTarget.kind,
        stepId: notifyTarget.id,
        recipientEmails: notifyEmailsToSend,
        email: true,
        push: false,
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

  const togglePersonKey = (key: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const currentVisibleMobileStage = (): TopicStage => {
    if (!isMobileBoardViewport()) return "ideas";
    const viewportCenter = window.innerWidth / 2;
    let bestStage: TopicStage = "ideas";
    let bestDistance = Number.POSITIVE_INFINITY;
    (["ideas", "deciding", "action", "done"] as TopicStage[]).forEach((stage) => {
      const element = mobileColumnRefs.current[stage];
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.abs((rect.left + rect.right) / 2 - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStage = stage;
      }
    });
    return bestStage;
  };

  const focusQuickAdd = (requestedStage?: TopicStage) => {
    let stage = requestedStage || currentVisibleMobileStage();
    if (stage === "done") stage = "action";
    setQuickAddStage(stage);
    setMobileFilter(stage);
    centerMobileStage(stage);
    window.setTimeout(() => quickAddInputRefs.current[stage]?.focus(), 80);
  };

  const createQuickTopic = async (stage: TopicStage) => {
    const title = quickAddTitle.trim();
    if (!title || saving || stage === "done") return;
    const kind: TaskBoardColumnKind = stage === "deciding" ? "vote" : stage;
    const column = columnByKind.get(kind);
    if (!column) return;
    const now = Date.now();
    const card: TaskBoardCard = {
      id: id("topic"),
      title,
      columnId: column.id,
      position: now,
      people: [],
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
    setSaving(true);
    setError("");
    try {
      await persistCard(card);
      setQuickAddTitle("");
      setQuickAddStage(stage);
      setMobileFilter(stage);
      centerMobileStage(stage);
      window.setTimeout(() => quickAddInputRefs.current[stage]?.focus(), 80);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not add card.");
    } finally {
      setSaving(false);
    }
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

  const openEditCard = (card: TaskBoardCard, section: EditSection = "all") => {
    setEditingCardId(card.id);
    setEditSection(section);
    setEditTitle(card.title);
    setEditNote(card.note || "");
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
      note: editNote.trim() || undefined,
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

  const startDecision = (card: TaskBoardCard, preset?: TaskBoardDecisionType) => {
    if (latestOpenDecision(card)) return;
    setDecisionCardId(card.id);
    setDecisionStep(preset || null);
    setDecisionMode("vote");
    setDecisionTitle("");
    setDecisionQuestion("");
    setDecisionQuestionsDraft([newDraftQuestion(card.title)]);
    setDecisionOutcome("");
    setDecisionKind("yes-no-abstain");
    setDecisionOptions("");
    setDecisionMaxSelections("3");
    setDecisionPeopleKeys([]);
    setDecisionVoterMode("all");
    setSelectedPlayerIds([]);
    setPlayerSearch("");
    setPlayerAnswerOptions("Yes\nNo\nMaybe");
    setEquipmentVoteMode("rate");
    setEquipmentAnswerOptions("Yes\nNo\nMaybe");
    setEquipmentMaxSelections("2");
    setEquipmentDraftItems([newEquipmentDraftItem()]);
    setDecisionEditingDecisionId(null);
    setScheduleHostName("");
    setScheduleHostChoice(null);
    setScheduleRequestedHostKey("");
    setScheduleParticipantMode("all");
    setScheduleDates([newScheduleDateGroup()]);
    setScheduleLocations("");

    if (preset === "schedule") {
      setDecisionKind("schedule");
    } else if (preset === "players") {
      setDecisionKind("multi-select");
      setDecisionQuestion("Who should be selected?");
      setDecisionMaxSelections("3");
    } else if (preset === "equipment") {
      setDecisionKind("choose-one");
      setDecisionTitle(card.title);
      setDecisionQuestion("");
      setDecisionOptions("");
      }
  };

  const chooseDecisionType = (kind: TaskBoardDecisionType) => {
    const card = board.cards.find((item) => item.id === decisionCardId);
    if (!card) return;
    setDecisionStep(kind);
    setDecisionMode("vote");
    setDecisionOutcome("");
    setDecisionTitle("");
    setDecisionPeopleKeys([]);
    setDecisionVoterMode("all");
    if (kind === "schedule") {
      setDecisionKind("schedule");
      setDecisionQuestion("");
      setDecisionEditingDecisionId(null);
      setScheduleHostName("");
      setScheduleHostChoice(null);
      setScheduleRequestedHostKey("");
      setScheduleParticipantMode("all");
      setScheduleDates([newScheduleDateGroup()]);
      setScheduleLocations("");
    } else if (kind === "players") {
      setDecisionKind("choose-one");
      setDecisionQuestion("");
      setDecisionMaxSelections("");
      setPlayerAnswerOptions("Yes\nNo\nMaybe");
    } else if (kind === "equipment") {
      setDecisionKind("choose-one");
      setDecisionTitle(card.title);
      setDecisionQuestion("");
      setDecisionOptions("");
        setEquipmentVoteMode("rate");
      setEquipmentAnswerOptions("Yes\nNo\nMaybe");
      setEquipmentMaxSelections("2");
      setEquipmentDraftItems([newEquipmentDraftItem()]);
    } else {
      setDecisionKind("yes-no-abstain");
      setDecisionQuestionsDraft([newDraftQuestion(card.title)]);
    }
  };

  const chooseEquipmentSubject = (label: string) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    setEquipmentDraftItems((current) => {
      const emptyIndex = current.findIndex((item) => !item.name.trim());
      if (emptyIndex >= 0) return current.map((item, index) => index === emptyIndex ? { ...item, name: cleanLabel } : item);
      return [...current, newEquipmentDraftItem(cleanLabel)];
    });
  };

  const updateEquipmentDraftItem = (itemId: string, patch: Partial<EquipmentDraftItem>) => {
    setEquipmentDraftItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  };

  const removeEquipmentDraftItem = (itemId: string) => {
    setEquipmentDraftItems((current) => {
      const next = current.filter((item) => item.id !== itemId);
      return next.length ? next : [newEquipmentDraftItem()];
    });
  };

  const scheduleHostPeople = () => availablePeople.filter((person) => person.email || personKey(person) === personKey(currentActor));

  const openScheduleSetup = (card: TaskBoardCard, decision: TaskBoardVote) => {
    setDecisionCardId(card.id);
    setDecisionStep("schedule");
    setDecisionMode("vote");
    setDecisionEditingDecisionId(decision.id || null);
    setDecisionTitle(decision.title || "");
    setScheduleHostName(decision.hostName || currentActor.name);
    setScheduleHostChoice("me");
    setScheduleRequestedHostKey("");
    setScheduleParticipantMode(decision.scheduleParticipantMode || ((decision.participantEmails?.length || decision.participantNames?.length) ? "selected" : "all"));
    const selectedKeys = availablePeople
      .filter((person) => (decision.participantEmails || []).some((email) => person.email?.toLowerCase() === email.toLowerCase()) || (decision.participantNames || []).includes(person.name))
      .map(personKey);
    setDecisionPeopleKeys(selectedKeys);
    setScheduleDates(scheduleGroupsFromValues(decision.scheduleTimeValues || []));
    setScheduleLocations((decision.scheduleLocationOptions || []).join("\n"));
  };

  const createScheduleForHost = async (card: TaskBoardCard, host: TaskBoardPerson, requestDecisionId?: string) => {
    const now = Date.now();
    const hostRequest = requestDecisionId ? (card.decisions || []).find((item) => item.id === requestDecisionId) : undefined;
    const scheduleDecision: TaskBoardVote = {
      id: id("decision"),
      mode: "vote",
      kind: "schedule",
      decisionType: "schedule",
      title: hostRequest?.title?.trim() || decisionTitle.trim() || card.title,
      question: "Set up schedule",
      hostName: host.name,
      hostEmail: host.email,
      scheduleState: "setup",
      scheduleParticipantMode: "all",
      questions: [],
      options: [],
      anonymous: false,
      hideParticipationUntilClosed: false,
      showResultsWhileOpen: true,
      status: "open",
      voterHashes: [],
      ballots: [],
      createdAt: now,
      createdByName: currentActor.name,
    };
    const previous = (card.decisions || []).map((item) => requestDecisionId && item.id === requestDecisionId
      ? { ...item, status: "closed" as const, closedAt: now, closedByName: currentActor.name, outcome: `Hosted by ${host.name}` }
      : item);
    const next: TaskBoardCard = {
      ...card,
      decisions: [...previous, scheduleDecision],
      vote: scheduleDecision,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("vote_started", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try {
      if (online && scopeId && requestDecisionId) {
        const claimed = await claimTaskBoardScheduleHost(scopeId, card.id, requestDecisionId, scheduleDecision);
        if (!claimed) {
          setError("Someone else has already taken this host request.");
          return;
        }
        updateBoardCard(next);
      } else {
        await persistCard(next);
      }
      openScheduleSetup(next, scheduleDecision);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not start schedule.");
    } finally { setSaving(false); }
  };

  const requestScheduleHost = async (mode: "person" | "group") => {
    const card = board.cards.find((item) => item.id === decisionCardId);
    if (!card) return;
    const requested = mode === "person" ? availablePeople.find((person) => personKey(person) === scheduleRequestedHostKey) : undefined;
    if (mode === "person" && !requested) return;
    const recipients = mode === "person"
      ? requested?.email ? [requested.email] : []
      : otherOrganizerPeople.map((person) => person.email!).filter(Boolean);
    const now = Date.now();
    const requestDecision: TaskBoardVote = {
      id: id("decision"),
      mode: "vote",
      kind: "schedule",
      decisionType: "schedule",
      title: decisionTitle.trim() || card.title,
      question: "Who will host this?",
      scheduleState: "waiting-host",
      hostRequestMode: mode,
      requestedHostName: requested?.name,
      requestedHostEmail: requested?.email,
      questions: [],
      options: [],
      anonymous: false,
      hideParticipationUntilClosed: false,
      showResultsWhileOpen: true,
      status: "open",
      voterHashes: [],
      ballots: [],
      createdAt: now,
      createdByName: currentActor.name,
    };
    const next: TaskBoardCard = {
      ...card,
      decisions: [...(card.decisions || []), requestDecision],
      vote: requestDecision,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("vote_started", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try {
      await persistCard(next);
      setDecisionCardId(null); setDecisionStep(null); setDecisionEditingDecisionId(null);
      if (online && scopeId && recipients.length) {
        try {
          await sendActionBoardNotification({
            scopeId,
            cardId: card.id,
            stepKind: "decision",
            stepId: requestDecision.id,
            recipientEmails: recipients,
            email: true,
            push: false,
            message: mode === "person" ? `${currentActor.name} asked you to host this.` : `${currentActor.name} is looking for someone to host this. Open Stripes and tap “I’ll host”.`,
          });
        } catch { setError("Host request saved, but the email notification could not be sent."); }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not request a host.");
    } finally { setSaving(false); }
  };

  const claimScheduleHost = async (card: TaskBoardCard, requestDecision: TaskBoardVote) => {
    const canClaim = requestDecision.hostRequestMode === "group"
      || (requestDecision.requestedHostEmail && currentActor.email && requestDecision.requestedHostEmail.toLowerCase() === currentActor.email.toLowerCase())
      || (!requestDecision.requestedHostEmail && requestDecision.requestedHostName?.toLowerCase() === currentActor.name.toLowerCase());
    if (!canClaim) return;
    await createScheduleForHost(card, currentActor, requestDecision.id);
  };

  const declineScheduleHost = async (card: TaskBoardCard, requestDecision: TaskBoardVote) => {
    const now = Date.now();
    const nextDecisions = (card.decisions || []).map((item) => item.id === requestDecision.id ? {
      ...item,
      status: "closed" as const,
      scheduleState: "host-declined" as const,
      outcome: `${currentActor.name} declined hosting`,
      closedAt: now,
      closedByName: currentActor.name,
    } : item);
    setSaving(true); setError("");
    try { await persistCard({ ...card, decisions: nextDecisions, vote: nextDecisions[nextDecisions.length - 1], updatedAt: now, updatedByName: currentActor.name }); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not decline host request."); }
    finally { setSaving(false); }
  };

  const openFinalizeSchedule = (card: TaskBoardCard, decision: TaskBoardVote) => {
    if (!scheduleIsHost(decision, currentActor)) return;
    setFinalizeScheduleCardId(card.id);
    setFinalizeScheduleDecisionId(decision.id || null);
    setFinalScheduleTime(decision.finalizedTime || decision.scheduleTimeValues?.[0] || "");
    setFinalScheduleLocation(decision.finalizedLocation || decision.scheduleLocationOptions?.[0] || "");
    setFinalScheduleMeetingUrl(decision.meetingUrl || "");
  };

  const finalizeSchedule = async () => {
    const card = board.cards.find((item) => item.id === finalizeScheduleCardId);
    const decision = card?.decisions?.find((item) => item.id === finalizeScheduleDecisionId);
    if (!card || !decision || !finalScheduleTime || !finalScheduleLocation || !scheduleIsHost(decision, currentActor)) return;
    const now = Date.now();
    const nextDecisions = (card.decisions || []).map((item) => item.id === decision.id ? {
      ...item,
      status: "closed" as const,
      scheduleState: "finalized" as const,
      finalizedTime: finalScheduleTime,
      finalizedLocation: finalScheduleLocation,
      meetingUrl: finalScheduleMeetingUrl.trim() || undefined,
      finalizedAt: now,
      finalizedByName: currentActor.name,
      closedAt: now,
      closedByName: currentActor.name,
      outcome: `${scheduleLabel(finalScheduleTime)} · ${finalScheduleLocation}`,
    } : item);
    const next: TaskBoardCard = {
      ...card,
      decisions: nextDecisions,
      vote: nextDecisions[nextDecisions.length - 1],
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("vote_closed", currentActor.name, currentActor.email)].slice(-30),
    };
    setSaving(true); setError("");
    try {
      await persistCard(next);
      setFinalizeScheduleCardId(null); setFinalizeScheduleDecisionId(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not finalize schedule.");
    } finally { setSaving(false); }
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
      let decisionParticipants = decisionVoterMode === "all" ? availablePeople : selectedPeople;
      let questions: TaskBoardDecisionQuestion[] = [];
      let sourcePlayerIds: string[] | undefined;
      let rootKind: TaskBoardVoteKind = decisionKind;

      if (decisionStep === "schedule") {
        const existingSchedule = (card.decisions || []).find((item) => item.id === decisionEditingDecisionId);
        const values = scheduleSlotValues(scheduleDates);
        const locations = scheduleLocationValues(scheduleLocations);
        const hostName = existingSchedule?.hostName || scheduleHostName.trim();
        const hostEmail = existingSchedule?.hostEmail || (hostName.toLowerCase() === currentActor.name.toLowerCase() ? currentActor.email : undefined);
        const allParticipants = availablePeople.filter((person) => {
          if (hostEmail && person.email) return person.email.toLowerCase() !== hostEmail.toLowerCase();
          return person.name.toLowerCase() !== hostName.toLowerCase();
        });
        decisionParticipants = scheduleParticipantMode === "all" ? allParticipants : selectedPeople.filter((person) => {
          if (hostEmail && person.email) return person.email.toLowerCase() !== hostEmail.toLowerCase();
          return person.name.toLowerCase() !== hostName.toLowerCase();
        });
        if (!hostName || values.length < 1 || locations.length < 1 || decisionParticipants.length < 1) return;
        if (values.length > 1) {
          const labels = values.map(scheduleLabel).filter(Boolean);
          questions.push({
            id: id("question"),
            text: "When can you make it?",
            kind: "multi-select",
            scheduleRole: "time",
            options: [...labels.map((label) => ({ id: id("option"), label, count: 0 })), { id: id("option"), label: "None of these work for me", count: 0 }],
            maxSelections: labels.length + 1,
          });
        }
        if (locations.length > 1) {
          questions.push({
            id: id("question"),
            text: "Where should we meet?",
            kind: "choose-one",
            scheduleRole: "location",
            options: locations.map((label) => ({ id: id("option"), label, count: 0 })),
          });
        }
        rootKind = "schedule";
      } else if (decisionStep === "players") {
        const selected = players.filter((player) => selectedPlayerIds.includes(player.id));
        const labels = answerLabels(playerAnswerOptions);
        sourcePlayerIds = selected.map((player) => player.id);
        if (selected.length < 1 || labels.length < 2) return;
        questions = selected.map((player) => ({
          id: id("question"),
          text: player.name.trim(),
          kind: "choose-one" as const,
          options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
          sourcePlayerIds: [player.id],
        }));
        rootKind = "choose-one";
      } else if (decisionStep === "equipment") {
        const items = equipmentDraftItems
          .map((item) => ({
            ...item,
            name: item.name.trim(),
            quantity: normalizedEquipmentQuantity(item.quantity),
            price: item.price.trim(),
            url: item.url.trim(),
          }))
          .filter((item) => item.name);
        if (items.length < 1) return;
        if (items.some((item) => item.url && !validHttpUrl(item.url))) return;
        if (equipmentVoteMode === "rate") {
          const labels = answerLabels(equipmentAnswerOptions);
          questions = items.map((item) => ({
            id: id("question"),
            text: item.name,
            kind: "choose-one" as const,
            itemQuantity: item.quantity,
            itemPrice: item.price || undefined,
            itemUrl: item.url || undefined,
            options: labels.map((label) => ({ id: id("option"), label, count: 0 })),
          }));
          rootKind = "choose-one";
        } else {
          if (items.length < 2) return;
          const max = Math.max(1, Math.min(items.length, Number(equipmentMaxSelections) || 1));
          const kind = max > 1 ? "multi-select" as const : "choose-one" as const;
          questions = [{
            id: id("question"),
            text: decisionTitle.trim() || card.title,
            kind,
            maxSelections: kind === "multi-select" ? max : undefined,
            options: items.map((item) => ({
              id: id("option"),
              label: item.name,
              count: 0,
              quantity: item.quantity,
              price: item.price || undefined,
              url: item.url || undefined,
            })),
          }];
          rootKind = kind;
        }
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
      const existingSchedule = decisionStep === "schedule" ? (card.decisions || []).find((item) => item.id === decisionEditingDecisionId) : undefined;
      const scheduleValues = decisionStep === "schedule" ? scheduleSlotValues(scheduleDates) : undefined;
      const scheduleLocationOptions = decisionStep === "schedule" ? scheduleLocationValues(scheduleLocations) : undefined;
      decision = {
        ...(existingSchedule || {}),
        id: existingSchedule?.id || id("decision"),
        mode: "vote",
        kind: rootKind,
        decisionType: decisionStep,
        title: decisionTitle.trim() || undefined,
        question: decisionStep === "players" ? card.title : decisionStep === "equipment" ? (decisionTitle.trim() || card.title) : decisionStep === "schedule" ? (decisionTitle.trim() || card.title) : decisionTitle.trim() || primaryQuestion?.text || card.title,
        hostName: decisionStep === "schedule" ? (existingSchedule?.hostName || scheduleHostName.trim()) : undefined,
        hostEmail: decisionStep === "schedule" ? (existingSchedule?.hostEmail || (scheduleHostName.trim().toLowerCase() === currentActor.name.toLowerCase() ? currentActor.email : undefined)) : undefined,
        scheduleState: decisionStep === "schedule" ? "collecting" : undefined,
        scheduleTimeValues: scheduleValues,
        scheduleLocationOptions,
        scheduleParticipantMode: decisionStep === "schedule" ? scheduleParticipantMode : undefined,
        participantMode: decisionStep === "schedule" ? undefined : decisionVoterMode,
        equipmentIntent: undefined,
        equipmentVoteMode: decisionStep === "equipment" ? equipmentVoteMode : undefined,
        questions,
        options: primaryQuestion?.options || [],
        anonymous: decisionStep !== "schedule",
        hideParticipationUntilClosed: false,
        showResultsWhileOpen: decisionStep === "schedule",
        status: "open",
        eligibleCount: decisionParticipants.length || Math.max(1, eligibleVoterCount),
        participantEmails: decisionParticipants.map((person) => person.email).filter((email): email is string => Boolean(email)),
        participantNames: decisionParticipants.map((person) => person.name),
        sourcePlayerIds,
        maxSelections: primaryQuestion?.maxSelections,
        voterHashes: [],
        ballots: [],
        createdAt: existingSchedule?.createdAt || now,
        createdByName: existingSchedule?.createdByName || currentActor.name,
      };
      activity = nowActivity("vote_started", currentActor.name, currentActor.email);
    }

    const category = card.category || undefined;
    const next: TaskBoardCard = {
      ...card,
      title: decisionStep === "equipment" && decisionTitle.trim() ? decisionTitle.trim() : card.title,
      category,
      completedAt: undefined,
      completedByName: undefined,
      completedByEmail: undefined,
      decisions: decisionEditingDecisionId
        ? (card.decisions || []).map((item) => item.id === decisionEditingDecisionId ? decision : item)
        : [...(card.decisions || []), decision],
      vote: decision,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, activity].slice(-30),
    };
    setSaving(true); setError("");
    try { await persistCard(next); setDecisionCardId(null); setDecisionStep(null); setDecisionEditingDecisionId(null); setMobileFilter("deciding"); }
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
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not save to-do details."); }
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

  const completeActionRound = async (card: TaskBoardCard, action?: TaskBoardActionItem) => {
    const now = Date.now();
    let nextActions = card.actions || [];

    if (action) {
      nextActions = nextActions.map((item) => item.id === action.id ? {
        ...item,
        status: "done" as const,
        completedAt: now,
        completedByName: currentActor.name,
        completedByEmail: currentActor.email,
      } : item);
    } else {
      const completedAction: TaskBoardActionItem = {
        id: id("action"),
        text: card.title,
        status: "done",
        assignees: [],
        createdAt: now,
        createdByName: currentActor.name,
        completedAt: now,
        completedByName: currentActor.name,
        completedByEmail: currentActor.email,
      };
      nextActions = [...nextActions, completedAction];
    }

    const next: TaskBoardCard = {
      ...card,
      actions: nextActions,
      actionText: undefined,
      assignee: undefined,
      assigneeEmail: undefined,
      updatedAt: now,
      updatedByName: currentActor.name,
      activities: [...card.activities, nowActivity("completed", currentActor.name, currentActor.email)].slice(-30),
    };

    setSaving(true);
    setError("");
    try { await persistCard(next); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Could not complete action."); }
    finally { setSaving(false); }
  };

  const finishTopic = async (card: TaskBoardCard) => {
    const now = Date.now();
    const nextActions = (card.actions || []).map((action) =>
      action.status === "open"
        ? { ...action, status: "done" as const, completedAt: now, completedByName: currentActor.name, completedByEmail: currentActor.email }
        : action,
    );
    const nextCard = nextActions.some((action, index) => action !== (card.actions || [])[index])
      ? { ...card, actions: nextActions }
      : card;
    await moveCardToStage(nextCard, "done");
  };

  const continueToDecide = async (card: TaskBoardCard) => {
    const next = await moveCardToStage(card, "deciding");
    if (next) startDecision(next);
  };

  const continueToAction = async (card: TaskBoardCard) => {
    if (latestOpenDecision(card)) return;
    await moveCardToStage(card, "action");
  };

  const canCurrentUserVote = (decision: TaskBoardVote) => {
    const emails = decision.participantEmails || [];
    const names = decision.participantNames || [];
    if (!emails.length && !names.length) return true;
    if (currentActor.email && emails.some((email) => email.toLowerCase() === currentActor.email?.toLowerCase())) return true;
    return names.some((name) => name.trim().toLowerCase() === currentActor.name.trim().toLowerCase());
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
      const noneOption = question.scheduleRole === "time"
        ? question.options.find((option) => option.label === "None of these work for me")
        : undefined;
      if (noneOption?.id === optionId) return { ...current, [question.id]: selected.includes(optionId) ? [] : [optionId] };
      const withoutNone = noneOption ? selected.filter((idValue) => idValue !== noneOption.id) : selected;
      if (withoutNone.includes(optionId)) return { ...current, [question.id]: withoutNone.filter((idValue) => idValue !== optionId) };
      const max = question.maxSelections || question.options.length;
      if (withoutNone.length >= max) return current;
      return { ...current, [question.id]: [...withoutNone, optionId] };
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
    excludeNames: string[] = [],
  ) => (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {availablePeople.filter((person) => !excludeNames.some((name) => name.trim().toLowerCase() === person.name.trim().toLowerCase())).map((person) => {
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

  const renderVoterScope = () => (
    <div>
      <Label>Who votes?</Label>
      <div className="mt-1.5 grid w-full min-w-0 grid-cols-2 gap-2">
        <button
          type="button"
          className={`min-w-0 whitespace-normal rounded-xl border px-2 py-2 text-xs font-semibold ${decisionVoterMode === "all" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-500"}`}
          onClick={() => { setDecisionVoterMode("all"); setDecisionPeopleKeys([]); }}
        >
          All organizers
        </button>
        <button
          type="button"
          className={`min-w-0 whitespace-normal rounded-xl border px-2 py-2 text-xs font-semibold ${decisionVoterMode === "selected" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-500"}`}
          onClick={() => setDecisionVoterMode("selected")}
        >
          Choose
        </button>
      </div>
      {decisionVoterMode === "selected" && (
        <div className="mt-2">{renderPeoplePicker(decisionPeopleKeys, setDecisionPeopleKeys, "Choose organizers")}</div>
      )}
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
    const heading = decision.title?.trim()
      || (decision.decisionType === "players"
        ? "Players"
        : decision.decisionType === "equipment"
          ? "Equipment"
          : questions.length === 1 ? questions[0].text : "Vote");
    const historyExpanded = expandedHistoryIds.has(entryKey);

    const results = (
      <div className="space-y-3">
        {decision.decisionType === "players" ? (
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-100">
            {questions.map((question, questionIndex) => <div key={question.id} className={`flex items-center gap-2 px-2.5 py-2 ${questionIndex ? "border-t border-slate-100" : ""}`}>
              <div className="min-w-0 flex-1 truncate text-xs font-medium text-[#102A43]">{question.text}</div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">{question.options.map((option) => <span key={option.id} className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 ring-1 ring-slate-200">{option.label} {option.count}</span>)}</div>
            </div>)}
          </div>
        ) : questions.map((question, questionIndex) => (
          <div key={question.id} className={questions.length > 1 ? "rounded-xl bg-slate-50 p-2.5" : ""}>
            {questions.length > 1 && <div className="mb-2 text-xs font-semibold leading-relaxed text-[#102A43]">{questionIndex + 1}. {question.text}</div>}
            {decision.decisionType === "equipment" && (question.itemQuantity !== undefined || question.itemPrice || question.itemUrl) && <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-normal text-slate-500">{question.itemQuantity !== undefined && <span>Qty {question.itemQuantity}</span>}{question.itemPrice && <span>{question.itemPrice}</span>}{question.itemPrice && question.itemQuantity !== undefined && <span className="font-medium text-slate-600">Subtotal {equipmentSubtotal(question.itemPrice, question.itemQuantity)}</span>}{question.itemUrl && <a href={question.itemUrl} target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline">Open product link</a>}</div>}
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
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <span className="min-w-0 flex-1 break-words">{option.label}{option.quantity !== undefined ? <span className="ml-1.5 text-[10px] font-normal text-slate-400">× {option.quantity}</span> : null}{option.price ? <span className="ml-1.5 text-[10px] font-normal text-slate-400">{option.price}</span> : null}{option.price && option.quantity !== undefined ? <span className="ml-1.5 text-[10px] font-medium text-slate-500">subtotal {equipmentSubtotal(option.price, option.quantity)}</span> : null}</span>
                      <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 font-medium text-[#102A43] ring-1 ring-slate-200">{option.count}</span>
                      {question.kind !== "multi-select" && <span className="w-8 text-right text-[10px] text-slate-400">{percent}%</span>}
                    </div>
                    {option.url && <a href={option.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] font-medium text-sky-700 underline">Open product link</a>}
                    {responderNames.length > 0 && <div className="mt-1 text-[10px] font-medium text-sky-700">{responderNames.join(" · ")}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {decision.outcome && <button type="button" className="w-full rounded-xl bg-emerald-50 px-3 py-2 text-left text-[11px] font-bold text-emerald-800" onClick={() => openOutcome(card, decision)}><span className="font-semibold">Note:</span> {decision.outcome}</button>}
        {!decision.outcome && !open && <button type="button" className="px-1 text-[10px] font-medium text-slate-400 hover:text-slate-600" onClick={() => openOutcome(card, decision)}>+ Add note</button>}
      </div>
    );

    const isScheduleDecision = decision.decisionType === "schedule" || decision.kind === "schedule";
    if (isCurrent && isScheduleDecision) {
      const scheduleState = decision.scheduleState || (open ? "collecting" : "finalized");
      const isHost = scheduleIsHost(decision, currentActor);
      const requestedForMe = Boolean(
        decision.requestedHostEmail && currentActor.email && decision.requestedHostEmail.toLowerCase() === currentActor.email.toLowerCase()
        || (!decision.requestedHostEmail && decision.requestedHostName?.toLowerCase() === currentActor.name.toLowerCase())
      );
      const calendarUrl = scheduleState === "finalized" ? googleCalendarUrl(card, decision) : "";
      return (
        <div key={entryKey} className="mt-1">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/35 p-3">
            {scheduleState === "waiting-host" && <>
              <div className="mt-3 rounded-xl bg-white px-3 py-3 ring-1 ring-amber-100">
                <div className="text-xs font-semibold text-[#102A43]">Waiting for host</div>
                <div className="mt-1 text-[11px] font-normal text-slate-500">{decision.hostRequestMode === "person" ? `${decision.requestedHostName || "An organizer"} has been asked to host.` : "The organizers have been asked who can host."}</div>
              </div>
              {(decision.hostRequestMode === "group" || requestedForMe) && <div className="mt-3 flex gap-2">
                <Button type="button" className="h-10 flex-1 rounded-xl bg-sky-700 text-xs font-semibold text-white hover:bg-sky-800" disabled={saving} onClick={() => void claimScheduleHost(card, decision)}>I’ll host</Button>
                {requestedForMe && <button type="button" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500" disabled={saving} onClick={() => void declineScheduleHost(card, decision)}>Decline</button>}
              </div>}
            </>}

            {scheduleState === "host-declined" && <>
              <div className="mt-3 rounded-xl bg-white px-3 py-3 ring-1 ring-amber-100">
                <div className="text-xs font-semibold text-[#102A43]">Host request declined</div>
                <div className="mt-1 text-[11px] font-normal text-slate-500">Choose Schedule again when you’re ready to ask someone else.</div>
              </div>
            </>}

            {scheduleState === "setup" && <>
              <div className="mt-3 rounded-xl bg-white px-3 py-3 ring-1 ring-sky-100">
                <div className="text-[10px] font-medium text-slate-400">Host</div>
                <div className="mt-0.5 text-sm font-semibold text-[#102A43]">{decision.hostName}</div>
              </div>
              {isHost ? <Button type="button" className="mt-3 h-10 w-full rounded-xl bg-sky-700 text-xs font-semibold text-white hover:bg-sky-800" onClick={() => openScheduleSetup(card, decision)}>Set up schedule</Button> : <div className="mt-3 text-[11px] font-normal text-slate-500">Waiting for {decision.hostName || "the host"} to propose times and locations.</div>}
            </>}

            {scheduleState === "collecting" && <>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium text-slate-500">
                {decision.hostName && <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">Host · {decision.hostName}</span>}
                {decision.participantNames?.length ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{decision.participantNames.length} participant{decision.participantNames.length === 1 ? "" : "s"}</span> : null}
              </div>
              {decision.scheduleTimeValues?.length === 1 && <div className="mt-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100"><div className="text-[10px] font-medium text-slate-400">Proposed time</div><div className="mt-0.5 text-sm font-semibold text-[#102A43]">{scheduleLabel(decision.scheduleTimeValues[0])}</div></div>}
              {decision.scheduleLocationOptions?.length === 1 && <div className="mt-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100"><div className="text-[10px] font-medium text-slate-400">Proposed location</div><div className="mt-0.5 text-sm font-semibold text-[#102A43]">{decision.scheduleLocationOptions[0]}</div></div>}
              {questions.length > 0 && <div className="mt-3">{results}</div>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {questions.length > 0 && <span className="mr-auto text-[10px] font-medium text-slate-500">{totalVoters}{decision.eligibleCount ? ` of ${decision.eligibleCount}` : ""} responded</span>}
                {questions.length > 0 && canVote && <button type="button" className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => openVoteDialog(card, decision)}>Respond</button>}
                {isHost && totalVoters === 0 && <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600" onClick={() => openScheduleSetup(card, decision)}>Edit</button>}
                {isHost && <button type="button" className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => openFinalizeSchedule(card, decision)}>Finalize</button>}
              </div>
            </>}

            {scheduleState === "finalized" && <>
              <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-amber-100">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Confirmed</div>
                <div className="mt-1 text-base font-semibold text-[#102A43]">{decision.finalizedTime ? scheduleLabel(decision.finalizedTime) : "Time confirmed"}</div>
                {decision.finalizedLocation && <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-600"><MapPin className="h-3.5 w-3.5" />{decision.finalizedLocation}</div>}
                {decision.hostName && <div className="mt-1 text-[11px] font-normal text-slate-500">Host · {decision.hostName}</div>}
                {decision.meetingUrl && <a href={decision.meetingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700"><ExternalLink className="h-3.5 w-3.5" />Open meeting link</a>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {calendarUrl && <a href={calendarUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><CalendarDays className="h-4 w-4" />Add to Google Calendar</a>}
                {online && currentNotifyTarget(card)?.notification?.status !== "sent" && <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-800" onClick={() => openNotify(card)}><Bell className="h-4 w-4" />Notify</button>}
              </div>
            </>}
          </div>
        </div>
      );
    }

    if (!isCurrent) {
      return (
        <div key={entryKey} className="relative pl-8">
          <div className={`absolute left-0 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border bg-white ${open ? "border-amber-200 text-amber-600" : "border-slate-200 text-slate-400"}`}>
            {open ? <Gavel className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </div>
          <button type="button" className="w-full rounded-xl bg-white/80 px-3 py-2.5 text-left ring-1 ring-slate-200/80 transition hover:bg-white" onClick={() => toggleHistoryExpanded(entryKey)}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 lg:text-[10px]"><span>{decisionTypeLabel(decision)} · {decision.mode === "recorded" ? "recorded" : decision.status}</span>{decision.notification?.status === "sent" && <span className="inline-flex items-center gap-0.5 text-emerald-600" title={notificationSummary(decision.notification)}><Bell className="h-2.5 w-2.5 fill-emerald-100" /><Check className="h-2.5 w-2.5" /></span>}</div>
                <div className="mt-0.5 whitespace-normal break-words text-[12px] font-semibold leading-relaxed text-[#102A43] lg:text-[14px]">{heading}</div>
                <div className="mt-1 text-[9px] font-bold text-slate-400 lg:text-[10px]">{decisionHistoryMeta(decision)} · {historyExpanded ? "Hide details" : open ? "Open details" : "View result"}</div>
              </div>
              {historyExpanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
            </div>
          </button>
          {historyExpanded && <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
            {decision.hostName && <div className="mb-1 text-[10px] font-bold text-slate-500">Host: <span className="font-semibold text-slate-700">{decision.hostName}</span></div>}
            {decision.participantNames?.length ? <div className="mb-2 text-[10px] font-bold text-slate-500"><Users className="mr-1 inline h-3 w-3" />{personSummary(decision.participantNames.map((name) => ({ name })))}</div> : null}
            {decision.mode === "recorded" ? (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Check className="mr-1 inline h-3.5 w-3.5" />{decision.outcome}</div>
            ) : open ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-[10px] font-bold text-slate-500">{totalVoters}{decision.eligibleCount ? ` of ${decision.eligibleCount}` : ""} responded</span>
                {canVote ? <button type="button" className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => openVoteDialog(card, decision)}>{decision.kind === "schedule" ? "Availability" : "Vote"}</button> : <span className="text-[10px] font-medium text-slate-400">Not asking you</span>}
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500" onClick={() => void closeVote(card, decision)}>Close</button>
              </div>
            ) : results}
          </div>}
        </div>
      );
    }

    return (
      <div key={entryKey} className="mt-1">
        {decision.mode === "recorded" ? (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><Check className="mr-1 inline h-3.5 w-3.5" />{decision.outcome}</div>
        ) : open ? (
          <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 py-2.5">
            <span className="mr-auto text-[11px] font-medium text-slate-500">{totalVoters}{decision.eligibleCount ? ` of ${decision.eligibleCount}` : ""} responded</span>
            {canVote ? <button type="button" className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => openVoteDialog(card, decision)}>Vote</button> : null}
            <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500" onClick={() => void closeVote(card, decision)}>Close</button>
          </div>
        ) : <div className="mt-2">{results}</div>}
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
    const assignees = card.people?.length ? normalizePeople(card.people) : actionPeople(action);
    const textDiffersFromCard = action.text.trim() && action.text.trim() !== card.title.trim();

    return (
      <div key={entryKey} className="relative pl-8">
        <div className="absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-sky-400 bg-white text-sky-700">
          <ClipboardList className="h-3.5 w-3.5" />
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50/35 p-3">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-sky-700">To-do details</div>
          {textDiffersFromCard && <div className="mt-1 whitespace-normal break-words text-sm font-medium leading-snug text-[#102A43] lg:text-base">{action.text}</div>}
          {assignees.length > 0 ? <div className="mt-1 text-[10px] font-medium text-sky-800"><Users className="mr-1 inline h-3 w-3" />Assigned to {personSummary(assignees)}</div> : <div className="mt-1 text-[10px] font-normal text-slate-400">No assignee yet.</div>}
        </div>
      </div>
    );
  };

  const renderCurrentChapter = (card: TaskBoardCard) => {
    const stage = stageForCard(card);
    if (stage === "deciding") {
      const decision = latestDecisionInCurrentStage(card) || latestOpenDecision(card);
      if (!decision) return null;
      const index = (card.decisions || []).findIndex((item) => item.id === decision.id);
      return renderDecision(card, decision, Math.max(0, index), true, `decision:${decision.id || index}`);
    }
    if (stage === "action") return null;
    if (stage === "done") {
      return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4" />Completed</div><div className="mt-1 text-[10px] font-normal text-slate-500">Previous decisions and to-do history are preserved in Evolution.</div></div>;
    }
    return null;
  };

  const renderEvolution = (card: TaskBoardCard) => {
    const entries = timelineEntries(card);
    const stage = stageForCard(card);
    const stageLabel = stage === "deciding" ? "Decide" : stage === "action" ? "To-do" : stage === "done" ? "Done" : "Ideas";
    const stageTone = stage === "deciding" ? "text-amber-800 bg-amber-50 ring-amber-100" : stage === "action" ? "text-sky-800 bg-sky-50 ring-sky-100" : "text-slate-600 bg-slate-50 ring-slate-200";
    return (
      <div className="relative mx-auto w-full max-w-2xl px-4 py-5 lg:px-6 lg:py-6">
        <div className="absolute bottom-10 left-[29px] top-10 w-px bg-slate-200 lg:left-[37px]" aria-hidden="true" />
        <div className="relative space-y-4">
          <div className="relative pl-10 lg:pl-12">
            <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"><Lightbulb className="h-3.5 w-3.5" /></div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Created · {formatTime(card.createdAt)}</div>
              <div className="mt-1 text-sm font-semibold text-[#102A43]">{card.title}</div>
              <div className="mt-1 text-[11px] font-normal text-slate-500">{card.createdByName ? `Added by ${card.createdByName}` : "Card created"}</div>
            </div>
          </div>
          {entries.map((entry) => entry.kind === "decision" ? (
            <div key={entry.key} className="relative pl-10 lg:pl-12">
              <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700">{entry.decision.status === "open" ? <Gavel className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/35 px-3 py-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"><span>{decisionTypeLabel(entry.decision)}</span><span className="text-amber-400">·</span><span>{formatTime(entry.createdAt)}</span></div>
                <div className="mt-1 text-sm font-semibold leading-snug text-[#102A43]">{entry.decision.title?.trim() || entry.decision.question || "Decision"}</div>
                <div className="mt-1.5 text-[11px] font-normal leading-relaxed text-slate-600">{decisionEvolutionResult(entry.decision)}</div>
                {entry.decision.hostName && <div className="mt-1 text-[10px] font-medium text-slate-500">Host · {entry.decision.hostName}</div>}
              </div>
            </div>
          ) : (
            <div key={entry.key} className="relative pl-10 lg:pl-12">
              <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700">{entry.action.status === "done" ? <Check className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}</div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/35 px-3 py-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-sky-700"><span>To-do</span><span className="text-sky-400">·</span><span>{formatTime(entry.createdAt)}</span></div>
                <div className="mt-1 text-sm font-semibold leading-snug text-[#102A43]">{entry.action.text}</div>
                {actionPeople(entry.action).length > 0 && <div className="mt-1 text-[10px] font-medium text-slate-500"><Users className="mr-1 inline h-3 w-3" />{personSummary(actionPeople(entry.action))}</div>}
                <div className="mt-1.5 text-[11px] font-normal text-slate-600">{entry.action.status === "done" ? `Completed${entry.action.completedByName ? ` by ${entry.action.completedByName}` : ""}` : "Open"}</div>
              </div>
            </div>
          ))}
          <div className="relative pl-10 lg:pl-12">
            <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[#102A43]"><ChevronRight className="h-3.5 w-3.5" /></div>
            <div className={`rounded-2xl px-3 py-3 ring-1 ${stageTone}`}><div className="text-[10px] font-medium uppercase tracking-wide opacity-70">Now</div><div className="mt-1 text-sm font-semibold">{stageLabel}</div></div>
          </div>
        </div>
      </div>
    );
  };

  const renderStageTools = (card: TaskBoardCard, stage: TopicStage) => {
    const openDecision = latestOpenDecision(card);
    const currentDecision = latestDecisionInCurrentStage(card);

    if (stage === "deciding") {
      if (openDecision) return null;
      if (!currentDecision) {
        return (
          <button type="button" className="mt-3 w-full rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs font-semibold text-amber-900" onClick={() => startDecision(card)}>
            Start decision
          </button>
        );
      }

      const repeatLabel = repeatDecisionLabel(currentDecision);
      return (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/55 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900"><CheckCircle2 className="h-4 w-4" />Decision complete</div>
          <div className="mt-1 text-[10px] font-medium leading-relaxed text-amber-800/75">{repeatLabel ? "Continue here if this topic needs another round, or move the card when you are ready." : "This decision is finished. Move the card when you are ready."}</div>
          <div className={`mt-3 grid gap-2 ${repeatLabel ? "grid-cols-2" : "grid-cols-1"}`}>
            {repeatLabel && <button type="button" className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-[11px] font-semibold text-amber-900" onClick={() => startDecision(card, currentDecision.decisionType || (currentDecision.kind === "schedule" ? "schedule" : "vote"))}>{repeatLabel}</button>}
            <button type="button" className="h-10 rounded-xl bg-[#102A43] px-3 text-[11px] font-semibold text-white" onClick={() => openMoveCard(card)}>Move card</button>
          </div>
        </div>
      );
    }

    if (stage === "action") {
      // To-do completion is intentionally handled by moving the card to Done.
      // Assignees, due date, note and links are optional card metadata, not a separate action workflow.
      return null;
    }
    return null;
  };

  const renderComments = (card: TaskBoardCard, detail = false) => {
    const comments = [...(card.comments || [])].sort((a, b) => a.createdAt - b.createdAt);
    const draft = commentDrafts[card.id] || "";
    const busy = commentSavingCardId === card.id;
    return (
      <section className="mt-5 border-t border-slate-200 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#102A43]"><MessageCircle className="h-4 w-4 text-slate-500" />Comments{comments.length ? <span className="text-xs font-medium text-slate-400">· {comments.length}</span> : null}</div>
          <div className="text-[10px] font-normal text-slate-400">Keep useful context with the card.</div>
        </div>

        <div className="space-y-3">
          {comments.length === 0 && <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-xs font-normal text-slate-400">No comments yet.</div>}
          {comments.map((comment) => {
            const mine = commentIsMine(comment);
            const editing = editingCommentId === comment.id;
            return (
              <div key={comment.id} className="group rounded-2xl bg-slate-50/80 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-xs font-semibold text-[#102A43]">{comment.authorName}</span>
                      <span className="text-[10px] font-normal text-slate-400">{formatTime(comment.createdAt)}{comment.updatedAt ? " · edited" : ""}</span>
                    </div>
                  </div>
                  {mine && !editing && <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-600" onClick={() => beginEditComment(comment)} aria-label="Edit comment"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-red-600" onClick={() => void removeComment(card, comment)} aria-label="Delete comment"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>}
                </div>
                {editing ? (
                  <div className="mt-2">
                    <Textarea value={editingCommentText} onChange={(event) => setEditingCommentText(event.target.value)} maxLength={3000} rows={3} className="min-h-[5rem] resize-none rounded-xl border-slate-200 bg-white text-sm font-normal leading-relaxed text-slate-700" />
                    <div className="mt-2 flex items-center gap-2">
                      <Button type="button" className="h-8 rounded-xl px-3 text-xs font-semibold text-white" style={{ backgroundColor: accent }} disabled={!editingCommentText.trim() || busy} onClick={() => void saveEditedComment(card, comment)}>Save</Button>
                      <button type="button" className="h-8 rounded-xl px-2 text-xs font-medium text-slate-400 hover:bg-white hover:text-slate-600" onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}>Cancel</button>
                    </div>
                  </div>
                ) : <div className="mt-1 whitespace-pre-wrap break-words text-sm font-normal leading-relaxed text-slate-700">{linkifyCommentText(comment.text)}</div>}
              </div>
            );
          })}
        </div>

        <div className={`${detail ? "sticky bottom-0 z-[5] -mx-4 mt-4 border-t border-slate-200 bg-white/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur" : "mt-4"}`}>
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setCommentDrafts((current) => ({ ...current, [card.id]: event.target.value }))}
              maxLength={3000}
              rows={2}
              placeholder="Write a comment…"
              aria-label={`Comment on ${card.title}`}
              className="min-h-[3.25rem] flex-1 resize-none rounded-2xl border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-normal leading-relaxed text-slate-700 shadow-none focus-visible:ring-blue-100"
            />
            <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#102A43] text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40" disabled={!draft.trim() || busy} onClick={() => void submitComment(card)} aria-label="Post comment"><Send className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
    );
  };

  const renderCard = (card: TaskBoardCard, compact = false, detail = false) => {
    const stage = stageForCard(card);
    const expanded = detail || expandedIds.has(card.id);
    const openDecision = latestOpenDecision(card);
    const decisions = card.decisions || [];
    const actions = card.actions || [];
    const currentDecision = latestDecisionInCurrentStage(card);
    const decisionComplete = stage === "deciding" && !openDecision && Boolean(currentDecision);
    const displayPeople = card.people || [];
    const alreadyVoted = Boolean(openDecision && currentVoterHash && (
      openDecision.ballots?.some((ballot) => ballot.voterHash === currentVoterHash)
      || openDecision.voterHashes?.includes(currentVoterHash)
    ));
    const needsYourVote = Boolean(openDecision && currentVoterHash && canCurrentUserVote(openDecision) && !alreadyVoted);
    const cardNotifyTarget = currentNotifyTarget(card);
    const cardNotification = cardNotifyTarget?.notification;
    const cardNotificationSent = cardNotification?.status === "sent";
    const cardNotificationQueued = cardNotification?.status === "queued";
    const stageStyle = stage === "deciding"
      ? "border-amber-200"
      : stage === "action"
        ? "border-sky-200"
        : stage === "done"
          ? "border-slate-200 bg-slate-50/70"
          : "border-slate-200";

    return (
      <article
        key={card.id}
        draggable={!detail && !isMobileBoardViewport()}
        onDragStart={(event) => { if (detail) return; setDraggingCardId(card.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); }}
        onDragEnd={() => { setDraggingCardId(null); setDragOverStage(null); }}
        className={detail ? "min-h-full bg-white" : `overflow-hidden rounded-2xl border bg-white shadow-sm transition ${stageStyle} ${compact ? "" : "lg:rounded-[1.35rem]"} ${draggingCardId === card.id ? "opacity-25 ring-2 ring-slate-300" : ""}`}
      >
        {!detail && <div className="p-2.5 lg:p-3">
          <div className="flex items-start gap-2">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openCardDetail(card)}>
              <h3 className="whitespace-normal break-words text-[14px] font-semibold leading-snug text-[#102A43] lg:text-[17px] lg:leading-snug">{card.title}</h3>
              {(card.category || card.dueDate || displayPeople.length > 0 || (card.comments?.length || 0) > 0 || decisionComplete || needsYourVote || openDecision) && <div className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
                {card.category && <span className={`max-w-[28%] shrink truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 lg:text-[10px] ${tagTone(card.category)}`}>{card.category}</span>}
                {card.dueDate && <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium lg:text-[10px] ${isOverdue(card.dueDate) && stage !== "done" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}><CalendarDays className="h-3 w-3" />{dueText(card.dueDate)}</span>}
                {displayPeople.length > 0 && <span className="inline-flex min-w-0 max-w-[30%] shrink items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 lg:text-[10px]"><Users className="h-3 w-3 shrink-0" /><span className="truncate">{personSummary(displayPeople)}</span></span>}
                {(card.comments?.length || 0) > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 lg:text-[10px]" title={`${card.comments!.length} comment${card.comments!.length === 1 ? "" : "s"}`}><MessageCircle className="h-3 w-3" />{card.comments!.length}</span>}
                {needsYourVote && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 ring-1 ring-amber-200 lg:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-amber-600" />Your vote</span>}
                {decisionComplete && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 ring-1 ring-amber-200 lg:text-[10px]"><Check className="h-3 w-3" />Complete</span>}
                {openDecision && <span className="ml-auto shrink-0 text-[9px] font-medium text-slate-400 lg:text-[10px]">{voteTotal(openDecision)}{openDecision.eligibleCount ? `/${openDecision.eligibleCount}` : ""} responded</span>}
              </div>}
            </button>
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              {online && cardNotifyTarget && (
                cardNotificationSent ? (
                  <span className="relative rounded-full bg-emerald-50 p-1.5 text-emerald-700" title={notificationSummary(cardNotification)} aria-label={notificationSummary(cardNotification) || "Notified"}>
                    <Bell className="h-3.5 w-3.5 fill-emerald-100" /><span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-2 w-2" /></span>
                  </span>
                ) : (
                  <button type="button" className={`rounded-full p-1.5 ${cardNotificationQueued ? "cursor-wait bg-amber-50 text-amber-600" : "text-slate-400 hover:bg-amber-50 hover:text-amber-700"}`} onClick={() => openNotify(card)} disabled={cardNotificationQueued} aria-label={cardNotificationQueued ? "Notification is being sent" : `Notify organizers about ${cardNotifyTarget.label.toLowerCase()}`} title={cardNotificationQueued ? "Sending notification…" : "Notify organizers"}><Bell className={`h-3.5 w-3.5 ${cardNotificationQueued ? "animate-pulse" : ""}`} /></button>
                )
              )}
              <button type="button" className="rounded-full px-1.5 py-1 text-[9px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600" onClick={() => openMoveCard(card)} aria-label={`Move ${card.title}`}>Move</button>
              <button type="button" className="hidden rounded-full p-1.5 text-slate-400 hover:bg-slate-50 lg:block" onClick={() => toggleExpanded(card.id)} aria-label={expanded ? "Collapse topic" : "Expand topic"}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
            </div>
          </div>
        </div>}

        {expanded && <div className={detail ? "bg-white px-4 pb-24 pt-5" : "border-t border-slate-100 bg-slate-50/35 px-3 pb-3 pt-3"}>
          {detail && <div className="mb-4">
            <h2 className="whitespace-normal break-words text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[#102A43]">{card.title}</h2>
          </div>}

          {card.note?.trim() && <div className="mb-3 rounded-2xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Note</div><p className="mt-1 whitespace-pre-wrap break-words text-sm font-normal leading-relaxed text-slate-700">{card.note.trim()}</p></div>}

          {stage !== "done" && <div className="mb-3 flex flex-wrap gap-1.5">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" onClick={() => openEditCard(card, "note")}><Pencil className="h-3.5 w-3.5" />{card.note?.trim() ? "Edit note" : "Note"}</button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" onClick={() => openEditCard(card, "assignees")}><Users className="h-3.5 w-3.5" />{displayPeople.length ? `Assignees · ${displayPeople.length}` : "Assignees"}</button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" onClick={() => openEditCard(card, "due")}><CalendarDays className="h-3.5 w-3.5" />{card.dueDate ? dueText(card.dueDate) : "Due date"}</button>
            {(card.links?.length || 0) < 5 && <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" onClick={() => openAddLink(card)}><Link2 className="h-3.5 w-3.5" />Link</button>}
          </div>}

          {(card.links?.length || 0) > 0 && <div className="mb-3 grid gap-1.5">
            {card.links?.map((link) => <div key={link.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-slate-700"><Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{link.label}</span><ExternalLink className="h-3 w-3 shrink-0 text-slate-400" /></a>{stage !== "done" && <button type="button" className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" onClick={() => void removeLink(card, link.id)} aria-label={`Remove ${link.label}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}
          </div>}

          {(decisions.length > 0 || actions.length > 0) && <div className="mb-3 flex justify-end"><button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50" onClick={() => setEvolutionCardId(card.id)}><History className="h-3.5 w-3.5" />Evolution · {evolutionStepCount(card)}</button></div>}
          {renderCurrentChapter(card)}
          {renderStageTools(card, stage)}
          {!(stage === "deciding" && !openDecision && Boolean(currentDecision)) && <button type="button" className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-semibold text-slate-600" onClick={() => openMoveCard(card)}>Move card</button>}
          {renderComments(card, detail)}
        </div>}
      </article>
    );
  };

  const boardColumn = (stage: TopicStage, title: string, Icon: React.ComponentType<{ className?: string }>, mobile = false) => {
    const canAdd = stage !== "done";
    const addPlaceholder = stage === "ideas"
      ? "Add an idea…"
      : stage === "deciding"
        ? "What needs a decision?"
        : "What needs doing?";

    return (
      <section
        ref={mobile ? (element) => { mobileColumnRefs.current[stage] = element; } : undefined}
        data-board-stage={stage}
        onDragOver={(event) => { event.preventDefault(); setDragOverStage(stage); }}
        onDragLeave={() => { if (dragOverStage === stage) setDragOverStage(null); }}
        onDrop={(event) => {
          event.preventDefault();
          const cardId = event.dataTransfer.getData("text/plain") || draggingCardId;
          const card = board.cards.find((item) => item.id === cardId);
          setDraggingCardId(null);
          setDragOverStage(null);
          if (card && stageForCard(card) !== stage) void moveCardToStage(card, stage);
        }}
        className={`${mobile ? "w-[82vw] max-w-[22rem] shrink-0 snap-center" : "min-w-0"} rounded-[1.35rem] border p-2.5 transition ${dragOverStage === stage ? "ring-2 ring-slate-300" : ""} ${stage === "deciding" ? "border-amber-200 bg-amber-50/35" : stage === "action" ? "border-sky-200 bg-sky-50/35" : stage === "done" ? "border-slate-200 bg-slate-100/50" : "border-slate-200 bg-white/55"}`}
      >
        <div className={`mb-2 flex items-center gap-1.5 px-1 text-[15px] font-semibold lg:text-[16px] ${stage === "deciding" ? "text-amber-800" : stage === "action" ? "text-sky-800" : stage === "done" ? "text-slate-500" : "text-slate-700"}`}><Icon className="h-4 w-4 lg:h-[18px] lg:w-[18px]" /><span>{title}</span><span className="ml-0.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] lg:px-2 lg:text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200/70">{cardsByStage[stage].length}</span></div>
        <div className="space-y-2">
          {cardsByStage[stage].map((card) => renderCard(card, true))}
          {cardsByStage[stage].length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-2 py-5 text-center text-[10px] font-medium text-slate-400 lg:text-xs">{stage === "ideas" ? "No ideas yet" : stage === "deciding" ? "Nothing to decide yet" : stage === "action" ? "No to-dos here" : "Nothing completed yet"}</div>}

          {canAdd && (quickAddStage === stage ? (
            <form className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" onSubmit={(event) => { event.preventDefault(); void createQuickTopic(stage); }}>
              <Input
                ref={(element) => { quickAddInputRefs.current[stage] = element; }}
                value={quickAddTitle}
                onChange={(event) => setQuickAddTitle(event.target.value)}
                maxLength={220}
                placeholder={addPlaceholder}
                aria-label={`Add card to ${title}`}
                className="h-9 rounded-xl border-slate-200 bg-slate-50/70 px-2.5 text-sm font-medium text-[#102A43] shadow-none focus-visible:ring-blue-100"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button type="submit" className="h-8 rounded-xl px-3 text-xs font-semibold text-white" style={{ backgroundColor: accent }} disabled={!quickAddTitle.trim() || saving}>{saving ? "Adding…" : "Add"}</Button>
                <button type="button" className="h-8 rounded-xl px-2 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600" onClick={() => { setQuickAddStage(null); setQuickAddTitle(""); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button type="button" className="flex h-9 w-full items-center gap-1.5 rounded-xl px-2 text-left text-xs font-medium text-slate-500 transition hover:bg-white/80 hover:text-slate-700" onClick={() => focusQuickAdd(stage)}><Plus className="h-3.5 w-3.5" />Add card</button>
          ))}
        </div>
      </section>
    );
  };

  const customBoardName = board.meta?.customName?.trim();
  const decisionSetupCard = board.cards.find((card) => card.id === decisionCardId);
  const decisionPhaseNameRequired = false;
  const decisionPhaseNameValid = true;
  const genericQuestionsValid = decisionQuestionsDraft.length > 0 && decisionQuestionsDraft.every((draft) => {
    const labels = voteOptionLabels(draft.kind, draft.options);
    return Boolean(draft.text.trim()) && labels.length >= 2;
  });
  const decisionVoterValid = decisionVoterMode === "all" ? availablePeople.length > 0 : decisionPeopleKeys.length > 0;
  const playerAnswersValid = answerLabels(playerAnswerOptions, []).length >= 2;
  const equipmentItemsForSetup = equipmentDraftItems.filter((item) => item.name.trim());
  const equipmentItemsValid = equipmentItemsForSetup.length >= (equipmentVoteMode === "choose" ? 2 : 1)
    && equipmentItemsForSetup.every((item) => !item.url.trim() || validHttpUrl(item.url));
  const equipmentAnswersValid = equipmentVoteMode === "choose" || answerLabels(equipmentAnswerOptions, []).length >= 2;
  const scheduleOptionsCount = scheduleSlotValues(scheduleDates).length;
  const scheduleLocationCount = scheduleLocationValues(scheduleLocations).length;
  const scheduleHostParticipantCount = scheduleParticipantMode === "all"
    ? availablePeople.filter((person) => person.name.toLowerCase() !== scheduleHostName.toLowerCase()).length
    : peopleFromKeys(decisionPeopleKeys).filter((person) => person.name.toLowerCase() !== scheduleHostName.toLowerCase()).length;
  const scheduleNeedsPoll = scheduleOptionsCount > 1 || scheduleLocationCount > 1;
  const decisionSetupValid = decisionMode === "recorded"
    ? Boolean(decisionOutcome.trim())
    : decisionStep === "schedule"
      ? Boolean(decisionEditingDecisionId) && Boolean(scheduleHostName.trim()) && scheduleHostParticipantCount > 0 && scheduleOptionsCount >= 1 && scheduleLocationCount >= 1
      : decisionStep === "players"
        ? selectedPlayerIds.length >= 1 && playerAnswersValid && decisionVoterValid
        : decisionStep === "equipment"
          ? Boolean(decisionTitle.trim()) && equipmentItemsValid && equipmentAnswersValid && decisionVoterValid
          : decisionStep === "vote"
            ? genericQuestionsValid && decisionVoterValid
            : false;

  const finalizeScheduleCard = board.cards.find((card) => card.id === finalizeScheduleCardId);
  const finalizeScheduleDecision = finalizeScheduleCard?.decisions?.find((decision) => decision.id === finalizeScheduleDecisionId);
  const evolutionCard = board.cards.find((card) => card.id === evolutionCardId);

  return (
    <>
      <section className="overflow-hidden rounded-[1.7rem] border p-3 shadow-sm lg:p-4" style={{ borderColor: mixHex(accent, "#ffffff", 0.72), background }}>
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:scale-[0.99]" onClick={openBoard}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 shadow-sm ring-1 ring-white/80 lg:h-10 lg:w-10" style={{ color: accent }}>
              <ClipboardList className="fairteams-desktop-balanced-icon h-[18px] w-[18px] lg:h-6 lg:w-6" />
            </div>
            <span className="min-w-0">
              <span className="block text-[17px] font-black leading-tight text-[#102A43] lg:text-[20px]">Action Board</span>
              <span className="mt-0.5 block truncate text-[10px] font-bold text-slate-500 lg:text-[12px]">
                {customBoardName || (online ? "Tasks · Votes · Decisions · Shared" : isSharedRoster ? "Tasks · Votes · Decisions · Sign in" : "Tasks · Votes · Decisions")}
              </span>
            </span>
          </button>
          <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 shadow-sm ring-1 ring-white/80 active:scale-[0.98] lg:hidden" style={{ color: accent }} onClick={openBoard} aria-label="Open Action Board">
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button type="button" className="hidden h-9 shrink-0 rounded-2xl px-3 text-xs font-black text-white lg:inline-flex lg:text-sm" style={{ backgroundColor: accent }} onClick={openBoard}>Open</Button>
        </div>
        <div className="mt-3 hidden items-center gap-2 text-[10px] font-black text-slate-600 lg:flex lg:text-xs">
          {hasNewActivity && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />New activity</span>}
          <span className="rounded-full bg-white/75 px-2.5 py-1">{online ? "Shared" : isSharedRoster ? "Sign in" : "Private"}</span>
        </div>
        {latestActivity && <div className="mt-2 hidden truncate text-[10px] font-bold text-slate-500 lg:block lg:text-xs">Last: “{latestActivity.card.title}” · {activityText(latestActivity.activity)}</div>}
      </section>

      <Dialog open={boardOpen} onOpenChange={(open) => { setBoardOpen(open); if (!open) setActiveCardId(null); }}>
        <DialogContent className="fixed inset-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:inset-3 sm:h-[calc(100dvh-1.5rem)] sm:w-auto sm:rounded-[2rem] sm:border sm:border-white/70 sm:shadow-2xl lg:inset-6 lg:h-[calc(100dvh-3rem)] lg:rounded-[2rem]">
          <DialogHeader className="shrink-0 border-b border-white/45 px-3 py-2.5 pr-12 text-left lg:px-5 lg:py-3 lg:pr-14" style={{ backgroundColor: mixHex(accent, "#ffffff", 0.7) }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <DialogTitle className="shrink-0 text-[17px] font-semibold text-[#102A43] lg:text-[20px] lg:leading-tight">Action Board</DialogTitle>
                  {customBoardName && <span className="truncate rounded-full bg-white/65 px-2 py-0.5 text-[9px] font-medium text-slate-500 ring-1 ring-white/80 lg:text-[10px]">{customBoardName}</span>}
                </div>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 lg:text-[11px]"><span className="lg:hidden">Tap <span className="font-semibold text-slate-700">Move</span> to change a card’s column.</span><span className="hidden lg:inline">Drag cards between columns, or use <span className="font-semibold text-slate-700">Move</span>.</span></p>
              </div>
              <Button type="button" variant="outline" className="h-8 w-8 shrink-0 rounded-xl bg-white/80 p-0 lg:h-9 lg:w-9" onClick={() => { setNotifyError(""); setBoardNameDraft(customBoardName || ""); setBoardSettingsOpen(true); }} aria-label="Board settings" title="Board settings"><Settings className="h-4 w-4" /></Button>
            </div>
          </DialogHeader>



          {error && <div className="mx-3 mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 lg:mx-5">{error}</div>}

          <div className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: background }}>
            {loading ? <div className="p-8 text-center text-sm font-semibold text-slate-500">Loading Action Board…</div> : (
              <>
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[9vw] py-3 pb-20 scroll-smooth lg:hidden" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}>
                  {boardColumn("ideas", "Ideas", Lightbulb, true)}
                  {boardColumn("deciding", "Decide", Gavel, true)}
                  {boardColumn("action", "To-do", ClipboardList, true)}
                  {boardColumn("done", "Done", Check, true)}
                </div>
                <div className="hidden w-full grid-cols-4 gap-3 p-4 pb-16 lg:grid xl:gap-4 xl:p-5">
                  {boardColumn("ideas", "Ideas", Lightbulb)}
                  {boardColumn("deciding", "Decide", Gavel)}
                  {boardColumn("action", "To-do", ClipboardList)}
                  {boardColumn("done", "Done", Check)}
                </div>
              </>
            )}
          </div>



          {activeCardId && (() => {
            const activeCard = board.cards.find((card) => card.id === activeCardId);
            if (!activeCard) return null;
            const activeStage = stageForCard(activeCard);
            const stageLabel = activeStage === "deciding" ? "Decide" : activeStage === "action" ? "To-do" : activeStage === "done" ? "Done" : "Idea";
            return (
              <div className="absolute inset-0 z-40 flex flex-col bg-white lg:hidden">
                <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 py-2.5 backdrop-blur">
                  <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#102A43] active:bg-slate-100" onClick={closeCardDetail} aria-label="Back to Action Board">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stageLabel}</div>
                  </div>
                  <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-slate-500 active:bg-slate-100" onClick={() => openEditCard(activeCard)} aria-label="Edit card">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
                  {renderCard(activeCard, false, true)}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(evolutionCardId)} onOpenChange={(open) => { if (!open) setEvolutionCardId(null); }}>
        <DialogContent className="fixed inset-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:inset-3 sm:h-[calc(100dvh-1.5rem)] sm:w-auto sm:rounded-[2rem] sm:border sm:border-slate-200 sm:shadow-2xl lg:left-1/2 lg:right-auto lg:top-1/2 lg:h-[min(86dvh,52rem)] lg:w-[min(46rem,calc(100vw-3rem))] lg:-translate-x-1/2 lg:-translate-y-1/2">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 pr-12 text-left lg:px-5 lg:py-4">
            <div className="flex items-center gap-2"><button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#102A43] hover:bg-slate-100" onClick={() => setEvolutionCardId(null)} aria-label="Back to card"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0"><DialogTitle className="flex items-center gap-2 text-base font-semibold text-[#102A43] lg:text-xl"><History className="h-4 w-4 text-slate-500 lg:h-5 lg:w-5" />Evolution</DialogTitle>{evolutionCard && <p className="mt-0.5 truncate text-[11px] font-normal text-slate-500 lg:text-sm">{evolutionCard.title}</p>}</div></div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">{evolutionCard ? renderEvolution(evolutionCard) : <div className="p-8 text-center text-sm text-slate-500">Card history is unavailable.</div>}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={newTopicOpen} onOpenChange={(open) => { setNewTopicOpen(open); if (!open) resetNewTopic(); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[88dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 lg:max-w-xl lg:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43] lg:text-xl">{newTopicKind ? (newTopicKind === "idea" ? "New idea" : newTopicKind === "decide" ? "New decision" : "New to-do") : "Create"}</DialogTitle></DialogHeader>
          {!newTopicKind ? (
            <div className="grid gap-2.5 lg:gap-3.5">
              <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:bg-slate-50 lg:p-5" onClick={() => setNewTopicKind("idea")}>
                <div className="flex items-start gap-3 lg:gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 lg:h-12 lg:w-12 lg:rounded-2xl"><Lightbulb className="h-5 w-5 lg:h-6 lg:w-6" /></div><div><div className="text-sm font-black text-[#102A43] lg:text-base">Idea</div><div className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-sm">Save something worth thinking about later.</div><div className="mt-1 text-[10px] font-bold text-slate-400 lg:text-xs">Example: Club jerseys</div></div></div>
              </button>
              <button type="button" className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left transition hover:bg-amber-50 lg:p-5" onClick={() => setNewTopicKind("decide")}>
                <div className="flex items-start gap-3 lg:gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-100 lg:h-12 lg:w-12 lg:rounded-2xl"><Gavel className="h-5 w-5 lg:h-6 lg:w-6" /></div><div><div className="text-sm font-black text-[#102A43] lg:text-base">Decide</div><div className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-sm">Ask people to choose, schedule or agree on something.</div><div className="mt-1 text-[10px] font-bold text-slate-400 lg:text-xs">Example: Which players become members?</div></div></div>
              </button>
              <button type="button" className="min-w-0 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left transition hover:bg-sky-50 lg:p-5" onClick={() => setNewTopicKind("action")}>
                <div className="flex items-start gap-3 lg:gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-800 ring-1 ring-sky-100 lg:h-12 lg:w-12 lg:rounded-2xl"><Hand className="h-5 w-5 lg:h-6 lg:w-6" /></div><div><div className="text-sm font-black text-[#102A43] lg:text-base">To-do</div><div className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500 lg:text-sm">Something important needs to get done.</div><div className="mt-1 text-[10px] font-bold text-slate-400 lg:text-xs">Example: Contact the new members</div></div></div>
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
              <Button type="button" className="h-11 rounded-2xl font-black text-white lg:h-12 lg:text-base" style={{ backgroundColor: accent }} disabled={!newTitle.trim() || saving} onClick={() => void createTopic()}>{saving ? "Saving…" : newTopicKind === "idea" ? "Save idea" : newTopicKind === "decide" ? "Continue to decision" : "Create to-do"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(decisionCardId)} onOpenChange={(open) => { if (!open) { setDecisionCardId(null); setDecisionStep(null); setDecisionEditingDecisionId(null); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto box-border min-w-0 max-h-[90dvh] w-auto max-w-[calc(100vw-1rem)] translate-x-0 translate-y-0 overflow-x-hidden overflow-y-auto rounded-[2rem] p-4 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 lg:max-w-2xl lg:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43] lg:text-xl">{decisionStep === "schedule" ? (decisionEditingDecisionId ? "Set up schedule" : "Schedule") : decisionStep ? "Set up decision" : "What kind of decision?"}</DialogTitle></DialogHeader>
          {!decisionStep ? (
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <button type="button" className="min-w-0 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("vote")}><Vote className="h-5 w-5 text-amber-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Vote</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">One or more questions</div></button>
              <button type="button" className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("schedule")}><CalendarDays className="h-5 w-5 text-sky-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Schedule</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">Find a time together</div></button>
              <button type="button" className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("players")}><Users className="h-5 w-5 text-emerald-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Players</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">Choose from roster</div></button>
              <button type="button" className="min-w-0 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left lg:p-5" onClick={() => chooseDecisionType("equipment")}><ClipboardList className="h-5 w-5 text-amber-700" /><div className="mt-2 text-sm font-black text-[#102A43] lg:text-base">Equipment</div><div className="mt-1 text-[11px] font-semibold text-slate-500 lg:text-sm">Inventory · compare · choose</div></button>
            </div>
          ) : (
            <div className="grid w-full max-w-full min-w-0 gap-3 overflow-x-hidden [&>*]:min-w-0">
              <button type="button" className="w-fit max-w-full text-[11px] font-black text-slate-500" onClick={() => setDecisionStep(null)}>← Change type</button>

              {decisionStep === "vote" && <div className="grid w-full min-w-0 grid-cols-2 rounded-2xl bg-slate-100 p-1">
                <button type="button" className={`min-w-0 whitespace-normal rounded-xl px-2 py-2 text-xs font-semibold ${decisionMode === "vote" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDecisionMode("vote")}><Vote className="mr-1 inline h-3.5 w-3.5" />Vote together</button>
                <button type="button" className={`min-w-0 whitespace-normal rounded-xl px-2 py-2 text-xs font-semibold ${decisionMode === "recorded" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDecisionMode("recorded")}><Check className="mr-1 inline h-3.5 w-3.5" />Record decision</button>
              </div>}

              {decisionMode === "recorded" ? (
                <>
                  {decisionPhaseNameRequired && <div><Label htmlFor="decision-recorded-name">Decision name</Label><Input id="decision-recorded-name" value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} maxLength={120} placeholder="What is this next decision about?" /></div>}
                  <div><Label htmlFor="decision-outcome">What was decided?</Label><Textarea id="decision-outcome" value={decisionOutcome} onChange={(event) => setDecisionOutcome(event.target.value)} rows={3} maxLength={300} placeholder="We will buy the Select Brillant ball." /></div>
                </>
              ) : (
                <>
                  {decisionStep === "schedule" ? <>
                    {!decisionEditingDecisionId ? (
                      <div className="grid gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#102A43]">Who will host this?</div>
                          <div className="mt-1 text-[11px] font-normal text-slate-500">Choose the person who will own the time, place and final confirmation.</div>
                        </div>
                        <div className="grid min-w-0 grid-cols-1 gap-2 min-[390px]:grid-cols-3">
                          <button type="button" className="min-w-0 whitespace-normal rounded-2xl border border-sky-200 bg-sky-50 px-2 py-3 text-center text-xs font-semibold text-sky-900" disabled={saving || !decisionSetupCard} onClick={() => { if (decisionSetupCard) void createScheduleForHost(decisionSetupCard, currentActor); }}>Me</button>
                          <button type="button" className={`min-w-0 whitespace-normal rounded-2xl border px-2 py-3 text-center text-xs font-semibold ${scheduleHostChoice === "person" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setScheduleHostChoice("person")}>Someone else</button>
                          <button type="button" className="min-w-0 whitespace-normal rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-semibold text-slate-700" disabled={saving || otherOrganizerPeople.length === 0} onClick={() => void requestScheduleHost("group")}>Ask group</button>
                        </div>
                        {scheduleHostChoice === "person" && <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                          <Label>Choose host</Label>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {scheduleHostPeople().filter((person) => personKey(person) !== personKey(currentActor)).map((person) => {
                              const key = personKey(person);
                              const selected = scheduleRequestedHostKey === key;
                              return <button key={key} type="button" className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold ring-1 ${selected ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-white text-slate-600 ring-slate-200"}`} onClick={() => setScheduleRequestedHostKey(key)}>{selected && <Check className="mr-1 inline h-3 w-3" />}{person.name}</button>;
                            })}
                          </div>
                          <Button type="button" className="mt-3 h-10 w-full rounded-xl bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700" disabled={!scheduleRequestedHostKey || saving} onClick={() => void requestScheduleHost("person")}>Ask them to host</Button>
                        </div>}
                        <div className="text-[10px] font-normal leading-relaxed text-slate-400">Someone else gets a host request. Ask group pings the other organizers and the first person to take it becomes host.</div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label htmlFor="schedule-title">What are you scheduling? <span className="font-normal text-slate-400">optional</span></Label>
                          <Input id="schedule-title" value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} maxLength={120} placeholder={decisionSetupCard?.title || "Board meeting"} />
                        </div>
                        <div className="rounded-2xl bg-sky-50 px-3 py-2.5 text-xs text-sky-900"><span className="font-semibold">Host:</span> {scheduleHostName}</div>
                        <div>
                          <Label>Participants</Label>
                          <div className="mt-1.5 flex rounded-2xl bg-slate-100 p-1">
                            <button type="button" className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${scheduleParticipantMode === "all" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setScheduleParticipantMode("all")}>All</button>
                            <button type="button" className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${scheduleParticipantMode === "selected" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setScheduleParticipantMode("selected")}>Choose</button>
                          </div>
                          {scheduleParticipantMode === "selected" && <div className="mt-2">{renderPeoplePicker(decisionPeopleKeys, setDecisionPeopleKeys, "Who should respond?", [scheduleHostName])}</div>}
                          {scheduleParticipantMode === "all" && <div className="mt-1 text-[10px] font-normal text-slate-400">All other organizers will be asked.</div>}
                        </div>
                        <div>
                          <Label>Possible dates & times</Label>
                          <div className="mt-1 text-[10px] font-normal text-slate-400">One option is simply proposed. Two or more automatically become an availability poll, including “None of these work for me”.</div>
                          <div className="mt-1.5 grid gap-2">
                            {scheduleDates.map((group) => <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-2.5">
                              <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                <Input className="w-full min-w-0 max-w-full" type="date" value={group.date} onChange={(event) => updateScheduleDate(group.id, { date: event.target.value })} />
                                <button type="button" className="rounded-xl border border-slate-200 p-2 text-slate-400" onClick={() => setScheduleDates((current) => current.filter((item) => item.id !== group.id))} disabled={scheduleDates.length <= 1} aria-label="Remove date"><Trash2 className="h-4 w-4" /></button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {group.times.map((time, timeIndex) => <div key={`${group.id}-${timeIndex}`} className="flex items-center gap-1">
                                  <Input
                                    value={time}
                                    onChange={(event) => updateScheduleDate(group.id, { times: group.times.map((item, index) => index === timeIndex ? event.target.value : item) })}
                                    onBlur={(event) => { const normalized = normalizeTypedTime(event.target.value); if (normalized) updateScheduleDate(group.id, { times: group.times.map((item, index) => index === timeIndex ? normalized : item) }); }}
                                    inputMode="numeric"
                                    maxLength={5}
                                    placeholder="19:30"
                                    aria-label="Preferred time"
                                    className="h-10 w-[5.75rem] rounded-xl border-slate-200 bg-white px-2 text-center text-sm font-medium text-[#102A43]"
                                  />
                                  <button type="button" className="rounded-lg p-2 text-slate-400" onClick={() => updateScheduleDate(group.id, { times: group.times.filter((_, index) => index !== timeIndex) })} disabled={group.times.length <= 1} aria-label="Remove time"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>)}
                                <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-600" onClick={() => updateScheduleDate(group.id, { times: [...group.times, ""] })}>+ Time</button>
                              </div>
                            </div>)}
                          </div>
                          <button type="button" className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-600" onClick={() => setScheduleDates((current) => [...current, newScheduleDateGroup()])}>+ Date</button>
                        </div>
                        <div>
                          <Label htmlFor="schedule-locations">Location / online options — one per line</Label>
                          <Textarea id="schedule-locations" value={scheduleLocations} onChange={(event) => setScheduleLocations(event.target.value)} rows={3} maxLength={500} placeholder={"Clubhouse\nZoom"} />
                          <div className="mt-1 text-[10px] font-normal text-slate-400">One location is simply proposed. More than one becomes a location vote.</div>
                        </div>
                      </>
                    )}
                  </> : <>
                    {decisionPhaseNameRequired && decisionStep !== "equipment" && <div><Label htmlFor="decision-name">Decision name</Label><Input id="decision-name" value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} maxLength={120} placeholder="What is this next decision about?" /></div>}

                    {decisionStep === "vote" && <>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/40 px-3 py-2.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Card question</div>
                        <div className="mt-0.5 text-sm font-semibold leading-relaxed text-[#102A43]">{decisionSetupCard?.title}</div>
                      </div>
                      <div className="grid gap-2">
                        {decisionQuestionsDraft.map((draft, questionIndex) => <div key={draft.id} className="w-full max-w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={`decision-question-${draft.id}`}>Question {questionIndex + 1}</Label>
                            {questionIndex > 0 && <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setDecisionQuestionsDraft((current) => current.filter((item) => item.id !== draft.id))} aria-label={`Remove question ${questionIndex + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                          {questionIndex === 0 ? (
                            <div className="mt-1 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium leading-relaxed text-slate-700">{decisionSetupCard?.title}</div>
                          ) : (
                            <Textarea id={`decision-question-${draft.id}`} className="mt-1" value={draft.text} onChange={(event) => updateDraftQuestion(draft.id, { text: event.target.value })} rows={2} maxLength={220} placeholder="Another question…" />
                          )}
                          <div className="mt-2 grid w-full min-w-0 grid-cols-1 gap-1 rounded-2xl bg-amber-50 p-1 min-[390px]:grid-cols-3">
                            <button type="button" className={`min-w-0 whitespace-normal rounded-xl px-2 py-2 text-[10px] font-semibold ${draft.kind === "yes-no-abstain" ? "bg-white text-amber-700 shadow-sm" : "text-amber-500"}`} onClick={() => updateDraftQuestion(draft.id, { kind: "yes-no-abstain" })}>Yes / No / Abstain</button>
                            <button type="button" className={`min-w-0 whitespace-normal rounded-xl px-2 py-2 text-[10px] font-semibold ${draft.kind === "choose-one" ? "bg-white text-amber-700 shadow-sm" : "text-amber-500"}`} onClick={() => updateDraftQuestion(draft.id, { kind: "choose-one" })}>Choose one</button>
                            <button type="button" className={`min-w-0 whitespace-normal rounded-xl px-2 py-2 text-[10px] font-semibold ${draft.kind === "multi-select" ? "bg-white text-amber-700 shadow-sm" : "text-amber-500"}`} onClick={() => updateDraftQuestion(draft.id, { kind: "multi-select" })}>Choose several</button>
                          </div>
                          {draft.kind !== "yes-no-abstain" && <div className="mt-2"><Label htmlFor={`decision-options-${draft.id}`}>Choices — one per line</Label><Textarea id={`decision-options-${draft.id}`} className="mt-1" value={draft.options} onChange={(event) => updateDraftQuestion(draft.id, { options: event.target.value })} rows={3} maxLength={700} placeholder="Option A\nOption B" /></div>}
                          {draft.kind === "multi-select" && <div className="mt-2"><Label htmlFor={`decision-max-${draft.id}`}>Maximum choices</Label><Input id={`decision-max-${draft.id}`} type="number" min="1" max="16" value={draft.maxSelections} onChange={(event) => updateDraftQuestion(draft.id, { maxSelections: event.target.value })} inputMode="numeric" /></div>}
                        </div>)}
                      </div>
                      <button type="button" className="w-fit rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100" onClick={() => setDecisionQuestionsDraft((current) => [...current, newDraftQuestion("")])}>+ Add question</button>
                      {renderVoterScope()}
                    </>}

                    {decisionStep === "players" && <>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/40 px-3 py-2.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Player decision</div>
                        <div className="mt-0.5 text-sm font-semibold leading-relaxed text-[#102A43]">{decisionSetupCard?.title}</div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Label htmlFor="player-search">Players</Label>
                          <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                            <span>{selectedPlayerIds.length} selected</span>
                            {selectedPlayerIds.length > 0 && <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedPlayerIds([])}>Clear</button>}
                          </div>
                        </div>
                        <Input id="player-search" value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Search roster…" />
                        <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5">{filteredPlayers.map((player) => {
                          const selected = selectedPlayerIds.includes(player.id);
                          return <button key={player.id} type="button" className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium ${selected ? "bg-amber-50 text-amber-900" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => setSelectedPlayerIds((current) => current.includes(player.id) ? current.filter((value) => value !== player.id) : [...current, player.id])}><span className="truncate">{player.name}</span>{selected && <Check className="h-4 w-4 text-amber-700" />}</button>;
                        })}{filteredPlayers.length === 0 && <div className="px-3 py-6 text-center text-xs font-medium text-slate-400">No matching players.</div>}</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2"><Label htmlFor="player-answer-options">Answer choices</Label><button type="button" className="text-[10px] font-medium text-amber-700" onClick={() => setPlayerAnswerOptions("Yes\nNo\nMaybe")}>Reset default</button></div>
                        <Textarea id="player-answer-options" value={playerAnswerOptions} onChange={(event) => setPlayerAnswerOptions(event.target.value)} rows={3} maxLength={180} placeholder={"Yes\nNo\nMaybe"} />
                        <div className="mt-1 text-[10px] font-normal text-slate-400">One answer per line. Every selected player gets the same compact response choices.</div>
                      </div>
                      {renderVoterScope()}
                    </>}

                    {decisionStep === "equipment" && <>
                      <div>
                        <Label htmlFor="equipment-card-title">Card title</Label>
                        <Input
                          id="equipment-card-title"
                          value={decisionTitle}
                          onChange={(event) => setDecisionTitle(event.target.value)}
                          maxLength={220}
                          placeholder={decisionSetupCard?.title || "Equipment decision"}
                        />
                        <div className="mt-1 text-[10px] font-normal text-slate-400">Editing this updates the card title when the vote opens.</div>
                      </div>

                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-left transition hover:bg-slate-50"
                        onClick={() => onOpenEquipmentInventory?.()}
                        disabled={!onOpenEquipmentInventory}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#102A43]">Club inventory</div>
                          <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                            {(equipmentSnapshot?.bags.length || 0)} bag{(equipmentSnapshot?.bags.length || 0) === 1 ? "" : "s"}
                            {equipmentSnapshot?.totals.length ? ` · ${equipmentSnapshot.totals.slice(0, 3).map((item) => `${item.label} ${item.quantity}`).join(" · ")}` : ""}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>

                      <div>
                        <Label>Voting style</Label>
                        <div className="mt-1.5 grid w-full min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                          <button type="button" className={`min-w-0 whitespace-normal rounded-xl border px-3 py-2.5 text-left ${equipmentVoteMode === "rate" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setEquipmentVoteMode("rate")}><div className="text-xs font-semibold">Answer each item</div><div className="mt-0.5 text-[10px] font-normal opacity-70">Default: Yes / No / Maybe</div></button>
                          <button type="button" className={`min-w-0 whitespace-normal rounded-xl border px-3 py-2.5 text-left ${equipmentVoteMode === "choose" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setEquipmentVoteMode("choose")}><div className="text-xs font-semibold">Choose items</div><div className="mt-0.5 text-[10px] font-normal opacity-70">Pick up to a set number</div></button>
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2"><Label>Items</Label><span className="text-[10px] font-medium text-slate-400">Qty starts at 1 · price optional</span></div>
                        <div className="grid gap-2">{equipmentDraftItems.map((item, index) => {
                          const subtotal = equipmentSubtotal(item.price, item.quantity);
                          const quantity = normalizedEquipmentQuantity(item.quantity);
                          return <div key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5">
                            <Input
                              value={item.name}
                              onChange={(event) => updateEquipmentDraftItem(item.id, { name: event.target.value })}
                              maxLength={120}
                              placeholder={`Item ${index + 1}`}
                              className="h-10 w-full min-w-0 px-3"
                            />
                            <div className="mt-2 grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)_2.25rem_2.25rem] items-center gap-1.5">
                              <div className="grid h-9 grid-cols-[1.7rem_minmax(0,1fr)_1.7rem] overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={`Quantity for item ${index + 1}`}>
                                <button type="button" className="flex items-center justify-center text-base font-medium text-slate-500 hover:bg-slate-50" onClick={() => updateEquipmentDraftItem(item.id, { quantity: String(Math.max(0, quantity - 1)) })} aria-label={`Decrease quantity for item ${index + 1}`}>−</button>
                                <input type="number" min="0" inputMode="numeric" value={item.quantity} onChange={(event) => updateEquipmentDraftItem(item.id, { quantity: event.target.value })} onBlur={() => { if (!item.quantity.trim()) updateEquipmentDraftItem(item.id, { quantity: "1" }); }} className="min-w-0 border-x border-slate-200 bg-transparent px-0 text-center text-sm font-semibold text-[#102A43] outline-none" aria-label={`Quantity value for item ${index + 1}`} />
                                <button type="button" className="flex items-center justify-center text-base font-medium text-slate-500 hover:bg-slate-50" onClick={() => updateEquipmentDraftItem(item.id, { quantity: String(quantity + 1) })} aria-label={`Increase quantity for item ${index + 1}`}>+</button>
                              </div>
                              <Input value={item.price} onChange={(event) => updateEquipmentDraftItem(item.id, { price: event.target.value })} maxLength={32} inputMode="decimal" placeholder="Price" aria-label={`Price for item ${index + 1}`} className="h-9 min-w-0 px-2.5" />
                              <button type="button" className={`relative flex h-9 w-9 items-center justify-center rounded-xl border ${item.url.trim() && validHttpUrl(item.url) ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => { setEquipmentLinkItemId(item.id); setEquipmentLinkDraft(item.url); }} aria-label={`Product link for item ${index + 1}`} title={item.url ? "Edit product link" : "Add product link"}><Link2 className="h-4 w-4" />{item.url.trim() && validHttpUrl(item.url) && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-700 text-white"><Check className="h-2.5 w-2.5" /></span>}</button>
                              <button type="button" className="flex h-9 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeEquipmentDraftItem(item.id)} aria-label={`Remove item ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                            {subtotal && <div className="mt-1.5 text-[9px] font-medium text-slate-400">Subtotal · {subtotal}</div>}
                          </div>;
                        })}</div>
                        <button type="button" className="mt-2 w-fit rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600" onClick={() => setEquipmentPendingSubject("__blank__")}><Plus className="mr-1 inline h-3.5 w-3.5" />Add item</button>
                      </div>

                      {equipmentVoteMode === "rate" ? <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left"
                        onClick={() => { setEquipmentAnswerOptionsDraft(equipmentAnswerOptions); setEquipmentAnswersOpen(true); }}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#102A43]">Answer choices</div>
                          <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{answerLabels(equipmentAnswerOptions).join(" · ")}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button> : <div>
                        <Label htmlFor="equipment-max-selections">Maximum items each person can choose</Label>
                        <Input id="equipment-max-selections" type="number" min="1" max="16" value={equipmentMaxSelections} onChange={(event) => setEquipmentMaxSelections(event.target.value)} inputMode="numeric" />
                      </div>}

                      {renderVoterScope()}
                    </>}
                  </>}
                </>
              )}

              {!(decisionStep === "schedule" && !decisionEditingDecisionId) && <Button
                type="button"
                className={`h-11 rounded-2xl font-black text-white ${decisionMode === "recorded" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
                disabled={saving || !decisionSetupValid}
                onClick={() => void addDecision()}
              >
                {saving ? "Saving…" : decisionMode === "recorded" ? "Record decision" : decisionStep === "schedule" ? (scheduleNeedsPoll ? "Open availability" : "Save schedule") : "Open vote"}
              </Button>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(equipmentPendingSubject)} onOpenChange={(open) => { if (!open) setEquipmentPendingSubject(""); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-[1.75rem] p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">{equipmentPendingSubject === "__blank__" ? "Add another item?" : "Add equipment item?"}</DialogTitle></DialogHeader>
          <div className="text-sm font-normal leading-relaxed text-slate-600">{equipmentPendingSubject === "__blank__" ? "Add a new item to this voting list?" : <>Add <span className="font-semibold text-[#102A43]">{equipmentPendingSubject}</span> to the voting list?</>}</div>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setEquipmentPendingSubject("")}>Cancel</Button>
            <Button type="button" className="h-10 flex-1 rounded-xl bg-amber-600 font-semibold text-white hover:bg-amber-700" onClick={() => { if (equipmentPendingSubject === "__blank__") setEquipmentDraftItems((current) => [...current, newEquipmentDraftItem()]); else chooseEquipmentSubject(equipmentPendingSubject); setEquipmentPendingSubject(""); }}>Add item</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(equipmentLinkItemId)} onOpenChange={(open) => { if (!open) { setEquipmentLinkItemId(null); setEquipmentLinkDraft(""); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[1.75rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">Product link</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input type="url" inputMode="url" value={equipmentLinkDraft} onChange={(event) => setEquipmentLinkDraft(event.target.value)} placeholder="https://…" />
            {equipmentLinkDraft.trim() && !validHttpUrl(equipmentLinkDraft) && <div className="text-[10px] font-medium text-red-500">Enter a full http/https link.</div>}
            <div className="flex gap-2">
              {equipmentLinkItemId && equipmentDraftItems.find((item) => item.id === equipmentLinkItemId)?.url && <Button type="button" variant="outline" className="h-10 rounded-xl text-red-600" onClick={() => { updateEquipmentDraftItem(equipmentLinkItemId, { url: "" }); setEquipmentLinkItemId(null); setEquipmentLinkDraft(""); }}>Remove</Button>}
              <Button type="button" className="h-10 flex-1 rounded-xl bg-[#102A43] font-semibold text-white" disabled={Boolean(equipmentLinkDraft.trim()) && !validHttpUrl(equipmentLinkDraft)} onClick={() => { if (equipmentLinkItemId) updateEquipmentDraftItem(equipmentLinkItemId, { url: equipmentLinkDraft.trim() }); setEquipmentLinkItemId(null); setEquipmentLinkDraft(""); }}>Save link</Button>
            </div>
          </div>
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

      <Dialog open={Boolean(moveCardId)} onOpenChange={(open) => { if (!open) setMoveCardId(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-[1.75rem] p-4">
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">Move card</DialogTitle></DialogHeader>
          <div className="mt-1 text-xs font-medium text-slate-500">Choose where this card belongs now.</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([
              ["ideas", "Ideas", Lightbulb],
              ["deciding", "Decide", Gavel],
              ["action", "To-do", ClipboardList],
              ["done", "Done", Check],
            ] as Array<[TopicStage, string, React.ComponentType<{ className?: string }>]>).map(([stage, label, Icon]) => {
              const card = board.cards.find((item) => item.id === moveCardId);
              const current = card ? stageForCard(card) === stage : false;
              return <button key={stage} type="button" disabled={current} className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold ${current ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-white text-[#102A43] active:bg-slate-50"}`} onClick={() => void moveCardFromPicker(stage)}><Icon className="h-4 w-4" />{label}{current ? " · here" : ""}</button>;
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionCardId)} onOpenChange={(open) => { if (!open) setActionCardId(null); }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">To-do details</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="action-text">What needs to happen next?</Label><Textarea id="action-text" value={actionText} onChange={(event) => setActionText(event.target.value)} rows={2} maxLength={220} /></div>
            {renderPeoplePicker(actionPeopleKeys, setActionPeopleKeys, "Who handles this?")}
            <Button type="button" className="h-11 rounded-2xl bg-sky-700 font-black text-white hover:bg-sky-800" disabled={!actionText.trim() || saving} onClick={() => void addAction()}>{saving ? "Saving…" : "Save details"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={equipmentAnswersOpen} onOpenChange={(open) => setEquipmentAnswersOpen(open)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-[1.75rem] p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">Answer choices</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Textarea value={equipmentAnswerOptionsDraft} onChange={(event) => setEquipmentAnswerOptionsDraft(event.target.value)} rows={4} maxLength={180} placeholder={"Yes\nNo\nMaybe"} />
            <div className="text-[10px] font-normal text-slate-400">One answer per line. Every item gets the same choices.</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => setEquipmentAnswerOptionsDraft("Yes\nNo\nMaybe")}>Reset</Button>
              <Button type="button" className="h-10 flex-1 rounded-xl bg-amber-600 font-semibold text-white hover:bg-amber-700" disabled={answerLabels(equipmentAnswerOptionsDraft).length < 2} onClick={() => { setEquipmentAnswerOptions(equipmentAnswerOptionsDraft); setEquipmentAnswersOpen(false); }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(votingCard && votingDecision)} onOpenChange={(open) => { if (!open) { setVotingCardId(null); setVotingDecisionId(null); setSelectedVoteAnswers({}); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[90dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-x-hidden overflow-y-auto rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2">
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">{votingDecision?.kind === "schedule" ? "Schedule response" : votingDecision?.decisionType === "players" ? "Player decision" : "Vote in Stripes"}</DialogTitle></DialogHeader>
          {votingDecision && <div className="grid gap-3">
            {votingDecision.title?.trim() && <div className="whitespace-normal break-words text-sm font-semibold leading-relaxed text-[#102A43]">{votingDecision.title}</div>}
            {votingDecision.decisionType === "players" && <div className="rounded-2xl bg-amber-50 px-3 py-2.5 text-sm font-medium leading-relaxed text-amber-950">{votingDecision.question}</div>}
            {votingDecision.hostName && <div className="rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800">Host: <span className="font-semibold">{votingDecision.hostName}</span></div>}
            {votingDecision.decisionType === "equipment" && <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-left"
              onClick={() => onOpenEquipmentInventory?.()}
              disabled={!onOpenEquipmentInventory}
            >
              <div className="min-w-0"><div className="text-xs font-semibold text-[#102A43]">Club inventory</div><div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{equipmentSnapshot?.bags.length || 0} bag{(equipmentSnapshot?.bags.length || 0) === 1 ? "" : "s"}{equipmentSnapshot?.totals.length ? ` · ${equipmentSnapshot.totals.slice(0, 3).map((item) => `${item.label} ${item.quantity}`).join(" · ")}` : ""}</div></div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>}
            {(votingDecision.decisionType === "players" || (votingDecision.decisionType === "equipment" && votingDecision.equipmentVoteMode === "rate")) ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {decisionQuestions(votingDecision).map((question, questionIndex) => {
                  const selectedIds = selectedVoteAnswers[question.id] || [];
                  return <div key={question.id} className={`px-3 py-2.5 ${questionIndex ? "border-t border-slate-100" : ""}`}>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 sm:flex-1">
                        <div className="whitespace-normal break-words text-xs font-medium text-[#102A43] sm:truncate">{question.text}</div>
                        {votingDecision.decisionType === "equipment" && (question.itemQuantity !== undefined || question.itemPrice || question.itemUrl) && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-normal text-slate-400">{question.itemQuantity !== undefined && <span>Qty {question.itemQuantity}</span>}{question.itemPrice && <span>{question.itemPrice}</span>}{question.itemPrice && question.itemQuantity !== undefined && <span className="font-medium text-slate-500">Subtotal {equipmentSubtotal(question.itemPrice, question.itemQuantity)}</span>}{question.itemUrl && <a href={question.itemUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline" onClick={(event) => event.stopPropagation()}>Open link</a>}</div>}
                      </div>
                      <div className="flex w-full min-w-0 flex-wrap gap-1 sm:w-auto sm:max-w-[66%] sm:justify-end">{question.options.map((option) => {
                        const selected = selectedIds.includes(option.id);
                        return <button key={option.id} type="button" className={`max-w-full min-w-0 flex-[1_1_5.5rem] whitespace-normal break-words rounded-lg border px-2 py-1.5 text-[10px] font-medium sm:flex-initial ${selected ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => toggleVoteOption(question, option.id)}>{selected && <Check className="mr-0.5 inline h-3 w-3" />}{option.label}</button>;
                      })}</div>
                    </div>
                  </div>;
                })}
              </div>
            ) : (
              <div className="grid gap-3">{decisionQuestions(votingDecision).map((question, questionIndex) => {
                const selectedIds = selectedVoteAnswers[question.id] || [];
                return <div key={question.id} className={decisionQuestions(votingDecision).length > 1 ? "rounded-2xl border border-slate-200 bg-white p-3" : ""}>
                  <div className="whitespace-normal break-words text-sm font-medium leading-relaxed text-[#102A43]">{`${decisionQuestions(votingDecision).length > 1 ? `${questionIndex + 1}. ` : ""}${question.text}`}</div>
                  {votingDecision.kind === "schedule" && question.scheduleRole === "time" && <div className="mt-1 text-[10px] font-normal text-slate-500">Choose every time that works. If none work, choose “None of these work for me”.</div>}
                  {votingDecision.kind === "schedule" && question.scheduleRole === "location" && <div className="mt-1 text-[10px] font-normal text-slate-500">Choose the location you prefer.</div>}
                  {votingDecision.kind !== "schedule" && question.kind === "multi-select" && <div className="mt-1 text-[10px] font-medium text-slate-500">Choose up to {question.maxSelections || question.options.length}.</div>}
                  <div className="mt-2 grid gap-2">{question.options.map((option) => {
                    const selected = selectedIds.includes(option.id);
                    return <div key={option.id} className="rounded-2xl border border-slate-200 bg-white p-1">
                      <button type="button" className={`w-full rounded-xl px-2 py-2 text-left text-sm font-medium ${selected ? "bg-amber-50 text-amber-800" : "text-[#102A43]"}`} onClick={() => toggleVoteOption(question, option.id)}>
                        <div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-words">{selected && <Check className="mr-1 inline h-4 w-4" />}{option.label}{option.quantity !== undefined && <span className="ml-1 text-[10px] font-normal text-slate-400">× {option.quantity}</span>}</span><span className="shrink-0 text-right">{option.price && <span className="block text-xs font-medium text-slate-500">{option.price}</span>}{option.price && option.quantity !== undefined && <span className="block text-[9px] font-medium text-slate-400">Subtotal {equipmentSubtotal(option.price, option.quantity)}</span>}</span></div>
                      </button>
                      {option.url && <a href={option.url} target="_blank" rel="noreferrer" className="block px-2 pb-2 text-[10px] font-medium text-sky-700 underline">Open product link</a>}
                    </div>;
                  })}</div>
                </div>;
              })}</div>
            )}
            <div className="text-[10px] font-normal leading-snug text-slate-500">{votingDecision.kind === "schedule" ? "Your schedule response is visible to the host so they can find the best overlap." : votingDecision.decisionType === "players" ? "Answer each player using the choices set by the organizer. Your ballot is anonymous and can be updated while the decision remains open." : "Anonymous. You can change your answer while it remains open."}</div>
            <Button type="button" className="h-11 rounded-2xl bg-amber-600 font-semibold text-white" disabled={decisionQuestions(votingDecision).some((question) => !(selectedVoteAnswers[question.id] || []).length) || voteSubmitting} onClick={() => void submitVote()}>{voteSubmitting ? "Recording…" : votingDecision.ballots?.some((ballot) => ballot.voterHash === currentVoterHash) ? "Update" : "Submit"}</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(finalizeScheduleCard && finalizeScheduleDecision)} onOpenChange={(open) => { if (!open) { setFinalizeScheduleCardId(null); setFinalizeScheduleDecisionId(null); } }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-auto max-h-[90dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">Finalize schedule</DialogTitle></DialogHeader>
          {finalizeScheduleDecision && <div className="grid gap-3">
            <div className="rounded-2xl bg-sky-50 px-3 py-2.5 text-[11px] font-normal text-sky-900">You can finalize before everyone responds. The host makes the final call.</div>
            <div>
              <Label htmlFor="final-schedule-time">Date & time</Label>
              <select id="final-schedule-time" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102A43]" value={finalScheduleTime} onChange={(event) => setFinalScheduleTime(event.target.value)}>
                <option value="">Choose final time</option>
                {(finalizeScheduleDecision.scheduleTimeValues || []).map((value) => <option key={value} value={value}>{scheduleLabel(value)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="final-schedule-location">Location</Label>
              <select id="final-schedule-location" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102A43]" value={finalScheduleLocation} onChange={(event) => setFinalScheduleLocation(event.target.value)}>
                <option value="">Choose final location</option>
                {(finalizeScheduleDecision.scheduleLocationOptions || []).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="final-schedule-link">Video / meeting link <span className="font-normal text-slate-400">optional</span></Label>
              <Input id="final-schedule-link" type="url" inputMode="url" value={finalScheduleMeetingUrl} onChange={(event) => setFinalScheduleMeetingUrl(event.target.value)} placeholder="https://zoom.us/…" />
            </div>
            <Button type="button" className="h-11 rounded-2xl bg-sky-700 font-semibold text-white hover:bg-sky-800" disabled={saving || !finalScheduleTime || !finalScheduleLocation || (Boolean(finalScheduleMeetingUrl.trim()) && !validHttpUrl(finalScheduleMeetingUrl))} onClick={() => void finalizeSchedule()}>{saving ? "Saving…" : "Confirm schedule"}</Button>
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
              <div className="mt-1 text-[10px] font-semibold text-slate-500">One organizer email for this step. A future Decision or To-do step gets a new Bell.</div>
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
              <Label>Delivery</Label>
              <div className="mt-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800">
                <Mail className="h-4 w-4" />
                <div className="mt-1 text-xs font-black">Email <Check className="ml-1 inline h-3.5 w-3.5" /></div>
                <div className="mt-0.5 text-[9px] font-semibold opacity-75">{notifyTarget.topicAlreadyNotified ? "Continues this topic’s email thread" : "Starts one email thread for this topic"}</div>
              </div>
            </div>

            <div>
              <Label htmlFor="notify-message">Message <span className="font-semibold text-slate-400">optional</span></Label>
              <Textarea id="notify-message" value={notifyMessage} onChange={(event) => setNotifyMessage(event.target.value)} rows={2} maxLength={500} placeholder="Add a short note, or leave this blank." />
            </div>

            {notifyError && <div className="rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{notifyError}</div>}

            <Button type="button" className="h-11 rounded-2xl bg-[#102A43] font-black text-white lg:h-12 lg:text-base" disabled={notifySending || !notifyEmailsToSend.length} onClick={() => void sendNotification()}>
              <Bell className="mr-1.5 h-4 w-4" />{notifySending ? "Notifying…" : `Notify ${notifyEmailsToSend.length} organizer${notifyEmailsToSend.length === 1 ? "" : "s"}`}
            </Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="fixed inset-x-2 bottom-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-semibold text-[#102A43]">{editSection === "note" ? "Note" : editSection === "assignees" ? "Assignees" : editSection === "due" ? "Due date" : "Edit card"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {editSection === "all" && <div><Label htmlFor="edit-title">Title</Label><Textarea id="edit-title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} rows={2} maxLength={220} /></div>}
            {(editSection === "all" || editSection === "note") && <div><Label htmlFor="edit-note">Note <span className="font-normal text-slate-400">optional</span></Label><Textarea id="edit-note" value={editNote} onChange={(event) => setEditNote(event.target.value)} rows={4} maxLength={1200} placeholder="Useful context, details or a short update." /></div>}
            {editSection === "all" && <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="edit-tag">Tag</Label><select id="edit-tag" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editCategory} onChange={(event) => setEditCategory(event.target.value)}><option value="">None</option>{TAGS.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><Label htmlFor="edit-due">Due</Label><input id="edit-due" type="date" className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></div>
            </div>}
            {editSection === "due" && <div><Label htmlFor="edit-due-only">Due date <span className="font-normal text-slate-400">optional</span></Label><Input id="edit-due-only" type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></div>}
            {(editSection === "all" || editSection === "assignees") && renderPeoplePicker(editPeopleKeys, setEditPeopleKeys, "Assignees")}
            <div className="flex gap-2">
              {editSection === "all" && <Button type="button" variant="outline" className="h-11 rounded-2xl text-red-700" onClick={() => void removeCard()}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}
              {editSection !== "all" && <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setEditOpen(false)}>Cancel</Button>}
              <Button type="button" className="h-11 flex-1 rounded-2xl font-semibold text-white" style={{ backgroundColor: accent }} disabled={!editTitle.trim() || saving} onClick={() => void saveEditedCard()}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

        <Dialog open={boardSettingsOpen} onOpenChange={setBoardSettingsOpen}>
        <DialogContent className="max-w-sm rounded-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle className="text-left text-base font-black text-[#102A43]">Board settings</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label htmlFor="board-name">Custom name <span className="font-semibold text-slate-400">optional · saves automatically</span></Label><Input id="board-name" value={boardNameDraft} onChange={(event) => changeBoardName(event.target.value)} maxLength={80} placeholder="e.g. Club decisions" /></div>
            <div className="rounded-2xl bg-slate-50 p-3 text-[10px] font-semibold leading-relaxed text-slate-500 ring-1 ring-slate-100">
              Bell notifications are deliberate organizer emails. Stripes does not send automatic activity spam.
            </div>
            {notifyError && <div className="rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{notifyError}</div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
