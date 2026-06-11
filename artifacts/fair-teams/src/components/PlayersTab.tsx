import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RoomPlayer } from "@/lib/localRoster";
import { calculateOverall, normalizePlayer } from "@/lib/localRoster";
import { FunBadge, Gender } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserMinus, Plus, Star, Zap, Search, X, Camera, Image as ImageIcon, Trash2, Pencil, Shield, Activity, Dumbbell, Target, Share2, Eye, EyeOff, ArrowDownAZ, Clock3 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

const STAT_FIELDS = [
  { key: "attack", label: "Attack", short: "ATK", icon: Target },
  { key: "defense", label: "Defense", short: "DEF", icon: Shield },
  { key: "speed", label: "Speed", short: "SPD", icon: Zap },
  { key: "passing", label: "Passing", short: "PAS", icon: Share2 },
  { key: "stamina", label: "Stamina", short: "STA", icon: Activity },
  { key: "physical", label: "Strength", short: "STR", icon: Dumbbell },
] as const;


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

const SPECIAL_ABILITIES: { key: AbilityKey; label: string; badge: string; description: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { key: "isGoalkeeper", label: "Goalkeeper", badge: "GK", description: "Comfortable in goal; helps spread keeper options across teams." },

  // Attack-first traits
  { key: "isFinisher", label: "Finisher", badge: "FIN", description: "Reliable scorer who turns chances into goals.", icon: FinisherBadgeIcon },
  { key: "isPowerShot", label: "Power Shot", badge: "PWR", description: "Boosts Attack +2 and Strength +1. Dangerous hard shooter.", icon: PowerShotBadgeIcon },
  { key: "isDribbler", label: "Dribbler", badge: "DRB", description: "Strong 1v1 player; keeps the ball under pressure.", icon: DribblerBadgeIcon },
  { key: "isSpaceFinder", label: "Space Finder", badge: "SPC", description: "Finds smart spaces in attack and defense.", icon: Search },

  // Midfield / control traits
  { key: "isPlaymaker", label: "Playmaker", badge: "PM", description: "Controls passing and creates chances for teammates.", icon: MagicWandBadgeIcon },
  { key: "isCrossing", label: "Technician", badge: "TECH", description: "Boosts Team Play and Passing. Clean touch, control, and technical skill.", icon: TechnicianBadgeIcon },
  { key: "isTikiTaka", label: "Tiki-Taka", badge: "TIKI", description: "Boosts Passing +2, Attack +1, and a tiny Stamina bonus. Quick short passing and combinations.", icon: TikiTakaBadgeIcon },
  { key: "isVersatile", label: "Versatile", badge: "ALL", description: "All-rounder who can fill weak spots in a team.", icon: VersatileBadgeIcon },
  { key: "isLongPass", label: "Long Pass", badge: "L-PAS", description: "Boosts Passing +2 and Attack +1. Good for switching play and longer through balls.", icon: LongPassBadgeIcon },
  { key: "isEngine", label: "Engine", badge: "ENG", description: "High work rate; keeps running, pressing, and covering.", icon: EngineBadgeIcon },

  // Defense-first traits
  { key: "isAerial", label: "Header", badge: "HEAD", description: "Boosts Strength +2, Defense +1, and Attack +1. Strong with headers and clearances.", icon: HeaderBadgeIcon },
  { key: "isSentinel", label: "Sentinel", badge: "SEN", description: "Defensive guardian; holds shape, marks, and protects space.", icon: Shield },
  { key: "isBulldog", label: "Bulldog", badge: "DOG", description: "Boosts Stamina +2 and Defense +1. Relentless presser who hounds opponents and fights for loose balls.", icon: BulldogBadgeIcon },
];


