import type { Gender, TodayStatus } from "@/lib/types";
import type { RoomPlayer, RoomRoster } from "@/lib/localRoster";
import { cleanRosterName, normalizePlayer, normalizeRoster } from "@/lib/localRoster";

export const FAIR_TEAMS_GOOGLE_SHEET_SCHEMA_VERSION = 1;
export const FAIR_TEAMS_GOOGLE_SHEET_METADATA_TAB = "FairTeams_Metadata";
export const FAIR_TEAMS_GOOGLE_SHEET_PLAYERS_TAB = "Players";

export type GoogleSheetCellValue = string | number | boolean;
export type GoogleSheetValues = GoogleSheetCellValue[][];

export interface GoogleSheetRosterValues {
  metadataValues: GoogleSheetValues;
  playerValues: GoogleSheetValues;
}

type PlayerColumnKey =
  | "playerId"
  | "name"
  | "aka"
  | "gender"
  | "skill"
  | "attack"
  | "defense"
  | "speed"
  | "passing"
  | "stamina"
  | "physical"
  | "teamPlay"
  | "isGoalkeeper"
  | "isPlaymaker"
  | "isFinisher"
  | "isDribbler"
  | "isSentinel"
  | "isEngine"
  | "isVersatile"
  | "isSpaceFinder"
  | "isLongPass"
  | "isTikiTaka"
  | "isCrossing"
  | "isAerial"
  | "isPowerShot"
  | "isBulldog"
  | "isOrganizer"
  | "isNew"
  | "funBadge"
  | "attending"
  | "todayStatus"
  | "createdAt"
  | "updatedAt"
  | "deletedAt";

export const FAIR_TEAMS_GOOGLE_SHEET_PLAYER_COLUMNS: PlayerColumnKey[] = [
  "playerId",
  "name",
  "aka",
  "gender",
  "skill",
  "attack",
  "defense",
  "speed",
  "passing",
  "stamina",
  "physical",
  "teamPlay",
  "isGoalkeeper",
  "isPlaymaker",
  "isFinisher",
  "isDribbler",
  "isSentinel",
  "isEngine",
  "isVersatile",
  "isSpaceFinder",
  "isLongPass",
  "isTikiTaka",
  "isCrossing",
  "isAerial",
  "isPowerShot",
  "isBulldog",
  "isOrganizer",
  "isNew",
  "funBadge",
  "attending",
  "todayStatus",
  "createdAt",
  "updatedAt",
  "deletedAt",
];

function toSheetBoolean(value: unknown) {
  return value ? "TRUE" : "FALSE";
}

function readSheetBoolean(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1" || text === "y";
}

function readSheetNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readSheetString(value: unknown) {
  return String(value ?? "").trim();
}

function readGender(value: unknown): Gender {
  const text = readSheetString(value);
  return text === "female" || text === "other" ? text : "male";
}

function readTodayStatus(value: unknown): TodayStatus {
  return readSheetString(value) === "not_here_yet" ? "not_here_yet" : "here";
}

function metadataValueMap(metadataValues: GoogleSheetValues) {
  const result: Record<string, string> = {};
  metadataValues.forEach((row) => {
    const key = readSheetString(row[0]);
    if (!key || key.toLowerCase() === "key") return;
    result[key] = readSheetString(row[1]);
  });
  return result;
}

function playerToSheetRow(player: RoomPlayer): GoogleSheetCellValue[] {
  const normalized = normalizePlayer(player);
  const rowByColumn: Record<PlayerColumnKey, GoogleSheetCellValue> = {
    playerId: normalized.id,
    name: normalized.name,
    aka: normalized.aka || "",
    gender: normalized.gender,
    skill: normalized.skill,
    attack: normalized.attack,
    defense: normalized.defense,
    speed: normalized.speed,
    passing: normalized.passing,
    stamina: normalized.stamina,
    physical: normalized.physical,
    teamPlay: normalized.teamPlay,
    isGoalkeeper: toSheetBoolean(normalized.isGoalkeeper),
    isPlaymaker: toSheetBoolean(normalized.isPlaymaker),
    isFinisher: toSheetBoolean(normalized.isFinisher),
    isDribbler: toSheetBoolean(normalized.isDribbler),
    isSentinel: toSheetBoolean(normalized.isSentinel),
    isEngine: toSheetBoolean(normalized.isEngine),
    isVersatile: toSheetBoolean(normalized.isVersatile),
    isSpaceFinder: toSheetBoolean(normalized.isSpaceFinder),
    isLongPass: toSheetBoolean(normalized.isLongPass),
    isTikiTaka: toSheetBoolean(normalized.isTikiTaka),
    isCrossing: toSheetBoolean(normalized.isCrossing),
    isAerial: toSheetBoolean(normalized.isAerial),
    isPowerShot: toSheetBoolean(normalized.isPowerShot),
    isBulldog: toSheetBoolean(normalized.isBulldog),
    isOrganizer: toSheetBoolean(normalized.isOrganizer),
    isNew: toSheetBoolean(normalized.isNew),
    funBadge: normalized.funBadge || "",
    attending: toSheetBoolean(normalized.attending),
    todayStatus: normalized.todayStatus || "here",
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt || normalized.createdAt,
    deletedAt: "",
  };

  return FAIR_TEAMS_GOOGLE_SHEET_PLAYER_COLUMNS.map((column) => rowByColumn[column]);
}

