import {
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

export type FirebaseEquipmentBag = {
  id: string;
  name: string;
  holderId: string;
  color: string;
  contents: string[];
  note?: string;
  createdAt?: number;
  createdByEmail?: string;
  createdByName?: string;
  updatedAt: number;
  updatedByEmail?: string;
  updatedByName?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function cleanContents(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function toEquipmentBag(id: string, data: DocumentData): FirebaseEquipmentBag {
  const createdAt =
    timestampToMillis(data.createdAt) ||
    timestampToMillis(data.createdAtIso);
  const updatedAt =
    timestampToMillis(data.updatedAt) ||
    timestampToMillis(data.updatedAtIso) ||
    createdAt ||
    Date.now();

  return {
    id,
    name: cleanString(data.name, "Equipment bag"),
    holderId: cleanString(data.holderId, "unknown"),
    color: cleanString(data.color, "#111827"),
    contents: cleanContents(data.contents),
    note: cleanString(data.note) || undefined,
    createdAt,
    createdByEmail: cleanString(data.createdByEmail) || undefined,
    createdByName: cleanString(data.createdByName) || undefined,
    updatedAt,
    updatedByEmail: cleanString(data.updatedByEmail) || undefined,
    updatedByName: cleanString(data.updatedByName) || undefined,
  };
}

function requireSignedInUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user || !user.email) {
    throw new Error("Sign in to use the shared equipment board.");
  }
  return user;
}

function resolveEquipmentScope(scopeId: string) {
  const trimmed = scopeId.trim();
  if (!trimmed) throw new Error("Open a Firebase shared roster before using realtime equipment.");
  if (trimmed.startsWith("roster:")) {
    const rosterId = trimmed.slice("roster:".length).trim();
    if (!rosterId) throw new Error("Open a Firebase shared roster before using realtime equipment.");
    return { kind: "roster" as const, id: rosterId };
  }
  return { kind: "group" as const, id: trimmed };
}

function equipmentCollection(scopeId: string) {
  const scope = resolveEquipmentScope(scopeId);
  if (scope.kind === "roster") {
    return collection(getFairTeamsFirestore(), "sharedRosters", scope.id, "equipmentBags");
  }
  return collection(getFairTeamsFirestore(), "sharedGroups", scope.id, "equipmentBags");
}

export function listenToFirebaseEquipmentBags(
  scopeId: string,
  callback: (bags: FirebaseEquipmentBag[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    equipmentCollection(scopeId),
    { includeMetadataChanges: true },
    (snapshot) => {
      const bags = snapshot.docs
        .map((docSnap) => toEquipmentBag(docSnap.id, docSnap.data()))
        .sort((a, b) => a.name.localeCompare(b.name));
      callback(bags);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("Could not load shared equipment board."));
    },
  );
}

export async function saveFirebaseEquipmentBag(scopeId: string, bag: FirebaseEquipmentBag): Promise<void> {
  const user = requireSignedInUser();
  const now = new Date();
  const userName = user.displayName?.trim() || user.email || "Organizer";
  const scope = resolveEquipmentScope(scopeId);
  const payload: Record<string, unknown> = {
    app: "Fair Teams",
    schemaVersion: 1,
    scopeKind: scope.kind,
    scopeId: scope.id,
    groupId: scope.kind === "group" ? scope.id : null,
    rosterId: scope.kind === "roster" ? scope.id : null,
    name: bag.name.trim() || "Equipment bag",
    holderId: bag.holderId || "unknown",
    color: bag.color || "#111827",
    contents: bag.contents.map((item) => item.trim()).filter(Boolean).slice(0, 20),
    note: bag.note?.trim() || null,
    updatedByUid: user.uid,
    updatedByEmail: user.email,
    updatedByName: userName,
    updatedAt: serverTimestamp(),
    updatedAtIso: now.toISOString(),
  };

  if (bag.createdAt) {
    payload.createdAt = bag.createdAt;
    payload.createdAtIso = new Date(bag.createdAt).toISOString();
    payload.createdByEmail = bag.createdByEmail || user.email;
    payload.createdByName = bag.createdByName || userName;
  }

  await setDoc(doc(equipmentCollection(scopeId), bag.id), payload, { merge: true });
}

export async function deleteFirebaseEquipmentBag(scopeId: string, bagId: string): Promise<void> {
  requireSignedInUser();
  await deleteDoc(doc(equipmentCollection(scopeId), bagId));
}
