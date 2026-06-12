import { FunBadge, Gender, TodayStatus } from "@/lib/types";

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
  isLongPass?: boolean;
  isTikiTaka?: boolean;
  isCrossing?: boolean;
  isAerial?: boolean;
  isPowerShot?: boolean;
  isBulldog?: boolean;
  isOrganizer?: boolean;
  isNew?: boolean;
  funBadge?: FunBadge;
  todayStatus?: TodayStatus;
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

function getSpecialSkillStatBoosts(player: Partial<RoomPlayer>) {
  const boosts = { attack: 0, defense: 0, passing: 0, physical: 0, stamina: 0, speed: 0, teamPlay: 0 };

  if (player.isLongPass) {
    boosts.passing += 2;
    boosts.attack += 1;
  }
  if (player.isTikiTaka) {
    boosts.passing += 2;
    boosts.attack += 1;
    boosts.stamina += 0.5;
  }
  // Internal compatibility: older saved rosters used isCrossing for Crossing.
  // It now represents Technician.
  if (player.isCrossing) {
    boosts.teamPlay += 1;
    boosts.passing += 1;
  }
  // Internal compatibility: older saved rosters used isAerial for Aerial.
  // It now represents Header.
  if (player.isAerial) {
    boosts.physical += 2;
    boosts.defense += 1;
    boosts.attack += 1;
  }
  if (player.isPowerShot) {
    boosts.attack += 2;
    boosts.physical += 1;
  }
  if (player.isBulldog) {
    boosts.stamina += 2;
    boosts.defense += 1;
  }

  return boosts;
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
  if (player.isLongPass) bonus += 0.2;
  if (player.isTikiTaka) bonus += 0.2;
  if (player.isCrossing) bonus += 0.2;
  if (player.isAerial) bonus += 0.2;
  if (player.isPowerShot) bonus += 0.2;
  if (player.isBulldog) bonus += 0.2;
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
  const boosts = getSpecialSkillStatBoosts(player);
  const effectiveAttack = Math.min(10, attack + boosts.attack);
  const effectiveDefense = Math.min(10, defense + boosts.defense);
  const effectivePassing = Math.min(10, passing + boosts.passing);
  const effectiveSpeed = Math.min(10, speed + boosts.speed);
  const effectiveStamina = Math.min(10, stamina + boosts.stamina);
  const effectivePhysical = Math.min(10, physical + boosts.physical);
  const effectiveTeamPlay = Math.min(3, teamPlay + boosts.teamPlay);

  // Casual football OVA: football skills matter most; raw strength is only a small tie-breaker.
  const baseOverall =
    effectiveAttack * 0.22 +
    effectiveDefense * 0.22 +
    effectivePassing * 0.20 +
    effectiveSpeed * 0.20 +
    effectiveStamina * 0.12 +
    effectivePhysical * 0.04;
  const teamPlayMultiplier = effectiveTeamPlay === 1 ? 0.93 : effectiveTeamPlay === 3 ? 1.07 : 1.0;
  const overall = baseOverall * teamPlayMultiplier + specialAbilityBonus(player);
  return Math.round(Math.min(10, overall) * 10) / 10;
}

const FUN_BADGE_VALUES: FunBadge[] = [
  "cool-head",
  "unbothered",
  "wildcard",
  "silent-mode",
  "smooth-talker",
  "no-filter",
  "human-alarm",
  "influencer",
  "main-character",
  "old-school",
  "always-late",
  "early-exit",
  "first-5",
  "eighty-minute-warmup",
  "third-half",
  "yellow-card",
  "var-caller",
  "kit-collector",
  "shoe-collector",
  "fashion-icon",
  "club-legend",
  "snack-captain",
  "cameo",
  "mastermind",
];

