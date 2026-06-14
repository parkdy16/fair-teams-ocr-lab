import React, { useEffect, useRef, useState } from "react";
import type { RoomPlayer } from "@/lib/localRoster";
import { FieldSize, Player, Team, TeamColor } from "@/lib/types";
import { generateTeams, recomputeStats } from "@/lib/teamGenerator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Shuffle, ArrowLeftRight, Download, HelpCircle, Clock, Palette, Zap, Sparkles, BarChart3, List } from "lucide-react";
import fairTeamsLogo from "@/assets/fairteams-logo.png";

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

function averageStat(players: Player[], key: keyof Pick<Player, "attack" | "passing" | "defense" | "speed" | "stamina" | "teamPlay">) {
  if (players.length === 0) return 0;
  return Number((players.reduce((sum, player) => sum + Number(player[key] || 0), 0) / players.length).toFixed(1));
}

function teamStatRows(players: Player[]) {
  return [
    { key: "attack", label: "Atk", value: averageStat(players, "attack"), max: 10 },
    { key: "passing", label: "Pass", value: averageStat(players, "passing"), max: 10 },
    { key: "defense", label: "Def", value: averageStat(players, "defense"), max: 10 },
    { key: "speed", label: "Speed", value: averageStat(players, "speed"), max: 10 },
    { key: "stamina", label: "Stam", value: averageStat(players, "stamina"), max: 10 },
    { key: "teamPlay", label: "Team", value: averageStat(players, "teamPlay"), max: 3 },
  ];
}

const FIELD_SIZE_STORAGE_KEY = "fair-teams-field-size-v1";
const TEAM_HISTORY_STORAGE_KEY = "fair-teams-team-history-v1";

