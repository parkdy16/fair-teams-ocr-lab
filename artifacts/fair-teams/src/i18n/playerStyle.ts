import type { PlayerStyleValue } from "../lib/playerStyleProfile.ts";
import type { TranslationKey } from "./resources/en.ts";

export type PlayerStyleTranslationKeys = {
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
};

const PLAYER_STYLE_TRANSLATION_KEYS: Record<PlayerStyleValue, PlayerStyleTranslationKeys> = {
  0: {
    labelKey: "roster.playerPresets.defender.label",
    descriptionKey: "roster.playerPresets.defender.description",
  },
  1: {
    labelKey: "roster.playerPresets.strong.label",
    descriptionKey: "roster.playerPresets.strong.description",
  },
  2: {
    labelKey: "roster.playerPresets.highEnergy.label",
    descriptionKey: "roster.playerPresets.highEnergy.description",
  },
  3: {
    labelKey: "roster.playerPresets.allRounder.label",
    descriptionKey: "roster.playerPresets.allRounder.description",
  },
  4: {
    labelKey: "roster.playerPresets.playmaker.label",
    descriptionKey: "roster.playerPresets.playmaker.description",
  },
  5: {
    labelKey: "roster.playerPresets.fast.label",
    descriptionKey: "roster.playerPresets.fast.description",
  },
  6: {
    labelKey: "roster.playerPresets.goalThreat.label",
    descriptionKey: "roster.playerPresets.goalThreat.description",
  },
};

export function playerStyleTranslationKeys(style: unknown): PlayerStyleTranslationKeys {
  const numericStyle = Math.round(Number(style));
  const normalizedStyle = (numericStyle >= 0 && numericStyle <= 6 ? numericStyle : 3) as PlayerStyleValue;
  return PLAYER_STYLE_TRANSLATION_KEYS[normalizedStyle];
}
