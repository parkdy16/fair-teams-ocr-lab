"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} = require("firebase/firestore");
const {
  IDS,
  IDENTITIES,
  authenticatedFirestore,
  fixtureRefs,
  seedStripesRegressionClub,
} = require("./testSupport/stripesRegressionFixture");
const { invitationLockId } = require("./workspaceInvitation");

const RECOVERY_PROJECT_ID = "demo-stripes-recovery-rehearsal";
const RECOVERY_AT_ISO = "2026-08-19T10:00:00.000Z";
const RECOVERY_AT_MILLIS = Date.parse(RECOVERY_AT_ISO);
const INVITATION_EXPIRES_AT_ISO = "2026-08-26T10:00:00.000Z";
const INVITATION_EXPIRES_AT_MILLIS = Date.parse(INVITATION_EXPIRES_AT_ISO);
const RECOVERY_RESOURCE_ID = "regression-resource";
const RECOVERY_INVITATION_ID = "regression-invitation";
const RECOVERY_INVITATION_EMAIL = "pending-recovery@stripes.invalid";
const RECOVERY_INVITATION_LOCK_ID = invitationLockId(
  IDS.group,
  RECOVERY_INVITATION_EMAIL,
);
const CURRENT_EXPLICIT_ROLES = new Set([
  "owner",
  "editor",
  "organizer",
  "viewer",
]);
const CURRENT_ORGANIZER_ROLES = new Set([
  "owner",
  "editor",
  "organizer",
]);
const RECOVERY_ROLE_BY_UID = Object.freeze({
  [IDS.organizerA]: "organizer",
  [IDS.organizerB]: "organizer",
  [IDS.member]: "viewer",
});

const firestoreRules = fs.readFileSync(
  path.join(__dirname, "..", "firestore.rules"),
  "utf8",
);

function assertLocalDemoEnvironment() {
  assert.equal(
    process.env.STRIPES_RECOVERY_PROJECT_ID,
    RECOVERY_PROJECT_ID,
    "Recovery phase requires the orchestrator's exact demo project.",
  );
  assert.equal(
    process.env.GCLOUD_PROJECT,
    RECOVERY_PROJECT_ID,
    "Firebase CLI must expose the exact demo project to the recovery phase.",
  );
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST || "",
    /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/,
    "Recovery phase requires a loopback Firestore emulator.",
  );

  let firebaseConfig;
  try {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || "");
  } catch {
    assert.fail("Firebase CLI did not provide valid emulator configuration.");
  }
  assert.equal(
    firebaseConfig?.projectId,
    RECOVERY_PROJECT_ID,
    "Firebase emulator configuration must use the exact demo project.",
  );
}

function recoveryRefs(db) {
  const base = fixtureRefs(db);
  return {
    ...base,
    resource: doc(base.roster, "resources", RECOVERY_RESOURCE_ID),
    invitation: doc(db, "sharedWorkspaceInvitations", RECOVERY_INVITATION_ID),
    invitationLock: doc(
      db,
      "sharedWorkspaceInvitationLocks",
      RECOVERY_INVITATION_LOCK_ID,
    ),
  };
}

function recoveryResource() {
  return {
    app: "Stripes",
    schemaVersion: 1,
    type: "external_link",
    name: "Synthetic recovery guide",
    url: "https://recovery.stripes.invalid/guide",
    createdAt: RECOVERY_AT_MILLIS,
    createdByUid: IDS.organizerA,
    createdByName: "Regression Organizer A",
    createdByEmail: IDENTITIES.organizerA.email,
    origin: { kind: "cabinet" },
    contexts: [{ kind: "cabinet", entityId: "recovery-root" }],
    folderId: null,
    pinned: false,
    updatedAt: RECOVERY_AT_MILLIS,
  };
}

function recoveryInvitation() {
  return {
    schemaVersion: 1,
    groupId: IDS.group,
    normalizedEmail: RECOVERY_INVITATION_EMAIL,
    status: "pending",
    workspaceNameSnapshot: "Stripes Regression Club",
    invitedByUid: IDS.organizerA,
    inviterDisplayNameSnapshot: "Regression Organizer A",
    createdAt: Timestamp.fromMillis(RECOVERY_AT_MILLIS),
    createdAtIso: RECOVERY_AT_ISO,
    updatedAt: Timestamp.fromMillis(RECOVERY_AT_MILLIS),
    updatedAtIso: RECOVERY_AT_ISO,
    expiresAt: Timestamp.fromMillis(INVITATION_EXPIRES_AT_MILLIS),
    expiresAtIso: INVITATION_EXPIRES_AT_ISO,
    lastSendAttemptAt: Timestamp.fromMillis(RECOVERY_AT_MILLIS),
    lastSendAttemptAtIso: RECOVERY_AT_ISO,
    lastSentAt: null,
    lastSentAtIso: null,
    deliveryStatus: "not_sent",
    deliveryError: null,
    sendAttemptId: "00000000-0000-4000-8000-000000000001",
  };
}

