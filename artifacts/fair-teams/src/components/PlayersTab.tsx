import React, { useEffect, useMemo, useRef, useState } from "react";
import { Trans } from "react-i18next";
import type { RoomPlayer } from "@/lib/localRoster";
import { calculateOverall, normalizePlayer } from "@/lib/localRoster";
import {
  BALANCED_PLAYER_STYLE,
  profileFromAveragedAttributes,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";
import { FunBadge, Gender, PairingRule, PairingRuleKind } from "@/lib/types";
import { PlayerBatchRatingFlow } from "@/components/PlayerBatchRatingFlow";
import { PlayerModelSettings } from "@/components/PlayerModelSettings";
import { RosterPlayerPresetPicker } from "@/components/PlayerPresetPicker";
import { PlayerPresetIcon } from "@/components/playerPresetIcons";
import {
  applyProfileToPlayer,
  neutralProfileForOverall,
  normalizePresetSelection,
  normalizeRosterPlayerModel,
  profileForPresetSelection,
  type RosterPlayerModel,
  type RosterPlayerPreset,
} from "@/lib/rosterPlayerModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserMinus, Plus, Star, Zap, Search, X, Camera, Image as ImageIcon, Trash2, Pencil, Shield, Activity, Dumbbell, Target, Share2, ArrowDownAZ, Clock3, Mic, Info, Eye, EyeOff, Settings2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StripesConfirmContent } from "@/components/ui/stripes-modal";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import {
  listenToClubRatingSummaries,
  listenToMyClubRatings,
  saveMyClubPlayerRating,
  type ClubMyRating,
  type ClubRatingProfile,
  type ClubRatingSummary,
} from "@/lib/clubCollaborationService";
import { formatDateTime as formatLocalizedDateTime, formatList, formatNumber, getResolvedUiLocale, translate, type TranslationKey } from "@/i18n";



type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

let rosterSortModeSession: "recent" | "alpha" | "skill" = "recent";
let rosterSkillHiddenSession = true;

type ClubRatingCoverageState = "none" | "needs" | "ready" | "complete";

function clubRatingCoverageStatus(summary: ClubRatingSummary | undefined, organizerCount: number) {
  const ratingCount = Math.max(0, Number(summary?.ratingCount || 0));
  const total = Math.max(1, organizerCount, ratingCount);
  const ratio = total > 0 ? ratingCount / total : 0;
  const state: ClubRatingCoverageState = ratingCount <= 0
    ? "none"
    : ratingCount >= total
      ? "complete"
      : ratio >= 2 / 3
        ? "ready"
        : "needs";
  return { state, ratingCount, total };
}

function clubRatingDotClass(state: ClubRatingCoverageState) {
  if (state === "complete") return "bg-emerald-500 ring-emerald-100";
  if (state === "ready") return "bg-teal-500 ring-teal-100";
  if (state === "needs") return "bg-amber-400 ring-amber-100";
  return "bg-slate-300 ring-slate-100";
}

function clubRatingStatusLabel(state: ClubRatingCoverageState) {
  if (state === "complete") return translate("roster.ratingCoverage.complete");
  if (state === "ready") return translate("roster.ratingCoverage.ready");
  if (state === "needs") return translate("roster.ratingCoverage.needs");
  return translate("roster.ratingCoverage.none");
}

function cleanVoiceAddName(value: string) {
  return value
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVoiceAddName(value: string) {
  return cleanVoiceAddName(value)
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isProbablyVoiceAddName(value: string) {
  const cleaned = cleanVoiceAddName(value);
  if (cleaned.length < 2 || cleaned.length > 42) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (!/[\p{L}]/u.test(cleaned)) return false;
  if (!/^[\p{L}\p{M}][\p{L}\p{M}.'-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}.'-]*)*$/u.test(cleaned)) return false;
  const lowered = cleaned.toLocaleLowerCase();
  const blocked = new Set(["yes", "no", "okay", "ok", "cancel", "stop", "try again", "add player", "screenshot", "import"]);
  return !blocked.has(lowered);
}


function splitAliasValues(value?: string) {
  if (!value) return [] as string[];
  return value
    .split(/[,/;|()\[\]{}]+/g)
    .map(part => part.trim())
    .filter(Boolean);
}

function normalizeDuplicateKey(value: string) {
  return cleanVoiceAddName(value)
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function levenshteinDistance(a: string, b: string, maxDistance = 3) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, prevDiagonal + cost);
      prevDiagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
  }
  return previous[b.length];
}

function duplicateValuesForPlayer(player: Pick<RoomPlayer, "name" | "aka">) {
  return [player.name, ...splitAliasValues(player.aka)].filter(Boolean);
}

function firstDuplicateToken(value: string) {
  return normalizeVoiceAddName(value).split(/\s+/).filter(Boolean)[0] ?? "";
}

function duplicateComparisonKeys(value: string) {
  const compact = normalizeDuplicateKey(value);
  const first = firstDuplicateToken(value);
  return Array.from(new Set([compact, first].filter(Boolean)));
}

function areLikelyDuplicateKeys(input: string, candidate: string) {
  if (!input || !candidate) return false;
  if (input === candidate) return true;

  const shorter = input.length <= candidate.length ? input : candidate;
  const longer = input.length > candidate.length ? input : candidate;

  // "Alex" vs "Alexander", "Philip" vs "Philip R" etc. should warn.
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  const minLength = Math.min(input.length, candidate.length);
  const maxLength = Math.max(input.length, candidate.length);
  if (minLength < 3) return false;

  const maxDistance = minLength <= 4 ? 1 : minLength <= 7 ? 2 : 3;
  const distance = levenshteinDistance(input, candidate, maxDistance);
  if (distance > maxDistance) return false;

  // Keep very short names fairly strict to avoid too many random warnings.
  if (minLength <= 4) return distance <= 1;

  const similarity = 1 - distance / maxLength;
  return similarity >= 0.68;
}

function findSharedDuplicateCandidates(players: RoomPlayer[], name: string, aka?: string) {
  const rawInputs = [name, ...splitAliasValues(aka)].map(value => value.trim()).filter(Boolean);
  const inputKeys = rawInputs.flatMap(duplicateComparisonKeys).filter(Boolean);
  if (!inputKeys.length) return [] as { player: RoomPlayer; reason: "exact" | "similar" }[];

  const matches = players
    .map(player => {
      const playerValues = duplicateValuesForPlayer(player);
      const playerKeys = playerValues.flatMap(duplicateComparisonKeys).filter(Boolean);
      if (!playerKeys.length) return null;

      const exact = inputKeys.some(input => playerKeys.includes(input));
      if (exact) return { player, reason: "exact" as const };

      const similar = inputKeys.some(input => playerKeys.some(candidate => areLikelyDuplicateKeys(input, candidate)));
      return similar ? { player, reason: "similar" as const } : null;
    })
    .filter(Boolean) as { player: RoomPlayer; reason: "exact" | "similar" }[];

  const seen = new Set<string>();
  return matches.filter(match => {
    if (seen.has(match.player.id)) return false;
    seen.add(match.player.id);
    return true;
  }).slice(0, 3);
}

function EngineBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="8" width="14" height="9" rx="2" />
      <path d="M18 11h2v3h-2" />
      <path d="M7 11v3" />
      <path d="M10 11v3" />
      <path d="M13 11v3" />
    </svg>
  );
}

function VersatileBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v16" />
      <path d="M4 12h16" />
      <path d="M12 4l-3 3" />
      <path d="M12 4l3 3" />
      <path d="M20 12l-3-3" />
      <path d="M20 12l-3 3" />
      <path d="M12 20l-3-3" />
      <path d="M12 20l3-3" />
      <path d="M4 12l3-3" />
      <path d="M4 12l3 3" />
    </svg>
  );
}



function MagicWandBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4l5 5" />
      <path d="M13.5 10.5l-9 9" />
      <path d="M12.5 5.5l6 6" />
      <path d="M5 4v3" />
      <path d="M3.5 5.5h3" />
      <path d="M20 16v3" />
      <path d="M18.5 17.5h3" />
      <path d="M9 3l.8 1.6L11.5 5l-1.7.4L9 7l-.8-1.6L6.5 5l1.7-.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FinisherBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="13" r="6" />
      <circle cx="10" cy="13" r="2" />
      <path d="M14.5 8.5L20 3" />
      <path d="M17.5 3H20v2.5" />
      <path d="M14.2 8.8L10 13" />
    </svg>
  );
}

function DribblerBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 18l4-4-4-4 4-4" />
      <path d="M10 18l4-4-4-4 4-4" />
      <circle cx="19" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LongPassBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19L19 4" />
      <path d="M12 4h7v7" />
      <path d="M5 13c2-1.5 4.5-1.5 7.5 0" />
    </svg>
  );
}

function TikiTakaBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="8" r="2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="17" r="2" fill="currentColor" stroke="none" />
      <circle cx="7" cy="16" r="2" fill="currentColor" stroke="none" />
      <path d="M8 8h7" />
      <path d="M17 9l1 6" />
      <path d="M16 17H9" />
      <path d="M7 14L6 10" />
    </svg>
  );
}

function TechnicianBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="14" r="2.3" />
      <path d="M12 10c1.5-1.6 3.5-1.6 5 0" />
      <path d="M12 14c1.5 1.6 3.5 1.6 5 0" />
      <path d="M18 5l.7 1.6L20.5 7l-1.8.4L18 9l-.7-1.6L15.5 7l1.8-.4z" fill="currentColor" stroke="none" />
      <path d="M5 5l.6 1.3L7 7l-1.4.4L5 8.7l-.6-1.3L3 7l1.4-.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HeaderBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.4" />
      <path d="M8 12c1-2 2.3-3 4-3s3 1 4 3" />
      <path d="M9 17c1.5 1.2 4.5 1.2 6 0" />
      <path d="M12 9v5" />
      <path d="M7 7l-2 2" />
      <path d="M17 7l2 2" />
    </svg>
  );
}

function PowerShotBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="15" r="2.8" />
      <path d="M12 15h7" />
      <path d="M16 11l3 4-3 4" />
      <path d="M10 8l2-3" />
      <path d="M13 9l4-3" />
      <path d="M13 21l4-3" />
    </svg>
  );
}

function BulldogBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9L3 5l5 2" />
      <path d="M19 9l2-4-5 2" />
      <path d="M5 10c0-3 3-5 7-5s7 2 7 5v3c0 4-3 7-7 7s-7-3-7-7z" />
      <path d="M8 12h.01" />
      <path d="M16 12h.01" />
      <path d="M10 15h4" />
      <path d="M9 17c2 1 4 1 6 0" />
      <path d="M12 13v2" />
    </svg>
  );
}

type AbilityKey = "isGoalkeeper" | "isPlaymaker" | "isFinisher" | "isDribbler" | "isSentinel" | "isEngine" | "isVersatile" | "isSpaceFinder" | "isLongPass" | "isTikiTaka" | "isCrossing" | "isAerial" | "isPowerShot" | "isBulldog";

type SpecialAbility = {
  key: AbilityKey;
  labelKey: TranslationKey;
  badgeKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon?: React.ComponentType<{ className?: string }>;
};

const SPECIAL_ABILITIES: SpecialAbility[] = [
  { key: "isGoalkeeper", labelKey: "roster.abilities.goalkeeper.label", badgeKey: "roster.abilities.goalkeeper.badge", descriptionKey: "roster.abilities.goalkeeper.description" },

  // Attack-first traits
  { key: "isFinisher", labelKey: "roster.abilities.finisher.label", badgeKey: "roster.abilities.finisher.badge", descriptionKey: "roster.abilities.finisher.description", icon: FinisherBadgeIcon },
  { key: "isPowerShot", labelKey: "roster.abilities.powerShot.label", badgeKey: "roster.abilities.powerShot.badge", descriptionKey: "roster.abilities.powerShot.description", icon: PowerShotBadgeIcon },
  { key: "isDribbler", labelKey: "roster.abilities.dribbler.label", badgeKey: "roster.abilities.dribbler.badge", descriptionKey: "roster.abilities.dribbler.description", icon: DribblerBadgeIcon },
  { key: "isSpaceFinder", labelKey: "roster.abilities.spaceFinder.label", badgeKey: "roster.abilities.spaceFinder.badge", descriptionKey: "roster.abilities.spaceFinder.description", icon: Search },

  // Midfield / control traits
  { key: "isPlaymaker", labelKey: "roster.abilities.playmaker.label", badgeKey: "roster.abilities.playmaker.badge", descriptionKey: "roster.abilities.playmaker.description", icon: MagicWandBadgeIcon },
  { key: "isCrossing", labelKey: "roster.abilities.technician.label", badgeKey: "roster.abilities.technician.badge", descriptionKey: "roster.abilities.technician.description", icon: TechnicianBadgeIcon },
  { key: "isTikiTaka", labelKey: "roster.abilities.tikiTaka.label", badgeKey: "roster.abilities.tikiTaka.badge", descriptionKey: "roster.abilities.tikiTaka.description", icon: TikiTakaBadgeIcon },
  { key: "isVersatile", labelKey: "roster.abilities.versatile.label", badgeKey: "roster.abilities.versatile.badge", descriptionKey: "roster.abilities.versatile.description", icon: VersatileBadgeIcon },
  { key: "isLongPass", labelKey: "roster.abilities.longPass.label", badgeKey: "roster.abilities.longPass.badge", descriptionKey: "roster.abilities.longPass.description", icon: LongPassBadgeIcon },
  { key: "isEngine", labelKey: "roster.abilities.engine.label", badgeKey: "roster.abilities.engine.badge", descriptionKey: "roster.abilities.engine.description", icon: EngineBadgeIcon },

  // Defense-first traits
  { key: "isAerial", labelKey: "roster.abilities.header.label", badgeKey: "roster.abilities.header.badge", descriptionKey: "roster.abilities.header.description", icon: HeaderBadgeIcon },
  { key: "isSentinel", labelKey: "roster.abilities.sentinel.label", badgeKey: "roster.abilities.sentinel.badge", descriptionKey: "roster.abilities.sentinel.description", icon: Shield },
  { key: "isBulldog", labelKey: "roster.abilities.bulldog.label", badgeKey: "roster.abilities.bulldog.badge", descriptionKey: "roster.abilities.bulldog.description", icon: BulldogBadgeIcon },
];

function abilityLabel(ability: SpecialAbility) {
  return translate(ability.labelKey);
}

function abilityBadgeLabel(ability: SpecialAbility) {
  return translate(ability.badgeKey);
}

