import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  Plus,
  Share2,
  Shield,
  Sparkles,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { translate } from "@/i18n";
import { playerStyleTranslationKeys } from "@/i18n/playerStyle";
import {
  normalizeRosterPlayerModel,
  type RosterPlayerModel,
  type RosterPlayerPreset,
} from "@/lib/rosterPlayerModel";
import {
  PLAYER_PROFILE_PRESET_ORDER,
  getPlayerStyleDefinition,
  type PlayerPresetId,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";
import { PlayerPresetIcon } from "@/components/playerPresetIcons";

const LEGACY_PRESET_ICON_BY_VALUE: Record<PlayerStyleValue, LucideIcon> = {
  0: Shield,
  1: Sparkles,
  2: Activity,
  3: Star,
  4: Share2,
  5: Zap,
  6: Target,
};

export type PlayerProfilePresetOption = {
  id: PlayerPresetId;
  value: PlayerStyleValue;
  label: string;
  description: string;
  Icon: LucideIcon;
};

/**
 * Compatibility presenter for the still-live Club rating surface.
 *
 * The new roster-owned preset library is used by the JoonGPT rating flow, but
 * ClubTab continues to consume the stable legacy 0..6 playerStyle contract
 * until that surface is migrated deliberately.
 */
export function getPlayerProfilePresetOption(value: PlayerStyleValue): PlayerProfilePresetOption {
  const definition = getPlayerStyleDefinition(value);
  const keys = playerStyleTranslationKeys(value);
  return {
    id: definition.id,
    value,
    label: translate(keys.labelKey),
    description: translate(keys.descriptionKey),
    Icon: LEGACY_PRESET_ICON_BY_VALUE[value],
  };
}

export function PlayerPresetChip({
  preset,
  selected,
  onClick,
  compact = false,
  disabled = false,
  selectionIndex,
}: {
  preset: RosterPlayerPreset;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
  disabled?: boolean;
  selectionIndex?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`group flex min-w-0 items-center gap-2 rounded-full border transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${compact ? "min-h-9 px-2.5 py-1.5" : "min-h-11 px-3 py-2"} ${selected ? "border-amber-300 bg-amber-100 text-amber-950 shadow-sm" : "border-amber-100 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"}`}
      data-testid={`player-preset-${preset.id}`}
    >
      <span className={`relative flex shrink-0 items-center justify-center rounded-full ${compact ? "h-6 w-6" : "h-7 w-7"} ${selected ? "bg-amber-200 text-amber-800" : "bg-amber-50 text-amber-700"}`}>
        <PlayerPresetIcon iconKey={preset.iconKey} className="h-3.5 w-3.5" />
        {selected ? (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-700 px-0.5 text-[8px] font-black leading-none text-white ring-2 ring-amber-100">
            {typeof selectionIndex === "number" ? selectionIndex + 1 : <Check className="h-2.5 w-2.5" />}
          </span>
        ) : null}
      </span>
      <span className={`min-w-0 truncate font-black leading-tight ${compact ? "text-[10px]" : "text-xs"}`}>
        {preset.name}
      </span>
    </button>
  );
}

