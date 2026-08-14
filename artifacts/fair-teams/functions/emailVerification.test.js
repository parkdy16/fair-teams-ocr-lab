"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  EmailVerificationError,
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_MAX_SENDS,
  VERIFICATION_WINDOW_MS,
  verificationContinuationUrl,
  verificationEmail,
  verificationIdentity,
  verificationSendResult,
  verificationThrottlePlan,
} = require("./emailVerification");

const NOW = Date.parse("2026-08-14T12:00:00.000Z");

test("verification identity requires the current authenticated unverified Firebase user", () => {
  assert.throws(() => verificationIdentity(null), (error) => (
    error instanceof EmailVerificationError && error.code === "unauthenticated"
  ));
  assert.deepEqual(verificationIdentity({
    uid: "user-1",
    email: " Person@Example.com ",
    emailVerified: false,
  }), { uid: "user-1", email: "person@example.com" });
  assert.throws(() => verificationIdentity({
    uid: "user-1",
    email: "person@example.com",
    emailVerified: true,
  }), (error) => (
    error instanceof EmailVerificationError
      && error.code === "failed-precondition"
      && error.details?.reason === "already_verified"
  ));
});

test("verification continuation uses only fixed Stripes URLs and validated invitation IDs", () => {
  assert.equal(verificationContinuationUrl(), "https://stripes.work/app");
  assert.equal(
    verificationContinuationUrl("abcDEF_1234567890-x"),
    "https://stripes.work/app?invite=abcDEF_1234567890-x",
  );
  assert.throws(() => verificationContinuationUrl("https://attacker.example/path"), /valid organizer invitation/);
});

test("verification throttle enforces the 60-second server cooldown", () => {
  const recent = [{ id: "attempt-1", atMillis: NOW - VERIFICATION_COOLDOWN_MS + 1 }];
  const blocked = verificationThrottlePlan(recent, NOW);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "cooldown");
  assert.equal(blocked.retryAtMillis, NOW + 1);

  const allowed = verificationThrottlePlan([{ id: "attempt-1", atMillis: NOW - VERIFICATION_COOLDOWN_MS }], NOW);
  assert.equal(allowed.allowed, true);
});

test("verification throttle enforces 10 sends in a rolling 24-hour window", () => {
  const attempts = Array.from({ length: VERIFICATION_MAX_SENDS }, (_, index) => ({
    id: `attempt-${index}`,
    atMillis: NOW - VERIFICATION_WINDOW_MS + 1000 + index * VERIFICATION_COOLDOWN_MS,
  }));
  const blocked = verificationThrottlePlan(attempts, NOW);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "daily_limit");
  assert.equal(blocked.retryAtMillis, attempts[0].atMillis + VERIFICATION_WINDOW_MS);

  const afterWindow = verificationThrottlePlan(attempts, attempts[0].atMillis + VERIFICATION_WINDOW_MS);
  assert.equal(afterWindow.allowed, true);
});

test("successful verification response exposes cooldown metadata but never the action URL", () => {
  const result = verificationSendResult({ retryAtMillis: NOW + VERIFICATION_COOLDOWN_MS, dailyRemaining: 8 });
  assert.deepEqual(result, {
    ok: true,
    status: "sent",
    resendAvailableAt: "2026-08-14T12:01:00.000Z",
    dailyRemaining: 8,
  });
  assert.equal("verificationUrl" in result, false);
  assert.equal("email" in result, false);
});

test("verification email is concise, branded, and safely escapes its Firebase link", () => {
  const content = verificationEmail("https://example.test/action?value=one&next=\"two\"");
  assert.equal(content.subject, "Verify your Stripes email");
  assert.match(content.text, /Verify email:/);
  assert.match(content.html, /Verify email/);
  assert.match(content.html, /&amp;/);
  assert.match(content.html, /&quot;/);
  assert.doesNotMatch(content.text, /marketing|newsletter/i);
});

test("callable derives identity from Admin Auth, keeps links server-side, and fails safely", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const callable = source.slice(
    source.indexOf("exports.sendStripesEmailVerification"),
    source.indexOf("function emailBodies"),
  );
  assert.match(callable, /if \(!request\.auth\)/);
  assert.match(callable, /firebaseAuth\.getUser\(request\.auth\.uid\)/);
  assert.match(callable, /generateEmailVerificationLink\(identity\.email/);
  assert.match(callable, /sendResendEmail\(\{[\s\S]*to: identity\.email/);
  assert.match(callable, /return verificationSendResult\(plan\)/);
  assert.doesNotMatch(callable, /return\s+\{[^}]*verificationUrl/);
  assert.doesNotMatch(callable, /console\.(?:log|error)\([^\n]*verificationUrl/);
  assert.match(callable, /releaseVerificationAttempt/);
  assert.match(callable, /deliveryAttempted/);
  assert.match(callable, /reason: "delivery_failed"/);
  assert.match(callable, /verificationHttpsError/);
});
