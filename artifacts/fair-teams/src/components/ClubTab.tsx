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
import { getPlayerProfilePresetOption, PlayerPresetPicker } from "@/components/PlayerPresetPicker";
import { TaskBoard } from "@/components/TaskBoard";
import type { AiSmartCommandAction } from "@/lib/aiSmartCommandTypes";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
import {
  signOutOfSharedRosters,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import type {
  ActiveSharedWorkspaceAuthorityStatus,
  ActiveSharedWorkspaceCapabilities,
} from "@/lib/activeSharedWorkspaceAuthority";
import { NO_ACTIVE_SHARED_WORKSPACE_CAPABILITIES } from "@/lib/activeSharedWorkspaceAuthority";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StripesConfirmContent } from "@/components/ui/stripes-modal";
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
  inferPlayerStyleFromAttributes,
  inferPlayerStyleMatch,
  type PlayerStyleAttributes,
  type PlayerStyleValue,
} from "@/lib/playerStyleProfile";
import { fileCabinetGoogleLoginHint } from "@/lib/fileCabinetDriveAccess";
import {
  formatDateTime,
  formatList,
  formatNumber,
  formatPercent,
  getResolvedUiLocale,
  translate,
  type TranslationKey,
} from "@/i18n";

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
  user?: SharedRosterUser | null;
  sharedAuthorityStatus?: ActiveSharedWorkspaceAuthorityStatus;
  sharedAuthorityMessage?: string;
  sharedCapabilities?: ActiveSharedWorkspaceCapabilities;
  canSwitchRoster?: boolean;
  onOpenRosterPicker?: () => void;
  onBackTargetChange?: (hasBackTarget: boolean) => void;
  sharedToolsNode?: React.ReactNode;
  fileCabinetNode?: (options: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    googleLoginHint?: string;
  }) => React.ReactNode;
  equipmentGroupId?: string;
  equipmentHolderLabels?: string[];
  equipmentHolderNamesByEmail?: Record<string, string>;
  notificationRecipientEmails?: string[];
  pairingRules?: PairingRule[];
  onOpenPairingRules?: () => void;
  onOpenSharedRosters?: () => void;
  onOpenTeams?: () => void;
  currentTeamCount?: number | null;
  currentTeamsGenerated?: boolean;
  onApplyAiSmartCommandAction?: (action: AiSmartCommandAction) => Promise<string | void> | string | void;
  onOpenTodayFromAi?: () => void;
  onRequestAddPlayer?: (suggestedName?: string) => void;
  onRequestRatePlayers?: (playerIds: string[]) => void;
  tutorialStep?: string | null;
  onTutorialAction?: (action: string, playerId?: string) => void;
};

type EquipmentHolder = {
  id: string;
  label: string;
};

type SharedPersonPresentation =
  | { stableKey: string; kind: "me" }
  | { stableKey: string; kind: "organizer" }
  | { stableKey: string; kind: "person"; number: number }
  | { stableKey: string; kind: "named"; label: string };

type AttendanceWarningCopyNotice =
  | { tone: "success" }
  | { tone: "error"; message: string };

type ClubEquipmentKit = FirebaseEquipmentBag;

const EQUIPMENT_PREVIEW_STORAGE_KEY = "fairteams.clubEquipment.preview.v1";
const CLUB_DESK_COLLAPSED_STORAGE_KEY = "fairteams.clubDesk.collapsed.v2";

const ATTENDANCE_ISSUE_OPTIONS: Array<{
  value: AttendanceIssueType;
  labelKey: TranslationKey;
}> = [
  { value: "tardy", labelKey: "club.attendance.issue.tardy" },
  { value: "late-cancellation", labelKey: "club.attendance.issue.lateCancellation" },
  { value: "no-show", labelKey: "club.attendance.issue.noShow" },
  { value: "conduct", labelKey: "club.attendance.issue.conduct" },
];

type AttendanceRange = "3m" | "6m" | "12m" | "all";
type AttendanceSort = "issues" | "recent";

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function attendanceIssueLabel(issueType: AttendanceIssueType) {
  const option = ATTENDANCE_ISSUE_OPTIONS.find((candidate) => candidate.value === issueType);
  return option ? translate(option.labelKey) : translate("club.attendance.issue.fallback");
}

function formatAttendanceDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatDateTime(getResolvedUiLocale(), parsed, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const ATTENDANCE_WARNING_TEMPLATE_OPTIONS: Array<{
  value: AttendanceWarningTemplateKind;
  labelKey: TranslationKey;
}> = [
  { value: "late-cancellation", labelKey: "club.attendance.template.lateCancellation" },
  { value: "no-show", labelKey: "club.attendance.template.noShow" },
  { value: "tardy", labelKey: "club.attendance.template.tardy" },
  { value: "dismissal", labelKey: "club.attendance.template.dismissal" },
];

function localizedAttendanceWarningTemplates(): AttendanceWarningTemplates {
  return {
    "late-cancellation": translate(
      "club.attendance.defaultTemplate.lateCancellation",
    ),
    "no-show": translate("club.attendance.defaultTemplate.noShow"),
    tardy: translate("club.attendance.defaultTemplate.tardy"),
    dismissal: translate("club.attendance.defaultTemplate.dismissal"),
  };
}

function attendanceRangeText(range: AttendanceRange) {
  if (range === "3m") return translate("club.attendance.range.last3Months");
  if (range === "6m") return translate("club.attendance.range.last6Months");
  if (range === "12m") return translate("club.attendance.range.last12Months");
  return translate("club.attendance.range.fullHistory");
}

function countPhrase(count: number, key: TranslationKey) {
  return translate(key, { count });
}

function attendanceSummaryText(count: number, key: TranslationKey) {
  return translate(key, {
    count,
    formattedCount: formatNumber(getResolvedUiLocale(), count),
  });
}

function formatAttendanceDateList(dates: string[]) {
  const unique = Array.from(new Set(dates)).sort();
  if (!unique.length) return translate("club.attendance.recordedDates");
  const formatted = unique.map(formatAttendanceDate);
  if (formatted.length === 1) return formatted[0];
  return formatList(getResolvedUiLocale(), formatted, {
    style: "long",
    type: "conjunction",
  });
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
    "{last_minute}": countPhrase(context.lateCancellationCount, "club.attendance.count.lastMinuteCancellation"),
    "{no_shows}": countPhrase(context.noShowCount, "club.attendance.count.noShow"),
    "{tardies}": countPhrase(context.tardyCount, "club.attendance.count.tardy"),
    "{attendance_issues}": countPhrase(attendanceIssueCount, "club.attendance.count.issue"),
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
  if (typeof document === "undefined") {
    throw new Error(translate("club.errors.copyUnavailable"));
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error(translate("club.errors.copyWarningFailed"));
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

const EQUIPMENT_COLOR_LABEL_KEYS: Record<string, TranslationKey> = {
  "#111827": "club.colors.black",
  "#475569": "club.colors.slate",
  "#1e3a8a": "club.colors.navy",
  "#2563eb": "club.colors.blue",
  "#0891b2": "club.colors.cyan",
  "#0f766e": "club.colors.teal",
  "#16a34a": "club.colors.green",
  "#ca8a04": "club.colors.yellow",
  "#ea580c": "club.colors.orange",
  "#dc2626": "club.colors.red",
  "#9f1239": "club.colors.burgundy",
  "#db2777": "club.colors.pink",
  "#7c3aed": "club.colors.purple",
  "#8b5e34": "club.colors.brown",
  "#f8fafc": "club.colors.white",
};

const EQUIPMENT_PRESETS = [
  { key: "balls", label: "Balls", labelKey: "club.equipment.preset.balls" },
  { key: "flat-cones", label: "Flat cones", labelKey: "club.equipment.preset.flatCones" },
  { key: "tower-cones", label: "Tower cones", labelKey: "club.equipment.preset.towerCones" },
  { key: "bibs", label: "Bibs / vests", labelKey: "club.equipment.preset.bibs" },
  { key: "team-bands", label: "Team bands", labelKey: "club.equipment.preset.teamBands" },
  { key: "ball-pumps", label: "Ball pumps", labelKey: "club.equipment.preset.ballPumps" },
  { key: "goals", label: "Goals", labelKey: "club.equipment.preset.goals" },
  { key: "first-aid", label: "First-aid kits", labelKey: "club.equipment.preset.firstAidKits" },
  { key: "first-aid-spray", label: "First-aid spray", labelKey: "club.equipment.preset.firstAidSpray" },
  { key: "whistles", label: "Whistles", labelKey: "club.equipment.preset.whistles" },
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
    const legacyLabel = /^cones?$/.test(normalized)
      ? translate("club.equipment.legacyCones")
      : rawLabel.replace(/^\w/, (letter) => letter.toUpperCase());
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

function equipmentItemCanonicalLabel(item: EquipmentInventoryItem) {
  // `contents` is persisted legacy compatibility text. Keep its established
  // canonical value stable; live presentation uses the catalog-backed helper below.
  if (item.key !== "balls") return item.label;
  const brand = item.brand?.trim();
  const size = item.size?.trim();
  if (!brand && !size) return "Balls";
  if (brand && size) return `${brand} · Size ${size}`;
  if (brand) return brand;
  return `Balls · Size ${size}`;
}

function equipmentItemDisplayLabel(item: EquipmentInventoryItem) {
  if (item.custom) return item.label;
  if (item.key !== "balls") {
    const preset = EQUIPMENT_PRESETS.find((candidate) => candidate.key === item.key);
    return preset ? translate(preset.labelKey) : item.label;
  }
  const brand = item.brand?.trim();
  const size = item.size?.trim();
  if (!brand && !size) return translate("club.equipment.preset.balls");
  if (brand && size) {
    return translate("club.equipment.ballDetailsWithSize", { brand, size });
  }
  if (brand) return brand;
  return translate("club.equipment.ballsWithSize", { size });
}

function equipmentContentsFromItems(items: EquipmentInventoryItem[]) {
  return items
    .filter((item) => item.label.trim() && item.quantity > 0)
    .map((item) => {
      const quantity = Math.max(1, Math.round(item.quantity));
      const label = equipmentItemCanonicalLabel(item);
      return quantity === 1 ? label : `${quantity} ${label}`;
    })
    .slice(0, 30);
}

const LOCAL_EQUIPMENT_HOLDERS: Array<{
  id: string;
  labelKey: TranslationKey;
}> = [
  { id: "storage", labelKey: "club.equipment.clubStorage" },
  { id: "you", labelKey: "club.people.you" },
  { id: "other", labelKey: "club.people.otherOrganizer" },
];

function defaultEquipmentContent(count: number, item: string) {
  return translate("club.equipment.defaultKit.itemCount", {
    count,
    formattedCount: formatNumber(getResolvedUiLocale(), count),
    item,
  });
}

function createDefaultEquipmentKits(): ClubEquipmentKit[] {
  const now = Date.now();
  const previewActor = translate("club.equipment.defaultKit.previewActor");
  const balls = translate("club.equipment.preset.balls");
  const ballPumps = translate("club.equipment.preset.ballPumps");
  const darkBibs = translate("club.equipment.defaultKit.darkBibs");
  const lightBibs = translate("club.equipment.defaultKit.lightBibs");
  const flatCones = translate("club.equipment.preset.flatCones");

  return [
    {
      id: "kit-ball-bag",
      name: translate("club.equipment.defaultKit.ballBagName"),
      holderId: "you",
      color: "#2563eb",
      contents: [defaultEquipmentContent(2, balls), ballPumps],
      items: [
        { key: "balls", label: balls, quantity: 2 },
        { key: "ball-pumps", label: ballPumps, quantity: 1 },
      ],
      createdAt: now,
      createdByName: previewActor,
      updatedAt: now,
      updatedByName: previewActor,
    },
    {
      id: "kit-bibs",
      name: translate("club.equipment.defaultKit.bibsName"),
      holderId: "storage",
      color: "#db2777",
      contents: [
        defaultEquipmentContent(10, darkBibs),
        defaultEquipmentContent(10, lightBibs),
      ],
      items: [
        { key: "custom:dark-bibs", label: darkBibs, quantity: 10, custom: true },
        { key: "custom:light-bibs", label: lightBibs, quantity: 10, custom: true },
      ],
      createdAt: now,
      createdByName: previewActor,
      updatedAt: now,
      updatedByName: previewActor,
    },
    {
      id: "kit-cones",
      name: translate("club.equipment.defaultKit.coneStackName"),
      holderId: "storage",
      color: "#ea580c",
      contents: [defaultEquipmentContent(12, flatCones)],
      items: [{ key: "flat-cones", label: flatCones, quantity: 12 }],
      createdAt: now,
      createdByName: previewActor,
      updatedAt: now,
      updatedByName: previewActor,
    },
  ];
}

type RatingProfileDraft = PlayerStyleAttributes;

const RATING_STAT_FIELDS: Array<{
  key: keyof Omit<PlayerStyleAttributes, "teamPlay">;
  labelKey: TranslationKey;
  shortKey: TranslationKey;
}> = [
  { key: "attack", labelKey: "club.ratings.stat.attack", shortKey: "club.ratings.statShort.attack" },
  { key: "defense", labelKey: "club.ratings.stat.defense", shortKey: "club.ratings.statShort.defense" },
  { key: "passing", labelKey: "club.ratings.stat.passing", shortKey: "club.ratings.statShort.passing" },
  { key: "speed", labelKey: "club.ratings.stat.speed", shortKey: "club.ratings.statShort.speed" },
  { key: "stamina", labelKey: "club.ratings.stat.stamina", shortKey: "club.ratings.statShort.stamina" },
  { key: "physical", labelKey: "club.ratings.stat.physical", shortKey: "club.ratings.statShort.physical" },
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
        <div className="text-sm font-black tabular-nums text-[#102A43]">{formatNumber(getResolvedUiLocale(), Number(value), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
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

type EquipmentHolderPresentation =
  | { kind: "current-user"; stableKey: "current-user" }
  | { kind: "organizer-fallback"; stableKey: "organizer-fallback" }
  | { kind: "named"; stableKey: string; label: string };

function equipmentHolderPresentation(
  value: string,
  namesByEmail: Record<string, string> = {},
): EquipmentHolderPresentation {
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: "organizer-fallback", stableKey: "organizer-fallback" };
  }
  if (isLikelyCurrentUserLabel(trimmed)) {
    return { kind: "current-user", stableKey: "current-user" };
  }

  const normalizedEmail = trimmed.toLowerCase();
  const savedName = normalizedEmail.includes("@")
    ? namesByEmail[normalizedEmail]
    : undefined;
  if (savedName?.trim()) {
    const label = titleCaseWords(savedName.trim());
    return { kind: "named", stableKey: `name:${label.toLocaleLowerCase()}`, label };
  }

  const emailName = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  if (
    normalizedEmail.includes("@") &&
    emailName.trim().toLowerCase() === "organizer"
  ) {
    return { kind: "organizer-fallback", stableKey: "organizer-fallback" };
  }
  const readableName = titleCaseWords(emailName.replace(/[._-]+/g, " "));
  if (looksLikeReadableName(readableName)) {
    return {
      kind: "named",
      stableKey: `name:${readableName.toLocaleLowerCase()}`,
      label: readableName,
    };
  }

  return { kind: "organizer-fallback", stableKey: "organizer-fallback" };
}

function equipmentHolderPresentationLabel(
  presentation: EquipmentHolderPresentation,
) {
  if (presentation.kind === "current-user") return translate("club.people.you");
  if (presentation.kind === "organizer-fallback") {
    return translate("club.people.organizer");
  }
  return presentation.label;
}

function sharedPersonPresentationLabel(person: SharedPersonPresentation) {
  if (person.kind === "me") return translate("club.people.me");
  if (person.kind === "organizer") return translate("club.people.organizer");
  if (person.kind === "person") {
    return translate("club.people.personNumber", { number: person.number });
  }
  return person.label;
}

function cleanEquipmentHolderLabel(
  value: string,
  namesByEmail: Record<string, string> = {},
) {
  return equipmentHolderPresentationLabel(
    equipmentHolderPresentation(value, namesByEmail),
  );
}

function equipmentActorLabel(
  name?: string,
  email?: string,
  namesByEmail: Record<string, string> = {},
) {
  const cleanName = name?.trim();
  if (cleanName && !cleanName.includes("@")) return titleCaseWords(cleanName);
  const cleanEmail = email?.trim() || cleanName || "";
  if (!cleanEmail) return translate("club.people.unknown");
  const presentation = equipmentHolderPresentation(cleanEmail, namesByEmail);
  return presentation.kind === "organizer-fallback"
    ? translate("club.people.unknown")
    : equipmentHolderPresentationLabel(presentation);
}

function formatEquipmentTimestamp(value?: number) {
  if (!value) return translate("club.time.notRecorded");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return translate("club.time.notRecorded");
  return formatDateTime(getResolvedUiLocale(), date, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClubNoteDate(value?: number) {
  if (!value) return translate("club.time.dateNotRecorded");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return translate("club.time.dateNotRecorded");
  return formatDateTime(getResolvedUiLocale(), date, {
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
    addHolder(makeEquipmentHolderId(label), translate("club.people.you")),
  );
  otherLabels.slice(0, 8).forEach((label, index) => {
    const presentation = equipmentHolderPresentation(label, namesByEmail);
    addHolder(
      makeEquipmentHolderId(label),
      presentation.kind === "organizer-fallback"
        ? translate("club.people.organizerNumber", { number: index + 1 })
        : equipmentHolderPresentationLabel(presentation),
    );
  });

  equipmentKits
    .map((kit) => normalizeEquipmentHolderId(kit.holderId))
    .filter((holderId) => holderId && !seen.has(holderId))
    .forEach((holderId) =>
      addHolder(holderId, cleanEquipmentHolderLabel(holderId, namesByEmail)),
    );

  if (!holders.length) {
    holders.push({ id: "organizer", label: translate("club.people.organizer") });
  }

  return [{ id: "storage", label: translate("club.equipment.clubStorage") }, ...holders];
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
  fallback: ClubEquipmentKit[] = createDefaultEquipmentKits(),
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
  const emailName = user?.email?.split("@")[0] || translate("club.people.organizer");
  return emailName
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || translate("club.people.organizer");
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
  user = null,
  sharedAuthorityStatus = "local_only",
  sharedAuthorityMessage = "",
  sharedCapabilities = NO_ACTIVE_SHARED_WORKSPACE_CAPABILITIES,
  canSwitchRoster = false,
  onOpenRosterPicker,
  onBackTargetChange,
  sharedToolsNode,
  fileCabinetNode,
  equipmentGroupId,
  equipmentHolderLabels = [],
  equipmentHolderNamesByEmail = {},
  notificationRecipientEmails = [],
  pairingRules = [],
  onOpenPairingRules,
  onOpenSharedRosters,
  onOpenTeams,
  currentTeamCount = null,
  currentTeamsGenerated = false,
  onApplyAiSmartCommandAction,
  onOpenTodayFromAi,
  onRequestAddPlayer,
  onRequestRatePlayers,
  tutorialStep,
  onTutorialAction,
}: ClubTabProps) {
  const uiLocale = getResolvedUiLocale();
  const [clubRatingSummaries, setClubRatingSummaries] = useState<
    ClubRatingSummary[]
  >([]);
  const [myClubRatings, setMyClubRatings] = useState<ClubMyRating[]>([]);
  const [clubRatingError, setClubRatingError] = useState("");
  const [clubRatingLoading, setClubRatingLoading] = useState(false);
  const [ratingPlayerId, setRatingPlayerId] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState(5);
  const [ratingPlayerStyle, setRatingPlayerStyle] = useState<PlayerStyleValue>(BALANCED_PLAYER_STYLE);
  const [pendingRatingPreset, setPendingRatingPreset] = useState<PlayerStyleValue | null>(null);
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
  const [attendanceWarningTemplates, setAttendanceWarningTemplates] =
    useState<AttendanceWarningTemplates>(localizedAttendanceWarningTemplates);
  const [attendanceWarningTemplatesLoading, setAttendanceWarningTemplatesLoading] = useState(false);
  const [attendanceWarningTemplatesError, setAttendanceWarningTemplatesError] = useState("");
  const [attendanceWarningTemplatesOpen, setAttendanceWarningTemplatesOpen] = useState(false);
  const [attendanceWarningTemplateKind, setAttendanceWarningTemplateKind] = useState<AttendanceWarningTemplateKind>("late-cancellation");
  const [attendanceWarningTemplateDraft, setAttendanceWarningTemplateDraft] =
    useState(
      () => localizedAttendanceWarningTemplates()["late-cancellation"],
    );
  const [attendanceWarningTemplateSaving, setAttendanceWarningTemplateSaving] = useState(false);
  const [attendanceWarningTemplateNotice, setAttendanceWarningTemplateNotice] = useState("");
  const [attendanceWarningBoardOpen, setAttendanceWarningBoardOpen] = useState(false);
  const [attendanceWarningPlayerSearch, setAttendanceWarningPlayerSearch] = useState("");
  const [attendanceWarningComposerOpen, setAttendanceWarningComposerOpen] = useState(false);
  const [attendanceWarningComposerKind, setAttendanceWarningComposerKind] = useState<AttendanceWarningTemplateKind>("late-cancellation");
  const [attendanceWarningComposerDraft, setAttendanceWarningComposerDraft] = useState("");
  const [attendanceWarningCopyNotice, setAttendanceWarningCopyNotice] =
    useState<AttendanceWarningCopyNotice | null>(null);
  const [equipmentKits, setEquipmentKits] = useState<ClubEquipmentKit[]>(() => {
    if (typeof window === "undefined") return createDefaultEquipmentKits();
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
  const [kitColor, setKitColor] = useState<string>(DEFAULT_EQUIPMENT_COLOR);
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
    fileCabinetOpen: false,
    attendanceBoardOpen: false,
    attendanceEditorOpen: false,
    attendanceWarningTemplatesOpen: false,
    attendanceWarningBoardOpen: false,
    attendanceWarningComposerOpen: false,
  });
  const clubUser = user;
  const authReady = sharedAuthorityStatus !== "loading";
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [fileCabinetOpen, setFileCabinetOpen] = useState(false);
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

  useEffect(() => {
    if (clubUser) setAccountDialogOpen(false);
  }, [clubUser]);


  const equipmentRealtimeEnabled = Boolean(equipmentGroupId && sharedCapabilities.canReadEquipment);
  const equipmentCanSyncOnline = equipmentRealtimeEnabled;
  const equipmentCanEdit = !isSharedRoster || sharedCapabilities.canEditEquipment;
  const equipmentWaitingForAccount = Boolean(isSharedRoster && sharedAuthorityStatus === "loading");
  const equipmentNeedsSignIn = Boolean(isSharedRoster && sharedAuthorityStatus === "signed_out");
  const equipmentSharedConnecting = isSharedRoster && !equipmentRealtimeEnabled;
  const equipmentStatusText = equipmentCanSyncOnline
    ? equipmentError
      ? translate("club.equipment.status.reconnecting")
      : equipmentSaving
        ? translate("club.equipment.status.saving")
        : equipmentLoading
          ? equipmentKits.length > 0
            ? translate("club.equipment.status.onlineLiveBoard")
            : translate("club.equipment.status.onlineLoadingBags")
          : translate("club.equipment.status.onlineShared")
    : equipmentWaitingForAccount
      ? translate("club.account.connecting")
      : equipmentNeedsSignIn
        ? translate("club.equipment.status.signIn")
        : equipmentSharedConnecting
          ? sharedAuthorityMessage || translate("club.equipment.status.connectingShared")
          : translate("club.equipment.status.localPreview");
  const equipmentBoardStatusText = equipmentMoveNotice
    ? equipmentCanSyncOnline
      ? translate("club.equipment.status.moveSavedOnline", { notice: equipmentMoveNotice })
      : equipmentMoveNotice
    : equipmentCanSyncOnline
      ? equipmentError
        ? translate("club.equipment.status.reconnectingBoard")
        : equipmentSaving
          ? translate("club.equipment.status.saving")
          : equipmentLoading
            ? equipmentKits.length > 0
              ? translate("club.equipment.status.onlineLoadingLatest")
              : translate("club.equipment.status.onlineLoadingBagsProgress")
            : equipmentLastSyncedAt
              ? translate("club.equipment.status.onlineSharedUpdated", {
                  time: formatEquipmentTimestamp(equipmentLastSyncedAt),
                })
              : translate("club.equipment.status.onlineShared")
      : equipmentWaitingForAccount
        ? translate("club.account.connecting")
        : equipmentNeedsSignIn
          ? translate("club.equipment.status.signInBoard")
          : equipmentSharedConnecting
            ? sharedAuthorityMessage || translate("club.equipment.status.connectingShared")
            : translate("club.equipment.status.localPreviewMove");
  const equipmentHolders = useMemo<EquipmentHolder[]>(() => {
    if (!isSharedRoster && !equipmentRealtimeEnabled)
      return LOCAL_EQUIPMENT_HOLDERS.map(({ id, labelKey }) => ({
        id,
        label: translate(labelKey),
      }));
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
    uiLocale,
  ]);
  const actionBoardOrganizerPeople = useMemo(
    () =>
      Array.from(
        new Set(
          notificationRecipientEmails
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email.includes("@")),
        ),
      ).map((email) => ({
        email,
        name: cleanEquipmentHolderLabel(email, equipmentHolderNamesByEmail),
      })),
    [equipmentHolderNamesByEmail, notificationRecipientEmails, uiLocale],
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
    [equipmentKits, uiLocale],
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
            error.message || translate("club.errors.loadEquipmentFailed"),
          );
        },
      );

      return () => unsubscribe();
    } catch (error) {
      setEquipmentLoading(false);
      setEquipmentError(
        error instanceof Error
          ? error.message
          : translate("club.errors.connectEquipmentFailed"),
      );
      return undefined;
    }
  }, [equipmentGroupId, isSharedRoster]);

  const attendanceReadEnabled = Boolean(
    isSharedRoster && sharedRosterId && sharedCapabilities.canReadAttendance,
  );
  const attendanceEnabled = Boolean(
    attendanceReadEnabled && sharedCapabilities.canEditAttendance,
  );

  useEffect(() => {
    if (!attendanceReadEnabled || !sharedRosterId) {
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
          setAttendanceError(error.message || translate("club.errors.loadAttendanceFailed"));
        },
      );
    } catch (error) {
      setAttendanceLoading(false);
      setAttendanceError(error instanceof Error ? error.message : translate("club.errors.connectAttendanceFailed"));
      return undefined;
    }
  }, [attendanceReadEnabled, sharedRosterId]);

  useEffect(() => {
    if (!attendanceReadEnabled || !sharedRosterId) {
      setAttendanceWarningTemplates(localizedAttendanceWarningTemplates());
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
          setAttendanceWarningTemplatesError(error.message || translate("club.errors.loadWarningTemplatesFailed"));
        },
        localizedAttendanceWarningTemplates(),
      );
    } catch (error) {
      setAttendanceWarningTemplatesLoading(false);
      setAttendanceWarningTemplatesError(error instanceof Error ? error.message : translate("club.errors.connectWarningTemplatesFailed"));
      return undefined;
    }
  }, [attendanceReadEnabled, sharedRosterId, uiLocale]);

  const clubRatingsEnabled = Boolean(
    isSharedRoster
    && sharedRosterId
    && sharedCapabilities.canReadClubRatings
    && sharedCapabilities.canRatePlayer,
  );

  useEffect(() => {
    if (!clubRatingsEnabled || !sharedRosterId) {
      setClubRatingSummaries([]);
      setMyClubRatings([]);
      setClubRatingError("");
      setClubRatingLoading(false);
      setRatingPlayerId(null);
      setRatingBoardOpen(false);
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
          setClubRatingError(error.message || translate("club.errors.loadRatingsFailed"));
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
          setClubRatingError(error.message || translate("club.errors.loadOwnRatingsFailed"));
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
          : translate("club.errors.connectRatingsFailed"),
      );
      setClubRatingLoading(false);
      return;
    }
  }, [clubRatingsEnabled, sharedRosterId]);

  useEffect(() => {
    const notesReady = Boolean(
      isSharedRoster && sharedRosterId && sharedCapabilities.canUseClubNotes,
    );

    if (!notesReady || !sharedRosterId) {
      setClubNotes([]);
      setClubNotesError("");
      return;
    }

    setClubNotesError("");
    try {
      return listenToClubNotes(sharedRosterId, setClubNotes, (error) =>
        setClubNotesError(error.message || translate("club.errors.loadNotesFailed")),
      );
    } catch (error) {
      setClubNotesError(
        error instanceof Error
          ? error.message
          : translate("club.errors.connectNotesFailed"),
      );
      return;
    }
  }, [isSharedRoster, sharedCapabilities.canUseClubNotes, sharedRosterId]);

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
    ? clubSkippedCount
      ? translate("club.ratings.progressWithSkipped", {
          rated: clubRatedCount,
          total: players.length,
          skipped: clubSkippedCount,
        })
      : translate("club.ratings.progress", {
          rated: clubRatedCount,
          total: players.length,
        })
    : isSharedRoster
      ? sharedAuthorityMessage || translate("club.ratings.signInToRate")
      : translate("club.ratings.sharedOnly");
  const previewClubNotes = clubNotes.slice(0, 3);
  const currentUserUid = clubUser?.uid || "";
  const clubNotesEnabled = Boolean(
    isSharedRoster && sharedRosterId && sharedCapabilities.canUseClubNotes,
  );
  const clubNotesUnavailableReason = !isSharedRoster
    ? translate("club.notes.sharedOnly")
    : sharedAuthorityMessage || (!sharedRosterId
      ? translate("club.notes.rosterConnecting")
      : !authReady
        ? translate("club.notes.accountConnecting")
        : !clubUser?.email
          ? translate("club.notes.signIn")
          : translate("club.notes.unavailable"));
  const canAddClubNote =
    clubNotesEnabled && clubNoteDraft.trim().length > 0 && !clubNoteSaving;
  const canRemoveClubNote = (note: ClubNote) =>
    Boolean(currentUserUid && note.createdByUid === currentUserUid);

  const commitRatingPreset = (nextStyle: PlayerStyleValue) => {
    setRatingPlayerStyle(nextStyle);
    setRatingProfile(generateStyledPlayerAttributes(ratingDraft, nextStyle));
  };

  const openRatingForPlayer = (player: RoomPlayer | null) => {
    if (!player) return;
    if (onRequestRatePlayers) {
      const queue = [
        player.id,
        ...orderedNeedRatingPlayers
          .map((candidate) => candidate.id)
          .filter((playerId) => playerId !== player.id),
      ];
      setRatingBoardOpen(false);
      onRequestRatePlayers(queue);
      return;
    }
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
    setPendingRatingPreset(null);
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
      !clubRatingsEnabled ||
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
        translate("club.ratings.imported", { count: savedCount }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : translate("club.errors.importRatingsFailed");
      setRatingSeedMessage("");
      setClubRatingError(message);
    } finally {
      setRatingSeedSaving(false);
    }
  };

  const saveClubRating = async () => {
    if (!clubRatingsEnabled || !sharedRosterId || !ratingDialogPlayer || ratingSaving) return;
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
          translate("club.ratings.savedNext", {
            player: savedPlayerName,
            nextPlayer: nextPlayer.name,
          }),
        );
      } else {
        setRatingPlayerId(null);
        setRatingBoardOpen(true);
        setRatingFlowNotice(
          translate("club.ratings.savedCaughtUp", { player: savedPlayerName }),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : translate("club.errors.saveRatingFailed");
      setRatingDialogError(message);
      setClubRatingError(message);
    } finally {
      setRatingSaving(false);
    }
  };

  const skipClubRating = async () => {
    if (!clubRatingsEnabled || !sharedRosterId || !ratingDialogPlayer || ratingSaving) return;
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
          translate("club.ratings.skippedNext", {
            player: skippedPlayerName,
            nextPlayer: nextPlayer.name,
          }),
        );
      } else {
        setRatingPlayerId(null);
        setRatingBoardOpen(true);
        setRatingFlowNotice(
          translate("club.ratings.skippedCaughtUp", { player: skippedPlayerName }),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : translate("club.errors.skipRatingFailed");
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
        error instanceof Error ? error.message : translate("club.errors.addNoteFailed"),
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
      throw new Error(translate("club.ai.actionNotWired"));
    }

    const noteText = action.noteText?.trim();
    if (!noteText) {
      throw new Error(translate("club.ai.noteTextMissing"));
    }

    if (!sharedRosterId || !clubNotesEnabled) {
      throw new Error(clubNotesUnavailableReason || translate("club.notes.notReady"));
    }

    setClubNoteSaving(true);
    setClubNotesError("");
    try {
      await addClubNote(sharedRosterId, noteText);
      setClubNoteDraft("");
      return translate("club.ai.noteAdded");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : translate("club.errors.addNoteFailed");
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
      translate("club.notes.removeConfirm"),
    );
    if (!confirmed) return;
    setClubNoteDeletingId(note.id);
    setClubNotesError("");
    try {
      await deleteOwnClubNote(sharedRosterId, note.id);
    } catch (error) {
      setClubNotesError(
        error instanceof Error ? error.message : translate("club.errors.removeNoteFailed"),
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
  const sharedPeople = useMemo<SharedPersonPresentation[]>(() => {
    const people = equipmentHolderLabels.map((label) => {
      const presentation = equipmentHolderPresentation(
        label,
        equipmentHolderNamesByEmail,
      );
      if (presentation.kind === "current-user") {
        return { stableKey: presentation.stableKey, kind: "me" } as const;
      }
      if (presentation.kind === "organizer-fallback") {
        return {
          stableKey: presentation.stableKey,
          kind: "organizer",
        } as const;
      }
      return {
        stableKey: presentation.stableKey,
        kind: "named",
        label: presentation.label,
      } as const;
    });
    const unique = people.filter(
      (person, index, all) =>
        all.findIndex((candidate) => candidate.stableKey === person.stableKey) === index,
    );
    if (unique.length) return unique;
    if (!isSharedRoster) return [];
    return [
      { stableKey: "current-user", kind: "me" },
      ...Array.from(
        { length: Math.max(0, sharedPeopleCount - 1) },
        (_, index) => ({
          stableKey: `person-${index + 2}`,
          kind: "person" as const,
          number: index + 2,
        }),
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
        const displayLabel = equipmentItemDisplayLabel({
          ...item,
          label: normalizedLabel,
        });
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
  }, [equipmentKits, uiLocale]);
  const actionBoardEquipmentSnapshot = useMemo(() => ({
    bags: equipmentKits.map((kit) => ({
      id: kit.id,
      name: kit.name || translate("club.equipment.defaultBagName"),
      holder: equipmentHolderLabelById[normalizeEquipmentHolderId(kit.holderId)] || translate("club.equipment.clubStorage"),
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
  }), [equipmentHolderLabelById, equipmentInventoryTotals, equipmentKits, uiLocale]);
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
    if (!equipmentCanEdit) return;
    openEquipmentEditor(() => {
      equipmentDraftBagIdRef.current = null;
      resetEquipmentForm();
      setKitHolderId("storage");
    });
  };

  const openEditEquipmentKit = (kit: ClubEquipmentKit) => {
    if (!equipmentCanEdit) return;
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
    if (!equipmentCanEdit) return;
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
    const actorEmail = clubUser?.email || undefined;
    const actorName = clubUser?.displayName || actorEmail || translate("club.people.organizer");
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
      name: trimmedName || existingKit?.name || translate("club.equipment.defaultBagName"),
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
          error instanceof Error ? error.message : translate("club.errors.saveEquipmentFailed"),
        );
      }
    } finally {
      if (saveSequence === equipmentSaveSequenceRef.current) setEquipmentSaving(false);
    }
  }

  useEffect(() => {
    if (!equipmentCanEdit || !equipmentDialogOpen || !equipmentAutosaveReadyRef.current) return;
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
  }, [equipmentCanEdit, equipmentDialogOpen, kitName, kitHolderId, kitColor, kitItems]);

  useEffect(() => {
    if (!isSharedRoster || equipmentCanEdit || !equipmentDialogOpen) return;
    if (equipmentAutosaveTimerRef.current !== null) {
      window.clearTimeout(equipmentAutosaveTimerRef.current);
      equipmentAutosaveTimerRef.current = null;
    }
    equipmentAutosaveReadyRef.current = false;
    setColorPickerOpen(false);
    setEquipmentItemPickerOpen(false);
    setDeleteConfirmOpen(false);
    setEquipmentDialogOpen(false);
    resetEquipmentForm();
  }, [equipmentCanEdit, equipmentDialogOpen, isSharedRoster]);

  const moveEquipmentKit = async (kitId: string, holderId: string) => {
    if (!equipmentCanEdit) return;
    const currentKit = equipmentKits.find((kit) => kit.id === kitId);
    if (!currentKit) return;
    const now = Date.now();
    const actorEmail = clubUser?.email || undefined;
    const actorName = clubUser?.displayName || actorEmail || translate("club.people.organizer");
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
      translate("club.equipment.newHolder");
    setEquipmentKits(nextKits);
    setEquipmentMoveNotice(
      translate("club.equipment.moved", {
        bag: currentKit.name,
        holder: nextHolderLabel,
      }),
    );
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
          : translate("club.errors.moveEquipmentFailed"),
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
    if (!equipmentCanEdit) return;
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
    if (!equipmentCanEdit) return;
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
          : translate("club.errors.deleteEquipmentFailed"),
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
      const name = matched?.name || record.playerName || translate("club.people.unknownPlayer");
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
  }, [filteredAttendanceRecords, players, attendanceSort, uiLocale]);

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
      group: activeRosterName.trim() || translate("club.people.theGroup"),
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
    if (!attendanceEnabled || !sharedRosterId || attendanceWarningTemplateSaving) return;
    setAttendanceWarningTemplateSaving(true);
    setAttendanceWarningTemplateNotice("");
    setAttendanceWarningTemplatesError("");
    try {
      await saveAttendanceWarningTemplate(sharedRosterId, attendanceWarningTemplateKind, attendanceWarningTemplateDraft);
      setAttendanceWarningTemplates((current) => ({ ...current, [attendanceWarningTemplateKind]: attendanceWarningTemplateDraft.trim() }));
      setAttendanceWarningTemplateNotice(translate("club.attendance.templateSaved"));
    } catch (error) {
      setAttendanceWarningTemplatesError(error instanceof Error ? error.message : translate("club.errors.saveWarningTemplateFailed"));
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
    setAttendanceWarningCopyNotice(null);
    setAttendanceWarningComposerOpen(true);
  };

  const openAttendanceWarningComposer = (kind?: AttendanceWarningTemplateKind) => {
    if (!attendanceHistoryRow) return;
    openAttendanceWarningComposerForRow(attendanceHistoryRow, kind);
  };

  const selectAttendanceWarningComposerKind = (kind: AttendanceWarningTemplateKind) => {
    setAttendanceWarningComposerKind(kind);
    setAttendanceWarningComposerDraft(buildAttendanceWarning(kind));
    setAttendanceWarningCopyNotice(null);
  };

  const copyAttendanceWarning = async () => {
    if (!attendanceWarningComposerDraft.trim()) return;
    setAttendanceWarningCopyNotice(null);
    try {
      await copyText(attendanceWarningComposerDraft.trim());
      setAttendanceWarningCopyNotice({ tone: "success" });
    } catch (error) {
      setAttendanceWarningCopyNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : translate("club.errors.copyWarningFailed"),
      });
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
    if (!attendanceEnabled) return;
    resetAttendanceEditor();
    setAttendanceEditorOpen(true);
  };

  const openAttendanceRecord = (record: AttendanceIssueRecord) => {
    if (!attendanceEnabled) return;
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
      setAttendanceError(translate("club.attendance.choosePlayer"));
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
      setAttendanceError(error instanceof Error ? error.message : translate("club.errors.saveAttendanceFailed"));
    } finally {
      setAttendanceSaving(false);
    }
  };

  const removeAttendanceRecord = async () => {
    if (!attendanceEnabled || !sharedRosterId || !attendanceEditingId || attendanceSaving) return;
    setAttendanceSaving(true);
    setAttendanceError("");
    try {
      await deleteAttendanceIssue(sharedRosterId, attendanceEditingId);
      setAttendanceEditorOpen(false);
      resetAttendanceEditor();
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : translate("club.errors.deleteAttendanceFailed"));
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
    accountDialogOpen ||
    fileCabinetOpen,
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
      fileCabinetOpen,
      attendanceBoardOpen,
      attendanceEditorOpen,
      attendanceWarningTemplatesOpen,
      attendanceWarningBoardOpen,
      attendanceWarningComposerOpen,
    };
  }, [
    accountDialogOpen,
    fileCabinetOpen,
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
        setAttendanceWarningCopyNotice(null);
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
      if (state.fileCabinetOpen) {
        event.preventDefault();
        setFileCabinetOpen(false);
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

  const clubDeskSummary = (() => {
    if (!clubUser) return translate("club.account.signInToManage");
    const parts: string[] = [];
    if (isSharedRoster) {
      parts.push(translate("common.organizerCount", { count: sharedPeopleCount }));
      parts.push(translate("club.account.sharedRoster"));
    } else {
      parts.push(translate("club.account.privateSetup"));
    }
    return parts.join(" · ");
  })();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-1 pb-2 lg:mx-0 lg:max-w-none lg:gap-5 lg:px-0">
      <Dialog
        open={accountModalOpen}
        onOpenChange={setAccountDialogOpen}
      >
        <DialogContent className="stripes-type-ui max-w-sm rounded-3xl p-3">
          <DialogHeader className="px-1 pb-1 text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">
              {translate("club.headings.stripesAccount")}</DialogTitle>
          </DialogHeader>
          <FirebaseSharedRosterAuthCard />
        </DialogContent>
      </Dialog>

      <div className="contents md:grid md:grid-cols-2 md:items-start md:gap-4 lg:gap-5 xl:[grid-template-columns:minmax(18rem,0.84fr)_minmax(0,1.26fr)] xl:[grid-template-rows:auto_auto_auto]">
      <div id="fairteams-help-panel" className="order-6 md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-3">
        <button
          type="button"
          className="stripes-type-ui flex w-full items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99] lg:hidden"
          onClick={() => setHelpCollapsed((current) => !current)}
          aria-expanded={!helpCollapsed || tutorialStep === "help-question"}
          aria-controls="fairteams-help-content"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-black leading-tight text-[#102A43]">{translate("club.messages.stripesHelp")}</span>
            <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">
              {translate("club.messages.askHowStripesWorks")}</span>
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
            tutorialQuestion={translate("club.ai.sharedRostersQuestion")}
          />
        </div>
      </div>

      <section className="order-1 overflow-hidden rounded-[1.7rem] border border-[#d9e9e4] bg-[#f3f8f7] p-3 shadow-sm ring-1 ring-[#e7f1ee] md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:h-full lg:p-4">
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
              <span className="block text-[17px] font-black leading-tight text-[#102A43] lg:text-[22px]">{translate("club.messages.playerManagement")}</span>
              <span className="mt-0.5 block text-[10px] font-bold text-[#52746d] lg:text-[13px]">{translate("club.messages.ratingsAttendanceRulesWarnings")}</span>
            </span>
          </button>
          <button
            type="button"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-[#52746d] ring-1 ring-[#d6e8e2] active:scale-[0.98]"
            onClick={() => setPlayerManagementCollapsed((current) => !current)}
            aria-label={playerManagementCollapsed ? translate("club.accessibility.expandPlayerManagement") : translate("club.accessibility.collapsePlayerManagement")}
          >
            {playerManagementCollapsed ? <ChevronDown className="h-4 w-4 lg:h-5 lg:w-5" /> : <ChevronUp className="h-4 w-4 lg:h-5 lg:w-5" />}
          </button>
        </div>

        {!playerManagementCollapsed && (
          <>
            <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                className="flex min-h-[3.25rem] lg:min-h-[3.75rem] w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!clubRatingsEnabled || players.length === 0}
                onClick={() => setRatingBoardOpen(true)}
              >
                <Star className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-[15px]">{translate("club.messages.clubRatings")}</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[13px]">
                    {clubRatingsEnabled ? translate("club.messages.rated", { clubRatedCount, length: players.length }) : isSharedRoster ? translate("club.messages.signInToRate") : translate("club.messages.sharedRostersOnly")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>

              <button
                type="button"
                className="flex min-h-[3.25rem] lg:min-h-[3.75rem] w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!attendanceReadEnabled}
                onClick={() => { setAttendanceHistoryPlayerId(null); setAttendanceBoardOpen(true); }}
              >
                <Clock3 className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-[15px]">{translate("club.messages.attendance")}</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[13px]">
                    {attendanceReadEnabled ? (attendanceEnabled ? translate("club.messages.sharedOrganizerLog") : translate("club.messages.sharedAttendanceViewOnly")) : isSharedRoster ? (sharedAuthorityMessage || translate("club.messages.signInToView")) : translate("club.messages.sharedRostersOnly")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>

              <button
                type="button"
                className="flex min-h-[3.25rem] lg:min-h-[3.75rem] w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!onOpenPairingRules || playerCount < 2}
                onClick={onOpenPairingRules}
              >
                <ClipboardList className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-[15px]">{translate("club.messages.rules")}</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[13px]">
                    {cleanPairingRuleCount > 0
                      ? translate("club.rules.pairingRuleCount", { count: cleanPairingRuleCount })
                      : translate("club.messages.noPairingRules")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>

              <button
                type="button"
                className="flex min-h-[3.25rem] lg:min-h-[3.75rem] w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left transition hover:bg-[#f4f9f7] active:bg-[#eaf4f1] disabled:opacity-45"
                disabled={!attendanceReadEnabled}
                onClick={() => { setAttendanceWarningPlayerSearch(""); setAttendanceWarningBoardOpen(true); }}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#3f756b] lg:h-5 lg:w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#102A43] lg:text-[15px]">{translate("club.messages.warnings")}</span>
                  <span className="block truncate text-[10px] font-bold text-slate-500 lg:text-[13px]">
                    {attendanceReadEnabled
                      ? translate("club.attendance.playersWithIssues", { count: attendanceOverview.length })
                      : isSharedRoster
                        ? sharedAuthorityMessage || translate("club.messages.signInToViewWarnings")
                        : translate("club.messages.sharedRostersOnly")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </div>

            {(isSharedRoster && legacySkillSeedPlayers.length > 0) && (
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-bold leading-snug text-slate-700">
                  {translate("club.ratings.seedHelp")}</div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-8 w-full rounded-xl border-slate-200 bg-white text-[11px] font-black text-[#102A43] hover:bg-slate-50"
                  disabled={!clubRatingsEnabled || ratingSeedSaving}
                  onClick={seedClubRatingsFromRosterSkills}
                >
                  {ratingSeedSaving
                    ? translate("club.actions.importing")
                    : translate("club.ratings.useRosterRatings", { count: legacySkillSeedPlayers.length })}
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
                      <span className="block text-xs font-black text-[#102A43]">{translate("club.messages.needsYourRating")}</span>
                      <span className="block truncate text-[11px] font-semibold text-slate-600">
                        {formatList(
                          uiLocale,
                          orderedNeedRatingPlayers.slice(0, 3).map((player) => player.name),
                          { style: "long", type: "unit" },
                        )}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-700 ring-1 ring-slate-200">{formatNumber(uiLocale, clubNeedRatingCount)}</span>
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
                      <span className="block text-xs font-black text-[#102A43]">{translate("club.messages.skippedForLater")}</span>
                      <span className="block truncate text-[11px] font-semibold text-amber-700">
                        {formatList(
                          uiLocale,
                          skippedPlayers.slice(0, 3).map((player) => player.name),
                          { style: "long", type: "unit" },
                        )}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-amber-700">{formatNumber(uiLocale, clubSkippedCount)}</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="order-2 overflow-hidden rounded-[1.7rem] border border-violet-100 bg-[#f8f3ff] p-3 shadow-sm ring-1 ring-violet-50 md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:h-full lg:p-4">
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
              <span className="block truncate text-[17px] font-black leading-tight text-[#102A43] lg:text-[22px]">{translate("club.messages.clubAccess")}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-violet-700/75 lg:text-[13px]">
                {clubUser && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label={translate("club.accessibility.online")} />}
                <span className="truncate">
                  {clubUser && !isSharedRoster
                    ? translate("club.messages.localRosterOpen", { clubGreetingName })
                    : clubUser
                      ? translate("club.account.greetingSummary", { greeting: clubGreetingName, summary: clubDeskSummary })
                      : clubDeskSummary}
                </span>
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
                {translate("club.actions.signIn")}</Button>
            )}
            {clubUser && (
              <Button
                type="button"
                className="h-8 shrink-0 rounded-full border border-violet-100 bg-white px-2.5 text-[10px] font-black text-violet-700 hover:bg-violet-50 lg:h-10 lg:px-3.5 lg:text-[13px]"
                onClick={(event) => {
                  event.stopPropagation();
                  void signOutOfSharedRosters();
                }}
              >
                {translate("club.actions.signOut")}</Button>
            )}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-violet-600 ring-1 ring-violet-100 active:scale-[0.98]"
              onClick={() => setClubDeskCollapsed((current) => !current)}
              aria-label={clubDeskCollapsed ? translate("club.accessibility.expandClubAccess") : translate("club.accessibility.collapseClubAccess")}
            >
              {clubDeskCollapsed ? <ChevronDown className="h-4 w-4 lg:h-5 lg:w-5" /> : <ChevronUp className="h-4 w-4 lg:h-5 lg:w-5" />}
            </button>
          </div>
        </div>

        {clubUser && !isSharedRoster && onOpenSharedRosters && (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-violet-100 bg-white/75 px-3 py-2.5 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
            <div className="min-w-0 text-[11px] font-semibold leading-snug text-violet-800/75 lg:text-[14px]">
              {translate("club.account.openSharedRosterHelp")}</div>
            <Button
              type="button"
              className="h-9 shrink-0 rounded-xl bg-violet-600 px-3 text-[11px] font-black text-white hover:bg-violet-700 lg:h-10 lg:px-4 lg:text-[13px]"
              onClick={(event) => {
                event.stopPropagation();
                setClubDeskCollapsed(false);
                window.setTimeout(() => onOpenSharedRosters(), 0);
              }}
            >
              {translate("club.actions.openSharedRosters")}</Button>
          </div>
        )}

        {!clubDeskCollapsed && (
          <div className="mt-3 min-w-0">{sharedToolsNode}</div>
        )}
      </section>

      <div className="order-3 md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:h-full lg:[&>section]:h-full">
        <TaskBoard
          rosterName={activeRosterName}
          workspaceKey={workspaceKey}
          themeColor={themeColor}
          scopeId={equipmentGroupId}
          isSharedRoster={isSharedRoster}
          user={clubUser}
          sharedAuthorityMessage={sharedAuthorityMessage}
          canReadSharedBoard={sharedCapabilities.canReadActionBoard}
          canEditSharedBoard={sharedCapabilities.canEditActionBoard}
          canVoteSharedBoard={sharedCapabilities.canVoteActionBoard}
          canNotifySharedBoard={sharedCapabilities.canNotifyActionBoard}
          canReadClubResources={sharedCapabilities.canReadClubResources}
          canEditClubResources={sharedCapabilities.canEditClubResources}
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
              <span className="block text-[17px] font-black leading-tight text-[#102A43] md:text-[18px] lg:text-[22px]">{translate("club.messages.clubNotes")}</span>
              <span className="mt-0.5 block truncate text-[10px] font-bold text-[#9a641f] lg:text-[13px]">
                {previewClubNotes[0] ? translate("club.messages.latest", { text: previewClubNotes[0].text }) : translate("club.messages.sharedNotesForOrganizers")}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-[#b76518] ring-1 ring-amber-100 active:scale-[0.98] lg:hidden"
            onClick={() => setClubNotesOpen(true)}
            aria-label={translate("club.accessibility.openClubNotes")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
            {clubNotes.length > 0 && (
              <button
                type="button"
                className="rounded-full bg-transparent px-2.5 py-1 text-[11px] font-black text-[#a94f0a] active:scale-95 lg:px-3 lg:py-1.5 lg:text-[13px]"
                onClick={() => setClubNotesOpen(true)}
              >
                {translate("club.actions.viewAll")}</button>
            )}
            <Button
              type="button"
              className="h-9 rounded-full bg-[#c8772a] px-3 text-[11px] font-black text-white hover:bg-[#af691f] lg:h-10 lg:px-4 lg:text-[13px]"
              onClick={() => setClubNotesOpen(true)}
              disabled={!clubNotesEnabled}
            >
              {translate("club.actions.postIt")}</Button>
          </div>
        </div>

        <div className={`mt-3 hidden gap-2.5 overflow-x-auto px-0.5 md:flex md:py-2 lg:overflow-visible ${previewClubNotes.length <= 1 ? "lg:flex lg:py-1.5" : "lg:grid lg:grid-cols-3 lg:py-2.5"}`}>
          {previewClubNotes.length > 0 ? (
            previewClubNotes.map((note, index) => (
              <div
                key={note.id}
                className={`relative rounded-[0.8rem] border border-black/5 px-2.5 py-2.5 shadow-[0_4px_8px_rgba(130,85,35,0.22)] ring-1 ring-white/25 md:min-w-[10rem] lg:min-w-0 lg:px-3 lg:py-3 ${previewClubNotes.length === 1 ? "min-h-[5.75rem] w-[9.75rem] lg:min-h-[6.5rem] lg:w-[13rem]" : "min-h-[6.45rem] lg:min-h-[7rem]"}`}
                style={clubNoteStyle(index)}
              >
                <div className="flex h-full flex-col">
                  <div
                    className={clubNoteTextClass(note.text)}
                    style={{ fontFamily: '"Patrick Hand", "Outfit", system-ui, sans-serif' }}
                  >
                    {note.text}
                  </div>
                  <div className="mt-1.5 pr-4 text-[9px] font-bold leading-tight text-slate-600/80 lg:mt-2 lg:text-[11px]">
                    <div className="truncate">— {note.createdByName || translate("club.messages.organizer")}</div>
                  </div>
                </div>
                {canRemoveClubNote(note) && (
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 rounded-full bg-white/60 p-1 text-slate-600 shadow-sm active:scale-95 disabled:opacity-50"
                    onClick={() => removeOwnClubNote(note)}
                    disabled={clubNoteDeletingId === note.id}
                    aria-label={translate("club.accessibility.removeYourClubNote")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-3 min-h-[5rem] w-full rounded-2xl border border-dashed border-amber-200 bg-white/60 px-3 py-3 text-sm font-black text-[#102A43] lg:min-h-[3.75rem] lg:py-2.5">
              {translate("club.messages.leaveTheFirstNoteForTheOrganizers")}</div>
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
            <div className="text-[17px] font-black leading-tight text-[#102A43] md:text-[18px] lg:text-[22px]">
              {translate("club.messages.equipment")}</div>
            <div className="mt-1 hidden text-xs font-semibold leading-snug text-slate-500 md:block md:text-[12px] lg:text-[15px] lg:leading-relaxed">
              {translate("club.equipment.boardHelp")}</div>
            <div className="mt-1 text-[10px] font-black text-slate-400 md:hidden">
              {translate("club.messages.bagsBallsConesGear")}</div>
            </div>
          </button>
          <button type="button" className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-blue-600 ring-1 ring-sky-100 active:scale-[0.98] lg:hidden" onClick={() => setEquipmentBoardOpen(true)} aria-label={translate("club.accessibility.openEquipment")}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button
            type="button"
            className="hidden h-9 shrink-0 rounded-2xl border border-slate-100 bg-white px-3 text-xs font-black text-[#102A43] shadow-sm hover:bg-slate-50 lg:inline-flex lg:h-10 lg:px-4 lg:text-[14px]"
            onClick={() => setEquipmentBoardOpen(true)}
          >
            {translate("common.open")}</Button>
        </div>

        <div className="hidden md:block">
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
                  className={`grid grid-cols-[4.8rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-2 transition lg:grid-cols-[6.5rem_minmax(0,1fr)] lg:gap-3 lg:px-3.5 lg:py-3 ${index === 0 ? "" : "border-t border-slate-100"} ${highlighted ? "bg-emerald-50 ring-2 ring-inset ring-emerald-100" : ""}`}
                >
                  <div className="truncate text-[11px] font-black text-[#102A43] lg:text-[13px]">
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
                            disabled={!equipmentCanEdit}
                            className={`touch-none select-none rounded-2xl border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition active:scale-[0.98] lg:px-2.5 lg:py-1.5 ${isDragging ? "scale-95 opacity-45 ring-2 ring-emerald-200" : ""}`}
                            onPointerDown={(event) =>
                              startEquipmentPointerDrag(event, kit)
                            }
                            onPointerMove={moveEquipmentPointerDrag}
                            onPointerUp={finishEquipmentPointerDrag}
                            onPointerCancel={finishEquipmentPointerDrag}
                            onClick={() => openEquipmentKitFromBoard(kit)}
                            aria-label={equipmentCanEdit ? translate("club.accessibility.edit", { name: kit.name }) : kit.name}
                          >
                            <span className="flex max-w-[7.4rem] items-center gap-1.5">
                              <DuffleBagIcon
                                color={kit.color || DEFAULT_EQUIPMENT_COLOR}
                                className="h-6 w-8 shrink-0 lg:h-7 lg:w-9"
                              />
                              <span className="min-w-0 truncate text-[11px] font-black text-[#102A43] lg:text-[13px]">
                                {kit.name}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <span className="rounded-full border border-dashed border-slate-200 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate-400 lg:px-2.5 lg:py-1.5 lg:text-[12px]">
                        {translate("club.messages.noBag")}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {equipmentKits.length > equipmentPreviewKits.length && (
              <div className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-400">
                {translate("club.equipment.openBoardCount", { count: equipmentKits.length })}</div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-white/70 px-3 py-5 text-center text-sm font-black text-[#102A43] lg:py-3.5">
            {translate("club.messages.noBagsYet")}</div>
        )}
        </div>
      </section>
      {fileCabinetNode?.({
        open: fileCabinetOpen,
        onOpenChange: setFileCabinetOpen,
        googleLoginHint: fileCabinetGoogleLoginHint(clubUser),
      })}
      {isSharedRoster && !fileCabinetNode && sharedAuthorityMessage && (
        <section className="rounded-[1.75rem] border border-violet-100 bg-violet-50/60 p-3 shadow-sm" role="status">
          <div className="text-sm font-black text-[#102A43]">{translate("club.messages.fileCabinet")}</div>
          <div className="mt-1 text-[11px] font-semibold leading-snug text-violet-800">
            {sharedAuthorityMessage}
          </div>
        </section>
      )}
      </div>

      <Dialog open={clubNotesOpen} onOpenChange={setClubNotesOpen}>
        <DialogContent className="stripes-type-ui max-h-[86svh] max-w-sm overflow-hidden rounded-3xl border border-amber-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-amber-100 bg-amber-50/70 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43] lg:text-xl">
              <StickyNote className="h-4 w-4 text-amber-600" />
              {translate("club.headings.clubNotes")}</DialogTitle>
          </DialogHeader>
          <div className="border-b border-amber-100 bg-white/80 p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-amber-100 bg-white p-2 shadow-sm">
              <Textarea
                value={clubNoteDraft}
                onChange={(event) => setClubNoteDraft(event.target.value)}
                disabled={!clubNotesEnabled}
                placeholder={
                  clubNotesEnabled
                    ? translate("club.fields.noteExample")
                    : clubNotesUnavailableReason || translate("club.fields.sharedNotesAppearAfterSignIn")
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
                {clubNoteSaving ? translate("club.actions.posting") : translate("club.actions.post")}
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
                          <div>— {note.createdByName || translate("club.messages.organizer")}</div>
                          <div>{formatClubNoteDate(note.createdAt)}</div>
                        </div>
                      </div>
                      {canRemoveClubNote(note) && (
                        <button
                          type="button"
                          className="rounded-full bg-white/80 p-1.5 text-amber-600 ring-1 ring-amber-100 active:scale-95 disabled:opacity-50"
                          onClick={() => removeOwnClubNote(note)}
                          disabled={clubNoteDeletingId === note.id}
                          aria-label={translate("club.accessibility.removeYourClubNote")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]">
                  {translate("club.messages.noNotesYet")}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={collaboratorsOpen} onOpenChange={setCollaboratorsOpen}>
        <DialogContent className="max-w-xs rounded-3xl border border-slate-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">
              {translate("club.headings.organizers")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 p-4">
            {sharedPeople.length ? (
              sharedPeople.map((person) => (
                <div
                  key={person.stableKey}
                  className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]"
                >
                  {sharedPersonPresentationLabel(person)}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
                {translate("club.messages.onlyYou")}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceBoardOpen} onOpenChange={(open) => { setAttendanceBoardOpen(open); if (!open) setAttendanceHistoryPlayerId(null); }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-hidden rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              {attendanceHistoryPlayerId && <button type="button" className="-ml-1 rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={() => setAttendanceHistoryPlayerId(null)} aria-label={translate("club.accessibility.backToAttendanceOverview")}><ChevronLeft className="h-5 w-5" /></button>}
              <Clock3 className="h-5 w-5 text-violet-600" />
              {attendanceHistoryPlayerId ? (attendanceOverview.find((row) => row.playerId === attendanceHistoryPlayerId)?.name || translate("club.headings.attendanceHistory")) : translate("club.headings.clubAttendance")}
            </DialogTitle>
          </DialogHeader>
          {!attendanceHistoryPlayerId ? (
            <div className="flex min-h-0 flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {translate("club.labels.period")}<select value={attendanceRange} onChange={(event) => setAttendanceRange(event.target.value as AttendanceRange)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#102A43]">
                    <option value="3m">{translate("club.attendance.period.threeMonths")}</option>
                    <option value="6m">{translate("club.attendance.period.sixMonths")}</option>
                    <option value="12m">{translate("club.attendance.period.twelveMonths")}</option>
                    <option value="all">{translate("club.messages.all")}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {translate("club.labels.sort")}<select value={attendanceSort} onChange={(event) => setAttendanceSort(event.target.value as AttendanceSort)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#102A43]">
                    <option value="issues">{translate("club.messages.mostIssues")}</option>
                    <option value="recent">{translate("club.messages.mostRecent")}</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Button type="button" className="h-10 min-w-0 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceEnabled} onClick={openNewAttendanceIssue}><Plus className="mr-1.5 h-4 w-4" />{translate("club.actions.recordAttendanceIssue")}</Button>
                <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-[#102A43]" disabled={!attendanceEnabled} onClick={() => openAttendanceWarningTemplates()}><ClipboardList className="mr-1.5 h-4 w-4" />{translate("club.actions.templates")}</Button>
              </div>
              {attendanceError && <div className="shrink-0 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{attendanceError}</div>}
              <div className="min-h-0 max-h-[52dvh] overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: "touch" }}>
                {attendanceLoading ? <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">{translate("club.messages.loadingAttendance")}</div> : attendanceOverview.length === 0 ? <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">{translate("club.messages.noAttendanceIssuesRecorded")}</div> : <div className="grid gap-2">{attendanceOverview.map((row) => {
                  const counts = { tardy: 0, lateCancellation: 0, noShow: 0, conduct: 0 };
                  row.records.forEach((record) => { if (record.issueType === "tardy") counts.tardy += 1; if (record.issueType === "late-cancellation") counts.lateCancellation += 1; if (record.issueType === "no-show") counts.noShow += 1; if (record.issueType === "conduct") counts.conduct += 1; });
                  const parts = [
                    counts.noShow
                      ? attendanceSummaryText(
                          counts.noShow,
                          "club.attendance.overviewSummary.noShow",
                        )
                      : "",
                    counts.lateCancellation
                      ? attendanceSummaryText(
                          counts.lateCancellation,
                          "club.attendance.overviewSummary.lastMinute",
                        )
                      : "",
                    counts.tardy
                      ? attendanceSummaryText(
                          counts.tardy,
                          "club.attendance.overviewSummary.tardy",
                        )
                      : "",
                    counts.conduct
                      ? attendanceSummaryText(
                          counts.conduct,
                          "club.attendance.overviewSummary.conduct",
                        )
                      : "",
                  ].filter(Boolean);
                  return <button key={row.playerId} type="button" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99]" onClick={() => setAttendanceHistoryPlayerId(row.playerId)}><span className="min-w-0"><span className="block truncate text-sm font-black text-[#102A43]">{row.name}</span><span className="block truncate text-[11px] font-semibold text-slate-500">{parts.join(" · ")}</span></span><span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">{translate("club.attendance.issueCount", { count: row.records.length })}</span></button>;
                })}</div>}
              </div>
            </div>
          ) : (
            <div className="max-h-[68dvh] overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
              <Button type="button" className="mb-3 h-10 w-full rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" onClick={() => openAttendanceWarningComposer()}><Copy className="mr-1.5 h-4 w-4" />{translate("club.actions.copyWarning")}</Button>
              <div className="grid gap-2">{(attendanceHistoryRow?.records || []).map((record) => <button key={record.id} type="button" className="rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.99] disabled:cursor-default disabled:active:scale-100" disabled={!attendanceEnabled} onClick={() => openAttendanceRecord(record)}><div className="flex items-start justify-between gap-2"><span className="text-sm font-black text-[#102A43]">{attendanceIssueLabel(record.issueType)}</span><span className="text-[10px] font-black text-slate-400">{formatAttendanceDate(record.incidentDate)}</span></div>{record.note && <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">{record.note}</div>}{(record.createdByName || record.createdByEmail) && <div className="mt-1.5 text-[10px] font-semibold text-slate-400">{translate("club.attendance.recordedBy", { name: record.createdByName || record.createdByEmail })}</div>}</button>)}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceWarningBoardOpen} onOpenChange={(open) => { setAttendanceWarningBoardOpen(open); if (!open) { blurActiveField(); setAttendanceWarningPlayerSearch(""); } }}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-hidden rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><AlertTriangle className="h-5 w-5 text-[#3f756b]" />{translate("club.headings.warnings")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 border-b border-slate-100 p-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                <Input value={attendanceWarningPlayerSearch} onChange={(event) => setAttendanceWarningPlayerSearch(event.target.value)} placeholder={translate("club.fields.findAPlayer")} className="h-10 rounded-2xl border-slate-200 pl-9 text-sm font-semibold" />
              </div>
              <Button type="button" variant="outline" className="h-10 shrink-0 rounded-2xl border-slate-200 px-3 text-xs font-black text-[#102A43]" onClick={() => openAttendanceWarningTemplates()}><ClipboardList className="mr-1.5 h-4 w-4" />{translate("club.actions.templates")}</Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">{translate("club.messages.attendanceOverview")}</span>
              <select value={attendanceRange} onChange={(event) => setAttendanceRange(event.target.value as AttendanceRange)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-[#102A43]">
                <option value="3m">{translate("club.messages.last3Months")}</option>
                <option value="6m">{translate("club.messages.last6Months")}</option>
                <option value="12m">{translate("club.messages.last12Months")}</option>
                <option value="all">{translate("club.messages.all")}</option>
              </select>
            </div>
          </div>
          <div className="max-h-[64dvh] overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
            {attendanceLoading ? (
              <div className="py-8 text-center text-sm font-semibold text-slate-400">{translate("club.messages.loadingAttendance")}</div>
            ) : attendanceWarningOverview.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400">{translate("club.attendance.emptyPeriod")}</div>
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
                  const parts = [
                    counts.noShow
                      ? attendanceSummaryText(counts.noShow, "club.attendance.summary.noShow")
                      : "",
                    counts.lateCancellation
                      ? attendanceSummaryText(
                          counts.lateCancellation,
                          "club.attendance.summary.lastMinute",
                        )
                      : "",
                    counts.tardy
                      ? attendanceSummaryText(counts.tardy, "club.attendance.summary.tardy")
                      : "",
                    counts.conduct
                      ? attendanceSummaryText(counts.conduct, "club.attendance.summary.conduct")
                      : "",
                  ].filter(Boolean);
                  return (
                    <button key={row.playerId} type="button" className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm transition active:scale-[0.99]" onClick={() => { setAttendanceWarningBoardOpen(false); openAttendanceWarningComposerForRow(row); }}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-[#102A43]">{row.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{parts.join(" · ")}</span>
                        {latest && <span className="mt-1 block text-[10px] font-semibold text-slate-400">{translate("club.attendance.latest", { date: formatAttendanceDate(latest.incidentDate), issue: attendanceIssueLabel(latest.issueType) })}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[11px] font-black text-[#102A43]">{formatNumber(uiLocale, row.records.length)}</span>
                        <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">{translate("club.messages.issues")}</span>
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
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><ClipboardList className="h-5 w-5 text-violet-600" />{translate("club.headings.warningTemplates")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 p-4">
            <div className="rounded-2xl bg-violet-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-violet-800">{translate("club.attendance.templateSharingHelp")}</div>
            <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              {translate("club.labels.template")}<select value={attendanceWarningTemplateKind} onChange={(event) => selectAttendanceWarningTemplateKind(event.target.value as AttendanceWarningTemplateKind)} className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#102A43]">
                {ATTENDANCE_WARNING_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{translate(option.labelKey)}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wide text-slate-400">{translate("club.labels.savedWording")}</Label>
              <Textarea value={attendanceWarningTemplateDraft} onChange={(event) => { setAttendanceWarningTemplateDraft(event.target.value.slice(0, 2400)); setAttendanceWarningTemplateNotice(""); }} className="min-h-48 resize-none rounded-2xl border-slate-200 text-sm font-semibold leading-relaxed" />
              <div className="text-[10px] font-semibold leading-relaxed text-slate-400">{translate("club.attendance.placeholders")}</div>
            </div>
            {attendanceWarningTemplatesLoading && <div className="text-[11px] font-semibold text-slate-400">{translate("club.messages.syncingClubTemplates")}</div>}
            {attendanceWarningTemplatesError && <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{attendanceWarningTemplatesError}</div>}
            {attendanceWarningTemplateNotice && <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">{attendanceWarningTemplateNotice}</div>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-slate-600" disabled={attendanceWarningTemplateSaving} onClick={() => { setAttendanceWarningTemplateDraft(localizedAttendanceWarningTemplates()[attendanceWarningTemplateKind]); setAttendanceWarningTemplateNotice(translate("club.attendance.defaultLoaded")); }}>{translate("club.actions.default")}</Button>
              <Button type="button" className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceWarningTemplateDraft.trim() || attendanceWarningTemplateSaving || !attendanceEnabled} onClick={saveCurrentAttendanceWarningTemplate}>{attendanceWarningTemplateSaving ? translate("club.actions.saving") : translate("club.actions.saveTemplate")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceWarningComposerOpen} onOpenChange={(open) => { setAttendanceWarningComposerOpen(open); if (!open) { blurActiveField(); setAttendanceWarningCopyNotice(null); } }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><Copy className="h-5 w-5 text-violet-600" />{attendanceHistoryRow ? translate("club.headings.copyWarningFor", { name: attendanceHistoryRow.name }) : translate("club.headings.copyWarning")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 p-4">
            <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              {translate("club.labels.template")}<select value={attendanceWarningComposerKind} onChange={(event) => selectAttendanceWarningComposerKind(event.target.value as AttendanceWarningTemplateKind)} className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#102A43]">
                {ATTENDANCE_WARNING_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{translate(option.labelKey)}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wide text-slate-400">{translate("club.labels.preview")}</Label>
              <Textarea value={attendanceWarningComposerDraft} onChange={(event) => { setAttendanceWarningComposerDraft(event.target.value); setAttendanceWarningCopyNotice(null); }} className="min-h-52 resize-none rounded-2xl border-slate-200 text-sm font-semibold leading-relaxed" />
              <div className="text-[10px] font-semibold leading-relaxed text-slate-400">{translate("club.attendance.warningComposerHelp")}</div>
            </div>
            {attendanceWarningCopyNotice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${attendanceWarningCopyNotice.tone === "success" ? "bg-emerald-50 text-emerald-700" : "border border-amber-100 bg-amber-50 text-amber-800"}`}>{attendanceWarningCopyNotice.tone === "success" ? translate("club.attendance.copied") : attendanceWarningCopyNotice.message}</div>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-slate-600" onClick={() => { setAttendanceWarningComposerOpen(false); openAttendanceWarningTemplates(attendanceWarningComposerKind); }}>{translate("club.actions.editTemplate")}</Button>
              <Button type="button" className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceWarningComposerDraft.trim()} onClick={copyAttendanceWarning}><Copy className="mr-1.5 h-4 w-4" />{attendanceWarningCopyNotice?.tone === "success" ? translate("club.actions.copied") : translate("club.actions.copyWarning")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceEditorOpen} onOpenChange={(open) => { setAttendanceEditorOpen(open); if (!open) { blurActiveField(); setAttendanceDuplicate(null); } }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left"><DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]"><Clock3 className="h-5 w-5 text-violet-600" />{attendanceEditingId ? translate("club.headings.editAttendanceRecord") : translate("club.headings.recordAttendanceIssue")}</DialogTitle></DialogHeader>
          <div className="grid gap-3 p-4" onPointerDown={(event) => { const target = event.target as HTMLElement; if (!target.closest("input,button,select,textarea")) blurActiveField(); }}>
            <div className="grid gap-1.5">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">{translate("club.labels.player")}</Label>
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
                    placeholder={translate("club.fields.searchRoster")}
                    className="h-10 rounded-xl border-slate-200 pl-9 text-sm font-semibold"
                    enterKeyHint="search"
                    disabled={attendanceSaving}
                  />
                </div>
                <div className="mt-1.5 max-h-40 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  {attendancePlayerMatches.length > 0 ? attendancePlayerMatches.map((player) => {
                    const selected = attendancePlayerId === player.id;
                    return <button key={player.id} type="button" disabled={attendanceSaving} onClick={() => { setAttendancePlayerId(player.id); setAttendancePlayerSearch(player.name); setAttendanceDuplicate(null); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${selected ? "bg-violet-50 text-violet-800" : "text-[#102A43] hover:bg-slate-50"}`}><span className="min-w-0"><span className="block truncate text-sm font-black">{player.name}</span>{player.aka && <span className="block truncate text-[10px] font-semibold text-slate-400">{player.aka}</span>}</span>{selected && <span className="text-[10px] font-black uppercase tracking-wide">{translate("club.messages.selected")}</span>}</button>;
                  }) : <div className="px-3 py-3 text-center text-xs font-semibold text-slate-400">{translate("club.messages.noRosterMatch")}</div>}
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
                  {attendancePlayerSearch.trim() ? translate("club.actions.addToRoster", { value1: attendancePlayerSearch.trim() }) : translate("club.actions.addPlayerToRoster")}
                </button>
              </div>
            </div>
            <div className="grid gap-1.5"><Label className="text-xs font-black uppercase tracking-wide text-slate-500">{translate("club.labels.issue")}</Label><div className="grid grid-cols-2 gap-2">{ATTENDANCE_ISSUE_OPTIONS.map((option) => <button key={option.value} type="button" className={`min-h-10 rounded-2xl border px-2 py-2 text-[11px] font-black ${attendanceIssueType === option.value ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => { setAttendanceIssueType(option.value); setAttendanceDuplicate(null); }}>{translate(option.labelKey)}</button>)}</div></div>
            <div className="grid gap-1.5"><Label className="text-xs font-black uppercase tracking-wide text-slate-500">{translate("club.labels.date")}</Label><Input type="date" value={attendanceDate} onChange={(event) => { setAttendanceDate(event.target.value); setAttendanceDuplicate(null); }} max={todayIsoDate()} className="h-10 rounded-2xl border-slate-200 text-sm font-semibold" /></div>
            {attendanceIssueType === "conduct" && <div className="grid gap-1.5"><Label className="text-xs font-black uppercase tracking-wide text-slate-500">{translate("club.labels.whatHappened")}{" "}<span className="normal-case text-slate-400">{translate("club.messages.optional")}</span></Label><Input value={attendanceNote} onChange={(event) => setAttendanceNote(event.target.value.slice(0,240))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} enterKeyHint="done" maxLength={240} placeholder={translate("club.fields.shortOrganizerNote")} className="h-10 rounded-2xl border-slate-200 text-sm font-semibold" /></div>}
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[10px] font-semibold leading-snug text-slate-500">{translate("club.attendance.lateDifferenceHelp")}</div>
            {attendanceDuplicate && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-start gap-2 text-[11px] font-bold leading-snug text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{translate("club.attendance.duplicate", { issue: attendanceIssueLabel(attendanceDuplicate.issueType), date: formatAttendanceDate(attendanceDuplicate.incidentDate) })}</span></div><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="h-9 rounded-xl border-amber-200 bg-white text-[11px] font-black text-amber-800" onClick={() => setAttendanceDuplicate(null)}>{translate("common.cancel")}</Button><Button type="button" className="h-9 rounded-xl bg-amber-700 text-[11px] font-black text-white hover:bg-amber-800" onClick={() => saveAttendanceRecord(true)}>{translate("club.actions.recordAnother")}</Button></div></div>}
            {attendanceError && <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{attendanceError}</div>}
            <div className={`grid gap-2 ${attendanceEditingId ? "grid-cols-[0.8fr_1.2fr]" : "grid-cols-1"}`}>{attendanceEditingId && <Button type="button" variant="outline" className="h-10 rounded-2xl border-red-200 text-sm font-black text-red-500 hover:bg-red-50" disabled={!attendanceEnabled || attendanceSaving} onClick={removeAttendanceRecord}><Trash2 className="mr-1.5 h-4 w-4" />{translate("common.delete")}</Button>}<Button type="button" className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={!attendanceEnabled || !attendancePlayerId || !attendanceDate || attendanceSaving} onClick={() => { blurActiveField(); saveAttendanceRecord(false); }}>{attendanceSaving ? translate("club.actions.saving") : attendanceEditingId ? translate("club.actions.saveChanges") : translate("club.actions.saveRecord")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ratingBoardOpen} onOpenChange={setRatingBoardOpen}>
        <DialogContent className="max-h-[86svh] max-w-sm overflow-hidden rounded-3xl border border-violet-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-violet-100 bg-violet-50/70 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Star className="h-4 w-4 text-violet-600" />
              {translate("club.headings.organizerRatings")}</DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[66svh] overflow-y-auto p-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="mb-3 rounded-2xl bg-violet-50 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
              {translate("club.ratings.privacyHelp")}</div>

            {ratingFlowNotice && (
              <div className="mb-3 rounded-2xl border border-violet-100 bg-white px-3 py-2 text-[11px] font-black leading-snug text-violet-800 shadow-sm">
                {ratingFlowNotice}
              </div>
            )}

            <div className="grid gap-3">
              {newNeedRatingPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-violet-600">
                    <span>{translate("club.messages.newPlayersToRate")}</span>
                    <span>{formatNumber(uiLocale, newNeedRatingPlayers.length)}</span>
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
                            {translate("club.messages.new")}</span>
                        </span>
                        {player.aka && (
                          <span className="block truncate text-[11px] font-semibold text-violet-700">
                            {translate("club.people.aka", { name: player.aka })}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-violet-700">
                        {translate("club.messages.rate")}</span>
                    </button>
                  ))}
                </div>
              )}

              {regularNeedRatingPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-violet-600">
                    <span>{translate("club.messages.needsYourRating")}</span>
                    <span>{formatNumber(uiLocale, regularNeedRatingPlayers.length)}</span>
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
                            {translate("club.people.aka", { name: player.aka })}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">
                        {translate("club.messages.rate")}</span>
                    </button>
                  ))}
                </div>
              )}

              {skippedPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-amber-600">
                    <span>{translate("club.messages.skippedForLater")}</span>
                    <span>{formatNumber(uiLocale, skippedPlayers.length)}</span>
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
                            {translate("club.people.aka", { name: player.aka })}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">
                        {translate("club.messages.rateNow")}</span>
                    </button>
                  ))}
                </div>
              )}

              {ratedPlayers.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <span>{translate("club.messages.yourRatedPlayers")}</span>
                    <span>{formatNumber(uiLocale, ratedPlayers.length)}</span>
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
                            {summary?.averageSkill
                              ? translate("club.ratings.yourAndClub", {
                                  your: typeof myRating?.skill === "number" ? formatNumber(uiLocale, myRating.skill, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—",
                                  club: formatNumber(uiLocale, summary.averageSkill, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                                })
                              : translate("club.ratings.yourOnly", {
                                  your: typeof myRating?.skill === "number" ? formatNumber(uiLocale, myRating.skill, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—",
                                })}
                          </span>
                        </span>
                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">
                          {translate("club.messages.adjust")}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {players.length === 0 && (
                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
                  {translate("club.messages.noPlayersYet")}</div>
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
            setPendingRatingPreset(null);
            setRatingPlayerId(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl p-0">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Star className="h-5 w-5 text-violet-600" />
              {ratingDialogPlayer
                ? translate("club.headings.rate", { name: ratingDialogPlayer.name })
                : translate("club.headings.ratePlayer")}
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
                ? translate("club.ratings.mode.skipped")
                : typeof myRating?.skill === "number"
                  ? translate("club.ratings.mode.adjusting")
                  : ratingDialogPlayer.isNew
                    ? translate("club.ratings.mode.newPlayer")
                    : translate("club.ratings.mode.needsRating");
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
                        {translate("club.ratings.playerColumn")}</div>
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
                        {translate("club.ratings.remainingAfterThis", { count: remainingAfterThis })}</div>
                    )}
                  </div>

                  {(() => {
                    const computedOverall = calculateOverall(ratingProfile);
                    return (
                      <>
                        <div className="grid gap-2 rounded-2xl border border-primary/10 bg-primary/5 p-3">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <Label className="text-xs font-black uppercase tracking-wide text-primary">
                                {translate("club.labels.overallSkill")}</Label>
                              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                {translate("club.ratings.styleSliderHelp")}</div>
                            </div>
                            <div className="text-3xl font-black tabular-nums text-[#102A43]">
                              {formatNumber(uiLocale, computedOverall, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
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
                            <span>{translate("club.ratings.scale.weakRegular")}</span>
                            <span className="text-center">{translate("club.ratings.scale.average")}</span>
                            <span className="text-right">{translate("club.ratings.scale.strongest")}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 rounded-2xl border border-violet-100 bg-violet-50 p-3">
                          <div>
                            <Label className="text-xs font-black uppercase tracking-wide text-violet-700">
                              {translate("roster.labels.whatStandsOut")}
                            </Label>
                            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-700/75">
                              {translate("roster.playerPresets.help")}
                            </div>
                          </div>
                          <PlayerPresetPicker
                            value={ratingPlayerStyle}
                            onChange={(nextStyle) => {
                              const match = inferPlayerStyleMatch({
                                ...ratingProfile,
                                skill: calculateOverall(ratingProfile),
                              });
                              if (!match.isPresetLike) {
                                setPendingRatingPreset(nextStyle);
                                return;
                              }
                              commitRatingPreset(nextStyle);
                            }}
                            tone="violet"
                            compact
                            testIdPrefix={`club-rating-preset-${ratingDialogPlayer.id}`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setRatingGoalkeeper((current) => !current)}
                          className={`flex h-10 items-center justify-between rounded-2xl border px-3 text-left text-xs font-black transition-colors ${ratingGoalkeeper ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-600"}`}
                        >
                          <span>{translate("club.messages.gk")}</span>
                          <span className="text-[10px] font-bold">{ratingGoalkeeper ? translate("club.messages.canPlayGoalkeeper") : translate("club.messages.optionalRoleFlag")}</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          {RATING_STAT_FIELDS.map(({ key, labelKey, shortKey }) => (
                            <ClubRatingStatControl
                              key={key}
                              label={translate(labelKey)}
                              short={translate(shortKey)}
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
                          {translate("club.ratings.styleAndOverallHelp")}</div>

                        <div className="rounded-2xl bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                            {translate("club.messages.clubAverage")}</div>
                          <div className="mt-1 text-sm font-black text-[#102A43]">
                            {canRevealAverage && summary?.averageSkill
                              ? summary.gkYesCount
                                ? translate("club.ratings.averageSummaryWithGoalkeepers", {
                                    average: formatNumber(uiLocale, summary.averageSkill, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                                    count: summary.ratingCount,
                                    goalkeepers: summary.gkYesCount,
                                  })
                                : translate("club.ratings.averageSummary", {
                                    average: formatNumber(uiLocale, summary.averageSkill, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                                    count: summary.ratingCount,
                                  })
                              : translate("club.messages.hiddenUntilYouRateThisPlayer")}
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
                      {nextPlayerAfterThis ? translate("club.actions.skipNext") : translate("club.actions.skipForLater")}
                    </Button>
                    <Button
                      type="button"
                      className="h-11 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]"
                      disabled={ratingSaving}
                      onClick={saveClubRating}
                    >
                      {ratingSaving
                        ? translate("club.actions.saving")
                        : nextPlayerAfterThis
                          ? translate("club.actions.saveNext")
                          : translate("club.actions.saveFinish")}
                    </Button>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRatingPreset !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRatingPreset(null);
        }}
      >
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("roster.headings.replaceDetailedProfile")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRatingPreset !== null
                ? translate("roster.messages.presetReplaceConfirm", {
                    preset: getPlayerProfilePresetOption(pendingRatingPreset).label,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("roster.actions.keepCustomProfile")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRatingPreset === null) return;
                const nextPreset = pendingRatingPreset;
                setPendingRatingPreset(null);
                commitRatingPreset(nextPreset);
              }}
            >
              {translate("roster.actions.replaceProfile")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>

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
                  {translate("club.headings.equipmentBoard")}</DialogTitle>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500 lg:text-sm">
                  {equipmentCanEdit
                    ? translate("club.equipment.dragHelp")
                    : translate("club.equipment.viewOnly")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-2xl border-slate-200 bg-white px-3 text-xs font-black text-[#102A43]"
                  onClick={() => setEquipmentInventoryOpen(true)}
                >
                  {translate("club.actions.viewClubInventory")}</Button>
                {equipmentCanEdit && (
                  <Button
                    type="button"
                    className="h-9 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]"
                    onClick={openNewEquipmentKit}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {translate("club.actions.addBag")}</Button>
                )}
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
              <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-wide text-slate-400 min-[340px]:grid-cols-[5.75rem_minmax(0,1fr)] lg:grid-cols-[11rem_minmax(0,1fr)] lg:text-xs">
                <div className="px-3 py-2.5">{translate("club.messages.holder")}</div>
                <div className="border-l border-slate-200 px-3 py-2.5">
                  {translate("club.equipment.bagsHeading")}</div>
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
                    className={`grid grid-cols-[4.75rem_minmax(0,1fr)] transition min-[340px]:grid-cols-[5.75rem_minmax(0,1fr)] lg:grid-cols-[11rem_minmax(0,1fr)] ${index === 0 ? "" : "border-t border-slate-100"} ${highlighted ? "bg-emerald-50" : "bg-white"}`}
                  >
                    <div className="flex min-h-[3.65rem] items-center px-2 py-2 min-[340px]:px-2.5 lg:px-4">
                      <div className="min-w-0">
                        <h3 className="whitespace-normal break-words text-[11px] font-black leading-[1.15] text-[#102A43] min-[340px]:text-[12px] lg:text-sm">
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
                          {highlighted ? translate("club.messages.dropHere") : ""}
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
                                role={equipmentCanEdit ? "button" : undefined}
                                tabIndex={equipmentCanEdit ? 0 : -1}
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
                                      {equipmentCanEdit && (
                                        <span
                                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                                          aria-hidden="true"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                aria-label={translate("club.accessibility.showContentsOf", { name: kit.name })}
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
                      {translate("club.messages.insideBag")}</div>
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
                    {translate("common.close")}</Button>
                </div>

                {equipmentItemsForKit(contentPeekKit).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {equipmentItemsForKit(contentPeekKit).map((item, index) => (
                      <span
                        key={`${contentPeekKit.id}-content-${item.key}-${index}`}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
                      >
                        {equipmentItemDisplayLabel(item)} × {formatNumber(uiLocale, item.quantity)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                    {translate("club.messages.nothingListedYet")}</div>
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
              {translate("club.headings.clubInventory")}</DialogTitle>
            <p className="text-[11px] font-semibold text-slate-500">
              {translate("club.equipment.inventoryBagCount", { count: equipmentKits.length })}
            </p>
          </DialogHeader>

          <div className="max-h-[68dvh] space-y-3 overflow-y-auto p-3">
            {equipmentKits.length > 0 && (
              <section>
                <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {translate("club.equipment.bagsHeading")}</div>
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
                          {EQUIPMENT_COLOR_LABEL_KEYS[kit.color || DEFAULT_EQUIPMENT_COLOR]
                            ? translate(EQUIPMENT_COLOR_LABEL_KEYS[kit.color || DEFAULT_EQUIPMENT_COLOR])
                            : translate("club.messages.customColor")} {translate("club.messages.bag")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                {translate("club.messages.equipment")}</div>
              {equipmentInventoryTotals.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <span>{translate("club.messages.item")}</span>
                    <span className="text-right">{translate("club.messages.total")}</span>
                  </div>
                  {equipmentInventoryTotals.map((item, index) => (
                    <div
                      key={`inventory-row-${item.key}`}
                      className={`grid grid-cols-[minmax(0,1fr)_4.5rem] items-center px-3 py-2.5 ${index === 0 ? "" : "border-t border-slate-100"} ${index % 2 === 1 ? "bg-slate-50/55" : "bg-white"}`}
                    >
                      <span className="truncate text-sm font-bold text-[#102A43]">{item.label}</span>
                      <span className="text-right text-base font-black tabular-nums text-[#102A43]">{formatNumber(uiLocale, item.quantity)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm font-semibold text-slate-400">
                  {equipmentKits.length === 0 ? translate("club.messages.noEquipmentHasBeenAddedYet") : translate("club.messages.noEquipmentContentsAddedYet")}
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
            <DialogTitle className="text-base font-black text-[#102A43]">{translate("club.headings.addItem")}</DialogTitle>
            <p className="text-[11px] font-semibold text-slate-500">
              {translate("club.equipment.choosePresetHelp")}</p>
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
                    <span className={`text-sm font-bold ${selected ? "text-blue-700" : "text-[#102A43]"}`}>{translate(preset.labelKey)}</span>
                    <Plus className={`h-4 w-4 shrink-0 ${selected ? "text-blue-600" : "text-slate-300"}`} />
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{translate("club.messages.customItem")}</div>
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
                  placeholder={translate("club.fields.customItemExample")}
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
                  {translate("common.add")}</Button>
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
              {editingKitId ? translate("club.headings.editBag") : translate("club.headings.newBag")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2.5 p-3 pt-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="grid min-w-0 gap-1.5">
                <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {translate("club.labels.bagName")}</Label>
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
                  placeholder={translate("club.fields.bagNameExample")}
                  className="h-10 min-w-0 rounded-2xl border-slate-200 text-sm font-semibold"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {translate("club.labels.bagColor")}</Label>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 min-w-[5.3rem] rounded-2xl border-slate-200 px-2.5 text-[11px] font-black text-slate-600"
                    onClick={() => setColorPickerOpen((open) => !open)}
                    aria-label={translate("club.accessibility.chooseBagColor")}
                  >
                    <span
                      className="mr-2 h-5 w-5 rounded-full border border-slate-300 shadow-inner"
                      style={{ backgroundColor: kitColor }}
                    />
                    {EQUIPMENT_COLOR_LABEL_KEYS[kitColor]
                      ? translate(EQUIPMENT_COLOR_LABEL_KEYS[kitColor])
                      : translate("club.actions.choose")}
                  </Button>
                  {colorPickerOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-52 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                          {translate("club.messages.bagColor")}</div>
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-50"
                          onClick={() => setColorPickerOpen(false)}
                        >
                          {translate("common.done")}</button>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {EQUIPMENT_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={translate("club.accessibility.chooseBagColor")}
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
                    {translate("club.labels.bagContents")}</Label>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    {translate("club.equipment.currentBagItemsHelp")}</div>
                </div>
                {kitItems.length > 0 && (
                  <div className="text-[10px] font-black text-slate-400">
                    {translate("club.equipment.itemTotal", { count: kitItems.reduce((sum, item) => sum + item.quantity, 0) })}</div>
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
                              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{translate("club.messages.custom")}</div>
                            )}
                            {isBall && (
                              <button
                                type="button"
                                className={`mt-0.5 text-left text-[10px] font-bold ${hasBallDetails ? "text-blue-600" : "text-slate-400"}`}
                                onClick={() => setBallDetailsIndex(ballDetailsOpen ? null : index)}
                              >
                                {hasBallDetails
                                  ? item.size?.trim()
                                    ? translate("club.equipment.ballDetailsWithSize", {
                                        brand: item.brand?.trim() || translate("club.equipment.ball"),
                                        size: item.size.trim(),
                                      })
                                    : item.brand?.trim() || translate("club.equipment.ball")
                                  : translate("club.actions.addBrandSize")}
                              </button>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-500"
                              onClick={() => updateEquipmentItemQuantity(index, -1)}
                              aria-label={translate("club.accessibility.decrease", { label: item.label })}
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
                              aria-label={translate("club.accessibility.quantity", { label: item.label })}
                            />
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-500"
                              onClick={() => updateEquipmentItemQuantity(index, 1)}
                              aria-label={translate("club.accessibility.increase", { label: item.label })}
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
                              aria-label={translate("club.accessibility.remove", { label: item.label })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {ballDetailsOpen && (
                          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2">
                            <div className="grid gap-1">
                              <Label className="text-[9px] font-black uppercase tracking-wide text-slate-400">{translate("club.labels.brand")}</Label>
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
                                placeholder={translate("club.fields.brandExample")}
                                className="h-8 rounded-xl border-slate-200 bg-white px-2 text-xs font-semibold"
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-[9px] font-black uppercase tracking-wide text-slate-400">{translate("club.labels.size")}</Label>
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
                                placeholder={translate("club.fields.quantityExample")}
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
                  {translate("club.equipment.emptyBag")}</div>
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
                {translate("club.actions.addItem")}</Button>
            </div>


            {editingKitMeta && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-semibold leading-snug text-slate-500">
                <div>
                  {translate("club.messages.createdBy")}{" "}
                  {equipmentActorLabel(
                    editingKitMeta.createdByName,
                    editingKitMeta.createdByEmail,
                    equipmentHolderNamesByEmail,
                  )}{" "}
                  · {formatEquipmentTimestamp(editingKitMeta.createdAt)}
                </div>
                <div>
                  {translate("club.messages.lastUpdatedBy")}{" "}
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
                  {translate("club.equipment.deleteSharedWarning")}</div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-red-700">
                  <span>{translate("club.messages.slideToUnlockDelete")}</span>
                  <span>
                    {deleteBagSlide >= 95
                      ? translate("club.messages.ready")
                      : formatPercent(uiLocale, deleteBagSlide / 100, { maximumFractionDigits: 0 })}
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
                  aria-label={translate("club.accessibility.slideToUnlockDeleteBag")}
                />
              </div>
            )}

            {(equipmentSaving || equipmentError) && (
              <div className={`px-1 text-center text-[10px] font-bold ${equipmentError ? "text-red-500" : "text-slate-400"}`}>
                {equipmentError ? translate("club.equipment.saveFailed") : translate("club.messages.saving")}
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
                {deleteConfirmOpen && deleteBagSlide >= 95 ? translate("club.actions.deleteNow") : translate("club.actions.deleteBag")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
