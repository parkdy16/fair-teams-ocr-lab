"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { organizerMembershipFingerprint } = require("./organizerRemoval");
const {
  castOrganizerRemovalBallotTransaction,
} = require("./organizerRemovalTransaction");
const { WorkspaceRosterLinkageError } = require("./workspaceRosterLinkage");

const NOW = Date.parse("2026-08-18T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const GROUP_ID = "group-a";
const PROPOSAL_ID = "proposal-a";
const TARGET_UID = "target";
const VOTER_A_UID = "voter-a";
const VOTER_B_UID = "voter-b";

function ref(path) {
  return {
    id: path.split("/").at(-1),
    path,
    collection(name) {
      return {
        doc(id) {
          return ref(`${path}/${name}/${id}`);
        },
      };
    },
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

function membershipData(extra = {}) {
  return {
    memberUids: [TARGET_UID, VOTER_A_UID, VOTER_B_UID],
    memberEmails: ["target@example.com", "voter-a@example.com", "voter-b@example.com"],
    memberUidByEmail: {
      "target@example.com": TARGET_UID,
      "voter-a@example.com": VOTER_A_UID,
      "voter-b@example.com": VOTER_B_UID,
    },
    memberNamesByUid: {
      [TARGET_UID]: "Target",
      [VOTER_A_UID]: "Voter A",
      [VOTER_B_UID]: "Voter B",
    },
    memberNamesByEmail: {
      "target@example.com": "Target",
      "voter-a@example.com": "Voter A",
      "voter-b@example.com": "Voter B",
    },
    roleByUid: {
      [TARGET_UID]: "organizer",
      [VOTER_A_UID]: "organizer",
      [VOTER_B_UID]: "organizer",
    },
    unrelated: "preserve-me",
    ...extra,
  };
}

function createScenario(branch, { invalidLinkage = false } = {}) {
  const refs = {
    groupRef: ref(`sharedGroups/${GROUP_ID}`),
    proposalRef: ref(
      `sharedGroups/${GROUP_ID}/organizerRemovalProposals/${PROPOSAL_ID}`,
    ),
    privateRef: ref(
      `sharedGroups/${GROUP_ID}/organizerRemovalPrivate/${PROPOSAL_ID}`,
    ),
    controlRef: ref(`sharedGroups/${GROUP_ID}/organizerRemovalControl/state`),
    ballotRef: ref(
      `sharedGroups/${GROUP_ID}/organizerRemovalPrivate/${PROPOSAL_ID}`
      + `/ballots/${branch === "passed" || branch === "membership-changed" ? VOTER_B_UID : VOTER_A_UID}`,
    ),
  };
  const frozenOrganizerUids = [TARGET_UID, VOTER_A_UID, VOTER_B_UID];
  const currentFingerprint = organizerMembershipFingerprint(frozenOrganizerUids);
  const groupData = membershipData({
    rosterIds: invalidLinkage ? ["roster-a", "roster-b"] : ["roster-a"],
  });
  const proposalData = {
    status: "open",
    targetUid: TARGET_UID,
    totalOrganizerCount: 3,
    eligibleOrganizerCount: 2,
    targetGovernanceEligible: true,
  };
  const privateData = {
    targetUid: TARGET_UID,
    organizerUids: frozenOrganizerUids,
    governanceEligibleOrganizerUids: frozenOrganizerUids,
    eligibleVoterUids: [VOTER_A_UID, VOTER_B_UID],
    membershipFingerprint: branch === "membership-changed"
      ? organizerMembershipFingerprint([TARGET_UID, VOTER_A_UID])
      : currentFingerprint,
    votedUids: branch === "passed" ? [VOTER_A_UID] : [],
    yesCount: branch === "passed" ? 1 : 0,
    noCount: 0,
    castCount: branch === "passed" ? 1 : 0,
  };
  const values = new Map([
    [refs.groupRef.path, groupData],
    [refs.proposalRef.path, proposalData],
    [refs.privateRef.path, privateData],
    [refs.controlRef.path, { activeProposalId: PROPOSAL_ID }],
    [refs.ballotRef.path, undefined],
    ["sharedRosters/roster-a", membershipData({ groupId: GROUP_ID, rosterMarker: "A" })],
    ["sharedRosters/roster-b", membershipData({
      groupId: "group-b",
      rosterMarker: "B",
      privateMarker: "must-not-leak",
    })],
  ]);
  const events = [];
  const transaction = {
    async getAll(...requestedRefs) {
      requestedRefs.forEach((requestedRef) => events.push({
        type: "read",
        path: requestedRef.path,
      }));
      return requestedRefs.map((requestedRef) => snapshot(
        requestedRef,
        values.get(requestedRef.path),
      ));
    },
    create(reference, data) {
      events.push({ type: "create", path: reference.path, data });
    },
    update(reference, data) {
      events.push({ type: "update", path: reference.path, data });
    },
    set(reference, data) {
      events.push({ type: "set", path: reference.path, data });
    },
    delete(reference) {
      events.push({ type: "delete", path: reference.path });
    },
  };
  const firestore = {
    collection(name) {
      assert.equal(name, "sharedRosters");
      return {
        doc(id) {
          return ref(`sharedRosters/${id}`);
        },
      };
    },
  };

  return {
    actorUid: branch === "passed" || branch === "membership-changed"
      ? VOTER_B_UID
      : VOTER_A_UID,
    choice: branch === "failed" ? "no" : "yes",
    events,
    firestore,
    refs,
    transaction,
  };
}

async function executeScenario(scenario) {
  return castOrganizerRemovalBallotTransaction({
    transaction: scenario.transaction,
    firestore: scenario.firestore,
    refs: scenario.refs,
    actorUid: scenario.actorUid,
    groupId: GROUP_ID,
    proposalId: PROPOSAL_ID,
    choice: scenario.choice,
    nowMillis: NOW,
    nowIso: NOW_ISO,
    maxTransactionDocuments: 450,
    fieldValue: {
      serverTimestamp() {
        return { __serverTimestamp: true };
      },
    },
  });
}

function mutations(events) {
  return events.filter((event) => event.type !== "read");
}

function mutationPaths(events) {
  return mutations(events).map((event) => `${event.type}:${event.path}`);
}

for (const branch of ["open", "failed", "membership-changed", "passed"]) {
  test(`${branch} ballot branch rejects mixed valid/injected linkage before mutation`, async () => {
    const scenario = createScenario(branch, { invalidLinkage: true });
    await assert.rejects(executeScenario(scenario), (error) => {
      assert.ok(error instanceof WorkspaceRosterLinkageError);
      assert.equal(error.code, "failed-precondition");
      assert.equal(
        error.message,
        "This workspace has inconsistent linked-roster data. No changes were made.",
      );
      assert.doesNotMatch(error.message, /group-b|roster-b|must-not-leak/i);
      return true;
    });
    assert.deepEqual(mutations(scenario.events), []);
    assert.deepEqual(
      scenario.events.slice(-2).map((event) => `${event.type}:${event.path}`),
      ["read:sharedRosters/roster-a", "read:sharedRosters/roster-b"],
    );
  });
}

test("open ballot branch mutates only after complete valid linkage preflight", async () => {
  const scenario = createScenario("open");
  const result = await executeScenario(scenario);

  assert.equal(result.status, "open");
  assert.deepEqual(mutationPaths(scenario.events), [
    `create:${scenario.refs.ballotRef.path}`,
    `update:${scenario.refs.privateRef.path}`,
    `update:${scenario.refs.proposalRef.path}`,
  ]);
  assert.ok(
    scenario.events.findIndex((event) => event.type !== "read")
      > scenario.events.findIndex((event) => event.path === "sharedRosters/roster-a"),
  );
});

test("failed ballot branch closes governance only after complete valid linkage preflight", async () => {
  const scenario = createScenario("failed");
  const result = await executeScenario(scenario);

  assert.equal(result.status, "failed");
  assert.deepEqual(mutationPaths(scenario.events), [
    `update:${scenario.refs.proposalRef.path}`,
    `delete:${scenario.refs.privateRef.path}`,
    `delete:${scenario.refs.controlRef.path}`,
  ]);
  assert.ok(
    scenario.events.findIndex((event) => event.type !== "read")
      > scenario.events.findIndex((event) => event.path === "sharedRosters/roster-a"),
  );
});

test("membership-changed branch cancels only after complete valid linkage preflight", async () => {
  const scenario = createScenario("membership-changed");
  const result = await executeScenario(scenario);

  assert.equal(result.status, "cancelled");
  assert.equal(result.outcomeReason, "membership_changed");
  assert.deepEqual(mutationPaths(scenario.events), [
    `update:${scenario.refs.proposalRef.path}`,
    `delete:${scenario.refs.privateRef.path}`,
    `delete:${scenario.refs.controlRef.path}`,
  ]);
  assert.ok(
    scenario.events.findIndex((event) => event.type !== "read")
      > scenario.events.findIndex((event) => event.path === "sharedRosters/roster-a"),
  );
});

test("passed branch removes membership only after complete valid linkage preflight", async () => {
  const scenario = createScenario("passed");
  const result = await executeScenario(scenario);

  assert.equal(result.status, "passed");
  assert.deepEqual(mutationPaths(scenario.events), [
    `update:${scenario.refs.proposalRef.path}`,
    `update:${scenario.refs.groupRef.path}`,
    "update:sharedRosters/roster-a",
    `delete:${scenario.refs.privateRef.path}/ballots/${VOTER_A_UID}`,
    `delete:${scenario.refs.privateRef.path}`,
    `delete:${scenario.refs.controlRef.path}`,
  ]);
  assert.ok(
    scenario.events.findIndex((event) => event.type !== "read")
      > scenario.events.findIndex((event) => event.path === "sharedRosters/roster-a"),
  );
  const groupUpdate = mutations(scenario.events).find(
    (event) => event.type === "update" && event.path === scenario.refs.groupRef.path,
  );
  const rosterUpdate = mutations(scenario.events).find(
    (event) => event.type === "update" && event.path === "sharedRosters/roster-a",
  );
  assert.deepEqual(groupUpdate.data.memberUids, [VOTER_A_UID, VOTER_B_UID]);
  assert.deepEqual(rosterUpdate.data.memberUids, [VOTER_A_UID, VOTER_B_UID]);
  assert.equal(groupUpdate.data.unrelated, undefined);
  assert.equal(rosterUpdate.data.rosterMarker, undefined);
});