const TEAM_DRAW_STEPS = [
  "Spreading strong players…",
  "Checking teamplay…",
  "Balancing defense…",
  "Finalizing teams…",
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
  const TITLE_H = 78;
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

  // App-style wordmark, no logo image in export
  ctx.textAlign = "center";
  ctx.font = `900 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const fair = "FAIR";
  const teamsText = " TEAMS";
  const fairW = ctx.measureText(fair).width;
  const teamsW = ctx.measureText(teamsText).width;
  const startX = CANVAS_W / 2 - (fairW + teamsW) / 2;
  ctx.fillStyle = "#102A43";
  ctx.fillText(fair, startX + fairW / 2, 34);
  ctx.fillStyle = "#16A34A";
  ctx.fillText(teamsText, startX + fairW + teamsW / 2, 34);

  ctx.fillStyle = "#16A34A";
  ctx.font = `800 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const dateText = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  ctx.fillText(dateText, CANVAS_W / 2, 56);
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

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.07)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, CARD_W, h, 10);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = colOpt.hex;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, CARD_W, h, 10);
    ctx.stroke();

    // Team header: minimal, no icons
    ctx.fillStyle = colOpt.hex;
    ctx.font = `900 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(team.name, x + CARD_PAD_X, y + 23);

    ctx.fillStyle = "#64748B";
    ctx.font = `700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(`${team.players.length} ${team.players.length === 1 ? "player" : "players"}`, x + CARD_PAD_X, y + 38);

    ctx.strokeStyle = colOpt.hex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + CARD_PAD_X, y + TEAM_HEADER_H);
    ctx.lineTo(x + CARD_W - CARD_PAD_X, y + TEAM_HEADER_H);
    ctx.stroke();

    let playerY = y + TEAM_HEADER_H + CARD_PAD_Y + 13;
    const playerX = x + CARD_PAD_X;
    const badgeRight = x + CARD_W - CARD_PAD_X;

    if (team.players.length === 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = `italic 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillText("No players", playerX, playerY);
    } else {
      team.players.forEach(player => {
        ctx.fillStyle = "#102A43";
        ctx.font = `800 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
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
  a.download = `fair-teams-${new Date().toISOString().slice(0, 10)}.jpg`;
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


export function TeamsTab({ players }: { players: RoomPlayer[] }) {
  const [numTeams, setNumTeams] = useState<number>(2);
  const [fieldSize, setFieldSize] = useState<FieldSize>(() => loadFieldSize());
  const [showFieldHelp, setShowFieldHelp] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamStatsOpen, setTeamStatsOpen] = useState<Record<string, boolean>>({});
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [history, setHistory] = useState<TeamHistoryEntry[]>(() => loadTeamHistory());
  const [swap, setSwap] = useState<SwapSelection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [drawStep, setDrawStep] = useState(0);
  const [justGenerated, setJustGenerated] = useState(false);
  const generateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(FIELD_SIZE_STORAGE_KEY, fieldSize);
  }, [fieldSize]);

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

  const attendingPlayers = players.filter(p => p.attending).map(toLocalPlayer);
  const hereNowCount = attendingPlayers.filter(p => !isNotHereYet(p)).length;
  const notHereYetPlayers = attendingPlayers.filter(isNotHereYet);

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
            onClick={() => { setTeams(entry.teams); setFieldSize(entry.fieldSize); setNumTeams(entry.numTeams); setSwap(null); setTeamStatsOpen({}); }}
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

  const handleGenerate = (shuffleEquals = false) => {
    if (attendingPlayers.length < 2 || isGenerating) return;
    setSwap(null);
    setTeamStatsOpen({});
    setJustGenerated(false);
    setIsGenerating(true);
    setDrawStep(0);

    const nextTeams = generateTeams(attendingPlayers, numTeams, shuffleEquals, fieldSize);

    if (generateTimerRef.current !== null) window.clearTimeout(generateTimerRef.current);
    generateTimerRef.current = window.setTimeout(() => {
      setTeams(nextTeams);
      const entry: TeamHistoryEntry = {
        id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        fieldSize,
        numTeams,
        totalPlayers: attendingPlayers.length,
        teams: nextTeams,
      };
      setHistory(prev => [entry, ...prev].slice(0, 10));
      setIsGenerating(false);
      setJustGenerated(true);
      window.setTimeout(() => setJustGenerated(false), 1200);
    }, 880);
  };

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
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center gap-3">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
            <Zap className="w-6 h-6 text-muted-foreground opacity-40" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Select at least 2 players in the Today tab to generate teams.
          </p>
        </div>
        {historyPanel && <div className="mt-auto">{historyPanel}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="bg-card border border-border px-3 py-2.5 rounded-xl shadow-sm flex flex-col gap-2">
        <div className={teams.length > 0 ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end" : "grid grid-cols-2 md:grid-cols-[1fr_1fr_auto] gap-2"}>
          <div className="flex flex-col gap-1 min-w-0">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Teams</Label>
            <Select value={numTeams.toString()} onValueChange={v => setNumTeams(parseInt(v))}>
              <SelectTrigger className="h-10 px-2 py-0 font-bold text-[13px] leading-normal [&>span]:leading-normal" data-testid="select-num-teams">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6].map(n => (
                  <SelectItem key={n} value={n.toString()} data-testid={`option-teams-${n}`}>{n} Teams</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Field Size</Label>
              <button type="button" onClick={() => setShowFieldHelp(v => !v)} className="text-muted-foreground hover:text-primary" title="What does Field Size mean?" data-testid="button-field-help">
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
            <Select value={fieldSize} onValueChange={v => setFieldSize(v as FieldSize)}>
              <SelectTrigger className="h-10 px-2 py-0 font-bold text-[13px] leading-normal [&>span]:leading-normal" data-testid="select-field-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant={teams.length > 0 ? "outline" : undefined}
            className={teams.length > 0
              ? `h-10 px-3 rounded-xl border-2 text-[12px] font-black tracking-tight shadow-sm transition-all ${isGenerating ? "ring-4 ring-slate-200/70" : ""}`
              : `col-span-2 md:col-span-1 h-10 w-full px-4 font-black uppercase tracking-wide text-[13px] shadow-sm bg-[#22C55E] text-white hover:bg-[#16A34A] transition-all ${isGenerating ? "ring-4 ring-emerald-300/45 shadow-lg shadow-emerald-400/25" : ""}`
            }
            onClick={() => handleGenerate(teams.length > 0)}
            disabled={isGenerating}
            title={teams.length > 0 ? "Shuffle teams" : "Generate teams"}
            data-testid={teams.length > 0 ? "button-shuffle" : "button-generate"}
          >
            <span className="inline-flex items-center gap-1.5">
              {isGenerating ? <Shuffle className="w-3.5 h-3.5 animate-spin" /> : teams.length > 0 ? <Shuffle className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isGenerating ? "Balancing" : teams.length > 0 ? "Shuffle" : "Generate"}
            </span>
          </Button>
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
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 transition-opacity duration-300 ${isGenerating ? "opacity-50" : "opacity-100"}`}>
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
                className={`relative rounded-xl overflow-hidden border-2 bg-card shadow-sm transition-all duration-300 ${justGenerated ? "animate-in fade-in zoom-in-95" : ""}`}
                style={{
                  borderColor: team.color === "white" ? "hsl(var(--border))" : `${col.hex}${isSwapDest ? "cc" : "88"}`,
                  animationDelay: justGenerated ? `${index * 90}ms` : undefined,
                  boxShadow: justGenerated ? `0 0 0 1px ${accentColor}33, 0 10px 24px ${accentColor}18` : undefined,
                }}
                data-team-drop-id={team.id}
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
                          className="min-w-0 truncate text-left text-sm font-black leading-tight text-foreground hover:text-primary"
                          title="Tap to rename team"
                          data-testid={`button-team-name-${team.id}`}
                        >
                          {team.name}
                        </button>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
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
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold leading-tight text-muted-foreground">
                    <span>Avg {avgSkill} · Total {totalSkill}</span>
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

                {showingStats ? (
                  <div className="bg-card border-t border-border px-3 py-3">
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-center">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Avg</div>
                        <div className="text-base font-black text-[#102A43]">{avgSkill}</div>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-center">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Players</div>
                        <div className="text-base font-black text-[#102A43]">{team.players.length}</div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {statsRows.map((stat) => {
                        const pct = stat.max > 0 ? Math.max(0, Math.min(100, (stat.value / stat.max) * 100)) : 0;
                        const displayValue = stat.key === "teamPlay" ? `${stat.value.toFixed(1)}/3` : stat.value.toFixed(1);
                        return (
                          <div key={stat.key} className="grid grid-cols-[2.4rem_1fr_2rem] items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-tight text-slate-500">{stat.label}</span>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${pct}%`, backgroundColor: accentColor }}
                              />
                            </div>
                            <span className="text-right text-[9px] font-black tabular-nums text-slate-600">{displayValue}</span>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-[9px] font-semibold leading-snug text-slate-400">
                      Team averages. Use this to spot big style gaps after generating.
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
                            className="relative w-full flex select-none items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors"
                            style={{
                              backgroundColor: isSelected ? `${accentColor}20` : undefined,
                              borderLeft: isSelected ? `3px solid ${accentColor}` : "3px solid transparent",
                            }}
                            onClick={() => handleSelectPlayer(player.id, team.id)}
                            data-testid={`player-row-${player.id}-team-${team.id}`}
                          >
                            {isSelected && (
                              <ArrowLeftRight className="absolute left-1 top-1/2 w-2.5 h-2.5 -translate-y-1/2" style={{ color: accentColor }} />
                            )}
                            <div className={`min-w-0 flex-1 ${isSelected ? "pl-3" : ""}`}>
                              <div className="font-bold text-xs truncate text-left">{displayName(player)}</div>
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
                              <span className="min-w-7 h-5 px-1 flex items-center justify-center rounded bg-gradient-to-br from-slate-100 to-slate-200 text-[#102A43] text-[10px] font-black border border-slate-200">
                                {player.skill === 0 ? "N" : player.skill}
                              </span>
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
            className="h-9 rounded-xl px-3 text-[12px] font-black tracking-tight bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void exportTeamsAsJpg(teams, fieldSize)}
            disabled={isGenerating}
            title="Save teams as image"
            data-testid="button-export"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Save Image
          </Button>
        </div>
      )}

      {historyPanel}
    </div>
  );
}
