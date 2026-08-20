import type { StripesGoogleAuthError } from "../lib/firebaseGoogleAuthPolicy.ts";
import type { StripesTranslator } from "./i18n.ts";

export function googleAuthErrorText(
  error: StripesGoogleAuthError,
  t: StripesTranslator,
): string {
  if (error.reason === "cancelled") return t("shared.googleAuth.errors.cancelled");
  if (error.reason === "provider_disabled") return t("shared.googleAuth.errors.providerDisabled");
  if (error.reason === "existing_method") return t("shared.googleAuth.errors.existingMethod");
  if (error.reason === "already_linked_elsewhere") {
    return t("shared.googleAuth.errors.alreadyLinkedElsewhere");
  }
  if (error.reason === "wrong_existing_email") {
    return t("shared.googleAuth.errors.wrongExistingEmail");
  }

  // `unavailable` intentionally covers several mature, distinct safety errors.
  // Preserve their compatibility text until the domain exposes narrower reasons.
  return error.message;
}
