import { calculateOverall, type RoomPlayer } from "./localRoster.ts";

export type PlayerStyleValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlayerPresetId =
  | "defender"
  | "technician"
  | "high-energy"
  | "all-rounder"
  | "playmaker"
  | "fast"
  | "goal-threat";

export type PlayerStyleAttributes = Pick<
  RoomPlayer,
  "attack" | "defense" | "speed" | "passing" | "stamina" | "physical" | "teamPlay"
>;

export type PlayerStyleDefinition = {
  value: PlayerStyleValue;
  id: PlayerPresetId;
  shortLabel: string;
  label: string;
  sliderLabel: string;
  description: string;
  deltas: Omit<PlayerStyleAttributes, "teamPlay">;
};

export const BALANCED_PLAYER_STYLE: PlayerStyleValue = 3;

/**
 * Experimental JoonGPT rating presets.
 *
 * Presets are fast profile-shaping shortcuts, not another permanent statistics
 * layer. The generated detailed attributes remain the source of truth and can
 * be refined through Advanced Edit. Numeric values stay stable so the
 * experiment can reuse the existing local/shared persistence contract.
 */
export const PLAYER_STYLE_DEFINITIONS: PlayerStyleDefinition[] = [
  {
    value: 6,
    id: "goal-threat",
    shortLabel: "GOAL",
    label: "Goal Threat",
    sliderLabel: "Goal Threat",
    description: "Attacks space, looks to score, and creates direct danger around goal.",
    deltas: { attack: 2.4, defense: -2.0, passing: -0.5, speed: 0.7, stamina: -0.2, physical: 0.1 },
  },
  {
    value: 4,
    id: "playmaker",
    shortLabel: "PLAY",
    label: "Playmaker",
    sliderLabel: "Playmaker",
    description: "Connects play, spots openings, and creates chances for teammates.",
    deltas: { attack: 0.2, defense: -0.6, passing: 2.2, speed: -0.3, stamina: 0.1, physical: -0.7 },
  },
  {
    value: 0,
    id: "defender",
    shortLabel: "DEF",
    label: "Defender",
    sliderLabel: "Defender",
    description: "Protects space, wins the ball, and gives the team defensive stability.",
    deltas: { attack: -2.0, defense: 2.2, passing: -0.4, speed: -0.4, stamina: 0.4, physical: 0.7 },
  },
  {
    value: 5,
    id: "fast",
    shortLabel: "FAST",
    label: "Fast",
    sliderLabel: "Fast",
    description: "Changes the game with speed, acceleration, and quick recovery runs.",
    deltas: { attack: 0.6, defense: -0.4, passing: -0.3, speed: 2.3, stamina: 0.4, physical: -0.8 },
  },
  {
    value: 2,
    id: "high-energy",
    shortLabel: "ENG",
    label: "High Energy",
    sliderLabel: "High Energy",
    description: "Runs, presses, and keeps covering space throughout the game.",
    deltas: { attack: 0.0, defense: 0.5, passing: 0.0, speed: 0.6, stamina: 2.2, physical: -0.2 },
  },
  {
    value: 1,
    id: "technician",
    shortLabel: "TECH",
    label: "Technician",
    sliderLabel: "Technician",
    description: "Controls the ball cleanly and solves pressure with skill.",
    deltas: { attack: 0.4, defense: -0.6, passing: 0.8, speed: -0.4, stamina: -0.2, physical: 2.4 },
  },
  {
    value: 3,
    id: "all-rounder",
    shortLabel: "ALL",
    label: "All-rounder",
    sliderLabel: "All-rounder",
    description: "Contributes across the game without one quality dominating the profile.",
    deltas: { attack: 0.0, defense: 0.0, passing: 0.2, speed: 0.1, stamina: 0.2, physical: 0.0 },
  },
];

export const PLAYER_PROFILE_PRESET_ORDER = PLAYER_STYLE_DEFINITIONS.map(
  (definition) => definition.value,
) as PlayerStyleValue[];

const STAT_KEYS = ["attack", "defense", "passing", "speed", "stamina", "physical"] as const;

export type PlayerStyleStatKey = (typeof STAT_KEYS)[number];

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function roundHalf(value: number) {
  return Math.min(10, Math.max(1, Math.round(value * 2) / 2));
}

export function normalizePlayerStyle(value: unknown): PlayerStyleValue {
  const n = Math.round(Number(value));
  return (n >= 0 && n <= 6 ? n : BALANCED_PLAYER_STYLE) as PlayerStyleValue;
}

