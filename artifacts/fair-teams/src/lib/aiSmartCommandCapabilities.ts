import type { AiSmartCommandAction, AiSmartCommandActionType, AiSmartCommandSupportStatus } from "./aiSmartCommandTypes";
import { translate, type StripesTranslator } from "../i18n/i18n.ts";
import type { TranslationKey } from "../i18n/resources/en.ts";

export type AiSmartCommandCapability = {
  id: string;
  actionType: AiSmartCommandActionType;
  labelKey: TranslationKey;
  supportStatus: AiSmartCommandSupportStatus;
  descriptionKey: TranslationKey;
  examples: string[];
};

export const AI_SMART_COMMAND_CAPABILITIES: AiSmartCommandCapability[] = [
  {
    id: "today.select_players",
    actionType: "select_players",
    labelKey: "ai.capability.todaySelectPlayers.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.todaySelectPlayers.description",
    examples: ["Joon, Jorge and Sarah are playing today", "오늘 조지랑 사라 와요"],
  },
  {
    id: "today.unselect_players",
    actionType: "unselect_players",
    labelKey: "ai.capability.todayUnselectPlayers.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.todayUnselectPlayers.description",
    examples: ["remove George from today", "Joon is not coming", "take Brijesh out"],
  },
  {
    id: "today.mark_late",
    actionType: "mark_players_late",
    labelKey: "ai.capability.todayMarkLate.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.todayMarkLate.description",
    examples: ["Tanja is late", "Joon, Jorge and Tanja are here, but Tanja is late"],
  },
  {
    id: "teams.set_team_size",
    actionType: "set_team_size",
    labelKey: "ai.capability.teamsSetTeamSize.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.teamsSetTeamSize.description",
    examples: ["make 5v5 teams", "6 gegen 6"],
  },
  {
    id: "teams.set_team_count",
    actionType: "set_team_count",
    labelKey: "ai.capability.teamsSetTeamCount.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.teamsSetTeamCount.description",
    examples: ["select everyone and make 6 teams", "alle Spieler in 4 Teams"],
  },
  {
    id: "teams.pairing_rule",
    actionType: "add_pairing_rule",
    labelKey: "ai.capability.teamsPairingRule.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.teamsPairingRule.description",
    examples: ["Sarah and Tommy don't like each other", "George and Laura came together"],
  },
  {
    id: "teams.lock_player",
    actionType: "lock_player_to_team",
    labelKey: "ai.capability.teamsLockPlayer.label",
    supportStatus: "preview_only",
    descriptionKey: "ai.capability.teamsLockPlayer.description",
    examples: ["put George in red", "조지는 빨강팀"],
  },
  {
    id: "teams.spread_role",
    actionType: "spread_role_across_teams",
    labelKey: "ai.capability.teamsSpreadRole.label",
    supportStatus: "preview_only",
    descriptionKey: "ai.capability.teamsSpreadRole.description",
    examples: ["one good defender in each team", "각 팀에 수비수 한 명씩"],
  },
  {
    id: "teams.generate",
    actionType: "generate_teams",
    labelKey: "ai.capability.teamsGenerate.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.teamsGenerate.description",
    examples: ["make two teams from today's selected players", "generate teams", "팀 만들어줘"],
  },
  {
    id: "roster.add_new_player",
    actionType: "add_new_player_suggestion",
    labelKey: "ai.capability.rosterAddNewPlayer.label",
    supportStatus: "needs_confirmation",
    descriptionKey: "ai.capability.rosterAddNewPlayer.description",
    examples: ["Kira is playing today", "Kira is experienced"],
  },
  {
    id: "club.add_note",
    actionType: "club_add_note",
    labelKey: "ai.capability.clubAddNote.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.clubAddNote.description",
    examples: ["add a note saying bring pump", "Club Notes에 공 가져오라고 적어줘"],
  },
  {
    id: "roster.set_color",
    actionType: "set_roster_color",
    labelKey: "ai.capability.rosterSetColor.label",
    supportStatus: "understood_not_wired",
    descriptionKey: "ai.capability.rosterSetColor.description",
    examples: ["change roster color to navy", "make this roster pink"],
  },
  {
    id: "roster.rename",
    actionType: "rename_roster",
    labelKey: "ai.capability.rosterRename.label",
    supportStatus: "understood_not_wired",
    descriptionKey: "ai.capability.rosterRename.description",
    examples: ["rename this roster Lazy Lousy Saturday"],
  },
  {
    id: "navigation.open_area",
    actionType: "open_app_area",
    labelKey: "ai.capability.navigationOpenArea.label",
    supportStatus: "executable",
    descriptionKey: "ai.capability.navigationOpenArea.description",
    examples: ["open Session", "show me the Teams tab", "go to Roster"],
  },
  {
    id: "equipment.add_item",
    actionType: "equipment_add_item",
    labelKey: "ai.capability.equipmentAddItem.label",
    supportStatus: "understood_not_wired",
    descriptionKey: "ai.capability.equipmentAddItem.description",
    examples: ["add a ball bag with two balls", "create a bibs bag"],
  },
  {
    id: "equipment.move_item",
    actionType: "equipment_move_item",
    labelKey: "ai.capability.equipmentMoveItem.label",
    supportStatus: "understood_not_wired",
    descriptionKey: "ai.capability.equipmentMoveItem.description",
    examples: ["move the bibs bag to Sarah", "George has the cones now", "blue ball bag to Tommy"],
  },
];

