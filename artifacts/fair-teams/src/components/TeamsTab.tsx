import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoomPlayer } from "@/lib/localRoster";
import { FieldSize, PairingRule, Player, Team, TeamColor } from "@/lib/types";
import { getSpecialSkillStatBoosts } from "@/lib/playerAbilityEffects";
import { generateTeams, recomputeStats } from "@/lib/teamGenerator";
import { listenToClubRatingSummaries, type ClubRatingSummary } from "@/lib/clubCollaborationService";
import { profileFromAveragedAttributes } from "@/lib/playerStyleProfile";
import { Button } from "@/components/ui/button";
import stripesLogo from "@/assets/stripes-logo-mark.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shuffle, ArrowLeftRight, Download, HelpCircle, Clock, Palette, BarChart3, List, Maximize2, X, Square, Undo2, Redo2, ChevronLeft } from "lucide-react";

const PRESENT_TEAMS_SCROLL_FIX_VERSION = "present-fullscreen-portal-v1";

const COLOR_OPTIONS: { value: TeamColor; label: string; hex: string; textHex: string }[] = [
  { value: "red",    label: "Red",    hex: "#ef4444", textHex: "#fff"    },
  { value: "blue",   label: "Blue",   hex: "#3b82f6", textHex: "#fff"    },
  { value: "lime",   label: "Lime",   hex: "#84cc16", textHex: "#1a1a1a" },
  { value: "yellow", label: "Yellow", hex: "#facc15", textHex: "#1a1a1a" },
  { value: "orange", label: "Orange", hex: "#f97316", textHex: "#fff"    },
  { value: "black",  label: "Black",  hex: "#102A43", textHex: "#fff"    },
  { value: "white",  label: "White",  hex: "#FFFFFF", textHex: "#102A43" },
];

function colorFor(color: TeamColor) {
  return COLOR_OPTIONS.find(c => c.value === color) ?? COLOR_OPTIONS[0]!;
}

function GKBadge() {
  return <span className="inline-flex items-center rounded-full border border-emerald-200/60 bg-emerald-50/50 px-1 py-0 text-[8px] font-semibold lowercase text-emerald-700/70">gk</span>;
}

function ORGBadge() {
  return <span className="inline-flex items-center rounded-full border border-violet-200/60 bg-violet-50/50 px-1 py-0 text-[8px] font-semibold lowercase text-violet-700/70">org</span>;
}

function NewBadge() {
  return <span className="inline-flex items-center rounded-full border border-sky-200/60 bg-sky-50/50 px-1 py-0 text-[8px] font-semibold lowercase text-sky-700/70">new</span>;
}

function NotHereBadge() {
  return (
    <span className="inline-flex items-center text-amber-700" title="Not here yet" aria-label="Not here yet">
      <Clock className="h-3.5 w-3.5" />
    </span>
  );
}

function isNotHereYet(player: Pick<Player, "todayStatus">) {
  return player.todayStatus === "not_here_yet";
}

function displayName(player: Pick<Player, "name" | "aka">) {
  const aka = player.aka?.trim();
  return aka ? `${player.name} (${aka})` : player.name;
}

function GenderBadge({ gender }: { gender?: string }) {
  const normalized = (gender ?? "other").toLowerCase();
  if (normalized === "female") {
    return <span className="text-[8px] font-medium lowercase text-pink-500/50">f</span>;
  }
  if (normalized === "male") {
    return <span className="text-[8px] font-medium lowercase text-blue-500/50">m</span>;
  }
  return <span className="text-[8px] font-medium lowercase text-purple-500/45">o</span>;
}

function playerEffectiveStat(player: Player, key: keyof Pick<Player, "attack" | "passing" | "defense" | "speed" | "stamina">) {
  const boosts = getSpecialSkillStatBoosts(player);
  return Math.min(10, Number(player[key] || 0) + boosts[key]);
}

function averageStat(players: Player[], key: keyof Pick<Player, "attack" | "passing" | "defense" | "speed" | "stamina">) {
  if (players.length === 0) return 0;
  return Number((players.reduce((sum, player) => sum + playerEffectiveStat(player, key), 0) / players.length).toFixed(1));
}

function teamStatRows(players: Player[]) {
  return [
    { key: "attack", label: "Atk", value: averageStat(players, "attack"), max: 10 },
    { key: "passing", label: "Pass", value: averageStat(players, "passing"), max: 10 },
    { key: "defense", label: "Def", value: averageStat(players, "defense"), max: 10 },
    { key: "speed", label: "Speed", value: averageStat(players, "speed"), max: 10 },
    { key: "stamina", label: "Stam", value: averageStat(players, "stamina"), max: 10 },
  ];
}

const FIELD_SIZE_STORAGE_KEY = "fair-teams-field-size-v1";
const TEAM_HISTORY_STORAGE_KEY = "fair-teams-team-history-v1";

const TEAM_DRAW_STEPS = [
  "Sorting the group…",
  "Balancing strengths…",
  "Checking pairings…",
  "Forming teams…",
];

interface TeamHistoryEntry {
  id: string;
  createdAt: string;
  fieldSize: FieldSize;
  numTeams: number;
  totalPlayers: number;
  teams: Team[];
}

function loadTeamHistory(): TeamHistoryEntry[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TEAM_HISTORY_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveTeamHistory(history: TeamHistoryEntry[]) {
  try { localStorage.setItem(TEAM_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 10))); } catch {}
}

function shortDateTime(value: string) {
  try {
    const date = new Date(value);
    const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
    const day = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date);
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
    const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
    return `${month} ${day} ${weekday}, ${time}`;
  } catch {
    return value;
  }
}

