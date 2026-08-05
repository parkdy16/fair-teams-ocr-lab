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

export type TaskBoardColumn = {
  id: string;
  name: string;
  position: number;
  archived?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type TaskBoardActivity = {
  id: string;
  action: "created" | "edited" | "moved" | "assigned" | "unassigned";
  actorName: string;
  actorEmail?: string;
  at: number;
  fromColumnName?: string;
  toColumnName?: string;
};


export type TaskBoardVoteOption = {
  id: string;
  label: string;
  count: number;
};

export type TaskBoardNamedVote = {
  voterHash: string;
  voterName: string;
  optionId: string;
};

export type TaskBoardVote = {
  question: string;
  options: TaskBoardVoteOption[];
  anonymous: boolean;
  hideParticipationUntilClosed: boolean;
  showResultsWhileOpen: boolean;
  status: "open" | "closed";
  eligibleCount?: number;
  voterHashes: string[];
  namedVotes?: TaskBoardNamedVote[];
  createdAt: number;
  closedAt?: number;
};

export type TaskBoardCard = {
  id: string;
  title: string;
  note?: string;
  columnId: string;
  position: number;
  assignee?: string;
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
  if (!user?.email) throw new Error("Sign in to use the shared task board.");
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
    name: String(data.name || "Tasks"),
    createdAt: toMillis(data.createdAt) || toMillis(data.createdAtIso),
    updatedAt: toMillis(data.updatedAt) || toMillis(data.updatedAtIso),
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
  };
}

function parseColumn(id: string, data: DocumentData): TaskBoardColumn {
  return {
    id,
    name: String(data.name || "Column"),
    position: Number.isFinite(Number(data.position)) ? Number(data.position) : 1000,
    archived: Boolean(data.archived),
    createdAt: toMillis(data.createdAt) || toMillis(data.createdAtIso),
    updatedAt: toMillis(data.updatedAt) || toMillis(data.updatedAtIso),
  };
}

function parseActivities(value: unknown): TaskBoardActivity[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || `activity-${index}`),
      action: (["created", "edited", "moved", "assigned", "unassigned"].includes(String(row.action)) ? String(row.action) : "edited") as TaskBoardActivity["action"],
      actorName: String(row.actorName || "Organizer"),
      actorEmail: row.actorEmail ? String(row.actorEmail) : undefined,
      at: toMillis(row.at) || Date.now(),
      fromColumnName: row.fromColumnName ? String(row.fromColumnName) : undefined,
      toColumnName: row.toColumnName ? String(row.toColumnName) : undefined,
    };
  });
}

function parseVote(value: unknown): TaskBoardVote | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions.map((item, index) => {
    const option = (item || {}) as Record<string, unknown>;
    return { id: String(option.id || `option-${index}`), label: String(option.label || `Option ${index + 1}`), count: Number(option.count || 0) };
  }).filter((option) => option.label.trim());
  if (!String(row.question || "").trim() || options.length < 2) return undefined;
  return {
    question: String(row.question), options, anonymous: row.anonymous !== false,
    hideParticipationUntilClosed: Boolean(row.hideParticipationUntilClosed),
    showResultsWhileOpen: Boolean(row.showResultsWhileOpen),
    status: row.status === "closed" ? "closed" : "open",
    eligibleCount: Number(row.eligibleCount || 0) || undefined,
    voterHashes: Array.isArray(row.voterHashes) ? row.voterHashes.map(String) : [],
    namedVotes: Array.isArray(row.namedVotes) ? row.namedVotes.map((item) => { const vote=(item||{}) as Record<string,unknown>; return { voterHash:String(vote.voterHash||""), voterName:String(vote.voterName||"Member"), optionId:String(vote.optionId||"") }; }).filter((vote)=>vote.voterHash&&vote.optionId) : undefined,
    createdAt: toMillis(row.createdAt) || Date.now(), closedAt: toMillis(row.closedAt),
  };
}

function parseCard(id: string, data: DocumentData): TaskBoardCard {
  const now = Date.now();
  return {
    id,
    title: String(data.title || "Untitled task"),
    note: data.note ? String(data.note) : undefined,
    columnId: String(data.columnId || ""),
    position: Number.isFinite(Number(data.position)) ? Number(data.position) : 1000,
    assignee: data.assignee ? String(data.assignee) : undefined,
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
    vote: parseVote(data.vote),
  };
}

