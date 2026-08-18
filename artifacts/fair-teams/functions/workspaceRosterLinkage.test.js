"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  groupRosterIds,
  preflightGroupRosterLinkage,
  WorkspaceRosterLinkageError,
} = require("./workspaceRosterLinkage");

const GROUP_A = "group-a";
const ROSTER_A = "roster-a";
const ROSTER_B = "roster-b";

function snapshot(id, data) {
  return {
    id,
    exists: data !== undefined,
    data: () => data,
  };
}

function harness(rosters = {}) {
  const reads = [];
  const firestore = {
    collection(name) {
      assert.equal(name, "sharedRosters");
      return {
        doc(id) {
          return { id, path: `sharedRosters/${id}` };
        },
      };
    },
  };
  const transaction = {
    async getAll(...refs) {
      reads.push(...refs.map((ref) => ref.id));
      return refs.map((ref) => snapshot(ref.id, rosters[ref.id]));
    },
  };
  return { firestore, transaction, reads };
}

function isGenericLinkageFailure(error) {
  return error instanceof WorkspaceRosterLinkageError
    && error.code === "failed-precondition"
    && error.message === "This workspace has inconsistent linked-roster data. No changes were made.";
}

test("preflight returns the complete valid authoritative roster set", async () => {
  const testHarness = harness({
    [ROSTER_A]: { groupId: GROUP_A, label: "A" },
    [ROSTER_B]: { groupId: GROUP_A, label: "B" },
  });
  const result = await preflightGroupRosterLinkage({
    transaction: testHarness.transaction,
    firestore: testHarness.firestore,
    expectedGroupId: GROUP_A,
    workspace: { rosterIds: [ROSTER_A, ROSTER_B] },
  });

  assert.deepEqual(result.rosterIds, [ROSTER_A, ROSTER_B]);
  assert.deepEqual(result.rosterRefs.map((ref) => ref.id), [ROSTER_A, ROSTER_B]);
  assert.deepEqual(result.linkedRosters.map((roster) => roster.label), ["A", "B"]);
  assert.deepEqual(testHarness.reads, [ROSTER_A, ROSTER_B]);
});

test("cross-workspace, standalone, missing, and mixed linkage fail closed", async () => {
  const cases = [
    {
      name: "cross-workspace",
      rosterIds: [ROSTER_B],
      rosters: { [ROSTER_B]: { groupId: "group-b", privateMarker: "secret-b" } },
    },
    {
      name: "standalone",
      rosterIds: [ROSTER_B],
      rosters: { [ROSTER_B]: { privateMarker: "standalone-secret" } },
    },
    {
      name: "missing",
      rosterIds: [ROSTER_B],
      rosters: {},
    },
    {
      name: "mixed-valid-and-cross-workspace",
      rosterIds: [ROSTER_A, ROSTER_B],
      rosters: {
        [ROSTER_A]: { groupId: GROUP_A },
        [ROSTER_B]: { groupId: "group-b", privateMarker: "secret-b" },
      },
    },
  ];

  for (const scenario of cases) {
    const testHarness = harness(scenario.rosters);
    await assert.rejects(preflightGroupRosterLinkage({
      transaction: testHarness.transaction,
      firestore: testHarness.firestore,
      expectedGroupId: GROUP_A,
      workspace: { rosterIds: scenario.rosterIds },
    }), (error) => {
      assert.ok(isGenericLinkageFailure(error), scenario.name);
      assert.doesNotMatch(error.message, /secret|group-b|roster-b/i, scenario.name);
      return true;
    });
    assert.deepEqual(testHarness.reads, scenario.rosterIds, scenario.name);
  }
});

test("duplicates are deduplicated while preserving first-seen order", async () => {
  const testHarness = harness({
    [ROSTER_A]: { groupId: GROUP_A },
    [ROSTER_B]: { groupId: GROUP_A },
  });
  const result = await preflightGroupRosterLinkage({
    transaction: testHarness.transaction,
    firestore: testHarness.firestore,
    expectedGroupId: GROUP_A,
    workspace: { rosterIds: [ROSTER_B, ROSTER_A, ROSTER_B, ROSTER_A] },
  });

  assert.deepEqual(groupRosterIds({ rosterIds: [ROSTER_B, ROSTER_A, ROSTER_B] }), [
    ROSTER_B,
    ROSTER_A,
  ]);
  assert.deepEqual(result.rosterIds, [ROSTER_B, ROSTER_A]);
  assert.deepEqual(testHarness.reads, [ROSTER_B, ROSTER_A]);
});

