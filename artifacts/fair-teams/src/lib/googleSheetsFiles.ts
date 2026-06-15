import type { RoomRoster } from "@/lib/localRoster";
import {
  FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB,
  FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB,
  googleSheetAccessLabelsToCellValue,
  googleSheetRosterTitle,
  googleSheetValuesToRoster,
  rosterToGoogleSheetValues,
  type GoogleSheetValues,
} from "@/lib/googleSheetsRoster";
import {
  shareGoogleDriveFileWithEditor,
  type GoogleDriveFileResult,
  type GoogleDrivePermissionResult,
} from "@/lib/googleDriveFiles";

export const FAIR_TEAMS_GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

const MISSING_SHARED_ROSTER_MESSAGE = "Shared roster file not found. It may have been deleted, moved to trash, or not shared with this Google account.";

function throwGoogleSheetFileError(status: number, message: string, fallback403: string) {
  if (status === 401) throw new Error("Google connection expired. Sign in with Google again, then retry.");
  if (status === 403) throw new Error(fallback403);
  if (status === 404) throw new Error(MISSING_SHARED_ROSTER_MESSAGE);
  throw new Error(message);
}

export interface GoogleSheetRosterFile extends GoogleDriveFileResult {
  mimeType?: string;
}

type GoogleSheetProperties = {
  sheetId?: number;
  title?: string;
};

type GoogleSpreadsheetSummary = {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: { properties?: GoogleSheetProperties }[];
};

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

async function getGoogleDriveFileMetadata(accessToken: string, fileId: string): Promise<GoogleSheetRosterFile> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,webViewLink,modifiedTime,ownedByMe,shared,sharingUser(displayName,emailAddress,me),owners(displayName,emailAddress,me)",
    supportsAllDrives: "true",
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Drive could not read this shared roster file.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot open this shared roster. Ask the owner for access or open it again from Shared Roster.",
    );
  }

  const result = await response.json();
  if (!result?.id || !result?.name) throw new Error("Google Drive did not return shared roster details.");
  return result as GoogleSheetRosterFile;
}


export function getGoogleSheetRosterFileMetadata(accessToken: string, spreadsheetId: string): Promise<GoogleSheetRosterFile> {
  return getGoogleDriveFileMetadata(accessToken, spreadsheetId);
}

async function createEmptyGoogleSpreadsheet(accessToken: string, title: string): Promise<GoogleSheetRosterFile> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink,modifiedTime",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        name: title,
        mimeType: FAIR_TEAMS_GOOGLE_SHEET_MIME_TYPE,
        appProperties: {
          fairTeamsSharedRoster: "true",
          fairTeamsSharedRosterType: "google-sheets-shared-roster",
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Drive could not create the shared roster sheet.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot create this shared roster. Check Google Drive access, then retry.",
    );
  }

  const result = await response.json();
  if (!result?.id || !result?.name) throw new Error("Google Drive created the sheet but did not return file details.");
  return result as GoogleSheetRosterFile;
}

async function renameGoogleSheetRosterFile(accessToken: string, spreadsheetId: string, title: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ name: title }),
    },
  );

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Drive could not rename this shared roster file.");
    console.warn(message);
  }
}

async function getSpreadsheetSummary(accessToken: string, spreadsheetId: string): Promise<GoogleSpreadsheetSummary> {
  const params = new URLSearchParams({
    fields: "spreadsheetId,properties(title),sheets(properties(sheetId,title))",
  });
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Sheets could not open this shared roster.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot edit this shared roster. Ask the owner for editor access.",
    );
  }

  return (await response.json()) as GoogleSpreadsheetSummary;
}

async function batchUpdateSpreadsheet(accessToken: string, spreadsheetId: string, requests: unknown[]) {
  if (requests.length === 0) return;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Sheets could not prepare this shared roster.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot edit this shared roster. Ask the owner for editor access.",
    );
  }
}

async function ensureFairTeamsSheetStructure(accessToken: string, spreadsheetId: string) {
  const summary = await getSpreadsheetSummary(accessToken, spreadsheetId);
  const sheets = summary.sheets || [];
  const byTitle = new Map<string, GoogleSheetProperties>();
  sheets.forEach((sheet) => {
    const props = sheet.properties;
    if (props?.title) byTitle.set(props.title, props);
  });

  const requests: unknown[] = [];
  const hasMetadata = byTitle.has(FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB);
  const hasPlayers = byTitle.has(FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB);

  if (!hasMetadata) {
    const firstSheet = sheets[0]?.properties;
    if (firstSheet?.sheetId !== undefined && !byTitle.has(FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB)) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: firstSheet.sheetId, title: FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB },
          fields: "title",
        },
      });
    } else {
      requests.push({ addSheet: { properties: { title: FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB } } });
    }
  }

  if (!hasPlayers) {
    requests.push({ addSheet: { properties: { title: FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB } } });
  }

  await batchUpdateSpreadsheet(accessToken, spreadsheetId, requests);
}

