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
    const cabinet = section(source, "match /cabinet/{configDoc}", "match /cabinetResources/{resourceId}");
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
  const cabinet = section(rosterRules, "match /cabinet/{configDoc}", "match /cabinetResources/{resourceId}");
  const checks = cabinet.match(/isStandaloneRosterById\(rosterId\)/g) || [];
  assert.equal(checks.length, 3);
});

test("configuredByUid is always the authenticated Stripes organizer", () => {
  const validator = section(rules, "function validCabinetLocationConfig()", "match /sharedWorkspaceInvitationLocks");
  assert.match(validator, /configuredByUid == request\.auth\.uid/);
  assert.match(validator, /configuredAt == request\.time/);
  assert.match(validator, /updatedAt == request\.time/);
});

test("G3 Cabinet resources use a strict provider-neutral current schema", () => {
  const idValidator = section(
    rules,
    "function validCabinetResourceId(value)",
    "function validCabinetResourceContext(value)",
  );
  const validator = section(
    rules,
    "function validCabinetResourceData(resourceId)",
    "function validCabinetResourceCreate(resourceId)",
  );
  for (const field of [
    "schemaVersion",
    "resourceId",
    "provider",
    "resourceKind",
    "providerResourceId",
    "externalUrl",
    "displayName",
    "mimeType",
    "origin",
    "contexts",
    "createdByUid",
    "createdAt",
    "updatedByUid",
    "updatedAt",
  ]) {
    assert.match(validator, new RegExp(`"${field}"`));
  }
  assert.match(validator, /keys\.hasOnly\(\[/);
  assert.match(validator, /schemaVersion == 1/);
  assert.match(validator, /resourceId == resourceId/);
  assert.match(validator, /displayName\.matches\("\.\*\\\\S\.\*"\)/);
  assert.match(validator, /data\.mimeType\.matches\("\[a-z0-9\][\s\S]*?\\\\\/\[a-z0-9\]/);
  assert.match(idValidator, /value\.matches\("\\\\S\(\.\*\\\\S\)\?"\)/);
  assert.match(idValidator, /\\\\x00-\\\\x1f\\\\x7f/);
  assert.doesNotMatch(
    validator,
    /accessToken|refreshToken|credential|oauth|email|permission|acl|bytes|unknown/i,
  );
});

test("G3 Cabinet provider/reference variants are mutually exclusive", () => {
  const validator = section(
    rules,
    "function validCabinetResourceData(resourceId)",
    "function validCabinetResourceCreate(resourceId)",
  );
  assert.match(validator, /provider == "google_drive"[\s\S]*?resourceKind in \["file", "folder"\]/);
  assert.match(validator, /validCabinetResourceId\(data\.providerResourceId\)/);
  assert.match(validator, /data\.externalUrl == null/);
  assert.match(validator, /provider == "external_link"[\s\S]*?resourceKind == "link"/);
  assert.match(validator, /data\.providerResourceId == null/);
  assert.match(validator, /externalUrl\.matches\("https\?:/);
});

test("G3 contexts are workspace-local, bounded and enumerated", () => {
  const contextValidator = section(
    rules,
    "function validCabinetResourceContext(value)",
    "function validCabinetResourceData(resourceId)",
  );
  assert.match(contextValidator, /keys\.hasOnly\(\["kind", "entityId"\]\)/);
  assert.match(contextValidator, /value\.kind == "cabinet"/);
  assert.match(contextValidator, /value\.kind in \["action_board", "equipment"\]/);
  assert.match(contextValidator, /size <= 4/);
  assert.match(contextValidator, /contexts\.toSet\(\)\.size\(\) == size/);
  for (let index = 0; index < 4; index += 1) {
    assert.match(contextValidator, new RegExp(`validCabinetResourceContext\\(contexts\\[${index}\\]\\)`));
  }
  assert.doesNotMatch(contextValidator, /groupId|rosterId|workspaceId/);
});

test("external Cabinet URLs reject embedded credentials", () => {
  const validator = section(
    rules,
    "function validCabinetResourceData(resourceId)",
    "function validCabinetResourceCreate(resourceId)",
  );
  assert.match(validator, /data\.externalUrl\.matches\("https\?:[\s\S]*?\[\^\\\\s/);
  assert.match(validator, /!data\.externalUrl\.matches\("https\?:[\s\S]*?@\.\*"\)/);
});

test("G3 resource updates preserve identity, origin and creation attribution", () => {
  const createValidator = section(
    rules,
    "function validCabinetResourceCreate(resourceId)",
    "match /sharedWorkspaceInvitationLocks",
  );
  assert.match(createValidator, /createdByUid == request\.auth\.uid/);
  assert.match(createValidator, /createdAt == request\.time/);
  assert.match(createValidator, /updatedByUid == request\.auth\.uid/);
  assert.match(createValidator, /updatedAt == request\.time/);
  assert.match(createValidator, /validCabinetResourceData\(resourceId\)/);
  assert.match(createValidator, /affectedKeys\(\)\.hasOnly\(\[[\s\S]*?"displayName"[\s\S]*?"contexts"[\s\S]*?"updatedByUid"[\s\S]*?"updatedAt"/);
  assert.doesNotMatch(
    createValidator.slice(createValidator.indexOf("affectedKeys")),
    /"provider"|"providerResourceId"|"externalUrl"|"resourceKind"|"origin"|"createdByUid"|"createdAt"/,
  );
});

test("G3 generic deletion preserves feature relationships", () => {
  const validator = section(
    rules,
    "function validCabinetResourceDelete()",
    "match /sharedWorkspaceInvitationLocks",
  );
  assert.match(validator, /let data = resource\.data/);
  assert.match(validator, /data\.schemaVersion == 1/);
  assert.match(validator, /validCabinetResourceContext\(origin\)/);
  assert.match(validator, /origin\.kind == "cabinet"/);
  assert.match(validator, /validCabinetResourceContexts\(contexts\)/);
  for (let index = 0; index < 4; index += 1) {
    assert.match(
      validator,
      new RegExp(`contexts\\[${index}\\]\\.kind == "cabinet"`),
    );
  }
  assert.doesNotMatch(validator, /request\.resource/);
});

test("G3 group and standalone resource indexes remain organizer-only", () => {
  const groupRules = section(rules, "match /sharedGroups/{groupId}", "match /sharedRosters/{rosterId}");
  const groupResources = section(
    groupRules,
    "match /cabinetResources/{resourceId}",
    "match /taskBoard/{boardDoc}",
  );
  assert.match(groupResources, /allow read: if canEditGroupById\(groupId\)/);
  assert.match(groupResources, /allow create:[\s\S]*?validCabinetResourceCreate/);
  assert.match(groupResources, /allow update:[\s\S]*?validCabinetResourceUpdate/);
  assert.match(
    groupResources,
    /allow delete: if canEditGroupById\(groupId\)[\s\S]*?validCabinetResourceDelete\(\)/,
  );
  assert.doesNotMatch(groupResources, /isGroupMemberById/);

  const rosterRules = rules.slice(rules.indexOf("match /sharedRosters/{rosterId}"));
  const rosterResources = section(
    rosterRules,
    "match /cabinetResources/{resourceId}",
    "match /taskBoard/{boardDoc}",
  );
  const standaloneChecks = rosterResources.match(/isStandaloneRosterById\(rosterId\)/g) || [];
  const organizerChecks = rosterResources.match(/canEditRosterById\(rosterId\)/g) || [];
  assert.equal(standaloneChecks.length, 4);
  assert.equal(organizerChecks.length, 4);
  assert.match(
    rosterResources,
    /allow delete:[\s\S]*?validCabinetResourceDelete\(\)/,
  );
  assert.doesNotMatch(rosterResources, /isRosterMemberById/);
});
