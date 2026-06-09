import React, { useEffect, useRef, useState } from "react";
import type { RoomPlayer } from "@/lib/localRoster";
import { FieldSize, Player, Team, TeamColor } from "@/lib/types";
import { generateTeams, recomputeStats } from "@/lib/teamGenerator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Shuffle, ArrowLeftRight, Download, HelpCircle, Clock, Pencil, Zap, Sparkles } from "lucide-react";
import fairTeamsLogo from "@/assets/fairteams-logo.png";

const COLOR_OPTIONS: { value: TeamColor; label: string; hex: string; textHex: string }[] = [
  { value: "red",    label: "Red",    hex: "#ef4444", textHex: "#fff"    },
  { value: "blue",   label: "Blue",   hex: "#3b82f6", textHex: "#fff"    },
  { value: "lime",   label: "Lime",   hex: "#84cc16", textHex: "#1a1a1a" },
  { value: "yellow", label: "Yellow", hex: "#facc15", textHex: "#1a1a1a" },
  { value: "orange", label: "Orange", hex: "#f97316", textHex: "#fff"    },
  { value: "black",  label: "Black",  hex: "#102A43", textHex: "#fff"    },
];

function colorFor(color: TeamColor) {
  return COLOR_OPTIONS.find(c => c.value === color) ?? COLOR_OPTIONS[0]!;
}

function GKBadge() {
  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800 border border-emerald-200">GK</span>;
}

function ORGBadge() {
  return <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-800 border border-violet-200">ORG</span>;
}

function NewBadge() {
  return <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-800 border border-sky-200">NEW</span>;
}

function displayName(player: Pick<Player, "name" | "aka">) {
  const aka = player.aka?.trim();
  return aka ? `${player.name} (${aka})` : player.name;
}

