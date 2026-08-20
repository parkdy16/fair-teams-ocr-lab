export class StripesEmailVerificationError extends Error {
  readonly reason: "signed_out" | "already_verified" | "cooldown" | "daily_limit" | "delivery_failed";
  readonly resendAvailableAt: string | null;

  constructor(
    reason: "signed_out" | "already_verified" | "cooldown" | "daily_limit" | "delivery_failed",
    message: string,
    resendAvailableAt: string | null = null,
  ) {
    super(message);
    this.name = "StripesEmailVerificationError";
    this.reason = reason;
    this.resendAvailableAt = resendAvailableAt;
  }
}

function validIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function callableDetails(error: unknown) {
  if (!error || typeof error !== "object") return {} as Record<string, unknown>;
  const direct = (error as { details?: unknown }).details;
  const nested = (error as { customData?: { details?: unknown } }).customData?.details;
  const value = direct || nested;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function verificationEmailError(error: unknown) {
  if (error instanceof StripesEmailVerificationError) return error;
  const code = error && typeof error === "object"
    ? String((error as { code?: unknown }).code || "").toLowerCase()
    : "";
  const details = callableDetails(error);
  const retryAt = validIso(details.resendAvailableAt);
  if (details.reason === "cooldown") {
    return new StripesEmailVerificationError(
      "cooldown",
      "Wait before requesting another verification email.",
      retryAt,
    );
  }
  if (details.reason === "daily_limit") {
    return new StripesEmailVerificationError(
      "daily_limit",
      "The daily verification-email limit has been reached. More emails can be sent later.",
      retryAt,
    );
  }
  if (details.reason === "already_verified") {
    return new StripesEmailVerificationError("already_verified", "This email is already verified.");
  }
  if (details.reason === "delivery_failed") {
    return new StripesEmailVerificationError(
      "delivery_failed",
      "Stripes could not send the verification email. Try again.",
      retryAt,
    );
  }
  if (/unauthenticated/.test(code)) {
    return new StripesEmailVerificationError("signed_out", "Sign in to request a verification email.");
  }
  return new StripesEmailVerificationError(
    "delivery_failed",
    "Stripes could not send the verification email. Try again.",
  );
}

export function verificationResendLabel(resendAvailableAt: string | null, nowMillis = Date.now()) {
  const seconds = verificationResendSeconds(resendAvailableAt, nowMillis);
  return seconds == null ? "" : `Resend available in ${seconds} seconds.`;
}

export function verificationResendSeconds(
  resendAvailableAt: string | null,
  nowMillis = Date.now(),
): number | null {
  const availableAt = resendAvailableAt ? Date.parse(resendAvailableAt) : NaN;
  if (!Number.isFinite(availableAt) || availableAt <= nowMillis) return null;
  return Math.max(1, Math.ceil((availableAt - nowMillis) / 1000));
}
