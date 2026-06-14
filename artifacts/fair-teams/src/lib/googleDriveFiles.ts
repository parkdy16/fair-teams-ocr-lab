import { FAIR_TEAMS_DRIVE_MIME_TYPE } from "@/lib/googleDriveConfig";

export interface GoogleDriveUserSummary {
  displayName?: string;
  emailAddress?: string;
  me?: boolean;
}

export interface GoogleDriveFileResult {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
  ownedByMe?: boolean;
  shared?: boolean;
  sharingUser?: GoogleDriveUserSummary;
}

export interface GoogleDriveBackupFileGroups {
  mine: GoogleDriveFileResult[];
  shared: GoogleDriveFileResult[];
}

export interface GoogleDrivePermissionDetail {
  inherited?: boolean;
  inheritedFrom?: string;
  permissionType?: string;
  role?: string;
}

export interface GoogleDrivePermissionResult {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  displayName?: string;
  deleted?: boolean;
  permissionDetails?: GoogleDrivePermissionDetail[];
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

async function fetchGoogleDriveBackupList(accessToken: string, query: string): Promise<GoogleDriveFileResult[]> {
  const params = new URLSearchParams({
    q: query,
    pageSize: "30",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,webViewLink,modifiedTime,ownedByMe,shared,sharingUser(displayName,emailAddress,me))",
    spaces: "drive",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await readDriveError(response);
    if (response.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    throw new Error(message);
  }

  const result = await response.json();
  return Array.isArray(result?.files) ? (result.files as GoogleDriveFileResult[]) : [];
}

function sortDriveFilesByModifiedTime(files: GoogleDriveFileResult[]) {
  return [...files].sort((a, b) => {
    const aTime = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
    const bTime = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
    return bTime - aTime;
  });
}

export async function listGoogleDriveBackupFileGroups(accessToken: string): Promise<GoogleDriveBackupFileGroups> {
  const backupFileQuery = [
    "trashed = false",
    `mimeType = '${FAIR_TEAMS_DRIVE_MIME_TYPE}'`,
    "(name contains 'Fair Teams' or appProperties has { key='fairTeamsBackup' and value='true' })",
  ].join(" and ");

  const sharedBackupFileQuery = [
    "trashed = false",
    "sharedWithMe = true",
    `mimeType = '${FAIR_TEAMS_DRIVE_MIME_TYPE}'`,
    "name contains 'Fair Teams'",
  ].join(" and ");

  const [accessibleFiles, sharedFiles] = await Promise.all([
    fetchGoogleDriveBackupList(accessToken, backupFileQuery),
    fetchGoogleDriveBackupList(accessToken, sharedBackupFileQuery),
  ]);

  const sharedIds = new Set(sharedFiles.map((file) => file.id).filter(Boolean));
  const byId = new Map<string, GoogleDriveFileResult>();

  [...accessibleFiles, ...sharedFiles].forEach((file) => {
    if (!file.id) return;
    const previous = byId.get(file.id);
    byId.set(file.id, {
      ...previous,
      ...file,
      shared: Boolean(file.shared || previous?.shared || sharedIds.has(file.id)),
    });
  });

  const mine: GoogleDriveFileResult[] = [];
  const shared: GoogleDriveFileResult[] = [];

  byId.forEach((file) => {
    if (file.ownedByMe === false || sharedIds.has(file.id)) {
      shared.push(file);
    } else {
      mine.push(file);
    }
  });

  return {
    mine: sortDriveFilesByModifiedTime(mine),
    shared: sortDriveFilesByModifiedTime(shared),
  };
}

export async function listGoogleDriveBackupFiles(accessToken: string): Promise<GoogleDriveFileResult[]> {
  const groups = await listGoogleDriveBackupFileGroups(accessToken);
  return sortDriveFilesByModifiedTime([...groups.mine, ...groups.shared]);
}

export async function updateGoogleDriveJsonFile(
  accessToken: string,
  fileId: string,
  jsonText: string,
): Promise<GoogleDriveFileResult> {
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,webViewLink,modifiedTime`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `${FAIR_TEAMS_DRIVE_MIME_TYPE}; charset=UTF-8`,
      },
      body: jsonText,
    },
  );

  if (!response.ok) {
    const message = await readDriveError(response);
    if (response.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    if (response.status === 403) {
      throw new Error("Fair Teams cannot update this Drive file. Open the file from Drive again, or ask the file owner for edit access.");
    }
    throw new Error(message);
  }

  const result = await response.json();
  if (!result?.id || !result?.name) {
    throw new Error("Google Drive updated the file but did not return file details.");
  }

  return result as GoogleDriveFileResult;
}

export async function shareGoogleDriveFileWithEditor(
  accessToken: string,
  fileId: string,
  emailAddress: string,
): Promise<GoogleDrivePermissionResult> {
  const params = new URLSearchParams({
    sendNotificationEmail: "true",
    supportsAllDrives: "true",
    fields: "id,type,emailAddress,displayName,role",
  });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress,
      }),
    },
  );

  if (!response.ok) {
    const message = await readDriveError(response);
    if (response.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    if (response.status === 403) {
      throw new Error("Fair Teams cannot share this Drive file. Open the file from Drive again, or make sure you own it or have permission to share it.");
    }
    throw new Error(message);
  }

  const result = await response.json();
  if (!result?.id) {
    throw new Error("Google Drive shared the file but did not return permission details.");
  }
  return result as GoogleDrivePermissionResult;
}

export async function listGoogleDriveFilePermissions(
  accessToken: string,
  fileId: string,
): Promise<GoogleDrivePermissionResult[]> {
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "permissions(id,type,emailAddress,displayName,role,deleted,permissionDetails(inherited,inheritedFrom,permissionType,role))",
  });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const message = await readDriveError(response);
    if (response.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    if (response.status === 403) {
      throw new Error("Fair Teams cannot read sharing access for this Drive file. Open the file from Drive again, or check your sharing permission.");
    }
    throw new Error(message);
  }

  const result = await response.json();
  return Array.isArray(result?.permissions) ? (result.permissions as GoogleDrivePermissionResult[]) : [];
}

export async function deleteGoogleDriveFilePermission(
  accessToken: string,
  fileId: string,
  permissionId: string,
): Promise<void> {
  const params = new URLSearchParams({ supportsAllDrives: "true" });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?${params.toString()}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const message = await readDriveError(response);
    if (response.status === 401) {
      throw new Error("Google Drive connection expired. Disconnect and connect Google Drive again, then retry.");
    }
    if (response.status === 403) {
      throw new Error("Fair Teams cannot remove this access. It may belong to the file owner or come from a shared Drive folder.");
    }
    throw new Error(message);
  }
}

