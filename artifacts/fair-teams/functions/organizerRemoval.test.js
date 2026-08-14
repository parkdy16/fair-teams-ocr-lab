"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  activeWorkspaceNotificationRecipients,
  buildOrganizerRemovalElectorate,
  evaluateOrganizerRemovalVote,
  GOVERNANCE_ELIGIBILITY_DELAY_MS,
  governanceEligibleOrganizerUids,
  memberDisplayName,
  organizerMembershipFingerprint,
  organizerGovernanceEligibility,
  organizerUidsFromWorkspace,
  removeOrganizerMembership,
  requiredYesVotes,
  resolveMemberEmailByUid,
  resolveMemberUidByEmail,
} = require("./organizerRemoval");

const NOW = Date.parse("2026-08-14T12:00:00.000Z");

function notificationWorkspace(overrides = {}) {
  return {
    memberUids: ["organizer-a", "organizer-b"],
    memberEmails: ["organizer-a@example.com", "organizer-b@example.com"],
    memberUidByEmail: {
      "organizer-a@example.com": "organizer-a",
      "organizer-b@example.com": "organizer-b",
    },
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
    },
    ...overrides,
  };
}

test("notification sender authorization allows an active organizer", () => {
  assert.equal(organizerUidsFromWorkspace(notificationWorkspace()).includes("organizer-a"), true);
});

test("notification sender authorization preserves a legacy active editor", () => {
  assert.equal(organizerUidsFromWorkspace(notificationWorkspace()).includes("organizer-b"), true);
});

test("notification sender authorization rejects an explicit viewer member", () => {
  const workspace = notificationWorkspace({
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "viewer",
    },
  });
  assert.equal(organizerUidsFromWorkspace(workspace).includes("organizer-b"), false);
});

test("notification sender authorization rejects a UID absent from membership", () => {
  assert.equal(organizerUidsFromWorkspace(notificationWorkspace()).includes("not-a-member"), false);
});

test("notification recipients include an active organizer", () => {
  assert.deepEqual(activeWorkspaceNotificationRecipients(notificationWorkspace()), [
    { email: "organizer-a@example.com", uid: "organizer-a" },
    { email: "organizer-b@example.com", uid: "organizer-b" },
  ]);
});

test("notification recipients exclude a pending-only invitee", () => {
  const workspace = notificationWorkspace({
    pendingInviteEmails: ["pending@example.com"],
  });
  assert.equal(activeWorkspaceNotificationRecipients(workspace).some((item) => item.email === "pending@example.com"), false);
});

test("notification recipients include an active organizer with stale pending state only once", () => {
  const workspace = notificationWorkspace({
    memberEmails: ["ORGANIZER-A@example.com", "organizer-a@example.com", "organizer-b@example.com"],
    pendingInviteEmails: ["organizer-a@example.com"],
  });
  assert.deepEqual(activeWorkspaceNotificationRecipients(workspace), [
    { email: "organizer-a@example.com", uid: "organizer-a" },
    { email: "organizer-b@example.com", uid: "organizer-b" },
  ]);
});

test("notification recipients ignore cancelled expired stale and legacy invitation state", () => {
  ["cancelled", "expired", "stale", "legacy"].forEach((state) => {
    const pendingEmail = `${state}@example.com`;
    const workspace = notificationWorkspace({ pendingInviteEmails: [pendingEmail] });
    assert.equal(activeWorkspaceNotificationRecipients(workspace).some((item) => item.email === pendingEmail), false);
  });
});

test("notification recipients include a newly accepted organizer through active membership", () => {
  const workspace = notificationWorkspace({
    memberUids: ["organizer-a", "organizer-b", "accepted"],
    memberEmails: ["organizer-a@example.com", "organizer-b@example.com", "accepted@example.com"],
    pendingInviteEmails: [],
    memberUidByEmail: {
      "organizer-a@example.com": "organizer-a",
      "organizer-b@example.com": "organizer-b",
      "accepted@example.com": "accepted",
    },
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
      accepted: "organizer",
    },
  });
  assert.equal(activeWorkspaceNotificationRecipients(workspace).some((item) => item.email === "accepted@example.com"), true);
});