export function getPlayerStyleDefinition(value: unknown): PlayerStyleDefinition {
  const style = normalizePlayerStyle(value);
  return PLAYER_STYLE_DEFINITIONS.find((definition) => definition.value === style)
    ?? PLAYER_STYLE_DEFINITIONS.find((definition) => definition.value === BALANCED_PLAYER_STYLE)
    ?? PLAYER_STYLE_DEFINITIONS[0];
}

export function generateStyledPlayerAttributes(
  targetSkill: number,
  styleValue: unknown = BALANCED_PLAYER_STYLE,
): PlayerStyleAttributes {
  const target = roundHalf(clamp(targetSkill, 1, 10, 5));
  const definition = getPlayerStyleDefinition(styleValue);
  const attrs: PlayerStyleAttributes = {
    attack: target + definition.deltas.attack,
    defense: target + definition.deltas.defense,
    passing: target + definition.deltas.passing,
    speed: target + definition.deltas.speed,
    stamina: target + definition.deltas.stamina,
    physical: target + definition.deltas.physical,
    teamPlay: 2,
  };

  // Keep the current Stripes OVR formula authoritative. The preset creates the
  // profile shape, then the shaped values move together until the computed OVR
  // lands close to the organizer's chosen overall skill.
  for (let index = 0; index < 8; index += 1) {
    for (const key of STAT_KEYS) attrs[key] = clamp(attrs[key], 1, 10, target);
    const currentOverall = calculateOverall(attrs);
    const difference = target - currentOverall;
    if (Math.abs(difference) < 0.05) break;
    for (const key of STAT_KEYS) attrs[key] = clamp(attrs[key] + difference * 0.9, 1, 10, target);
  }

  return {
    attack: roundHalf(attrs.attack),
    defense: roundHalf(attrs.defense),
    passing: roundHalf(attrs.passing),
    speed: roundHalf(attrs.speed),
    stamina: roundHalf(attrs.stamina),
    physical: roundHalf(attrs.physical),
    teamPlay: 2,
  };
}

export function playerStyleProfileDistance(
  player: Partial<PlayerStyleAttributes & { skill?: number }>,
  styleValue: unknown,
) {
  const target = roundHalf(clamp(player.skill, 1, 10, calculateOverall(player)));
  const generated = generateStyledPlayerAttributes(target, styleValue);
  return STAT_KEYS.reduce((sum, key) => {
    const actual = clamp(player[key], 1, 10, generated[key]);
    return sum + Math.abs(actual - generated[key]);
  }, 0);
}

export function inferPlayerStyleMatch(player: Partial<PlayerStyleAttributes & { skill?: number }>) {
  let bestStyle: PlayerStyleValue = BALANCED_PLAYER_STYLE;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const definition of PLAYER_STYLE_DEFINITIONS) {
    const distance = playerStyleProfileDistance(player, definition.value);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStyle = definition.value;
    }
  }

  return {
    style: bestStyle,
    distance: bestDistance,
    // Generated profiles are exact. This small allowance covers half-step
    // rounding and tiny manual corrections without labelling a substantially
    // custom profile as a preset.
    isPresetLike: bestDistance <= 1.5,
  };
}

export function inferPlayerStyleFromAttributes(
  player: Partial<PlayerStyleAttributes & { skill?: number }>,
): PlayerStyleValue {
  return inferPlayerStyleMatch(player).style;
}

export function profileFromAveragedAttributes(
  skill: number | null | undefined,
  attrs?: Partial<PlayerStyleAttributes>,
): PlayerStyleAttributes {
  const safeSkill = roundHalf(clamp(skill, 1, 10, 5));
  return {
    attack: roundHalf(clamp(attrs?.attack, 1, 10, safeSkill)),
    defense: roundHalf(clamp(attrs?.defense, 1, 10, safeSkill)),
    passing: roundHalf(clamp(attrs?.passing, 1, 10, safeSkill)),
    speed: roundHalf(clamp(attrs?.speed, 1, 10, safeSkill)),
    stamina: roundHalf(clamp(attrs?.stamina, 1, 10, safeSkill)),
    physical: roundHalf(clamp(attrs?.physical, 1, 10, safeSkill)),
    teamPlay: Math.min(3, Math.max(1, Math.round(Number(attrs?.teamPlay) || 2))),
  };
}
