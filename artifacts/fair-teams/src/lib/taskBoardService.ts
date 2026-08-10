import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFairTeamsAuth, getFairTeamsFirestore } from "@/lib/firebaseClient";

export type TaskBoardColumnKind = "ideas" | "vote" | "action" | "done";

export type TaskBoardColumn = {
  id: string;
  name: string;
  kind?: TaskBoardColumnKind;
  position: number;
  archived?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type TaskBoardActivity = {
  id: string;
  action:
    | "created"
    | "edited"
    | "moved"
    | "assigned"
    | "unassigned"
    | "vote_started"
    | "vote_closed"
    | "claimed"
    | "released"
    | "completed"
    | "action_defined"
    | "decision_recorded"
    | "link_added"
    | "link_removed"
    | "reopened";
  actorName: string;
  actorEmail?: string;
  at: number;
  fromColumnName?: string;
  toColumnName?: string;
};

export type TaskBoardVoteKind = "yes-no-abstain" | "choose-one" | "multi-select" | "schedule";

export type TaskBoardDecisionType = "vote" | "schedule" | "players" | "equipment";

export type TaskBoardDecisionQuestion = {
  id: string;
  text: string;
  kind: Exclude<TaskBoardVoteKind, "schedule">;
  options: TaskBoardVoteOption[];
  maxSelections?: number;
  sourcePlayerIds?: string[];
  scheduleRole?: "time" | "location";
  itemQuantity?: number;
  itemPrice?: string;
  itemUrl?: string;
};

export type TaskBoardVoteAnswer = {
  questionId: string;
  optionIds: string[];
};

export type TaskBoardPerson = {
  name: string;
  email?: string;
};

export type TaskBoardNotificationState = {
  status: "queued" | "sent" | "failed";
  requestId?: string;
  sentAt?: number;
  sentByName?: string;
  sentByEmail?: string;
  recipientEmails?: string[];
  channels?: Array<"email" | "push">;
  emailQueuedCount?: number;
  pushTargetCount?: number;
  message?: string;
};

export type TaskBoardVoteOption = {
  id: string;
  label: string;
  count: number;
  quantity?: number;
  price?: string;
  url?: string;
};

export type TaskBoardVoteBallot = {
  voterHash: string;
  voterName?: string;
  optionIds: string[];
  answers?: TaskBoardVoteAnswer[];
};

export type TaskBoardNamedVote = {
  voterHash: string;
  voterName: string;
  optionId: string;
};

export type TaskBoardVote = {
  id?: string;
  mode?: "vote" | "recorded";
  kind?: TaskBoardVoteKind;
  decisionType?: TaskBoardDecisionType;
  title?: string;
  question: string;
  outcome?: string;
  hostName?: string;
  hostEmail?: string;
  scheduleState?: "waiting-host" | "setup" | "collecting" | "finalized" | "host-declined";
  hostRequestMode?: "person" | "group";
  requestedHostName?: string;
  requestedHostEmail?: string;
  scheduleTimeValues?: string[];
  scheduleLocationOptions?: string[];
  scheduleParticipantMode?: "all" | "selected";
  participantMode?: "all" | "selected";
  equipmentIntent?: "buy" | "replace";
  equipmentVoteMode?: "rate" | "choose";
  finalizedTime?: string;
  finalizedLocation?: string;
  meetingUrl?: string;
  finalizedAt?: number;
  finalizedByName?: string;
  questions?: TaskBoardDecisionQuestion[];
  participantEmails?: string[];
  participantNames?: string[];
  sourcePlayerIds?: string[];
  options: TaskBoardVoteOption[];
  anonymous: boolean;
  hideParticipationUntilClosed: boolean;
  showResultsWhileOpen: boolean;
  status: "open" | "closed";
  eligibleCount?: number;
  maxSelections?: number;
  voterHashes: string[];
  ballots?: TaskBoardVoteBallot[];
  namedVotes?: TaskBoardNamedVote[];
  createdAt: number;
  closedAt?: number;
  createdByName?: string;
  closedByName?: string;
  notification?: TaskBoardNotificationState;
};

export type TaskBoardLink = {
  id: string;
  url: string;
  label: string;
  createdAt: number;
  createdByName?: string;
};

export type TaskBoardComment = {
  id: string;
  text: string;
  authorName: string;
  authorEmail?: string;
  createdAt: number;
  updatedAt?: number;
};

export type TaskBoardActionItem = {
  id: string;
  text: string;
  status: "open" | "done";
  assignees?: TaskBoardPerson[];
  // Legacy single-assignee mirrors retained for older clients.
  assignee?: string;
  assigneeEmail?: string;
  createdAt: number;
  createdByName?: string;
  completedAt?: number;
  completedByName?: string;
  completedByEmail?: string;
  notification?: TaskBoardNotificationState;
};

export type TaskBoardCard = {
  id: string;
  title: string;
  note?: string;
  columnId: string;
  people?: TaskBoardPerson[];
  gifUrl?: string;
  position: number;
  links?: TaskBoardLink[];
  comments?: TaskBoardComment[];
  decisions?: TaskBoardVote[];
  actions?: TaskBoardActionItem[];
  // Legacy mirrors retained for backwards compatibility with pre-thread cards.
  assignee?: string;
  assigneeEmail?: string;
  actionText?: string;
  completedAt?: number;
  completedByName?: string;
  completedByEmail?: string;
  dueDate?: string;
  category?: string;
  createdAt: number;
  createdByName: string;
  createdByEmail?: string;
  updatedAt: number;
  updatedByName?: string;
  lastMovedAt?: number;
  lastMovedByName?: string;
  activities: TaskBoardActivity[];
  vote?: TaskBoardVote;
  topicNotification?: TaskBoardNotificationState;
};

export type TaskBoardMeta = {
  name: string;
  customName?: string;
  createdAt?: number;
  updatedAt?: number;
  updatedByName?: string;
};

export type TaskBoardSnapshot = {
  meta: TaskBoardMeta | null;
  columns: TaskBoardColumn[];
  cards: TaskBoardCard[];
};

type Scope = { kind: "group" | "roster"; id: string };

function resolveScope(scopeId: string): Scope {
  const raw = scopeId.trim();
  if (!raw) throw new Error("Open a roster first.");
  if (raw.startsWith("roster:")) return { kind: "roster", id: raw.slice(7) };
  if (raw.startsWith("group:")) return { kind: "group", id: raw.slice(6) };
  return { kind: "group", id: raw };
}

function requireUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user?.email) throw new Error("Sign in to use the shared Action Board.");
  return user;
}

