import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Minus, Plus, Shield, SlidersHorizontal, X } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { PlayerPresetEdgePicker } from "@/components/PlayerPresetPicker";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { StripesConfirmContent, StripesWorkspaceContent } from "@/components/ui/stripes-modal";
import { formatNumber, getResolvedUiLocale, translate } from "@/i18n";
import { playerStyleTranslationKeys } from "@/i18n/playerStyle";
import {
  saveMyClubPlayerRating,
  type ClubMyRating,
  type ClubRatingProfile,
} from "@/lib/clubCollaborationService";
import { calculateOverall, normalizePlayer, type RoomPlayer } from "@/lib/localRoster";
import {
  BALANCED_PLAYER_STYLE,
  generateStyledPlayerAttributes,
  inferPlayerStyleMatch,
  type PlayerStyleStatKey,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";

const STAT_FIELDS: { key: PlayerStyleStatKey; labelKey: Parameters<typeof translate>[0] }[] = [
  { key: "attack", labelKey: "roster.stats.attack" },
  { key: "defense", labelKey: "roster.stats.defense" },
  { key: "speed", labelKey: "roster.stats.speed" },
  { key: "passing", labelKey: "roster.stats.passing" },
  { key: "stamina", labelKey: "roster.stats.stamina" },
  { key: "physical", labelKey: "roster.stats.strength" },
];

type RatingSnapshot = {
  draft: RoomPlayer;
  preset: PlayerStyleValue | null;
  fineTuned: boolean;
};

type PendingPreset = {
  value: PlayerStyleValue;
  autoAdvance: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundSkill(value: number) {
  return clamp(Math.round(value * 2) / 2, 1, 10);
}

function formatSkill(value: number) {
  return formatNumber(getResolvedUiLocale(), roundSkill(value), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function displayName(player: Pick<RoomPlayer, "name" | "aka">) {
  return player.aka?.trim() ? `${player.name} (${player.aka.trim()})` : player.name;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function hasCompleteSharedRating(rating?: ClubMyRating | null) {
  return Boolean(
    rating
      && !rating.skipped
      && typeof rating.skill === "number"
      && [rating.attack, rating.defense, rating.speed, rating.passing, rating.stamina, rating.physical]
        .every((value) => typeof value === "number"),
  );
}

function draftFromPlayer(player: RoomPlayer, sharedRating?: ClubMyRating | null) {
  const base = normalizePlayer(player);
  if (!hasCompleteSharedRating(sharedRating)) return base;
  return normalizePlayer({
    ...base,
    skill: Number(sharedRating?.skill),
    attack: Number(sharedRating?.attack),
    defense: Number(sharedRating?.defense),
    speed: Number(sharedRating?.speed),
    passing: Number(sharedRating?.passing),
    stamina: Number(sharedRating?.stamina),
    physical: Number(sharedRating?.physical),
    teamPlay: 2,
    isGoalkeeper: Boolean(sharedRating?.isGoalkeeper),
  });
}

function looksFlat(player: RoomPlayer) {
  const values = [player.attack, player.defense, player.speed, player.passing, player.stamina, player.physical];
  return Math.max(...values) - Math.min(...values) <= 0.5;
}

function initialSnapshot(player: RoomPlayer, sharedRating?: ClubMyRating | null): RatingSnapshot {
  const draft = draftFromPlayer(player, sharedRating);
  const flat = looksFlat(draft);
  const match = inferPlayerStyleMatch({ ...draft, skill: calculateOverall(draft) });
  const explicitPreset = typeof sharedRating?.playerStyle === "number"
    ? sharedRating.playerStyle
    : null;
  return {
    draft,
    preset: flat ? null : explicitPreset ?? (match.isPresetLike ? match.style : null),
    fineTuned: !flat && !match.isPresetLike,
  };
}

function attributesAtOverall(player: RoomPlayer, targetOverall: number, preset: PlayerStyleValue | null) {
  const target = roundSkill(targetOverall);
  const seed = preset === null
    ? { attack: target, defense: target, speed: target, passing: target, stamina: target, physical: target, teamPlay: player.teamPlay || 2 }
    : generateStyledPlayerAttributes(target, preset);
  const next = normalizePlayer({ ...player, ...seed });
  return { next, target };
}

function sharedOverall(player: RoomPlayer) {
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

function shiftDetailedProfileToOverall(
  player: RoomPlayer,
  targetOverall: number,
  isSharedRoster: boolean,
) {
  const target = roundSkill(targetOverall);
  const next = normalizePlayer(player);
  const overallFor = (candidate: RoomPlayer) => isSharedRoster
    ? sharedOverall(candidate)
    : calculateOverall(candidate);

  // Preserve the organizer's manually shaped profile while moving the whole
  // profile toward the newly selected OVR. This keeps relative differences
  // intact until a 1/10 boundary makes that impossible.
  for (let index = 0; index < 12; index += 1) {
    const difference = target - overallFor(next);
    if (Math.abs(difference) < 0.05) break;
    for (const { key } of STAT_FIELDS) {
      next[key] = roundSkill(clamp(next[key] + difference, 1, 10));
    }
  }

  return normalizePlayer(next);
}

function RadarPreview({ player }: { player: RoomPlayer }) {
  const data = STAT_FIELDS.map(({ key, labelKey }) => ({
    stat: translate(labelKey),
    value: player[key],
  }));
  return (
    <div className="h-48 w-full rounded-3xl border border-slate-100 bg-white/90 p-1 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#dbe5ef" />
          <PolarAngleAxis dataKey="stat" tick={{ fill: "#52677c", fontSize: 10, fontWeight: 800 }} />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.2} strokeWidth={2.5} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-sm font-black tabular-nums text-[#102A43]">{formatSkill(value)}</span>
      </span>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={value}
        onChange={(event) => onChange(roundSkill(Number(event.target.value)))}
        className="fairteams-slider w-full"
      />
    </label>
  );
}

export function PlayerBatchRatingFlow({
  player,
  sharedRating,
  index,
  total,
  isSharedRoster,
  sharedRosterId,
  onUpdatePlayer,
  onPrevious,
  onNext,
  onDone,
}: {
  player: RoomPlayer | null;
  sharedRating?: ClubMyRating;
  index: number;
  total: number;
  isSharedRoster: boolean;
  sharedRosterId?: string;
  onUpdatePlayer: (playerId: string, data: Partial<RoomPlayer>) => void;
  onPrevious: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<RoomPlayer | null>(null);
  const [preset, setPreset] = useState<PlayerStyleValue | null>(null);
  const [fineTuned, setFineTuned] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [presetOpenToken, setPresetOpenToken] = useState(0);
  const [pendingPreset, setPendingPreset] = useState<PendingPreset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<"next" | "previous" | null>(null);
  const [edgePullProgress, setEdgePullProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const cacheRef = useRef(new Map<string, RatingSnapshot>());
  const transitionTimerRef = useRef<number | null>(null);

  const isOpen = Boolean(player && total > 0);
  const isLast = total > 0 && index >= total - 1;
  const canGoBack = index > 0;
  const currentOverall = draft
    ? roundSkill(isSharedRoster ? sharedOverall(draft) : calculateOverall(draft))
    : 5;
  const presetCopy = useMemo(() => {
    if (fineTuned) {
      return {
        label: translate("roster.labels.customProfile"),
        description: translate("roster.messages.customProfileDescription"),
      };
    }
    if (preset === null) return null;
    const keys = playerStyleTranslationKeys(preset);
    return { label: translate(keys.labelKey), description: translate(keys.descriptionKey) };
  }, [fineTuned, preset]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  useEffect(() => {
    if (!player) {
      setDraft(null);
      return;
    }
    const cached = cacheRef.current.get(player.id);
    const snapshot = cached ?? initialSnapshot(player, sharedRating);
    setDraft(normalizePlayer(snapshot.draft));
    setPreset(snapshot.preset);
    setFineTuned(snapshot.fineTuned);
    setAdvancedOpen(false);
    setPendingPreset(null);
    setSaving(false);
    setError("");
    setLeaving(null);
    setEdgePullProgress(0);
  }, [player?.id, sharedRating?.updatedAt]);

  useEffect(() => {
    if (!player || !draft) return;
    cacheRef.current.set(player.id, { draft, preset, fineTuned });
  }, [draft, fineTuned, player, preset]);

  useEffect(() => {
    if (!isOpen) return;
    const handleNativeBack = (event: Event) => {
      event.preventDefault();
      if (advancedOpen) {
        setAdvancedOpen(false);
        return;
      }
      if (canGoBack) {
        void moveCard("previous", onPrevious);
        return;
      }
      onDone();
    };
    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () => window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [advancedOpen, canGoBack, isOpen, onDone, onPrevious]);

  const vibrate = (duration = 8) => {
    if (reducedMotion) return;
    try {
      navigator.vibrate?.(duration);
    } catch {
      // Optional haptics only.
    }
  };

  const moveCard = async (direction: "next" | "previous", callback: () => void) => {
    setLeaving(direction);
    const delay = reducedMotion ? 0 : 210;
    await new Promise<void>((resolve) => {
      transitionTimerRef.current = window.setTimeout(resolve, delay);
    });
    setLeaving(null);
    callback();
  };

  const persist = async (
    sourceDraft: RoomPlayer,
    sourcePreset: PlayerStyleValue | null,
    sourceFineTuned: boolean,
  ) => {
    if (!player) return false;
    setSaving(true);
    setError("");
    try {
      const savedAt = new Date().toISOString();
      let savedDraft = normalizePlayer({ ...sourceDraft, isNew: false, updatedAt: savedAt });

      if (isSharedRoster) {
        if (!sharedRosterId) {
          setError(translate("roster.errors.sharedRosterConnecting"));
          return false;
        }
        const profile: ClubRatingProfile = {
          skill: roundSkill(sharedOverall(sourceDraft)),
          attack: sourceDraft.attack,
          defense: sourceDraft.defense,
          speed: sourceDraft.speed,
          passing: sourceDraft.passing,
          stamina: sourceDraft.stamina,
          physical: sourceDraft.physical,
          teamPlay: 2,
          playerStyle: sourcePreset ?? BALANCED_PLAYER_STYLE,
          isGoalkeeper: Boolean(sourceDraft.isGoalkeeper),
        };
        await saveMyClubPlayerRating(sharedRosterId, player.id, profile);
        onUpdatePlayer(player.id, { isNew: false, updatedAt: savedAt });
      } else {
        const skill = roundSkill(calculateOverall(sourceDraft));
        savedDraft = normalizePlayer({ ...savedDraft, skill });
        onUpdatePlayer(player.id, savedDraft);
      }

      setDraft(savedDraft);
      cacheRef.current.set(player.id, {
        draft: savedDraft,
        preset: sourcePreset,
        fineTuned: sourceFineTuned,
      });
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : translate("roster.errors.sharedProfileSaveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndAdvance = async (
    sourceDraft = draft,
    sourcePreset = preset,
    sourceFineTuned = fineTuned,
  ) => {
    if (!sourceDraft || saving) return;
    const saved = await persist(sourceDraft, sourcePreset, sourceFineTuned);
    if (!saved) return;
    vibrate(10);
    await moveCard("next", isLast ? onDone : onNext);
  };

  const applyPreset = async (nextPreset: PlayerStyleValue, autoAdvance: boolean) => {
    if (!draft || saving) return;
    const { next } = attributesAtOverall(draft, currentOverall, nextPreset);
    setDraft(next);
    setPreset(nextPreset);
    setFineTuned(false);
    setError("");
    vibrate(8);
    if (autoAdvance && !advancedOpen) await saveAndAdvance(next, nextPreset, false);
  };

  const requestPreset = (nextPreset: PlayerStyleValue, autoAdvance: boolean) => {
    if (fineTuned) {
      setPendingPreset({ value: nextPreset, autoAdvance });
      return;
    }
    void applyPreset(nextPreset, autoAdvance);
  };

  const setOverall = (nextOverall: number) => {
    if (!draft || saving) return;
    const next = fineTuned
      ? shiftDetailedProfileToOverall(draft, nextOverall, isSharedRoster)
      : attributesAtOverall(draft, nextOverall, preset).next;
    setDraft(next);
    setError("");
    vibrate(4);
  };

  const saveOvrOnly = async () => {
    if (!draft) return;
    const { next } = attributesAtOverall(draft, currentOverall, null);
    setDraft(next);
    setPreset(null);
    setFineTuned(false);
    await saveAndAdvance(next, null, false);
  };

  if (!player || !draft) return null;

  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  const cardMotion = leaving === "next"
    ? "-translate-x-[115%] -rotate-3 opacity-0"
    : leaving === "previous"
      ? "translate-x-[115%] rotate-3 opacity-0"
      : "translate-x-0 rotate-0 opacity-100";

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(next) => { if (!next) onDone(); }}>
        <StripesWorkspaceContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="[&>button:last-child]:hidden"
          data-testid="player-batch-rating-flow"
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#eef2ff_0,#f8fafc_42%,#ffffff_76%)]">
            <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
              <button
                type="button"
                onClick={() => { if (canGoBack && !saving) void moveCard("previous", onPrevious); }}
                disabled={!canGoBack || saving}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-30"
                aria-label={translate("roster.accessibility.previousRatingPlayer")}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <div className="min-w-0 flex-1 text-center">
                <DialogTitle className="text-base font-black tracking-tight text-[#102A43] sm:text-lg">
                  {translate("roster.headings.ratePlayers")}
                </DialogTitle>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {translate("roster.messages.ratingProgress", { index: index + 1, total })}
                </div>
              </div>

              <button
                type="button"
                onClick={onDone}
                disabled={saving}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-40"
                aria-label={translate("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6">
              <div className="mx-auto w-full max-w-lg">
                <div className="relative min-h-[30rem] sm:min-h-[34rem]">
                  <div className="absolute inset-x-4 top-3 h-[calc(100%-1.5rem)] rounded-[2rem] border border-slate-200/70 bg-white/45 shadow-sm" />
                  <div className="absolute inset-x-2 top-1.5 h-[calc(100%-0.75rem)] rounded-[2rem] border border-slate-200/80 bg-white/70 shadow-sm" />

                  <section
                    className={`relative z-10 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.13)] transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${cardMotion}`}
                    style={leaving ? undefined : {
                      transform: `translateX(${-14 * edgePullProgress}px) scale(${1 - 0.008 * edgePullProgress})`,
                    }}
                  >
                    <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-[#102A43] via-[#173d62] to-[#315f87] px-4 pb-5 pt-4 text-white sm:px-6 sm:pt-5">
                      <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full border-[22px] border-white/5" />
                      <div className="absolute bottom-0 left-0 h-1 w-full bg-[repeating-linear-gradient(90deg,#60a5fa_0_18px,#ffffff_18px_25px,#fb7185_25px_43px,#ffffff_43px_50px)] opacity-85" />
                      <div className="relative flex items-center gap-3">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/12 text-base font-black shadow-inner sm:h-20 sm:w-20 sm:text-lg">
                          {player.profilePhoto ? <img src={player.profilePhoto} alt="" className="h-full w-full object-cover" /> : initials(player.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xl font-black tracking-tight sm:text-2xl">{displayName(player)}</div>
                          <div className="mt-1 text-[11px] font-bold text-white/65">{translate("roster.messages.ratePlayersHelp")}</div>
                        </div>
                        {presetCopy ? (
                          <div className="hidden max-w-[9rem] items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 px-2.5 py-2 text-[10px] font-black sm:flex">
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{presetCopy.label}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-4 p-4 sm:p-6">
                      <div className="rounded-[1.75rem] border border-indigo-100 bg-indigo-50/65 px-3 py-4 sm:px-5">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setOverall(currentOverall - 0.5)}
                            disabled={saving || currentOverall <= 1}
                            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-200 bg-white text-indigo-700 shadow-sm transition active:scale-95 disabled:opacity-30"
                            aria-label={translate("roster.accessibility.decreaseOverall")}
                          >
                            <Minus className="h-5 w-5" />
                          </button>
                          <div className="min-w-[8.5rem] text-center">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">{translate("roster.messages.ovr")}</div>
                            <div className="mt-0.5 text-5xl font-black leading-none tabular-nums text-[#102A43] sm:text-6xl">{formatSkill(currentOverall)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOverall(currentOverall + 0.5)}
                            disabled={saving || currentOverall >= 10}
                            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-200 bg-white text-indigo-700 shadow-sm transition active:scale-95 disabled:opacity-30"
                            aria-label={translate("roster.accessibility.increaseOverall")}
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={0.5}
                          value={currentOverall}
                          onChange={(event) => setOverall(Number(event.target.value))}
                          disabled={saving}
                          className="fairteams-slider mt-4 w-full"
                          style={{ "--slider-fill": `${((currentOverall - 1) / 9) * 100}%` } as React.CSSProperties}
                          data-testid="player-rating-overall"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setPresetOpenToken((token) => token + 1)}
                        disabled={saving}
                        className="flex min-h-16 items-center justify-between gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-4 text-left shadow-sm transition hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99] disabled:opacity-50"
                        data-testid="open-player-presets"
                      >
                        <span className="min-w-0">
                          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{translate("roster.labels.whatStandsOut")}</span>
                          <span className="mt-1 block truncate text-sm font-black text-[#102A43]">{presetCopy?.label ?? translate("roster.actions.ovrOnly")}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-slate-500">{presetCopy?.description ?? translate("roster.messages.noPresetNeeded")}</span>
                        </span>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <ArrowLeft className="h-4 w-4" />
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAdvancedOpen((current) => !current)}
                        className="flex h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-left text-xs font-black text-[#102A43] shadow-sm transition active:scale-[0.99]"
                        aria-expanded={advancedOpen}
                      >
                        <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-indigo-600" /> {translate("roster.messages.advancedEdit")}</span>
                        {advancedOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>

                      {advancedOpen ? (
                        <div className="grid gap-3 rounded-[1.75rem] border border-indigo-100 bg-indigo-50/45 p-3 sm:p-4">
                          <div className="text-[10px] font-semibold leading-snug text-slate-500">{translate("roster.playerPresets.help")}</div>
                          <RadarPreview player={draft} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            {STAT_FIELDS.map(({ key, labelKey }) => (
                              <StatControl
                                key={key}
                                label={translate(labelKey)}
                                value={draft[key]}
                                onChange={(value) => {
                                  setDraft(normalizePlayer({ ...draft, [key]: value }));
                                  setFineTuned(true);
                                  setError("");
                                }}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(normalizePlayer({ ...draft, isGoalkeeper: !draft.isGoalkeeper }));
                              setError("");
                            }}
                            className={`flex min-h-11 items-center justify-between rounded-2xl border px-3 text-xs font-black ${draft.isGoalkeeper ? "border-amber-300 bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-600"}`}
                            aria-pressed={Boolean(draft.isGoalkeeper)}
                          >
                            <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> {translate("roster.abilities.goalkeeper.label")}</span>
                            {draft.isGoalkeeper ? <Check className="h-4 w-4" /> : null}
                          </button>
                        </div>
                      ) : null}

                      {error ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold leading-snug text-rose-700">{error}</div>
                      ) : null}
                    </div>

                    <PlayerPresetEdgePicker
                      key={player.id}
                      value={preset}
                      onSelect={(nextPreset) => requestPreset(nextPreset, !advancedOpen)}
                      onPullProgress={setEdgePullProgress}
                      disabled={saving}
                      openRequestToken={presetOpenToken}
                    />
                  </section>
                </div>
              </div>
            </div>

            <footer className="absolute inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/94 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">
              <div className="mx-auto grid w-full max-w-lg grid-cols-[0.75fr_1.25fr] gap-2">
                <Button type="button" variant="outline" onClick={() => { if (!saving) void moveCard("next", isLast ? onDone : onNext); }} disabled={saving} className="h-12 rounded-2xl font-black">
                  {translate("roster.actions.skip")}
                </Button>
                <Button
                  type="button"
                  onClick={() => { if (preset === null && !fineTuned) void saveOvrOnly(); else void saveAndAdvance(); }}
                  disabled={saving}
                  className="h-12 rounded-2xl font-black"
                >
                  {saving
                    ? translate("roster.actions.saving")
                    : preset === null && !fineTuned
                      ? translate("roster.actions.ovrOnlyNext")
                      : isLast
                        ? translate("roster.actions.saveDone")
                        : translate("roster.actions.saveNext")}
                </Button>
              </div>
            </footer>
          </div>
        </StripesWorkspaceContent>
      </Dialog>

      <AlertDialog open={pendingPreset !== null} onOpenChange={(next) => { if (!next) setPendingPreset(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("roster.headings.replaceDetailedProfile")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPreset
                ? translate("roster.messages.presetReplaceConfirm", {
                    preset: translate(playerStyleTranslationKeys(pendingPreset.value).labelKey),
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("roster.actions.keepCustomProfile")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingPreset) return;
                const next = pendingPreset;
                setPendingPreset(null);
                void applyPreset(next.value, next.autoAdvance);
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
