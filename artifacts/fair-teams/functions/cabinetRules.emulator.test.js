"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-stripes-cabinet-rules";
const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

function groupParent(overrides = {}) {
  return {
    ownerUid: "organizer-a",
    ownerEmail: "a@example.com",
    memberUids: ["organizer-a", "organizer-b", "viewer"],
    memberEmails: ["a@example.com", "b@example.com", "viewer@example.com"],
    pendingInviteEmails: ["pending@example.com"],
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
      viewer: "viewer",
    },
    ...overrides,
  };
}

function rosterParent(overrides = {}) {
  return {
    ownerUid: "organizer-a",
    ownerEmail: "a@example.com",
    memberUids: ["organizer-a"],
    memberEmails: ["a@example.com"],
    pendingInviteEmails: [],
    roleByUid: { "organizer-a": "organizer" },
    ...overrides,
  };
}

function cabinetConfig(uid, overrides = {}) {
  return {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "my-drive-folder",
    displayName: "Friday Football Cabinet",
    configuredByUid: uid,
    configuredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function driveCabinetResource(uid, resourceId = "drive-resource", overrides = {}) {
  return {
    schemaVersion: 1,
    resourceId,
    provider: "google_drive",
    resourceKind: "file",
    providerResourceId: "google-file-123",
    externalUrl: null,
    displayName: "Training plan",
    mimeType: "application/pdf",
    origin: { kind: "cabinet" },
    contexts: [
      { kind: "cabinet" },
      { kind: "action_board", entityId: "card-1" },
    ],
    createdByUid: uid,
    createdAt: serverTimestamp(),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function externalCabinetResource(uid, resourceId = "external-resource", overrides = {}) {
  return {
    schemaVersion: 1,
    resourceId,
    provider: "external_link",
    resourceKind: "link",
    providerResourceId: null,
    externalUrl: "https://example.com/club-guide",
    displayName: "Club guide",
    mimeType: null,
    origin: { kind: "cabinet" },
    contexts: [],
    createdByUid: uid,
    createdAt: serverTimestamp(),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function withoutField(value, field) {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

test("Cabinet Firestore rules enforce organizer authority and strict schema", async (t) => {
  const environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });

  const seed = async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "sharedGroups", "group-1"), groupParent());
      await setDoc(doc(db, "sharedGroups", "group-2"), groupParent({
        ownerUid: "other-organizer",
        ownerEmail: "other@example.com",
        memberUids: ["other-organizer"],
        memberEmails: ["other@example.com"],
        pendingInviteEmails: [],
        roleByUid: { "other-organizer": "organizer" },
      }));
      await setDoc(doc(db, "sharedRosters", "standalone-roster"), rosterParent());
      await setDoc(doc(db, "sharedRosters", "linked-roster"), rosterParent({ groupId: "group-1" }));
    });
  };

  const authenticated = (uid, email = `${uid}@example.com`) =>
    environment.authenticatedContext(uid, { email }).firestore();
  const groupConfigRef = (db) => doc(db, "sharedGroups", "group-1", "cabinet", "config");
  const rosterConfigRef = (db, rosterId) => doc(db, "sharedRosters", rosterId, "cabinet", "config");
  const groupResourceRef = (db, resourceId = "drive-resource", groupId = "group-1") =>
    doc(db, "sharedGroups", groupId, "cabinetResources", resourceId);
  const rosterResourceRef = (db, rosterId, resourceId = "drive-resource") =>
    doc(db, "sharedRosters", rosterId, "cabinetResources", resourceId);

  try {
    await t.test("active organizers can create, read, replace and remove group config", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const organizerB = authenticated("organizer-b", "b@example.com");
      await assertSucceeds(setDoc(groupConfigRef(organizerA), cabinetConfig("organizer-a")));
      assert.equal((await assertSucceeds(getDoc(groupConfigRef(organizerB)))).data().folderId, "my-drive-folder");
      await assertSucceeds(setDoc(groupConfigRef(organizerB), cabinetConfig("organizer-b", {
        backing: "shared_drive",
        folderId: "shared-folder",
        driveId: "shared-drive",
      })));
      assert.equal((await assertSucceeds(getDoc(groupConfigRef(organizerB)))).data().configuredByUid, "organizer-b");
      await assertSucceeds(deleteDoc(groupConfigRef(organizerB)));
    });

    await t.test("viewer, pending, removed, unrelated and unauthenticated users are denied", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      await assertSucceeds(setDoc(groupConfigRef(organizerA), cabinetConfig("organizer-a")));
      const deniedContexts = [
        authenticated("viewer", "viewer@example.com"),
        authenticated("pending", "pending@example.com"),
        authenticated("removed", "removed@example.com"),
        authenticated("unrelated", "unrelated@example.com"),
        environment.unauthenticatedContext().firestore(),
      ];
      for (const db of deniedContexts) {
        await assertFails(getDoc(groupConfigRef(db)));
        await assertFails(setDoc(groupConfigRef(db), cabinetConfig("viewer")));
        await assertFails(deleteDoc(groupConfigRef(db)));
      }
    });

    await t.test("invalid or credential-bearing schemas are denied", async () => {
      await seed();
      const db = authenticated("organizer-a", "a@example.com");
      const invalidConfigs = [
        cabinetConfig("organizer-a", { unknownField: true }),
        cabinetConfig("organizer-a", { accessToken: "secret" }),
        cabinetConfig("organizer-a", { refreshToken: "secret" }),
        cabinetConfig("organizer-a", { oauthCredential: "secret" }),
        cabinetConfig("organizer-b"),
        cabinetConfig("organizer-a", { driveId: "not-allowed-for-my-drive" }),
        cabinetConfig("organizer-a", { backing: "shared_drive" }),
        cabinetConfig("organizer-a", { folderId: "bad/folder" }),
        cabinetConfig("organizer-a", {
          backing: "shared_drive",
          folderId: "shared-folder",
          driveId: "bad/drive",
        }),
      ];
      for (const invalid of invalidConfigs) {
        await assertFails(setDoc(groupConfigRef(db), invalid));
      }
    });

    await t.test("only a genuinely standalone roster can use the legacy fallback", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const standaloneRef = rosterConfigRef(organizerA, "standalone-roster");
      await assertSucceeds(setDoc(standaloneRef, cabinetConfig("organizer-a")));
      await assertSucceeds(getDoc(standaloneRef));
      await assertSucceeds(deleteDoc(standaloneRef));

      const linkedRef = rosterConfigRef(organizerA, "linked-roster");
      await assertFails(setDoc(linkedRef, cabinetConfig("organizer-a")));
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(rosterConfigRef(context.firestore(), "linked-roster"), cabinetConfig("organizer-a"));
      });
      await assertFails(getDoc(linkedRef));
      await assertFails(setDoc(linkedRef, cabinetConfig("organizer-a", { folderId: "replacement" })));
      await assertFails(deleteDoc(linkedRef));

      await assertSucceeds(setDoc(groupConfigRef(organizerA), cabinetConfig("organizer-a")));
      await assertSucceeds(getDoc(groupConfigRef(organizerA)));
    });

    await t.test("equal organizers can create, list, update and remove group Cabinet resources", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const organizerB = authenticated("organizer-b", "b@example.com");
      const driveRefA = groupResourceRef(organizerA);
      const driveRefB = groupResourceRef(organizerB);

      await assertSucceeds(setDoc(
        driveRefA,
        driveCabinetResource("organizer-a"),
      ));
      assert.equal(
        (await assertSucceeds(getDoc(driveRefB))).data().providerResourceId,
        "google-file-123",
      );
      const listed = await assertSucceeds(getDocs(
        collection(organizerB, "sharedGroups", "group-1", "cabinetResources"),
      ));
      assert.equal(listed.size, 1);

      await assertSucceeds(updateDoc(driveRefB, {
        displayName: "Updated training plan",
        contexts: [{ kind: "equipment", entityId: "equipment-1" }],
        updatedByUid: "organizer-b",
        updatedAt: serverTimestamp(),
      }));
      const updated = (await assertSucceeds(getDoc(driveRefA))).data();
      assert.equal(updated.displayName, "Updated training plan");
      assert.equal(updated.providerResourceId, "google-file-123");
      assert.deepEqual(updated.contexts, [
        { kind: "equipment", entityId: "equipment-1" },
      ]);

      await assertFails(deleteDoc(driveRefB));
      await assertSucceeds(updateDoc(driveRefB, {
        displayName: "Updated training plan",
        contexts: [{ kind: "cabinet" }],
        updatedByUid: "organizer-b",
        updatedAt: serverTimestamp(),
      }));
      await assertSucceeds(deleteDoc(driveRefB));
      assert.equal((await assertSucceeds(getDoc(driveRefA))).exists(), false);

      const externalRef = groupResourceRef(
        organizerA,
        "external-resource",
      );
      await assertSucceeds(setDoc(
        externalRef,
        externalCabinetResource("organizer-a"),
      ));
      assert.equal(
        (await assertSucceeds(getDoc(externalRef))).data().externalUrl,
        "https://example.com/club-guide",
      );
    });

    await t.test("generic group deletion preserves Action Board and Equipment relationships", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const relationshipCases = [
        {
          id: "action-origin",
          origin: { kind: "action_board", entityId: "card-1" },
          contexts: [],
        },
        {
          id: "equipment-origin",
          origin: { kind: "equipment", entityId: "equipment-1" },
          contexts: [],
        },
        {
          id: "action-context",
          origin: { kind: "cabinet" },
          contexts: [{ kind: "action_board", entityId: "card-1" }],
        },
        {
          id: "equipment-context",
          origin: { kind: "cabinet" },
          contexts: [{ kind: "equipment", entityId: "equipment-1" }],
        },
      ];

      for (const relationship of relationshipCases) {
        const resourceRef = groupResourceRef(organizerA, relationship.id);
        await assertSucceeds(setDoc(
          resourceRef,
          driveCabinetResource("organizer-a", relationship.id, {
            origin: relationship.origin,
            contexts: relationship.contexts,
          }),
        ));
        await assertFails(deleteDoc(resourceRef));
      }

      const cabinetOnlyRef = groupResourceRef(organizerA, "cabinet-only");
      await assertSucceeds(setDoc(
        cabinetOnlyRef,
        driveCabinetResource("organizer-a", "cabinet-only", {
          origin: { kind: "cabinet" },
          contexts: [{ kind: "cabinet" }],
        }),
      ));
      await assertSucceeds(deleteDoc(cabinetOnlyRef));

      const malformedRef = groupResourceRef(organizerA, "malformed-delete");
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          groupResourceRef(context.firestore(), "malformed-delete"),
          driveCabinetResource("organizer-a", "malformed-delete", {
            contexts: [{ kind: "unexpected" }],
          }),
        );
      });
      await assertFails(deleteDoc(malformedRef));
    });

    await t.test("non-organizers cannot discover or mutate the Cabinet resource index", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      await assertSucceeds(setDoc(
        groupResourceRef(organizerA),
        driveCabinetResource("organizer-a"),
      ));

      const deniedContexts = [
        authenticated("viewer", "viewer@example.com"),
        authenticated("pending", "pending@example.com"),
        authenticated("removed", "removed@example.com"),
        authenticated("unrelated", "unrelated@example.com"),
        environment.unauthenticatedContext().firestore(),
      ];
      for (const db of deniedContexts) {
        const resourceRef = groupResourceRef(db);
        await assertFails(getDoc(resourceRef));
        await assertFails(getDocs(
          collection(db, "sharedGroups", "group-1", "cabinetResources"),
        ));
        await assertFails(setDoc(
          groupResourceRef(db, "injected-resource"),
          driveCabinetResource("viewer", "injected-resource"),
        ));
        await assertFails(updateDoc(resourceRef, {
          displayName: "Injected",
          contexts: [],
          updatedByUid: "viewer",
          updatedAt: serverTimestamp(),
        }));
        await assertFails(deleteDoc(resourceRef));
      }
    });

    await t.test("organizers cannot cross workspace resource boundaries", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const otherOrganizer = authenticated("other-organizer", "other@example.com");
      await assertSucceeds(setDoc(
        groupResourceRef(otherOrganizer, "other-resource", "group-2"),
        driveCabinetResource("other-organizer", "other-resource"),
      ));

      const crossWorkspaceRef = groupResourceRef(
        organizerA,
        "other-resource",
        "group-2",
      );
      await assertFails(getDoc(crossWorkspaceRef));
      await assertFails(getDocs(
        collection(organizerA, "sharedGroups", "group-2", "cabinetResources"),
      ));
      await assertFails(setDoc(
        groupResourceRef(organizerA, "injected", "group-2"),
        driveCabinetResource("organizer-a", "injected"),
      ));
      await assertFails(updateDoc(crossWorkspaceRef, {
        displayName: "Cross-workspace update",
        contexts: [],
        updatedByUid: "organizer-a",
        updatedAt: serverTimestamp(),
      }));
      await assertFails(deleteDoc(crossWorkspaceRef));
    });

    await t.test("resource schema, provider references, attribution and contexts fail closed", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const fixedTimestamp = Timestamp.fromMillis(1_700_000_000_000);
      const fiveContexts = Array.from({ length: 5 }, (_, index) => ({
        kind: "action_board",
        entityId: `card-${index}`,
      }));
      const invalidResources = [
        withoutField(driveCabinetResource("organizer-a"), "schemaVersion"),
        driveCabinetResource("organizer-a", "drive-resource", { schemaVersion: 2 }),
        driveCabinetResource("organizer-a", "wrong-id", { resourceId: "another-id" }),
        driveCabinetResource("organizer-a", "drive-resource", { accessToken: "secret" }),
        driveCabinetResource("organizer-a", "drive-resource", { refreshToken: "secret" }),
        driveCabinetResource("organizer-a", "drive-resource", { oauthCredential: "secret" }),
        driveCabinetResource("organizer-a", "drive-resource", { createdByEmail: "a@example.com" }),
        driveCabinetResource("organizer-a", "drive-resource", { permissionIds: ["anyone"] }),
        driveCabinetResource("organizer-a", "drive-resource", { acl: ["public"] }),
        driveCabinetResource("organizer-a", "drive-resource", { fileBytes: [1, 2, 3] }),
        driveCabinetResource("organizer-a", "drive-resource", { unknownField: true }),
        driveCabinetResource("organizer-a", "drive-resource", { createdByUid: "organizer-b" }),
        driveCabinetResource("organizer-a", "drive-resource", { createdAt: fixedTimestamp }),
        driveCabinetResource("organizer-a", "drive-resource", { updatedByUid: "organizer-b" }),
        driveCabinetResource("organizer-a", "drive-resource", { updatedAt: fixedTimestamp }),
        driveCabinetResource("organizer-a", "drive-resource", { providerResourceId: "bad/id" }),
        driveCabinetResource("organizer-a", "drive-resource", { providerResourceId: "   " }),
        driveCabinetResource("organizer-a", "drive-resource", { providerResourceId: " google-file " }),
        driveCabinetResource("organizer-a", "drive-resource", { providerResourceId: null }),
        driveCabinetResource("organizer-a", "drive-resource", { externalUrl: "https://example.com" }),
        driveCabinetResource("organizer-a", "drive-resource", { resourceKind: "link" }),
        driveCabinetResource("organizer-a", "drive-resource", { provider: "dropbox" }),
        externalCabinetResource("organizer-a", "drive-resource", { externalUrl: "javascript:alert(1)" }),
        externalCabinetResource("organizer-a", "drive-resource", { providerResourceId: "google-file" }),
        externalCabinetResource("organizer-a", "drive-resource", { mimeType: "text/html" }),
        externalCabinetResource("organizer-a", "drive-resource", { resourceKind: "file" }),
        driveCabinetResource("organizer-a", "drive-resource", { origin: { kind: "unknown" } }),
        driveCabinetResource("organizer-a", "drive-resource", {
          origin: { kind: "cabinet", workspaceId: "group-2" },
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          origin: { kind: "action_board" },
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          contexts: [{ kind: "equipment", entityId: "group-2/item" }],
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          contexts: [{ kind: "equipment", entityId: " equipment-1 " }],
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          contexts: [{ kind: "action_board", entityId: "card-1", workspaceId: "group-2" }],
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          contexts: [{ kind: "cabinet" }, { kind: "cabinet" }],
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          contexts: ["cabinet"],
        }),
        driveCabinetResource("organizer-a", "drive-resource", {
          contexts: fiveContexts,
        }),
      ];

      for (const invalid of invalidResources) {
        await assertFails(setDoc(groupResourceRef(organizerA), invalid));
      }
      await assertFails(setDoc(
        groupResourceRef(organizerA, " padded-resource "),
        driveCabinetResource("organizer-a", " padded-resource "),
      ));
    });

    await t.test("presentation names and Drive MIME hints use nonblank current shapes", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      await assertFails(setDoc(
        groupResourceRef(organizerA),
        driveCabinetResource("organizer-a", "drive-resource", {
          displayName: "   ",
        }),
      ));
      await assertFails(setDoc(
        groupResourceRef(organizerA),
        driveCabinetResource("organizer-a", "drive-resource", {
          mimeType: "not-a-mime",
        }),
      ));
      await assertFails(setDoc(
        groupResourceRef(organizerA),
        driveCabinetResource("organizer-a", "drive-resource", {
          mimeType: "application/@@@@",
        }),
      ));
      await assertSucceeds(setDoc(
        groupResourceRef(organizerA),
        driveCabinetResource("organizer-a", "drive-resource", {
          displayName: "  Training plan  ",
          mimeType: "application/vnd.google-apps.document",
        }),
      ));
    });

    await t.test("external URLs require HTTP(S) without embedded credentials", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      await assertFails(setDoc(
        groupResourceRef(organizerA, "external-resource"),
        externalCabinetResource("organizer-a", "external-resource", {
          externalUrl: "https://person:secret@example.com/private",
        }),
      ));
      await assertFails(setDoc(
        groupResourceRef(organizerA, "external-resource"),
        externalCabinetResource("organizer-a", "external-resource", {
          externalUrl: "https://?missing-host=true",
        }),
      ));
      await assertSucceeds(setDoc(
        groupResourceRef(organizerA, "external-resource"),
        externalCabinetResource("organizer-a", "external-resource", {
          externalUrl: "https://example.com/path?contact=club@example.com",
        }),
      ));
      await assertSucceeds(setDoc(
        groupResourceRef(organizerA, "host-only-resource"),
        externalCabinetResource("organizer-a", "host-only-resource", {
          externalUrl: "https://example.com",
        }),
      ));
    });

    await t.test("provider identity, origin and creation attribution are immutable", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const organizerB = authenticated("organizer-b", "b@example.com");
      await assertSucceeds(setDoc(
        groupResourceRef(organizerA),
        driveCabinetResource("organizer-a"),
      ));
      const immutableUpdates = [
        { providerResourceId: "replacement-file" },
        { provider: "external_link" },
        { resourceKind: "folder" },
        { externalUrl: "https://example.com/replacement" },
        { mimeType: "application/vnd.google-apps.document" },
        { origin: { kind: "equipment", entityId: "equipment-1" } },
        { createdByUid: "organizer-b" },
        { createdAt: serverTimestamp() },
        { schemaVersion: 2 },
        { resourceId: "replacement-id" },
      ];
      for (const update of immutableUpdates) {
        await assertFails(updateDoc(groupResourceRef(organizerB), {
          ...update,
          updatedByUid: "organizer-b",
          updatedAt: serverTimestamp(),
        }));
      }
    });

    await t.test("an existing malformed resource cannot be blessed by an allowed-field update", async () => {
      await seed();
      const malformedId = "malformed-existing";
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          groupResourceRef(context.firestore(), malformedId),
          driveCabinetResource("organizer-a", malformedId, {
            accessToken: "must-not-survive",
          }),
        );
      });

      const organizerB = authenticated("organizer-b", "b@example.com");
      await assertFails(updateDoc(groupResourceRef(organizerB, malformedId), {
        displayName: "Attempted blessing",
        contexts: [],
        updatedByUid: "organizer-b",
        updatedAt: serverTimestamp(),
      }));
    });

    await t.test("only a genuinely standalone roster can use the G3 resource fallback", async () => {
      await seed();
      const organizerA = authenticated("organizer-a", "a@example.com");
      const standaloneRef = rosterResourceRef(organizerA, "standalone-roster");
      await assertSucceeds(setDoc(
        standaloneRef,
        driveCabinetResource("organizer-a"),
      ));
      assert.equal(
        (await assertSucceeds(getDoc(standaloneRef))).data().resourceId,
        "drive-resource",
      );
      assert.equal(
        (await assertSucceeds(getDocs(collection(
          organizerA,
          "sharedRosters",
          "standalone-roster",
          "cabinetResources",
        )))).size,
        1,
      );
      await assertFails(deleteDoc(standaloneRef));
      await assertSucceeds(updateDoc(standaloneRef, {
        displayName: "Standalone resource",
        contexts: [],
        updatedByUid: "organizer-a",
        updatedAt: serverTimestamp(),
      }));
      await assertSucceeds(deleteDoc(standaloneRef));

      const standaloneFeatureRef = rosterResourceRef(
        organizerA,
        "standalone-roster",
        "standalone-feature-origin",
      );
      await assertSucceeds(setDoc(
        standaloneFeatureRef,
        driveCabinetResource("organizer-a", "standalone-feature-origin", {
          origin: { kind: "action_board", entityId: "card-standalone" },
          contexts: [],
        }),
      ));
      await assertFails(deleteDoc(standaloneFeatureRef));

      const linkedRef = rosterResourceRef(organizerA, "linked-roster");
      await assertFails(setDoc(
        linkedRef,
        driveCabinetResource("organizer-a"),
      ));
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          rosterResourceRef(context.firestore(), "linked-roster"),
          driveCabinetResource("organizer-a"),
        );
      });
      await assertFails(getDoc(linkedRef));
      await assertFails(getDocs(collection(
        organizerA,
        "sharedRosters",
        "linked-roster",
        "cabinetResources",
      )));
      await assertFails(updateDoc(linkedRef, {
        displayName: "Linked fallback injection",
        contexts: [],
        updatedByUid: "organizer-a",
        updatedAt: serverTimestamp(),
      }));
      await assertFails(deleteDoc(linkedRef));
    });
  } finally {
    await environment.cleanup();
  }
});
