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

export function isManagedMyDriveCabinetFolder(folder: GoogleDriveCabinetFolder) {
  if (!folder.id || folder.trashed || folder.driveId || folder.ownedByMe === false) return false;
  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) return false;
  return Object.entries(STRIPES_CABINET_APP_PROPERTIES).every(
    ([key, value]) => folder.appProperties?.[key] === value,
  );
}

export async function ensureManagedMyDriveCabinetFolder(
  dependencies: GoogleDriveCabinetDependencies,
  preferredFolderId?: string,
): Promise<GoogleDriveCabinetResolution> {
  const folders = (await dependencies.listManagedFolders())
    .filter(isManagedMyDriveCabinetFolder);
  const preferredId = String(preferredFolderId || "").trim();
  const preferredFolder = preferredId
    ? folders.find((folder) => folder.id === preferredId)
    : undefined;

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

  async resolve(accessToken: string, preferredFolderId?: string) {
    const token = accessToken.trim();
    if (!token) {
      this.reset();
      return this.snapshot;
    }

    if (this.inFlight) return this.inFlight;

    const task = this.resolveOnce(
      token,
      String(preferredFolderId || "").trim() || this.sessionPreferredFolderId || undefined,
    );
    this.inFlight = task;
    const snapshot = await task;
    if (this.inFlight === task) this.inFlight = null;
    return snapshot;
  }

  private async resolveOnce(accessToken: string, preferredFolderId?: string) {
    const operationId = ++this.operationId;
    this.update({
      status: "resolving",
      folder: null,
      created: false,
      duplicateFolderIds: [],
      error: null,
    });

    try {
      const resolution = await this.resolveLocation(accessToken, preferredFolderId);
      if (operationId !== this.operationId) return this.snapshot;
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
