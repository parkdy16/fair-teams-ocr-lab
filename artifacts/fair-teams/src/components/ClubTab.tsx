import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Copy,
  Pencil,
  Plus,
  Search,
  Star,
  StickyNote,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  UserCircle,
  UsersRound,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FirebaseSharedRosterAuthCard } from "@/components/FirebaseSharedRosterAuthCard";
import { AiSmartCommandPanel } from "@/components/AiSmartCommandPanel";
import { TaskBoard } from "@/components/TaskBoard";
import type { AiSmartCommandAction } from "@/lib/aiSmartCommandTypes";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
import {
  listenToSharedRosterUser,
  signOutOfSharedRosters,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteFirebaseEquipmentBag,
  listenToFirebaseEquipmentBags,
  saveFirebaseEquipmentBag,
  type EquipmentInventoryItem,
  type FirebaseEquipmentBag,
} from "@/lib/equipmentService";
import type { PairingRule } from "@/lib/types";
import { bestPlayerNameMatch } from "@/lib/playerNameMatching";
import {
  DEFAULT_ATTENDANCE_WARNING_TEMPLATES,
  deleteAttendanceIssue,
  listenToAttendanceIssues,
  listenToAttendanceWarningTemplates,
  saveAttendanceIssue,
  saveAttendanceWarningTemplate,
  type AttendanceIssueRecord,
  type AttendanceIssueType,
  type AttendanceWarningTemplateKind,
  type AttendanceWarningTemplates,
} from "@/lib/attendanceService";
import { calculateOverall, type RoomPlayer } from "@/lib/localRoster";
import {
  addClubNote,
  deleteOwnClubNote,
  listenToClubNotes,
  listenToClubRatingSummaries,
  listenToMyClubRatings,
  saveMyClubPlayerRating,
  skipMyClubPlayerRating,
  type ClubMyRating,
  type ClubNote,
  type ClubRatingSummary,
} from "@/lib/clubCollaborationService";
import {
  BALANCED_PLAYER_STYLE,
  generateStyledPlayerAttributes,
  getPlayerStyleDefinition,
  inferPlayerStyleFromAttributes,
  type PlayerStyleAttributes,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";

type ClubTabProps = {
  isActive?: boolean;
  activeRosterName: string;
  workspaceKey: string;
  themeColor?: string;
  playerCount: number;
  players: RoomPlayer[];
  isSharedRoster: boolean;
  sharedRosterId?: string;
  sharedPeopleCount: number;
  canSwitchRoster?: boolean;
  onOpenRosterPicker?: () => void;
  onBackTargetChange?: (hasBackTarget: boolean) => void;
  sharedToolsNode?: React.ReactNode;
  equipmentGroupId?: string;
  equipmentHolderLabels?: string[];
  equipmentHolderNamesByEmail?: Record<string, string>;
  pairingRules?: PairingRule[];
  onOpenPairingRules?: () => void;
  onOpenTeams?: () => void;
  currentTeamCount?: number | null;
  currentTeamsGenerated?: boolean;
  onApplyAiSmartCommandAction?: (action: AiSmartCommandAction) => Promise<string | void> | string | void;
  onOpenTodayFromAi?: () => void;
  onRequestAddPlayer?: (suggestedName?: string) => void;
  tutorialStep?: string | null;
  onTutorialAction?: (action: string, playerId?: string) => void;
};

type EquipmentHolder = {
  id: string;
  label: string;
};

type ClubEquipmentKit = FirebaseEquipmentBag;

const EQUIPMENT_PREVIEW_STORAGE_KEY = "fairteams.clubEquipment.preview.v1";
const CLUB_DESK_COLLAPSED_STORAGE_KEY = "fairteams.clubDesk.collapsed.v2";

const ATTENDANCE_ISSUE_OPTIONS: Array<{ value: AttendanceIssueType; label: string }> = [
  { value: "tardy", label: "Tardy" },
  { value: "late-cancellation", label: "Last-minute cancellation" },
  { value: "no-show", label: "No-show" },
  { value: "conduct", label: "Conduct issue" },
];

type AttendanceRange = "3m" | "6m" | "12m" | "all";
type AttendanceSort = "issues" | "recent";

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function attendanceIssueLabel(issueType: AttendanceIssueType) {
  return ATTENDANCE_ISSUE_OPTIONS.find((option) => option.value === issueType)?.label || "Attendance issue";
}

function formatAttendanceDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

const ATTENDANCE_WARNING_TEMPLATE_OPTIONS: Array<{ value: AttendanceWarningTemplateKind; label: string }> = [
  { value: "late-cancellation", label: "Last-minute cancellation" },
  { value: "no-show", label: "No-show" },
  { value: "tardy", label: "Tardy / repeated lateness" },
  { value: "dismissal", label: "Dismissal from group" },
];

function attendanceRangeText(range: AttendanceRange) {
  if (range === "3m") return "last 3 months";
  if (range === "6m") return "last 6 months";
  if (range === "12m") return "last 12 months";
  return "full recorded history";
}

function countPhrase(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAttendanceDateList(dates: string[]) {
  const unique = Array.from(new Set(dates)).sort();
  if (!unique.length) return "the recorded dates";
  const formatted = unique.map(formatAttendanceDate);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}`;
}

function fillAttendanceWarningTemplate(
  template: string,
  context: {
    player: string;
    group: string;
    period: string;
    lateCancellationCount: number;
    noShowCount: number;
    tardyCount: number;
    lateCancellationDates: string[];
    noShowDates: string[];
  },
) {
  const attendanceIssueCount = context.lateCancellationCount + context.noShowCount + context.tardyCount;
  const replacements: Record<string, string> = {
    "{player}": context.player,
    "{group}": context.group,
    "{period}": context.period,
    "{last_minute}": countPhrase(context.lateCancellationCount, "last-minute cancellation", "last-minute cancellations"),
    "{no_shows}": countPhrase(context.noShowCount, "no-show", "no-shows"),
    "{tardies}": countPhrase(context.tardyCount, "tardy", "tardies"),
    "{attendance_issues}": countPhrase(attendanceIssueCount, "attendance issue", "attendance issues"),
    "{last_minute_count}": String(context.lateCancellationCount),
    "{no_show_count}": String(context.noShowCount),
    "{tardy_count}": String(context.tardyCount),
    "{attendance_issue_count}": String(attendanceIssueCount),
    "{last_minute_dates}": formatAttendanceDateList(context.lateCancellationDates),
    "{no_show_dates}": formatAttendanceDateList(context.noShowDates),
  };
  return Object.entries(replacements).reduce((text, [key, value]) => text.split(key).join(value), template);
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy copy path below.
    }
  }
  if (typeof document === "undefined") throw new Error("Copy is not available on this device.");
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Could not copy warning text.");
}

const EQUIPMENT_COLORS = [
  "#111827",
  "#475569",
  "#1e3a8a",
  "#2563eb",
  "#0891b2",
  "#0f766e",
  "#16a34a",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#9f1239",
  "#db2777",
  "#7c3aed",
  "#8b5e34",
  "#f8fafc",
] as const;

const DEFAULT_EQUIPMENT_COLOR = EQUIPMENT_COLORS[0];

const EQUIPMENT_COLOR_NAMES: Record<string, string> = {
  "#111827": "Black",
  "#475569": "Slate",
  "#1e3a8a": "Navy",
  "#2563eb": "Blue",
  "#0891b2": "Cyan",
  "#0f766e": "Teal",
  "#16a34a": "Green",
  "#ca8a04": "Yellow",
  "#ea580c": "Orange",
  "#dc2626": "Red",
  "#9f1239": "Burgundy",
  "#db2777": "Pink",
  "#7c3aed": "Purple",
  "#8b5e34": "Brown",
  "#f8fafc": "White",
};

const EQUIPMENT_PRESETS = [
  { key: "balls", label: "Balls" },
  { key: "flat-cones", label: "Flat cones" },
  { key: "tower-cones", label: "Tower cones" },
  { key: "bibs", label: "Bibs / vests" },
  { key: "team-bands", label: "Team bands" },
  { key: "ball-pumps", label: "Ball pumps" },
  { key: "goals", label: "Goals" },
  { key: "first-aid", label: "First-aid kits" },
  { key: "first-aid-spray", label: "First-aid spray" },
  { key: "whistles", label: "Whistles" },
] as const;

const EQUIPMENT_PRESET_ORDER = new Map<string, number>(
  [["equipment-bags", -1], ...EQUIPMENT_PRESETS.map((item, index) => [item.key, index] as [string, number])],
);

function equipmentItemKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom";
}

function legacyEquipmentItems(contents: string[]): EquipmentInventoryItem[] {
  const items: EquipmentInventoryItem[] = [];
  contents.forEach((raw) => {
    const text = raw.trim();
    if (!text) return;
    const match = text.match(/^(\d+)\s*(?:x|×)?\s+(.+)$/i);
    const quantity = Math.max(1, Math.min(999, Number(match?.[1]) || 1));
    const rawLabel = (match?.[2] || text).trim();
    const normalized = rawLabel.toLowerCase();
    let preset = EQUIPMENT_PRESETS.find((item) => {
      if (item.key === "balls") return /\bballs?\b/.test(normalized);
      if (item.key === "flat-cones") return /\b(flat|disc|marker)\b.*\bcones?\b|\bcones?\b.*\b(flat|disc|marker)\b/.test(normalized);
      if (item.key === "tower-cones") return /\b(tower|tall|training)\b.*\bcones?\b|\bcones?\b.*\b(tower|tall|training)\b/.test(normalized);
      if (item.key === "bibs") return /^(bibs?|vests?|training bibs?|training vests?)$/.test(normalized);
      if (item.key === "team-bands") return /\b(team\s*)?(bands?|sashes?)\b/.test(normalized);
      if (item.key === "ball-pumps") return /\b(ball\s*)?pumps?\b/.test(normalized);
      if (item.key === "goals") return /\bgoals?\b/.test(normalized);
      if (item.key === "whistles") return /\bwhistles?\b/.test(normalized);
      if (item.key === "first-aid-spray") return /first[- ]?aid.*spray|spray.*first[- ]?aid/.test(normalized);
      if (item.key === "first-aid") return /first[- ]?aid/.test(normalized);
      return false;
    });
    // Old generic cones and color-specific bibs are deliberately kept custom;
    // we cannot safely guess flat vs tower or erase useful color information.
    const legacyLabel = /^cones?$/.test(normalized) ? "Cones (legacy)" : rawLabel.replace(/^\w/, (letter) => letter.toUpperCase());
    const label = preset?.label || legacyLabel;
    const key = preset?.key || `custom:${equipmentItemKey(label)}`;
    const existing = items.find((item) => item.key === key && item.label.toLowerCase() === label.toLowerCase());
    if (existing) existing.quantity += quantity;
    else items.push({ key, label, quantity, custom: preset ? undefined : true });
  });
  return items;
}

function equipmentItemsForKit(kit: ClubEquipmentKit): EquipmentInventoryItem[] {
  const structured = Array.isArray(kit.items)
    ? kit.items.filter((item) => item.label?.trim() && item.quantity > 0)
    : [];
  return structured.length ? structured.map((item) => ({ ...item })) : legacyEquipmentItems(kit.contents || []);
}

function equipmentItemDisplayLabel(item: EquipmentInventoryItem) {
  if (item.key !== "balls") return item.label;
  const brand = item.brand?.trim();
  const size = item.size?.trim();
  if (!brand && !size) return "Balls";
  if (brand && size) return `${brand} · Size ${size}`;
  if (brand) return brand;
  return `Balls · Size ${size}`;
}

function equipmentContentsFromItems(items: EquipmentInventoryItem[]) {
  return items
    .filter((item) => item.label.trim() && item.quantity > 0)
    .map((item) => {
      const quantity = Math.max(1, Math.round(item.quantity));
      const label = equipmentItemDisplayLabel(item);
      return quantity === 1 ? label : `${quantity} ${label}`;
    })
    .slice(0, 30);
}

const LOCAL_EQUIPMENT_HOLDERS: EquipmentHolder[] = [
  { id: "storage", label: "Club storage" },
  { id: "you", label: "You" },
  { id: "other", label: "Other organizer" },
];

const DEFAULT_EQUIPMENT_KITS: ClubEquipmentKit[] = [
  {
    id: "kit-ball-bag",
    name: "Ball bag",
    holderId: "you",
    color: "#2563eb",
    contents: ["2 Balls", "Ball pumps"],
    items: [
      { key: "balls", label: "Balls", quantity: 2 },
      { key: "ball-pumps", label: "Ball pumps", quantity: 1 },
    ],
    createdAt: Date.now(),
    createdByName: "Preview",
    updatedAt: Date.now(),
    updatedByName: "Preview",
  },
  {
    id: "kit-bibs",
    name: "Bibs",
    holderId: "storage",
    color: "#db2777",
    contents: ["10 Dark bibs", "10 Light bibs"],
    items: [
      { key: "custom:dark-bibs", label: "Dark bibs", quantity: 10, custom: true },
      { key: "custom:light-bibs", label: "Light bibs", quantity: 10, custom: true },
    ],
    createdAt: Date.now(),
    createdByName: "Preview",
    updatedAt: Date.now(),
    updatedByName: "Preview",
  },
  {
    id: "kit-cones",
    name: "Cone stack",
    holderId: "storage",
    color: "#ea580c",
    contents: ["12 Flat cones"],
    items: [{ key: "flat-cones", label: "Flat cones", quantity: 12 }],
    createdAt: Date.now(),
    createdByName: "Preview",
    updatedAt: Date.now(),
    updatedByName: "Preview",
  },
];

type RatingProfileDraft = PlayerStyleAttributes;

const RATING_STAT_FIELDS: Array<{ key: keyof Omit<PlayerStyleAttributes, "teamPlay">; label: string; short: string }> = [
  { key: "attack", label: "Attack", short: "ATK" },
  { key: "defense", label: "Defense", short: "DEF" },
  { key: "passing", label: "Passing", short: "PASS" },
  { key: "speed", label: "Speed", short: "SPD" },
  { key: "stamina", label: "Stamina", short: "STA" },
  { key: "physical", label: "Physical", short: "PHY" },
];

function roundRatingStep(value: number) {
  return Math.max(1, Math.min(10, Math.round(value * 2) / 2));
}

function hasCompleteClubRatingAttributes(rating?: ClubMyRating | null) {
  return Boolean(rating && [rating.attack, rating.defense, rating.speed, rating.passing, rating.stamina, rating.physical].every((value) => typeof value === "number"));
}

function ClubRatingStatControl({
  label,
  short,
  value,
  onChange,
}: {
  label: string;
  short: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{short}</div>
          <div className="text-[11px] font-black text-[#102A43]">{label}</div>
        </div>
        <div className="text-sm font-black tabular-nums text-[#102A43]">{Number(value).toFixed(1)}</div>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        step="0.5"
        value={value}
        onChange={(event) => onChange(roundRatingStep(Number(event.target.value)))}
        className="mt-2 w-full accent-[#102A43]"
      />
    </div>
  );
}

function normalizeEquipmentHolderId(holderId: string) {
  return holderId === "unknown" || !holderId ? "storage" : holderId;
}

function isLikelyCurrentUserLabel(value: string) {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  try {
    const firebaseEmail = getFairTeamsAuth().currentUser?.email || "";
    if (firebaseEmail.trim().toLowerCase() === candidate) return true;
  } catch {
    // Firebase may not be configured in local preview; fall back below.
  }
  if (typeof window === "undefined") return false;
  try {
    const authEmail =
      window.localStorage.getItem("fairteams.firebaseEmail") ||
      window.localStorage.getItem("fairteams.googleEmail") ||
      "";
    return Boolean(authEmail && authEmail.trim().toLowerCase() === candidate);
  } catch {
    return false;
  }
}

function titleCaseWords(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function looksLikeReadableName(value: string) {
  const candidate = value.trim();
  if (!candidate) return false;
  if (/\d/.test(candidate)) return false;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((word) => /^[a-zA-ZÀ-ž]{2,}$/.test(word));
}

function cleanEquipmentHolderLabel(
  value: string,
  namesByEmail: Record<string, string> = {},
) {
  const trimmed = value.trim();
  if (!trimmed) return "Organizer";
  if (isLikelyCurrentUserLabel(trimmed)) return "You";

  const normalizedEmail = trimmed.toLowerCase();
  const savedName = normalizedEmail.includes("@")
    ? namesByEmail[normalizedEmail]
    : undefined;
  if (savedName?.trim()) return titleCaseWords(savedName.trim());

  const emailName = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  const readableName = titleCaseWords(emailName.replace(/[._-]+/g, " "));
  return looksLikeReadableName(readableName) ? readableName : "Organizer";
}

function equipmentActorLabel(
  name?: string,
  email?: string,
  namesByEmail: Record<string, string> = {},
) {
  const cleanName = name?.trim();
  if (cleanName && !cleanName.includes("@")) return titleCaseWords(cleanName);
  const cleanEmail = email?.trim() || cleanName || "";
  if (!cleanEmail) return "Unknown";
  const label = cleanEquipmentHolderLabel(cleanEmail, namesByEmail);
  return label === "Organizer" ? "Unknown" : label;
}

function formatEquipmentTimestamp(value?: number) {
  if (!value) return "time not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "time not recorded";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClubNoteDate(value?: number) {
  if (!value) return "date not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "date not recorded";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function buildSharedEquipmentHolders(
  labels: string[],
  equipmentKits: ClubEquipmentKit[],
  namesByEmail: Record<string, string> = {},
) {
  const seen = new Set(["storage"]);
  const normalizedLabels = labels
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .filter((label, index, all) => all.indexOf(label) === index);

  const currentUserLabels = normalizedLabels.filter(isLikelyCurrentUserLabel);
  const otherLabels = normalizedLabels.filter(
    (label) => !isLikelyCurrentUserLabel(label),
  );

  const holders: EquipmentHolder[] = [];
  const addHolder = (id: string, label: string) => {
    const holderId = normalizeEquipmentHolderId(id);
    if (!holderId || seen.has(holderId)) return;
    seen.add(holderId);
    holders.push({ id: holderId, label });
  };

  currentUserLabels.forEach((label) =>
    addHolder(makeEquipmentHolderId(label), "You"),
  );
  otherLabels.slice(0, 8).forEach((label, index) => {
    const cleaned = cleanEquipmentHolderLabel(label, namesByEmail);
    addHolder(
      makeEquipmentHolderId(label),
      cleaned === "Organizer" ? `Organizer ${index + 1}` : cleaned,
    );
  });

  equipmentKits
    .map((kit) => normalizeEquipmentHolderId(kit.holderId))
    .filter((holderId) => holderId && !seen.has(holderId))
    .forEach((holderId) =>
      addHolder(holderId, cleanEquipmentHolderLabel(holderId, namesByEmail)),
    );

  if (!holders.length) holders.push({ id: "organizer", label: "Organizer" });

  return [{ id: "storage", label: "Club storage" }, ...holders];
}

function makeEquipmentHolderId(value: string) {
  return value.trim().toLowerCase() || makeId("holder");
}

function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function parseEquipmentKits(
  raw: string | null,
  fallback: ClubEquipmentKit[] = DEFAULT_EQUIPMENT_KITS,
): ClubEquipmentKit[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter((kit): kit is ClubEquipmentKit => Boolean(kit?.id && kit?.name))
      .map((kit) => ({
        id: String(kit.id),
        name: String(kit.name),
        holderId:
          typeof kit.holderId === "string" && kit.holderId.trim()
            ? normalizeEquipmentHolderId(String(kit.holderId))
            : "storage",
        color:
          typeof kit.color === "string" && kit.color.trim()
            ? kit.color
            : DEFAULT_EQUIPMENT_COLOR,
        contents: Array.isArray(kit.contents)
          ? kit.contents
              .map((item) => String(item).trim())
              .filter(Boolean)
              .slice(0, 30)
          : [],
        items: Array.isArray(kit.items)
          ? kit.items
              .map((rawItem) => {
                const item = rawItem as Partial<EquipmentInventoryItem>;
                const label = String(item.label || "").trim();
                if (!label) return null;
                return {
                  key: String(item.key || equipmentItemKey(label)),
                  label,
                  quantity: Math.max(1, Math.min(999, Math.round(Number(item.quantity) || 1))),
                  custom: item.custom === true || undefined,
                  brand: typeof item.brand === "string" && item.brand.trim() ? item.brand.trim() : undefined,
                  size: typeof item.size === "string" && item.size.trim() ? item.size.trim() : undefined,
                } satisfies EquipmentInventoryItem;
              })
              .filter((item): item is NonNullable<typeof item> => item !== null)
              .slice(0, 30)
          : undefined,
        createdAt: Number(kit.createdAt) || undefined,
        createdByEmail: kit.createdByEmail
          ? String(kit.createdByEmail)
          : undefined,
        createdByName: kit.createdByName
          ? String(kit.createdByName)
          : undefined,
        updatedAt: Number(kit.updatedAt) || Date.now(),
        updatedByEmail: kit.updatedByEmail
          ? String(kit.updatedByEmail)
          : undefined,
        updatedByName: kit.updatedByName
          ? String(kit.updatedByName)
          : undefined,
      }));
  } catch {
    return fallback;
  }
}

function equipmentCacheKey(scopeId: string) {
  return `${EQUIPMENT_PREVIEW_STORAGE_KEY}.cache.${scopeId}`;
}

function readCachedEquipmentKits(scopeId: string) {
  if (typeof window === "undefined") return [];
  try {
    return parseEquipmentKits(
      window.localStorage.getItem(equipmentCacheKey(scopeId)),
      [],
    );
  } catch {
    return [];
  }
}

function writeCachedEquipmentKits(scopeId: string, kits: ClubEquipmentKit[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      equipmentCacheKey(scopeId),
      JSON.stringify(kits),
    );
  } catch {
    // Best-effort cache only. Realtime Firestore remains the source of truth.
  }
}

function DuffleBagIcon({
  color,
  className = "h-9 w-12",
}: {
  color: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <path
        d="M22 17v-4.5C22 8.9 24.9 6 28.5 6h7C39.1 6 42 8.9 42 12.5V17"
        fill="none"
        stroke="#102A43"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="7" y="16" width="50" height="27" rx="9" fill={color} />
      <path d="M7 28h50" stroke="rgba(255,255,255,0.42)" strokeWidth="3" />
      <path
        d="M19 16v27M45 16v27"
        stroke="rgba(16,42,67,0.25)"
        strokeWidth="4"
      />
      <circle cx="20" cy="32" r="2" fill="rgba(255,255,255,0.7)" />
      <circle cx="44" cy="32" r="2" fill="rgba(255,255,255,0.7)" />
    </svg>
  );
}

function AntiqueBallIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="18" fill="currentColor" opacity="0.12" />
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M24 7.5c-4.7 4-7 9.5-7 16.5s2.3 12.5 7 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M24 7.5c4.7 4 7 9.5 7 16.5s-2.3 12.5-7 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M10 19c4.2 1.8 8.9 2.7 14 2.7s9.8-.9 14-2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M10 29c4.2-1.8 8.9-2.7 14-2.7s9.8.9 14 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}


const CLUB_NOTE_STYLES = [
  { background: "#FFF4BD", transform: "rotate(-1.2deg)" },
  { background: "#EFF7C8", transform: "rotate(0.8deg)" },
  { background: "#E8EAFF", transform: "rotate(1.1deg)" },
  { background: "#FFF3DA", transform: "rotate(-0.5deg)" },
] as const;

function clubNoteStyle(index: number) {
  return CLUB_NOTE_STYLES[index % CLUB_NOTE_STYLES.length];
}

function clubNoteTextClass(text: string) {
  const length = text.replace(/\s+/g, " ").trim().length;
  if (length <= 14) {
    return "min-h-0 flex-1 text-[18px] font-bold leading-[1.0] text-[#25364A]/90 line-clamp-3";
  }
  if (length <= 34) {
    return "min-h-0 flex-1 text-[15.5px] font-bold leading-[1.03] text-[#25364A]/90 line-clamp-4";
  }
  return "min-h-0 flex-1 text-[13px] font-bold leading-[1.04] text-[#25364A]/90 line-clamp-4";
}

function getClubGreetingName(user: SharedRosterUser | null) {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName.split(/\s+/)[0] || displayName;
  const emailName = user?.email?.split("@")[0] || "Organizer";
  return emailName
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Organizer";
}

export function ClubTab({
  isActive = true,
  activeRosterName,
  workspaceKey,
  themeColor,
  playerCount,
  players,
  isSharedRoster,
  sharedRosterId,
  sharedPeopleCount,
  canSwitchRoster = false,
  onOpenRosterPicker,
  onBackTargetChange,
  sharedToolsNode,
  equipmentGroupId,
  equipmentHolderLabels = [],
  equipmentHolderNamesByEmail = {},
  pairingRules = [],
  onOpenPairingRules,
  onOpenTeams,
  currentTeamCount = null,
  currentTeamsGenerated = false,
  onApplyAiSmartCommandAction,
  onOpenTodayFromAi,
  onRequestAddPlayer,
  tutorialStep,
  onTutorialAction,
}: ClubTabProps) {
  const [clubRatingSummaries, setClubRatingSummaries] = useState<
    ClubRatingSummary[]
  >([]);
  const [myClubRatings, setMyClubRatings] = useState<ClubMyRating[]>([]);
  const [clubRatingError, setClubRatingError] = useState("");
  const [clubRatingLoading, setClubRatingLoading] = useState(false);
  const [ratingPlayerId, setRatingPlayerId] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState(5);
  const [ratingPlayerStyle, setRatingPlayerStyle] = useState<PlayerStyleValue>(BALANCED_PLAYER_STYLE);
  const [ratingProfile, setRatingProfile] = useState<RatingProfileDraft>(() => generateStyledPlayerAttributes(5, BALANCED_PLAYER_STYLE));
  const [ratingGoalkeeper, setRatingGoalkeeper] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingDialogError, setRatingDialogError] = useState("");
  const [ratingFlowNotice, setRatingFlowNotice] = useState("");
  const [ratingBoardOpen, setRatingBoardOpen] = useState(false);
  const [ratingSeedSaving, setRatingSeedSaving] = useState(false);
  const [ratingSeedMessage, setRatingSeedMessage] = useState("");
  const [clubNotes, setClubNotes] = useState<ClubNote[]>([]);
  const [clubNotesError, setClubNotesError] = useState("");
  const [clubNoteDraft, setClubNoteDraft] = useState("");
  const [clubNoteSaving, setClubNoteSaving] = useState(false);
  const [clubNotesOpen, setClubNotesOpen] = useState(false);
  const [helpCollapsed, setHelpCollapsed] = useState(true);
  const [clubNoteDeletingId, setClubNoteDeletingId] = useState<string | null>(
    null,
  );
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceIssueRecord[]>([]);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceBoardOpen, setAttendanceBoardOpen] = useState(false);
  const [attendanceEditorOpen, setAttendanceEditorOpen] = useState(false);
  const [attendanceRange, setAttendanceRange] = useState<AttendanceRange>("3m");
  const [attendanceSort, setAttendanceSort] = useState<AttendanceSort>("issues");
  const [attendancePlayerSearch, setAttendancePlayerSearch] = useState("");
  const [attendanceHistoryPlayerId, setAttendanceHistoryPlayerId] = useState<string | null>(null);
  const [attendanceEditingId, setAttendanceEditingId] = useState<string | null>(null);
  const [attendancePlayerId, setAttendancePlayerId] = useState("");
  const [attendanceIssueType, setAttendanceIssueType] = useState<AttendanceIssueType>("tardy");
  const [attendanceDate, setAttendanceDate] = useState(todayIsoDate);
  const [attendanceNote, setAttendanceNote] = useState("");
  const [attendanceDuplicate, setAttendanceDuplicate] = useState<AttendanceIssueRecord | null>(null);
  const [attendanceWarningTemplates, setAttendanceWarningTemplates] = useState<AttendanceWarningTemplates>(() => ({ ...DEFAULT_ATTENDANCE_WARNING_TEMPLATES }));
  const [attendanceWarningTemplatesLoading, setAttendanceWarningTemplatesLoading] = useState(false);
  const [attendanceWarningTemplatesError, setAttendanceWarningTemplatesError] = useState("");
  const [attendanceWarningTemplatesOpen, setAttendanceWarningTemplatesOpen] = useState(false);
  const [attendanceWarningTemplateKind, setAttendanceWarningTemplateKind] = useState<AttendanceWarningTemplateKind>("late-cancellation");
  const [attendanceWarningTemplateDraft, setAttendanceWarningTemplateDraft] = useState(DEFAULT_ATTENDANCE_WARNING_TEMPLATES["late-cancellation"]);
  const [attendanceWarningTemplateSaving, setAttendanceWarningTemplateSaving] = useState(false);
  const [attendanceWarningTemplateNotice, setAttendanceWarningTemplateNotice] = useState("");
  const [attendanceWarningBoardOpen, setAttendanceWarningBoardOpen] = useState(false);
  const [attendanceWarningPlayerSearch, setAttendanceWarningPlayerSearch] = useState("");
  const [attendanceWarningComposerOpen, setAttendanceWarningComposerOpen] = useState(false);
  const [attendanceWarningComposerKind, setAttendanceWarningComposerKind] = useState<AttendanceWarningTemplateKind>("late-cancellation");
  const [attendanceWarningComposerDraft, setAttendanceWarningComposerDraft] = useState("");
  const [attendanceWarningCopyNotice, setAttendanceWarningCopyNotice] = useState("");
  const [equipmentKits, setEquipmentKits] = useState<ClubEquipmentKit[]>(() => {
    if (typeof window === "undefined") return DEFAULT_EQUIPMENT_KITS;
    return parseEquipmentKits(
      window.localStorage.getItem(EQUIPMENT_PREVIEW_STORAGE_KEY),
    );
  });
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentError, setEquipmentError] = useState("");
  const [equipmentLastSyncedAt, setEquipmentLastSyncedAt] = useState<
    number | null
  >(null);
  const [equipmentBoardOpen, setEquipmentBoardOpen] = useState(false);
  const [equipmentInventoryOpen, setEquipmentInventoryOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [equipmentItemPickerOpen, setEquipmentItemPickerOpen] = useState(false);
  const [equipmentEditorReturnToBoard, setEquipmentEditorReturnToBoard] =
    useState(false);
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [kitName, setKitName] = useState("");
  const [kitHolderId, setKitHolderId] = useState("storage");
  const [kitColor, setKitColor] = useState(DEFAULT_EQUIPMENT_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [deleteBagSlide, setDeleteBagSlide] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [equipmentMoveNotice, setEquipmentMoveNotice] = useState("");
  const [contentPeekKitId, setContentPeekKitId] = useState<string | null>(null);
  const [kitItems, setKitItems] = useState<EquipmentInventoryItem[]>([]);
  const [equipmentQuantityDrafts, setEquipmentQuantityDrafts] = useState<Record<number, string>>({});
  const [customEquipmentName, setCustomEquipmentName] = useState("");
  const [ballDetailsIndex, setBallDetailsIndex] = useState<number | null>(null);
  const [draggingKitId, setDraggingKitId] = useState<string | null>(null);
  const [dragOverHolderId, setDragOverHolderId] = useState<string | null>(null);
  const equipmentDragTimerRef = useRef<number | null>(null);
  const equipmentAutosaveTimerRef = useRef<number | null>(null);
  const equipmentAutosaveReadyRef = useRef(false);
  const equipmentDraftBagIdRef = useRef<string | null>(null);
  const equipmentLastQueuedSignatureRef = useRef("");
  const equipmentSaveSequenceRef = useRef(0);
  const activeEquipmentDragRef = useRef<string | null>(null);
  const activeEquipmentDropHolderRef = useRef<string | null>(null);
  const suppressEquipmentClickRef = useRef(false);
  const equipmentBackStateRef = useRef({
    colorPickerOpen: false,
    contentPeekKitId: null as string | null,
    equipmentBoardOpen: false,
    equipmentInventoryOpen: false,
    equipmentDialogOpen: false,
    equipmentItemPickerOpen: false,
    ratingPlayerId: null as string | null,
    ratingBoardOpen: false,
    accountDialogOpen: false,
    attendanceBoardOpen: false,
    attendanceEditorOpen: false,
    attendanceWarningTemplatesOpen: false,
    attendanceWarningBoardOpen: false,
    attendanceWarningComposerOpen: false,
  });
  const [authReady, setAuthReady] = useState(false);
  const [clubUser, setClubUser] = useState<SharedRosterUser | null>(null);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [playerManagementCollapsed, setPlayerManagementCollapsed] = useState(true);
  const [clubDeskCollapsed, setClubDeskCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem(CLUB_DESK_COLLAPSED_STORAGE_KEY);
      return saved == null ? true : saved === "1";
    } catch {
      return true;
    }
  });

  useEffect(
    () =>
      listenToSharedRosterUser((nextUser) => {
        setClubUser(nextUser);
        setAuthReady(true);
      }),
    [],
  );

  useEffect(() => {
    if (clubUser) setAccountDialogOpen(false);
  }, [clubUser]);


  const equipmentRealtimeEnabled = Boolean(equipmentGroupId);
  const equipmentCanSyncOnline = Boolean(equipmentGroupId && clubUser?.email);
  const equipmentWaitingForAccount = Boolean(equipmentGroupId && !authReady);
  const equipmentNeedsSignIn = Boolean(
    equipmentGroupId && authReady && !clubUser?.email,
  );
  const equipmentSharedConnecting = isSharedRoster && !equipmentRealtimeEnabled;
  const equipmentStatusText = equipmentCanSyncOnline
    ? equipmentError
      ? "Reconnecting equipment…"
      : equipmentSaving
        ? "Saving equipment…"
        : equipmentLoading
          ? equipmentKits.length > 0
            ? "Online · live board"
            : "Online · loading bags"
          : "Online · shared equipment"
    : equipmentWaitingForAccount
      ? "Connecting account…"
      : equipmentNeedsSignIn
        ? "Sign in for online equipment"
        : equipmentSharedConnecting
          ? "Connecting shared equipment…"
          : "Local preview";
  const equipmentBoardStatusText = equipmentMoveNotice
    ? `${equipmentMoveNotice}${equipmentCanSyncOnline ? " · saved online" : ""}`
    : equipmentCanSyncOnline
      ? equipmentError
        ? "Reconnecting equipment board…"
        : equipmentSaving
          ? "Saving equipment…"
          : equipmentLoading
            ? equipmentKits.length > 0
              ? "Online · loading latest bags…"
              : "Online · loading bags…"
            : `Online · shared equipment${equipmentLastSyncedAt ? ` · updated ${formatEquipmentTimestamp(equipmentLastSyncedAt)}` : ""}`
      : equipmentWaitingForAccount
        ? "Connecting account…"
        : equipmentNeedsSignIn
          ? "Sign in to use the shared equipment board online."
          : equipmentSharedConnecting
            ? "Connecting shared equipment…"
            : "Local preview · drag bags to move";
  const equipmentHolders = useMemo<EquipmentHolder[]>(() => {
    if (!isSharedRoster && !equipmentRealtimeEnabled)
      return LOCAL_EQUIPMENT_HOLDERS;
    return buildSharedEquipmentHolders(
      equipmentHolderLabels,
      equipmentKits,
      equipmentHolderNamesByEmail,
    );
  }, [
    equipmentHolderLabels,
    equipmentHolderNamesByEmail,
    equipmentKits,
    equipmentRealtimeEnabled,
    isSharedRoster,
  ]);
  const actionBoardOrganizerPeople = useMemo(
    () =>
      Array.from(
        new Set(
          (equipmentHolderLabels || [])
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email.includes("@")),
        ),
      ).map((email) => ({
        email,
        name: cleanEquipmentHolderLabel(email, equipmentHolderNamesByEmail),
      })),
    [equipmentHolderLabels, equipmentHolderNamesByEmail],
  );
  const actionBoardEquipmentItems = useMemo(
    () =>
      Array.from(
        new Set(
          equipmentKits
            .flatMap((kit) => equipmentItemsForKit(kit))
            .map(equipmentItemDisplayLabel)
            .filter(Boolean),
        ),
      ).slice(0, 24),
    [equipmentKits],
  );
  const cleanPairingRuleCount = pairingRules.filter(
    (rule) => rule.playerAId && rule.playerBId,
  ).length;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      equipmentRealtimeEnabled ||
      isSharedRoster
    )
      return;
    window.localStorage.setItem(
      EQUIPMENT_PREVIEW_STORAGE_KEY,
      JSON.stringify(equipmentKits),
    );
  }, [equipmentKits, equipmentRealtimeEnabled, isSharedRoster]);

  useEffect(() => {
    if (!equipmentMoveNotice || typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => setEquipmentMoveNotice(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [equipmentMoveNotice]);

  useEffect(() => {
    if (!equipmentGroupId) {
      setEquipmentLoading(false);
      setEquipmentError("");
      setEquipmentLastSyncedAt(null);
      if (isSharedRoster) {
        setEquipmentKits([]);
      } else if (typeof window !== "undefined") {
        setEquipmentKits(
          parseEquipmentKits(
            window.localStorage.getItem(EQUIPMENT_PREVIEW_STORAGE_KEY),
          ),
        );
      }
      return;
    }

    const cachedBags = readCachedEquipmentKits(equipmentGroupId);
    if (cachedBags.length > 0) {
      setEquipmentKits(cachedBags);
    }

    if (!authReady) {
      setEquipmentLoading(true);
      setEquipmentError("");
      return;
    }

    if (!clubUser?.email) {
      setEquipmentLoading(false);
      setEquipmentError("");
      setEquipmentLastSyncedAt(null);
      return;
    }

    setEquipmentLoading(true);
    setEquipmentError("");
    try {
      const unsubscribe = listenToFirebaseEquipmentBags(
        equipmentGroupId,
        (bags) => {
          setEquipmentKits(bags);
          writeCachedEquipmentKits(equipmentGroupId, bags);
          setEquipmentLoading(false);
          setEquipmentError("");
          setEquipmentLastSyncedAt(Date.now());
        },
        (error) => {
          setEquipmentLoading(false);
          setEquipmentError(
            error.message || "Could not load shared equipment board.",
          );
        },
      );

      return () => unsubscribe();
    } catch (error) {
      setEquipmentLoading(false);
      setEquipmentError(
        error instanceof Error
          ? error.message
          : "Could not connect equipment board.",
      );
    }
  }, [authReady, clubUser?.email, equipmentGroupId, isSharedRoster]);

  const attendanceEnabled = Boolean(isSharedRoster && sharedRosterId && clubUser?.email);

  useEffect(() => {
    if (!attendanceEnabled || !sharedRosterId) {
      setAttendanceRecords([]);
      setAttendanceError("");
      setAttendanceLoading(false);
      return;
    }
    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      return listenToAttendanceIssues(
        sharedRosterId,
        (records) => {
          setAttendanceRecords(records);
          setAttendanceLoading(false);
          setAttendanceError("");
        },
        (error) => {
          setAttendanceLoading(false);
          setAttendanceError(error.message || "Could not load attendance records.");
        },
      );
    } catch (error) {
      setAttendanceLoading(false);
      setAttendanceError(error instanceof Error ? error.message : "Could not connect Club attendance.");
    }
  }, [attendanceEnabled, sharedRosterId]);

  useEffect(() => {
    if (!attendanceEnabled || !sharedRosterId) {
      setAttendanceWarningTemplates({ ...DEFAULT_ATTENDANCE_WARNING_TEMPLATES });
      setAttendanceWarningTemplatesLoading(false);
      setAttendanceWarningTemplatesError("");
      return;
    }
    setAttendanceWarningTemplatesLoading(true);
    setAttendanceWarningTemplatesError("");
    try {
      return listenToAttendanceWarningTemplates(
        sharedRosterId,
        (templates) => {
          setAttendanceWarningTemplates(templates);
          setAttendanceWarningTemplatesLoading(false);
          setAttendanceWarningTemplatesError("");
        },
        (error) => {
          setAttendanceWarningTemplatesLoading(false);
          setAttendanceWarningTemplatesError(error.message || "Could not load warning templates.");
        },
      );
    } catch (error) {
      setAttendanceWarningTemplatesLoading(false);
      setAttendanceWarningTemplatesError(error instanceof Error ? error.message : "Could not connect warning templates.");
    }
  }, [attendanceEnabled, sharedRosterId]);

  const clubRatingsEnabled = Boolean(
    isSharedRoster && sharedRosterId && clubUser?.email,
  );

  useEffect(() => {
    if (!clubRatingsEnabled || !sharedRosterId) {
      setClubRatingSummaries([]);
      setMyClubRatings([]);
      setClubRatingError("");
      setClubRatingLoading(false);
      return;
    }

    setClubRatingLoading(true);
    setClubRatingError("");
    try {
      const unsubscribeSummaries = listenToClubRatingSummaries(
        sharedRosterId,
        (summaries) => {
          setClubRatingSummaries(summaries);
          setClubRatingLoading(false);
        },
        (error) => {
          setClubRatingError(error.message || "Could not load Club ratings.");
          setClubRatingLoading(false);
        },
      );
      const unsubscribeMine = listenToMyClubRatings(
        sharedRosterId,
        (ratings) => {
          setMyClubRatings(ratings);
          setClubRatingLoading(false);
        },
        (error) => {
          setClubRatingError(error.message || "Could not load your ratings.");
          setClubRatingLoading(false);
        },
      );
      return () => {
        unsubscribeSummaries();
        unsubscribeMine();
      };
    } catch (error) {
      setClubRatingError(
        error instanceof Error
          ? error.message
          : "Could not connect Club ratings.",
      );
      setClubRatingLoading(false);
      return;
    }
  }, [clubRatingsEnabled, sharedRosterId]);

  useEffect(() => {
    const authUser = getFairTeamsAuth().currentUser;
    const notesReady = Boolean(
      isSharedRoster && sharedRosterId && (clubUser?.email || authUser?.email),
    );

    if (!notesReady || !sharedRosterId) {
      setClubNotes([]);
      setClubNotesError("");
      return;
    }

    setClubNotesError("");
    try {
      return listenToClubNotes(sharedRosterId, setClubNotes, (error) =>
        setClubNotesError(error.message || "Could not load Club notes."),
      );
    } catch (error) {
      setClubNotesError(
        error instanceof Error
          ? error.message
          : "Could not connect Club notes.",
      );
      return;
    }
  }, [clubUser?.email, isSharedRoster, sharedRosterId]);

  const myRatingByPlayerId = useMemo(() => {
    return new Map(myClubRatings.map((rating) => [rating.playerId, rating]));
  }, [myClubRatings]);
  const ratingSummaryByPlayerId = useMemo(() => {
    return new Map(
      clubRatingSummaries.map((summary) => [summary.playerId, summary]),
    );
  }, [clubRatingSummaries]);
  const ratedPlayers = useMemo(
    () =>
      players.filter((player) => {
        const rating = myRatingByPlayerId.get(player.id);
        return Boolean(
          rating && !rating.skipped && typeof rating.skill === "number",
        );
      }),
    [myRatingByPlayerId, players],
  );
  const skippedPlayers = useMemo(
    () =>
      players.filter((player) => myRatingByPlayerId.get(player.id)?.skipped),
    [myRatingByPlayerId, players],
  );
  const needRatingPlayers = useMemo(
    () => players.filter((player) => !myRatingByPlayerId.has(player.id)),
    [myRatingByPlayerId, players],
  );
  const newNeedRatingPlayers = useMemo(
    () => needRatingPlayers.filter((player) => player.isNew),
    [needRatingPlayers],
  );
  const regularNeedRatingPlayers = useMemo(
    () => needRatingPlayers.filter((player) => !player.isNew),
    [needRatingPlayers],
  );
  const orderedNeedRatingPlayers = useMemo(
    () => [...newNeedRatingPlayers, ...regularNeedRatingPlayers],
    [newNeedRatingPlayers, regularNeedRatingPlayers],
  );
  const ratingDialogPlayer = useMemo(
    () => players.find((player) => player.id === ratingPlayerId) || null,
    [players, ratingPlayerId],
  );
  const legacySkillSeedPlayers = useMemo(
    () =>
      needRatingPlayers.filter((player) => {
        const skill = Number(player.skill);
        return Number.isFinite(skill) && skill >= 1 && skill <= 10;
      }),
    [needRatingPlayers],
  );
  const nextRatingPlayer =
    orderedNeedRatingPlayers[0] ||
    skippedPlayers[0] ||
    ratedPlayers[0] ||
    players[0] ||
    null;
  const clubRatedCount = ratedPlayers.length;
  const clubSkippedCount = skippedPlayers.length;
  const clubNeedRatingCount = needRatingPlayers.length;
  const clubRatingProgressText = clubRatingsEnabled
    ? `${clubRatedCount} of ${players.length} rated${clubSkippedCount ? ` · ${clubSkippedCount} skipped` : ""}`
    : isSharedRoster
      ? "Sign in to rate this shared roster."
      : "Available when this roster is shared.";
  const previewClubNotes = clubNotes.slice(0, 3);
  const authUser = getFairTeamsAuth().currentUser;
  const currentUserUid = authUser?.uid || "";
  const clubNotesEnabled = Boolean(
    isSharedRoster && sharedRosterId && (clubUser?.email || authUser?.email),
  );
  const clubNotesUnavailableReason = !isSharedRoster
    ? "Club Notes belong to shared rosters. Open or create a shared roster first."
    : !sharedRosterId
      ? "This shared roster is still connecting. Try again in a moment."
      : !authReady
        ? "Connecting your Stripes account. Try again in a moment."
        : !(clubUser?.email || authUser?.email)
          ? "Sign in to add Club Notes."
          : "";
  const canAddClubNote =
    clubNotesEnabled && clubNoteDraft.trim().length > 0 && !clubNoteSaving;
  const canRemoveClubNote = (note: ClubNote) =>
    Boolean(currentUserUid && note.createdByUid === currentUserUid);

  const openRatingForPlayer = (player: RoomPlayer | null) => {
    if (!player) return;
    const existing = myRatingByPlayerId.get(player.id);
    const baseSkill = roundRatingStep(typeof existing?.skill === "number" ? existing.skill : Number(player.skill) || 5);
    const style = typeof existing?.playerStyle === "number"
      ? existing.playerStyle
      : inferPlayerStyleFromAttributes({ ...player, skill: baseSkill });
    const nextProfile = hasCompleteClubRatingAttributes(existing)
      ? {
          attack: Number(existing?.attack),
          defense: Number(existing?.defense),
          speed: Number(existing?.speed),
          passing: Number(existing?.passing),
          stamina: Number(existing?.stamina),
          physical: Number(existing?.physical),
          teamPlay: 2,
        }
      : generateStyledPlayerAttributes(baseSkill, style);
    setRatingDialogError("");
    setRatingFlowNotice("");
    setRatingBoardOpen(false);
    setRatingDraft(baseSkill);
    setRatingPlayerStyle(style);
    setRatingProfile(nextProfile);
    setRatingGoalkeeper(Boolean(existing?.isGoalkeeper || player.isGoalkeeper));
    setRatingPlayerId(player.id);
  };

  const findNextRatingPlayerAfter = (currentPlayerId: string | null) => {
    const nextUnrated = orderedNeedRatingPlayers.find(
      (player) => player.id !== currentPlayerId,
    );
    if (nextUnrated) return nextUnrated;
    const nextSkipped = skippedPlayers.find(
      (player) => player.id !== currentPlayerId,
    );
    if (nextSkipped) return nextSkipped;
    return null;
  };

  const seedClubRatingsFromRosterSkills = async () => {
    if (
      !sharedRosterId ||
      ratingSeedSaving ||
      legacySkillSeedPlayers.length === 0
    )
      return;
    setRatingSeedSaving(true);
    setClubRatingError("");
    setRatingSeedMessage("");
    try {
      let savedCount = 0;
      for (const player of legacySkillSeedPlayers) {
        const skill = calculateOverall(player);
        await saveMyClubPlayerRating(sharedRosterId, player.id, {
          skill,
          attack: player.attack,
          defense: player.defense,
          speed: player.speed,
          passing: player.passing,
          stamina: player.stamina,
          physical: player.physical,
          teamPlay: 2,
          playerStyle: inferPlayerStyleFromAttributes({ ...player, skill }),
          isGoalkeeper: Boolean(player.isGoalkeeper),
        });
        savedCount += 1;
      }
      setRatingSeedMessage(
        `Imported ${savedCount} current roster rating${savedCount === 1 ? "" : "s"} as your Club ratings.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not import current roster ratings.";
      setRatingSeedMessage("");
      setClubRatingError(message);
    } finally {
      setRatingSeedSaving(false);
    }
  };

  const saveClubRating = async () => {
    if (!sharedRosterId || !ratingDialogPlayer || ratingSaving) return;
    setRatingSaving(true);
    setClubRatingError("");
    try {
      const savedPlayerId = ratingDialogPlayer.id;
      const savedPlayerName = ratingDialogPlayer.name;
      const finalSkill = calculateOverall(ratingProfile);
      await saveMyClubPlayerRating(sharedRosterId, savedPlayerId, {
        skill: finalSkill,
        ...ratingProfile,
        playerStyle: ratingPlayerStyle,
        isGoalkeeper: ratingGoalkeeper,
      });
      const nextPlayer = findNextRatingPlayerAfter(savedPlayerId);
      if (nextPlayer) {
        openRatingForPlayer(nextPlayer);
        setRatingFlowNotice(
          `${savedPlayerName} saved. Next up: ${nextPlayer.name}.`,
        );
      } else {
        setRatingPlayerId(null);
        setRatingBoardOpen(true);
        setRatingFlowNotice(
          `${savedPlayerName} saved. You are caught up for now.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save your rating.";
      setRatingDialogError(message);
      setClubRatingError(message);
    } finally {
      setRatingSaving(false);
    }
  };

  const skipClubRating = async () => {
    if (!sharedRosterId || !ratingDialogPlayer || ratingSaving) return;
    setRatingSaving(true);
    setClubRatingError("");
    try {
      const skippedPlayerId = ratingDialogPlayer.id;
      const skippedPlayerName = ratingDialogPlayer.name;
      await skipMyClubPlayerRating(sharedRosterId, skippedPlayerId);
      const nextPlayer = findNextRatingPlayerAfter(skippedPlayerId);
      if (nextPlayer) {
        openRatingForPlayer(nextPlayer);
        setRatingFlowNotice(
          `${skippedPlayerName} skipped for later. Next up: ${nextPlayer.name}.`,
        );
      } else {
        setRatingPlayerId(null);
        setRatingBoardOpen(true);
        setRatingFlowNotice(
          `${skippedPlayerName} skipped for later. You are caught up for now.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not skip this player.";
      setRatingDialogError(message);
      setClubRatingError(message);
    } finally {
      setRatingSaving(false);
    }
  };

  const addSharedClubNote = async () => {
    if (!sharedRosterId || !clubNotesEnabled || !canAddClubNote) return;
    setClubNoteSaving(true);
    setClubNotesError("");
    try {
      await addClubNote(sharedRosterId, clubNoteDraft);
      setClubNoteDraft("");
    } catch (error) {
      setClubNotesError(
        error instanceof Error ? error.message : "Could not add Club note.",
      );
    } finally {
      setClubNoteSaving(false);
    }
  };

  const applyAiSmartCommandAction = async (action: AiSmartCommandAction) => {
    if (action.type !== "club_add_note") {
      if (onApplyAiSmartCommandAction) {
        return await onApplyAiSmartCommandAction(action);
      }
      throw new Error("Stripes understands this, but it is not wired to apply yet.");
    }

    const noteText = action.noteText?.trim();
    if (!noteText) {
      throw new Error("I understood a Club note request, but no note text was found.");
    }

    if (!sharedRosterId || !clubNotesEnabled) {
      throw new Error(clubNotesUnavailableReason || "Club Notes are not ready yet.");
    }

    setClubNoteSaving(true);
    setClubNotesError("");
    try {
      await addClubNote(sharedRosterId, noteText);
      setClubNoteDraft("");
      return "Added to Club Notes.";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not add Club note.";
      setClubNotesError(message);
      throw new Error(message);
    } finally {
      setClubNoteSaving(false);
    }
  };

  const removeOwnClubNote = async (note: ClubNote) => {
    if (!sharedRosterId || !canRemoveClubNote(note) || clubNoteDeletingId)
      return;
    const confirmed = window.confirm(
      "Remove this Club note? This only deletes your own note.",
    );
    if (!confirmed) return;
    setClubNoteDeletingId(note.id);
    setClubNotesError("");
    try {
      await deleteOwnClubNote(sharedRosterId, note.id);
    } catch (error) {
      setClubNotesError(
        error instanceof Error ? error.message : "Could not remove Club note.",
      );
    } finally {
      setClubNoteDeletingId(null);
    }
  };

  const contentPeekKit = useMemo(
    () => equipmentKits.find((kit) => kit.id === contentPeekKitId) || null,
    [contentPeekKitId, equipmentKits],
  );
  const editingKitMeta = useMemo(
    () =>
      editingKitId
        ? equipmentKits.find((kit) => kit.id === editingKitId) || null
        : null,
    [editingKitId, equipmentKits],
  );
  const sharedPersonNames = useMemo(() => {
    const cleaned = equipmentHolderLabels
      .map((label) =>
        cleanEquipmentHolderLabel(label, equipmentHolderNamesByEmail),
      )
      .map((label) => (label === "You" ? "Me" : label))
      .filter(Boolean);
    const unique = cleaned.filter(
      (label, index, all) => all.indexOf(label) === index,
    );
    if (unique.length) return unique;
    if (!isSharedRoster) return [];
    return [
      "Me",
      ...Array.from(
        { length: Math.max(0, sharedPeopleCount - 1) },
        (_, index) => `Person ${index + 2}`,
      ),
    ];
  }, [
    equipmentHolderLabels,
    equipmentHolderNamesByEmail,
    isSharedRoster,
    sharedPeopleCount,
  ]);
  const equipmentHolderLabelById = useMemo(() => {
    return equipmentHolders.reduce<Record<string, string>>((labels, holder) => {
      labels[holder.id] = holder.label;
      return labels;
    }, {});
  }, [equipmentHolders]);
  const equipmentPreviewKits = useMemo(
    () => equipmentKits.slice(0, 3),
    [equipmentKits],
  );
  const equipmentDashboardHolders = useMemo(() => {
    const holdersWithBags = equipmentHolders.filter((holder) =>
      equipmentKits.some(
        (kit) => normalizeEquipmentHolderId(kit.holderId) === holder.id,
      ),
    );
    const holdersToShow = holdersWithBags.length
      ? holdersWithBags
      : equipmentHolders.slice(0, Math.min(3, equipmentHolders.length));
    return holdersToShow.slice(0, 4);
  }, [equipmentHolders, equipmentKits]);
  const equipmentInventoryTotals = useMemo(() => {
    const totals = new Map<string, EquipmentInventoryItem>();
    equipmentKits.forEach((kit) => {
      equipmentItemsForKit(kit).forEach((item) => {
        const normalizedLabel = item.label.trim();
        if (!normalizedLabel || item.quantity <= 0) return;
        const brand = item.brand?.trim() || "";
        const size = item.size?.trim() || "";
        const key = item.key === "balls"
          ? `balls:${equipmentItemKey(brand)}:${equipmentItemKey(size)}`
          : item.custom
            ? `custom:${equipmentItemKey(normalizedLabel)}`
            : item.key || equipmentItemKey(normalizedLabel);
        const displayLabel = item.key === "balls" ? equipmentItemDisplayLabel(item) : normalizedLabel;
        const existing = totals.get(key);
        if (existing) existing.quantity += item.quantity;
        else totals.set(key, { ...item, key, label: displayLabel });
      });
    });
    return Array.from(totals.values()).sort((a, b) => {
      const aBaseKey = a.key.startsWith("balls:") ? "balls" : a.key;
      const bBaseKey = b.key.startsWith("balls:") ? "balls" : b.key;
      const aOrder = EQUIPMENT_PRESET_ORDER.get(aBaseKey) ?? 999;
      const bOrder = EQUIPMENT_PRESET_ORDER.get(bBaseKey) ?? 999;
      return aOrder - bOrder || a.label.localeCompare(b.label);
    });
  }, [equipmentKits]);
  const actionBoardEquipmentSnapshot = useMemo(() => ({
    bags: equipmentKits.map((kit) => ({
      id: kit.id,
      name: kit.name || "Equipment bag",
      holder: equipmentHolderLabelById[normalizeEquipmentHolderId(kit.holderId)] || "Club storage",
      color: kit.color,
      items: equipmentItemsForKit(kit).map((item) => ({
        label: equipmentItemDisplayLabel(item),
        quantity: item.quantity,
      })),
    })),
    totals: equipmentInventoryTotals.map((item) => ({
      label: equipmentItemDisplayLabel(item),
      quantity: item.quantity,
    })),
  }), [equipmentHolderLabelById, equipmentInventoryTotals, equipmentKits]);
  const addEquipmentPreset = (preset: (typeof EQUIPMENT_PRESETS)[number]) => {
    setKitItems((current) => {
      const existing = current.find((item) =>
        item.key === preset.key
        && !item.custom
        && (preset.key !== "balls" || (!item.brand?.trim() && !item.size?.trim())),
      );
      if (existing) {
        return current.map((item) =>
          item === existing ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item,
        );
      }
      return [...current, { key: preset.key, label: preset.label, quantity: 1 }];
    });
  };

  const updateEquipmentItemQuantity = (index: number, delta: number) => {
    setEquipmentQuantityDrafts((current) => {
      if (!(index in current)) return current;
      const next = { ...current };
      delete next[index];
      return next;
    });
    setKitItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, quantity: Math.max(1, Math.min(999, item.quantity + delta)) };
      }),
    );
  };

  const commitEquipmentQuantityDraft = (index: number, rawValue: string) => {
    const trimmed = rawValue.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        const quantity = Math.max(1, Math.min(999, Math.round(parsed)));
        setKitItems((current) =>
          current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity } : item),
        );
      }
    }
    setEquipmentQuantityDrafts((current) => {
      if (!(index in current)) return current;
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  const addCustomEquipmentItem = () => {
    const label = customEquipmentName.trim();
    if (!label) return;
    const matchingPreset = EQUIPMENT_PRESETS.find(
      (preset) => preset.label.toLowerCase() === label.toLowerCase(),
    );
    if (matchingPreset) {
      addEquipmentPreset(matchingPreset);
      setCustomEquipmentName("");
      blurActiveField();
      return;
    }
    const key = `custom:${equipmentItemKey(label)}`;
    setKitItems((current) => {
      const existingIndex = current.findIndex(
        (item) => item.custom && equipmentItemKey(item.label) === equipmentItemKey(label),
      );
      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item,
        );
      }
      return [...current, { key, label, quantity: 1, custom: true }];
    });
    setCustomEquipmentName("");
    blurActiveField();
  };
  const accountModalOpen = accountDialogOpen;
  const clubGreetingName = getClubGreetingName(clubUser);
  const resetEquipmentForm = () => {
    setEditingKitId(null);
    setKitName("");
    setKitHolderId("storage");
    setKitColor(DEFAULT_EQUIPMENT_COLOR);
    setColorPickerOpen(false);
    setEquipmentItemPickerOpen(false);
    setDeleteBagSlide(0);
    setDeleteConfirmOpen(false);
    setKitItems([]);
    setEquipmentQuantityDrafts({});
    setCustomEquipmentName("");
    setBallDetailsIndex(null);
  };

  const openEquipmentEditor = (prepareForm: () => void) => {
    const openedFromBoard = equipmentBoardOpen;
    equipmentAutosaveReadyRef.current = false;
    equipmentLastQueuedSignatureRef.current = "";
    setEquipmentEditorReturnToBoard(openedFromBoard);

    const openEditor = () => {
      prepareForm();
      setEquipmentDialogOpen(true);
      window.setTimeout(() => {
        equipmentAutosaveReadyRef.current = true;
      }, 0);
    };

    if (openedFromBoard) {
      setEquipmentBoardOpen(false);
      window.setTimeout(openEditor, 90);
      return;
    }

    openEditor();
  };

  const closeEquipmentEditor = (returnToBoard = true) => {
    if (equipmentAutosaveTimerRef.current !== null) {
      window.clearTimeout(equipmentAutosaveTimerRef.current);
      equipmentAutosaveTimerRef.current = null;
    }
    if (equipmentAutosaveReadyRef.current) {
      void persistEquipmentDraft();
    }
    equipmentAutosaveReadyRef.current = false;
    blurActiveField();
    setColorPickerOpen(false);
    setEquipmentItemPickerOpen(false);
    setDeleteConfirmOpen(false);
    setEquipmentDialogOpen(false);
    resetEquipmentForm();

    if (returnToBoard && equipmentEditorReturnToBoard) {
      window.setTimeout(() => setEquipmentBoardOpen(true), 90);
    }
    setEquipmentEditorReturnToBoard(false);
  };

  const openNewEquipmentKit = () => {
    openEquipmentEditor(() => {
      equipmentDraftBagIdRef.current = null;
      resetEquipmentForm();
      setKitHolderId("storage");
    });
  };

  const openEditEquipmentKit = (kit: ClubEquipmentKit) => {
    openEquipmentEditor(() => {
      const existingItems = equipmentItemsForKit(kit);
      const normalizedHolderId = normalizeEquipmentHolderId(kit.holderId);
      const color = kit.color || DEFAULT_EQUIPMENT_COLOR;
      equipmentDraftBagIdRef.current = kit.id;
      equipmentLastQueuedSignatureRef.current = JSON.stringify({
        name: kit.name.trim(),
        holderId: normalizedHolderId,
        color,
        items: existingItems.map((item) => ({
          key: item.key,
          label: item.label.trim(),
          quantity: Math.max(1, Math.min(999, Math.round(item.quantity))),
          custom: item.custom === true,
          brand: item.key === "balls" ? item.brand?.trim() || "" : "",
          size: item.key === "balls" ? item.size?.trim() || "" : "",
        })),
      });
      setEditingKitId(kit.id);
      setKitName(kit.name);
      setKitHolderId(normalizedHolderId);
      setKitColor(color);
      setDeleteBagSlide(0);
      setDeleteConfirmOpen(false);
      setKitItems(existingItems);
      setEquipmentQuantityDrafts({});
      setCustomEquipmentName("");
      setBallDetailsIndex(null);
    });
  };

  function equipmentDraftSignature() {
    return JSON.stringify({
      name: kitName.trim(),
      holderId: normalizeEquipmentHolderId(kitHolderId),
      color: kitColor,
      items: kitItems.map((item) => ({
        key: item.key,
        label: item.label.trim(),
        quantity: Math.max(1, Math.min(999, Math.round(item.quantity))),
        custom: item.custom === true,
        brand: item.key === "balls" ? item.brand?.trim() || "" : "",
        size: item.key === "balls" ? item.size?.trim() || "" : "",
      })),
    });
  }

  async function persistEquipmentDraft() {
    const trimmedName = kitName.trim();
    const normalizedHolderId = normalizeEquipmentHolderId(kitHolderId);
    const hasMeaningfulDraft = Boolean(
      trimmedName
      || kitItems.length > 0
      || normalizedHolderId !== "storage"
      || kitColor !== DEFAULT_EQUIPMENT_COLOR,
    );
    const activeBagId = editingKitId || equipmentDraftBagIdRef.current;
    if (!activeBagId && !hasMeaningfulDraft) return;

    const signature = equipmentDraftSignature();
    if (signature === equipmentLastQueuedSignatureRef.current) return;
    const previousSignature = equipmentLastQueuedSignatureRef.current;
    equipmentLastQueuedSignatureRef.current = signature;

    const bagId = activeBagId || makeId("kit");
    if (!equipmentDraftBagIdRef.current) equipmentDraftBagIdRef.current = bagId;
    const now = Date.now();
    const existingKit = equipmentKits.find((kit) => kit.id === bagId) || null;
    let actorEmail = clubUser?.email || undefined;
    let actorName = actorEmail || "Organizer";
    try {
      const firebaseUser = getFairTeamsAuth().currentUser;
      actorEmail = firebaseUser?.email || actorEmail;
      actorName = firebaseUser?.displayName || actorEmail || "Organizer";
    } catch {
      // Local preview can run without Firebase auth ready.
    }
    const cleanedItems = kitItems
      .filter((item) => item.label.trim() && item.quantity > 0)
      .map((item) => ({
        ...item,
        label: item.label.trim(),
        quantity: Math.max(1, Math.min(999, Math.round(item.quantity))),
        brand: item.key === "balls" ? item.brand?.trim() || undefined : undefined,
        size: item.key === "balls" ? item.size?.trim() || undefined : undefined,
      }))
      .slice(0, 30);
    const nextKit: ClubEquipmentKit = {
      id: bagId,
      name: trimmedName || existingKit?.name || "Equipment bag",
      holderId: normalizedHolderId,
      color: kitColor,
      contents: equipmentContentsFromItems(cleanedItems),
      items: cleanedItems,
      createdAt: existingKit?.createdAt || now,
      createdByEmail: existingKit?.createdByEmail || actorEmail,
      createdByName: existingKit?.createdByName || actorName,
      updatedAt: now,
      updatedByEmail: actorEmail,
      updatedByName: actorName,
    };

    const previousKits = equipmentKits;
    const nextKits = existingKit
      ? previousKits.map((kit) => (kit.id === bagId ? nextKit : kit))
      : [nextKit, ...previousKits];
    const saveSequence = ++equipmentSaveSequenceRef.current;

    try {
      setEquipmentSaving(true);
      setEquipmentError("");
      setEquipmentKits(nextKits);
      if (equipmentGroupId) {
        writeCachedEquipmentKits(equipmentGroupId, nextKits);
        await saveFirebaseEquipmentBag(equipmentGroupId, nextKit);
      }
      if (saveSequence === equipmentSaveSequenceRef.current) {
        setEquipmentLastSyncedAt(Date.now());
      }
    } catch (error) {
      if (saveSequence === equipmentSaveSequenceRef.current) {
        equipmentLastQueuedSignatureRef.current = previousSignature;
        setEquipmentKits(previousKits);
        if (equipmentGroupId) writeCachedEquipmentKits(equipmentGroupId, previousKits);
        setEquipmentError(
          error instanceof Error ? error.message : "Could not save equipment bag.",
        );
      }
    } finally {
      if (saveSequence === equipmentSaveSequenceRef.current) setEquipmentSaving(false);
    }
  }

  useEffect(() => {
    if (!equipmentDialogOpen || !equipmentAutosaveReadyRef.current) return;
    if (equipmentAutosaveTimerRef.current !== null) {
      window.clearTimeout(equipmentAutosaveTimerRef.current);
    }
    equipmentAutosaveTimerRef.current = window.setTimeout(() => {
      equipmentAutosaveTimerRef.current = null;
      void persistEquipmentDraft();
    }, 500);
    return () => {
      if (equipmentAutosaveTimerRef.current !== null) {
        window.clearTimeout(equipmentAutosaveTimerRef.current);
        equipmentAutosaveTimerRef.current = null;
      }
    };
  }, [equipmentDialogOpen, kitName, kitHolderId, kitColor, kitItems]);

  const moveEquipmentKit = async (kitId: string, holderId: string) => {
    const currentKit = equipmentKits.find((kit) => kit.id === kitId);
    if (!currentKit) return;
    const now = Date.now();
    let actorEmail = clubUser?.email || undefined;
    let actorName = actorEmail || "Organizer";
    try {
      const firebaseUser = getFairTeamsAuth().currentUser;
      actorEmail = firebaseUser?.email || actorEmail;
      actorName = firebaseUser?.displayName || actorEmail || "Organizer";
    } catch {
      // Local preview can run without Firebase auth ready.
    }
    const nextKit = {
      ...currentKit,
      holderId,
      updatedAt: now,
      updatedByEmail: actorEmail,
      updatedByName: actorName,
    };
    const previousKits = equipmentKits;
    const nextKits = previousKits.map((kit) =>
      kit.id === kitId ? nextKit : kit,
    );
    const nextHolderLabel =
      equipmentHolderLabelById[normalizeEquipmentHolderId(holderId)] ||
      "new holder";
    setEquipmentKits(nextKits);
    setEquipmentMoveNotice(`${currentKit.name} moved → ${nextHolderLabel}`);
    if (equipmentGroupId) writeCachedEquipmentKits(equipmentGroupId, nextKits);
    try {
      setEquipmentError("");
      if (equipmentGroupId) {
        await saveFirebaseEquipmentBag(equipmentGroupId, nextKit);
      }
    } catch (error) {
      setEquipmentKits(previousKits);
      if (equipmentGroupId)
        writeCachedEquipmentKits(equipmentGroupId, previousKits);
      setEquipmentError(
        error instanceof Error
          ? error.message
          : "Could not move equipment bag.",
      );
    }
  };

  const clearEquipmentDragTimer = () => {
    if (equipmentDragTimerRef.current !== null) {
      window.clearTimeout(equipmentDragTimerRef.current);
      equipmentDragTimerRef.current = null;
    }
  };

  const startEquipmentPointerDrag = (
    event: React.PointerEvent<HTMLElement>,
    kit: ClubEquipmentKit,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearEquipmentDragTimer();
    activeEquipmentDragRef.current = null;
    activeEquipmentDropHolderRef.current = normalizeEquipmentHolderId(
      kit.holderId,
    );
    suppressEquipmentClickRef.current = false;

    equipmentDragTimerRef.current = window.setTimeout(() => {
      activeEquipmentDragRef.current = kit.id;
      activeEquipmentDropHolderRef.current = normalizeEquipmentHolderId(
        kit.holderId,
      );
      suppressEquipmentClickRef.current = true;
      setDraggingKitId(kit.id);
      setDragOverHolderId(normalizeEquipmentHolderId(kit.holderId));
    }, 180);
  };

  const moveEquipmentPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!activeEquipmentDragRef.current) return;
    event.preventDefault();
    const target = document.elementFromPoint(
      event.clientX,
      event.clientY,
    ) as HTMLElement | null;
    const holderElement = target?.closest(
      "[data-equipment-holder-id]",
    ) as HTMLElement | null;
    const nextHolderId = holderElement?.dataset.equipmentHolderId || null;
    if (nextHolderId && nextHolderId !== activeEquipmentDropHolderRef.current) {
      activeEquipmentDropHolderRef.current = nextHolderId;
      setDragOverHolderId(nextHolderId);
    }
  };

  const finishEquipmentPointerDrag = (
    event?: React.PointerEvent<HTMLElement>,
  ) => {
    clearEquipmentDragTimer();
    const kitId = activeEquipmentDragRef.current;
    const holderId = activeEquipmentDropHolderRef.current;
    if (event && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (kitId && holderId) {
      moveEquipmentKit(kitId, holderId);
    }
    activeEquipmentDragRef.current = null;
    activeEquipmentDropHolderRef.current = null;
    setDraggingKitId(null);
    setDragOverHolderId(null);
    window.setTimeout(() => {
      suppressEquipmentClickRef.current = false;
    }, 0);
  };

  const openEquipmentKitFromBoard = (kit: ClubEquipmentKit) => {
    if (suppressEquipmentClickRef.current) return;
    openEditEquipmentKit(kit);
  };

  const deleteEquipmentKit = async (kitId: string) => {
    const previous = equipmentKits;
    const nextKits = previous.filter((kit) => kit.id !== kitId);
    setEquipmentKits(nextKits);
    if (equipmentGroupId) writeCachedEquipmentKits(equipmentGroupId, nextKits);
    try {
      setEquipmentSaving(true);
      setEquipmentError("");
      if (equipmentGroupId) {
        await deleteFirebaseEquipmentBag(equipmentGroupId, kitId);
      }
      if (editingKitId === kitId) {
        equipmentAutosaveReadyRef.current = false;
        if (equipmentAutosaveTimerRef.current !== null) {
          window.clearTimeout(equipmentAutosaveTimerRef.current);
          equipmentAutosaveTimerRef.current = null;
        }
        closeEquipmentEditor(true);
      }
    } catch (error) {
      setEquipmentKits(previous);
      if (equipmentGroupId)
        writeCachedEquipmentKits(equipmentGroupId, previous);
      setEquipmentError(
        error instanceof Error
          ? error.message
          : "Could not delete equipment bag.",
      );
    } finally {
      setEquipmentSaving(false);
    }
  };

  const resolveAttendancePlayer = (record: AttendanceIssueRecord) => {
    const direct = players.find((player) => player.id === record.playerId);
    if (direct) return direct;
    const match = bestPlayerNameMatch(record.playerName, players, { includeDisplayName: true });
    if (!match || match.score < 86 || match.score - match.secondBestScore < 4) return null;
    return match.player;
  };

  const attendanceCutoff = useMemo(() => {
    if (attendanceRange === "all") return null;
    const months = attendanceRange === "3m" ? 3 : attendanceRange === "6m" ? 6 : 12;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(cutoff.getMonth() - months);
    return cutoff;
  }, [attendanceRange]);

  const filteredAttendanceRecords = useMemo(() => attendanceRecords.filter((record) => {
    if (!attendanceCutoff) return true;
    const date = new Date(`${record.incidentDate}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date >= attendanceCutoff;
  }), [attendanceRecords, attendanceCutoff]);

  const attendanceOverview = useMemo(() => {
    const map = new Map<string, { playerId: string; name: string; records: AttendanceIssueRecord[] }>();
    filteredAttendanceRecords.forEach((record) => {
      const matched = resolveAttendancePlayer(record);
      const playerId = matched?.id || record.playerId || `name:${record.playerName.toLowerCase()}`;
      const name = matched?.name || record.playerName || "Unknown player";
      const current = map.get(playerId) || { playerId, name, records: [] };
      current.records.push(record);
      map.set(playerId, current);
    });
    const rows = [...map.values()];
    if (attendanceSort === "recent") {
      return rows.sort((a, b) => {
        const aLatest = Math.max(...a.records.map((record) => new Date(`${record.incidentDate}T12:00:00`).getTime() || 0));
        const bLatest = Math.max(...b.records.map((record) => new Date(`${record.incidentDate}T12:00:00`).getTime() || 0));
        return bLatest - aLatest || b.records.length - a.records.length || a.name.localeCompare(b.name);
      });
    }
    return rows.sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name));
  }, [filteredAttendanceRecords, players, attendanceSort]);

  const attendancePlayerMatches = useMemo(() => {
    const needle = attendancePlayerSearch.trim().toLocaleLowerCase();
    return [...players]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((player) => !needle || player.name.toLocaleLowerCase().includes(needle) || player.aka?.toLocaleLowerCase().includes(needle))
      .slice(0, 24);
  }, [attendancePlayerSearch, players]);

  const attendanceHistoryRow = useMemo(
    () => attendanceHistoryPlayerId ? attendanceOverview.find((row) => row.playerId === attendanceHistoryPlayerId) || null : null,
    [attendanceHistoryPlayerId, attendanceOverview],
  );

  const attendanceWarningOverview = useMemo(() => {
    const needle = attendanceWarningPlayerSearch.trim().toLocaleLowerCase();
    return attendanceOverview.filter((row) => !needle || row.name.toLocaleLowerCase().includes(needle));
  }, [attendanceOverview, attendanceWarningPlayerSearch]);

  const buildAttendanceWarningForRow = (
    row: { playerId: string; name: string; records: AttendanceIssueRecord[] },
    kind: AttendanceWarningTemplateKind,
  ) => {
    let lateCancellationCount = 0;
    let noShowCount = 0;
    let tardyCount = 0;
    const lateCancellationDates: string[] = [];
    const noShowDates: string[] = [];
    row.records.forEach((record) => {
      if (record.issueType === "late-cancellation") {
        lateCancellationCount += 1;
        lateCancellationDates.push(record.incidentDate);
      }
      if (record.issueType === "no-show") {
        noShowCount += 1;
        noShowDates.push(record.incidentDate);
      }
      if (record.issueType === "tardy") tardyCount += 1;
    });
    return fillAttendanceWarningTemplate(attendanceWarningTemplates[kind], {
      player: row.name,
      group: activeRosterName.trim() || "the group",
      period: attendanceRangeText(attendanceRange),
      lateCancellationCount,
      noShowCount,
      tardyCount,
      lateCancellationDates,
      noShowDates,
    });
  };

  const buildAttendanceWarning = (kind: AttendanceWarningTemplateKind) => {
    if (!attendanceHistoryRow) return "";
    return buildAttendanceWarningForRow(attendanceHistoryRow, kind);
  };

  const openAttendanceWarningTemplates = (kind: AttendanceWarningTemplateKind = "late-cancellation") => {
    setAttendanceWarningTemplateKind(kind);
    setAttendanceWarningTemplateDraft(attendanceWarningTemplates[kind]);
    setAttendanceWarningTemplateNotice("");
    setAttendanceWarningTemplatesOpen(true);
  };

  const selectAttendanceWarningTemplateKind = (kind: AttendanceWarningTemplateKind) => {
    setAttendanceWarningTemplateKind(kind);
    setAttendanceWarningTemplateDraft(attendanceWarningTemplates[kind]);
    setAttendanceWarningTemplateNotice("");
  };

  const saveCurrentAttendanceWarningTemplate = async () => {
    if (!sharedRosterId || attendanceWarningTemplateSaving) return;
    setAttendanceWarningTemplateSaving(true);
    setAttendanceWarningTemplateNotice("");
    setAttendanceWarningTemplatesError("");
    try {
      await saveAttendanceWarningTemplate(sharedRosterId, attendanceWarningTemplateKind, attendanceWarningTemplateDraft);
      setAttendanceWarningTemplates((current) => ({ ...current, [attendanceWarningTemplateKind]: attendanceWarningTemplateDraft.trim() }));
      setAttendanceWarningTemplateNotice("Saved for this Club");
    } catch (error) {
      setAttendanceWarningTemplatesError(error instanceof Error ? error.message : "Could not save warning template.");
    } finally {
      setAttendanceWarningTemplateSaving(false);
    }
  };

  const openAttendanceWarningComposerForRow = (
    row: { playerId: string; name: string; records: AttendanceIssueRecord[] },
    kind?: AttendanceWarningTemplateKind,
  ) => {
    const hasNoShow = row.records.some((record) => record.issueType === "no-show");
    const hasLateCancellation = row.records.some((record) => record.issueType === "late-cancellation");
    const hasTardy = row.records.some((record) => record.issueType === "tardy");
    const initialKind = kind || (hasNoShow ? "no-show" : hasLateCancellation ? "late-cancellation" : hasTardy ? "tardy" : "dismissal");
    setAttendanceHistoryPlayerId(row.playerId);
    setAttendanceWarningComposerKind(initialKind);
    setAttendanceWarningComposerDraft(buildAttendanceWarningForRow(row, initialKind));
    setAttendanceWarningCopyNotice("");
    setAttendanceWarningComposerOpen(true);
  };

  const openAttendanceWarningComposer = (kind?: AttendanceWarningTemplateKind) => {
    if (!attendanceHistoryRow) return;
    openAttendanceWarningComposerForRow(attendanceHistoryRow, kind);
  };

  const selectAttendanceWarningComposerKind = (kind: AttendanceWarningTemplateKind) => {
    setAttendanceWarningComposerKind(kind);
    setAttendanceWarningComposerDraft(buildAttendanceWarning(kind));
    setAttendanceWarningCopyNotice("");
  };

  const copyAttendanceWarning = async () => {
    if (!attendanceWarningComposerDraft.trim()) return;
    setAttendanceWarningCopyNotice("");
    try {
      await copyText(attendanceWarningComposerDraft.trim());
      setAttendanceWarningCopyNotice("Copied");
    } catch (error) {
      setAttendanceWarningCopyNotice(error instanceof Error ? error.message : "Could not copy warning.");
    }
  };

  const resetAttendanceEditor = () => {
    setAttendanceEditingId(null);
    setAttendancePlayerId("");
    setAttendancePlayerSearch("");
    setAttendanceIssueType("tardy");
    setAttendanceDate(todayIsoDate());
    setAttendanceNote("");
    setAttendanceDuplicate(null);
  };

  const openNewAttendanceIssue = () => {
    resetAttendanceEditor();
    setAttendanceEditorOpen(true);
  };

  const openAttendanceRecord = (record: AttendanceIssueRecord) => {
    const matched = resolveAttendancePlayer(record);
    setAttendanceEditingId(record.id);
    setAttendancePlayerId(matched?.id || record.playerId);
    setAttendancePlayerSearch(matched?.name || record.playerName || "");
    setAttendanceIssueType(record.issueType);
    setAttendanceDate(record.incidentDate);
    setAttendanceNote(record.note || "");
    setAttendanceDuplicate(null);
    setAttendanceEditorOpen(true);
  };

  const saveAttendanceRecord = async (forceDuplicate = false) => {
    if (!sharedRosterId || !attendanceEnabled || !attendancePlayerId || attendanceSaving) return;
    const player = players.find((candidate) => candidate.id === attendancePlayerId);
    if (!player) {
      setAttendanceError("Choose a player from the roster.");
      return;
    }
    const duplicate = attendanceRecords.find((record) =>
      record.id !== attendanceEditingId &&
      (record.playerId === player.id || resolveAttendancePlayer(record)?.id === player.id) &&
      record.issueType === attendanceIssueType &&
      record.incidentDate === attendanceDate
    );
    if (duplicate && !forceDuplicate) {
      setAttendanceDuplicate(duplicate);
      return;
    }
    setAttendanceSaving(true);
    setAttendanceError("");
    try {
      await saveAttendanceIssue(sharedRosterId, {
        id: attendanceEditingId || undefined,
        playerId: player.id,
        playerName: player.name,
        issueType: attendanceIssueType,
        incidentDate: attendanceDate,
        note: attendanceIssueType === "conduct" ? attendanceNote : undefined,
      });
      setAttendanceEditorOpen(false);
      setAttendanceDuplicate(null);
      resetAttendanceEditor();
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : "Could not save attendance record.");
    } finally {
      setAttendanceSaving(false);
    }
  };

  const removeAttendanceRecord = async () => {
    if (!sharedRosterId || !attendanceEditingId || attendanceSaving) return;
    setAttendanceSaving(true);
    setAttendanceError("");
    try {
      await deleteAttendanceIssue(sharedRosterId, attendanceEditingId);
      setAttendanceEditorOpen(false);
      resetAttendanceEditor();
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : "Could not delete attendance record.");
    } finally {
      setAttendanceSaving(false);
    }
  };

  const blurActiveField = () => {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  };

  const hasClubBackTarget = Boolean(
    colorPickerOpen ||
    equipmentItemPickerOpen ||
    contentPeekKitId ||
    equipmentInventoryOpen ||
    equipmentDialogOpen ||
    equipmentBoardOpen ||
    ratingPlayerId ||
    ratingBoardOpen ||
    attendanceEditorOpen ||
    attendanceWarningTemplatesOpen ||
    attendanceWarningBoardOpen ||
    attendanceWarningComposerOpen ||
    attendanceBoardOpen ||
    accountDialogOpen,
  );

  useEffect(() => {
    equipmentBackStateRef.current = {
      colorPickerOpen,
      contentPeekKitId,
      equipmentBoardOpen,
      equipmentInventoryOpen,
      equipmentDialogOpen,
      equipmentItemPickerOpen,
      ratingPlayerId,
      ratingBoardOpen,
      accountDialogOpen,
      attendanceBoardOpen,
      attendanceEditorOpen,
      attendanceWarningTemplatesOpen,
      attendanceWarningBoardOpen,
      attendanceWarningComposerOpen,
    };
  }, [
    accountDialogOpen,
    colorPickerOpen,
    contentPeekKitId,
    equipmentBoardOpen,
    equipmentInventoryOpen,
    equipmentDialogOpen,
    equipmentItemPickerOpen,
    ratingPlayerId,
    ratingBoardOpen,
    attendanceBoardOpen,
    attendanceEditorOpen,
    attendanceWarningTemplatesOpen,
    attendanceWarningBoardOpen,
    attendanceWarningComposerOpen,
  ]);

  useEffect(() => {
    onBackTargetChange?.(hasClubBackTarget);
    return () => onBackTargetChange?.(false);
  }, [hasClubBackTarget, onBackTargetChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNativeBack = (event: Event) => {
      const state = equipmentBackStateRef.current;

      // Close the most specific Club overlay first. The edit-bag dialog sits above the
      // equipment board, so Android back should close Edit Bag before closing the board.
      if (state.colorPickerOpen) {
        event.preventDefault();
        setColorPickerOpen(false);
        return;
      }
      if (state.equipmentItemPickerOpen) {
        event.preventDefault();
        setEquipmentItemPickerOpen(false);
        return;
      }
      if (state.contentPeekKitId) {
        event.preventDefault();
        setContentPeekKitId(null);
        return;
      }
      if (state.equipmentDialogOpen) {
        event.preventDefault();
        closeEquipmentEditor(true);
        return;
      }
      if (state.equipmentInventoryOpen) {
        event.preventDefault();
        setEquipmentInventoryOpen(false);
        return;
      }
      if (state.equipmentBoardOpen) {
        event.preventDefault();
        setContentPeekKitId(null);
        setEquipmentBoardOpen(false);
        return;
      }
      if (state.attendanceWarningComposerOpen) {
        event.preventDefault();
        blurActiveField();
        setAttendanceWarningComposerOpen(false);
        setAttendanceWarningCopyNotice("");
        return;
      }
      if (state.attendanceWarningTemplatesOpen) {
        event.preventDefault();
        blurActiveField();
        setAttendanceWarningTemplatesOpen(false);
        setAttendanceWarningTemplateNotice("");
        return;
      }
      if (state.attendanceWarningBoardOpen) {
        event.preventDefault();
        setAttendanceWarningBoardOpen(false);
        setAttendanceWarningPlayerSearch("");
        return;
      }
      if (state.attendanceEditorOpen) {
        event.preventDefault();
        blurActiveField();
        setAttendanceEditorOpen(false);
        setAttendanceDuplicate(null);
        return;
      }
      if (state.attendanceBoardOpen) {
        event.preventDefault();
        setAttendanceHistoryPlayerId(null);
        setAttendanceBoardOpen(false);
        return;
      }
      if (state.ratingPlayerId) {
        event.preventDefault();
        setRatingPlayerId(null);
        return;
      }
      if (state.ratingBoardOpen) {
        event.preventDefault();
        setRatingBoardOpen(false);
        return;
      }
      if (state.accountDialogOpen) {
        event.preventDefault();
        blurActiveField();
        setAccountDialogOpen(false);
      }
    };

    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () =>
      window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [equipmentEditorReturnToBoard]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CLUB_DESK_COLLAPSED_STORAGE_KEY, clubDeskCollapsed ? "1" : "0");
    } catch {
      // ignore local storage errors
    }
  }, [clubDeskCollapsed]);

  const clubDeskSummary = useMemo(() => {
    if (!clubUser) return "Sign in to share and manage collaborators";
    const parts: string[] = [];
    if (isSharedRoster) {
      parts.push(`${sharedPeopleCount} organizer${sharedPeopleCount === 1 ? "" : "s"}`);
      parts.push("Shared roster");
    } else {
      parts.push("Private setup");
    }
    return parts.join(" · ");
  }, [clubUser, isSharedRoster, sharedPeopleCount]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-1 pb-2 lg:mx-0 lg:max-w-none lg:gap-5 lg:px-0">
      <Dialog
        open={accountModalOpen}
        onOpenChange={setAccountDialogOpen}
      >
        <DialogContent className="stripes-type-ui max-w-sm rounded-3xl p-3">
          <DialogHeader className="px-1 pb-1 text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">
              Stripes account
            </DialogTitle>
          </DialogHeader>
          <FirebaseSharedRosterAuthCard />
        </DialogContent>
      </Dialog>

      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 xl:[grid-template-columns:minmax(18rem,0.84fr)_minmax(0,1.26fr)] xl:[grid-template-rows:auto_auto_auto]">
      <div id="fairteams-help-panel" className="order-6 lg:col-span-1 lg:col-start-2 lg:row-start-3">
        <button
          type="button"
          className="stripes-type-ui flex w-full items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99] lg:hidden"
          onClick={() => setHelpCollapsed((current) => !current)}
          aria-expanded={!helpCollapsed || tutorialStep === "help-question"}
          aria-controls="fairteams-help-content"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-black leading-tight text-[#102A43]">Stripes Help</span>
            <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">
              Ask how Stripes works
            </span>
          </span>
          <span className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500">
            {helpCollapsed && tutorialStep !== "help-question"
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronUp className="h-4 w-4" />}
          </span>
        </button>

        <div
          id="fairteams-help-content"
          className={helpCollapsed && tutorialStep !== "help-question"
            ? "hidden lg:block"
            : "mt-2 block lg:mt-0"}
        >
          <AiSmartCommandPanel
            players={players}
            rosterName={activeRosterName}
            rosterMode={isSharedRoster ? "shared" : "local"}
            activeTab="club"
            currentTeamCount={currentTeamCount}
            currentTeamsGenerated={currentTeamsGenerated}
            onApplyAction={applyAiSmartCommandAction}
            onOpenToday={onOpenTodayFromAi}
            onQuestionSubmitted={() => onTutorialAction?.("help-question-submitted")}
            tutorialActive={tutorialStep === "help-question"}
            tutorialQuestion="How do shared rosters work?"
          />
        </div>
      </div>

      <section className="order-1 overflow-hidden rounded-[1.7rem] border border-[#d9e9e4] bg-[#f3f8f7] p-3 shadow-sm ring-1 ring-[#e7f1ee] lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:h-full lg:p-4">
        <div className="stripes-type-ui flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-[1_1_9.125rem] items-start gap-2.5 text-left active:scale-[0.99]"
            onClick={() => setPlayerManagementCollapsed((current) => !current)}
            aria-expanded={!playerManagementCollapsed}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-[#2f6f65] shadow-sm ring-1 ring-[#d6e8e2] lg:h-10 lg:w-10">
              <UsersRound className="fairteams-desktop-balanced-icon h-5 w-5 lg:h-6 lg:w-6" />
            </div>
            <span className="min-w-0">
              <span className="block text-[17px] font-black leading-tight text-[#102A43] lg:text-[20px]">Player Management</span>
              <span className="mt-0.5 block text-[10px] font-bold text-[#52746d] lg:text-[12px]">Ratings · Attendance · Rules · Warnings</span>
            </span>
          </button>
          <button
            type="button"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-[#52746d] ring-1 ring-[#d6e8e2] active:scale-[0.98]"
            onClick={() => setPlayerManagementCollapsed((current) => !current)}
            aria-label={playerManagementCollapsed ? "Expand Player Management" : "Collapse Player Management"}
          >
            {playerManagementCollapsed ? <ChevronDown className="h-4 w-4 lg:h-5 lg:w-5" /> : <ChevronUp className="h-4 w-4 lg:h-5 lg:w-5" />}
          </button>
        </div>

        {!playerManagementCollapsed && (
          <>
            <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                className="flex min-h-[3.25rem] w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!clubRatingsEnabled || players.length === 0}
                onClick={() => setRatingBoardOpen(true)}
              >
                <Star className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-sm">Club ratings</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[11px]">
                    {clubRatingsEnabled ? `${clubRatedCount}/${players.length} rated` : isSharedRoster ? "Sign in to rate" : "Shared rosters only"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>

              <button
                type="button"
                className="flex min-h-[3.25rem] w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!attendanceEnabled}
                onClick={() => { setAttendanceHistoryPlayerId(null); setAttendanceBoardOpen(true); }}
              >
                <Clock3 className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-sm">Attendance</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[11px]">
                    {attendanceEnabled ? "Shared organizer log" : isSharedRoster ? "Sign in to record" : "Shared rosters only"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>

              <button
                type="button"
                className="flex min-h-[3.25rem] w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!onOpenPairingRules || playerCount < 2}
                onClick={onOpenPairingRules}
              >
                <ClipboardList className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-sm">Rules</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[11px]">
                    {cleanPairingRuleCount > 0 ? `${cleanPairingRuleCount} pairing rule${cleanPairingRuleCount === 1 ? "" : "s"}` : "No pairing rules"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>

              <button
                type="button"
                className="flex min-h-[3.25rem] w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!attendanceEnabled}
                onClick={() => { setAttendanceWarningPlayerSearch(""); setAttendanceWarningBoardOpen(true); }}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-sm">Warnings</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[11px]">
                    {attendanceEnabled ? `${attendanceOverview.length} player${attendanceOverview.length === 1 ? "" : "s"} with recorded issues` : isSharedRoster ? "Sign in to use warnings" : "Shared rosters only"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </div>

            {(isSharedRoster && legacySkillSeedPlayers.length > 0) && (
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-bold leading-snug text-slate-700">
                  Use current roster ratings as your first Club ratings.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-8 w-full rounded-xl border-slate-200 bg-white text-[11px] font-black text-[#102A43] hover:bg-slate-50"
                  disabled={!clubRatingsEnabled || ratingSeedSaving}
                  onClick={seedClubRatingsFromRosterSkills}
                >
                  {ratingSeedSaving ? "Importing…" : `Use ratings for ${legacySkillSeedPlayers.length} player${legacySkillSeedPlayers.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            )}

            {ratingSeedMessage && (
              <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-snug text-emerald-800">
                {ratingSeedMessage}
              </div>
            )}

            {clubRatingError && (
              <div className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-800">
                {clubRatingError}
              </div>
            )}

            {isSharedRoster && (clubNeedRatingCount > 0 || clubSkippedCount > 0) && (
              <div className="mt-2 grid gap-2">
                {clubNeedRatingCount > 0 && (
                  <button
                    type="button"
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left active:scale-[0.99] disabled:opacity-50"
                    disabled={!clubRatingsEnabled}
                    onClick={() => setRatingBoardOpen(true)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-[#102A43]">Needs your rating</span>
                      <span className="block truncate text-[11px] font-semibold text-slate-600">
                        {orderedNeedRatingPlayers.slice(0, 3).map((player) => player.name).join(", ")}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-700 ring-1 ring-slate-200">{clubNeedRatingCount}</span>
                  </button>
                )}
                {clubSkippedCount > 0 && (
                  <button
                    type="button"
                    className="flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-left active:scale-[0.99] disabled:opacity-50"
                    disabled={!clubRatingsEnabled}
                    onClick={() => setRatingBoardOpen(true)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-[#102A43]">Skipped for later</span>
                      <span className="block truncate text-[11px] font-semibold text-amber-700">
                        {skippedPlayers.slice(0, 3).map((player) => player.name).join(", ")}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-amber-700">{clubSkippedCount}</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="order-2 overflow-hidden rounded-[1.7rem] border border-violet-100 bg-[#f8f3ff] p-3 shadow-sm ring-1 ring-violet-50 lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:h-full lg:p-4">
        <div className="stripes-type-ui flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-[1_1_8.625rem] items-center gap-2.5 text-left active:scale-[0.99]"
            onClick={() => setAccountDialogOpen(true)}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/85 text-violet-700 shadow-sm ring-1 ring-violet-100 lg:h-10 lg:w-10">
              <KeyRound className="fairteams-desktop-balanced-icon h-[18px] w-[18px] lg:h-5 lg:w-5" />
            </div>
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-black leading-tight text-[#102A43] lg:text-[20px]">Club Access</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-violet-700/75 lg:text-[12px]">
                {clubUser && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Online" />}
                <span className="truncate">{clubUser ? `${clubGreetingName} · ${clubDeskSummary}` : clubDeskSummary}</span>
              </span>
            </span>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!clubUser && (
              <Button
                type="button"
                className="h-9 shrink-0 rounded-full bg-[#102A43] px-3 text-[11px] font-black text-white hover:bg-[#0b2036] lg:text-xs"
                onClick={() => setAccountDialogOpen(true)}
              >
                Sign in
              </Button>
            )}
            {clubUser && (
              <Button
                type="button"
                className="h-8 shrink-0 rounded-full border border-violet-100 bg-white px-2.5 text-[10px] font-black text-violet-700 hover:bg-violet-50 lg:h-9 lg:px-3 lg:text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  void signOutOfSharedRosters();
                }}
              >
                Sign out
              </Button>
            )}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-violet-600 ring-1 ring-violet-100 active:scale-[0.98]"
              onClick={() => setClubDeskCollapsed((current) => !current)}
              aria-label={clubDeskCollapsed ? "Expand Club Access" : "Collapse Club Access"}
            >
              {clubDeskCollapsed ? <ChevronDown className="h-4 w-4 lg:h-5 lg:w-5" /> : <ChevronUp className="h-4 w-4 lg:h-5 lg:w-5" />}
            </button>
          </div>
        </div>

        {!clubDeskCollapsed && (
          <div className="mt-3 min-w-0">{sharedToolsNode}</div>
        )}
      </section>

      <div className="order-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:h-full lg:[&>section]:h-full">
        <TaskBoard
          rosterName={activeRosterName}
          workspaceKey={workspaceKey}
          themeColor={themeColor}
          scopeId={equipmentGroupId}
          isSharedRoster={isSharedRoster}
          user={clubUser}
          eligibleVoterCount={isSharedRoster ? Math.max(1, sharedPeopleCount) : 1}
          organizerPeople={actionBoardOrganizerPeople}
          players={players}
          equipmentItems={actionBoardEquipmentItems}
          equipmentSnapshot={actionBoardEquipmentSnapshot}
          onOpenEquipmentInventory={() => setEquipmentInventoryOpen(true)}
        />
      </div>

      <section className="order-4 overflow-hidden rounded-[1.7rem] border border-amber-100 lg:overflow-visible bg-[#fffaf0] p-3 shadow-sm ring-1 ring-amber-50 lg:col-span-1 lg:col-start-2 lg:row-start-2 lg:h-full lg:p-4">
        <div className="stripes-type-ui flex items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:scale-[0.99]"
            onClick={() => setClubNotesOpen(true)}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-[#b76518] shadow-sm ring-1 ring-amber-100 lg:h-10 lg:w-10">
              <StickyNote className="fairteams-desktop-balanced-icon h-[18px] w-[18px] lg:h-6 lg:w-6" />
            </div>
            <span className="min-w-0">
              <span className="block text-[17px] font-black leading-tight text-[#102A43] lg:text-[20px]">Club Notes</span>
              <span className="mt-0.5 block truncate text-[10px] font-bold text-[#9a641f] lg:text-[12px]">
                {previewClubNotes[0] ? `Latest: ${previewClubNotes[0].text}` : "Shared notes for organizers"}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-[#b76518] ring-1 ring-amber-100 active:scale-[0.98] lg:hidden"
            onClick={() => setClubNotesOpen(true)}
            aria-label="Open Club Notes"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
            {clubNotes.length > 0 && (
              <button
                type="button"
                className="rounded-full bg-transparent px-2.5 py-1 text-[11px] font-black text-[#a94f0a] active:scale-95 lg:text-xs"
                onClick={() => setClubNotesOpen(true)}
              >
                View all
              </button>
            )}
            <Button
              type="button"
              className="h-9 rounded-full bg-[#c8772a] px-3 text-[11px] font-black text-white hover:bg-[#af691f] lg:text-xs"
              onClick={() => setClubNotesOpen(true)}
              disabled={!clubNotesEnabled}
            >
              Post-it
            </Button>
          </div>
        </div>

        <div className={`mt-3 hidden gap-2.5 overflow-visible px-0.5 ${previewClubNotes.length <= 1 ? "lg:flex lg:py-1.5" : "lg:grid lg:grid-cols-3 lg:py-2.5"}`}>
          {previewClubNotes.length > 0 ? (
            previewClubNotes.map((note, index) => (
              <div
                key={note.id}
                className={`relative rounded-[0.8rem] border border-black/5 px-2.5 py-2.5 shadow-[0_4px_8px_rgba(130,85,35,0.22)] ring-1 ring-white/25 ${previewClubNotes.length === 1 ? "min-h-[5.75rem] w-[9.75rem] lg:w-[12rem]" : "min-h-[6.45rem]"}`}
                style={clubNoteStyle(index)}
              >
                <div className="flex h-full flex-col">
                  <div
                    className={clubNoteTextClass(note.text)}
                    style={{ fontFamily: '"Patrick Hand", "Outfit", system-ui, sans-serif' }}
                  >
                    {note.text}
                  </div>
                  <div className="mt-1.5 pr-4 text-[9px] font-bold leading-tight text-slate-600/80">
                    <div className="truncate">— {note.createdByName || "Organizer"}</div>
                  </div>
                </div>
                {canRemoveClubNote(note) && (
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 rounded-full bg-white/60 p-1 text-slate-600 shadow-sm active:scale-95 disabled:opacity-50"
                    onClick={() => removeOwnClubNote(note)}
                    disabled={clubNoteDeletingId === note.id}
                    aria-label="Remove your Club note"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-3 min-h-[5rem] w-full rounded-2xl border border-dashed border-amber-200 bg-white/60 px-3 py-3 text-sm font-black text-[#102A43] lg:min-h-[3.75rem] lg:py-2.5">
              Leave the first note for the organizers.
            </div>
          )}
        </div>

        {clubNotesError && (
          <div className="mt-2 rounded-xl bg-amber-100/70 px-3 py-2 text-[11px] font-bold text-amber-900">
            {clubNotesError}
          </div>
        )}
      </section>

      <section className="order-5 rounded-[1.7rem] border border-sky-100 bg-[#f6fbff] p-3 shadow-sm ring-1 ring-sky-50 lg:col-span-1 lg:col-start-1 lg:row-start-3 lg:h-full lg:p-4">
        <div className="stripes-type-ui flex flex-wrap items-start justify-between gap-3">
          <button type="button" className="flex min-w-0 flex-[1_1_8rem] items-center gap-2.5 text-left active:scale-[0.99]" onClick={() => setEquipmentBoardOpen(true)}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-blue-600 shadow-sm ring-1 ring-sky-100 lg:h-10 lg:w-10">
              <AntiqueBallIcon className="h-[18px] w-[18px] lg:h-6 lg:w-6" />
            </div>
            <div className="min-w-0 flex-1">
            <div className="text-[17px] font-black leading-tight text-[#102A43] lg:text-[20px]">
              Equipment
            </div>
            <div className="mt-1 hidden text-xs font-semibold leading-snug text-slate-500 lg:block lg:text-[14px] lg:leading-relaxed">
              Drag bags between people and club storage, or select a bag for details.
            </div>
            <div className="mt-1 text-[10px] font-black text-slate-400 lg:hidden">
              Bags · balls · cones · gear
            </div>
            </div>
          </button>
          <button type="button" className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-blue-600 ring-1 ring-sky-100 active:scale-[0.98] lg:hidden" onClick={() => setEquipmentBoardOpen(true)} aria-label="Open Equipment">
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button
            type="button"
            className="hidden h-9 shrink-0 rounded-2xl border border-slate-100 bg-white px-3 text-xs font-black text-[#102A43] shadow-sm hover:bg-slate-50 lg:inline-flex lg:text-sm"
            onClick={() => setEquipmentBoardOpen(true)}
          >
            Open
          </Button>
        </div>

        <div className="hidden lg:block">
        {equipmentKits.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-[1.35rem] border border-slate-100 bg-slate-50/60">
            {equipmentDashboardHolders.map((holder, index) => {
              const holderKits = equipmentKits.filter(
                (kit) =>
                  normalizeEquipmentHolderId(kit.holderId) === holder.id,
              );
              const highlighted = dragOverHolderId === holder.id;
              return (
                <div
                  key={`dashboard-${holder.id}`}
                  data-equipment-holder-id={holder.id}
                  className={`grid grid-cols-[4.8rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-2 transition ${index === 0 ? "" : "border-t border-slate-100"} ${highlighted ? "bg-emerald-50 ring-2 ring-inset ring-emerald-100" : ""}`}
                >
                  <div className="truncate text-[11px] font-black text-[#102A43]">
                    {holder.label}
                  </div>
                  <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                    {holderKits.length ? (
                      holderKits.map((kit) => {
                        const isDragging = draggingKitId === kit.id;
                        return (
                          <button
                            key={`dashboard-kit-${kit.id}`}
                            type="button"
                            className={`touch-none select-none rounded-2xl border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition active:scale-[0.98] ${isDragging ? "scale-95 opacity-45 ring-2 ring-emerald-200" : ""}`}
                            onPointerDown={(event) =>
                              startEquipmentPointerDrag(event, kit)
                            }
                            onPointerMove={moveEquipmentPointerDrag}
                            onPointerUp={finishEquipmentPointerDrag}
                            onPointerCancel={finishEquipmentPointerDrag}
                            onClick={() => openEquipmentKitFromBoard(kit)}
                            aria-label={`Edit ${kit.name}`}
                          >
                            <span className="flex max-w-[7.4rem] items-center gap-1.5">
                              <DuffleBagIcon
                                color={kit.color || DEFAULT_EQUIPMENT_COLOR}
                                className="h-6 w-8 shrink-0"
                              />
                              <span className="min-w-0 truncate text-[11px] font-black text-[#102A43]">
                                {kit.name}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <span className="rounded-full border border-dashed border-slate-200 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate-400">
                        No bag
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {equipmentKits.length > equipmentPreviewKits.length && (
              <div className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-400">
                Open board to see all {equipmentKits.length} bags.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-white/70 px-3 py-5 text-center text-sm font-black text-[#102A43] lg:py-3.5">
            No bags yet
          </div>
        )}
        </div>
      </section>
      </div>

      <Dialog open={clubNotesOpen} onOpenChange={setClubNotesOpen}>
        <DialogContent className="stripes-type-ui max-h-[86svh] max-w-sm overflow-hidden rounded-3xl border border-amber-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-amber-100 bg-amber-50/70 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43] lg:text-xl">
              <StickyNote className="h-4 w-4 text-amber-600" />
              Club notes
            </DialogTitle>
          </DialogHeader>
          <div className="border-b border-amber-100 bg-white/80 p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-amber-100 bg-white p-2 shadow-sm">
              <Textarea
                value={clubNoteDraft}
                onChange={(event) => setClubNoteDraft(event.target.value)}
                disabled={!clubNotesEnabled}
                placeholder={
                  clubNotesEnabled
                    ? "Puma ball died today — Joon"
                    : clubNotesUnavailableReason || "Shared notes appear after sign-in."
                }
                className="min-h-[4.25rem] min-w-0 flex-1 resize-none border-0 bg-transparent p-1 text-sm font-semibold shadow-none focus-visible:ring-0 min-[310px]:min-h-[3.2rem]"
                maxLength={160}
              />
              <Button
                type="button"
                className="h-10 shrink-0 rounded-2xl bg-[#b75a0d] px-3 text-xs font-black text-white hover:bg-[#9a4708]"
                disabled={!canAddClubNote}
                onClick={addSharedClubNote}
              >
                {clubNoteSaving ? "Posting…" : "Post"}
              </Button>
            </div>
            {clubNotesError && (
              <div className="mt-2 rounded-xl bg-amber-100/70 px-3 py-2 text-[11px] font-bold text-amber-900">
                {clubNotesError}
              </div>
            )}
          </div>
          <div
            className="max-h-[50svh] overflow-y-auto p-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="grid gap-2">
              {clubNotes.length > 0 ? (
                clubNotes.map((note) => (
                  <div
                    key={`all-${note.id}`}
                    className="rounded-[1.25rem] border border-amber-100 bg-amber-50/80 px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[15px] font-bold leading-[1.12] text-[#25364A]/90"
                          style={{ fontFamily: '"Patrick Hand", "Outfit", system-ui, sans-serif' }}
                        >
                          {note.text}
                        </div>
                        <div className="mt-1 text-[10px] font-bold leading-tight text-amber-700/70">
                          <div>— {note.createdByName || "Organizer"}</div>
                          <div>{formatClubNoteDate(note.createdAt)}</div>
                        </div>
                      </div>
                      {canRemoveClubNote(note) && (
                        <button
                          type="button"
                          className="rounded-full bg-white/80 p-1.5 text-amber-600 ring-1 ring-amber-100 active:scale-95 disabled:opacity-50"
                          onClick={() => removeOwnClubNote(note)}
                          disabled={clubNoteDeletingId === note.id}
                          aria-label="Remove your Club note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]">
                  No notes yet.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={collaboratorsOpen} onOpenChange={setCollaboratorsOpen}>
        <DialogContent className="max-w-xs rounded-3xl border border-slate-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">
              Organizers
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 p-4">
            {sharedPersonNames.length ? (
              sharedPersonNames.map((name) => (
                <div
                  key={name}
                  className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]"
                >
                  {name}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
                Only you
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceBoardOpen} onOpenChange={(open) => { setAttendanceBoardOpen(open); if (!open) setAttendanceHistoryPlayerId(null); }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-hidden rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              {attendanceHistoryPlayerId && <button type="button" className="-ml-1 rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={() => setAttendanceHistoryPlayerId(null)} aria-label="Back to attendance overview"><ChevronLeft className="h-5 w-5" /></button>}
              <Clock3 className="h-5 w-5 text-violet-600" />
              {attendanceHistoryPlayerId ? (attendanceOverview.find((row) => row.playerId === attendanceHistoryPlayerId)?.name || "Attendance history") : "Club attendance"}
            </DialogTitle>
          </DialogHeader>
          {!attendanceHistoryPlayerId ? (
            <div className="flex min-h-0 flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Period
                  <select value={attendanceRange} onChange={(event) => setAttendanceRange(event.target.value as AttendanceRange)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#102A43]">
                    <option value="3m">3 months</option>
                    <option value="6m">6 months</option>
                    <option value="12m">12 months</option>
                    <option value="all">All</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Sort
                  <select value={attendanceSort} onChange={(event) => setAttendanceSort(event.target.value as AttendanceSort)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#102A43]">
                    <option value="issues">Most issues</option>
                    <option value="recent">Most recent</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Button type="button" className="h-10 min-w-0 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceEnabled} onClick={openNewAttendanceIssue}><Plus className="mr-1.5 h-4 w-4" />Record attendance issue</Button>
                <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-[#102A43]" disabled={!attendanceEnabled} onClick={() => openAttendanceWarningTemplates()}><ClipboardList className="mr-1.5 h-4 w-4" />Templates</Button>
              </div>
              {attendanceError && <div className="shrink-0 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{attendanceError}</div>}
              <div className="min-h-0 max-h-[52dvh] overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: "touch" }}>
                {attendanceLoading ? <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">Loading attendance…</div> : attendanceOverview.length === 0 ? <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">No attendance issues recorded.</div> : <div className="grid gap-2">{attendanceOverview.map((row) => {
                  const counts = { tardy: 0, lateCancellation: 0, noShow: 0, conduct: 0 };
                  row.records.forEach((record) => { if (record.issueType === "tardy") counts.tardy += 1; if (record.issueType === "late-cancellation") counts.lateCancellation += 1; if (record.issueType === "no-show") counts.noShow += 1; if (record.issueType === "conduct") counts.conduct += 1; });
                  const parts = [counts.noShow ? `${counts.noShow} No-show` : "", counts.lateCancellation ? `${counts.lateCancellation} Last-minute` : "", counts.tardy ? `${counts.tardy} Tardy` : "", counts.conduct ? `${counts.conduct} Conduct` : ""].filter(Boolean);
                  return <button key={row.playerId} type="button" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99]" onClick={() => setAttendanceHistoryPlayerId(row.playerId)}><span className="min-w-0"><span className="block truncate text-sm font-black text-[#102A43]">{row.name}</span><span className="block truncate text-[11px] font-semibold text-slate-500">{parts.join(" · ")}</span></span><span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">{row.records.length} {row.records.length === 1 ? "issue" : "issues"}</span></button>;
                })}</div>}
              </div>
            </div>
          ) : (
            <div className="max-h-[68dvh] overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
              <Button type="button" className="mb-3 h-10 w-full rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" onClick={() => openAttendanceWarningComposer()}><Copy className="mr-1.5 h-4 w-4" />Copy warning</Button>
              <div className="grid gap-2">{(attendanceHistoryRow?.records || []).map((record) => <button key={record.id} type="button" className="rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99]" onClick={() => openAttendanceRecord(record)}><div className="flex items-start justify-between gap-2"><span className="text-sm font-black text-[#102A43]">{attendanceIssueLabel(record.issueType)}</span><span className="text-[10px] font-black text-slate-400">{formatAttendanceDate(record.incidentDate)}</span></div>{record.note && <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">{record.note}</div>}{(record.createdByName || record.createdByEmail) && <div className="mt-1.5 text-[10px] font-semibold text-slate-400">Recorded by {record.createdByName || record.createdByEmail}</div>}</button>)}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceWarningBoardOpen} onOpenChange={(open) => { setAttendanceWarningBoardOpen(open); if (!open) { blurActiveField(); setAttendanceWarningPlayerSearch(""); } }}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-hidden rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><AlertTriangle className="h-5 w-5 text-[#3f756b]" />Warnings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 border-b border-slate-100 p-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                <Input value={attendanceWarningPlayerSearch} onChange={(event) => setAttendanceWarningPlayerSearch(event.target.value)} placeholder="Find a player" className="h-10 rounded-2xl border-slate-200 pl-9 text-sm font-semibold" />
              </div>
              <Button type="button" variant="outline" className="h-10 shrink-0 rounded-2xl border-slate-200 px-3 text-xs font-black text-[#102A43]" onClick={() => openAttendanceWarningTemplates()}><ClipboardList className="mr-1.5 h-4 w-4" />Templates</Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">Attendance overview</span>
              <select value={attendanceRange} onChange={(event) => setAttendanceRange(event.target.value as AttendanceRange)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-[#102A43]">
                <option value="3m">Last 3 months</option>
                <option value="6m">Last 6 months</option>
                <option value="12m">Last 12 months</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div className="max-h-[64dvh] overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
            {attendanceLoading ? (
              <div className="py-8 text-center text-sm font-semibold text-slate-400">Loading attendance…</div>
            ) : attendanceWarningOverview.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400">No recorded attendance issues in this period.</div>
            ) : (
              <div className="grid gap-2">
                {attendanceWarningOverview.map((row) => {
                  const counts = { noShow: 0, lateCancellation: 0, tardy: 0, conduct: 0 };
                  row.records.forEach((record) => {
                    if (record.issueType === "no-show") counts.noShow += 1;
                    if (record.issueType === "late-cancellation") counts.lateCancellation += 1;
                    if (record.issueType === "tardy") counts.tardy += 1;
                    if (record.issueType === "conduct") counts.conduct += 1;
                  });
                  const latest = [...row.records].sort((a, b) => b.incidentDate.localeCompare(a.incidentDate))[0];
                  const parts = [counts.noShow ? `${counts.noShow} no-show` : "", counts.lateCancellation ? `${counts.lateCancellation} last-minute` : "", counts.tardy ? `${counts.tardy} tardy` : "", counts.conduct ? `${counts.conduct} conduct` : ""].filter(Boolean);
                  return (
                    <button key={row.playerId} type="button" className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm transition active:scale-[0.99]" onClick={() => { setAttendanceWarningBoardOpen(false); openAttendanceWarningComposerForRow(row); }}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-[#102A43]">{row.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{parts.join(" · ")}</span>
                        {latest && <span className="mt-1 block text-[10px] font-semibold text-slate-400">Latest · {formatAttendanceDate(latest.incidentDate)} · {attendanceIssueLabel(latest.issueType)}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[11px] font-black text-[#102A43]">{row.records.length}</span>
                        <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">issues</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceWarningTemplatesOpen} onOpenChange={(open) => { setAttendanceWarningTemplatesOpen(open); if (!open) { blurActiveField(); setAttendanceWarningTemplateNotice(""); } }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><ClipboardList className="h-5 w-5 text-violet-600" />Warning templates</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 p-4">
            <div className="rounded-2xl bg-violet-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-violet-800">These templates belong to this Club and are shared with collaborators. Stripes never sends them automatically.</div>
            <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              Template
              <select value={attendanceWarningTemplateKind} onChange={(event) => selectAttendanceWarningTemplateKind(event.target.value as AttendanceWarningTemplateKind)} className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#102A43]">
                {ATTENDANCE_WARNING_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wide text-slate-400">Saved wording</Label>
              <Textarea value={attendanceWarningTemplateDraft} onChange={(event) => { setAttendanceWarningTemplateDraft(event.target.value.slice(0, 2400)); setAttendanceWarningTemplateNotice(""); }} className="min-h-48 resize-none rounded-2xl border-slate-200 text-sm font-semibold leading-relaxed" />
              <div className="text-[10px] font-semibold leading-relaxed text-slate-400">Placeholders: {'{player}'} · {'{group}'} · {'{period}'} · {'{last_minute}'} · {'{last_minute_dates}'} · {'{no_shows}'} · {'{no_show_dates}'} · {'{tardies}'} · {'{attendance_issues}'}</div>
            </div>
            {attendanceWarningTemplatesLoading && <div className="text-[11px] font-semibold text-slate-400">Syncing Club templates…</div>}
            {attendanceWarningTemplatesError && <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{attendanceWarningTemplatesError}</div>}
            {attendanceWarningTemplateNotice && <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">{attendanceWarningTemplateNotice}</div>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-slate-600" disabled={attendanceWarningTemplateSaving} onClick={() => { setAttendanceWarningTemplateDraft(DEFAULT_ATTENDANCE_WARNING_TEMPLATES[attendanceWarningTemplateKind]); setAttendanceWarningTemplateNotice("Default loaded — save to share it"); }}>Default</Button>
              <Button type="button" className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceWarningTemplateDraft.trim() || attendanceWarningTemplateSaving || !attendanceEnabled} onClick={saveCurrentAttendanceWarningTemplate}>{attendanceWarningTemplateSaving ? "Saving…" : "Save template"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceWarningComposerOpen} onOpenChange={(open) => { setAttendanceWarningComposerOpen(open); if (!open) { blurActiveField(); setAttendanceWarningCopyNotice(""); } }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><Copy className="h-5 w-5 text-violet-600" />Copy warning{attendanceHistoryRow ? ` · ${attendanceHistoryRow.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 p-4">
            <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              Template
              <select value={attendanceWarningComposerKind} onChange={(event) => selectAttendanceWarningComposerKind(event.target.value as AttendanceWarningTemplateKind)} className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#102A43]">
                {ATTENDANCE_WARNING_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wide text-slate-400">Preview</Label>
              <Textarea value={attendanceWarningComposerDraft} onChange={(event) => { setAttendanceWarningComposerDraft(event.target.value); setAttendanceWarningCopyNotice(""); }} className="min-h-52 resize-none rounded-2xl border-slate-200 text-sm font-semibold leading-relaxed" />
              <div className="text-[10px] font-semibold leading-relaxed text-slate-400">No-show and last-minute templates can cite the recorded dates. Tardy templates use the selected period and count. Conduct notes are never inserted automatically. You can edit this copy before copying it.</div>
            </div>
            {attendanceWarningCopyNotice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${attendanceWarningCopyNotice === "Copied" ? "bg-emerald-50 text-emerald-700" : "border border-amber-100 bg-amber-50 text-amber-800"}`}>{attendanceWarningCopyNotice}</div>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-slate-600" onClick={() => { setAttendanceWarningComposerOpen(false); openAttendanceWarningTemplates(attendanceWarningComposerKind); }}>Edit template</Button>
              <Button type="button" className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceWarningComposerDraft.trim()} onClick={copyAttendanceWarning}><Copy className="mr-1.5 h-4 w-4" />{attendanceWarningCopyNotice === "Copied" ? "Copied" : "Copy warning"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceEditorOpen} onOpenChange={(open) => { setAttendanceEditorOpen(open); if (!open) { blurActiveField(); setAttendanceDuplicate(null); } }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left"><DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><Clock3 className="h-5 w-5 text-violet-600" />{attendanceEditingId ? "Edit attendance record" : "Record attendance issue"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 p-4" onPointerDown={(event) => { const target = event.target as HTMLElement; if (!target.closest("input,button,select,textarea")) blurActiveField(); }}>
            <div className="grid gap-1.5">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">Player</Label>
              <div className="rounded-2xl border border-slate-200 bg-white p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={attendancePlayerSearch}
                    onChange={(event) => {
                      setAttendancePlayerSearch(event.target.value);
                      if (attendancePlayerId) setAttendancePlayerId("");
                      setAttendanceDuplicate(null);
                    }}
                    placeholder="Search roster…"
                    className="h-10 rounded-xl border-slate-200 pl-9 text-sm font-semibold"
                    enterKeyHint="search"
                    disabled={attendanceSaving}
                  />
                </div>
                <div className="mt-1.5 max-h-40 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  {attendancePlayerMatches.length > 0 ? attendancePlayerMatches.map((player) => {
                    const selected = attendancePlayerId === player.id;
                    return <button key={player.id} type="button" disabled={attendanceSaving} onClick={() => { setAttendancePlayerId(player.id); setAttendancePlayerSearch(player.name); setAttendanceDuplicate(null); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${selected ? "bg-violet-50 text-violet-800" : "text-[#102A43] hover:bg-slate-50"}`}><span className="min-w-0"><span className="block truncate text-sm font-black">{player.name}</span>{player.aka && <span className="block truncate text-[10px] font-semibold text-slate-400">{player.aka}</span>}</span>{selected && <span className="text-[10px] font-black uppercase tracking-wide">Selected</span>}</button>;
                  }) : <div className="px-3 py-3 text-center text-xs font-semibold text-slate-400">No roster match</div>}
                </div>
                <button
                  type="button"
                  disabled={attendanceSaving || !onRequestAddPlayer}
                  onClick={() => {
                    const suggestedName = attendancePlayerSearch.trim();
                    setAttendanceEditorOpen(false);
                    setAttendanceDuplicate(null);
                    onRequestAddPlayer?.(suggestedName || undefined);
                  }}
                  className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-left text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {attendancePlayerSearch.trim() ? `Add “${attendancePlayerSearch.trim()}” to roster` : "Add player to roster"}
                </button>
              </div>
            </div>
            <div className="grid gap-1.5"><Label className="text-xs font-black uppercase tracking-wide text-slate-500">Issue</Label><div className="grid grid-cols-2 gap-2">{ATTENDANCE_ISSUE_OPTIONS.map((option) => <button key={option.value} type="button" className={`min-h-10 rounded-2xl border px-2 py-2 text-[11px] font-black ${attendanceIssueType === option.value ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => { setAttendanceIssueType(option.value); setAttendanceDuplicate(null); }}>{option.label}</button>)}</div></div>
            <div className="grid gap-1.5"><Label className="text-xs font-black uppercase tracking-wide text-slate-500">Date</Label><Input type="date" value={attendanceDate} onChange={(event) => { setAttendanceDate(event.target.value); setAttendanceDuplicate(null); }} max={todayIsoDate()} className="h-10 rounded-2xl border-slate-200 text-sm font-semibold" /></div>
            {attendanceIssueType === "conduct" && <div className="grid gap-1.5"><Label className="text-xs font-black uppercase tracking-wide text-slate-500">What happened? <span className="normal-case text-slate-400">optional</span></Label><Input value={attendanceNote} onChange={(event) => setAttendanceNote(event.target.value.slice(0,240))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} enterKeyHint="done" maxLength={240} placeholder="Short organizer note" className="h-10 rounded-2xl border-slate-200 text-sm font-semibold" /></div>}
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[10px] font-semibold leading-snug text-slate-500">Session “Late” only keeps someone out of team generation. It does not create an attendance record.</div>
            {attendanceDuplicate && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-start gap-2 text-[11px] font-bold leading-snug text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{attendanceIssueLabel(attendanceDuplicate.issueType)} is already recorded for this player on {formatAttendanceDate(attendanceDuplicate.incidentDate)}.</span></div><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="h-9 rounded-xl border-amber-200 bg-white text-[11px] font-black text-amber-800" onClick={() => setAttendanceDuplicate(null)}>Cancel</Button><Button type="button" className="h-9 rounded-xl bg-amber-700 text-[11px] font-black text-white hover:bg-amber-800" onClick={() => saveAttendanceRecord(true)}>Record another</Button></div></div>}
            {attendanceError && <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{attendanceError}</div>}
            <div className={`grid gap-2 ${attendanceEditingId ? "grid-cols-[0.8fr_1.2fr]" : "grid-cols-1"}`}>{attendanceEditingId && <Button type="button" variant="outline" className="h-10 rounded-2xl border-red-200 text-sm font-black text-red-500 hover:bg-red-50" disabled={attendanceSaving} onClick={removeAttendanceRecord}><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button>}<Button type="button" className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendancePlayerId || !attendanceDate || attendanceSaving} onClick={() => { blurActiveField(); saveAttendanceRecord(false); }}>{attendanceSaving ? "Saving…" : attendanceEditingId ? "Save changes" : "Save record"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ratingBoardOpen} onOpenChange={setRatingBoardOpen}>
        <DialogContent className="max-h-[86svh] max-w-sm overflow-hidden rounded-3xl border border-violet-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-violet-100 bg-violet-50/70 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Star className="h-4 w-4 text-violet-600" />
              Organizer ratings
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[66svh] overflow-y-auto p-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="mb-3 rounded-2xl bg-violet-50 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
              Rate players you know, skip the ones you do not know yet, and
              adjust your own ratings anytime. Individual ratings stay private.
            </div>

            {ratingFlowNotice && (
              <div className="mb-3 rounded-2xl border border-violet-100 bg-white px-3 py-2 text-[11px] font-black leading-snug text-violet-800 shadow-sm">
                {ratingFlowNotice}
              </div>
            )}

            <div className="grid gap-3">
              {newNeedRatingPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-violet-600">
                    <span>New players to rate</span>
                    <span>{newNeedRatingPlayers.length}</span>
                  </div>
                  {newNeedRatingPlayers.map((player) => (
                    <button
                      key={`new-need-${player.id}`}
                      type="button"
                      className="flex items-center justify-between rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-left shadow-sm active:scale-[0.99]"
                      onClick={() => openRatingForPlayer(player)}
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-black text-[#102A43]">
                            {player.name}
                          </span>
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-700">
                            New
                          </span>
                        </span>
                        {player.aka && (
                          <span className="block truncate text-[11px] font-semibold text-violet-700">
                            AKA {player.aka}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-violet-700">
                        Rate
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {regularNeedRatingPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-violet-600">
                    <span>Needs your rating</span>
                    <span>{regularNeedRatingPlayers.length}</span>
                  </div>
                  {regularNeedRatingPlayers.map((player) => (
                    <button
                      key={`need-${player.id}`}
                      type="button"
                      className="flex items-center justify-between rounded-2xl border border-violet-100 bg-white px-3 py-2 text-left shadow-sm active:scale-[0.99]"
                      onClick={() => openRatingForPlayer(player)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#102A43]">
                          {player.name}
                        </span>
                        {player.aka && (
                          <span className="block truncate text-[11px] font-semibold text-slate-500">
                            AKA {player.aka}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">
                        Rate
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {skippedPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-amber-600">
                    <span>Skipped for later</span>
                    <span>{skippedPlayers.length}</span>
                  </div>
                  {skippedPlayers.map((player) => (
                    <button
                      key={`skip-${player.id}`}
                      type="button"
                      className="flex items-center justify-between rounded-2xl border border-amber-100 bg-white px-3 py-2 text-left shadow-sm active:scale-[0.99]"
                      onClick={() => openRatingForPlayer(player)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#102A43]">
                          {player.name}
                        </span>
                        {player.aka && (
                          <span className="block truncate text-[11px] font-semibold text-slate-500">
                            AKA {player.aka}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">
                        Rate now
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {ratedPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <span>Your rated players</span>
                    <span>{ratedPlayers.length}</span>
                  </div>
                  {ratedPlayers.map((player) => {
                    const myRating = myRatingByPlayerId.get(player.id);
                    const summary = ratingSummaryByPlayerId.get(player.id);
                    return (
                      <button
                        key={`rated-${player.id}`}
                        type="button"
                        className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2 text-left shadow-sm active:scale-[0.99]"
                        onClick={() => openRatingForPlayer(player)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-[#102A43]">
                            {player.name}
                          </span>
                          <span className="block truncate text-[11px] font-semibold text-slate-500">
                            Your{" "}
                            {typeof myRating?.skill === "number"
                              ? myRating.skill.toFixed(1)
                              : "—"}
                            {summary?.averageSkill
                              ? ` · Club ${summary.averageSkill.toFixed(1)}`
                              : ""}
                          </span>
                        </span>
                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">
                          Adjust
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {players.length === 0 && (
                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
                  No players yet.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(ratingDialogPlayer)}
        onOpenChange={(open) => {
          if (!open) {
            setRatingDialogError("");
            setRatingPlayerId(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl p-0">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Star className="h-5 w-5 text-violet-600" />
              {ratingDialogPlayer
                ? `Rate ${ratingDialogPlayer.name}`
                : "Rate player"}
            </DialogTitle>
          </DialogHeader>
          {ratingDialogPlayer &&
            (() => {
              const myRating = myRatingByPlayerId.get(ratingDialogPlayer.id);
              const summary = ratingSummaryByPlayerId.get(
                ratingDialogPlayer.id,
              );
              const canRevealAverage = Boolean(
                myRating &&
                !myRating.skipped &&
                typeof myRating.skill === "number",
              );
              const nextPlayerAfterThis = findNextRatingPlayerAfter(
                ratingDialogPlayer.id,
              );
              const remainingAfterThis =
                orderedNeedRatingPlayers.filter(
                  (player) => player.id !== ratingDialogPlayer.id,
                ).length +
                skippedPlayers.filter(
                  (player) => player.id !== ratingDialogPlayer.id,
                ).length;
              const ratingModeLabel = myRating?.skipped
                ? "Skipped before"
                : typeof myRating?.skill === "number"
                  ? "Adjusting your rating"
                  : ratingDialogPlayer.isNew
                    ? "New player"
                    : "Needs your rating";
              return (
                <div className="grid gap-4 p-4">
                  {ratingFlowNotice && (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-black leading-snug text-violet-800">
                      {ratingFlowNotice}
                    </div>
                  )}

                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Player
                      </div>
                      <div className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-700">
                        {ratingModeLabel}
                      </div>
                    </div>
                    <div className="mt-1 text-lg font-black text-[#102A43]">
                      {ratingDialogPlayer.name}
                    </div>
                    {ratingDialogPlayer.aka && (
                      <div className="text-xs font-semibold text-slate-500">
                        {ratingDialogPlayer.aka}
                      </div>
                    )}
                    {remainingAfterThis > 0 && (
                      <div className="mt-2 text-[11px] font-bold text-slate-400">
                        {remainingAfterThis} more player
                        {remainingAfterThis === 1 ? "" : "s"} after this.
                      </div>
                    )}
                  </div>

                  {(() => {
                    const selectedStyle = getPlayerStyleDefinition(ratingPlayerStyle);
                    const computedOverall = calculateOverall(ratingProfile);
                    return (
                      <>
                        <div className="grid gap-2 rounded-2xl border border-primary/10 bg-primary/5 p-3">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <Label className="text-xs font-black uppercase tracking-wide text-primary">
                                Overall skill
                              </Label>
                              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                Moving this reshapes the profile from the selected style.
                              </div>
                            </div>
                            <div className="text-3xl font-black tabular-nums text-[#102A43]">
                              {computedOverall.toFixed(1)}
                            </div>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step="0.5"
                            value={ratingDraft}
                            onChange={(event) => {
                              const nextSkill = roundRatingStep(Number(event.target.value));
                              setRatingDraft(nextSkill);
                              setRatingProfile(generateStyledPlayerAttributes(nextSkill, ratingPlayerStyle));
                            }}
                            className="w-full accent-[#102A43]"
                          />
                          <div className="grid grid-cols-3 text-[10px] font-black text-slate-400">
                            <span>2 weak regular</span>
                            <span className="text-center">5 average</span>
                            <span className="text-right">9 strongest</span>
                          </div>
                        </div>

                        <div className="grid gap-2 rounded-2xl border border-violet-100 bg-violet-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <Label className="text-xs font-black uppercase tracking-wide text-violet-700">
                                Player style
                              </Label>
                              <div className="mt-0.5 text-[10px] font-semibold text-violet-700/75">
                                Defense → midfield → attack. Used only to create the stat shape.
                              </div>
                            </div>
                            <div className="rounded-xl bg-white px-2.5 py-1 text-xs font-black text-violet-800 shadow-sm">
                              {selectedStyle.label}
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="6"
                            step="1"
                            value={ratingPlayerStyle}
                            onChange={(event) => {
                              const nextStyle = Number(event.target.value) as PlayerStyleValue;
                              setRatingPlayerStyle(nextStyle);
                              setRatingProfile(generateStyledPlayerAttributes(ratingDraft, nextStyle));
                            }}
                            className="w-full accent-violet-700"
                          />
                          <div className="grid grid-cols-3 text-[10px] font-black text-violet-500/80">
                            <span>Defense</span>
                            <span className="text-center">Midfield</span>
                            <span className="text-right">Attack</span>
                          </div>
                          <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2 text-[11px] font-semibold leading-snug text-violet-900">
                            {selectedStyle.description}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setRatingGoalkeeper((current) => !current)}
                          className={`flex h-10 items-center justify-between rounded-2xl border px-3 text-left text-xs font-black transition-colors ${ratingGoalkeeper ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-600"}`}
                        >
                          <span>GK</span>
                          <span className="text-[10px] font-bold">{ratingGoalkeeper ? "Can play goalkeeper" : "Optional role flag"}</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          {RATING_STAT_FIELDS.map(({ key, label, short }) => (
                            <ClubRatingStatControl
                              key={key}
                              label={label}
                              short={short}
                              value={ratingProfile[key]}
                              onChange={(value) => {
                                const next = { ...ratingProfile, [key]: value };
                                setRatingProfile(next);
                                setRatingDraft(calculateOverall(next));
                              }}
                            />
                          ))}
                        </div>

                        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-semibold leading-snug text-violet-800">
                          The style slider creates realistic ATK/DEF/PASS/SPEED values, then Stripes keeps using the existing weighted OVR formula. Manual stat tweaks here become your real shared rating.
                        </div>

                        <div className="rounded-2xl bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                            Club average
                          </div>
                          <div className="mt-1 text-sm font-black text-[#102A43]">
                            {canRevealAverage && summary?.averageSkill
                              ? `${summary.averageSkill.toFixed(1)} · ${summary.ratingCount} organizer${summary.ratingCount === 1 ? "" : "s"}${summary.gkYesCount ? ` · GK ${summary.gkYesCount}` : ""}`
                              : "Hidden until you rate this player"}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {ratingDialogError && (
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold leading-snug text-rose-700">
                      {ratingDialogError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-2xl text-xs font-black"
                      disabled={ratingSaving}
                      onClick={skipClubRating}
                    >
                      {nextPlayerAfterThis ? "Skip & next" : "Skip for later"}
                    </Button>
                    <Button
                      type="button"
                      className="h-11 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]"
                      disabled={ratingSaving}
                      onClick={saveClubRating}
                    >
                      {ratingSaving
                        ? "Saving…"
                        : nextPlayerAfterThis
                          ? "Save & next"
                          : "Save & finish"}
                    </Button>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={equipmentBoardOpen}
        onOpenChange={(open) => {
          setEquipmentBoardOpen(open);
          if (!open) {
            setContentPeekKitId(null);
          }
        }}
      >
        <DialogContent className="stripes-type-ui fixed bottom-2 left-2 right-2 top-2 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[2rem] p-0 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-[96dvh] sm:w-[calc(100vw-1rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 lg:h-[88dvh] lg:max-w-4xl">
          <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left">
            <div className="grid gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43] lg:text-xl">
                  <AntiqueBallIcon className="h-5 w-5 text-emerald-600 lg:h-6 lg:w-6" />
                  Equipment board
                </DialogTitle>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500 lg:text-sm">
                  Drag bags between holders. Tap a bag to edit its name and
                  contents.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-2xl border-slate-200 bg-white px-3 text-xs font-black text-[#102A43]"
                  onClick={() => setEquipmentInventoryOpen(true)}
                >
                  View club inventory
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]"
                  onClick={openNewEquipmentKit}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add bag
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50/70 p-3">
            <div
              className={`mb-2 rounded-2xl border px-3 py-1.5 text-[11px] font-bold leading-snug shadow-sm transition lg:text-xs ${equipmentMoveNotice ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}
            >
              {equipmentBoardStatusText}
            </div>



            <div className="overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
              <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-wide text-slate-400 lg:grid-cols-[11rem_minmax(0,1fr)] lg:text-xs">
                <div className="px-3 py-2.5">Holder</div>
                <div className="border-l border-slate-200 px-3 py-2.5">
                  Bags
                </div>
              </div>

              {equipmentHolders.map((holder, index) => {
                const holderKits = equipmentKits.filter(
                  (kit) =>
                    normalizeEquipmentHolderId(kit.holderId) === holder.id,
                );
                const highlighted = dragOverHolderId === holder.id;
                return (
                  <section
                    key={holder.id}
                    data-equipment-holder-id={holder.id}
                    className={`grid grid-cols-[6.25rem_minmax(0,1fr)] transition lg:grid-cols-[11rem_minmax(0,1fr)] ${index === 0 ? "" : "border-t border-slate-100"} ${highlighted ? "bg-emerald-50" : "bg-white"}`}
                  >
                    <div className="flex min-h-[3.65rem] items-center px-3 py-2 lg:px-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-[12px] font-black leading-tight text-[#102A43] lg:text-sm">
                          {holder.label}
                        </h3>
                      </div>
                    </div>

                    <div
                      className={`flex min-h-[3.65rem] flex-col items-stretch justify-center gap-1.5 border-l px-2 py-2 transition lg:px-3 ${highlighted ? "border-emerald-300 bg-emerald-50 ring-2 ring-inset ring-emerald-100" : "border-slate-200 bg-slate-50/30"}`}
                    >
                      {holderKits.length === 0 ? (
                        <div
                          className={`min-h-8 rounded-2xl border border-dashed ${highlighted ? "border-emerald-300 bg-white/80 px-3 py-1 text-[11px] font-bold text-emerald-600" : "border-transparent"}`}
                        >
                          {highlighted ? "Drop here" : ""}
                        </div>
                      ) : (
                        holderKits.map((kit) => {
                          const isDragging = draggingKitId === kit.id;
                          return (
                            <div
                              key={kit.id}
                              className="flex w-full flex-wrap items-center gap-1.5"
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                className={`min-w-0 flex-[1_1_9rem] touch-none select-none rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-emerald-200 hover:bg-white active:scale-[0.98] ${isDragging ? "scale-95 opacity-45 ring-2 ring-emerald-200" : ""}`}
                                onPointerDown={(event) =>
                                  startEquipmentPointerDrag(event, kit)
                                }
                                onPointerMove={moveEquipmentPointerDrag}
                                onPointerUp={finishEquipmentPointerDrag}
                                onPointerCancel={finishEquipmentPointerDrag}
                                onClick={() => openEquipmentKitFromBoard(kit)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    openEquipmentKitFromBoard(kit);
                                  }
                                }}
                              >
                                <div className="flex min-w-0 flex-col gap-1.5 min-[310px]:flex-row min-[310px]:items-center min-[310px]:gap-2">
                                  <DuffleBagIcon
                                    color={kit.color || DEFAULT_EQUIPMENT_COLOR}
                                    className="h-9 w-12 shrink-0 self-center min-[310px]:self-auto"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span className="truncate text-xs font-black text-[#102A43]">
                                        {kit.name}
                                      </span>
                                      <span
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                                        aria-hidden="true"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                aria-label={`Show contents of ${kit.name}`}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setContentPeekKitId(kit.id);
                                }}
                              >
                                <ClipboardList className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          {contentPeekKit && (
            <div
              className="absolute inset-0 z-40 flex items-end bg-slate-950/20 p-3"
              onClick={() => setContentPeekKitId(null)}
            >
              <div
                className="w-full rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Inside bag
                    </div>
                    <h3 className="mt-1 truncate text-base font-black text-[#102A43]">
                      {contentPeekKit.name}
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 rounded-2xl px-3 text-xs font-black"
                    onClick={() => setContentPeekKitId(null)}
                  >
                    Close
                  </Button>
                </div>

                {equipmentItemsForKit(contentPeekKit).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {equipmentItemsForKit(contentPeekKit).map((item, index) => (
                      <span
                        key={`${contentPeekKit.id}-content-${item.key}-${index}`}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
                      >
                        {equipmentItemDisplayLabel(item)} × {item.quantity}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                    Nothing listed yet.
                  </div>
                )}

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={equipmentInventoryOpen}
        onOpenChange={setEquipmentInventoryOpen}
      >
        <DialogContent
          className="stripes-type-ui max-h-[82dvh] max-w-sm overflow-hidden rounded-3xl p-0 sm:max-w-md"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <AntiqueBallIcon className="h-5 w-5 text-blue-600" />
              Club inventory
            </DialogTitle>
            <p className="text-[11px] font-semibold text-slate-500">
              Everything across {equipmentKits.length} bag{equipmentKits.length === 1 ? "" : "s"}.
            </p>
          </DialogHeader>

          <div className="max-h-[68dvh] space-y-3 overflow-y-auto p-3">
            {equipmentKits.length > 0 && (
              <section>
                <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Bags
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {equipmentKits.map((kit, index) => (
                    <div
                      key={`inventory-bag-${kit.id}`}
                      className={`flex items-center gap-3 px-3 py-2.5 ${index === 0 ? "" : "border-t border-slate-100"} ${index % 2 === 1 ? "bg-slate-50/55" : "bg-white"}`}
                    >
                      <span
                        className="h-5 w-5 shrink-0 rounded-full border border-slate-300 shadow-inner"
                        style={{ backgroundColor: kit.color || DEFAULT_EQUIPMENT_COLOR }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-[#102A43]">{kit.name}</div>
                        <div className="text-[10px] font-bold text-slate-400">
                          {EQUIPMENT_COLOR_NAMES[kit.color || DEFAULT_EQUIPMENT_COLOR] || "Custom color"} bag
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                Equipment
              </div>
              {equipmentInventoryTotals.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <span>Item</span>
                    <span className="text-right">Total</span>
                  </div>
                  {equipmentInventoryTotals.map((item, index) => (
                    <div
                      key={`inventory-row-${item.key}`}
                      className={`grid grid-cols-[minmax(0,1fr)_4.5rem] items-center px-3 py-2.5 ${index === 0 ? "" : "border-t border-slate-100"} ${index % 2 === 1 ? "bg-slate-50/55" : "bg-white"}`}
                    >
                      <span className="truncate text-sm font-bold text-[#102A43]">{item.label}</span>
                      <span className="text-right text-base font-black tabular-nums text-[#102A43]">{item.quantity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm font-semibold text-slate-400">
                  {equipmentKits.length === 0 ? "No equipment has been added yet." : "No equipment contents added yet."}
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={equipmentItemPickerOpen}
        onOpenChange={(open) => {
          setEquipmentItemPickerOpen(open);
          if (!open) {
            setCustomEquipmentName("");
            blurActiveField();
          }
        }}
      >
        <DialogContent
          className="max-h-[82dvh] max-w-sm overflow-hidden rounded-3xl p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">Add item</DialogTitle>
            <p className="text-[11px] font-semibold text-slate-500">
              Choose one common item or add a custom category.
            </p>
          </DialogHeader>

          <div className="max-h-[68dvh] overflow-y-auto p-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {EQUIPMENT_PRESETS.map((preset, index) => {
                const selected = kitItems.some((item) =>
                  item.key === preset.key
                  && !item.custom
                  && (preset.key !== "balls" || (!item.brand?.trim() && !item.size?.trim())),
                );
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${index === 0 ? "" : "border-t border-slate-100"} ${selected ? "bg-sky-50" : "bg-white hover:bg-slate-50"}`}
                    onClick={() => {
                      addEquipmentPreset(preset);
                      setCustomEquipmentName("");
                      setEquipmentItemPickerOpen(false);
                    }}
                  >
                    <span className={`text-sm font-bold ${selected ? "text-blue-700" : "text-[#102A43]"}`}>{preset.label}</span>
                    <Plus className={`h-4 w-4 shrink-0 ${selected ? "text-blue-600" : "text-slate-300"}`} />
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">Custom item</div>
              <div className="flex items-center gap-2">
                <Input
                  value={customEquipmentName}
                  onChange={(event) => setCustomEquipmentName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (!customEquipmentName.trim()) {
                        event.currentTarget.blur();
                        return;
                      }
                      addCustomEquipmentItem();
                      setEquipmentItemPickerOpen(false);
                    }
                  }}
                  enterKeyHint="done"
                  placeholder="Example: Corner flags"
                  maxLength={40}
                  className="h-10 min-w-0 flex-1 rounded-2xl border-slate-200 bg-white text-sm font-semibold"
                />
                <Button
                  type="button"
                  className="h-10 shrink-0 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]"
                  disabled={!customEquipmentName.trim()}
                  onClick={() => {
                    addCustomEquipmentItem();
                    setEquipmentItemPickerOpen(false);
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={equipmentDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setEquipmentDialogOpen(true);
            return;
          }
          closeEquipmentEditor(true);
        }}
      >
        <DialogContent
          className="max-h-[86dvh] max-w-md overflow-y-auto rounded-3xl p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <DuffleBagIcon
                color={kitColor || DEFAULT_EQUIPMENT_COLOR}
                className="h-5 w-7 shrink-0"
              />
              {editingKitId ? "Edit Bag" : "New Bag"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2.5 p-3 pt-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="grid min-w-0 gap-1.5">
                <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Bag name
                </Label>
                <Input
                  value={kitName}
                  onChange={(event) => setKitName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  enterKeyHint="done"
                  placeholder="Example: Saturday match bag"
                  className="h-10 min-w-0 rounded-2xl border-slate-200 text-sm font-semibold"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Bag color
                </Label>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 min-w-[5.3rem] rounded-2xl border-slate-200 px-2.5 text-[11px] font-black text-slate-600"
                    onClick={() => setColorPickerOpen((open) => !open)}
                    aria-label="Choose bag color"
                  >
                    <span
                      className="mr-2 h-5 w-5 rounded-full border border-slate-300 shadow-inner"
                      style={{ backgroundColor: kitColor }}
                    />
                    {EQUIPMENT_COLOR_NAMES[kitColor] || "Choose"}
                  </Button>
                  {colorPickerOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-52 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                          Bag color
                        </div>
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-50"
                          onClick={() => setColorPickerOpen(false)}
                        >
                          Done
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {EQUIPMENT_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label="Choose bag color"
                            className={`h-8 w-8 rounded-full border transition ${kitColor === color ? "border-[#102A43] ring-2 ring-slate-200 ring-offset-1" : "border-slate-200"}`}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              setKitColor(color);
                              setColorPickerOpen(false);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Bag contents
                  </Label>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    Only items already in this bag are shown here.
                  </div>
                </div>
                {kitItems.length > 0 && (
                  <div className="text-[10px] font-black text-slate-400">
                    {kitItems.reduce((sum, item) => sum + item.quantity, 0)} total
                  </div>
                )}
              </div>

              {kitItems.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {kitItems.map((item, index) => {
                    const isBall = item.key === "balls" && !item.custom;
                    const hasBallDetails = Boolean(item.brand?.trim() || item.size?.trim());
                    const ballDetailsOpen = isBall && ballDetailsIndex === index;
                    return (
                      <div
                        key={`${item.key}-${index}`}
                        className={`px-2.5 py-2 ${index === 0 ? "" : "border-t border-slate-100"}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-black text-[#102A43]">{item.label}</div>
                            {item.custom && (
                              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Custom</div>
                            )}
                            {isBall && (
                              <button
                                type="button"
                                className={`mt-0.5 text-left text-[10px] font-bold ${hasBallDetails ? "text-blue-600" : "text-slate-400"}`}
                                onClick={() => setBallDetailsIndex(ballDetailsOpen ? null : index)}
                              >
                                {hasBallDetails
                                  ? `${item.brand?.trim() || "Ball"}${item.size?.trim() ? ` · Size ${item.size.trim()}` : ""}`
                                  : "Add brand / size"}
                              </button>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-500"
                              onClick={() => updateEquipmentItemQuantity(index, -1)}
                              aria-label={`Decrease ${item.label}`}
                            >
                              −
                            </button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              enterKeyHint="done"
                              autoComplete="off"
                              value={equipmentQuantityDrafts[index] ?? String(item.quantity)}
                              onFocus={(event) => {
                                setEquipmentQuantityDrafts((current) => ({
                                  ...current,
                                  [index]: current[index] ?? event.currentTarget.value,
                                }));
                              }}
                              onChange={(event) => {
                                const value = event.target.value.replace(/\D/g, "").slice(0, 3);
                                setEquipmentQuantityDrafts((current) => ({ ...current, [index]: value }));
                              }}
                              onBlur={(event) => commitEquipmentQuantityDraft(index, event.currentTarget.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitEquipmentQuantityDraft(index, event.currentTarget.value);
                                  event.currentTarget.blur();
                                }
                              }}
                              className="h-8 w-14 rounded-xl border-slate-200 px-1 text-center text-xs font-black tabular-nums"
                              aria-label={`${item.label} quantity`}
                            />
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-500"
                              onClick={() => updateEquipmentItemQuantity(index, 1)}
                              aria-label={`Increase ${item.label}`}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                              onClick={() => {
                                setKitItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                                setEquipmentQuantityDrafts({});
                                setBallDetailsIndex(null);
                              }}
                              aria-label={`Remove ${item.label}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {ballDetailsOpen && (
                          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2">
                            <div className="grid gap-1">
                              <Label className="text-[9px] font-black uppercase tracking-wide text-slate-400">Brand</Label>
                              <Input
                                value={item.brand || ""}
                                onChange={(event) => {
                                  const brand = event.target.value;
                                  setKitItems((current) => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, brand } : currentItem));
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                  }
                                }}
                                enterKeyHint="done"
                                placeholder="e.g. Adidas Tiro"
                                className="h-8 rounded-xl border-slate-200 bg-white px-2 text-xs font-semibold"
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-[9px] font-black uppercase tracking-wide text-slate-400">Size</Label>
                              <Input
                                value={item.size || ""}
                                onChange={(event) => {
                                  const size = event.target.value;
                                  setKitItems((current) => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, size } : currentItem));
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                  }
                                }}
                                enterKeyHint="done"
                                placeholder="e.g. 5"
                                className="h-8 rounded-xl border-slate-200 bg-white px-2 text-xs font-semibold"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-[11px] font-semibold text-slate-400">
                  No contents yet. Add the first item when you need it.
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-2xl border-slate-200 bg-white text-xs font-black text-[#102A43]"
                onClick={() => {
                  blurActiveField();
                  setColorPickerOpen(false);
                  setCustomEquipmentName("");
                  setEquipmentItemPickerOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add item
              </Button>
            </div>


            {editingKitMeta && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-semibold leading-snug text-slate-500">
                <div>
                  Created by{" "}
                  {equipmentActorLabel(
                    editingKitMeta.createdByName,
                    editingKitMeta.createdByEmail,
                    equipmentHolderNamesByEmail,
                  )}{" "}
                  · {formatEquipmentTimestamp(editingKitMeta.createdAt)}
                </div>
                <div>
                  Last updated by{" "}
                  {equipmentActorLabel(
                    editingKitMeta.updatedByName,
                    editingKitMeta.updatedByEmail,
                    equipmentHolderNamesByEmail,
                  )}{" "}
                  · {formatEquipmentTimestamp(editingKitMeta.updatedAt)}
                </div>
              </div>
            )}

            {editingKitId && deleteConfirmOpen && (
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-2.5">
                <div className="mb-1.5 text-[11px] font-bold leading-snug text-red-700">
                  Deleting removes this bag from everyone’s shared equipment
                  board.
                </div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-red-700">
                  <span>Slide to unlock delete</span>
                  <span>
                    {deleteBagSlide >= 95 ? "Ready" : `${deleteBagSlide}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={deleteBagSlide}
                  onChange={(event) =>
                    setDeleteBagSlide(Number(event.target.value))
                  }
                  className="w-full accent-red-600"
                  aria-label="Slide to unlock delete bag"
                />
              </div>
            )}

            {(equipmentSaving || equipmentError) && (
              <div className={`px-1 text-center text-[10px] font-bold ${equipmentError ? "text-red-500" : "text-slate-400"}`}>
                {equipmentError ? "Couldn’t save changes. Check connection and try again." : "Saving…"}
              </div>
            )}

            {editingKitId && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl border-red-200 text-sm font-black text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-45"
                disabled={equipmentSaving || (deleteConfirmOpen && deleteBagSlide < 95)}
                onClick={() => {
                  blurActiveField();
                  setColorPickerOpen(false);
                  if (!deleteConfirmOpen) {
                    setDeleteConfirmOpen(true);
                    setDeleteBagSlide(0);
                    return;
                  }
                  if (deleteBagSlide < 95) return;
                  deleteEquipmentKit(editingKitId);
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {deleteConfirmOpen && deleteBagSlide >= 95 ? "Delete now" : "Delete bag"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
