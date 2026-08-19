import { resolveDurableSchemaVersion } from "./durableSchema.ts";

export const FILE_CABINET_RESOURCE_SCHEMA_VERSION = 1 as const;

const FILE_CABINET_RESOURCE_SCHEMA = {
  currentVersion: FILE_CABINET_RESOURCE_SCHEMA_VERSION,
  supportedVersions: [FILE_CABINET_RESOURCE_SCHEMA_VERSION],
  unversionedVersion: null,
} as const;

const FILE_CABINET_RESOURCE_DRAFT_KEYS = [
  "schemaVersion",
  "provider",
  "resourceKind",
  "providerResourceId",
  "externalUrl",
  "displayName",
  "mimeType",
  "origin",
  "contexts",
] as const;

const FILE_CABINET_RESOURCE_DOCUMENT_KEYS = [
  ...FILE_CABINET_RESOURCE_DRAFT_KEYS,
  "resourceId",
  "createdByUid",
  "createdAt",
  "updatedByUid",
  "updatedAt",
] as const;

const FILE_CABINET_RESOURCE_UPDATE_KEYS = ["displayName", "contexts"] as const;

const MAX_ID_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 200;
const MAX_MIME_TYPE_LENGTH = 200;
const MAX_EXTERNAL_URL_LENGTH = 2_048;
const MAX_CONTEXTS = 4;

export type FileCabinetResourceProvider = "google_drive" | "external_link";
export type FileCabinetResourceKind = "file" | "folder" | "link";
export type FileCabinetResourceContextKind =
  | "cabinet"
  | "action_board"
  | "equipment";

export type FileCabinetResourceOrigin =
  | { kind: "cabinet" }
  | { kind: "action_board" | "equipment"; entityId: string };

export type FileCabinetResourceContext = FileCabinetResourceOrigin;

export type FileCabinetResourceDraft = {
  schemaVersion: typeof FILE_CABINET_RESOURCE_SCHEMA_VERSION;
  provider: FileCabinetResourceProvider;
  resourceKind: FileCabinetResourceKind;
  providerResourceId: string | null;
  externalUrl: string | null;
  displayName: string;
  mimeType: string | null;
  origin: FileCabinetResourceOrigin;
  contexts: FileCabinetResourceContext[];
};

export type FileCabinetResource = FileCabinetResourceDraft & {
  resourceId: string;
  createdByUid: string;
  createdAt: number;
  updatedByUid: string;
  updatedAt: number;
};

export type FileCabinetResourceMetadataUpdate = {
  displayName: string;
  contexts: FileCabinetResourceContext[];
};

export type FileCabinetResourceFeatureRelationship =
  | "action_board"
  | "equipment";

export type FileCabinetResourceRemovalBlocked = {
  status: "blocked_by_relationships";
  relationshipKinds: FileCabinetResourceFeatureRelationship[];
  message: string;
};

export type FileCabinetResourceRemovalCheck =
  | { status: "removable" }
  | FileCabinetResourceRemovalBlocked;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const keys = Object.keys(record);
  return keys.length === expectedKeys.length
    && keys.every((key) => expectedKeys.includes(key));
}

function cleanRequiredId(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (
    !id
    || id.length > MAX_ID_LENGTH
    || id.includes("/")
    || /[\u0000-\u001f\u007f]/.test(id)
  ) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return id;
}

function cleanDisplayName(value: unknown) {
  const displayName = typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error("Choose a valid resource name.");
  }
  return displayName;
}

function cleanMimeType(value: unknown): string | null {
  if (value === null) return null;
  const mimeType = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !mimeType
    || mimeType.length > MAX_MIME_TYPE_LENGTH
    || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType)
  ) {
    throw new Error("Choose a valid resource MIME type.");
  }
  return mimeType;
}

function cleanExternalUrl(value: unknown) {
  const externalUrl = typeof value === "string" ? value.trim() : "";
  if (!externalUrl || externalUrl.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new Error("Choose a valid external resource URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(externalUrl);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || !parsed.hostname
    ) {
      throw new Error("invalid URL");
    }
  } catch {
    throw new Error("Choose a valid external resource URL.");
  }

  if (parsed.href.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new Error("Choose a valid external resource URL.");
  }
  return parsed.href;
}

