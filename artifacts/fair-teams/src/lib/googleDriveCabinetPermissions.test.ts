import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GoogleApiHttpError } from "./googleApiError.ts";
import {
  deleteGoogleDriveFilePermission,
  listGoogleDriveFilePermissions,
  shareGoogleDriveFileWithEditor,
  updateGoogleDriveFilePermissionRole,
  type GoogleDrivePermissionResult,
} from "./googleDriveFiles.ts";
import {
  GoogleDriveCabinetPermissionController,
  normalizeGoogleAccountEmail,
  normalizeGoogleDriveCabinetPermission,
  type GoogleDriveCabinetPermissionDependencies,
} from "./googleDriveCabinetPermissions.ts";

function permission(overrides: Partial<GoogleDrivePermissionResult> = {}): GoogleDrivePermissionResult {
  return {
    id: "permission-1",
    type: "user",
    role: "writer",
    emailAddress: "organizer@example.com",
    permissionDetails: [{ inherited: false }],
    ...overrides,
  };
}

function dependencies(overrides: Partial<GoogleDriveCabinetPermissionDependencies> = {}) {
  return {
    listPermissions: async () => [],
    createEditorPermission: async (_token: string, _folderId: string, emailAddress: string) => permission({ emailAddress }),
    updatePermissionRole: async (_token: string, _folderId: string, permissionId: string) => permission({ id: permissionId }),
    deletePermission: async () => undefined,
    ...overrides,
  } satisfies GoogleDriveCabinetPermissionDependencies;
}

test("normalizes explicit Google emails, roles and direct-only permission source", () => {
  assert.equal(normalizeGoogleAccountEmail(" Organizer@Example.COM "), "organizer@example.com");
  assert.deepEqual(
    [
      permission({ id: "owner", role: "owner" }),
      permission({ id: "writer", role: "writer" }),
      permission({ id: "commenter", role: "commenter" }),
      permission({ id: "reader", role: "reader", permissionDetails: [{ inherited: true, inheritedFrom: "parent" }] }),
    ].map(normalizeGoogleDriveCabinetPermission).map(({ access, source, canRemoveDirectly }) => ({ access, source, canRemoveDirectly })),
    [
      { access: "owner", source: "direct", canRemoveDirectly: false },
      { access: "editor", source: "direct", canRemoveDirectly: true },
      { access: "commenter", source: "direct", canRemoveDirectly: true },
      { access: "viewer", source: "inherited", canRemoveDirectly: false },
    ],
  );
});

test("grants writer access to the explicitly supplied Google account", async () => {
  const created: Array<{ folderId: string; emailAddress: string }> = [];
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    createEditorPermission: async (_token, folderId, emailAddress) => {
      created.push({ folderId, emailAddress });
      return permission({ emailAddress });
    },
  }));

  const result = await controller.grantOrganizerEditor("memory-token", "cabinet-root", " Drive.User@Example.com ");
  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" && result.action, "created");
  assert.deepEqual(created, [{ folderId: "cabinet-root", emailAddress: "drive.user@example.com" }]);
});

test("reuses an existing owner or writer permission without duplicate creation", async () => {
  let createCount = 0;
  for (const role of ["owner", "writer"]) {
    const controller = new GoogleDriveCabinetPermissionController(dependencies({
      listPermissions: async () => [permission({ role, emailAddress: "ORGANIZER@example.com" })],
      createEditorPermission: async () => {
        createCount += 1;
        return permission();
      },
    }));
    const result = await controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
    assert.equal(result.status === "ready" && result.action, "existing");
  }
  assert.equal(createCount, 0);
});

test("upgrades an existing direct reader or commenter permission to writer", async () => {
  const updated: string[] = [];
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [permission({ id: "reader-1", role: "reader" })],
    updatePermissionRole: async (_token, _folder, permissionId, role) => {
      updated.push(`${permissionId}:${role}`);
      return permission({ id: permissionId, role });
    },
  }));

  const result = await controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
  assert.equal(result.status === "ready" && result.action, "updated");
  assert.deepEqual(updated, ["reader-1:writer"]);
});

