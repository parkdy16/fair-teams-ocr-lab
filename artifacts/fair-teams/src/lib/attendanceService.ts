import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFairTeamsAuth, getFairTeamsFirestore } from "@/lib/firebaseClient";

export type AttendanceIssueType =
  | "tardy"
  | "late-cancellation"
  | "no-show"
  | "conduct";

export type AttendanceIssueRecord = {
  id: string;
  playerId: string;
  playerName: string;
  issueType: AttendanceIssueType;
  incidentDate: string;
  note?: string;
  createdAt: number;
  createdByUid?: string;
  createdByEmail?: string;
  createdByName?: string;
  updatedAt: number;
  updatedByUid?: string;
  updatedByEmail?: string;
  updatedByName?: string;
};

function requireSignedInUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user || !user.email) throw new Error("Sign in to use Club attendance.");
  return user;
}

function cleanRosterId(rosterId: string) {
  const cleaned = rosterId.trim();
  if (!cleaned) throw new Error("Open a Firebase shared roster first.");
  return cleaned;
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
  return undefined;
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function attendanceCollection(rosterId: string) {
  return collection(
    getFairTeamsFirestore(),
    "sharedRosters",
    cleanRosterId(rosterId),
    "attendanceIssues",
  );
}

function toAttendanceRecord(id: string, data: DocumentData): AttendanceIssueRecord | null {
  const issueType = cleanString(data.issueType) as AttendanceIssueType;
  if (!["tardy", "late-cancellation", "no-show", "conduct"].includes(issueType)) return null;
  const playerId = cleanString(data.playerId);
  const playerName = cleanString(data.playerName, "Unknown player");
  const incidentDate = cleanString(data.incidentDate);
  if (!playerId && !playerName) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) return null;
  const createdAt = timestampToMillis(data.createdAt) || timestampToMillis(data.createdAtIso) || Date.now();
  const updatedAt = timestampToMillis(data.updatedAt) || timestampToMillis(data.updatedAtIso) || createdAt;
  return {
    id,
    playerId,
    playerName,
    issueType,
    incidentDate,
    note: cleanString(data.note) || undefined,
    createdAt,
    createdByUid: cleanString(data.createdByUid) || undefined,
    createdByEmail: cleanString(data.createdByEmail) || undefined,
    createdByName: cleanString(data.createdByName) || undefined,
    updatedAt,
    updatedByUid: cleanString(data.updatedByUid) || undefined,
    updatedByEmail: cleanString(data.updatedByEmail) || undefined,
    updatedByName: cleanString(data.updatedByName) || undefined,
  };
}

export function listenToAttendanceIssues(
  rosterId: string,
  callback: (records: AttendanceIssueRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    attendanceCollection(rosterId),
    (snapshot) => {
      const records = snapshot.docs
        .map((snapshotDoc) => toAttendanceRecord(snapshotDoc.id, snapshotDoc.data()))
        .filter((record): record is AttendanceIssueRecord => Boolean(record))
        .sort((a, b) => b.incidentDate.localeCompare(a.incidentDate) || b.createdAt - a.createdAt);
      callback(records);
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load attendance records.")),
  );
}

export async function saveAttendanceIssue(
  rosterId: string,
  record: Omit<AttendanceIssueRecord, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: number },
): Promise<void> {
  const user = requireSignedInUser();
  const now = new Date();
  const userName = user.displayName?.trim() || user.email || "Organizer";
  const payload: Record<string, unknown> = {
    app: "Fair Teams",
    schemaVersion: 1,
    playerId: record.playerId.trim(),
    playerName: record.playerName.trim() || "Unknown player",
    issueType: record.issueType,
    incidentDate: record.incidentDate,
    note: record.issueType === "conduct" ? record.note?.trim().slice(0, 240) || null : null,
    updatedByUid: user.uid,
    updatedByEmail: user.email,
    updatedByName: userName,
    updatedAt: serverTimestamp(),
    updatedAtIso: now.toISOString(),
  };

  if (record.id) {
    await setDoc(doc(attendanceCollection(rosterId), record.id), payload, { merge: true });
    return;
  }

  payload.createdByUid = user.uid;
  payload.createdByEmail = user.email;
  payload.createdByName = userName;
  payload.createdAt = serverTimestamp();
  payload.createdAtIso = now.toISOString();
  await addDoc(attendanceCollection(rosterId), payload);
}

export async function deleteAttendanceIssue(rosterId: string, recordId: string): Promise<void> {
  requireSignedInUser();
  await deleteDoc(doc(attendanceCollection(rosterId), recordId));
}
