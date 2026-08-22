import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Unsubscribe,
} from "firebase/auth";
import {
  addDoc,
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { calculateOverall, normalizeRoster, type RoomPlayer, type RoomRoster } from "@/lib/localRoster";
import {
  clampFirebaseSharedRosterSkill,
  makeFirebaseSharedRosterSavePayload,
} from "@/lib/sharedRosterSyncPayload";
import { inferPlayerStyleFromAttributes } from "@/lib/playerStyleProfile";
import { getFirebaseProjectId, getFairTeamsAuth, getFairTeamsFirestore } from "@/lib/firebaseClient";
import {
  toSharedRosterUser,
  type SharedRosterUser,
} from "@/lib/sharedRosterAuthState";
import { createLinkedSharedRoster } from "@/lib/sharedRosterCreationService";
import {
  adoptSharedRosterCreationResult,
  bindSharedRosterCreationAttemptToGroup,
  getOrCreateSharedRosterCreationAttempt,
  preserveCreatedRosterWhenRatingSeedFails,
  recordSharedRosterCreationResult,
} from "@/lib/sharedRosterCreationAttempt";
import {
  DEFAULT_FIREBASE_SHARED_GROUP_NAME,
  DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
  type SharedSummaryNameSource,
} from "@/lib/sharedRosterNames";

export { toSharedRosterUser };
export type { SharedRosterUser };
export {
  DEFAULT_FIREBASE_SHARED_GROUP_NAME,
  DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
} from "@/lib/sharedRosterNames";
export type { SharedSummaryNameSource } from "@/lib/sharedRosterNames";

export type SharedRosterRole = "owner" | "editor" | "organizer" | "viewer" | "member";

export type FirebaseSharedRosterSnapshot = FirebaseSharedRosterSummary & {
  roster: RoomRoster;
};

export class FirebaseSharedRosterVersionConflictError extends Error {
  readonly code = "shared-roster-version-conflict";
  readonly remoteVersion: number;
  readonly localVersion: number;

  constructor(remoteVersion: number, localVersion: number) {
    super(`This shared roster was already saved by someone else. Remote version is ${remoteVersion}, your local copy is ${localVersion}.`);
    this.name = "FirebaseSharedRosterVersionConflictError";
    this.remoteVersion = remoteVersion;
    this.localVersion = localVersion;
  }
}

export type FirebaseSharedRosterBackup = {
  id: string;
  version: number;
  savedAtIso: string;
  savedByEmail?: string;
  playerCount: number;
  rosterData: Partial<RoomRoster>;
};

export type FirebaseSharedGroupSummary = {
  id: string;
  name: string;
  nameSource?: SharedSummaryNameSource;
  ownerUid: string;
  ownerEmail: string;
  rosterCount: number;
  memberCount: number;
  currentUserRole?: SharedRosterRole;
  memberEmails?: string[];
  pendingInviteEmails?: string[];
  memberNamesByEmail?: Record<string, string>;
  memberNamesByUid?: Record<string, string>;
  memberUidByEmail?: Record<string, string>;
  organizerJoinedAtByUid?: Record<string, string>;
  organizerGovernanceEligibleAtByUid?: Record<string, string>;
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
  groupNameSource?: SharedSummaryNameSource;
  name: string;
  nameSource?: SharedSummaryNameSource;
  ownerUid: string;
  ownerEmail: string;
  version: number;
  playerCount: number;
  createdAt?: string;
  updatedAt?: string;
  currentUserRole?: SharedRosterRole;
  memberEmails?: string[];
  pendingInviteEmails?: string[];
  memberNamesByEmail?: Record<string, string>;
  memberNamesByUid?: Record<string, string>;
  memberUidByEmail?: Record<string, string>;
  lastSavedByEmail?: string;
  creationWarning?: string;
};

/**
 * @deprecated Incoming organizer invitations are sanitized and loaded through
 * sharedWorkspaceInvitationService. Kept only for stale-tree type compatibility.
 */
export type FirebaseGroupInvite = FirebaseSharedGroupSummary & {
  inviteeEmail: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function safeDocId(value: string) {
  return value.replace(/\//g, "_");
}

function cleanOrganizerDisplayName(value?: string | null) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function nameFromUser(user: SharedRosterUser) {
  const displayName = cleanOrganizerDisplayName(user.displayName);
  if (displayName) return displayName;
  const prefix = normalizeEmail(user.email).split("@")[0] || "Organizer";
  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Organizer";
}

function cleanNameMap(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, name]) => [String(key).trim(), cleanOrganizerDisplayName(String(name || ""))])
      .filter(([key, name]) => Boolean(key && name)),
  ) as Record<string, string>;
}

function cleanStringMap(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, mapped]) => [String(key).trim().toLowerCase(), String(mapped || "").trim()])
      .filter(([key, mapped]) => Boolean(key && mapped)),
  ) as Record<string, string>;
}

function removeRecordKey<T>(record: Record<string, T>, key?: string) {
  if (!key) return { ...record };
  const next = { ...record };
  delete next[key];
  return next;
}

function removeEmailKey<T>(record: Record<string, T>, email?: string) {
  if (!email) return { ...record };
  const next = { ...record };
  delete next[email];
  delete next[email.toLowerCase()];
  return next;
}

