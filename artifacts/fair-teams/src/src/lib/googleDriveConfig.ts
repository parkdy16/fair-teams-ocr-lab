export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const FAIR_TEAMS_DRIVE_MIME_TYPE = "application/json";
export const FAIR_TEAMS_DRIVE_FILE_EXTENSION = ".json";
export const FAIR_TEAMS_DRIVE_BACKUP_VERSION = 1;

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  appId: string;
  scope: string;
  isConfigured: boolean;
}

function readEnvValue(key: "VITE_GOOGLE_CLIENT_ID" | "VITE_GOOGLE_API_KEY" | "VITE_GOOGLE_APP_ID") {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function deriveGoogleAppId(clientId: string) {
  const match = clientId.match(/^(\d+)-/);
  return match?.[1] || "";
}

export function getGoogleDriveConfig(): GoogleDriveConfig {
  const clientId = readEnvValue("VITE_GOOGLE_CLIENT_ID");
  const apiKey = readEnvValue("VITE_GOOGLE_API_KEY");
  const appId = readEnvValue("VITE_GOOGLE_APP_ID") || deriveGoogleAppId(clientId);

  return {
    clientId,
    apiKey,
    appId,
    scope: GOOGLE_DRIVE_FILE_SCOPE,
    isConfigured: Boolean(clientId && apiKey),
  };
}
