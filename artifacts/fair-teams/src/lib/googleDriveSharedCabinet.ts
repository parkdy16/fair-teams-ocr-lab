import { GOOGLE_DRIVE_FOLDER_MIME_TYPE } from "./googleDriveCabinet.ts";
import type { GoogleDrivePickedFile } from "./googleDrivePicker.ts";

export interface GoogleDriveSharedCabinetFolderMetadata {
  id: string;
  name: string;
  mimeType: string;
  driveId?: string;
  trashed?: boolean;
  webViewLink?: string;
  capabilities?: {
    canReadDrive?: boolean;
    canListChildren?: boolean;
    canAddChildren?: boolean;
    canEdit?: boolean;
  };
}

export type GoogleDriveSharedCabinetSelection =
  | {
      status: "ready";
      provider: "google_drive";
      backing: "shared_drive";
      folderId: string;
      driveId: string;
      displayName: string;
      webViewLink?: string;
      capabilities: {
        canReadDrive: true;
        canListChildren: true;
        canAddChildren: true;
        canEdit: boolean;
      };
    }
  | { status: "selection_cancelled" }
  | { status: "invalid"; reason: "not_a_folder" | "not_a_shared_drive"; error: string }
  | { status: "insufficient_permission"; error: string }
  | { status: "reconnect_required"; error: string }
  | { status: "unavailable"; error: string };

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; code?: unknown };
  const status = Number(record.status ?? record.code);
  return Number.isFinite(status) ? status : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function resolveGoogleDriveSharedCabinetSelection(
  pickedFolder: GoogleDrivePickedFile | null,
  loadMetadata: (folderId: string) => Promise<GoogleDriveSharedCabinetFolderMetadata>,
): Promise<GoogleDriveSharedCabinetSelection> {
  if (!pickedFolder) return { status: "selection_cancelled" };

  let folder: GoogleDriveSharedCabinetFolderMetadata;
  try {
    folder = await loadMetadata(pickedFolder.id);
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401) {
      return { status: "reconnect_required", error: errorMessage(error, "Reconnect Google Drive, then choose the folder again.") };
    }
    if (status === 403) {
      return { status: "insufficient_permission", error: errorMessage(error, "Google did not allow Stripes to inspect this folder.") };
    }
    return { status: "unavailable", error: errorMessage(error, "The selected Google Drive folder is unavailable.") };
  }

  if (folder.trashed) {
    return { status: "unavailable", error: "The selected Google Drive folder is in trash or unavailable." };
  }
  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    return { status: "invalid", reason: "not_a_folder", error: "Choose a folder, not a file." };
  }
  if (!folder.driveId) {
    return {
      status: "invalid",
      reason: "not_a_shared_drive",
      error: "Choose a folder inside a Shared Drive. My Drive remains available as the default Cabinet backing.",
    };
  }

  const capabilities = folder.capabilities;
  if (
    capabilities?.canReadDrive !== true
    || capabilities.canListChildren !== true
    || capabilities.canAddChildren !== true
  ) {
    return {
      status: "insufficient_permission",
      error: "Your Google account cannot read and add Cabinet content in this Shared Drive folder.",
    };
  }

  return {
    status: "ready",
    provider: "google_drive",
    backing: "shared_drive",
    folderId: folder.id,
    driveId: folder.driveId,
    displayName: folder.name || pickedFolder.name || "Shared Drive folder",
    ...(folder.webViewLink ? { webViewLink: folder.webViewLink } : {}),
    capabilities: {
      canReadDrive: true,
      canListChildren: true,
      canAddChildren: true,
      canEdit: capabilities.canEdit === true,
    },
  };
}
