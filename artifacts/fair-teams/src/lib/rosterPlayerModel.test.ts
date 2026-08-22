import assert from "node:assert/strict";
import test from "node:test";

import { calculateOverall, normalizePlayer } from "./localRoster.ts";
import {
  applyProfileToPlayer,
  createDefaultRosterPlayerModel,
  importPresetPackIntoModel,
  normalizePresetSelection,
  normalizeRosterPlayerModel,
  parsePresetPack,
  playerModelAttributesMatch,
  profileForPresetSelection,
  resetPlayerRatingsForModel,
  resizeRosterPlayerModel,
  serializePresetPack,
  upsertPreset,
} from "./rosterPlayerModel.ts";

function player(name = "Marco") {
  return normalizePlayer({
    id: `player-${name.toLowerCase()}`,
    name,
    gender: "male",
    skill: 5,
    attack: 5,
    defense: 5,
    speed: 5,
    passing: 5,
    stamina: 5,
    physical: 5,
    teamPlay: 2,
    attending: false,
    isGoalkeeper: true,
    profilePhoto: "data:image/png;base64,example",
    createdAt: "2026-08-21T00:00:00.000Z",
  });
}

test("the default Football model uses six meaningful attributes and no all-rounder preset", () => {
  const model = createDefaultRosterPlayerModel();
  assert.equal(model.profileSize, 6);
  assert.deepEqual(
    model.attributes.map((attribute) => attribute.label),
    ["Goal Threat", "Creation", "Stamina", "Defense", "Technique", "Pace"],
  );
  assert.ok(model.presets.length >= 8);
  assert.ok(model.presets.some((preset) => preset.id === "technician"));
  assert.ok(!model.presets.some((preset) => preset.id === "all-rounder"));
});


test("three-attribute models keep the universal Goal Threat, Creation, and Defense slots", () => {
  const model = resizeRosterPlayerModel(createDefaultRosterPlayerModel(), 3);
  assert.equal(model.profileSize, 3);
  assert.deepEqual(model.attributes.map((attribute) => attribute.label), ["Goal Threat", "Creation", "Defense"]);
  assert.deepEqual(model.attributes.map((attribute) => attribute.slot), ["attack", "passing", "defense"]);
  assert.deepEqual(model.presets.map((preset) => preset.id), ["goal-threat", "playmaker", "defender"]);
});

test("saved preset shapes are centered so they cannot add hidden overall strength", () => {
  const model = createDefaultRosterPlayerModel();
  const source = {
    ...model.presets[0],
    id: "custom-all-up",
    name: "Everything up",
    builtIn: false,
    offsets: {
      attack: 4,
      passing: 4,
      stamina: 4,
      defense: 4,
      physical: 4,
      speed: 4,
    },
  };
  const updated = upsertPreset(model, source);
  const saved = updated.presets.find((preset) => preset.id === "custom-all-up");
  assert.ok(saved);
  assert.deepEqual(Object.values(saved.offsets), [0, 0, 0, 0, 0, 0]);
});

test("high OVR presets create a recognisable shape instead of a nearly full radar", () => {
  const model = createDefaultRosterPlayerModel();
  const profile = profileForPresetSelection(model, 9, ["goal-threat"]);

  assert.equal(profile.attack, 10);
  assert.ok(profile.defense <= 4.5, `expected a visible defensive weakness, got ${profile.defense}`);
  assert.ok(profile.passing < 9);
  assert.ok(Object.values(profile).some((value) => value <= 5));
  assert.ok(Object.values(profile).some((value) => value >= 9));
});

test("the same preset preserves its relative shape at lower OVR", () => {
  const model = createDefaultRosterPlayerModel();
  const low = profileForPresetSelection(model, 4, ["goal-threat"]);
  const high = profileForPresetSelection(model, 9, ["goal-threat"]);

  assert.ok(low.attack > low.defense);
  assert.ok(high.attack > high.defense);
  assert.ok(high.attack > low.attack);
  assert.ok(high.defense > low.defense);
});


test("preset selections keep only unique IDs that still belong to the roster model", () => {
  const model = createDefaultRosterPlayerModel();
  assert.deepEqual(
    normalizePresetSelection(model, ["goal-threat", "missing", "goal-threat", "fast", "defender"]),
    ["goal-threat", "fast"],
  );
  assert.deepEqual(normalizePresetSelection(model, "goal-threat"), []);
});

test("one primary plus one secondary preset blends predictably and ignores extras", () => {
  const model = createDefaultRosterPlayerModel();
  const two = profileForPresetSelection(model, 7, ["goal-threat", "fast"]);
  const three = profileForPresetSelection(model, 7, ["goal-threat", "fast", "defender"]);

  assert.deepEqual(three, two);
  assert.ok(two.attack > two.defense);
  assert.ok(two.speed > two.passing);
});

test("OVR remains independent after a preset profile is applied", () => {
  const model = createDefaultRosterPlayerModel();
  const base = player();
  const profile = profileForPresetSelection(model, 9, ["goal-threat"]);
  const rated = normalizePlayer(applyProfileToPlayer(base, 9, profile, ["goal-threat"]));

  assert.equal(rated.skill, 9);
  assert.equal(calculateOverall(rated), 9);
  assert.equal(rated.overallIndependent, true);
  assert.deepEqual(rated.profilePresetIds, ["goal-threat"]);
  assert.ok(rated.defense < rated.skill);
});

test("preset packs contain the complete attribute model and only selected presets", () => {
  const model = createDefaultRosterPlayerModel();
  const json = serializePresetPack(model, ["goal-threat", "playmaker"], "Thursday Football");
  const pack = parsePresetPack(json);

  assert.equal(pack.name, "Thursday Football");
  assert.equal(pack.playerModel.attributes.length, 6);
  assert.deepEqual(pack.presets.map((preset) => preset.id), ["goal-threat", "playmaker"]);

  const imported = importPresetPackIntoModel(model, pack);
  assert.equal(imported.presets.length, model.presets.length + 2);
  assert.ok(imported.presets.some((preset) => preset.name === "Goal Threat (1)"));
});

test("different attribute models cannot silently accept one another's presets", () => {
  const six = createDefaultRosterPlayerModel();
  const three = normalizeRosterPlayerModel({ ...six, profileSize: 3 });
  assert.equal(playerModelAttributesMatch(six, three), false);
});

test("changing the player model can retain player identity while clearing rating data", () => {
  const original = normalizePlayer({
    ...player(),
    skill: 9,
    overallIndependent: true,
    profilePresetIds: ["goal-threat"],
    profileFineTuned: true,
    attack: 10,
    defense: 4,
    isPlaymaker: true,
    isFinisher: true,
    isNew: false,
  });
  const [reset] = resetPlayerRatingsForModel([original]);

  assert.equal(reset.id, original.id);
  assert.equal(reset.name, original.name);
  assert.equal(reset.profilePhoto, original.profilePhoto);
  assert.equal(reset.isGoalkeeper, true);
  assert.equal(reset.skill, 5);
  assert.equal(reset.overallIndependent, false);
  assert.equal(reset.profilePresetIds, undefined);
  assert.equal(reset.profileFineTuned, false);
  assert.equal(reset.isPlaymaker, false);
  assert.equal(reset.isFinisher, false);
  assert.equal(reset.isNew, true);
});
