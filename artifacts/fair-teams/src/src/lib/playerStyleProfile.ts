import { calculateOverall, type RoomPlayer } from "@/lib/localRoster";

export type PlayerStyleValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlayerStyleAttributes = Pick<
  RoomPlayer,
  "attack" | "defense" | "speed" | "passing" | "stamina" | "physical" | "teamPlay"
>;

export type PlayerStyleDefinition = {
  value: PlayerStyleValue;
  shortLabel: string;
  label: string;
  sliderLabel: string;
  description: string;
  deltas: Omit<PlayerStyleAttributes, "teamPlay">;
};

export const BALANCED_PLAYER_STYLE: PlayerStyleValue = 3;

export const PLAYER_STYLE_DEFINITIONS: PlayerStyleDefinition[] = [
  {
    value: 0,
    shortLabel: "CB",
    label: "Centre-back type",
    sliderLabel: "Defense",
    description: "Stays back, wins duels, protects space, and gives the team defensive stability. Fair Teams creates high DEF/physical, lower ATK.",
    deltas: { attack: -2.6, defense: 1.9, passing: -0.3, speed: -1.0, stamina: 0.3, physical: 1.2 },
  },
  {
    value: 1,
    shortLabel: "FB",
    label: "Full-back / wing-back type",
    sliderLabel: "Wide support",
    description: "Covers wide areas and supports both defense and attack. Fair Teams creates good DEF, speed, stamina, and some ATK.",
    deltas: { attack: -0.7, defense: 0.9, passing: -0.1, speed: 1.2, stamina: 1.0, physical: -0.2 },
  },
  {
    value: 2,
    shortLabel: "DM",
    label: "Defensive midfielder type",
    sliderLabel: "Deep support",
    description: "Protects the team and connects play. Fair Teams creates strong DEF and PASS, with less direct attacking weight.",
    deltas: { attack: -1.2, defense: 1.3, passing: 1.1, speed: -0.2, stamina: 0.5, physical: 0.5 },
  },
  {
    value: 3,
    shortLabel: "CM",
    label: "Balanced midfielder type",
    sliderLabel: "Balanced",
    description: "All-round player. Fair Teams keeps the profile close to the overall skill, with a small boost to passing and stamina.",
    deltas: { attack: 0, defense: 0, passing: 0.6, speed: 0, stamina: 0.4, physical: 0 },
  },
  {
    value: 4,
    shortLabel: "AM",
    label: "Attacking midfielder type",
    sliderLabel: "Creative support",
    description: "Creates chances and supports attacks. Fair Teams creates stronger PASS and ATK, with slightly lower defensive weight.",
    deltas: { attack: 1.0, defense: -0.9, passing: 1.2, speed: 0.1, stamina: 0, physical: -0.3 },
  },
  {
    value: 5,
    shortLabel: "W",
    label: "Winger type",
    sliderLabel: "Wide attack",
    description: "Wide attacking player. Fair Teams creates high SPEED and ATK, with less defensive weight.",
    deltas: { attack: 1.4, defense: -1.7, passing: 0.2, speed: 1.7, stamina: 0.4, physical: -0.8 },
  },
  {
    value: 6,
    shortLabel: "ST",
    label: "Striker type",
    sliderLabel: "Attack",
    description: "Main attacking threat. Fair Teams creates very high ATK, lower DEF, and a more direct finishing profile.",
    deltas: { attack: 2.0, defense: -2.2, passing: -0.4, speed: 0.5, stamina: -0.2, physical: 0.4 },
  },
];

const STAT_KEYS = ["attack", "defense", "passing", "speed", "stamina", "physical"] as const;

type StyleStatKey = (typeof STAT_KEYS)[number];

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
  return PLAYER_STYLE_DEFINITIONS.find((definition) => definition.value === style) || PLAYER_STYLE_DEFINITIONS[BALANCED_PLAYER_STYLE];
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

  // Keep the existing Fair Teams weighted OVR formula as the source of truth.
  // The role creates the shape, then we gently move the shaped stats so the
  // computed OVR lands close to the organizer's chosen overall skill.
  for (let i = 0; i < 8; i += 1) {
    for (const key of STAT_KEYS) attrs[key] = clamp(attrs[key], 1, 10, target);
    const currentOverall = calculateOverall(attrs);
    const diff = target - currentOverall;
    if (Math.abs(diff) < 0.05) break;
    for (const key of STAT_KEYS) attrs[key] = clamp(attrs[key] + diff * 0.9, 1, 10, target);
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

export function inferPlayerStyleFromAttributes(player: Partial<PlayerStyleAttributes & { skill?: number }>): PlayerStyleValue {
  const target = roundHalf(clamp(player.skill, 1, 10, calculateOverall(player)));
  let bestStyle: PlayerStyleValue = BALANCED_PLAYER_STYLE;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const definition of PLAYER_STYLE_DEFINITIONS) {
    const generated = generateStyledPlayerAttributes(target, definition.value);
    const score = STAT_KEYS.reduce((sum, key: StyleStatKey) => {
      const actual = clamp(player[key], 1, 10, generated[key]);
      return sum + Math.abs(actual - generated[key]);
    }, 0);
    if (score < bestScore) {
      bestScore = score;
      bestStyle = definition.value;
    }
  }
  return bestStyle;
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
