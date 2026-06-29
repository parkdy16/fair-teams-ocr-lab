import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFairTeamsAuth, getFairTeamsFirestore } from "@/lib/firebaseClient";
import {
  BALANCED_PLAYER_STYLE,
  generateStyledPlayerAttributes,
  normalizePlayerStyle,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";

export type ClubRatingProfile = {
  skill: number;
  attack: number;
  defense: number;
  speed: number;
  passing: number;
  stamina: number;
  physical: number;
  teamPlay: number;
  playerStyle?: PlayerStyleValue;
  isGoalkeeper?: boolean;
};

export type ClubRatingSummary = {
  playerId: string;
  averageSkill: number | null;
  averageAttack?: number | null;
  averageDefense?: number | null;
  averageSpeed?: number | null;
  averagePassing?: number | null;
  averageStamina?: number | null;
  averagePhysical?: number | null;
  averageTeamPlay?: number | null;
  averagePlayerStyle?: PlayerStyleValue | null;
  gkYesCount?: number;
  ratingCount: number;
  updatedAt?: number;
};

export type ClubMyRating = {
  playerId: string;
  skill: number | null;
  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  passing?: number | null;
  stamina?: number | null;
  physical?: number | null;
  teamPlay?: number | null;
  playerStyle?: PlayerStyleValue | null;
  isGoalkeeper?: boolean;
  skipped: boolean;
  updatedAt?: number;
};

export type ClubNote = {
  id: string;
  text: string;
  createdAt: number;
  createdByUid?: string;
  createdByEmail?: string;
  createdByName?: string;
};

const ATTRIBUTE_KEYS = ["attack", "defense", "speed", "passing", "stamina", "physical"] as const;
type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

type RatingSums = Record<AttributeKey, number> & { teamPlay: number; playerStyle: number; gkYes: number };

function requireSignedInUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user || !user.email) {
    throw new Error("Sign in to use Club tools.");
  }
  return user;
}

function cleanRosterId(rosterId: string) {
  const cleaned = rosterId.trim();
  if (!cleaned) throw new Error("Open a Firebase shared roster first.");
  return cleaned;
}

function safeDocId(value: string) {
  return value.replace(/\//g, "_");
}

function clubRatingSummaryCollection(rosterId: string) {
  return collection(getFairTeamsFirestore(), "sharedRosters", cleanRosterId(rosterId), "clubRatingSummaries");
}

function clubRatingSubmissionCollection(rosterId: string) {
  return collection(getFairTeamsFirestore(), "sharedRosters", cleanRosterId(rosterId), "clubRatingSubmissions");
}

function clubNotesCollection(rosterId: string) {
  return collection(getFairTeamsFirestore(), "sharedRosters", cleanRosterId(rosterId), "clubNotes");
}

function clubRatingSummaryDoc(rosterId: string, playerId: string) {
  return doc(clubRatingSummaryCollection(rosterId), safeDocId(playerId));
}

function clubRatingSubmissionDoc(rosterId: string, userUid: string, playerId: string) {
  return doc(clubRatingSubmissionCollection(rosterId), `${safeDocId(userUid)}_${safeDocId(playerId)}`);
}

function clampSkill(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 2) / 2;
  return Math.min(10, Math.max(1, Math.round(rounded * 10) / 10));
}

function clampAttribute(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n * 2) / 2;
  return Math.min(10, Math.max(1, Math.round(rounded * 10) / 10));
}

function clampTeamPlay(value: unknown) {
  const n = Math.round(Number(value));
  return n === 1 || n === 3 ? n : 2;
}

function roundOne(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 10) / 10;
}

function timestampToMillis(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
  }
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as Timestamp).toMillis === "function") {
    return (value as Timestamp).toMillis();
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate().getTime();
  }
  return undefined;
}

function userDisplayName() {
  const user = requireSignedInUser();
  return user.displayName?.trim() || user.email || "Organizer";
}