function recoveryInvitationLock() {
  return {
    schemaVersion: 1,
    groupId: IDS.group,
    activeInvitationId: RECOVERY_INVITATION_ID,
    updatedAt: Timestamp.fromMillis(RECOVERY_AT_MILLIS),
    updatedAtIso: RECOVERY_AT_ISO,
  };
}

async function seedRecoveryFixture(environment) {
  await seedStripesRegressionClub(environment);
  await environment.withSecurityRulesDisabled(async (context) => {
    const refs = recoveryRefs(context.firestore());
    await Promise.all([
      updateDoc(refs.group, {
        pendingInviteEmails: [RECOVERY_INVITATION_EMAIL],
        roleByUid: { ...RECOVERY_ROLE_BY_UID },
        updatedAtIso: RECOVERY_AT_ISO,
      }),
      updateDoc(refs.roster, {
        pendingInviteEmails: [RECOVERY_INVITATION_EMAIL],
        roleByUid: { ...RECOVERY_ROLE_BY_UID },
        updatedAtIso: RECOVERY_AT_ISO,
      }),
      setDoc(refs.resource, recoveryResource()),
      setDoc(refs.invitation, recoveryInvitation()),
      setDoc(refs.invitationLock, recoveryInvitationLock()),
    ]);
  });
}

function requiredData(snapshot, label) {
  assert.equal(snapshot.exists(), true, `${label} was not restored.`);
  return snapshot.data();
}

function assertTimestampMillis(value, expected, label) {
  assert.equal(typeof value?.toMillis, "function", `${label} is not a Firestore Timestamp.`);
  assert.equal(value.toMillis(), expected, `${label} changed during export/import.`);
}

function assertCurrentAuthorityShape(data, label) {
  assert.ok(Array.isArray(data.memberUids), `${label}.memberUids must be a list.`);
  const memberUids = data.memberUids.map((uid, index) => {
    assert.equal(typeof uid, "string", `${label}.memberUids[${index}] must be a string.`);
    assert.equal(uid, uid.trim(), `${label}.memberUids[${index}] must be trimmed.`);
    assert.notEqual(uid, "", `${label}.memberUids[${index}] must not be empty.`);
    return uid;
  });
  const memberUidSet = new Set(memberUids);
  assert.equal(
    memberUidSet.size,
    memberUids.length,
    `${label}.memberUids must not contain duplicates.`,
  );

  const roleByUid = data.roleByUid;
  assert.ok(
    roleByUid && typeof roleByUid === "object" && !Array.isArray(roleByUid),
    `${label}.roleByUid must be a record.`,
  );
  for (const [uid, role] of Object.entries(roleByUid)) {
    assert.equal(
      memberUidSet.has(uid),
      true,
      `${label}.roleByUid contains inactive member ${uid}.`,
    );
    assert.equal(
      CURRENT_EXPLICIT_ROLES.has(role),
      true,
      `${label}.roleByUid contains unsupported explicit role ${String(role)}.`,
    );
  }

  const ownerUid = typeof data.ownerUid === "string" ? data.ownerUid : "";
  const ownerHasExplicitRole = Object.prototype.hasOwnProperty.call(roleByUid, ownerUid);
  const legacyOwnerFallbackUid = ownerUid && !ownerHasExplicitRole ? ownerUid : null;
  if (legacyOwnerFallbackUid) {
    assert.equal(
      memberUidSet.has(legacyOwnerFallbackUid),
      true,
      `${label} legacy owner fallback must name an active member without an explicit role.`,
    );
  }

  const sortedMemberUids = [...memberUidSet].sort();
  return {
    memberUids: sortedMemberUids,
    organizerClassification: sortedMemberUids.map((uid) => [
      uid,
      CURRENT_ORGANIZER_ROLES.has(roleByUid[uid])
        || uid === legacyOwnerFallbackUid
        ? "organizer"
        : "non_organizer",
    ]),
    legacyOwnerFallbackUid,
  };
}

