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

export type TaskBoardVoteKind = "yes-no-abstain" | "choose-one" | "multi-select";

export type TaskBoardVoteOption = {
  id: string;
  label: string;
  count: number;
};

export type TaskBoardVoteBallot = {
  voterHash: string;
  voterName?: string;
  optionIds: string[];
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
  question: string;
  outcome?: string;
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
};

export type TaskBoardLink = {
  id: string;
  url: string;
  label: string;
  createdAt: number;
  createdByName?: string;
};

export type TaskBoardActionItem = {
  id: string;
  text: string;
  status: "open" | "done";
  assignee?: string;
  assigneeEmail?: string;
  createdAt: number;
  createdByName?: string;
  completedAt?: number;
  completedByName?: string;
  completedByEmail?: string;
};

export type TaskBoardCard = {
  id: string;
  title: string;
  note?: string;
  columnId: string;
  position: number;
  links?: TaskBoardLink[];
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
};

export type TaskBoardMeta = {
  name: string;
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

function parseVote(value: unknown, fallbackId = "decision"): TaskBoardVote | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const mode = row.mode === "recorded" ? "recorded" : "vote";
  const question = String(row.question || row.outcome || "").trim();
  const outcome = row.outcome ? String(row.outcome).trim() : undefined;
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions.map((item, index) => {
    const option = (item || {}) as Record<string, unknown>;
    return {
      id: String(option.id || `option-${index}`),
      label: String(option.label || `Option ${index + 1}`),
      count: Number(option.count || 0),
    };
  }).filter((option) => option.label.trim());

  if (!question) return undefined;
  if (mode === "vote" && options.length < 2) return undefined;

  const normalizedLabels = options.map((option) => option.label.trim().toLowerCase());
  const inferredKind: TaskBoardVoteKind = normalizedLabels.length === 3
    && normalizedLabels[0] === "yes"
    && normalizedLabels[1] === "no"
    && normalizedLabels[2] === "abstain"
    ? "yes-no-abstain"
    : "choose-one";
  const rawKind = String(row.kind || "");
  const kind: TaskBoardVoteKind = rawKind === "multi-select" || rawKind === "choose-one" || rawKind === "yes-no-abstain"
    ? rawKind
    : inferredKind;
  const ballots = Array.isArray(row.ballots)
    ? row.ballots.map((item) => {
      const ballot = (item || {}) as Record<string, unknown>;
      return {
        voterHash: String(ballot.voterHash || ""),
        voterName: ballot.voterName ? String(ballot.voterName) : undefined,
        optionIds: Array.isArray(ballot.optionIds) ? ballot.optionIds.map(String).filter(Boolean) : [],
      };
    }).filter((ballot) => ballot.voterHash && ballot.optionIds.length)
    : undefined;

  return {
    id: String(row.id || fallbackId),
    mode,
    kind,
    question,
    outcome,
    options,
    anonymous: row.anonymous !== false,
    hideParticipationUntilClosed: Boolean(row.hideParticipationUntilClosed),
    showResultsWhileOpen: Boolean(row.showResultsWhileOpen),
    status: row.status === "closed" || mode === "recorded" ? "closed" : "open",
    eligibleCount: Number(row.eligibleCount || 0) || undefined,
    maxSelections: Number(row.maxSelections || 0) || undefined,
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

function parseActions(value: unknown): TaskBoardActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || `action-${index}`),
      text: String(row.text || "").trim(),
      status: (row.status === "done" ? "done" : "open") as TaskBoardActionItem["status"],
      assignee: row.assignee ? String(row.assignee) : undefined,
      assigneeEmail: row.assigneeEmail ? String(row.assigneeEmail) : undefined,
      createdAt: toMillis(row.createdAt) || Date.now(),
      createdByName: row.createdByName ? String(row.createdByName) : undefined,
      completedAt: toMillis(row.completedAt),
      completedByName: row.completedByName ? String(row.completedByName) : undefined,
      completedByEmail: row.completedByEmail ? String(row.completedByEmail) : undefined,
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
    columnId: String(data.columnId || ""),
    position: Number.isFinite(Number(data.position)) ? Number(data.position) : 1000,
    links: parseLinks(data.links),
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
    app: "Fair Teams", schemaVersion: 4, name: meta.name.trim() || "Action Board",
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

function votePayload(vote?: TaskBoardVote) {
  if (!vote) return null;
  return {
    id: vote.id || null,
    mode: vote.mode || "vote",
    kind: vote.kind || "yes-no-abstain",
    question: vote.question.trim(),
    outcome: vote.outcome?.trim() || null,
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
    })),
    namedVotes: vote.namedVotes || [],
    createdAt: vote.createdAt,
    closedAt: vote.closedAt || null,
    createdByName: vote.createdByName || null,
    closedByName: vote.closedByName || null,
    options: vote.options.map((option) => ({ id: option.id, label: option.label.trim(), count: option.count || 0 })),
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
    assignee: action.assignee?.trim() || null,
    assigneeEmail: action.assigneeEmail?.trim() || null,
    createdAt: action.createdAt,
    createdByName: action.createdByName || null,
    completedAt: action.completedAt || null,
    completedByName: action.completedByName || null,
    completedByEmail: action.completedByEmail || null,
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
    app: "Fair Teams", schemaVersion: 4,
    title: card.title.trim() || "Untitled topic", note: card.note?.trim() || null,
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
  }, { merge: true });
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
  optionIds: string[],
): Promise<void> {
  requireUser();
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

    const uniqueOptionIds = [...new Set(optionIds)].filter((optionId) => decision.options.some((option) => option.id === optionId));
    const maxSelections = decision.kind === "multi-select" ? Math.max(1, decision.maxSelections || decision.options.length) : 1;
    if (!uniqueOptionIds.length) throw new Error("Choose an option.");
    if (uniqueOptionIds.length > maxSelections) throw new Error(`Choose up to ${maxSelections}.`);

    const ballots = [...(decision.ballots || [])];
    const existingBallotIndex = ballots.findIndex((ballot) => ballot.voterHash === voterHash);
    if (existingBallotIndex < 0 && decision.voterHashes.includes(voterHash) && !decision.ballots?.length) {
      throw new Error("Your earlier vote is already recorded on this legacy poll.");
    }
    const previousIds = existingBallotIndex >= 0 ? ballots[existingBallotIndex].optionIds : [];
    const nextOptions = decision.options.map((option) => {
      let count = option.count || 0;
      if (previousIds.includes(option.id)) count = Math.max(0, count - 1);
      if (uniqueOptionIds.includes(option.id)) count += 1;
      return { ...option, count };
    });
    const nextBallot: TaskBoardVoteBallot = {
      voterHash,
      voterName: decision.anonymous ? undefined : voterName,
      optionIds: uniqueOptionIds,
    };
    if (existingBallotIndex >= 0) ballots[existingBallotIndex] = nextBallot;
    else ballots.push(nextBallot);

    const nextDecision: TaskBoardVote = {
      ...decision,
      options: nextOptions,
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