export function getAiCommandCapability(action: AiSmartCommandAction) {
  if (action.capabilityId) {
    const byId = AI_SMART_COMMAND_CAPABILITIES.find((item) => item.id === action.capabilityId);
    if (byId) return byId;
  }
  return AI_SMART_COMMAND_CAPABILITIES.find((item) => item.actionType === action.type) || null;
}

export function aiCommandCapabilityLabel(
  capability: AiSmartCommandCapability,
  t: StripesTranslator = translate,
) {
  return t(capability.labelKey);
}

export function aiCommandCapabilityDescription(
  capability: AiSmartCommandCapability,
  t: StripesTranslator = translate,
) {
  return t(capability.descriptionKey);
}

export function aiCommandActionCanApply(action: AiSmartCommandAction) {
  const capability = getAiCommandCapability(action);
  const status = action.supportStatus || capability?.supportStatus || "unknown";
  if (status === "unsafe") return false;
  if (action.type === "add_new_player_suggestion") return Boolean(action.newPlayerName?.trim());
  if (status === "needs_confirmation") return false;
  const executable = status === "executable" || capability?.supportStatus === "executable";
  if (!executable) return false;

  if (action.type === "club_add_note") return Boolean(action.noteText?.trim());
  if (action.type === "select_players" || action.type === "unselect_players" || action.type === "mark_players_late") return action.playerRefs.some((player) => Boolean(player.playerId));
  if (action.type === "open_app_area") return Boolean(action.targetArea?.trim());
  if (action.type === "set_team_count") return typeof action.teamCount === "number";
  if (action.type === "set_team_size") return typeof action.playersPerTeam === "number";
  if (action.type === "generate_teams") return typeof action.teamCount === "number" || typeof action.playersPerTeam === "number";
  if (action.type === "add_pairing_rule") {
    return (
      (action.pairingKind === "keep_together" || action.pairingKind === "keep_separate") &&
      action.playerRefs.filter((player) => Boolean(player.playerId)).length >= 2
    );
  }

  return false;
}

export function aiCommandSupportLabel(action: AiSmartCommandAction, t: StripesTranslator = translate) {
  const capability = getAiCommandCapability(action);
  const status = capability?.supportStatus === "executable" && action.supportStatus !== "unsafe" && action.supportStatus !== "needs_confirmation"
    ? "executable"
    : action.supportStatus || capability?.supportStatus || "unknown";
  switch (status) {
    case "executable":
      return t("ai.support.canApply");
    case "preview_only":
      return t("ai.support.previewOnly");
    case "understood_not_wired":
      return t("ai.support.notWired");
    case "needs_confirmation":
      return action.type === "add_new_player_suggestion" ? t("ai.support.tapToConfirm") : t("ai.support.needsConfirmation");
    case "unsafe":
      return t("ai.support.protected");
    default:
      return t("ai.support.needsReview");
  }
}