function cleanGroupName(value?: string) {
  const name = (value || "").trim();
  return name || DEFAULT_FIREBASE_SHARED_GROUP_NAME;
}

function getCurrentSharedRosterUser() {
  const user = toSharedRosterUser(getFairTeamsAuth().currentUser);
  if (!user) throw new Error("Sign in to Firebase shared rosters first.");
  return user;
}

function makeSharedRosterSnapshot(roster: RoomRoster) {
  const savePayload = makeFirebaseSharedRosterSavePayload(roster);
  const snapshot: Partial<RoomRoster> = {
    ...roster,
    players: savePayload.players,
    pairingRules: savePayload.pairingRules,
  };
  delete snapshot.logo;
  delete snapshot.cloudSource;
  // The trusted linked-roster creation callable has a deliberately frozen
  // allow-list. Keep initial creation backward-compatible; once the organizer
  // adopts the created roster, the normal authoritative autosync writes the
  // roster-owned player model through the existing organizer update path.
  delete snapshot.playerModel;
  return snapshot;
}

function makeSharedRosterUpdateSnapshot(
  existingRosterData: unknown,
  roster: RoomRoster,
  generatedAt: string,
) {
  const existing = existingRosterData && typeof existingRosterData === "object"
    ? existingRosterData as Partial<RoomRoster>
    : {};
  const savePayload = makeFirebaseSharedRosterSavePayload(roster, generatedAt);
  return cleanForFirestore({
    ...existing,
    // Shared roster identity changes must travel with the same live save as players.
    // Logos stay device-local because image data is intentionally excluded from Firestore.
    name: savePayload.name || existing.name || DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
    themeColor: savePayload.themeColor || existing.themeColor,
    players: savePayload.players,
    pairingRules: savePayload.pairingRules,
    playerModel: savePayload.playerModel,
  });
}

function cleanForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const MAX_SHARED_ROSTER_BACKUPS = 10;
const MAX_SHARED_ROSTER_BACKUP_BYTES = 650_000;

function normalizeSharedRosterBackups(value: unknown): FirebaseSharedRosterBackup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    if (!raw.rosterData || typeof raw.rosterData !== "object") return [];
    const version = typeof raw.version === "number" ? raw.version : 0;
    const savedAtIso = typeof raw.savedAtIso === "string" ? raw.savedAtIso : "";
    const playerCount = typeof raw.playerCount === "number"
      ? raw.playerCount
      : Array.isArray((raw.rosterData as { players?: unknown }).players)
        ? ((raw.rosterData as { players: unknown[] }).players.length)
        : 0;
    return [{
      id: typeof raw.id === "string" && raw.id ? raw.id : `v${version}-${savedAtIso || "backup"}`,
      version,
      savedAtIso,
      savedByEmail: typeof raw.savedByEmail === "string" ? raw.savedByEmail : undefined,
      playerCount,
      rosterData: cleanForFirestore(raw.rosterData as Partial<RoomRoster>),
    }];
  });
}

function makeSharedRosterBackup(data: DocumentData, fallbackVersion: number, fallbackTime: string): FirebaseSharedRosterBackup | null {
  const rosterData = data.rosterData && typeof data.rosterData === "object"
    ? cleanForFirestore(data.rosterData as Partial<RoomRoster>)
    : null;
  if (!rosterData || !Array.isArray(rosterData.players)) return null;
  const version = typeof data.version === "number" ? data.version : fallbackVersion;
  const savedAtIso = typeof data.updatedAtIso === "string" && data.updatedAtIso ? data.updatedAtIso : fallbackTime;
  return {
    id: `v${version}-${Date.now()}`,
    version,
    savedAtIso,
    savedByEmail: typeof data.lastSavedByEmail === "string" ? data.lastSavedByEmail : typeof data.ownerEmail === "string" ? data.ownerEmail : undefined,
    playerCount: rosterData.players.length,
    rosterData,
  };
}

