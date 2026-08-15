import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const organizerShellSource = readFileSync(
  new URL("../components/FirebaseSharedRosterPublishCard.tsx", import.meta.url),
  "utf8",
);
const leaveServiceSource = readFileSync(
  new URL("./sharedRosterService.ts", import.meta.url),
  "utf8",
);

function sourceSection(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Organizer Club shell exposes the existing Leave shared roster flow", () => {
  const clubShell = sourceSection(appSource, "sharedToolsNode={(", "equipmentGroupId=");
  const organizerModal = sourceSection(
    organizerShellSource,
    "const collaboratorsModal",
    "const backupHistoryModal",
  );

  assert.match(clubShell, /onLeaveSharedRoster=/);
  assert.match(clubShell, /setLeaveSharedConfirmOpen\(true\)/);
  assert.match(organizerModal, /\(onLeaveSharedRoster \|\| onCloseSharedWorkspace\) && canManageCollaborators/);
  assert.match(organizerModal, />\s*Leave shared roster\s*</);
  assert.match(organizerModal, /onLeaveSharedRoster\(\)/);
});

test("leave confirmation reuses membership removal and never deletes workspace data", () => {
  const leaveHandler = sourceSection(
    appSource,
    "const leaveActiveSharedRoster",
    "const switchRoster",
  );

  assert.match(leaveHandler, /leaveFirebaseSharedRosterAccess\(firebaseRosterId\)/);
  assert.doesNotMatch(leaveHandler, /deleteFirebaseSharedRoster|deleteFirebaseSharedGroup/);
  assert.match(appSource, /It does not delete the shared roster or club data\./);
});

test("last-organizer protection remains authoritative and visible", () => {
  const leaveService = sourceSection(
    leaveServiceSource,
    "export async function leaveFirebaseSharedRosterAccess",
    "export async function removeFirebaseSharedGroupMember",
  );

  assert.match(leaveService, /organizerCountFromData\(groupData\) <= 1/);
  assert.match(leaveService, /organizerCountFromData\(rosterData\) <= 1/);
  assert.match(leaveService, /The last organizer cannot leave\./);
  assert.match(appSource, /The last organizer cannot leave this way\. Invite another organizer first\./);
  assert.match(appSource, /role="alert"/);
});

test("focused test resolves the live outer source tree", () => {
  assert.match(repositoryRoot, /fair-teams[\\/]$/);
  assert.doesNotMatch(import.meta.url, /src[\\/]src/);
});
