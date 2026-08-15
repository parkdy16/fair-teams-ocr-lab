import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workspaceClosureConfirmationMatches } from "./sharedWorkspaceClosure.ts";

const serviceSource = readFileSync(new URL("./sharedWorkspaceClosureService.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const organizerShellSource = readFileSync(
  new URL("../components/FirebaseSharedRosterPublishCard.tsx", import.meta.url),
  "utf8",
);

function sourceSection(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("typed confirmation requires the authoritative workspace name", () => {
  assert.equal(workspaceClosureConfirmationMatches("Friday Football", "Friday Football"), true);
  assert.equal(workspaceClosureConfirmationMatches("Friday Football", " Friday Football "), true);
  assert.equal(workspaceClosureConfirmationMatches("Friday Football", "friday football"), false);
  assert.equal(workspaceClosureConfirmationMatches("Friday Football", "Friday  Football"), false);
  assert.equal(workspaceClosureConfirmationMatches("Friday Football", "Saturday Football"), false);
  assert.equal(workspaceClosureConfirmationMatches("Friday Football", ""), false);
});

test("client closure uses only trusted callable Functions", () => {
  assert.match(serviceSource, /"getSharedWorkspaceClosureState"/);
  assert.match(serviceSource, /"closeSharedWorkspace"/);
  assert.doesNotMatch(serviceSource, /deleteDoc|writeBatch|collection\(|doc\(/);
  assert.match(serviceSource, /cleanupPending: data\.cleanupPending === true/);
});

test("Organizer Club shell exposes distinct leave and closure actions", () => {
  const organizerModal = sourceSection(
    organizerShellSource,
    "const collaboratorsModal",
    "const backupHistoryModal",
  );
  assert.match(organizerModal, />\s*Leave shared roster\s*</);
  assert.match(organizerModal, /Close shared workspace/);
  assert.match(organizerModal, /You are the last organizer\. Invite another organizer before leaving, or close this shared workspace\./);
});

test("successful closure removes only linked local copies and returns to a safe local state", () => {
  const closeHandler = sourceSection(appSource, "const closeActiveSharedWorkspace", "const switchRoster");
  assert.match(closeHandler, /closeSharedWorkspace/);
  assert.match(closeHandler, /affectedRosterIds\.has/);
  assert.match(closeHandler, /source\.firebaseGroupId === affectedGroupId/);
  assert.match(closeHandler, /createRoster\(EMPTY_ROSTER_NAME, \[\]\)/);
  assert.match(closeHandler, /Shared workspace closed\./);
  assert.doesNotMatch(closeHandler, /localStorage\.clear|deleteFirebaseSharedRoster|deleteFirebaseSharedGroup/);
});

test("reload recovery presents a distinct finish-cleanup flow", () => {
  assert.match(organizerShellSource, /const checkingRecovery = Boolean\(activeSharedRosterId && !activeSharedRoster\)/);
  assert.match(organizerShellSource, /Workspace cleanup pending/);
  assert.match(organizerShellSource, /Finish workspace cleanup/);
  assert.match(appSource, /closeSharedConfirm\.cleanupPending \? "Finish workspace cleanup\?"/);
  assert.match(appSource, /!closeSharedConfirm\.cleanupPending && !workspaceClosureConfirmationMatches/);
  assert.match(appSource, /closeSharedWorkspace\(closeSharedConfirm, closeSharedConfirmationName\)/);
});
