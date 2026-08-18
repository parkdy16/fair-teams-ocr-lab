"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return source.slice(from, to);
}

test("Cabinet config schema is allow-listed and excludes credentials", () => {
  const validator = section(rules, "function validCabinetLocationConfig()", "match /sharedWorkspaceInvitationLocks");
  assert.match(validator, /keys\.hasOnly\(\[/);
  assert.match(validator, /"schemaVersion"/);
  assert.match(validator, /"provider"/);
  assert.match(validator, /"folderId"/);
  assert.match(validator, /"driveId"/);
  assert.doesNotMatch(validator, /accessToken|refreshToken|credential|oauth|email/i);
});

test("Shared Drive requires driveId while My Drive rejects it", () => {
  const validator = section(rules, "function validCabinetLocationConfig()", "match /sharedWorkspaceInvitationLocks");
  assert.match(validator, /backing == "my_drive"[\s\S]*?!keys\.hasAny\(\["driveId"\]\)/);
  assert.match(validator, /backing == "shared_drive"[\s\S]*?request\.resource\.data\.driveId is string/);
});

test("group and standalone-roster Cabinet metadata are organizer-only", () => {
  const groupRules = section(rules, "match /sharedGroups/{groupId}", "match /sharedRosters/{rosterId}");
  const rosterRules = rules.slice(rules.indexOf("match /sharedRosters/{rosterId}"));
  for (const [source, helper] of [[groupRules, "canEditGroupById"], [rosterRules, "canEditRosterById"]]) {
    const cabinet = section(source, "match /cabinet/{configDoc}", "match /taskBoard/{boardDoc}");
    assert.match(cabinet, new RegExp(`allow read:[\\s\\S]*?${helper}`));
    assert.match(cabinet, new RegExp(`allow create, update:[\\s\\S]*?${helper}`));
    assert.match(cabinet, new RegExp(`allow delete:[\\s\\S]*?${helper}`));
    assert.doesNotMatch(cabinet, /isGroupMemberById|isRosterMemberById/);
  }
});

test("legacy roster Cabinet fallback requires an actually standalone roster", () => {
  const helper = section(rules, "function isStandaloneRosterById", "function validCabinetLocationConfig");
  assert.match(helper, /get\(rosterPath\(rosterId\)\)\.data\.get\("groupId", ""\) == ""/);
  const rosterRules = rules.slice(rules.indexOf("match /sharedRosters/{rosterId}"));
  const cabinet = section(rosterRules, "match /cabinet/{configDoc}", "match /taskBoard/{boardDoc}");
  const checks = cabinet.match(/isStandaloneRosterById\(rosterId\)/g) || [];
  assert.equal(checks.length, 3);
});

test("configuredByUid is always the authenticated Stripes organizer", () => {
  const validator = section(rules, "function validCabinetLocationConfig()", "match /sharedWorkspaceInvitationLocks");
  assert.match(validator, /configuredByUid == request\.auth\.uid/);
  assert.match(validator, /configuredAt == request\.time/);
  assert.match(validator, /updatedAt == request\.time/);
});
