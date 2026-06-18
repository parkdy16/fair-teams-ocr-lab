import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Pencil,
  Plus,
  Star,
  StickyNote,
  Trash2,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FirebaseSharedRosterAuthCard } from "@/components/FirebaseSharedRosterAuthCard";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
import { listenToSharedRosterUser, signOutOfSharedRosters, type SharedRosterUser } from "@/lib/sharedRosterService";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteFirebaseEquipmentBag,
  listenToFirebaseEquipmentBags,
  saveFirebaseEquipmentBag,
  type FirebaseEquipmentBag,
} from "@/lib/equipmentService";
import type { PairingRule } from "@/lib/types";
import type { RoomPlayer } from "@/lib/localRoster";
import {
  addClubNote,
  listenToClubNotes,
  listenToClubRatingSummaries,
  listenToMyClubRatings,
  saveMyClubPlayerRating,
  skipMyClubPlayerRating,
  type ClubMyRating,
  type ClubNote,
  type ClubRatingSummary,
} from "@/lib/clubCollaborationService";

type ClubTabProps = {
  isActive?: boolean;
  activeRosterName: string;
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
};

type EquipmentHolder = {
  id: string;
  label: string;
};

type ClubEquipmentKit = FirebaseEquipmentBag;

const EQUIPMENT_PREVIEW_STORAGE_KEY = "fairteams.clubEquipment.preview.v1";

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
    contents: ["2 balls", "Pump", "Needles"],
    note: "Check air before Saturday.",
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
    contents: ["10 dark bibs", "10 light bibs"],
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
    contents: ["12 cones"],
    note: "Someone took them after last game?",
    createdAt: Date.now(),
    createdByName: "Preview",
    updatedAt: Date.now(),
    updatedByName: "Preview",
  },
];

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
    const authEmail = window.localStorage.getItem("fairteams.firebaseEmail") || window.localStorage.getItem("fairteams.googleEmail") || "";
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

function cleanEquipmentHolderLabel(value: string, namesByEmail: Record<string, string> = {}) {
  const trimmed = value.trim();
  if (!trimmed) return "Organizer";
  if (isLikelyCurrentUserLabel(trimmed)) return "You";

  const normalizedEmail = trimmed.toLowerCase();
  const savedName = normalizedEmail.includes("@") ? namesByEmail[normalizedEmail] : undefined;
  if (savedName?.trim()) return titleCaseWords(savedName.trim());

  const emailName = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  const readableName = titleCaseWords(emailName.replace(/[._-]+/g, " "));
  return looksLikeReadableName(readableName) ? readableName : "Organizer";
}

