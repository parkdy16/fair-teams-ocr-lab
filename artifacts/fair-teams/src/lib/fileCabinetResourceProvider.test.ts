import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GoogleApiHttpError } from "./googleApiError.ts";
import { GOOGLE_DRIVE_FILE_SCOPE } from "./googleDriveConfig.ts";
import { getGoogleDriveFileCabinetResourceMetadata } from "./googleDriveFiles.ts";
import {
  resolveFileCabinetResourceProvider,
  selectFileCabinetGoogleDriveResource,
  type FileCabinetResourceProviderDependencies,
} from "./fileCabinetResourceProvider.ts";
import type { FileCabinetResource } from "./fileCabinetResource.ts";

function resource(overrides: Partial<FileCabinetResource> = {}): FileCabinetResource {
  return {
    schemaVersion: 1,
    resourceId: "resource-1",
    provider: "google_drive",
    resourceKind: "file",
    providerResourceId: "drive-file-1",
    externalUrl: null,
    displayName: "Budget.pdf",
    mimeType: "application/pdf",
    origin: { kind: "cabinet" },
    contexts: [],
    createdByUid: "organizer-a",
    createdAt: 1_000,
    updatedByUid: "organizer-a",
    updatedAt: 1_000,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<FileCabinetResourceProviderDependencies> = {},
): FileCabinetResourceProviderDependencies {
  return {
    pickGoogleDriveResource: async () => ({
      id: "drive-file-1",
      name: "Picker snapshot",
      mimeType: "application/pdf",
    }),
    loadGoogleDriveMetadata: async () => ({
      id: "drive-file-1",
      name: "Live Budget.pdf",
      mimeType: "application/pdf",
      webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
      trashed: false,
    }),
    ...overrides,
  };
}

test("external links resolve locally without requesting a provider", async () => {
  let providerCalls = 0;
  const result = await resolveFileCabinetResourceProvider(resource({
    provider: "external_link",
    resourceKind: "link",
    providerResourceId: null,
    externalUrl: "https://example.com/club-plan",
    displayName: "Club plan",
    mimeType: null,
  }), "", dependencies({
    loadGoogleDriveMetadata: async () => {
      providerCalls += 1;
      throw new Error("must not load Drive");
    },
  }));

  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" && result.openUrl, "https://example.com/club-plan");
  assert.equal(providerCalls, 0);
});

test("Drive resolution re-reads the exact durable ID and uses live presentation metadata", async () => {
  const requestedIds: string[] = [];
  const result = await resolveFileCabinetResourceProvider(
    resource(),
    "memory-only-token",
    dependencies({
      loadGoogleDriveMetadata: async (_token, id) => {
        requestedIds.push(id);
        return {
          id,
          name: "Renamed live budget.pdf",
          mimeType: "application/pdf",
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
          trashed: false,
        };
      },
    }),
  );

  assert.deepEqual(requestedIds, ["drive-file-1"]);
  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" && result.displayName, "Renamed live budget.pdf");
});

test("Picker selection is followed by one exact-ID metadata read and never substitutes identity", async () => {
  const requestedIds: string[] = [];
  const selected = await selectFileCabinetGoogleDriveResource(
    "memory-only-token",
    dependencies({
      pickGoogleDriveResource: async () => ({ id: "picked-id", name: "Snapshot" }),
      loadGoogleDriveMetadata: async (_token, id) => {
        requestedIds.push(id);
        return {
          id,
          name: "Live folder",
          mimeType: "application/vnd.google-apps.folder",
          webViewLink: "https://drive.google.com/drive/folders/picked-id",
        };
      },
    }),
  );
  assert.deepEqual(requestedIds, ["picked-id"]);
  assert.equal(selected.status, "ready");
  assert.equal(selected.status === "ready" && selected.providerResourceId, "picked-id");
  assert.equal(selected.status === "ready" && selected.resourceKind, "folder");

  const mismatch = await selectFileCabinetGoogleDriveResource(
    "memory-only-token",
    dependencies({
      pickGoogleDriveResource: async () => ({ id: "picked-id", name: "Snapshot" }),
      loadGoogleDriveMetadata: async () => ({
        id: "different-id",
        name: "Different file",
        mimeType: "application/pdf",
      }),
    }),
  );
  assert.equal(mismatch.status, "unavailable");
});

test("provider states distinguish reconnect, insufficient access, unavailable and unsupported", async () => {
  assert.equal((await resolveFileCabinetResourceProvider(resource(), "", dependencies())).status, "reconnect_required");

  for (const [status, expected] of [
    [401, "reconnect_required"],
    [403, "insufficient_permission"],
    [404, "unavailable"],
  ] as const) {
    const result = await resolveFileCabinetResourceProvider(
      resource(),
      "memory-only-token",
      dependencies({
        loadGoogleDriveMetadata: async () => {
          throw new GoogleApiHttpError(status, `HTTP ${status}`);
        },
      }),
    );
    assert.equal(result.status, expected);
  }

  assert.equal((await resolveFileCabinetResourceProvider(
    resource({ schemaVersion: 2 as 1 }),
    "memory-only-token",
    dependencies(),
  )).status, "unsupported");
  assert.equal((await resolveFileCabinetResourceProvider(
    { ...resource(), accessToken: "must-not-be-accepted" },
    "memory-only-token",
    dependencies(),
  )).status, "unsupported");
  assert.equal((await resolveFileCabinetResourceProvider(
    resource({ providerResourceId: "different-id" }),
    "memory-only-token",
    dependencies(),
  )).status, "unavailable");
});

test("exact Drive metadata request is encoded, Shared-Drive-aware and returns structured errors", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      id: "file with space",
      name: "Budget",
      mimeType: "application/pdf",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await getGoogleDriveFileCabinetResourceMetadata("memory-only-token", "file with space");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/files\/file%20with%20space\?/);
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get("supportsAllDrives"), "true");
  assert.equal(url.searchParams.get("fields"), "id,name,mimeType,webViewLink,trashed");
  assert.equal(requests[0].init?.headers && (requests[0].init.headers as Record<string, string>).Authorization, "Bearer memory-only-token");
  assert.doesNotMatch(requests[0].url, /memory-only-token/);

  for (const status of [401, 403, 404]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: `HTTP ${status}` } }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
    try {
      await assert.rejects(
        getGoogleDriveFileCabinetResourceMetadata("memory-only-token", "drive-file-1"),
        (error: unknown) => error instanceof GoogleApiHttpError && error.status === status,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

function fileCabinetPickerSource() {
  const pickerSource = fs.readFileSync(new URL("./googleDrivePicker.ts", import.meta.url), "utf8");
  const normalView = pickerSource.slice(
    pickerSource.indexOf("function createFileCabinetResourceView()"),
    pickerSource.indexOf("function createSharedDriveFileCabinetResourceView()"),
  );
  const sharedDriveView = pickerSource.slice(
    pickerSource.indexOf("function createSharedDriveFileCabinetResourceView()"),
    pickerSource.indexOf("function createFileCabinetResourceViews()"),
  );
  const viewComposition = pickerSource.slice(
    pickerSource.indexOf("function createFileCabinetResourceViews()"),
    pickerSource.indexOf("export async function pickGoogleDriveFileCabinetResource"),
  );
  const pickerFunction = pickerSource.slice(pickerSource.indexOf("export async function pickGoogleDriveFileCabinetResource"));

  return { normalView, pickerFunction, pickerSource, sharedDriveView, viewComposition };
}

test("resource Picker has a normal personal-Drive view that is not Shared-Drive-only", () => {
  const { normalView, pickerFunction } = fileCabinetPickerSource();

  assert.match(normalView, /new picker\.DocsView\(picker\.ViewId\.DOCS\)/);
  assert.doesNotMatch(normalView, /setEnableDrives/);
  assert.match(normalView, /setIncludeFolders\(true\)/);
  assert.match(normalView, /setSelectFolderEnabled\(true\)/);
  assert.match(pickerFunction, /createFileCabinetResourceViews\(\)\.forEach\(\(view\) => builder\.addView\(view\)\)/);
});

test("resource Picker normal view includes ordinary shared-with-user documents", () => {
  const { normalView } = fileCabinetPickerSource();

  assert.doesNotMatch(normalView, /setOwnedByMe/);
  assert.doesNotMatch(normalView, /setEnableDrives/);
  assert.match(normalView, /ordinary items shared directly with it/);
});

test("resource Picker keeps Shared Drive browsing in a separate view", () => {
  const { normalView, sharedDriveView, viewComposition } = fileCabinetPickerSource();

  assert.doesNotMatch(normalView, /setEnableDrives\(true\)/);
  assert.match(sharedDriveView, /new picker\.DocsView\(picker\.ViewId\.DOCS\)/);
  assert.match(sharedDriveView, /setEnableDrives\(true\)/);
  assert.match(sharedDriveView, /setIncludeFolders\(true\)/);
  assert.match(sharedDriveView, /setSelectFolderEnabled\(true\)/);
  assert.match(viewComposition, /\[createFileCabinetResourceView\(\)\]/);
  assert.match(viewComposition, /createSharedDriveFileCabinetResourceView\(\)/);
  assert.match(viewComposition, /views\.push\(sharedDriveView\)/);
});

test("resource Picker remains one-item file-or-folder selection with an exact returned ID", () => {
  const { pickerFunction } = fileCabinetPickerSource();

  assert.match(pickerFunction, /setMaxItems\(1\)/);
  assert.match(pickerFunction, /const picked = response\.docs\?\.\[0\]/);
  assert.match(pickerFunction, /id: picked\.id/);
  assert.doesNotMatch(pickerFunction, /picked\.id\.(?:trim|replace|toLowerCase)/);
});

test("resource Picker preserves drive.file and does not enumerate Drives", () => {
  const { pickerFunction } = fileCabinetPickerSource();
  const providerSource = fs.readFileSync(new URL("./fileCabinetResourceProvider.ts", import.meta.url), "utf8");

  assert.equal(GOOGLE_DRIVE_FILE_SCOPE, "https://www.googleapis.com/auth/drive.file");
  assert.match(pickerFunction, /setOAuthToken\(accessToken\)/);
  assert.doesNotMatch(`${pickerFunction}\n${providerSource}`, /drives\.list|\/drive\/v3\/drives|listGoogleDrive|permissions|trashGoogle|deleteGoogle/i);
  assert.doesNotMatch(`${pickerFunction}\n${providerSource}`, /drive\.readonly|drive\.metadata|auth\/drive["']/);
});

test("Cabinet UI uses the provider-neutral seam and removes only Stripes metadata", () => {
  const component = fs.readFileSync(new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url), "utf8");
  const removeResource = component.slice(
    component.indexOf("const removeResource"),
    component.indexOf("const backingText"),
  );

  assert.match(component, /resolveFileCabinetResourceProvider/);
  assert.match(component, /selectFileCabinetGoogleDriveResource/);
  assert.match(component, /Cabinet items/);
  assert.match(component, /Add from Drive/);
  assert.match(component, /Add web link/);
  assert.match(component, /original Google Drive item or external link target will not be changed or deleted/i);
  assert.match(removeResource, /removeFileCabinetResource/);
  assert.doesNotMatch(removeResource, /googleDrive|trash|deleteObject|permission/i);

  const resourceSection = component.slice(
    component.indexOf('<section className="mt-5 border-t'),
    component.indexOf("</section>", component.indexOf('<section className="mt-5 border-t')),
  );
  assert.match(resourceSection, /resources\.map/);
  assert.match(resourceSection, /location && \(\s*<div className="mt-3 grid/);
  assert.doesNotMatch(resourceSection.slice(resourceSection.indexOf("resources.map")), /location\s*&&/);
  assert.match(component, /if \(!open \|\| !resources\.length\)/);
  assert.match(component, /driveAuthorizationExpiredRef\.current/);
});
