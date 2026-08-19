import assert from "node:assert/strict";
import test from "node:test";
import {
  checkFileCabinetResourceRemoval,
  createExternalLinkFileCabinetResourceDraft,
  createGoogleDriveFileCabinetResourceDraft,
  parseFileCabinetResource,
  validateFileCabinetResourceDraft,
  validateFileCabinetResourceMetadataUpdate,
  type FileCabinetResourceDraft,
} from "./fileCabinetResource.ts";

function googleDraft(
  overrides: Partial<FileCabinetResourceDraft> = {},
): FileCabinetResourceDraft {
  return {
    schemaVersion: 1,
    provider: "google_drive",
    resourceKind: "file",
    providerResourceId: "drive-file-stable-id",
    externalUrl: null,
    displayName: "Club rules.pdf",
    mimeType: "application/pdf",
    origin: { kind: "cabinet" },
    contexts: [{ kind: "action_board", entityId: "card-1" }],
    ...overrides,
  };
}

function persistedResource(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...googleDraft(),
    resourceId: "resource-1",
    createdByUid: "organizer-a",
    createdAt: { toMillis: () => 1_787_133_600_000 },
    updatedByUid: "organizer-a",
    updatedAt: { toMillis: () => 1_787_133_600_500 },
    ...overrides,
  };
}

test("validates the current Google Drive file and folder resource shapes", () => {
  assert.deepEqual(validateFileCabinetResourceDraft(googleDraft()), googleDraft());
  assert.deepEqual(
    createGoogleDriveFileCabinetResourceDraft(
      "stable-folder-id",
      "  Team   handbook  ",
      "folder",
      "application/vnd.google-apps.folder",
      { kind: "equipment", entityId: "bag-1" },
      [{ kind: "cabinet" }],
    ),
    {
      schemaVersion: 1,
      provider: "google_drive",
      resourceKind: "folder",
      providerResourceId: "stable-folder-id",
      externalUrl: null,
      displayName: "Team handbook",
      mimeType: "application/vnd.google-apps.folder",
      origin: { kind: "equipment", entityId: "bag-1" },
      contexts: [{ kind: "cabinet" }],
    },
  );
});

test("builds a strict external-link resource without provider or MIME metadata", () => {
  assert.deepEqual(
    createExternalLinkFileCabinetResourceDraft(
      "https://example.invalid/club/guide?year=2026",
      "Club guide",
    ),
    {
      schemaVersion: 1,
      provider: "external_link",
      resourceKind: "link",
      providerResourceId: null,
      externalUrl: "https://example.invalid/club/guide?year=2026",
      displayName: "Club guide",
      mimeType: null,
      origin: { kind: "cabinet" },
      contexts: [],
    },
  );
  assert.equal(
    createExternalLinkFileCabinetResourceDraft(
      " HTTPS://Example.INVALID/club plan ",
      "Club plan",
    ).externalUrl,
    "https://example.invalid/club%20plan",
  );
});

test("fails closed for missing, malformed, and future schema versions", () => {
  for (const schemaVersion of [undefined, null, "1", 0, 2]) {
    assert.throws(
      () => validateFileCabinetResourceDraft({
        ...googleDraft(),
        schemaVersion,
      }),
      /version is not supported/,
    );
  }
  assert.equal(
    parseFileCabinetResource("resource-1", persistedResource({ schemaVersion: 2 })),
    null,
  );
});

test("requires every persisted field and rejects every unsupported field", () => {
  for (const key of [
    "schemaVersion",
    "provider",
    "resourceKind",
    "providerResourceId",
    "externalUrl",
    "displayName",
    "mimeType",
    "origin",
    "contexts",
  ]) {
    const value = { ...googleDraft() } as Record<string, unknown>;
    delete value[key];
    assert.throws(
      () => validateFileCabinetResourceDraft(value),
      /unsupported fields/,
    );
  }

  const persisted = persistedResource();
  delete persisted.updatedByUid;
  assert.equal(parseFileCabinetResource("resource-1", persisted), null);
});

