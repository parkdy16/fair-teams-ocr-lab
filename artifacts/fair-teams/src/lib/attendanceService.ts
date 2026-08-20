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

export type AttendanceWarningTemplateKind =
  | "late-cancellation"
  | "no-show"
  | "tardy"
  | "dismissal";

export type AttendanceWarningTemplates = Record<AttendanceWarningTemplateKind, string>;

export const DEFAULT_ATTENDANCE_WARNING_TEMPLATES: AttendanceWarningTemplates = {
  "late-cancellation":
    "Hi {player}, we wanted to check in about last-minute cancellations. We recorded {last_minute} on {last_minute_dates}. Late changes make it difficult to organize sessions and teams, so please let us know as early as possible if you cannot attend. Thanks for understanding.",
  "no-show":
    "Hi {player}, we wanted to check in about attendance. We recorded {no_shows} on {no_show_dates}. Please cancel as early as possible if you cannot attend, since unexpected absences make it difficult to organize sessions and teams. Thanks for understanding.",
  tardy:
    "Hi {player}, we wanted to check in about punctuality. During the {period}, we recorded {tardies}. Repeated late arrivals make it harder to start sessions and organize teams on time, so please do your best to arrive by the agreed start time. Thanks for understanding.",
  dismissal:
    "Hi {player}, we’re writing regarding your participation in {group}. After discussion among the organizers, we’ve decided to remove you from the group. Thank you for the time you’ve spent with us, and we wish you all the best.",
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

function warningTemplateDoc(rosterId: string, kind: AttendanceWarningTemplateKind) {
  return doc(attendanceCollection(rosterId), `_warning_template_${kind}`);
}

function isWarningTemplateKind(value: string): value is AttendanceWarningTemplateKind {
  return value === "late-cancellation" || value === "no-show" || value === "tardy" || value === "dismissal";
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
        .filter((snapshotDoc) => !snapshotDoc.id.startsWith("_warning_template_"))
        .map((snapshotDoc) => toAttendanceRecord(snapshotDoc.id, snapshotDoc.data()))
        .filter((record): record is AttendanceIssueRecord => Boolean(record))
        .sort((a, b) => b.incidentDate.localeCompare(a.incidentDate) || b.createdAt - a.createdAt);
      callback(records);
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load attendance records.")),
  );
}

export function listenToAttendanceWarningTemplates(
  rosterId: string,
  callback: (templates: AttendanceWarningTemplates) => void,
  onError?: (error: Error) => void,
  defaults: AttendanceWarningTemplates = DEFAULT_ATTENDANCE_WARNING_TEMPLATES,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    attendanceCollection(rosterId),
    (snapshot) => {
      const next: AttendanceWarningTemplates = { ...defaults };
      snapshot.docs.forEach((snapshotDoc) => {
        const prefix = "_warning_template_";
        if (!snapshotDoc.id.startsWith(prefix)) return;
        const kind = snapshotDoc.id.slice(prefix.length);
        if (!isWarningTemplateKind(kind)) return;
        const text = cleanString(snapshotDoc.data().text);
        if (text) next[kind] = text;
      });
      callback(next);
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load warning templates.")),
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
    app: "Stripes",
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

export async function saveAttendanceWarningTemplate(
  rosterId: string,
  kind: AttendanceWarningTemplateKind,
  text: string,
): Promise<void> {
  const user = requireSignedInUser();
  const cleaned = text.trim().slice(0, 2400);
  if (!cleaned) throw new Error("Warning template cannot be empty.");
  const now = new Date();
  const userName = user.displayName?.trim() || user.email || "Organizer";
  await setDoc(
    warningTemplateDoc(rosterId, kind),
    {
      app: "Stripes",
      schemaVersion: 2,
      kind,
      text: cleaned,
      // Keep the document compatible with existing attendanceIssues security rules.
      // The UI filters these reserved IDs out of the attendance log.
      playerId: "__warning_template__",
      playerName: "Stripes warning template",
      issueType: "conduct",
      incidentDate: "1970-01-01",
      note: null,
      createdByUid: user.uid,
      createdByEmail: user.email,
      createdByName: userName,
      createdAt: serverTimestamp(),
      createdAtIso: now.toISOString(),
      updatedByUid: user.uid,
      updatedByEmail: user.email,
      updatedByName: userName,
      updatedAt: serverTimestamp(),
      updatedAtIso: now.toISOString(),
    },
    { merge: true },
  );
}

export async function deleteAttendanceIssue(rosterId: string, recordId: string): Promise<void> {
  requireSignedInUser();
  await deleteDoc(doc(attendanceCollection(rosterId), recordId));
}
