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

export type ClubRatingSummary = {
  playerId: string;
  averageSkill: number | null;
  ratingCount: number;
  updatedAt?: number;
};

export type ClubMyRating = {
  playerId: string;
  skill: number | null;
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

function toRatingSummary(id: string, data: DocumentData): ClubRatingSummary {
  const ratingCount = Math.max(0, Number(data.ratingCount || 0));
  const averageSkill = clampSkill(data.averageSkill);
  return {
    playerId: typeof data.playerId === "string" && data.playerId.trim() ? data.playerId : id,
    averageSkill: ratingCount > 0 ? averageSkill : null,
    ratingCount,
    updatedAt: timestampToMillis(data.updatedAt) || timestampToMillis(data.updatedAtIso),
  };
}

function toMyRating(_id: string, data: DocumentData): ClubMyRating | null {
  const playerId = typeof data.playerId === "string" && data.playerId.trim() ? data.playerId : "";
  if (!playerId) return null;
  const skipped = Boolean(data.skipped);
  return {
    playerId,
    skill: skipped ? null : clampSkill(data.skill),
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

export async function saveMyClubPlayerRating(rosterId: string, playerId: string, skillValue: number): Promise<void> {
  const user = requireSignedInUser();
  const skill = clampSkill(skillValue);
  if (skill === null) throw new Error("Choose a rating from 1 to 10.");

  const now = new Date();
  const submissionRef = clubRatingSubmissionDoc(rosterId, user.uid, playerId);
  const summaryRef = clubRatingSummaryDoc(rosterId, playerId);

  await runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const submissionSnap = await transaction.get(submissionRef);
    const summarySnap = await transaction.get(summaryRef);
    const previousData = submissionSnap.exists() ? submissionSnap.data() : null;
    const previousSkill = previousData && !previousData.skipped ? clampSkill(previousData.skill) : null;
    const summaryData = summarySnap.exists() ? summarySnap.data() : {};
    const currentCount = Math.max(0, Number(summaryData.ratingCount || 0));
    const currentSum = Number.isFinite(Number(summaryData.ratingSum))
      ? Number(summaryData.ratingSum)
      : Number(summaryData.averageSkill || 0) * currentCount;
    const nextCount = previousSkill === null ? currentCount + 1 : currentCount;
    const nextSum = currentSum - (previousSkill ?? 0) + skill;
    const nextAverage = nextCount > 0 ? Math.round((nextSum / nextCount) * 10) / 10 : null;

    transaction.set(submissionRef, {
      app: "Fair Teams",
      schemaVersion: 1,
      rosterId: cleanRosterId(rosterId),
      playerId,
      userUid: user.uid,
      userEmail: user.email,
      userName: userDisplayName(),
      skill,
      skipped: false,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    }, { merge: true });

    transaction.set(summaryRef, {
      app: "Fair Teams",
      schemaVersion: 1,
      rosterId: cleanRosterId(rosterId),
      playerId,
      ratingCount: nextCount,
      ratingSum: Math.round(nextSum * 10) / 10,
      averageSkill: nextAverage,
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
    const previousSkill = previousData && !previousData.skipped ? clampSkill(previousData.skill) : null;
    const summaryData = summarySnap.exists() ? summarySnap.data() : {};
    const currentCount = Math.max(0, Number(summaryData.ratingCount || 0));
    const currentSum = Number.isFinite(Number(summaryData.ratingSum))
      ? Number(summaryData.ratingSum)
      : Number(summaryData.averageSkill || 0) * currentCount;
    const nextCount = previousSkill === null ? currentCount : Math.max(0, currentCount - 1);
    const nextSum = Math.max(0, currentSum - (previousSkill ?? 0));
    const nextAverage = nextCount > 0 ? Math.round((nextSum / nextCount) * 10) / 10 : null;

    transaction.set(submissionRef, {
      app: "Fair Teams",
      schemaVersion: 1,
      rosterId: cleanRosterId(rosterId),
      playerId,
      userUid: user.uid,
      userEmail: user.email,
      userName: userDisplayName(),
      skill: null,
      skipped: true,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    }, { merge: true });

    transaction.set(summaryRef, {
      app: "Fair Teams",
      schemaVersion: 1,
      rosterId: cleanRosterId(rosterId),
      playerId,
      ratingCount: nextCount,
      ratingSum: Math.round(nextSum * 10) / 10,
      averageSkill: nextAverage,
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