async function assertExactCollectionCounts(db) {
  const collectionPaths = [
    [1, "sharedGroups"],
    [1, "sharedRosters"],
    [1, "sharedWorkspaceInvitations"],
    [1, "sharedWorkspaceInvitationLocks"],
    [1, "sharedGroups", IDS.group, "equipmentBags"],
    [1, "sharedGroups", IDS.group, "cabinet"],
    [1, "sharedGroups", IDS.group, "taskBoard"],
    [1, "sharedGroups", IDS.group, "taskBoard", "config", "columns"],
    [1, "sharedGroups", IDS.group, "taskBoard", "config", "cards"],
    [1, "sharedGroups", IDS.group, "organizerRemovalProposals"],
    [1, "sharedGroups", IDS.group, "organizerRemovalPrivate"],
    [1, "sharedGroups", IDS.group, "organizerRemovalPrivate", IDS.proposal, "ballots"],
    [1, "sharedRosters", IDS.roster, "attendanceIssues"],
    [1, "sharedRosters", IDS.roster, "clubRatingSummaries"],
    [2, "sharedRosters", IDS.roster, "clubRatingSubmissions"],
    [1, "sharedRosters", IDS.roster, "clubNotes"],
    [1, "sharedRosters", IDS.roster, "resources"],
  ];

  const counts = await Promise.all(
    collectionPaths.map(async ([expected, ...segments]) => {
      const snapshot = await getDocs(collection(db, ...segments));
      assert.equal(
        snapshot.size,
        expected,
        `${segments.join("/")} restored an unexpected document count.`,
      );
      return snapshot.size;
    }),
  );
  assert.equal(
    counts.reduce((total, count) => total + count, 0),
    18,
    "Synthetic recovery fixture document count changed.",
  );
}

async function verifyRestoredData(environment) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const refs = recoveryRefs(db);
    const snapshots = await Promise.all(
      Object.entries(refs).map(async ([key, ref]) => [key, await getDoc(ref)]),
    );
    const data = Object.fromEntries(
      snapshots.map(([key, snapshot]) => [key, requiredData(snapshot, key)]),
    );

    assert.equal(data.group.name, "Stripes Regression Club");
    assert.deepEqual(data.group.rosterIds, [IDS.roster]);
    assert.equal(data.roster.groupId, IDS.group);
    const groupAuthority = assertCurrentAuthorityShape(data.group, "group");
    const rosterAuthority = assertCurrentAuthorityShape(data.roster, "roster");
    assert.deepEqual(
      groupAuthority.memberUids,
      rosterAuthority.memberUids,
      "Restored group and roster member sets must match.",
    );
    assert.deepEqual(
      groupAuthority.organizerClassification,
      rosterAuthority.organizerClassification,
      "Restored group and roster organizer classifications must match.",
    );
    assert.equal(
      groupAuthority.legacyOwnerFallbackUid,
      rosterAuthority.legacyOwnerFallbackUid,
      "Restored group and roster legacy-owner fallback must match.",
    );
    assert.deepEqual(data.group.roleByUid, data.roster.roleByUid);
    assert.equal(data.group.roleByUid[IDS.organizerA], "organizer");
    assert.equal(data.group.roleByUid[IDS.organizerB], "organizer");
    assert.equal(data.group.roleByUid[IDS.member], "viewer");
    assert.deepEqual(data.group.pendingInviteEmails, [RECOVERY_INVITATION_EMAIL]);
    assert.deepEqual(data.roster.pendingInviteEmails, [RECOVERY_INVITATION_EMAIL]);
    assert.equal(data.roster.version, 3);
    assert.deepEqual(
      data.roster.players.map(({ id, name, skill, attending }) => ({ id, name, skill, attending })),
      [
        { id: IDS.playerA, name: "Regression Player A", skill: 7, attending: true },
        { id: IDS.playerB, name: "Regression Player B", skill: 5.5, attending: false },
      ],
    );

    assert.equal(data.equipment.schemaVersion, 4);
    assert.equal(data.equipment.items[0].quantity, 4);
    assert.equal(data.attendance.schemaVersion, 1);
    assert.equal(data.attendance.issueType, "tardy");
    assert.equal(data.taskConfig.schemaVersion, 4);
    assert.equal(data.taskColumn.name, "Ideas");
    assert.equal(data.taskCard.schemaVersion, 7);
    assert.equal(data.taskCard.title, "Choose training time");
    assert.equal(data.ratingSummary.averageSkill, 6.5);
    assert.equal(data.memberRating.userUid, IDS.member);
    assert.equal(data.organizerRating.userUid, IDS.organizerA);
    assert.equal(data.organizerNote.text, "Bring the blue bibs");

    assert.equal(data.cabinet.schemaVersion, 1);
    assert.equal(data.cabinet.provider, "google_drive");
    assert.equal(data.cabinet.folderId, "regression-cabinet-folder");
    assert.equal(data.cabinet.configuredByUid, IDS.organizerA);
    assert.equal(data.cabinet.accessToken, undefined);
    assert.equal(data.proposal.status, "open");
    assert.deepEqual(data.proposalPrivate.eligibleVoterUids, [IDS.organizerA]);
    assert.equal(data.proposalBallot.choice, "yes");

    assert.deepEqual(data.resource, recoveryResource());
    assert.equal(data.invitation.schemaVersion, 1);
    assert.equal(data.invitation.groupId, IDS.group);
    assert.equal(data.invitation.normalizedEmail, RECOVERY_INVITATION_EMAIL);
    assert.equal(data.invitation.status, "pending");
    assert.equal(data.invitation.invitedByUid, IDS.organizerA);
    assertTimestampMillis(data.invitation.createdAt, RECOVERY_AT_MILLIS, "invitation.createdAt");
    assertTimestampMillis(data.invitation.updatedAt, RECOVERY_AT_MILLIS, "invitation.updatedAt");
    assertTimestampMillis(
      data.invitation.expiresAt,
      INVITATION_EXPIRES_AT_MILLIS,
      "invitation.expiresAt",
    );
    assertTimestampMillis(
      data.invitation.lastSendAttemptAt,
      RECOVERY_AT_MILLIS,
      "invitation.lastSendAttemptAt",
    );
    assert.equal(data.invitationLock.groupId, IDS.group);
    assert.equal(data.invitationLock.activeInvitationId, RECOVERY_INVITATION_ID);
    assertTimestampMillis(
      data.invitationLock.updatedAt,
      RECOVERY_AT_MILLIS,
      "invitationLock.updatedAt",
    );

    await assertExactCollectionCounts(db);
  });
}

