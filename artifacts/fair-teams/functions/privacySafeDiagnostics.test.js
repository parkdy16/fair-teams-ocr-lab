"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  logPrivacySafeFailure,
  privacySafeFailure,
} = require("./privacySafeDiagnostics");

test("privacy-safe diagnostics retain only allow-listed machine fields", () => {
  const secret = "ya29.token-material";
  const email = "organizer@example.com";
  const playerText = "Private player note";
  const error = Object.assign(
    new Error(`${secret} ${email} ${playerText}`),
    {
      code: "messaging/registration-token-not-registered",
      status: 503,
      accessToken: secret,
      email,
      playerText,
    },
  );

  const diagnostic = privacySafeFailure(
    "action-board/push-delivery-failed",
    error,
    { retryable: true },
  );

  assert.deepEqual(diagnostic, {
    event: "stripes-operation-failed",
    diagnosticCode: "action-board/push-delivery-failed",
    providerCode: "messaging/registration-token-not-registered",
    httpStatus: 503,
    retryable: true,
  });
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /ya29|organizer@example|Private player note|stack|message/i);
});

test("arbitrary error codes and invalid diagnostic names fail closed", () => {
  const diagnostic = privacySafeFailure(
    "not a diagnostic code",
    { code: "token-shaped-value", status: 200, message: "private" },
  );
  assert.deepEqual(diagnostic, {
    event: "stripes-operation-failed",
    diagnosticCode: "internal/operation-failed",
  });
});

test("provider namespaces cannot disguise token or identity material as codes", () => {
  const diagnostic = privacySafeFailure(
    "google/provider-failed",
    { code: "google/ya29.secret-token-organizer@example.com", status: 403 },
  );
  assert.deepEqual(diagnostic, {
    event: "stripes-operation-failed",
    diagnosticCode: "google/provider-failed",
    httpStatus: 403,
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /ya29|secret-token|organizer@example/i);
});

test("hostile provider error objects cannot break diagnostic handling", () => {
  const error = new Proxy({}, {
    get() {
      throw new Error("private provider getter");
    },
  });
  assert.deepEqual(privacySafeFailure("google/provider-unavailable", error), {
    event: "stripes-operation-failed",
    diagnosticCode: "google/provider-unavailable",
  });
});

test("logger receives only the privacy-safe envelope", () => {
  const events = [];
  logPrivacySafeFailure(
    { error: (value) => events.push(value) },
    "workspace-invitation/delivery-failed",
    new Error("recipient@example.com Bearer secret-player-content"),
  );
  assert.deepEqual(events, [{
    event: "stripes-operation-failed",
    diagnosticCode: "workspace-invitation/delivery-failed",
  }]);
});

test("Functions entrypoint never logs raw errors or installation-token suffixes", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.doesNotMatch(source, /console\.error\s*\(/);
  assert.doesNotMatch(source, /fidSuffix/);
  assert.match(source, /logPrivacySafeFailure\s*\(/);
});