function sheetRowToPlayer(row: GoogleSheetCellValue[], headerIndex: Record<string, number>, index: number): RoomPlayer | null {
  const get = (key: string) => row[headerIndex[key]];
  if (readSheetString(get("deletedAt"))) return null;

  const name = readSheetString(get("name"));
  if (!name) return null;

  const id = readSheetString(get("playerId")) || readSheetString(get("id"));
  const skill = readSheetNumber(get("skill"), 5);
  const player: Partial<RoomPlayer> = {
    id: id || undefined,
    name,
    aka: readSheetString(get("aka")) || undefined,
    gender: readGender(get("gender")),
    skill,
    attack: readSheetNumber(get("attack"), skill),
    defense: readSheetNumber(get("defense"), skill),
    speed: readSheetNumber(get("speed"), 5),
    passing: readSheetNumber(get("passing"), skill),
    stamina: readSheetNumber(get("stamina"), 5),
    physical: readSheetNumber(get("physical"), 5),
    teamPlay: readSheetNumber(get("teamPlay"), 2),
    isGoalkeeper: readSheetBoolean(get("isGoalkeeper")),
    isPlaymaker: readSheetBoolean(get("isPlaymaker")),
    isFinisher: readSheetBoolean(get("isFinisher")),
    isDribbler: readSheetBoolean(get("isDribbler")),
    isSentinel: readSheetBoolean(get("isSentinel")),
    isEngine: readSheetBoolean(get("isEngine")),
    isVersatile: readSheetBoolean(get("isVersatile")),
    isSpaceFinder: readSheetBoolean(get("isSpaceFinder")),
    isLongPass: readSheetBoolean(get("isLongPass")),
    isTikiTaka: readSheetBoolean(get("isTikiTaka")),
    isCrossing: readSheetBoolean(get("isCrossing")),
    isAerial: readSheetBoolean(get("isAerial")),
    isPowerShot: readSheetBoolean(get("isPowerShot")),
    isBulldog: readSheetBoolean(get("isBulldog")),
    isOrganizer: readSheetBoolean(get("isOrganizer")),
    isNew: readSheetBoolean(get("isNew")),
    funBadge: readSheetString(get("funBadge")) as RoomPlayer["funBadge"],
    attending: readSheetBoolean(get("attending")),
    todayStatus: readTodayStatus(get("todayStatus")),
    createdAt: readSheetString(get("createdAt")) || new Date().toISOString(),
    updatedAt: readSheetString(get("updatedAt")) || undefined,
  };

  return normalizePlayer(player, index);
}

export function googleSheetRosterTitle(roster: RoomRoster) {
  const name = cleanRosterName(roster.name, "Shared roster");
  return `${name} - Fair Teams`;
}

export function rosterToGoogleSheetValues(roster: RoomRoster): GoogleSheetRosterValues {
  const normalized = normalizeRoster(roster);
  const now = new Date().toISOString();
  const metadataValues: GoogleSheetValues = [
    ["key", "value"],
    ["app", "Fair Teams"],
    ["type", "google-sheets-shared-roster"],
    ["schemaVersion", FAIR_TEAMS_GOOGLE_SHEET_SCHEMA_VERSION],
    ["rosterId", normalized.id],
    ["rosterName", normalized.name],
    ["themeColor", normalized.themeColor || ""],
    ["createdAt", normalized.createdAt],
    ["updatedAt", normalized.updatedAt || normalized.createdAt],
    ["exportedAt", now],
    ["imagesIncluded", "FALSE"],
    ["notes", "This sheet is managed by Fair Teams. Manual editing is not recommended."],
  ];

  const playerValues: GoogleSheetValues = [
    FAIR_TEAMS_GOOGLE_SHEET_PLAYER_COLUMNS,
    ...normalized.players.map(playerToSheetRow),
  ];

  return { metadataValues, playerValues };
}

export function googleSheetValuesToRoster(
  metadataValues: GoogleSheetValues,
  playerValues: GoogleSheetValues,
  spreadsheetInfo: { spreadsheetId?: string; spreadsheetName?: string; webViewLink?: string; modifiedTime?: string } = {},
): RoomRoster {
  const metadata = metadataValueMap(metadataValues);
  if (metadata.app && metadata.app !== "Fair Teams") {
    throw new Error("This Google Sheet does not look like a Fair Teams roster.");
  }
  if (metadata.type && metadata.type !== "google-sheets-shared-roster") {
    throw new Error("This Google Sheet is not a Fair Teams shared roster.");
  }

  const header = playerValues[0] || [];
  const headerIndex = header.reduce<Record<string, number>>((acc, value, index) => {
    const key = readSheetString(value);
    if (key) acc[key] = index;
    return acc;
  }, {});

  if (headerIndex.name === undefined) {
    throw new Error("The Players tab is missing the name column.");
  }

  const players = playerValues
    .slice(1)
    .map((row, index) => sheetRowToPlayer(row, headerIndex, index))
    .filter((player): player is RoomPlayer => Boolean(player));

  const now = new Date().toISOString();
  return normalizeRoster({
    id: metadata.rosterId || undefined,
    name: metadata.rosterName || spreadsheetInfo.spreadsheetName || "Shared roster",
    players,
    themeColor: metadata.themeColor || undefined,
    logo: undefined,
    cloudSource: spreadsheetInfo.spreadsheetId
      ? {
          provider: "google-sheets",
          spreadsheetId: spreadsheetInfo.spreadsheetId,
          spreadsheetName: spreadsheetInfo.spreadsheetName,
          webViewLink: spreadsheetInfo.webViewLink,
          lastSyncedAt: now,
          lastRemoteModifiedAt: spreadsheetInfo.modifiedTime,
          syncMode: "manual",
        }
      : undefined,
    createdAt: metadata.createdAt || now,
    updatedAt: metadata.updatedAt || now,
  });
}