async function verifyRestoredAuthority(environment) {
  const organizer = authenticatedFirestore(environment, IDENTITIES.organizerA);
  const member = authenticatedFirestore(environment, IDENTITIES.member);
  const unrelated = authenticatedFirestore(environment, IDENTITIES.unrelated);

  assert.equal(
    (await assertSucceeds(getDoc(recoveryRefs(organizer).group))).data().rosterIds[0],
    IDS.roster,
  );
  assert.equal(
    (await assertSucceeds(getDoc(recoveryRefs(member).resource))).data().name,
    "Synthetic recovery guide",
  );
  await assertSucceeds(updateDoc(recoveryRefs(organizer).resource, {
    pinned: true,
    updatedAt: RECOVERY_AT_MILLIS + 1,
  }));
  await assertFails(updateDoc(recoveryRefs(member).resource, { pinned: false }));
  await assertFails(getDoc(recoveryRefs(unrelated).resource));
  await assertFails(getDoc(recoveryRefs(member).cabinet));

  for (const db of [organizer, member, unrelated]) {
    const refs = recoveryRefs(db);
    await assertFails(getDoc(refs.invitation));
    await assertFails(getDoc(refs.invitationLock));
    await assertFails(getDoc(refs.proposalPrivate));
    await assertFails(getDoc(refs.proposalBallot));
  }
}

async function main() {
  assertLocalDemoEnvironment();
  const mode = process.argv[2];
  assert.ok(mode === "seed" || mode === "verify", "Use the seed or verify recovery phase.");

  const environment = await initializeTestEnvironment({
    projectId: RECOVERY_PROJECT_ID,
    firestore: { rules: firestoreRules },
  });
  try {
    if (mode === "seed") {
      await seedRecoveryFixture(environment);
      console.log("Seeded deterministic synthetic recovery fixture.");
      return;
    }

    await verifyRestoredData(environment);
    await verifyRestoredAuthority(environment);
    console.log("Verified imported synthetic recovery fixture and Firestore authority.");
  } finally {
    await environment.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
