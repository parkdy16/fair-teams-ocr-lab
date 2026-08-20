import assert from "node:assert/strict";
import test from "node:test";
import type { RoomRoster } from "./localRoster.ts";
import type {
  FirebaseSharedRosterSnapshot,
  FirebaseSharedRosterSummary,
} from "./sharedRosterService.ts";
import {
  SharedRosterAutosyncController,
  classifySharedRosterAutosyncError,
  sharedRosterHasUnsyncedLocalChanges,
  sharedRosterAutosyncPresentation,
  type SharedRosterAutosyncContext,
} from "./sharedRosterAutosyncController.ts";
import { firebaseSharedRosterMaterialRevisionKey } from "./sharedRosterSyncPayload.ts";

const FIRST_SYNC = "2026-08-19T08:00:00.000Z";
const FIRST_EDIT = "2026-08-19T08:01:00.000Z";
const SECOND_EDIT = "2026-08-19T08:02:00.000Z";

const CLEAN_ROSTER: RoomRoster = {
  id: "local-a",
  name: "Friday Football",
  players: [],
  pairingRules: [],
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: FIRST_SYNC,
};
const CLEAN_MATERIAL_KEY = firebaseSharedRosterMaterialRevisionKey(CLEAN_ROSTER);

function roster(overrides: Partial<RoomRoster> = {}): RoomRoster {
  return {
    ...CLEAN_ROSTER,
    cloudSource: {
      provider: "firebase",
      firebaseRosterId: "remote-a",
      firebaseVersion: 1,
      firebaseLastSyncedMaterialKey: CLEAN_MATERIAL_KEY,
      lastSyncedAt: FIRST_SYNC,
      syncMode: "manual",
    },
    ...overrides,
  };
}

function confirmedRoster(overrides: Partial<RoomRoster> = {}): RoomRoster {
  const value = roster(overrides);
  return {
    ...value,
    cloudSource: value.cloudSource?.provider === "firebase"
      ? {
          ...value.cloudSource,
          firebaseLastSyncedMaterialKey: firebaseSharedRosterMaterialRevisionKey(value),
        }
      : value.cloudSource,
  };
}

function context(
  currentRoster: RoomRoster,
  overrides: Partial<SharedRosterAutosyncContext> = {},
): SharedRosterAutosyncContext {
  return {
    contextKey: `uid-a\u0000${currentRoster.id}\u0000${currentRoster.cloudSource?.firebaseRosterId || "local-only"}`,
    localRosterId: currentRoster.id,
    roster: currentRoster,
    authorityStatus: "authorized",
    canEdit: true,
    online: true,
    ...overrides,
  };
}

function summary(version: number, updatedAt = `2026-08-19T08:0${version}:30.000Z`): FirebaseSharedRosterSummary {
  return {
    id: "remote-a",
    groupId: "group-a",
    groupName: "Friday Club",
    name: "Friday Football",
    ownerUid: "owner-a",
    ownerEmail: "owner@example.com",
    version,
    playerCount: 0,
    updatedAt,
    currentUserRole: "organizer",
  };
}

