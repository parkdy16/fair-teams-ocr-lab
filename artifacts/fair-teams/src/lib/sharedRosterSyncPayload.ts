import type { PairingRule } from "./types.ts";
import type { RoomPlayer, RoomRoster } from "./localRoster.ts";

export type FirebaseSharedRosterMaterialPlayer = Omit<
  RoomPlayer,
  "profilePhoto" | "updatedAt"
>;

export type FirebaseSharedRosterMaterialPayload = {
  name: string;
  themeColor?: string;
  players: FirebaseSharedRosterMaterialPlayer[];
  pairingRules: PairingRule[];
  playerModel: RoomRoster["playerModel"];
};

export function clampFirebaseSharedRosterSkill(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  const rounded = Math.round(n * 2) / 2;
  return Math.min(10, Math.max(1, Math.round(rounded * 10) / 10));
}

function makeFirebaseSharedRosterMaterialPlayer(
  player: RoomPlayer,
): FirebaseSharedRosterMaterialPlayer {
  const skill = clampFirebaseSharedRosterSkill(player.skill);
  return {
    id: player.id,
    roomId: 1,
    name: player.name,
    aka: player.aka,
    gender: player.gender,
    skill,
    // Detailed organizer observations remain in private Club rating
    // submissions. The shared roster material keeps the established neutral
    // profile so one organizer cannot publish their private shape as canonical
    // club truth merely by saving the roster.
    attack: skill,
    defense: skill,
    speed: skill,
    passing: skill,
    stamina: skill,
    physical: skill,
    teamPlay: 2,
    isGoalkeeper: false,
    isPlaymaker: false,
    isFinisher: false,
    isDribbler: false,
    isSentinel: false,
    isEngine: false,
    isVersatile: false,
    isSpaceFinder: false,
    isLongPass: false,
    isTikiTaka: false,
    isCrossing: false,
    isAerial: false,
    isPowerShot: false,
    isBulldog: false,
    isOrganizer: false,
    isNew: Boolean(player.isNew),
    funBadge: player.funBadge,
    todayStatus: "here",
    attending: false,
    createdAt: player.createdAt || "",
  };
}

export function makeFirebaseSharedRosterMaterialPayload(
  roster: RoomRoster,
): FirebaseSharedRosterMaterialPayload {
  return {
    name: roster.name || "",
    themeColor: roster.themeColor,
    players: roster.players.map(makeFirebaseSharedRosterMaterialPlayer),
    pairingRules: roster.pairingRules || [],
    playerModel: roster.playerModel,
  };
}

export function makeFirebaseSharedRosterSavePayload(
  roster: RoomRoster,
  generatedAt = new Date().toISOString(),
) {
  const material = makeFirebaseSharedRosterMaterialPayload(roster);
  return {
    ...material,
    players: material.players.map((player) => ({
      ...player,
      createdAt: player.createdAt || generatedAt,
      updatedAt: generatedAt,
    })) as RoomPlayer[],
  };
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  Object.keys(source).sort().forEach((key) => {
    if (source[key] !== undefined) canonical[key] = canonicalizeJson(source[key]);
  });
  return canonical;
}

export function firebaseSharedRosterMaterialRevisionKey(roster: RoomRoster | undefined) {
  if (!roster) return "";
  return JSON.stringify(canonicalizeJson(makeFirebaseSharedRosterMaterialPayload(roster)));
}
