import i18next, { type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import { englishCatalog, getEnglishCatalogMessage, type TranslationKey } from "./resources/en.ts";
import {
  CANONICAL_UI_LOCALE,
  detectUiLocale,
  parseSupportedUiLocale,
  persistUiLocale,
  readLocaleStorage,
  SUPPORTED_UI_LOCALES,
  syncDocumentLanguage,
  type SupportedUiLocale,
} from "./locales.ts";

export type TranslationValues = TOptions & Record<string, unknown>;
export type StripesTranslator = (
  key: TranslationKey,
  values?: TranslationValues,
) => string;

export const stripesI18n = i18next.createInstance();

let initialized = false;

export function initializeI18n(): typeof stripesI18n {
  if (initialized) return stripesI18n;

  const locale = detectUiLocale();
  void stripesI18n.use(initReactI18next).init({
    lng: locale,
    fallbackLng: CANONICAL_UI_LOCALE,
    supportedLngs: [...SUPPORTED_UI_LOCALES],
    defaultNS: "translation",
    ns: ["translation"],
    keySeparator: false,
    nsSeparator: false,
    initAsync: false,
    returnNull: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: englishCatalog },
    },
  });

  initialized = true;
  syncDocumentLanguage(locale);
  return stripesI18n;
}

export const translate: StripesTranslator = (key, values) => {
  initializeI18n();
  getEnglishCatalogMessage(key);
  return String(stripesI18n.t(key, values));
};

export const translateCanonicalEnglish: StripesTranslator = (key, values) => {
  initializeI18n();
  getEnglishCatalogMessage(key);
  return String(stripesI18n.t(key, { ...values, lng: "en" }));
};

export function getResolvedUiLocale(): SupportedUiLocale {
  initializeI18n();
  return parseSupportedUiLocale(stripesI18n.resolvedLanguage) ?? CANONICAL_UI_LOCALE;
}

export async function setUiLocale(locale: SupportedUiLocale): Promise<void> {
  initializeI18n();
  const resolvedLocale = parseSupportedUiLocale(locale) ?? CANONICAL_UI_LOCALE;

  if (typeof window !== "undefined") {
    persistUiLocale(readLocaleStorage(window), resolvedLocale);
  }

  await stripesI18n.changeLanguage(resolvedLocale);
  syncDocumentLanguage(resolvedLocale);
}
