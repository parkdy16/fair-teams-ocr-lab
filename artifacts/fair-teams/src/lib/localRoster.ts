import { FunBadge, Gender } from "@/lib/types";

export interface RoomPlayer {
  id: string;
  roomId: number;
  name: string;
  aka?: string;
  gender: Gender;
  skill: number;       // computed overall 0-10
  attack: number;      // 1-10
  defense: number;     // 1-10
  speed: number;       // 1-10
  passing: number;     // 1-10
  stamina: number;     // 1-10
  physical: number;    // 1-10
  teamPlay: number;    // 1-3 (low / average / high)
  profilePhoto?: string;
  isGoalkeeper?: boolean;
  isPlaymaker?: boolean;
  isFinisher?: boolean;
  isDribbler?: boolean;
  isSentinel?: boolean;
  isEngine?: boolean;
  isVersatile?: boolean;
  isSpaceFinder?: boolean;
  isOrganizer?: boolean;
  isNew?: boolean;
  funBadge?: FunBadge;
  attending: boolean;
  createdAt: string;
  updatedAt?: string;
}

const STORAGE_KEY = "fair-teams-local-roster-v1-profiles";
const LEGACY_STORAGE_KEY = "lazy-lousy-local-roster-v2-profiles";
const LEGACY_STORAGE_KEY_V1 = "lazy-lousy-local-roster-v1";

function createLocalPlayerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(num: unknown, min: number, max: number, fallback: number) {
  const n = Number(num);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function specialAbilityBonus(player: Partial<RoomPlayer>) {
  let bonus = 0;
  if (player.isPlaymaker) bonus += 0.3;
  if (player.isFinisher) bonus += 0.3;
  if (player.isSentinel) bonus += 0.3;
  if (player.isDribbler) bonus += 0.2;
  if (player.isEngine) bonus += 0.2;
  if (player.isVersatile) bonus += 0.2;
  if (player.isSpaceFinder) bonus += 0.3;
  return Math.min(0.9, bonus);
}

export function calculateOverall(player: Partial<RoomPlayer>) {
  const attack = clamp(player.attack, 1, 10, clamp(player.skill, 0, 10, 5));
  const defense = clamp(player.defense, 1, 10, clamp(player.skill, 0, 10, 5));
  const speed = clamp(player.speed, 1, 10, 5);
  const passing = clamp(player.passing, 1, 10, clamp(player.skill, 0, 10, 5));
  const stamina = clamp(player.stamina, 1, 10, 5);
  const physical = clamp(player.physical, 1, 10, 5);
  const teamPlay = clamp(player.teamPlay, 1, 3, 2);

  // Casual football OVA: football skills matter most; raw strength is only a small tie-breaker.
  const baseOverall =
    attack * 0.22 +
    defense * 0.22 +
    passing * 0.20 +
    speed * 0.20 +
    stamina * 0.12 +
    physical * 0.04;
  const teamPlayMultiplier = teamPlay === 1 ? 0.93 : teamPlay === 3 ? 1.07 : 1.0;
  const overall = baseOverall * teamPlayMultiplier + specialAbilityBonus(player);
  return Math.round(Math.min(10, overall) * 10) / 10;
}

function isFunBadge(value: unknown): value is FunBadge {
  return value === "loudmouth" || value === "warrior" || value === "samba" || value === "maradoner" || value === "reluctant-gk" || value === "first-10" || value === "always-late" || value === "unbothered" || value === "wildcard" || value === "third-half" || value === "club-ambassador" || value === "cfo" || value === "club-chef";
}

export function normalizePlayer(player: Partial<RoomPlayer> & { name?: string }, index = 0): RoomPlayer {
  const baseSkill = clamp(player.skill, 0, 10, 5);
  const normalized: RoomPlayer = {
    id: player.id || createLocalPlayerId(),
    roomId: 1,
    name: (player.name || `Player ${index + 1}`).trim(),
    aka: typeof player.aka === "string" && player.aka.trim() ? player.aka.trim() : undefined,
    gender: player.gender === "female" || player.gender === "other" ? player.gender : "male",
    skill: baseSkill,
    attack: clamp(player.attack, 1, 10, baseSkill || 5),
    defense: clamp(player.defense, 1, 10, baseSkill || 5),
    speed: clamp(player.speed, 1, 10, 5),
    passing: clamp(player.passing, 1, 10, baseSkill || 5),
    stamina: clamp(player.stamina, 1, 10, 5),
    physical: clamp(player.physical, 1, 10, 5),
    teamPlay: clamp(player.teamPlay, 1, 3, 2),
    profilePhoto: typeof player.profilePhoto === "string" ? player.profilePhoto : undefined,
    isGoalkeeper: Boolean(player.isGoalkeeper ?? false),
    isPlaymaker: Boolean(player.isPlaymaker ?? false),
    isFinisher: Boolean(player.isFinisher ?? false),
    isDribbler: Boolean(player.isDribbler ?? false),
    isSentinel: Boolean(player.isSentinel ?? false),
    isEngine: Boolean(player.isEngine ?? false),
    isVersatile: Boolean(player.isVersatile ?? false),
    isSpaceFinder: Boolean(player.isSpaceFinder ?? false),
    isOrganizer: Boolean(player.isOrganizer ?? false),
    isNew: Boolean(player.isNew ?? false),
    funBadge: isFunBadge(player.funBadge) ? player.funBadge : undefined,
    attending: Boolean(player.attending ?? false),
    createdAt: player.createdAt || new Date().toISOString(),
    updatedAt: player.updatedAt || player.createdAt || new Date().toISOString(),
  };
  normalized.skill = calculateOverall(normalized);
  return normalized;
}

export function loadPlayers(): RoomPlayer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY_V1);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p, i) => normalizePlayer(p, i)).filter(p => p.name);
  } catch {
    return [];
  }
}

