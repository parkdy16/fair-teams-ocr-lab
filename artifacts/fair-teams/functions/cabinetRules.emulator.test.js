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
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
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
      await setDoc(doc(db, "sharedRosters", "standalone-roster"), rosterParent());
      await setDoc(doc(db, "sharedRosters", "linked-roster"), rosterParent({ groupId: "group-1" }));
    });
  };

  const authenticated = (uid, email = `${uid}@example.com`) =>
    environment.authenticatedContext(uid, { email }).firestore();
  const groupConfigRef = (db) => doc(db, "sharedGroups", "group-1", "cabinet", "config");
  const rosterConfigRef = (db, rosterId) => doc(db, "sharedRosters", rosterId, "cabinet", "config");

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
  } finally {
    await environment.cleanup();
  }
});
