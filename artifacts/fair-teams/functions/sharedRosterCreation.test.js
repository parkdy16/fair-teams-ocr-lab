"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  creationRequestDocumentId,
  createLinkedSharedRosterTransaction,
  SharedRosterCreationError,
} = require("./sharedRosterCreation");
const { WorkspaceRosterLinkageError } = require("./workspaceRosterLinkage");

const NOW_ISO = "2026-08-18T16:00:00.000Z";
const GROUP_ID = "group-a";
const REQUEST_ID = "request_1234567890abcdefghij";

function ref(documentPath) {
  return {
    id: documentPath.split("/").at(-1),
    path: documentPath,
  };
}

function snapshot(reference, value) {
  return {
    id: reference.id,
    ref: reference,
    exists: value !== undefined,
    data: () => value,
  };
}

function group(overrides = {}) {
  return {
    name: "Friday Football",
    ownerUid: "organizer-a",
    ownerEmail: "a@example.com",
    memberUids: ["organizer-a", "organizer-b", "viewer"],
    memberEmails: ["a@example.com", "b@example.com", "viewer@example.com"],
    pendingInviteEmails: ["pending@example.com"],
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
    rosterIds: ["existing-roster"],
    unrelated: "preserve-me",
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    creationRequestId: REQUEST_ID,
    groupId: GROUP_ID,
    name: "Shared Friday Football",
    rosterData: {
      id: "local-roster",
      name: "Shared Friday Football",
      players: [{ id: "player-a", name: "Player A" }],
      pairingRules: [],
      themeColor: "#6d28d9",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
    ...overrides,
  };
}

function harness({
  actorUid = "organizer-a",
  actorEmail = `${actorUid}@example.com`,
  groupData = group(),
  rosterId = "new-roster",
  existingRosters = {
    "existing-roster": { groupId: GROUP_ID, existing: true },
  },
  requestRecord,
  input = request(),
} = {}) {
  const groupRef = ref(`sharedGroups/${input.groupId || GROUP_ID}`);
  const rosterRef = ref(`sharedRosters/${rosterId}`);
  let requestDocumentId = "invalid-request";
  try {
    requestDocumentId = creationRequestDocumentId({
      actorUid: actorUid || "unauthenticated",
      groupId: input.groupId || GROUP_ID,
      creationRequestId: input.creationRequestId,
    });
  } catch {
    // The production helper must reject malformed input before reading this ref.
  }
  const requestRef = ref(`sharedRosterCreationRequests/${requestDocumentId}`);
  const events = [];
  const transaction = {
    async get(reference) {
      events.push({ type: "read", path: reference.path });
      if (reference.path === groupRef.path) return snapshot(reference, groupData);
      if (reference.path === requestRef.path) return snapshot(reference, requestRecord);
      if (reference.path.startsWith("sharedRosters/")) {
        return snapshot(reference, existingRosters[reference.id]);
      }
      return snapshot(reference, undefined);
    },
    async getAll(...references) {
      references.forEach((reference) => events.push({ type: "read", path: reference.path }));
      return references.map((reference) => snapshot(reference, existingRosters[reference.id]));
    },
    create(reference, data) {
      events.push({ type: "create", path: reference.path, data });
    },
    update(reference, data) {
      events.push({ type: "update", path: reference.path, data });
    },
  };
  const firestore = {
    collection(name) {
      assert.ok(
        name === "sharedRosters" || name === "sharedRosterCreationRequests",
        name,
      );
      return {
        doc(id) {
          return ref(`${name}/${id}`);
        },
      };
    },
  };

  return {
    events,
    execute: () => createLinkedSharedRosterTransaction({
      transaction,
      firestore,
      groupRef,
      requestRef,
      rosterRef,
      actor: actorUid ? { uid: actorUid, email: actorEmail } : null,
      input,
      nowIso: NOW_ISO,
      fieldValue: {
        serverTimestamp() {
          return { __serverTimestamp: true };
        },
      },
      maxTransactionDocuments: 440,
    }),
  };
}

function mutations(events) {
  return events.filter((event) => event.type === "create" || event.type === "update");
}

test("active organizer atomically creates a server-owned linked roster", async () => {
  const scenario = harness();
  const result = await scenario.execute();
  const writes = mutations(scenario.events);

  assert.equal(result.ok, true);
  assert.equal(result.roster.id, "new-roster");
  assert.deepEqual(writes.map((event) => `${event.type}:${event.path}`), [
    "create:sharedRosters/new-roster",
    `create:${scenario.events.find((event) => event.path.startsWith("sharedRosterCreationRequests/"))?.path}`,
    "update:sharedGroups/group-a",
  ]);
  assert.equal(writes[0].data.groupId, GROUP_ID);
  assert.equal(writes[0].data.ownerUid, "organizer-a");
  assert.equal(writes[0].data.ownerEmail, "a@example.com");
  assert.equal(writes[0].data.rosterData.name, "Shared Friday Football");
  assert.equal(writes[0].data.rosterData.players[0].id, "player-a");
  assert.equal(writes[0].data.playerCount, 1);
  assert.deepEqual(writes[0].data.memberUids, ["organizer-a", "organizer-b", "viewer"]);
  assert.equal(writes[0].data.roleByUid.viewer, "viewer");
  assert.equal(writes[1].data.uid, "organizer-a");
  assert.equal(writes[1].data.groupId, GROUP_ID);
  assert.equal(writes[1].data.rosterId, "new-roster");
  assert.equal(writes[1].data.requestIdentityHash.length, 64);
  assert.equal(writes[1].data.payloadFingerprint.length, 64);
  assert.deepEqual(Object.keys(writes[1].data).sort(), [
    "createdAt",
    "createdAtIso",
    "groupId",
    "payloadFingerprint",
    "requestIdentityHash",
    "rosterId",
    "schemaVersion",
    "uid",
  ]);
  assert.deepEqual(writes[2].data.rosterIds, ["existing-roster", "new-roster"]);
  assert.equal(writes[2].data.rosterIds.filter((id) => id === "new-roster").length, 1);
  assert.deepEqual(scenario.events.slice(0, 2).map((event) => event.path), [
    "sharedGroups/group-a",
    "sharedRosters/existing-roster",
  ]);
});

test("same committed request returns the original roster without another mutation", async () => {
  const first = harness();
  const firstResult = await first.execute();
  const firstWrites = mutations(first.events);
  const createdRoster = firstWrites.find((event) => event.path === "sharedRosters/new-roster").data;
  const createdRequest = firstWrites.find((event) => (
    event.path.startsWith("sharedRosterCreationRequests/")
  )).data;

  const replay = harness({
    rosterId: "unused-second-roster",
    input: request({
      rosterData: {
        ...request().rosterData,
        updatedAt: "2026-08-18T16:05:00.000Z",
        players: [{
          ...request().rosterData.players[0],
          updatedAt: "2026-08-18T16:05:00.000Z",
        }],
      },
    }),
    groupData: group({ rosterIds: ["existing-roster", "new-roster"] }),
    existingRosters: {
      "existing-roster": { groupId: GROUP_ID, existing: true },
      "new-roster": createdRoster,
    },
    requestRecord: createdRequest,
  });
  const replayResult = await replay.execute();

  assert.equal(firstResult.roster.id, "new-roster");
  assert.equal(replayResult.roster.id, "new-roster");
  assert.deepEqual(mutations(replay.events), []);
});

test("same request with changed validated payload fails without mutation", async () => {
  const first = harness();
  await first.execute();
  const firstWrites = mutations(first.events);
  const createdRoster = firstWrites.find((event) => event.path === "sharedRosters/new-roster").data;
  const createdRequest = firstWrites.find((event) => (
    event.path.startsWith("sharedRosterCreationRequests/")
  )).data;
  const changed = harness({
    rosterId: "must-not-exist",
    input: request({ name: "Changed name" }),
    groupData: group({ rosterIds: ["existing-roster", "new-roster"] }),
    existingRosters: {
      "existing-roster": { groupId: GROUP_ID },
      "new-roster": createdRoster,
    },
    requestRecord: createdRequest,
  });

  await assert.rejects(changed.execute(), (error) => (
    error instanceof SharedRosterCreationError && error.code === "already-exists"
  ));
  assert.deepEqual(mutations(changed.events), []);
});

test("a different request identity may create another roster", async () => {
  const scenario = harness({
    rosterId: "second-roster",
    input: request({ creationRequestId: "request_abcdefghij0987654321" }),
  });
  const result = await scenario.execute();
  assert.equal(result.roster.id, "second-roster");
  assert.equal(mutations(scenario.events).length, 3);
});

test("malformed creation identities fail before trusted reads", async () => {
  for (const creationRequestId of ["", "short", "bad/request", "contains spaces 123456789012345"]) {
    const scenario = harness({ input: request({ creationRequestId }) });
    await assert.rejects(scenario.execute(), (error) => (
      error instanceof SharedRosterCreationError && error.code === "invalid-argument"
    ));
    assert.deepEqual(scenario.events, []);
  }
});

test("a second equal organizer can create with their own server-derived creator identity", async () => {
  const scenario = harness({ actorUid: "organizer-b", actorEmail: "b@example.com" });
  const result = await scenario.execute();
  const rosterCreate = mutations(scenario.events)[0];

  assert.equal(result.roster.ownerUid, "organizer-b");
  assert.equal(result.roster.ownerEmail, "b@example.com");
  assert.equal(rosterCreate.data.ownerUid, "organizer-b");
  assert.equal(rosterCreate.data.roleByUid["organizer-a"], "organizer");
});

test("idempotency state cannot authorize viewer, member, pending, removed, unrelated or unauthenticated callers", async () => {
  const denied = [
    { actorUid: "viewer", actorEmail: "viewer@example.com" },
    {
      actorUid: "member",
      actorEmail: "member@example.com",
      groupData: group({
        memberUids: ["organizer-a", "organizer-b", "viewer", "member"],
        memberEmails: ["a@example.com", "b@example.com", "viewer@example.com", "member@example.com"],
        roleByUid: {
          "organizer-a": "organizer",
          "organizer-b": "editor",
          viewer: "viewer",
          member: "member",
        },
      }),
    },
    { actorUid: "pending", actorEmail: "pending@example.com" },
    {
      actorUid: "removed",
      actorEmail: "removed@example.com",
      groupData: group({
        roleByUid: {
          "organizer-a": "organizer",
          "organizer-b": "editor",
          viewer: "viewer",
          removed: "organizer",
        },
      }),
    },
    { actorUid: "unrelated", actorEmail: "unrelated@example.com" },
    { actorUid: "", actorEmail: "" },
  ];

  for (const deniedActor of denied) {
    const { actorUid, actorEmail, groupData } = deniedActor;
    const scenario = harness({
      actorUid,
      actorEmail,
      ...(groupData ? { groupData } : {}),
      requestRecord: {
        schemaVersion: 1,
        uid: actorUid,
        groupId: GROUP_ID,
        requestIdentityHash: "attacker-controlled-record",
        payloadFingerprint: "attacker-controlled-payload",
        rosterId: "existing-roster",
      },
    });
    await assert.rejects(scenario.execute(), (error) => {
      assert.ok(error instanceof SharedRosterCreationError, actorUid || "unauthenticated");
      assert.equal(error.code, actorUid ? "permission-denied" : "unauthenticated");
      return true;
    });
    assert.deepEqual(mutations(scenario.events), [], actorUid || "unauthenticated");
  }
});

test("legacy owner fallback remains limited to an active member without an explicit role", async () => {
  const legacyGroup = group({
    ownerUid: "legacy-owner",
    ownerEmail: "legacy@example.com",
    memberUids: ["legacy-owner"],
    memberEmails: ["legacy@example.com"],
    memberUidByEmail: { "legacy@example.com": "legacy-owner" },
    roleByUid: {},
  });
  const scenario = harness({
    actorUid: "legacy-owner",
    actorEmail: "legacy@example.com",
    groupData: legacyGroup,
  });
  const result = await scenario.execute();
  assert.equal(result.roster.ownerUid, "legacy-owner");
});

test("malicious authority fields are rejected before any trusted read or write", async () => {
  const maliciousInputs = [
    request({ roleByUid: { attacker: "organizer" } }),
    request({ memberUids: ["attacker"] }),
    request({ pendingInviteEmails: ["attacker@example.com"] }),
    request({ rosterIds: ["foreign-roster"] }),
    request({ organizerGovernanceEligibleAtByUid: { attacker: NOW_ISO } }),
    request({ ownerUid: "attacker" }),
    request({ rosterData: { ...request().rosterData, groupId: "group-b" } }),
    request({ rosterData: { ...request().rosterData, roleByUid: { attacker: "organizer" } } }),
  ];

  for (const input of maliciousInputs) {
    const scenario = harness({ input });
    await assert.rejects(scenario.execute(), (error) => (
      error instanceof SharedRosterCreationError && error.code === "invalid-argument"
    ));
    assert.deepEqual(scenario.events, []);
  }
});

test("requesting a different group cannot bypass that group's organizer authority", async () => {
  const scenario = harness({
    input: request({ groupId: "group-b" }),
    groupData: group({
      ownerUid: "organizer-b",
      ownerEmail: "b@example.com",
      memberUids: ["organizer-b"],
      memberEmails: ["b@example.com"],
      memberUidByEmail: { "b@example.com": "organizer-b" },
      roleByUid: { "organizer-b": "organizer" },
      rosterIds: [],
    }),
    existingRosters: {},
  });
  await assert.rejects(scenario.execute(), (error) => (
    error instanceof SharedRosterCreationError && error.code === "permission-denied"
  ));
  assert.deepEqual(mutations(scenario.events), []);
});

test("invalid existing linkage aborts before either side of the new link is scheduled", async () => {
  const scenario = harness({
    groupData: group({ rosterIds: ["existing-roster", "injected-roster"] }),
    existingRosters: {
      "existing-roster": { groupId: GROUP_ID },
      "injected-roster": { groupId: "group-b", privateMarker: "do-not-leak" },
    },
  });
  await assert.rejects(scenario.execute(), (error) => {
    assert.ok(error instanceof WorkspaceRosterLinkageError);
    assert.equal(error.code, "failed-precondition");
    assert.doesNotMatch(error.message, /group-b|injected-roster|do-not-leak/);
    return true;
  });
  assert.deepEqual(mutations(scenario.events), []);
});

test("callable authenticates first and delegates creation to the production transaction helper", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const body = source.slice(
    source.indexOf("exports.createLinkedSharedRoster ="),
    source.indexOf("exports.createWorkspaceOrganizerInvitation ="),
  );
  assert.match(body, /if \(!request\.auth\).*unauthenticated/);
  assert.match(body, /createLinkedSharedRosterTransaction/);
  assert.match(body, /db\.collection\("sharedRosters"\)\.doc\(\)/);
  assert.match(body, /db\.collection\(SHARED_ROSTER_CREATION_REQUEST_COLLECTION\)/);
  assert.doesNotMatch(body, /request\.data\?\.(ownerUid|memberUids|roleByUid|rosterIds)/);
});

