import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RoomPlayer } from "@/lib/localRoster";
import { calculateOverall, normalizePlayer } from "@/lib/localRoster";
import { FunBadge, Gender } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserMinus, Plus, Star, Zap, Search, X, Camera, Image as ImageIcon, Trash2, Pencil, Shield, Activity, Dumbbell, Target, Share2 } from "lucide-react";
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
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9h7l2 2h2v5h-2l-1.4 2H8l-1.5-2H4v-5h3z" />
      <path d="M9 9V6h5" />
      <path d="M10 6V4" />
      <path d="M13 6V4" />
      <path d="M18 12h2" />
      <path d="M4 13H2" />
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

type AbilityKey = "isGoalkeeper" | "isPlaymaker" | "isFinisher" | "isDribbler" | "isSentinel" | "isEngine" | "isVersatile" | "isSpaceFinder";

const SPECIAL_ABILITIES: { key: AbilityKey; label: string; badge: string; description: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { key: "isGoalkeeper", label: "Goalkeeper", badge: "GK", description: "Comfortable in goal; helps spread keeper options across teams." },
  { key: "isPlaymaker", label: "Playmaker", badge: "PM", description: "Controls passing and creates chances for teammates.", icon: Share2 },
  { key: "isFinisher", label: "Finisher", badge: "FIN", description: "Reliable scorer who turns chances into goals.", icon: Target },
  { key: "isDribbler", label: "Dribbler", badge: "DRB", description: "Strong 1v1 player; keeps the ball under pressure.", icon: Zap },
  { key: "isSentinel", label: "Sentinel", badge: "SEN", description: "Defensive stopper; tackles, marks, and protects space.", icon: Shield },
  { key: "isEngine", label: "Engine", badge: "ENG", description: "High work rate; keeps running, pressing, and covering.", icon: EngineBadgeIcon },
  { key: "isVersatile", label: "Versatile", badge: "ALL", description: "All-rounder who can fill weak spots in a team.", icon: VersatileBadgeIcon },
  { key: "isSpaceFinder", label: "Space Finder", badge: "SPC", description: "Finds smart spaces in attack and defense.", icon: Search },
];


const FUN_BADGES: { value: FunBadge; label: string; emoji: string; description: string }[] = [
  { value: "loudmouth", label: "Loudmouth", emoji: "📢", description: "Always talking." },
  { value: "warrior", label: "Warrior", emoji: "😤", description: "Maximum effort, every ball." },
  { value: "samba", label: "Samba", emoji: "🇧🇷", description: "Flair and creative skills." },
  { value: "maradoner", label: "Maradoner", emoji: "🥙", description: "Believes every defender can be beaten." },
  { value: "reluctant-gk", label: "Reluctant GK", emoji: "🧤", description: "Needs convincing to play in goal." },
  { value: "first-10", label: "First 10 Minutes", emoji: "🚀", description: "Starts fast, fades later." },
  { value: "always-late", label: "Always Late", emoji: "⏰", description: "Arrives after kickoff." },
  { value: "unbothered", label: "Unbothered", emoji: "😐", description: "Nothing seems to bother them." },
  { value: "wildcard", label: "Wildcard", emoji: "🎲", description: "You never know which version shows up." },
  { value: "third-half", label: "Third Half Specialist", emoji: "🍺", description: "Peak performance after the match." },
  { value: "club-ambassador", label: "Club Ambassador", emoji: "🤝", description: "Welcomes people and keeps the group friendly." },
  { value: "cfo", label: "CFO", emoji: "💳", description: "Tracks payments and reminds everyone." },
  { value: "club-chef", label: "Club Chef", emoji: "🔪", description: "Keeps the group fed." },
];

