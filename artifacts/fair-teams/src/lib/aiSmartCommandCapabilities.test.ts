import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_SMART_COMMAND_CAPABILITIES,
  aiCommandCapabilityDescription,
  aiCommandCapabilityLabel,
  aiCommandSupportLabel,
} from "./aiSmartCommandCapabilities.ts";
import type { AiSmartCommandAction } from "./aiSmartCommandTypes.ts";

function action(overrides: Partial<AiSmartCommandAction>): AiSmartCommandAction {
  return {
    type: "no_action",
    playerRefs: [],
    newPlayerName: null,
    suggestedSkill: null,
    playersPerTeam: null,
    teamCount: null,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: null,
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: null,
    supportStatus: null,
    requiresConfirmation: false,
    reason: null,
    ...overrides,
  };
}

test("capability catalog migration preserves stable IDs, action types, and statuses", () => {
  assert.deepEqual(
    AI_SMART_COMMAND_CAPABILITIES.map(({ id, actionType, supportStatus }) => ({ id, actionType, supportStatus })),
    [
      { id: "today.select_players", actionType: "select_players", supportStatus: "executable" },
      { id: "today.unselect_players", actionType: "unselect_players", supportStatus: "executable" },
      { id: "today.mark_late", actionType: "mark_players_late", supportStatus: "executable" },
      { id: "teams.set_team_size", actionType: "set_team_size", supportStatus: "executable" },
      { id: "teams.set_team_count", actionType: "set_team_count", supportStatus: "executable" },
      { id: "teams.pairing_rule", actionType: "add_pairing_rule", supportStatus: "executable" },
      { id: "teams.lock_player", actionType: "lock_player_to_team", supportStatus: "preview_only" },
      { id: "teams.spread_role", actionType: "spread_role_across_teams", supportStatus: "preview_only" },
      { id: "teams.generate", actionType: "generate_teams", supportStatus: "executable" },
      { id: "roster.add_new_player", actionType: "add_new_player_suggestion", supportStatus: "needs_confirmation" },
      { id: "club.add_note", actionType: "club_add_note", supportStatus: "executable" },
      { id: "roster.set_color", actionType: "set_roster_color", supportStatus: "understood_not_wired" },
      { id: "roster.rename", actionType: "rename_roster", supportStatus: "understood_not_wired" },
      { id: "navigation.open_area", actionType: "open_app_area", supportStatus: "executable" },
      { id: "equipment.add_item", actionType: "equipment_add_item", supportStatus: "understood_not_wired" },
      { id: "equipment.move_item", actionType: "equipment_move_item", supportStatus: "understood_not_wired" },
    ],
  );
});

test("capability presenters preserve canonical English", () => {
  const selectPlayers = AI_SMART_COMMAND_CAPABILITIES[0];
  const equipmentMove = AI_SMART_COMMAND_CAPABILITIES.at(-1)!;

  assert.equal(aiCommandCapabilityLabel(selectPlayers), "Select players for Session");
  assert.equal(
    aiCommandCapabilityDescription(selectPlayers),
    "Select existing roster players for Session from a spoken/typed player list.",
  );
  assert.equal(aiCommandCapabilityLabel(equipmentMove), "Move equipment bag");
  assert.equal(
    aiCommandCapabilityDescription(equipmentMove),
    "Understand moving an equipment bag/item to a holder. Real equipment moves are not wired yet.",
  );
});

test("support-status presenter preserves status semantics and English", () => {
  assert.equal(aiCommandSupportLabel(action({ type: "select_players", capabilityId: "today.select_players" })), "Can apply");
  assert.equal(aiCommandSupportLabel(action({ type: "lock_player_to_team", capabilityId: "teams.lock_player" })), "Understood · preview only");
  assert.equal(aiCommandSupportLabel(action({ type: "rename_roster", capabilityId: "roster.rename" })), "Understood · not wired yet");
  assert.equal(aiCommandSupportLabel(action({ type: "add_new_player_suggestion", capabilityId: "roster.add_new_player" })), "Tap to confirm");
  assert.equal(aiCommandSupportLabel(action({ type: "unsupported_action", supportStatus: "unsafe" })), "Protected");
  assert.equal(aiCommandSupportLabel(action({ type: "no_action", supportStatus: "unknown" })), "Needs review");
});
