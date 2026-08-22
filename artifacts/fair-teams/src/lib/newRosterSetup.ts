import type { RoomPlayer } from "./localRoster.ts";
import {
  PLAYER_PROFILE_SLOTS,
  createDefaultRosterPlayerModel,
  normalizeRosterPlayerModel,
  resizeRosterPlayerModel,
  type PlayerProfileSize,
  type RosterPlayerModel,
} from "./rosterPlayerModel.ts";

export type NewRosterSetupKind = "football" | "custom" | "imported";

const CUSTOM_ATTRIBUTE_LABEL = /^attribute\s+\d+$/i;

function customAttributeDescription(index: number) {
  return `Describe the ${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} way players contribute in this activity.`;
}

export function createCustomRosterPlayerModel(profileSize: PlayerProfileSize = 3): RosterPlayerModel {
  const base = createDefaultRosterPlayerModel();
  const slots = profileSize === 3
    ? (["attack", "passing", "defense"] as const)
    : PLAYER_PROFILE_SLOTS;
  const timestamp = new Date().toISOString();
  return normalizeRosterPlayerModel({
    ...base,
    profileSize,
    attributes: slots.map((slot, index) => ({
      id: `custom-attribute-${index + 1}`,
      slot,
      label: `Attribute ${index + 1}`,
      description: customAttributeDescription(index),
      order: index,
    })),
    presets: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function isCustomRosterPlayerModel(modelValue: RosterPlayerModel) {
  const model = normalizeRosterPlayerModel(modelValue);
  const footballModel = resizeRosterPlayerModel(createDefaultRosterPlayerModel(), model.profileSize);
  return model.attributes.length !== footballModel.attributes.length
    || model.attributes.some((attribute, index) => attribute.id !== footballModel.attributes[index]?.id);
}

export function resizeCustomRosterPlayerModel(
  modelValue: RosterPlayerModel,
  profileSize: PlayerProfileSize,
) {
  const model = normalizeRosterPlayerModel(modelValue);
  const slots = profileSize === 3
    ? (["attack", "passing", "defense"] as const)
    : PLAYER_PROFILE_SLOTS;
  const timestamp = new Date().toISOString();
  return normalizeRosterPlayerModel({
    ...model,
    profileSize,
    attributes: slots.map((slot, index) => {
      const existing = model.attributes[index];
      return existing
        ? { ...existing, slot, order: index }
        : {
          id: `custom-attribute-${index + 1}`,
          slot,
          label: `Attribute ${index + 1}`,
          description: customAttributeDescription(index),
          order: index,
        };
    }),
    presets: [],
    updatedAt: timestamp,
  });
}

export function isPlaceholderCustomAttributeLabel(value: string) {
  return CUSTOM_ATTRIBUTE_LABEL.test(value.trim());
}

export type PlayerModelAttributeIssue = "missing" | "duplicate" | null;

export function playerModelAttributeIssue(modelValue: RosterPlayerModel): PlayerModelAttributeIssue {
  const labels = Array.isArray(modelValue.attributes)
    ? modelValue.attributes.map((attribute) => String(attribute?.label ?? "").trim())
    : [];
  if (labels.length !== modelValue.profileSize || labels.some((label) => !label)) return "missing";
  const normalized = labels.map((label) => label.toLocaleLowerCase());
  return new Set(normalized).size === normalized.length ? null : "duplicate";
}

export function customPlayerModelNeedsDefinition(modelValue: RosterPlayerModel) {
  const model = normalizeRosterPlayerModel(modelValue);
  return model.attributes.some((attribute) => isPlaceholderCustomAttributeLabel(attribute.label));
}

export function playerHasModelBoundProfile(player: Partial<RoomPlayer>) {
  // OVR-only ratings deliberately use independent OVR, but they do not attach
  // meaning to the roster's detailed attributes. Lock the attribute model only
  // after a preset or manual Advanced Edit has created model-bound data.
  return Boolean(
    player.profileFineTuned
    || (Array.isArray(player.profilePresetIds) && player.profilePresetIds.length > 0)
  );
}

export function rosterPlayerModelAttributesLocked(
  players: Partial<RoomPlayer>[],
  sharedRoster = false,
) {
  // Shared rosters may already contain private organizer profiles that are not
  // represented in the canonical player payload, so any existing membership is
  // conservatively treated as model-bound. Local OVR-only players can still be
  // upgraded to a custom profile model later.
  if (sharedRoster) return players.length > 0;
  return players.some(playerHasModelBoundProfile);
}
