import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GoogleApiHttpError } from "./googleApiError.ts";
import { GOOGLE_DRIVE_FOLDER_MIME_TYPE } from "./googleDriveCabinet.ts";
import { GOOGLE_DRIVE_FILE_SCOPE } from "./googleDriveConfig.ts";
import { getGoogleDriveSharedCabinetFolderMetadata } from "./googleDriveSharedCabinetApi.ts";
import {
  resolveRecordedGoogleDriveSharedCabinetLocation,
  resolveGoogleDriveSharedCabinetSelection,
  type GoogleDriveSharedCabinetFolderMetadata,
} from "./googleDriveSharedCabinet.ts";

const pickedFolder = {
  id: "shared-folder-1",
  name: "Friday Football Cabinet",
  mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
};

function sharedFolder(
  overrides: Partial<GoogleDriveSharedCabinetFolderMetadata> = {},
): GoogleDriveSharedCabinetFolderMetadata {
  return {
    id: "shared-folder-1",
    name: "Friday Football Cabinet",
    mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    driveId: "shared-drive-1",
    trashed: false,
    capabilities: {
      canReadDrive: true,
      canListChildren: true,
      canAddChildren: true,
      canEdit: true,
    },
    ...overrides,
  };
}

test("normalizes a Picker-selected Shared Drive folder into the G2.5 location seam", async () => {
  const result = await resolveGoogleDriveSharedCabinetSelection(
    pickedFolder,
    async (folderId) => {
      assert.equal(folderId, "shared-folder-1");
      return sharedFolder();
    },
  );

  assert.deepEqual(result, {
    status: "ready",
    provider: "google_drive",
    backing: "shared_drive",
    folderId: "shared-folder-1",
    driveId: "shared-drive-1",
    displayName: "Friday Football Cabinet",
    capabilities: {
      canReadDrive: true,
      canListChildren: true,
      canAddChildren: true,
      canEdit: true,
    },
  });
});

test("actual driveId distinguishes Shared Drive from My Drive", async () => {
  const result = await resolveGoogleDriveSharedCabinetSelection(
    pickedFolder,
    async () => sharedFolder({ driveId: undefined }),
  );
  assert.equal(result.status, "invalid");
  assert.equal(result.status === "invalid" && result.reason, "not_a_shared_drive");
});

test("rejects a selected item whose live metadata is not a folder", async () => {
  const result = await resolveGoogleDriveSharedCabinetSelection(
    pickedFolder,
    async () => sharedFolder({ mimeType: "application/pdf" }),
  );
  assert.equal(result.status, "invalid");
  assert.equal(result.status === "invalid" && result.reason, "not_a_folder");
});

test("requires live read, list and add-child capabilities", async () => {
  for (const missing of ["canReadDrive", "canListChildren", "canAddChildren"] as const) {
    const result = await resolveGoogleDriveSharedCabinetSelection(
      pickedFolder,
      async () => sharedFolder({
        capabilities: {
          canReadDrive: true,
          canListChildren: true,
          canAddChildren: true,
          [missing]: false,
        },
      }),
    );
    assert.equal(result.status, "insufficient_permission", missing);
  }
});

test("maps 401, 403 and unavailable folder metadata truthfully", async () => {
  for (const [status, expected] of [
    [401, "reconnect_required"],
    [403, "insufficient_permission"],
    [404, "unavailable"],
  ] as const) {
    const result = await resolveGoogleDriveSharedCabinetSelection(
      pickedFolder,
      async () => { throw new GoogleApiHttpError(status, `HTTP ${status}`); },
    );
    assert.equal(result.status, expected);
  }
});

test("returns cancellation without calling Drive metadata", async () => {
  let metadataCalls = 0;
  const result = await resolveGoogleDriveSharedCabinetSelection(null, async () => {
    metadataCalls += 1;
    return sharedFolder();
  });
  assert.deepEqual(result, { status: "selection_cancelled" });
  assert.equal(metadataCalls, 0);
});

test("recorded Shared Drive location resolves by exact folder and drive IDs", async () => {
  const result = await resolveRecordedGoogleDriveSharedCabinetLocation(
    "shared-folder-1",
    "shared-drive-1",
    async (folderId) => {
      assert.equal(folderId, "shared-folder-1");
      return sharedFolder();
    },
  );
  assert.equal(result.status, "ready");
});

test("recorded Shared Drive location does not fall back when drive identity changes", async () => {
  const result = await resolveRecordedGoogleDriveSharedCabinetLocation(
    "shared-folder-1",
    "expected-drive",
    async () => sharedFolder({ driveId: "different-drive" }),
  );
  assert.equal(result.status, "unavailable");
});

test("recorded Shared Drive insufficient access remains truthful", async () => {
  const result = await resolveRecordedGoogleDriveSharedCabinetLocation(
    "shared-folder-1",
    "shared-drive-1",
    async () => sharedFolder({
      capabilities: {
        canReadDrive: true,
        canListChildren: true,
        canAddChildren: false,
        canEdit: false,
      },
    }),
  );
  assert.equal(result.status, "insufficient_permission");
});

test("selected-folder metadata request is ID-scoped and Shared-Drive-aware", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(sharedFolder()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await getGoogleDriveSharedCabinetFolderMetadata("memory-token", "folder with space");
    assert.equal(result.driveId, "shared-drive-1");
    assert.match(requestedUrl, /files\/folder%20with%20space\?/);
    assert.match(requestedUrl, /supportsAllDrives=true/);
    assert.match(requestedUrl, /driveId/);
    assert.match(requestedUrl, /capabilities/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shared Drive selection stays Picker-driven and within drive.file", () => {
  const pickerSource = fs.readFileSync(new URL("./googleDrivePicker.ts", import.meta.url), "utf8");
  const apiSource = fs.readFileSync(new URL("./googleDriveSharedCabinetApi.ts", import.meta.url), "utf8");
  assert.equal(GOOGLE_DRIVE_FILE_SCOPE, "https://www.googleapis.com/auth/drive.file");
  assert.match(pickerSource, /setEnableDrives\(true\)/);
  assert.match(pickerSource, /setIncludeFolders\(true\)/);
  assert.match(pickerSource, /setSelectFolderEnabled\(true\)/);
  assert.doesNotMatch(`${pickerSource}\n${apiSource}`, /\/drive\/v3\/drives|drives\.list/);
  assert.doesNotMatch(`${pickerSource}\n${apiSource}`, /drive\.readonly|drive\.metadata|auth\/drive["']/);
});

test("Shared Drive picker terminal settlement performs picker hide in both success and fail paths", () => {
  const pickerSource = fs.readFileSync(new URL("./googleDrivePicker.ts", import.meta.url), "utf8");
  const fnSource = pickerSource.substring(
    pickerSource.indexOf("export async function pickGoogleSharedDriveCabinetFolder"),
    pickerSource.length,
  );
  assert.match(fnSource, /const settle = \([^)]+\) => \{\s*if \(settled\) return;\s*settled = true;\s*window\.clearTimeout\(timeoutId\);\s*try \{\s*activePickerInstance\?\.setVisible\?\.\(false\);/s);
  assert.match(fnSource, /const fail = \([^)]+\) => \{\s*if \(settled\) return;\s*settled = true;\s*window\.clearTimeout\(timeoutId\);\s*try \{\s*activePickerInstance\?\.setVisible\?\.\(false\);/s);
});
