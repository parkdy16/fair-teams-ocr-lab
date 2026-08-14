"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
const sharedRosterService = fs.readFileSync(
  path.join(__dirname, "..", "src", "lib", "sharedRosterService.ts"),
  "utf8",
);
const functionsIndex = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");

test("pending recipients cannot read complete workspace or roster documents", () => {
  assert.doesNotMatch(rules, /signedInEmail\(\)\s+in\s+resource\.data\.pendingInviteEmails/);
  const memberOnlyReads = rules.match(
    /allow read: if signedIn\(\)\s*&& request\.auth\.uid in resource\.data\.memberUids;/g,
  ) || [];
  assert.equal(memberOnlyReads.length, 2);
});

test("organizers cannot bypass callables by changing pending invitation emails", () => {
  const organizerUpdate = rules.slice(
    rules.indexOf("function organizerUpdateKeepsGovernance()"),
    rules.indexOf("function validOrganizerSelfLeave()"),
  );
  assert.match(
    organizerUpdate,
    /request\.resource\.data\.get\("pendingInviteEmails", \[\]\)\s*== resource\.data\.get\("pendingInviteEmails", \[\]\)/,
  );
  assert.match(organizerUpdate, /organizerJoinedAtByUid/);
  assert.match(organizerUpdate, /organizerGovernanceEligibleAtByUid/);
});

test("self-leave removes only the signed-in organizer pending identity", () => {
  const selfLeaveRule = rules.slice(
    rules.indexOf("function validOrganizerSelfLeave()"),
    rules.indexOf("function groupPath(groupId)"),
  );
  assert.match(
    selfLeaveRule,
    /pendingInviteEmails[\s\S]{0,180}difference\(\[signedInEmail\(\)\]\.toSet\(\)\)/,
  );

  const selfLeaveClient = sharedRosterService.slice(
    sharedRosterService.indexOf("export async function leaveFirebaseSharedRosterAccess"),
    sharedRosterService.indexOf("export async function removeFirebaseSharedGroupMember"),
  );
  assert.match(selfLeaveClient, /pendingInviteEmails:\s*arrayRemove\(email\)/);
  assert.match(selfLeaveRule, /organizerJoinedAtByUid[\s\S]{0,260}affectedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/);
  assert.match(selfLeaveRule, /organizerGovernanceEligibleAtByUid[\s\S]{0,280}affectedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/);
  assert.match(selfLeaveClient, /removeCurrentUserFields\(groupData, true\)/);
});

test("protected removal callables enforce current and frozen governance eligibility", () => {
  const proposalCallable = functionsIndex.slice(
    functionsIndex.indexOf("exports.startOrganizerRemovalProposal"),
    functionsIndex.indexOf("exports.getOrganizerRemovalState"),
  );
  const ballotCallable = functionsIndex.slice(
    functionsIndex.indexOf("exports.castOrganizerRemovalBallot"),
    functionsIndex.indexOf("exports.registerPushInstallation"),
  );
  assert.match(proposalCallable, /organizerGovernanceEligibility/);
  assert.match(proposalCallable, /governanceEligibleUids\.length < 2/);
  assert.match(proposalCallable, /governanceEligibleOrganizerUids/);
  assert.match(ballotCallable, /organizerGovernanceEligibility/);
  assert.match(ballotCallable, /governanceEligibleOrganizerUids/);
  assert.match(ballotCallable, /eligibleVoterUids\.includes\(request\.auth\.uid\)/);
});

test("trusted acceptance owns governance timing and post-acceptance notification", () => {
  const acceptanceCallable = functionsIndex.slice(
    functionsIndex.indexOf("exports.acceptWorkspaceOrganizerInvitation"),
    functionsIndex.indexOf("exports.startOrganizerRemovalProposal"),
  );
  assert.match(acceptanceCallable, /Timestamp\.fromMillis\(now\)/);
  assert.match(acceptanceCallable, /GOVERNANCE_ELIGIBILITY_DELAY_MS/);
  assert.match(acceptanceCallable, /deliverOrganizerJoinedNotification/);
  assert.match(acceptanceCallable, /organizerJoinedNotificationStatus/);
});

test("clients have no direct membership-acceptance rule", () => {
  assert.doesNotMatch(rules, /validInviteAcceptance/);
  assert.doesNotMatch(rules, /allow update:[\s\S]{0,160}validInviteAcceptance/);
});

test("invitation records and locks remain server-only", () => {
  assert.match(
    rules,
    /match \/sharedWorkspaceInvitations\/\{invitationId\} \{\s*allow read, write: if false;/,
  );
  assert.match(
    rules,
    /match \/sharedWorkspaceInvitationLocks\/\{lockId\} \{\s*allow read, write: if false;/,
  );
  assert.match(
    rules,
    /match \/authEmailVerificationThrottles\/\{uid\} \{\s*allow read, write: if false;/,
  );
});
