export type AiSmartCommandLanguage = string;

export type AiSmartCommandActionType =
  | "select_players"
  | "unselect_players"
  | "add_new_player_suggestion"
  | "set_new_player_skill"
  | "set_team_size"
  | "set_team_count"
  | "add_pairing_rule"
  | "lock_player_to_team"
  | "spread_role_across_teams"
  | "balance_by_attribute"
  | "generate_teams"
  | "club_add_note"
  | "club_delete_note"
  | "set_roster_color"
  | "rename_roster"
  | "open_app_area"
  | "equipment_add_item"
  | "equipment_move_item"
  | "ask_confirmation"
  | "ask_clarifying_question"
  | "unsupported_action"
  | "no_action";

export type AiSmartCommandSupportStatus =
  | "executable"
  | "preview_only"
  | "understood_not_wired"
  | "needs_confirmation"
  | "unsafe"
  | "unknown";

export type AiSmartCommandPairingKind = "keep_together" | "keep_separate" | "unknown";

export type AiSmartCommandRole =
  | "defender"
  | "attacker"
  | "goalkeeper"
  | "playmaker"
  | "fast_player"
  | "strong_player"
  | "beginner"
  | "experienced_player"
  | "unknown";

export type AiSmartCommandPlayerRef = {
  playerId: string | null;
  rosterName: string | null;
  spokenName: string;
  confidence: number;
};

export type AiSmartCommandAction = {
  type: AiSmartCommandActionType;
  playerRefs: AiSmartCommandPlayerRef[];
  newPlayerName: string | null;
  suggestedSkill: number | null;
  playersPerTeam: number | null;
  teamCount: number | null;
  pairingKind: AiSmartCommandPairingKind | null;
  teamLabel: string | null;
  role: AiSmartCommandRole | null;
  attribute: string | null;
  distribution: string | null;
  noteText: string | null;
  colorName: string | null;
  targetName: string | null;
  targetArea: string | null;
  capabilityId: string | null;
  supportStatus: AiSmartCommandSupportStatus | null;
  requiresConfirmation: boolean;
  reason: string | null;
};

export type AiSmartCommandConfirmation = {
  id: string;
  type:
    | "missing_player"
    | "ambiguous_player"
    | "add_rule"
    | "add_new_player"
    | "apply_action"
    | "unsupported"
    | "destructive_action"
    | "unclear";
  message: string;
  playerRefs: AiSmartCommandPlayerRef[];
  suggestedActionType: AiSmartCommandActionType | null;
};

export type AiSmartCommandUnresolved = {
  text: string;
  issue: "unknown_player" | "ambiguous_player" | "unknown_intent" | "missing_context" | "unsupported_action";
  message: string;
};

export type AiSmartCommandParseMode = "ai" | "ai_with_local_hints" | "local_fallback";

export type AiSmartCommandResponse = {
  schemaVersion: 1;
  ok: boolean;
  detectedLanguage: AiSmartCommandLanguage;
  normalizedIntent: string;
  assistantSummary: string;
  confidence: number;
  actions: AiSmartCommandAction[];
  confirmations: AiSmartCommandConfirmation[];
  unresolved: AiSmartCommandUnresolved[];
  parseMode?: AiSmartCommandParseMode;
  debugWarnings?: string[];
};

export type AiSmartCommandRosterPlayer = {
  id: string;
  name: string;
  aka?: string;
  skill?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  passing?: number;
  isGoalkeeper?: boolean;
  isPlaymaker?: boolean;
  isFinisher?: boolean;
  isDribbler?: boolean;
  isSentinel?: boolean;
  isEngine?: boolean;
  isVersatile?: boolean;
  isSpaceFinder?: boolean;
  isOrganizer?: boolean;
  gender?: string;
  funBadge?: string;
  attending?: boolean;
};

export type AiSmartCommandContext = {
  rosterName?: string;
  rosterMode?: "local" | "shared";
  activeTab?: "roster" | "today" | "teams" | "club" | string;
  currentTeamCount?: number;
  currentPlayersPerTeam?: number;
  currentTeamsGenerated?: boolean;
  uiLanguage?: string;
};

export type AiSmartCommandRequest = {
  commandText: string;
  roster: AiSmartCommandRosterPlayer[];
  context?: AiSmartCommandContext;
};

export function isAiSmartCommandEnabled() {
  return String(import.meta.env.VITE_ENABLE_AI_SMART_COMMAND || "").toLowerCase() === "true";
}
