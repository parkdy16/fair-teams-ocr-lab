import {
  verificationResendSeconds,
  type StripesEmailVerificationError,
} from "../lib/stripesEmailVerificationState.ts";
import type { StripesTranslator } from "./i18n";

export function verificationEmailErrorText(
  error: StripesEmailVerificationError,
  t: StripesTranslator,
): string {
  if (error.reason === "signed_out") return t("shared.verification.errors.signedOut");
  if (error.reason === "already_verified") return t("shared.verification.errors.alreadyVerified");
  if (error.reason === "cooldown") return t("shared.verification.errors.cooldown");
  if (error.reason === "daily_limit") return t("shared.verification.errors.dailyLimit");
  if (error.reason === "delivery_failed") return t("shared.verification.errors.deliveryFailed");
  return error.message;
}

export function verificationResendText(
  resendAvailableAt: string | null,
  nowMillis: number,
  t: StripesTranslator,
): string {
  const seconds = verificationResendSeconds(resendAvailableAt, nowMillis);
  return seconds == null ? "" : t("shared.verification.resendAvailable", { count: seconds });
}