test("notification recipient filtering preserves unrelated active organizers", () => {
  const workspace = notificationWorkspace({
    memberUids: ["organizer-a", "organizer-b", "stale-member"],
    memberEmails: ["organizer-a@example.com", "organizer-b@example.com", "stale-member@example.com"],
    memberUidByEmail: {
      "organizer-a@example.com": "organizer-a",
      "organizer-b@example.com": "organizer-b",
      "stale-member@example.com": "stale-member",
    },
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
    },
  });
  assert.deepEqual(activeWorkspaceNotificationRecipients(workspace), [
    { email: "organizer-a@example.com", uid: "organizer-a" },
    { email: "organizer-b@example.com", uid: "organizer-b" },
  ]);
});

test("required Yes votes use the total organizer count, including the target", () => {
  assert.equal(requiredYesVotes(2), 2);
  assert.equal(requiredYesVotes(3), 2);
  assert.equal(requiredYesVotes(4), 3);
  assert.equal(requiredYesVotes(5), 3);
});

test("organizer membership includes active organizer roles and the legacy owner fallback", () => {
  assert.deepEqual(organizerUidsFromWorkspace({
    memberUids: ["organizer-b", "viewer", "legacy-owner", "organizer-a", "organizer-a"],
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "editor",
      viewer: "viewer",
    },
    ownerUid: "legacy-owner",
  }), ["legacy-owner", "organizer-a", "organizer-b"]);
});

test("an explicit non-organizer role does not receive the legacy owner fallback", () => {
  assert.deepEqual(organizerUidsFromWorkspace({
    memberUids: ["legacy-owner", "organizer"],
    roleByUid: {
      "legacy-owner": "viewer",
      organizer: "organizer",
    },
    ownerUid: "legacy-owner",
  }), ["organizer"]);
});

test("the electorate excludes the target but keeps the threshold based on all organizers", () => {
  assert.deepEqual(buildOrganizerRemovalElectorate({
    memberUids: ["target", "voter-c", "voter-a", "voter-b"],
    roleByUid: {
      target: "organizer",
      "voter-a": "organizer",
      "voter-b": "organizer",
      "voter-c": "organizer",
    },
  }, "target"), {
    organizerUids: ["target", "voter-a", "voter-b", "voter-c"],
    governanceEligibleOrganizerUids: ["target", "voter-a", "voter-b", "voter-c"],
    eligibleVoterUids: ["voter-a", "voter-b", "voter-c"],
    targetGovernanceEligible: true,
    totalOrganizerCount: 4,
    eligibleGovernanceOrganizerCount: 4,
    eligibleOrganizerCount: 3,
    requiredYes: 3,
  });
});

test("legacy active organizers without timing metadata remain governance eligible", () => {
  const workspace = notificationWorkspace();
  assert.deepEqual(organizerGovernanceEligibility(workspace, "organizer-a", NOW), {
    eligible: true,
    eligibleAtMillis: 0,
    legacy: true,
  });
  assert.deepEqual(governanceEligibleOrganizerUids(workspace, NOW), [
    "organizer-a",
    "organizer-b",
  ]);
});

test("new organizer eligibility activates automatically after fourteen days", () => {
  const eligibleAt = NOW + GOVERNANCE_ELIGIBILITY_DELAY_MS;
  const workspace = notificationWorkspace({
    organizerGovernanceEligibleAtByUid: { "organizer-b": eligibleAt },
  });
  assert.equal(organizerGovernanceEligibility(workspace, "organizer-b", NOW).eligible, false);
  assert.equal(organizerGovernanceEligibility(workspace, "organizer-b", eligibleAt).eligible, true);
});

test("one eligible organizer plus a waiting target cannot create a proposal", () => {
  assert.throws(() => buildOrganizerRemovalElectorate(notificationWorkspace({
    organizerGovernanceEligibleAtByUid: {
      "organizer-b": NOW + GOVERNANCE_ELIGIBILITY_DELAY_MS,
    },
  }), "organizer-b", NOW), /at least two governance-eligible organizers/i);
});