test("protects owner and inherited permissions from removal", async () => {
  let deletes = 0;
  for (const protectedPermission of [
    permission({ id: "owner", role: "owner" }),
    permission({ id: "inherited", role: "reader", permissionDetails: [{ inherited: true }] }),
  ]) {
    const controller = new GoogleDriveCabinetPermissionController(dependencies({
      listPermissions: async () => [protectedPermission],
      deletePermission: async () => { deletes += 1; },
    }));
    const result = await controller.removeDirectPermission(
      "token",
      "cabinet-root",
      protectedPermission.id,
      "organizer@example.com",
    );
    assert.equal(result.status, "protected");
  }
  assert.equal(deletes, 0);
});

test("removes only the freshly checked direct permission for the expected Google email", async () => {
  const deleted: string[] = [];
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [
      permission({ id: "selected", role: "reader", emailAddress: "selected@example.com" }),
      permission({ id: "unrelated", emailAddress: "other@example.com" }),
    ],
    deletePermission: async (_token, _folder, permissionId) => { deleted.push(permissionId); },
  }));

  const mismatch = await controller.removeDirectPermission("token", "cabinet-root", "selected", "other@example.com");
  assert.equal(mismatch.status, "protected");
  const removed = await controller.removeDirectPermission("token", "cabinet-root", "selected", "selected@example.com");
  assert.equal(removed.status === "ready" && removed.action, "direct_removed");
  assert.equal(removed.status === "ready" && removed.inheritedAccessMayRemain, false);
  assert.deepEqual(deleted, ["selected"]);
});

test("normalizes inherited-only, mixed and missing permissionDetails conservatively", () => {
  const normalized = [
    permission({ id: "direct", permissionDetails: [{ inherited: false }] }),
    permission({ id: "inherited", permissionDetails: [{ inherited: true, inheritedFrom: "parent" }] }),
    permission({
      id: "mixed",
      permissionDetails: [
        { inherited: true, inheritedFrom: "parent" },
        { inherited: false },
      ],
    }),
    permission({ id: "missing", permissionDetails: undefined }),
    permission({ id: "empty", permissionDetails: [] }),
  ].map(normalizeGoogleDriveCabinetPermission);

  assert.deepEqual(
    normalized.map(({ source, canRemoveDirectly }) => ({ source, canRemoveDirectly })),
    [
      { source: "direct", canRemoveDirectly: true },
      { source: "inherited", canRemoveDirectly: false },
      { source: "mixed", canRemoveDirectly: true },
      { source: "unknown", canRemoveDirectly: false },
      { source: "unknown", canRemoveDirectly: false },
    ],
  );
  assert.equal(normalized[2].inheritedFrom, "parent");
});

test("upgrades a mixed lower-role permission without creating a redundant grant", async () => {
  let createCount = 0;
  const updated: string[] = [];
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [permission({
      id: "mixed-reader",
      role: "reader",
      permissionDetails: [{ inherited: true }, { inherited: false }],
    })],
    updatePermissionRole: async (_token, _folder, permissionId, role) => {
      updated.push(`${permissionId}:${role}`);
      return permission({
        id: permissionId,
        role,
        permissionDetails: [{ inherited: true }, { inherited: false }],
      });
    },
    createEditorPermission: async () => {
      createCount += 1;
      return permission();
    },
  }));

  const result = await controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
  assert.equal(result.status === "ready" && result.action, "updated");
  assert.equal(result.status === "ready" && result.permission?.source, "mixed");
  assert.deepEqual(updated, ["mixed-reader:writer"]);
  assert.equal(createCount, 0);
});

