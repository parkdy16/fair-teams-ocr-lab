"use strict";

const i18next = require("i18next");
const englishCatalog = require("./i18n/en");

const DEFAULT_BACKEND_LOCALE = "en";
const SUPPORTED_BACKEND_LOCALES = Object.freeze([DEFAULT_BACKEND_LOCALE]);

const backendI18n = i18next.createInstance();
backendI18n.init({
  lng: DEFAULT_BACKEND_LOCALE,
  fallbackLng: DEFAULT_BACKEND_LOCALE,
  supportedLngs: SUPPORTED_BACKEND_LOCALES,
  resources: {
    en: { translation: englishCatalog },
  },
  initAsync: false,
  returnNull: false,
  returnObjects: false,
  interpolation: {
    // Email HTML continues to use the existing explicit escapeHtml boundary.
    // Escaping here would also corrupt plain-text mail and user-authored text.
    escapeValue: false,
  },
});

function resolveBackendLocale(value) {
  const candidate = typeof value === "string"
    ? value.trim().replace(/_/g, "-").toLowerCase()
    : "";
  if (candidate === "en" || candidate.startsWith("en-")) {
    return DEFAULT_BACKEND_LOCALE;
  }
  return DEFAULT_BACKEND_LOCALE;
}

function backendT(key, values = {}, locale = DEFAULT_BACKEND_LOCALE) {
  const resolvedLocale = resolveBackendLocale(locale);
  if (!backendI18n.exists(key, { lng: resolvedLocale })) {
    throw new RangeError(`Missing backend translation key: ${key}`);
  }
  return String(backendI18n.t(key, {
    ...values,
    lng: resolvedLocale,
  }));
}

module.exports = {
  DEFAULT_BACKEND_LOCALE,
  SUPPORTED_BACKEND_LOCALES,
  backendT,
  resolveBackendLocale,
};
