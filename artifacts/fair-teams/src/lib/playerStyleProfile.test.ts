import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYER_STYLE_DEFINITIONS,
  generateStyledPlayerAttributes,
  inferPlayerStyleFromAttributes,
} from "./playerStyleProfile.ts";
import { calculateOverall } from "./localRoster.ts";

test("quick presets are presented in the approved easy-to-recognize order", () => {
  assert.deepEqual(
    PLAYER_STYLE_DEFINITIONS.map((preset) => preset.id),
    ["goal-threat", "playmaker", "defender", "fast", "high-energy", "technician", "all-rounder"],
  );
});

test("every quick preset keeps the generated profile close to the chosen OVR", () => {
  for (const target of [1, 2.5, 5, 7.5, 10]) {
    for (const preset of PLAYER_STYLE_DEFINITIONS) {
      const generated = generateStyledPlayerAttributes(target, preset.value);
      const overall = calculateOverall(generated);
      assert.ok(
        Math.abs(overall - target) <= 0.55,
        `${preset.label} at ${target} produced OVR ${overall}`,
      );
    }
  }
});

test("quick presets create recognizably different football profiles", () => {
  const defender = generateStyledPlayerAttributes(6, 0);
  const technician = generateStyledPlayerAttributes(6, 1);
  const highEnergy = generateStyledPlayerAttributes(6, 2);
  const allRounder = generateStyledPlayerAttributes(6, 3);
  const playmaker = generateStyledPlayerAttributes(6, 4);
  const fast = generateStyledPlayerAttributes(6, 5);
  const goalThreat = generateStyledPlayerAttributes(6, 6);

  assert.ok(defender.defense > defender.attack);
  assert.ok(technician.physical > technician.speed);
  assert.ok(technician.physical > technician.defense);
  assert.ok(highEnergy.stamina > allRounder.stamina);
  assert.ok(playmaker.passing > playmaker.defense);
  assert.ok(fast.speed > fast.defense);
  assert.ok(goalThreat.attack > goalThreat.defense);
});

test("generated profiles infer back to their originating preset", () => {
  for (const preset of PLAYER_STYLE_DEFINITIONS) {
    const generated = generateStyledPlayerAttributes(6.5, preset.value);
    assert.equal(
      inferPlayerStyleFromAttributes({ ...generated, skill: calculateOverall(generated) }),
      preset.value,
      preset.label,
    );
  }
});