function rootDoc(scopeId: string) {
  const scope = resolveScope(scopeId);
  return scope.kind === "roster"
    ? doc(getFairTeamsFirestore(), "sharedRosters", scope.id, "taskBoard", "config")
    : doc(getFairTeamsFirestore(), "sharedGroups", scope.id, "taskBoard", "config");
}

function columnsCollection(scopeId: string) {
  return collection(rootDoc(scopeId), "columns");
}

function cardsCollection(scopeId: string) {
  return collection(rootDoc(scopeId), "cards");
}

function toMillis(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as Timestamp).toMillis === "function") {
    return (value as Timestamp).toMillis();
  }
  return undefined;
}

function parseMeta(data?: DocumentData): TaskBoardMeta | null {
  if (!data) return null;
  return {
    name: String(data.name || "Action Board"),
    customName: data.customName ? String(data.customName) : undefined,
    createdAt: toMillis(data.createdAt) || toMillis(data.createdAtIso),
    updatedAt: toMillis(data.updatedAt) || toMillis(data.updatedAtIso),
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
  };
}

function parseColumn(id: string, data: DocumentData): TaskBoardColumn {
  return {
    id,
    name: String(data.name || "Column"),
    kind: (["ideas", "vote", "action", "done"].includes(String(data.kind)) ? String(data.kind) : undefined) as TaskBoardColumn["kind"],
    position: Number.isFinite(Number(data.position)) ? Number(data.position) : 1000,
    archived: Boolean(data.archived),
    createdAt: toMillis(data.createdAt) || toMillis(data.createdAtIso),
    updatedAt: toMillis(data.updatedAt) || toMillis(data.updatedAtIso),
  };
}

function parseActivities(value: unknown): TaskBoardActivity[] {
  if (!Array.isArray(value)) return [];
  const validActions: TaskBoardActivity["action"][] = [
    "created", "edited", "moved", "assigned", "unassigned", "vote_started", "vote_closed", "claimed",
    "released", "completed", "action_defined", "decision_recorded", "link_added", "link_removed", "reopened",
  ];
  return value.slice(-30).map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || `activity-${index}`),
      action: (validActions.includes(String(row.action) as TaskBoardActivity["action"]) ? String(row.action) : "edited") as TaskBoardActivity["action"],
      actorName: String(row.actorName || "Organizer"),
      actorEmail: row.actorEmail ? String(row.actorEmail) : undefined,
      at: toMillis(row.at) || Date.now(),
      fromColumnName: row.fromColumnName ? String(row.fromColumnName) : undefined,
      toColumnName: row.toColumnName ? String(row.toColumnName) : undefined,
    };
  });
}

function parseNotification(value: unknown): TaskBoardNotificationState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const rawStatus = String(row.status || "");
  if (!["queued", "sent", "failed"].includes(rawStatus)) return undefined;
  const channels = Array.isArray(row.channels)
    ? row.channels.map(String).filter((channel): channel is "email" | "push" => channel === "email" || channel === "push")
    : [];
  return {
    status: rawStatus as TaskBoardNotificationState["status"],
    requestId: row.requestId ? String(row.requestId) : undefined,
    sentAt: toMillis(row.sentAt) || toMillis(row.sentAtIso),
    sentByName: row.sentByName ? String(row.sentByName) : undefined,
    sentByEmail: row.sentByEmail ? String(row.sentByEmail) : undefined,
    recipientEmails: Array.isArray(row.recipientEmails) ? row.recipientEmails.map(String).filter(Boolean) : undefined,
    channels,
    emailQueuedCount: Number(row.emailQueuedCount || 0) || undefined,
    pushTargetCount: Number(row.pushTargetCount || 0) || undefined,
    message: row.message ? String(row.message) : undefined,
  };
}

