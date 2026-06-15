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


function applyPickerAppId(builder: any, appId: string) {
  if (!appId) {
    throw new Error("Google Drive app ID is missing. Check VITE_GOOGLE_CLIENT_ID or add VITE_GOOGLE_APP_ID.");
  }
  if (typeof builder.setAppId === "function") {
    builder.setAppId(appId);
  }
}

function createDriveBackupDocsView() {
  const picker = getPicker();
  if (!picker) throw new Error("Google Picker is not ready.");

  const view = new picker.DocsView(picker.ViewId.DOCS);
  view.setIncludeFolders(false);
  view.setSelectFolderEnabled(false);
  // Drive backup files created by Fair Teams are saved as application/json.
  // Keep the picker focused on JSON files instead of broad text/document files.
  view.setMimeTypes(FAIR_TEAMS_DRIVE_MIME_TYPE);
  if (typeof view.setQuery === "function") {
    view.setQuery("Fair Teams");
  }

  // JSON backup files do not benefit from thumbnail/grid browsing.
  if (picker.DocsViewMode?.LIST) {
    view.setMode(picker.DocsViewMode.LIST);
  }

  return view;
}

const FAIR_TEAMS_GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

function createGoogleSheetRosterDocsView() {
  const picker = getPicker();
  if (!picker) throw new Error("Google Picker is not ready.");

  // Use the broad Docs view with a spreadsheet MIME filter. This behaves more
  // like Google Drive's normal file-open dialog and is more reliable for files
  // shared from another Google account than the dedicated SPREADSHEETS view.
  const view = new picker.DocsView(picker.ViewId.DOCS);
  view.setIncludeFolders(true);
  view.setSelectFolderEnabled(false);
  view.setMimeTypes(FAIR_TEAMS_GOOGLE_SHEET_MIME_TYPE);
  if (picker.DocsViewMode?.LIST) {
    view.setMode(picker.DocsViewMode.LIST);
  }

  return view;
}

export async function warmUpGoogleDrivePicker() {
  try {
    await ensurePickerApi();
  } catch {
    // Picker is optional until the user explicitly opens a Drive file.
  }
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
    let settled = false;
    const settle = (pickedFile: GoogleDrivePickedFile | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(pickedFile);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(error);
    };

    const timeoutId = window.setTimeout(() => {
      fail(
        new Error(
          "Google Drive picker did not open. Try again from Chrome and make sure pop-ups are allowed for Fair Teams.",
        ),
      );
    }, 25000);

    try {
      const view = createDriveBackupDocsView();
      const builder = new picker.PickerBuilder();
      builder.addView(view);
      builder.setDeveloperKey(config.apiKey);
      applyPickerAppId(builder, config.appId);
      builder.setOAuthToken(accessToken);
      builder.setTitle("Open Fair Teams Drive backup");
      builder.setOrigin(window.location.origin);
      builder.setCallback((response: PickerResponse) => {
        if (response.action === picker.Action.CANCEL) {
          settle(null);
          return;
        }
        if (response.action !== picker.Action.PICKED) return;

        const picked = response.docs?.[0];
        if (!picked?.id) {
          fail(new Error("Google Picker did not return a file."));
          return;
        }
        const name = picked.name || "Fair Teams Drive backup.json";
        const mimeType = picked.mimeType || "";
        if (!name.toLowerCase().endsWith(".json") && mimeType !== FAIR_TEAMS_DRIVE_MIME_TYPE) {
          fail(new Error("Please choose a Fair Teams .json backup file."));
          return;
        }
        settle({
          id: picked.id,
          name,
          mimeType,
        });
      });
      const pickerInstance = builder.build();
      pickerInstance.setVisible(true);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Could not open Google Drive picker."));
    }
  });
}


export async function pickGoogleSheetRosterFile(accessToken: string): Promise<GoogleDrivePickedFile | null> {
  const config = getGoogleDriveConfig();
  if (!config.isConfigured) {
    throw new Error("Google Drive keys are missing. Check VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY in .env.local.");
  }

  await ensurePickerApi();
  const picker = getPicker();
  if (!picker) throw new Error("Google Picker is not ready.");

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (pickedFile: GoogleDrivePickedFile | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(pickedFile);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(error);
    };

    const timeoutId = window.setTimeout(() => {
      fail(
        new Error(
          "Google Drive file picker did not respond. Try again from Chrome, allow pop-ups, and make sure the picker is using the Google account that received the shared roster.",
        ),
      );
    }, 25000);

    try {
      const view = createGoogleSheetRosterDocsView();
      const builder = new picker.PickerBuilder();
      builder.addView(view);
      builder.setDeveloperKey(config.apiKey);
      applyPickerAppId(builder, config.appId);
      builder.setOAuthToken(accessToken);
      builder.setTitle("Open shared Fair Teams roster");
      builder.setOrigin(window.location.origin);
      builder.setCallback((response: PickerResponse) => {
        if (response.action === picker.Action.CANCEL) {
          settle(null);
          return;
        }
        if (response.action !== picker.Action.PICKED) return;

        const picked = response.docs?.[0];
        if (!picked?.id) {
          fail(new Error("Google Picker did not return a file."));
          return;
        }
        const name = picked.name || "Fair Teams shared roster";
        const mimeType = picked.mimeType || "";
        if (mimeType && mimeType !== FAIR_TEAMS_GOOGLE_SHEET_MIME_TYPE) {
          fail(new Error("Please choose a Fair Teams shared roster Google Sheet."));
          return;
        }
        if (!name.toLowerCase().includes("fair teams")) {
          fail(new Error("Please choose a Fair Teams shared roster file. The file name should include Fair Teams."));
          return;
        }
        settle({
          id: picked.id,
          name,
          mimeType,
        });
      });
      const pickerInstance = builder.build();
      pickerInstance.setVisible(true);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Could not open Google Drive picker."));
    }
  });
}
