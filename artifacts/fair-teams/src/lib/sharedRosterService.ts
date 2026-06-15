import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { normalizeRoster, type RoomPlayer, type RoomRoster } from "@/lib/localRoster";
import { getFirebaseProjectId, getFairTeamsAuth, getFairTeamsFirestore } from "@/lib/firebaseClient";

export type SharedRosterUser = {
  uid: string;
  email: string;
  displayName?: string;
};

export type FirebaseSharedRosterSnapshot = FirebaseSharedRosterSummary & {
  roster: RoomRoster;
};

export type FirebaseSharedRosterSummary = {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  version: number;
  playerCount: number;
  createdAt?: string;
  updatedAt?: string;
};

function toSharedRosterUser(user: User | null): SharedRosterUser | null {
  if (!user || !user.email) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || undefined,
  };
}

function getCurrentSharedRosterUser() {
  const user = toSharedRosterUser(getFairTeamsAuth().currentUser);
  if (!user) throw new Error("Sign in to Firebase shared rosters first.");
  return user;
}

function removeLocalOnlyPlayerData(player: RoomPlayer) {
  const snapshot: Partial<RoomPlayer> = { ...player };
  delete snapshot.profilePhoto;
  return snapshot;
}

function makePhotoFreeRosterSnapshot(roster: RoomRoster) {
  const snapshot: Partial<RoomRoster> = {
    ...roster,
    players: roster.players.map(removeLocalOnlyPlayerData) as RoomPlayer[],
  };
  delete snapshot.logo;
  delete snapshot.cloudSource;
  return snapshot;
}

function cleanForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate().toISOString();
  }
  return undefined;
}

function toRosterSummary(id: string, data: DocumentData): FirebaseSharedRosterSummary {
  const rosterData = data.rosterData && typeof data.rosterData === "object" ? data.rosterData as { players?: unknown[] } : undefined;
  const playerCount = typeof data.playerCount === "number"
    ? data.playerCount
    : Array.isArray(rosterData?.players)
      ? rosterData!.players.length
      : 0;

  return {
    id,
    name: typeof data.name === "string" && data.name.trim() ? data.name : "Shared roster",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    version: typeof data.version === "number" ? data.version : 1,
    playerCount,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function listenToSharedRosterUser(callback: (user: SharedRosterUser | null) => void): Unsubscribe {
  return onAuthStateChanged(getFairTeamsAuth(), (user) => {
    callback(toSharedRosterUser(user));
  });
}

export async function createSharedRosterAccount(email: string, password: string): Promise<SharedRosterUser> {
  const result = await createUserWithEmailAndPassword(getFairTeamsAuth(), email.trim(), password);
  const user = toSharedRosterUser(result.user);
  if (!user) throw new Error("Firebase created the account but did not return an email address.");
  return user;
}

export async function signInToSharedRosters(email: string, password: string): Promise<SharedRosterUser> {
  const result = await signInWithEmailAndPassword(getFairTeamsAuth(), email.trim(), password);
  const user = toSharedRosterUser(result.user);
  if (!user) throw new Error("Firebase signed in but did not return an email address.");
  return user;
}

export async function signOutOfSharedRosters() {
  await signOut(getFairTeamsAuth());
}

export async function createFirebaseSharedRoster(roster: RoomRoster): Promise<FirebaseSharedRosterSummary> {
  const user = getCurrentSharedRosterUser();
  if (!roster.players.length) throw new Error("Add players before creating a shared roster.");

  const now = new Date().toISOString();
  const rosterData = cleanForFirestore(makePhotoFreeRosterSnapshot(roster));
  const playerCount = Array.isArray(rosterData.players) ? rosterData.players.length : 0;
  const payload = {
    app: "Fair Teams",
    schemaVersion: 1,
    name: roster.name || "Shared roster",
    ownerUid: user.uid,
    ownerEmail: user.email,
    memberUids: [user.uid],
    memberEmails: [user.email.toLowerCase()],
    roleByUid: { [user.uid]: "owner" },
    version: 1,
    playerCount,
    rosterData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now,
    updatedAtIso: now,
  };

  const docRef = await addDoc(collection(getFairTeamsFirestore(), "sharedRosters"), payload);
  return {
    id: docRef.id,
    name: payload.name,
    ownerUid: payload.ownerUid,
    ownerEmail: payload.ownerEmail,
    version: payload.version,
    playerCount: payload.playerCount,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listFirebaseSharedRosters(): Promise<FirebaseSharedRosterSummary[]> {
  const user = getCurrentSharedRosterUser();
  const sharedRosterQuery = query(
    collection(getFairTeamsFirestore(), "sharedRosters"),
    where("memberUids", "array-contains", user.uid),
  );
  const snapshot = await getDocs(sharedRosterQuery);
  return snapshot.docs
    .map((doc) => toRosterSummary(doc.id, doc.data()))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}


export async function readFirebaseSharedRoster(rosterId: string): Promise<FirebaseSharedRosterSnapshot> {
  getCurrentSharedRosterUser();
  const docRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error("Firebase shared roster was not found.");
  const data = snapshot.data();
  const summary = toRosterSummary(snapshot.id, data);
  const rawRoster = data.rosterData && typeof data.rosterData === "object" ? data.rosterData as Partial<RoomRoster> : undefined;
  if (!rawRoster || !Array.isArray(rawRoster.players)) {
    throw new Error("Firebase shared roster does not contain roster data yet.");
  }
  const roster = normalizeRoster({
    ...rawRoster,
    name: summary.name || rawRoster.name,
  }, 0);
  return {
    ...summary,
    roster,
  };
}

export function getSharedRosterBackendLabel() {
  return `Firebase · ${getFirebaseProjectId()}`;
}
