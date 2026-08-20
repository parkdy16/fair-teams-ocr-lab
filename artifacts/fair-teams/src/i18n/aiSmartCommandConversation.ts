import { formatList, formatNumber } from "./format.ts";
import {
  translateCanonicalEnglish,
  type StripesTranslator,
} from "./i18n.ts";

export const CANONICAL_AI_CONVERSATION_LOCALE = "en";

export type AiSmartCommandConversationPresenter = StripesTranslator & {
  readonly locale: string;
  formatList(values: readonly string[], options?: Intl.ListFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
};

export function createAiSmartCommandConversationPresenter(
  t: StripesTranslator,
  locale: string = CANONICAL_AI_CONVERSATION_LOCALE,
): AiSmartCommandConversationPresenter {
  return Object.assign(
    (key: Parameters<StripesTranslator>[0], values?: Parameters<StripesTranslator>[1]) =>
      t(key, { ...values, lng: locale }),
    {
      locale,
      formatList: (values: readonly string[], options?: Intl.ListFormatOptions) =>
        formatList(locale, values, options),
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(locale, value, options),
    },
  );
}

export const canonicalAiSmartCommandConversationPresenter =
  createAiSmartCommandConversationPresenter(
    translateCanonicalEnglish,
    CANONICAL_AI_CONVERSATION_LOCALE,
  );
