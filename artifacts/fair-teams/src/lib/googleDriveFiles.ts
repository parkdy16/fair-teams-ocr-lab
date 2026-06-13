import { FAIR_TEAMS_DRIVE_MIME_TYPE } from "@/lib/googleDriveConfig";

export interface GoogleDriveFileResult {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

function parseGoogleDriveError(value: unknown) {
  if (!value || typeof value !== "object") return "Google Drive request failed.";
  const record = value as { error?: { message?: string }; message?: string };
  return record.error?.message || record.message || "Google Drive request failed.";
}

async function readDriveError(response: Response) {
  try {
    return parseGoogleDriveError(await response.json());
  } catch {
    return response.statusText || "Google Drive request failed.";
  }
}

export async function createGoogleDriveJsonFile(
  accessToken: string,
  fileName: string,
  jsonText: string,
): Promise<GoogleDriveFileResult> {
  const boundary = `fair_teams_drive_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: fileName,
    mimeType: FAIR_TEAMS_DRIVE_MIME_TYPE,
    appProperties: {
      fairTeamsBackup: "true",
      fairTeamsBackupType: "google-drive-text-backup",
    },
  };

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${FAIR_TEAMS_DRIVE_MIME_TYPE}; charset=UTF-8`,
    "",
    jsonText,
    `--${boundary}--`,
  ].join("\r\n");

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) {
    const message = await readDriveError(response);
    if (response.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    throw new Error(message);
  }

  const result = await response.json();
  if (!result?.id || !result?.name) {
    throw new Error("Google Drive saved the file but did not return file details.");
  }

  return result as GoogleDriveFileResult;
}

export async function readGoogleDriveJsonFile(accessToken: string, fileId: string): Promise<{ file: GoogleDriveFileResult; text: string }> {
  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,webViewLink,modifiedTime`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!metadataResponse.ok) {
    const message = await readDriveError(metadataResponse);
    if (metadataResponse.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    throw new Error(message);
  }

  const file = (await metadataResponse.json()) as GoogleDriveFileResult;
  if (!file?.id || !file?.name) {
    throw new Error("Google Drive did not return file details.");
  }

  const contentResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!contentResponse.ok) {
    const message = await readDriveError(contentResponse);
    if (contentResponse.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    throw new Error(message);
  }

  return { file, text: await contentResponse.text() };
}
