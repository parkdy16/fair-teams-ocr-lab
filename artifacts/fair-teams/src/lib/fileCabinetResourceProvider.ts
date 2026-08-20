import {
  getGoogleDriveFileCabinetResourceMetadata,
  type GoogleDriveFileCabinetResourceMetadata,
} from "./googleDriveFiles.ts";
import {
  pickGoogleDriveFileCabinetResource,
  type GoogleDrivePickedFile,
} from "./googleDrivePicker.ts";
import {
  validateFileCabinetResourceDraft,
  type FileCabinetResource,
  type FileCabinetResourceDraft,
} from "./fileCabinetResource.ts";

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const FILE_CABINET_RESOURCE_DOMAIN_KEYS = [
  "schemaVersion",
  "provider",
  "resourceKind",
  "providerResourceId",
  "externalUrl",
  "displayName",
  "mimeType",
  "origin",
  "contexts",
  "resourceId",
  "createdByUid",
  "createdAt",
  "updatedByUid",
  "updatedAt",
] as const satisfies readonly (keyof FileCabinetResource)[];

export type FileCabinetResourceProviderResolution =
  | {
      status: "ready";
      provider: "google_drive" | "external_link";
      resourceKind: "file" | "folder" | "link";
      displayName: string;
      mimeType: string | null;
      openUrl: string;
    }
  | { status: "reconnect_required"; reason: FileCabinetResourceProviderFailureReason; message: string }
  | { status: "unavailable"; reason: FileCabinetResourceProviderFailureReason; message: string }
  | { status: "insufficient_permission"; reason: FileCabinetResourceProviderFailureReason; message: string }
  | { status: "unsupported"; reason: FileCabinetResourceProviderFailureReason; message: string };

export type FileCabinetResourceProviderFailureReason =
  | "drive_reconnect_verify"
  | "drive_insufficient_permission"
  | "drive_item_unavailable"
  | "unsupported_metadata"
  | "invalid_external_link"
  | "unsupported_provider"
  | "drive_connect_verify"
  | "recorded_drive_item_unavailable"
  | "drive_connect_choose"
  | "picker_unsupported_metadata"
  | "selected_drive_item_unavailable";

export type FileCabinetGoogleDriveSelection =
  | {
      status: "ready";
      provider: "google_drive";
      resourceKind: "file" | "folder";
      providerResourceId: string;
      displayName: string;
      mimeType: string;
      openUrl: string;
    }
  | { status: "selection_cancelled" }
  | Exclude<FileCabinetResourceProviderResolution, { status: "ready" }>;

export type FileCabinetResourceProviderDependencies = {
  pickGoogleDriveResource: (accessToken: string) => Promise<GoogleDrivePickedFile | null>;
  loadGoogleDriveMetadata: (
    accessToken: string,
    providerResourceId: string,
  ) => Promise<GoogleDriveFileCabinetResourceMetadata>;
};

const DEFAULT_DEPENDENCIES: FileCabinetResourceProviderDependencies = {
  pickGoogleDriveResource: pickGoogleDriveFileCabinetResource,
  loadGoogleDriveMetadata: getGoogleDriveFileCabinetResourceMetadata,
};

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; code?: unknown };
  const status = Number(record.status ?? record.code);
  return Number.isFinite(status) ? status : undefined;
}

function providerFailure(error: unknown): Exclude<
  FileCabinetResourceProviderResolution,
  { status: "ready" }
> {
  const status = errorStatus(error);
  if (status === 401) {
    return {
      status: "reconnect_required",
      reason: "drive_reconnect_verify",
      message: "Reconnect Google Drive to verify this File Cabinet item.",
    };
  }
  if (status === 403) {
    return {
      status: "insufficient_permission",
      reason: "drive_insufficient_permission",
      message: "This Google account does not have permission to open this File Cabinet item.",
    };
  }
  return {
    status: "unavailable",
    reason: "drive_item_unavailable",
    message: "This Google Drive item is unavailable.",
  };
}

function safeExternalUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:")
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password
    )
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function driveOpenUrl(providerResourceId: string, webViewLink?: string) {
  const liveLink = safeExternalUrl(webViewLink || "");
  if (liveLink) return liveLink;
  return `https://drive.google.com/open?id=${encodeURIComponent(providerResourceId)}`;
}

function validDriveMetadata(
  expectedProviderResourceId: string,
  metadata: GoogleDriveFileCabinetResourceMetadata,
) {
  const id = typeof metadata?.id === "string" ? metadata.id.trim() : "";
  const name = typeof metadata?.name === "string" ? metadata.name.trim() : "";
  const mimeType = typeof metadata?.mimeType === "string" ? metadata.mimeType.trim() : "";
  if (!id || id !== expectedProviderResourceId || !name || !mimeType || metadata.trashed) {
    return null;
  }
  return { id, name, mimeType };
}

