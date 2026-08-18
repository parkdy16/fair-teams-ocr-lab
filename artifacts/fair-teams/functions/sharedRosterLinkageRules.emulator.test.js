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
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-stripes-p0s2-linkage-rules";
const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

function group(overrides = {}) {
  return {
    app: "Stripes",
    schemaVersion: 2,
    name: "Friday Football",
    ownerUid: "organizer-a",
    ownerEmail: "a@example.com",
    memberUids: ["organizer-a", "organizer-b", "viewer"],
    memberEmails: ["a@example.com", "b@example.com", "viewer@example.com"],
    pendingInviteEmails: ["b@example.com", "pending@example.com"],
    memberNamesByUid: {
      "organizer-a": "Organizer A",
      "organizer-b": "Organizer B",
      viewer: "Viewer",
    },
    memberNamesByEmail: {
      "a@example.com": "Organizer A",
      "b@example.com": "Organizer B",
      "viewer@example.com": "Viewer",
    },
    memberUidByEmail: {
      "a@example.com": "organizer-a",
      "b@example.com": "organizer-b",
      "viewer@example.com": "viewer",
    },
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
      viewer: "viewer",
    },
    organizerJoinedAtByUid: {
      "organizer-a": "2026-01-01T00:00:00.000Z",
      "organizer-b": "2026-01-02T00:00:00.000Z",
    },
    organizerGovernanceEligibleAtByUid: {
      "organizer-a": "2026-01-15T00:00:00.000Z",
      "organizer-b": "2026-01-16T00:00:00.000Z",
    },
    rosterIds: ["linked-roster"],
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function roster(overrides = {}) {
  return {
    app: "Stripes",
    schemaVersion: 2,
    name: "Shared Friday Football",
    ownerUid: "organizer-a",
    ownerEmail: "a@example.com",
    memberUids: ["organizer-a", "organizer-b", "viewer"],
    memberEmails: ["a@example.com", "b@example.com", "viewer@example.com"],
    pendingInviteEmails: [],
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
      viewer: "viewer",
    },
    version: 12,
    playerCount: 1,
    rosterData: { players: [{ id: "player-a", name: "Player A" }] },
    ...overrides,
  };
}

