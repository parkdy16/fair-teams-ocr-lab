import { getGoogleDriveConfig } from "@/lib/googleDriveConfig";

const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export interface GoogleDriveAuthResult {
  accessToken: string;
  expiresIn?: number;
  scope?: string;
}

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let identityScriptPromise: Promise<void> | null = null;

function loadScript(src: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Google Identity script.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Identity script."));
    document.head.appendChild(script);
  });
}

export function ensureGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!identityScriptPromise) {
    identityScriptPromise = loadScript(GOOGLE_IDENTITY_SCRIPT_URL).then(() => {
      if (!window.google?.accounts?.oauth2) {
        throw new Error("Google Identity Services did not initialize correctly.");
      }
    });
  }
  return identityScriptPromise;
}

export async function requestGoogleDriveAccessToken(prompt: "consent" | "" = "consent") {
  const config = getGoogleDriveConfig();
  if (!config.isConfigured) {
    throw new Error("Google Drive keys are missing. Check VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY in .env.local.");
  }

  await ensureGoogleIdentityScript();

  return new Promise<GoogleDriveAuthResult>((resolve, reject) => {
    const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: config.clientId,
      scope: config.scope,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresIn: response.expires_in,
          scope: response.scope,
        });
      },
      error_callback: () => reject(new Error("Google Drive sign-in was cancelled or blocked.")),
    });

    if (!tokenClient) {
      reject(new Error("Could not create Google Drive token client."));
      return;
    }

    tokenClient.requestAccessToken({ prompt });
  });
}