function parseVote(value: unknown, fallbackId = "decision"): TaskBoardVote | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const mode = row.mode === "recorded" ? "recorded" : "vote";
  const question = String(row.question || row.outcome || row.title || "").trim();
  const title = row.title ? String(row.title).trim() : undefined;
  const outcome = row.outcome ? String(row.outcome).trim() : undefined;
  const hostName = row.hostName ? String(row.hostName).trim() : undefined;
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions.map((item, index) => {
    const option = (item || {}) as Record<string, unknown>;
    return {
      id: String(option.id || `option-${index}`),
      label: String(option.label || `Option ${index + 1}`),
      count: Number(option.count || 0),
      quantity: option.quantity === 0 || option.quantity ? Math.max(0, Number(option.quantity) || 0) : undefined,
      price: option.price ? String(option.price).trim() : undefined,
      url: option.url ? String(option.url).trim() : undefined,
    };
  }).filter((option) => option.label.trim());

  if (!question) return undefined;

  const normalizedLabels = options.map((option) => option.label.trim().toLowerCase());
  const inferredKind: TaskBoardVoteKind = normalizedLabels.length === 3
    && normalizedLabels[0] === "yes"
    && normalizedLabels[1] === "no"
    && normalizedLabels[2] === "abstain"
    ? "yes-no-abstain"
    : "choose-one";
  const rawKind = String(row.kind || "");
  const kind: TaskBoardVoteKind = rawKind === "schedule" || rawKind === "multi-select" || rawKind === "choose-one" || rawKind === "yes-no-abstain"
    ? rawKind
    : inferredKind;
  const rawDecisionType = String(row.decisionType || "");
  const decisionType: TaskBoardDecisionType = rawDecisionType === "schedule" || rawDecisionType === "players" || rawDecisionType === "equipment" || rawDecisionType === "vote"
    ? rawDecisionType
    : kind === "schedule" ? "schedule" : "vote";

  const parsedQuestions: TaskBoardDecisionQuestion[] = Array.isArray(row.questions)
    ? row.questions.map((item, questionIndex) => {
      const q = (item || {}) as Record<string, unknown>;
      const rawQuestionOptions = Array.isArray(q.options) ? q.options : [];
      const questionOptions = rawQuestionOptions.map((optionItem, optionIndex) => {
        const option = (optionItem || {}) as Record<string, unknown>;
        return {
          id: String(option.id || `q${questionIndex}-option-${optionIndex}`),
          label: String(option.label || `Option ${optionIndex + 1}`),
          count: Number(option.count || 0),
          quantity: option.quantity === 0 || option.quantity ? Math.max(0, Number(option.quantity) || 0) : undefined,
          price: option.price ? String(option.price).trim() : undefined,
          url: option.url ? String(option.url).trim() : undefined,
        };
      }).filter((option) => option.label.trim());
      const rawQuestionKind = String(q.kind || "");
      const questionKind: Exclude<TaskBoardVoteKind, "schedule"> = rawQuestionKind === "multi-select" || rawQuestionKind === "choose-one" || rawQuestionKind === "yes-no-abstain"
        ? rawQuestionKind
        : "choose-one";
      return {
        id: String(q.id || `question-${questionIndex}`),
        text: String(q.text || q.question || "").trim(),
        kind: questionKind,
        options: questionOptions,
        maxSelections: Number(q.maxSelections || 0) || undefined,
        sourcePlayerIds: Array.isArray(q.sourcePlayerIds) ? q.sourcePlayerIds.map(String).filter(Boolean) : undefined,
        scheduleRole: q.scheduleRole === "time" || q.scheduleRole === "location" ? q.scheduleRole as TaskBoardDecisionQuestion["scheduleRole"] : undefined,
        itemQuantity: q.itemQuantity === 0 || q.itemQuantity ? Math.max(0, Number(q.itemQuantity) || 0) : undefined,
        itemPrice: q.itemPrice ? String(q.itemPrice).trim() : undefined,
        itemUrl: q.itemUrl ? String(q.itemUrl).trim() : undefined,
      };
    }).filter((q) => q.text && q.options.length >= 2)
    : [];

  const questions = parsedQuestions.length
    ? parsedQuestions
    : mode === "vote" && options.length >= 2
      ? [{
        id: "question-1",
        text: question,
        kind: kind === "schedule" ? "multi-select" : kind as Exclude<TaskBoardVoteKind, "schedule">,
        options,
        maxSelections: Number(row.maxSelections || 0) || undefined,
        sourcePlayerIds: Array.isArray(row.sourcePlayerIds) ? row.sourcePlayerIds.map(String).filter(Boolean) : undefined,
      }]
      : [];

  if (mode === "vote" && questions.length === 0 && decisionType !== "schedule") return undefined;

  const ballots = Array.isArray(row.ballots)
    ? row.ballots.map((item) => {
      const ballot = (item || {}) as Record<string, unknown>;
      const answers = Array.isArray(ballot.answers)
        ? ballot.answers.map((answerItem) => {
          const answer = (answerItem || {}) as Record<string, unknown>;
          return {
            questionId: String(answer.questionId || ""),
            optionIds: Array.isArray(answer.optionIds) ? answer.optionIds.map(String).filter(Boolean) : [],
          };
        }).filter((answer) => answer.questionId && answer.optionIds.length)
        : undefined;
      const optionIds = Array.isArray(ballot.optionIds) ? ballot.optionIds.map(String).filter(Boolean) : [];
      return {
        voterHash: String(ballot.voterHash || ""),
        voterName: ballot.voterName ? String(ballot.voterName) : undefined,
        optionIds: optionIds.length ? optionIds : answers?.[0]?.optionIds || [],
        answers,
      };
    }).filter((ballot) => ballot.voterHash && (ballot.optionIds.length || ballot.answers?.length))
    : undefined;

  return {
    id: String(row.id || fallbackId),
    mode,
    kind,
    decisionType,
    title,
    question,
    outcome,
    hostName,
    hostEmail: row.hostEmail ? String(row.hostEmail).trim() : undefined,
    scheduleState: ["waiting-host", "setup", "collecting", "finalized", "host-declined"].includes(String(row.scheduleState)) ? String(row.scheduleState) as TaskBoardVote["scheduleState"] : undefined,
    hostRequestMode: row.hostRequestMode === "person" || row.hostRequestMode === "group" ? row.hostRequestMode : undefined,
    requestedHostName: row.requestedHostName ? String(row.requestedHostName).trim() : undefined,
    requestedHostEmail: row.requestedHostEmail ? String(row.requestedHostEmail).trim() : undefined,
    scheduleTimeValues: Array.isArray(row.scheduleTimeValues) ? row.scheduleTimeValues.map(String).filter(Boolean) : undefined,
    scheduleLocationOptions: Array.isArray(row.scheduleLocationOptions) ? row.scheduleLocationOptions.map(String).filter(Boolean) : undefined,
    scheduleParticipantMode: row.scheduleParticipantMode === "all" || row.scheduleParticipantMode === "selected" ? row.scheduleParticipantMode : undefined,
    participantMode: row.participantMode === "all" || row.participantMode === "selected" ? row.participantMode : undefined,
    equipmentIntent: row.equipmentIntent === "buy" || row.equipmentIntent === "replace" ? row.equipmentIntent : undefined,
    equipmentVoteMode: row.equipmentVoteMode === "rate" || row.equipmentVoteMode === "choose" ? row.equipmentVoteMode : undefined,
    finalizedTime: row.finalizedTime ? String(row.finalizedTime) : undefined,
    finalizedLocation: row.finalizedLocation ? String(row.finalizedLocation) : undefined,
    meetingUrl: row.meetingUrl ? String(row.meetingUrl) : undefined,
    finalizedAt: toMillis(row.finalizedAt),
    finalizedByName: row.finalizedByName ? String(row.finalizedByName) : undefined,
    questions,
    participantEmails: Array.isArray(row.participantEmails) ? row.participantEmails.map(String).filter(Boolean) : undefined,
    participantNames: Array.isArray(row.participantNames) ? row.participantNames.map(String).filter(Boolean) : undefined,
    sourcePlayerIds: Array.isArray(row.sourcePlayerIds) ? row.sourcePlayerIds.map(String).filter(Boolean) : undefined,
    options: questions[0]?.options || options,
    anonymous: row.anonymous !== false,
    hideParticipationUntilClosed: Boolean(row.hideParticipationUntilClosed),
    showResultsWhileOpen: Boolean(row.showResultsWhileOpen),
    status: row.status === "closed" || mode === "recorded" ? "closed" : "open",
    eligibleCount: Number(row.eligibleCount || 0) || undefined,
    maxSelections: Number(row.maxSelections || 0) || questions[0]?.maxSelections,
    voterHashes: Array.isArray(row.voterHashes) ? row.voterHashes.map(String) : (ballots || []).map((ballot) => ballot.voterHash),
    ballots,
    namedVotes: Array.isArray(row.namedVotes) ? row.namedVotes.map((item) => {
      const vote = (item || {}) as Record<string, unknown>;
      return { voterHash: String(vote.voterHash || ""), voterName: String(vote.voterName || "Member"), optionId: String(vote.optionId || "") };
    }).filter((vote) => vote.voterHash && vote.optionId) : undefined,
    createdAt: toMillis(row.createdAt) || Date.now(),
    closedAt: toMillis(row.closedAt),
    createdByName: row.createdByName ? String(row.createdByName) : undefined,
    closedByName: row.closedByName ? String(row.closedByName) : undefined,
    notification: parseNotification(row.notification),
  };
}

