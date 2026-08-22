import type { RoomPlayer } from "./localRoster.ts";

export const ROSTER_PLAYER_MODEL_SCHEMA_VERSION = 1 as const;
export const PLAYER_PRESET_PACK_SCHEMA_VERSION = 1 as const;

const DEFAULT_BUILT_IN_MODEL_TIMESTAMP = "2026-08-21T00:00:00.000Z";

export const PLAYER_PROFILE_SLOTS = [
  "attack",
  "passing",
  "stamina",
  "defense",
  "physical",
  "speed",
] as const;

export type PlayerProfileSlot = (typeof PLAYER_PROFILE_SLOTS)[number];
export type PlayerProfileSize = 3 | 6;

export const PLAYER_PRESET_ICON_KEYS = [
  "target",
  "crosshair",
  "wand",
  "route",
  "sparkles",
  "shield",
  "badge-check",
  "zap",
  "activity",
  "gauge",
  "brain",
  "eye",
  "handshake",
  "flame",
  "move",
  "circle-dot",
  "swords",
  "trophy",
  "star",
  "diamond",
  "heart-handshake",
  "waves",
  "footprints",
  "goal",
] as const;

export type PlayerPresetIconKey = (typeof PLAYER_PRESET_ICON_KEYS)[number];

export type RosterPlayerAttribute = {
  id: string;
  slot: PlayerProfileSlot;
  label: string;
  description: string;
  order: number;
};

export type RosterPlayerPreset = {
  id: string;
  name: string;
  description: string;
  iconKey: PlayerPresetIconKey;
  offsets: Record<PlayerProfileSlot, number>;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RosterPlayerModel = {
  schemaVersion: typeof ROSTER_PLAYER_MODEL_SCHEMA_VERSION;
  profileSize: PlayerProfileSize;
  attributes: RosterPlayerAttribute[];
  presets: RosterPlayerPreset[];
  createdAt: string;
  updatedAt: string;
};

export type PlayerPresetPack = {
  app: "Stripes";
  type: "player-preset-pack";
  schemaVersion: typeof PLAYER_PRESET_PACK_SCHEMA_VERSION;
  exportedAt: string;
  name: string;
  playerModel: Pick<RosterPlayerModel, "schemaVersion" | "profileSize" | "attributes">;
  presets: RosterPlayerPreset[];
};

const PROFILE_SLOT_SET = new Set<string>(PLAYER_PROFILE_SLOTS);
const ICON_KEY_SET = new Set<string>(PLAYER_PRESET_ICON_KEYS);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value: unknown, fallback: string, maxLength = 80) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, maxLength);
}

