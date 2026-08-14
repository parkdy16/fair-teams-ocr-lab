"use strict";

const VERIFICATION_COOLDOWN_MS = 60 * 1000;
const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_MAX_SENDS = 10;
const STRIPES_APP_URL = "https://stripes.work/app";
const OPAQUE_INVITATION_ID = /^[A-Za-z0-9_-]{16,200}$/;

class EmailVerificationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "EmailVerificationError";
    this.code = code;
    this.details = details;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function verificationIdentity(authUser) {
  const uid = String(authUser?.uid || "").trim();
  if (!uid) {
    throw new EmailVerificationError("unauthenticated", "Sign in first.");
  }
  const email = normalizeEmail(authUser?.email);
  if (!email || !email.includes("@")) {
    throw new EmailVerificationError("failed-precondition", "This account has no email address.");
  }
  if (authUser?.emailVerified === true) {
    throw new EmailVerificationError(
      "failed-precondition",
      "This email is already verified.",
      { reason: "already_verified" },
    );
  }
  return { uid, email };
}

function verificationContinuationUrl(invitationId) {
  if (invitationId === undefined || invitationId === null || invitationId === "") {
    return STRIPES_APP_URL;
  }
  const id = String(invitationId).trim();
  if (!OPAQUE_INVITATION_ID.test(id)) {
    throw new EmailVerificationError("invalid-argument", "Choose a valid organizer invitation.");
  }
  return `${STRIPES_APP_URL}?invite=${encodeURIComponent(id)}`;
}

function timestampMillis(value) {
  if (Number.isFinite(value)) return Number(value);
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && Number.isFinite(value.atMillis)) return Number(value.atMillis);
  if (value?.at && typeof value.at.toMillis === "function") return value.at.toMillis();
  return 0;
}

function activeVerificationAttempts(values, nowMillis) {
  const cutoff = nowMillis - VERIFICATION_WINDOW_MS;
  return (Array.isArray(values) ? values : [])
    .map((value, index) => ({
      id: String(value?.id || `legacy-${index}-${timestampMillis(value)}`),
      atMillis: timestampMillis(value),
    }))
    .filter((attempt) => attempt.atMillis > cutoff && attempt.atMillis <= nowMillis)
    .sort((left, right) => left.atMillis - right.atMillis);
}

function verificationThrottlePlan(values, nowMillis) {
  const attempts = activeVerificationAttempts(values, nowMillis);
  const lastAttempt = attempts.at(-1);
  if (lastAttempt && lastAttempt.atMillis + VERIFICATION_COOLDOWN_MS > nowMillis) {
    return {
      allowed: false,
      reason: "cooldown",
      retryAtMillis: lastAttempt.atMillis + VERIFICATION_COOLDOWN_MS,
      attempts,
    };
  }
  if (attempts.length >= VERIFICATION_MAX_SENDS) {
    return {
      allowed: false,
      reason: "daily_limit",
      retryAtMillis: attempts[0].atMillis + VERIFICATION_WINDOW_MS,
      attempts,
    };
  }
  return {
    allowed: true,
    reason: null,
    retryAtMillis: nowMillis + VERIFICATION_COOLDOWN_MS,
    dailyRemaining: VERIFICATION_MAX_SENDS - attempts.length - 1,
    attempts,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function verificationEmail(verificationUrl) {
  const link = String(verificationUrl || "").trim();
  if (!/^https:\/\//i.test(link)) {
    throw new TypeError("A Firebase email verification URL is required.");
  }
  return {
    subject: "Verify your Stripes email",
    text: [
      "Stripes",
      "",
      "Verify your email to finish setting up your Stripes account or organizer invitation.",
      "",
      `Verify email: ${link}`,
      "",
      "This link was requested for your Stripes account. If you did not request it, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#102A43;line-height:1.5">
        <div style="font-size:14px;font-weight:800;color:#7c3aed;margin-bottom:14px">Stripes</div>
        <h1 style="font-size:24px;line-height:1.2;margin:0 0 12px">Verify your email</h1>
        <p style="color:#475569">Verify your email to finish setting up your Stripes account or organizer invitation.</p>
        <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#102A43;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">Verify email</a></p>
        <p style="font-size:13px;color:#64748b">This link was requested for your Stripes account. If you did not request it, you can ignore this email.</p>
      </div>
    `,
  };
}

function verificationSendResult(plan) {
  return {
    ok: true,
    status: "sent",
    resendAvailableAt: new Date(plan.retryAtMillis).toISOString(),
    dailyRemaining: plan.dailyRemaining,
  };
}

module.exports = {
  EmailVerificationError,
  STRIPES_APP_URL,
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_MAX_SENDS,
  VERIFICATION_WINDOW_MS,
  activeVerificationAttempts,
  verificationContinuationUrl,
  verificationEmail,
  verificationIdentity,
  verificationSendResult,
  verificationThrottlePlan,
};