test("two eligible organizers can target a waiting organizer only at a two-Yes threshold", () => {
  const workspace = {
    memberUids: ["organizer-a", "organizer-c", "waiting-target"],
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-c": "organizer",
      "waiting-target": "organizer",
    },
    organizerGovernanceEligibleAtByUid: {
      "waiting-target": NOW + GOVERNANCE_ELIGIBILITY_DELAY_MS,
    },
  };
  const electorate = buildOrganizerRemovalElectorate(workspace, "waiting-target", NOW);
  assert.equal(electorate.targetGovernanceEligible, false);
  assert.equal(electorate.totalOrganizerCount, 2);
  assert.equal(electorate.eligibleOrganizerCount, 2);
  assert.equal(electorate.requiredYes, 2);
  assert.deepEqual(electorate.eligibleVoterUids, ["organizer-a", "organizer-c"]);
  assert.equal(evaluateOrganizerRemovalVote({
    totalOrganizerCount: 2,
    eligibleOrganizerCount: 2,
    yesCount: 1,
    noCount: 0,
  }).status, "open");
  assert.equal(evaluateOrganizerRemovalVote({
    totalOrganizerCount: 2,
    eligibleOrganizerCount: 2,
    yesCount: 2,
    noCount: 0,
  }).status, "passed");
});

test("two eligible organizers with one as target preserve unilateral-removal protection", () => {
  const electorate = buildOrganizerRemovalElectorate(notificationWorkspace(), "organizer-b", NOW);
  assert.equal(electorate.targetGovernanceEligible, true);
  assert.equal(electorate.totalOrganizerCount, 2);
  assert.equal(electorate.eligibleOrganizerCount, 1);
  assert.equal(electorate.requiredYes, 2);
  assert.equal(evaluateOrganizerRemovalVote({
    totalOrganizerCount: 2,
    eligibleOrganizerCount: 1,
    yesCount: 0,
    noCount: 0,
  }).status, "failed");
});

test("three eligible organizers with one as target require two Yes votes", () => {
  const workspace = notificationWorkspace({
    memberUids: ["organizer-a", "organizer-b", "organizer-c"],
    roleByUid: {
      "organizer-a": "organizer",
      "organizer-b": "organizer",
      "organizer-c": "organizer",
    },
  });
  const electorate = buildOrganizerRemovalElectorate(workspace, "organizer-b", NOW);
  assert.equal(electorate.totalOrganizerCount, 3);
  assert.equal(electorate.requiredYes, 2);
  assert.deepEqual(electorate.eligibleVoterUids, ["organizer-a", "organizer-c"]);
});

test("a proposal electorate remains frozen when a waiting organizer later matures", () => {
  const eligibleAt = NOW + GOVERNANCE_ELIGIBILITY_DELAY_MS;
  const workspace = {
    memberUids: ["target", "voter-a", "voter-b", "waiting"],
    roleByUid: {
      target: "organizer",
      "voter-a": "organizer",
      "voter-b": "organizer",
      waiting: "organizer",
    },
    organizerGovernanceEligibleAtByUid: { waiting: eligibleAt },
  };
  const frozen = buildOrganizerRemovalElectorate(workspace, "target", NOW);
  assert.deepEqual(frozen.eligibleVoterUids, ["voter-a", "voter-b"]);
  assert.deepEqual(
    buildOrganizerRemovalElectorate(workspace, "target", eligibleAt).eligibleVoterUids,
    ["voter-a", "voter-b", "waiting"],
  );
  assert.deepEqual(frozen.eligibleVoterUids, ["voter-a", "voter-b"]);
});

