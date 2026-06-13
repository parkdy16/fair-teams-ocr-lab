import { getGoogleDriveConfig, FAIR_TEAMS_DRIVE_MIME_TYPE } from "@/lib/googleDriveConfig";

const GOOGLE_API_SCRIPT_URL = "https://apis.google.com/js/api.js";

export interface GoogleDrivePickedFile {
  id: string;
  name: string;
  mimeType?: string;
}

type PickerDocument = {
  id?: string;
  name?: string;
  mimeType?: string;
};

type PickerResponse = {
  action?: string;
  docs?: PickerDocument[];
};

declare global {
  interface Window {
    gapi?: {
      load: (library: string, callback: { callback: () => void; onerror?: () => void }) => void;
    };
  }
}

let pickerScriptPromise: Promise<void> | null = null;
let pickerApiPromise: Promise<void> | null = null;

function getPicker() {
  return (window.google as unknown as { picker?: any } | undefined)?.picker;
}

function loadScript(src: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      if (window.gapi) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Google Picker script.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Picker script."));
    document.head.appendChild(script);
  });
}

async function ensurePickerApi() {
  if (getPicker()) return;
  if (!pickerScriptPromise) {
    pickerScriptPromise = loadScript(GOOGLE_API_SCRIPT_URL);
  }
  await pickerScriptPromise;

  if (!pickerApiPromise) {
    pickerApiPromise = new Promise<void>((resolve, reject) => {
      if (!window.gapi) {
        reject(new Error("Google Picker script did not initialize correctly."));
        return;
      }
      window.gapi.load("picker", {
        callback: () => {
          if (getPicker()) resolve();
          else reject(new Error("Google Picker did not initialize correctly."));
        },
        onerror: () => reject(new Error("Could not initialize Google Picker.")),
      });
    });
  }

  return pickerApiPromise;
}

function createDocsView() {
  const picker = getPicker();
  if (!picker) throw new Error("Google Picker is not ready.");

  const view = new picker.DocsView(picker.ViewId.DOCS);
  view.setIncludeFolders(false);
  view.setSelectFolderEnabled(false);
  view.setMimeTypes([FAIR_TEAMS_DRIVE_MIME_TYPE, "text/plain"].join(","));
  return view;
}

export async function pickGoogleDriveBackupFile(accessToken: string): Promise<GoogleDrivePickedFile | null> {
  const config = getGoogleDriveConfig();
  if (!config.isConfigured) {
    throw new Error("Google Drive keys are missing. Check VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY in .env.local.");
  }

  await ensurePickerApi();
  const picker = getPicker();
  if (!picker) throw new Error("Google Picker is not ready.");

  return new Promise((resolve, reject) => {
    try {
      const view = createDocsView();
      const builder = new picker.PickerBuilder();
      builder.addView(view);
      builder.setDeveloperKey(config.apiKey);
      builder.setOAuthToken(accessToken);
      builder.setTitle("Open Fair Teams Drive backup");
      builder.setOrigin(window.location.origin);
      builder.setCallback((response: PickerResponse) => {
        if (response.action === picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (response.action !== picker.Action.PICKED) return;

        const picked = response.docs?.[0];
        if (!picked?.id) {
          reject(new Error("Google Picker did not return a file."));
          return;
        }
        resolve({
          id: picked.id,
          name: picked.name || "Fair Teams Drive backup.json",
          mimeType: picked.mimeType,
        });
      });
      builder.build().setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}
