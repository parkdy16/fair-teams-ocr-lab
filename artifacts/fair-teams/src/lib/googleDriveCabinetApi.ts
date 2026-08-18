import { GoogleApiHttpError } from "./googleApiError.ts";
import {
  ensureManagedMyDriveCabinetFolder,
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  STRIPES_CABINET_APP_PROPERTIES,
  STRIPES_CABINET_FOLDER_NAME,
  type GoogleDriveCabinetFolder,
} from "./googleDriveCabinet.ts";

const CABINET_FIELDS = [
  "id",
  "name",
  "mimeType",
  "createdTime",
  "modifiedTime",
  "trashed",
  "parents",
  "driveId",
  "ownedByMe",
  "webViewLink",
  "appProperties",
  "capabilities(canAddChildren,canEdit,canShare,canTrash)",
].join(",");

function parseGoogleApiError(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as { error?: { message?: string }; message?: string };
  return record.error?.message || record.message || fallback;
}

async function readGoogleApiError(response: Response, fallback: string) {
  try {
    return parseGoogleApiError(await response.json(), fallback);
  } catch {
    return response.statusText || fallback;
  }
}

function cabinetMarkerQuery() {
  return Object.entries(STRIPES_CABINET_APP_PROPERTIES)
    .map(([key, value]) => `appProperties has { key='${key}' and value='${value}' }`)
    .join(" and ");
}

export async function listManagedMyDriveCabinetFolders(accessToken: string) {
  const files: GoogleDriveCabinetFolder[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: [
        "trashed = false",
        `mimeType = '${GOOGLE_DRIVE_FOLDER_MIME_TYPE}'`,
        cabinetMarkerQuery(),
      ].join(" and "),
      spaces: "drive",
      corpora: "user",
      pageSize: "100",
      fields: `nextPageToken,files(${CABINET_FIELDS})`,
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const message = await readGoogleApiError(response, "Google Drive could not find the Stripes Cabinet folder.");
      if (response.status === 401) throw new GoogleApiHttpError(401, message);
      throw new Error(message);
    }

    const result = await response.json();
    if (Array.isArray(result?.files)) files.push(...result.files);
    pageToken = typeof result?.nextPageToken === "string" ? result.nextPageToken : "";
  } while (pageToken);

  return files;
}

export async function createManagedMyDriveCabinetFolder(accessToken: string) {
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: CABINET_FIELDS,
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      name: STRIPES_CABINET_FOLDER_NAME,
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      parents: ["root"],
      appProperties: STRIPES_CABINET_APP_PROPERTIES,
    }),
  });
  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Drive could not create the Stripes Cabinet folder.");
    if (response.status === 401) throw new GoogleApiHttpError(401, message);
    throw new Error(message);
  }
  return (await response.json()) as GoogleDriveCabinetFolder;
}

export function resolveManagedMyDriveCabinetFolder(
  accessToken: string,
  preferredFolderId?: string,
  requirePreferredFolder = false,
) {
  return ensureManagedMyDriveCabinetFolder({
    listManagedFolders: () => listManagedMyDriveCabinetFolders(accessToken),
    createManagedFolder: () => createManagedMyDriveCabinetFolder(accessToken),
  }, preferredFolderId, requirePreferredFolder);
}