test("inherited effective editor is sufficient while inherited-only lower access gets a direct writer grant", async () => {
  let createCount = 0;
  const inheritedEditor = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [permission({
      role: "writer",
      permissionDetails: [{ inherited: true, inheritedFrom: "parent" }],
    })],
    createEditorPermission: async () => {
      createCount += 1;
      return permission();
    },
  }));
  const sufficient = await inheritedEditor.grantOrganizerEditor(
    "token",
    "cabinet-root",
    "organizer@example.com",
  );
  assert.equal(sufficient.status === "ready" && sufficient.action, "existing");

  const inheritedViewer = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [permission({
      role: "reader",
      permissionDetails: [{ inherited: true, inheritedFrom: "parent" }],
    })],
    createEditorPermission: async (_token, _folder, emailAddress) => {
      createCount += 1;
      return permission({ emailAddress });
    },
  }));
  const created = await inheritedViewer.grantOrganizerEditor(
    "token",
    "cabinet-root",
    "organizer@example.com",
  );
  assert.equal(created.status === "ready" && created.action, "created");
  assert.equal(createCount, 1);
});

test("removing a mixed permission reports that inherited access may remain", async () => {
  const deleted: string[] = [];
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [permission({
      id: "mixed",
      role: "reader",
      permissionDetails: [{ inherited: false }, { inherited: true, inheritedFrom: "parent" }],
    })],
    deletePermission: async (_token, _folder, permissionId) => { deleted.push(permissionId); },
  }));

  const result = await controller.removeDirectPermission(
    "token",
    "cabinet-root",
    "mixed",
    "organizer@example.com",
  );
  assert.equal(result.status === "ready" && result.action, "direct_removed");
  assert.equal(result.status === "ready" && result.inheritedAccessMayRemain, true);
  assert.deepEqual(deleted, ["mixed"]);
});

test("unknown permission source fails closed for grant and removal", async () => {
  let creates = 0;
  let deletes = 0;
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => [permission({ id: "unknown", role: "reader", permissionDetails: [] })],
    createEditorPermission: async () => {
      creates += 1;
      return permission();
    },
    deletePermission: async () => { deletes += 1; },
  }));

  const grant = await controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
  assert.equal(grant.status, "protected");
  const removal = await controller.removeDirectPermission(
    "token",
    "cabinet-root",
    "unknown",
    "organizer@example.com",
  );
  assert.equal(removal.status, "protected");
  assert.equal(creates, 0);
  assert.equal(deletes, 0);
});

test("surfaces 401 reconnect and 403 insufficient-permission states", async () => {
  for (const [status, expected] of [[401, "reconnect_required"], [403, "insufficient_permission"]] as const) {
    const controller = new GoogleDriveCabinetPermissionController(dependencies({
      listPermissions: async () => { throw new GoogleApiHttpError(status, `HTTP ${status}`); },
    }));
    const inspected = await controller.inspect("token", "cabinet-root");
    assert.equal(inspected.status, expected);
    const mutated = await controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
    assert.equal(mutated.status, expected);
  }
});