function parseLinks(value: unknown): TaskBoardLink[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || `link-${index}`),
      url: String(row.url || ""),
      label: String(row.label || row.url || "Link"),
      createdAt: toMillis(row.createdAt) || Date.now(),
      createdByName: row.createdByName ? String(row.createdByName) : undefined,
    };
  }).filter((link) => /^https?:\/\//i.test(link.url));
}

function parseComments(value: unknown): TaskBoardComment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || `comment-${index}`),
      text: String(row.text || "").trim(),
      authorName: String(row.authorName || "Organizer").trim() || "Organizer",
      authorEmail: row.authorEmail ? String(row.authorEmail).trim() : undefined,
      createdAt: toMillis(row.createdAt) || Date.now(),
      updatedAt: toMillis(row.updatedAt),
    };
  }).filter((comment) => comment.text).slice(-200);
}

function parseActions(value: unknown): TaskBoardActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    const assignees = Array.isArray(row.assignees)
      ? row.assignees.map((item) => {
        const person = (item || {}) as Record<string, unknown>;
        return {
          name: String(person.name || "").trim(),
          email: person.email ? String(person.email).trim() : undefined,
        };
      }).filter((person) => person.name)
      : [];
    const legacyAssignee = row.assignee ? String(row.assignee) : undefined;
    const legacyAssigneeEmail = row.assigneeEmail ? String(row.assigneeEmail) : undefined;
    return {
      id: String(row.id || `action-${index}`),
      text: String(row.text || "").trim(),
      status: (row.status === "done" ? "done" : "open") as TaskBoardActionItem["status"],
      assignees: assignees.length ? assignees : legacyAssignee ? [{ name: legacyAssignee, email: legacyAssigneeEmail }] : [],
      assignee: legacyAssignee || assignees[0]?.name,
      assigneeEmail: legacyAssigneeEmail || assignees[0]?.email,
      createdAt: toMillis(row.createdAt) || Date.now(),
      createdByName: row.createdByName ? String(row.createdByName) : undefined,
      completedAt: toMillis(row.completedAt),
      completedByName: row.completedByName ? String(row.completedByName) : undefined,
      completedByEmail: row.completedByEmail ? String(row.completedByEmail) : undefined,
      notification: parseNotification(row.notification),
    };
  }).filter((action) => action.text);
}