function coerceRatingProfile(input: number | Partial<ClubRatingProfile>): ClubRatingProfile {
  if (typeof input === "number") {
    const skill = clampSkill(input);
    if (skill === null) throw new Error("Choose a rating from 1 to 10.");
    const attrs = generateStyledPlayerAttributes(skill, BALANCED_PLAYER_STYLE);
    return { skill, ...attrs, playerStyle: BALANCED_PLAYER_STYLE, isGoalkeeper: false };
  }
  const skill = clampSkill(input.skill);
  if (skill === null) throw new Error("Choose a rating from 1 to 10.");
  const playerStyle = normalizePlayerStyle(input.playerStyle);
  const generated = generateStyledPlayerAttributes(skill, playerStyle);
  return {
    skill,
    attack: clampAttribute(input.attack, generated.attack),
    defense: clampAttribute(input.defense, generated.defense),
    speed: clampAttribute(input.speed, generated.speed),
    passing: clampAttribute(input.passing, generated.passing),
    stamina: clampAttribute(input.stamina, generated.stamina),
    physical: clampAttribute(input.physical, generated.physical),
    teamPlay: clampTeamPlay(input.teamPlay ?? generated.teamPlay),
    playerStyle,
    isGoalkeeper: Boolean(input.isGoalkeeper),
  };
}

function profileFromSubmission(data: DocumentData | null): ClubRatingProfile | null {
  if (!data || data.skipped) return null;
  const skill = clampSkill(data.skill);
  if (skill === null) return null;
  const playerStyle = normalizePlayerStyle(data.playerStyle);
  const generated = generateStyledPlayerAttributes(skill, playerStyle);
  return {
    skill,
    attack: clampAttribute(data.attack, generated.attack),
    defense: clampAttribute(data.defense, generated.defense),
    speed: clampAttribute(data.speed, generated.speed),
    passing: clampAttribute(data.passing, generated.passing),
    stamina: clampAttribute(data.stamina, generated.stamina),
    physical: clampAttribute(data.physical, generated.physical),
    teamPlay: clampTeamPlay(data.teamPlay ?? generated.teamPlay),
    playerStyle,
    isGoalkeeper: Boolean(data.isGoalkeeper),
  };
}

function summarySumsFromData(data: DocumentData, count: number): { ratingSum: number; sums: RatingSums } {
  const averageSkill = Number(data.averageSkill || 0);
  const ratingSum = Number.isFinite(Number(data.ratingSum)) ? Number(data.ratingSum) : averageSkill * count;
  const safeAverage = Number.isFinite(averageSkill) && averageSkill >= 1 && averageSkill <= 10 ? averageSkill : 5;
  const readSum = (sumKey: string, averageKey: string) => {
    if (Number.isFinite(Number(data[sumKey]))) return Number(data[sumKey]);
    if (Number.isFinite(Number(data[averageKey]))) return Number(data[averageKey]) * count;
    return safeAverage * count;
  };
  const sums: RatingSums = {
    attack: readSum("attackSum", "averageAttack"),
    defense: readSum("defenseSum", "averageDefense"),
    speed: readSum("speedSum", "averageSpeed"),
    passing: readSum("passingSum", "averagePassing"),
    stamina: readSum("staminaSum", "averageStamina"),
    physical: readSum("physicalSum", "averagePhysical"),
    teamPlay: readSum("teamPlaySum", "averageTeamPlay"),
    playerStyle: readSum("playerStyleSum", "averagePlayerStyle"),
    gkYes: Number.isFinite(Number(data.gkYesCount)) ? Number(data.gkYesCount) : 0,
  };
  return { ratingSum, sums };
}

function subtractProfileFromSums(sums: RatingSums, profile: ClubRatingProfile | null) {
  if (!profile) return;
  for (const key of ATTRIBUTE_KEYS) sums[key] -= profile[key];
  sums.teamPlay -= profile.teamPlay;
  sums.playerStyle -= profile.playerStyle ?? BALANCED_PLAYER_STYLE;
  if (profile.isGoalkeeper) sums.gkYes -= 1;
}

function addProfileToSums(sums: RatingSums, profile: ClubRatingProfile) {
  for (const key of ATTRIBUTE_KEYS) sums[key] += profile[key];
  sums.teamPlay += profile.teamPlay;
  sums.playerStyle += profile.playerStyle ?? BALANCED_PLAYER_STYLE;
  if (profile.isGoalkeeper) sums.gkYes += 1;
}