export function RosterPlayerPresetPicker({
  model,
  selectedIds,
  onToggle,
  disabled = false,
}: {
  model: RosterPlayerModel;
  selectedIds: string[];
  onToggle: (presetId: string) => void;
  disabled?: boolean;
}) {
  const safeModel = normalizeRosterPlayerModel(model);
  return (
    <div className="flex flex-wrap gap-2" aria-label={translate("roster.labels.whatStandsOut")}>
      {safeModel.presets.map((preset) => {
        const selectionIndex = selectedIds.indexOf(preset.id);
        return (
          <PlayerPresetChip
            key={preset.id}
            preset={preset}
            selected={selectionIndex >= 0}
            selectionIndex={selectionIndex >= 0 ? selectionIndex : undefined}
            onClick={() => onToggle(preset.id)}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}



export function PlayerPresetPicker({
  value,
  onChange,
  tone = "primary",
  compact = false,
  disabled = false,
  testIdPrefix = "player-preset",
}: {
  value: PlayerStyleValue | null;
  onChange: (value: PlayerStyleValue) => void;
  tone?: "primary" | "violet";
  compact?: boolean;
  disabled?: boolean;
  testIdPrefix?: string;
}) {
  const selectedTone = tone === "violet"
    ? "border-violet-400 bg-violet-100 text-violet-950 shadow-sm"
    : "border-primary/55 bg-primary/10 text-primary shadow-sm";
  const idleTone = tone === "violet"
    ? "border-violet-100 bg-white/90 text-violet-900 hover:border-violet-300 hover:bg-violet-50"
    : "border-border bg-background/90 text-foreground hover:border-primary/35 hover:bg-primary/5";
  return (
    <div role="radiogroup" aria-label={translate("roster.labels.whatStandsOut")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PLAYER_PROFILE_PRESET_ORDER.filter((presetValue) => presetValue !== 3).map((presetValue) => {
        const definition = getPlayerStyleDefinition(presetValue);
        const selected = value === presetValue;
        return (
          <button
            key={presetValue}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(presetValue)}
            className={`group min-w-0 rounded-2xl border text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${selected ? selectedTone : idleTone}`}
            data-testid={`${testIdPrefix}-${definition.id}`}
          >
            <span className={`block truncate font-black leading-tight ${compact ? "text-[11px]" : "text-xs"}`}>{definition.label}</span>
            {!compact ? <span className="mt-1.5 line-clamp-2 block text-[10px] font-semibold leading-snug opacity-75">{definition.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function PlayerPresetEdgePicker({
  model,
  selectedIds,
  onToggle,
  onPullProgress,
  disabled = false,
  openRequestToken = 0,
}: {
  model: RosterPlayerModel;
  selectedIds: string[];
  onToggle: (presetId: string) => void;
  onPullProgress?: (progress: number) => void;
  disabled?: boolean;
  openRequestToken?: number;
}) {
  const safeModel = normalizeRosterPlayerModel(model);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const activeIndexRef = useRef<number | null>(null);
  const dragActivatedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const setActivePresetIndex = (index: number | null) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  const close = () => {
    setOpen(false);
    draggingRef.current = false;
    setActivePresetIndex(null);
    startPointRef.current = null;
    dragActivatedRef.current = false;
    onPullProgress?.(0);
  };

  const togglePreset = (presetId: string) => {
    if (disabled) return;
    onToggle(presetId);
    close();
  };

  const updateActiveFromPointer = (clientY: number) => {
    const panel = panelRef.current;
    if (!panel || !safeModel.presets.length) return;
    const buttons = Array.from(panel.querySelectorAll<HTMLElement>("[data-preset-index]"));
    const index = buttons.findIndex((button) => {
      const rect = button.getBoundingClientRect();
      return clientY >= rect.top - 5 && clientY <= rect.bottom + 5;
    });
    setActivePresetIndex(index >= 0 ? index : null);
  };

  useEffect(() => {
    if (!openRequestToken) return;
    setOpen(true);
    setActivePresetIndex(null);
    onPullProgress?.(1);
  }, [onPullProgress, openRequestToken]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-30" data-testid="rating-edge-picker">
      <div
        ref={panelRef}
        className={`pointer-events-auto absolute right-10 top-1/2 max-h-[72%] w-[min(19rem,calc(100vw-5.75rem))] -translate-y-1/2 overflow-y-auto rounded-[1.4rem] border border-amber-100 bg-white/97 p-1.5 shadow-2xl shadow-slate-900/20 backdrop-blur transition duration-200 ease-out motion-reduce:transition-none ${open ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+4.5rem)] opacity-0"}`}
        aria-hidden={!open}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-xl bg-white/95 px-2 pb-1.5 pt-1 backdrop-blur">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            {translate("roster.labels.whatStandsOut")}
          </span>
          <span className="text-[9px] font-black text-amber-700">
            {translate("roster.playerModel.chooseUpToTwo")}
          </span>
        </div>
        <div className="grid gap-1">
          {safeModel.presets.map((preset, index) => {
            const active = activeIndex === index;
            const selected = selectedIds.includes(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                tabIndex={open ? 0 : -1}
                data-preset-index={index}
                onPointerEnter={() => setActivePresetIndex(index)}
                onPointerLeave={() => { if (!draggingRef.current) setActivePresetIndex(null); }}
                onFocus={() => setActivePresetIndex(index)}
                onClick={() => togglePreset(preset.id)}
                className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition motion-reduce:transition-none ${active ? "-translate-x-1 border-amber-400 bg-amber-400 text-amber-950 shadow-lg" : selected ? "border-amber-300 bg-amber-100 text-amber-950" : "border-transparent bg-slate-50 text-slate-800 hover:bg-amber-50"}`}
                data-testid={`rating-edge-preset-${preset.id}`}
              >
                <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/35" : selected ? "bg-amber-200" : "bg-white"}`}>
                  <PlayerPresetIcon iconKey={preset.iconKey} className="h-4 w-4" />
                  {selected ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-700 px-0.5 text-[8px] font-black text-white ring-2 ring-amber-100">
                      {selectedIds.indexOf(preset.id) + 1}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black leading-tight">{preset.name}</span>
                  <span className={`mt-0.5 block truncate text-[10px] font-semibold ${active ? "text-amber-950/70" : "text-slate-500"}`}>
                    {preset.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setOpen((current) => {
            const next = !current;
            onPullProgress?.(next ? 1 : 0);
            return next;
          });
          setActivePresetIndex(null);
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          startPointRef.current = { x: event.clientX, y: event.clientY };
          draggingRef.current = true;
          dragActivatedRef.current = false;
          setActivePresetIndex(null);
          onPullProgress?.(0);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          const start = startPointRef.current;
          if (!start) return;
          const inwardDistance = start.x - event.clientX;
          onPullProgress?.(Math.min(1, Math.max(0, inwardDistance) / 88));
          if (inwardDistance > 8) {
            dragActivatedRef.current = true;
            setOpen(true);
          }
          if (inwardDistance > 28) updateActiveFromPointer(event.clientY);
          else setActivePresetIndex(null);
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const wasDrag = dragActivatedRef.current;
          const selectedIndex = activeIndexRef.current;
          const preset = selectedIndex === null ? null : safeModel.presets[selectedIndex];
          draggingRef.current = false;
          startPointRef.current = null;
          dragActivatedRef.current = false;
          if (!wasDrag) return;
          suppressClickRef.current = true;
          if (preset) togglePreset(preset.id);
          else {
            setOpen(true);
            onPullProgress?.(1);
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setActivePresetIndex(null);
          startPointRef.current = null;
          dragActivatedRef.current = false;
          onPullProgress?.(open ? 1 : 0);
        }}
        className={`pointer-events-auto absolute right-2 top-1/2 flex h-36 w-8 -translate-y-1/2 touch-none items-center justify-center rounded-2xl border border-amber-200 bg-white/95 shadow-lg transition active:w-10 disabled:opacity-50 motion-reduce:transition-none ${open ? "text-amber-700" : "text-slate-500"}`}
        aria-expanded={open}
        aria-label={translate("roster.accessibility.openPlayerPresets")}
        data-testid="rating-edge-handle"
      >
        <span className="absolute -left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-sm">
          <Plus className="h-3.5 w-3.5" />
        </span>
        <span className="h-24 w-1.5 rounded-full bg-[linear-gradient(to_bottom,#2563eb_0_20%,#ef4444_20%_40%,#16a34a_40%_60%,#eab308_60%_80%,#7c3aed_80%)] shadow-inner" />
        <span className="sr-only">{translate("roster.messages.swipeEdgeHint")}</span>
      </button>
    </div>
  );
}