test("rejects malformed provider and reference discriminants", () => {
  const malformed = [
    googleDraft({ resourceKind: "link" }),
    googleDraft({ providerResourceId: null }),
    googleDraft({ externalUrl: "https://example.invalid/file" }),
    googleDraft({ mimeType: "not-a-mime-type" }),
    {
      ...googleDraft(),
      provider: "external_link",
      resourceKind: "file",
      providerResourceId: null,
      externalUrl: "https://example.invalid/file",
      mimeType: null,
    },
    {
      ...googleDraft(),
      provider: "external_link",
      resourceKind: "link",
      providerResourceId: "provider-id",
      externalUrl: "https://example.invalid/file",
      mimeType: null,
    },
    {
      ...googleDraft(),
      provider: "external_link",
      resourceKind: "link",
      providerResourceId: null,
      externalUrl: "ftp://example.invalid/file",
      mimeType: null,
    },
    {
      ...googleDraft(),
      provider: "external_link",
      resourceKind: "link",
      providerResourceId: null,
      externalUrl: "https://person:secret@example.invalid/file",
      mimeType: null,
    },
  ];

  for (const value of malformed) {
    assert.throws(() => validateFileCabinetResourceDraft(value));
  }
});

test("rejects credential, identity, ACL, byte, and live-status fields", () => {
  for (const forbidden of [
    "accessToken",
    "refreshToken",
    "googleEmail",
    "permissionIds",
    "fileBytes",
    "providerStatus",
    "workspaceId",
  ]) {
    assert.throws(
      () => validateFileCabinetResourceDraft({
        ...googleDraft(),
        [forbidden]: "forbidden",
      }),
      /unsupported fields/,
    );
    assert.equal(
      parseFileCabinetResource(
        "resource-1",
        persistedResource({ [forbidden]: "forbidden" }),
      ),
      null,
    );
  }
});

test("validates bounded origin and unique context relationships", () => {
  assert.deepEqual(
    validateFileCabinetResourceDraft(googleDraft({
      origin: { kind: "action_board", entityId: "  card-2  " },
      contexts: [
        { kind: "cabinet" },
        { kind: "equipment", entityId: " bag-2 " },
      ],
    })).contexts,
    [
      { kind: "cabinet" },
      { kind: "equipment", entityId: "bag-2" },
    ],
  );

  const invalidRelationships = [
    googleDraft({ origin: { kind: "action_board", entityId: "" } }),
    { ...googleDraft(), origin: { kind: "cabinet", entityId: "not-allowed" } },
    { ...googleDraft(), origin: { kind: "cabinet", label: "not-allowed" } },
    { ...googleDraft(), contexts: [{ kind: "cabinet", workspaceId: "group-a" }] },
    { ...googleDraft(), contexts: [{ kind: "equipment", entityId: "bag-1", label: "Bag" }] },
    googleDraft({ contexts: [{ kind: "cabinet" }, { kind: "cabinet" }] }),
    googleDraft({
      contexts: Array.from(
        { length: 5 },
        (_, index) => ({ kind: "action_board" as const, entityId: `card-${index}` }),
      ),
    }),
  ];
  for (const value of invalidRelationships) {
    assert.throws(() => validateFileCabinetResourceDraft(value));
  }
});

test("enforces bounded resource IDs, names, MIME types, URLs, and entity IDs", () => {
  const oversizedId = "x".repeat(201);
  assert.throws(() => validateFileCabinetResourceDraft(googleDraft({
    providerResourceId: oversizedId,
  })));
  assert.throws(() => validateFileCabinetResourceDraft(googleDraft({
    displayName: "x".repeat(201),
  })));
  assert.throws(() => validateFileCabinetResourceDraft(googleDraft({
    mimeType: `application/${"x".repeat(190)}`,
  })));
  assert.throws(() => createExternalLinkFileCabinetResourceDraft(
    `https://example.invalid/${"x".repeat(2_100)}`,
    "Oversized link",
  ));
  assert.throws(() => validateFileCabinetResourceDraft(googleDraft({
    contexts: [{ kind: "equipment", entityId: oversizedId }],
  })));
  assert.equal(
    parseFileCabinetResource(oversizedId, persistedResource({ resourceId: oversizedId })),
    null,
  );
});

