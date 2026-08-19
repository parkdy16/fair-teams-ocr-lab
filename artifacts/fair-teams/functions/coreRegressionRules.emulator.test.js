"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");
const {
  IDS,
  IDENTITIES,
  authenticatedFirestore,
  cabinetConfig,
  clubNote,
  fixtureRefs,
  ratingSubmission,
  seedStripesRegressionClub,
} = require("./testSupport/stripesRegressionFixture");

const PROJECT_ID = "demo-stripes-core-regression-rules";
const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

test("Stripes Regression Club preserves mature Firestore access behavior", async (t) => {
  const environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });

  const contexts = () => ({
    organizerA: authenticatedFirestore(environment, IDENTITIES.organizerA),
    organizerB: authenticatedFirestore(environment, IDENTITIES.organizerB),
    member: authenticatedFirestore(environment, IDENTITIES.member),
    unrelated: authenticatedFirestore(environment, IDENTITIES.unrelated),
  });

  try {
    await t.test("linked shared roster resolves only for current workspace members", async () => {
      await seedStripesRegressionClub(environment);
      const { organizerA, member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(organizerA).group))).data().rosterIds[0], IDS.roster);
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).roster))).data().groupId, IDS.group);
      await assertFails(getDoc(fixtureRefs(unrelated).group));
      await assertFails(getDoc(fixtureRefs(unrelated).roster));
    });

    await t.test("Equipment is member-readable and organizer-writable", async () => {
      await seedStripesRegressionClub(environment);
      const { organizerB, member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).equipment))).data().name, "Match equipment");
      await assertSucceeds(setDoc(fixtureRefs(organizerB).equipment, {
        app: "Stripes",
        schemaVersion: 4,
        name: "Updated equipment",
      }));
      await assertFails(updateDoc(fixtureRefs(member).equipment, { name: "Member overwrite" }));
      await assertFails(getDoc(fixtureRefs(unrelated).equipment));
      await assertFails(setDoc(fixtureRefs(unrelated).equipment, { name: "Injected" }));
    });

    await t.test("Attendance is member-readable and organizer-writable", async () => {
      await seedStripesRegressionClub(environment);
      const { organizerB, member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).attendance))).data().issueType, "tardy");
      await assertSucceeds(updateDoc(fixtureRefs(organizerB).attendance, { note: "Discussed after training" }));
      await assertFails(updateDoc(fixtureRefs(member).attendance, { note: "Member overwrite" }));
      await assertFails(getDoc(fixtureRefs(unrelated).attendance));
    });

    await t.test("Action Board allows member reads and organizer card, column, and vote writes", async () => {
      await seedStripesRegressionClub(environment);
      const { organizerA, member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).taskCard))).data().title, "Choose training time");
      await assertSucceeds(updateDoc(fixtureRefs(organizerA).taskCard, {
        voteCount: 1,
        updatedByUid: IDS.organizerA,
      }));
      await assertSucceeds(setDoc(fixtureRefs(organizerA).taskColumn, {
        app: "Stripes",
        schemaVersion: 4,
        name: "Ideas and decisions",
        position: 0,
      }));
      await assertFails(updateDoc(fixtureRefs(member).taskCard, { voteCount: 2 }));
      await assertFails(getDoc(fixtureRefs(unrelated).taskCard));
    });

    await t.test("Club ratings preserve member reads and own-submission access only", async () => {
      await seedStripesRegressionClub(environment);
      const { member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).ratingSummary))).data().averageSkill, 6.5);
      await assertSucceeds(setDoc(
        fixtureRefs(member).memberRating,
        ratingSubmission(IDS.member, 7.5),
      ));
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).memberRating))).data().skill, 7.5);
      await assertFails(getDoc(fixtureRefs(member).organizerRating));
      await assertFails(getDoc(fixtureRefs(unrelated).ratingSummary));
      await assertFails(setDoc(
        fixtureRefs(unrelated).memberRating,
        ratingSubmission(IDS.unrelated, 8),
      ));
    });

    await t.test("Club Notes allow member read, create, and delete-own but deny unrelated access", async () => {
      await seedStripesRegressionClub(environment);
      const { member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(member).organizerNote))).data().text, "Bring the blue bibs");
      const ownNote = await assertSucceeds(addDoc(
        collection(fixtureRefs(member).roster, "clubNotes"),
        clubNote(IDS.member, "Member-owned note"),
      ));
      await assertSucceeds(deleteDoc(ownNote));
      await assertFails(deleteDoc(fixtureRefs(member).organizerNote));
      await assertFails(getDoc(fixtureRefs(unrelated).organizerNote));
      await assertFails(addDoc(
        collection(fixtureRefs(unrelated).roster, "clubNotes"),
        clubNote(IDS.unrelated, "Injected note"),
      ));
    });

    await t.test("File Cabinet config remains organizer-only in the linked workspace", async () => {
      await seedStripesRegressionClub(environment);
      const { organizerB, member, unrelated } = contexts();
      assert.equal((await assertSucceeds(getDoc(fixtureRefs(organizerB).cabinet))).data().folderId, "regression-cabinet-folder");
      await assertSucceeds(setDoc(
        fixtureRefs(organizerB).cabinet,
        cabinetConfig(IDS.organizerB, serverTimestamp(), { folderId: "replacement-folder" }),
      ));
      await assertFails(getDoc(fixtureRefs(member).cabinet));
      await assertFails(setDoc(
        fixtureRefs(member).cabinet,
        cabinetConfig(IDS.member, serverTimestamp()),
      ));
      await assertFails(getDoc(fixtureRefs(unrelated).cabinet));
    });

    await t.test("protected-removal electorate and ballots remain private", async () => {
      await seedStripesRegressionClub(environment);
      const { organizerA, organizerB, member } = contexts();
      await assertSucceeds(getDoc(fixtureRefs(organizerA).proposal));
      await assertSucceeds(getDoc(fixtureRefs(organizerB).proposal));
      await assertFails(getDoc(fixtureRefs(member).proposal));
      await assertFails(getDoc(fixtureRefs(organizerA).proposalPrivate));
      await assertFails(getDoc(fixtureRefs(organizerA).proposalBallot));
      await assertFails(setDoc(fixtureRefs(organizerA).proposalBallot, { choice: "no" }));
    });
  } finally {
    await environment.cleanup();
  }
});