function parseCard(id: string, data: DocumentData): TaskBoardCard {
  const now = Date.now();
  const legacyVote = parseVote(data.vote, "legacy-vote");
  const decisions = Array.isArray(data.decisions)
    ? data.decisions.map((item: unknown, index: number) => parseVote(item, `decision-${index}`)).filter(Boolean) as TaskBoardVote[]
    : legacyVote ? [legacyVote] : [];
  let actions = parseActions(data.actions);
  if (!actions.length && data.actionText) {
    const completedAt = toMillis(data.completedAt) || toMillis(data.completedAtIso);
    actions = [{
      id: "legacy-action",
      text: String(data.actionText),
      status: completedAt ? "done" : "open",
      assignees: data.assignee ? [{ name: String(data.assignee), email: data.assigneeEmail ? String(data.assigneeEmail) : undefined }] : [],
      assignee: data.assignee ? String(data.assignee) : undefined,
      assigneeEmail: data.assigneeEmail ? String(data.assigneeEmail) : undefined,
      createdAt: toMillis(data.lastMovedAt) || toMillis(data.createdAt) || now,
      completedAt,
      completedByName: data.completedByName ? String(data.completedByName) : undefined,
      completedByEmail: data.completedByEmail ? String(data.completedByEmail) : undefined,
    }];
  }
  const latestDecision = decisions[decisions.length - 1];
  const latestOpenAction = [...actions].reverse().find((action) => action.status === "open");
  return {
    id,
    title: String(data.title || "Untitled topic"),
    note: data.note ? String(data.note) : undefined,
    people: Array.isArray(data.people) ? data.people.map((item: unknown) => {
      const person = (item || {}) as Record<string, unknown>;
      return { name: String(person.name || "").trim(), email: person.email ? String(person.email).trim() : undefined };
    }).filter((person: TaskBoardPerson) => person.name) : [],
    gifUrl: data.gifUrl ? String(data.gifUrl) : undefined,
    columnId: String(data.columnId || ""),
    position: Number.isFinite(Number(data.position)) ? Number(data.position) : 1000,
    links: parseLinks(data.links),
    comments: parseComments(data.comments),
    decisions,
    actions,
    assignee: latestOpenAction?.assignee || (data.assignee ? String(data.assignee) : undefined),
    assigneeEmail: latestOpenAction?.assigneeEmail || (data.assigneeEmail ? String(data.assigneeEmail) : undefined),
    actionText: latestOpenAction?.text || (data.actionText ? String(data.actionText) : undefined),
    completedAt: toMillis(data.completedAt) || toMillis(data.completedAtIso),
    completedByName: data.completedByName ? String(data.completedByName) : undefined,
    completedByEmail: data.completedByEmail ? String(data.completedByEmail) : undefined,
    dueDate: data.dueDate ? String(data.dueDate) : undefined,
    category: data.category ? String(data.category) : undefined,
    createdAt: toMillis(data.createdAt) || toMillis(data.createdAtIso) || now,
    createdByName: String(data.createdByName || "Organizer"),
    createdByEmail: data.createdByEmail ? String(data.createdByEmail) : undefined,
    updatedAt: toMillis(data.updatedAt) || toMillis(data.updatedAtIso) || now,
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
    lastMovedAt: toMillis(data.lastMovedAt) || toMillis(data.lastMovedAtIso),
    lastMovedByName: data.lastMovedByName ? String(data.lastMovedByName) : undefined,
    activities: parseActivities(data.activities),
    vote: latestDecision,
    topicNotification: parseNotification(data.topicNotification),
  };
}

export function listenToTaskBoard(scopeId: string, callback: (snapshot: TaskBoardSnapshot) => void, onError?: (error: Error) => void): Unsubscribe {
  requireUser();
  let meta: TaskBoardMeta | null = null;
  let columns: TaskBoardColumn[] = [];
  let cards: TaskBoardCard[] = [];
  const emit = () => callback({ meta, columns, cards });
  const fail = (error: unknown) => onError?.(error instanceof Error ? error : new Error("Could not load Action Board."));
  const unsubMeta = onSnapshot(rootDoc(scopeId), (snapshot) => { meta = snapshot.exists() ? parseMeta(snapshot.data()) : null; emit(); }, fail);
  const unsubColumns = onSnapshot(columnsCollection(scopeId), (snapshot) => {
    columns = snapshot.docs.map((item) => parseColumn(item.id, item.data())).sort((a, b) => a.position - b.position);
    emit();
  }, fail);
  const unsubCards = onSnapshot(cardsCollection(scopeId), (snapshot) => {
    cards = snapshot.docs.map((item) => parseCard(item.id, item.data())).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    emit();
  }, fail);
  return () => { unsubMeta(); unsubColumns(); unsubCards(); };
}

function actor() {
  const user = requireUser();
  return { uid: user.uid, email: user.email || undefined, name: user.displayName?.trim() || user.email || "Organizer" };
}

export async function saveTaskBoardMeta(scopeId: string, meta: TaskBoardMeta): Promise<void> {
  const user = actor();
  const now = new Date();
  await setDoc(rootDoc(scopeId), {
    app: "Fair Teams", schemaVersion: 7, name: meta.name.trim() || "Action Board", customName: meta.customName?.trim() || null,
    updatedByUid: user.uid, updatedByEmail: user.email || null, updatedByName: user.name,
    updatedAt: serverTimestamp(), updatedAtIso: now.toISOString(),
    ...(meta.createdAt ? {} : { createdAt: serverTimestamp(), createdAtIso: now.toISOString() }),
  }, { merge: true });
}

export async function saveTaskBoardColumn(scopeId: string, column: TaskBoardColumn): Promise<void> {
  const user = actor();
  const now = new Date();
  await setDoc(doc(columnsCollection(scopeId), column.id), {
    app: "Fair Teams", schemaVersion: 4, name: column.name.trim() || "Column", kind: column.kind || null, position: column.position,
    archived: Boolean(column.archived), updatedByUid: user.uid, updatedByName: user.name,
    updatedAt: serverTimestamp(), updatedAtIso: now.toISOString(),
    ...(column.createdAt ? {} : { createdAt: serverTimestamp(), createdAtIso: now.toISOString() }),
  }, { merge: true });
}

export async function saveTaskBoardColumns(scopeId: string, columns: TaskBoardColumn[]): Promise<void> {
  actor();
  const batch = writeBatch(getFairTeamsFirestore());
  columns.forEach((column) => batch.set(doc(columnsCollection(scopeId), column.id), {
    name: column.name.trim() || "Column", kind: column.kind || null, position: column.position, archived: Boolean(column.archived),
    updatedAt: serverTimestamp(), updatedAtIso: new Date().toISOString(),
  }, { merge: true }));
  await batch.commit();
}

function activityPayload(activity: TaskBoardActivity) {
  return {
    id: activity.id,
    action: activity.action,
    actorName: activity.actorName || "Organizer",
    actorEmail: activity.actorEmail || null,
    at: activity.at,
    fromColumnName: activity.fromColumnName || null,
    toColumnName: activity.toColumnName || null,
  };
}