const FUN_BADGES: { value: FunBadge; label: string; emoji: string; description: string }[] = [
  { value: "cool-head", label: "Cool Head", emoji: "🧊", description: "Stays composed when things get noisy." },
  { value: "unbothered", label: "Unbothered", emoji: "😐", description: "Nothing seems to shake them." },
  { value: "wildcard", label: "Wildcard", emoji: "🎲", description: "You never know which version shows up." },
  { value: "silent-mode", label: "Silent Mode", emoji: "🔇", description: "Low volume, still fully present." },
  { value: "smooth-talker", label: "Smooth Talker", emoji: "🗣️", description: "Can talk their way through anything." },
  { value: "no-filter", label: "No Filter", emoji: "📣", description: "Says the thing everyone else was thinking." },
  { value: "human-alarm", label: "Human Alarm", emoji: "🚨", description: "Maximum volume, usually for a good reason." },
  { value: "influencer", label: "Influencer", emoji: "🤳", description: "The camera is probably already rolling." },
  { value: "main-character", label: "Main Character", emoji: "🎬", description: "Somehow always becomes part of the story." },
  { value: "old-school", label: "Old School", emoji: "📼", description: "Classic style, classic habits." },
  { value: "always-late", label: "Always Late", emoji: "⏰", description: "Arrival time is more of a concept." },
  { value: "early-exit", label: "Early Exit", emoji: "🚪", description: "Here now, gone suddenly." },
  { value: "first-5", label: "First 5 Minutes", emoji: "🚀", description: "Starts like a storm, then negotiates with gravity." },
  { value: "eighty-minute-warmup", label: "80-Minute Warmup", emoji: "🐢", description: "Gets going eventually, usually near the end." },
  { value: "third-half", label: "Third Half", emoji: "🍺", description: "Shines brightest after the game." },
  { value: "yellow-card", label: "Yellow Card", emoji: "🟨", description: "Lives one warning away from trouble." },
  { value: "var-caller", label: "VAR Caller", emoji: "📺", description: "Would like that decision reviewed immediately." },
  { value: "kit-collector", label: "Kit Collector", emoji: "👕", description: "Owns too many shirts and knows every kit." },
  { value: "shoe-collector", label: "Shoe Collector", emoji: "👟", description: "Boot choice is part of the performance." },
  { value: "fashion-icon", label: "Fashion Icon", emoji: "✨", description: "Turns the sideline into a runway." },
  { value: "club-legend", label: "Club Legend", emoji: "🏆", description: "The history book has a chapter." },
  { value: "snack-captain", label: "Snack Captain", emoji: "🍪", description: "Arrives with supplies, saves morale." },
  { value: "cameo", label: "Cameo", emoji: "🎭", description: "Rare appearance, memorable impact." },
  { value: "mastermind", label: "Mastermind", emoji: "♟️", description: "Quietly has a plan." },
];

const FUN_BADGE_CATEGORIES: { label: string; values: FunBadge[] }[] = [
  { label: "Personality", values: ["cool-head", "unbothered", "wildcard", "silent-mode", "smooth-talker", "no-filter", "human-alarm", "influencer", "main-character", "old-school"] },
  { label: "Matchday", values: ["always-late", "early-exit", "first-5", "eighty-minute-warmup", "third-half", "yellow-card", "var-caller"] },
  { label: "Club Culture", values: ["kit-collector", "shoe-collector", "fashion-icon", "club-legend", "snack-captain", "cameo", "mastermind"] },
];

function getFunBadge(value?: FunBadge) {
  return FUN_BADGES.find(badge => badge.value === value);
}

const SKILL_LEVEL_EXPLANATIONS: Record<number, string> = {
  1: "Complete beginner. New to football or needs major help with positioning and ball control.",
  2: "Beginner. Can join the game but often struggles with control, passing, and positioning.",
  3: "Casual beginner. Understands the basics but is still inconsistent under pressure.",
  4: "Lower casual level. Can play simple passes and defend sometimes, but impact is limited.",
  5: "Average casual player. Reliable enough for normal games, with no major strengths or weaknesses.",
  6: "Solid regular player. Understands the game well and contributes consistently.",
  7: "Good player. Technically comfortable, makes good decisions, and affects the game positively.",
  8: "Strong player. One of the better players in casual games; reliable in attack or defense.",
  9: "Very strong player. Usually dominates casual games and strongly affects team balance.",
  10: "Advanced / elite casual player. Clearly above the group level and must be balanced carefully.",
};