function GenderBadge({ gender }: { gender?: string }) {
  const normalized = (gender ?? "other").toLowerCase();
  if (normalized === "female") {
    return <span className="text-[10px] font-black text-pink-600">F</span>;
  }
  if (normalized === "male") {
    return <span className="text-[10px] font-black text-blue-600">M</span>;
  }
  return <span className="text-[10px] font-black text-purple-500">O</span>;
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
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
    isOrganizer: p.isOrganizer, isNew: p.isNew,
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
  const TITLE_H = 104;
  const TEAM_HEADER_H = 34;
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

  ctx.fillStyle = "#102A43";
  ctx.font = `900 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText("Today's Teams", CANVAS_W / 2, 62);

  ctx.fillStyle = "#16A34A";
  ctx.font = `800 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const dateText = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  ctx.fillText(dateText, CANVAS_W / 2, 82);
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
    ctx.fillText(team.name, x + CARD_PAD_X, y + 24);

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
        ctx.fillText(displayName(player), playerX, playerY);

        let badgeX = badgeRight;
        const badgeY = playerY - 13;
        if (player.isOrganizer) {
          badgeX -= 32;
          drawTextBadge(ctx, "ORG", badgeX, badgeY, "#EA580C", "#FFEDD5", "#FDBA74");
        }
        if (player.isGoalkeeper) {
          badgeX -= 34;
          drawTextBadge(ctx, "GK", badgeX, badgeY, "#15803D", "#DCFCE7", "#86EFAC");
        }

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

  const handleGenerate = (shuffleEquals = false) => {
    if (attendingPlayers.length < 2 || isGenerating) return;
    setSwap(null);
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

  const handleRenameTeam = (teamId: string, currentName: string) => {
    const nextName = window.prompt("Team name", currentName);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, name: trimmed } : t));
  };

  const handleSelectPlayer = (playerId: string, fromTeamId: string) => {
    if (swap?.playerId === playerId && swap?.fromTeamId === fromTeamId) setSwap(null);
    else setSwap({ playerId, fromTeamId });
  };

  const handleMoveTo = (toTeamId: string) => {
    if (!swap) return;
    const { playerId, fromTeamId } = swap;
    if (toTeamId === fromTeamId) { setSwap(null); return; }
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
    setSwap(null);
  };

  if (attendingPlayers.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
          <Zap className="w-6 h-6 text-muted-foreground opacity-40" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">
          Select at least 2 players in the Today tab to generate teams.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="bg-card border border-border px-3 py-2.5 rounded-xl shadow-sm flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
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
            className={`col-span-2 h-10 w-full px-4 font-black uppercase tracking-wide text-[13px] shadow-sm bg-[#22C55E] text-white hover:bg-[#16A34A] transition-all ${isGenerating ? "ring-4 ring-emerald-300/45 shadow-lg shadow-emerald-400/25" : ""}`}
            onClick={() => handleGenerate(false)}
            disabled={isGenerating}
            data-testid="button-generate"
          >
            <span className="inline-flex items-center gap-1.5">
              {isGenerating ? <Shuffle className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isGenerating ? "Balancing" : "Generate"}
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
            <p><span className="font-black text-foreground">Small:</span> 4v4–5v5. Passing, attack and defense matter more.</p>
            <p><span className="font-black text-foreground">Medium:</span> 6v6–8v8. Balanced weighting.</p>
            <p><span className="font-black text-foreground">Large:</span> all abilities are weighted equally.</p>
          </div>
        )}

        {teams.length > 0 && (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="icon" className="h-9 w-9 border-2 shrink-0" onClick={() => handleGenerate(true)} disabled={isGenerating} title="Shuffle" data-testid="button-shuffle">
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 border-2 shrink-0" onClick={() => void exportTeamsAsJpg(teams, fieldSize)} disabled={isGenerating} title="Export as JPG" data-testid="button-export">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Swap banner */}
      {swap && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="text-xs font-semibold text-primary flex-1">
            Moving <span className="font-black">{displayName(teams.flatMap(t => t.players).find(p => p.id === swap.playerId) || { name: "player" })}</span> — tap a team to move there
          </p>
          <button className="text-[10px] text-muted-foreground underline shrink-0" onClick={() => setSwap(null)} data-testid="button-cancel-swap">Cancel</button>
        </div>
      )}

      {/* Teams grid — 2 columns */}
      {teams.length > 0 && (
        <div className={`grid grid-cols-2 gap-2 transition-opacity duration-300 ${isGenerating ? "opacity-50" : "opacity-100"}`}>
          {teams.map((team, index) => {
            const col = colorFor(team.color);
            const isSwapDest = swap && swap.fromTeamId !== team.id;

            return (
              <div
                key={team.id}
                className={`rounded-xl overflow-hidden border-2 shadow-sm transition-all duration-300 ${justGenerated ? "animate-in fade-in zoom-in-95" : ""}`}
                style={{
                  borderColor: isSwapDest ? col.hex : "hsl(var(--border))",
                  animationDelay: justGenerated ? `${index * 90}ms` : undefined,
                  boxShadow: justGenerated ? `0 0 0 1px ${col.hex}33, 0 10px 24px ${col.hex}18` : undefined,
                }}
                data-testid={`card-team-${team.id}`}
              >
                {/* Header */}
                <div className="px-2.5 pt-2 pb-1.5" style={{ backgroundColor: col.hex }}>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-xs font-black uppercase tracking-wide leading-tight truncate" style={{ color: col.textHex }}>{team.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRenameTeam(team.id, team.name)}
                        className="h-5 w-5 inline-flex items-center justify-center rounded-full shrink-0"
                        style={{ color: col.textHex, backgroundColor: col.textHex === "#fff" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.08)" }}
                        title="Rename team"
                        data-testid={`button-rename-team-${team.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {/* Color swatches */}
                  <div className="flex gap-1 mb-1">
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => handleColorChange(team.id, c.value)}
                        title={c.label}
                        data-testid={`color-${team.id}-${c.value}`}
                        className="rounded-full transition-transform hover:scale-110 active:scale-95 shrink-0"
                        style={{
                          width: 13, height: 13,
                          backgroundColor: c.hex,
                          border: team.color === c.value ? `2px solid ${col.textHex}` : "1.5px solid rgba(255,255,255,0.3)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-[9px] font-bold opacity-85 leading-tight" style={{ color: col.textHex }}>
                    {team.players.length}p · Total {team.totalSkill} · Avg {team.averageSkill}
                  </div>
                  {isSwapDest && (
                    <button
                      onClick={() => handleMoveTo(team.id)}
                      className="mt-1.5 w-full rounded-md py-1 text-[10px] font-black uppercase tracking-widest"
                      style={{ backgroundColor: col.textHex === "#fff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)", color: col.textHex, border: `1px solid ${col.textHex}` }}
                      data-testid={`button-moveto-${team.id}`}
                    >
                      Move here
                    </button>
                  )}
                </div>

                {/* Player list */}
                <div className="bg-card divide-y divide-border">
                  {team.players.length === 0 ? (
                    <p className="py-3 text-center text-[10px] text-muted-foreground italic">Empty</p>
                  ) : (
                    team.players.map(player => {
                      const isSelected = swap?.playerId === player.id && swap?.fromTeamId === team.id;
                      return (
                        <button
                          key={player.id}
                          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors"
                          style={{
                            backgroundColor: isSelected ? `${col.hex}20` : undefined,
                            borderLeft: isSelected ? `3px solid ${col.hex}` : "3px solid transparent",
                          }}
                          onClick={() => handleSelectPlayer(player.id, team.id)}
                          data-testid={`player-row-${player.id}-team-${team.id}`}
                        >
                          <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" style={{ color: isSelected ? col.hex : "transparent" }} />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs truncate">{displayName(player)}</div>
                            {(player.isNew || player.isGoalkeeper || player.isOrganizer) && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {player.isNew && <NewBadge />}
                                {player.isGoalkeeper && <GKBadge />}
                                {player.isOrganizer && <ORGBadge />}
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
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
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
                onClick={() => { setTeams(entry.teams); setFieldSize(entry.fieldSize); setNumTeams(entry.numTeams); setSwap(null); }}
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
      )}
    </div>
  );
}