export function playerAttributeIdFromLabel(value: string, fallback = "attribute") {
  return cleanText(value, fallback, 48)
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function normalizeOffset(value: unknown) {
  return roundHalf(clamp(value, -4, 4, 0));
}

function normalizeSlot(value: unknown, fallback: PlayerProfileSlot): PlayerProfileSlot {
  return PROFILE_SLOT_SET.has(String(value)) ? value as PlayerProfileSlot : fallback;
}

function normalizeIconKey(value: unknown): PlayerPresetIconKey {
  return ICON_KEY_SET.has(String(value)) ? value as PlayerPresetIconKey : "star";
}

function offsets(overrides: Partial<Record<PlayerProfileSlot, number>> = {}) {
  return Object.fromEntries(
    PLAYER_PROFILE_SLOTS.map((slot) => [slot, normalizeOffset(overrides[slot])]),
  ) as Record<PlayerProfileSlot, number>;
}

const FOOTBALL_ATTRIBUTES: RosterPlayerAttribute[] = [
  {
    id: "goal-threat",
    slot: "attack",
    label: "Goal Threat",
    description: "Direct scoring danger through movement, positioning and finishing.",
    order: 0,
  },
  {
    id: "creation",
    slot: "passing",
    label: "Creation",
    description: "Creates chances, sees openings and connects attacking play.",
    order: 1,
  },
  {
    id: "stamina",
    slot: "stamina",
    label: "Stamina",
    description: "Maintains useful effort and involvement throughout the session.",
    order: 2,
  },
  {
    id: "defense",
    slot: "defense",
    label: "Defense",
    description: "Protects space, wins the ball and stops attacks.",
    order: 3,
  },
  {
    id: "technique",
    slot: "physical",
    label: "Technique",
    description: "Touch, control, dribbling and execution on the ball.",
    order: 4,
  },
  {
    id: "pace",
    slot: "speed",
    label: "Pace",
    description: "Speed and acceleration that change space and recovery.",
    order: 5,
  },
];

function preset(
  id: string,
  name: string,
  description: string,
  iconKey: PlayerPresetIconKey,
  profileOffsets: Partial<Record<PlayerProfileSlot, number>>,
): RosterPlayerPreset {
  const timestamp = DEFAULT_BUILT_IN_MODEL_TIMESTAMP;
  return {
    id,
    name,
    description,
    iconKey,
    offsets: offsets(profileOffsets),
    builtIn: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const FOOTBALL_PRESETS: RosterPlayerPreset[] = [
  preset(
    "goal-threat",
    "Goal Threat",
    "Attacks space and creates direct scoring danger.",
    "target",
    { attack: 3, passing: 0.5, stamina: 0, defense: -3, physical: 1, speed: 1.5 },
  ),
  preset(
    "finisher",
    "Finisher",
    "Turns chances into goals and stays decisive near goal.",
    "crosshair",
    { attack: 3.5, passing: -1, stamina: -0.5, defense: -3, physical: 0.5, speed: 0.5 },
  ),
  preset(
    "playmaker",
    "Playmaker",
    "Sees openings, connects play and creates chances for others.",
    "wand",
    { attack: 0, passing: 3, stamina: 0, defense: -1, physical: 1.5, speed: -0.5 },
  ),
  preset(
    "technician",
    "Technician",
    "Controls the ball cleanly and solves pressure with skill.",
    "sparkles",
    { attack: 0.5, passing: 1, stamina: -0.5, defense: -1, physical: 3.5, speed: -0.5 },
  ),
  preset(
    "dribbler",
    "Dribbler",
    "Carries the ball past opponents and creates separation.",
    "route",
    { attack: 1, passing: 0, stamina: -0.5, defense: -1.5, physical: 2.5, speed: 1.5 },
  ),
  preset(
    "space-finder",
    "Space Finder",
    "Moves into useful spaces and gives teammates a forward option.",
    "eye",
    { attack: 2.5, passing: 0.5, stamina: 1, defense: -2, physical: 0, speed: 1.5 },
  ),
  preset(
    "defender",
    "Defender",
    "Protects space and gives the team defensive stability.",
    "shield",
    { attack: -2.5, passing: -0.5, stamina: 1, defense: 3.5, physical: 0.5, speed: 0 },
  ),
  preset(
    "ball-winner",
    "Ball Winner",
    "Presses, challenges and disrupts the other team.",
    "swords",
    { attack: -1, passing: -0.5, stamina: 2, defense: 3, physical: 0.5, speed: 0.5 },
  ),
  preset(
    "fast",
    "Fast",
    "Changes the game with speed and recovery runs.",
    "zap",
    { attack: 1, passing: -0.5, stamina: 0.5, defense: -0.5, physical: -0.5, speed: 3.5 },
  ),
  preset(
    "high-energy",
    "High Energy",
    "Runs, presses and keeps covering space.",
    "activity",
    { attack: 0, passing: 0, stamina: 3.5, defense: 1, physical: -0.5, speed: 1 },
  ),
];

export function createDefaultRosterPlayerModel(): RosterPlayerModel {
  const timestamp = DEFAULT_BUILT_IN_MODEL_TIMESTAMP;
  return {
    schemaVersion: ROSTER_PLAYER_MODEL_SCHEMA_VERSION,
    profileSize: 6,
    attributes: FOOTBALL_ATTRIBUTES.map((attribute) => ({ ...attribute })),
    presets: FOOTBALL_PRESETS.map((item) => ({ ...item, offsets: { ...item.offsets } })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeAttribute(
  value: unknown,
  fallback: RosterPlayerAttribute,
  order: number,
): RosterPlayerAttribute {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: playerAttributeIdFromLabel(String(source.id ?? ""), fallback.id),
    slot: normalizeSlot(source.slot, fallback.slot),
    label: cleanText(source.label, fallback.label, 36),
    description: cleanText(source.description, fallback.description, 160),
    order,
  };
}

function normalizePreset(value: unknown, index: number): RosterPlayerPreset | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const timestamp = nowIso();
  const id = cleanText(source.id, `preset-${index + 1}`, 64)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `preset-${index + 1}`;
  const rawOffsets = source.offsets && typeof source.offsets === "object"
    ? source.offsets as Record<string, unknown>
    : {};
  return {
    id,
    name: cleanText(source.name, `Preset ${index + 1}`, 40),
    description: cleanText(source.description, "Reusable player profile.", 160),
    iconKey: normalizeIconKey(source.iconKey),
    offsets: offsets(rawOffsets as Partial<Record<PlayerProfileSlot, number>>),
    builtIn: Boolean(source.builtIn),
    createdAt: typeof source.createdAt === "string" && source.createdAt ? source.createdAt : timestamp,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : timestamp,
  };
}

export function normalizeRosterPlayerModel(value: unknown): RosterPlayerModel {
  const fallback = createDefaultRosterPlayerModel();
  if (!value || typeof value !== "object") return fallback;
  const source = value as Record<string, unknown>;
  const profileSize: PlayerProfileSize = Number(source.profileSize) === 3 ? 3 : 6;
  const requestedAttributes = Array.isArray(source.attributes) ? source.attributes : [];
  const defaultSlots = profileSize === 3
    ? [FOOTBALL_ATTRIBUTES[0], FOOTBALL_ATTRIBUTES[1], FOOTBALL_ATTRIBUTES[3]]
    : FOOTBALL_ATTRIBUTES;
  const seenSlots = new Set<PlayerProfileSlot>();
  const seenAttributeIds = new Set<string>();
  const attributes: RosterPlayerAttribute[] = [];

  for (let index = 0; index < profileSize; index += 1) {
    const fallbackAttribute = defaultSlots[index] ?? FOOTBALL_ATTRIBUTES[index];
    const normalized = normalizeAttribute(requestedAttributes[index], fallbackAttribute, index);
    if (seenSlots.has(normalized.slot)) {
      normalized.slot = fallbackAttribute.slot;
    }
    seenSlots.add(normalized.slot);
    let uniqueId = normalized.id;
    let suffix = 2;
    while (seenAttributeIds.has(uniqueId)) {
      uniqueId = `${normalized.id}-${suffix}`;
      suffix += 1;
    }
    seenAttributeIds.add(uniqueId);
    attributes.push({ ...normalized, id: uniqueId });
  }

  const rawPresets = Array.isArray(source.presets) ? source.presets : fallback.presets;
  const seenPresetIds = new Set<string>();
  const presets = rawPresets
    .map(normalizePreset)
    .filter((item): item is RosterPlayerPreset => Boolean(item))
    .map((item) => {
      let id = item.id;
      let suffix = 1;
      while (seenPresetIds.has(id)) {
        id = `${item.id}-${suffix}`;
        suffix += 1;
      }
      seenPresetIds.add(id);
      return { ...item, id };
    })
    .slice(0, 40);

  return {
    schemaVersion: ROSTER_PLAYER_MODEL_SCHEMA_VERSION,
    profileSize,
    attributes,
    presets,
    createdAt: typeof source.createdAt === "string" && source.createdAt ? source.createdAt : fallback.createdAt,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : nowIso(),
  };
}

export function cloneRosterPlayerModel(model: RosterPlayerModel): RosterPlayerModel {
  return normalizeRosterPlayerModel(JSON.parse(JSON.stringify(model)));
}

export function resizeRosterPlayerModel(
  modelValue: RosterPlayerModel,
  profileSize: PlayerProfileSize,
) {
  const model = normalizeRosterPlayerModel(modelValue);
  if (model.profileSize === profileSize) return model;
  const defaults = createDefaultRosterPlayerModel();
  const preferredSlots: PlayerProfileSlot[] = profileSize === 3
    ? ["attack", "passing", "defense"]
    : [...PLAYER_PROFILE_SLOTS];
  const attributes = preferredSlots.map((slot, index) => {
    const current = model.attributes.find((attribute) => attribute.slot === slot);
    const fallback = defaults.attributes.find((attribute) => attribute.slot === slot)!;
    return { ...(current ?? fallback), order: index };
  });
  const presets = profileSize === 3
    ? model.presets.filter((presetItem) =>
      !presetItem.builtIn || ["goal-threat", "playmaker", "defender"].includes(presetItem.id),
    )
    : model.presets.length
      ? model.presets
      : defaults.presets;
  return normalizeRosterPlayerModel({
    ...model,
    profileSize,
    attributes,
    presets,
    updatedAt: nowIso(),
  });
}

export function activePlayerProfileSlots(model: RosterPlayerModel) {
  return normalizeRosterPlayerModel(model).attributes
    .sort((a, b) => a.order - b.order)
    .map((attribute) => attribute.slot);
}

export function profileValuesFromPlayer(player: Partial<RoomPlayer>) {
  return Object.fromEntries(
    PLAYER_PROFILE_SLOTS.map((slot) => [slot, roundHalf(clamp(player[slot], 1, 10, 5))]),
  ) as Record<PlayerProfileSlot, number>;
}

export function profileBaselineForOverall(overall: number) {
  const safeOverall = clamp(overall, 1, 10, 5);
  return roundHalf(1 + (safeOverall - 1) * 0.82);
}

export function neutralProfileForOverall(overall: number) {
  const baseline = profileBaselineForOverall(overall);
  return Object.fromEntries(
    PLAYER_PROFILE_SLOTS.map((slot) => [slot, baseline]),
  ) as Record<PlayerProfileSlot, number>;
}

function centeredOffsets(model: RosterPlayerModel, raw: Record<PlayerProfileSlot, number>) {
  const activeSlots = activePlayerProfileSlots(model);
  const average = activeSlots.reduce((sum, slot) => sum + raw[slot], 0) / Math.max(1, activeSlots.length);
  return Object.fromEntries(
    PLAYER_PROFILE_SLOTS.map((slot) => [slot, activeSlots.includes(slot) ? raw[slot] - average : 0]),
  ) as Record<PlayerProfileSlot, number>;
}

export function normalizePresetSelection(
  modelValue: RosterPlayerModel,
  selectedPresetIds: unknown,
  limit = 2,
) {
  const model = normalizeRosterPlayerModel(modelValue);
  const validIds = new Set(model.presets.map((presetItem) => presetItem.id));
  const normalized: string[] = [];
  if (!Array.isArray(selectedPresetIds)) return normalized;
  for (const rawId of selectedPresetIds) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id || !validIds.has(id) || normalized.includes(id)) continue;
    normalized.push(id);
    if (normalized.length >= Math.max(0, limit)) break;
  }
  return normalized;
}

export function profileForPresetSelection(
  modelValue: RosterPlayerModel,
  overall: number,
  selectedPresetIds: string[],
) {
  const model = normalizeRosterPlayerModel(modelValue);
  const selected = normalizePresetSelection(model, selectedPresetIds)
    .map((id) => model.presets.find((presetItem) => presetItem.id === id))
    .filter((item): item is RosterPlayerPreset => Boolean(item));
  const baseline = neutralProfileForOverall(overall);
  if (!selected.length) return baseline;

  const weights = selected.length === 1 ? [1] : [0.65, 0.35];
  const blended = offsets();
  selected.forEach((item, index) => {
    PLAYER_PROFILE_SLOTS.forEach((slot) => {
      blended[slot] += item.offsets[slot] * weights[index];
    });
  });
  const shape = centeredOffsets(model, blended);

  return Object.fromEntries(
    PLAYER_PROFILE_SLOTS.map((slot) => [
      slot,
      roundHalf(clamp(baseline[slot] + shape[slot], 1, 10, baseline[slot])),
    ]),
  ) as Record<PlayerProfileSlot, number>;
}

export function applyProfileToPlayer(
  player: RoomPlayer,
  overall: number,
  profile: Record<PlayerProfileSlot, number>,
  presetIds: string[],
): RoomPlayer {
  return {
    ...player,
    skill: roundHalf(clamp(overall, 1, 10, player.skill || 5)),
    attack: profile.attack,
    passing: profile.passing,
    stamina: profile.stamina,
    defense: profile.defense,
    physical: profile.physical,
    speed: profile.speed,
    overallIndependent: true,
    profilePresetIds: presetIds.slice(0, 2),
  };
}

export function hasIndependentDetailedProfile(player: Partial<RoomPlayer>) {
  return Boolean(player.overallIndependent || (Array.isArray(player.profilePresetIds) && player.profilePresetIds.length));
}

export function resetPlayerRatingsForModel(players: RoomPlayer[]) {
  const timestamp = nowIso();
  return players.map((player) => ({
    ...player,
    skill: 5,
    attack: 5,
    passing: 5,
    stamina: 5,
    defense: 5,
    physical: 5,
    speed: 5,
    teamPlay: 2,
    overallIndependent: false,
    profilePresetIds: undefined,
    profileFineTuned: false,
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
    isNew: true,
    updatedAt: timestamp,
  }));
}

export function playerModelAttributesMatch(
  leftValue: Pick<RosterPlayerModel, "profileSize" | "attributes">,
  rightValue: Pick<RosterPlayerModel, "profileSize" | "attributes">,
) {
  const left = normalizeRosterPlayerModel({ ...createDefaultRosterPlayerModel(), ...leftValue });
  const right = normalizeRosterPlayerModel({ ...createDefaultRosterPlayerModel(), ...rightValue });
  if (left.profileSize !== right.profileSize) return false;
  return left.attributes.every((attribute, index) => {
    const other = right.attributes[index];
    return Boolean(other && other.id === attribute.id && other.slot === attribute.slot);
  });
}

export function createPresetDraft(model: RosterPlayerModel, source?: RosterPlayerPreset): RosterPlayerPreset {
  const timestamp = nowIso();
  if (source) {
    return {
      ...source,
      id: createId("preset"),
      name: `${source.name} copy`,
      builtIn: false,
      offsets: { ...source.offsets },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  return {
    id: createId("preset"),
    name: "New preset",
    description: "Reusable player profile.",
    iconKey: "star",
    offsets: offsets(),
    builtIn: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizePresetShape(model: RosterPlayerModel, presetItem: RosterPlayerPreset) {
  const activeSlots = activePlayerProfileSlots(model);
  const average = activeSlots.reduce((sum, slot) => sum + presetItem.offsets[slot], 0) / Math.max(1, activeSlots.length);
  const nextOffsets = Object.fromEntries(
    PLAYER_PROFILE_SLOTS.map((slot) => [
      slot,
      activeSlots.includes(slot) ? normalizeOffset(presetItem.offsets[slot] - average) : 0,
    ]),
  ) as Record<PlayerProfileSlot, number>;
  return { ...presetItem, offsets: nextOffsets };
}

export function upsertPreset(
  modelValue: RosterPlayerModel,
  presetValue: RosterPlayerPreset,
) {
  const model = normalizeRosterPlayerModel(modelValue);
  const normalized = normalizePreset({ ...presetValue, updatedAt: nowIso(), builtIn: false }, 0);
  if (!normalized) return model;
  const presetItem = normalizePresetShape(model, normalized);
  const existingIndex = model.presets.findIndex((item) => item.id === presetItem.id);
  const presets = [...model.presets];
  if (existingIndex >= 0) presets[existingIndex] = presetItem;
  else presets.push(presetItem);
  return normalizeRosterPlayerModel({ ...model, presets, updatedAt: nowIso() });
}

export function removePreset(modelValue: RosterPlayerModel, presetId: string) {
  const model = normalizeRosterPlayerModel(modelValue);
  return normalizeRosterPlayerModel({
    ...model,
    presets: model.presets.filter((item) => item.id !== presetId),
    updatedAt: nowIso(),
  });
}

export function reorderPreset(modelValue: RosterPlayerModel, presetId: string, direction: -1 | 1) {
  const model = normalizeRosterPlayerModel(modelValue);
  const index = model.presets.findIndex((item) => item.id === presetId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= model.presets.length) return model;
  const presets = [...model.presets];
  [presets[index], presets[nextIndex]] = [presets[nextIndex], presets[index]];
  return normalizeRosterPlayerModel({ ...model, presets, updatedAt: nowIso() });
}

export function serializePresetPack(
  modelValue: RosterPlayerModel,
  selectedPresetIds: string[],
  name = "Stripes player presets",
) {
  const model = normalizeRosterPlayerModel(modelValue);
  const selected = new Set(selectedPresetIds);
  const presets = model.presets.filter((item) => selected.has(item.id));
  const pack: PlayerPresetPack = {
    app: "Stripes",
    type: "player-preset-pack",
    schemaVersion: PLAYER_PRESET_PACK_SCHEMA_VERSION,
    exportedAt: nowIso(),
    name: cleanText(name, "Stripes player presets", 80),
    playerModel: {
      schemaVersion: model.schemaVersion,
      profileSize: model.profileSize,
      attributes: model.attributes.map((attribute) => ({ ...attribute })),
    },
    presets: presets.map((item) => ({ ...item, offsets: { ...item.offsets } })),
  };
  return JSON.stringify(pack, null, 2);
}

export function parsePresetPack(text: string): PlayerPresetPack {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed.app !== "Stripes" || parsed.type !== "player-preset-pack") {
    throw new Error("This file is not a Stripes player preset pack.");
  }
  if (Number(parsed.schemaVersion) !== PLAYER_PRESET_PACK_SCHEMA_VERSION) {
    throw new Error("This preset pack version is not supported.");
  }
  const playerModelSource = parsed.playerModel && typeof parsed.playerModel === "object"
    ? parsed.playerModel as Record<string, unknown>
    : {};
  const model = normalizeRosterPlayerModel({
    schemaVersion: ROSTER_PLAYER_MODEL_SCHEMA_VERSION,
    profileSize: playerModelSource.profileSize,
    attributes: playerModelSource.attributes,
    presets: parsed.presets,
  });
  return {
    app: "Stripes",
    type: "player-preset-pack",
    schemaVersion: PLAYER_PRESET_PACK_SCHEMA_VERSION,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : nowIso(),
    name: cleanText(parsed.name, "Imported Stripes presets", 80),
    playerModel: {
      schemaVersion: model.schemaVersion,
      profileSize: model.profileSize,
      attributes: model.attributes,
    },
    presets: model.presets.map((item) => ({ ...item, builtIn: false })),
  };
}

function uniquePresetName(name: string, existing: RosterPlayerPreset[]) {
  const names = new Set(existing.map((item) => item.name.trim().toLocaleLowerCase()));
  if (!names.has(name.trim().toLocaleLowerCase())) return name;
  let suffix = 1;
  while (names.has(`${name} (${suffix})`.toLocaleLowerCase())) suffix += 1;
  return `${name} (${suffix})`;
}

export function importPresetPackIntoModel(
  modelValue: RosterPlayerModel,
  pack: PlayerPresetPack,
) {
  const model = normalizeRosterPlayerModel(modelValue);
  if (!playerModelAttributesMatch(model, pack.playerModel)) {
    throw new Error("This preset pack uses a different attribute model.");
  }
  const presets = [...model.presets];
  pack.presets.forEach((incoming) => {
    const timestamp = nowIso();
    presets.push({
      ...incoming,
      id: createId("preset"),
      name: uniquePresetName(incoming.name, presets),
      builtIn: false,
      offsets: { ...incoming.offsets },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  return normalizeRosterPlayerModel({ ...model, presets, updatedAt: nowIso() });
}

export function presetPackFilename(name: string) {
  const slug = cleanText(name, "stripes-player-presets", 80)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "stripes-player-presets";
  return `${slug}.stripes-presets.json`;
}
