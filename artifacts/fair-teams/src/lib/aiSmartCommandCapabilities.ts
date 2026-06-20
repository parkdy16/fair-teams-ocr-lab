import type { AiSmartCommandAction, AiSmartCommandActionType, AiSmartCommandSupportStatus } from "./aiSmartCommandTypes";

export type AiSmartCommandCapability = {
  id: string;
  actionType: AiSmartCommandActionType;
  label: string;
  supportStatus: AiSmartCommandSupportStatus;
  description: string;
  examples: string[];
};

export const AI_SMART_COMMAND_CAPABILITIES: AiSmartCommandCapability[] = [
  {
    id: "today.select_players",
    actionType: "select_players",
    label: "Select players for Today",
    supportStatus: "executable",
    description: "Select existing roster players for Today from a spoken/typed player list.",
    examples: ["Joon, Jorge and Sarah are playing today", "오늘 조지랑 사라 와요"],
  },
  {
    id: "teams.set_team_size",
    actionType: "set_team_size",
    label: "Set team size",
    supportStatus: "executable",
    description: "Prepare the Teams tab from a players-per-team request such as 5v5 or 6v6.",
    examples: ["make 5v5 teams", "6 gegen 6"],
  },
  {
    id: "teams.set_team_count",
    actionType: "set_team_count",
    label: "Set number of teams",
    supportStatus: "executable",
    description: "Prepare the Teams tab with an explicit number of teams, without confusing 6 teams with 6v6.",
    examples: ["select everyone and make 6 teams", "alle Spieler in 4 Teams"],
  },
  {
    id: "teams.pairing_rule",
    actionType: "add_pairing_rule",
    label: "Pairing rules",
    supportStatus: "executable",
    description: "Add simple keep-together or keep-separate pairing rules for matched roster players.",
    examples: ["Sarah and Tommy don't like each other", "George and Laura came together"],
  },
  {
    id: "teams.lock_player",
    actionType: "lock_player_to_team",
    label: "Team lock / color",
    supportStatus: "preview_only",
    description: "Understand player-to-team/color locks such as George red.",
    examples: ["put George in red", "조지는 빨강팀"],
  },
  {
    id: "teams.spread_role",
    actionType: "spread_role_across_teams",
    label: "Spread role across teams",
    supportStatus: "preview_only",
    description: "Understand requests such as one good defender in each team.",
    examples: ["one good defender in each team", "각 팀에 수비수 한 명씩"],
  },
  {
    id: "teams.generate",
    actionType: "generate_teams",
    label: "Generate teams",
    supportStatus: "preview_only",
    description: "Understand generate/make teams requests. Actual generation will be wired later.",
    examples: ["make teams", "팀 만들어줘"],
  },
  {
    id: "roster.add_new_player",
    actionType: "add_new_player_suggestion",
    label: "Suggest new player",
    supportStatus: "needs_confirmation",
    description: "Recognize names that are not yet in the roster and ask before adding.",
    examples: ["Kira is playing today", "Kira is experienced"],
  },
  {
    id: "club.add_note",
    actionType: "club_add_note",
    label: "Add Club note",
    supportStatus: "executable",
    description: "Add a non-destructive post-it note to Club Notes when the current roster is shared and the user is signed in.",
    examples: ["add a note saying bring pump", "Club Notes에 공 가져오라고 적어줘"],
  },
  {
    id: "roster.set_color",
    actionType: "set_roster_color",
    label: "Change roster color",
    supportStatus: "understood_not_wired",
    description: "Understand color-change requests, but do not execute yet.",
    examples: ["change roster color to navy", "make this roster pink"],
  },
  {
    id: "roster.rename",
    actionType: "rename_roster",
    label: "Rename roster",
    supportStatus: "understood_not_wired",
    description: "Understand roster rename requests, but do not execute yet.",
    examples: ["rename this roster Lazy Lousy Saturday"],
  },
  {
    id: "equipment.add_item",
    actionType: "equipment_add_item",
    label: "Add equipment item",
    supportStatus: "understood_not_wired",
    description: "Understand adding a bag/item to the Equipment Board. Real equipment edits are not wired yet.",
    examples: ["add a ball bag with two balls", "create a bibs bag"],
  },
  {
    id: "equipment.move_item",
    actionType: "equipment_move_item",
    label: "Move equipment bag",
    supportStatus: "understood_not_wired",
    description: "Understand moving an equipment bag/item to a holder. Real equipment moves are not wired yet.",
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

export function aiCommandActionCanApply(action: AiSmartCommandAction) {
  const capability = getAiCommandCapability(action);
  const status = action.supportStatus || capability?.supportStatus || "unknown";
  if (status === "unsafe" || status === "needs_confirmation") return false;
  const executable = status === "executable" || capability?.supportStatus === "executable";
  if (!executable) return false;

  if (action.type === "club_add_note") return Boolean(action.noteText?.trim());
  if (action.type === "select_players") return action.playerRefs.some((player) => Boolean(player.playerId));
  if (action.type === "set_team_count") return typeof action.teamCount === "number";
  if (action.type === "set_team_size") return typeof action.playersPerTeam === "number";
  if (action.type === "add_pairing_rule") {
    return (
      (action.pairingKind === "keep_together" || action.pairingKind === "keep_separate") &&
      action.playerRefs.filter((player) => Boolean(player.playerId)).length >= 2
    );
  }

  return false;
}

export function aiCommandSupportLabel(action: AiSmartCommandAction) {
  const capability = getAiCommandCapability(action);
  const status = capability?.supportStatus === "executable" && action.supportStatus !== "unsafe" && action.supportStatus !== "needs_confirmation"
    ? "executable"
    : action.supportStatus || capability?.supportStatus || "unknown";
  switch (status) {
    case "executable":
      return "Can apply";
    case "preview_only":
      return "Understood · preview only";
    case "understood_not_wired":
      return "Understood · not wired yet";
    case "needs_confirmation":
      return "Needs confirmation";
    case "unsafe":
      return "Protected";
    default:
      return "Needs review";
  }
}
