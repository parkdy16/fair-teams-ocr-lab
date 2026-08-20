import type {
  AiSmartCommandTrustGuardMessageId,
  AiSmartCommandTrustGuardPresenter,
} from "../lib/aiSmartCommandTrustGuard.ts";
import type { TranslationKey } from "./resources/en.ts";
import type { StripesTranslator, TranslationValues } from "./i18n.ts";

const AI_TRUST_GUARD_KEY_BY_MESSAGE_ID = {
  "backup.currentRoster": "ai.trustGuard.backup.currentRoster",
  "backup.namedRoster": "ai.trustGuard.backup.namedRoster",
  "backup.intent": "ai.trustGuard.backup.intent",
  "backup.summaryBeforeAi": "ai.trustGuard.backup.summaryBeforeAi",
  "backup.summaryAfterAi": "ai.trustGuard.backup.summaryAfterAi",
  "backup.targetName": "ai.trustGuard.backup.targetName",
  "backup.targetArea": "ai.trustGuard.backup.targetArea",
  "backup.reasonBeforeAi": "ai.trustGuard.backup.reasonBeforeAi",
  "backup.reasonAfterAi": "ai.trustGuard.backup.reasonAfterAi",
  "backup.unresolved": "ai.trustGuard.backup.unresolved",
  "font.intent": "ai.trustGuard.font.intent",
  "font.summaryBeforeAi": "ai.trustGuard.font.summaryBeforeAi",
  "font.summaryAfterAi": "ai.trustGuard.font.summaryAfterAi",
  "ui.intent": "ai.trustGuard.ui.intent",
  "ui.summary": "ai.trustGuard.ui.summary",
  "unsupported.defaultSummary": "ai.trustGuard.unsupported.defaultSummary",
  "unsupported.summarySuffix": "ai.trustGuard.unsupported.summarySuffix",
  "unsupported.unresolved": "ai.trustGuard.unsupported.unresolved",
} as const satisfies Record<AiSmartCommandTrustGuardMessageId, TranslationKey>;

export function createAiSmartCommandTrustGuardPresenter(
  t: StripesTranslator,
): AiSmartCommandTrustGuardPresenter {
  return (messageId, values) =>
    t(AI_TRUST_GUARD_KEY_BY_MESSAGE_ID[messageId], values as TranslationValues);
}