test("live client creation uses only the callable and no longer mutates group linkage", () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "sharedRosterService.ts"),
    "utf8",
  );
  const callableSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "sharedRosterCreationService.ts"),
    "utf8",
  );
  const attemptSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "sharedRosterCreationAttempt.ts"),
    "utf8",
  );
  const cardSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "FirebaseSharedRosterPublishCard.tsx"),
    "utf8",
  );
  const createBody = serviceSource.slice(
    serviceSource.indexOf("async function createFirebaseSharedRosterAttempt"),
    serviceSource.indexOf("export async function deleteFirebaseSharedRoster"),
  );
  const deleteBody = serviceSource.slice(
    serviceSource.indexOf("export async function deleteFirebaseSharedRoster"),
    serviceSource.indexOf("export async function deleteFirebaseSharedGroup"),
  );

  assert.match(createBody, /createLinkedSharedRoster\(\{/);
  assert.match(createBody, /creationRequestId: attempt\.creationRequestId/);
  assert.match(createBody, /recordSharedRosterCreationResult\(attempt, created\.id\)/);
  assert.match(createBody, /preserveCreatedRosterWhenRatingSeedFails/);
  assert.match(createBody, /sharedRosterCreationInFlight/);
  assert.doesNotMatch(createBody, /addDoc|writeBatch|arrayUnion|rosterIds/);
  assert.match(callableSource, /"createLinkedSharedRoster"/);
  assert.match(callableSource, /creationRequestId: input\.creationRequestId/);
  assert.doesNotMatch(callableSource, /addDoc|setDoc|updateDoc|writeBatch|arrayUnion/);
  assert.match(attemptSource, /localStorage/);
  assert.match(cardSource, /adoptFirebaseSharedRosterCreation\(activeRoster\.id, created\.id\)/);
  assert.match(cardSource, /refreshWarning = "The shared-roster list could not refresh yet\."/);
  assert.doesNotMatch(deleteBody, /arrayRemove|rosterIds|writeBatch|deleteDoc/);
  assert.match(deleteBody, /workspace closure/);
});

