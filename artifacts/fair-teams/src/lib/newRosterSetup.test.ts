import assert from "node:assert/strict";
import test from "node:test";

import {
  createCustomRosterPlayerModel,
  customPlayerModelNeedsDefinition,
  isCustomRosterPlayerModel,
  playerHasModelBoundProfile,
  playerModelAttributeIssue,
  resizeCustomRosterPlayerModel,
  rosterPlayerModelAttributesLocked,
} from "./newRosterSetup.ts";
import { createDefaultRosterPlayerModel } from "./rosterPlayerModel.ts";

test("custom roster setup starts OVR-ready with three neutral attributes and no presets", () => {
  const model = createCustomRosterPlayerModel();
  assert.equal(model.profileSize, 3);
  assert.deepEqual(model.attributes.map((attribute) => attribute.slot), ["attack", "passing", "defense"]);
  assert.deepEqual(model.attributes.map((attribute) => attribute.label), ["Attribute 1", "Attribute 2", "Attribute 3"]);
  assert.equal(model.presets.length, 0);
  assert.equal(customPlayerModelNeedsDefinition(model), true);
  model.attributes[0] = { ...model.attributes[0], label: "Strategy" };
  assert.equal(customPlayerModelNeedsDefinition(model), true);
  model.attributes = model.attributes.map((attribute, index) => ({ ...attribute, label: ["Strategy", "Knowledge", "Communication"][index] }));
  assert.equal(customPlayerModelNeedsDefinition(model), false);
});

test("custom six-attribute setup keeps every supported storage slot", () => {
  const model = createCustomRosterPlayerModel(6);
  assert.equal(model.profileSize, 6);
  assert.deepEqual(
    model.attributes.map((attribute) => attribute.slot),
    ["attack", "passing", "stamina", "defense", "physical", "speed"],
  );
});

test("custom models remain distinguishable from the built-in Football contract", () => {
  const custom = createCustomRosterPlayerModel();
  assert.equal(isCustomRosterPlayerModel(custom), true);
  const portable = {
    ...custom,
    attributes: custom.attributes.map((attribute, index) => ({
      ...attribute,
      id: ["strategy", "knowledge", "communication"][index],
      label: ["Strategy", "Knowledge", "Communication"][index],
    })),
  };
  assert.equal(isCustomRosterPlayerModel(portable), true);
  assert.equal(isCustomRosterPlayerModel(createDefaultRosterPlayerModel()), false);
});

test("custom profile resizing preserves named attributes and never injects Football presets", () => {
  const model = createCustomRosterPlayerModel();
  model.attributes[0] = { ...model.attributes[0], label: "Strategy" };
  const expanded = resizeCustomRosterPlayerModel(model, 6);
  assert.equal(expanded.profileSize, 6);
  assert.equal(expanded.attributes[0].label, "Strategy");
  assert.deepEqual(expanded.attributes.slice(3).map((attribute) => attribute.label), ["Attribute 4", "Attribute 5", "Attribute 6"]);
  assert.equal(expanded.presets.length, 0);
});

test("attribute validation rejects missing and duplicate labels", () => {
  const missing = createCustomRosterPlayerModel();
  missing.attributes[0] = { ...missing.attributes[0], label: "" };
  assert.equal(playerModelAttributeIssue(missing), "missing");

  const duplicate = createCustomRosterPlayerModel();
  duplicate.attributes[1] = { ...duplicate.attributes[1], label: duplicate.attributes[0].label };
  assert.equal(playerModelAttributeIssue(duplicate), "duplicate");
  assert.equal(playerModelAttributeIssue(createDefaultRosterPlayerModel()), null);
});

test("local OVR-only players do not prematurely lock the model", () => {
  const ovrOnly = { id: "p1", name: "Alex", skill: 6, overallIndependent: true };
  const presetRated = { ...ovrOnly, profilePresetIds: ["playmaker"] };
  const fineTuned = { ...ovrOnly, profileFineTuned: true };
  assert.equal(playerHasModelBoundProfile(ovrOnly), false);
  assert.equal(rosterPlayerModelAttributesLocked([ovrOnly]), false);
  assert.equal(rosterPlayerModelAttributesLocked([presetRated]), true);
  assert.equal(rosterPlayerModelAttributesLocked([fineTuned]), true);
  assert.equal(rosterPlayerModelAttributesLocked([ovrOnly], true), true);
});