async function clearGoogleSheetValues(accessToken: string, spreadsheetId: string) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchClear`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      ranges: [
        `'${FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB}'!A:Z`,
        `'${FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB}'!A:AZ`,
      ],
    }),
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Sheets could not clear old roster data.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot edit this shared roster. Ask the owner for editor access.",
    );
  }
}

async function writeGoogleSheetValues(
  accessToken: string,
  spreadsheetId: string,
  metadataValues: GoogleSheetValues,
  playerValues: GoogleSheetValues,
) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [
        { range: `'${FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB}'!A1`, values: metadataValues },
        { range: `'${FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB}'!A1`, values: playerValues },
      ],
    }),
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Sheets could not save this shared roster.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot edit this shared roster. Ask the owner for editor access.",
    );
  }
}

async function readGoogleSheetValues(accessToken: string, spreadsheetId: string) {
  const ranges = [
    `'${FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB}'!A:B`,
    `'${FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB}'!A:AZ`,
  ];
  const params = new URLSearchParams({
    majorDimension: "ROWS",
    ranges: ranges[0],
  });
  params.append("ranges", ranges[1]);

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Sheets could not read this shared roster.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot read this shared roster. Ask the owner for access.",
    );
  }

  const result = await response.json();
  const valueRanges = Array.isArray(result?.valueRanges) ? result.valueRanges : [];
  return {
    metadataValues: (valueRanges[0]?.values || []) as GoogleSheetValues,
    playerValues: (valueRanges[1]?.values || []) as GoogleSheetValues,
  };
}

export async function createGoogleSheetRoster(accessToken: string, roster: RoomRoster): Promise<GoogleSheetRosterFile> {
  const file = await createEmptyGoogleSpreadsheet(accessToken, googleSheetRosterTitle(roster));
  await updateGoogleSheetRoster(accessToken, file.id, roster);
  return getGoogleDriveFileMetadata(accessToken, file.id);
}

export async function updateGoogleSheetRoster(
  accessToken: string,
  spreadsheetId: string,
  roster: RoomRoster,
): Promise<GoogleSheetRosterFile> {
  await ensureFairTeamsSheetStructure(accessToken, spreadsheetId);
  const { metadataValues, playerValues } = rosterToGoogleSheetValues(roster);
  await clearGoogleSheetValues(accessToken, spreadsheetId);
  await writeGoogleSheetValues(accessToken, spreadsheetId, metadataValues, playerValues);
  await renameGoogleSheetRosterFile(accessToken, spreadsheetId, googleSheetRosterTitle(roster));
  return getGoogleDriveFileMetadata(accessToken, spreadsheetId);
}


export async function updateGoogleSheetRosterAccessLabels(
  accessToken: string,
  spreadsheetId: string,
  accessLabels: Record<string, string> | undefined,
): Promise<GoogleSheetRosterFile> {
  await ensureFairTeamsSheetStructure(accessToken, spreadsheetId);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB}'!A12:B13`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        values: [
          ["accessLabels", googleSheetAccessLabelsToCellValue(accessLabels)],
          ["notes", "This sheet is managed by Fair Teams. Manual editing is not recommended."],
        ],
      }),
    },
  );

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Sheets could not save the sharing names.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot update sharing names. Ask the owner for editor access.",
    );
  }

  return getGoogleDriveFileMetadata(accessToken, spreadsheetId);
}

export async function readGoogleSheetRoster(accessToken: string, spreadsheetId: string): Promise<{ file: GoogleSheetRosterFile; roster: RoomRoster }> {
  const [file, values] = await Promise.all([
    getGoogleDriveFileMetadata(accessToken, spreadsheetId),
    readGoogleSheetValues(accessToken, spreadsheetId),
  ]);

  return {
    file,
    roster: googleSheetValuesToRoster(values.metadataValues, values.playerValues, {
      spreadsheetId: file.id,
      spreadsheetName: file.name,
      webViewLink: file.webViewLink,
      modifiedTime: file.modifiedTime,
    }),
  };
}

export async function listGoogleSheetRosterFiles(accessToken: string): Promise<GoogleSheetRosterFile[]> {
  const query = [
    "trashed = false",
    `mimeType = '${FAIR_TEAMS_GOOGLE_SHEET_MIME_TYPE}'`,
    "(name contains 'Fair Teams Shared Roster' or name contains ' - Fair Teams' or appProperties has { key='fairTeamsSharedRoster' and value='true' })",
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    pageSize: "30",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,webViewLink,modifiedTime,ownedByMe,shared,sharingUser(displayName,emailAddress,me),owners(displayName,emailAddress,me))",
    spaces: "drive",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Drive could not list shared rosters.");
    if (response.status === 401) throw new Error("Google connection expired. Reconnect Google Drive, then retry.");
    throw new Error(message);
  }

  const result = await response.json();
  return Array.isArray(result?.files) ? (result.files as GoogleSheetRosterFile[]) : [];
}

export function shareGoogleSheetRosterWithEditor(
  accessToken: string,
  spreadsheetId: string,
  emailAddress: string,
): Promise<GoogleDrivePermissionResult> {
  return shareGoogleDriveFileWithEditor(accessToken, spreadsheetId, emailAddress);
}

export async function trashGoogleSheetRoster(
  accessToken: string,
  spreadsheetId: string,
): Promise<GoogleSheetRosterFile> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,webViewLink,modifiedTime,ownedByMe,trashed",
    supportsAllDrives: "true",
  });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?${params.toString()}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ trashed: true }),
    },
  );

  if (!response.ok) {
    const message = await readGoogleApiError(response, "Google Drive could not delete this shared roster.");
    throwGoogleSheetFileError(
      response.status,
      message,
      "Fair Teams cannot delete this shared roster. Only the owner can delete it.",
    );
  }

  const result = await response.json();
  if (!result?.id || !result?.name) throw new Error("Google Drive moved the shared roster to trash but did not return file details.");
  return result as GoogleSheetRosterFile;
}
