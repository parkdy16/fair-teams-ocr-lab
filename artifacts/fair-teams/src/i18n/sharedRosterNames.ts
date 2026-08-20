import type {
  FirebaseSharedGroupSummary,
  FirebaseSharedRosterSummary,
} from "../lib/sharedRosterService.ts";
import type { StripesTranslator } from "./i18n.ts";

export function sharedGroupSummaryNameText(
  summary: Pick<FirebaseSharedGroupSummary, "name" | "nameSource">,
  t: StripesTranslator,
): string {
  return summary.nameSource === "fallback"
    ? t("shared.names.missingGroupFallback")
    : summary.name;
}

export function sharedRosterSummaryNameText(
  summary: Pick<FirebaseSharedRosterSummary, "name" | "nameSource">,
  t: StripesTranslator,
): string {
  return summary.nameSource === "fallback"
    ? t("shared.names.missingRosterFallback")
    : summary.name;
}

export function sharedRosterGroupNameText(
  summary: Pick<FirebaseSharedRosterSummary, "groupName" | "groupNameSource">,
  t: StripesTranslator,
): string | undefined {
  if (!summary.groupName) return undefined;
  return summary.groupNameSource === "fallback"
    ? t("shared.names.missingGroupFallback")
    : summary.groupName;
}