function notificationPayload(notification?: TaskBoardNotificationState) {
  if (!notification) return null;
  return {
    status: notification.status,
    requestId: notification.requestId || null,
    sentAt: notification.sentAt || null,
    sentAtIso: notification.sentAt ? new Date(notification.sentAt).toISOString() : null,
    sentByName: notification.sentByName || null,
    sentByEmail: notification.sentByEmail || null,
    recipientEmails: notification.recipientEmails || [],
    channels: notification.channels || [],
    emailQueuedCount: notification.emailQueuedCount || 0,
    pushTargetCount: notification.pushTargetCount || 0,
    message: notification.message?.trim() || null,
  };
}

function votePayload(vote?: TaskBoardVote) {
  if (!vote) return null;
  const questions = vote.questions?.length
    ? vote.questions
    : vote.mode !== "recorded" && vote.options.length >= 2
      ? [{
        id: "question-1",
        text: vote.question,
        kind: vote.kind === "schedule" ? "multi-select" as const : (vote.kind || "choose-one") as Exclude<TaskBoardVoteKind, "schedule">,
        options: vote.options,
        maxSelections: vote.maxSelections,
        sourcePlayerIds: vote.sourcePlayerIds,
      }]
      : [];
  return {
    id: vote.id || null,
    mode: vote.mode || "vote",
    kind: vote.kind || "yes-no-abstain",
    decisionType: vote.decisionType || (vote.kind === "schedule" ? "schedule" : "vote"),
    title: vote.title?.trim() || null,
    question: vote.question.trim(),
    outcome: vote.outcome?.trim() || null,
    hostName: vote.hostName?.trim() || null,
    hostEmail: vote.hostEmail?.trim() || null,
    scheduleState: vote.scheduleState || null,
    hostRequestMode: vote.hostRequestMode || null,
    requestedHostName: vote.requestedHostName?.trim() || null,
    requestedHostEmail: vote.requestedHostEmail?.trim() || null,
    scheduleTimeValues: vote.scheduleTimeValues || [],
    scheduleLocationOptions: vote.scheduleLocationOptions || [],
    scheduleParticipantMode: vote.scheduleParticipantMode || null,
    participantMode: vote.participantMode || null,
    equipmentIntent: vote.equipmentIntent || null,
    equipmentVoteMode: vote.equipmentVoteMode || null,
    finalizedTime: vote.finalizedTime || null,
    finalizedLocation: vote.finalizedLocation || null,
    meetingUrl: vote.meetingUrl?.trim() || null,
    finalizedAt: vote.finalizedAt || null,
    finalizedByName: vote.finalizedByName || null,
    participantEmails: vote.participantEmails || [],
    participantNames: vote.participantNames || [],
    sourcePlayerIds: vote.sourcePlayerIds || [],
    questions: questions.map((question) => ({
      id: question.id,
      text: question.text.trim(),
      kind: question.kind,
      maxSelections: question.maxSelections || null,
      sourcePlayerIds: question.sourcePlayerIds || [],
      scheduleRole: question.scheduleRole || null,
      itemQuantity: question.itemQuantity ?? null,
      itemPrice: question.itemPrice?.trim() || null,
      itemUrl: question.itemUrl?.trim() || null,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label.trim(),
        count: option.count || 0,
        quantity: option.quantity ?? null,
        price: option.price?.trim() || null,
        url: option.url?.trim() || null,
      })),
    })),
    anonymous: vote.anonymous,
    hideParticipationUntilClosed: vote.hideParticipationUntilClosed,
    showResultsWhileOpen: vote.showResultsWhileOpen,
    status: vote.status,
    eligibleCount: vote.eligibleCount || null,
    maxSelections: vote.maxSelections || null,
    voterHashes: vote.voterHashes || [],
    ballots: (vote.ballots || []).map((ballot) => ({
      voterHash: ballot.voterHash,
      voterName: ballot.voterName || null,
      optionIds: ballot.optionIds,
      answers: ballot.answers || [],
    })),
    namedVotes: vote.namedVotes || [],
    createdAt: vote.createdAt,
    closedAt: vote.closedAt || null,
    createdByName: vote.createdByName || null,
    closedByName: vote.closedByName || null,
    notification: notificationPayload(vote.notification),
    options: (questions[0]?.options || vote.options).map((option) => ({ id: option.id, label: option.label.trim(), count: option.count || 0, quantity: option.quantity ?? null, price: option.price?.trim() || null, url: option.url?.trim() || null })),
  };
}

function linkPayload(link: TaskBoardLink) {
  return {
    id: link.id,
    url: link.url,
    label: link.label.trim() || link.url,
    createdAt: link.createdAt,
    createdByName: link.createdByName || null,
  };
}

function actionPayload(action: TaskBoardActionItem) {
  return {
    id: action.id,
    text: action.text.trim(),
    status: action.status,
    assignees: (action.assignees || []).map((person) => ({ name: person.name.trim(), email: person.email?.trim() || null })).filter((person) => person.name),
    assignee: action.assignees?.[0]?.name?.trim() || action.assignee?.trim() || null,
    assigneeEmail: action.assignees?.[0]?.email?.trim() || action.assigneeEmail?.trim() || null,
    createdAt: action.createdAt,
    createdByName: action.createdByName || null,
    completedAt: action.completedAt || null,
    completedByName: action.completedByName || null,
    completedByEmail: action.completedByEmail || null,
    notification: notificationPayload(action.notification),
  };
}

