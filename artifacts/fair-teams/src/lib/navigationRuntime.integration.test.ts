import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

function functionSlice(app: string, startMarker: string, endMarker: string) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}`);
  return app.slice(start, end);
}

test("accepted shared roster opens the existing Teams setup workflow without a Today tab", () => {
  const app = source("../App.tsx");
  const handoff = functionSlice(
    app,
    "const finishSharedInviteOpen",
    "const showRosterToolsNotice",
  );

  assert.match(handoff, /setTodayRosterChosen\(true\)/);
  assert.match(handoff, /setTeamsWorkspaceView\("setup"\)/);
  assert.match(handoff, /setActiveTab\(openedRoster\.players\.length > 0 \? "teams" : "players"\)/);
  assert.doesNotMatch(handoff, /setActiveTab\(["']today["']\)/);
});

test("Open Shared Rosters local actions use only current overlay and navigation state", () => {
  const app = source("../App.tsx");
  const openShared = functionSlice(
    app,
    "const openSharedRostersFromLocalFlow",
    "const visibleDriveBackupChoices",
  );

  assert.match(openShared, /closeClearRoster\(\)/);
  assert.match(openShared, /setRosterFilesOpen\(false\)/);
  assert.match(openShared, /closeRosterToolsPanel\(\)/);
  assert.match(openShared, /setActiveTab\("club"\)/);
  assert.match(openShared, /setSharedRosterLibraryOpenToken\(\(token\) => token \+ 1\)/);
  assert.equal((app.match(/openSharedRostersFromLocalFlow/g) || []).length, 3);
  const obsoleteSetter = ["setRoster", "ToolsOpen"].join("");
  assert.doesNotMatch(app, new RegExp(obsoleteSetter));
});

test("Club Open shared rosters action uses the mounted shared-library token", () => {
  const app = source("../App.tsx");
  assert.match(
    app,
    /onOpenSharedRosters=\{\(\) => \{\s*setSharedRosterLibraryOpenToken\(\(token\) => token \+ 1\);\s*\}\}/,
  );
  assert.match(app, /openLibraryToken=\{sharedRosterLibraryOpenToken\}/);

  const club = source("../components/ClubTab.tsx");
  assert.match(club, /window\.setTimeout\(\(\) => onOpenSharedRosters\(\), 0\)/);
});

test("live top-level navigation remains exactly Roster, Teams, and Club", () => {
  const app = source("../App.tsx");
  assert.match(app, /const APP_TAB_VALUES = \["players", "teams", "club"\] as const/);
  assert.match(app, /useRef<AppTab\[]>\(\["teams"\]\)/);
  assert.doesNotMatch(app, /setActiveTab\(["']today["']\)/);
  assert.doesNotMatch(app, /value=["']today["']/);
});