test("parses exact persisted keys and preserves stable provider identity", () => {
  assert.deepEqual(
    parseFileCabinetResource("resource-1", persistedResource()),
    {
      ...googleDraft(),
      resourceId: "resource-1",
      createdByUid: "organizer-a",
      createdAt: 1_787_133_600_000,
      updatedByUid: "organizer-a",
      updatedAt: 1_787_133_600_500,
    },
  );
  assert.equal(
    parseFileCabinetResource(
      "resource-1",
      persistedResource({ resourceId: "resource-2" }),
    ),
    null,
  );
  assert.equal(
    parseFileCabinetResource(
      "resource-1",
      persistedResource({ providerResourceId: "replacement-provider-id" }),
    )?.providerResourceId,
    "replacement-provider-id",
  );
  assert.equal(
    parseFileCabinetResource(
      "resource-1",
      persistedResource({ createdAt: 1_787_133_600_000 }),
    ),
    null,
  );
  assert.equal(
    parseFileCabinetResource(
      " resource-1 ",
      persistedResource(),
    ),
    null,
  );
  assert.equal(
    parseFileCabinetResource(
      "resource-1",
      persistedResource({ providerResourceId: " drive-file-stable-id " }),
    ),
    null,
  );
  assert.equal(
    parseFileCabinetResource(
      "resource-1",
      persistedResource({ contexts: [{ kind: "equipment", entityId: " bag-1 " }] }),
    ),
    null,
  );
  assert.equal(
    parseFileCabinetResource(
      "resource-1",
      persistedResource({
        provider: "external_link",
        resourceKind: "link",
        providerResourceId: null,
        externalUrl: "https://example.invalid",
        mimeType: null,
      }),
    )?.externalUrl,
    "https://example.invalid/",
  );
});

test("metadata updates permit only display name and contexts", () => {
  assert.deepEqual(
    validateFileCabinetResourceMetadataUpdate({
      displayName: "  Updated   rules  ",
      contexts: [{ kind: "equipment", entityId: " bag-3 " }],
    }),
    {
      displayName: "Updated rules",
      contexts: [{ kind: "equipment", entityId: "bag-3" }],
    },
  );
  for (const forbidden of ["provider", "providerResourceId", "origin", "createdByUid"]) {
    assert.throws(
      () => validateFileCabinetResourceMetadataUpdate({
        displayName: "Updated rules",
        contexts: [],
        [forbidden]: "forbidden",
      }),
      /Only the resource name and contexts/,
    );
  }
});

test("generic removal is allowed only for Cabinet-only relationships", () => {
  assert.deepEqual(
    checkFileCabinetResourceRemoval({
      origin: { kind: "cabinet" },
      contexts: [],
    }),
    { status: "removable" },
  );
  assert.deepEqual(
    checkFileCabinetResourceRemoval({
      origin: { kind: "cabinet" },
      contexts: [{ kind: "cabinet" }],
    }),
    { status: "removable" },
  );
});

test("generic removal reports every Action Board or Equipment relationship", () => {
  const blocked = checkFileCabinetResourceRemoval({
    origin: { kind: "action_board", entityId: "card-origin" },
    contexts: [
      { kind: "action_board", entityId: "card-context" },
      { kind: "equipment", entityId: "bag-context" },
    ],
  });
  assert.equal(blocked.status, "blocked_by_relationships");
  if (blocked.status !== "blocked_by_relationships") return;
  assert.deepEqual(blocked.relationshipKinds, ["action_board", "equipment"]);
  assert.match(blocked.message, /Action Board and Equipment/);
  assert.match(
    blocked.message,
    /Remove its relationships from Action Board and Equipment first/,
  );
  assert.match(blocked.message, /No Stripes record or external item was deleted/);

  const equipmentOrigin = checkFileCabinetResourceRemoval({
    origin: { kind: "equipment", entityId: "bag-origin" },
    contexts: [],
  });
  assert.equal(equipmentOrigin.status, "blocked_by_relationships");
  if (equipmentOrigin.status !== "blocked_by_relationships") return;
  assert.match(
    equipmentOrigin.message,
    /Remove its relationship from Equipment first/,
  );
});
