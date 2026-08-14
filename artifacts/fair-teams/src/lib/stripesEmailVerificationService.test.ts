import assert from "node:assert/strict";
import test from "node:test";
import {
  verificationEmailError,
  verificationResendLabel,
} from "./stripesEmailVerificationState.ts";

test("verification client exposes safe cooldown and daily-limit messages", () => {
  const retryAt = "2026-08-14T12:01:00.000Z";
  const cooldown = verificationEmailError({
    code: "functions/resource-exhausted",
    details: { reason: "cooldown", resendAvailableAt: retryAt },
  });
  assert.equal(cooldown.reason, "cooldown");
  assert.equal(cooldown.resendAvailableAt, retryAt);
  assert.doesNotMatch(cooldown.message, /firebase|resend|internal/i);

  const daily = verificationEmailError({
    code: "functions/resource-exhausted",
    details: { reason: "daily_limit", resendAvailableAt: retryAt },
  });
  assert.equal(daily.reason, "daily_limit");
  assert.match(daily.message, /later/i);

  const delivery = verificationEmailError({
    code: "functions/internal",
    details: { reason: "delivery_failed", resendAvailableAt: retryAt },
  });
  assert.equal(delivery.reason, "delivery_failed");
  assert.equal(delivery.resendAvailableAt, retryAt);
  assert.doesNotMatch(delivery.message, /resend|firebase|internal/i);
});

test("verification resend label clearly reports remaining cooldown", () => {
  assert.equal(
    verificationResendLabel("2026-08-14T12:01:00.000Z", Date.parse("2026-08-14T12:00:00.000Z")),
    "Resend available in 60 seconds.",
  );
  assert.equal(
    verificationResendLabel("2026-08-14T12:01:00.000Z", Date.parse("2026-08-14T12:01:00.000Z")),
    "",
  );
});
