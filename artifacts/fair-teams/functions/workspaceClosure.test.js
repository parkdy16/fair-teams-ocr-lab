"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resumableWorkspaceClosure,
  validateWorkspaceClosure,
  workspaceClosureCleanupTargets,
  workspaceClosureId,
  workspaceClosureState,
} = require("./workspaceClosure");

function workspace(overrides = {}) {
  return {
    memberUids: ["organizer-a"],
    roleByUid: { "organizer-a": "organizer" },
    ownerUid: "historical-owner",
    ...overrides,
  };
}

test("last active organizer can close after exact workspace-name confirmation", () => {
  assert.deepEqual(validateWorkspaceClosure({
    actorUid: "organizer-a",
    workspace: workspace(),
    workspaceName: "Friday Football",
    confirmationName: "Friday Football",
  }), {
    workspaceName: "Friday Football",
    organizerCount: 1,
    isLastOrganizer: true,
    canClose: true,
    cleanupPending: false,
  });
});

test("original closer can rediscover unfinished cleanup after parents are gone", () => {
  assert.deepEqual(resumableWorkspaceClosure({
    actorUid: "organizer-a",
    rosterId: "roster-2",
    checkpoints: [{
      closedByUid: "organizer-a",
      workspaceKind: "group",
      workspaceId: "group-1",
      workspaceName: "Friday Football",
      groupId: "group-1",
      rosterId: "roster-1",
      rosterIds: ["roster-1", "roster-2"],
      cleanupStatus: "failed",
    }],
  }), {
    workspaceKind: "group",
    workspaceId: "group-1",
    workspaceName: "Friday Football",
    groupId: "group-1",
    rosterId: "roster-1",
    organizerCount: 1,
    isLastOrganizer: true,
    canClose: true,
    cleanupPending: true,
  });
});

test("another user and unrelated checkpoints cannot be discovered", () => {
  const checkpoints = [{
    closedByUid: "organizer-a",
    workspaceKind: "group",
    workspaceId: "group-1",
    workspaceName: "Friday Football",
    groupId: "group-1",
    rosterId: "roster-1",
    rosterIds: ["roster-1", "roster-2"],
    cleanupStatus: "failed",
  }];
  assert.equal(resumableWorkspaceClosure({
    actorUid: "organizer-b",
    rosterId: "roster-1",
    checkpoints,
  }), null);
  assert.equal(resumableWorkspaceClosure({
    actorUid: "organizer-a",
    rosterId: "unrelated-roster",
    checkpoints,
  }), null);
});

test("only unfinished checkpoints are resumable", () => {
  assert.equal(resumableWorkspaceClosure({
    actorUid: "organizer-a",
    rosterId: "roster-1",
    checkpoints: [{
      closedByUid: "organizer-a",
      workspaceKind: "roster",
      workspaceId: "roster-1",
      workspaceName: "Friday Football",
      groupId: null,
      rosterId: "roster-1",
      rosterIds: ["roster-1"],
      cleanupStatus: "complete",
    }],
  }), null);
});

test("non-last organizer cannot close the workspace", () => {
  assert.throws(() => validateWorkspaceClosure({
    actorUid: "organizer-a",
    workspace: workspace({
      memberUids: ["organizer-a", "organizer-b"],
      roleByUid: { "organizer-a": "organizer", "organizer-b": "editor" },
    }),
    workspaceName: "Friday Football",
    confirmationName: "Friday Football",
  }), /only when one active organizer remains/i);
});

test("nonmember and former historical creator cannot close", () => {
  assert.throws(() => workspaceClosureState({
    actorUid: "outsider",
    workspace: workspace(),
    workspaceName: "Friday Football",
  }), /active organizer/i);
  assert.throws(() => workspaceClosureState({
    actorUid: "historical-owner",
    workspace: workspace(),
    workspaceName: "Friday Football",
  }), /active organizer/i);
});

test("explicit destructive confirmation must match the authoritative name", () => {
  assert.throws(() => validateWorkspaceClosure({
    actorUid: "organizer-a",
    workspace: workspace(),
    workspaceName: "Friday Football",
    confirmationName: "Saturday Football",
  }), /name exactly/i);
  assert.throws(() => validateWorkspaceClosure({
    actorUid: "organizer-a",
    workspace: workspace(),
    workspaceName: "Friday Football",
    confirmationName: "friday football",
  }), /name exactly/i);
});

test("cleanup targets cover parents, descendants, notification metadata, invitations and Storage", () => {
  assert.deepEqual(workspaceClosureCleanupTargets({
    groupId: "group-1",
    rosterIds: ["roster-1", "roster-2", "roster-1"],
  }), {
    firestoreRoots: [
      { kind: "group", id: "group-1" },
      { kind: "roster", id: "roster-1" },
      { kind: "roster", id: "roster-2" },
    ],
    notificationScopes: [
      { kind: "group", id: "group-1" },
      { kind: "roster", id: "roster-1" },
      { kind: "roster", id: "roster-2" },
    ],
    storagePrefixes: [
      "sharedRosters/roster-1/resources/",
      "sharedRosters/roster-2/resources/",
    ],
    deleteInvitationStateForGroupId: "group-1",
  });
});

test("cleanup targets never expand to an unrelated workspace", () => {
  const targets = workspaceClosureCleanupTargets({
    groupId: "group-closing",
    rosterIds: ["roster-closing"],
  });
  assert.equal(targets.firestoreRoots.some((target) => target.id === "group-unrelated"), false);
  assert.equal(targets.firestoreRoots.some((target) => target.id === "roster-unrelated"), false);
  assert.deepEqual(targets.storagePrefixes, ["sharedRosters/roster-closing/resources/"]);
});

test("closure identifiers are opaque, stable and separated by workspace kind", () => {
  const groupId = workspaceClosureId("group", "same-id");
  const rosterId = workspaceClosureId("roster", "same-id");
  assert.match(groupId, /^[a-f0-9]{64}$/);
  assert.notEqual(groupId, rosterId);
  assert.equal(groupId, workspaceClosureId("group", "same-id"));
});