export async function saveTaskBoardCard(scopeId: string, card: TaskBoardCard): Promise<void> {
  const user = actor();
  const now = new Date();
  const decisions = card.decisions || (card.vote ? [card.vote] : []);
  const actions = card.actions || [];
  const latestDecision = decisions[decisions.length - 1];
  const latestOpenAction = [...actions].reverse().find((action) => action.status === "open");
  await setDoc(doc(cardsCollection(scopeId), card.id), {
    app: "Fair Teams", schemaVersion: 7,
    title: card.title.trim() || "Untitled topic", note: card.note?.trim() || null,
    people: (card.people || []).map((person) => ({ name: person.name.trim(), email: person.email?.trim() || null })).filter((person) => person.name),
    gifUrl: card.gifUrl?.trim() || null,
    columnId: card.columnId, position: card.position,
    links: (card.links || []).map(linkPayload),
    decisions: decisions.map((decision) => votePayload(decision)),
    actions: actions.map(actionPayload),
    // Legacy mirrors keep older clients from losing the latest state.
    vote: votePayload(latestDecision),
    assignee: latestOpenAction?.assignee?.trim() || null,
    assigneeEmail: latestOpenAction?.assigneeEmail?.trim() || null,
    actionText: latestOpenAction?.text.trim() || null,
    completedAt: card.completedAt || null,
    completedAtIso: card.completedAt ? new Date(card.completedAt).toISOString() : null,
    completedByName: card.completedByName || null, completedByEmail: card.completedByEmail || null,
    dueDate: card.dueDate || null, category: card.category || null,
    createdAt: card.createdAt, createdAtIso: new Date(card.createdAt).toISOString(),
    createdByName: card.createdByName || "Organizer", createdByEmail: card.createdByEmail || null,
    updatedByUid: user.uid, updatedByEmail: user.email || null, updatedByName: user.name,
    updatedAt: serverTimestamp(), updatedAtIso: now.toISOString(),
    lastMovedAt: card.lastMovedAt || null,
    lastMovedAtIso: card.lastMovedAt ? new Date(card.lastMovedAt).toISOString() : null,
    lastMovedByName: card.lastMovedByName || null,
    activities: card.activities.slice(-30).map(activityPayload),
    topicNotification: notificationPayload(card.topicNotification),
  }, { merge: true });
}

export async function claimTaskBoardScheduleHost(
  scopeId: string,
  cardId: string,
  requestDecisionId: string,
  scheduleDecision: TaskBoardVote,
): Promise<boolean> {
  const signed = actor();
  const reference = doc(cardsCollection(scopeId), cardId);
  return runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This topic no longer exists.");
    const card = parseCard(snapshot.id, snapshot.data());
    const decisions = card.decisions || [];
    const requestIndex = decisions.findIndex((decision) => decision.id === requestDecisionId);
    if (requestIndex < 0) return false;
    const request = decisions[requestIndex];
    if (request.status !== "open" || request.scheduleState !== "waiting-host") return false;
    const signedEmail = signed.email?.trim().toLowerCase() || "";
    if (request.requestedHostEmail && request.requestedHostEmail.trim().toLowerCase() !== signedEmail) {
      throw new Error("This host request is for another organizer.");
    }
    const now = Date.now();
    const nextRequest: TaskBoardVote = {
      ...request,
      status: "closed",
      closedAt: now,
      closedByName: signed.name,
      outcome: `Hosted by ${scheduleDecision.hostName || signed.name}`,
    };
    const nextSchedule: TaskBoardVote = {
      ...scheduleDecision,
      hostName: scheduleDecision.hostName || signed.name,
      hostEmail: scheduleDecision.hostEmail || signed.email,
      createdAt: scheduleDecision.createdAt || now,
      createdByName: scheduleDecision.createdByName || signed.name,
    };
    const nextDecisions = decisions.map((decision, index) => index === requestIndex ? nextRequest : decision);
    nextDecisions.push(nextSchedule);
    const activity: TaskBoardActivity = {
      id: `schedule-claim-${now}-${Math.random().toString(36).slice(2, 7)}`,
      action: "claimed",
      actorName: signed.name,
      actorEmail: signed.email,
      at: now,
    };
    transaction.update(reference, {
      decisions: nextDecisions.map((decision) => votePayload(decision)),
      vote: votePayload(nextSchedule),
      activities: [...card.activities, activity].slice(-30).map(activityPayload),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date(now).toISOString(),
    });
    return true;
  });
}

function commentPayload(comment: TaskBoardComment) {
  return {
    id: comment.id,
    text: comment.text.trim(),
    authorName: comment.authorName || "Organizer",
    authorEmail: comment.authorEmail?.trim() || null,
    createdAt: comment.createdAt,
    createdAtIso: new Date(comment.createdAt).toISOString(),
    updatedAt: comment.updatedAt || null,
    updatedAtIso: comment.updatedAt ? new Date(comment.updatedAt).toISOString() : null,
  };
}

export async function addTaskBoardComment(scopeId: string, cardId: string, text: string): Promise<TaskBoardComment> {
  const signed = actor();
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Write a comment first.");
  const reference = doc(cardsCollection(scopeId), cardId);
  const now = Date.now();
  const comment: TaskBoardComment = {
    id: `comment-${now}-${Math.random().toString(36).slice(2, 8)}`,
    text: cleanText.slice(0, 3000),
    authorName: signed.name,
    authorEmail: signed.email,
    createdAt: now,
  };
  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This card no longer exists.");
    const current = parseComments(snapshot.data().comments);
    const next = [...current, comment].slice(-200);
    transaction.update(reference, {
      comments: next.map(commentPayload),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date(now).toISOString(),
      updatedByName: signed.name,
      updatedByEmail: signed.email || null,
    });
  });
  return comment;
}

export async function updateTaskBoardComment(scopeId: string, cardId: string, commentId: string, text: string): Promise<void> {
  const signed = actor();
  const cleanText = text.trim();
  if (!cleanText) throw new Error("A comment cannot be empty.");
  const reference = doc(cardsCollection(scopeId), cardId);
  const now = Date.now();
  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This card no longer exists.");
    const comments = parseComments(snapshot.data().comments);
    const index = comments.findIndex((comment) => comment.id === commentId);
    if (index < 0) throw new Error("This comment no longer exists.");
    const comment = comments[index];
    const signedEmail = signed.email?.trim().toLowerCase() || "";
    const authorEmail = comment.authorEmail?.trim().toLowerCase() || "";
    const ownsComment = authorEmail ? Boolean(signedEmail && authorEmail === signedEmail) : comment.authorName === signed.name;
    if (!ownsComment) throw new Error("You can only edit your own comments.");
    comments[index] = { ...comment, text: cleanText.slice(0, 3000), updatedAt: now };
    transaction.update(reference, {
      comments: comments.map(commentPayload),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date(now).toISOString(),
      updatedByName: signed.name,
      updatedByEmail: signed.email || null,
    });
  });
}

