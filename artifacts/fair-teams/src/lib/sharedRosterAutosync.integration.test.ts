import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("App owns one canonical active shared-roster autosync controller", () => {
  const app = source("../App.tsx");
  assert.equal((app.match(/useActiveSharedRosterAutosync\(\{/g) || []).length, 1);
  assert.equal((app.match(/autosync=\{activeSharedRosterAutosync\}/g) || []).length, 3);
  assert.match(app, /snapshot=\{activeSharedRosterAutosync\}/);
  assert.match(app, /onRetry=\{\(\) => void activeSharedRosterAutosync\.retry\(\)\}/);
});

test("publish surfaces consume canonical state and no longer save or listen independently", () => {
  const card = source("../components/FirebaseSharedRosterPublishCard.tsx");
  assert.match(card, /snapshot=\{activeAutosync\}/);
  assert.match(card, /onRetry=\{\(\) => void activeAutosync\.retry\(\)\}/);
  assert.doesNotMatch(card, /const \[autoSyncStatus,/);
  assert.doesNotMatch(card, /saveFirebaseSharedRoster/);
  assert.doesNotMatch(card, /listenToFirebaseSharedRoster/);
  assert.doesNotMatch(card, /setTimeout\([^)]*saveFirebaseSharedRoster/s);
});

test("autosave and Retry depend on P0-A1 authoritative capabilities", () => {
  const hook = source("./sharedRosterAutosync.ts");
  const controller = source("./sharedRosterAutosyncController.ts");
  assert.match(hook, /canEdit: authority\.capabilities\.canEditSharedRoster/);
  assert.match(hook, /authority\.capabilities\.canReadSharedRoster/);
  assert.match(hook, /snapshot\.status !== "scheduled"/);
  assert.match(hook, /setTimeout\(\(\) => \{[\s\S]*controller\.saveLatest\(\)/);
  assert.match(controller, /context\.authorityStatus === "authorized"/);
  assert.match(controller, /context\.canEdit/);
  assert.doesNotMatch(hook, /firebaseRole/);
  assert.doesNotMatch(controller, /firebaseRole/);
});

test("active listener is server-confirmed and guarded by the exact authority context", () => {
  const hook = source("./sharedRosterAutosync.ts");
  assert.match(hook, /const expectedContextKey = authority\.contextKey/);
  assert.match(hook, /controller\.getSnapshot\(\)\.contextKey !== expectedContextKey/);
  assert.match(hook, /\{ serverOnly: true \}/);
  const service = source("./sharedRosterService.ts");
  assert.match(service, /options\.serverOnly && snapshot\.metadata\.fromCache/);
});

test("confirmed-save metadata records exact material identity without certifying by timestamp", () => {
  const app = source("../App.tsx");
  const start = app.indexOf("const markActiveFirebaseRosterSaved");
  const end = app.indexOf("const refreshActiveFirebaseRosterFromRemote", start);
  assert.ok(start >= 0 && end > start);
  const callback = app.slice(start, end);
  assert.match(callback, /firebaseLastSyncedMaterialKey: savedRevisionKey/);
  assert.match(callback, /lastSyncedAt: summary\.updatedAt/);
  assert.doesNotMatch(callback, /lastSyncedAt: savedRevisionKey/);
  assert.doesNotMatch(callback, /updatedAt:\s*summary\.updatedAt/);
});

test("controller revision identity and Firebase save share one material payload definition", () => {
  const controller = source("./sharedRosterAutosyncController.ts");
  const service = source("./sharedRosterService.ts");
  const payload = source("./sharedRosterSyncPayload.ts");
  assert.match(controller, /firebaseSharedRosterMaterialRevisionKey/);
  assert.match(service, /makeFirebaseSharedRosterSavePayload/);
  assert.match(payload, /makeFirebaseSharedRosterMaterialPayload/);
  assert.match(payload, /canonicalizeJson/);
  assert.doesNotMatch(payload, /roster\?\.updatedAt \|\| roster\?\.createdAt/);
  assert.doesNotMatch(controller, /Date\.parse\(.*lastSyncedAt/);
});

test("local persistence remains independent and Firebase failure has no rollback path", () => {
  const app = source("../App.tsx");
  assert.match(app, /saveRosterState\(rosterState\)/);
  const controller = source("./sharedRosterAutosyncController.ts");
  assert.match(controller, /Your edits are saved on this device/);
  assert.doesNotMatch(controller, /setRosterState|saveRosterState|localStorage/);
});

test("Firebase and legacy Google Sheets dirty indicators are no longer conflated", () => {
  const app = source("../App.tsx");
  assert.match(app, /const activeGoogleSheetHasUnsavedChanges/);
  assert.match(app, /activeRosterIsFirebaseShared[\s\S]*activeSharedRosterAutosyncPresentation\.label/);
  assert.doesNotMatch(app, /activeSharedHasUnsavedChanges/);
});

test("version mismatch has a structured conflict code for fail-closed handling", () => {
  const service = source("./sharedRosterService.ts");
  assert.match(service, /class FirebaseSharedRosterVersionConflictError/);
  assert.match(service, /readonly code = "shared-roster-version-conflict"/);
  assert.match(service, /throw new FirebaseSharedRosterVersionConflictError\(remoteVersion, expectedVersion\)/);
});