function getFunBadge(value?: FunBadge) {
  return FUN_BADGES.find(badge => badge.value === value);
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
  return <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-800 border border-sky-200">NEW</span>;
}
function ORGBadge() {
  return <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-800 border border-violet-200">ORG</span>;
}
function TogglePill({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`h-10 rounded-xl border px-3 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}
function FunBadgePill({ value }: { value?: FunBadge }) {
  const badge = getFunBadge(value);
  if (!badge) return null;
  return <span title={badge.description} className="inline-flex items-center px-0.5 py-0 text-[10px] font-semibold text-muted-foreground">{badge.emoji} {badge.label}</span>;
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

function PlayerTags({ player, includeVibe = false }: { player: RoomPlayer; includeVibe?: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1 min-h-5 items-center">
      {includeVibe && player.funBadge ? <FunBadgePill value={player.funBadge} /> : null}
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
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl">
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
                <Select value={draft.funBadge ?? "none"} onValueChange={value => updateDraft({ funBadge: value === "none" ? undefined : value as FunBadge })}>
                  <SelectTrigger className="h-10 rounded-xl bg-background/70">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {FUN_BADGES.map(badge => (
                      <SelectItem key={badge.value} value={badge.value}>{badge.emoji} {badge.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <span className="text-[9px] uppercase font-bold opacity-75 leading-none">OVR</span>
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
              <span className="text-[10px] font-bold text-muted-foreground">Affects OVR</span>
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
    <div className="w-12 h-10 rounded-xl bg-primary/10 text-primary border border-primary/15 flex flex-col items-center justify-center shrink-0 shadow-sm">
      <span className="text-[7px] font-bold uppercase opacity-70 leading-none">OVR</span>
      <span className="text-lg font-black leading-none">{player.skill}</span>
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
  const [isNew, setIsNew] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [autoEditPlayerId, setAutoEditPlayerId] = useState<string | null>(null);
  const [flippedPlayerIds, setFlippedPlayerIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

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
    const newPlayer = normalizePlayer({
      id: createPlayerId(),
      roomId: 1,
      name: name.trim(),
      aka: aka.trim() || undefined,
      gender,
      skill: 5,
      attack: 5,
      defense: 5,
      speed: 5,
      passing: 5,
      stamina: 5,
      physical: 5,
      teamPlay: 2,
      isOrganizer,
      isNew,
      attending: false,
      createdAt: now,
      updatedAt: now,
    });
    setPlayers([...players, newPlayer]);
    setAutoEditPlayerId(newPlayer.id);
    setName("");
    setAka("");
    setIsNew(false);
    setIsOrganizer(false);
  };

  const filtered = search.trim()
    ? players.filter(p => displayName(p).toLowerCase().includes(search.toLowerCase()))
    : players;

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border shadow-sm">
        <CardContent className="pt-5">
          <form onSubmit={handleAdd} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="space-y-1.5">
                <Label htmlFor="aka" className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">AKA</Label>
                <Input
                  id="aka"
                  placeholder="Optional"
                  value={aka}
                  onChange={e => setAka(e.target.value)}
                  className="h-11 text-sm font-semibold"
                  data-testid="input-player-aka"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1.15fr_0.9fr_1fr] gap-2">
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
              <TogglePill active={isNew} onClick={() => setIsNew(!isNew)} testId="checkbox-new-player">
                New
              </TogglePill>
              <TogglePill active={isOrganizer} onClick={() => setIsOrganizer(!isOrganizer)} testId="checkbox-organizer">
                Organizer
              </TogglePill>
            </div>

            <Button type="submit" className="w-full h-12 mt-1 font-bold uppercase tracking-wide" data-testid="button-add-player">
              <Plus className="w-4 h-4 mr-2" /> Add Player
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Roster</h3>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
            {search ? `${filtered.length} / ${players.length}` : players.length}
          </span>
        </div>

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
          <div className="grid grid-cols-1 gap-2">
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
                  className="p-3 bg-card border border-border rounded-xl shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                  data-testid={`player-row-${player.id}`}
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar player={player} size="xl" />
                    <div className="min-w-0 flex-1">
                      <div className="font-black leading-tight text-base break-words">{displayName(player)}</div>
                      <PlayerTags player={player} includeVibe={isFlipped} />
                    </div>
                    <OverallBadge player={player} />
                  </div>

                  {isFlipped ? <PlayerCardBack player={player} /> : null}

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                    <div className="text-[10px] text-muted-foreground font-bold tracking-wide">
                      {isFlipped ? "Tap card to hide details" : "Tap card for stats"}
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <ProfileDialog player={player} onUpdate={(data) => updatePlayer(player.id, data)} autoOpen={autoEditPlayerId === player.id} onAutoOpenHandled={() => setAutoEditPlayerId(null)} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-8 h-8 rounded-full" data-testid={`button-remove-${player.id}`}>
                            <UserMinus className="w-4 h-4" />
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
