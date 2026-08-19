"use strict";

const {
  doc,
  setDoc,
} = require("firebase/firestore");

const IDS = Object.freeze({
  group: "stripes-regression-club",
  roster: "stripes-regression-roster",
  organizerA: "regression-organizer-a",
  organizerB: "regression-organizer-b",
  member: "regression-member",
  unrelated: "regression-unrelated",
  playerA: "regression-player-a",
  playerB: "regression-player-b",
  equipment: "regression-equipment",
  attendance: "regression-attendance",
  taskCard: "regression-card",
  organizerNote: "regression-organizer-note",
  proposal: "regression-proposal",
});

const IDENTITIES = Object.freeze({
  organizerA: Object.freeze({ uid: IDS.organizerA, email: "organizer-a@stripes.invalid" }),
  organizerB: Object.freeze({ uid: IDS.organizerB, email: "organizer-b@stripes.invalid" }),
  member: Object.freeze({ uid: IDS.member, email: "member@stripes.invalid" }),
  unrelated: Object.freeze({ uid: IDS.unrelated, email: "unrelated@stripes.invalid" }),
});

const FIXED_AT = "2026-08-19T09:00:00.000Z";

function membershipFields() {
  return {
    ownerUid: IDS.organizerA,
    ownerEmail: IDENTITIES.organizerA.email,
    memberUids: [IDS.organizerA, IDS.organizerB, IDS.member],
    memberEmails: [
      IDENTITIES.organizerA.email,
      IDENTITIES.organizerB.email,
      IDENTITIES.member.email,
    ],
    pendingInviteEmails: [],
    roleByUid: {
      [IDS.organizerA]: "organizer",
      [IDS.organizerB]: "organizer",
      [IDS.member]: "member",
    },
    memberUidByEmail: {
      [IDENTITIES.organizerA.email]: IDS.organizerA,
      [IDENTITIES.organizerB.email]: IDS.organizerB,
      [IDENTITIES.member.email]: IDS.member,
    },
    organizerJoinedAtByUid: {
      [IDS.organizerA]: FIXED_AT,
      [IDS.organizerB]: FIXED_AT,
    },
    organizerGovernanceEligibleAtByUid: {
      [IDS.organizerA]: FIXED_AT,
      [IDS.organizerB]: FIXED_AT,
    },
  };
}

function groupDocument() {
  return {
    app: "Stripes",
    name: "Stripes Regression Club",
    ...membershipFields(),
    rosterIds: [IDS.roster],
    createdAtIso: FIXED_AT,
    updatedAtIso: FIXED_AT,
  };
}

function rosterDocument() {
  return {
    app: "Stripes",
    name: "Stripes Regression Roster",
    groupId: IDS.group,
    ...membershipFields(),
    version: 3,
    players: [
      { id: IDS.playerA, name: "Regression Player A", skill: 7, attending: true },
      { id: IDS.playerB, name: "Regression Player B", skill: 5.5, attending: false },
    ],
    pairingRules: [],
    createdAtIso: FIXED_AT,
    updatedAtIso: FIXED_AT,
  };
}

function ratingSubmission(uid, skill = 6.5) {
  return {
    app: "Stripes",
    schemaVersion: 2,
    rosterId: IDS.roster,
    playerId: IDS.playerA,
    userUid: uid,
    skipped: false,
    skill,
    updatedAtIso: FIXED_AT,
  };
}

function cabinetConfig(uid, timestampValue, overrides = {}) {
  return {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "regression-cabinet-folder",
    displayName: "Regression File Cabinet",
    configuredByUid: uid,
    configuredAt: timestampValue,
    updatedAt: timestampValue,
    ...overrides,
  };
}

function clubNote(uid, text = "Regression note") {
  return {
    app: "Stripes",
    schemaVersion: 1,
    rosterId: IDS.roster,
    text,
    createdByUid: uid,
    createdAtIso: FIXED_AT,
  };
}

