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
    supportStatus: "preview_only",
    description: "Understand player lists and attendance commands. Real selection will be wired later.",
    examples: ["Joon, Jorge and Sarah are playing today", "오늘 조지랑 사라 와요"],
  },
  {
    id: "teams.set_team_size",
    actionType: "set_team_size",
    label: "Set team size",
    supportStatus: "preview_only",
    description: "Understand 5v5, 6 gegen 6, 7대7, players per team, and mismatch warnings.",
    examples: ["make 5v5 teams", "6 gegen 6"],
  },
  {
    id: "teams.pairing_rule",
    actionType: "add_pairing_rule",
    label: "Pairing rules",
    supportStatus: "preview_only",
    description: "Understand keep-together and keep-separate instructions. Real application will be wired later.",
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
    id: "equipment.manage",
    actionType: "equipment_add_item",
    label: "Equipment board",
    supportStatus: "understood_not_wired",
    description: "Understand equipment requests, but do not execute yet.",
    examples: ["add a ball bag with two balls", "move bibs to Sarah"],
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
  return action.supportStatus === "executable" && action.type === "club_add_note" && Boolean(action.noteText?.trim());
}

export function aiCommandSupportLabel(action: AiSmartCommandAction) {
  const status = action.supportStatus || getAiCommandCapability(action)?.supportStatus || "unknown";
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
