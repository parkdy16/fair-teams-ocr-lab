import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import {
  getFairTeamsAuth,
  getFairTeamsFirestore,
  getFairTeamsStorage,
} from "@/lib/firebaseClient";

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


export const STRIPES_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const STRIPES_FILE_MAX_CARD_ATTACHMENTS = 5;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

const ATTACHMENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
};

function attachmentContentType(file: File) {
  const suppliedType = file.type.trim().toLowerCase();
  if (ALLOWED_ATTACHMENT_TYPES.has(suppliedType)) return suppliedType;

  const extension = file.name.trim().toLowerCase().split(".").pop() || "";
  const inferredType = ATTACHMENT_TYPE_BY_EXTENSION[extension];
  if (inferredType) return inferredType;

  throw new Error(
    "Use an image, PDF, or common document file. Video uploads are not supported.",
  );
}

export function validateClubFile(file: File) {
  if (!file.name.trim()) throw new Error("Choose a file first.");
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > STRIPES_FILE_MAX_BYTES) {
    throw new Error("Files must be 10 MB or smaller.");
  }

  return attachmentContentType(file);
}

function requireResourceActor() {
  const user = getFairTeamsAuth().currentUser;
  if (!user?.uid || !user.email) {
    throw new Error("Sign in to upload club files.");
  }

  return {
    uid: user.uid,
    email: user.email,
    name:
      user.displayName?.trim() ||
      user.email.split("@")[0]?.trim() ||
      "Organizer",
  };
}

function millis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function parseClubResource(
  id: string,
  data: DocumentData,
): ClubResource | null {
  const type = String(data.type || "");
  if (
    type !== "stripe_file" &&
    type !== "google_drive" &&
    type !== "external_link"
  ) {
    return null;
  }

  const rawOrigin =
    data.origin && typeof data.origin === "object"
      ? (data.origin as Record<string, unknown>)
      : {};
  const originKind = String(rawOrigin.kind || "");

  if (
    originKind !== "action_board" &&
    originKind !== "equipment" &&
    originKind !== "cabinet"
  ) {
    return null;
  }

  const contexts = Array.isArray(data.contexts)
    ? data.contexts
        .map((value: unknown) => {
          const row =
            value && typeof value === "object"
              ? (value as Record<string, unknown>)
              : {};
          const kind = String(row.kind || "");
          const entityId = String(row.entityId || "").trim();

          if (
            !entityId ||
            (kind !== "action_board" &&
              kind !== "equipment" &&
              kind !== "cabinet")
          ) {
            return null;
          }

          return {
            kind: kind as ClubResourceContextKind,
            entityId,
            label:
              typeof row.label === "string" && row.label.trim()
                ? row.label.trim()
                : undefined,
          };
        })
        .filter(
          (value): value is ClubResourceContext => Boolean(value),
        )
    : [];

  return {
    id,
    type,
    name: String(data.name || "File"),
    mimeType:
      typeof data.mimeType === "string" ? data.mimeType : undefined,
    size:
      Number.isFinite(Number(data.size)) ? Number(data.size) : undefined,
    storagePath:
      typeof data.storagePath === "string" ? data.storagePath : undefined,
    url: typeof data.url === "string" ? data.url : undefined,
    createdAt: millis(data.createdAt),
    createdByUid: String(data.createdByUid || ""),
    createdByName: String(data.createdByName || "Organizer"),
    createdByEmail:
      typeof data.createdByEmail === "string"
        ? data.createdByEmail
        : undefined,
    origin: {
      kind: originKind as ClubResourceContextKind,
      entityId:
        typeof rawOrigin.entityId === "string" &&
        rawOrigin.entityId.trim()
          ? rawOrigin.entityId.trim()
          : undefined,
    },
    contexts,
    folderId:
      typeof data.folderId === "string" && data.folderId.trim()
        ? data.folderId.trim()
        : undefined,
    pinned: Boolean(data.pinned),
    updatedAt: millis(data.updatedAt) || undefined,
  };
}