function averagesFromSums(sums: RatingSums, count: number) {
  if (count <= 0) {
    return {
      averageAttack: null,
      averageDefense: null,
      averageSpeed: null,
      averagePassing: null,
      averageStamina: null,
      averagePhysical: null,
      averageTeamPlay: null,
      averagePlayerStyle: null,
      gkYesCount: 0,
    };
  }
  return {
    averageAttack: roundOne(sums.attack / count),
    averageDefense: roundOne(sums.defense / count),
    averageSpeed: roundOne(sums.speed / count),
    averagePassing: roundOne(sums.passing / count),
    averageStamina: roundOne(sums.stamina / count),
    averagePhysical: roundOne(sums.physical / count),
    averageTeamPlay: roundOne(sums.teamPlay / count),
    averagePlayerStyle: normalizePlayerStyle(sums.playerStyle / count),
    gkYesCount: Math.max(0, Math.round(sums.gkYes)),
  };
}

function toRatingSummary(id: string, data: DocumentData): ClubRatingSummary {
  const ratingCount = Math.max(0, Number(data.ratingCount || 0));
  const averageSkill = clampSkill(data.averageSkill);
  return {
    playerId: typeof data.playerId === "string" && data.playerId.trim() ? data.playerId : id,
    averageSkill: ratingCount > 0 ? averageSkill : null,
    averageAttack: ratingCount > 0 ? roundOne(data.averageAttack) : null,
    averageDefense: ratingCount > 0 ? roundOne(data.averageDefense) : null,
    averageSpeed: ratingCount > 0 ? roundOne(data.averageSpeed) : null,
    averagePassing: ratingCount > 0 ? roundOne(data.averagePassing) : null,
    averageStamina: ratingCount > 0 ? roundOne(data.averageStamina) : null,
    averagePhysical: ratingCount > 0 ? roundOne(data.averagePhysical) : null,
    averageTeamPlay: ratingCount > 0 ? roundOne(data.averageTeamPlay) : null,
    averagePlayerStyle: ratingCount > 0 ? normalizePlayerStyle(data.averagePlayerStyle) : null,
    gkYesCount: Math.max(0, Number(data.gkYesCount || 0)),
    ratingCount,
    updatedAt: timestampToMillis(data.updatedAt) || timestampToMillis(data.updatedAtIso),
  };
}

function toMyRating(_id: string, data: DocumentData): ClubMyRating | null {
  const playerId = typeof data.playerId === "string" && data.playerId.trim() ? data.playerId : "";
  if (!playerId) return null;
  const skipped = Boolean(data.skipped);
  const profile = profileFromSubmission(data);
  return {
    playerId,
    skill: skipped ? null : clampSkill(data.skill),
    attack: skipped ? null : profile?.attack ?? null,
    defense: skipped ? null : profile?.defense ?? null,
    speed: skipped ? null : profile?.speed ?? null,
    passing: skipped ? null : profile?.passing ?? null,
    stamina: skipped ? null : profile?.stamina ?? null,
    physical: skipped ? null : profile?.physical ?? null,
    teamPlay: skipped ? null : profile?.teamPlay ?? null,
    playerStyle: skipped ? null : profile?.playerStyle ?? null,
    isGoalkeeper: skipped ? false : Boolean(profile?.isGoalkeeper),
    skipped,
    updatedAt: timestampToMillis(data.updatedAt) || timestampToMillis(data.updatedAtIso),
  };
}

function toClubNote(id: string, data: DocumentData): ClubNote | null {
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) return null;
  const createdAt = timestampToMillis(data.createdAt) || timestampToMillis(data.createdAtIso) || Date.now();
  return {
    id,
    text,
    createdAt,
    createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : undefined,
    createdByEmail: typeof data.createdByEmail === "string" ? data.createdByEmail : undefined,
    createdByName: typeof data.createdByName === "string" ? data.createdByName : undefined,
  };
}