function remoteSnapshot(
  version: number,
  remoteRoster: RoomRoster = roster({ updatedAt: `2026-08-19T09:0${version}:00.000Z` }),
): FirebaseSharedRosterSnapshot {
  return {
    ...summary(version, remoteRoster.updatedAt),
    roster: {
      ...remoteRoster,
      cloudSource: {
        ...remoteRoster.cloudSource!,
        firebaseVersion: version,
        lastSyncedAt: remoteRoster.updatedAt,
      },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function harness(saveRoster: (value: RoomRoster) => Promise<FirebaseSharedRosterSummary>) {
  const confirmed: Array<{ summary: FirebaseSharedRosterSummary; localRosterId: string; revision: number; revisionKey: string }> = [];
  const applied: Array<{ snapshot: FirebaseSharedRosterSnapshot; localRosterId: string }> = [];
  const controller = new SharedRosterAutosyncController({
    saveRoster,
    onSaveConfirmed: (saved, localRosterId, revision, revisionKey) => {
      confirmed.push({ summary: saved, localRosterId, revision, revisionKey });
    },
    onRemoteApplied: (snapshot, localRosterId) => {
      applied.push({ snapshot, localRosterId });
    },
  });
  return { controller, confirmed, applied };
}

test("normal local edit advances scheduled -> saving -> confirmed synced", async () => {
  const saved: RoomRoster[] = [];
  const { controller, confirmed } = harness(async (value) => {
    saved.push(value);
    return summary(2);
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "First edit", updatedAt: FIRST_EDIT }));
  assert.equal(controller.getSnapshot().status, "scheduled");
  const pending = controller.saveLatest();
  assert.equal(controller.getSnapshot().status, "saving");
  assert.equal(await pending, true);
  assert.equal(controller.getSnapshot().status, "synced");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, false);
  assert.equal(saved.length, 1);
  assert.equal(confirmed[0]?.revision, 1);
  assert.equal(confirmed[0]?.revisionKey, firebaseSharedRosterMaterialRevisionKey(saved[0]));
  assert.equal(sharedRosterHasUnsyncedLocalChanges({
    ...clean,
    name: "Revision 2",
    updatedAt: SECOND_EDIT,
    cloudSource: {
      ...clean.cloudSource!,
      firebaseVersion: 2,
      firebaseLastSyncedMaterialKey: confirmed[0]!.revisionKey,
      lastSyncedAt: summary(2).updatedAt,
    },
  }), true);
});

test("representative shared player skill mutation changes material sync identity", () => {
  const player = {
    id: "player-a",
    roomId: 1,
    name: "Regression Player",
    gender: "other" as const,
    skill: 6,
    attack: 6,
    defense: 6,
    speed: 6,
    passing: 6,
    stamina: 6,
    physical: 6,
    teamPlay: 2,
    todayStatus: "here" as const,
    attending: true,
    createdAt: FIRST_SYNC,
  };
  const before = roster({ players: [player] });
  const after = roster({
    players: [{ ...player, skill: 7, attack: 7 }],
    updatedAt: FIRST_EDIT,
  });
  assert.notEqual(
    firebaseSharedRosterMaterialRevisionKey(before),
    firebaseSharedRosterMaterialRevisionKey(after),
  );
});

test("legacy timestamp equality cannot certify material without a matching server snapshot", () => {
  const { controller, applied } = harness(async () => summary(2));
  const clean = roster();
  const legacySource = {
    ...clean.cloudSource!,
    firebaseLastSyncedMaterialKey: undefined,
  };
  const legacyLocal = {
    ...clean,
    cloudSource: legacySource,
    updatedAt: legacySource.lastSyncedAt,
  };

  controller.configure(context(legacyLocal));
  assert.equal(controller.getSnapshot().status, "scheduled");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);

  controller.handleRemoteSnapshot(remoteSnapshot(1, legacyLocal));
  assert.equal(applied.length, 1);
  assert.equal(controller.getSnapshot().status, "synced");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, false);
});

test("legacy local material that differs from the same remote version is preserved for save", () => {
  const { controller, applied } = harness(async () => summary(2));
  const clean = roster();
  const legacyLocal = {
    ...clean,
    name: "Unsynced legacy material",
    cloudSource: {
      ...clean.cloudSource!,
      firebaseLastSyncedMaterialKey: undefined,
    },
    updatedAt: clean.cloudSource!.lastSyncedAt,
  };

  controller.configure(context(legacyLocal));
  controller.handleRemoteSnapshot(remoteSnapshot(1, clean));
  assert.equal(applied.length, 0);
  assert.equal(controller.getSnapshot().status, "scheduled");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
});

test("save failure preserves the latest local payload and never reports synced", async () => {
  const localEdit = roster({ name: "Locally renamed", updatedAt: FIRST_EDIT });
  const { controller } = harness(async () => {
    throw Object.assign(new Error("network unavailable"), { code: "unavailable" });
  });
  controller.configure(context(roster()));
  controller.configure(context(localEdit));
  assert.equal(await controller.saveLatest(), false);
  assert.equal(controller.getSnapshot().status, "failed");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  assert.equal(controller.getSnapshot().errorReason, "network_unavailable");
  assert.equal(sharedRosterAutosyncPresentation(controller.getSnapshot()).label, "Saved on this device · Not synced");
});

