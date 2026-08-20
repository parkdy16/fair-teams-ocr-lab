import type { ActiveSharedWorkspaceAuthority } from "../lib/activeSharedWorkspaceAuthority.ts";
import type { StripesTranslator } from "./i18n";

export function activeSharedWorkspaceAuthorityText(
  authority: ActiveSharedWorkspaceAuthority,
  t: StripesTranslator,
): string {
  if (authority.status === "signed_out") return t("shared.authority.signedOut");
  if (authority.status === "loading") return t("shared.authority.loading");
  if (authority.status === "access_lost") return t("shared.authority.accessLost");
  if (authority.status === "unavailable") return t("shared.authority.unavailable");
  if (authority.issues.includes("authoritative_roster_group_id_malformed")) {
    return t("shared.authority.invalidClubReference");
  }
  if (authority.issues.includes("authoritative_group_membership_missing")) {
    return t("shared.authority.clubAccessUnavailable");
  }
  return "";
}
