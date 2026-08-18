import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GoogleApiHttpError } from "./googleApiError.ts";
import {
  ensureManagedMyDriveCabinetFolder,
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GoogleDriveCabinetLocationController,
  STRIPES_CABINET_APP_PROPERTIES,
  STRIPES_CABINET_FOLDER_NAME,
  type GoogleDriveCabinetFolder,
  type GoogleDriveCabinetResolution,
} from "./googleDriveCabinet.ts";
import {
  listManagedMyDriveCabinetFolders,
  resolveManagedMyDriveCabinetFolder,
} from "./googleDriveCabinetApi.ts";

function managedFolder(overrides: Partial<GoogleDriveCabinetFolder> = {}): GoogleDriveCabinetFolder {
  return {
    id: "cabinet-1",
    name: STRIPES_CABINET_FOLDER_NAME,
    mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    createdTime: "2026-08-18T10:00:00.000Z",
    trashed: false,
    ownedByMe: true,
    parents: ["root"],
    appProperties: { ...STRIPES_CABINET_APP_PROPERTIES },
    ...overrides,
  };
}

function expectReady(result: GoogleDriveCabinetResolution) {
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("Expected a ready Cabinet resolution.");
  return result;
}

test("creates the first managed My Drive Cabinet folder", async () => {
  let createCount = 0;
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [],
    createManagedFolder: async () => {
      createCount += 1;
      return managedFolder();
    },
  });

  const ready = expectReady(result);
  assert.equal(ready.created, true);
  assert.equal(ready.folder.id, "cabinet-1");
  assert.equal(createCount, 1);
});

test("reuses an existing marked folder without creating another", async () => {
  const existing = managedFolder();
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [existing],
    createManagedFolder: async () => {
      throw new Error("must not create");
    },
  });

  const ready = expectReady(result);
  assert.equal(ready.created, false);
  assert.equal(ready.folder, existing);
});

test("renamed managed folder remains canonical because identity is marker and file ID", async () => {
  const renamed = managedFolder({ name: "Friday Football documents" });
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [renamed],
    createManagedFolder: async () => managedFolder({ id: "unexpected" }),
  });

  const ready = expectReady(result);
  assert.equal(ready.folder.id, "cabinet-1");
  assert.equal(ready.folder.name, "Friday Football documents");
  assert.equal(ready.created, false);
});

test("moved managed folder remains canonical regardless of its parent", async () => {
  const moved = managedFolder({ parents: ["user-folder-42"] });
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [moved],
    createManagedFolder: async () => managedFolder({ id: "unexpected" }),
  });

  const ready = expectReady(result);
  assert.equal(ready.folder.id, "cabinet-1");
  assert.deepEqual(ready.folder.parents, ["user-folder-42"]);
});

test("trashed or missing managed folder is replaced rather than reused", async () => {
  for (const folders of [[managedFolder({ trashed: true })], []]) {
    const replacement = managedFolder({ id: "cabinet-replacement" });
    const result = await ensureManagedMyDriveCabinetFolder({
      listManagedFolders: async () => folders,
      createManagedFolder: async () => replacement,
    });
    const ready = expectReady(result);
    assert.equal(ready.created, true);
    assert.equal(ready.folder.id, "cabinet-replacement");
  }
});

test("unmarked look-alike folder is ignored", async () => {
  const lookAlike = managedFolder({ id: "look-alike", appProperties: {} });
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [lookAlike],
    createManagedFolder: async () => managedFolder({ id: "marked-cabinet" }),
  });

  const ready = expectReady(result);
  assert.equal(ready.created, true);
  assert.equal(ready.folder.id, "marked-cabinet");
});

test("multiple marked folders without a valid preference surface ambiguity", async () => {
  let createCount = 0;
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [
      managedFolder({ id: "newer", createdTime: "2026-08-18T12:00:00.000Z" }),
      managedFolder({ id: "oldest-b", createdTime: "2026-08-18T09:00:00.000Z" }),
      managedFolder({ id: "oldest-a", createdTime: "2026-08-18T09:00:00.000Z" }),
    ],
    createManagedFolder: async () => {
      createCount += 1;
      return managedFolder({ id: "unexpected" });
    },
  });

  assert.equal(result.status, "ambiguous");
  assert.equal(result.folder, null);
  assert.deepEqual(result.duplicateFolderIds, ["newer", "oldest-a", "oldest-b"]);
  assert.equal(createCount, 0);
});

test("preferred folder wins among duplicates and restored old folder cannot replace it", async () => {
  const restoredOriginal = managedFolder({ id: "original-a", createdTime: "2026-08-17T09:00:00.000Z" });
  const currentReplacement = managedFolder({ id: "replacement-b", createdTime: "2026-08-18T12:00:00.000Z" });
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [restoredOriginal, currentReplacement],
    createManagedFolder: async () => managedFolder({ id: "unexpected" }),
  }, "replacement-b");

  const ready = expectReady(result);
  assert.equal(ready.folder.id, "replacement-b");
  assert.deepEqual(ready.duplicateFolderIds, ["original-a"]);
});

test("Shared Drive candidate remains excluded from the managed My Drive location", async () => {
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [managedFolder({ id: "shared", driveId: "shared-drive-1" })],
    createManagedFolder: async () => managedFolder({ id: "my-drive-replacement" }),
  }, "shared");

  const ready = expectReady(result);
  assert.equal(ready.created, true);
  assert.equal(ready.folder.id, "my-drive-replacement");
});