test("an organizer accepted after proposal creation cannot join the frozen electorate", () => {
  const workspaceAtCreation = {
    memberUids: ["target", "voter-a", "voter-b"],
    roleByUid: {
      target: "organizer",
      "voter-a": "organizer",
      "voter-b": "organizer",
    },
  };
  const frozen = buildOrganizerRemovalElectorate(workspaceAtCreation, "target", NOW);
  const workspaceAfterAcceptance = {
    ...workspaceAtCreation,
    memberUids: [...workspaceAtCreation.memberUids, "newcomer"],
    roleByUid: {
      ...workspaceAtCreation.roleByUid,
      newcomer: "organizer",
    },
    organizerGovernanceEligibleAtByUid: {
      newcomer: NOW + GOVERNANCE_ELIGIBILITY_DELAY_MS,
    },
  };

  assert.deepEqual(frozen.eligibleVoterUids, ["voter-a", "voter-b"]);
  assert.deepEqual(
    buildOrganizerRemovalElectorate(
      workspaceAfterAcceptance,
      "target",
      NOW + GOVERNANCE_ELIGIBILITY_DELAY_MS,
    ).eligibleVoterUids,
    ["newcomer", "voter-a", "voter-b"],
  );
  assert.deepEqual(frozen.eligibleVoterUids, ["voter-a", "voter-b"]);
});

test("target lookup prefers the email map and supports legacy parallel membership arrays", () => {
  assert.equal(resolveMemberUidByEmail({
    memberUidByEmail: { "Target@Example.com": "mapped-target" },
    memberEmails: ["target@example.com"],
    memberUids: ["fallback-target"],
  }, " target@example.com "), "mapped-target");
  assert.equal(resolveMemberUidByEmail({
    memberEmails: ["first@example.com", "target@example.com"],
    memberUids: ["first", "legacy-target"],
  }, "TARGET@example.com"), "legacy-target");
});

test("target email lookup prefers the UID map and supports legacy owner metadata", () => {
  assert.equal(resolveMemberEmailByUid({
    memberUidByEmail: { "Target@Example.com": "target" },
    memberEmails: ["fallback@example.com"],
    memberUids: ["target"],
  }, "target"), "target@example.com");
  assert.equal(resolveMemberEmailByUid({ ownerUid: "target", ownerEmail: "OWNER@example.com" }, "target"), "owner@example.com");
});

test("organizer removal strips only active membership mappings and preserves unrelated data", () => {
  assert.deepEqual(removeOrganizerMembership({
    memberUids: ["target", "remaining"],
    memberEmails: ["TARGET@example.com", "remaining@example.com"],
    pendingInviteEmails: ["target@example.com", "pending@example.com"],
    roleByUid: { target: "organizer", remaining: "organizer" },
    memberNamesByUid: { target: "Target", remaining: "Remaining" },
    memberNamesByEmail: { "Target@Example.com": "Target", "remaining@example.com": "Remaining" },
    memberUidByEmail: { "stale-target@example.com": "target", "remaining@example.com": "remaining" },
    organizerJoinedAtByUid: { target: 1, remaining: 2 },
    organizerGovernanceEligibleAtByUid: { target: 3, remaining: 4 },
  }, "target", "target@example.com"), {
    memberUids: ["remaining"],
    memberEmails: ["remaining@example.com"],
    pendingInviteEmails: ["pending@example.com"],
    roleByUid: { remaining: "organizer" },
    memberNamesByUid: { remaining: "Remaining" },
    memberNamesByEmail: { "remaining@example.com": "Remaining" },
    memberUidByEmail: { "remaining@example.com": "remaining" },
    organizerJoinedAtByUid: { remaining: 2 },
    organizerGovernanceEligibleAtByUid: { remaining: 4 },
  });
});