export function listenToTaskBoard(scopeId: string, callback: (snapshot: TaskBoardSnapshot) => void, onError?: (error: Error) => void): Unsubscribe {
  requireUser();
  let meta: TaskBoardMeta | null = null;
  let columns: TaskBoardColumn[] = [];
  let cards: TaskBoardCard[] = [];
  const emit = () => callback({ meta, columns, cards });
  const fail = (error: unknown) => onError?.(error instanceof Error ? error : new Error("Could not load task board."));
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
    app: "Fair Teams", schemaVersion: 2, name: meta.name.trim() || "Tasks",
    updatedByUid: user.uid, updatedByEmail: user.email || null, updatedByName: user.name,
    updatedAt: serverTimestamp(), updatedAtIso: now.toISOString(),
    ...(meta.createdAt ? {} : { createdAt: serverTimestamp(), createdAtIso: now.toISOString() }),
  }, { merge: true });
}

export async function saveTaskBoardColumn(scopeId: string, column: TaskBoardColumn): Promise<void> {
  const user = actor();
  const now = new Date();
  await setDoc(doc(columnsCollection(scopeId), column.id), {
    app: "Fair Teams", schemaVersion: 2, name: column.name.trim() || "Column", position: column.position,
    archived: Boolean(column.archived), updatedByUid: user.uid, updatedByName: user.name,
    updatedAt: serverTimestamp(), updatedAtIso: now.toISOString(),
    ...(column.createdAt ? {} : { createdAt: serverTimestamp(), createdAtIso: now.toISOString() }),
  }, { merge: true });
}

export async function saveTaskBoardColumns(scopeId: string, columns: TaskBoardColumn[]): Promise<void> {
  actor();
  const batch = writeBatch(getFairTeamsFirestore());
  columns.forEach((column) => batch.set(doc(columnsCollection(scopeId), column.id), {
    name: column.name.trim() || "Column", position: column.position, archived: Boolean(column.archived),
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
    question: vote.question.trim(), anonymous: vote.anonymous,
    hideParticipationUntilClosed: vote.hideParticipationUntilClosed,
    showResultsWhileOpen: vote.showResultsWhileOpen, status: vote.status,
    eligibleCount: vote.eligibleCount || null, voterHashes: vote.voterHashes || [],
    namedVotes: vote.namedVotes || [], createdAt: vote.createdAt, closedAt: vote.closedAt || null,
    options: vote.options.map((option) => ({ id: option.id, label: option.label.trim(), count: option.count || 0 })),
  };
}

export async function saveTaskBoardCard(scopeId: string, card: TaskBoardCard): Promise<void> {
  const user = actor();
  const now = new Date();
  await setDoc(doc(cardsCollection(scopeId), card.id), {
    app: "Fair Teams", schemaVersion: 2,
    title: card.title.trim() || "Untitled task", note: card.note?.trim() || null,
    columnId: card.columnId, position: card.position, assignee: card.assignee?.trim() || null,
    dueDate: card.dueDate || null, category: card.category || null,
    createdAt: card.createdAt, createdAtIso: new Date(card.createdAt).toISOString(),
    createdByName: card.createdByName || "Organizer", createdByEmail: card.createdByEmail || null,
    updatedByUid: user.uid, updatedByEmail: user.email || null, updatedByName: user.name,
    updatedAt: serverTimestamp(), updatedAtIso: now.toISOString(),
    lastMovedAt: card.lastMovedAt || null,
    lastMovedAtIso: card.lastMovedAt ? new Date(card.lastMovedAt).toISOString() : null,
    lastMovedByName: card.lastMovedByName || null,
    activities: card.activities.slice(-20).map(activityPayload),
    vote: votePayload(card.vote),
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

export async function castTaskBoardVote(scopeId: string, cardId: string, voterHash: string, voterName: string, optionId: string): Promise<void> {
  requireUser();
  const reference = doc(cardsCollection(scopeId), cardId);
  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This card no longer exists.");
    const card = parseCard(snapshot.id, snapshot.data());
    const vote = card.vote;
    if (!vote || vote.status !== "open") throw new Error("This vote is closed.");
    if (vote.voterHashes.includes(voterHash)) throw new Error("Your vote is already recorded.");
    if (!vote.options.some((option) => option.id === optionId)) throw new Error("Choose a valid option.");
    const nextVote: TaskBoardVote = {
      ...vote, voterHashes: [...vote.voterHashes, voterHash],
      options: vote.options.map((option) => option.id === optionId ? { ...option, count: option.count + 1 } : option),
      namedVotes: vote.anonymous ? vote.namedVotes : [...(vote.namedVotes || []), { voterHash, voterName, optionId }],
    };
    transaction.update(reference, { vote: votePayload(nextVote), updatedAt: serverTimestamp(), updatedAtIso: new Date().toISOString() });
  });
}