function fixtureRefs(db) {
  const group = doc(db, "sharedGroups", IDS.group);
  const roster = doc(db, "sharedRosters", IDS.roster);
  const taskConfig = doc(group, "taskBoard", "config");
  const proposal = doc(group, "organizerRemovalProposals", IDS.proposal);
  const proposalPrivate = doc(group, "organizerRemovalPrivate", IDS.proposal);
  return {
    group,
    roster,
    equipment: doc(group, "equipmentBags", IDS.equipment),
    cabinet: doc(group, "cabinet", "config"),
    taskConfig,
    taskColumn: doc(taskConfig, "columns", "ideas"),
    taskCard: doc(taskConfig, "cards", IDS.taskCard),
    attendance: doc(roster, "attendanceIssues", IDS.attendance),
    ratingSummary: doc(roster, "clubRatingSummaries", IDS.playerA),
    memberRating: doc(roster, "clubRatingSubmissions", `${IDS.member}_${IDS.playerA}`),
    organizerRating: doc(roster, "clubRatingSubmissions", `${IDS.organizerA}_${IDS.playerA}`),
    organizerNote: doc(roster, "clubNotes", IDS.organizerNote),
    proposal,
    proposalPrivate,
    proposalBallot: doc(proposalPrivate, "ballots", IDS.organizerA),
  };
}

async function seedStripesRegressionClub(environment) {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const refs = fixtureRefs(context.firestore());
    await Promise.all([
      setDoc(refs.group, groupDocument()),
      setDoc(refs.roster, rosterDocument()),
      setDoc(refs.equipment, {
        app: "Stripes",
        schemaVersion: 4,
        name: "Match equipment",
        items: [{ key: "balls", label: "Balls", quantity: 4 }],
      }),
      setDoc(refs.attendance, {
        app: "Stripes",
        schemaVersion: 1,
        rosterId: IDS.roster,
        playerId: IDS.playerA,
        playerName: "Regression Player A",
        issueType: "tardy",
        incidentDate: "2026-08-18",
      }),
      setDoc(refs.taskConfig, { app: "Stripes", schemaVersion: 4, title: "Action Board" }),
      setDoc(refs.taskColumn, { app: "Stripes", schemaVersion: 4, name: "Ideas", position: 0 }),
      setDoc(refs.taskCard, {
        app: "Stripes",
        schemaVersion: 7,
        title: "Choose training time",
        columnId: "ideas",
        position: 0,
        voteCount: 0,
      }),
      setDoc(refs.ratingSummary, {
        app: "Stripes",
        schemaVersion: 2,
        rosterId: IDS.roster,
        playerId: IDS.playerA,
        ratingCount: 2,
        ratingSum: 13,
        averageSkill: 6.5,
      }),
      setDoc(refs.memberRating, ratingSubmission(IDS.member)),
      setDoc(refs.organizerRating, ratingSubmission(IDS.organizerA, 7)),
      setDoc(refs.organizerNote, clubNote(IDS.organizerA, "Bring the blue bibs")),
      setDoc(refs.cabinet, cabinetConfig(IDS.organizerA, FIXED_AT)),
      setDoc(refs.proposal, {
        status: "open",
        targetUid: IDS.organizerB,
        totalOrganizerCount: 2,
        eligibleOrganizerCount: 1,
        castCount: 0,
      }),
      setDoc(refs.proposalPrivate, {
        targetUid: IDS.organizerB,
        eligibleVoterUids: [IDS.organizerA],
        yesCount: 0,
        noCount: 0,
      }),
      setDoc(refs.proposalBallot, { choice: "yes", castAtIso: FIXED_AT }),
    ]);
  });
}

function authenticatedFirestore(environment, identity) {
  return environment.authenticatedContext(identity.uid, { email: identity.email }).firestore();
}

module.exports = {
  IDS,
  IDENTITIES,
  authenticatedFirestore,
  cabinetConfig,
  clubNote,
  fixtureRefs,
  ratingSubmission,
  seedStripesRegressionClub,
};
