import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  PackageOpen,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Vote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
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

type ClubTabProps = {
  activeRosterName: string;
  activeRosterMeta?: string;
  playerCount: number;
  isSharedRoster: boolean;
  collaboratorCount: number;
  sharedToolsOpen?: boolean;
  onSharedToolsOpenChange?: (open: boolean) => void;
  canSwitchRoster?: boolean;
  onOpenRosterPicker?: () => void;
  onBackTargetChange?: (hasBackTarget: boolean) => void;
  sharedToolsNode?: React.ReactNode;
  equipmentGroupId?: string;
  equipmentHolderLabels?: string[];
  equipmentHolderNamesByEmail?: Record<string, string>;
};

type ClubVoteOption = {
  id: string;
  label: string;
  count: number;
};

type ClubVote = {
  id: string;
  question: string;
  options: ClubVoteOption[];
  status: "open" | "closed";
  createdAt: number;
  deadline?: string;
  votedOptionId?: string;
};

type EquipmentHolder = {
  id: string;
  label: string;
};

type ClubEquipmentKit = FirebaseEquipmentBag;

const VOTE_PREVIEW_STORAGE_KEY = "fairteams.clubVotes.preview.v1";
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
    updatedAt: Date.now(),
  },
  {
    id: "kit-bibs",
    name: "Bibs",
    holderId: "storage",
    color: "#db2777",
    contents: ["10 dark bibs", "10 light bibs"],
    updatedAt: Date.now(),
  },
  {
    id: "kit-cones",
    name: "Cone stack",
    holderId: "storage",
    color: "#ea580c",
    contents: ["12 cones"],
    note: "Someone took them after last game?",
    updatedAt: Date.now(),
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

function parseVotes(raw: string | null): ClubVote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((vote): vote is ClubVote => Boolean(vote?.id && vote?.question && Array.isArray(vote?.options)))
      .map((vote) => ({
        ...vote,
        status: vote.status === "closed" ? "closed" : "open",
        createdAt: Number(vote.createdAt) || Date.now(),
        options: vote.options
          .filter((option: ClubVoteOption) => Boolean(option?.id && option?.label))
          .map((option: ClubVoteOption) => ({
            id: String(option.id),
            label: String(option.label),
            count: Math.max(0, Number(option.count) || 0),
          })),
      }));
  } catch {
    return [];
  }
}

