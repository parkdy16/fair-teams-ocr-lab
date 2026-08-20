import type { ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { initializeI18n, type StripesTranslator } from "./i18n";
import { CANONICAL_UI_LOCALE, parseSupportedUiLocale } from "./locales";

const i18n = initializeI18n();

export function StripesI18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useStripesTranslation() {
  const translation = useTranslation();

  return {
    t: ((key, values) => String(translation.t(key, values))) as StripesTranslator,
    locale:
      parseSupportedUiLocale(translation.i18n.resolvedLanguage) ?? CANONICAL_UI_LOCALE,
  };
}
