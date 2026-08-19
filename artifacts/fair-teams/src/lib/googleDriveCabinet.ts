import { isGoogleDriveAuthorizationExpiredError } from "./googleDriveConnection.ts";

export const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const STRIPES_CABINET_FOLDER_NAME = "Stripes Cabinet";
export const STRIPES_CABINET_APP_PROPERTIES = {
  stripesManagedLocation: "cabinet",
  stripesCabinetBacking: "my_drive",
  stripesCabinetSchemaVersion: "1",
} as const;

export interface GoogleDriveCabinetFolder {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  trashed?: boolean;
  parents?: string[];
  driveId?: string;
  ownedByMe?: boolean;
  webViewLink?: string;
  appProperties?: Record<string, string>;
  capabilities?: {
    canAddChildren?: boolean;
    canEdit?: boolean;
    canShare?: boolean;
    canTrash?: boolean;
  };
}

export type GoogleDriveCabinetResolution =
  | {
      status: "ready";
      folder: GoogleDriveCabinetFolder;
      created: boolean;
      duplicateFolderIds: string[];
    }
  | {
      status: "ambiguous";
      folder: null;
      created: false;
      duplicateFolderIds: string[];
    }
  | {
      status: "unavailable";
      folder: null;
      created: false;
      duplicateFolderIds: string[];
    };

export interface GoogleDriveCabinetDependencies {
  listManagedFolders: () => Promise<GoogleDriveCabinetFolder[]>;
  createManagedFolder: () => Promise<GoogleDriveCabinetFolder>;
}

export type GoogleDriveCabinetLocationStatus =
  | "unavailable"
  | "resolving"
  | "ready"
  | "ambiguous"
  | "reconnect_required"
  | "error";

export interface GoogleDriveCabinetLocationSnapshot {
  status: GoogleDriveCabinetLocationStatus;
  folder: GoogleDriveCabinetFolder | null;
  created: boolean;
  duplicateFolderIds: string[];
  error: string | null;
}

type CabinetListener = (snapshot: GoogleDriveCabinetLocationSnapshot) => void;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; code?: unknown };
  const status = Number(record.status ?? record.code);
  return Number.isFinite(status) ? status : undefined;
}

function hasStripesCabinetMarkers(folder: GoogleDriveCabinetFolder) {
  return Object.entries(STRIPES_CABINET_APP_PROPERTIES).every(
    ([key, value]) => folder.appProperties?.[key] === value,
  );
}

export function isManagedMyDriveCabinetFolder(folder: GoogleDriveCabinetFolder) {
  if (!folder.id || folder.trashed || folder.driveId || folder.ownedByMe === false) return false;
  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) return false;
  return hasStripesCabinetMarkers(folder);
}

export type RecordedMyDriveCabinetFolderValidation =
  | "ready"
  | "wrong_folder"
  | "unavailable"
  | "not_a_folder"
  | "not_my_drive"
  | "not_managed"
  | "insufficient_permission";

export function validateRecordedMyDriveCabinetFolder(
  folder: GoogleDriveCabinetFolder,
  expectedFolderId: string,
): RecordedMyDriveCabinetFolderValidation {
  const expectedId = String(expectedFolderId || "").trim();
  if (!expectedId || folder.id !== expectedId) return "wrong_folder";
  if (folder.trashed) return "unavailable";
  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) return "not_a_folder";
  if (folder.driveId) return "not_my_drive";
  if (!hasStripesCabinetMarkers(folder)) return "not_managed";
  if (folder.capabilities?.canAddChildren !== true) return "insufficient_permission";
  return "ready";
}

export type RecordedMyDriveCabinetAuthorization =
  | { status: "ready"; folder: GoogleDriveCabinetFolder }
  | { status: "selection_cancelled" }
  | { status: "wrong_folder"; error: string }
  | { status: "invalid"; reason: "not_a_folder" | "not_my_drive" | "not_managed"; error: string }
  | { status: "insufficient_permission"; error: string }
  | { status: "reconnect_required"; error: string }
  | { status: "unavailable"; error: string };

export async function resolveRecordedMyDriveCabinetAuthorization(
  pickedFolder: { id: string; name?: string; mimeType?: string } | null,
  expectedFolderId: string,
  loadMetadata: (folderId: string) => Promise<GoogleDriveCabinetFolder>,
): Promise<RecordedMyDriveCabinetAuthorization> {
  const expectedId = String(expectedFolderId || "").trim();
  if (!expectedId) {
    return { status: "unavailable", error: "The saved My Drive File Cabinet location is invalid." };
  }
  if (!pickedFolder) return { status: "selection_cancelled" };
  if (String(pickedFolder.id || "").trim() !== expectedId) {
    return {
      status: "wrong_folder",
      error: "Choose the folder already recorded as this club's File Cabinet. The saved location was not changed.",
    };
  }

  let folder: GoogleDriveCabinetFolder;
  try {
    folder = await loadMetadata(expectedId);
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401) {
      return {
        status: "reconnect_required",
        error: errorMessage(error, "Reconnect Google Drive, then authorize the File Cabinet again."),
      };
    }
    if (status === 403) {
      return {
        status: "insufficient_permission",
        error: errorMessage(error, "Google did not allow this account to use the saved File Cabinet folder."),
      };
    }
    return {
      status: "unavailable",
      error: errorMessage(error, "The saved File Cabinet folder is unavailable to this Google account."),
    };
  }

  const validation = validateRecordedMyDriveCabinetFolder(folder, expectedId);
  if (validation === "ready") return { status: "ready", folder };
  if (validation === "wrong_folder") {
    return { status: "wrong_folder", error: "Google returned a different folder. The saved File Cabinet location was not changed." };
  }
  if (validation === "insufficient_permission") {
    return {
      status: "insufficient_permission",
      error: "This Google account cannot add content to the saved File Cabinet folder.",
    };
  }
  if (validation === "unavailable") {
    return { status: "unavailable", error: "The saved File Cabinet folder is in trash or unavailable." };
  }
  const invalidMessages = {
    not_a_folder: "The saved File Cabinet location is not a Google Drive folder.",
    not_my_drive: "The saved File Cabinet location is not the recorded My Drive folder.",
    not_managed: "The selected folder is not the Stripes-managed File Cabinet recorded for this club.",
  } as const;
  return { status: "invalid", reason: validation, error: invalidMessages[validation] };
}

