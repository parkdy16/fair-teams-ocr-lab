import type { AiSmartCommandAction } from "./aiSmartCommandTypes.ts";

export const USE_EXISTING_PLAYER_DISTRIBUTION = "add_today_selection:use_existing_player";

const BULK_ALL_EXCEPT_DISTRIBUTION = "bulk_all_except";

export function isUseExistingPlayerAction(action: AiSmartCommandAction | null | undefined): boolean {
  if (action?.type !== "select_players") return false;
  const distributionTokens = String(action.distribution || "").split(":");
  if (distributionTokens.includes("use_existing_player")) return true;

  // Compatibility for provider/legacy actions created before the semantic marker existed.
  return /possible existing match/i.test(String(action.reason || ""));
}

export function bulkRosterSelectionExcludedText(
  action: AiSmartCommandAction | null | undefined,
): string {
  if (action?.type !== "select_players") return "";
  const distributionTokens = String(action.distribution || "").toLowerCase().split(":");
  if (!distributionTokens.includes(BULK_ALL_EXCEPT_DISTRIBUTION)) return "";

  const structuredExcludedText = String(action.targetName || "").trim();
  if (structuredExcludedText) return structuredExcludedText;

  // Compatibility for provider/legacy actions created before the structured
  // exclusion label existed. Current local actions do not parse translated text.
  const legacyMatch = String(action.reason || "").match(/excluding (.+?)\.?$/i);
  return legacyMatch?.[1]?.trim() || "";
}
