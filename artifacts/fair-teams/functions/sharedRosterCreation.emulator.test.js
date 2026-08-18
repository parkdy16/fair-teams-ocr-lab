"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  creationRequestDocumentId,
  createLinkedSharedRosterTransaction,
} = require("./sharedRosterCreation");

const PROJECT_ID = "demo-stripes-p0s2-creation";
const NOW_ISO = "2026-08-18T17:00:00.000Z";
const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

function group(overrides = {}) {
  return {
    name: "Friday Football",
    ownerUid: "organizer-a",
    ownerEmail: "a@example.com",
    memberUids: ["organizer-a", "organizer-b"],
    memberEmails: ["a@example.com", "b@example.com"],
    pendingInviteEmails: [],
    memberNamesByUid: {
      "organizer-a": "Organizer A",
      "organizer-b": "Organizer B",
    },
    memberNamesByEmail: {
      "a@example.com": "Organizer A",
      "b@example.com": "Organizer B",
    },
    memberUidByEmail: {
      "a@example.com": "organizer-a",
      "b@example.com": "organizer-b",
    },
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "organizer",
    },
    rosterIds: [],
    ...overrides,
  };
}

function input(groupId, name, creationRequestId) {
  return {
    creationRequestId,
    groupId,
    name,
    rosterData: {
      id: `local-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      players: [{ id: `player-${name.toLowerCase().replace(/\s+/g, "-")}`, name: "Player" }],
      pairingRules: [],
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
  };
}

async function createInTransaction(db, {
  actorUid,
  groupId,
  rosterId,
  name,
  creationRequestId = `request_${name.toLowerCase().replace(/\s+/g, "-")}_12345678901234567890`,
  beforeCommit,
}) {
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const rosterRef = db.collection("sharedRosters").doc(rosterId);
  const requestRef = db.collection("sharedRosterCreationRequests").doc(
    creationRequestDocumentId({ actorUid, groupId, creationRequestId }),
  );
  const requestInput = input(groupId, name, creationRequestId);
  let initialAttempt = true;
  return db.runTransaction(async (transaction) => {
    const result = await createLinkedSharedRosterTransaction({
      transaction,
      firestore: db,
      groupRef,
      requestRef,
      rosterRef,
      actor: { uid: actorUid, email: `${actorUid}@example.com` },
      input: requestInput,
      nowIso: NOW_ISO,
      fieldValue: FieldValue,
      maxTransactionDocuments: 440,
    });
    if (initialAttempt && beforeCommit) {
      initialAttempt = false;
      await beforeCommit();
    }
    return result;
  });
}

test("trusted linked-roster creation is atomic under concurrency and commit failure", async () => {
  const environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  const app = initializeApp({ projectId: PROJECT_ID }, "p0s2-shared-roster-creation-test");
  const db = getFirestore(app);

  try {
    await environment.clearFirestore();

    await db.collection("sharedGroups").doc("concurrent-group").set(group());
    let arrivals = 0;
    let release;
    const bothTransactionsReady = new Promise((resolve) => {
      release = resolve;
    });
    const beforeCommit = async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothTransactionsReady;
    };

    const [first, second] = await Promise.all([
      createInTransaction(db, {
        actorUid: "organizer-a",
        groupId: "concurrent-group",
        rosterId: "roster-a",
        name: "Roster A",
        beforeCommit,
      }),
      createInTransaction(db, {
        actorUid: "organizer-b",
        groupId: "concurrent-group",
        rosterId: "roster-b",
        name: "Roster B",
        beforeCommit,
      }),
    ]);

    assert.equal(first.roster.id, "roster-a");
    assert.equal(second.roster.id, "roster-b");
    const concurrentGroup = (await db.collection("sharedGroups").doc("concurrent-group").get()).data();
    assert.deepEqual([...concurrentGroup.rosterIds].sort(), ["roster-a", "roster-b"]);
    for (const rosterId of concurrentGroup.rosterIds) {
      const rosterSnap = await db.collection("sharedRosters").doc(rosterId).get();
      assert.equal(rosterSnap.exists, true);
      assert.equal(rosterSnap.data().groupId, "concurrent-group");
      assert.equal(concurrentGroup.rosterIds.filter((id) => id === rosterId).length, 1);
    }

    await db.collection("sharedGroups").doc("idempotent-group").set(group());
    let duplicateArrivals = 0;
    let releaseDuplicates;
    const bothDuplicatesReady = new Promise((resolve) => {
      releaseDuplicates = resolve;
    });
    const duplicateBeforeCommit = async () => {
      duplicateArrivals += 1;
      if (duplicateArrivals === 2) releaseDuplicates();
      await bothDuplicatesReady;
    };
    const duplicateRequestId = "same_request_12345678901234567890";
    const [duplicateFirst, duplicateSecond] = await Promise.all([
      createInTransaction(db, {
        actorUid: "organizer-a",
        groupId: "idempotent-group",
        rosterId: "duplicate-candidate-a",
        name: "Same roster",
        creationRequestId: duplicateRequestId,
        beforeCommit: duplicateBeforeCommit,
      }),
      createInTransaction(db, {
        actorUid: "organizer-a",
        groupId: "idempotent-group",
        rosterId: "duplicate-candidate-b",
        name: "Same roster",
        creationRequestId: duplicateRequestId,
        beforeCommit: duplicateBeforeCommit,
      }),
    ]);
    assert.equal(duplicateFirst.roster.id, duplicateSecond.roster.id);
    const idempotentGroupRef = db.collection("sharedGroups").doc("idempotent-group");
    const idempotentGroup = (await idempotentGroupRef.get()).data();
    assert.deepEqual(idempotentGroup.rosterIds, [duplicateFirst.roster.id]);
    const idempotentRosterQuery = await db.collection("sharedRosters")
      .where("groupId", "==", "idempotent-group")
      .get();
    assert.equal(idempotentRosterQuery.size, 1);

    const lostResponseRetry = await createInTransaction(db, {
      actorUid: "organizer-a",
      groupId: "idempotent-group",
      rosterId: "must-stay-unused",
      name: "Same roster",
      creationRequestId: duplicateRequestId,
    });
    assert.equal(lostResponseRetry.roster.id, duplicateFirst.roster.id);
    assert.equal((await db.collection("sharedRosters").where(
      "groupId",
      "==",
      "idempotent-group",
    ).get()).size, 1);

    await assert.rejects(createInTransaction(db, {
      actorUid: "organizer-a",
      groupId: "idempotent-group",
      rosterId: "changed-payload-must-not-exist",
      name: "Changed roster",
      creationRequestId: duplicateRequestId,
    }));
    assert.equal((await db.collection("sharedRosters").doc(
      "changed-payload-must-not-exist",
    ).get()).exists, false);

    const deliberateSecond = await createInTransaction(db, {
      actorUid: "organizer-a",
      groupId: "idempotent-group",
      rosterId: "deliberate-second-roster",
      name: "Same roster",
      creationRequestId: "different_request_12345678901234567890",
    });
    assert.equal(deliberateSecond.roster.id, "deliberate-second-roster");
    assert.deepEqual(
      new Set((await idempotentGroupRef.get()).data().rosterIds),
      new Set([duplicateFirst.roster.id, "deliberate-second-roster"]),
    );

    await assert.rejects(createInTransaction(db, {
      actorUid: "viewer",
      groupId: "idempotent-group",
      rosterId: "viewer-must-not-create",
      name: "Same roster",
      creationRequestId: duplicateRequestId,
    }));
    assert.equal(
      (await db.collection("sharedRosters").doc("viewer-must-not-create").get()).exists,
      false,
    );

    await db.collection("sharedGroups").doc("collision-group").set(group());
    await db.collection("sharedRosters").doc("collision-roster").set({
      groupId: "unrelated-group",
      marker: "preserve-existing",
    });
    await assert.rejects(createInTransaction(db, {
      actorUid: "organizer-a",
      groupId: "collision-group",
      rosterId: "collision-roster",
      name: "Collision",
    }));
    const collisionGroup = (await db.collection("sharedGroups").doc("collision-group").get()).data();
    const collisionRoster = (await db.collection("sharedRosters").doc("collision-roster").get()).data();
    assert.deepEqual(collisionGroup.rosterIds, []);
    assert.equal(collisionRoster.groupId, "unrelated-group");
    assert.equal(collisionRoster.marker, "preserve-existing");

    await db.collection("sharedGroups").doc("invalid-link-group").set(group({
      rosterIds: ["valid-existing", "foreign-existing"],
    }));
    await db.collection("sharedRosters").doc("valid-existing").set({
      groupId: "invalid-link-group",
    });
    await db.collection("sharedRosters").doc("foreign-existing").set({
      groupId: "foreign-group",
    });
    await assert.rejects(createInTransaction(db, {
      actorUid: "organizer-a",
      groupId: "invalid-link-group",
      rosterId: "must-not-exist",
      name: "Must Not Exist",
    }));
    assert.equal(
      (await db.collection("sharedRosters").doc("must-not-exist").get()).exists,
      false,
    );
    assert.deepEqual(
      (await db.collection("sharedGroups").doc("invalid-link-group").get()).data().rosterIds,
      ["valid-existing", "foreign-existing"],
    );
  } finally {
    await deleteApp(app);
    await environment.cleanup();
  }
});
