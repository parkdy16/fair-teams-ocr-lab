import assert from "node:assert/strict";
import test from "node:test";
import { activeSharedWorkspaceAuthorityText } from "./activeSharedWorkspaceAuthority.ts";
import { createAiSmartCommandTrustGuardPresenter } from "./aiSmartCommandTrustGuard.ts";
import { aiTargetAreaText } from "./aiSmartCommandPresentation.ts";
import { verificationEmailErrorText, verificationResendText } from "./emailVerification.ts";
import { googleAuthErrorText } from "./googleAuth.ts";
import {
  sharedGroupSummaryNameText,
  sharedRosterGroupNameText,
  sharedRosterSummaryNameText,
} from "./sharedRosterNames.ts";
import { StripesEmailVerificationError } from "../lib/stripesEmailVerificationState.ts";
import { StripesGoogleAuthError } from "../lib/firebaseGoogleAuthPolicy.ts";
import { formatDateTime, formatList, formatNumber, formatPercent } from "./format.ts";
import { initializeI18n, stripesI18n, translate } from "./i18n.ts";
import {
  CANONICAL_UI_LOCALE,
  parseSupportedLocale,
  parseSupportedUiLocale,
  persistUiLocale,
  readLocaleStorage,
  readStoredUiLocale,
  resolveUiLocale,
  SUPPORTED_UI_LOCALES,
  syncDocumentLanguage,
  UI_LOCALE_STORAGE_KEY,
} from "./locales.ts";
import { getEnglishCatalogMessage } from "./resources/en.ts";

test("locale resolution prefers a valid local choice and safely falls back to English", () => {
  assert.equal(resolveUiLocale({ storedLocale: "en-US", browserLocales: ["de-DE"] }), "en");
  assert.equal(resolveUiLocale({ storedLocale: "not-a-locale", browserLocales: ["ko-KR"] }), "en");
  assert.equal(resolveUiLocale({ storedLocale: null, browserLocales: ["de-DE", "en-GB"] }), "en");
  assert.equal(resolveUiLocale(), CANONICAL_UI_LOCALE);
  assert.equal(parseSupportedUiLocale("EN_us"), "en");
  assert.equal(parseSupportedUiLocale("de"), null);
});

test("the locale parser extends by allowlist rather than architecture changes", () => {
  const futureLocales = ["en", "de", "ko"] as const;
  assert.equal(parseSupportedLocale("de-DE", futureLocales), "de");
  assert.equal(parseSupportedLocale("ko_KR", futureLocales), "ko");
  assert.equal(parseSupportedLocale("fr-FR", futureLocales), null);
});

test("locale persistence is local-only and fails safely when storage is unavailable", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };

  assert.equal(persistUiLocale(storage, "en"), true);
  assert.equal(values.get(UI_LOCALE_STORAGE_KEY), "en");
  assert.equal(readStoredUiLocale(storage), "en");

  const unavailable = {
    getItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  };
  assert.equal(readStoredUiLocale(unavailable), null);
  assert.equal(persistUiLocale(unavailable, "en"), false);

  const storageGetterUnavailable = Object.create(null) as {
    readonly localStorage: typeof storage;
  };
  Object.defineProperty(storageGetterUnavailable, "localStorage", {
    get() {
      throw new Error("storage getter unavailable");
    },
  });
  assert.equal(readLocaleStorage(storageGetterUnavailable), null);
});

test("document language synchronization is explicit and testable", () => {
  const root = { lang: "de" };
  syncDocumentLanguage("en", root);
  assert.equal(root.lang, "en");
});

test("the canonical catalog supports lookup, interpolation, pluralization and fallback", () => {
  initializeI18n();
  assert.deepEqual(
    stripesI18n.options.supportedLngs?.slice(0, SUPPORTED_UI_LOCALES.length),
    [...SUPPORTED_UI_LOCALES],
  );
  assert.equal(getEnglishCatalogMessage("common.save"), "Save");
  assert.throws(
    () => getEnglishCatalogMessage("missing.future.key"),
    /Missing canonical English translation/,
  );
  assert.equal(translate("common.interpolationExample", { name: "Alex" }), "Welcome, Alex");
  assert.equal(translate("common.playerCount", { count: 1 }), "1 player");
  assert.equal(translate("common.playerCount", { count: 3 }), "3 players");
  assert.equal(translate("common.playerCount", { count: 1234 }), "1,234 players");
  assert.equal(
    translate("shared.publish.governance.ballotCount", { count: 1234 }),
    "1,234 ballots cast",
  );
  assert.equal(
    translate("actionBoard.vote.responseProgress", { count: 1234, total: 5678 }),
    "1,234 of 5,678 responded",
  );
  assert.equal(translate("shared.publish.backup.restored", { count: 1 }), "Backup restored · 1 player.");
  assert.equal(translate("shared.publish.backup.restored", { count: 3 }), "Backup restored · 3 players.");
  assert.equal(
    translate("app.rosterRemoval.clearDescription", { count: 1 }),
    "You need at least one roster, so this removes the 1 player profile from this roster only.",
  );
  assert.equal(translate("ai.impact.teamCountText", { count: 1 }), "1 team");
  assert.equal(translate("ai.impact.teamCountText", { count: 3 }), "3 teams");
  assert.equal(translate("ai.impact.teamSizeText", { count: 5 }), "5v5 teams");
  assert.equal(
    translate("ai.review.summary", { heard: 1234, selected: 5678, needsReview: 9 }),
    "Names heard: 1,234 · Selected: 5,678 · Needs your check: 9",
  );
  assert.equal(
    translate("ai.review.transcriptComparison", { transcript: 1234, ai: 5678 }),
    "Checking transcript order: 1,234 possible names · AI returned 5,678.",
  );
  assert.equal(translate("ai.details.startingSkill", { skill: 1234.5 }), "starting skill 1,234.5");
  assert.equal(stripesI18n.t("common.save", { lng: "de" }), "Save");
});

