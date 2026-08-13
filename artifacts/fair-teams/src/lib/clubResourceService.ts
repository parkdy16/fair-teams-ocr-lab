import { collection, doc } from "firebase/firestore";
import { getFairTeamsFirestore } from "@/lib/firebaseClient";

export type ClubResourceType =
  | "stripe_file"
  | "google_drive"
  | "external_link";

export type ClubResourceContextKind =
  | "action_board"
  | "equipment"
  | "cabinet";

export type ClubResourceOrigin = {
  kind: ClubResourceContextKind;
  entityId?: string;
};

export type ClubResourceContext = {
  kind: ClubResourceContextKind;
  entityId: string;
  label?: string;
};

export type ClubResource = {
  id: string;
  type: ClubResourceType;
  name: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
  url?: string;
  createdAt: number;
  createdByUid: string;
  createdByName: string;
  createdByEmail?: string;
  origin: ClubResourceOrigin;
  contexts?: ClubResourceContext[];
  folderId?: string;
  pinned?: boolean;
  updatedAt?: number;
};

function cleanRequiredId(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (clean.includes("/")) throw new Error(`${label} cannot contain "/".`);
  return clean;
}

export function sharedRosterIdFromScope(scopeId: string) {
  const raw = scopeId.trim();
  if (!raw.startsWith("roster:")) {
    throw new Error("Stripes file storage requires a shared roster.");
  }

  return cleanRequiredId(raw.slice(7), "Shared roster ID");
}

export function clubResourcesCollection(rosterId: string) {
  return collection(
    getFairTeamsFirestore(),
    "sharedRosters",
    cleanRequiredId(rosterId, "Shared roster ID"),
    "resources",
  );
}

export function clubResourceDoc(rosterId: string, resourceId: string) {
  return doc(
    clubResourcesCollection(rosterId),
    cleanRequiredId(resourceId, "Resource ID"),
  );
}

function safeStorageFileName(fileName: string) {
  const clean = fileName
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, " ");

  return clean || "file";
}

export function clubResourceStoragePath(
  rosterId: string,
  resourceId: string,
  fileName: string,
) {
  const cleanRosterId = cleanRequiredId(rosterId, "Shared roster ID");
  const cleanResourceId = cleanRequiredId(resourceId, "Resource ID");

  return `sharedRosters/${cleanRosterId}/resources/${cleanResourceId}/${safeStorageFileName(fileName)}`;
}
