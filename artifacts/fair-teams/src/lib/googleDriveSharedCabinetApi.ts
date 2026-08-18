import { GoogleApiHttpError } from "./googleApiError.ts";
import { pickGoogleSharedDriveCabinetFolder } from "./googleDrivePicker.ts";
import {
  resolveRecordedGoogleDriveSharedCabinetLocation,
  resolveGoogleDriveSharedCabinetSelection,
  type GoogleDriveSharedCabinetFolderMetadata,
} from "./googleDriveSharedCabinet.ts";

const SHARED_CABINET_FIELDS = [
  "id",
  "name",
  "mimeType",
  "driveId",
  "trashed",
  "webViewLink",
  "capabilities(canReadDrive,canListChildren,canAddChildren,canEdit)",
].join(",");

async function readGoogleError(response: Response) {
  try {
    const result = await response.json();
    return result?.error?.message || result?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function getGoogleDriveSharedCabinetFolderMetadata(
  accessToken: string,
  folderId: string,
): Promise<GoogleDriveSharedCabinetFolderMetadata> {
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: SHARED_CABINET_FIELDS,
  });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const message = await readGoogleError(response);
    throw new GoogleApiHttpError(response.status, message || "Google Drive could not inspect the selected folder.");
  }
  return (await response.json()) as GoogleDriveSharedCabinetFolderMetadata;
}

export async function selectGoogleDriveSharedCabinetLocation(accessToken: string) {
  const pickedFolder = await pickGoogleSharedDriveCabinetFolder(accessToken);
  return resolveGoogleDriveSharedCabinetSelection(
    pickedFolder,
    (folderId) => getGoogleDriveSharedCabinetFolderMetadata(accessToken, folderId),
  );
}

export function resolveGoogleDriveSharedCabinetLocation(
  accessToken: string,
  folderId: string,
  driveId: string,
) {
  return resolveRecordedGoogleDriveSharedCabinetLocation(
    folderId,
    driveId,
    (id) => getGoogleDriveSharedCabinetFolderMetadata(accessToken, id),
  );
}