test("Intl helpers apply the resolved locale without changing stored values", () => {
  assert.equal(formatNumber("en", 1234.5), "1,234.5");
  assert.equal(formatPercent("en", 0.25), "25%");
  assert.equal(
    formatDateTime("en", Date.UTC(2026, 7, 20, 12, 30), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }),
    "Aug 20, 2026, 12:30 PM",
  );
  assert.equal(formatList("en", ["Alex", "Bo", "Casey"]), "Alex, Bo, and Casey");
  assert.equal(
    formatList("en", ["Alex", "Bo", "Casey"], { type: "unit" }),
    "Alex, Bo, Casey",
  );
});

test("shared authority status and issue codes map to catalog presentation", () => {
  type Authority = Parameters<typeof activeSharedWorkspaceAuthorityText>[0];
  const authority = (status: Authority["status"], issues: string[] = []) => ({
    status,
    issues,
  }) as Authority;

  assert.equal(
    activeSharedWorkspaceAuthorityText(authority("signed_out"), translate),
    "Sign in to check this shared workspace.",
  );
  assert.equal(
    activeSharedWorkspaceAuthorityText(
      authority("authorized", ["authoritative_roster_group_id_malformed"]),
      translate,
    ),
    "Roster access is confirmed, but its linked club reference is invalid.",
  );
  assert.equal(activeSharedWorkspaceAuthorityText(authority("authorized"), translate), "");
});

test("shared summary presentation catalogs only missing-name fallbacks", () => {
  const markerTranslator = ((key: string) => `[${key}]`) as typeof translate;

  assert.equal(
    sharedGroupSummaryNameText(
      { name: "My Stripes group", nameSource: "fallback" },
      markerTranslator,
    ),
    "[shared.names.missingGroupFallback]",
  );
  assert.equal(
    sharedGroupSummaryNameText(
      { name: "My Stripes group", nameSource: "stored" },
      markerTranslator,
    ),
    "My Stripes group",
  );
  assert.equal(
    sharedRosterSummaryNameText(
      { name: "Shared roster", nameSource: "fallback" },
      markerTranslator,
    ),
    "[shared.names.missingRosterFallback]",
  );
  assert.equal(
    sharedRosterSummaryNameText(
      { name: "Shared roster", nameSource: "stored" },
      markerTranslator,
    ),
    "Shared roster",
  );
  assert.equal(
    sharedRosterGroupNameText(
      {
        groupName: "My Stripes group",
        groupNameSource: "fallback",
      },
      markerTranslator,
    ),
    "[shared.names.missingGroupFallback]",
  );
});

test("verification reason codes and cooldown data map to catalog presentation", () => {
  const error = new StripesEmailVerificationError(
    "daily_limit",
    "compatibility message",
  );
  assert.equal(
    verificationEmailErrorText(error, translate),
    "The daily verification-email limit has been reached. More emails can be sent later.",
  );
  assert.equal(
    verificationResendText("2026-08-20T12:00:05.000Z", Date.parse("2026-08-20T12:00:00.000Z"), translate),
    "Resend available in 5 seconds.",
  );
  assert.equal(
    verificationResendText("2026-08-20T12:00:01.000Z", Date.parse("2026-08-20T12:00:00.000Z"), translate),
    "Resend available in 1 second.",
  );
});

test("Google auth reason codes map to catalog text with a compatibility fallback", () => {
  assert.equal(
    googleAuthErrorText(
      new StripesGoogleAuthError("existing_method", "compatibility message"),
      translate,
    ),
    "This email already has a Stripes account. Sign in with your existing method to connect Google.",
  );
  assert.equal(
    googleAuthErrorText(
      new StripesGoogleAuthError("unavailable", "Specific mature safety message."),
      translate,
    ),
    "Specific mature safety message.",
  );
});

test("AI trust-guard message IDs map to exact English catalog text", () => {
  const present = createAiSmartCommandTrustGuardPresenter(translate);
  assert.equal(present("backup.namedRoster", { name: "Sunday Club" }), "“Sunday Club”");
  assert.equal(
    present("unsupported.unresolved"),
    "No supported action is wired for this request yet.",
  );
});

test("AI navigation keeps stable area tokens separate from presentation", () => {
  assert.equal(aiTargetAreaText("Session", translate), "Session");
  assert.equal(aiTargetAreaText("Provider-defined area", translate), "Provider-defined area");
});