function cleanRelationship(
  value: unknown,
  label: "origin" | "context",
): FileCabinetResourceOrigin {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error(`Choose a valid resource ${label}.`);
  }

  if (value.kind === "cabinet") {
    if (!hasExactKeys(value, ["kind"])) {
      throw new Error(`A Cabinet ${label} cannot include an entity ID.`);
    }
    return { kind: "cabinet" };
  }

  if (value.kind !== "action_board" && value.kind !== "equipment") {
    throw new Error(`Choose a valid resource ${label}.`);
  }
  if (!hasExactKeys(value, ["kind", "entityId"])) {
    throw new Error(`Choose a valid resource ${label}.`);
  }

  return {
    kind: value.kind,
    entityId: cleanRequiredId(value.entityId, `${label} entity ID`),
  };
}

function cleanContexts(value: unknown): FileCabinetResourceContext[] {
  if (!Array.isArray(value) || value.length > MAX_CONTEXTS) {
    throw new Error(`A resource can have up to ${MAX_CONTEXTS} contexts.`);
  }

  const contexts = value.map((context) => cleanRelationship(context, "context"));
  const keys = contexts.map((context) => (
    context.kind === "cabinet"
      ? "cabinet"
      : `${context.kind}\u0000${context.entityId}`
  ));
  if (new Set(keys).size !== keys.length) {
    throw new Error("Resource contexts must be unique.");
  }
  return contexts;
}

function timestampMillis(value: unknown, label: string) {
  if (
    value
    && typeof value === "object"
    && "toMillis" in value
    && typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    try {
      const millis = (value as { toMillis: () => number }).toMillis();
      if (Number.isFinite(millis) && millis >= 0) return millis;
    } catch {
      // Fall through to the stable validation error below.
    }
  }
  throw new Error(`The resource ${label} timestamp is invalid.`);
}

function relationshipIsCanonical(
  value: unknown,
  relationship: FileCabinetResourceOrigin,
) {
  return isRecord(value)
    && value.kind === relationship.kind
    && (
      relationship.kind === "cabinet"
      || value.entityId === relationship.entityId
    );
}

export function checkFileCabinetResourceRemoval(
  resource: Pick<FileCabinetResourceDraft, "origin" | "contexts">,
): FileCabinetResourceRemovalCheck {
  const relationshipKinds = (["action_board", "equipment"] as const).filter(
    (kind) => resource.origin.kind === kind
      || resource.contexts.some((context) => context.kind === kind),
  );

  if (!relationshipKinds.length) return { status: "removable" };

  const relationshipNames = relationshipKinds
    .map((kind) => kind === "action_board" ? "Action Board" : "Equipment")
    .join(" and ");
  const removalInstruction = relationshipKinds.length === 1
    ? `Remove its relationship from ${relationshipNames} first.`
    : `Remove its relationships from ${relationshipNames} first.`;
  return {
    status: "blocked_by_relationships",
    relationshipKinds: [...relationshipKinds],
    message: `This item is still tied to ${relationshipNames}, so it cannot be removed from the File Cabinet. ${removalInstruction} No Stripes record or external item was deleted.`,
  };
}

export function validateFileCabinetResourceDraft(
  value: unknown,
): FileCabinetResourceDraft {
  if (!isRecord(value) || !hasExactKeys(value, FILE_CABINET_RESOURCE_DRAFT_KEYS)) {
    throw new Error("The File Cabinet resource contains unsupported fields.");
  }

  const version = resolveDurableSchemaVersion(
    value.schemaVersion,
    FILE_CABINET_RESOURCE_SCHEMA,
  );
  if (version.status !== "supported") {
    throw new Error("This File Cabinet resource version is not supported.");
  }

  const displayName = cleanDisplayName(value.displayName);
  const origin = cleanRelationship(value.origin, "origin");
  const contexts = cleanContexts(value.contexts);

  if (value.provider === "google_drive") {
    if (value.resourceKind !== "file" && value.resourceKind !== "folder") {
      throw new Error("Choose a valid Google Drive resource kind.");
    }
    if (value.externalUrl !== null) {
      throw new Error("A Google Drive resource cannot include an external URL.");
    }
    return {
      schemaVersion: FILE_CABINET_RESOURCE_SCHEMA_VERSION,
      provider: "google_drive",
      resourceKind: value.resourceKind,
      providerResourceId: cleanRequiredId(
        value.providerResourceId,
        "Google Drive resource ID",
      ),
      externalUrl: null,
      displayName,
      mimeType: cleanMimeType(value.mimeType),
      origin,
      contexts,
    };
  }

  if (value.provider === "external_link") {
    if (value.resourceKind !== "link") {
      throw new Error("An external resource must be a link.");
    }
    if (value.providerResourceId !== null || value.mimeType !== null) {
      throw new Error("An external link cannot include provider or MIME metadata.");
    }
    return {
      schemaVersion: FILE_CABINET_RESOURCE_SCHEMA_VERSION,
      provider: "external_link",
      resourceKind: "link",
      providerResourceId: null,
      externalUrl: cleanExternalUrl(value.externalUrl),
      displayName,
      mimeType: null,
      origin,
      contexts,
    };
  }

  throw new Error("This File Cabinet resource provider is not supported.");
}

