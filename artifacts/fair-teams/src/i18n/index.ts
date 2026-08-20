export { formatDateTime, formatList, formatNumber, formatPercent } from "./format";
export {
  CANONICAL_AI_CONVERSATION_LOCALE,
  canonicalAiSmartCommandConversationPresenter,
  createAiSmartCommandConversationPresenter,
  type AiSmartCommandConversationPresenter,
} from "./aiSmartCommandConversation";
export { activeSharedWorkspaceAuthorityText } from "./activeSharedWorkspaceAuthority";
export { createAiSmartCommandTrustGuardPresenter } from "./aiSmartCommandTrustGuard";
export { aiTargetAreaText } from "./aiSmartCommandPresentation";
export { verificationEmailErrorText, verificationResendText } from "./emailVerification";
export { googleAuthErrorText } from "./googleAuth";
export {
  sharedGroupSummaryNameText,
  sharedRosterGroupNameText,
  sharedRosterSummaryNameText,
} from "./sharedRosterNames";
export {
  getResolvedUiLocale,
  initializeI18n,
  setUiLocale,
  stripesI18n,
  translate,
  translateCanonicalEnglish,
  type StripesTranslator,
  type TranslationValues,
} from "./i18n";
export {
  CANONICAL_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  UI_LOCALE_STORAGE_KEY,
  detectUiLocale,
  parseSupportedLocale,
  parseSupportedUiLocale,
  persistUiLocale,
  readStoredUiLocale,
  resolveUiLocale,
  syncDocumentLanguage,
  type SupportedUiLocale,
} from "./locales";
export { StripesI18nProvider, useStripesTranslation } from "./react";
export {
  englishCatalog,
  getEnglishCatalogMessage,
  type TranslationKey,
} from "./resources/en";