test("missing rosterIds retains the intentional empty-linkage semantics", async () => {
  assert.deepEqual(groupRosterIds({}), []);
  assert.deepEqual(groupRosterIds({ rosterIds: undefined }), []);

  const testHarness = harness();
  const result = await preflightGroupRosterLinkage({
    transaction: testHarness.transaction,
    firestore: testHarness.firestore,
    expectedGroupId: GROUP_A,
    workspace: {},
  });
  assert.deepEqual(result.rosterIds, []);
  assert.deepEqual(result.rosterRefs, []);
  assert.deepEqual(result.linkedRosters, []);
  assert.deepEqual(testHarness.reads, []);
});

test("a present malformed rosterIds value fails before any Admin roster read", async () => {
  const malformedValues = [
    "roster-a",
    null,
    42,
    {},
    [ROSTER_A, null],
    [ROSTER_A, 42],
    [ROSTER_A, {}],
    [ROSTER_A, ""],
    [ROSTER_A, "   "],
    [ROSTER_A, " padded-id "],
    [ROSTER_A, "other/roster"],
    [ROSTER_A, "x".repeat(201)],
  ];

  for (const rosterIds of malformedValues) {
    const testHarness = harness({ [ROSTER_A]: { groupId: GROUP_A } });
    await assert.rejects(preflightGroupRosterLinkage({
      transaction: testHarness.transaction,
      firestore: testHarness.firestore,
      expectedGroupId: GROUP_A,
      workspace: { rosterIds },
    }), isGenericLinkageFailure);
    assert.deepEqual(testHarness.reads, [], JSON.stringify(rosterIds));
  }
});

test("transaction-size limits fail before any Admin roster read", async () => {
  const testHarness = harness({ [ROSTER_A]: { groupId: GROUP_A } });
  await assert.rejects(preflightGroupRosterLinkage({
    transaction: testHarness.transaction,
    firestore: testHarness.firestore,
    expectedGroupId: GROUP_A,
    workspace: { rosterIds: [ROSTER_A] },
    maxRosterCount: 0,
    tooLargeMessage: "Too many linked rosters.",
  }), (error) => (
    error instanceof WorkspaceRosterLinkageError
    && error.code === "resource-exhausted"
    && error.message === "Too many linked rosters."
  ));
  assert.deepEqual(testHarness.reads, []);
});

test("invitation and proposal transactions preflight linkage before protected mutation", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const callable = (name, nextName) => source.slice(
    source.indexOf(`exports.${name} =`),
    source.indexOf(`exports.${nextName} =`),
  );
  const expectations = [
    ["createWorkspaceOrganizerInvitation", "resendWorkspaceOrganizerInvitation", "tx.create(invitationRef"],
    ["cancelWorkspaceOrganizerInvitation", "getWorkspaceOrganizerInvitationContext", "tx.update(groupRef"],
    ["acceptWorkspaceOrganizerInvitation", "startOrganizerRemovalProposal", "tx.update(groupRef"],
    ["startOrganizerRemovalProposal", "getOrganizerRemovalState", "tx.create(proposalRef"],
  ];

  expectations.forEach(([name, nextName, firstProtectedMutation]) => {
    const body = callable(name, nextName);
    const preflightIndex = body.indexOf("await preflightGroupRosterLinkage(");
    const mutationIndex = body.indexOf(firstProtectedMutation);
    assert.ok(preflightIndex >= 0, `${name} must use the shared linkage preflight`);
    assert.ok(mutationIndex > preflightIndex, `${name} must preflight before protected mutation`);
    assert.doesNotMatch(body, /db\.collection\("sharedRosters"\)\.doc\(/);
  });
});

test("ballot callable delegates all transaction branch logic to the production helper", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const body = source.slice(
    source.indexOf("exports.castOrganizerRemovalBallot ="),
    source.indexOf("exports.registerPushInstallation ="),
  );

  assert.match(body, /castOrganizerRemovalBallotTransaction\(\{/);
  assert.doesNotMatch(body, /tx\.(create|set|update|delete)\(/);
  assert.doesNotMatch(body, /collection\("sharedRosters"\)\.doc\(/);
});

test("related non-consumers remain independent of group rosterIds", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const section = (name, nextName) => source.slice(
    source.indexOf(`exports.${name} =`),
    nextName ? source.indexOf(`exports.${nextName} =`) : source.length,
  );
  assert.doesNotMatch(
    section("resendWorkspaceOrganizerInvitation", "cancelWorkspaceOrganizerInvitation"),
    /rosterIds|preflightGroupRosterLinkage/,
  );
  assert.doesNotMatch(
    section("listWorkspaceRecipientInvitations", "acceptWorkspaceOrganizerInvitation"),
    /rosterIds|preflightGroupRosterLinkage/,
  );
  assert.doesNotMatch(
    section("notifyActionBoardStep", ""),
    /rosterIds|preflightGroupRosterLinkage/,
  );
  assert.match(
    section("closeSharedWorkspace", "listWorkspaceOrganizerInvitations"),
    /collection\("sharedRosters"\)\.where\("groupId", "==", workspaceId\)/,
  );
});