function normalizeFunBadge(value: unknown): FunBadge | undefined {
  if (typeof value !== "string") return undefined;
  if ((FUN_BADGE_VALUES as string[]).includes(value)) return value as FunBadge;

  // Compatibility for older saved rosters / CSV imports.
  const legacyMap: Record<string, FunBadge> = {
    loudmouth: "no-filter",
    warrior: "old-school",
    samba: "fashion-icon",
    maradoner: "main-character",
    "reluctant-gk": "first-5",
    "first-10": "first-5",
    "club-ambassador": "smooth-talker",
    cfo: "mastermind",
    "club-chef": "snack-captain",
    "the-wall": "club-legend",
    "faith-leader": "club-legend",
    goofball: "wildcard",
    "social-butterfly": "smooth-talker",
    "walking-yellow-card": "yellow-card",
    "referee-consultant": "var-caller",
    "venom-tongue": "no-filter",
  };

  return legacyMap[value];
}

function isFunBadge(value: unknown): value is FunBadge {
  return Boolean(normalizeFunBadge(value));
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
    isLongPass: Boolean(player.isLongPass ?? false),
    isTikiTaka: Boolean(player.isTikiTaka ?? false),
    isCrossing: Boolean(player.isCrossing ?? false),
    isAerial: Boolean(player.isAerial ?? false),
    isPowerShot: Boolean(player.isPowerShot ?? false),
    isBulldog: Boolean(player.isBulldog ?? false),
    isOrganizer: Boolean(player.isOrganizer ?? false),
    isNew: Boolean(player.isNew ?? false),
    funBadge: normalizeFunBadge(player.funBadge),
    todayStatus: player.todayStatus === "not_here_yet" ? "not_here_yet" : "here",
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
  const headers = ["name", "aka", "gender", "overall", "attack", "defense", "speed", "passing", "stamina", "strength", "teamPlay", "isGoalkeeper", "isPlaymaker", "isFinisher", "isDribbler", "isSentinel", "isEngine", "isVersatile", "isSpaceFinder", "isLongPass", "isTikiTaka", "isTechnician", "isHeader", "isPowerShot", "isBulldog", "isOrganizer", "isNew", "funBadge", "attending", "createdAt", "updatedAt"];
  const rows = players.map(p => [p.name, p.aka || "", p.gender, p.skill, p.attack, p.defense, p.speed, p.passing, p.stamina, p.physical, p.teamPlay, p.isGoalkeeper ? "yes" : "no", p.isPlaymaker ? "yes" : "no", p.isFinisher ? "yes" : "no", p.isDribbler ? "yes" : "no", p.isSentinel ? "yes" : "no", p.isEngine ? "yes" : "no", p.isVersatile ? "yes" : "no", p.isSpaceFinder ? "yes" : "no", p.isLongPass ? "yes" : "no", p.isTikiTaka ? "yes" : "no", p.isCrossing ? "yes" : "no", p.isAerial ? "yes" : "no", p.isPowerShot ? "yes" : "no", p.isBulldog ? "yes" : "no", p.isOrganizer ? "yes" : "no", p.isNew ? "yes" : "no", p.funBadge || "", p.attending ? "yes" : "no", p.createdAt, p.updatedAt || ""]);
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
      isLongPass: parseBoolean(get("islongpass") || get("longpass") || get("long pass")),
      isTikiTaka: parseBoolean(get("istikitaka") || get("tikitaka") || get("tiki taka") || get("tiki-taka")),
      isCrossing: parseBoolean(get("istechnician") || get("technician") || get("iscrossing") || get("crossing")),
      isAerial: parseBoolean(get("isheader") || get("header") || get("isaerial") || get("aerial")),
      isPowerShot: parseBoolean(get("ispowershot") || get("powershot") || get("power shot")),
      isBulldog: parseBoolean(get("isbulldog") || get("bulldog") || get("dog")),
      isOrganizer: parseBoolean(get("isorganizer") || get("organizer") || get("org")),
      isNew: parseBoolean(get("isnew") || get("new")),
      funBadge: normalizeFunBadge(get("funbadge") || get("funBadge") || get("badge")),
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