export async function fetchClubRatingSummaries(rosterId: string): Promise<ClubRatingSummary[]> {
  requireSignedInUser();
  const snapshot = await getDocs(clubRatingSummaryCollection(rosterId));
  return snapshot.docs.map((docSnap) => toRatingSummary(docSnap.id, docSnap.data()));
}

export function listenToClubRatingSummaries(
  rosterId: string,
  callback: (summaries: ClubRatingSummary[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    clubRatingSummaryCollection(rosterId),
    (snapshot) => {
      callback(snapshot.docs.map((docSnap) => toRatingSummary(docSnap.id, docSnap.data())));
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load Club ratings.")),
  );
}

export function listenToMyClubRatings(
  rosterId: string,
  callback: (ratings: ClubMyRating[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const user = requireSignedInUser();
  const myRatingsQuery = query(clubRatingSubmissionCollection(rosterId), where("userUid", "==", user.uid));
  return onSnapshot(
    myRatingsQuery,
    (snapshot) => {
      callback(snapshot.docs
        .map((docSnap) => toMyRating(docSnap.id, docSnap.data()))
        .filter((rating): rating is ClubMyRating => Boolean(rating)));
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load your Club ratings.")),
  );
}

export async function saveMyClubPlayerRating(rosterId: string, playerId: string, ratingInput: number | Partial<ClubRatingProfile>): Promise<void> {
  const user = requireSignedInUser();
  const profile = coerceRatingProfile(ratingInput);
  const now = new Date();
  const submissionRef = clubRatingSubmissionDoc(rosterId, user.uid, playerId);
  const summaryRef = clubRatingSummaryDoc(rosterId, playerId);

  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const submissionSnap = await transaction.get(submissionRef);
    const summarySnap = await transaction.get(summaryRef);
    const previousData = submissionSnap.exists() ? submissionSnap.data() : null;
    const previousProfile = profileFromSubmission(previousData);
    const summaryData = summarySnap.exists() ? summarySnap.data() : {};
    const currentCount = Math.max(0, Number(summaryData.ratingCount || 0));
    const { ratingSum: currentSum, sums } = summarySumsFromData(summaryData, currentCount);
    const nextCount = previousProfile === null || currentCount === 0 ? currentCount + 1 : currentCount;
    const nextSum = currentSum - (previousProfile?.skill ?? 0) + profile.skill;
    subtractProfileFromSums(sums, previousProfile);
    addProfileToSums(sums, profile);
    const nextAverage = nextCount > 0 ? Math.round((nextSum / nextCount) * 10) / 10 : null;
    const attrAverages = averagesFromSums(sums, nextCount);

    transaction.set(submissionRef, {
      app: "Fair Teams",
      schemaVersion: 2,
      rosterId: cleanRosterId(rosterId),
      playerId,
      userUid: user.uid,
      userEmail: user.email,
      userName: userDisplayName(),
      skill: profile.skill,
      attack: profile.attack,
      defense: profile.defense,
      speed: profile.speed,
      passing: profile.passing,
      stamina: profile.stamina,
      physical: profile.physical,
      teamPlay: profile.teamPlay,
      playerStyle: profile.playerStyle ?? BALANCED_PLAYER_STYLE,
      isGoalkeeper: Boolean(profile.isGoalkeeper),
      skipped: false,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    }, { merge: true });

    transaction.set(summaryRef, {
      app: "Fair Teams",
      schemaVersion: 2,
      rosterId: cleanRosterId(rosterId),
      playerId,
      ratingCount: nextCount,
      ratingSum: Math.round(nextSum * 10) / 10,
      attackSum: Math.round(sums.attack * 10) / 10,
      defenseSum: Math.round(sums.defense * 10) / 10,
      speedSum: Math.round(sums.speed * 10) / 10,
      passingSum: Math.round(sums.passing * 10) / 10,
      staminaSum: Math.round(sums.stamina * 10) / 10,
      physicalSum: Math.round(sums.physical * 10) / 10,
      teamPlaySum: Math.round(sums.teamPlay * 10) / 10,
      playerStyleSum: Math.round(sums.playerStyle * 10) / 10,
      averageSkill: nextAverage,
      ...attrAverages,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    }, { merge: true });
  });
}

export async function skipMyClubPlayerRating(rosterId: string, playerId: string): Promise<void> {
  const user = requireSignedInUser();
  const now = new Date();
  const submissionRef = clubRatingSubmissionDoc(rosterId, user.uid, playerId);
  const summaryRef = clubRatingSummaryDoc(rosterId, playerId);

  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const submissionSnap = await transaction.get(submissionRef);
    const summarySnap = await transaction.get(summaryRef);
    const previousData = submissionSnap.exists() ? submissionSnap.data() : null;
    const previousProfile = profileFromSubmission(previousData);
    const summaryData = summarySnap.exists() ? summarySnap.data() : {};
    const currentCount = Math.max(0, Number(summaryData.ratingCount || 0));
    const { ratingSum: currentSum, sums } = summarySumsFromData(summaryData, currentCount);
    const nextCount = previousProfile === null ? currentCount : Math.max(0, currentCount - 1);
    const nextSum = Math.max(0, currentSum - (previousProfile?.skill ?? 0));
    subtractProfileFromSums(sums, previousProfile);
    const nextAverage = nextCount > 0 ? Math.round((nextSum / nextCount) * 10) / 10 : null;
    const attrAverages = averagesFromSums(sums, nextCount);

    transaction.set(submissionRef, {
      app: "Fair Teams",
      schemaVersion: 2,
      rosterId: cleanRosterId(rosterId),
      playerId,
      userUid: user.uid,
      userEmail: user.email,
      userName: userDisplayName(),
      skill: null,
      attack: null,
      defense: null,
      speed: null,
      passing: null,
      stamina: null,
      physical: null,
      teamPlay: null,
      playerStyle: null,
      isGoalkeeper: false,
      skipped: true,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    }, { merge: true });

    transaction.set(summaryRef, {
      app: "Fair Teams",
      schemaVersion: 2,
      rosterId: cleanRosterId(rosterId),
      playerId,
      ratingCount: nextCount,
      ratingSum: Math.round(nextSum * 10) / 10,
      attackSum: Math.round(Math.max(0, sums.attack) * 10) / 10,
      defenseSum: Math.round(Math.max(0, sums.defense) * 10) / 10,
      speedSum: Math.round(Math.max(0, sums.speed) * 10) / 10,
      passingSum: Math.round(Math.max(0, sums.passing) * 10) / 10,
      staminaSum: Math.round(Math.max(0, sums.stamina) * 10) / 10,
      physicalSum: Math.round(Math.max(0, sums.physical) * 10) / 10,
      teamPlaySum: Math.round(Math.max(0, sums.teamPlay) * 10) / 10,
      playerStyleSum: Math.round(Math.max(0, sums.playerStyle) * 10) / 10,
      averageSkill: nextAverage,
      ...attrAverages,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    }, { merge: true });
  });
}

export function listenToClubNotes(
  rosterId: string,
  callback: (notes: ClubNote[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    clubNotesCollection(rosterId),
    (snapshot) => {
      const notes = snapshot.docs
        .map((docSnap) => toClubNote(docSnap.id, docSnap.data()))
        .filter((note): note is ClubNote => Boolean(note))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30);
      callback(notes);
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load Club notes.")),
  );
}

export async function addClubNote(rosterId: string, text: string): Promise<void> {
  const user = requireSignedInUser();
  const cleanText = text.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!cleanText) throw new Error("Write a note first.");
  const now = new Date();
  await addDoc(clubNotesCollection(rosterId), {
    app: "Fair Teams",
    schemaVersion: 1,
    rosterId: cleanRosterId(rosterId),
    text: cleanText,
    createdByUid: user.uid,
    createdByEmail: user.email,
    createdByName: userDisplayName(),
    createdAt: serverTimestamp(),
    createdAtIso: now.toISOString(),
  });
}

export async function deleteOwnClubNote(rosterId: string, noteId: string): Promise<void> {
  requireSignedInUser();
  const cleanNoteId = noteId.trim();
  if (!cleanNoteId) throw new Error("Choose a note to remove.");
  await deleteDoc(doc(clubNotesCollection(rosterId), safeDocId(cleanNoteId)));
}