function cabinetConfig(uid) {
  return {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "my-drive-folder",
    displayName: "Friday Football Cabinet",
    configuredByUid: uid,
    configuredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

test("P0-S2 rules make group rosterIds client-immutable without regressing governance", async (t) => {
  const environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  const authenticated = (uid, email = `${uid}@example.com`) => (
    environment.authenticatedContext(uid, { email }).firestore()
  );

  const seed = async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "sharedGroups", "group-1"), group());
      await setDoc(doc(db, "sharedRosters", "linked-roster"), roster({ groupId: "group-1" }));
      await setDoc(doc(db, "sharedRosters", "standalone-roster"), roster({
        memberUids: ["organizer-a"],
        memberEmails: ["a@example.com"],
        roleByUid: { "organizer-a": "organizer" },
      }));
      await setDoc(doc(db, "sharedRosterCreationRequests", "request-hash"), {
        schemaVersion: 1,
        uid: "organizer-a",
        groupId: "group-1",
        requestIdentityHash: "request-hash",
        payloadFingerprint: "payload-hash",
        rosterId: "linked-roster",
      });
    });
  };

  try {
    await t.test("organizer and viewer cannot add remove replace or reorder rosterIds", async () => {
      await seed();
      const organizer = authenticated("organizer-a", "a@example.com");
      const viewer = authenticated("viewer", "viewer@example.com");
      const groupRef = doc(organizer, "sharedGroups", "group-1");
      for (const rosterIds of [
        ["linked-roster", "injected-roster"],
        [],
        ["replacement-roster"],
        ["linked-roster", "linked-roster"],
      ]) {
        await assertFails(updateDoc(groupRef, { rosterIds }));
      }
      await assertFails(updateDoc(doc(viewer, "sharedGroups", "group-1"), {
        rosterIds: ["linked-roster", "injected-roster"],
      }));

      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "sharedGroups", "empty-existing-group"), group({
          rosterIds: [],
        }));
      });
      await assertFails(updateDoc(
        doc(organizer, "sharedGroups", "empty-existing-group"),
        { rosterIds: deleteField() },
      ));

      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "sharedGroups", "two-roster-group"), group({
          rosterIds: ["reorder-roster-a", "reorder-roster-b"],
        }));
        await setDoc(doc(db, "sharedRosters", "reorder-roster-a"), roster({
          groupId: "two-roster-group",
        }));
        await setDoc(doc(db, "sharedRosters", "reorder-roster-b"), roster({
          groupId: "two-roster-group",
        }));
      });
      const twoRosterGroupRef = doc(organizer, "sharedGroups", "two-roster-group");
      await assertFails(updateDoc(twoRosterGroupRef, {
        rosterIds: ["reorder-roster-b", "reorder-roster-a"],
      }));
      assert.deepEqual(
        (await assertSucceeds(getDoc(twoRosterGroupRef))).data().rosterIds,
        ["reorder-roster-a", "reorder-roster-b"],
      );
    });

    await t.test("normal organizer metadata updates and Cabinet config still work", async () => {
      await seed();
      const organizer = authenticated("organizer-a", "a@example.com");
      const groupRef = doc(organizer, "sharedGroups", "group-1");
      await assertSucceeds(updateDoc(groupRef, {
        name: "Friday Football Club",
        updatedAtIso: "2026-08-18T17:00:00.000Z",
      }));
      assert.deepEqual((await assertSucceeds(getDoc(groupRef))).data().rosterIds, ["linked-roster"]);

      const cabinetRef = doc(organizer, "sharedGroups", "group-1", "cabinet", "config");
      await assertSucceeds(setDoc(cabinetRef, cabinetConfig("organizer-a")));
      assert.equal((await assertSucceeds(getDoc(cabinetRef))).data().folderId, "my-drive-folder");
      await assertSucceeds(deleteDoc(cabinetRef));
    });

    await t.test("self-leave remains allowed and cannot alter rosterIds", async () => {
      await seed();
      const organizerB = authenticated("organizer-b", "b@example.com");
      const groupRef = doc(organizerB, "sharedGroups", "group-1");
      await assertSucceeds(updateDoc(groupRef, {
        memberUids: ["organizer-a", "viewer"],
        memberEmails: ["a@example.com", "viewer@example.com"],
        pendingInviteEmails: ["pending@example.com"],
        roleByUid: { "organizer-a": "organizer", viewer: "viewer" },
        memberNamesByUid: { "organizer-a": "Organizer A", viewer: "Viewer" },
        memberNamesByEmail: {
          "a@example.com": "Organizer A",
          "viewer@example.com": "Viewer",
        },
        memberUidByEmail: {
          "a@example.com": "organizer-a",
          "viewer@example.com": "viewer",
        },
        organizerJoinedAtByUid: {
          "organizer-a": "2026-01-01T00:00:00.000Z",
        },
        organizerGovernanceEligibleAtByUid: {
          "organizer-a": "2026-01-15T00:00:00.000Z",
        },
        updatedAtIso: "2026-08-18T17:00:00.000Z",
      }));
      let storedGroup;
      await environment.withSecurityRulesDisabled(async (context) => {
        storedGroup = (await getDoc(
          doc(context.firestore(), "sharedGroups", "group-1"),
        )).data();
      });
      assert.deepEqual(storedGroup, group({
        memberUids: ["organizer-a", "viewer"],
        memberEmails: ["a@example.com", "viewer@example.com"],
        pendingInviteEmails: ["pending@example.com"],
        roleByUid: { "organizer-a": "organizer", viewer: "viewer" },
        memberNamesByUid: { "organizer-a": "Organizer A", viewer: "Viewer" },
        memberNamesByEmail: {
          "a@example.com": "Organizer A",
          "viewer@example.com": "Viewer",
        },
        memberUidByEmail: {
          "a@example.com": "organizer-a",
          "viewer@example.com": "viewer",
        },
        organizerJoinedAtByUid: {
          "organizer-a": "2026-01-01T00:00:00.000Z",
        },
        organizerGovernanceEligibleAtByUid: {
          "organizer-a": "2026-01-15T00:00:00.000Z",
        },
        rosterIds: ["linked-roster"],
        updatedAtIso: "2026-08-18T17:00:00.000Z",
      }));
    });

    await t.test("governance-protected membership fields remain protected", async () => {
      await seed();
      const organizer = authenticated("organizer-a", "a@example.com");
      const groupRef = doc(organizer, "sharedGroups", "group-1");
      await assertFails(updateDoc(groupRef, {
        memberUids: ["organizer-a", "organizer-b", "viewer", "attacker"],
      }));
      await assertFails(updateDoc(groupRef, {
        roleByUid: {
          "organizer-a": "organizer",
          "organizer-b": "editor",
          viewer: "organizer",
        },
      }));
      await assertFails(updateDoc(groupRef, { pendingInviteEmails: [] }));
    });

    await t.test("linked roster creation is server-only while standalone compatibility remains", async () => {
      await seed();
      const organizer = authenticated("organizer-a", "a@example.com");
      await assertFails(setDoc(doc(organizer, "sharedRosters", "client-linked"), roster({
        groupId: "group-1",
      })));
      await assertSucceeds(setDoc(doc(organizer, "sharedRosters", "client-standalone"), roster({
        memberUids: ["organizer-a"],
        memberEmails: ["a@example.com"],
        pendingInviteEmails: [],
        roleByUid: { "organizer-a": "organizer" },
      })));
      assert.equal((await assertSucceeds(getDoc(
        doc(organizer, "sharedRosters", "client-standalone"),
      ))).data().groupId, undefined);
    });

    await t.test("new groups cannot be created with injected linkage", async () => {
      await seed();
      const organizer = authenticated("organizer-a", "a@example.com");
      await assertFails(setDoc(doc(organizer, "sharedGroups", "poisoned-group"), group({
        memberUids: ["organizer-a"],
        memberEmails: ["a@example.com"],
        pendingInviteEmails: [],
        roleByUid: { "organizer-a": "organizer" },
        rosterIds: ["linked-roster"],
      })));
      await assertSucceeds(setDoc(doc(organizer, "sharedGroups", "empty-group"), group({
        memberUids: ["organizer-a"],
        memberEmails: ["a@example.com"],
        pendingInviteEmails: [],
        roleByUid: { "organizer-a": "organizer" },
        rosterIds: [],
      })));
      const missingRosterIds = group({
        memberUids: ["organizer-a"],
        memberEmails: ["a@example.com"],
        pendingInviteEmails: [],
        roleByUid: { "organizer-a": "organizer" },
      });
      delete missingRosterIds.rosterIds;
      await assertFails(setDoc(
        doc(organizer, "sharedGroups", "missing-linkage-field"),
        missingRosterIds,
      ));
    });

    await t.test("existing mature shared-roster reads remain available to members", async () => {
      await seed();
      const organizer = authenticated("organizer-b", "b@example.com");
      const viewer = authenticated("viewer", "viewer@example.com");
      assert.equal((await assertSucceeds(getDoc(
        doc(organizer, "sharedRosters", "linked-roster"),
      ))).data().version, 12);
      assert.equal((await assertSucceeds(getDoc(
        doc(viewer, "sharedRosters", "linked-roster"),
      ))).data().playerCount, 1);
    });

    await t.test("creation request records remain server-only", async () => {
      await seed();
      const organizer = authenticated("organizer-a", "a@example.com");
      const viewer = authenticated("viewer", "viewer@example.com");
      const unauthenticated = environment.unauthenticatedContext().firestore();
      for (const db of [organizer, viewer, unauthenticated]) {
        const requestRef = doc(db, "sharedRosterCreationRequests", "request-hash");
        await assertFails(getDoc(requestRef));
        await assertFails(setDoc(requestRef, {
          schemaVersion: 1,
          uid: "organizer-a",
          groupId: "group-1",
          rosterId: "attacker-roster",
        }));
        await assertFails(deleteDoc(requestRef));
      }
    });
  } finally {
    await environment.cleanup();
  }
});