function abilityDescription(ability: SpecialAbility) {
  return translate(ability.descriptionKey);
}

const FUN_BADGES: { value: FunBadge; labelKey: TranslationKey; emoji: string; descriptionKey: TranslationKey }[] = [
  { value: "cool-head", labelKey: "roster.vibes.coolHead.label", emoji: "🧊", descriptionKey: "roster.vibes.coolHead.description" },
  { value: "unbothered", labelKey: "roster.vibes.unbothered.label", emoji: "😐", descriptionKey: "roster.vibes.unbothered.description" },
  { value: "wildcard", labelKey: "roster.vibes.wildcard.label", emoji: "🎲", descriptionKey: "roster.vibes.wildcard.description" },
  { value: "silent-mode", labelKey: "roster.vibes.silentMode.label", emoji: "🔇", descriptionKey: "roster.vibes.silentMode.description" },
  { value: "smooth-talker", labelKey: "roster.vibes.smoothTalker.label", emoji: "🗣️", descriptionKey: "roster.vibes.smoothTalker.description" },
  { value: "no-filter", labelKey: "roster.vibes.noFilter.label", emoji: "📣", descriptionKey: "roster.vibes.noFilter.description" },
  { value: "human-alarm", labelKey: "roster.vibes.humanAlarm.label", emoji: "🚨", descriptionKey: "roster.vibes.humanAlarm.description" },
  { value: "influencer", labelKey: "roster.vibes.influencer.label", emoji: "🤳", descriptionKey: "roster.vibes.influencer.description" },
  { value: "main-character", labelKey: "roster.vibes.mainCharacter.label", emoji: "🎬", descriptionKey: "roster.vibes.mainCharacter.description" },
  { value: "old-school", labelKey: "roster.vibes.oldSchool.label", emoji: "📼", descriptionKey: "roster.vibes.oldSchool.description" },
  { value: "always-late", labelKey: "roster.vibes.alwaysLate.label", emoji: "⏰", descriptionKey: "roster.vibes.alwaysLate.description" },
  { value: "early-exit", labelKey: "roster.vibes.earlyExit.label", emoji: "🚪", descriptionKey: "roster.vibes.earlyExit.description" },
  { value: "first-5", labelKey: "roster.vibes.firstFive.label", emoji: "🚀", descriptionKey: "roster.vibes.firstFive.description" },
  { value: "eighty-minute-warmup", labelKey: "roster.vibes.eightyMinuteWarmup.label", emoji: "🐢", descriptionKey: "roster.vibes.eightyMinuteWarmup.description" },
  { value: "third-half", labelKey: "roster.vibes.thirdHalf.label", emoji: "🍺", descriptionKey: "roster.vibes.thirdHalf.description" },
  { value: "yellow-card", labelKey: "roster.vibes.yellowCard.label", emoji: "🟨", descriptionKey: "roster.vibes.yellowCard.description" },
  { value: "var-caller", labelKey: "roster.vibes.varCaller.label", emoji: "📺", descriptionKey: "roster.vibes.varCaller.description" },
  { value: "kit-collector", labelKey: "roster.vibes.kitCollector.label", emoji: "👕", descriptionKey: "roster.vibes.kitCollector.description" },
  { value: "shoe-collector", labelKey: "roster.vibes.shoeCollector.label", emoji: "👟", descriptionKey: "roster.vibes.shoeCollector.description" },
  { value: "fashion-icon", labelKey: "roster.vibes.fashionIcon.label", emoji: "✨", descriptionKey: "roster.vibes.fashionIcon.description" },
  { value: "club-legend", labelKey: "roster.vibes.clubLegend.label", emoji: "🏆", descriptionKey: "roster.vibes.clubLegend.description" },
  { value: "snack-captain", labelKey: "roster.vibes.snackCaptain.label", emoji: "🍪", descriptionKey: "roster.vibes.snackCaptain.description" },
  { value: "cameo", labelKey: "roster.vibes.cameo.label", emoji: "🎭", descriptionKey: "roster.vibes.cameo.description" },
  { value: "mastermind", labelKey: "roster.vibes.mastermind.label", emoji: "♟️", descriptionKey: "roster.vibes.mastermind.description" },
];

function getFunBadge(value?: FunBadge) {
  return FUN_BADGES.find(badge => badge.value === value);
}

const SKILL_LEVEL_EXPLANATIONS: Record<number, TranslationKey> = {
  1: "roster.skillLevels.one",
  2: "roster.skillLevels.two",
  3: "roster.skillLevels.three",
  4: "roster.skillLevels.four",
  5: "roster.skillLevels.five",
  6: "roster.skillLevels.six",
  7: "roster.skillLevels.seven",
  8: "roster.skillLevels.eight",
  9: "roster.skillLevels.nine",
  10: "roster.skillLevels.ten",
};