test("Drive permission role updates preserve structured 403 responses", async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ error: { message: "forbidden" } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      updateGoogleDriveFilePermissionRole("memory-token", "cabinet-root", "permission-1", "writer"),
      (error: unknown) => error instanceof GoogleApiHttpError && error.status === 403,
    );
    assert.equal(request?.init?.method, "PATCH");
    assert.equal(request?.init?.body, JSON.stringify({ role: "writer" }));
    assert.match(request?.url || "", /cabinet-root\/permissions\/permission-1/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive permission REST adapters preserve their exact request contracts", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") {
      return new Response(JSON.stringify(permission({ id: "created-permission" })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ permissions: [permission()] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const listed = await listGoogleDriveFilePermissions("memory-token", "cabinet/root");
    const created = await shareGoogleDriveFileWithEditor(
      "memory-token",
      "cabinet/root",
      "organizer@example.com",
    );
    await deleteGoogleDriveFilePermission(
      "memory-token",
      "cabinet/root",
      "permission/1",
    );

    assert.equal(listed[0]?.id, "permission-1");
    assert.equal(created.id, "created-permission");
    assert.equal(requests.length, 3);

    const [listRequest, createRequest, deleteRequest] = requests;
    for (const request of requests) {
      const headers = request.init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.Authorization, "Bearer memory-token");
      assert.doesNotMatch(request.url, /memory-token/);
      assert.equal(new URL(request.url).searchParams.get("supportsAllDrives"), "true");
    }

    const listUrl = new URL(listRequest.url);
    assert.equal(listRequest.init?.method, undefined);
    assert.match(listUrl.pathname, /\/files\/cabinet%2Froot\/permissions$/);
    assert.match(listUrl.searchParams.get("fields") || "", /permissionDetails/);

    const createUrl = new URL(createRequest.url);
    assert.equal(createRequest.init?.method, "POST");
    assert.match(createUrl.pathname, /\/files\/cabinet%2Froot\/permissions$/);
    assert.equal(createUrl.searchParams.get("sendNotificationEmail"), "true");
    assert.equal(
      createRequest.init?.body,
      JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress: "organizer@example.com",
      }),
    );
    assert.equal(
      (createRequest.init?.headers as Record<string, string>)["Content-Type"],
      "application/json; charset=UTF-8",
    );

    const deleteUrl = new URL(deleteRequest.url);
    assert.equal(deleteRequest.init?.method, "DELETE");
    assert.match(
      deleteUrl.pathname,
      /\/files\/cabinet%2Froot\/permissions\/permission%2F1$/,
    );
    assert.equal(deleteRequest.init?.body, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive permission REST adapters preserve structured 401 and 403 failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const cases = [
      ["list", 401, () => listGoogleDriveFilePermissions("token", "cabinet-root")],
      ["list", 403, () => listGoogleDriveFilePermissions("token", "cabinet-root")],
      [
        "create",
        401,
        () => shareGoogleDriveFileWithEditor("token", "cabinet-root", "organizer@example.com"),
      ],
      [
        "create",
        403,
        () => shareGoogleDriveFileWithEditor("token", "cabinet-root", "organizer@example.com"),
      ],
      [
        "delete",
        401,
        () => deleteGoogleDriveFilePermission("token", "cabinet-root", "permission-1"),
      ],
      [
        "delete",
        403,
        () => deleteGoogleDriveFilePermission("token", "cabinet-root", "permission-1"),
      ],
    ] as const;

    for (const [adapter, status, invoke] of cases) {
      globalThis.fetch = async () => new Response(
        JSON.stringify({ error: { message: `${adapter} failed` } }),
        { status, headers: { "Content-Type": "application/json" } },
      );
      await assert.rejects(
        invoke,
        (error: unknown) => error instanceof GoogleApiHttpError && error.status === status,
        `${adapter} should preserve HTTP ${status}`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("serializes overlapping mutations for the same Cabinet root", async () => {
  let releaseCreate: (() => void) | undefined;
  let createCount = 0;
  let listCount = 0;
  const livePermissions: GoogleDrivePermissionResult[] = [];
  const controller = new GoogleDriveCabinetPermissionController(dependencies({
    listPermissions: async () => {
      listCount += 1;
      return [...livePermissions];
    },
    createEditorPermission: async (_token, _folder, emailAddress) => {
      createCount += 1;
      await new Promise<void>((resolve) => { releaseCreate = resolve; });
      const created = permission({ emailAddress });
      livePermissions.push(created);
      return created;
    },
  }));

  const first = controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
  const second = controller.grantOrganizerEditor("token", "cabinet-root", "organizer@example.com");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(listCount, 1);
  assert.equal(createCount, 1);
  releaseCreate?.();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status === "ready" && firstResult.action, "created");
  assert.equal(secondResult.status === "ready" && secondResult.action, "existing");
  assert.equal(createCount, 1);
});

test("Cabinet permission foundation does not import Firebase or persist identity mappings", () => {
  const source = fs.readFileSync(new URL("./googleDriveCabinetPermissions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /firebase|firestore|localStorage|sessionStorage/i);
  assert.match(source, /googleEmailAddress/);
  assert.match(source, /scope: "cabinet_root"/);
  assert.match(source, /childAccessMayDiffer: true/);
});