test("rules reserve linked creation and rosterIds mutation for trusted Admin code", () => {
  const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  const organizerUpdate = rules.slice(
    rules.indexOf("function organizerUpdateKeepsGovernance()"),
    rules.indexOf("function validOrganizerSelfLeave()"),
  );
  const groupRules = rules.slice(
    rules.indexOf("match /sharedGroups/{groupId}"),
    rules.indexOf("match /sharedRosters/{rosterId}"),
  );
  const rosterRules = rules.slice(
    rules.indexOf("match /sharedRosters/{rosterId}"),
    rules.indexOf("match /fairTeamsUsers/{uid}"),
  );

  assert.match(
    organizerUpdate,
    /request\.resource\.data\.get\("rosterIds", \[\]\) == resource\.data\.get\("rosterIds", \[\]\)/,
  );
  assert.match(organizerUpdate, /keys\(\)\.hasAny\(\["rosterIds"\]\)/);
  assert.match(groupRules, /keys\(\)\.hasAll\(\["rosterIds"\]\)/);
  assert.match(groupRules, /request\.resource\.data\.rosterIds\.size\(\) == 0/);
  assert.match(rosterRules, /request\.resource\.data\.get\("groupId", ""\) == ""/);
  assert.match(rules, /match \/sharedRosterCreationRequests\/\{requestId\}[\s\S]*allow read, write: if false/);
});