export function validateFileCabinetResourceMetadataUpdate(
  value: unknown,
): FileCabinetResourceMetadataUpdate {
  if (!isRecord(value) || !hasExactKeys(value, FILE_CABINET_RESOURCE_UPDATE_KEYS)) {
    throw new Error("Only the resource name and contexts can be updated.");
  }
  return {
    displayName: cleanDisplayName(value.displayName),
    contexts: cleanContexts(value.contexts),
  };
}

export function parseFileCabinetResource(
  documentId: string,
  value: unknown,
): FileCabinetResource | null {
  try {
    if (!isRecord(value) || !hasExactKeys(value, FILE_CABINET_RESOURCE_DOCUMENT_KEYS)) {
      return null;
    }
    if (typeof value.resourceId !== "string" || value.resourceId !== documentId) {
      return null;
    }
    const resourceId = cleanRequiredId(value.resourceId, "resource ID");
    if (resourceId !== value.resourceId) return null;

    const draft = validateFileCabinetResourceDraft({
      schemaVersion: value.schemaVersion,
      provider: value.provider,
      resourceKind: value.resourceKind,
      providerResourceId: value.providerResourceId,
      externalUrl: value.externalUrl,
      displayName: value.displayName,
      mimeType: value.mimeType,
      origin: value.origin,
      contexts: value.contexts,
    });
    if (
      draft.providerResourceId !== value.providerResourceId
      || draft.mimeType !== value.mimeType
      || !relationshipIsCanonical(value.origin, draft.origin)
      || !Array.isArray(value.contexts)
      || !value.contexts.every((context, index) => (
        relationshipIsCanonical(context, draft.contexts[index])
      ))
    ) {
      return null;
    }

    const createdByUid = cleanRequiredId(value.createdByUid, "creating Firebase user");
    const updatedByUid = cleanRequiredId(value.updatedByUid, "updating Firebase user");
    if (createdByUid !== value.createdByUid || updatedByUid !== value.updatedByUid) {
      return null;
    }

    return {
      ...draft,
      resourceId,
      createdByUid,
      createdAt: timestampMillis(value.createdAt, "creation"),
      updatedByUid,
      updatedAt: timestampMillis(value.updatedAt, "update"),
    };
  } catch {
    return null;
  }
}

export function createExternalLinkFileCabinetResourceDraft(
  externalUrl: string,
  displayName: string,
  origin: FileCabinetResourceOrigin = { kind: "cabinet" },
  contexts: readonly FileCabinetResourceContext[] = [],
) {
  return validateFileCabinetResourceDraft({
    schemaVersion: FILE_CABINET_RESOURCE_SCHEMA_VERSION,
    provider: "external_link",
    resourceKind: "link",
    providerResourceId: null,
    externalUrl,
    displayName,
    mimeType: null,
    origin,
    contexts: [...contexts],
  });
}

export function createGoogleDriveFileCabinetResourceDraft(
  providerResourceId: string,
  displayName: string,
  resourceKind: "file" | "folder",
  mimeType: string | null = null,
  origin: FileCabinetResourceOrigin = { kind: "cabinet" },
  contexts: readonly FileCabinetResourceContext[] = [],
) {
  return validateFileCabinetResourceDraft({
    schemaVersion: FILE_CABINET_RESOURCE_SCHEMA_VERSION,
    provider: "google_drive",
    resourceKind,
    providerResourceId,
    externalUrl: null,
    displayName,
    mimeType,
    origin,
    contexts: [...contexts],
  });
}
