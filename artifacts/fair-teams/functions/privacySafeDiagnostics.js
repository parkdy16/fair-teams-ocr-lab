"use strict";

const DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+$/;
const SAFE_PROVIDER_CODES = new Set([
  "messaging/registration-token-not-registered",
]);

function safeDiagnosticCode(value) {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return DIAGNOSTIC_CODE_PATTERN.test(code)
    ? code
    : "internal/operation-failed";
}

function safeProviderCode(error) {
  if (!error || typeof error !== "object") return "";
  try {
    const code = typeof error.code === "string"
      ? error.code.trim().toLowerCase()
      : "";
    return SAFE_PROVIDER_CODES.has(code) ? code : "";
  } catch {
    return "";
  }
}

function safeHttpStatus(error) {
  if (!error || typeof error !== "object") return null;
  try {
    const status = Number(error.status ?? error.statusCode);
    return Number.isInteger(status) && status >= 400 && status <= 599
      ? status
      : null;
  } catch {
    return null;
  }
}

function privacySafeFailure(diagnosticCode, error, options = {}) {
  const providerCode = safeProviderCode(error);
  const httpStatus = safeHttpStatus(error);
  return {
    event: "stripes-operation-failed",
    diagnosticCode: safeDiagnosticCode(diagnosticCode),
    ...(providerCode ? { providerCode } : {}),
    ...(httpStatus ? { httpStatus } : {}),
    ...(typeof options.retryable === "boolean"
      ? { retryable: options.retryable }
      : {}),
  };
}

function logPrivacySafeFailure(logger, diagnosticCode, error, options) {
  const target = logger && typeof logger.error === "function" ? logger : console;
  target.error(privacySafeFailure(diagnosticCode, error, options));
}

module.exports = {
  logPrivacySafeFailure,
  privacySafeFailure,
};
