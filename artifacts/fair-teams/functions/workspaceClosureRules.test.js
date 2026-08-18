"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
const leaveSource = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "sharedRosterService.ts"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return source.slice(from, to);
}

test("workspace closure checkpoints and direct parent deletion remain server-only", () => {
  assert.match(rulesSource, /match \/sharedWorkspaceClosures\/\{closureId\}[\s\S]*?allow read, write: if false;/);
  const groupRules = section(rulesSource, "match /sharedGroups/{groupId}", "match /sharedRosters/{rosterId}");
  assert.match(groupRules, /allow delete: if false;/);
  const rosterRules = rulesSource.slice(rulesSource.indexOf("match /sharedRosters/{rosterId}"));
  assert.match(rosterRules, /allow delete: if false;/);
});

test("trusted closure atomically rechecks organizer authority and deletes authoritative parents", () => {
  const closeCallable = section(indexSource, "exports.closeSharedWorkspace", "exports.listWorkspaceOrganizerInvitations");
  assert.match(closeCallable, /runTransaction/);
  assert.match(closeCallable, /validateWorkspaceClosure/);
  assert.match(closeCallable, /where\("groupId", "==", workspaceId\)/);
  assert.match(closeCallable, /linkedRosterSnap\.docs\.forEach\(\(document\) => tx\.delete\(document\.ref\)\)/);
  assert.match(closeCallable, /tx\.delete\(groupRef\)/);
  assert.match(closeCallable, /tx\.delete\(rosterRef\)/);
  assert.doesNotMatch(closeCallable, /sendResendEmail|getMessaging\(|sendEachForMulticast/);
});

test("closure conflicts safely with concurrent invitation acceptance or membership writes", () => {
  const closeCallable = section(indexSource, "exports.closeSharedWorkspace", "exports.listWorkspaceOrganizerInvitations");
  const acceptanceCallable = section(indexSource, "exports.acceptWorkspaceOrganizerInvitation", "exports.startOrganizerRemovalProposal");
  assert.match(closeCallable, /runTransaction/);
  assert.match(closeCallable, /const groupSnap = await tx\.get\(groupRef\)/);
  assert.match(closeCallable, /tx\.delete\(groupRef\)/);
  assert.match(acceptanceCallable, /runTransaction/);
  assert.match(acceptanceCallable, /groupSnap/);
  assert.match(acceptanceCallable, /tx\.update\(groupRef/);
});

test("missing parents can be recovered through the original closer's server-only checkpoint", () => {
  const stateCallable = section(indexSource, "exports.getSharedWorkspaceClosureState", "exports.closeSharedWorkspace");
  const closeCallable = section(indexSource, "exports.closeSharedWorkspace", "exports.listWorkspaceOrganizerInvitations");
  assert.match(stateCallable, /where\("rosterIds", "array-contains", rosterId\)/);
  assert.match(stateCallable, /resumableWorkspaceClosure/);
  assert.match(stateCallable, /if \(resumable\) return resumable/);
  assert.ok(
    stateCallable.indexOf("resumableWorkspaceClosure") < stateCallable.indexOf("const rosterSnap"),
    "Checkpoint recovery must happen before requiring the deleted roster parent.",
  );
  assert.match(closeCallable, /if \(closureSnap\.exists\)/);
  assert.match(closeCallable, /existing\.closedByUid !== request\.auth\.uid/);
  assert.match(closeCallable, /await finishWorkspaceClosureCleanup\(db, cleanup\)/);
  assert.match(closeCallable, /await closureRef\.delete\(\)/);
});

test("cleanup covers descendants, invitations, locks, notification metadata and canonical Storage", () => {
  const cleanup = section(indexSource, "async function finishWorkspaceClosureCleanup", "exports.getWorkspaceOrganizerInvitationContext");
  assert.match(cleanup, /db\.recursiveDelete/);
  assert.match(cleanup, /WORKSPACE_INVITATION_COLLECTION/);
  assert.match(cleanup, /WORKSPACE_INVITATION_LOCK_COLLECTION/);
  assert.match(cleanup, /SHARED_ROSTER_CREATION_REQUEST_COLLECTION/);
  assert.match(cleanup, /THREAD_COLLECTION/);
  assert.match(cleanup, /bucket\.deleteFiles\(\{ prefix, force: true \}\)/);
});

test("old invitation URLs fail closed as soon as the workspace parent is unavailable", () => {
  const context = section(indexSource, "exports.getWorkspaceOrganizerInvitationContext", "exports.getSharedWorkspaceClosureState");
  assert.match(context, /if \(!groupSnap\.exists\)/);
  assert.match(context, /This shared workspace is no longer available/);
});

test("ordinary leave remains membership-only and non-destructive", () => {
  const leave = section(leaveSource, "export async function leaveFirebaseSharedRosterAccess", "export async function removeFirebaseSharedGroupMember");
  assert.match(leave, /The last organizer cannot leave/);
  assert.doesNotMatch(leave, /\.delete\(|deleteFirebaseSharedRoster|deleteFirebaseSharedGroup/);
});