function equipmentActorLabel(name?: string, email?: string, namesByEmail: Record<string, string> = {}) {
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
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function buildSharedEquipmentHolders(labels: string[], equipmentKits: ClubEquipmentKit[], namesByEmail: Record<string, string> = {}) {
  const seen = new Set(["storage"]);
  const normalizedLabels = labels
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .filter((label, index, all) => all.indexOf(label) === index);

  const currentUserLabels = normalizedLabels.filter(isLikelyCurrentUserLabel);
  const otherLabels = normalizedLabels.filter((label) => !isLikelyCurrentUserLabel(label));

  const holders: EquipmentHolder[] = [];
  const addHolder = (id: string, label: string) => {
    const holderId = normalizeEquipmentHolderId(id);
    if (!holderId || seen.has(holderId)) return;
    seen.add(holderId);
    holders.push({ id: holderId, label });
  };

  currentUserLabels.forEach((label) => addHolder(makeEquipmentHolderId(label), "You"));
  otherLabels.slice(0, 8).forEach((label, index) => {
    const cleaned = cleanEquipmentHolderLabel(label, namesByEmail);
    addHolder(makeEquipmentHolderId(label), cleaned === "Organizer" ? `Organizer ${index + 1}` : cleaned);
  });

  equipmentKits
    .map((kit) => normalizeEquipmentHolderId(kit.holderId))
    .filter((holderId) => holderId && !seen.has(holderId))
    .forEach((holderId) => addHolder(holderId, cleanEquipmentHolderLabel(holderId, namesByEmail)));

  if (!holders.length) holders.push({ id: "organizer", label: "Organizer" });

  return [
    { id: "storage", label: "Club storage" },
    ...holders,
  ];
}

function makeEquipmentHolderId(value: string) {
  return value.trim().toLowerCase() || makeId("holder");
}

function makeId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function parseEquipmentKits(raw: string | null, fallback: ClubEquipmentKit[] = DEFAULT_EQUIPMENT_KITS): ClubEquipmentKit[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter((kit): kit is ClubEquipmentKit => Boolean(kit?.id && kit?.name))
      .map((kit) => ({
        id: String(kit.id),
        name: String(kit.name),
        holderId: typeof kit.holderId === "string" && kit.holderId.trim() ? normalizeEquipmentHolderId(String(kit.holderId)) : "storage",
        color: typeof kit.color === "string" && kit.color.trim() ? kit.color : DEFAULT_EQUIPMENT_COLOR,
        contents: Array.isArray(kit.contents)
          ? kit.contents.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
          : [],
        note: kit.note ? String(kit.note) : undefined,
        createdAt: Number(kit.createdAt) || undefined,
        createdByEmail: kit.createdByEmail ? String(kit.createdByEmail) : undefined,
        createdByName: kit.createdByName ? String(kit.createdByName) : undefined,
        updatedAt: Number(kit.updatedAt) || Date.now(),
        updatedByEmail: kit.updatedByEmail ? String(kit.updatedByEmail) : undefined,
        updatedByName: kit.updatedByName ? String(kit.updatedByName) : undefined,
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
    return parseEquipmentKits(window.localStorage.getItem(equipmentCacheKey(scopeId)), []);
  } catch {
    return [];
  }
}

function writeCachedEquipmentKits(scopeId: string, kits: ClubEquipmentKit[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(equipmentCacheKey(scopeId), JSON.stringify(kits));
  } catch {
    // Best-effort cache only. Realtime Firestore remains the source of truth.
  }
}


function DuffleBagIcon({ color, className = "h-9 w-12" }: { color: string; className?: string }) {
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
      <path d="M19 16v27M45 16v27" stroke="rgba(16,42,67,0.25)" strokeWidth="4" />
      <circle cx="20" cy="32" r="2" fill="rgba(255,255,255,0.7)" />
      <circle cx="44" cy="32" r="2" fill="rgba(255,255,255,0.7)" />
    </svg>
  );
}


function AntiqueBallIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="18" fill="currentColor" opacity="0.12" />
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M24 7.5c-4.7 4-7 9.5-7 16.5s2.3 12.5 7 16.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 7.5c4.7 4 7 9.5 7 16.5s-2.3 12.5-7 16.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10 19c4.2 1.8 8.9 2.7 14 2.7s9.8-.9 14-2.7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 29c4.2-1.8 8.9-2.7 14-2.7s9.8.9 14 2.7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function getClubGreetingName(user: SharedRosterUser | null) {
  const raw = user?.displayName?.trim() || user?.email?.split("@")[0]?.trim() || "there";
  if (!raw) return "there";
  return raw
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ClubTab({
  isActive = true,
  activeRosterName,
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
}: ClubTabProps) {
  const [clubRatingSummaries, setClubRatingSummaries] = useState<ClubRatingSummary[]>([]);
  const [myClubRatings, setMyClubRatings] = useState<ClubMyRating[]>([]);
  const [clubRatingError, setClubRatingError] = useState("");
  const [clubRatingLoading, setClubRatingLoading] = useState(false);
  const [ratingPlayerId, setRatingPlayerId] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState(5);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingDialogError, setRatingDialogError] = useState("");
  const [ratingSeedSaving, setRatingSeedSaving] = useState(false);
  const [ratingSeedMessage, setRatingSeedMessage] = useState("");
  const [clubNotes, setClubNotes] = useState<ClubNote[]>([]);
  const [clubNotesError, setClubNotesError] = useState("");
  const [clubNoteDraft, setClubNoteDraft] = useState("");
  const [clubNoteSaving, setClubNoteSaving] = useState(false);
  const [clubNotesOpen, setClubNotesOpen] = useState(false);
  const [equipmentKits, setEquipmentKits] = useState<ClubEquipmentKit[]>(() => {
    if (typeof window === "undefined") return DEFAULT_EQUIPMENT_KITS;
    return parseEquipmentKits(window.localStorage.getItem(EQUIPMENT_PREVIEW_STORAGE_KEY));
  });
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentError, setEquipmentError] = useState("");
  const [equipmentLastSyncedAt, setEquipmentLastSyncedAt] = useState<number | null>(null);
  const [equipmentBoardOpen, setEquipmentBoardOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [equipmentEditorReturnToBoard, setEquipmentEditorReturnToBoard] = useState(false);
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [kitName, setKitName] = useState("");
  const [kitHolderId, setKitHolderId] = useState("storage");
  const [kitColor, setKitColor] = useState(DEFAULT_EQUIPMENT_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [deleteBagSlide, setDeleteBagSlide] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [equipmentMoveNotice, setEquipmentMoveNotice] = useState("");
  const [contentPeekKitId, setContentPeekKitId] = useState<string | null>(null);
  const [kitContents, setKitContents] = useState("");
  const [kitNote, setKitNote] = useState("");
  const [draggingKitId, setDraggingKitId] = useState<string | null>(null);
  const [dragOverHolderId, setDragOverHolderId] = useState<string | null>(null);
  const equipmentDragTimerRef = useRef<number | null>(null);
  const activeEquipmentDragRef = useRef<string | null>(null);
  const activeEquipmentDropHolderRef = useRef<string | null>(null);
  const suppressEquipmentClickRef = useRef(false);
  const equipmentBackStateRef = useRef({
    colorPickerOpen: false,
    contentPeekKitId: null as string | null,
    equipmentBoardOpen: false,
    equipmentDialogOpen: false,
    ratingPlayerId: null as string | null,
    accountDialogOpen: false,
  });
  const [authReady, setAuthReady] = useState(false);
  const [clubUser, setClubUser] = useState<SharedRosterUser | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);

  useEffect(() => listenToSharedRosterUser((nextUser) => {
    setClubUser(nextUser);
    setAuthReady(true);
  }), []);

  const handleClubLogout = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      await signOutOfSharedRosters();
    } finally {
      setAccountBusy(false);
    }
  };

  const equipmentRealtimeEnabled = Boolean(equipmentGroupId);
  const equipmentCanSyncOnline = Boolean(equipmentGroupId && clubUser?.email);
  const equipmentWaitingForAccount = Boolean(equipmentGroupId && !authReady);
  const equipmentNeedsSignIn = Boolean(equipmentGroupId && authReady && !clubUser?.email);
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
    if (!isSharedRoster && !equipmentRealtimeEnabled) return LOCAL_EQUIPMENT_HOLDERS;
    return buildSharedEquipmentHolders(equipmentHolderLabels, equipmentKits, equipmentHolderNamesByEmail);
  }, [equipmentHolderLabels, equipmentHolderNamesByEmail, equipmentKits, equipmentRealtimeEnabled, isSharedRoster]);
  const cleanPairingRuleCount = pairingRules.filter((rule) => rule.playerAId && rule.playerBId).length;

  useEffect(() => {
    if (typeof window === "undefined" || equipmentRealtimeEnabled || isSharedRoster) return;
    window.localStorage.setItem(EQUIPMENT_PREVIEW_STORAGE_KEY, JSON.stringify(equipmentKits));
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
        setEquipmentKits(parseEquipmentKits(window.localStorage.getItem(EQUIPMENT_PREVIEW_STORAGE_KEY)));
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
          setEquipmentError(error.message || "Could not load shared equipment board.");
        },
      );

      return () => unsubscribe();
    } catch (error) {
      setEquipmentLoading(false);
      setEquipmentError(error instanceof Error ? error.message : "Could not connect equipment board.");
    }
  }, [authReady, clubUser?.email, equipmentGroupId, isSharedRoster]);

  const clubRatingsEnabled = Boolean(isSharedRoster && sharedRosterId && clubUser?.email);

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
      setClubRatingError(error instanceof Error ? error.message : "Could not connect Club ratings.");
      setClubRatingLoading(false);
      return;
    }
  }, [clubRatingsEnabled, sharedRosterId]);

  useEffect(() => {
    if (!clubRatingsEnabled || !sharedRosterId) {
      setClubNotes([]);
      setClubNotesError("");
      return;
    }

    setClubNotesError("");
    try {
      return listenToClubNotes(
        sharedRosterId,
        setClubNotes,
        (error) => setClubNotesError(error.message || "Could not load Club notes."),
      );
    } catch (error) {
      setClubNotesError(error instanceof Error ? error.message : "Could not connect Club notes.");
      return;
    }
  }, [clubRatingsEnabled, sharedRosterId]);

  const myRatingByPlayerId = useMemo(() => {
    return new Map(myClubRatings.map((rating) => [rating.playerId, rating]));
  }, [myClubRatings]);
  const ratingSummaryByPlayerId = useMemo(() => {
    return new Map(clubRatingSummaries.map((summary) => [summary.playerId, summary]));
  }, [clubRatingSummaries]);
  const ratedPlayers = useMemo(() => players.filter((player) => {
    const rating = myRatingByPlayerId.get(player.id);
    return Boolean(rating && !rating.skipped && typeof rating.skill === "number");
  }), [myRatingByPlayerId, players]);
  const skippedPlayers = useMemo(() => players.filter((player) => myRatingByPlayerId.get(player.id)?.skipped), [myRatingByPlayerId, players]);
  const needRatingPlayers = useMemo(() => players.filter((player) => !myRatingByPlayerId.has(player.id)), [myRatingByPlayerId, players]);
  const ratingDialogPlayer = useMemo(() => players.find((player) => player.id === ratingPlayerId) || null, [players, ratingPlayerId]);
  const legacySkillSeedPlayers = useMemo(() => needRatingPlayers.filter((player) => {
    const skill = Number(player.skill);
    return Number.isFinite(skill) && skill >= 1 && skill <= 10;
  }), [needRatingPlayers]);
  const nextRatingPlayer = needRatingPlayers[0] || skippedPlayers[0] || ratedPlayers[0] || players[0] || null;
  const clubRatedCount = ratedPlayers.length;
  const clubSkippedCount = skippedPlayers.length;
  const clubNeedRatingCount = needRatingPlayers.length;
  const clubRatingProgressText = clubRatingsEnabled
    ? `${clubRatedCount} of ${players.length} rated${clubSkippedCount ? ` · ${clubSkippedCount} skipped` : ""}`
    : isSharedRoster
      ? "Sign in to rate this shared roster."
      : "Available when this roster is shared.";
  const previewClubNotes = clubNotes.slice(0, 3);
  const canAddClubNote = clubRatingsEnabled && clubNoteDraft.trim().length > 0 && !clubNoteSaving;

  const openRatingForPlayer = (player: RoomPlayer | null) => {
    if (!player) return;
    const existing = myRatingByPlayerId.get(player.id);
    setRatingDialogError("");
    setRatingDraft(typeof existing?.skill === "number" ? existing.skill : 5);
    setRatingPlayerId(player.id);
  };

  const findNextRatingPlayerAfter = (currentPlayerId: string | null) => {
    const nextUnrated = needRatingPlayers.find((player) => player.id !== currentPlayerId);
    if (nextUnrated) return nextUnrated;
    const nextSkipped = skippedPlayers.find((player) => player.id !== currentPlayerId);
    if (nextSkipped) return nextSkipped;
    return null;
  };

  const seedClubRatingsFromRosterSkills = async () => {
    if (!sharedRosterId || ratingSeedSaving || legacySkillSeedPlayers.length === 0) return;
    setRatingSeedSaving(true);
    setClubRatingError("");
    setRatingSeedMessage("");
    try {
      let savedCount = 0;
      for (const player of legacySkillSeedPlayers) {
        await saveMyClubPlayerRating(sharedRosterId, player.id, player.skill);
        savedCount += 1;
      }
      setRatingSeedMessage(`Imported ${savedCount} current roster rating${savedCount === 1 ? "" : "s"} as your Club ratings.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import current roster ratings.";
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
      await saveMyClubPlayerRating(sharedRosterId, savedPlayerId, ratingDraft);
      const nextPlayer = findNextRatingPlayerAfter(savedPlayerId);
      if (nextPlayer) {
        openRatingForPlayer(nextPlayer);
      } else {
        setRatingPlayerId(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your rating.";
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
      await skipMyClubPlayerRating(sharedRosterId, skippedPlayerId);
      const nextPlayer = findNextRatingPlayerAfter(skippedPlayerId);
      if (nextPlayer) {
        openRatingForPlayer(nextPlayer);
      } else {
        setRatingPlayerId(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not skip this player.";
      setRatingDialogError(message);
      setClubRatingError(message);
    } finally {
      setRatingSaving(false);
    }
  };

  const addSharedClubNote = async () => {
    if (!sharedRosterId || !canAddClubNote) return;
    setClubNoteSaving(true);
    setClubNotesError("");
    try {
      await addClubNote(sharedRosterId, clubNoteDraft);
      setClubNoteDraft("");
    } catch (error) {
      setClubNotesError(error instanceof Error ? error.message : "Could not add Club note.");
    } finally {
      setClubNoteSaving(false);
    }
  };

  const contentPeekKit = useMemo(() => equipmentKits.find((kit) => kit.id === contentPeekKitId) || null, [contentPeekKitId, equipmentKits]);
  const editingKitMeta = useMemo(() => editingKitId ? equipmentKits.find((kit) => kit.id === editingKitId) || null : null, [editingKitId, equipmentKits]);
  const sharedPersonNames = useMemo(() => {
    const cleaned = equipmentHolderLabels
      .map((label) => cleanEquipmentHolderLabel(label, equipmentHolderNamesByEmail))
      .map((label) => label === "You" ? "Me" : label)
      .filter(Boolean);
    const unique = cleaned.filter((label, index, all) => all.indexOf(label) === index);
    if (unique.length) return unique;
    if (!isSharedRoster) return [];
    return ["Me", ...Array.from({ length: Math.max(0, sharedPeopleCount - 1) }, (_, index) => `Person ${index + 2}`)];
  }, [equipmentHolderLabels, equipmentHolderNamesByEmail, isSharedRoster, sharedPeopleCount]);
  const equipmentHolderLabelById = useMemo(() => {
    return equipmentHolders.reduce<Record<string, string>>((labels, holder) => {
      labels[holder.id] = holder.label;
      return labels;
    }, {});
  }, [equipmentHolders]);
  const equipmentPreviewKits = useMemo(() => equipmentKits.slice(0, 3), [equipmentKits]);
  const equipmentDashboardHolders = useMemo(() => {
    const holdersWithBags = equipmentHolders.filter((holder) => equipmentKits.some((kit) => normalizeEquipmentHolderId(kit.holderId) === holder.id));
    const holdersToShow = holdersWithBags.length ? holdersWithBags : equipmentHolders.slice(0, Math.min(3, equipmentHolders.length));
    return holdersToShow.slice(0, 4);
  }, [equipmentHolders, equipmentKits]);
  const clubGreetingName = getClubGreetingName(clubUser);
  const loginGateOpen = Boolean(isActive && authReady && !clubUser);
  const accountModalOpen = loginGateOpen || accountDialogOpen;
  const resetEquipmentForm = () => {
    setEditingKitId(null);
    setKitName("");
    setKitHolderId("storage");
    setKitColor(DEFAULT_EQUIPMENT_COLOR);
    setColorPickerOpen(false);
    setDeleteBagSlide(0);
    setDeleteConfirmOpen(false);
    setKitContents("");
    setKitNote("");
  };

  const openEquipmentEditor = (prepareForm: () => void) => {
    const openedFromBoard = equipmentBoardOpen;
    setEquipmentEditorReturnToBoard(openedFromBoard);

    const openEditor = () => {
      prepareForm();
      setEquipmentDialogOpen(true);
    };

    if (openedFromBoard) {
      setEquipmentBoardOpen(false);
      window.setTimeout(openEditor, 90);
      return;
    }

    openEditor();
  };

  const closeEquipmentEditor = (returnToBoard = true) => {
    blurActiveField();
    setColorPickerOpen(false);
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
      resetEquipmentForm();
      setKitHolderId("storage");
    });
  };

  const openEditEquipmentKit = (kit: ClubEquipmentKit) => {
    openEquipmentEditor(() => {
      setEditingKitId(kit.id);
      setKitName(kit.name);
      setKitHolderId(normalizeEquipmentHolderId(kit.holderId));
      setKitColor(kit.color || DEFAULT_EQUIPMENT_COLOR);
      setDeleteBagSlide(0);
      setDeleteConfirmOpen(false);
      setKitContents(kit.contents.join(", "));
      setKitNote(kit.note || "");
    });
  };

  const saveEquipmentKit = async () => {
    const trimmedName = kitName.trim();
    if (!trimmedName) return;

    const now = Date.now();
    const existingKit = editingKitId ? equipmentKits.find((kit) => kit.id === editingKitId) : null;
    let actorEmail = clubUser?.email || undefined;
    let actorName = actorEmail || "Organizer";
    try {
      const firebaseUser = getFairTeamsAuth().currentUser;
      actorEmail = firebaseUser?.email || actorEmail;
      actorName = firebaseUser?.displayName || actorEmail || "Organizer";
    } catch {
      // Local preview can run without Firebase auth ready.
    }
    const nextKit: ClubEquipmentKit = {
      id: editingKitId || makeId("kit"),
      name: trimmedName,
      holderId: normalizeEquipmentHolderId(kitHolderId),
      color: kitColor,
      contents: kitContents
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20),
      note: kitNote.trim() || undefined,
      createdAt: existingKit?.createdAt || (!editingKitId ? now : undefined),
      createdByEmail: existingKit?.createdByEmail || (!editingKitId ? actorEmail : undefined),
      createdByName: existingKit?.createdByName || (!editingKitId ? actorName : undefined),
      updatedAt: now,
      updatedByEmail: actorEmail,
      updatedByName: actorName,
    };

    const previousKits = equipmentKits;
    const nextKits = editingKitId
      ? previousKits.map((kit) => kit.id === editingKitId ? nextKit : kit)
      : [nextKit, ...previousKits];

    try {
      setEquipmentSaving(true);
      setEquipmentError("");
      setEquipmentKits(nextKits);
      if (equipmentGroupId) {
        writeCachedEquipmentKits(equipmentGroupId, nextKits);
        await saveFirebaseEquipmentBag(equipmentGroupId, nextKit);
      }
      closeEquipmentEditor(true);
    } catch (error) {
      setEquipmentKits(previousKits);
      if (equipmentGroupId) writeCachedEquipmentKits(equipmentGroupId, previousKits);
      setEquipmentError(error instanceof Error ? error.message : "Could not save equipment bag.");
    } finally {
      setEquipmentSaving(false);
    }
  };

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
    const nextKits = previousKits.map((kit) => kit.id === kitId ? nextKit : kit);
    const nextHolderLabel = equipmentHolderLabelById[normalizeEquipmentHolderId(holderId)] || "new holder";
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
      if (equipmentGroupId) writeCachedEquipmentKits(equipmentGroupId, previousKits);
      setEquipmentError(error instanceof Error ? error.message : "Could not move equipment bag.");
    }
  };

  const clearEquipmentDragTimer = () => {
    if (equipmentDragTimerRef.current !== null) {
      window.clearTimeout(equipmentDragTimerRef.current);
      equipmentDragTimerRef.current = null;
    }
  };

  const startEquipmentPointerDrag = (event: React.PointerEvent<HTMLElement>, kit: ClubEquipmentKit) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearEquipmentDragTimer();
    activeEquipmentDragRef.current = null;
    activeEquipmentDropHolderRef.current = normalizeEquipmentHolderId(kit.holderId);
    suppressEquipmentClickRef.current = false;

    equipmentDragTimerRef.current = window.setTimeout(() => {
      activeEquipmentDragRef.current = kit.id;
      activeEquipmentDropHolderRef.current = normalizeEquipmentHolderId(kit.holderId);
      suppressEquipmentClickRef.current = true;
      setDraggingKitId(kit.id);
      setDragOverHolderId(normalizeEquipmentHolderId(kit.holderId));
    }, 180);
  };

  const moveEquipmentPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!activeEquipmentDragRef.current) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const holderElement = target?.closest("[data-equipment-holder-id]") as HTMLElement | null;
    const nextHolderId = holderElement?.dataset.equipmentHolderId || null;
    if (nextHolderId && nextHolderId !== activeEquipmentDropHolderRef.current) {
      activeEquipmentDropHolderRef.current = nextHolderId;
      setDragOverHolderId(nextHolderId);
    }
  };

  const finishEquipmentPointerDrag = (event?: React.PointerEvent<HTMLElement>) => {
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
        closeEquipmentEditor(true);
      }
    } catch (error) {
      setEquipmentKits(previous);
      if (equipmentGroupId) writeCachedEquipmentKits(equipmentGroupId, previous);
      setEquipmentError(error instanceof Error ? error.message : "Could not delete equipment bag.");
    } finally {
      setEquipmentSaving(false);
    }
  };

  const blurActiveField = () => {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  };

  const hasClubBackTarget = Boolean(
    colorPickerOpen ||
    contentPeekKitId ||
    equipmentDialogOpen ||
    equipmentBoardOpen ||
    ratingPlayerId ||
    accountDialogOpen,
  );

  useEffect(() => {
    equipmentBackStateRef.current = {
      colorPickerOpen,
      contentPeekKitId,
      equipmentBoardOpen,
      equipmentDialogOpen,
      ratingPlayerId,
      accountDialogOpen,
    };
  }, [accountDialogOpen, colorPickerOpen, contentPeekKitId, equipmentBoardOpen, equipmentDialogOpen, ratingPlayerId]);

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
      if (state.equipmentBoardOpen) {
        event.preventDefault();
        setContentPeekKitId(null);
        setEquipmentBoardOpen(false);
        return;
      }
      if (state.ratingPlayerId) {
        event.preventDefault();
        setRatingPlayerId(null);
        return;
      }
      if (state.accountDialogOpen) {
        event.preventDefault();
        blurActiveField();
        setAccountDialogOpen(false);
      }
    };

    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () => window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [equipmentEditorReturnToBoard]);

  const canSaveEquipmentKit = kitName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5 px-1 pb-2">
      <Dialog open={accountModalOpen} onOpenChange={(open) => {
        if (!clubUser) return;
        setAccountDialogOpen(open);
      }}>
        <DialogContent className="max-w-sm rounded-3xl p-3">
          <DialogHeader className="px-1 pb-1 text-left">
            <DialogTitle className="text-base font-black text-[#102A43]">Fair Teams account</DialogTitle>
          </DialogHeader>
          <FirebaseSharedRosterAuthCard />
        </DialogContent>
      </Dialog>

      {clubUser && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => setAccountDialogOpen(true)}
            className="flex min-w-0 items-center gap-2 text-left active:scale-[0.99]"
            aria-label="Open Fair Teams account"
          >
            <UserCircle className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-black text-[#102A43]">Hey, {clubGreetingName}</span>
              <span className="block truncate text-[10px] font-bold text-slate-400">{equipmentCanSyncOnline ? "Online · live Club tools" : clubUser.email}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleClubLogout}
            disabled={accountBusy}
            className="shrink-0 rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 active:scale-95 disabled:opacity-60"
          >
            {accountBusy ? "…" : "Log out"}
          </button>
        </div>
      )}

      <section className="rounded-[1.7rem] border border-slate-100 bg-white p-3 shadow-sm ring-1 ring-slate-50">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]" />
              Shared roster
            </div>
            <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
              Invite organizers and keep {activeRosterName} live online.
            </div>
          </div>
          {!isSharedRoster && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">Local</span>
          )}
        </div>
        <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-black text-[#102A43]">Pairing rules</div>
            <div className="truncate text-[11px] font-semibold text-slate-500">
              {cleanPairingRuleCount} keep-together/separate rule{cleanPairingRuleCount === 1 ? "" : "s"}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 rounded-xl border-slate-200 bg-white px-3 text-[11px] font-black"
            disabled={!onOpenPairingRules || playerCount < 2}
            onClick={onOpenPairingRules}
          >
            Open
          </Button>
        </div>
        {sharedToolsNode}
      </section>

      <section className="rounded-[1.7rem] border border-slate-100 bg-white p-3 shadow-sm ring-1 ring-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-blue-600">
              <AntiqueBallIcon className="h-4 w-4" />
              Equipment
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-400">See who has what and move bags quickly.</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-black text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${equipmentCanSyncOnline && !equipmentError ? "bg-emerald-500" : equipmentWaitingForAccount || equipmentSharedConnecting ? "bg-amber-400" : "bg-slate-300"}`} />
              {equipmentStatusText}
            </div>
          </div>
          <Button
            type="button"
            className="h-10 shrink-0 rounded-2xl bg-[#102A43] px-4 text-xs font-black text-white hover:bg-[#0b2036]"
            onClick={() => setEquipmentBoardOpen(true)}
          >
            Open
          </Button>
        </div>

        {equipmentKits.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-[1.35rem] border border-slate-100 bg-slate-50/60">
            {equipmentDashboardHolders.map((holder, index) => {
              const holderKits = equipmentKits.filter((kit) => normalizeEquipmentHolderId(kit.holderId) === holder.id);
              const highlighted = dragOverHolderId === holder.id;
              return (
                <div
                  key={`dashboard-${holder.id}`}
                  data-equipment-holder-id={holder.id}
                  className={`grid grid-cols-[4.8rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-2 transition ${index === 0 ? "" : "border-t border-slate-100"} ${highlighted ? "bg-emerald-50 ring-2 ring-inset ring-emerald-100" : ""}`}
                >
                  <div className="truncate text-[11px] font-black text-[#102A43]">{holder.label}</div>
                  <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                    {holderKits.length ? holderKits.map((kit) => {
                      const isDragging = draggingKitId === kit.id;
                      return (
                        <button
                          key={`dashboard-kit-${kit.id}`}
                          type="button"
                          className={`touch-none select-none rounded-2xl border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition active:scale-[0.98] ${isDragging ? "scale-95 opacity-45 ring-2 ring-emerald-200" : ""}`}
                          onPointerDown={(event) => startEquipmentPointerDrag(event, kit)}
                          onPointerMove={moveEquipmentPointerDrag}
                          onPointerUp={finishEquipmentPointerDrag}
                          onPointerCancel={finishEquipmentPointerDrag}
                          onClick={() => openEquipmentKitFromBoard(kit)}
                          aria-label={`Edit ${kit.name}`}
                        >
                          <span className="flex max-w-[7.4rem] items-center gap-1.5">
                            <DuffleBagIcon color={kit.color || DEFAULT_EQUIPMENT_COLOR} className="h-6 w-8 shrink-0" />
                            <span className="min-w-0 truncate text-[11px] font-black text-[#102A43]">{kit.name}</span>
                          </span>
                        </button>
                      );
                    }) : (
                      <span className="rounded-full border border-dashed border-slate-200 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate-400">No bag</span>
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
          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]">No bags yet</div>
        )}
      </section>

      <section className="rounded-[1.7rem] border border-slate-100 bg-white p-3 shadow-sm ring-1 ring-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-violet-600">
              <Star className="h-4 w-4" />
              Organizer ratings
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-400">Your rating helps build the Club average for shared teams.</div>
            <div className="mt-1 text-sm font-black text-[#102A43]">{clubRatingProgressText}</div>
          </div>
          <Button
            type="button"
            className="h-10 shrink-0 rounded-2xl bg-[#102A43] px-4 text-xs font-black text-white hover:bg-[#0b2036]"
            disabled={!clubRatingsEnabled || players.length === 0}
            onClick={() => openRatingForPlayer(nextRatingPlayer)}
          >
            {clubRatedCount > 0 ? "Continue" : "Start"}
          </Button>
        </div>

        {isSharedRoster && legacySkillSeedPlayers.length > 0 && (
          <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2">
            <div className="text-[11px] font-bold leading-snug text-violet-900">
              Older shared roster? Use the current roster skill numbers as your first Club ratings.
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-9 w-full rounded-xl border-violet-200 bg-white text-[11px] font-black text-violet-700 hover:bg-violet-50"
              disabled={!clubRatingsEnabled || ratingSeedSaving}
              onClick={seedClubRatingsFromRosterSkills}
            >
              {ratingSeedSaving ? "Importing…" : `Use current ratings for ${legacySkillSeedPlayers.length} player${legacySkillSeedPlayers.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}

        {ratingSeedMessage && (
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-snug text-emerald-800">
            {ratingSeedMessage}
          </div>
        )}

        {clubRatingError && (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-800">
            {clubRatingError}
          </div>
        )}

        {isSharedRoster && (
          <div className="mt-3 grid gap-2">
            {clubNeedRatingCount > 0 && (
              <button
                type="button"
                className="flex items-center justify-between rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-left active:scale-[0.99]"
                disabled={!clubRatingsEnabled}
                onClick={() => openRatingForPlayer(needRatingPlayers[0] || null)}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-black text-[#102A43]">Needs your rating</span>
                  <span className="block truncate text-[11px] font-semibold text-violet-700">{needRatingPlayers.slice(0, 3).map((player) => player.name).join(", ")}</span>
                </span>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-violet-700">{clubNeedRatingCount}</span>
              </button>
            )}
            {clubSkippedCount > 0 && (
              <button
                type="button"
                className="flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-left active:scale-[0.99]"
                disabled={!clubRatingsEnabled}
                onClick={() => openRatingForPlayer(skippedPlayers[0] || null)}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-black text-[#102A43]">Skipped for later</span>
                  <span className="block truncate text-[11px] font-semibold text-amber-700">{skippedPlayers.slice(0, 3).map((player) => player.name).join(", ")}</span>
                </span>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-amber-700">{clubSkippedCount}</span>
              </button>
            )}
            {clubRatedCount > 0 && (
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                {clubRatingLoading ? "Syncing ratings…" : `Club averages are ready for ${clubRatedCount} player${clubRatedCount === 1 ? "" : "s"}.`}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[1.7rem] border border-slate-100 bg-white p-3 shadow-sm ring-1 ring-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-amber-600">
              <StickyNote className="h-4 w-4" />
              Club notes
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-400">Small shared notes for organizers.</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {clubNotes.length > 0 && (
              <button
                type="button"
                className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-700 shadow-sm ring-1 ring-amber-100 active:scale-95"
                onClick={() => setClubNotesOpen(true)}
              >
                View all
              </button>
            )}
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">Post-it</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {previewClubNotes.length > 0 ? previewClubNotes.map((note) => (
            <div key={note.id} className="rounded-[1.25rem] border border-amber-100 bg-amber-50/80 px-3 py-2 shadow-sm">
              <div className="text-sm font-black leading-snug text-[#102A43]">{note.text}</div>
              <div className="mt-1 text-[10px] font-bold text-amber-700/70">
                {note.createdByName || "Organizer"} · {formatEquipmentTimestamp(note.createdAt)}
              </div>
            </div>
          )) : (
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]">
              No notes yet. Add the first post-it for organizers.
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-2">
          <Textarea
            value={clubNoteDraft}
            onChange={(event) => setClubNoteDraft(event.target.value)}
            disabled={!clubRatingsEnabled}
            placeholder={clubRatingsEnabled ? "Example: Puma ball died today — Joon" : "Shared notes appear after sign-in."}
            className="min-h-[4rem] rounded-2xl border-amber-100 bg-white text-sm font-semibold"
            maxLength={160}
          />
          {clubNotesError && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">{clubNotesError}</div>
          )}
          <Button
            type="button"
            className="h-10 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]"
            disabled={!canAddClubNote}
            onClick={addSharedClubNote}
          >
            {clubNoteSaving ? "Adding…" : "Add note"}
          </Button>
        </div>
      </section>

      <Dialog open={clubNotesOpen} onOpenChange={setClubNotesOpen}>
        <DialogContent className="max-h-[86svh] max-w-sm overflow-hidden rounded-3xl border border-amber-100 p-0 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-amber-100 bg-amber-50/70 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <StickyNote className="h-4 w-4 text-amber-600" />
              Club notes
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[62svh] overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="grid gap-2">
              {clubNotes.length > 0 ? clubNotes.map((note) => (
                <div key={`all-${note.id}`} className="rounded-[1.25rem] border border-amber-100 bg-amber-50/80 px-3 py-2 shadow-sm">
                  <div className="text-sm font-black leading-snug text-[#102A43]">{note.text}</div>
                  <div className="mt-1 text-[10px] font-bold text-amber-700/70">
                    {note.createdByName || "Organizer"} · {formatEquipmentTimestamp(note.createdAt)}
                  </div>
                </div>
              )) : (
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
            <DialogTitle className="text-base font-black text-[#102A43]">Organizers</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 p-4">
            {sharedPersonNames.length ? sharedPersonNames.map((name) => (
              <div key={name} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]">{name}</div>
            )) : (
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">Only you</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(ratingDialogPlayer)} onOpenChange={(open) => {
        if (!open) {
          setRatingDialogError("");
          setRatingPlayerId(null);
        }
      }}>
        <DialogContent className="max-w-sm rounded-3xl p-0">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Star className="h-5 w-5 text-violet-600" />
              {ratingDialogPlayer ? `Rate ${ratingDialogPlayer.name}` : "Rate player"}
            </DialogTitle>
          </DialogHeader>
          {ratingDialogPlayer && (() => {
            const myRating = myRatingByPlayerId.get(ratingDialogPlayer.id);
            const summary = ratingSummaryByPlayerId.get(ratingDialogPlayer.id);
            const canRevealAverage = Boolean(myRating && !myRating.skipped && typeof myRating.skill === "number");
            const nextPlayerAfterThis = findNextRatingPlayerAfter(ratingDialogPlayer.id);
            return (
              <div className="grid gap-4 p-4">
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Player</div>
                  <div className="mt-1 text-lg font-black text-[#102A43]">{ratingDialogPlayer.name}</div>
                  {ratingDialogPlayer.aka && <div className="text-xs font-semibold text-slate-500">{ratingDialogPlayer.aka}</div>}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-end justify-between gap-3">
                    <Label className="text-xs font-black uppercase tracking-wide text-slate-500">Your rating</Label>
                    <div className="text-3xl font-black tabular-nums text-[#102A43]">{ratingDraft.toFixed(1)}</div>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={ratingDraft}
                    onChange={(event) => setRatingDraft(Number(event.target.value))}
                    className="w-full accent-[#102A43]"
                  />
                  <div className="grid grid-cols-3 text-[10px] font-black text-slate-400">
                    <span>2 weak regular</span>
                    <span className="text-center">5 average</span>
                    <span className="text-right">9 strongest</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-semibold leading-snug text-violet-800">
                  Rate compared to this group. Think of the weakest regular player as around 2, an average regular as 5, and the strongest regular as around 9.
                </div>

                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Club average</div>
                  <div className="mt-1 text-sm font-black text-[#102A43]">
                    {canRevealAverage && summary?.averageSkill
                      ? `${summary.averageSkill.toFixed(1)} · ${summary.ratingCount} organizer${summary.ratingCount === 1 ? "" : "s"}`
                      : "Hidden until you rate this player"}
                  </div>
                </div>

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
                    {nextPlayerAfterThis ? "Skip & next" : "I don’t know yet"}
                  </Button>
                  <Button
                    type="button"
                    className="h-11 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]"
                    disabled={ratingSaving}
                    onClick={saveClubRating}
                  >
                    {ratingSaving ? "Saving…" : nextPlayerAfterThis ? "Save & next" : "Save rating"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={equipmentBoardOpen} onOpenChange={(open) => {
        setEquipmentBoardOpen(open);
        if (!open) {
          setContentPeekKitId(null);
        }
      }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-2 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[2rem] p-0 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-[96dvh] sm:w-[calc(100vw-1rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2">
          <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left">
            <div className="grid gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
                  <AntiqueBallIcon className="h-5 w-5 text-emerald-600" />
                  Equipment board
                </DialogTitle>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Drag bags between holders. Tap a bag to edit its name and contents.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
            <div className={`mb-2 rounded-2xl border px-3 py-1.5 text-[11px] font-bold leading-snug shadow-sm transition ${equipmentMoveNotice ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}>
              {equipmentBoardStatusText}
            </div>

            <div className="overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
              <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-wide text-slate-400">
                <div className="px-3 py-2.5">Holder</div>
                <div className="border-l border-slate-200 px-3 py-2.5">Bags</div>
              </div>

              {equipmentHolders.map((holder, index) => {
                const holderKits = equipmentKits.filter((kit) => normalizeEquipmentHolderId(kit.holderId) === holder.id);
                const highlighted = dragOverHolderId === holder.id;
                return (
                  <section
                    key={holder.id}
                    data-equipment-holder-id={holder.id}
                    className={`grid grid-cols-[6.25rem_minmax(0,1fr)] transition ${index === 0 ? "" : "border-t border-slate-100"} ${highlighted ? "bg-emerald-50" : "bg-white"}`}
                  >
                    <div className="flex min-h-[3.65rem] items-center px-3 py-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[12px] font-black leading-tight text-[#102A43]">
                          {holder.label}
                        </h3>
                      </div>
                    </div>

                    <div className={`flex min-h-[3.65rem] flex-col items-stretch justify-center gap-1.5 border-l px-2 py-2 transition ${highlighted ? "border-emerald-300 bg-emerald-50 ring-2 ring-inset ring-emerald-100" : "border-slate-200 bg-slate-50/30"}`}>
                      {holderKits.length === 0 ? (
                        <div className={`min-h-8 rounded-2xl border border-dashed ${highlighted ? "border-emerald-300 bg-white/80 px-3 py-1 text-[11px] font-bold text-emerald-600" : "border-transparent"}`}>
                          {highlighted ? "Drop here" : ""}
                        </div>
                      ) : holderKits.map((kit) => {
                        const isDragging = draggingKitId === kit.id;
                        return (
                          <div key={kit.id} className="flex w-full items-center gap-1.5">
                            <div
                              role="button"
                              tabIndex={0}
                              className={`min-w-0 flex-1 touch-none select-none rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-emerald-200 hover:bg-white active:scale-[0.98] ${isDragging ? "scale-95 opacity-45 ring-2 ring-emerald-200" : ""}`}
                              onPointerDown={(event) => startEquipmentPointerDrag(event, kit)}
                              onPointerMove={moveEquipmentPointerDrag}
                              onPointerUp={finishEquipmentPointerDrag}
                              onPointerCancel={finishEquipmentPointerDrag}
                              onClick={() => openEquipmentKitFromBoard(kit)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openEquipmentKitFromBoard(kit);
                                }
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <DuffleBagIcon color={kit.color || DEFAULT_EQUIPMENT_COLOR} className="h-9 w-12 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-xs font-black text-[#102A43]">{kit.name}</span>
                                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-hidden="true">
                                      <Pencil className="h-3 w-3" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                              aria-label={`Show contents of ${kit.name}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setContentPeekKitId(kit.id);
                              }}
                            >
                              <ClipboardList className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          {contentPeekKit && (
            <div className="absolute inset-0 z-40 flex items-end bg-slate-950/20 p-3" onClick={() => setContentPeekKitId(null)}>
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

                {contentPeekKit.contents.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {contentPeekKit.contents.map((item, index) => (
                      <span key={`${contentPeekKit.id}-content-${index}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                    Nothing listed yet.
                  </div>
                )}

                {contentPeekKit.note && (
                  <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-snug text-amber-800">
                    {contentPeekKit.note}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={equipmentDialogOpen} onOpenChange={(open) => {
        if (open) {
          setEquipmentDialogOpen(true);
          return;
        }
        closeEquipmentEditor(true);
      }}>
        <DialogContent
            className="max-h-[86dvh] max-w-md overflow-y-auto rounded-3xl p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <DuffleBagIcon color={kitColor || DEFAULT_EQUIPMENT_COLOR} className="h-5 w-7 shrink-0" />
              {editingKitId ? "Edit Bag" : "New Bag"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2.5 p-3 pt-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Bag name
              </Label>
              <div className="flex items-center gap-2">
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
                  className="h-10 min-w-0 flex-1 rounded-2xl border-slate-200 text-sm font-semibold"
                />
                <div className="relative shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-slate-200 px-2.5 text-[11px] font-black text-slate-600"
                    onClick={() => setColorPickerOpen((open) => !open)}
                    aria-label="Choose bag color"
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-slate-300 shadow-inner"
                      style={{ backgroundColor: kitColor }}
                    />
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
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                What is inside?
              </Label>
              <Input
                value={kitContents}
                onChange={(event) => setKitContents(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                enterKeyHint="done"
                placeholder="Enough cones for 2 teams, 2 balls, pump"
                className="h-10 rounded-2xl border-slate-200 text-sm font-semibold"
              />
              <p className="text-[11px] font-semibold text-slate-500">
                Separate items with commas. Example: enough cones for 2 teams, 2 balls, pump.
              </p>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Note optional
              </Label>
              <Textarea
                value={kitNote}
                onChange={(event) => setKitNote(event.target.value)}
                placeholder="Example: First-aid spray is almost empty."
                className="min-h-[3.5rem] rounded-2xl border-slate-200 text-sm font-semibold"
              />
            </div>

            {editingKitMeta && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-semibold leading-snug text-slate-500">
                <div>
                  Created by {equipmentActorLabel(editingKitMeta.createdByName, editingKitMeta.createdByEmail, equipmentHolderNamesByEmail)} · {formatEquipmentTimestamp(editingKitMeta.createdAt)}
                </div>
                <div>
                  Last updated by {equipmentActorLabel(editingKitMeta.updatedByName, editingKitMeta.updatedByEmail, equipmentHolderNamesByEmail)} · {formatEquipmentTimestamp(editingKitMeta.updatedAt)}
                </div>
              </div>
            )}

            {editingKitId && deleteConfirmOpen && (
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-2.5">
                <div className="mb-1.5 text-[11px] font-bold leading-snug text-red-700">
                  Deleting removes this bag from everyone’s shared equipment board.
                </div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-red-700">
                  <span>Slide to unlock delete</span>
                  <span>{deleteBagSlide >= 95 ? "Ready" : `${deleteBagSlide}%`}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={deleteBagSlide}
                  onChange={(event) => setDeleteBagSlide(Number(event.target.value))}
                  className="w-full accent-red-600"
                  aria-label="Slide to unlock delete bag"
                />
              </div>
            )}

            <div className={`grid gap-2 pt-1 ${editingKitId ? "grid-cols-[0.85fr_1.15fr]" : "grid-cols-1"}`}>
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
                  {deleteConfirmOpen && deleteBagSlide >= 95 ? "Delete now" : "Delete"}
                </Button>
              )}
              <Button
                type="button"
                className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]"
                disabled={!canSaveEquipmentKit || equipmentSaving}
                onClick={() => {
                  blurActiveField();
                  setColorPickerOpen(false);
                  setDeleteConfirmOpen(false);
                  saveEquipmentKit();
                }}
              >
                {equipmentSaving ? "Saving…" : "Save bag"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