test("manual Retry saves a failed current revision and returns to synced", async () => {
  let attempts = 0;
  const { controller } = harness(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary failure");
    return summary(2);
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Retry edit", updatedAt: FIRST_EDIT }));
  assert.equal(await controller.saveLatest(), false);
  assert.equal(controller.getSnapshot().retryable, true);
  assert.equal(await controller.retry(), true);
  assert.equal(attempts, 2);
  assert.equal(controller.getSnapshot().status, "synced");
});

test("a newer edit remains dirty after an older in-flight revision succeeds", async () => {
  const firstSave = deferred<FirebaseSharedRosterSummary>();
  const saved: RoomRoster[] = [];
  const { controller, confirmed } = harness((value) => {
    saved.push(value);
    if (saved.length === 1) return firstSave.promise;
    return Promise.resolve(summary(3));
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Revision 1", updatedAt: FIRST_EDIT }));
  const pending = controller.saveLatest();
  controller.configure(context({ ...clean, name: "Revision 2", updatedAt: SECOND_EDIT }));
  firstSave.resolve(summary(2));
  assert.equal(await pending, true);
  assert.equal(controller.getSnapshot().status, "scheduled");
  assert.equal(controller.getSnapshot().latestRevision, 2);
  assert.equal(controller.getSnapshot().confirmedRevision, 1);
  assert.equal(confirmed[0]?.revision, 1);
  assert.equal(confirmed[0]?.revisionKey, firebaseSharedRosterMaterialRevisionKey(saved[0]));
  await controller.saveLatest();
  assert.equal(saved[1]?.name, "Revision 2");
  assert.equal(saved[1]?.cloudSource?.firebaseVersion, 2);
  assert.equal(controller.getSnapshot().status, "synced");
});

test("same timestamp different payload keeps B dirty until B is confirmed", async () => {
  const firstSave = deferred<FirebaseSharedRosterSummary>();
  const saved: RoomRoster[] = [];
  const { controller, confirmed } = harness((value) => {
    saved.push(value);
    return saved.length === 1 ? firstSave.promise : Promise.resolve(summary(3));
  });
  const clean = roster();
  const payloadA = { ...clean, name: "Payload A", updatedAt: FIRST_EDIT };
  const payloadB = { ...clean, name: "Payload B", updatedAt: FIRST_EDIT };

  controller.configure(context(clean));
  controller.configure(context(payloadA));
  const pendingA = controller.saveLatest();
  const revisionA = controller.getSnapshot().inFlightRevision;
  const identityA = firebaseSharedRosterMaterialRevisionKey(payloadA);
  controller.configure(context(payloadB));
  const revisionB = controller.getSnapshot().latestRevision;
  const identityB = firebaseSharedRosterMaterialRevisionKey(payloadB);

  assert.equal(revisionA, 1);
  assert.equal(revisionB, 2);
  assert.notEqual(identityA, identityB);
  firstSave.resolve(summary(2));
  assert.equal(await pendingA, true);
  assert.equal(controller.getSnapshot().confirmedRevision, 1);
  assert.equal(controller.getSnapshot().latestRevision, 2);
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  assert.equal(controller.getSnapshot().status, "scheduled");
  assert.notEqual(sharedRosterAutosyncPresentation(controller.getSnapshot()).label, "Saved online");
  assert.deepEqual(saved.map((value) => value.name), ["Payload A"]);
  assert.equal(confirmed[0]?.revisionKey, identityA);

  assert.equal(await controller.saveLatest(), true);
  assert.deepEqual(saved.map((value) => value.name), ["Payload A", "Payload B"]);
  assert.equal(confirmed[1]?.revisionKey, identityB);
  assert.equal(controller.getSnapshot().status, "synced");
  assert.equal(sharedRosterAutosyncPresentation(controller.getSnapshot()).label, "Saved online");
});

test("same timestamp different payload failure leaves latest B for Retry", async () => {
  const firstSave = deferred<FirebaseSharedRosterSummary>();
  const saved: RoomRoster[] = [];
  const { controller } = harness((value) => {
    saved.push(value);
    return saved.length === 1 ? firstSave.promise : Promise.resolve(summary(2));
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Payload A", updatedAt: FIRST_EDIT }));
  const pendingA = controller.saveLatest();
  controller.configure(context({ ...clean, name: "Payload B", updatedAt: FIRST_EDIT }));

  firstSave.reject(new Error("temporary failure"));
  assert.equal(await pendingA, false);
  assert.equal(controller.getSnapshot().latestRevision, 2);
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  assert.equal(await controller.retry(), true);
  assert.deepEqual(saved.map((value) => value.name), ["Payload A", "Payload B"]);
});

test("identical material payload coalesces despite timestamp-only changes", async () => {
  const firstSave = deferred<FirebaseSharedRosterSummary>();
  const saved: RoomRoster[] = [];
  const { controller } = harness((value) => {
    saved.push(value);
    return firstSave.promise;
  });
  const clean = roster();
  const payloadA = { ...clean, name: "Payload A", updatedAt: FIRST_EDIT };
  const identicalPayload = { ...payloadA, updatedAt: SECOND_EDIT };
  controller.configure(context(clean));
  controller.configure(context(payloadA));
  const pendingA = controller.saveLatest();
  controller.configure(context(identicalPayload));

  assert.equal(
    firebaseSharedRosterMaterialRevisionKey(payloadA),
    firebaseSharedRosterMaterialRevisionKey(identicalPayload),
  );
  assert.equal(controller.getSnapshot().latestRevision, 1);
  firstSave.resolve(summary(2));
  assert.equal(await pendingA, true);
  assert.equal(saved.length, 1);
  assert.equal(controller.getSnapshot().status, "synced");
});

test("remote update after old success cannot overwrite same-timestamp unsynced B", async () => {
  const firstSave = deferred<FirebaseSharedRosterSummary>();
  const { controller, applied } = harness(() => firstSave.promise);
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Payload A", updatedAt: FIRST_EDIT }));
  const pendingA = controller.saveLatest();
  controller.configure(context({ ...clean, name: "Payload B", updatedAt: FIRST_EDIT }));
  firstSave.resolve(summary(2));
  assert.equal(await pendingA, true);

  controller.handleRemoteSnapshot(remoteSnapshot(3, roster({ name: "Remote payload" })));
  assert.equal(applied.length, 0);
  assert.equal(controller.getSnapshot().status, "conflict");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
});

test("failure of an old revision leaves the newest payload pending for Retry", async () => {
  const firstSave = deferred<FirebaseSharedRosterSummary>();
  const saved: RoomRoster[] = [];
  const { controller } = harness((value) => {
    saved.push(value);
    return saved.length === 1 ? firstSave.promise : Promise.resolve(summary(2));
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Revision 1", updatedAt: FIRST_EDIT }));
  const pending = controller.saveLatest();
  controller.configure(context({ ...clean, name: "Latest revision", updatedAt: SECOND_EDIT }));
  firstSave.reject(new Error("temporary failure"));
  assert.equal(await pending, false);
  assert.equal(controller.getSnapshot().latestRevision, 2);
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  await controller.retry();
  assert.equal(saved[1]?.name, "Latest revision");
});

test("repeated Retry presses share one effective physical save", async () => {
  const retrySave = deferred<FirebaseSharedRosterSummary>();
  let calls = 0;
  const { controller } = harness(async () => {
    calls += 1;
    if (calls === 1) throw new Error("first failure");
    return retrySave.promise;
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Retry payload", updatedAt: FIRST_EDIT }));
  await controller.saveLatest();
  const retryA = controller.retry();
  const retryB = controller.retry();
  assert.equal(calls, 2);
  retrySave.resolve(summary(2));
  assert.equal(await retryA, true);
  assert.equal(await retryB, true);
  assert.equal(calls, 2);
});

test("authority loss blocks a dirty save without a retry loop", async () => {
  let calls = 0;
  const { controller } = harness(async () => {
    calls += 1;
    return summary(2);
  });
  const localEdit = roster({ name: "Preserved locally", updatedAt: FIRST_EDIT });
  controller.configure(context(roster()));
  controller.configure(context(localEdit));
  controller.configure(context(localEdit, { authorityStatus: "access_lost", canEdit: false }));
  assert.equal(controller.getSnapshot().status, "blocked");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  assert.equal(controller.getSnapshot().retryable, false);
  assert.equal(await controller.retry(), false);
  assert.equal(calls, 0);
});

test("queued listener results are ignored after authoritative access loss", () => {
  const { controller, applied } = harness(async () => summary(2));
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context(clean, { authorityStatus: "access_lost", canEdit: false }));
  controller.handleRemoteSnapshot(remoteSnapshot(2));
  controller.handleRemoteError(Object.assign(new Error("permission denied"), { code: "permission-denied" }));
  assert.equal(applied.length, 0);
  assert.equal(controller.getSnapshot().status, "blocked");
  assert.equal(controller.getSnapshot().blockReason, "access_lost");
});

test("save completion after access loss cannot mark local work synced", async () => {
  const pendingSave = deferred<FirebaseSharedRosterSummary>();
  const { controller, confirmed } = harness(() => pendingSave.promise);
  const dirty = roster({ name: "Local work", updatedAt: FIRST_EDIT });
  controller.configure(context(roster()));
  controller.configure(context(dirty));
  const pending = controller.saveLatest();
  controller.configure(context(dirty, { authorityStatus: "access_lost", canEdit: false }));
  pendingSave.resolve(summary(2));
  assert.equal(await pending, false);
  assert.equal(confirmed.length, 0);
  assert.equal(controller.getSnapshot().status, "blocked");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
});

test("permission failure never auto-retries and Retry follows current P0-A1 authority", async () => {
  let calls = 0;
  const dirty = roster({ name: "Permission edit", updatedAt: FIRST_EDIT });
  const { controller } = harness(async () => {
    calls += 1;
    throw Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" });
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context(dirty));
  await controller.saveLatest();
  assert.equal(controller.getSnapshot().status, "blocked");
  assert.equal(controller.getSnapshot().errorKind, "authority");
  assert.equal(controller.getSnapshot().errorReason, "access_changed");
  assert.equal(controller.getSnapshot().retryable, true);
  assert.equal(calls, 1);
  controller.configure(context(dirty, { authorityStatus: "access_lost", canEdit: false }));
  assert.equal(controller.getSnapshot().retryable, false);
  assert.equal(await controller.retry(), false);
  assert.equal(calls, 1);
});

test("late save result from UID A cannot alter UID B autosync state", async () => {
  const oldSave = deferred<FirebaseSharedRosterSummary>();
  const { controller, confirmed } = harness(() => oldSave.promise);
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "UID A edit", updatedAt: FIRST_EDIT }));
  const pending = controller.saveLatest();
  const uidBRoster = confirmedRoster({ id: "local-b", name: "UID B roster" });
  controller.configure(context(uidBRoster, { contextKey: "uid-b\u0000local-b\u0000remote-a" }));
  oldSave.resolve(summary(2));
  assert.equal(await pending, false);
  assert.equal(controller.getSnapshot().contextKey, "uid-b\u0000local-b\u0000remote-a");
  assert.equal(controller.getSnapshot().status, "synced");
  assert.equal(confirmed.length, 0);
});

test("late roster A save result cannot alter roster B autosync state", async () => {
  const oldSave = deferred<FirebaseSharedRosterSummary>();
  const { controller, confirmed } = harness(() => oldSave.promise);
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Roster A edit", updatedAt: FIRST_EDIT }));
  const pending = controller.saveLatest();
  const rosterB = confirmedRoster({
    id: "local-b",
    name: "Roster B",
    cloudSource: {
      ...clean.cloudSource!,
      firebaseRosterId: "remote-b",
    },
  });
  controller.configure(context(rosterB));
  oldSave.resolve(summary(2));
  assert.equal(await pending, false);
  assert.match(controller.getSnapshot().contextKey, /local-b/);
  assert.equal(controller.getSnapshot().status, "synced");
  assert.equal(confirmed.length, 0);
});

test("offline dirty state performs no cloud write", async () => {
  let calls = 0;
  const { controller } = harness(async () => {
    calls += 1;
    return summary(2);
  });
  const dirty = roster({ name: "Offline edit", updatedAt: FIRST_EDIT });
  controller.configure(context(dirty, { online: false }));
  assert.equal(controller.getSnapshot().status, "offline");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  assert.equal(await controller.saveLatest(), false);
  assert.equal(calls, 0);
});

test("reconnect on the same authorized context schedules the latest dirty state", async () => {
  let calls = 0;
  const { controller } = harness(async () => {
    calls += 1;
    return summary(2);
  });
  const dirty = roster({ name: "Offline edit", updatedAt: FIRST_EDIT });
  controller.configure(context(dirty, { online: false }));
  controller.configure(context(dirty, { online: true }));
  assert.equal(controller.getSnapshot().status, "scheduled");
  assert.equal(await controller.saveLatest(), true);
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().status, "synced");
});

test("version conflict preserves local work and cannot blindly retry", async () => {
  let calls = 0;
  const { controller } = harness(async () => {
    calls += 1;
    throw Object.assign(new Error("remote version changed"), {
      code: "shared-roster-version-conflict",
    });
  });
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Local work", updatedAt: FIRST_EDIT }));
  assert.equal(await controller.saveLatest(), false);
  assert.equal(controller.getSnapshot().status, "conflict");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
  assert.equal(controller.getSnapshot().retryable, false);
  assert.equal(await controller.retry(), false);
  assert.equal(calls, 1);
});

test("authoritative remote update applies while local state is clean", () => {
  const { controller, applied } = harness(async () => summary(2));
  controller.configure(context(roster()));
  const remote = remoteSnapshot(2, roster({ name: "Remote name", updatedAt: SECOND_EDIT }));
  controller.handleRemoteSnapshot(remote);
  assert.equal(applied.length, 1);
  assert.equal(applied[0]?.snapshot.roster.name, "Remote name");
  assert.equal(controller.getSnapshot().status, "synced");
});

test("authoritative remote update cannot overwrite a known unsynced local edit", () => {
  const { controller, applied } = harness(async () => summary(2));
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Local work", updatedAt: FIRST_EDIT }));
  controller.handleRemoteSnapshot(remoteSnapshot(2, roster({ name: "Remote work", updatedAt: SECOND_EDIT })));
  assert.equal(applied.length, 0);
  assert.equal(controller.getSnapshot().status, "conflict");
  assert.equal(controller.getSnapshot().hasUnsyncedChanges, true);
});

test("remote listener updates arriving during a save are reconciled after the save", async () => {
  const pendingSave = deferred<FirebaseSharedRosterSummary>();
  const { controller, applied } = harness(() => pendingSave.promise);
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Saving edit", updatedAt: FIRST_EDIT }));
  const pending = controller.saveLatest();
  controller.handleRemoteSnapshot(remoteSnapshot(2));
  assert.equal(applied.length, 0);
  pendingSave.resolve(summary(2));
  assert.equal(await pending, true);
  assert.equal(controller.getSnapshot().status, "synced");
  assert.equal(applied.length, 0);
});

test("known newer remote version wins over a simultaneous transient save failure", async () => {
  const pendingSave = deferred<FirebaseSharedRosterSummary>();
  const { controller } = harness(() => pendingSave.promise);
  const clean = roster();
  controller.configure(context(clean));
  controller.configure(context({ ...clean, name: "Local work", updatedAt: FIRST_EDIT }));
  const pending = controller.saveLatest();
  controller.handleRemoteSnapshot(remoteSnapshot(2, roster({ name: "Remote work", updatedAt: SECOND_EDIT })));
  pendingSave.reject(Object.assign(new Error("network unavailable"), { code: "unavailable" }));
  assert.equal(await pending, false);
  assert.equal(controller.getSnapshot().status, "conflict");
  assert.equal(controller.getSnapshot().errorKind, "conflict");
  assert.equal(controller.getSnapshot().retryable, false);
});

test("structured error classification keeps diagnostics safe and distinct", () => {
  const authority = classifySharedRosterAutosyncError(Object.assign(new Error("denied"), { code: "permission-denied" }));
  const network = classifySharedRosterAutosyncError(Object.assign(new Error("offline"), { code: "unavailable" }));
  const conflict = classifySharedRosterAutosyncError(Object.assign(new Error("changed"), { code: "shared-roster-version-conflict" }));
  const unknown = classifySharedRosterAutosyncError(new Error("unexpected internal path /secret/player-data"));

  assert.equal(authority.kind, "authority");
  assert.equal(authority.reason, "access_changed");
  assert.equal(network.kind, "network");
  assert.equal(network.reason, "network_unavailable");
  assert.equal(conflict.kind, "conflict");
  assert.equal(conflict.reason, "online_changed");
  assert.equal(unknown.reason, "sync_failed");
  assert.equal(unknown.message, "Stripes could not sync this roster. Your edits are saved on this device.");
});
