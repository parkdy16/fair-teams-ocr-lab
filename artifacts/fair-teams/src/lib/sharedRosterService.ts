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
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
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

export type FirebaseSharedGroupSummary = {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  rosterCount: number;
  memberCount: number;
  currentUserRole?: "owner" | "editor" | "viewer" | "member";
  lastSavedByEmail?: string;
  lastSavedRosterName?: string;
  lastSavedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type FirebaseSharedRosterSummary = {
  id: string;
  groupId?: string;
  groupName?: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  version: number;
  playerCount: number;
  createdAt?: string;
  updatedAt?: string;
  currentUserRole?: "owner" | "editor" | "viewer" | "member";
  lastSavedByEmail?: string;
};

export type FirebaseGroupInvite = FirebaseSharedGroupSummary & {
  inviteeEmail: string;
};

function toSharedRosterUser(user: User | null): SharedRosterUser | null {
  if (!user || !user.email) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || undefined,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function cleanGroupName(value?: string) {
  const name = (value || "").trim();
  return name || "My Fair Teams group";
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

function currentUserRoleFromData(data: DocumentData): "owner" | "editor" | "viewer" | "member" | undefined {
  const user = toSharedRosterUser(getFairTeamsAuth().currentUser);
  if (!user) return undefined;
  if (data.ownerUid === user.uid) return "owner";
  const roleByUid = data.roleByUid && typeof data.roleByUid === "object" ? data.roleByUid as Record<string, unknown> : {};
  const role = roleByUid[user.uid];
  if (role === "owner" || role === "editor" || role === "viewer") return role;
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  return memberUids.includes(user.uid) ? "member" : undefined;
}

function toGroupSummary(id: string, data: DocumentData): FirebaseSharedGroupSummary {
  const rosterIds = Array.isArray(data.rosterIds) ? data.rosterIds.filter((value) => typeof value === "string") : [];
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  return {
    id,
    name: typeof data.name === "string" && data.name.trim() ? data.name : "My Fair Teams group",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    rosterCount: rosterIds.length,
    memberCount: memberUids.length,
    currentUserRole: currentUserRoleFromData(data),
    lastSavedByEmail: typeof data.lastSavedByEmail === "string" ? data.lastSavedByEmail : undefined,
    lastSavedRosterName: typeof data.lastSavedRosterName === "string" ? data.lastSavedRosterName : undefined,
    lastSavedAt: timestampToIso(data.lastSavedAt) || (typeof data.lastSavedAtIso === "string" ? data.lastSavedAtIso : undefined),
    createdAt: timestampToIso(data.createdAt) || (typeof data.createdAtIso === "string" ? data.createdAtIso : undefined),
    updatedAt: timestampToIso(data.updatedAt) || (typeof data.updatedAtIso === "string" ? data.updatedAtIso : undefined),
  };
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
    groupId: typeof data.groupId === "string" ? data.groupId : undefined,
    groupName: typeof data.groupName === "string" && data.groupName.trim() ? data.groupName : undefined,
    name: typeof data.name === "string" && data.name.trim() ? data.name : "Shared roster",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    version: typeof data.version === "number" ? data.version : 1,
    playerCount,
    createdAt: timestampToIso(data.createdAt) || (typeof data.createdAtIso === "string" ? data.createdAtIso : undefined),
    updatedAt: timestampToIso(data.updatedAt) || (typeof data.updatedAtIso === "string" ? data.updatedAtIso : undefined),
    currentUserRole: currentUserRoleFromData(data),
    lastSavedByEmail: typeof data.lastSavedByEmail === "string" ? data.lastSavedByEmail : undefined,
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

export async function createFirebaseSharedGroup(groupName: string): Promise<FirebaseSharedGroupSummary> {
  const user = getCurrentSharedRosterUser();
  const now = new Date().toISOString();
  const name = cleanGroupName(groupName);
  const payload = {
    app: "Fair Teams",
    schemaVersion: 2,
    name,
    ownerUid: user.uid,
    ownerEmail: user.email,
    memberUids: [user.uid],
    memberEmails: [normalizeEmail(user.email)],
    pendingInviteEmails: [],
    roleByUid: { [user.uid]: "owner" },
    rosterIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now,
    updatedAtIso: now,
  };
  const docRef = await addDoc(collection(getFairTeamsFirestore(), "sharedGroups"), payload);
  return toGroupSummary(docRef.id, payload);
}

export async function listFirebaseSharedGroups(): Promise<FirebaseSharedGroupSummary[]> {
  const user = getCurrentSharedRosterUser();
  const groupsQuery = query(
    collection(getFairTeamsFirestore(), "sharedGroups"),
    where("memberUids", "array-contains", user.uid),
  );
  const snapshot = await getDocs(groupsQuery);
  return snapshot.docs
    .map((docSnap) => toGroupSummary(docSnap.id, docSnap.data()))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

async function requireGroupForRoster(groupId?: string, fallbackName?: string) {
  const user = getCurrentSharedRosterUser();
  if (!groupId) return createFirebaseSharedGroup(fallbackName || "My Fair Teams group");
  const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error("Shared group was not found.");
  const data = groupSnap.data();
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  if (!memberUids.includes(user.uid)) throw new Error("You are not a member of this shared group.");
  return toGroupSummary(groupSnap.id, data);
}

export async function createFirebaseSharedRoster(roster: RoomRoster, groupId?: string, groupName?: string): Promise<FirebaseSharedRosterSummary> {
  const user = getCurrentSharedRosterUser();
  if (!roster.players.length) throw new Error("Add players before creating a shared roster.");

  const group = await requireGroupForRoster(groupId, groupName);
  const groupSnap = await getDoc(doc(getFairTeamsFirestore(), "sharedGroups", group.id));
  const groupData = groupSnap.exists() ? groupSnap.data() : {};
  const groupMemberUids = Array.isArray(groupData.memberUids) ? groupData.memberUids.filter((id): id is string => typeof id === "string") : [user.uid];
  const groupMemberEmails = Array.isArray(groupData.memberEmails) ? groupData.memberEmails.filter((email): email is string => typeof email === "string") : [normalizeEmail(user.email)];
  const groupPendingInviteEmails = Array.isArray(groupData.pendingInviteEmails) ? groupData.pendingInviteEmails.filter((email): email is string => typeof email === "string") : [];
  const groupRoleByUid = groupData.roleByUid && typeof groupData.roleByUid === "object" ? groupData.roleByUid as Record<string, unknown> : { [user.uid]: "owner" };
  const now = new Date().toISOString();
  const rosterData = cleanForFirestore(makePhotoFreeRosterSnapshot(roster));
  const playerCount = Array.isArray(rosterData.players) ? rosterData.players.length : 0;
  const payload = {
    app: "Fair Teams",
    schemaVersion: 2,
    groupId: group.id,
    groupName: group.name,
    name: roster.name || "Shared roster",
    ownerUid: user.uid,
    ownerEmail: user.email,
    memberUids: groupMemberUids,
    memberEmails: groupMemberEmails,
    pendingInviteEmails: groupPendingInviteEmails,
    roleByUid: groupRoleByUid,
    version: 1,
    playerCount,
    rosterData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now,
    updatedAtIso: now,
    lastSavedByUid: user.uid,
    lastSavedByEmail: user.email,
    lastSavedAt: serverTimestamp(),
    lastSavedAtIso: now,
  };

  const docRef = await addDoc(collection(getFairTeamsFirestore(), "sharedRosters"), payload);
  const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", group.id);
  const batch = writeBatch(getFairTeamsFirestore());
  batch.update(groupRef, {
    rosterIds: arrayUnion(docRef.id),
    lastSavedByUid: user.uid,
    lastSavedByEmail: user.email,
    lastSavedRosterId: docRef.id,
    lastSavedRosterName: payload.name,
    lastSavedAt: serverTimestamp(),
    lastSavedAtIso: now,
    updatedAt: serverTimestamp(),
    updatedAtIso: now,
  });
  await batch.commit();
  return toRosterSummary(docRef.id, payload);
}

export async function listFirebaseSharedRosters(groupId?: string): Promise<FirebaseSharedRosterSummary[]> {
  const user = getCurrentSharedRosterUser();
  const sharedRosterQuery = query(
    collection(getFairTeamsFirestore(), "sharedRosters"),
    where("memberUids", "array-contains", user.uid),
  );
  const snapshot = await getDocs(sharedRosterQuery);
  return snapshot.docs
    .map((docSnap) => toRosterSummary(docSnap.id, docSnap.data()))
    .filter((summary) => !groupId || summary.groupId === groupId)
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

export async function inviteEmailToFirebaseSharedGroup(groupId: string, inviteeEmail: string): Promise<void> {
  const user = getCurrentSharedRosterUser();
  const email = normalizeEmail(inviteeEmail);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address to invite.");
  if (email === normalizeEmail(user.email)) throw new Error("You are already signed in with that email.");

  const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error("Shared group was not found.");
  const groupData = groupSnap.data();
  const role = currentUserRoleFromData(groupData);
  if (role !== "owner" && role !== "editor") throw new Error("Only owners/editors can invite members to this group.");

  const rosterIds = Array.isArray(groupData.rosterIds) ? groupData.rosterIds.filter((id): id is string => typeof id === "string") : [];
  const now = new Date().toISOString();
  const batch = writeBatch(getFairTeamsFirestore());
  batch.update(groupRef, {
    pendingInviteEmails: arrayUnion(email),
    updatedAt: serverTimestamp(),
    updatedAtIso: now,
  });
  rosterIds.forEach((rosterId) => {
    batch.update(doc(getFairTeamsFirestore(), "sharedRosters", rosterId), {
      pendingInviteEmails: arrayUnion(email),
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    });
  });
  await batch.commit();
}

export async function listFirebaseGroupInvites(): Promise<FirebaseGroupInvite[]> {
  const user = getCurrentSharedRosterUser();
  const email = normalizeEmail(user.email);
  const inviteQuery = query(
    collection(getFairTeamsFirestore(), "sharedGroups"),
    where("pendingInviteEmails", "array-contains", email),
  );
  const snapshot = await getDocs(inviteQuery);
  return snapshot.docs
    .map((docSnap) => ({ ...toGroupSummary(docSnap.id, docSnap.data()), inviteeEmail: email }))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

export async function acceptFirebaseGroupInvite(groupId: string): Promise<FirebaseSharedGroupSummary> {
  const user = getCurrentSharedRosterUser();
  const email = normalizeEmail(user.email);
  const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error("Shared group invite was not found.");
  const groupData = groupSnap.data();
  const pendingEmails = Array.isArray(groupData.pendingInviteEmails) ? groupData.pendingInviteEmails : [];
  if (!pendingEmails.includes(email)) throw new Error("This invite is not for the signed-in email address.");

  const rosterIds = Array.isArray(groupData.rosterIds) ? groupData.rosterIds.filter((id): id is string => typeof id === "string") : [];
  const now = new Date().toISOString();
  const nextRoleByUid = {
    ...(groupData.roleByUid && typeof groupData.roleByUid === "object" ? groupData.roleByUid as Record<string, unknown> : {}),
    [user.uid]: "editor",
  };

  const batch = writeBatch(getFairTeamsFirestore());
  batch.update(groupRef, {
    memberUids: arrayUnion(user.uid),
    memberEmails: arrayUnion(email),
    pendingInviteEmails: arrayRemove(email),
    roleByUid: nextRoleByUid,
    updatedAt: serverTimestamp(),
    updatedAtIso: now,
  });
  rosterIds.forEach((rosterId) => {
    batch.update(doc(getFairTeamsFirestore(), "sharedRosters", rosterId), {
      memberUids: arrayUnion(user.uid),
      memberEmails: arrayUnion(email),
      pendingInviteEmails: arrayRemove(email),
      roleByUid: nextRoleByUid,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    });
  });
  await batch.commit();
  return {
    ...toGroupSummary(groupId, groupData),
    currentUserRole: "editor",
    memberCount: (Array.isArray(groupData.memberUids) ? groupData.memberUids.length : 0) + 1,
    updatedAt: now,
  };
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

export async function saveFirebaseSharedRoster(roster: RoomRoster): Promise<FirebaseSharedRosterSummary> {
  const user = getCurrentSharedRosterUser();
  const source = roster.cloudSource;
  if (source?.provider !== "firebase" || !source.firebaseRosterId) {
    throw new Error("Open a Firebase shared roster before saving changes back to Firebase.");
  }

  const rosterId = source.firebaseRosterId;
  const expectedVersion = typeof source.firebaseVersion === "number" ? source.firebaseVersion : 1;
  const now = new Date().toISOString();
  const rosterData = cleanForFirestore(makePhotoFreeRosterSnapshot(roster));
  const playerCount = Array.isArray(rosterData.players) ? rosterData.players.length : 0;
  const docRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);

  const saved = await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) throw new Error("Firebase shared roster was not found.");

    const data = snapshot.data();
    const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
    if (!memberUids.includes(user.uid)) {
      throw new Error("You are not a member of this Firebase shared roster.");
    }

    const roleByUid = data.roleByUid && typeof data.roleByUid === "object" ? data.roleByUid as Record<string, unknown> : {};
    const role = roleByUid[user.uid];
    if (role !== "owner" && role !== "editor") {
      throw new Error("You can open this roster, but you do not have edit permission yet.");
    }

    const remoteVersion = typeof data.version === "number" ? data.version : 1;
    if (remoteVersion !== expectedVersion) {
      throw new Error(`This shared roster was already saved by someone else. Get latest from shared roster before saving. Remote version is ${remoteVersion}, your local copy is ${expectedVersion}.`);
    }

    const nextVersion = remoteVersion + 1;
    const groupId = typeof data.groupId === "string" ? data.groupId : source.firebaseGroupId;
    const groupName = typeof data.groupName === "string" ? data.groupName : source.firebaseGroupName;
    const payload = {
      name: roster.name || data.name || "Shared roster",
      groupId,
      groupName,
      version: nextVersion,
      playerCount,
      rosterData,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
      lastSavedByUid: user.uid,
      lastSavedByEmail: user.email,
      lastSavedAt: serverTimestamp(),
      lastSavedAtIso: now,
    };

    transaction.update(docRef, payload);
    if (groupId) {
      transaction.update(doc(getFairTeamsFirestore(), "sharedGroups", groupId), {
        lastSavedByUid: user.uid,
        lastSavedByEmail: user.email,
        lastSavedRosterId: rosterId,
        lastSavedRosterName: payload.name,
        lastSavedAt: serverTimestamp(),
        lastSavedAtIso: now,
        updatedAt: serverTimestamp(),
        updatedAtIso: now,
      });
    }

    return {
      id: snapshot.id,
      groupId,
      groupName,
      name: payload.name,
      ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
      ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
      version: nextVersion,
      playerCount,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: now,
      currentUserRole: role === "owner" || role === "editor" || role === "viewer" ? role : "member",
      lastSavedByEmail: user.email,
    } as FirebaseSharedRosterSummary;
  });

  return saved;
}

export function getSharedRosterBackendLabel() {
  const projectId = getFirebaseProjectId();
  return projectId ? `Firebase (${projectId})` : "Firebase not configured";
}

export function getFirebaseSharedRosterDebugLabel() {
  return getFirebaseProjectId() || "Firebase project not configured";
}