test("linked-roster cleanup can resolve and remove a roster-specific target email", () => {
  const roster = {
    memberUids: ["remaining", "target"],
    memberEmails: ["remaining@example.com", "target+legacy@example.com"],
    pendingInviteEmails: ["TARGET+legacy@example.com", "pending@example.com"],
    roleByUid: { remaining: "organizer", target: "organizer" },
    memberNamesByEmail: {
      "remaining@example.com": "Remaining",
      "target+legacy@example.com": "Target",
    },
    memberUidByEmail: {
      "remaining@example.com": "remaining",
      "target+legacy@example.com": "target",
    },
  };
  const rosterTargetEmail = resolveMemberEmailByUid(roster, "target");
  assert.equal(rosterTargetEmail, "target+legacy@example.com");
  assert.deepEqual(removeOrganizerMembership(roster, "target", rosterTargetEmail), {
    memberUids: ["remaining"],
    memberEmails: ["remaining@example.com"],
    pendingInviteEmails: ["pending@example.com"],
    roleByUid: { remaining: "organizer" },
    memberNamesByUid: {},
    memberNamesByEmail: { "remaining@example.com": "Remaining" },
    memberUidByEmail: { "remaining@example.com": "remaining" },
  });
});

test("target display names use UID, email, then a privacy-safe email prefix fallback", () => {
  assert.equal(memberDisplayName({ memberNamesByUid: { target: "Target Name" } }, "target", "target@example.com"), "Target Name");
  assert.equal(memberDisplayName({ memberNamesByEmail: { "TARGET@example.com": "Email Name" } }, "target", "target@example.com"), "Email Name");
  assert.equal(memberDisplayName({}, "target", "target@example.com"), "target");
});

test("organizer membership fingerprints are stable across ordering and duplicates", () => {
  const first = organizerMembershipFingerprint(["voter-b", "target", "voter-a", "voter-a"]);
  const second = organizerMembershipFingerprint(["voter-a", "voter-b", "target"]);
  assert.equal(first, second);
  assert.notEqual(first, organizerMembershipFingerprint(["voter-a", "target"]));
});

test("a two-organizer proposal is unreachable without a unilateral vote", () => {
  assert.deepEqual(evaluateOrganizerRemovalVote({ totalOrganizerCount: 2, yesCount: 0, noCount: 0 }), {
    status: "failed",
    outcomeReason: "yes_threshold_unreachable",
    totalOrganizerCount: 2,
    eligibleOrganizerCount: 1,
    requiredYes: 2,
    yesCount: 0,
    noCount: 0,
    castCount: 0,
    remainingCount: 1,
  });
});

test("three organizers pass at two Yes votes and fail after one No vote", () => {
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 3, yesCount: 1, noCount: 0 }).status, "open");
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 3, yesCount: 2, noCount: 0 }).status, "passed");
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 3, yesCount: 0, noCount: 1 }).status, "failed");
});

test("four organizers require unanimous eligible Yes votes", () => {
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 4, yesCount: 2, noCount: 0 }).status, "open");
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 4, yesCount: 3, noCount: 0 }).status, "passed");
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 4, yesCount: 0, noCount: 1 }).status, "failed");
});

test("five organizers pass at three Yes votes and fail when two No votes make that unreachable", () => {
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 5, yesCount: 2, noCount: 0 }).status, "open");
  assert.deepEqual(
    evaluateOrganizerRemovalVote({ totalOrganizerCount: 5, yesCount: 3, noCount: 0 }),
    {
      status: "passed",
      outcomeReason: "yes_threshold_reached",
      totalOrganizerCount: 5,
      eligibleOrganizerCount: 4,
      requiredYes: 3,
      yesCount: 3,
      noCount: 0,
      castCount: 3,
      remainingCount: 1,
    },
  );
  assert.equal(evaluateOrganizerRemovalVote({ totalOrganizerCount: 5, yesCount: 0, noCount: 2 }).status, "failed");
});

test("invalid electorate and ballot counts are rejected", () => {
  assert.throws(() => requiredYesVotes(1), RangeError);
  assert.throws(() => buildOrganizerRemovalElectorate({
    memberUids: ["organizer-a", "organizer-b"],
    roleByUid: { "organizer-a": "organizer", "organizer-b": "organizer" },
  }, "missing-target"), RangeError);
  assert.throws(() => evaluateOrganizerRemovalVote({ totalOrganizerCount: 3, yesCount: 2, noCount: 1 }), RangeError);
  assert.throws(() => evaluateOrganizerRemovalVote({ totalOrganizerCount: 3, yesCount: -1, noCount: 0 }), RangeError);
});
