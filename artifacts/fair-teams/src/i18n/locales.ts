export const CANONICAL_UI_LOCALE = "en" as const;
export const SUPPORTED_UI_LOCALES = [CANONICAL_UI_LOCALE] as const;
export const UI_LOCALE_STORAGE_KEY = "stripes-ui-locale-v1";

export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export interface UiLocaleResolutionInput {
  storedLocale?: string | null;
  browserLocales?: readonly string[];
}

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocaleStorageOwner {
  readonly localStorage: LocaleStorage;
}

export function parseSupportedLocale<const Locale extends string>(
  value: unknown,
  supportedLocales: readonly Locale[],
): Locale | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) return null;

  const baseLanguage = normalized.split("-")[0];
  return supportedLocales.find((locale) => locale === baseLanguage) ?? null;
}

export function parseSupportedUiLocale(value: unknown): SupportedUiLocale | null {
  return parseSupportedLocale(value, SUPPORTED_UI_LOCALES);
}

export function resolveUiLocale({
  storedLocale,
  browserLocales = [],
}: UiLocaleResolutionInput = {}): SupportedUiLocale {
  const stored = parseSupportedUiLocale(storedLocale);
  if (stored) return stored;

  for (const browserLocale of browserLocales) {
    const supported = parseSupportedUiLocale(browserLocale);
    if (supported) return supported;
  }

  return CANONICAL_UI_LOCALE;
}

export function readStoredUiLocale(
  storage: LocaleStorage | null | undefined,
): string | null {
  try {
    return storage?.getItem(UI_LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function persistUiLocale(
  storage: LocaleStorage | null | undefined,
  locale: SupportedUiLocale,
): boolean {
  try {
    storage?.setItem(UI_LOCALE_STORAGE_KEY, locale);
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function readLocaleStorage(
  storageOwner: LocaleStorageOwner | null | undefined,
): LocaleStorage | null {
  try {
    return storageOwner?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function detectUiLocale(): SupportedUiLocale {
  if (typeof window === "undefined") return CANONICAL_UI_LOCALE;

  const browserLocales = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  return resolveUiLocale({
    storedLocale: readStoredUiLocale(readLocaleStorage(window)),
    browserLocales,
  });
}

export function syncDocumentLanguage(
  locale: SupportedUiLocale,
  documentRoot: Pick<HTMLElement, "lang"> | null | undefined =
    typeof document === "undefined" ? null : document.documentElement,
): void {
  if (documentRoot) documentRoot.lang = locale;
}