function teamsDateLabel(date = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function loadFieldSize(): FieldSize {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(FIELD_SIZE_STORAGE_KEY) : null;
  return saved === "small" || saved === "large" || saved === "medium" ? saved : "medium";
}

interface SwapSelection { playerId: string; fromTeamId: string; }

function toLocalPlayer(p: RoomPlayer): Player {
  return {
    id: p.id, name: p.name, aka: p.aka, gender: p.gender as Player["gender"], skill: p.skill,
    attack: p.attack, defense: p.defense, speed: p.speed, passing: p.passing, stamina: p.stamina, physical: p.physical,
    teamPlay: p.teamPlay, profilePhoto: p.profilePhoto, isGoalkeeper: p.isGoalkeeper,
    isPlaymaker: p.isPlaymaker, isFinisher: p.isFinisher, isDribbler: p.isDribbler, isSentinel: p.isSentinel, isEngine: p.isEngine, isVersatile: p.isVersatile,
    isSpaceFinder: p.isSpaceFinder, isLongPass: p.isLongPass, isTikiTaka: p.isTikiTaka, isCrossing: p.isCrossing, isAerial: p.isAerial, isPowerShot: p.isPowerShot, isBulldog: p.isBulldog,
    isOrganizer: p.isOrganizer, isNew: p.isNew, todayStatus: p.todayStatus,
  };
}

function toClubBalancePlayer(p: RoomPlayer, summary?: ClubRatingSummary): Player {
  if (!summary || summary.ratingCount <= 0 || typeof summary.averageSkill !== "number") return toLocalPlayer(p);
  const safeSkill = Math.min(10, Math.max(1, Math.round(Number(summary.averageSkill || 5) * 2) / 2));
  const profile = profileFromAveragedAttributes(safeSkill, {
    attack: summary?.averageAttack ?? undefined,
    defense: summary?.averageDefense ?? undefined,
    speed: summary?.averageSpeed ?? undefined,
    passing: summary?.averagePassing ?? undefined,
    stamina: summary?.averageStamina ?? undefined,
    physical: summary?.averagePhysical ?? undefined,
  });
  return {
    id: p.id,
    name: p.name,
    aka: p.aka,
    gender: p.gender as Player["gender"],
    skill: safeSkill,
    attack: profile.attack,
    defense: profile.defense,
    speed: profile.speed,
    passing: profile.passing,
    stamina: profile.stamina,
    physical: profile.physical,
    teamPlay: 2,
    profilePhoto: p.profilePhoto,
    isGoalkeeper: Boolean((summary?.gkYesCount || 0) > 0 || p.isGoalkeeper),
    isOrganizer: p.isOrganizer,
    isNew: p.isNew,
    todayStatus: p.todayStatus,
  };
}


type TeamsTabProps = {
  players: RoomPlayer[];
  pairingRules?: PairingRule[];
  isSharedRoster?: boolean;
  sharedRosterId?: string;
  onOpenClubRatings?: () => void;
  onEditPlayers?: () => void;
  aiTeamSetupToken?: number;
  aiTeamCount?: number | null;
  aiAutoGenerate?: boolean;
  aiShuffleEquals?: boolean;
  onAiTeamStateChange?: (state: { hasTeams: boolean; teamCount: number; selectedCount: number }) => void;
  tutorialStep?: string | null;
  onTutorialAction?: (action: string) => void;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

function playerInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}


async function exportTeamsAsJpg(teams: Team[], fieldSize: FieldSize) {
  const SCALE = 2;
  const CANVAS_W = 720;
  const PAD = 28;
  const GAP = 14;
  const TITLE_H = 92;
  const TEAM_HEADER_H = 46;
  const PLAYER_LINE_H = 20;
  const CARD_PAD_X = 16;
  const CARD_PAD_Y = 12;

  const COLS = Math.min(2, Math.max(1, teams.length));
  const ROWS = Math.ceil(teams.length / COLS);
  const CARD_W = Math.floor((CANVAS_W - PAD * 2 - GAP * (COLS - 1)) / COLS);

  const teamRowHeights = Array.from({ length: ROWS }, (_, row) => {
    const rowTeams = teams.slice(row * COLS, row * COLS + COLS);
    const maxPlayers = Math.max(1, ...rowTeams.map(team => team.players.length));
    return TEAM_HEADER_H + CARD_PAD_Y * 2 + maxPlayers * PLAYER_LINE_H;
  });

  const calculatedCanvasH = TITLE_H + teamRowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, ROWS - 1) * GAP + PAD;
  const MIN_CANVAS_H = 1080;
  const CANVAS_H = Math.max(calculatedCanvasH, MIN_CANVAS_H);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W * SCALE;
  canvas.height = CANVAS_H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // Clean portrait background
  const bg = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  bg.addColorStop(0, "#F8FAFC");
  bg.addColorStop(1, "#F1F8F3");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Use the real Stripes mark and the same Fredoka / Outfit typography as the app.
  try {
    if (document.fonts) {
      await document.fonts.ready;
      await Promise.allSettled([
        document.fonts.load('600 32px "Fredoka"'),
        document.fonts.load('700 12px "Outfit"'),
        document.fonts.load('800 16px "Outfit"'),
      ]);
    }
  } catch {
    // Canvas still has safe fallbacks if web fonts are unavailable.
  }

  const brandLogo = await loadImage(stripesLogo).catch(() => null);
  const logoSize = 52;
  const brandGap = 9;
  ctx.font = `600 32px "Fredoka", "Outfit", sans-serif`;
  const brandText = "Stripes";
  const brandTextWidth = ctx.measureText(brandText).width;
  const brandWidth = logoSize + brandGap + brandTextWidth;
  const brandStartX = (CANVAS_W - brandWidth) / 2;

  if (brandLogo) ctx.drawImage(brandLogo, brandStartX, 9, logoSize, logoSize);
  ctx.textAlign = "left";
  ctx.fillStyle = "#102A43";
  ctx.fillText(brandText, brandStartX + logoSize + brandGap, 44);

  ctx.textAlign = "center";
  ctx.fillStyle = "#64748B";
  ctx.font = `700 11px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(`Teams · ${teamsDateLabel()}`, CANVAS_W / 2, 70);
  ctx.textAlign = "left";

  const rowY = teamRowHeights.reduce<number[]>((positions, height, row) => {
    const previousY = row === 0 ? TITLE_H : positions[row - 1]! + teamRowHeights[row - 1]! + GAP;
    positions.push(previousY);
    return positions;
  }, []);

  teams.forEach((team, index) => {
    const row = Math.floor(index / COLS);
    const y = rowY[row]!;
    const col = index % COLS;
    const rowTeams = teams.slice(row * COLS, row * COLS + COLS);
    const rowCount = rowTeams.length;
    const rowWidth = rowCount * CARD_W + (rowCount - 1) * GAP;
    const rowX = (CANVAS_W - rowWidth) / 2;
    const x = rowX + col * (CARD_W + GAP);
    const h = teamRowHeights[row]!;
    const colOpt = colorFor(team.color);
    const exportAccent = team.color === "white" ? "#CBD5E1" : colOpt.hex;

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.07)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, CARD_W, h, 10);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = exportAccent;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, CARD_W, h, 10);
    ctx.stroke();

    // Team header: team color is carried by the card outline.
    ctx.fillStyle = "#102A43";
    ctx.font = `800 16px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(team.name, x + CARD_PAD_X, y + 23);

    ctx.fillStyle = "#64748B";
    ctx.font = `700 10px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(`${team.players.length} ${team.players.length === 1 ? "player" : "players"}`, x + CARD_PAD_X, y + 38);

    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + CARD_PAD_X, y + TEAM_HEADER_H);
    ctx.lineTo(x + CARD_W - CARD_PAD_X, y + TEAM_HEADER_H);
    ctx.stroke();

    let playerY = y + TEAM_HEADER_H + CARD_PAD_Y + 13;
    const playerX = x + CARD_PAD_X;
    const badgeRight = x + CARD_W - CARD_PAD_X;

    if (team.players.length === 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = `italic 12px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillText("No players", playerX, playerY);
    } else {
      team.players.forEach(player => {
        ctx.fillStyle = "#102A43";
        ctx.font = `800 16px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const badges = [
          ...(player.isOrganizer ? ["ORG"] : []),
          ...(player.isGoalkeeper ? ["GK"] : []),
        ];
        const badgeGap = 6;
        const badgeWidths = badges.reduce((sum, badge) => sum + (badge === "ORG" ? 30 : 25), 0) + Math.max(0, badges.length - 1) * 4;
        const maxNameWidth = CARD_W - CARD_PAD_X * 2 - (badges.length ? badgeGap + badgeWidths : 0);
        const nameText = truncateCanvasText(ctx, displayName(player), maxNameWidth);
        ctx.fillText(nameText, playerX, playerY);

        let badgeX = playerX + ctx.measureText(nameText).width + badgeGap;
        const badgeY = playerY - 13;
        badges.forEach((badge) => {
          if (badge === "ORG") {
            drawTextBadge(ctx, "ORG", badgeX, badgeY, "#EA580C", "#FFEDD5", "#FDBA74");
            badgeX += 34;
          } else {
            drawTextBadge(ctx, "GK", badgeX, badgeY, "#15803D", "#DCFCE7", "#86EFAC");
            badgeX += 29;
          }
        });

        playerY += PLAYER_LINE_H;
      });
    }
  });

  const url = canvas.toDataURL("image/jpeg", 0.92);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stripes-${new Date().toISOString().slice(0, 10)}.jpg`;
  a.click();
}


function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + ellipsis).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}${ellipsis}`;
}

function drawTextBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  textColor: string,
  bgColor: string,
  borderColor: string,
) {
  const w = text === "ORG" ? 30 : 25;
  const h = 15;
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = `900 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, x + w / 2, y + 10.5);
  ctx.textAlign = "left";
}


