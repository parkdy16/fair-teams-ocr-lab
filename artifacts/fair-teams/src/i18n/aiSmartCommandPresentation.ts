import type { StripesTranslator } from "./i18n.ts";

export function aiTargetAreaText(
  targetArea: string | null | undefined,
  t: StripesTranslator,
): string {
  if (targetArea === "Roster") return t("ai.area.roster");
  if (targetArea === "Session") return t("ai.area.session");
  if (targetArea === "Teams") return t("ai.area.teams");
  if (targetArea === "Club") return t("ai.area.club");
  return targetArea || "";
}
