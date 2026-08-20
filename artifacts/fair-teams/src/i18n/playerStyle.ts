import type { PlayerStyleValue } from "../lib/playerStyleProfile.ts";
import type { TranslationKey } from "./resources/en.ts";

export type PlayerStyleTranslationKeys = {
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
};

const PLAYER_STYLE_TRANSLATION_KEYS: Record<
  PlayerStyleValue,
  PlayerStyleTranslationKeys
> = {
  0: {
    labelKey: "roster.playerStyles.centreBack.label",
    descriptionKey: "roster.playerStyles.centreBack.description",
  },
  1: {
    labelKey: "roster.playerStyles.fullBack.label",
    descriptionKey: "roster.playerStyles.fullBack.description",
  },
  2: {
    labelKey: "roster.playerStyles.defensiveMidfielder.label",
    descriptionKey: "roster.playerStyles.defensiveMidfielder.description",
  },
  3: {
    labelKey: "roster.playerStyles.balancedMidfielder.label",
    descriptionKey: "roster.playerStyles.balancedMidfielder.description",
  },
  4: {
    labelKey: "roster.playerStyles.attackingMidfielder.label",
    descriptionKey: "roster.playerStyles.attackingMidfielder.description",
  },
  5: {
    labelKey: "roster.playerStyles.winger.label",
    descriptionKey: "roster.playerStyles.winger.description",
  },
  6: {
    labelKey: "roster.playerStyles.striker.label",
    descriptionKey: "roster.playerStyles.striker.description",
  },
};

export function playerStyleTranslationKeys(
  style: unknown,
): PlayerStyleTranslationKeys {
  const numericStyle = Math.round(Number(style));
  const normalizedStyle = (
    numericStyle >= 0 && numericStyle <= 6 ? numericStyle : 3
  ) as PlayerStyleValue;
  return PLAYER_STYLE_TRANSLATION_KEYS[normalizedStyle];
}