export function TeamsTab({ players, pairingRules = [], isSharedRoster = false, sharedRosterId, onOpenClubRatings, onEditPlayers, aiTeamSetupToken = 0, aiTeamCount = null, aiAutoGenerate = false, aiShuffleEquals = false, onAiTeamStateChange, tutorialStep, onTutorialAction }: TeamsTabProps) {
  const [numTeams, setNumTeams] = useState<number>(2);
  const [fieldSize, setFieldSize] = useState<FieldSize>(() => loadFieldSize());
  const [showFieldHelp, setShowFieldHelp] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [undoStack, setUndoStack] = useState<Array<{ teams: Team[]; fieldSize: FieldSize; numTeams: number }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ teams: Team[]; fieldSize: FieldSize; numTeams: number }>>([]);
  const [teamStatsOpen, setTeamStatsOpen] = useState<Record<string, boolean>>({});
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [history, setHistory] = useState<TeamHistoryEntry[]>(() => loadTeamHistory());
  const [swap, setSwap] = useState<SwapSelection | null>(null);
  const [desktopDrag, setDesktopDrag] = useState<SwapSelection | null>(null);
  const [desktopDropTarget, setDesktopDropTarget] = useState<{ teamId: string; playerId?: string } | null>(null);
  const suppressPlayerClickRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [drawStep, setDrawStep] = useState(0);
  const [justGenerated, setJustGenerated] = useState(false);
  const [showPlayerSkillNumbers, setShowPlayerSkillNumbers] = useState(false);
  const [clubRatingSummaries, setClubRatingSummaries] = useState<ClubRatingSummary[]>([]);
  const [presentTeamsOpen, setPresentTeamsOpen] = useState(false);
  const [gameToolsOpen, setGameToolsOpen] = useState(false);
  const [cardScreen, setCardScreen] = useState<"yellow" | "red" | null>(null);
  const generateTimerRef = useRef<number | null>(null);
  const lastAiTeamSetupTokenRef = useRef<number>(0);

  useEffect(() => {
    localStorage.setItem(FIELD_SIZE_STORAGE_KEY, fieldSize);
  }, [fieldSize]);

  useEffect(() => {
    if (!isSharedRoster || !sharedRosterId) {
      setClubRatingSummaries([]);
      return;
    }

    try {
      const unsubscribeSummaries = listenToClubRatingSummaries(
        sharedRosterId,
        setClubRatingSummaries,
        () => {
          // Teams stays usable with local ratings when Club ratings are unavailable.
          setClubRatingSummaries([]);
        },
      );
      return () => unsubscribeSummaries();
    } catch {
      setClubRatingSummaries([]);
      return;
    }
  }, [isSharedRoster, sharedRosterId]);

  useEffect(() => {
    saveTeamHistory(history);
  }, [history]);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = window.setInterval(() => {
      setDrawStep(prev => (prev + 1) % TEAM_DRAW_STEPS.length);
    }, 260);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (generateTimerRef.current !== null) window.clearTimeout(generateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!presentTeamsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (cardScreen) {
        setCardScreen(null);
      } else if (gameToolsOpen) {
        setGameToolsOpen(false);
      } else {
        setPresentTeamsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [presentTeamsOpen, cardScreen, gameToolsOpen]);

  useEffect(() => {
    if (!presentTeamsOpen) {
      setGameToolsOpen(false);
      setCardScreen(null);
    }
  }, [presentTeamsOpen]);

  useEffect(() => {
    if (!isSharedRoster) return;
    setTeamStatsOpen({});
    setShowPlayerSkillNumbers(false);
  }, [isSharedRoster, sharedRosterId]);

  const clubRatingByPlayerId = useMemo(() => {
    return new Map(clubRatingSummaries.map((summary) => [summary.playerId, summary]));
  }, [clubRatingSummaries]);
  const usingClubRatings = Boolean(isSharedRoster);
  const getUsableClubAverage = (playerId: string) => {
    const summary = clubRatingByPlayerId.get(playerId);
    if (!summary || summary.ratingCount <= 0 || typeof summary.averageSkill !== "number") return null;
    return summary.averageSkill;
  };
  const attendingPlayers = useMemo(() => {
    return players.filter((player) => player.attending).map((player) => {
      if (!usingClubRatings) return toLocalPlayer(player);
      const summary = clubRatingByPlayerId.get(player.id);
      return toClubBalancePlayer(player, summary && getUsableClubAverage(player.id) !== null ? summary : undefined);
    });
  }, [clubRatingByPlayerId, players, usingClubRatings]);
  const hereNowCount = attendingPlayers.filter(p => !isNotHereYet(p)).length;
  const notHereYetPlayers = attendingPlayers.filter(isNotHereYet);

  useEffect(() => {
    onAiTeamStateChange?.({
      hasTeams: teams.length > 0,
      teamCount: numTeams,
      selectedCount: attendingPlayers.length,
    });
  }, [attendingPlayers.length, numTeams, onAiTeamStateChange, teams.length]);

  const historyPanel = history.length > 0 ? (
    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Team History</h3>
        </div>
        <button
          type="button"
          className="text-[10px] font-bold text-muted-foreground underline"
          onClick={() => setHistory([])}
          data-testid="button-clear-history"
        >
          Clear
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {history.slice(0, 6).map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => { setTeams(entry.teams); setFieldSize(entry.fieldSize); setNumTeams(entry.numTeams); setSwap(null); setTeamStatsOpen({}); setShowPlayerSkillNumbers(false); setPresentTeamsOpen(false); }}
            className="min-w-[142px] rounded-lg border border-border bg-muted/30 px-3 py-2 text-left active:scale-[0.98] transition-transform"
            data-testid={`button-history-${entry.id}`}
          >
            <p className="text-[11px] font-black text-foreground truncate">{shortDateTime(entry.createdAt)}</p>
            <p className="text-[10px] font-bold text-muted-foreground capitalize">{entry.fieldSize} · {entry.numTeams} teams</p>
            <p className="text-[10px] text-muted-foreground">{entry.totalPlayers} players</p>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const cloneTeams = (value: Team[]) => value.map((team) => ({
    ...team,
    players: team.players.map((player) => ({ ...player })),
  }));

  const arrangementSnapshot = () => ({
    teams: cloneTeams(teams),
    fieldSize,
    numTeams,
  });

  const samePlayersAsCurrentSession = () => {
    const currentIds = teams.flatMap((team) => team.players.map((player) => player.id)).sort();
    const attendingIds = attendingPlayers.map((player) => player.id).sort();
    return currentIds.length === attendingIds.length && currentIds.every((id, index) => id === attendingIds[index]);
  };

  const recordArrangementForUndo = () => {
    if (!teams.length) return;
    const snapshot = arrangementSnapshot();
    setUndoStack((current) => [...current, snapshot].slice(-20));
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (!undoStack.length || isGenerating) return;
    const previous = undoStack[undoStack.length - 1]!;
    setRedoStack((current) => [...current, arrangementSnapshot()].slice(-20));
    setUndoStack((current) => current.slice(0, -1));
    setTeams(cloneTeams(previous.teams));
    setFieldSize(previous.fieldSize);
    setNumTeams(previous.numTeams);
    setSwap(null);
    setTeamStatsOpen({});
  };

  const handleRedo = () => {
    if (!redoStack.length || isGenerating) return;
    const next = redoStack[redoStack.length - 1]!;
    setUndoStack((current) => [...current, arrangementSnapshot()].slice(-20));
    setRedoStack((current) => current.slice(0, -1));
    setTeams(cloneTeams(next.teams));
    setFieldSize(next.fieldSize);
    setNumTeams(next.numTeams);
    setSwap(null);
    setTeamStatsOpen({});
  };

  const startTeamGeneration = (teamCount: number, shuffleEquals = false) => {
    if (attendingPlayers.length < 2 || isGenerating) return;
    const safeTeamCount = Math.min(6, Math.max(2, Math.round(teamCount)));
    if (teams.length > 0 && samePlayersAsCurrentSession()) {
      recordArrangementForUndo();
    } else {
      setUndoStack([]);
      setRedoStack([]);
    }
    setNumTeams(safeTeamCount);
    setSwap(null);
    setTeamStatsOpen({});
    setShowPlayerSkillNumbers(false);
    setPresentTeamsOpen(false);
    setJustGenerated(false);
    setIsGenerating(true);
    setDrawStep(0);

    const nextTeams = generateTeams(attendingPlayers, safeTeamCount, shuffleEquals, fieldSize, pairingRules);

    if (generateTimerRef.current !== null) window.clearTimeout(generateTimerRef.current);
    generateTimerRef.current = window.setTimeout(() => {
      setTeams(nextTeams);
      const entry: TeamHistoryEntry = {
        id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        fieldSize,
        numTeams: safeTeamCount,
        totalPlayers: attendingPlayers.length,
        teams: nextTeams,
      };
      setHistory(prev => [entry, ...prev].slice(0, 10));
      setIsGenerating(false);
      setJustGenerated(true);
      window.setTimeout(() => setJustGenerated(false), 1200);
    }, 880);
  };

  const handleGenerate = (shuffleEquals = false) => {
    startTeamGeneration(numTeams, shuffleEquals);
  };

  useEffect(() => {
    if (!aiTeamSetupToken || typeof aiTeamCount !== "number") return;
    if (lastAiTeamSetupTokenRef.current === aiTeamSetupToken) return;
    lastAiTeamSetupTokenRef.current = aiTeamSetupToken;
    const safeTeamCount = Math.min(6, Math.max(2, Math.round(aiTeamCount)));
    setNumTeams(safeTeamCount);
    setSwap(null);
    setTeamStatsOpen({});
    setShowPlayerSkillNumbers(false);
    setPresentTeamsOpen(false);
    if (aiAutoGenerate) {
      window.setTimeout(() => startTeamGeneration(safeTeamCount, aiShuffleEquals), 0);
    }
  }, [aiTeamSetupToken, aiTeamCount, aiAutoGenerate, aiShuffleEquals, attendingPlayers, fieldSize, pairingRules, isGenerating]);

  const handleColorChange = (teamId: string, color: TeamColor) => {
    const label = colorFor(color).label;
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, color, name: label } : t));
  };

  const startEditingTeamName = (teamId: string, currentName: string) => {
    setEditingTeamId(teamId);
    setEditingTeamName(currentName);
  };

  const commitTeamName = () => {
    if (!editingTeamId) return;
    const trimmed = editingTeamName.trim();
    if (trimmed) {
      setTeams(prev => prev.map(t => t.id === editingTeamId ? { ...t, name: trimmed } : t));
    }
    setEditingTeamId(null);
    setEditingTeamName("");
  };

  const cancelTeamNameEdit = () => {
    setEditingTeamId(null);
    setEditingTeamName("");
  };

  const swapPlayers = (fromTeamId: string, fromPlayerId: string, toTeamId: string, toPlayerId: string) => {
    if (fromTeamId === toTeamId && fromPlayerId === toPlayerId) return;
    recordArrangementForUndo();
    setTeams(prev => {
      const next = prev.map(t => ({ ...t, players: [...t.players] }));
      const fromTeam = next.find(t => t.id === fromTeamId);
      const toTeam = next.find(t => t.id === toTeamId);
      if (!fromTeam || !toTeam) return prev;
      const fromIdx = fromTeam.players.findIndex(p => p.id === fromPlayerId);
      const toIdx = toTeam.players.findIndex(p => p.id === toPlayerId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const fromPlayer = fromTeam.players[fromIdx]!;
      const toPlayer = toTeam.players[toIdx]!;
      fromTeam.players[fromIdx] = toPlayer;
      toTeam.players[toIdx] = fromPlayer;
      return recomputeStats(next, fieldSize);
    });
  };

  const movePlayerToTeam = (fromTeamId: string, playerId: string, toTeamId: string) => {
    if (toTeamId === fromTeamId) return;
    recordArrangementForUndo();
    setTeams(prev => {
      const next = prev.map(t => ({ ...t, players: [...t.players] }));
      const fromTeam = next.find(t => t.id === fromTeamId);
      const toTeam = next.find(t => t.id === toTeamId);
      if (!fromTeam || !toTeam) return prev;
      const idx = fromTeam.players.findIndex(p => p.id === playerId);
      if (idx === -1) return prev;
      const [moved] = fromTeam.players.splice(idx, 1);
      toTeam.players.push(moved!);
      return recomputeStats(next, fieldSize);
    });
  };


  const desktopDragEnabled = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;

  const beginDesktopPlayerDrag = (event: React.DragEvent<HTMLButtonElement>, playerId: string, fromTeamId: string) => {
    if (!desktopDragEnabled()) { event.preventDefault(); return; }
    suppressPlayerClickRef.current = true;
    setDesktopDrag({ playerId, fromTeamId });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${fromTeamId}:${playerId}`);
  };

  const finishDesktopPlayerDrag = () => {
    setDesktopDrag(null);
    setDesktopDropTarget(null);
    window.setTimeout(() => { suppressPlayerClickRef.current = false; }, 0);
  };

  const dropDesktopPlayerOnTeam = (event: React.DragEvent, toTeamId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!desktopDrag) return finishDesktopPlayerDrag();
    movePlayerToTeam(desktopDrag.fromTeamId, desktopDrag.playerId, toTeamId);
    finishDesktopPlayerDrag();
  };

  const dropDesktopPlayerOnPlayer = (event: React.DragEvent, toTeamId: string, toPlayerId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!desktopDrag) return finishDesktopPlayerDrag();
    swapPlayers(desktopDrag.fromTeamId, desktopDrag.playerId, toTeamId, toPlayerId);
    finishDesktopPlayerDrag();
  };

  const handleSelectPlayer = (playerId: string, fromTeamId: string) => {
    if (!swap) {
      setSwap({ playerId, fromTeamId });
      return;
    }
    if (swap.playerId === playerId && swap.fromTeamId === fromTeamId) {
      setSwap(null);
      return;
    }
    swapPlayers(swap.fromTeamId, swap.playerId, fromTeamId, playerId);
    setSwap(null);
  };

  const handleMoveTo = (toTeamId: string) => {
    if (!swap) return;
    movePlayerToTeam(swap.fromTeamId, swap.playerId, toTeamId);
    setSwap(null);
  };

  const toggleTeamStats = (teamId: string) => {
    setTeamStatsOpen((current) => ({
      ...current,
      [teamId]: !current[teamId],
    }));
  };

  if (attendingPlayers.length < 2 && teams.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-220px)] flex-col gap-3">
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p className="max-w-xs text-sm font-semibold leading-relaxed text-muted-foreground">
            Choose at least 2 players to make teams.
          </p>
          {onEditPlayers && (
            <button
              type="button"
              onClick={onEditPlayers}
              className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#102A43] shadow-sm transition hover:bg-slate-50 active:scale-[0.96]"
              aria-label="Back to team setup"
              title="Back to team setup"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>
        {historyPanel && <div className="mt-auto">{historyPanel}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      {/* Controls */}
      <div className="bg-card border border-border px-3 py-2.5 rounded-xl shadow-sm flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          {onEditPlayers && (
            <button
              type="button"
              onClick={onEditPlayers}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#102A43] shadow-sm transition hover:bg-slate-50 active:scale-[0.96]"
              data-testid="button-edit-team-players"
              aria-label="Back to team setup"
              title="Back to team setup"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Current teams</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-black text-[#102A43]">
              <span>{numTeams} teams</span>
              <span className="text-slate-300">·</span>
              <span>{attendingPlayers.length} players</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50/80 p-2">
          <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Field</span>
          <Select value={fieldSize} onValueChange={v => setFieldSize(v as FieldSize)}>
            <SelectTrigger className="h-8 min-w-[112px] flex-1 rounded-lg border-slate-200 bg-white px-2 text-[12px] font-black capitalize shadow-none" data-testid="select-field-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small field</SelectItem>
              <SelectItem value="medium">Medium field</SelectItem>
              <SelectItem value="large">Large field</SelectItem>
            </SelectContent>
          </Select>
          <button type="button" onClick={() => setShowFieldHelp(v => !v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-[#102A43]" title="What does Field Size mean?" data-testid="button-field-help">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!undoStack.length || isGenerating}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#102A43] shadow-sm transition hover:bg-slate-50 active:scale-[0.96] disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none"
            title="Undo last team change"
            aria-label="Undo last team change"
            data-testid="button-team-undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>

          <Button
            className={`stripes-shuffle-button h-11 min-w-0 rounded-xl px-4 text-[13px] font-black text-white transition-all lg:h-12 lg:text-sm ${isGenerating ? "ring-4 ring-slate-300/35" : ""}`}
            onClick={() => handleGenerate(true)}
            disabled={isGenerating}
            title="Shuffle teams"
            data-testid="button-shuffle"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Shuffle className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
              {isGenerating ? "Balancing" : "Shuffle teams"}
            </span>
          </Button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!redoStack.length || isGenerating}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#102A43] shadow-sm transition hover:bg-slate-50 active:scale-[0.96] disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none"
            title="Redo team change"
            aria-label="Redo team change"
            data-testid="button-team-redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {isGenerating && (
          <div className="rounded-lg border border-emerald-300/35 bg-emerald-50/80 px-3 py-2 text-[11px] font-black text-emerald-700 shadow-inner">
            <div className="flex items-center gap-2">
              <Shuffle className="w-3.5 h-3.5 animate-spin" />
              <span>{TEAM_DRAW_STEPS[drawStep]}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full w-2/3 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
        )}

        {showFieldHelp && (
          <div className="rounded-lg bg-muted/50 border border-border p-2 text-[10px] leading-snug text-muted-foreground">
            <p><span className="font-black text-foreground">Small:</span> 4v4–5v5. Passing and quick play matter more; stamina/speed matter a little less.</p>
            <p><span className="font-black text-foreground">Medium:</span> 6v6–8v8. Balanced weighting.</p>
            <p><span className="font-black text-foreground">Large:</span> bigger pitch. Stamina and speed matter more.</p>
          </div>
        )}


      </div>

      {/* Swap banner */}
      {swap && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="text-xs font-semibold text-primary flex-1">
            Selected <span className="font-black">{displayName(teams.flatMap(t => t.players).find(p => p.id === swap.playerId) || { name: "player" })}</span> — tap another player to swap, or tap Move here on a team
          </p>
          <button className="text-[10px] text-muted-foreground underline shrink-0" onClick={() => setSwap(null)} data-testid="button-cancel-swap">Cancel</button>
        </div>
      )}

      {/* Teams grid — 2 columns */}
      {teams.length > 0 && (
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3 transition-opacity duration-300 ${isGenerating ? "opacity-50" : "opacity-100"}`}>
          {teams.map((team, index) => {
            const col = colorFor(team.color);
            const accentColor = team.color === "white" ? "hsl(var(--border))" : col.hex;
            const isSwapDest = swap && swap.fromTeamId !== team.id;
            const notHereCount = team.players.filter(isNotHereYet).length;
            const avgSkill = team.averageSkill.toFixed(1);
            const totalSkill = team.totalSkill.toFixed(1);
            const showingStats = Boolean(teamStatsOpen[team.id]);
            const statsRows = teamStatRows(team.players);

            return (
              <div
                key={team.id}
                className={`relative rounded-xl overflow-hidden border-2 bg-card shadow-sm transition-all duration-300 ${justGenerated ? "animate-in fade-in zoom-in-95" : ""} ${desktopDropTarget?.teamId === team.id && !desktopDropTarget.playerId ? "ring-4 ring-primary/25" : ""}`}
                style={{
                  borderColor: team.color === "white" ? "hsl(var(--border))" : `${col.hex}${isSwapDest ? "cc" : "88"}`,
                  animationDelay: justGenerated ? `${index * 90}ms` : undefined,
                  boxShadow: justGenerated ? `0 0 0 1px ${accentColor}33, 0 10px 24px ${accentColor}18` : undefined,
                }}
                data-team-drop-id={team.id}
                onDragOver={(event) => {
                  if (!desktopDrag) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDesktopDropTarget({ teamId: team.id });
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  setDesktopDropTarget((current) => current?.teamId === team.id ? null : current);
                }}
                onDrop={(event) => dropDesktopPlayerOnTeam(event, team.id)}
                data-testid={`card-team-${team.id}`}
              >
                {/* Header */}
                <div className="bg-card px-3 pt-2 pb-1.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1 min-w-0">
                      {editingTeamId === team.id ? (
                        <input
                          className="min-w-0 w-full max-w-[8rem] rounded-md border border-border bg-background px-1.5 py-0.5 text-sm font-black leading-tight text-foreground outline-none focus:border-primary"
                          value={editingTeamName}
                          autoFocus
                          onChange={e => setEditingTeamName(e.target.value)}
                          onBlur={commitTeamName}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitTeamName();
                            if (e.key === "Escape") cancelTeamNameEdit();
                          }}
                          data-testid={`input-team-name-${team.id}`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditingTeamName(team.id, team.name)}
                          className="min-w-0 truncate text-left text-sm font-black lg:text-[17px] leading-tight text-foreground hover:text-primary"
                          title="Tap to rename team"
                          data-testid={`button-team-name-${team.id}`}
                        >
                          {team.name}
                        </button>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      {!isSharedRoster && (
                        <button
                          type="button"
                          onClick={() => toggleTeamStats(team.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-[9px] font-black text-slate-600 active:scale-[0.97]"
                          title={showingStats ? "Show players" : "Show team stats"}
                          data-testid={`button-team-stats-${team.id}`}
                        >
                          {showingStats ? <List className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
                          <span className="hidden sm:inline">{showingStats ? "List" : "Stats"}</span>
                        </button>
                      )}

                      {/* Team color selector */}
                      <Select value={team.color} onValueChange={v => handleColorChange(team.id, v as TeamColor)}>
                        <SelectTrigger
                          className="h-7 w-7 border-0 p-0 shadow-none bg-transparent hover:bg-transparent text-muted-foreground hover:text-foreground outline-none ring-0 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:bg-transparent data-[state=open]:ring-0 [&>svg:last-child]:hidden"
                          style={{ color: accentColor }}
                          title={`Change team color (${col.label})`}
                          data-testid={`select-team-color-${team.id}`}
                        >
                          <Palette className="h-4 w-4" />
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_OPTIONS.map(c => (
                            <SelectItem key={c.value} value={c.value} data-testid={`color-${team.id}-${c.value}`}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold lg:text-[13px] leading-tight text-muted-foreground">
                    <span>
                      {showingStats
                        ? `Avg ${avgSkill} · ${team.players.length} player${team.players.length === 1 ? "" : "s"}`
                        : `Avg ${avgSkill} · Total ${totalSkill}`}
                    </span>
                    {notHereCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-100 px-1 py-0.5 text-[8px] font-black text-amber-800"
                        title={`${notHereCount} not here yet`}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        {notHereCount}
                      </span>
                    )}
                  </div>
                  {isSwapDest && (
                    <button
                      onClick={() => handleMoveTo(team.id)}
                      className="mt-1.5 w-full rounded-md py-1 text-[10px] font-black uppercase tracking-widest text-white"
                      style={{ backgroundColor: accentColor }}
                      data-testid={`button-moveto-${team.id}`}
                    >
                      Move here
                    </button>
                  )}
                </div>

                {showingStats && !isSharedRoster ? (
                  <div className="bg-card border-t border-border px-3 py-3">
                    <div className="space-y-1.5">
                      {statsRows.map((stat) => {
                        const pct = stat.max > 0 ? Math.max(0, Math.min(100, (stat.value / stat.max) * 100)) : 0;
                        return (
                          <div key={stat.key} className="grid grid-cols-[2.4rem_1fr_2rem] items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-tight text-slate-500">{stat.label}</span>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${pct}%`, backgroundColor: accentColor }}
                              />
                            </div>
                            <span className="text-right text-[9px] font-black tabular-nums text-slate-600">{stat.value.toFixed(1)}</span>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-[9px] font-semibold leading-snug text-slate-400">
                      Style averages for attack, passing, defense, speed, and stamina.
                    </p>
                  </div>
                ) : (
                  <div className="bg-card divide-y divide-border">
                    {team.players.length === 0 ? (
                      <p className="py-3 text-center text-[10px] text-muted-foreground italic">Empty</p>
                    ) : (
                      team.players.map(player => {
                        const isSelected = swap?.playerId === player.id && swap?.fromTeamId === team.id;
                        return (
                          <button
                            key={player.id}
                            className={`relative w-full flex select-none items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors lg:cursor-grab lg:px-3 lg:py-2.5 ${desktopDrag?.playerId === player.id && desktopDrag?.fromTeamId === team.id ? "opacity-45" : ""} ${desktopDropTarget?.teamId === team.id && desktopDropTarget?.playerId === player.id ? "bg-primary/10 ring-2 ring-inset ring-primary/30" : ""}`}
                            style={{
                              backgroundColor: isSelected ? `${accentColor}20` : undefined,
                              borderLeft: isSelected ? `3px solid ${accentColor}` : "3px solid transparent",
                            }}
                            draggable
                            onDragStart={(event) => beginDesktopPlayerDrag(event, player.id, team.id)}
                            onDragEnd={finishDesktopPlayerDrag}
                            onDragOver={(event) => {
                              if (!desktopDrag) return;
                              event.preventDefault();
                              event.stopPropagation();
                              event.dataTransfer.dropEffect = "move";
                              setDesktopDropTarget({ teamId: team.id, playerId: player.id });
                            }}
                            onDrop={(event) => dropDesktopPlayerOnPlayer(event, team.id, player.id)}
                            onClick={() => {
                              if (suppressPlayerClickRef.current) return;
                              handleSelectPlayer(player.id, team.id);
                            }}
                            data-testid={`player-row-${player.id}-team-${team.id}`}
                          >
                            {isSelected && (
                              <ArrowLeftRight className="absolute left-1 top-1/2 w-2.5 h-2.5 -translate-y-1/2" style={{ color: accentColor }} />
                            )}
                            <div className={`min-w-0 flex-1 ${isSelected ? "pl-3" : ""}`}>
                              <div className="font-bold text-xs truncate text-left lg:text-[15px]">{displayName(player)}</div>
                              {(player.isNew || player.isGoalkeeper || player.isOrganizer || isNotHereYet(player)) && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                                  {player.isNew && <NewBadge />}
                                  {player.isGoalkeeper && <GKBadge />}
                                  {player.isOrganizer && <ORGBadge />}
                                  {isNotHereYet(player) && <NotHereBadge />}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <GenderBadge gender={player.gender} />
                              {!isSharedRoster && showPlayerSkillNumbers && (
                                <span className="min-w-7 h-5 px-1 flex items-center justify-center rounded bg-gradient-to-br from-slate-100 to-slate-200 text-[#102A43] text-[10px] font-black border border-slate-200">
                                  {player.skill === 0 ? "N" : player.skill}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {teams.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className={`h-9 rounded-xl border-slate-200 bg-white px-3 text-[12px] font-black tracking-tight text-[#102A43] shadow-sm hover:bg-slate-50 ${tutorialStep === "present" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
            onClick={() => { setPresentTeamsOpen(true); onTutorialAction?.("presented"); }}
            disabled={isGenerating}
            title="Show teams full screen"
            data-testid="button-present-teams"
          >
            <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
            Present Teams
          </Button>
        </div>
      )}

      {presentTeamsOpen && teams.length > 0 && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[90] flex overflow-hidden bg-slate-950 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Present teams"
          data-present-teams-version={PRESENT_TEAMS_SCROLL_FIX_VERSION}
          style={{ height: "100dvh", minHeight: "100svh", maxHeight: "100dvh" }}
        >
          <div className="flex min-h-0 h-full w-full flex-col overflow-hidden">
            {tutorialStep === "close-presentation" && <div className="pointer-events-none fixed inset-0 z-[91] bg-slate-950/50" aria-hidden="true" />}
            <div className="relative z-[92] flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Stripes</p>
                <h2 className="truncate text-lg font-black tracking-tight">Teams</h2>
                <p className="truncate text-[10px] font-semibold text-slate-400">{teamsDateLabel()}</p>
              </div>
              <button
                type="button"
                onClick={() => { setPresentTeamsOpen(false); onTutorialAction?.("presentation-closed"); }}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:scale-[0.98] ${tutorialStep === "close-presentation" ? "fairteams-tutorial-pulse fairteams-presentation-close-target" : ""}`}
                aria-label="Close full screen teams"
                data-testid="button-close-present-teams"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 py-2"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="mx-auto grid max-w-5xl grid-cols-2 gap-1.5">
                {teams.map((team) => {
                  const col = colorFor(team.color);
                  const borderColor = team.color === "white" ? "#E2E8F0" : col.hex;
                  return (
                    <div
                      key={team.id}
                      className="overflow-hidden rounded-xl border-2 bg-white text-[#102A43] shadow-xl"
                      style={{ borderColor }}
                    >
                      <div className="flex items-center justify-between gap-1.5 px-2 py-1.5" style={{ borderBottom: `2px solid ${borderColor}` }}>
                        <div className="min-w-0 truncate text-[15px] font-black leading-tight sm:text-[17px]">{team.name}</div>
                        <div className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">
                          {team.players.length}
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {team.players.length === 0 ? (
                          <p className="px-2 py-1.5 text-[12px] font-bold text-slate-400">Empty</p>
                        ) : team.players.map((player) => (
                          <div key={player.id} className="flex min-h-[1.65rem] items-center justify-between gap-1 px-2 py-1">
                            <div className="min-w-0 truncate text-[13px] font-black leading-tight sm:text-[15px]">{displayName(player)}</div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {player.isGoalkeeper && <GKBadge />}
                              {player.isOrganizer && <ORGBadge />}
                              {isNotHereYet(player) && <NotHereBadge />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {gameToolsOpen && (
              <div className="shrink-0 border-t border-white/10 bg-slate-900/95 px-2 py-2">
                <div className="mx-auto flex max-w-5xl gap-2">
                  <button
                    type="button"
                    onClick={() => { setCardScreen("yellow"); setGameToolsOpen(false); }}
                    className="flex h-10 flex-1 items-center justify-center rounded-2xl bg-yellow-300 px-2 text-[12px] font-black text-yellow-950 active:scale-[0.98]"
                    data-testid="button-game-tool-yellow-card"
                  >
                    <Square className="mr-1.5 h-4 w-4 fill-current" />
                    Yellow
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCardScreen("red"); setGameToolsOpen(false); }}
                    className="flex h-10 flex-1 items-center justify-center rounded-2xl bg-red-600 px-2 text-[12px] font-black text-white active:scale-[0.98]"
                    data-testid="button-game-tool-red-card"
                  >
                    <Square className="mr-1.5 h-4 w-4 fill-current" />
                    Red
                  </button>
                </div>
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <p className="min-w-0 text-[11px] font-semibold leading-snug text-slate-400">
                Show this screen to players. Save only when you need an image.
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setGameToolsOpen(open => !open)}
                  className={`inline-flex h-9 items-center justify-center rounded-2xl px-3 text-[12px] font-black active:scale-[0.98] ${gameToolsOpen ? "bg-emerald-300 text-[#102A43]" : "border border-white/15 bg-white/10 text-white"}`}
                  aria-expanded={gameToolsOpen}
                  data-testid="button-present-game-tools"
                >
                  Game Tools
                </button>
                <button
                  type="button"
                  onClick={() => void exportTeamsAsJpg(teams, fieldSize)}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-white px-3 text-[12px] font-black text-[#102A43] active:scale-[0.98]"
                  data-testid="button-present-save-image"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Save Image
                </button>
              </div>
            </div>

            {cardScreen && (
              <button
                type="button"
                onClick={() => setCardScreen(null)}
                className="fixed inset-0 z-[110] block h-full w-full border-0 p-0 active:scale-100"
                style={{ backgroundColor: cardScreen === "yellow" ? "#facc15" : "#dc2626" }}
                aria-label={`Close ${cardScreen} card screen`}
                data-testid={`screen-${cardScreen}-card`}
              />
            )}
          </div>
        </div>,
        document.body
      )}

      {historyPanel}
    </div>
  );
}