function skillLevelExplanation(skillLevel: number) {
  const bucket = Math.max(1, Math.min(10, Math.floor(skillLevel)));
  return SKILL_LEVEL_EXPLANATIONS[bucket];
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

function applySkillLevelToDetails(details: AddPlayerDetails, skillLevel: number): AddPlayerDetails {
  return {
    ...details,
    attack: skillLevel,
    defense: skillLevel,
    speed: skillLevel,
    passing: skillLevel,
    stamina: skillLevel,
    physical: skillLevel,
  };
}

async function fileToSmallDataUrl(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This photo format is not supported by the browser. Try a JPG or PNG."));
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
  const cls = size === "xl" ? "w-12 h-12 text-sm" : size === "lg" ? "w-24 h-24 text-2xl" : size === "sm" ? "w-9 h-9 text-xs" : "w-12 h-12 text-sm";
  return (
    <div className={`${cls} rounded-full overflow-hidden bg-primary/10 text-primary font-black flex items-center justify-center shrink-0 border border-primary/20`}>
      {player.profilePhoto ? <img src={player.profilePhoto} alt="" className="w-full h-full object-cover" /> : initials(player.name)}
    </div>
  );
}

function displayName(player: Pick<RoomPlayer, "name" | "aka">) {
  const aka = player.aka?.trim();
  return aka ? `${player.name} (${aka})` : player.name;
}

function formatDateTime(value?: string) {
  if (!value) return "Not saved yet";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function NewBadge() {
  return <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[8px] font-black text-sky-800 border border-sky-200 leading-none">NEW</span>;
}
function ORGBadge() {
  return <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-black text-violet-800 border border-violet-200 leading-none">ORG</span>;
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
  return <span title={badge.description} className="inline-flex items-center px-0.5 py-0 text-[9px] font-semibold text-muted-foreground leading-tight">{badge.emoji} {badge.label}</span>;
}
function AbilityBadge({
  ability,
  onClick,
  selected = false,
}: {
  ability: { badge: string; label: string; icon?: React.ComponentType<{ className?: string }> };
  onClick?: () => void;
  selected?: boolean;
}) {
  const baseTitle = `${ability.label} (${ability.badge})`;
  const ringClass = selected ? "border-amber-500 ring-2 ring-amber-300" : "border-amber-300";

  if (ability.badge === "GK") {
    const className = `inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 border shadow-sm ${ringClass} ${onClick ? "cursor-pointer active:scale-95" : "cursor-default"}`;
    if (onClick) {
      return (
        <button type="button" title={baseTitle} aria-label={ability.label} onClick={(e) => { e.stopPropagation(); onClick(); }} className={className}>
          GK
        </button>
      );
    }
    return <span title={baseTitle} aria-label={ability.label} className={className}>GK</span>;
  }

  const Icon = ability.icon ?? Star;
  const className = `inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 border shadow-sm ${ringClass} ${onClick ? "cursor-pointer active:scale-95" : "cursor-default"}`;

  if (onClick) {
    return (
      <button type="button" title={baseTitle} aria-label={ability.label} onClick={(e) => { e.stopPropagation(); onClick(); }} className={className}>
        <Icon className="w-3.5 h-3.5 stroke-[3]" />
      </button>
    );
  }

  return (
    <span title={baseTitle} aria-label={ability.label} className={className}>
      <Icon className="w-3.5 h-3.5 stroke-[3]" />
    </span>
  );
}

function SpecialAbilityIconRow({ player, max = 4 }: { player: RoomPlayer; max?: number }) {
  const abilities = SPECIAL_ABILITIES.filter(ability => Boolean(player[ability.key]));
  if (abilities.length <= 0) return null;

  const visible = abilities.slice(0, max);
  const hiddenCount = abilities.length - visible.length;
  const title = abilities.map(ability => ability.label).join(", ");

  return (
    <span title={title} className="inline-flex items-center gap-1 text-primary/80 leading-none">
      {visible.map(ability => {
        if (ability.badge === "GK") {
          return (
            <span key={ability.key} aria-label={ability.label} className="text-[8px] font-black tracking-tight text-primary/80 leading-none">
              GK
            </span>
          );
        }
        const Icon = ability.icon ?? Star;
        return <Icon key={ability.key} aria-label={ability.label} className="w-3 h-3 stroke-[2.8] shrink-0" />;
      })}
      {hiddenCount > 0 ? (
        <span className="text-[8px] font-black text-primary/70 leading-none">+{hiddenCount}</span>
      ) : null}
    </span>
  );
}

function PlayerTags({ player, includeVibe = false, includeAbilityCount = false }: { player: RoomPlayer; includeVibe?: boolean; includeAbilityCount?: boolean }) {
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 min-h-3 items-center">
      {includeVibe && player.funBadge ? <FunBadgePill value={player.funBadge} /> : null}
      {includeAbilityCount ? <SpecialAbilityIconRow player={player} /> : null}
      {player.isNew && <NewBadge />}
      {player.isOrganizer && <ORGBadge />}
    </div>
  );
}

function StatControl({ label, value, max = 10, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</Label>
        <span className="text-xs font-black text-primary">{value}{max === 3 ? "" : max === 5 ? "★" : ""}</span>
      </div>
      <input
        type="range"
        min={1}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function PlayerRadar({ player, compact = false }: { player: RoomPlayer; compact?: boolean }) {
  const data = useMemo(() => [
    { stat: "Attack", value: player.attack },
    { stat: "Passing", value: player.passing },
    { stat: "Stamina", value: player.stamina },
    { stat: "Defense", value: player.defense },
    { stat: "Strength", value: player.physical },
    { stat: "Speed", value: player.speed },
  ], [player]);

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
            <span className="min-w-0 truncate text-sm font-semibold">{selected.label}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[88dvh] overflow-hidden rounded-3xl p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 text-left border-b border-border/70">
            <DialogTitle>Choose player vibe</DialogTitle>
            {selected ? (
              <div className="pt-2 text-xs text-muted-foreground">
                Current: <span className="font-bold text-foreground">{selected.emoji} {selected.label}</span>
              </div>
            ) : (
              <div className="pt-2 text-xs text-muted-foreground">Pick one compact vibe badge.</div>
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
                    title={badge.description}
                    onClick={() => choose(badge.value)}
                    className={`min-h-[2.65rem] rounded-xl border px-1.5 py-1.5 text-center transition-all active:scale-[0.98] ${active ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40 hover:bg-accent/60"}`}
                  >
                    <span className="flex min-w-0 flex-col items-center justify-center gap-0.5">
                      <span className="text-base leading-none">{badge.emoji}</span>
                      <span className="max-w-full truncate text-[9px] font-extrabold leading-none text-foreground/90">{badge.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 border-t border-border/70 p-4">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => choose(undefined)}>Clear vibe</Button>
            <Button type="button" className="flex-1 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProfileDialog({
  player,
  onUpdate,
  autoOpen = false,
  onAutoOpenHandled,
}: {
  player: RoomPlayer;
  onUpdate: (data: Partial<RoomPlayer>) => void;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}) {
  const [draft, setDraft] = useState<RoomPlayer>(() => normalizePlayer(player));
  const [open, setOpen] = useState(false);
  const photoCameraInput = useRef<HTMLInputElement | null>(null);
  const photoGalleryInput = useRef<HTMLInputElement | null>(null);
  const overall = calculateOverall(draft);

  const updateDraft = (data: Partial<RoomPlayer>) => {
    setDraft(prev => normalizePlayer({ ...prev, ...data }));
  };

  useEffect(() => {
    if (!autoOpen) return;
    setDraft(normalizePlayer(player));
    setOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpen, player, onAutoOpenHandled]);

  const save = () => {
    onUpdate({ ...draft, skill: overall, updatedAt: new Date().toISOString() });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(normalizePlayer(player)); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="w-8 h-8 rounded-full" title="Edit player" data-testid={`profile-${player.id}`} onClick={e => e.stopPropagation()}>
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm md:max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit player profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 flex flex-col items-center gap-1.5">
              <button type="button" onClick={() => photoGalleryInput.current?.click()} className="relative group pt-1">
                <PlayerAvatar player={draft} size="lg" />
                <span className="absolute inset-0 bg-slate-900/35 rounded-full text-white hidden group-hover:flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </span>
              </button>
              <div className="grid grid-cols-2 gap-1 w-full">
                <Button type="button" variant="outline" size="sm" className="h-7 px-1.5 text-[10px]" onClick={() => photoCameraInput.current?.click()}>
                  <Camera className="w-3 h-3" />
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-1.5 text-[10px]" onClick={() => photoGalleryInput.current?.click()}>
                  <ImageIcon className="w-3 h-3" />
                </Button>
              </div>
              {draft.profilePhoto && <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground" onClick={() => updateDraft({ profilePhoto: undefined })}><Trash2 className="w-3 h-3 mr-1" /> Remove</Button>}
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Name</Label>
              <Input value={draft.name} onChange={e => updateDraft({ name: e.target.value })} />
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">AKA / Nickname</Label>
              <Input value={draft.aka || ""} placeholder="Optional" onChange={e => updateDraft({ aka: e.target.value })} />
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
                  catch { alert("Could not load that photo."); }
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
                  catch { alert("Could not load that photo."); }
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gender</Label>
                <Select value={draft.gender} onValueChange={v => updateDraft({ gender: v as Gender })}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Player Vibe</Label>
                <VibePicker value={draft.funBadge} onChange={funBadge => updateDraft({ funBadge })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TogglePill active={!!draft.isNew} onClick={() => updateDraft({ isNew: !draft.isNew })}>
                New Player
              </TogglePill>
              <TogglePill active={!!draft.isOrganizer} onClick={() => updateDraft({ isOrganizer: !draft.isOrganizer })}>
                Organizer
              </TogglePill>
            </div>
          </div>

          <div className="relative">
            <PlayerRadar player={{ ...draft, skill: overall }} />
            <div className="absolute right-3 top-3 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 shadow-sm flex items-center gap-2">
              <span className="text-[9px] uppercase font-bold opacity-75 leading-none">Skill</span>
              <span className="text-xl font-black leading-none">{overall}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {STAT_FIELDS.map(({ key, label }) => (
              <StatControl key={key} label={label} value={draft[key]} onChange={value => updateDraft({ [key]: value } as Partial<RoomPlayer>)} />
            ))}
            <StatControl label="Team Play" value={draft.teamPlay} max={3} onChange={value => updateDraft({ teamPlay: value })} />
            <div />
          </div>

          <div className="rounded-xl border border-border p-3 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1"><Star className="w-3 h-3" /> Special abilities</Label>
              <span className="text-[10px] font-bold text-muted-foreground">Affects Skill</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SPECIAL_ABILITIES.map(ability => {
                const selected = Boolean(draft[ability.key]);
                const Icon = ability.icon ?? Star;
                return (
                  <button
                    key={ability.key}
                    type="button"
                    onClick={() => updateDraft({ [ability.key]: !selected } as Partial<RoomPlayer>)}
                    className={`flex h-9 items-center gap-2 rounded-xl border px-2.5 text-left transition-colors ${selected ? "border-amber-400 bg-amber-50 text-amber-900" : "border-border bg-background/70 text-foreground"}`}
                  >
                    {ability.badge === "GK" ? (
                      <span className="text-[11px] font-semibold text-amber-700 w-5 text-center">GK</span>
                    ) : (
                      <Icon className="w-4 h-4 shrink-0 text-amber-700" />
                    )}
                    <span className="text-xs font-medium leading-tight truncate">{ability.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 bg-muted/30 text-[11px] text-muted-foreground font-semibold space-y-1">
            <div className="flex justify-between gap-3"><span>Added</span><span className="text-right text-foreground">{formatDateTime(draft.createdAt)}</span></div>
            <div className="flex justify-between gap-3"><span>Last edited</span><span className="text-right text-foreground">{formatDateTime(draft.updatedAt || draft.createdAt)}</span></div>
          </div>

          <Button onClick={save} className="h-11 font-black uppercase">Save Profile</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverallBadge({ player }: { player: RoomPlayer }) {
  return (
    <div className="w-10 h-9 rounded-xl bg-primary/10 text-primary border border-primary/15 flex flex-col items-center justify-center shrink-0 shadow-sm">
      <span className="text-[6px] font-bold uppercase opacity-70 leading-none">Skill</span>
      <span className="text-base font-black leading-none">{player.skill}</span>
    </div>
  );
}

function PlayerCardBack({ player }: { player: RoomPlayer }) {
  const abilities = SPECIAL_ABILITIES.filter(a => Boolean(player[a.key]));
  const [selectedAbilityKey, setSelectedAbilityKey] = useState<AbilityKey | null>(abilities[0]?.key ?? null);
  const selectedAbility = abilities.find(a => a.key === selectedAbilityKey) ?? abilities[0];
  return (
    <div className="mt-3 border-t border-border/70 pt-3 space-y-3">
      <div className="space-y-2" onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1.5 items-center justify-center">
          {abilities.length > 0 ? abilities.map(a => (
            <AbilityBadge
              key={a.key}
              ability={a}
              selected={selectedAbility?.key === a.key}
              onClick={() => setSelectedAbilityKey(prev => prev === a.key ? null : a.key)}
            />
          )) : <span className="text-[10px] font-semibold text-muted-foreground">No special abilities set</span>}
        </div>
        {selectedAbility ? (
          <div className="mx-auto max-w-[260px] text-center">
            <div className="text-[11px] font-semibold text-foreground leading-tight">{selectedAbility.label}</div>
            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground leading-snug">{selectedAbility.description}</div>
          </div>
        ) : (abilities.length > 0 ? (
          <div className="text-center text-[10px] font-semibold text-muted-foreground">Tap an ability icon to see what it means.</div>
        ) : null)}
      </div>

      <div className="rounded-2xl bg-muted/25 border border-border/70 p-2 shadow-inner">
        <PlayerRadar player={player} compact />
      </div>
    </div>
  );
}

export function PlayersTab({ players, setPlayers }: { players: RoomPlayer[]; setPlayers: (players: RoomPlayer[]) => void }) {
  const [name, setName] = useState("");
  const [aka, setAka] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [isNew, setIsNew] = useState(true);
  const [skillLevel, setSkillLevel] = useState(5);
  const [addAdvancedOpen, setAddAdvancedOpen] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [addProfilePhoto, setAddProfilePhoto] = useState<string | undefined>(undefined);
  const addPhotoCameraInput = useRef<HTMLInputElement | null>(null);
  const addPhotoGalleryInput = useRef<HTMLInputElement | null>(null);
  const [addDetails, setAddDetails] = useState<AddPlayerDetails>(() => createDefaultAddPlayerDetails());
  const addOverall = calculateOverall(addDetails);
  const addSkillExplanation = skillLevelExplanation(skillLevel);
  const updateAddDetails = (data: Partial<AddPlayerDetails>) => setAddDetails(prev => ({ ...prev, ...data }));
  const [autoEditPlayerId, setAutoEditPlayerId] = useState<string | null>(null);
  const [flippedPlayerIds, setFlippedPlayerIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [hideOverall, setHideOverall] = useState(() => {
    try { return window.localStorage.getItem("fair-teams-hide-roster-skill") !== "false"; }
    catch { return true; }
  });
  const [sortMode, setSortMode] = useState<"recent" | "alpha">(() => {
    try { return window.localStorage.getItem("fair-teams-roster-sort") === "alpha" ? "alpha" : "recent"; }
    catch { return "recent"; }
  });

  useEffect(() => {
    try { window.localStorage.setItem("fair-teams-hide-roster-skill", hideOverall ? "true" : "false"); }
    catch {}
  }, [hideOverall]);

  useEffect(() => {
    try { window.localStorage.setItem("fair-teams-roster-sort", sortMode); }
    catch {}
  }, [sortMode]);

  const updatePlayer = (playerId: string, data: Partial<RoomPlayer>) => {
    setPlayers(players.map(player => player.id === playerId ? normalizePlayer({ ...player, ...data, updatedAt: data.updatedAt || new Date().toISOString() }) : player));
  };

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const profileDetails = addDetails;
    const newPlayer = normalizePlayer({
      id: createPlayerId(),
      roomId: 1,
      name: name.trim(),
      aka: aka.trim() || undefined,
      gender,
      skill: calculateOverall(profileDetails),
      ...profileDetails,
      profilePhoto: addAdvancedOpen ? addProfilePhoto : undefined,
      isOrganizer,
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
    setAddDetails(createDefaultAddPlayerDetails(5));
    setAddProfilePhoto(undefined);
    setAddAdvancedOpen(false);
    setIsOrganizer(false);
    setAddPlayerOpen(false);
  };

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortMode === "alpha") {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Dialog open={addPlayerOpen} onOpenChange={(next) => {
          setAddPlayerOpen(next);
          if (next) {
            setIsNew(true);
            setSkillLevel(5);
            setAddDetails(createDefaultAddPlayerDetails(5));
            setAddProfilePhoto(undefined);
                    setAddAdvancedOpen(false);
          }
        }}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl border-primary/20 bg-primary/5 px-3 text-[11px] font-black uppercase tracking-wide text-primary shadow-none hover:bg-primary/10 hover:text-primary"
              data-testid="button-open-add-player"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Player
            </Button>
          </DialogTrigger>
          <DialogContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="max-w-sm md:max-w-xl rounded-3xl !top-[10dvh] !translate-y-0 max-h-[82dvh] overflow-y-auto sm:!top-[50%] sm:!-translate-y-1/2"
          >
            <DialogHeader>
              <DialogTitle>Add player</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="flex flex-col gap-3.5 pt-1">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Player Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Paul"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-11 text-sm font-semibold"
                    data-testid="input-player-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[1.15fr_0.85fr] gap-2">
                <Select value={gender} onValueChange={v => setGender(v as Gender)}>
                  <SelectTrigger className="h-10 rounded-xl border-border bg-muted/30 text-xs font-bold px-2" id="gender" data-testid="select-gender">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <TogglePill
                  active={isNew}
                  onClick={() => {
                    setIsNew(prev => {
                      const next = !prev;
                      if (next) {
                        setSkillLevel(5);
                        setAddDetails(current => applySkillLevelToDetails(current, 5));
                      }
                      return next;
                    });
                  }}
                  testId="checkbox-new-player"
                  activeClassName="border-sky-300 bg-sky-100 text-sky-800 shadow-sm"
                >
                  New
                </TogglePill>
              </div>

              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-[11px] uppercase font-black tracking-wide text-primary">Skill Level</Label>
                    <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">1–10, adjustable by 0.5</div>
                  </div>
                  <div className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-center shadow-sm">
                    <div className="text-[8px] uppercase font-black opacity-75 leading-none">Skill</div>
                    <div className="text-xl font-black leading-none">{skillLevel}</div>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={skillLevel}
                  onChange={e => {
                    const next = Number(e.target.value);
                    setSkillLevel(next);
                    setAddDetails(prev => applySkillLevelToDetails(prev, next));
                  }}
                  className="w-full accent-primary"
                  data-testid="input-player-skill-level"
                />
                <div className="rounded-xl border border-primary/10 bg-background/70 px-3 py-2 text-[11px] font-semibold leading-snug text-muted-foreground">
                  {addSkillExplanation}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/25 p-2.5 text-[11px] font-semibold text-muted-foreground leading-snug">
                {isNew ? (
                  <span>NEW marks players who still need proper evaluation. Skill can be adjusted now and refined later.</span>
                ) : (
                  <span>Known player: quick skill level is enough. Use Advanced only when you know details.</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAddAdvancedOpen(prev => !prev)}
                className="flex h-10 items-center justify-between rounded-2xl border border-border bg-background px-3 text-left text-xs font-black tracking-wide text-foreground"
                data-testid="button-toggle-add-advanced"
              >
                <span>Advanced Edit</span>
                <span className="text-muted-foreground">{addAdvancedOpen ? "▲" : "▼"}</span>
              </button>

              {addAdvancedOpen && (
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                  <div className="flex justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); addPhotoGalleryInput.current?.click(); }}
                        className="h-16 w-16 overflow-hidden rounded-full border border-primary/20 bg-background text-base font-black text-primary shadow-sm ring-4 ring-primary/10 flex items-center justify-center transition-transform active:scale-95"
                        title="Choose photo"
                      >
                        {addProfilePhoto ? <img src={addProfilePhoto} alt="" className="h-full w-full object-cover" /> : (name.trim() ? initials(name.trim()) : <Camera className="h-5 w-5" />)}
                      </button>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-xl px-2 text-[10px] font-bold"
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); addPhotoCameraInput.current?.click(); }}
                        >
                          <Camera className="mr-1 h-3 w-3" /> Camera
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-xl px-2 text-[10px] font-bold"
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); addPhotoGalleryInput.current?.click(); }}
                        >
                          <ImageIcon className="mr-1 h-3 w-3" /> Import
                        </Button>
                        {addProfilePhoto && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl text-muted-foreground"
                            onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAddProfilePhoto(undefined); }}
                            title="Remove photo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
                      catch { alert("Could not load that photo."); }
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
                      catch { alert("Could not load that photo."); }
                    }}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="add-name-advanced" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Name</Label>
                      <Input
                        id="add-name-advanced"
                        placeholder="Player name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="h-10 text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="aka" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">AKA</Label>
                      <Input
                        id="aka"
                        placeholder="Nickname"
                        value={aka}
                        onChange={e => setAka(e.target.value)}
                        className="h-10 text-sm font-semibold"
                        data-testid="input-player-aka"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Player Vibe</Label>
                      <VibePicker value={addDetails.funBadge} onChange={funBadge => updateAddDetails({ funBadge })} />
                    </div>
                    <TogglePill
                      active={isOrganizer}
                      onClick={() => setIsOrganizer(!isOrganizer)}
                      testId="checkbox-organizer"
                      activeClassName="border-violet-200 bg-violet-100 text-violet-800 shadow-sm"
                    >
                      Org
                    </TogglePill>
                    <div className="rounded-xl bg-primary text-primary-foreground px-2.5 py-1 text-center shadow-sm">
                      <div className="text-[8px] uppercase font-black opacity-75 leading-none">Skill</div>
                      <div className="text-lg font-black leading-none">{addOverall}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {STAT_FIELDS.map(({ key, label }) => (
                      <StatControl key={key} label={label} value={addDetails[key]} onChange={value => updateAddDetails({ [key]: value } as Partial<AddPlayerDetails>)} />
                    ))}
                    <StatControl label="Team Play" value={addDetails.teamPlay} max={3} onChange={value => updateAddDetails({ teamPlay: value })} />
                    <div />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1"><Star className="w-3 h-3" /> Special abilities</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SPECIAL_ABILITIES.map(ability => {
                        const selected = Boolean(addDetails[ability.key]);
                        const Icon = ability.icon ?? Star;
                        return (
                          <button
                            key={ability.key}
                            type="button"
                            onClick={() => updateAddDetails({ [ability.key]: !selected } as Partial<AddPlayerDetails>)}
                            className={`flex h-8 items-center gap-1.5 rounded-xl border px-2 text-left transition-colors ${selected ? "border-amber-400 bg-amber-50 text-amber-900" : "border-border bg-background/70 text-foreground"}`}
                          >
                            {ability.badge === "GK" ? (
                              <span className="text-[10px] font-semibold text-amber-700 w-5 text-center">GK</span>
                            ) : (
                              <Icon className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                            )}
                            <span className="text-[11px] font-semibold leading-tight truncate">{ability.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="h-10 rounded-xl font-black uppercase tracking-wide"
                data-testid="button-add-player"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Player
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSortMode(prev => prev === "recent" ? "alpha" : "recent")}
            className="h-8 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide shadow-none border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
            title={sortMode === "recent" ? "Roster sorted by last edited / added. Tap for A-Z." : "Roster sorted A-Z. Tap for last edited / added."}
            data-testid="button-toggle-roster-sort"
          >
            {sortMode === "recent" ? <Clock3 className="mr-1 h-3 w-3" /> : <ArrowDownAZ className="mr-1 h-3 w-3" />}
            {sortMode === "recent" ? "Recent" : "A-Z"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHideOverall(prev => !prev)}
            className={`h-8 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide shadow-none ${hideOverall ? "border-border bg-muted/35 text-muted-foreground" : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"}`}
            title={hideOverall ? "Show roster skill" : "Hide roster skill"}
            data-testid="button-toggle-roster-ovr"
          >
            {hideOverall ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
            Skill
          </Button>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 px-2 text-[10px] font-black text-primary shadow-none" title="Roster count">
            {search ? `${filtered.length}/${players.length}` : players.length}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {players.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search roster…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 pl-9 pr-9 text-sm"
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
        )}

        {players.length === 0 ? (
          <div className="text-center py-10 bg-muted/50 rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium text-sm">No players added yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 bg-muted/50 rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium text-sm">No players match \"{search}\"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {filtered.map(player => {
              const isFlipped = Boolean(flippedPlayerIds[player.id]);
              return (
                <div
                  key={player.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFlippedPlayerIds(prev => ({ ...prev, [player.id]: !prev[player.id] }))}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFlippedPlayerIds(prev => ({ ...prev, [player.id]: !prev[player.id] }));
                    }
                  }}
                  className="p-2 bg-card border border-border rounded-xl shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                  data-testid={`player-row-${player.id}`}
                >
                  <div className="flex items-center gap-2">
                    <PlayerAvatar player={player} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-black leading-tight text-[14px] break-words">{displayName(player)}</div>
                      <PlayerTags player={player} includeVibe includeAbilityCount={!isFlipped} />
                    </div>
                    {!hideOverall ? <OverallBadge player={player} /> : null}
                  </div>

                  {isFlipped ? <PlayerCardBack player={player} /> : null}

                  <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/60 pt-1">
                    <div className="text-[9px] text-muted-foreground font-bold tracking-wide">
                      {isFlipped ? "Tap card to hide details" : "Tap card for stats"}
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <ProfileDialog player={player} onUpdate={(data) => updatePlayer(player.id, data)} autoOpen={autoEditPlayerId === player.id} onAutoOpenHandled={() => setAutoEditPlayerId(null)} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-6 h-6 rounded-full" data-testid={`button-remove-${player.id}`}>
                            <UserMinus className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-xs rounded-xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Player?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete {displayName(player)} from the roster.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removePlayer(player.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