function resourceDraft(resource: unknown) {
  const record = resource && typeof resource === "object"
    ? resource as Record<string, unknown>
    : {};
  const keys = Object.keys(record);
  if (
    keys.length !== FILE_CABINET_RESOURCE_DOMAIN_KEYS.length
    || !keys.every((key) => (
      FILE_CABINET_RESOURCE_DOMAIN_KEYS.includes(key as keyof FileCabinetResource)
    ))
    || typeof record.resourceId !== "string"
    || !record.resourceId
    || typeof record.createdByUid !== "string"
    || !record.createdByUid
    || typeof record.updatedByUid !== "string"
    || !record.updatedByUid
    || typeof record.createdAt !== "number"
    || !Number.isFinite(record.createdAt)
    || record.createdAt < 0
    || typeof record.updatedAt !== "number"
    || !Number.isFinite(record.updatedAt)
    || record.updatedAt < 0
  ) {
    throw new Error("The File Cabinet resource domain record is invalid.");
  }
  return {
    schemaVersion: record.schemaVersion,
    provider: record.provider,
    resourceKind: record.resourceKind,
    providerResourceId: record.providerResourceId,
    externalUrl: record.externalUrl,
    displayName: record.displayName,
    mimeType: record.mimeType,
    origin: record.origin,
    contexts: record.contexts,
  };
}

export async function resolveFileCabinetResourceProvider(
  resource: unknown,
  accessToken: string,
  dependencies: FileCabinetResourceProviderDependencies = DEFAULT_DEPENDENCIES,
): Promise<FileCabinetResourceProviderResolution> {
  let durable: FileCabinetResourceDraft;
  try {
    durable = validateFileCabinetResourceDraft(resourceDraft(resource));
  } catch {
    return {
      status: "unsupported",
      reason: "unsupported_metadata",
      message: "This File Cabinet item uses unsupported metadata.",
    };
  }

  if (durable.provider === "external_link") {
    const openUrl = safeExternalUrl(durable.externalUrl || "");
    if (!openUrl) {
      return {
        status: "unsupported",
        reason: "invalid_external_link",
        message: "This File Cabinet link is invalid.",
      };
    }
    return {
      status: "ready",
      provider: "external_link",
      resourceKind: "link",
      displayName: durable.displayName,
      mimeType: null,
      openUrl,
    };
  }

  if (durable.provider !== "google_drive" || !durable.providerResourceId) {
    return {
      status: "unsupported",
      reason: "unsupported_provider",
      message: "This File Cabinet provider is not supported.",
    };
  }
  if (!accessToken) {
    return {
      status: "reconnect_required",
      reason: "drive_connect_verify",
      message: "Connect Google Drive to verify this File Cabinet item.",
    };
  }

  try {
    const metadata = await dependencies.loadGoogleDriveMetadata(
      accessToken,
      durable.providerResourceId,
    );
    const valid = validDriveMetadata(durable.providerResourceId, metadata);
    if (!valid) {
      return {
        status: "unavailable",
        reason: "recorded_drive_item_unavailable",
        message: "The recorded Google Drive item is unavailable.",
      };
    }
    return {
      status: "ready",
      provider: "google_drive",
      resourceKind: valid.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE ? "folder" : "file",
      displayName: valid.name,
      mimeType: valid.mimeType,
      openUrl: driveOpenUrl(valid.id, metadata.webViewLink),
    };
  } catch (error) {
    return providerFailure(error);
  }
}

export async function selectFileCabinetGoogleDriveResource(
  accessToken: string,
  dependencies: FileCabinetResourceProviderDependencies = DEFAULT_DEPENDENCIES,
): Promise<FileCabinetGoogleDriveSelection> {
  if (!accessToken) {
    return {
      status: "reconnect_required",
      reason: "drive_connect_choose",
      message: "Connect Google Drive to choose a File Cabinet item.",
    };
  }

  let picked: GoogleDrivePickedFile | null;
  try {
    picked = await dependencies.pickGoogleDriveResource(accessToken);
  } catch (error) {
    return providerFailure(error);
  }
  if (!picked) return { status: "selection_cancelled" };

  const expectedId = typeof picked.id === "string" ? picked.id.trim() : "";
  if (!expectedId) {
    return {
      status: "unsupported",
      reason: "picker_unsupported_metadata",
      message: "Google Picker returned unsupported item metadata.",
    };
  }

  try {
    const metadata = await dependencies.loadGoogleDriveMetadata(accessToken, expectedId);
    const valid = validDriveMetadata(expectedId, metadata);
    if (!valid) {
      return {
        status: "unavailable",
        reason: "selected_drive_item_unavailable",
        message: "The selected Google Drive item is unavailable.",
      };
    }
    return {
      status: "ready",
      provider: "google_drive",
      resourceKind: valid.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE ? "folder" : "file",
      providerResourceId: valid.id,
      displayName: valid.name,
      mimeType: valid.mimeType,
      openUrl: driveOpenUrl(valid.id, metadata.webViewLink),
    };
  } catch (error) {
    return providerFailure(error);
  }
}
