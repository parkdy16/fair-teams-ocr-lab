import type { GoogleDriveCabinetFolder } from "./googleDriveCabinet.ts";
import type { GoogleDriveSharedCabinetSelection } from "./googleDriveSharedCabinet.ts";
import { resolveDurableSchemaVersion } from "./durableSchema.ts";

export const SHARED_WORKSPACE_CABINET_SCHEMA_VERSION = 1 as const;

const SHARED_WORKSPACE_CABINET_SCHEMA = {
  currentVersion: SHARED_WORKSPACE_CABINET_SCHEMA_VERSION,
  supportedVersions: [SHARED_WORKSPACE_CABINET_SCHEMA_VERSION],
  unversionedVersion: null,
} as const;

export type SharedWorkspaceCabinetBacking = "my_drive" | "shared_drive";

export type SharedWorkspaceCabinetLocationDraft = {
  schemaVersion: typeof SHARED_WORKSPACE_CABINET_SCHEMA_VERSION;
  provider: "google_drive";
  backing: SharedWorkspaceCabinetBacking;
  folderId: string;
  driveId?: string;
  displayName?: string;
};

export type SharedWorkspaceCabinetLocation = SharedWorkspaceCabinetLocationDraft & {
  configuredByUid: string;
  configuredAt?: unknown;
  updatedAt?: unknown;
};

function cleanRequiredId(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > 200 || id.includes("/")) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return id;
}

function cleanDisplayName(value: unknown) {
  if (value == null) return undefined;
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return name ? name.slice(0, 200) : undefined;
}

export function validateSharedWorkspaceCabinetLocationDraft(
  value: unknown,
): SharedWorkspaceCabinetLocationDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Choose a valid File Cabinet location.");
  }
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "schemaVersion",
    "provider",
    "backing",
    "folderId",
    "driveId",
    "displayName",
  ]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new Error("The File Cabinet location contains unsupported fields.");
  }
  if (resolveDurableSchemaVersion(
    record.schemaVersion,
    SHARED_WORKSPACE_CABINET_SCHEMA,
  ).status !== "supported") {
    throw new Error("This File Cabinet location version is not supported.");
  }
  if (record.provider !== "google_drive") {
    throw new Error("This File Cabinet provider is not supported.");
  }
  if (record.backing !== "my_drive" && record.backing !== "shared_drive") {
    throw new Error("Choose a supported File Cabinet location.");
  }

  const folderId = cleanRequiredId(record.folderId, "Google Drive folder");
  const displayName = cleanDisplayName(record.displayName);
  if (record.backing === "shared_drive") {
    const driveId = cleanRequiredId(record.driveId, "Shared Drive");
    return {
      schemaVersion: SHARED_WORKSPACE_CABINET_SCHEMA_VERSION,
      provider: "google_drive",
      backing: "shared_drive",
      folderId,
      driveId,
      ...(displayName ? { displayName } : {}),
    };
  }
  if (record.driveId != null && String(record.driveId).trim()) {
    throw new Error("A My Drive File Cabinet cannot include a Shared Drive ID.");
  }
  return {
    schemaVersion: SHARED_WORKSPACE_CABINET_SCHEMA_VERSION,
    provider: "google_drive",
    backing: "my_drive",
    folderId,
    ...(displayName ? { displayName } : {}),
  };
}

export function parseSharedWorkspaceCabinetLocation(
  value: unknown,
): SharedWorkspaceCabinetLocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  try {
    const draft = validateSharedWorkspaceCabinetLocationDraft({
      schemaVersion: record.schemaVersion,
      provider: record.provider,
      backing: record.backing,
      folderId: record.folderId,
      ...(record.driveId != null ? { driveId: record.driveId } : {}),
      ...(record.displayName != null ? { displayName: record.displayName } : {}),
    });
    const configuredByUid = cleanRequiredId(record.configuredByUid, "configuring organizer");
    return {
      ...draft,
      configuredByUid,
      configuredAt: record.configuredAt,
      updatedAt: record.updatedAt,
    };
  } catch {
    return null;
  }
}

export function myDriveCabinetLocationDraft(
  folder: GoogleDriveCabinetFolder,
): SharedWorkspaceCabinetLocationDraft {
  return validateSharedWorkspaceCabinetLocationDraft({
    schemaVersion: SHARED_WORKSPACE_CABINET_SCHEMA_VERSION,
    provider: "google_drive",
    backing: "my_drive",
    folderId: folder.id,
    displayName: folder.name,
  });
}

export function sharedDriveCabinetLocationDraft(
  selection: GoogleDriveSharedCabinetSelection,
): SharedWorkspaceCabinetLocationDraft {
  if (selection.status !== "ready") {
    throw new Error("Choose an available Shared Drive File Cabinet folder first.");
  }
  return validateSharedWorkspaceCabinetLocationDraft({
    schemaVersion: SHARED_WORKSPACE_CABINET_SCHEMA_VERSION,
    provider: selection.provider,
    backing: selection.backing,
    folderId: selection.folderId,
    driveId: selection.driveId,
    displayName: selection.displayName,
  });
}

export function isSameSharedWorkspaceCabinetLocation(
  current: SharedWorkspaceCabinetLocation | null,
  next: SharedWorkspaceCabinetLocationDraft,
) {
  return Boolean(
    current
    && current.provider === next.provider
    && current.backing === next.backing
    && current.folderId === next.folderId
    && (current.driveId || "") === (next.driveId || ""),
  );
}
