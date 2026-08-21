import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Dumbbell,
  Share2,
  Shield,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { translate } from "@/i18n";
import { playerStyleTranslationKeys } from "@/i18n/playerStyle";
import {
  getPlayerStyleDefinition,
  PLAYER_PROFILE_PRESET_ORDER,
  type PlayerPresetId,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";

const PRESET_ICON_BY_VALUE: Record<PlayerStyleValue, LucideIcon> = {
  0: Shield,
  1: Dumbbell,
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

export function getPlayerProfilePresetOption(value: PlayerStyleValue): PlayerProfilePresetOption {
  const definition = getPlayerStyleDefinition(value);
  const keys = playerStyleTranslationKeys(value);
  return {
    id: definition.id,
    value,
    label: translate(keys.labelKey),
    description: translate(keys.descriptionKey),
    Icon: PRESET_ICON_BY_VALUE[value],
  };
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
    <div
      role="radiogroup"
      aria-label={translate("roster.labels.whatStandsOut")}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {PLAYER_PROFILE_PRESET_ORDER.map((presetValue) => {
        const option = getPlayerProfilePresetOption(presetValue);
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
            data-testid={`${testIdPrefix}-${option.id}`}
          >
            <div className="flex items-center gap-2">
              <span className={`flex shrink-0 items-center justify-center rounded-xl ${compact ? "h-7 w-7" : "h-8 w-8"} ${selected ? "bg-white/75" : "bg-muted/70"}`}>
                <option.Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </span>
              <span className={`min-w-0 truncate font-black leading-tight ${compact ? "text-[11px]" : "text-xs"}`}>
                {option.label}
              </span>
            </div>
            {!compact ? (
              <div className="mt-1.5 line-clamp-2 text-[10px] font-semibold leading-snug opacity-75">
                {option.description}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PlayerPresetEdgePicker({
  value,
  onSelect,
  onPullProgress,
  disabled = false,
  openRequestToken = 0,
}: {
  value: PlayerStyleValue | null;
  onSelect: (value: PlayerStyleValue) => void;
  onPullProgress?: (progress: number) => void;
  disabled?: boolean;
  openRequestToken?: number;
}) {
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

  const choosePreset = (presetValue: PlayerStyleValue) => {
    if (disabled) return;
    onSelect(presetValue);
    close();
  };

  const updateActiveFromPointer = (clientY: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (clientY < rect.top - 18 || clientY > rect.bottom + 18) {
      setActivePresetIndex(null);
      return;
    }
    const relative = Math.min(rect.height - 1, Math.max(0, clientY - rect.top));
    const index = Math.floor((relative / rect.height) * PLAYER_PROFILE_PRESET_ORDER.length);
    setActivePresetIndex(Math.max(0, Math.min(PLAYER_PROFILE_PRESET_ORDER.length - 1, index)));
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
        className={`pointer-events-auto absolute right-4 top-1/2 w-[min(18rem,calc(100vw-4.5rem))] -translate-y-1/2 overflow-hidden rounded-[1.4rem] border border-slate-200/90 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/20 backdrop-blur transition duration-200 ease-out motion-reduce:transition-none ${open ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+3.5rem)] opacity-0"}`}
        aria-hidden={!open}
      >
        <div className="px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          {translate("roster.labels.whatStandsOut")}
        </div>
        <div className="grid gap-1">
          {PLAYER_PROFILE_PRESET_ORDER.map((presetValue, index) => {
            const option = getPlayerProfilePresetOption(presetValue);
            const active = activeIndex === index;
            const selected = value === presetValue;
            return (
              <button
                key={presetValue}
                type="button"
                tabIndex={open ? 0 : -1}
                onPointerEnter={() => setActivePresetIndex(index)}
                onPointerLeave={() => { if (!draggingRef.current) setActivePresetIndex(null); }}
                onFocus={() => setActivePresetIndex(index)}
                onClick={() => choosePreset(presetValue)}
                className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition motion-reduce:transition-none ${active ? "-translate-x-1 border-primary/50 bg-primary text-primary-foreground shadow-lg" : selected ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-slate-50 text-slate-800 hover:bg-slate-100"}`}
                data-testid={`rating-edge-preset-${option.id}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/20" : "bg-white"}`}>
                  <option.Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black leading-tight">{option.label}</span>
                  <span className={`mt-0.5 block truncate text-[10px] font-semibold ${active ? "text-primary-foreground/75" : "text-slate-500"}`}>
                    {option.description}
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
          const presetValue = selectedIndex === null ? null : PLAYER_PROFILE_PRESET_ORDER[selectedIndex];
          draggingRef.current = false;
          startPointRef.current = null;
          dragActivatedRef.current = false;
          if (!wasDrag) return;
          suppressClickRef.current = true;
          if (presetValue !== null) choosePreset(presetValue);
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
        className={`pointer-events-auto absolute right-0 top-1/2 flex h-32 w-7 -translate-y-1/2 touch-none items-center justify-center rounded-l-2xl border border-r-0 border-slate-200/90 bg-white shadow-lg transition active:w-9 disabled:opacity-50 motion-reduce:transition-none ${open ? "text-primary" : "text-slate-500"}`}
        aria-expanded={open}
        aria-label={translate("roster.accessibility.openPlayerPresets")}
        data-testid="rating-edge-handle"
      >
        <span className="h-20 w-1.5 rounded-full bg-[linear-gradient(to_bottom,#2563eb_0_20%,#ef4444_20%_40%,#16a34a_40%_60%,#eab308_60%_80%,#7c3aed_80%)] shadow-inner" />
        <span className="sr-only">{translate("roster.messages.swipeEdgeHint")}</span>
      </button>
    </div>
  );
}
