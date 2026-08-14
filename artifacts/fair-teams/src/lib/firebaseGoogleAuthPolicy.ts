export const STRIPES_GOOGLE_AUTH_FLOW = "popup" as const;
export const STRIPES_GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;
export const GOOGLE_FIREBASE_PROVIDER_ID = "google.com";

export class StripesGoogleAuthError extends Error {
  readonly reason: "cancelled" | "provider_disabled" | "existing_method" | "already_linked_elsewhere" | "wrong_existing_email" | "unavailable";

  constructor(
    reason: "cancelled" | "provider_disabled" | "existing_method" | "already_linked_elsewhere" | "wrong_existing_email" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "StripesGoogleAuthError";
    this.reason = reason;
  }
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return String((error as { code?: unknown }).code || "").toLowerCase();
}

export function googleAuthError(error: unknown): StripesGoogleAuthError {
  const code = errorCode(error);
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) {
    return new StripesGoogleAuthError("cancelled", "Google sign-in was cancelled.");
  }
  if (/operation-not-allowed/.test(code)) {
    return new StripesGoogleAuthError(
      "provider_disabled",
      "Google sign-in is not available yet. Use email and password.",
    );
  }
  if (/account-exists-with-different-credential/.test(code)) {
    return new StripesGoogleAuthError(
      "existing_method",
      "This email already has a Stripes account. Sign in with your existing method to connect Google.",
    );
  }
  if (/credential-already-in-use|email-already-in-use/.test(code)) {
    return new StripesGoogleAuthError(
      "already_linked_elsewhere",
      "This Google account is already connected to another Stripes account. Sign in with your existing method.",
    );
  }
  if (/popup-blocked/.test(code)) {
    return new StripesGoogleAuthError("unavailable", "Allow the Google sign-in popup and try again.");
  }
  if (error instanceof StripesGoogleAuthError) return error;
  return new StripesGoogleAuthError("unavailable", "Stripes could not complete Google sign-in. Try again.");
}

export function hasGoogleProvider(user: { providerIds?: string[] } | null) {
  return Boolean(user?.providerIds?.includes(GOOGLE_FIREBASE_PROVIDER_ID));
}

function normalizeLinkEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function pendingGoogleLinkDecision(pendingEmail?: string | null, authenticatedEmail?: string | null) {
  const pending = normalizeLinkEmail(pendingEmail);
  if (!pending) return "none" as const;
  return pending === normalizeLinkEmail(authenticatedEmail)
    ? "link" as const
    : "wrong_email" as const;
}

export function googleLinkPreservesUid(existingUid: string, linkedUid: string) {
  return Boolean(existingUid && existingUid === linkedUid);
}
