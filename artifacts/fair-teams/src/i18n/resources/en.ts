import { actionBoardEnglish } from "./actionBoard.ts";
import { aiEnglish } from "./ai.ts";
import { appEnglish } from "./app.ts";
import { cabinetEnglish } from "./cabinet.ts";
import { clubEnglish } from "./club.ts";
import { commonEnglish } from "./common.ts";
import { publicEnglish } from "./public.ts";
import { rosterEnglish } from "./roster.ts";
import { sharedEnglish } from "./shared.ts";
import { teamsEnglish } from "./teams.ts";
import { todayEnglish } from "./today.ts";
import { uiEnglish } from "./ui.ts";

const englishCatalogSegments = [
  commonEnglish,
  appEnglish,
  rosterEnglish,
  todayEnglish,
  teamsEnglish,
  clubEnglish,
  actionBoardEnglish,
  cabinetEnglish,
  sharedEnglish,
  publicEnglish,
  aiEnglish,
  uiEnglish,
] as const;

type KeysOfUnion<Value> = Value extends Value ? keyof Value : never;

export type TranslationKey = Extract<
  KeysOfUnion<(typeof englishCatalogSegments)[number]>,
  string
>;

function composeEnglishCatalog() {
  const catalog: Record<string, string> = {};

  for (const segment of englishCatalogSegments) {
    for (const [key, value] of Object.entries(segment)) {
      if (Object.hasOwn(catalog, key)) {
        throw new Error(`Duplicate English translation key: ${key}`);
      }
      catalog[key] = value;
    }
  }

  return Object.freeze(catalog) as Readonly<Record<TranslationKey, string>>;
}

export const englishCatalog = composeEnglishCatalog();

export function getEnglishCatalogMessage(key: string): string {
  if (!Object.hasOwn(englishCatalog, key)) {
    throw new Error(`Missing canonical English translation: ${key}`);
  }

  return englishCatalog[key as TranslationKey];
}