export function savePlayers(players: RoomPlayer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players.map((p, i) => normalizePlayer(p, i))));
  } catch (error) {
    console.error("Could not save Fair Teams roster locally.", error);
  }
}

export function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function playersToCsv(players: RoomPlayer[]) {
  const headers = ["name", "aka", "gender", "overall", "attack", "defense", "speed", "passing", "stamina", "strength", "teamPlay", "isGoalkeeper", "isPlaymaker", "isFinisher", "isDribbler", "isSentinel", "isEngine", "isVersatile", "isSpaceFinder", "isOrganizer", "isNew", "funBadge", "attending", "createdAt", "updatedAt"];
  const rows = players.map(p => [p.name, p.aka || "", p.gender, p.skill, p.attack, p.defense, p.speed, p.passing, p.stamina, p.physical, p.teamPlay, p.isGoalkeeper ? "yes" : "no", p.isPlaymaker ? "yes" : "no", p.isFinisher ? "yes" : "no", p.isDribbler ? "yes" : "no", p.isSentinel ? "yes" : "no", p.isEngine ? "yes" : "no", p.isVersatile ? "yes" : "no", p.isSpaceFinder ? "yes" : "no", p.isOrganizer ? "yes" : "no", p.isNew ? "yes" : "no", p.funBadge || "", p.attending ? "yes" : "no", p.createdAt, p.updatedAt || ""]);
  return [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseBoolean(value: string | undefined) {
  const v = (value || "").toLowerCase().trim();
  return v === "true" || v === "yes" || v === "1" || v === "y";
}

export function csvToPlayers(csvText: string): RoomPlayer[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const first = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const hasHeader = first.includes("name") || first.includes("skill") || first.includes("gender") || first.includes("attack");
  const headers = hasHeader ? first : ["name", "gender", "skill", "speed", "attending"];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, index) => {
    const cells = parseCsvLine(line);
    const get = (key: string) => cells[headers.indexOf(key.toLowerCase())] ?? "";
    const skill = Number(get("overall") || get("skill") || 5);
    return normalizePlayer({
      name: get("name") || cells[0],
      aka: get("aka") || get("nickname"),
      gender: get("gender") as Gender,
      skill,
      attack: Number(get("attack") || skill),
      defense: Number(get("defense") || skill),
      speed: Number(get("speed") || 5),
      passing: Number(get("passing") || skill),
      stamina: Number(get("stamina") || 5),
      physical: Number(get("strength") || get("physical") || 5),
      teamPlay: Number(get("teamplay") || get("teamPlay") || get("weakfoot") || get("weakFoot") || 2),
      isGoalkeeper: parseBoolean(get("isgoalkeeper") || get("goalkeeper") || get("gk")),
      isPlaymaker: parseBoolean(get("isplaymaker") || get("playmaker")),
      isFinisher: parseBoolean(get("isfinisher") || get("finisher")),
      isDribbler: parseBoolean(get("isdribbler") || get("dribbler")),
      isSentinel: parseBoolean(get("issentinel") || get("sentinel")),
      isEngine: parseBoolean(get("isengine") || get("engine")),
      isVersatile: parseBoolean(get("isversatile") || get("versatile")),
      isSpaceFinder: parseBoolean(get("isspacefinder") || get("spacefinder") || get("space finder")),
      isOrganizer: parseBoolean(get("isorganizer") || get("organizer") || get("org")),
      isNew: parseBoolean(get("isnew") || get("new")),
      funBadge: isFunBadge(get("funbadge") || get("funBadge") || get("badge")) ? (get("funbadge") || get("funBadge") || get("badge")) as FunBadge : undefined,
      attending: parseBoolean(get("attending")),
      createdAt: get("createdat") || undefined,
      updatedAt: get("updatedat") || undefined,
    }, index);
  }).filter(p => p.name);
}

export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
