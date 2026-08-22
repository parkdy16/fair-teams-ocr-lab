import assert from "node:assert/strict";
import test from "node:test";

import { createRoster, normalizeRoster } from "./localRoster.ts";
import {
  firebaseSharedRosterMaterialRevisionKey,
  makeFirebaseSharedRosterMaterialPayload,
} from "./sharedRosterSyncPayload.ts";

function rosterWithOnePlayer() {
  return createRoster("Friday Football", [{
    id: "player-a",
    name: "Alex",
    gender: "male",
    skill: 9,
    overallIndependent: true,
    profilePresetIds: ["goal-threat"],
    profileFineTuned: true,
    attack: 10,
    defense: 4,
    speed: 8.5,
    passing: 7.5,
    stamina: 7,
    physical: 8,
    teamPlay: 2,
    attending: false,
    createdAt: "2026-08-21T00:00:00.000Z",
  }]);
}

test("legacy rosters receive one deterministic default player model", () => {
  const first = normalizeRoster({
    id: "legacy-a",
    name: "Legacy Football",
    players: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const second = normalizeRoster({
    id: "legacy-a",
    name: "Legacy Football",
    players: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });

  assert.deepEqual(first.playerModel, second.playerModel);
  assert.equal(firebaseSharedRosterMaterialRevisionKey(first), firebaseSharedRosterMaterialRevisionKey(second));
});

test("player-model edits participate in shared autosync material identity", () => {
  const roster = rosterWithOnePlayer();
  const changed = {
    ...roster,
    playerModel: {
      ...roster.playerModel,
      presets: roster.playerModel.presets.map((preset, index) => index === 0
        ? { ...preset, name: "Direct Scorer", updatedAt: "2026-08-21T01:00:00.000Z" }
        : preset),
      updatedAt: "2026-08-21T01:00:00.000Z",
    },
  };

  assert.notEqual(
    firebaseSharedRosterMaterialRevisionKey(roster),
    firebaseSharedRosterMaterialRevisionKey(changed),
  );
});

test("shared roster material keeps private detailed observations out of canonical player data", () => {
  const roster = rosterWithOnePlayer();
  const payload = makeFirebaseSharedRosterMaterialPayload(roster);
  const [player] = payload.players;

  assert.equal(player.skill, 9);
  assert.equal(player.attack, 9);
  assert.equal(player.defense, 9);
  assert.equal(player.speed, 9);
  assert.equal(player.passing, 9);
  assert.equal(player.stamina, 9);
  assert.equal(player.physical, 9);
  assert.equal("profilePresetIds" in player, false);
  assert.equal("profileFineTuned" in player, false);
  assert.equal("overallIndependent" in player, false);
  assert.equal(payload.playerModel.profileSize, 6);
});