export async function uploadClubFileResource(
  scopeId: string,
  file: File,
  origin: ClubResourceOrigin,
): Promise<ClubResource> {
  const rosterId = sharedRosterIdFromScope(scopeId);
  const actor = requireResourceActor();
  const mimeType = validateClubFile(file);

  const resourceRef = doc(clubResourcesCollection(rosterId));
  const resourceId = resourceRef.id;
  const storagePath = clubResourceStoragePath(
    rosterId,
    resourceId,
    file.name,
  );
  const objectRef = storageRef(getFairTeamsStorage(), storagePath);
  const createdAt = Date.now();

  const cleanEntityId = origin.entityId?.trim();
  const cleanOrigin: ClubResourceOrigin = cleanEntityId
    ? { kind: origin.kind, entityId: cleanEntityId }
    : { kind: origin.kind };

  const contexts: ClubResourceContext[] = cleanEntityId
    ? [{ kind: origin.kind, entityId: cleanEntityId }]
    : [];

  const resource: ClubResource = {
    id: resourceId,
    type: "stripe_file",
    name: file.name.trim(),
    mimeType,
    size: file.size,
    storagePath,
    createdAt,
    createdByUid: actor.uid,
    createdByName: actor.name,
    createdByEmail: actor.email,
    origin: cleanOrigin,
    contexts,
    pinned: false,
    updatedAt: createdAt,
  };

  await uploadBytes(objectRef, file, {
    contentType: mimeType,
    customMetadata: {
      rosterId,
      resourceId,
      uploaderUid: actor.uid,
    },
  });

  try {
    await setDoc(resourceRef, {
      app: "Stripes",
      schemaVersion: 1,
      type: resource.type,
      name: resource.name,
      mimeType: resource.mimeType,
      size: resource.size,
      storagePath: resource.storagePath,
      createdAt: resource.createdAt,
      createdByUid: resource.createdByUid,
      createdByName: resource.createdByName,
      createdByEmail: resource.createdByEmail,
      origin: resource.origin,
      contexts: resource.contexts || [],
      folderId: null,
      pinned: false,
      updatedAt: resource.updatedAt,
    });
  } catch (error) {
    await deleteObject(objectRef).catch(() => undefined);
    throw error;
  }

  return resource;
}

export async function listClubResources(
  scopeId: string,
): Promise<ClubResource[]> {
  const rosterId = sharedRosterIdFromScope(scopeId);
  requireResourceActor();

  const snapshot = await getDocs(clubResourcesCollection(rosterId));

  return snapshot.docs
    .map((snapshotDoc) =>
      parseClubResource(snapshotDoc.id, snapshotDoc.data()),
    )
    .filter(
      (resource): resource is ClubResource => Boolean(resource),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClubFileBlob(
  scopeId: string,
  resource: ClubResource,
): Promise<Blob> {
  const rosterId = sharedRosterIdFromScope(scopeId);
  requireResourceActor();

  if (resource.type !== "stripe_file" || !resource.storagePath) {
    throw new Error("This resource is not a Stripes-hosted file.");
  }

  const expectedPrefix =
    `sharedRosters/${rosterId}/resources/${cleanRequiredId(resource.id, "Resource ID")}/`;

  if (!resource.storagePath.startsWith(expectedPrefix)) {
    throw new Error("The file path does not belong to this shared roster.");
  }

  return getBlob(
    storageRef(getFairTeamsStorage(), resource.storagePath),
    STRIPES_FILE_MAX_BYTES,
  );
}

function storageObjectWasAlreadyMissing(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "storage/object-not-found",
  );
}

export async function deleteClubFileResource(
  scopeId: string,
  resource: ClubResource,
): Promise<void> {
  const rosterId = sharedRosterIdFromScope(scopeId);
  requireResourceActor();

  if (resource.type !== "stripe_file" || !resource.storagePath) {
    throw new Error("This resource is not a Stripes-hosted file.");
  }

  const expectedPrefix =
    `sharedRosters/${rosterId}/resources/${cleanRequiredId(resource.id, "Resource ID")}/`;

  if (!resource.storagePath.startsWith(expectedPrefix)) {
    throw new Error("The file path does not belong to this shared roster.");
  }

  try {
    await deleteObject(
      storageRef(getFairTeamsStorage(), resource.storagePath),
    );
  } catch (error) {
    if (!storageObjectWasAlreadyMissing(error)) throw error;
  }

  await deleteDoc(clubResourceDoc(rosterId, resource.id));
}