function parseEquipmentKits(raw: string | null): ClubEquipmentKit[] {
  if (!raw) return DEFAULT_EQUIPMENT_KITS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_EQUIPMENT_KITS;
    return parsed
      .filter((kit): kit is ClubEquipmentKit => Boolean(kit?.id && kit?.name))
      .map((kit) => ({
        id: String(kit.id),
        name: String(kit.name),
        holderId: LOCAL_EQUIPMENT_HOLDERS.some((holder) => holder.id === kit.holderId) ? String(kit.holderId) : "storage",
        color: typeof kit.color === "string" && kit.color.trim() ? kit.color : DEFAULT_EQUIPMENT_COLOR,
        contents: Array.isArray(kit.contents)
          ? kit.contents.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
          : [],
        note: kit.note ? String(kit.note) : undefined,
        updatedAt: Number(kit.updatedAt) || Date.now(),
      }));
  } catch {
    return DEFAULT_EQUIPMENT_KITS;
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

function ClubFeatureCard({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-[#102A43]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-[17px] font-black tracking-tight text-[#102A43]">
            {title}
          </h2>
          <p className="mt-1 text-[12px] font-semibold leading-snug text-slate-500">
            {description}
          </p>
        </div>
      </div>
      {children && <div className="border-t border-slate-100 p-3">{children}</div>}
    </section>
  );
}

function VoteCard({
  vote,
  onVote,
  onCloseVote,
  onDeleteVote,
}: {
  vote: ClubVote;
  onVote: (voteId: string, optionId: string) => void;
  onCloseVote: (voteId: string) => void;
  onDeleteVote: (voteId: string) => void;
}) {
  const totalVotes = vote.options.reduce((sum, option) => sum + option.count, 0);
  const isClosed = vote.status === "closed";

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${isClosed ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>
              {isClosed ? "Closed" : "Open"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
              {totalVotes} vote{totalVotes === 1 ? "" : "s"}
            </span>
            {vote.deadline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700">
                <CalendarClock className="h-3 w-3" />
                {vote.deadline}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-sm font-black leading-snug text-[#102A43]">
            {vote.question}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Delete preview vote"
          className="rounded-full p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
          onClick={() => onDeleteVote(vote.id)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {vote.options.map((option) => {
          const percent = totalVotes > 0 ? Math.round((option.count / totalVotes) * 100) : 0;
          const selected = vote.votedOptionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={isClosed || Boolean(vote.votedOptionId)}
              className={`overflow-hidden rounded-2xl border text-left transition ${selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"} disabled:cursor-default disabled:opacity-100`}
              onClick={() => onVote(vote.id, option.id)}
            >
              <div className="relative px-3 py-2.5">
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-100/70 transition-all"
                  style={{ width: `${percent}%` }}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-black text-[#102A43]">
                    {option.label}
                  </div>
                  <div className="shrink-0 text-[11px] font-black text-slate-500">
                    {option.count} · {percent}%
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          {vote.votedOptionId ? "Your preview vote is counted." : "Names are not shown next to choices."}
        </div>
        {!isClosed && (
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 rounded-xl px-3 text-[11px] font-black"
            onClick={() => onCloseVote(vote.id)}
          >
            Close
          </Button>
        )}
      </div>
    </article>
  );
}

export function ClubTab({
  activeRosterName,
  activeRosterMeta,
  playerCount,
  isSharedRoster,
  collaboratorCount,
  sharedToolsOpen = false,
  onSharedToolsOpenChange,
  canSwitchRoster = false,
  onOpenRosterPicker,
  onBackTargetChange,
  sharedToolsNode,
  equipmentGroupId,
  equipmentHolderLabels = [],
  equipmentHolderNamesByEmail = {},
}: ClubTabProps) {
  const [votes, setVotes] = useState<ClubVote[]>(() => {
    if (typeof window === "undefined") return [];
    return parseVotes(window.localStorage.getItem(VOTE_PREVIEW_STORAGE_KEY));
  });
  const [voteDialogOpen, setVoteDialogOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionText, setOptionText] = useState("Yes\nNo");
  const [deadline, setDeadline] = useState("");
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
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [kitName, setKitName] = useState("");
  const [kitHolderId, setKitHolderId] = useState("storage");
  const [kitColor, setKitColor] = useState(DEFAULT_EQUIPMENT_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [deleteBagSlide, setDeleteBagSlide] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
    sharedToolsOpen: false,
    colorPickerOpen: false,
    contentPeekKitId: null as string | null,
    equipmentBoardOpen: false,
    equipmentDialogOpen: false,
    voteDialogOpen: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VOTE_PREVIEW_STORAGE_KEY, JSON.stringify(votes));
  }, [votes]);

  const equipmentRealtimeEnabled = Boolean(equipmentGroupId);
  const equipmentSharedConnecting = isSharedRoster && !equipmentRealtimeEnabled;
  const equipmentRosterLabel = activeRosterName || "Current roster";
  const equipmentStatusText = equipmentRealtimeEnabled
    ? equipmentError
      ? "Sync issue. Open board."
      : equipmentLoading
        ? "Loading shared equipment…"
        : "Realtime sync on."
    : equipmentSharedConnecting
      ? "Open a shared roster to sync."
      : "Local preview.";
  const equipmentBoardStatusText = equipmentRealtimeEnabled
    ? equipmentError
      ? equipmentError
      : equipmentLoading
        ? "Loading shared equipment…"
        : "Realtime sync on · this board belongs to the selected roster"
    : equipmentSharedConnecting
      ? "Open a shared roster to sync equipment."
      : "Local preview · this board belongs to this roster on this device";
  const equipmentHolders = useMemo<EquipmentHolder[]>(() => {
    if (!isSharedRoster && !equipmentRealtimeEnabled) return LOCAL_EQUIPMENT_HOLDERS;
    return buildSharedEquipmentHolders(equipmentHolderLabels, equipmentKits, equipmentHolderNamesByEmail);
  }, [equipmentHolderLabels, equipmentHolderNamesByEmail, equipmentKits, equipmentRealtimeEnabled, isSharedRoster]);

  useEffect(() => {
    if (typeof window === "undefined" || equipmentRealtimeEnabled || isSharedRoster) return;
    window.localStorage.setItem(EQUIPMENT_PREVIEW_STORAGE_KEY, JSON.stringify(equipmentKits));
  }, [equipmentKits, equipmentRealtimeEnabled, isSharedRoster]);

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

    setEquipmentLoading(true);
    setEquipmentError("");
    setEquipmentKits([]);
    try {
      const unsubscribe = listenToFirebaseEquipmentBags(
        equipmentGroupId,
        (bags) => {
          setEquipmentKits(bags);
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
  }, [equipmentGroupId]);

  const openVotes = useMemo(() => votes.filter((vote) => vote.status === "open"), [votes]);
  const closedVotes = useMemo(() => votes.filter((vote) => vote.status === "closed"), [votes]);
  const contentPeekKit = useMemo(() => equipmentKits.find((kit) => kit.id === contentPeekKitId) || null, [contentPeekKitId, equipmentKits]);

  const resetVoteForm = () => {
    setQuestion("");
    setOptionText("Yes\nNo");
    setDeadline("");
  };

  const createVote = () => {
    const trimmedQuestion = question.trim();
    const labels = optionText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);

    if (!trimmedQuestion || labels.length < 2) return;

    const vote: ClubVote = {
      id: makeId("vote"),
      question: trimmedQuestion,
      options: labels.map((label) => ({ id: makeId("option"), label, count: 0 })),
      status: "open",
      createdAt: Date.now(),
      deadline: deadline.trim() || undefined,
    };

    setVotes((current) => [vote, ...current]);
    resetVoteForm();
    setVoteDialogOpen(false);
  };

  const castPreviewVote = (voteId: string, optionId: string) => {
    setVotes((current) => current.map((vote) => {
      if (vote.id !== voteId || vote.status === "closed" || vote.votedOptionId) return vote;
      return {
        ...vote,
        votedOptionId: optionId,
        options: vote.options.map((option) => option.id === optionId
          ? { ...option, count: option.count + 1 }
          : option),
      };
    }));
  };

  const closeVote = (voteId: string) => {
    setVotes((current) => current.map((vote) => vote.id === voteId ? { ...vote, status: "closed" } : vote));
  };

  const deleteVote = (voteId: string) => {
    setVotes((current) => current.filter((vote) => vote.id !== voteId));
  };

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

  const openNewEquipmentKit = () => {
    // Always open the editor. The previous shared-link guard could make the Add bag
    // button feel broken while the app was still resolving the shared group connection.
    resetEquipmentForm();
    setEquipmentDialogOpen(true);
  };

  const openEditEquipmentKit = (kit: ClubEquipmentKit) => {
    setEditingKitId(kit.id);
    setKitName(kit.name);
    setKitHolderId(normalizeEquipmentHolderId(kit.holderId));
    setKitColor(kit.color || DEFAULT_EQUIPMENT_COLOR);
    setDeleteBagSlide(0);
    setDeleteConfirmOpen(false);
    setKitContents(kit.contents.join(", "));
    setKitNote(kit.note || "");
    setEquipmentDialogOpen(true);
  };

  const saveEquipmentKit = async () => {
    const trimmedName = kitName.trim();
    if (!trimmedName) return;

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
      updatedAt: Date.now(),
    };

    const applyLocal = () => {
      setEquipmentKits((current) => editingKitId
        ? current.map((kit) => kit.id === editingKitId ? nextKit : kit)
        : [nextKit, ...current]);
    };

    try {
      setEquipmentSaving(true);
      setEquipmentError("");
      if (equipmentGroupId) {
        await saveFirebaseEquipmentBag(equipmentGroupId, nextKit);
      } else {
        applyLocal();
      }
      resetEquipmentForm();
      setEquipmentDialogOpen(false);
    } catch (error) {
      setEquipmentError(error instanceof Error ? error.message : "Could not save equipment bag.");
    } finally {
      setEquipmentSaving(false);
    }
  };

  const moveEquipmentKit = async (kitId: string, holderId: string) => {
    const currentKit = equipmentKits.find((kit) => kit.id === kitId);
    if (!currentKit) return;
    const nextKit = { ...currentKit, holderId, updatedAt: Date.now() };
    setEquipmentKits((current) => current.map((kit) => kit.id === kitId ? nextKit : kit));
    try {
      setEquipmentError("");
      if (equipmentGroupId) {
        await saveFirebaseEquipmentBag(equipmentGroupId, nextKit);
      }
    } catch (error) {
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
    setEquipmentKits((current) => current.filter((kit) => kit.id !== kitId));
    try {
      setEquipmentSaving(true);
      setEquipmentError("");
      if (equipmentGroupId) {
        await deleteFirebaseEquipmentBag(equipmentGroupId, kitId);
      }
      if (editingKitId === kitId) {
        setDeleteConfirmOpen(false);
        resetEquipmentForm();
        setEquipmentDialogOpen(false);
      }
    } catch (error) {
      setEquipmentKits(previous);
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

  const releaseModalScrollLockSoon = () => {
    if (typeof window === "undefined") return;
    const clearScrollLock = () => {
      document.body.style.overflow = "";
      document.body.style.pointerEvents = "";
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("pointer-events");
      document.body.style.removeProperty("padding-right");
      document.documentElement.style.overflow = "";
      document.documentElement.style.removeProperty("overflow");
      if (document.body.dataset.fairTeamsScrollLock === "true") {
        delete document.body.dataset.fairTeamsScrollLock;
      }
    };

    // Radix/RemoveScroll releases body styles asynchronously. Clear twice so a
    // just-closed Shared Roster modal cannot leave the app in a frozen scroll state.
    window.setTimeout(clearScrollLock, 80);
    window.setTimeout(clearScrollLock, 240);
  };

  const handleSharedToolsOpenChange = (open: boolean) => {
    if (!open) {
      blurActiveField();
      onSharedToolsOpenChange?.(false);
      releaseModalScrollLockSoon();
      return;
    }
    onSharedToolsOpenChange?.(true);
  };

  const openEquipmentRosterPicker = () => {
    if (!canSwitchRoster || !onOpenRosterPicker) return;
    blurActiveField();
    setColorPickerOpen(false);
    setDeleteConfirmOpen(false);
    setContentPeekKitId(null);
    setEquipmentDialogOpen(false);
    setEquipmentBoardOpen(false);
    releaseModalScrollLockSoon();
    window.setTimeout(() => onOpenRosterPicker(), 120);
  };

  const hasClubBackTarget = Boolean(
    sharedToolsOpen ||
    colorPickerOpen ||
    contentPeekKitId ||
    equipmentDialogOpen ||
    equipmentBoardOpen ||
    voteDialogOpen,
  );

  useEffect(() => {
    equipmentBackStateRef.current = {
      sharedToolsOpen,
      colorPickerOpen,
      contentPeekKitId,
      equipmentBoardOpen,
      equipmentDialogOpen,
      voteDialogOpen,
    };
  }, [sharedToolsOpen, colorPickerOpen, contentPeekKitId, equipmentBoardOpen, equipmentDialogOpen, voteDialogOpen]);

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
        blurActiveField();
        setColorPickerOpen(false);
        setDeleteConfirmOpen(false);
        setEquipmentDialogOpen(false);
        resetEquipmentForm();
        return;
      }
      if (state.equipmentBoardOpen) {
        event.preventDefault();
        setContentPeekKitId(null);
        setEquipmentBoardOpen(false);
        return;
      }
      if (state.sharedToolsOpen) {
        event.preventDefault();
        handleSharedToolsOpenChange(false);
        return;
      }
      if (state.voteDialogOpen) {
        event.preventDefault();
        setVoteDialogOpen(false);
      }
    };

    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () => window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [handleSharedToolsOpenChange]);

  const canCreateVote = question.trim().length > 0 && optionText.split("\n").filter((line) => line.trim()).length >= 2;
  const canSaveEquipmentKit = kitName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <section className="rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 shadow-sm">
              <Sparkles className="h-3 w-3" />
              Organizer tools preview
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-[#102A43]">
              Club
            </h1>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-600">
              Shared roster, equipment, and votes.
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-white text-emerald-600 shadow-sm">
            <Users className="h-7 w-7" />
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/80 bg-white/75 p-3">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            Active roster
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-[#102A43]">
                {activeRosterName || "Current roster"}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                {activeRosterMeta || `${playerCount} player${playerCount === 1 ? "" : "s"} · ${isSharedRoster ? `${collaboratorCount} collaborator${collaboratorCount === 1 ? "" : "s"}` : "local roster"}`}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${isSharedRoster ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {isSharedRoster ? "Shared" : "Local"}
            </span>
          </div>
        </div>
      </section>

      <ClubFeatureCard
        icon={<Share2 className="h-5 w-5" />}
        eyebrow="Shared roster"
        title="Shared rosters"
        description="Sign in, invite organizers, save changes, and get latest."
      >
        <Button
          type="button"
          className="h-11 w-full rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]"
          onClick={() => handleSharedToolsOpenChange(true)}
        >
          Open
        </Button>
      </ClubFeatureCard>

      <ClubFeatureCard
        icon={<ClipboardList className="h-5 w-5" />}
        eyebrow="Votes"
        title="Organizer vote"
        description="Create a simple private decision vote. Results are shown as totals, without names next to choices."
      >
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Aggregate preview
              </div>
              <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
                Local test only. Later this will use a safe Firebase vote action.
              </p>
            </div>
            <Button
              type="button"
              className="h-10 shrink-0 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
              onClick={() => setVoteDialogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New
            </Button>
          </div>

          {votes.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-4 text-center">
              <Vote className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm font-black text-[#102A43]">
                No votes yet
              </p>
              <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                Try a schedule, captain, board role, or simple yes/no decision.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {openVotes.map((vote) => (
                <VoteCard
                  key={vote.id}
                  vote={vote}
                  onVote={castPreviewVote}
                  onCloseVote={closeVote}
                  onDeleteVote={deleteVote}
                />
              ))}
              {closedVotes.length > 0 && (
                <div className="pt-1">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Closed
                  </div>
                  <div className="grid gap-2 opacity-90">
                    {closedVotes.map((vote) => (
                      <VoteCard
                        key={vote.id}
                        vote={vote}
                        onVote={castPreviewVote}
                        onCloseVote={closeVote}
                        onDeleteVote={deleteVote}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ClubFeatureCard>

      <ClubFeatureCard
        icon={<PackageOpen className="h-5 w-5" />}
        eyebrow="Equipment"
        title="Equipment board"
        description="Bags and shared gear belong to the selected roster. Change roster here when needed."
      >
        <div className="grid gap-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {equipmentKits.length} bag{equipmentKits.length === 1 ? "" : "s"}
                </div>
                <p className="mt-1 truncate text-[11px] font-semibold leading-snug text-slate-500">
                  Roster: {equipmentRosterLabel}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-500">
                  {equipmentStatusText}
                </p>
              </div>
              <Button
                type="button"
                className="h-10 shrink-0 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]"
                onClick={() => setEquipmentBoardOpen(true)}
              >
                Open
              </Button>
            </div>
            {canSwitchRoster && (
              <button
                type="button"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-black uppercase tracking-wide text-[#102A43]/65 shadow-sm active:scale-[0.995]"
                onClick={openEquipmentRosterPicker}
              >
                Change equipment roster
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-hidden">
            {equipmentKits.slice(0, 4).map((kit) => (
              <div key={kit.id} className="flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
                <DuffleBagIcon color={kit.color || DEFAULT_EQUIPMENT_COLOR} className="h-8 w-10" />
              </div>
            ))}
            {equipmentKits.length === 0 && (
              <div className="w-full rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-center text-xs font-bold text-slate-400">
                No equipment yet
              </div>
            )}
          </div>
        </div>
      </ClubFeatureCard>




      <Dialog open={sharedToolsOpen} onOpenChange={handleSharedToolsOpenChange}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-2 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[2rem] p-0 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-[92dvh] sm:w-[calc(100vw-1rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2">
          <DialogHeader className="border-b border-slate-100 px-4 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Share2 className="h-5 w-5 text-emerald-600" />
              Shared rosters
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 p-4" style={{ WebkitOverflowScrolling: "touch" }}>
            <button
              type="button"
              className={`mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition ${canSwitchRoster ? "active:scale-[0.995]" : "cursor-default"}`}
              onClick={() => {
                if (canSwitchRoster) onOpenRosterPicker?.();
              }}
              disabled={!canSwitchRoster}
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Current roster
                </span>
                <span className="mt-1 block truncate text-sm font-black text-[#102A43]">
                  {activeRosterName || "Current roster"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
                  {activeRosterMeta || (isSharedRoster ? "Shared roster" : "Local roster")}
                </span>
              </span>
              {canSwitchRoster && (
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-black uppercase tracking-wide text-[#102A43]/55">
                  Change
                </span>
              )}
            </button>

            {sharedToolsNode || (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
                Shared tools are not available in this build.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={voteDialogOpen} onOpenChange={(open) => {
        setVoteDialogOpen(open);
        if (!open) resetVoteForm();
      }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <Vote className="h-5 w-5 text-emerald-600" />
              New organizer vote
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 p-5">
            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold leading-snug text-emerald-800">
              Preview only: choices are shown as totals. Later, Firebase will store vote results without readable names next to choices.
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Question
              </Label>
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Example: Should we move Thursday football to 20:00?"
                className="min-h-[4.75rem] rounded-2xl border-slate-200 text-sm font-semibold"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Options
              </Label>
              <Textarea
                value={optionText}
                onChange={(event) => setOptionText(event.target.value)}
                placeholder={"Yes\nNo"}
                className="min-h-[4.75rem] rounded-2xl border-slate-200 text-sm font-semibold"
              />
              <p className="text-[11px] font-semibold text-slate-500">
                One option per line. Use 2–6 options.
              </p>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Deadline note optional
              </Label>
              <Input
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                placeholder="Example: Friday 18:00"
                className="h-11 rounded-2xl border-slate-200 text-sm font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl text-sm font-black"
                onClick={() => setVoteDialogOpen(false)}
              >
                <X className="mr-1.5 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]"
                disabled={!canCreateVote}
                onClick={createVote}
              >
                Create vote
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      <Dialog open={equipmentBoardOpen} onOpenChange={(open) => {
        setEquipmentBoardOpen(open);
        if (!open) setContentPeekKitId(null);
      }}>
        <DialogContent className="fixed bottom-2 left-2 right-2 top-2 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[2rem] p-0 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-[96dvh] sm:w-[calc(100vw-1rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2">
          <DialogHeader className="border-b border-slate-100 px-4 py-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
                  <PackageOpen className="h-5 w-5 text-emerald-600" />
                  Equipment board
                </DialogTitle>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Roster: {equipmentRosterLabel}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canSwitchRoster && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-slate-200 px-3 text-xs font-black text-slate-600"
                    onClick={openEquipmentRosterPicker}
                  >
                    Change
                  </Button>
                )}
                <Button
                  type="button"
                  className="h-10 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]"
                  onClick={openNewEquipmentKit}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add bag
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50/70 p-3">
            <div className="mb-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold leading-snug text-slate-500 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">Equipment for: {equipmentRosterLabel}</span>
                {canSwitchRoster && (
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-black uppercase tracking-wide text-[#102A43]/60"
                    onClick={openEquipmentRosterPicker}
                  >
                    Change
                  </button>
                )}
              </div>
              <div className="mt-0.5 text-slate-400">{equipmentBoardStatusText}</div>
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
                                  <div className="truncate text-xs font-black text-[#102A43]">
                                    {kit.name}
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
        setEquipmentDialogOpen(open);
        if (!open) {
          setColorPickerOpen(false);
          setDeleteConfirmOpen(false);
          resetEquipmentForm();
        }
      }}>
        <DialogContent
            className="max-h-[86dvh] max-w-md overflow-y-auto rounded-3xl p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#102A43]">
              <PackageOpen className="h-5 w-5 text-emerald-600" />
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
                  placeholder="Example: Ball bag"
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
              <Textarea
                value={kitContents}
                onChange={(event) => setKitContents(event.target.value)}
                placeholder={"2 balls, pump, 12 cones"}
                className="min-h-[4.75rem] rounded-2xl border-slate-200 text-sm font-semibold"
              />
              <p className="text-[11px] font-semibold text-slate-500">
                Separate items with commas. Example: 2 balls, pump, 12 cones.
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

            <div className="grid gap-2 rounded-2xl bg-slate-50 p-2.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Quick move
              </div>
              <div className="grid grid-cols-2 gap-2">
                {equipmentHolders.map((holder) => (
                  <Button
                    key={holder.id}
                    type="button"
                    variant={kitHolderId === holder.id ? "default" : "outline"}
                    className={`h-8 rounded-xl text-[11px] font-black ${kitHolderId === holder.id ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}
                    onClick={() => {
                      setKitHolderId(holder.id);
                      setDeleteConfirmOpen(false);
                      if (editingKitId) moveEquipmentKit(editingKitId, holder.id);
                    }}
                  >
                    {holder.label}
                  </Button>
                ))}
              </div>
            </div>

            {editingKitId && deleteConfirmOpen && (
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-2.5">
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