test("recorded My Drive folder fails closed instead of selecting or creating another marked folder", async () => {
  let createCount = 0;
  const result = await ensureManagedMyDriveCabinetFolder({
    listManagedFolders: async () => [managedFolder({ id: "different-marked-folder" })],
    createManagedFolder: async () => {
      createCount += 1;
      return managedFolder({ id: "replacement" });
    },
  }, "recorded-folder", true);

  assert.equal(result.status, "unavailable");
  assert.equal(result.folder, null);
  assert.deepEqual(result.duplicateFolderIds, ["different-marked-folder"]);
  assert.equal(createCount, 0);
});

test("real API requests query exact markers and create only in My Drive root", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(managedFolder()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = expectReady(await resolveManagedMyDriveCabinetFolder("memory-only-token"));
    assert.equal(result.created, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const listUrl = new URL(requests[0].url);
  const query = listUrl.searchParams.get("q") || "";
  assert.match(query, /appProperties has \{ key='stripesManagedLocation' and value='cabinet' \}/);
  assert.match(query, /stripesCabinetBacking/);
  assert.doesNotMatch(query, /name\s*=/);
  assert.equal(listUrl.searchParams.get("supportsAllDrives"), "true");

  const createUrl = new URL(requests[1].url);
  const body = JSON.parse(String(requests[1].init?.body));
  assert.equal(createUrl.searchParams.get("supportsAllDrives"), "true");
  assert.deepEqual(body.parents, ["root"]);
  assert.deepEqual(body.appProperties, STRIPES_CABINET_APP_PROPERTIES);
});

test("Drive 401 becomes reconnect-required while other failures remain truthful errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "expired" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(
      () => listManagedMyDriveCabinetFolders("expired-token"),
      (error: unknown) => error instanceof GoogleApiHttpError && error.status === 401,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const reconnect = new GoogleDriveCabinetLocationController(async () => {
    throw new GoogleApiHttpError(401, "expired");
  });
  assert.equal((await reconnect.resolve("token")).status, "reconnect_required");

  const failed = new GoogleDriveCabinetLocationController(async () => {
    throw new Error("Drive unavailable");
  });
  assert.equal((await failed.resolve("token")).status, "error");
  assert.equal((await failed.resolve("")).status, "unavailable");
});

test("controller reuses its session folder ID as the next preferred ID", async () => {
  const preferredIds: Array<string | undefined> = [];
  const controller = new GoogleDriveCabinetLocationController(async (_token, preferredFolderId) => {
    preferredIds.push(preferredFolderId);
    return {
      status: "ready",
      folder: managedFolder({ id: "replacement-b" }),
      created: preferredIds.length === 1,
      duplicateFolderIds: [],
    };
  });

  await controller.resolve("token");
  await controller.resolve("token");
  assert.deepEqual(preferredIds, [undefined, "replacement-b"]);
});

test("overlapping same-session resolutions share one in-flight create/resolve operation", async () => {
  let resolveCalls = 0;
  let finish: ((result: GoogleDriveCabinetResolution) => void) | null = null;
  const controller = new GoogleDriveCabinetLocationController(async () => {
    resolveCalls += 1;
    return new Promise<GoogleDriveCabinetResolution>((resolve) => {
      finish = resolve;
    });
  });

  const first = controller.resolve("token");
  const second = controller.resolve("token");
  assert.equal(resolveCalls, 1);
  finish?.({
    status: "ready",
    folder: managedFolder({ id: "single-created-folder" }),
    created: true,
    duplicateFolderIds: [],
  });

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.folder?.id, "single-created-folder");
  assert.equal(secondResult.folder?.id, "single-created-folder");
  assert.equal(resolveCalls, 1);
});

test("Cabinet foundation remains token-memory-only and outside Firebase persistence", () => {
  const cabinet = fs.readFileSync(new URL("./googleDriveCabinet.ts", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("./googleDriveCabinetApi.ts", import.meta.url), "utf8");
  assert.doesNotMatch(cabinet, /localStorage|sessionStorage|firestore|firebase|URLSearchParams|console\./i);
  assert.doesNotMatch(api, /localStorage|sessionStorage|firestore|firebase|console\./i);
  assert.doesNotMatch(cabinet, /private\s+accessToken|accessToken\s*=/);
});

test("generic Drive connection does not resolve or validate Cabinet state", () => {
  const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const connect = app.slice(
    app.indexOf("const connectGoogleDrive"),
    app.indexOf("const disconnectGoogleDrive"),
  );
  assert.match(connect, /googleDriveConnection\.connect\(\{ loginHint: options\?\.loginHint \}\)/);
  assert.match(connect, /return connectedAccessToken/);
  assert.doesNotMatch(connect, /activeCabinetScope|savedCabinetLocation|getSharedWorkspaceCabinetLocation/);
  assert.doesNotMatch(connect, /resolveManagedMyDriveCabinetFolder|resolveGoogleDriveSharedCabinetLocation|googleDriveCabinet\.resolve/);

  const card = fs.readFileSync(new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url), "utf8");
  const explicitMyDriveAction = card.slice(
    card.indexOf("const useManagedMyDrive"),
    card.indexOf("const chooseSharedDrive"),
  );
  assert.match(explicitMyDriveAction, /resolveManagedMyDriveCabinetFolder\(actionToken\)/);

  const disconnect = app.slice(
    app.indexOf("const disconnectGoogleDrive"),
    app.indexOf("const preserveLocalImagesForDriveRosters"),
  );
  assert.match(disconnect, /googleDriveCabinet\.reset\(\)/);
  assert.doesNotMatch(disconnect, /delete|trash|setCurrentDriveBackup\(null\)|firebase|workspace/i);
});