export async function deleteTaskBoardComment(scopeId: string, cardId: string, commentId: string): Promise<void> {
  const signed = actor();
  const reference = doc(cardsCollection(scopeId), cardId);
  const now = Date.now();
  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This card no longer exists.");
    const comments = parseComments(snapshot.data().comments);
    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return;
    const signedEmail = signed.email?.trim().toLowerCase() || "";
    const authorEmail = comment.authorEmail?.trim().toLowerCase() || "";
    const ownsComment = authorEmail ? Boolean(signedEmail && authorEmail === signedEmail) : comment.authorName === signed.name;
    if (!ownsComment) throw new Error("You can only delete your own comments.");
    transaction.update(reference, {
      comments: comments.filter((item) => item.id !== commentId).map(commentPayload),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date(now).toISOString(),
      updatedByName: signed.name,
      updatedByEmail: signed.email || null,
    });
  });
}

export async function deleteTaskBoardCard(scopeId: string, cardId: string): Promise<void> {
  requireUser();
  await deleteDoc(doc(cardsCollection(scopeId), cardId));
}

export async function deleteTaskBoardColumn(scopeId: string, columnId: string): Promise<void> {
  requireUser();
  await deleteDoc(doc(columnsCollection(scopeId), columnId));
}

export async function castTaskBoardVote(
  scopeId: string,
  cardId: string,
  decisionId: string,
  voterHash: string,
  voterName: string,
  answers: TaskBoardVoteAnswer[],
): Promise<void> {
  const signedInUser = requireUser();
  const reference = doc(cardsCollection(scopeId), cardId);
  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This topic no longer exists.");
    const card = parseCard(snapshot.id, snapshot.data());
    const decisions = card.decisions || [];
    const decisionIndex = decisions.findIndex((decision) => decision.id === decisionId);
    if (decisionIndex < 0) throw new Error("This decision no longer exists.");
    const decision = decisions[decisionIndex];
    if (decision.mode === "recorded" || decision.status !== "open") throw new Error("This vote is closed.");
    if (decision.participantEmails?.length) {
      const email = signedInUser.email?.trim().toLowerCase() || "";
      const allowed = decision.participantEmails.some((value) => value.trim().toLowerCase() === email);
      if (!allowed) throw new Error("This decision is only asking selected organizers.");
    }

    const questions = decision.questions?.length
      ? decision.questions
      : [{
        id: "question-1",
        text: decision.question,
        kind: decision.kind === "schedule" ? "multi-select" as const : (decision.kind || "choose-one") as Exclude<TaskBoardVoteKind, "schedule">,
        options: decision.options,
        maxSelections: decision.maxSelections,
      }];
    const cleanAnswers: TaskBoardVoteAnswer[] = [];
    for (const question of questions) {
      const incoming = answers.find((answer) => answer.questionId === question.id);
      const uniqueOptionIds = [...new Set(incoming?.optionIds || [])].filter((optionId) => question.options.some((option) => option.id === optionId));
      const maxSelections = question.kind === "multi-select"
        ? Math.max(1, question.maxSelections || question.options.length)
        : 1;
      if (!uniqueOptionIds.length) throw new Error("Answer every question.");
      if (uniqueOptionIds.length > maxSelections) throw new Error(`Choose up to ${maxSelections}.`);
      cleanAnswers.push({ questionId: question.id, optionIds: uniqueOptionIds });
    }

    const ballots = [...(decision.ballots || [])];
    const existingBallotIndex = ballots.findIndex((ballot) => ballot.voterHash === voterHash);
    if (existingBallotIndex < 0 && decision.voterHashes.includes(voterHash) && !decision.ballots?.length) {
      throw new Error("Your earlier vote is already recorded on this legacy poll.");
    }
    const previousAnswers = existingBallotIndex >= 0
      ? ballots[existingBallotIndex].answers?.length
        ? ballots[existingBallotIndex].answers!
        : [{ questionId: questions[0].id, optionIds: ballots[existingBallotIndex].optionIds }]
      : [];

    const nextQuestions = questions.map((question) => {
      const previousIds = previousAnswers.find((answer) => answer.questionId === question.id)?.optionIds || [];
      const nextIds = cleanAnswers.find((answer) => answer.questionId === question.id)?.optionIds || [];
      return {
        ...question,
        options: question.options.map((option) => {
          let count = option.count || 0;
          if (previousIds.includes(option.id)) count = Math.max(0, count - 1);
          if (nextIds.includes(option.id)) count += 1;
          return { ...option, count };
        }),
      };
    });
    const nextBallot: TaskBoardVoteBallot = {
      voterHash,
      voterName: decision.anonymous ? undefined : voterName,
      optionIds: cleanAnswers[0]?.optionIds || [],
      answers: cleanAnswers,
    };
    if (existingBallotIndex >= 0) ballots[existingBallotIndex] = nextBallot;
    else ballots.push(nextBallot);

    const nextDecision: TaskBoardVote = {
      ...decision,
      questions: nextQuestions,
      options: nextQuestions[0]?.options || decision.options,
      ballots,
      voterHashes: ballots.map((ballot) => ballot.voterHash),
    };
    const nextDecisions = decisions.map((item, index) => index === decisionIndex ? nextDecision : item);
    transaction.update(reference, {
      decisions: nextDecisions.map((item) => votePayload(item)),
      vote: votePayload(nextDecisions[nextDecisions.length - 1]),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
  });
}

