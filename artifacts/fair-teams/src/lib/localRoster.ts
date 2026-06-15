import { FunBadge, Gender, TodayStatus } from "@/lib/types";
import { getSpecialSkillStatBoosts } from "@/lib/playerAbilityEffects";

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

function clamp(num: unknown, min: number, max: number, fallback: number, step = 1) {
  const n = Number(num);
  if (!Number.isFinite(n)) return fallback;
  const safeStep = step > 0 ? step : 1;
  const rounded = Math.round(n / safeStep) * safeStep;
  return Math.min(max, Math.max(min, Math.round(rounded * 10) / 10));
}

function specialAbilityBonus(_player: Partial<RoomPlayer>) {
  return 0;
}

export function calculateOverall(player: Partial<RoomPlayer>) {
  const attack = clamp(player.attack, 1, 10, clamp(player.skill, 0, 10, 5, 0.5), 0.5);
  const defense = clamp(player.defense, 1, 10, clamp(player.skill, 0, 10, 5, 0.5), 0.5);
  const speed = clamp(player.speed, 1, 10, 5, 0.5);
  const passing = clamp(player.passing, 1, 10, clamp(player.skill, 0, 10, 5, 0.5), 0.5);
  const stamina = clamp(player.stamina, 1, 10, 5, 0.5);
  const physical = clamp(player.physical, 1, 10, 5, 0.5);
  const teamPlay = clamp(player.teamPlay, 1, 3, 2);
  const boosts = getSpecialSkillStatBoosts(player);
  const effectiveAttack = Math.min(10, attack + boosts.attack);
  const effectiveDefense = Math.min(10, defense + boosts.defense);
  const effectivePassing = Math.min(10, passing + boosts.passing);
  const effectiveSpeed = Math.min(10, speed + boosts.speed);
  const effectiveStamina = Math.min(10, stamina + boosts.stamina);
  const effectivePhysical = Math.min(10, physical + boosts.physical);
  const effectiveTeamPlay = teamPlay;

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

function readStringField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function cleanPlayerPhoto(player: unknown) {
  const photo = readStringField(player, [
    "profilePhoto",
    "photo",
    "avatar",
    "avatarUrl",
    "image",
    "profileImage",
    "profileImageUrl",
  ]);
  return photo;
}

export function normalizePlayer(player: Partial<RoomPlayer> & { name?: string }, index = 0): RoomPlayer {
  const baseSkill = clamp(player.skill, 0, 10, 5, 0.5);
  const normalized: RoomPlayer = {
    id: player.id || createLocalPlayerId(),
    roomId: 1,
    name: (player.name || `Player ${index + 1}`).trim(),
    aka: typeof player.aka === "string" && player.aka.trim() ? player.aka.trim() : undefined,
    gender: player.gender === "female" || player.gender === "other" ? player.gender : "male",
    skill: baseSkill,
    attack: clamp(player.attack, 1, 10, baseSkill || 5, 0.5),
    defense: clamp(player.defense, 1, 10, baseSkill || 5, 0.5),
    speed: clamp(player.speed, 1, 10, 5, 0.5),
    passing: clamp(player.passing, 1, 10, baseSkill || 5, 0.5),
    stamina: clamp(player.stamina, 1, 10, 5, 0.5),
    physical: clamp(player.physical, 1, 10, 5, 0.5),
    teamPlay: clamp(player.teamPlay, 1, 3, 2),
    profilePhoto: cleanPlayerPhoto(player),
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


export type RosterCloudProvider = "google-sheets" | "firebase";

export interface RosterCloudSource {
  provider: RosterCloudProvider;
  // Google Sheets cloud backup/shared-roster fields.
  spreadsheetId?: string;
  spreadsheetName?: string;
  webViewLink?: string;

  // Firebase shared-roster fields.
  firebaseRosterId?: string;
  firebaseVersion?: number;
  firebaseOwnerUid?: string;
  firebaseOwnerEmail?: string;
  firebaseGroupName?: string;
  firebaseRole?: "owner" | "editor" | "viewer" | "member";
  firebaseLastSavedByEmail?: string;

  lastSyncedAt?: string;
  lastRemoteModifiedAt?: string;
  syncMode?: "manual";
  accessLabels?: Record<string, string>;
}

export interface RoomRoster {
  id: string;
  name: string;
  players: RoomPlayer[];
  themeColor?: string;
  logo?: string;
  cloudSource?: RosterCloudSource;
  createdAt: string;
  updatedAt?: string;
}

export interface RosterState {
  rosters: RoomRoster[];
  activeRosterId: string;
}

export const DEFAULT_ROSTER_NAME = "Default roster";
const ROSTERS_STORAGE_KEY = "fair-teams-rosters-v1";
const ACTIVE_ROSTER_STORAGE_KEY = "fair-teams-active-roster-id-v1";

export function createLocalRosterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `roster-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanRosterName(name: unknown, fallback = DEFAULT_ROSTER_NAME) {
  const cleaned = String(name || "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function pickRosterName(roster: unknown, fallback = DEFAULT_ROSTER_NAME) {
  return cleanRosterName(
    readStringField(roster, ["name", "rosterName", "groupName", "teamName", "title"]),
    fallback,
  );
}

function cleanRosterColor(value: unknown) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value.trim())
    ? value.trim()
    : undefined;
}

function pickRosterColor(roster: unknown) {
  return cleanRosterColor(
    readStringField(roster, ["themeColor", "headerColor", "color", "teamColor", "groupColor"]),
  );
}

function cleanRosterLogo(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickRosterLogo(roster: unknown) {
  return cleanRosterLogo(readStringField(roster, ["logo", "groupLogo", "teamLogo", "crest", "badge"]));
}

function cleanAccessLabels(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const labels: Record<string, string> = {};

  Object.entries(source).forEach(([email, label]) => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanLabel = String(label || "").replace(/\s+/g, " ").trim();
    if (!cleanEmail || !cleanEmail.includes("@") || !cleanLabel) return;
    labels[cleanEmail] = cleanLabel.slice(0, 80);
  });

  return Object.keys(labels).length ? labels : undefined;
}

function cleanRosterCloudSource(value: unknown): RosterCloudSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;

  if (record.provider === "google-sheets") {
    const spreadsheetId = typeof record.spreadsheetId === "string" ? record.spreadsheetId.trim() : "";
    if (!spreadsheetId) return undefined;

    const source: RosterCloudSource = {
      provider: "google-sheets",
      spreadsheetId,
      syncMode: record.syncMode === "manual" ? "manual" : "manual",
    };

    if (typeof record.spreadsheetName === "string" && record.spreadsheetName.trim()) {
      source.spreadsheetName = record.spreadsheetName.trim();
    }
    if (typeof record.webViewLink === "string" && record.webViewLink.trim()) {
      source.webViewLink = record.webViewLink.trim();
    }
    if (typeof record.lastSyncedAt === "string" && record.lastSyncedAt.trim()) {
      source.lastSyncedAt = record.lastSyncedAt.trim();
    }
    if (typeof record.lastRemoteModifiedAt === "string" && record.lastRemoteModifiedAt.trim()) {
      source.lastRemoteModifiedAt = record.lastRemoteModifiedAt.trim();
    }
    const accessLabels = cleanAccessLabels(record.accessLabels);
    if (accessLabels) {
      source.accessLabels = accessLabels;
    }

    return source;
  }

  if (record.provider === "firebase") {
    const firebaseRosterId = typeof record.firebaseRosterId === "string" ? record.firebaseRosterId.trim() : "";
    if (!firebaseRosterId) return undefined;

    const source: RosterCloudSource = {
      provider: "firebase",
      firebaseRosterId,
      syncMode: "manual",
    };

    if (typeof record.firebaseVersion === "number" && Number.isFinite(record.firebaseVersion)) {
      source.firebaseVersion = Math.max(1, Math.round(record.firebaseVersion));
    }
    if (typeof record.firebaseOwnerUid === "string" && record.firebaseOwnerUid.trim()) {
      source.firebaseOwnerUid = record.firebaseOwnerUid.trim();
    }
    if (typeof record.firebaseOwnerEmail === "string" && record.firebaseOwnerEmail.trim()) {
      source.firebaseOwnerEmail = record.firebaseOwnerEmail.trim();
    }
    if (["owner", "editor", "viewer", "member"].includes(String(record.firebaseRole || ""))) {
      source.firebaseRole = record.firebaseRole as RosterCloudSource["firebaseRole"];
    }
    if (typeof record.firebaseLastSavedByEmail === "string" && record.firebaseLastSavedByEmail.trim()) {
      source.firebaseLastSavedByEmail = record.firebaseLastSavedByEmail.trim();
    }
    if (typeof record.lastSyncedAt === "string" && record.lastSyncedAt.trim()) {
      source.lastSyncedAt = record.lastSyncedAt.trim();
    }
    if (typeof record.lastRemoteModifiedAt === "string" && record.lastRemoteModifiedAt.trim()) {
      source.lastRemoteModifiedAt = record.lastRemoteModifiedAt.trim();
    }

    return source;
  }

  return undefined;
}

export function createRoster(
  name: string,
  players: Partial<RoomPlayer>[] = [],
  identity: { themeColor?: string; logo?: string } = {},
): RoomRoster {
  const now = new Date().toISOString();
  return {
    id: createLocalRosterId(),
    name: cleanRosterName(name),
    players: players.map((player, index) => normalizePlayer(player, index)).filter((player) => player.name),
    themeColor: pickRosterColor(identity),
    logo: pickRosterLogo(identity),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeRoster(roster: Partial<RoomRoster> & { rosterName?: string; players?: Partial<RoomPlayer>[] }, index = 0): RoomRoster {
  const now = new Date().toISOString();
  const name = pickRosterName(roster, `${DEFAULT_ROSTER_NAME} ${index + 1}`);
  return {
    id: typeof roster.id === "string" && roster.id.trim() ? roster.id : createLocalRosterId(),
    name,
    players: Array.isArray(roster.players)
      ? roster.players.map((player, playerIndex) => normalizePlayer(player, playerIndex)).filter((player) => player.name)
      : [],
    themeColor: pickRosterColor(roster),
    logo: pickRosterLogo(roster),
    cloudSource: cleanRosterCloudSource((roster as { cloudSource?: unknown }).cloudSource),
    createdAt: typeof roster.createdAt === "string" ? roster.createdAt : now,
    updatedAt: typeof roster.updatedAt === "string" ? roster.updatedAt : now,
  };
}

function ensureRosterState(rosters: RoomRoster[], activeRosterId?: string | null, fallbackName = DEFAULT_ROSTER_NAME): RosterState {
  const normalized = rosters
    .map((roster, index) => normalizeRoster(roster, index))
    .filter((roster) => roster.name);

  if (normalized.length === 0) {
    const empty = createRoster(fallbackName, []);
    return { rosters: [empty], activeRosterId: empty.id };
  }

  const activeId = activeRosterId && normalized.some((roster) => roster.id === activeRosterId)
    ? activeRosterId
    : normalized[0].id;
  return { rosters: normalized, activeRosterId: activeId };
}

export function loadRosterState(fallbackName = DEFAULT_ROSTER_NAME): RosterState {
  try {
    const raw = localStorage.getItem(ROSTERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rosters = Array.isArray(parsed?.rosters)
        ? parsed.rosters
        : Array.isArray(parsed)
          ? parsed
          : [];
      const activeId = parsed?.activeRosterId || localStorage.getItem(ACTIVE_ROSTER_STORAGE_KEY);
      return ensureRosterState(rosters, activeId, fallbackName);
    }
  } catch {
    // Fall back to the old single-roster storage below.
  }

  const migratedPlayers = loadPlayers();
  const migratedRoster = createRoster(fallbackName, migratedPlayers);
  return { rosters: [migratedRoster], activeRosterId: migratedRoster.id };
}

export function saveRosterState(state: RosterState) {
  try {
    const safe = ensureRosterState(state.rosters, state.activeRosterId);
    localStorage.setItem(ROSTERS_STORAGE_KEY, JSON.stringify({
      app: "Fair Teams",
      version: 1,
      activeRosterId: safe.activeRosterId,
      rosters: safe.rosters,
    }));
    localStorage.setItem(ACTIVE_ROSTER_STORAGE_KEY, safe.activeRosterId);
  } catch (error) {
    console.error("Could not save Fair Teams rosters locally.", error);
  }
}

export function rosterToShareJson(roster: RoomRoster) {
  const safe = normalizeRoster(roster);
  return JSON.stringify({
    app: "Fair Teams",
    type: "shared-roster",
    version: 1,
    exportedAt: new Date().toISOString(),
    rosterName: safe.name,
    roster: safe,
    players: safe.players,
  }, null, 2);
}

export function rostersToBackupJson(rosters: RoomRoster[], activeRosterId: string) {
  const safe = ensureRosterState(rosters, activeRosterId);
  return JSON.stringify({
    app: "Fair Teams",
    type: "all-rosters-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    activeRosterId: safe.activeRosterId,
    rosters: safe.rosters,
  }, null, 2);
}

function fileBaseName(filename: string) {
  const base = filename.replace(/\\/g, "/").split("/").pop() || "Imported roster";
  return base.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Imported roster";
}

export function parseRosterFile(text: string, filename = "Imported roster"): RoomRoster[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      return [createRoster(fileBaseName(filename), parsed)];
    }

    if (Array.isArray(parsed?.rosters)) {
      return parsed.rosters.map((roster: Partial<RoomRoster>, index: number) => normalizeRoster(roster, index));
    }

    // Prefer the full roster object when present. It preserves the roster name,
    // color, logo, and complete player records. Older import logic read the
    // top-level `players` array first, which could fall back to the filename
    // for the roster name and drop identity fields.
    if (parsed?.roster && Array.isArray(parsed.roster.players)) {
      return [normalizeRoster({
        ...parsed.roster,
        name: parsed.roster.name || parsed.rosterName || parsed.name,
        themeColor: parsed.roster.themeColor || parsed.themeColor || parsed.headerColor || parsed.color,
        logo: parsed.roster.logo || parsed.logo || parsed.groupLogo || parsed.teamLogo,
      }, 0)];
    }

    if (Array.isArray(parsed?.players)) {
      const name = parsed.rosterName || parsed.name || fileBaseName(filename);
      return [createRoster(name, parsed.players, {
        themeColor: parsed.themeColor || parsed.headerColor || parsed.color,
        logo: parsed.logo || parsed.groupLogo || parsed.teamLogo,
      })];
    }

    throw new Error("Import file does not contain a Fair Teams roster.");
  }

  const players = csvToPlayers(trimmed);
  return players.length ? [createRoster(fileBaseName(filename), players)] : [];
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