function skillLevelExplanation(skillLevel: number) {
  const bucket = Math.max(1, Math.min(10, Math.floor(skillLevel)));
  return translate(SKILL_LEVEL_EXPLANATIONS[bucket]);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

function createPlayerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type AddPlayerDetails = Pick<RoomPlayer,
  "attack" | "defense" | "speed" | "passing" | "stamina" | "physical" | "teamPlay" |
  "funBadge" | "isGoalkeeper" | "isPlaymaker" | "isFinisher" | "isDribbler" |
  "isSentinel" | "isEngine" | "isVersatile" | "isSpaceFinder" |
  "isLongPass" | "isTikiTaka" | "isCrossing" | "isAerial" | "isPowerShot" | "isBulldog"
>;

function createDefaultAddPlayerDetails(skillLevel = 5): AddPlayerDetails {
  return {
    attack: skillLevel,
    defense: skillLevel,
    speed: skillLevel,
    passing: skillLevel,
    stamina: skillLevel,
    physical: skillLevel,
    teamPlay: 2,
    funBadge: undefined,
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
  };
}

function roundSkillStep(value: number) {
  return Math.max(1, Math.min(10, Math.round(value * 2) / 2));
}

function formatSkillStep(value: number) {
  const rounded = roundSkillStep(value);
  return formatNumber(getResolvedUiLocale(), rounded, {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatOneDecimal(value: number) {
  return formatNumber(getResolvedUiLocale(), value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function applyQuickSkillToPlayer(player: RoomPlayer, skillLevel: number): RoomPlayer {
  const nextSkillLevel = roundSkillStep(skillLevel);
  return normalizePlayer({
    ...player,
    attack: nextSkillLevel,
    defense: nextSkillLevel,
    speed: nextSkillLevel,
    passing: nextSkillLevel,
    stamina: nextSkillLevel,
    physical: nextSkillLevel,
    // Quick skill should not silently change teamwork.
    // Otherwise choosing 9 can push teamwork to 3 and save as 9.6.
    teamPlay: player.teamPlay || 2,
  });
}

async function fileToSmallDataUrl(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(translate("roster.errors.photoReadFailed")));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(translate("roster.errors.photoFormatUnsupported")));
    img.src = dataUrl;
  });

  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  const minSide = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sx = ((image.naturalWidth || image.width) - minSide) / 2;
  const sy = ((image.naturalHeight || image.height) - minSide) / 2;
  ctx.drawImage(image, sx, sy, minSide, minSide, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function PlayerAvatar({ player, size = "md" }: { player: RoomPlayer; size?: "sm" | "md" | "lg" | "xl" }) {
  const cls = size === "xl" ? "w-12 h-12 text-xs" : size === "lg" ? "w-24 h-24 text-xl" : size === "sm" ? "w-10 h-10 text-[11px]" : "w-12 h-12 text-xs";
  return (
    <div className={`${cls} rounded-full overflow-hidden bg-primary/10 text-primary/80 font-semibold flex items-center justify-center shrink-0 border border-primary/15`}>
      {player.profilePhoto ? <img src={player.profilePhoto} alt="" className="w-full h-full object-cover" /> : initials(player.name)}
    </div>
  );
}

function displayName(player: Pick<RoomPlayer, "name" | "aka">) {
  const aka = player.aka?.trim();
  return aka ? `${player.name} (${aka})` : player.name;
}

function formatDateTime(value?: string) {
  if (!value) return translate("roster.messages.notSavedYet");
  try {
    return formatLocalizedDateTime(getResolvedUiLocale(), new Date(value), {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function NewBadge() {
  return <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-800 border border-sky-200 leading-none">{translate("roster.badges.new")}</span>;
}
function ORGBadge() {
  return <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-800 border border-violet-200 leading-none">{translate("roster.badges.organizer")}</span>;
}
function TogglePill({
  active,
  onClick,
  children,
  testId,
  activeClassName = "border-primary bg-primary/10 text-primary",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`h-10 rounded-xl border px-3 text-xs font-semibold transition-colors ${active ? activeClassName : "border-border bg-muted/30 text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}
function FunBadgePill({ value }: { value?: FunBadge }) {
  const badge = getFunBadge(value);
  if (!badge) return null;
  return <span title={translate(badge.descriptionKey)} className="inline-flex items-center px-0.5 py-0 text-[10px] font-semibold text-muted-foreground leading-tight">{badge.emoji} {translate(badge.labelKey)}</span>;
}
function AbilityBadge({
  ability,
  onClick,
  selected = false,
}: {
  ability: SpecialAbility;
  onClick?: () => void;
  selected?: boolean;
}) {
  const label = abilityLabel(ability);
  const badge = abilityBadgeLabel(ability);
  const baseTitle = translate("roster.accessibility.abilityBadge", { label, badge });
  const ringClass = selected ? "border-amber-500 ring-2 ring-amber-300" : "border-amber-300";

  if (ability.key === "isGoalkeeper") {
    const className = `inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 border shadow-sm ${ringClass} ${onClick ? "cursor-pointer active:scale-95" : "cursor-default"}`;
    if (onClick) {
      return (
        <button type="button" title={baseTitle} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }} className={className}>
          {badge}</button>
      );
    }
    return <span title={baseTitle} aria-label={label} className={className}>{badge}</span>;
  }

  const Icon = ability.icon ?? Star;
  const className = `inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 border shadow-sm ${ringClass} ${onClick ? "cursor-pointer active:scale-95" : "cursor-default"}`;

  if (onClick) {
    return (
      <button type="button" title={baseTitle} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }} className={className}>
        <Icon className="w-3.5 h-3.5 stroke-[3]" />
      </button>
    );
  }

  return (
    <span title={baseTitle} aria-label={label} className={className}>
      <Icon className="w-3.5 h-3.5 stroke-[3]" />
    </span>
  );
}

function SpecialAbilityIconRow({ player, max = 4 }: { player: RoomPlayer; max?: number }) {
  const abilities = SPECIAL_ABILITIES.filter(ability => Boolean(player[ability.key]));
  if (abilities.length <= 0) return null;

  const visible = abilities.slice(0, max);
  const hiddenCount = abilities.length - visible.length;
  const title = formatList(getResolvedUiLocale(), abilities.map(abilityLabel), { type: "unit" });

  return (
    <span title={title} className="stripes-type-ui inline-flex items-center gap-1 text-primary/80 leading-none">
      {visible.map(ability => {
        const label = abilityLabel(ability);
        if (ability.key === "isGoalkeeper") {
          return (
            <span key={ability.key} aria-label={label} className="text-[8px] font-black tracking-tight text-primary/80 leading-none">
              {abilityBadgeLabel(ability)}</span>
          );
        }
        const Icon = ability.icon ?? Star;
        return <Icon key={ability.key} aria-label={label} className="w-3 h-3 stroke-[2.8] shrink-0" />;
      })}
      {hiddenCount > 0 ? (
        <span className="text-[8px] font-black text-primary/70 leading-none">+{formatNumber(getResolvedUiLocale(), hiddenCount)}</span>
      ) : null}
    </span>
  );
}

function PlayerPresetIconRow({
  player,
  playerModel,
  max = 3,
}: {
  player: RoomPlayer;
  playerModel: RosterPlayerModel;
  max?: number;
}) {
  const model = normalizeRosterPlayerModel(playerModel);
  const presets = (player.profilePresetIds ?? [])
    .map((presetId) => model.presets.find((preset) => preset.id === presetId))
    .filter((preset): preset is RosterPlayerPreset => Boolean(preset));
  if (!presets.length) return null;
  const visible = presets.slice(0, max);
  const hiddenCount = presets.length - visible.length;
  const title = formatList(getResolvedUiLocale(), presets.map((preset) => preset.name), { type: "unit" });
  return (
    <span title={title} className="stripes-type-ui inline-flex items-center gap-1 text-amber-700 leading-none">
      {visible.map((preset) => (
        <span key={preset.id} aria-label={preset.name} className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100">
          <PlayerPresetIcon iconKey={preset.iconKey} className="h-2.5 w-2.5" />
        </span>
      ))}
      {hiddenCount > 0 ? <span className="text-[8px] font-black">+{hiddenCount}</span> : null}
    </span>
  );
}

function PlayerTags({
  player,
  playerModel,
  includeVibe = false,
  includeAbilityCount = false,
}: {
  player: RoomPlayer;
  playerModel: RosterPlayerModel;
  includeVibe?: boolean;
  includeAbilityCount?: boolean;
}) {
  const hasNewPresets = Boolean(player.profilePresetIds?.length);
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 min-h-3 items-center">
      {includeVibe && player.funBadge ? <FunBadgePill value={player.funBadge} /> : null}
      {hasNewPresets
        ? <PlayerPresetIconRow player={player} playerModel={playerModel} />
        : includeAbilityCount ? <SpecialAbilityIconRow player={player} /> : null}
      {player.isNew && <NewBadge />}
      {player.isOrganizer && <ORGBadge />}
    </div>
  );
}

function StatControl({ label, value, max = 10, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</Label>
        <span className="text-xs font-black text-primary">{value}{max === 3 ? "" : max === 5 ? "★" : ""}</span>
      </div>
      <input
        type="range"
        min={1}
        max={max}
        value={value}
        onPointerDown={dismissActiveInput}
        onTouchStart={dismissActiveInput}
        onChange={e => onChange(Number(e.target.value))}
        className="fairteams-slider fairteams-slider-compact w-full"
        style={{ "--slider-fill": `${((value - 1) / Math.max(1, max - 1)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

function PlayerRadar({
  player,
  playerModel,
  compact = false,
}: {
  player: RoomPlayer;
  playerModel: RosterPlayerModel;
  compact?: boolean;
}) {
  const model = normalizeRosterPlayerModel(playerModel);
  const data = model.attributes.map((attribute) => ({
    stat: attribute.label,
    value: player[attribute.slot],
  }));

  return (
    <div className={`${compact ? "h-36" : "h-52"} w-full bg-muted/40 rounded-xl border border-border p-2`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid />
          <PolarAngleAxis dataKey="stat" tick={{ fontSize: compact ? 8 : 10, fontWeight: 700 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VibePicker({ value, onChange }: { value?: FunBadge; onChange: (value?: FunBadge) => void }) {
  const [open, setOpen] = useState(false);
  const selected = getFunBadge(value);

  const choose = (next?: FunBadge) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 w-full rounded-xl border border-input bg-background/70 px-3 text-left shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-base leading-none">{selected.emoji}</span>
            <span className="min-w-0 truncate text-sm font-semibold">{translate(selected.labelKey)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{translate("roster.messages.none")}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="stripes-type-ui max-w-md max-h-[88dvh] overflow-hidden rounded-3xl p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 text-left border-b border-border/70">
            <DialogTitle>{translate("roster.headings.choosePlayerVibe")}</DialogTitle>
            {selected ? (
              <div className="pt-2 text-xs text-muted-foreground">
                <Trans
                  i18nKey="roster.messages.currentVibe"
                  values={{ vibe: `${selected.emoji} ${translate(selected.labelKey)}` }}
                  components={{ current: <span className="font-bold text-foreground" /> }}
                />
              </div>
            ) : (
              <div className="pt-2 text-xs text-muted-foreground">{translate("roster.vibes.pickerHelp")}</div>
            )}
          </DialogHeader>

          <div className="overflow-y-auto px-4 py-4 max-h-[64dvh]">
            <div className="grid grid-cols-3 gap-1.5">
              {FUN_BADGES.map(badge => {
                const active = badge.value === value;
                return (
                  <button
                    key={badge.value}
                    type="button"
                    title={translate(badge.descriptionKey)}
                    onClick={() => choose(badge.value)}
                    className={`min-h-[2.65rem] rounded-xl border px-1.5 py-1.5 text-center transition-all active:scale-[0.98] ${active ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40 hover:bg-accent/60"}`}
                  >
                    <span className="flex min-w-0 flex-col items-center justify-center gap-0.5">
                      <span className="text-base leading-none">{badge.emoji}</span>
                      <span className="max-w-full truncate text-[9px] font-extrabold leading-none text-foreground/90">{translate(badge.labelKey)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 border-t border-border/70 p-4">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => choose(undefined)}>{translate("roster.actions.clearVibe")}</Button>
            <Button type="button" className="flex-1 rounded-xl" onClick={() => setOpen(false)}>{translate("common.cancel")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function blurOnDoneKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function dismissActiveInput() {
  if (typeof document === "undefined") return;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) activeElement.blur();
}

function hasCompleteClubMyRating(rating?: ClubMyRating | null) {
  return Boolean(
    rating &&
      !rating.skipped &&
      typeof rating.skill === "number" &&
      [rating.attack, rating.defense, rating.speed, rating.passing, rating.stamina, rating.physical].every((value) => typeof value === "number"),
  );
}

function sharedDraftFromPlayerAndRating(player: RoomPlayer, rating?: ClubMyRating | null) {
  const base = normalizePlayer(player);
  if (!hasCompleteClubMyRating(rating)) return { ...base, teamPlay: 2 };
  return normalizePlayer({
    ...base,
    skill: Number(rating?.skill),
    attack: Number(rating?.attack),
    defense: Number(rating?.defense),
    speed: Number(rating?.speed),
    passing: Number(rating?.passing),
    stamina: Number(rating?.stamina),
    physical: Number(rating?.physical),
    teamPlay: 2,
    isGoalkeeper: Boolean(rating?.isGoalkeeper),
    overallIndependent: Boolean(rating?.overallIndependent ?? true),
    profilePresetIds: rating?.profilePresetIds ?? base.profilePresetIds,
    profileFineTuned: Boolean(rating?.profileFineTuned),
  });
}

function sharedOverallFromDraft(player: Partial<RoomPlayer>) {
  return calculateOverall({
    attack: player.attack,
    defense: player.defense,
    speed: player.speed,
    passing: player.passing,
    stamina: player.stamina,
    physical: player.physical,
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
  });
}

function sharedRatingProfileFromDraft(draft: RoomPlayer, playerStyle: PlayerStyleValue): ClubRatingProfile {
  const skill = roundSkillStep(draft.overallIndependent ? draft.skill : sharedOverallFromDraft(draft));
  return {
    skill,
    attack: draft.attack,
    defense: draft.defense,
    speed: draft.speed,
    passing: draft.passing,
    stamina: draft.stamina,
    physical: draft.physical,
    teamPlay: 2,
    playerStyle,
    isGoalkeeper: Boolean(draft.isGoalkeeper),
    overallIndependent: true,
    profilePresetIds: draft.profilePresetIds ?? [],
    profileFineTuned: Boolean(draft.profileFineTuned),
  };
}

function sharedIdentityUpdateFromDraft(draft: RoomPlayer): Partial<RoomPlayer> {
  return {
    name: draft.name,
    aka: draft.aka,
    gender: draft.gender,
    isNew: draft.isNew,
    funBadge: draft.funBadge,
    profilePhoto: draft.profilePhoto,
    updatedAt: new Date().toISOString(),
  };
}

function ProfileDialog({
  player,
  playerModel,
  onUpdate,
  autoOpen = false,
  onAutoOpenHandled,
  reviewMode = false,
  reviewIndex = 0,
  reviewTotal = 0,
  onReviewNext,
  onReviewDone,
  isSharedRoster = false,
  sharedRosterId,
  clubMyRating,
  tutorialHighlightEdit = false,
  tutorialHighlightAdvanced = false,
  tutorialHighlightSave = false,
  onTutorialOpened,
  onTutorialAdvancedOpened,
  onTutorialSaved,
}: {
  player: RoomPlayer;
  playerModel: RosterPlayerModel;
  onUpdate: (data: Partial<RoomPlayer>) => void;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
  reviewMode?: boolean;
  reviewIndex?: number;
  reviewTotal?: number;
  onReviewNext?: () => void;
  onReviewDone?: () => void;
  isSharedRoster?: boolean;
  sharedRosterId?: string;
  clubMyRating?: ClubMyRating;
  tutorialHighlightEdit?: boolean;
  tutorialHighlightAdvanced?: boolean;
  tutorialHighlightSave?: boolean;
  onTutorialOpened?: () => void;
  onTutorialAdvancedOpened?: () => void;
  onTutorialSaved?: () => void;
}) {
  const safePlayerModel = useMemo(() => normalizeRosterPlayerModel(playerModel), [playerModel]);
  const initialDraft = () => isSharedRoster ? sharedDraftFromPlayerAndRating(player, clubMyRating) : normalizePlayer(player);
  const [draft, setDraft] = useState<RoomPlayer>(initialDraft);
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const photoCameraInput = useRef<HTMLInputElement | null>(null);
  const photoGalleryInput = useRef<HTMLInputElement | null>(null);
  const [photoActionsOpen, setPhotoActionsOpen] = useState(false);
  const [selectedProfilePresetIds, setSelectedProfilePresetIds] = useState<string[]>(() =>
    normalizePresetSelection(safePlayerModel, clubMyRating?.profilePresetIds ?? player.profilePresetIds),
  );
  const [sharedProfileSaving, setSharedProfileSaving] = useState(false);
  const [sharedProfileError, setSharedProfileError] = useState("");
  const [pendingProfilePresetIds, setPendingProfilePresetIds] = useState<string[] | null>(null);
  const overall = roundSkillStep(calculateOverall(draft));
  const quickSkill = overall;
  const quickSkillExplanation = skillLevelExplanation(quickSkill);
  const reviewIsLast = reviewMode && reviewIndex >= reviewTotal - 1;

  const updateDraft = (data: Partial<RoomPlayer>) => {
    setDraft((previous) => normalizePlayer({ ...previous, ...data }));
  };

  const shapeDraft = (source: RoomPlayer, nextOverall: number, presetIds: string[], keepFineTuned = false) => {
    if (keepFineTuned) {
      return normalizePlayer({
        ...source,
        skill: roundSkillStep(nextOverall),
        overallIndependent: true,
        profilePresetIds: presetIds,
        profileFineTuned: true,
      });
    }
    const profile = presetIds.length
      ? profileForPresetSelection(safePlayerModel, nextOverall, presetIds)
      : neutralProfileForOverall(nextOverall);
    return normalizePlayer({
      ...applyProfileToPlayer(source, nextOverall, profile, presetIds),
      profileFineTuned: false,
    });
  };

  const resetSharedDraft = () => {
    const nextDraft = initialDraft();
    const nextPresetIds = normalizePresetSelection(
      safePlayerModel,
      clubMyRating?.profilePresetIds ?? nextDraft.profilePresetIds,
    );
    setDraft(nextDraft);
    setSelectedProfilePresetIds(nextPresetIds);
    setSharedProfileError("");
  };

  const applyQuickSkill = (skillLevel: number) => {
    const nextSkill = roundSkillStep(skillLevel);
    setDraft((previous) => shapeDraft(previous, nextSkill, selectedProfilePresetIds, Boolean(previous.profileFineTuned)));
  };

  const commitProfilePresetSelection = (nextPresetIds: string[]) => {
    setSelectedProfilePresetIds(nextPresetIds);
    setDraft((previous) => shapeDraft(previous, calculateOverall(previous), nextPresetIds, false));
    setSharedProfileError("");
  };

  const toggleProfilePreset = (presetId: string) => {
    const selected = selectedProfilePresetIds.includes(presetId);
    const nextPresetIds = selected
      ? selectedProfilePresetIds.filter((id) => id !== presetId)
      : [...selectedProfilePresetIds, presetId];
    if (nextPresetIds.length > 2) {
      setSharedProfileError(translate("roster.playerModel.chooseUpToTwo"));
      return;
    }
    if (draft.profileFineTuned) {
      setPendingProfilePresetIds(nextPresetIds);
      return;
    }
    commitProfilePresetSelection(nextPresetIds);
  };

  useEffect(() => {
    if (!autoOpen) return;
    resetSharedDraft();
    setAdvancedOpen(false);
    setPhotoActionsOpen(false);
    setPendingProfilePresetIds(null);
    setOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpen, player, onAutoOpenHandled]);

  const closeProfileDialog = () => {
    setPhotoActionsOpen(false);
    setPendingProfilePresetIds(null);
    setOpen(false);
    if (reviewMode) {
      onReviewDone?.();
    }
  };

  const saveSharedProfile = async () => {
    if (!isSharedRoster) return true;
    onUpdate(sharedIdentityUpdateFromDraft(draft));
    if (!sharedRosterId) {
      setSharedProfileError(translate("roster.errors.sharedRosterConnecting"));
      return false;
    }
    try {
      setSharedProfileSaving(true);
      setSharedProfileError("");
      await saveMyClubPlayerRating(sharedRosterId, player.id, sharedRatingProfileFromDraft({
        ...draft,
        profilePresetIds: selectedProfilePresetIds,
      }, BALANCED_PLAYER_STYLE));
      return true;
    } catch (error) {
      setSharedProfileError(error instanceof Error ? error.message : translate("roster.errors.sharedProfileSaveFailed"));
      return false;
    } finally {
      setSharedProfileSaving(false);
    }
  };

  const save = async () => {
    if (isSharedRoster) {
      const saved = await saveSharedProfile();
      if (!saved) return;
    } else {
      onUpdate({ ...draft, skill: overall, updatedAt: new Date().toISOString() });
    }
    setOpen(false);
    onTutorialSaved?.();
  };

  const saveReviewAndContinue = async () => {
    if (isSharedRoster) {
      const saved = await saveSharedProfile();
      if (!saved) return;
    } else {
      onUpdate({ ...draft, skill: overall, updatedAt: new Date().toISOString() });
    }
    setOpen(false);
    if (reviewIsLast) {
      onReviewDone?.();
    } else {
      onReviewNext?.();
    }
  };

  const skipReviewPlayer = () => {
    setOpen(false);
    if (reviewIsLast) {
      onReviewDone?.();
    } else {
      onReviewNext?.();
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleNativeBack = (event: Event) => {
      event.preventDefault();
      if (photoActionsOpen) {
        setPhotoActionsOpen(false);
        return;
      }
      closeProfileDialog();
    };

    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () => window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [open, photoActionsOpen, reviewMode, onReviewDone]);

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setPhotoActionsOpen(false);
        if (next) {
          resetSharedDraft();
          setAdvancedOpen(false);
        } else if (reviewMode) {
          onReviewDone?.();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className={`w-8 h-8 rounded-full ${tutorialHighlightEdit ? "fairteams-tutorial-pulse relative z-[82]" : ""}`} title={translate("roster.accessibility.editPlayer")} data-testid={`profile-${player.id}`} onClick={e => { e.stopPropagation(); onTutorialOpened?.(); }}>
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={`stripes-type-ui max-w-sm md:max-w-xl overflow-y-auto rounded-3xl ${tutorialHighlightSave ? "!top-[58%] !max-h-[76dvh]" : "max-h-[90dvh]"}`}
      >
        <DialogHeader>
          <DialogTitle>{isSharedRoster ? translate("roster.headings.sharedPlayerInfo") : translate("roster.headings.playerSetup")}</DialogTitle>
          <div className="text-xs font-semibold text-muted-foreground">
            {isSharedRoster
              ? translate("roster.playerProfile.sharedSourceHelp")
              : translate("roster.playerProfile.quickEditHelp")}
          </div>
        </DialogHeader>

        {reviewMode && (
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
            {translate("roster.messages.reviewProgress", { index: reviewIndex + 1, total: reviewTotal })}
          </div>
        )}

        <div className="flex flex-col gap-3.5 pt-1">
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.playerName")}</Label>
              <Input
                value={draft.name}
                onChange={e => updateDraft({ name: e.target.value })}
                onKeyDown={blurOnDoneKey}
                enterKeyHint="done"
                className="h-11 text-sm font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-[1.15fr_0.85fr] gap-2">
            <Select value={draft.gender} onValueChange={v => updateDraft({ gender: v as Gender })}>
              <SelectTrigger className="h-10 rounded-xl border-border bg-muted/30 text-xs font-bold px-2">
                <SelectValue placeholder={translate("roster.fields.gender")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">{translate("roster.messages.male")}</SelectItem>
                <SelectItem value="female">{translate("roster.messages.female")}</SelectItem>
                <SelectItem value="other">{translate("roster.messages.other")}</SelectItem>
              </SelectContent>
            </Select>
            <TogglePill active={!!draft.isNew} onClick={() => updateDraft({ isNew: !draft.isNew })} activeClassName="border-sky-300 bg-sky-100 text-sky-800 shadow-sm">
              {translate("roster.labels.newPlayer")}</TogglePill>
          </div>

          {isSharedRoster && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/85 p-3 space-y-3">
              <div>
                <Label className="text-[11px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.sharedPlayerInfo")}</Label>
                <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-700/75">
                  {translate("roster.playerProfile.sharedIdentityHelp")}</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-violet-700/80 tracking-wider">{translate("roster.labels.akaNickname")}</Label>
                <Input value={draft.aka || ""} placeholder={translate("roster.fields.optional")} onChange={e => updateDraft({ aka: e.target.value })} className="h-10 border-violet-100 bg-white text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-violet-700/80 tracking-wider">{translate("roster.labels.playerVibe")}</Label>
                <VibePicker value={draft.funBadge} onChange={funBadge => updateDraft({ funBadge })} />
              </div>
              {(() => {
                const sharedOverall = overall;
                return (
                  <div className="rounded-2xl border border-violet-100 bg-white/85 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-[10px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.sharedBalanceProfile")}</Label>
                        <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-700/75">
                          {translate("roster.playerProfile.sharedBalanceHelp")}</div>
                      </div>
                      <div className="rounded-xl bg-violet-700 px-3 py-1.5 text-center text-white shadow-sm">
                        <div className="text-[8px] uppercase font-black opacity-75 leading-none">{translate("roster.messages.ovr")}</div>
                        <div className="text-xl font-black leading-none">{formatOneDecimal(sharedOverall)}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <Label className="text-[10px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.overallSkill")}</Label>
                          <div className="mt-0.5 text-[10px] font-semibold text-violet-700/75">{translate("roster.playerProfile.styleAdjustmentHelp")}</div>
                        </div>
                        <span className="text-sm font-black tabular-nums text-violet-900">{formatOneDecimal(roundSkillStep(sharedOverall))}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={0.5}
                        value={roundSkillStep(sharedOverall)}
                        onPointerDown={dismissActiveInput}
                        onTouchStart={dismissActiveInput}
                        onChange={e => applyQuickSkill(roundSkillStep(Number(e.target.value)))}
                        className="fairteams-slider w-full"
                        style={{ "--slider-fill": `${((roundSkillStep(sharedOverall) - 1) / 9) * 100}%` } as React.CSSProperties}
                      />
                    </div>

                    <div className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2">
                      <div>
                        <Label className="text-[10px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.whatStandsOut")}</Label>
                        <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-700/75">{translate("roster.playerPresets.help")}</div>
                      </div>
                      <RosterPlayerPresetPicker
                        model={safePlayerModel}
                        selectedIds={selectedProfilePresetIds}
                        onToggle={toggleProfilePreset}
                        disabled={sharedProfileSaving}
                      />
                    </div>

                    <PlayerRadar player={{ ...draft, skill: sharedOverall, teamPlay: 2 }} playerModel={playerModel} />

                    <div className="grid grid-cols-2 gap-2">
                      {normalizeRosterPlayerModel(playerModel).attributes.map((attribute) => (
                        <StatControl key={attribute.id} label={attribute.label} value={draft[attribute.slot]} onChange={value => updateDraft({ [attribute.slot]: value, teamPlay: 2, overallIndependent: true, profileFineTuned: true } as Partial<RoomPlayer>)} />
                      ))}
                      <TogglePill active={!!draft.isGoalkeeper} onClick={() => updateDraft({ isGoalkeeper: !draft.isGoalkeeper, teamPlay: 2 })} activeClassName="border-amber-300 bg-amber-100 text-amber-900 shadow-sm">
                        {translate("roster.abilities.goalkeeper.badge")}</TogglePill>
                    </div>

                    {sharedProfileError && (
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold leading-snug text-rose-700">
                        {sharedProfileError}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {!isSharedRoster && (
            <>
          <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-[11px] uppercase font-black tracking-wide text-primary">{translate("roster.labels.skillLevel")}</Label>
                <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{translate("roster.playerProfile.quickSkillHelp")}</div>
              </div>
              <div className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-center shadow-sm">
                <div className="text-[8px] uppercase font-black opacity-75 leading-none">{translate("roster.labels.skill")}</div>
                <div className="text-xl font-black leading-none">{formatSkillStep(quickSkill)}</div>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={quickSkill}
              onChange={e => applyQuickSkill(roundSkillStep(Number(e.target.value)))}
              className="fairteams-slider w-full"
              style={{ "--slider-fill": `${((quickSkill - 1) / 9) * 100}%` } as React.CSSProperties}
              data-testid={`input-player-quick-skill-${player.id}`}
            />
            <div className="rounded-xl border border-primary/10 bg-background/70 px-3 py-2 text-[11px] font-semibold leading-snug text-muted-foreground">
              {quickSkillExplanation}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-primary/15 bg-primary/5 p-3">
            <div>
              <Label className="text-[10px] uppercase font-black tracking-wide text-primary">{translate("roster.labels.whatStandsOut")}</Label>
              <div className="mt-0.5 text-[10px] font-semibold leading-snug text-muted-foreground">{translate("roster.playerPresets.help")}</div>
            </div>
            <RosterPlayerPresetPicker
              model={safePlayerModel}
              selectedIds={selectedProfilePresetIds}
              onToggle={toggleProfilePreset}
              disabled={sharedProfileSaving}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setAdvancedOpen(prev => !prev);
              if (!advancedOpen) onTutorialAdvancedOpened?.();
            }}
            className={`flex h-10 items-center justify-between rounded-2xl border border-border bg-background px-3 text-left text-xs font-black tracking-wide text-foreground ${tutorialHighlightAdvanced ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
            data-testid={`button-toggle-edit-advanced-${player.id}`}
          >
            <span>{translate("roster.messages.advancedEdit")}</span>
            <span className="text-muted-foreground">{advancedOpen ? "▲" : "▼"}</span>
          </button>

          {advancedOpen && (
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="relative shrink-0 pt-5">
                  <button
                    type="button"
                    onClick={() => setPhotoActionsOpen(prev => !prev)}
                    className="relative group rounded-full transition-transform active:scale-95"
                    title={translate("roster.accessibility.changePhoto")}
                  >
                    <PlayerAvatar player={draft} size="lg" />
                    <span className="absolute inset-0 bg-slate-900/35 rounded-full text-white hidden group-hover:flex items-center justify-center">
                      <Camera className="w-5 h-5" />
                    </span>
                  </button>
                  {photoActionsOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-36 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold hover:bg-accent" onClick={() => { setPhotoActionsOpen(false); photoCameraInput.current?.click(); }}>
                        <Camera className="h-3.5 w-3.5" /> {translate("roster.actions.takePhoto")}</button>
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold hover:bg-accent" onClick={() => { setPhotoActionsOpen(false); photoGalleryInput.current?.click(); }}>
                        <ImageIcon className="h-3.5 w-3.5" /> {translate("roster.actions.importPhoto")}</button>
                      {draft.profilePhoto && (
                        <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold text-muted-foreground hover:bg-accent" onClick={() => { setPhotoActionsOpen(false); updateDraft({ profilePhoto: undefined }); }}>
                          <Trash2 className="h-3.5 w-3.5" /> {translate("roster.actions.clearPhoto")}</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-[1_1_8rem] space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.akaNickname")}</Label>
                  <Input value={draft.aka || ""} placeholder={translate("roster.fields.optional")} onChange={e => updateDraft({ aka: e.target.value })} className="h-10 text-sm font-semibold" />
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.playerVibe")}</Label>
                      <VibePicker value={draft.funBadge} onChange={funBadge => updateDraft({ funBadge })} />
                    </div>
                    <TogglePill active={!!draft.isOrganizer} onClick={() => updateDraft({ isOrganizer: !draft.isOrganizer })} activeClassName="border-violet-200 bg-violet-100 text-violet-800 shadow-sm">
                      {translate("roster.labels.organizerAbbreviation")}</TogglePill>
                  </div>
                </div>
              </div>

              <input
                ref={photoCameraInput}
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try { updateDraft({ profilePhoto: await fileToSmallDataUrl(file) }); }
                  catch { alert(translate("roster.errors.photoLoadFailed")); }
                }}
              />
              <input
                ref={photoGalleryInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try { updateDraft({ profilePhoto: await fileToSmallDataUrl(file) }); }
                  catch { alert(translate("roster.errors.photoLoadFailed")); }
                }}
              />

              <PlayerRadar player={{ ...draft, skill: overall }} playerModel={playerModel} />

              <div className="rounded-2xl border border-primary/15 bg-background/70 px-3 py-2 flex items-center justify-between">
                <div>
                  <Label className="text-[10px] uppercase font-black tracking-wide text-primary">{translate("roster.labels.teamBalanceSkill")}</Label>
                  <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{translate("roster.playerProfile.balanceSkillHelp")}</div>
                </div>
                <div className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-center shadow-sm">
                  <div className="text-[8px] uppercase font-black opacity-75 leading-none">{translate("roster.labels.skill")}</div>
                  <div className="text-xl font-black leading-none">{overall}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {safePlayerModel.attributes.map((attribute) => (
                  <StatControl key={attribute.id} label={attribute.label} value={draft[attribute.slot]} onChange={value => updateDraft({ [attribute.slot]: value, overallIndependent: true, profileFineTuned: true } as Partial<RoomPlayer>)} />
                ))}
                <TogglePill
                  active={Boolean(draft.isGoalkeeper)}
                  onClick={() => updateDraft({ isGoalkeeper: !draft.isGoalkeeper })}
                  activeClassName="border-amber-300 bg-amber-100 text-amber-900 shadow-sm"
                >
                  {translate("roster.abilities.goalkeeper.label")}
                </TogglePill>
              </div>

              <div className="rounded-xl border border-border p-3 bg-background/70 text-[11px] text-muted-foreground font-semibold space-y-1">
                <div className="flex justify-between gap-3"><span>{translate("roster.messages.added")}</span><span className="text-right text-foreground">{formatDateTime(draft.createdAt)}</span></div>
                <div className="flex justify-between gap-3"><span>{translate("roster.messages.lastEdited")}</span><span className="text-right text-foreground">{formatDateTime(draft.updatedAt || draft.createdAt)}</span></div>
              </div>
            </div>
          )}
            </>
          )}

          {reviewMode ? (
            <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={skipReviewPlayer}
                className="h-11 rounded-xl font-black"
              >
                {reviewIsLast ? translate("common.done") : translate("roster.actions.skip")}
              </Button>
              <Button
                type="button"
                onClick={saveReviewAndContinue}
                disabled={sharedProfileSaving}
                className="h-11 rounded-xl font-black"
              >
                {sharedProfileSaving ? translate("roster.actions.saving") : reviewIsLast ? translate("roster.actions.saveDone") : translate("roster.actions.saveNext")}
              </Button>
            </div>
          ) : (
            <Button onClick={save} disabled={sharedProfileSaving} className={`h-11 rounded-xl font-black uppercase tracking-wide ${tutorialHighlightSave ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}>{sharedProfileSaving ? translate("roster.actions.saving") : isSharedRoster ? translate("roster.actions.saveSharedProfile") : translate("roster.actions.saveProfile")}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={pendingProfilePresetIds !== null} onOpenChange={(next) => { if (!next) setPendingProfilePresetIds(null); }}>
      <StripesConfirmContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translate("roster.headings.replaceDetailedProfile")}</AlertDialogTitle>
          <AlertDialogDescription>{translate("roster.playerModel.presetReplaceCustomConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{translate("roster.actions.keepCustomProfile")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pendingProfilePresetIds) return;
              const next = pendingProfilePresetIds;
              setPendingProfilePresetIds(null);
              commitProfilePresetSelection(next);
            }}
          >
            {translate("roster.actions.replaceProfile")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </StripesConfirmContent>
    </AlertDialog>
    </>
  );
}

function OverallBadge({ player }: { player: RoomPlayer }) {
  return (
    <div className="w-9 h-8 rounded-xl bg-primary/10 text-primary border border-primary/15 flex items-center justify-center shrink-0 shadow-sm">
      <span className="text-[15px] font-extrabold leading-none">{formatSkillStep(player.skill)}</span>
    </div>
  );
}

function playerWithClubAverage(player: RoomPlayer, summary?: ClubRatingSummary): RoomPlayer {
  const average = Number(summary?.averageSkill);
  if (!Number.isFinite(average) || average < 1 || average > 10) return player;
  const skill = Math.round(average * 10) / 10;
  const profile = profileFromAveragedAttributes(skill, {
    attack: summary?.averageAttack ?? undefined,
    defense: summary?.averageDefense ?? undefined,
    speed: summary?.averageSpeed ?? undefined,
    passing: summary?.averagePassing ?? undefined,
    stamina: summary?.averageStamina ?? undefined,
    physical: summary?.averagePhysical ?? undefined,
  });
  return {
    ...player,
    skill,
    attack: profile.attack,
    defense: profile.defense,
    speed: profile.speed,
    passing: profile.passing,
    stamina: profile.stamina,
    physical: profile.physical,
    teamPlay: 2,
    overallIndependent: true,
    isGoalkeeper: Boolean((summary?.gkYesCount || 0) > 0 || player.isGoalkeeper),
  };
}

function PlayerCardBack({
  player,
  playerModel,
  clubRatingSummary,
}: {
  player: RoomPlayer;
  playerModel: RosterPlayerModel;
  clubRatingSummary?: ClubRatingSummary;
}) {
  const graphPlayer = playerWithClubAverage(player, clubRatingSummary);
  const hasClubAverage = Number(clubRatingSummary?.ratingCount || 0) > 0 && Number.isFinite(Number(clubRatingSummary?.averageSkill));
  const safeModel = normalizeRosterPlayerModel(playerModel);
  const profilePresets = (player.profilePresetIds ?? [])
    .map((presetId) => safeModel.presets.find((preset) => preset.id === presetId))
    .filter((preset): preset is RosterPlayerPreset => Boolean(preset));
  const abilities = SPECIAL_ABILITIES.filter(a => Boolean(player[a.key]));
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(profilePresets[0]?.id ?? null);
  const [selectedAbilityKey, setSelectedAbilityKey] = useState<AbilityKey | null>(abilities[0]?.key ?? null);
  const selectedPreset = profilePresets.find((preset) => preset.id === selectedPresetId) ?? profilePresets[0];
  const selectedAbility = abilities.find(a => a.key === selectedAbilityKey) ?? abilities[0];
  return (
    <div className="mt-3 border-t border-border/70 pt-3 space-y-3">
      <div className="rounded-2xl bg-muted/25 border border-border/70 p-2 shadow-inner">
        <PlayerRadar player={graphPlayer} playerModel={playerModel} compact />
        {hasClubAverage ? (
          <div className="mt-1 text-center text-[10px] font-black uppercase tracking-wide text-primary">
            {translate("roster.messages.clubAverageRatings", {
              average: graphPlayer.skill,
              count: clubRatingSummary?.ratingCount ?? 0,
            })}
          </div>
        ) : null}
      </div>

      {profilePresets.length > 0 ? (
        <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {profilePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPresetId((current) => current === preset.id ? null : preset.id)}
                className={`flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-black ${selectedPreset?.id === preset.id ? "border-amber-400 bg-amber-100 text-amber-950" : "border-amber-100 bg-white text-amber-800"}`}
              >
                <PlayerPresetIcon iconKey={preset.iconKey} className="h-3.5 w-3.5" />
                {preset.name}
              </button>
            ))}
          </div>
          {selectedPreset ? (
            <div className="mx-auto max-w-[280px] text-center">
              <div className="text-[11px] font-semibold leading-tight text-foreground">{selectedPreset.name}</div>
              <div className="mt-0.5 text-[10px] font-medium leading-snug text-muted-foreground">{selectedPreset.description}</div>
            </div>
          ) : null}
        </div>
      ) : abilities.length > 0 ? (
        <div className="space-y-2" onClick={e => e.stopPropagation()}>
          <div className="flex flex-wrap gap-1.5 items-center justify-center">
            {abilities.map(a => (
              <AbilityBadge
                key={a.key}
                ability={a}
                selected={selectedAbility?.key === a.key}
                onClick={() => setSelectedAbilityKey(prev => prev === a.key ? null : a.key)}
              />
            ))}
          </div>
          {selectedAbility ? (
            <div className="mx-auto max-w-[260px] text-center">
              <div className="text-[11px] font-semibold text-foreground leading-tight">{abilityLabel(selectedAbility)}</div>
              <div className="mt-0.5 text-[10px] font-medium text-muted-foreground leading-snug">{abilityDescription(selectedAbility)}</div>
            </div>
          ) : (
            <div className="text-center text-[10px] font-semibold text-muted-foreground">{translate("roster.abilities.selectionHelp")}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PlayersTab({
  players,
  setPlayers,
  playerModel,
  onPlayerModelChange,
  onSavePresetPackToGoogleDrive,
  rosterName,
  pairingRules = [],
  setPairingRules,
  onScreenshotImport,
  reviewPlayerId,
  reviewActivePlayerId,
  reviewPlayerIndex = 0,
  reviewPlayerTotal = 0,
  onReviewPlayerHandled,
  onStartReviewPlayers,
  onReviewPrevious,
  onReviewNext,
  onReviewDone,
  openPairingRulesToken = 0,
  openAddPlayerRequest = null,
  isSharedRoster = false,
  sharedRosterId,
  canReadClubRatings = false,
  sharedOrganizerCount = 1,
  tutorialStep,
  onTutorialAction,
}: {
  players: RoomPlayer[];
  setPlayers: (players: RoomPlayer[]) => void;
  playerModel: RosterPlayerModel;
  onPlayerModelChange: (model: RosterPlayerModel) => void;
  onSavePresetPackToGoogleDrive?: (fileName: string, jsonText: string) => Promise<void>;
  rosterName: string;
  pairingRules?: PairingRule[];
  setPairingRules?: (rules: PairingRule[]) => void;
  onScreenshotImport?: () => void;
  reviewPlayerId?: string | null;
  reviewActivePlayerId?: string | null;
  reviewPlayerIndex?: number;
  reviewPlayerTotal?: number;
  onReviewPlayerHandled?: () => void;
  onStartReviewPlayers?: (playerIds: string[]) => void;
  onReviewPrevious?: () => void;
  onReviewNext?: () => void;
  onReviewDone?: () => void;
  openPairingRulesToken?: number;
  openAddPlayerRequest?: { token: number; name?: string } | null;
  isSharedRoster?: boolean;
  sharedRosterId?: string;
  canReadClubRatings?: boolean;
  sharedOrganizerCount?: number;
  tutorialStep?: string | null;
  onTutorialAction?: (action: string, playerId?: string) => void;
}) {
  const [name, setName] = useState("");
  const [aka, setAka] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [isNew, setIsNew] = useState(true);
  const [skillLevel, setSkillLevel] = useState(5);
  const [addPresetIds, setAddPresetIds] = useState<string[]>([]);
  const [addProfileFineTuned, setAddProfileFineTuned] = useState(false);
  const [addPresetError, setAddPresetError] = useState("");
  const [addAdvancedOpen, setAddAdvancedOpen] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [addProfilePhoto, setAddProfilePhoto] = useState<string | undefined>(undefined);
  const [addPhotoActionsOpen, setAddPhotoActionsOpen] = useState(false);
  const addPhotoCameraInput = useRef<HTMLInputElement | null>(null);
  const addPhotoGalleryInput = useRef<HTMLInputElement | null>(null);
  const [addDetails, setAddDetails] = useState<AddPlayerDetails>(() => createDefaultAddPlayerDetails(5));
  const safeRosterPlayerModel = useMemo(() => normalizeRosterPlayerModel(playerModel), [playerModel]);
  const addOverall = roundSkillStep(skillLevel);
  const addSkillExplanation = skillLevelExplanation(skillLevel);
  const updateAddDetails = (data: Partial<AddPlayerDetails>) => setAddDetails(prev => ({ ...prev, ...data }));
  const shapeAddDetails = (nextOverall: number, presetIds: string[]) => {
    const profile = presetIds.length
      ? profileForPresetSelection(safeRosterPlayerModel, nextOverall, presetIds)
      : neutralProfileForOverall(nextOverall);
    setAddDetails((current) => ({ ...current, ...profile, teamPlay: 2 }));
    setAddProfileFineTuned(false);
  };
  const changeAddOverall = (nextOverall: number) => {
    const safeOverall = roundSkillStep(nextOverall);
    setSkillLevel(safeOverall);
    if (!addProfileFineTuned) shapeAddDetails(safeOverall, addPresetIds);
  };
  const toggleAddPreset = (presetId: string) => {
    const selected = addPresetIds.includes(presetId);
    const nextIds = selected
      ? addPresetIds.filter((id) => id !== presetId)
      : [...addPresetIds, presetId];
    if (nextIds.length > 2) {
      setAddPresetError(translate("roster.playerModel.chooseUpToTwo"));
      return;
    }
    setAddPresetIds(nextIds);
    setAddPresetError("");
    shapeAddDetails(skillLevel, nextIds);
  };
  const [autoEditPlayerId, setAutoEditPlayerId] = useState<string | null>(null);
  const [flippedPlayerIds, setFlippedPlayerIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [addOptionsOpen, setAddOptionsOpen] = useState(false);
  const [pairingRulesOpen, setPairingRulesOpen] = useState(false);
  const [pairAddKind, setPairAddKind] = useState<PairingRuleKind | null>(null);
  const [pairFirstId, setPairFirstId] = useState("");
  const [pairSecondId, setPairSecondId] = useState("");
  const [pairNotice, setPairNotice] = useState("");
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [playerModelSettingsOpen, setPlayerModelSettingsOpen] = useState(false);
  const [sharedDuplicateOverride, setSharedDuplicateOverride] = useState(false);
  const [sharedDuplicateNotice, setSharedDuplicateNotice] = useState("");
  const [voiceAddOpen, setVoiceAddOpen] = useState(false);
  const [voiceAddHeard, setVoiceAddHeard] = useState("");
  const [voiceAddListening, setVoiceAddListening] = useState(false);
  const [voiceAddStatus, setVoiceAddStatus] = useState("");
  const voiceAddRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [hideOverall, setHideOverall] = useState(() => rosterSkillHiddenSession);
  const [sortMode, setSortMode] = useState<"recent" | "alpha" | "skill">(() => rosterSortModeSession);
  const [clubRatingLegendOpen, setClubRatingLegendOpen] = useState(false);
  const [clubRatingSummaries, setClubRatingSummaries] = useState<ClubRatingSummary[]>([]);
  const [myClubRatings, setMyClubRatings] = useState<ClubMyRating[]>([]);
  const lastOpenPairingRulesTokenRef = useRef(0);
  const lastExternalAddPlayerTokenRef = useRef(0);

  useEffect(() => {
    if (!openPairingRulesToken || openPairingRulesToken === lastOpenPairingRulesTokenRef.current) return;
    lastOpenPairingRulesTokenRef.current = openPairingRulesToken;
    if (setPairingRules && players.length >= 2) {
      setPairingRulesOpen(true);
    }
  }, [openPairingRulesToken, players.length, setPairingRules]);

  useEffect(() => {
    if (!isSharedRoster || !sharedRosterId || !canReadClubRatings) {
      setClubRatingSummaries([]);
      setMyClubRatings([]);
      return;
    }

    try {
      const unsubscribeSummaries = listenToClubRatingSummaries(
        sharedRosterId,
        setClubRatingSummaries,
        () => setClubRatingSummaries([]),
      );
      const unsubscribeMyRatings = listenToMyClubRatings(
        sharedRosterId,
        setMyClubRatings,
        () => setMyClubRatings([]),
      );
      return () => {
        unsubscribeSummaries();
        unsubscribeMyRatings();
      };
    } catch {
      setClubRatingSummaries([]);
      setMyClubRatings([]);
      return;
    }
  }, [canReadClubRatings, isSharedRoster, sharedRosterId]);

  useEffect(() => {
    const hasRosterDialogOpen =
      addOptionsOpen ||
      voiceAddOpen ||
      addPlayerOpen ||
      pairingRulesOpen ||
      addPhotoActionsOpen;

    if (!hasRosterDialogOpen) return;

    const handleNativeBack = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();

      if (addPhotoActionsOpen) {
        setAddPhotoActionsOpen(false);
        return;
      }
      if (addPlayerOpen) {
        setAddPlayerOpen(false);
        return;
      }
      if (voiceAddOpen) {
        stopVoiceAddListening();
        setVoiceAddOpen(false);
        return;
      }
      if (pairingRulesOpen) {
        setPairingRulesOpen(false);
        return;
      }
      if (addOptionsOpen) {
        setAddOptionsOpen(false);
      }
    };

    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () => window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [
    addOptionsOpen,
    voiceAddOpen,
    addPlayerOpen,
    pairingRulesOpen,
    addPhotoActionsOpen,
  ]);

  useEffect(() => {
    if (reviewPlayerId || reviewActivePlayerId) setSearch("");
  }, [reviewPlayerId, reviewActivePlayerId]);

  const resetAddPlayerForm = () => {
    setName("");
    setAka("");
    setGender("male");
    setIsNew(true);
    setSkillLevel(5);
    setAddPresetIds([]);
    setAddProfileFineTuned(false);
    setAddPresetError("");
    setAddDetails(createDefaultAddPlayerDetails(5));
    setAddProfilePhoto(undefined);
    setAddPhotoActionsOpen(false);
    setAddAdvancedOpen(false);
    setIsOrganizer(false);
    setSharedDuplicateOverride(false);
    setSharedDuplicateNotice("");
  };

  useEffect(() => {
    if (!openAddPlayerRequest?.token || openAddPlayerRequest.token === lastExternalAddPlayerTokenRef.current) return;
    lastExternalAddPlayerTokenRef.current = openAddPlayerRequest.token;
    resetAddPlayerForm();
    setName(openAddPlayerRequest.name?.trim() || "");
    setAddOptionsOpen(false);
    setAddPlayerOpen(true);
  }, [openAddPlayerRequest]);

  const openManualAddPlayer = () => {
    resetAddPlayerForm();
    if (tutorialStep === "add-manual") {
      setName("Heung-min");
      setSkillLevel(7);
      setAddDetails(createDefaultAddPlayerDetails(7));
    }
    onTutorialAction?.("manual-opened");
    setAddOptionsOpen(false);
    setSharedDuplicateOverride(false);
    setSharedDuplicateNotice("");
    setAddPlayerOpen(true);
  };

  const openRosterScreenshotImport = () => {
    setAddOptionsOpen(false);
    onScreenshotImport?.();
  };

  const stopVoiceAddListening = () => {
    voiceAddRecognitionRef.current?.stop();
    setVoiceAddListening(false);
  };

  const startVoiceAddListening = () => {
    const voiceWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceAddStatus(translate("roster.voice.unsupported"));
      return;
    }
    try {
      setVoiceAddHeard("");
      setVoiceAddStatus(translate("roster.voice.prompt"));
      navigator.vibrate?.(25);
      voiceAddRecognitionRef.current?.abort?.();
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        const transcript = event.results?.[event.resultIndex]?.[0]?.transcript?.trim?.() ?? "";
        setVoiceAddHeard(transcript);
        setVoiceAddStatus(transcript ? translate("roster.voice.review") : translate("roster.voice.noNameHeard"));
      };
      recognition.onerror = (event) => {
        setVoiceAddStatus(event.error
          ? translate("roster.voice.stopped", { error: event.error })
          : translate("roster.voice.retry"));
        setVoiceAddListening(false);
      };
      recognition.onend = () => setVoiceAddListening(false);
      voiceAddRecognitionRef.current = recognition;
      recognition.start();
      setVoiceAddListening(true);
    } catch (error) {
      console.error(error);
      setVoiceAddStatus(translate("roster.voice.startFailed"));
      setVoiceAddListening(false);
    }
  };

  const openVoiceAddPlayer = () => {
    setAddOptionsOpen(false);
    setVoiceAddHeard("");
    setVoiceAddStatus("");
    setVoiceAddOpen(true);
    window.setTimeout(() => startVoiceAddListening(), 80);
  };

  const voiceAddCleanName = cleanVoiceAddName(voiceAddHeard);
  const voiceAddDuplicatePlayer = useMemo(() => {
    const normalizedName = normalizeVoiceAddName(voiceAddCleanName);
    if (!normalizedName) return undefined;
    if (isSharedRoster) {
      return findSharedDuplicateCandidates(players, voiceAddCleanName)[0]?.player;
    }
    return players.find((player) => {
      const names = [player.name, player.aka].filter(Boolean) as string[];
      return names.some((candidate) => normalizeVoiceAddName(candidate) === normalizedName);
    });
  }, [isSharedRoster, players, voiceAddCleanName]);
  const voiceAddCanAdd = Boolean(voiceAddCleanName && isProbablyVoiceAddName(voiceAddCleanName) && !voiceAddDuplicatePlayer);

  const sharedDuplicateCandidates = useMemo(() => (isSharedRoster ? findSharedDuplicateCandidates(players, name, aka) : []), [aka, isSharedRoster, name, players]);
  const primarySharedDuplicate = sharedDuplicateCandidates[0];

  useEffect(() => {
    setSharedDuplicateOverride(false);
    setSharedDuplicateNotice("");
  }, [name, aka]);

  const useExistingSharedDuplicate = (player: RoomPlayer) => {
    setSearch(displayName(player));
    setAddPlayerOpen(false);
    setSharedDuplicateOverride(false);
    setSharedDuplicateNotice(translate("roster.duplicates.selectedInSearch", { player: displayName(player) }));
  };

  const addVoicePlayerToRoster = () => {
    const cleanedName = voiceAddCleanName;
    if (!cleanedName || !isProbablyVoiceAddName(cleanedName)) {
      setVoiceAddStatus(translate("roster.voice.cleanNameRequired"));
      return;
    }
    if (voiceAddDuplicatePlayer) {
      setVoiceAddStatus(translate("roster.duplicates.alreadyExists", { player: displayName(voiceAddDuplicatePlayer) }));
      return;
    }

    const now = new Date().toISOString();
    const profileDetails = {
      ...createDefaultAddPlayerDetails(5),
      ...neutralProfileForOverall(5),
    };
    const newPlayer = normalizePlayer({
      id: createPlayerId(),
      roomId: 1,
      name: cleanedName,
      gender: "male",
      skill: 5,
      ...profileDetails,
      overallIndependent: true,
      profilePresetIds: [],
      profileFineTuned: false,
      isOrganizer: false,
      isNew: true,
      attending: false,
      createdAt: now,
      updatedAt: now,
    });

    setPlayers([...players, newPlayer]);
    setVoiceAddOpen(false);
    setVoiceAddHeard("");
    setVoiceAddStatus("");
  };

  useEffect(() => () => {
    voiceAddRecognitionRef.current?.abort?.();
  }, []);


  useEffect(() => {
    rosterSortModeSession = sortMode;
  }, [sortMode]);

  useEffect(() => {
    rosterSkillHiddenSession = hideOverall;
  }, [hideOverall]);

  const updatePlayer = (playerId: string, data: Partial<RoomPlayer>) => {
    setPlayers(players.map(player => player.id === playerId ? normalizePlayer({ ...player, ...data, updatedAt: data.updatedAt || new Date().toISOString() }) : player));
  };

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
    if (setPairingRules) {
      setPairingRules(pairingRules.filter((rule) => rule.playerAId !== playerId && rule.playerBId !== playerId));
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isSharedRoster && sharedDuplicateCandidates.length > 0 && !sharedDuplicateOverride) {
      setSharedDuplicateNotice(translate("roster.duplicates.reviewBeforeAdding"));
      return;
    }

    const now = new Date().toISOString();
    const profileDetails = addDetails;
    const newPlayer = normalizePlayer({
      id: createPlayerId(),
      roomId: 1,
      name: name.trim(),
      aka: aka.trim() || undefined,
      gender,
      skill: roundSkillStep(skillLevel),
      ...profileDetails,
      overallIndependent: true,
      profilePresetIds: addPresetIds,
      profileFineTuned: addProfileFineTuned,
      profilePhoto: !isSharedRoster && addAdvancedOpen ? addProfilePhoto : undefined,
      isOrganizer: isSharedRoster ? false : isOrganizer,
      isNew,
      attending: false,
      createdAt: now,
      updatedAt: now,
    });
    setPlayers([...players, newPlayer]);
    setName("");
    setAka("");
    setIsNew(true);
    setSkillLevel(5);
    setAddPresetIds([]);
    setAddProfileFineTuned(false);
    setAddPresetError("");
    setAddDetails(createDefaultAddPlayerDetails(5));
    setAddProfilePhoto(undefined);
    setAddPhotoActionsOpen(false);
    setAddAdvancedOpen(false);
    setIsOrganizer(false);
    setSharedDuplicateOverride(false);
    setSharedDuplicateNotice("");
    setAddPlayerOpen(false);
    onTutorialAction?.("player-added", newPlayer.id);
  };

  const preventKeyboardSubmit = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      event.preventDefault();
      target.blur();
    }
  };

  const effectiveSortMode = sortMode;

  const clubRatingSummaryByPlayerId = useMemo(() => new Map(clubRatingSummaries.map((summary) => [summary.playerId, summary])), [clubRatingSummaries]);
  const myClubRatingByPlayerId = useMemo(() => new Map(myClubRatings.map((rating) => [rating.playerId, rating])), [myClubRatings]);
  const reviewFlowPlayer = reviewActivePlayerId
    ? players.find((player) => player.id === reviewActivePlayerId) ?? null
    : null;
  const ratingQueueIds = useMemo(() => {
    const ordered = [...players].sort((a, b) => {
      const aNeedsRating = isSharedRoster
        ? !hasCompleteClubMyRating(myClubRatingByPlayerId.get(a.id))
        : Boolean(a.isNew);
      const bNeedsRating = isSharedRoster
        ? !hasCompleteClubMyRating(myClubRatingByPlayerId.get(b.id))
        : Boolean(b.isNew);
      if (aNeedsRating !== bNeedsRating) return aNeedsRating ? -1 : 1;
      return displayName(a).localeCompare(displayName(b));
    });
    return ordered.map((player) => player.id);
  }, [isSharedRoster, myClubRatingByPlayerId, players]);

  useEffect(() => {
    if (!reviewPlayerId || reviewPlayerId !== reviewActivePlayerId) return;
    onReviewPlayerHandled?.();
  }, [onReviewPlayerHandled, reviewActivePlayerId, reviewPlayerId]);

  const sortedPlayers = [...players].sort((a, b) => {
    if (effectiveSortMode === "alpha") {
      return displayName(a).localeCompare(displayName(b));
    }

    if (effectiveSortMode === "skill") {
      const aSummary = isSharedRoster ? clubRatingSummaryByPlayerId.get(a.id) : undefined;
      const bSummary = isSharedRoster ? clubRatingSummaryByPlayerId.get(b.id) : undefined;
      const aSkill = Number.isFinite(Number(aSummary?.averageSkill)) ? Number(aSummary?.averageSkill) : (a.skill ?? 0);
      const bSkill = Number.isFinite(Number(bSummary?.averageSkill)) ? Number(bSummary?.averageSkill) : (b.skill ?? 0);
      const skillDiff = bSkill - aSkill;
      if (skillDiff !== 0) return skillDiff;
      return displayName(a).localeCompare(displayName(b));
    }

    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
    if (bTime !== aTime) return bTime - aTime;
    return displayName(a).localeCompare(displayName(b));
  });

  const filtered = search.trim()
    ? sortedPlayers.filter(p => displayName(p).toLowerCase().includes(search.toLowerCase()))
    : sortedPlayers;

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const cleanPairingRules = useMemo(() => pairingRules.filter((rule) =>
    (rule.kind === "together" || rule.kind === "separate") &&
    playerById.has(rule.playerAId) &&
    playerById.has(rule.playerBId) &&
    rule.playerAId !== rule.playerBId,
  ), [pairingRules, playerById]);
  const togetherRules = cleanPairingRules.filter((rule) => rule.kind === "together");
  const separateRules = cleanPairingRules.filter((rule) => rule.kind === "separate");
  const pairSelectPlayers = useMemo(
    () => [...players].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [players],
  );

  const resetPairAdder = () => {
    setPairAddKind(null);
    setPairFirstId("");
    setPairSecondId("");
    setPairNotice("");
  };

  const createPairRuleId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `pair-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const pairName = (playerId: string) => {
    const player = playerById.get(playerId);
    return player ? displayName(player) : translate("roster.pairRules.missingPlayer");
  };

  const pairKey = (a: string, b: string) => [a, b].sort().join("|");

  const startAddPair = (kind: PairingRuleKind) => {
    setPairAddKind(kind);
    setPairFirstId("");
    setPairSecondId("");
    setPairNotice("");
  };

  const addPairRule = () => {
    if (!pairAddKind || !setPairingRules || !pairFirstId || !pairSecondId || pairFirstId === pairSecondId) return;
    const key = pairKey(pairFirstId, pairSecondId);
    const duplicateSame = cleanPairingRules.some((rule) => rule.kind === pairAddKind && pairKey(rule.playerAId, rule.playerBId) === key);
    const duplicateOther = cleanPairingRules.some((rule) => rule.kind !== pairAddKind && pairKey(rule.playerAId, rule.playerBId) === key);

    if (duplicateSame) {
      setPairNotice(translate("roster.pairRules.duplicateSameSection"));
      return;
    }
    if (duplicateOther) {
      setPairNotice(translate("roster.pairRules.duplicateOtherSection"));
      return;
    }

    setPairingRules([
      ...cleanPairingRules,
      {
        id: createPairRuleId(),
        kind: pairAddKind,
        playerAId: pairFirstId,
        playerBId: pairSecondId,
        createdAt: new Date().toISOString(),
      },
    ]);
    setPairFirstId("");
    setPairSecondId("");
    setPairNotice(translate("roster.pairRules.added"));
  };

  const removePairRule = (ruleId: string) => {
    if (!setPairingRules) return;
    setPairingRules(cleanPairingRules.filter((rule) => rule.id !== ruleId));
    setPairNotice("");
  };

  const renderPairSection = (kind: PairingRuleKind, title: string, empty: string, rules: PairingRule[]) => (
    <div className="rounded-2xl border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wide text-foreground">{title}</div>
          <div className="text-[10px] font-semibold text-muted-foreground">{translate("roster.pairRules.savedCount", { count: rules.length })}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => startAddPair(kind)}
          disabled={!setPairingRules || players.length < 2}
          className="h-8 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide"
          data-testid={`button-add-${kind}-pair`}
        >
          <Plus className="mr-1 h-3 w-3" /> {translate("common.add")}</Button>
      </div>
      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/70 px-3 py-2 text-[11px] font-semibold text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <div className="min-w-0 truncate text-[12px] font-black text-foreground">
                {pairName(rule.playerAId)} <span className="text-muted-foreground">+</span> {pairName(rule.playerBId)}
              </div>
              <button
                type="button"
                onClick={() => removePairRule(rule.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={translate("roster.accessibility.removeAnd", { value1: pairName(rule.playerAId), value2: pairName(rule.playerBId) })}
                data-testid={`button-remove-pair-${rule.id}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PlayerModelSettings
        open={playerModelSettingsOpen}
        onOpenChange={setPlayerModelSettingsOpen}
        model={playerModel}
        players={players}
        rosterName={rosterName}
        onSave={onPlayerModelChange}
        onResetPlayers={setPlayers}
        onSavePackToGoogleDrive={onSavePresetPackToGoogleDrive}
        sharedRoster={isSharedRoster}
      />

      <PlayerBatchRatingFlow
        player={reviewFlowPlayer}
        playerModel={playerModel}
        sharedRating={reviewFlowPlayer ? myClubRatingByPlayerId.get(reviewFlowPlayer.id) : undefined}
        index={reviewPlayerIndex}
        total={reviewPlayerTotal}
        isSharedRoster={isSharedRoster}
        sharedRosterId={sharedRosterId}
        onUpdatePlayer={updatePlayer}
        onPrevious={() => onReviewPrevious?.()}
        onNext={() => onReviewNext?.()}
        onDone={() => onReviewDone?.()}
      />

      <div className="flex flex-col gap-3 sm:gap-4">
      <div className="stripes-type-ui rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-wide text-muted-foreground sm:text-[10px]">{translate("roster.messages.players")}</div>
            <div className="text-base font-black leading-tight text-foreground sm:text-lg">
              {search ? translate("roster.messages.searchResultCount", { count: filtered.length, total: players.length }) : players.length}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlayerModelSettingsOpen(true)}
              className="h-8 rounded-xl border-slate-200 bg-white px-2.5 text-[10px] font-black uppercase tracking-wide text-slate-600 shadow-none hover:bg-slate-50 sm:h-9 sm:px-3 sm:text-[11px]"
              data-testid="button-player-model-settings"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> {translate("roster.playerModel.shortHeading")}
            </Button>
            {onStartReviewPlayers && players.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onStartReviewPlayers(ratingQueueIds)}
                className="h-8 rounded-xl border-violet-200 bg-violet-50 px-2.5 text-[10px] font-black uppercase tracking-wide text-violet-700 shadow-none hover:bg-violet-100 hover:text-violet-800 sm:h-9 sm:px-3 sm:text-[11px]"
                data-testid="button-rate-players"
              >
                <Star className="mr-1.5 h-3.5 w-3.5" /> {translate("roster.actions.ratePlayers")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAddOptionsOpen(true); onTutorialAction?.("add-options-opened"); }}
              className={`h-8 rounded-xl border-primary/20 bg-primary/5 px-2.5 text-[10px] font-black uppercase tracking-wide text-primary shadow-none hover:bg-primary/10 hover:text-primary sm:h-9 sm:px-3 sm:text-[11px] ${players.length === 0 ? "fairteams-empty-add-pulse" : ""} ${tutorialStep === "open-add" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
              data-testid="button-open-add-options"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {translate("roster.actions.addPlayer")}
            </Button>
          </div>

        <Dialog open={addOptionsOpen} onOpenChange={setAddOptionsOpen}>
          <DialogContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="stripes-type-ui max-w-[340px] rounded-3xl p-0 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <DialogTitle className="text-xl font-black tracking-tight">{translate("roster.headings.addPlayers")}</DialogTitle>
            </div>
            <div className="flex flex-col gap-2 p-4">
              {onScreenshotImport && (
                <button
                  type="button"
                  onClick={openRosterScreenshotImport}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                  data-testid="button-import-screenshot-option"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                  <span className="text-base font-black text-foreground">{translate("roster.messages.importScreenshot")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={openManualAddPlayer}
                className={`flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50 ${tutorialStep === "add-manual" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                data-testid="button-add-manually-option"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-base font-black text-foreground">{translate("roster.messages.addManually")}</span>
              </button>
              <button
                type="button"
                onClick={openVoiceAddPlayer}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                data-testid="button-add-by-voice-option"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                  <Mic className="h-5 w-5" />
                </span>
                <span className="text-base font-black text-foreground">{translate("roster.messages.addByVoice")}</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={voiceAddOpen} onOpenChange={(next) => {
          setVoiceAddOpen(next);
          if (!next) {
            stopVoiceAddListening();
          }
        }}>
          <DialogContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="stripes-type-ui max-w-sm rounded-3xl p-0 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <DialogTitle className="text-xl font-black tracking-tight">{translate("roster.headings.addByVoice")}</DialogTitle>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${voiceAddListening ? "bg-red-100 text-red-700" : "bg-muted text-primary"}`}>
                <Mic className={`h-4 w-4 ${voiceAddListening ? "animate-pulse" : ""}`} />
              </span>
            </div>
            <div className="space-y-3 p-4">
              {voiceAddListening && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-center text-[11px] font-black text-red-700">
                  {translate("roster.voice.listening")}</div>
              )}

              {!voiceAddListening && voiceAddStatus && !voiceAddHeard.trim() && (
                <div className="rounded-2xl bg-muted/40 px-3 py-2 text-center text-[11px] font-bold text-muted-foreground">
                  {voiceAddStatus}
                </div>
              )}

              <div className="rounded-2xl bg-muted/35 px-3 py-2">
                <Label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                  {translate("roster.labels.heardEditBeforeAdding")}</Label>
                <Input
                  value={voiceAddCleanName}
                  onChange={(event) => setVoiceAddHeard(event.target.value)}
                  onKeyDown={blurOnDoneKey}
                  enterKeyHint="done"
                  className="h-9 rounded-xl bg-background text-sm font-black"
                  placeholder={translate("roster.fields.typeOnePlayerName")}
                />
              </div>

              {isSharedRoster && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/85 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
                  {translate("roster.voice.sharedRosterHelp")}</div>
              )}

              {voiceAddDuplicatePlayer && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  {translate(
                    isSharedRoster
                      ? "roster.duplicates.sharedVoiceWarning"
                      : "roster.duplicates.localVoiceWarning",
                    { player: displayName(voiceAddDuplicatePlayer) },
                  )}
                </div>
              )}

              {voiceAddCleanName && !isProbablyVoiceAddName(voiceAddCleanName) && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                  {translate("roster.voice.cleanNameRequired")}</div>
              )}

              <Button
                type="button"
                onClick={addVoicePlayerToRoster}
                disabled={!voiceAddCanAdd}
                className="h-10 w-full rounded-xl font-black uppercase tracking-wide"
                data-testid="button-confirm-voice-add-player"
              >
                {isSharedRoster
                  ? translate("roster.actions.addToSharedRoster")
                  : voiceAddCleanName
                    ? translate("roster.actions.addNamedPlayer", { player: voiceAddCleanName })
                    : translate("roster.actions.addPlayer")}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={startVoiceAddListening}
                disabled={voiceAddListening}
                className="h-9 w-full rounded-xl text-xs font-black"
              >
                <Mic className="mr-1.5 h-3.5 w-3.5" />
                {translate("roster.actions.tryAgain")}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addPlayerOpen} onOpenChange={(next) => {
          setAddPlayerOpen(next);
          if (next) {
            resetAddPlayerForm();
          }
        }}>
          <DialogContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            className={`stripes-type-ui max-w-sm md:max-w-xl rounded-3xl !translate-y-0 overflow-y-auto sm:!top-[50%] sm:!-translate-y-1/2 ${tutorialStep === "submit-player" ? "!top-[18dvh] max-h-[76dvh]" : "!top-[10dvh] max-h-[82dvh]"}`}
          >
            <DialogHeader>
              <DialogTitle>{isSharedRoster ? translate("roster.headings.addSharedPlayer") : translate("roster.headings.addPlayer")}</DialogTitle>
              {isSharedRoster && (
                <div className="text-xs font-semibold leading-snug text-muted-foreground">
                  {translate("roster.sharedRoster.identityFirstHelp")}</div>
              )}
            </DialogHeader>
            <form onSubmit={handleAdd} onKeyDown={preventKeyboardSubmit} className="flex flex-col gap-3.5 pt-1">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.playerName")}</Label>
                  <Input
                    id="name"
                    placeholder={translate("roster.fields.playerNameExample")}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={blurOnDoneKey}
                    className="h-11 text-sm font-semibold"
                    data-testid="input-player-name"
                    enterKeyHint="done"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[1.15fr_0.85fr] gap-2">
                <Select value={gender} onValueChange={v => setGender(v as Gender)}>
                  <SelectTrigger className="h-10 rounded-xl border-border bg-muted/30 text-xs font-bold px-2" id="gender" data-testid="select-gender">
                    <SelectValue placeholder={translate("roster.fields.gender")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{translate("roster.messages.male")}</SelectItem>
                    <SelectItem value="female">{translate("roster.messages.female")}</SelectItem>
                    <SelectItem value="other">{translate("roster.messages.other")}</SelectItem>
                  </SelectContent>
                </Select>
                <TogglePill
                  active={isNew}
                  onClick={() => {
                    setIsNew(prev => {
                      const next = !prev;
                      if (next) {
                        setSkillLevel(5);
                        setAddPresetIds([]);
                        setAddProfileFineTuned(false);
                        setAddPresetError("");
                        setAddDetails(createDefaultAddPlayerDetails(5));
                      }
                      return next;
                    });
                  }}
                  testId="checkbox-new-player"
                  activeClassName="border-sky-300 bg-sky-100 text-sky-800 shadow-sm"
                >
                  {translate("roster.labels.newPlayer")}</TogglePill>
              </div>

              {isSharedRoster && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/85 p-3 space-y-3">
                  <div>
                    <Label className="text-[11px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.sharedPlayerInfo")}</Label>
                    <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-700/75">
                      {translate("roster.sharedRoster.addPlayerHelp")}</div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="aka" className="text-[10px] uppercase font-bold text-violet-700/80 tracking-wider">{translate("roster.labels.akaNickname")}</Label>
                    <Input
                      id="aka"
                      placeholder={translate("roster.fields.nicknameOrAlternateSpelling")}
                      value={aka}
                      onChange={e => setAka(e.target.value)}
                      onKeyDown={blurOnDoneKey}
                      className="h-10 border-violet-100 bg-white text-sm font-semibold"
                      enterKeyHint="done"
                      data-testid="input-player-aka"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-violet-700/80 tracking-wider">{translate("roster.labels.playerVibe")}</Label>
                    <VibePicker value={addDetails.funBadge} onChange={funBadge => updateAddDetails({ funBadge })} />
                  </div>
                  <div className="rounded-2xl border border-violet-100 bg-white/85 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-[11px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.initialSkill")}</Label>
                        <div className="mt-0.5 text-[10px] font-semibold text-violet-700/75">{translate("roster.playerProfile.firstSharedProfileHelp")}</div>
                      </div>
                      <div className="rounded-xl bg-violet-700 px-3 py-1.5 text-center text-white shadow-sm">
                        <div className="text-[8px] uppercase font-black opacity-75 leading-none">{translate("roster.labels.skill")}</div>
                        <div className="text-xl font-black leading-none">{addOverall}</div>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.5}
                      value={skillLevel}
                      onPointerDown={dismissActiveInput}
                      onTouchStart={dismissActiveInput}
                      onChange={e => changeAddOverall(Number(e.target.value))}
                      className="fairteams-slider w-full"
                      style={{ "--slider-fill": `${((skillLevel - 1) / 9) * 100}%` } as React.CSSProperties}
                    />
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[10px] uppercase font-black tracking-wide text-violet-700">{translate("roster.labels.whatStandsOut")}</Label>
                        <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-700/75">{translate("roster.playerPresets.help")}</div>
                      </div>
                      <RosterPlayerPresetPicker
                        model={safeRosterPlayerModel}
                        selectedIds={addPresetIds}
                        onToggle={toggleAddPreset}
                      />
                      {addPresetError ? <div className="text-[10px] font-bold text-rose-600">{addPresetError}</div> : null}
                    </div>
                  </div>
                </div>
              )}

              {isSharedRoster && sharedDuplicateCandidates.length > 0 && !sharedDuplicateOverride && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">{translate("roster.messages.possibleDuplicate")}</div>
                  <div className="mt-1 text-xs font-semibold leading-snug text-amber-900">
                    {translate("roster.duplicates.possibleMatchHelp")}</div>
                  <div className="mt-2 space-y-1.5">
                    {sharedDuplicateCandidates.map(match => (
                      <div key={match.player.id} className="rounded-xl border border-amber-200 bg-white/80 px-2.5 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900">{displayName(match.player)}</div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                              {translate(match.reason === "exact" ? "roster.duplicates.exactMatch" : "roster.duplicates.similarMatch")}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 rounded-xl border-amber-200 bg-white text-[10px] font-black text-amber-900"
                            onClick={() => useExistingSharedDuplicate(match.player)}
                          >
                            {translate("roster.actions.useExisting")}</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {sharedDuplicateNotice ? <div className="mt-2 text-[10px] font-bold text-amber-700">{sharedDuplicateNotice}</div> : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-8 w-full rounded-xl text-[11px] font-black text-amber-900 hover:bg-amber-100"
                    onClick={() => {
                      setSharedDuplicateOverride(true);
                      setSharedDuplicateNotice(translate("roster.duplicates.confirmSeparatePlayer"));
                    }}
                  >
                    {translate("roster.actions.addAsSeparatePlayerAnyway")}</Button>
                </div>
              )}

              {isSharedRoster && sharedDuplicateOverride && primarySharedDuplicate && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
                  {translate("roster.messages.addingSeparateSharedPlayer", {
                    player: displayName(primarySharedDuplicate.player),
                  })}
                </div>
              )}

              {!isSharedRoster && (
                <>
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-[11px] uppercase font-black tracking-wide text-primary">{translate("roster.labels.skillLevel")}</Label>
                    <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{translate("roster.playerSetup.skillRangeHelp")}</div>
                  </div>
                  <div className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-center shadow-sm">
                    <div className="text-[8px] uppercase font-black opacity-75 leading-none">{translate("roster.labels.skill")}</div>
                    <div className="text-xl font-black leading-none">{formatSkillStep(skillLevel)}</div>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={skillLevel}
                  onPointerDown={dismissActiveInput}
                  onTouchStart={dismissActiveInput}
                  onChange={e => changeAddOverall(Number(e.target.value))}
                  className="fairteams-slider w-full"
                  style={{ "--slider-fill": `${((skillLevel - 1) / 9) * 100}%` } as React.CSSProperties}
                  data-testid="input-player-skill-level"
                />
                <div className="rounded-xl border border-primary/10 bg-background/70 px-3 py-2 text-[11px] font-semibold leading-snug text-muted-foreground">
                  {addSkillExplanation}
                </div>
                <div className="space-y-2 rounded-2xl border border-primary/10 bg-background/70 px-3 py-2">
                  <div>
                    <Label className="text-[10px] uppercase font-black tracking-wide text-primary">{translate("roster.labels.whatStandsOut")}</Label>
                    <div className="mt-0.5 text-[10px] font-semibold leading-snug text-muted-foreground">{translate("roster.playerPresets.help")}</div>
                  </div>
                  <RosterPlayerPresetPicker
                    model={safeRosterPlayerModel}
                    selectedIds={addPresetIds}
                    onToggle={toggleAddPreset}
                  />
                  {addPresetError ? <div className="text-[10px] font-bold text-rose-600">{addPresetError}</div> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/25 p-2.5 text-[11px] font-semibold text-muted-foreground leading-snug">
                {isNew ? (
                  <span>{translate("roster.playerSetup.newPlayerHelp")}</span>
                ) : (
                  <span>{translate("roster.playerSetup.knownPlayerHelp")}</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAddAdvancedOpen(prev => !prev)}
                className="flex h-10 items-center justify-between rounded-2xl border border-border bg-background px-3 text-left text-xs font-black tracking-wide text-foreground"
                data-testid="button-toggle-add-advanced"
              >
                <span>{translate("roster.messages.advancedEdit")}</span>
                <span className="text-muted-foreground">{addAdvancedOpen ? "▲" : "▼"}</span>
              </button>

              {addAdvancedOpen && (
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="relative shrink-0 pt-5">
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAddPhotoActionsOpen(prev => !prev); }}
                        className="h-16 w-16 overflow-hidden rounded-full border border-primary/20 bg-background text-base font-black text-primary shadow-sm ring-4 ring-primary/10 flex items-center justify-center transition-transform active:scale-95"
                        title={translate("roster.accessibility.changePhoto")}
                      >
                        {addProfilePhoto ? <img src={addProfilePhoto} alt="" className="h-full w-full object-cover" /> : (name.trim() ? initials(name.trim()) : <Camera className="h-5 w-5" />)}
                      </button>
                      {addPhotoActionsOpen && (
                        <div className="absolute left-0 top-full z-20 mt-2 w-36 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold hover:bg-accent" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAddPhotoActionsOpen(false); addPhotoCameraInput.current?.click(); }}>
                            <Camera className="h-3.5 w-3.5" /> {translate("roster.actions.takePhoto")}</button>
                          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold hover:bg-accent" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAddPhotoActionsOpen(false); addPhotoGalleryInput.current?.click(); }}>
                            <ImageIcon className="h-3.5 w-3.5" /> {translate("roster.actions.importPhoto")}</button>
                          {addProfilePhoto && (
                            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold text-muted-foreground hover:bg-accent" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAddPhotoActionsOpen(false); setAddProfilePhoto(undefined); }}>
                              <Trash2 className="h-3.5 w-3.5" /> {translate("roster.actions.clearPhoto")}</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="grid min-w-0 flex-[1_1_8rem] grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="add-name-advanced" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.name")}</Label>
                        <Input
                          id="add-name-advanced"
                          placeholder={translate("roster.fields.playerName")}
                          value={name}
                          onChange={e => setName(e.target.value)}
                          onKeyDown={blurOnDoneKey}
                          className="h-10 text-sm font-semibold"
                          enterKeyHint="done"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="aka" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.aka")}</Label>
                        <Input
                          id="aka"
                          placeholder={translate("roster.fields.nickname")}
                          value={aka}
                          onChange={e => setAka(e.target.value)}
                          onKeyDown={blurOnDoneKey}
                          className="h-10 text-sm font-semibold"
                          enterKeyHint="done"
                          data-testid="input-player-aka"
                        />
                      </div>
                    </div>
                  </div>

                  <input
                    ref={addPhotoCameraInput}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="sr-only"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try { setAddProfilePhoto(await fileToSmallDataUrl(file)); }
                      catch { alert(translate("roster.errors.photoLoadFailed")); }
                    }}
                  />
                  <input
                    ref={addPhotoGalleryInput}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try { setAddProfilePhoto(await fileToSmallDataUrl(file)); }
                      catch { alert(translate("roster.errors.photoLoadFailed")); }
                    }}
                  />


                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{translate("roster.labels.playerVibe")}</Label>
                      <VibePicker value={addDetails.funBadge} onChange={funBadge => updateAddDetails({ funBadge })} />
                    </div>
                    <TogglePill
                      active={isOrganizer}
                      onClick={() => setIsOrganizer(!isOrganizer)}
                      testId="checkbox-organizer"
                      activeClassName="border-violet-200 bg-violet-100 text-violet-800 shadow-sm"
                    >
                      {translate("roster.labels.organizerAbbreviation")}</TogglePill>
                  </div>

                  <div className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2 flex items-center justify-between">
                    <div>
                      <Label className="text-[10px] uppercase font-black tracking-wide text-primary">{translate("roster.labels.skillLevel")}</Label>
                      <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{translate("roster.playerSetup.advancedSkillHelp")}</div>
                    </div>
                    <div className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-center shadow-sm">
                      <div className="text-[8px] uppercase font-black opacity-75 leading-none">{translate("roster.labels.skill")}</div>
                      <div className="text-xl font-black leading-none">{addOverall}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {normalizeRosterPlayerModel(playerModel).attributes.map((attribute) => (
                      <StatControl key={attribute.id} label={attribute.label} value={addDetails[attribute.slot]} onChange={value => { updateAddDetails({ [attribute.slot]: value } as Partial<AddPlayerDetails>); setAddProfileFineTuned(true); }} />
                    ))}
                  </div>

                  <TogglePill
                    active={Boolean(addDetails.isGoalkeeper)}
                    onClick={() => updateAddDetails({ isGoalkeeper: !addDetails.isGoalkeeper })}
                    activeClassName="border-amber-300 bg-amber-100 text-amber-900 shadow-sm"
                  >
                    <Shield className="mr-1.5 h-3.5 w-3.5" />
                    {translate("roster.abilities.goalkeeper.label")}
                  </TogglePill>
                </div>
              )}
                </>
              )}

              <Button
                type="submit"
                className={`h-10 rounded-xl font-black uppercase tracking-wide ${tutorialStep === "submit-player" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                data-testid="button-add-player"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> {isSharedRoster ? translate("roster.actions.addForEveryone") : translate("roster.actions.addPlayer")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSortMode(prev => prev === "recent" ? "alpha" : prev === "alpha" ? "skill" : "recent")}
            className="h-8 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide shadow-none border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
            title={effectiveSortMode === "recent" ? translate("roster.accessibility.sortRecent") : effectiveSortMode === "alpha" ? translate("roster.accessibility.sortAlpha") : translate("roster.accessibility.sortSkill")}
            data-testid="button-toggle-roster-sort"
          >
            {effectiveSortMode === "recent" ? <Clock3 className="mr-1 h-3 w-3" /> : effectiveSortMode === "alpha" ? <ArrowDownAZ className="mr-1 h-3 w-3" /> : <Star className="mr-1 h-3 w-3" />}
            {effectiveSortMode === "recent" ? translate("roster.actions.lastEdited") : effectiveSortMode === "alpha" ? translate("roster.actions.aZ") : translate("roster.actions.skill")}
          </Button>
          {isSharedRoster && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setClubRatingLegendOpen(true)}
              className="h-8 w-8 rounded-xl border-border bg-muted/20 text-muted-foreground shadow-none hover:bg-muted/40 hover:text-foreground"
              title={translate("roster.accessibility.clubRatingStatus")}
              aria-label={translate("roster.accessibility.clubRatingStatusLegend")}
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isSharedRoster && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHideOverall(prev => !prev)}
              className={`h-8 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide shadow-none ${hideOverall ? "border-border bg-muted/35 text-muted-foreground" : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"}`}
              title={hideOverall ? translate("roster.accessibility.showRosterSkill") : translate("roster.accessibility.hideRosterSkill")}
              data-testid="button-toggle-roster-ovr"
            >
              {hideOverall ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
              {translate("roster.actions.toggleSkillVisibility")}</Button>
          )}
        </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPairingRulesOpen(true)}
            disabled={!setPairingRules || players.length < 2}
            className="h-8 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide shadow-none border-border bg-muted/25 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
            title={translate("roster.accessibility.openPairingRules")}
            data-testid="button-open-pairing-rules"
          >
            {translate("roster.actions.pairingRules")}{cleanPairingRules.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">{formatNumber(getResolvedUiLocale(), cleanPairingRules.length)}</span>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={pairingRulesOpen} onOpenChange={(next) => {
        setPairingRulesOpen(next);
        if (!next) resetPairAdder();
      }}>
        <DialogContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="stripes-type-ui max-w-[380px] rounded-3xl p-0 overflow-hidden"
        >
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <DialogTitle className="text-xl font-black tracking-tight">{translate("roster.headings.pairingRules")}</DialogTitle>
            <p className="text-[11px] font-semibold text-muted-foreground">
              {translate("roster.pairRules.intro")}</p>
          </DialogHeader>

          <div className="max-h-[72dvh] space-y-3 overflow-y-auto p-4">
            {renderPairSection(
              "together",
              translate("roster.pairRules.keepTogether"),
              translate("roster.pairRules.keepTogetherEmpty"),
              togetherRules,
            )}
            {renderPairSection(
              "separate",
              translate("roster.pairRules.keepSeparate"),
              translate("roster.pairRules.keepSeparateEmpty"),
              separateRules,
            )}

            {pairAddKind && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wide text-primary">
                      {translate("roster.pairRules.addKind", {
                        kind: pairAddKind === "together"
                          ? translate("roster.pairRules.keepTogether")
                          : translate("roster.pairRules.keepSeparate"),
                      })}</div>
                    <div className="text-[10px] font-semibold text-muted-foreground">{translate("roster.pairRules.addHelp")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={resetPairAdder}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-background"
                    aria-label={translate("roster.accessibility.cancelAddingPair")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{translate("roster.labels.firstPlayer")}</Label>
                    <Select
                      value={pairFirstId || undefined}
                      onValueChange={(value) => {
                        setPairFirstId(value);
                        if (pairSecondId === value) setPairSecondId("");
                        setPairNotice("");
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-background text-sm font-bold" data-testid="select-pair-first-player">
                        <SelectValue placeholder={translate("roster.fields.choosePlayer")} />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {pairSelectPlayers.map((player) => (
                          <SelectItem key={player.id} value={player.id} data-testid={`select-pair-first-${player.id}`}>
                            {displayName(player)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{translate("roster.labels.secondPlayer")}</Label>
                    <Select
                      value={pairSecondId || undefined}
                      onValueChange={(value) => {
                        setPairSecondId(value);
                        setPairNotice("");
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-background text-sm font-bold" data-testid="select-pair-second-player">
                        <SelectValue placeholder={pairFirstId ? translate("roster.fields.choosePlayer") : translate("roster.fields.chooseFirstPlayerFirst")} />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {pairSelectPlayers.filter((player) => player.id !== pairFirstId).map((player) => (
                          <SelectItem key={player.id} value={player.id} data-testid={`select-pair-second-${player.id}`}>
                            {displayName(player)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {pairNotice && (
                  <div className="mt-2 rounded-xl bg-background px-3 py-2 text-[11px] font-bold text-muted-foreground">{pairNotice}</div>
                )}

                <Button
                  type="button"
                  className="mt-3 h-10 w-full rounded-xl font-black uppercase tracking-wide"
                  onClick={addPairRule}
                  disabled={!pairFirstId || !pairSecondId}
                  data-testid="button-confirm-add-pair"
                >
                  {translate("roster.actions.addPair")}</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clubRatingLegendOpen} onOpenChange={setClubRatingLegendOpen}>
        <DialogContent className="stripes-type-ui max-w-xs rounded-3xl p-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">{translate("roster.headings.clubRatingStatus")}</DialogTitle>
            <p className="text-[11px] font-semibold leading-snug text-muted-foreground">
              {translate("roster.ratingCoverage.help")}</p>
          </DialogHeader>
          <div className="mt-2 grid gap-2">
            {(["none", "needs", "ready", "complete"] as ClubRatingCoverageState[]).map((state) => (
              <div key={state} className="flex items-center gap-2 rounded-2xl bg-muted/30 px-3 py-2 text-xs font-bold text-[#102A43]">
                <span className={`h-2.5 w-2.5 rounded-full ring-4 ${clubRatingDotClass(state)}`} />
                <span>{clubRatingStatusLabel(state)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2.5 sm:space-y-3">
        {players.length > 0 && (
          <div className="stripes-sticky-search sticky top-0 z-20 -mx-1 flex items-center gap-2 bg-background/94 px-1 py-1.5 backdrop-blur sm:py-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={translate("roster.fields.searchRoster")}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-9 pr-9 text-xs sm:h-10 sm:text-sm lg:h-11 lg:pl-10 lg:text-[15px]"
                data-testid="input-search"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAddOptionsOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#102A43] shadow-sm transition hover:bg-slate-50 active:scale-[0.96] sm:h-10 sm:w-10 lg:h-11 lg:w-11"
              title={translate("roster.accessibility.addPlayer")}
              aria-label={translate("roster.accessibility.addPlayer")}
              data-testid="button-sticky-add-player"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        {players.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/50 p-5 text-center">
            <p className="text-foreground font-black text-sm">{translate("roster.messages.createYourRoster")}</p>
            <p className="mx-auto max-w-sm text-muted-foreground font-medium text-xs leading-relaxed">
              <Trans
                i18nKey="roster.messages.emptySetupHelp"
                components={{ playerAction: <span className="font-black text-primary" /> }}
              />
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 bg-muted/50 rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium text-sm">{translate("roster.messages.noPlayersMatch", { search })}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            {filtered.map(player => {
              const isFlipped = Boolean(flippedPlayerIds[player.id]);
              const clubRatingStatus = isSharedRoster
                ? clubRatingCoverageStatus(clubRatingSummaryByPlayerId.get(player.id), sharedOrganizerCount)
                : null;
              return (
                <div
                  key={player.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setFlippedPlayerIds(prev => ({ ...prev, [player.id]: !prev[player.id] })); if (tutorialStep === "flip-card" && player.name === "Heung-min") onTutorialAction?.("card-flipped", player.id); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFlippedPlayerIds(prev => ({ ...prev, [player.id]: !prev[player.id] }));
                    }
                  }}
                  className={`w-full md:w-[calc(50%-0.25rem)] xl:w-[calc(33.333%-0.34rem)] 2xl:w-[calc(25%-0.375rem)] p-2 bg-card border border-border/80 rounded-xl shadow-[0_1px_4px_rgba(15,23,42,0.055)] active:scale-[0.99] transition-transform cursor-pointer sm:p-2.5 lg:p-3 ${tutorialStep === "flip-card" && player.name === "Heung-min" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                  data-testid={`player-row-${player.id}`}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <PlayerAvatar player={player} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[13px] font-semibold leading-tight text-[#102A43] sm:text-[14px] lg:text-[15px]">{displayName(player)}</div>
                      <PlayerTags player={player} playerModel={playerModel} includeVibe includeAbilityCount={!isFlipped} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {!isSharedRoster && !hideOverall ? <OverallBadge player={player} /> : null}
                      {clubRatingStatus ? (
                        <button
                          type="button"
                          onClick={() => setClubRatingLegendOpen(true)}
                          className="flex h-6 w-4 items-center justify-center"
                          title={translate("roster.accessibility.organizersRated", { value1: clubRatingStatusLabel(clubRatingStatus.state), ratingCount: clubRatingStatus.ratingCount, total: clubRatingStatus.total })}
                          aria-label={translate("roster.accessibility.ofOrganizersRated", { value1: clubRatingStatusLabel(clubRatingStatus.state), ratingCount: clubRatingStatus.ratingCount, total: clubRatingStatus.total })}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ring-4 ${clubRatingDotClass(clubRatingStatus.state)}`} />
                        </button>
                      ) : null}
                      <ProfileDialog
                        player={player}
                        playerModel={playerModel}
                        onUpdate={(data) => updatePlayer(player.id, data)}
                        autoOpen={autoEditPlayerId === player.id}
                        onAutoOpenHandled={() => {
                          if (autoEditPlayerId === player.id) setAutoEditPlayerId(null);
                        }}
                        isSharedRoster={isSharedRoster}
                        sharedRosterId={sharedRosterId}
                        clubMyRating={myClubRatingByPlayerId.get(player.id)}
                        tutorialHighlightEdit={tutorialStep === "open-edit" && player.name === "Heung-min"}
                        tutorialHighlightAdvanced={tutorialStep === "advanced-edit" && player.name === "Heung-min"}
                        tutorialHighlightSave={tutorialStep === "save-edit" && player.name === "Heung-min"}
                        onTutorialOpened={() => onTutorialAction?.("edit-opened", player.id)}
                        onTutorialAdvancedOpened={() => onTutorialAction?.("advanced-opened", player.id)}
                        onTutorialSaved={() => onTutorialAction?.("edit-saved", player.id)}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={isSharedRoster ? translate("roster.accessibility.removeFromSharedRoster") : translate("roster.accessibility.removePlayer")}
                            className="text-muted-foreground hover:text-destructive w-6 h-6 rounded-full"
                            data-testid={`button-remove-${player.id}`}
                          >
                            <UserMinus className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <StripesConfirmContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{isSharedRoster ? translate("roster.headings.removeFromSharedRoster") : translate("roster.headings.removePlayer")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {isSharedRoster
                                ? translate("roster.confirmations.removeSharedPlayer", { player: displayName(player) })
                                : translate("roster.confirmations.removeLocalPlayer", { player: displayName(player) })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{translate("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removePlayer(player.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              {isSharedRoster ? translate("roster.actions.removeForEveryone") : translate("common.remove")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </StripesConfirmContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {isFlipped ? <PlayerCardBack player={player} playerModel={playerModel} clubRatingSummary={clubRatingSummaryByPlayerId.get(player.id)} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
