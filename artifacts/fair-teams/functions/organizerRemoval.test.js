"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOrganizerRemovalElectorate,
  evaluateOrganizerRemovalVote,
  memberDisplayName,
  organizerMembershipFingerprint,
  organizerUidsFromWorkspace,
  removeOrganizerMembership,
  requiredYesVotes,
  resolveMemberEmailByUid,
  resolveMemberUidByEmail,
} = require("./organizerRemoval");

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
    eligibleVoterUids: ["voter-a", "voter-b", "voter-c"],
    totalOrganizerCount: 4,
    eligibleOrganizerCount: 3,
    requiredYes: 3,
  });
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
  }, "target", "target@example.com"), {
    memberUids: ["remaining"],
    memberEmails: ["remaining@example.com"],
    pendingInviteEmails: ["pending@example.com"],
    roleByUid: { remaining: "organizer" },
    memberNamesByUid: { remaining: "Remaining" },
    memberNamesByEmail: { "remaining@example.com": "Remaining" },
    memberUidByEmail: { "remaining@example.com": "remaining" },
  });
});

test("linked-roster cleanup can resolve and remove a roster-specific target email", () => {
  const roster = {
    memberUids: ["remaining", "target"],
    memberEmails: ["remaining@example.com", "target+legacy@example.com"],
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
    pendingInviteEmails: [],
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