export async function ensureManagedMyDriveCabinetFolder(
  dependencies: GoogleDriveCabinetDependencies,
  preferredFolderId?: string,
  requirePreferredFolder = false,
): Promise<GoogleDriveCabinetResolution> {
  const folders = (await dependencies.listManagedFolders())
    .filter(isManagedMyDriveCabinetFolder);
  const preferredId = String(preferredFolderId || "").trim();
  const preferredFolder = preferredId
    ? folders.find((folder) => folder.id === preferredId)
    : undefined;

  if (requirePreferredFolder && preferredId && !preferredFolder) {
    return {
      status: "unavailable",
      folder: null,
      created: false,
      duplicateFolderIds: folders.map((folder) => folder.id).sort(),
    };
  }

  if (preferredFolder || folders.length === 1) {
    const folder = preferredFolder || folders[0];
    return {
      status: "ready",
      folder,
      created: false,
      duplicateFolderIds: folders
        .filter((candidate) => candidate.id !== folder.id)
        .map((candidate) => candidate.id)
        .sort(),
    };
  }

  if (folders.length > 1) {
    return {
      status: "ambiguous",
      folder: null,
      created: false,
      duplicateFolderIds: folders.map((folder) => folder.id).sort(),
    };
  }

  const folder = await dependencies.createManagedFolder();
  if (!isManagedMyDriveCabinetFolder(folder)) {
    throw new Error("Google Drive did not return a usable Stripes Cabinet folder.");
  }
  return { status: "ready", folder, created: true, duplicateFolderIds: [] };
}

export class GoogleDriveCabinetLocationController {
  private readonly resolveLocation: (
    accessToken: string,
    preferredFolderId?: string,
    requirePreferredFolder?: boolean,
  ) => Promise<GoogleDriveCabinetResolution>;
  private readonly listeners = new Set<CabinetListener>();
  private operationId = 0;
  private inFlight: Promise<GoogleDriveCabinetLocationSnapshot> | null = null;
  private sessionPreferredFolderId = "";
  private snapshot: GoogleDriveCabinetLocationSnapshot = {
    status: "unavailable",
    folder: null,
    created: false,
    duplicateFolderIds: [],
    error: null,
  };

  constructor(resolveLocation: (
    accessToken: string,
    preferredFolderId?: string,
    requirePreferredFolder?: boolean,
  ) => Promise<GoogleDriveCabinetResolution>) {
    this.resolveLocation = resolveLocation;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: CabinetListener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async resolve(accessToken: string, preferredFolderId?: string, requirePreferredFolder = false) {
    const token = accessToken.trim();
    if (!token) {
      this.reset();
      return this.snapshot;
    }

    if (this.inFlight) return this.inFlight;

    const task = this.resolveOnce(
      token,
      String(preferredFolderId || "").trim() || this.sessionPreferredFolderId || undefined,
      requirePreferredFolder,
    );
    this.inFlight = task;
    const snapshot = await task;
    if (this.inFlight === task) this.inFlight = null;
    return snapshot;
  }

  private async resolveOnce(
    accessToken: string,
    preferredFolderId?: string,
    requirePreferredFolder = false,
  ) {
    const operationId = ++this.operationId;
    this.update({
      status: "resolving",
      folder: null,
      created: false,
      duplicateFolderIds: [],
      error: null,
    });

    try {
      const resolution = await this.resolveLocation(
        accessToken,
        preferredFolderId,
        requirePreferredFolder,
      );
      if (operationId !== this.operationId) return this.snapshot;
      if (resolution.status === "unavailable") {
        this.update({
          status: "unavailable",
          folder: null,
          created: false,
          duplicateFolderIds: resolution.duplicateFolderIds,
          error: "The configured My Drive Cabinet folder is unavailable. Choose a new Cabinet location to continue.",
        });
        return this.snapshot;
      }
      if (resolution.status === "ambiguous") {
        this.update({
          status: "ambiguous",
          folder: null,
          created: false,
          duplicateFolderIds: resolution.duplicateFolderIds,
          error: "Multiple managed Stripes Cabinet folders were found. Select the authoritative folder before continuing.",
        });
        return this.snapshot;
      }
      this.sessionPreferredFolderId = resolution.folder.id;
      this.update({
        status: "ready",
        folder: resolution.folder,
        created: resolution.created,
        duplicateFolderIds: resolution.duplicateFolderIds,
        error: null,
      });
    } catch (error) {
      if (operationId !== this.operationId) return this.snapshot;
      this.update({
        status: isGoogleDriveAuthorizationExpiredError(error) ? "reconnect_required" : "error",
        folder: null,
        created: false,
        duplicateFolderIds: [],
        error: errorMessage(error, "Stripes Cabinet is unavailable."),
      });
    }
    return this.snapshot;
  }

  reset() {
    ++this.operationId;
    this.inFlight = null;
    this.sessionPreferredFolderId = "";
    this.update({
      status: "unavailable",
      folder: null,
      created: false,
      duplicateFolderIds: [],
      error: null,
    });
  }

  private update(snapshot: GoogleDriveCabinetLocationSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