function pruneSharedRosterBackups(backups: FirebaseSharedRosterBackup[]): FirebaseSharedRosterBackup[] {
  const unique: FirebaseSharedRosterBackup[] = [];
  const seen = new Set<string>();
  for (const backup of backups) {
    const key = backup.id || `${backup.version}-${backup.savedAtIso}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleanForFirestore(backup));
    if (unique.length >= MAX_SHARED_ROSTER_BACKUPS) break;
  }
  while (unique.length > 1 && new Blob([JSON.stringify(unique)]).size > MAX_SHARED_ROSTER_BACKUP_BYTES) {
    unique.pop();
  }
  return unique;
}

async function seedOwnerClubRatingsFromRoster(rosterId: string, players: RoomPlayer[]) {
  const user = getCurrentSharedRosterUser();
  const now = new Date().toISOString();
  const firestore = getFairTeamsFirestore();
  let batch = writeBatch(firestore);
  let writes = 0;

  const commitIfNeeded = async () => {
    if (writes === 0) return;
    await batch.commit();
    batch = writeBatch(firestore);
    writes = 0;
  };

  for (const player of players) {
    if (!player.id) continue;
    const skill = clampFirebaseSharedRosterSkill(calculateOverall(player));
    const playerStyle = inferPlayerStyleFromAttributes({ ...player, skill });
    const teamPlay = Math.min(3, Math.max(1, Math.round(Number(player.teamPlay) || 2)));
    const gkYesCount = player.isGoalkeeper ? 1 : 0;
    const submissionRef = doc(firestore, "sharedRosters", rosterId, "clubRatingSubmissions", `${safeDocId(user.uid)}_${safeDocId(player.id)}`);
    const summaryRef = doc(firestore, "sharedRosters", rosterId, "clubRatingSummaries", safeDocId(player.id));

    batch.set(submissionRef, {
      app: "Stripes",
      schemaVersion: 2,
      rosterId,
      playerId: player.id,
      userUid: user.uid,
      userEmail: user.email,
      userName: nameFromUser(user),
      skill,
      attack: player.attack,
      defense: player.defense,
      speed: player.speed,
      passing: player.passing,
      stamina: player.stamina,
      physical: player.physical,
      teamPlay,
      playerStyle,
      isGoalkeeper: Boolean(player.isGoalkeeper),
      skipped: false,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    }, { merge: true });
    writes += 1;

    batch.set(summaryRef, {
      app: "Stripes",
      schemaVersion: 2,
      rosterId,
      playerId: player.id,
      ratingCount: 1,
      ratingSum: skill,
      attackSum: player.attack,
      defenseSum: player.defense,
      speedSum: player.speed,
      passingSum: player.passing,
      staminaSum: player.stamina,
      physicalSum: player.physical,
      teamPlaySum: teamPlay,
      playerStyleSum: playerStyle,
      averageSkill: skill,
      averageAttack: player.attack,
      averageDefense: player.defense,
      averageSpeed: player.speed,
      averagePassing: player.passing,
      averageStamina: player.stamina,
      averagePhysical: player.physical,
      averageTeamPlay: teamPlay,
      averagePlayerStyle: playerStyle,
      gkYesCount,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    }, { merge: true });
    writes += 1;

    if (writes >= 450) {
      await commitIfNeeded();
    }
  }

  await commitIfNeeded();
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate().toISOString();
  }
  return undefined;
}

function cleanTimestampMap(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([uid, timestamp]) => [String(uid).trim(), timestampToIso(timestamp) || ""])
      .filter(([uid]) => Boolean(uid)),
  ) as Record<string, string>;
}

function currentUserRoleFromData(
  data: DocumentData,
  expectedUserUid?: string,
): SharedRosterRole | undefined {
  const userUid = expectedUserUid || toSharedRosterUser(getFairTeamsAuth().currentUser)?.uid;
  if (!userUid) return undefined;

  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  if (!memberUids.includes(userUid)) return undefined;

  const roleByUid = data.roleByUid && typeof data.roleByUid === "object"
    ? data.roleByUid as Record<string, unknown>
    : {};
  const role = roleByUid[userUid];

  if (role === "owner" || role === "editor" || role === "organizer" || role === "viewer") {
    return role;
  }

  // Backward compatibility only for an existing member whose old record
  // identifies them as the creator/owner.
  if (data.ownerUid === userUid) return "owner";

  return "member";
}

function organizerCountFromData(data: DocumentData): number {
  const memberUids = Array.isArray(data.memberUids)
    ? data.memberUids.filter((uid): uid is string => typeof uid === "string")
    : [];
  const roleByUid = data.roleByUid && typeof data.roleByUid === "object"
    ? data.roleByUid as Record<string, unknown>
    : {};
  const legacyOwnerUid = typeof data.ownerUid === "string" ? data.ownerUid : "";

  return memberUids.filter((uid) => {
    const role = roleByUid[uid];
    if (role === "owner" || role === "editor" || role === "organizer") return true;

    // Backward compatibility for very old records that may have ownerUid
    // but no explicit owner entry in roleByUid.
    return uid === legacyOwnerUid && role == null;
  }).length;
}

function toGroupSummary(
  id: string,
  data: DocumentData,
  expectedUserUid?: string,
): FirebaseSharedGroupSummary {
  const hasStoredName = typeof data.name === "string" && Boolean(data.name.trim());
  const rosterIds = Array.isArray(data.rosterIds) ? data.rosterIds.filter((value) => typeof value === "string") : [];
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  const memberEmails = Array.isArray(data.memberEmails) ? data.memberEmails.filter((value): value is string => typeof value === "string") : [];
  const pendingInviteEmails = Array.isArray(data.pendingInviteEmails) ? data.pendingInviteEmails.filter((value): value is string => typeof value === "string") : [];
  const memberNamesByEmail = cleanNameMap(data.memberNamesByEmail);
  const memberNamesByUid = cleanNameMap(data.memberNamesByUid);
  return {
    id,
    name: hasStoredName ? data.name : DEFAULT_FIREBASE_SHARED_GROUP_NAME,
    nameSource: hasStoredName ? "stored" : "fallback",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    rosterCount: rosterIds.length,
    memberCount: memberUids.length,
    currentUserRole: currentUserRoleFromData(data, expectedUserUid),
    memberEmails,
    pendingInviteEmails,
    memberNamesByEmail,
    memberNamesByUid,
    organizerJoinedAtByUid: cleanTimestampMap(data.organizerJoinedAtByUid),
    organizerGovernanceEligibleAtByUid: cleanTimestampMap(
      data.organizerGovernanceEligibleAtByUid,
    ),
    lastSavedByEmail: typeof data.lastSavedByEmail === "string" ? data.lastSavedByEmail : undefined,
    lastSavedRosterName: typeof data.lastSavedRosterName === "string" ? data.lastSavedRosterName : undefined,
    lastSavedAt: timestampToIso(data.lastSavedAt) || (typeof data.lastSavedAtIso === "string" ? data.lastSavedAtIso : undefined),
    createdAt: timestampToIso(data.createdAt) || (typeof data.createdAtIso === "string" ? data.createdAtIso : undefined),
    updatedAt: timestampToIso(data.updatedAt) || (typeof data.updatedAtIso === "string" ? data.updatedAtIso : undefined),
  };
}

function toRosterSummary(
  id: string,
  data: DocumentData,
  expectedUserUid?: string,
): FirebaseSharedRosterSummary {
  const hasStoredName = typeof data.name === "string" && Boolean(data.name.trim());
  const hasStoredGroupName = typeof data.groupName === "string" && Boolean(data.groupName.trim());
  const rosterData = data.rosterData && typeof data.rosterData === "object" ? data.rosterData as { players?: unknown[] } : undefined;
  const playerCount = typeof data.playerCount === "number"
    ? data.playerCount
    : Array.isArray(rosterData?.players)
      ? rosterData!.players.length
      : 0;

  return {
    id,
    groupId: typeof data.groupId === "string" ? data.groupId : undefined,
    groupName: hasStoredGroupName ? data.groupName : undefined,
    groupNameSource: hasStoredGroupName ? "stored" : undefined,
    name: hasStoredName ? data.name : DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
    nameSource: hasStoredName ? "stored" : "fallback",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    version: typeof data.version === "number" ? data.version : 1,
    playerCount,
    createdAt: timestampToIso(data.createdAt) || (typeof data.createdAtIso === "string" ? data.createdAtIso : undefined),
    updatedAt: timestampToIso(data.updatedAt) || (typeof data.updatedAtIso === "string" ? data.updatedAtIso : undefined),
    currentUserRole: currentUserRoleFromData(data, expectedUserUid),
    memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails.filter((value): value is string => typeof value === "string") : [],
    pendingInviteEmails: Array.isArray(data.pendingInviteEmails) ? data.pendingInviteEmails.filter((value): value is string => typeof value === "string") : [],
    memberNamesByEmail: cleanNameMap(data.memberNamesByEmail),
    memberNamesByUid: cleanNameMap(data.memberNamesByUid),
    lastSavedByEmail: typeof data.lastSavedByEmail === "string" ? data.lastSavedByEmail : undefined,
  };
}

export function listenToSharedRosterUser(callback: (user: SharedRosterUser | null) => void): Unsubscribe {
  return onIdTokenChanged(getFairTeamsAuth(), (user) => {
    callback(toSharedRosterUser(user));
  });
}

export type FirebaseSharedWorkspaceAuthoritySnapshot = {
  userUid: string;
  rosters: FirebaseSharedRosterSummary[];
  groups: FirebaseSharedGroupSummary[];
};

export function listenToFirebaseSharedWorkspaceAuthority(
  expectedUserUid: string,
  callback: (snapshot: FirebaseSharedWorkspaceAuthoritySnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const user = getCurrentSharedRosterUser();
  if (user.uid !== expectedUserUid) {
    throw new Error("The Firebase account changed while shared workspace access was being checked.");
  }

  const firestore = getFairTeamsFirestore();
  const rosterQuery = query(
    collection(firestore, "sharedRosters"),
    where("memberUids", "array-contains", expectedUserUid),
  );
  const groupQuery = query(
    collection(firestore, "sharedGroups"),
    where("memberUids", "array-contains", expectedUserUid),
  );
  let rosterReady = false;
  let groupReady = false;
  let rosters: FirebaseSharedRosterSummary[] = [];
  let groups: FirebaseSharedGroupSummary[] = [];
  let stopped = false;

  const emit = () => {
    if (stopped || !rosterReady || !groupReady) return;
    callback({ userUid: expectedUserUid, rosters, groups });
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    onError?.(error instanceof Error ? error : new Error("Could not verify shared workspace access."));
  };
  const failRosters = (error: unknown) => {
    rosterReady = false;
    fail(error);
  };
  const failGroups = (error: unknown) => {
    groupReady = false;
    fail(error);
  };

  const unsubscribeRosters = onSnapshot(rosterQuery, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) {
      failRosters(new Error("Shared workspace authority is not yet available from Firebase."));
      return;
    }
    rosters = snapshot.docs
      .map((docSnap) => toRosterSummary(docSnap.id, docSnap.data(), expectedUserUid))
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    rosterReady = true;
    emit();
  }, failRosters);
  const unsubscribeGroups = onSnapshot(groupQuery, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) {
      failGroups(new Error("Shared workspace authority is not yet available from Firebase."));
      return;
    }
    groups = snapshot.docs
      .map((docSnap) => toGroupSummary(docSnap.id, docSnap.data(), expectedUserUid))
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    groupReady = true;
    emit();
  }, failGroups);

  return () => {
    stopped = true;
    unsubscribeRosters();
    unsubscribeGroups();
  };
}

export async function createSharedRosterAccount(email: string, password: string, displayName?: string): Promise<SharedRosterUser> {
  const result = await createUserWithEmailAndPassword(getFairTeamsAuth(), email.trim(), password);
  const cleanName = cleanOrganizerDisplayName(displayName);
  if (cleanName) {
    await updateProfile(result.user, { displayName: cleanName });
  }
  const user = toSharedRosterUser(getFairTeamsAuth().currentUser || result.user);
  if (!user) throw new Error("Firebase created the account but did not return an email address.");
  return user;
}

export async function updateSharedRosterOrganizerName(displayName: string): Promise<SharedRosterUser> {
  const authUser = getFairTeamsAuth().currentUser;
  if (!authUser || !authUser.email) throw new Error("Sign in before setting your organizer name.");
  const cleanName = cleanOrganizerDisplayName(displayName);
  if (!cleanName) throw new Error("Enter an organizer name.");

  await updateProfile(authUser, { displayName: cleanName });

  const email = normalizeEmail(authUser.email);
  const firestore = getFairTeamsFirestore();
  const batch = writeBatch(firestore);
  const applyName = (data: DocumentData) => ({
    memberNamesByUid: {
      ...cleanNameMap(data.memberNamesByUid),
      [authUser.uid]: cleanName,
    },
    memberNamesByEmail: {
      ...cleanNameMap(data.memberNamesByEmail),
      [email]: cleanName,
    },
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  });

  const groups = await getDocs(query(collection(firestore, "sharedGroups"), where("memberUids", "array-contains", authUser.uid)));
  groups.docs.forEach((docSnap) => batch.update(docSnap.ref, applyName(docSnap.data())));

  const rosters = await getDocs(query(collection(firestore, "sharedRosters"), where("memberUids", "array-contains", authUser.uid)));
  rosters.docs.forEach((docSnap) => batch.update(docSnap.ref, applyName(docSnap.data())));

  await batch.commit();
  const user = toSharedRosterUser(getFairTeamsAuth().currentUser);
  if (!user) throw new Error("Organizer name was saved, but the account could not be reloaded.");
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
  const organizerName = nameFromUser(user);
  const payload = {
    app: "Stripes",
    schemaVersion: 2,
    name,
    ownerUid: user.uid,
    ownerEmail: user.email,
    memberUids: [user.uid],
    memberEmails: [normalizeEmail(user.email)],
    pendingInviteEmails: [],
    memberNamesByUid: { [user.uid]: organizerName },
    memberNamesByEmail: { [normalizeEmail(user.email)]: organizerName },
    memberUidByEmail: { [normalizeEmail(user.email)]: user.uid },
    roleByUid: { [user.uid]: "organizer" },
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
    .map((docSnap) => toGroupSummary(docSnap.id, docSnap.data(), user.uid))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

async function requireGroupForRoster(groupId?: string, fallbackName?: string) {
  const user = getCurrentSharedRosterUser();
  if (!groupId) return createFirebaseSharedGroup(fallbackName || DEFAULT_FIREBASE_SHARED_GROUP_NAME);
  const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error("Shared group was not found.");
  const data = groupSnap.data();
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  if (!memberUids.includes(user.uid)) throw new Error("You are not a member of this shared group.");
  return toGroupSummary(groupSnap.id, data);
}

const sharedRosterCreationInFlight = new Map<string, Promise<FirebaseSharedRosterSummary>>();

async function createFirebaseSharedRosterAttempt(
  roster: RoomRoster,
  groupId?: string,
  groupName?: string,
): Promise<FirebaseSharedRosterSummary> {
  if (!roster.players.length) throw new Error("Add players before creating a shared roster.");

  const user = getCurrentSharedRosterUser();
  let attempt = getOrCreateSharedRosterCreationAttempt(user.uid, roster.id);
  if (groupId && attempt.groupId && attempt.groupId !== groupId) {
    throw new Error("Finish the pending shared-roster creation attempt before choosing another workspace.");
  }

  let group = await requireGroupForRoster(attempt.groupId || groupId, groupName);
  attempt = bindSharedRosterCreationAttemptToGroup(attempt, group.id);
  if (attempt.groupId !== group.id) {
    group = await requireGroupForRoster(attempt.groupId, groupName);
  }
  const rosterData = cleanForFirestore(makeSharedRosterSnapshot(roster));
  const created = await createLinkedSharedRoster({
    creationRequestId: attempt.creationRequestId,
    groupId: group.id,
    name: roster.name || DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
    rosterData,
  });
  recordSharedRosterCreationResult(attempt, created.id);
  return preserveCreatedRosterWhenRatingSeedFails(
    created,
    () => seedOwnerClubRatingsFromRoster(created.id, roster.players),
  );
}

export async function createFirebaseSharedRoster(
  roster: RoomRoster,
  groupId?: string,
  groupName?: string,
): Promise<FirebaseSharedRosterSummary> {
  const user = getCurrentSharedRosterUser();
  const inFlightKey = `${user.uid}\u0000${roster.id}`;
  const existing = sharedRosterCreationInFlight.get(inFlightKey);
  if (existing) return existing;

  const creation = createFirebaseSharedRosterAttempt(roster, groupId, groupName);
  sharedRosterCreationInFlight.set(inFlightKey, creation);
  try {
    return await creation;
  } finally {
    if (sharedRosterCreationInFlight.get(inFlightKey) === creation) {
      sharedRosterCreationInFlight.delete(inFlightKey);
    }
  }
}

export function adoptFirebaseSharedRosterCreation(localRosterId: string, sharedRosterId: string) {
  const user = getCurrentSharedRosterUser();
  return adoptSharedRosterCreationResult(user.uid, localRosterId, sharedRosterId);
}


/** @deprecated Use the governed shared-workspace closure flow. */
export async function deleteFirebaseSharedRoster(_rosterId: string): Promise<void> {
  throw new Error("Shared rosters can only be removed through workspace closure.");
}

export async function deleteFirebaseSharedGroup(groupId: string): Promise<void> {
  const user = getCurrentSharedRosterUser();
  const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error("Shared group was not found.");
  const groupData = groupSnap.data();
  if (groupData.ownerUid !== user.uid) throw new Error("Only the group owner can delete this group.");
  const rostersQuery = query(collection(getFairTeamsFirestore(), "sharedRosters"), where("groupId", "==", groupId));
  const rosters = await getDocs(rostersQuery);
  const batch = writeBatch(getFairTeamsFirestore());
  rosters.docs.forEach((rosterDoc) => batch.delete(rosterDoc.ref));
  batch.delete(groupRef);
  await batch.commit();
}

/**
 * @deprecated Invitation state is server-controlled by callable Functions.
 */
export async function cancelFirebaseGroupInvite(_groupId: string, _inviteeEmail: string): Promise<void> {
  throw new Error("Organizer invitations must be cancelled through the trusted invitation service.");
}

export async function leaveFirebaseSharedRosterAccess(rosterId: string): Promise<{ rosterIds: string[]; groupId?: string; groupName?: string }> {
  const user = getCurrentSharedRosterUser();
  const email = normalizeEmail(user.email);
  const rosterRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);
  const rosterSnap = await getDoc(rosterRef);

  if (!rosterSnap.exists()) throw new Error("Shared roster was not found.");

  const rosterData = rosterSnap.data();
  const rosterRole = currentUserRoleFromData(rosterData);

  if (rosterRole !== "owner" && rosterRole !== "editor" && rosterRole !== "organizer") {
    throw new Error("Only organizers can leave this shared workspace from Stripes.");
  }

  const now = new Date().toISOString();
  const groupId =
    typeof rosterData.groupId === "string" && rosterData.groupId.trim()
      ? rosterData.groupId.trim()
      : "";
  const groupName =
    typeof rosterData.groupName === "string" && rosterData.groupName.trim()
      ? rosterData.groupName.trim()
      : undefined;

  const batch = writeBatch(getFairTeamsFirestore());
  const affectedRosterIds: string[] = [];

  const removeCurrentUserFields = (data: DocumentData, includeGovernanceTiming = false) => ({
    memberUids: arrayRemove(user.uid),
    memberEmails: arrayRemove(email),
    pendingInviteEmails: arrayRemove(email),
    roleByUid: removeRecordKey(
      data.roleByUid && typeof data.roleByUid === "object"
        ? data.roleByUid as Record<string, unknown>
        : {},
      user.uid,
    ),
    memberNamesByUid: removeRecordKey(cleanNameMap(data.memberNamesByUid), user.uid),
    memberNamesByEmail: removeEmailKey(cleanNameMap(data.memberNamesByEmail), email),
    memberUidByEmail: removeEmailKey(cleanStringMap(data.memberUidByEmail), email),
    ...(includeGovernanceTiming ? {
      organizerJoinedAtByUid: removeRecordKey(
        data.organizerJoinedAtByUid && typeof data.organizerJoinedAtByUid === "object"
          ? data.organizerJoinedAtByUid as Record<string, unknown>
          : {},
        user.uid,
      ),
      organizerGovernanceEligibleAtByUid: removeRecordKey(
        data.organizerGovernanceEligibleAtByUid
          && typeof data.organizerGovernanceEligibleAtByUid === "object"
          ? data.organizerGovernanceEligibleAtByUid as Record<string, unknown>
          : {},
        user.uid,
      ),
    } : {}),
    updatedAt: serverTimestamp(),
    updatedAtIso: now,
  });

  if (groupId) {
    const groupRef = doc(getFairTeamsFirestore(), "sharedGroups", groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) throw new Error("Shared group was not found.");

    const groupData = groupSnap.data();

    if (organizerCountFromData(groupData) <= 1) {
      throw new Error(
        "The last organizer cannot leave. Invite another organizer before leaving this workspace.",
      );
    }

    const rosterIds = Array.isArray(groupData.rosterIds)
      ? groupData.rosterIds.filter(
          (id): id is string => typeof id === "string" && Boolean(id.trim()),
        )
      : [rosterId];

    batch.update(groupRef, removeCurrentUserFields(groupData, true));

    for (const id of rosterIds) {
      const linkedRosterRef = doc(getFairTeamsFirestore(), "sharedRosters", id);
      const linkedRosterSnap = id === rosterId ? rosterSnap : await getDoc(linkedRosterRef);

      if (!linkedRosterSnap.exists()) continue;

      batch.update(linkedRosterRef, removeCurrentUserFields(linkedRosterSnap.data()));
      affectedRosterIds.push(id);
    }
  } else {
    if (organizerCountFromData(rosterData) <= 1) {
      throw new Error(
        "The last organizer cannot leave. Invite another organizer before leaving this workspace.",
      );
    }

    batch.update(rosterRef, removeCurrentUserFields(rosterData));
    affectedRosterIds.push(rosterId);
  }

  await batch.commit();

  return {
    rosterIds: Array.from(new Set(affectedRosterIds)),
    groupId: groupId || undefined,
    groupName,
  };
}

/**
 * @deprecated Another organizer can only be removed through the protected
 * secret-ballot callable flow in sharedWorkspaceGovernanceService.
 */
export async function removeFirebaseSharedGroupMember(_groupId: string, _memberEmail: string): Promise<void> {
  throw new Error("Removing another organizer requires a protected organizer vote.");
}

export async function listFirebaseSharedRosters(groupId?: string): Promise<FirebaseSharedRosterSummary[]> {
  const user = getCurrentSharedRosterUser();
  const sharedRosterQuery = query(
    collection(getFairTeamsFirestore(), "sharedRosters"),
    where("memberUids", "array-contains", user.uid),
  );
  const snapshot = await getDocs(sharedRosterQuery);
  return snapshot.docs
    .map((docSnap) => toRosterSummary(docSnap.id, docSnap.data(), user.uid))
    .filter((summary) => !groupId || summary.groupId === groupId)
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

/**
 * @deprecated Recipient invitations are server-filtered and sanitized by a
 * callable Function. This legacy Firestore query is intentionally disabled.
 */
export async function listFirebaseGroupInvites(): Promise<FirebaseGroupInvite[]> {
  throw new Error("Incoming invitations must be loaded through the trusted invitation service.");
}

/**
 * @deprecated Organizer membership can only be granted by the trusted
 * invitation-acceptance callable.
 */
export async function acceptFirebaseGroupInvite(_groupId: string): Promise<FirebaseSharedGroupSummary> {
  throw new Error("Organizer invitations must be accepted through the trusted invitation service.");
}

/**
 * @deprecated Invitation state is server-controlled by callable Functions.
 */
export async function inviteEmailToFirebaseSharedGroup(_groupId: string, _inviteeEmail: string): Promise<void> {
  throw new Error("Organizer invitations must be created through the trusted invitation service.");
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


export function listenToFirebaseSharedRoster(
  rosterId: string,
  callback: (snapshot: FirebaseSharedRosterSnapshot) => void,
  onError?: (error: unknown) => void,
  options: { serverOnly?: boolean } = {},
): Unsubscribe {
  getCurrentSharedRosterUser();
  const docRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);
  return onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
    if (options.serverOnly && snapshot.metadata.fromCache) return;
    if (!snapshot.exists()) {
      onError?.(new Error("Shared roster was not found."));
      return;
    }
    const data = snapshot.data();
    const summary = toRosterSummary(snapshot.id, data);
    const rawRoster = data.rosterData && typeof data.rosterData === "object" ? data.rosterData as Partial<RoomRoster> : undefined;
    if (!rawRoster || !Array.isArray(rawRoster.players)) {
      onError?.(new Error("Shared roster does not contain roster data yet."));
      return;
    }
    const roster = normalizeRoster({
      ...rawRoster,
      name: summary.name || rawRoster.name,
    }, 0);
    callback({
      ...summary,
      roster,
    });
  }, (error) => {
    onError?.(error);
  });
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
  const docRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);

  const saved = await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) throw new Error("Firebase shared roster was not found.");

    const data = snapshot.data();
    const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
    if (!memberUids.includes(user.uid)) {
      throw new Error("You are not a member of this Firebase shared roster.");
    }

    const role = currentUserRoleFromData(data, user.uid);
    if (role !== "owner" && role !== "editor" && role !== "organizer") {
      throw new Error("You can open this roster, but you do not have edit permission yet.");
    }

    const remoteVersion = typeof data.version === "number" ? data.version : 1;
    if (remoteVersion !== expectedVersion) {
      throw new FirebaseSharedRosterVersionConflictError(remoteVersion, expectedVersion);
    }

    const nextVersion = remoteVersion + 1;
    // The live roster document is the only authority for workspace linkage.
    // Cached local cloudSource metadata may be stale and must never select a group write path.
    const rawGroupId = typeof data.groupId === "string" ? data.groupId : "";
    const groupId = rawGroupId.trim();
    if (rawGroupId !== groupId) {
      throw new Error("This shared roster has an invalid workspace link and cannot be saved safely.");
    }
    const groupName = groupId && typeof data.groupName === "string" ? data.groupName : undefined;
    const rosterData = makeSharedRosterUpdateSnapshot(data.rosterData, roster, now);
    const playerCount = Array.isArray(rosterData.players) ? rosterData.players.length : 0;
    const remoteName = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "";
    const localName = typeof roster.name === "string" && roster.name.trim() ? roster.name.trim() : "";
    const syncedName = localName || remoteName || DEFAULT_FIREBASE_SHARED_ROSTER_NAME;
    const organizerName = nameFromUser(user);
    const memberNamesByUid = { ...cleanNameMap(data.memberNamesByUid), [user.uid]: organizerName };
    const memberNamesByEmail = { ...cleanNameMap(data.memberNamesByEmail), [normalizeEmail(user.email)]: organizerName };
    const memberUidByEmail = { ...cleanStringMap(data.memberUidByEmail), [normalizeEmail(user.email)]: user.uid };
    const previousBackup = makeSharedRosterBackup(data, remoteVersion, now);
    const backupHistory = pruneSharedRosterBackups([
      ...(previousBackup ? [previousBackup] : []),
      ...normalizeSharedRosterBackups(data.backupHistory),
    ]);
    const payload = {
      name: syncedName,
      groupId,
      ...(groupName ? { groupName } : {}),
      version: nextVersion,
      playerCount,
      rosterData,
      memberNamesByUid,
      memberNamesByEmail,
      memberUidByEmail,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
      lastSavedByUid: user.uid,
      lastSavedByEmail: user.email,
      lastSavedAt: serverTimestamp(),
      lastSavedAtIso: now,
      backupHistory,
    };

    transaction.update(docRef, payload);
    if (groupId) {
      transaction.update(doc(getFairTeamsFirestore(), "sharedGroups", groupId), {
        memberNamesByUid,
        memberNamesByEmail,
        memberUidByEmail,
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
      groupNameSource: groupName ? "stored" : undefined,
      name: payload.name,
      nameSource: "stored",
      ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
      ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
      version: nextVersion,
      playerCount,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: now,
      currentUserRole: role === "owner" || role === "editor" || role === "organizer" || role === "viewer" ? role : "member",
      memberNamesByEmail,
      memberNamesByUid,
      lastSavedByEmail: user.email,
    } as FirebaseSharedRosterSummary;
  });

  return saved;
}

export async function listFirebaseSharedRosterBackups(rosterId: string): Promise<FirebaseSharedRosterBackup[]> {
  const user = getCurrentSharedRosterUser();
  const docRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error("Shared roster was not found.");
  const data = snapshot.data();
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  if (!memberUids.includes(user.uid)) throw new Error("You are not a member of this shared roster.");
  return normalizeSharedRosterBackups(data.backupHistory)
    .sort((a, b) => new Date(b.savedAtIso || 0).getTime() - new Date(a.savedAtIso || 0).getTime())
    .slice(0, MAX_SHARED_ROSTER_BACKUPS);
}

export async function restoreFirebaseSharedRosterBackup(rosterId: string, backupId: string): Promise<FirebaseSharedRosterSnapshot> {
  const user = getCurrentSharedRosterUser();
  const now = new Date().toISOString();
  const docRef = doc(getFairTeamsFirestore(), "sharedRosters", rosterId);

  const restored = await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) throw new Error("Shared roster was not found.");
    const data = snapshot.data();
    const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
    if (!memberUids.includes(user.uid)) throw new Error("You are not a member of this shared roster.");
    const role = currentUserRoleFromData(data, user.uid);
    if (role !== "owner" && role !== "editor" && role !== "organizer") throw new Error("Only organizers can restore shared-roster backups.");

    const backups = normalizeSharedRosterBackups(data.backupHistory);
    const target = backups.find((backup) => backup.id === backupId);
    if (!target) throw new Error("That backup is no longer available.");
    const remoteVersion = typeof data.version === "number" ? data.version : 1;
    const currentBackup = makeSharedRosterBackup(data, remoteVersion, now);
    const backupHistory = pruneSharedRosterBackups([
      ...(currentBackup ? [currentBackup] : []),
      ...backups,
    ]);
    const nextVersion = remoteVersion + 1;
    const rosterData = cleanForFirestore(target.rosterData);
    const playerCount = Array.isArray(rosterData.players) ? rosterData.players.length : 0;
    const organizerName = nameFromUser(user);
    const memberNamesByUid = { ...cleanNameMap(data.memberNamesByUid), [user.uid]: organizerName };
    const memberNamesByEmail = { ...cleanNameMap(data.memberNamesByEmail), [normalizeEmail(user.email)]: organizerName };
    const memberUidByEmail = { ...cleanStringMap(data.memberUidByEmail), [normalizeEmail(user.email)]: user.uid };

    transaction.update(docRef, {
      version: nextVersion,
      playerCount,
      rosterData,
      backupHistory,
      memberNamesByUid,
      memberNamesByEmail,
      memberUidByEmail,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
      lastSavedByUid: user.uid,
      lastSavedByEmail: user.email,
      lastSavedAt: serverTimestamp(),
      lastSavedAtIso: now,
    });

    const hasStoredName = typeof data.name === "string" && Boolean(data.name.trim());
    const hasStoredGroupName = typeof data.groupName === "string" && Boolean(data.groupName.trim());
    const summary: FirebaseSharedRosterSummary = {
      id: snapshot.id,
      groupId: typeof data.groupId === "string" ? data.groupId : undefined,
      groupName: hasStoredGroupName ? data.groupName : undefined,
      groupNameSource: hasStoredGroupName ? "stored" : undefined,
      name: hasStoredName ? data.name : DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
      nameSource: hasStoredName ? "stored" : "fallback",
      ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
      ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
      version: nextVersion,
      playerCount,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: now,
      currentUserRole: role === "owner" || role === "editor" || role === "organizer" || role === "viewer" ? role : "member",
      memberNamesByEmail,
      memberNamesByUid,
      lastSavedByEmail: user.email,
    };
    const roster = normalizeRoster({ ...rosterData, name: summary.name }, 0);
    return { ...summary, roster };
  });

  return restored;
}

export function getSharedRosterBackendLabel() {
  const projectId = getFirebaseProjectId();
  return projectId ? `Firebase (${projectId})` : "Firebase not configured";
}

export function getFirebaseSharedRosterDebugLabel() {
  return getFirebaseProjectId() || "Firebase project not configured";
}
