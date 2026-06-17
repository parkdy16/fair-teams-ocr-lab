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
  updatedAt: number;
  updatedByEmail?: string;
};

export type FirebaseEquipmentLocation = {
  id: string;
  label: string;
  updatedAt: number;
  updatedByEmail?: string;
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
  const updatedAt =
    timestampToMillis(data.updatedAt) ||
    timestampToMillis(data.updatedAtIso) ||
    timestampToMillis(data.createdAt) ||
    Date.now();

  return {
    id,
    name: cleanString(data.name, "Equipment bag"),
    holderId: cleanString(data.holderId, "unknown"),
    color: cleanString(data.color, "#111827"),
    contents: cleanContents(data.contents),
    note: cleanString(data.note) || undefined,
    updatedAt,
    updatedByEmail: cleanString(data.updatedByEmail) || undefined,
  };
}

function toEquipmentLocation(id: string, data: DocumentData): FirebaseEquipmentLocation | null {
  const locationId = cleanString(data.locationId, id.replace(/^location-/, ""));
  const label = cleanString(data.label);
  if (!locationId || !label) return null;
  const updatedAt =
    timestampToMillis(data.updatedAt) ||
    timestampToMillis(data.updatedAtIso) ||
    timestampToMillis(data.createdAt) ||
    Date.now();

  return {
    id: locationId,
    label,
    updatedAt,
    updatedByEmail: cleanString(data.updatedByEmail) || undefined,
  };
}

function requireSignedInUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user || !user.email) {
    throw new Error("Sign in to use the shared equipment board.");
  }
  return user;
}

function equipmentCollection(groupId: string) {
  if (!groupId) throw new Error("Open a Firebase shared group before using realtime equipment.");
  return collection(getFairTeamsFirestore(), "sharedGroups", groupId, "equipmentBags");
}

export function listenToFirebaseEquipmentBags(
  groupId: string,
  callback: (bags: FirebaseEquipmentBag[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    equipmentCollection(groupId),
    (snapshot) => {
      const bags = snapshot.docs
        .filter((docSnap) => docSnap.data().kind !== "location")
        .map((docSnap) => toEquipmentBag(docSnap.id, docSnap.data()))
        .sort((a, b) => a.name.localeCompare(b.name));
      callback(bags);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("Could not load shared equipment board."));
    },
  );
}

export function listenToFirebaseEquipmentLocations(
  groupId: string,
  callback: (locations: FirebaseEquipmentLocation[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    equipmentCollection(groupId),
    (snapshot) => {
      const locations = snapshot.docs
        .filter((docSnap) => docSnap.data().kind === "location")
        .map((docSnap) => toEquipmentLocation(docSnap.id, docSnap.data()))
        .filter((location): location is FirebaseEquipmentLocation => Boolean(location))
        .sort((a, b) => {
          if (a.id === "storage") return -1;
          if (b.id === "storage") return 1;
          return a.label.localeCompare(b.label);
        });
      callback(locations);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("Could not load equipment spaces."));
    },
  );
}

export async function saveFirebaseEquipmentLocation(groupId: string, location: FirebaseEquipmentLocation): Promise<void> {
  const user = requireSignedInUser();
  const now = new Date().toISOString();
  const cleanId = location.id.trim() || "storage";
  const payload = {
    app: "Fair Teams",
    kind: "location",
    schemaVersion: 1,
    groupId,
    locationId: cleanId,
    label: location.label.trim() || "Storage",
    updatedByUid: user.uid,
    updatedByEmail: user.email,
    updatedAt: serverTimestamp(),
    updatedAtIso: now,
  };

  await setDoc(doc(equipmentCollection(groupId), `location-${cleanId}`), payload, { merge: true });
}

export async function deleteFirebaseEquipmentLocation(groupId: string, locationId: string): Promise<void> {
  requireSignedInUser();
  if (locationId === "storage") return;
  await deleteDoc(doc(equipmentCollection(groupId), `location-${locationId}`));
}

export async function saveFirebaseEquipmentBag(groupId: string, bag: FirebaseEquipmentBag): Promise<void> {
  const user = requireSignedInUser();
  const now = new Date().toISOString();
  const payload = {
    app: "Fair Teams",
    schemaVersion: 1,
    groupId,
    name: bag.name.trim() || "Equipment bag",
    holderId: bag.holderId || "unknown",
    color: bag.color || "#111827",
    contents: bag.contents.map((item) => item.trim()).filter(Boolean).slice(0, 20),
    note: bag.note?.trim() || null,
    updatedByUid: user.uid,
    updatedByEmail: user.email,
    updatedAt: serverTimestamp(),
    updatedAtIso: now,
  };

  await setDoc(doc(equipmentCollection(groupId), bag.id), payload, { merge: true });
}

export async function deleteFirebaseEquipmentBag(groupId: string, bagId: string): Promise<void> {
  requireSignedInUser();
  await deleteDoc(doc(equipmentCollection(groupId), bagId));
}
