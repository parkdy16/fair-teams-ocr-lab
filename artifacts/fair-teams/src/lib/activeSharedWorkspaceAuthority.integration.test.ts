import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("live authority consumers use canonical capabilities instead of cached firebaseRole", () => {
  const app = source("../App.tsx");
  const publishCard = source("../components/FirebaseSharedRosterPublishCard.tsx");
  const autosync = source("./sharedRosterAutosync.ts");
  const club = source("../components/ClubTab.tsx");
  const taskBoard = source("../components/TaskBoard.tsx");

  assert.match(app, /activeSharedCapabilities\.canUseFileCabinet/);
  assert.match(app, /activeSharedCapabilities\.canReadClubRatings/);
  assert.match(app, /activeSharedCapabilities\.canReadEquipment/);
  assert.match(autosync, /authority\.capabilities\.canEditSharedRoster/);
  assert.match(publishCard, /activeAuthority\.capabilities\.canUseClubAccess/);
  assert.match(club, /sharedCapabilities\.canReadAttendance/);
  assert.match(club, /sharedCapabilities\.canUseClubNotes/);
  assert.match(taskBoard, /canReadSharedBoard/);
  assert.match(taskBoard, /canEditSharedBoard/);
  assert.doesNotMatch(app, /firebaseRole\s*&&\s*\[/);
  assert.doesNotMatch(publishCard, /activeFirebaseSource\?\.firebaseRole\s*\|\|/);
});

test("shared roster save selects linked group only from live roster data", () => {
  const service = source("./sharedRosterService.ts");
  assert.match(service, /const rawGroupId = typeof data\.groupId === "string" \? data\.groupId : ""/);
  assert.match(service, /if \(rawGroupId !== groupId\)/);
  assert.doesNotMatch(service, /const groupId = [^\n]*source\.firebaseGroupId/);
});

test("authority listeners do not grant membership from cache-only snapshots", () => {
  const service = source("./sharedRosterService.ts");
  assert.match(service, /includeMetadataChanges: true/);
  assert.match(service, /snapshot\.metadata\.fromCache/);
});

test("Cabinet, ratings, Equipment, Attendance, Notes and Action Board receive authoritative gates", () => {
  const app = source("../App.tsx");
  assert.match(app, /fileCabinetNode=\{activeCanConfigureCabinet && activeCabinetScope/);
  assert.match(app, /equipmentGroupId=\{activeSharedCapabilities\.canReadEquipment/);
  assert.match(app, /sharedCapabilities=\{activeSharedCapabilities\}/);

  const club = source("../components/ClubTab.tsx");
  assert.match(club, /sharedCapabilities\.canReadClubRatings/);
  assert.match(club, /sharedCapabilities\.canEditEquipment/);
  assert.match(club, /sharedCapabilities\.canEditAttendance/);
  assert.match(club, /canReadSharedBoard=\{sharedCapabilities\.canReadActionBoard\}/);
});
