import React, { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  CalendarCheck,
  Shield,
  Download,
  Upload,
  Pencil,
  Check,
  X,
  Trash2,
  AlertTriangle,
  Plus,
  Settings,
  Archive,
  ArchiveRestore,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Share2,
  UserMinus,
  Info,
} from "lucide-react";
import { PlayersTab } from "@/components/PlayersTab";
import { TodayTab } from "@/components/TodayTab";
import { TeamsTab } from "@/components/TeamsTab";
import { Button } from "@/components/ui/button";
import fairTeamsLogo from "@/assets/fairteams-logo.png";
import fairTeamsLogoFloating from "@/assets/fairteams-logo-floating.png";
import {
  RoomPlayer,
  RoomRoster,
  createRoster,
  downloadText,
  loadRosterState,
  normalizePlayer,
  normalizeRoster,
  parseRosterFile,
  rosterToShareJson,
  rostersToBackupJson,
  saveRosterState,
} from "@/lib/localRoster";
import { getGoogleDriveConfig } from "@/lib/googleDriveConfig";
import { allRostersToDriveBackupJson, parseDriveBackupJson } from "@/lib/googleDriveBackup";
import { requestGoogleDriveAccessToken } from "@/lib/googleDriveAuth";
import {
  createGoogleDriveJsonFile,
  deleteGoogleDriveFilePermission,
  getGoogleDriveUserSummary,
  listGoogleDriveBackupFileGroups,
  listGoogleDriveFilePermissions,
  readGoogleDriveJsonFile,
  shareGoogleDriveFileWithEditor,
  shareGoogleDriveFileWithViewer,
  updateGoogleDriveJsonFile,
  type GoogleDriveBackupFileGroups,
  type GoogleDriveFileResult,
  type GoogleDrivePermissionResult,
} from "@/lib/googleDriveFiles";
import {
  createGoogleSheetRoster,
  getGoogleSheetRosterFileMetadata,
  listGoogleSheetRosterFiles,
  readGoogleSheetRoster,
  shareGoogleSheetRosterWithEditor,
  trashGoogleSheetRoster,
  updateGoogleSheetRoster,
  type GoogleSheetRosterFile,
} from "@/lib/googleSheetsFiles";

const GROUP_NAME_STORAGE_KEY = "fair-teams-group-name";
const HEADER_COLOR_STORAGE_KEY = "fair-teams-header-color-v2";
const GROUP_LOGO_STORAGE_KEY = "fair-teams-group-logo";
const DEFAULT_GROUP_NAME = "My Group";
const DEFAULT_HEADER_COLOR = "#3B82F6";
const EMPTY_ROSTER_NAME = "New roster";
const ROSTERS_STORAGE_KEY = "fair-teams-rosters-v1";
const DRIVE_RECIPIENTS_STORAGE_KEY = "fair-teams-drive-backup-recipients-v1";
const DRIVE_ACTIVE_BACKUP_STORAGE_KEY = "fair-teams-drive-active-backup-v1";

function hasSavedRosterState() {
  try {
    return Boolean(window.localStorage.getItem(ROSTERS_STORAGE_KEY));
  } catch {
    return false;
  }
}

function readStoredGroupName() {
  try {
    return (
      window.localStorage.getItem(GROUP_NAME_STORAGE_KEY) || DEFAULT_GROUP_NAME
    );
  } catch {
    return DEFAULT_GROUP_NAME;
  }
}

function readStoredHeaderColor() {
  try {
    const stored = window.localStorage.getItem(HEADER_COLOR_STORAGE_KEY);
    return /^#[0-9A-Fa-f]{6}$/.test(stored || "")
      ? stored!
      : DEFAULT_HEADER_COLOR;
  } catch {
    return DEFAULT_HEADER_COLOR;
  }
}

function readStoredGroupLogo() {
  try {
    return window.localStorage.getItem(GROUP_LOGO_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function rosterThemeColor(roster: RoomRoster | undefined) {
  return /^#[0-9A-Fa-f]{6}$/.test(roster?.themeColor || "")
    ? roster!.themeColor!
    : DEFAULT_HEADER_COLOR;
}

function rosterLogo(roster: RoomRoster | undefined) {
  return roster?.logo || "";
}

function slugifyFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\p{L}\p{M}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "roster"
  );
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
}

function allRostersDriveBackupFilename(rosters: RoomRoster[]) {
  const readableName = rosters.length === 1 ? rosters[0]?.name || "Roster" : "All rosters";
  return `Fair Teams - ${slugifyFilename(readableName)} - ${timestampForFilename()}.json`;
}

function uniqueRosterName(name: string, rosters: RoomRoster[]) {
  const base = name.replace(/\s+/g, " ").trim() || "New roster";
  const taken = new Set(rosters.map((roster) => roster.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let index = 2;
  while (taken.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

const GROUP_COLOR_THEMES = [
  { name: "White", value: "#FFFFFF" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Green", value: "#22C55E" },
  { name: "Lime", value: "#84CC16" },
  { name: "Yellow", value: "#FACC15" },
  { name: "Orange", value: "#F97316" },
  { name: "Red", value: "#EF4444" },
  { name: "Pink", value: "#EC4899" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Gray", value: "#64748B" },
];

function hexToRgba(hex: string, alpha: number) {
  const normalized = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : DEFAULT_HEADER_COLOR;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PoweredByFairTeams() {
  return (
    <div className="mt-auto pt-7 pb-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 select-none">
      <span>Powered by</span>
      <img
        src={fairTeamsLogoFloating}
        alt=""
        className="h-5 w-5 object-contain opacity-85"
      />
      <span className="font-black tracking-tight leading-none">
        <span className="text-[#102A43]/80">FAIR</span>
        <span className="text-[#16A34A]"> TEAMS</span>
      </span>
    </div>
  );
}

type DriveImportPreview = {
  file: GoogleDriveFileResult;
  rosters: RoomRoster[];
  activeRosterId?: string;
  rosterCount: number;
  playerCount: number;
  rosterNames: string[];
};

type LocalImportPreview = {
  mode: "shared" | "backup";
  sourceName: string;
  rosters: RoomRoster[];
  rosterCount: number;
  playerCount: number;
  rosterNames: string[];
};

type RosterToolsNotice = {
  title: string;
  message: string;
  tone?: "info" | "success" | "warning" | "error";
};

type DriveBackupTab = "mine" | "shared";

type DriveBackupRecipient = {
  id: string;
  name: string;
  email: string;
};

type DriveShareConfirm = {
  recipients: DriveBackupRecipient[];
};

type DriveRemoveAccessConfirm = {
  permission: GoogleDrivePermissionResult;
  label: string;
};

type DriveBackupSummary = {
  rosterCount: number;
  playerCount: number;
};

type ActiveDriveBackupFile = GoogleDriveFileResult & {
  rosterCount?: number;
  playerCount?: number;
  checkedAt?: string;
  connectedEmail?: string;
};

type DriveUpdateConfirm = {
  file: ActiveDriveBackupFile;
  previous: DriveBackupSummary | null;
  next: DriveBackupSummary;
  checkedAt?: string;
  readFailed?: boolean;
};

type GoogleSheetConflictConfirm = {
  file: GoogleSheetRosterFile;
  lastKnownRemoteModifiedAt?: string;
};

type GoogleSheetDeleteConfirm = {
  file: GoogleSheetRosterFile;
};

function readStoredDriveRecipients(): DriveBackupRecipient[] {
  try {
    const raw = window.localStorage.getItem(DRIVE_RECIPIENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        id: typeof item?.id === "string" ? item.id : `recipient_${index}_${Date.now()}`,
        name: typeof item?.name === "string" ? item.name.trim() : "",
        email: typeof item?.email === "string" ? item.email.trim().toLowerCase() : "",
      }))
      .filter((item) => item.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.email));
  } catch {
    return [];
  }
}

function writeStoredDriveRecipients(recipients: DriveBackupRecipient[]) {
  try {
    window.localStorage.setItem(DRIVE_RECIPIENTS_STORAGE_KEY, JSON.stringify(recipients));
  } catch {
    // Local recipient storage is optional.
  }
}

function readStoredActiveDriveBackup(): ActiveDriveBackupFile | null {
  try {
    const raw = window.localStorage.getItem(DRIVE_ACTIVE_BACKUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.name) return null;
    return {
      id: String(parsed.id),
      name: String(parsed.name),
      webViewLink: typeof parsed.webViewLink === "string" ? parsed.webViewLink : undefined,
      modifiedTime: typeof parsed.modifiedTime === "string" ? parsed.modifiedTime : undefined,
      ownedByMe: typeof parsed.ownedByMe === "boolean" ? parsed.ownedByMe : undefined,
      shared: typeof parsed.shared === "boolean" ? parsed.shared : undefined,
      rosterCount: Number.isFinite(Number(parsed.rosterCount)) ? Number(parsed.rosterCount) : undefined,
      playerCount: Number.isFinite(Number(parsed.playerCount)) ? Number(parsed.playerCount) : undefined,
      checkedAt: typeof parsed.checkedAt === "string" ? parsed.checkedAt : undefined,
      connectedEmail: typeof parsed.connectedEmail === "string" ? parsed.connectedEmail : undefined,
    };
  } catch {
    return null;
  }
}

function writeStoredActiveDriveBackup(file: ActiveDriveBackupFile | null) {
  try {
    if (!file) {
      window.localStorage.removeItem(DRIVE_ACTIVE_BACKUP_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(DRIVE_ACTIVE_BACKUP_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // Safety backup file storage is optional.
  }
}

function countBackupRosters(rosters: RoomRoster[]): DriveBackupSummary {
  return {
    rosterCount: rosters.length,
    playerCount: rosters.reduce((sum, roster) => sum + roster.players.length, 0),
  };
}

function formatBackupSummary(summary: DriveBackupSummary | null | undefined) {
  if (!summary) return "Unknown";
  return `${summary.rosterCount} roster${summary.rosterCount === 1 ? "" : "s"} · ${summary.playerCount} player${summary.playerCount === 1 ? "" : "s"}`;
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashVisible, setSplashVisible] = useState(false);

  useEffect(() => {
    const fadeIn = window.setTimeout(() => setSplashVisible(true), 50);
    const fadeOut = window.setTimeout(() => setSplashVisible(false), 2800);
    const finish = window.setTimeout(() => setShowSplash(false), 3000);

    return () => {
      window.clearTimeout(fadeIn);
      window.clearTimeout(fadeOut);
      window.clearTimeout(finish);
    };
  }, []);

  const [activeTab, setActiveTab] = useState("today");
  const [reviewPlayerQueue, setReviewPlayerQueue] = useState<string[]>([]);
  const [reviewPlayerIndex, setReviewPlayerIndex] = useState(0);
  const [reviewAutoOpenPlayerId, setReviewAutoOpenPlayerId] = useState<string | null>(null);
  const reviewActivePlayerId = reviewPlayerQueue[reviewPlayerIndex] ?? null;
  const startReviewPlayerQueue = (playerIds: string[]) => {
    const cleanIds = playerIds.filter(Boolean);
    if (cleanIds.length === 0) return;
    setReviewPlayerQueue(cleanIds);
    setReviewPlayerIndex(0);
    setReviewAutoOpenPlayerId(cleanIds[0]);
  };
  const finishReviewPlayerQueue = () => {
    setReviewPlayerQueue([]);
    setReviewPlayerIndex(0);
    setReviewAutoOpenPlayerId(null);
  };
  const openNextReviewPlayer = () => {
    const nextIndex = reviewPlayerIndex + 1;
    const nextPlayerId = reviewPlayerQueue[nextIndex];
    if (!nextPlayerId) {
      finishReviewPlayerQueue();
      return;
    }
    setReviewPlayerIndex(nextIndex);
    setReviewAutoOpenPlayerId(nextPlayerId);
  };
  const [todayOcrOpenToken, setTodayOcrOpenToken] = useState(0);
  const [ocrImportContext, setOcrImportContext] = useState<"today" | "roster">(
    "today",
  );
  const [rosterState, setRosterState] = useState(() => {
    const legacyName = readStoredGroupName();
    const shouldMigrateLegacyIdentity = !hasSavedRosterState();
    const legacyColor = shouldMigrateLegacyIdentity
      ? readStoredHeaderColor()
      : DEFAULT_HEADER_COLOR;
    const legacyLogo = shouldMigrateLegacyIdentity ? readStoredGroupLogo() : "";
    const loaded = loadRosterState(legacyName);
    return {
      ...loaded,
      rosters: loaded.rosters.map((roster, index) =>
        index === 0 && shouldMigrateLegacyIdentity
          ? {
              ...roster,
              themeColor: roster.themeColor || legacyColor,
              logo: roster.logo || legacyLogo,
            }
          : roster,
      ),
    };
  });
  const rosters = rosterState.rosters;
  const activeRosterId = rosterState.activeRosterId;
  const activeRoster =
    rosters.find((roster) => roster.id === activeRosterId) || rosters[0];
  const players = activeRoster?.players || [];
  const activeRosterName = activeRoster?.name || "Default roster";
  const headerColor = rosterThemeColor(activeRoster);
  const groupLogo = rosterLogo(activeRoster);
  const isEmptyStarterRoster =
    rosters.length === 1 && players.length === 0 && activeRosterName === EMPTY_ROSTER_NAME;
  const deviceBackupSummary = isEmptyStarterRoster ? { rosterCount: 0, playerCount: 0 } : countBackupRosters(rosters);
  const googleDriveConfig = getGoogleDriveConfig();
  const [googleDriveAccessToken, setGoogleDriveAccessToken] = useState("");
  const [googleDriveConnecting, setGoogleDriveConnecting] = useState(false);
  const [googleDriveSaving, setGoogleDriveSaving] = useState(false);
  const [googleDriveUpdating, setGoogleDriveUpdating] = useState(false);
  const [googleDriveOpening, setGoogleDriveOpening] = useState(false);
  const [currentDriveBackup, setCurrentDriveBackup] = useState<ActiveDriveBackupFile | null>(() => readStoredActiveDriveBackup());
  const [connectedDriveUser, setConnectedDriveUser] = useState<{ displayName?: string; emailAddress?: string } | null>(null);
  const [driveImportPreview, setDriveImportPreview] = useState<DriveImportPreview | null>(null);
  const [driveBackupChoices, setDriveBackupChoices] = useState<GoogleDriveBackupFileGroups | null>(null);
  const [driveBackupTab, setDriveBackupTab] = useState<DriveBackupTab>("mine");
  const [localImportPreview, setLocalImportPreview] = useState<LocalImportPreview | null>(null);
  const [rosterToolsNotice, setRosterToolsNotice] = useState<RosterToolsNotice | null>(null);
  const [driveShareOpen, setDriveShareOpen] = useState(false);
  const [driveShareEmail, setDriveShareEmail] = useState("");
  const [driveShareConfirm, setDriveShareConfirm] = useState<DriveShareConfirm | null>(null);
  const [driveRecipients, setDriveRecipients] = useState<DriveBackupRecipient[]>(() => readStoredDriveRecipients());
  const [selectedDriveRecipientIds, setSelectedDriveRecipientIds] = useState<string[]>([]);
  const [driveRecipientName, setDriveRecipientName] = useState("");
  const [googleDriveSharing, setGoogleDriveSharing] = useState(false);
  const [driveAccessOpen, setDriveAccessOpen] = useState(false);
  const [driveAccessList, setDriveAccessList] = useState<GoogleDrivePermissionResult[] | null>(null);
  const [driveAccessLoading, setDriveAccessLoading] = useState(false);
  const [driveRemoveConfirm, setDriveRemoveConfirm] = useState<DriveRemoveAccessConfirm | null>(null);
  const [driveRemovingPermissionId, setDriveRemovingPermissionId] = useState("");
  const [driveHelpOpen, setDriveHelpOpen] = useState(false);
  const [driveUpdateConfirm, setDriveUpdateConfirm] = useState<DriveUpdateConfirm | null>(null);
  const [googleSheetSyncing, setGoogleSheetSyncing] = useState(false);
  const [googleSheetOpening, setGoogleSheetOpening] = useState(false);
  const [googleSheetSharing, setGoogleSheetSharing] = useState(false);
  const [googleSheetChoices, setGoogleSheetChoices] = useState<GoogleSheetRosterFile[] | null>(null);
  const [googleSheetActionFile, setGoogleSheetActionFile] = useState<GoogleSheetRosterFile | null>(null);
  const [googleSheetOwnerEmailVisible, setGoogleSheetOwnerEmailVisible] = useState(false);
  const [googleSheetDeleteConfirm, setGoogleSheetDeleteConfirm] = useState<GoogleSheetDeleteConfirm | null>(null);
  const [googleSheetDeleteSlide, setGoogleSheetDeleteSlide] = useState(0);
  const [googleSheetDeleting, setGoogleSheetDeleting] = useState(false);
  const [googleSheetShareOpen, setGoogleSheetShareOpen] = useState(false);
  const [googleSheetShareEmail, setGoogleSheetShareEmail] = useState("");
  const [googleSheetConflictConfirm, setGoogleSheetConflictConfirm] = useState<GoogleSheetConflictConfirm | null>(null);
  const [googleSheetUpdatePrompt, setGoogleSheetUpdatePrompt] = useState<GoogleSheetConflictConfirm | null>(null);
  const [googleSheetUpdatePromptDismissedKey, setGoogleSheetUpdatePromptDismissedKey] = useState("");
  const googleDriveConnected = Boolean(googleDriveAccessToken);
  const googleDriveStatusText = !googleDriveConfig.isConfigured
    ? "Add Google Client ID and API key to .env.local"
    : googleDriveConnected
      ? "Connected to Google Drive"
      : "Ready to connect to Google Drive";
  const activeGoogleSheetSource =
    activeRoster?.cloudSource?.provider === "google-sheets"
      ? activeRoster.cloudSource
      : null;
  const activeRosterIsShared = Boolean(activeGoogleSheetSource?.spreadsheetId);
  const sharedGoogleSheetRosters = rosters.filter(
    (roster) => roster.cloudSource?.provider === "google-sheets" && Boolean(roster.cloudSource.spreadsheetId),
  );
  const sharedGoogleSheetRosterCount = sharedGoogleSheetRosters.length;
  const activeRosterActionName = activeRosterName.length > 18 ? "this roster" : activeRosterName;
  const sharedRosterCountLabel = `${sharedGoogleSheetRosterCount} shared roster${sharedGoogleSheetRosterCount === 1 ? "" : "s"}`;
  const activeRosterUpdatedAt = new Date(activeRoster?.updatedAt || "").getTime();
  const activeRosterLastSyncedAt = new Date(activeGoogleSheetSource?.lastSyncedAt || "").getTime();
  const activeSharedHasUnsavedChanges =
    activeRosterIsShared &&
    !Number.isNaN(activeRosterUpdatedAt) &&
    !Number.isNaN(activeRosterLastSyncedAt) &&
    activeRosterUpdatedAt > activeRosterLastSyncedAt + 10000;
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState(activeRosterName);
  const [draftHeaderColor, setDraftHeaderColor] = useState(headerColor);
  const [draftGroupLogo, setDraftGroupLogo] = useState(groupLogo);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [rosterFilesOpen, setRosterFilesOpen] = useState(false);
  const [rosterSharedToolsOpen, setRosterSharedToolsOpen] = useState(false);
  const [rosterLocalBackupToolsOpen, setRosterLocalBackupToolsOpen] = useState(false);
  const [rosterCloudBackupToolsOpen, setRosterCloudBackupToolsOpen] = useState(false);
  const [rosterPickerOpen, setRosterPickerOpen] = useState(false);
  const [rosterSwitchingName, setRosterSwitchingName] = useState("");
  const [clearRosterOpen, setClearRosterOpen] = useState(false);
  const [clearRosterSlide, setClearRosterSlide] = useState(0);
  const [newRosterName, setNewRosterName] = useState("");
  const [fileImportMode, setFileImportMode] = useState<"shared" | "backup">(
    "shared",
  );
  const rosterToolsActivePanel = rosterLocalBackupToolsOpen
    ? "local"
    : rosterCloudBackupToolsOpen
      ? "cloud"
      : rosterSharedToolsOpen
        ? "shared"
        : null;
  const openRosterToolsPanel = (panel: "local" | "cloud" | "shared") => {
    setRosterLocalBackupToolsOpen(panel === "local");
    setRosterCloudBackupToolsOpen(panel === "cloud");
    setRosterSharedToolsOpen(panel === "shared");
  };
  const closeRosterToolsPanel = () => {
    setRosterLocalBackupToolsOpen(false);
    setRosterCloudBackupToolsOpen(false);
    setRosterSharedToolsOpen(false);
  };

  const showRosterToolsNotice = (title: string, message: string, tone: RosterToolsNotice["tone"] = "info") => {
    setRosterToolsNotice({ title, message, tone });
  };

  const rememberDriveBackup = (file: GoogleDriveFileResult, summary?: DriveBackupSummary) => {
    const next: ActiveDriveBackupFile = {
      ...currentDriveBackup,
      ...file,
      rosterCount: summary?.rosterCount ?? currentDriveBackup?.rosterCount,
      playerCount: summary?.playerCount ?? currentDriveBackup?.playerCount,
      checkedAt: new Date().toISOString(),
      connectedEmail: connectedDriveUser?.emailAddress || currentDriveBackup?.connectedEmail,
    };
    setCurrentDriveBackup(next);
  };

  const formatDriveModifiedTime = (value?: string) => {
    if (!value) return "Updated time unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Updated time unknown";
    return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  };

  const firstDisplayName = (value?: string) => {
    const clean = (value || "").trim().replace(/\s+/g, " ");
    if (!clean || clean.includes("@")) return "";
    return clean.split(" ")[0] || clean;
  };

  const maskEmail = (value?: string) => {
    const clean = (value || "").trim();
    const atIndex = clean.indexOf("@");
    if (atIndex <= 0) return "";
    const local = clean.slice(0, atIndex);
    const domain = clean.slice(atIndex + 1);
    if (!domain) return "";
    return `${local.slice(0, 1)}***@${domain}`;
  };

  const getGoogleSheetOwner = (file?: GoogleSheetRosterFile | null) => {
    if (!file) return null;
    return file.owners?.[0] || file.sharingUser || null;
  };

  const isGoogleSheetOwnedByMe = (file?: GoogleSheetRosterFile | null) => {
    if (!file) return false;
    if (file.ownedByMe === true) return true;
    const owner = getGoogleSheetOwner(file);
    return owner?.me === true;
  };

  const getGoogleSheetOwnerLabel = (file?: GoogleSheetRosterFile | null) => {
    if (!file) return "Owner unknown";
    const owner = getGoogleSheetOwner(file);
    if (isGoogleSheetOwnedByMe(file)) return "Owner: You";
    const displayName = firstDisplayName(owner?.displayName);
    if (displayName) return `Owner: ${displayName}`;
    const maskedEmail = maskEmail(owner?.emailAddress);
    if (maskedEmail) return `Owner: ${maskedEmail}`;
    return "Owner: Another organizer";
  };

  const getGoogleSheetOwnerEmail = (file?: GoogleSheetRosterFile | null) => {
    if (isGoogleSheetOwnedByMe(file)) return "";
    const owner = getGoogleSheetOwner(file);
    return owner?.emailAddress?.trim() || "";
  };

  const formatSheetSyncTime = (value?: string) => {
    if (!value) return "Not synced yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sync time unknown";
    return `Synced ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  };

  const formatSheetModifiedTime = (value?: string) => {
    if (!value) return "unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown time";
    return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  };

  const isGoogleSheetRemoteNewer = (remoteModifiedAt?: string, lastKnownRemoteModifiedAt?: string) => {
    if (!remoteModifiedAt || !lastKnownRemoteModifiedAt) return false;
    const remoteTime = new Date(remoteModifiedAt).getTime();
    const knownTime = new Date(lastKnownRemoteModifiedAt).getTime();
    if (Number.isNaN(remoteTime) || Number.isNaN(knownTime)) return false;
    return remoteTime > knownTime + 3000;
  };

  const sheetCloudSourceFromFile = (file: GoogleSheetRosterFile) => ({
    provider: "google-sheets" as const,
    spreadsheetId: file.id,
    spreadsheetName: file.name,
    webViewLink: file.webViewLink,
    lastSyncedAt: new Date().toISOString(),
    lastRemoteModifiedAt: file.modifiedTime,
    syncMode: "manual" as const,
  });

  const googleSheetPromptKey = (spreadsheetId?: string, modifiedTime?: string) =>
    spreadsheetId && modifiedTime ? `${spreadsheetId}:${modifiedTime}` : "";

  useEffect(() => {
    if (!rosterSharedToolsOpen || !googleDriveAccessToken || !activeGoogleSheetSource?.spreadsheetId) return;
    if (!activeGoogleSheetSource.lastRemoteModifiedAt || activeSharedHasUnsavedChanges) return;

    let cancelled = false;
    const spreadsheetId = activeGoogleSheetSource.spreadsheetId;
    const lastRemoteModifiedAt = activeGoogleSheetSource.lastRemoteModifiedAt;

    const checkSharedRosterChanges = async () => {
      try {
        const latestFile = await getGoogleSheetRosterFileMetadata(googleDriveAccessToken, spreadsheetId);
        const promptKey = googleSheetPromptKey(spreadsheetId, latestFile.modifiedTime);
        if (
          !cancelled &&
          promptKey !== googleSheetUpdatePromptDismissedKey &&
          isGoogleSheetRemoteNewer(latestFile.modifiedTime, lastRemoteModifiedAt)
        ) {
          setGoogleSheetUpdatePrompt({
            file: latestFile,
            lastKnownRemoteModifiedAt: lastRemoteModifiedAt,
          });
        }
      } catch {
        // Do not interrupt the user for background change checks.
      }
    };

    void checkSharedRosterChanges();
    return () => {
      cancelled = true;
    };
  }, [rosterSharedToolsOpen, googleDriveAccessToken, activeGoogleSheetSource?.spreadsheetId, activeGoogleSheetSource?.lastRemoteModifiedAt, activeSharedHasUnsavedChanges, googleSheetUpdatePromptDismissedKey]);

  const describeDriveFileSource = (file: GoogleDriveFileResult, tab: DriveBackupTab) => {
    if (tab === "shared") {
      const sharedBy = file.sharingUser?.displayName || file.sharingUser?.emailAddress;
      return sharedBy ? `Shared by ${sharedBy}` : "Shared with me";
    }
    return "My Drive";
  };

  const normalizeShareEmail = (value: string) => value.trim().toLowerCase();

  const validateShareEmail = (value: string) => {
    const email = normalizeShareEmail(value);
    if (!email) return "Enter one email address.";
    if (email.includes(",") || email.includes(";")) return "Enter only one email address for now.";
    if (/\s/.test(email)) return "Remove spaces from the email address.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email address.";
    return "";
  };

  const formatDrivePermissionRole = (role: string) => {
    if (role === "owner") return "Owner";
    if (role === "writer") return "Editor";
    if (role === "commenter") return "Commenter";
    if (role === "reader") return "Viewer";
    return role || "Access";
  };

  const drivePermissionIsInherited = (permission: GoogleDrivePermissionResult) =>
    Boolean(permission.permissionDetails?.some((detail) => detail.inherited));

  const drivePermissionLabel = (permission: GoogleDrivePermissionResult) =>
    permission.emailAddress || permission.displayName ||
    (permission.type === "anyone" ? "Anyone with the link" : permission.type === "domain" ? "Domain access" : "Unknown access");

  const canRemoveDrivePermission = (permission: GoogleDrivePermissionResult) =>
    permission.id &&
    permission.role !== "owner" &&
    permission.type === "user" &&
    !permission.deleted &&
    !drivePermissionIsInherited(permission);

  const downloadAllRostersBackup = () => {
    downloadText(
      `fair-teams-all-rosters-backup.json`,
      rostersToBackupJson(rosters, activeRosterId),
      "application/json;charset=utf-8",
    );
  };

  useEffect(() => {
    saveRosterState(rosterState);
  }, [rosterState]);

  useEffect(() => {
    writeStoredDriveRecipients(driveRecipients);
  }, [driveRecipients]);

  useEffect(() => {
    writeStoredActiveDriveBackup(currentDriveBackup);
  }, [currentDriveBackup]);

  useEffect(() => {
    const shouldLockScroll =
      groupSettingsOpen ||
      rosterFilesOpen ||
      rosterPickerOpen ||
      clearRosterOpen ||
      Boolean(driveImportPreview) ||
      Boolean(driveBackupChoices) ||
      Boolean(localImportPreview) ||
      Boolean(rosterToolsNotice) ||
      driveShareOpen ||
      Boolean(driveShareConfirm) ||
      driveAccessOpen ||
      Boolean(driveRemoveConfirm) ||
      driveHelpOpen ||
      Boolean(driveUpdateConfirm) ||
      Boolean(googleSheetChoices) ||
      Boolean(googleSheetActionFile) ||
      Boolean(googleSheetDeleteConfirm) ||
      googleSheetShareOpen ||
      Boolean(googleSheetConflictConfirm) ||
      Boolean(googleSheetUpdatePrompt);
    if (!shouldLockScroll) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [groupSettingsOpen, rosterFilesOpen, rosterPickerOpen, clearRosterOpen, driveImportPreview, driveBackupChoices, localImportPreview, rosterToolsNotice, driveShareOpen, driveShareConfirm, driveAccessOpen, driveRemoveConfirm, driveHelpOpen, driveUpdateConfirm, googleSheetChoices, googleSheetActionFile, googleSheetDeleteConfirm, googleSheetShareOpen, googleSheetConflictConfirm, googleSheetUpdatePrompt]);

  const openGroupSettings = () => {
    setDraftGroupName(activeRosterName);
    setDraftHeaderColor(headerColor);
    setDraftGroupLogo(groupLogo);
    setGroupSettingsOpen(true);
  };

  const saveGroupSettings = () => {
    setRosterState((current) => {
      const currentRoster =
        current.rosters.find(
          (roster) => roster.id === current.activeRosterId,
        ) || current.rosters[0];
      const nextName = uniqueRosterName(
        draftGroupName || currentRoster?.name || DEFAULT_GROUP_NAME,
        current.rosters.filter(
          (roster) => roster.id !== current.activeRosterId,
        ),
      );
      return {
        ...current,
        rosters: current.rosters.map((roster) =>
          roster.id === current.activeRosterId
            ? {
                ...roster,
                name: nextName,
                themeColor: draftHeaderColor,
                logo: draftGroupLogo,
                updatedAt: new Date().toISOString(),
              }
            : roster,
        ),
      };
    });
    setGroupSettingsOpen(false);
  };

  const cancelGroupSettings = () => {
    setDraftGroupName(activeRosterName);
    setDraftHeaderColor(headerColor);
    setDraftGroupLogo(groupLogo);
    setGroupSettingsOpen(false);
  };

  const headerDisplayName = activeRosterName || "Fair Teams";
  const isWhiteHeaderColor = headerColor.toLowerCase() === "#ffffff";
  const identityAccentColor = isWhiteHeaderColor ? "#E2E8F0" : headerColor;
  const logoRingStyle = {
    borderColor: isWhiteHeaderColor ? "#E2E8F0" : headerColor,
    boxShadow: isWhiteHeaderColor
      ? "0 1px 2px rgba(15, 23, 42, 0.08)"
      : `0 0 0 2px ${hexToRgba(headerColor, 0.14)}`,
  } as React.CSSProperties;

  useEffect(() => {
    setDraftGroupName(activeRosterName);
    setDraftHeaderColor(headerColor);
    setDraftGroupLogo(groupLogo);
  }, [activeRosterName, headerColor, groupLogo]);

  const replacePlayers = (nextPlayers: RoomPlayer[]) => {
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? {
              ...roster,
              players: nextPlayers.map((player, index) =>
                normalizePlayer(player, index),
              ),
              updatedAt: new Date().toISOString(),
            }
          : roster,
      ),
    }));
  };

  const switchRoster = (rosterId: string) => {
    setRosterState((current) =>
      current.rosters.some((roster) => roster.id === rosterId)
        ? { ...current, activeRosterId: rosterId }
        : current,
    );
  };

  const switchRosterWithPause = (roster: RoomRoster) => {
    if (roster.id === activeRosterId) {
      setRosterPickerOpen(false);
      return;
    }
    setRosterPickerOpen(false);
    setRosterSwitchingName(roster.name);
    window.setTimeout(() => {
      switchRoster(roster.id);
      setRosterSwitchingName("");
    }, 520);
  };

  const createNewRoster = () => {
    const isReplacingStarter =
      rosters.length === 1 &&
      players.length === 0 &&
      activeRosterName === EMPTY_ROSTER_NAME;
    const name = uniqueRosterName(
      newRosterName || (isReplacingStarter ? "Roster 1" : `Roster ${rosters.length + 1}`),
      isReplacingStarter ? [] : rosters,
    );
    const roster = createRoster(name, []);
    setRosterState((current) => {
      const currentIsStarter =
        current.rosters.length === 1 &&
        current.rosters[0]?.players.length === 0 &&
        current.rosters[0]?.name === EMPTY_ROSTER_NAME;
      return currentIsStarter
        ? { rosters: [roster], activeRosterId: roster.id }
        : { rosters: [...current.rosters, roster], activeRosterId: roster.id };
    });
    setNewRosterName("");
    setRosterFilesOpen(false);
  };

  const connectGoogleDrive = async () => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before using Google Drive backup.", "warning");
      return;
    }

    setGoogleDriveConnecting(true);
    try {
      const result = await requestGoogleDriveAccessToken(googleDriveAccessToken ? "" : "consent");
      setGoogleDriveAccessToken(result.accessToken);
      try {
        const user = await getGoogleDriveUserSummary(result.accessToken);
        setConnectedDriveUser(user);
        if (currentDriveBackup && user.emailAddress) {
          setCurrentDriveBackup((file) => file ? { ...file, connectedEmail: user.emailAddress } : file);
        }
      } catch {
        setConnectedDriveUser(null);
      }
      showRosterToolsNotice("Google Drive connected", "Your browser session is now connected to Google Drive.", "success");
    } catch (error) {
      showRosterToolsNotice("Could not connect Google Drive", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveConnecting(false);
    }
  };

  const disconnectGoogleDrive = () => {
    setGoogleDriveAccessToken("");
    setConnectedDriveUser(null);
    setCurrentDriveBackup(null);
    showRosterToolsNotice("Google Drive disconnected", "This browser session is no longer connected to Google Drive.", "info");
  };

  const preserveLocalImagesForDriveRosters = (
    incomingRosters: RoomRoster[],
    existingRosters: RoomRoster[],
  ) => {
    const rosterNameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
    const playerNameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

    return incomingRosters.map((incomingRoster, rosterIndex) => {
      const matchingRoster =
        existingRosters.find((roster) => roster.id === incomingRoster.id) ||
        existingRosters.find((roster) => rosterNameKey(roster.name) === rosterNameKey(incomingRoster.name));
      const existingPlayers = matchingRoster?.players || [];

      const playersWithLocalPhotos = incomingRoster.players.map((player, playerIndex) => {
        const matchingPlayer =
          existingPlayers.find((existingPlayer) => existingPlayer.id === player.id) ||
          existingPlayers.find((existingPlayer) => playerNameKey(existingPlayer.name) === playerNameKey(player.name));
        return normalizePlayer(
          {
            ...player,
            profilePhoto: player.profilePhoto || matchingPlayer?.profilePhoto,
          },
          playerIndex,
        );
      });

      return normalizeRoster(
        {
          ...incomingRoster,
          logo: incomingRoster.logo || matchingRoster?.logo,
          players: playersWithLocalPhotos,
        },
        rosterIndex,
      );
    });
  };

  const addDriveImportedRosters = (incomingRosters: RoomRoster[]) => {
    setRosterState((current) => {
      const currentIsStarter =
        current.rosters.length === 1 &&
        current.rosters[0]?.players.length === 0 &&
        current.rosters[0]?.name === EMPTY_ROSTER_NAME;
      const nextRosters = currentIsStarter ? [] : [...current.rosters];
      const prepared = preserveLocalImagesForDriveRosters(incomingRosters, current.rosters);
      const added = prepared.map((roster) => {
        const copied = createRoster(
          uniqueRosterName(roster.name, nextRosters),
          roster.players,
          { themeColor: roster.themeColor, logo: roster.logo },
        );
        nextRosters.push(copied);
        return copied;
      });

      return {
        rosters: nextRosters,
        activeRosterId: added[0]?.id || current.activeRosterId,
      };
    });
  };

  const replaceWithDriveImportedRosters = (incomingRosters: RoomRoster[], incomingActiveRosterId?: string) => {
    setRosterState((current) => {
      const prepared = preserveLocalImagesForDriveRosters(incomingRosters, current.rosters);
      if (prepared.length === 0) {
        const empty = createRoster(EMPTY_ROSTER_NAME, []);
        return { rosters: [empty], activeRosterId: empty.id };
      }
      const activeId = incomingActiveRosterId && prepared.some((roster) => roster.id === incomingActiveRosterId)
        ? incomingActiveRosterId
        : prepared[0].id;
      return { rosters: prepared, activeRosterId: activeId };
    });
  };

  const previewGoogleDriveBackupFile = async (picked: { id: string; name: string; mimeType?: string }) => {
    if (!picked.name.toLowerCase().endsWith(".json") && picked.mimeType !== "application/json") {
      showRosterToolsNotice("Choose a Fair Teams backup", "Please select a Fair Teams .json backup file.", "warning");
      return;
    }

    setDriveBackupChoices(null);
    setGoogleDriveOpening(true);
    try {
      const { file, text } = await readGoogleDriveJsonFile(googleDriveAccessToken, picked.id);
      const backup = parseDriveBackupJson(text);
      const rosterCount = backup.rosters.length;
      const playerCount = backup.rosters.reduce((sum, roster) => sum + roster.players.length, 0);

      setDriveImportPreview({
        file,
        rosters: backup.rosters,
        activeRosterId: backup.activeRosterId,
        rosterCount,
        playerCount,
        rosterNames: backup.rosters.map((roster) => roster.name),
      });
    } catch (error) {
      showRosterToolsNotice("Could not open Google Drive backup", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveOpening(false);
    }
  };

  const openGoogleDriveBackup = async () => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before using Google Drive backup.", "warning");
      return;
    }
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before using Drive backup.", "warning");
      return;
    }

    setGoogleDriveOpening(true);
    try {
      const groups = await listGoogleDriveBackupFileGroups(googleDriveAccessToken);
      setDriveBackupChoices(groups);
      setDriveBackupTab(groups.mine.length > 0 ? "mine" : "shared");
    } catch (error) {
      showRosterToolsNotice("Could not list Google Drive backups", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveOpening(false);
    }
  };

  const closeDriveImportPreview = () => {
    setDriveImportPreview(null);
  };

  const confirmAddDriveImport = () => {
    if (!driveImportPreview) return;
    addDriveImportedRosters(driveImportPreview.rosters);
    rememberDriveBackup(driveImportPreview.file, { rosterCount: driveImportPreview.rosterCount, playerCount: driveImportPreview.playerCount });
    const rosterCount = driveImportPreview.rosterCount;
    setDriveImportPreview(null);
    showRosterToolsNotice("Google Drive import complete", `Added ${rosterCount} roster${rosterCount === 1 ? "" : "s"} from Google Drive.`, "success");
  };

  const confirmReplaceDriveImport = () => {
    if (!driveImportPreview) return;
    replaceWithDriveImportedRosters(driveImportPreview.rosters, driveImportPreview.activeRosterId);
    rememberDriveBackup(driveImportPreview.file, { rosterCount: driveImportPreview.rosterCount, playerCount: driveImportPreview.playerCount });
    const rosterCount = driveImportPreview.rosterCount;
    setDriveImportPreview(null);
    showRosterToolsNotice("Google Drive import complete", `Replaced local rosters with ${rosterCount} roster${rosterCount === 1 ? "" : "s"} from Google Drive.`, "success");
  };


  const createNewGoogleDriveBackupCopy = async (successTitle = "Saved to Google Drive") => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before using Google Drive backup.", "warning");
      return;
    }
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before using Drive backup.", "warning");
      return;
    }
    if (isEmptyStarterRoster) {
      showRosterToolsNotice("No roster yet", "Create or import a roster first, then save it to Google Drive.", "warning");
      return;
    }

    setGoogleDriveSaving(true);
    try {
      const jsonText = allRostersToDriveBackupJson(rosterState);
      const file = await createGoogleDriveJsonFile(
        googleDriveAccessToken,
        allRostersDriveBackupFilename(rosters),
        jsonText,
      );
      rememberDriveBackup(file, deviceBackupSummary);
      const openText = file.webViewLink ? "\n\nThis is now the active Drive backup." : "";
      showRosterToolsNotice(successTitle, `${file.name}${openText}`, "success");
    } catch (error) {
      showRosterToolsNotice("Could not save to Google Drive", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveSaving(false);
    }
  };

  const prepareDriveBackupUpdate = async () => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before using Google Drive backup.", "warning");
      return;
    }
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before using Drive backup.", "warning");
      return;
    }
    if (!currentDriveBackup) {
      await createNewGoogleDriveBackupCopy();
      return;
    }
    if (isEmptyStarterRoster) {
      showRosterToolsNotice("No roster yet", "Create or import a roster first, then update the Drive backup.", "warning");
      return;
    }

    setGoogleDriveUpdating(true);
    try {
      let previous: DriveBackupSummary | null = currentDriveBackup.rosterCount !== undefined && currentDriveBackup.playerCount !== undefined
        ? { rosterCount: currentDriveBackup.rosterCount, playerCount: currentDriveBackup.playerCount }
        : null;
      let fileDetails: GoogleDriveFileResult = currentDriveBackup;
      let readFailed = false;

      try {
        const { file, text } = await readGoogleDriveJsonFile(googleDriveAccessToken, currentDriveBackup.id);
        const backup = parseDriveBackupJson(text);
        fileDetails = file;
        previous = countBackupRosters(backup.rosters);
      } catch {
        readFailed = true;
      }

      setDriveUpdateConfirm({
        file: {
          ...currentDriveBackup,
          ...fileDetails,
          rosterCount: previous?.rosterCount ?? currentDriveBackup.rosterCount,
          playerCount: previous?.playerCount ?? currentDriveBackup.playerCount,
          checkedAt: new Date().toISOString(),
          connectedEmail: connectedDriveUser?.emailAddress || currentDriveBackup.connectedEmail,
        },
        previous,
        next: deviceBackupSummary,
        checkedAt: new Date().toISOString(),
        readFailed,
      });
    } finally {
      setGoogleDriveUpdating(false);
    }
  };

  const saveAllRostersToGoogleDrive = async () => {
    if (currentDriveBackup) {
      await prepareDriveBackupUpdate();
      return;
    }
    await createNewGoogleDriveBackupCopy();
  };

  const saveDriveBackupAsNewCopy = async () => {
    await createNewGoogleDriveBackupCopy("Saved as new Drive copy");
  };

  const confirmUpdateCurrentGoogleDriveBackup = async () => {
    if (!driveUpdateConfirm) return;
    setGoogleDriveUpdating(true);
    try {
      const jsonText = allRostersToDriveBackupJson(rosterState);
      const file = await updateGoogleDriveJsonFile(
        googleDriveAccessToken,
        driveUpdateConfirm.file.id,
        jsonText,
      );
      rememberDriveBackup(file, deviceBackupSummary);
      setDriveUpdateConfirm(null);
      showRosterToolsNotice("Drive backup updated", `${file.name}\n\nNow contains ${formatBackupSummary(deviceBackupSummary)}.`, "success");
    } catch (error) {
      showRosterToolsNotice("Could not update Google Drive backup", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveUpdating(false);
    }
  };

  const updateCurrentGoogleDriveBackup = prepareDriveBackupUpdate;

  const isMissingSharedRosterError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "");
    return /shared roster file not found|file not found|not found|requested entity was not found|404/i.test(message);
  };

  const removeActiveRosterGoogleSheetLink = () => {
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) => {
        if (roster.id !== current.activeRosterId) return roster;
        const { cloudSource: _cloudSource, ...localRoster } = roster;
        return normalizeRoster({
          ...localRoster,
          updatedAt: new Date().toISOString(),
        });
      }),
    }));
  };

  const handleMissingActiveGoogleSheetLink = () => {
    removeActiveRosterGoogleSheetLink();
    showRosterToolsNotice(
      "Shared file not found",
      "This Google account cannot find the linked shared roster. It may have been deleted, moved to trash, or not shared with this account. Fair Teams kept the local roster on this device and removed the broken link. Use Open a shared roster to connect again.",
      "warning",
    );
  };

  const updateActiveRosterGoogleSheetSource = (file: GoogleSheetRosterFile) => {
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? normalizeRoster({
              ...roster,
              cloudSource: sheetCloudSourceFromFile(file),
              updatedAt: new Date().toISOString(),
            })
          : roster,
      ),
    }));
  };

  const disconnectActiveRosterFromGoogleSheet = () => {
    if (!activeGoogleSheetSource?.spreadsheetId) {
      showRosterToolsNotice("No shared roster linked", "This roster is already saved only on this device.", "info");
      return;
    }
    const confirmed = window.confirm(
      `Disconnect this roster from the shared Google Sheet?

The Google Sheet will not be deleted. This device will keep a local copy of the roster.`,
    );
    if (!confirmed) return;

    removeActiveRosterGoogleSheetLink();
    showRosterToolsNotice(
      "Shared roster disconnected",
      "This device now keeps a local copy only. The Google Sheet still exists and can be opened again later.",
      "success",
    );
  };

  const makeActiveRosterShared = async () => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before creating a shared roster.", "warning");
      return;
    }
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before creating a shared roster.", "warning");
      return;
    }
    if (!activeRoster || isEmptyStarterRoster) {
      showRosterToolsNotice("No roster yet", "Create or import a roster first, then make it shared.", "warning");
      return;
    }

    setGoogleSheetSyncing(true);
    try {
      const file = await createGoogleSheetRoster(googleDriveAccessToken, activeRoster);
      updateActiveRosterGoogleSheetSource(file);
      showRosterToolsNotice(
        "Shared roster created",
        `${activeRoster.name} is now linked to a Google Sheet. Photos stay private on this device.`,
        "success",
      );
    } catch (error) {
      showRosterToolsNotice("Could not create shared roster", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetSyncing(false);
    }
  };

  const saveActiveRosterToGoogleSheet = async (options: { force?: boolean } = {}) => {
    if (!activeRoster) return;
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before saving a shared roster.", "warning");
      return;
    }
    if (!activeGoogleSheetSource?.spreadsheetId) {
      await makeActiveRosterShared();
      return;
    }
    if (activeRoster.players.length === 0) {
      showRosterToolsNotice(
        "Save blocked",
        "This shared roster has no players on this device. To avoid erasing it for everyone, get latest changes or disconnect it first.",
        "warning",
      );
      return;
    }

    setGoogleSheetSyncing(true);
    try {
      if (!options.force) {
        const latestFile = await getGoogleSheetRosterFileMetadata(
          googleDriveAccessToken,
          activeGoogleSheetSource.spreadsheetId,
        );
        if (isGoogleSheetRemoteNewer(latestFile.modifiedTime, activeGoogleSheetSource.lastRemoteModifiedAt)) {
          setGoogleSheetConflictConfirm({
            file: latestFile,
            lastKnownRemoteModifiedAt: activeGoogleSheetSource.lastRemoteModifiedAt,
          });
          return;
        }
      }

      const file = await updateGoogleSheetRoster(
        googleDriveAccessToken,
        activeGoogleSheetSource.spreadsheetId,
        activeRoster,
      );
      updateActiveRosterGoogleSheetSource(file);
      showRosterToolsNotice("Changes saved", "Your roster changes were saved for everyone using this shared roster.", "success");
    } catch (error) {
      if (isMissingSharedRosterError(error)) {
        handleMissingActiveGoogleSheetLink();
        return;
      }
      showRosterToolsNotice("Could not save shared roster", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetSyncing(false);
    }
  };

  const getLatestAfterGoogleSheetConflict = async () => {
    setGoogleSheetConflictConfirm(null);
    await reloadActiveRosterFromGoogleSheet();
  };

  const overwriteGoogleSheetAfterConflict = async () => {
    setGoogleSheetConflictConfirm(null);
    await saveActiveRosterToGoogleSheet({ force: true });
  };

  const getLatestAfterGoogleSheetUpdatePrompt = async () => {
    setGoogleSheetUpdatePrompt(null);
    await reloadActiveRosterFromGoogleSheet();
  };

  const dismissGoogleSheetUpdatePrompt = () => {
    const file = googleSheetUpdatePrompt?.file;
    setGoogleSheetUpdatePromptDismissedKey(googleSheetPromptKey(file?.id, file?.modifiedTime));
    setGoogleSheetUpdatePrompt(null);
  };

  const reloadActiveRosterFromGoogleSheet = async () => {
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before reloading a shared roster.", "warning");
      return;
    }
    if (!activeGoogleSheetSource?.spreadsheetId) {
      showRosterToolsNotice("No shared roster linked", "Make this roster shared or open a shared roster first.", "warning");
      return;
    }

    setGoogleSheetOpening(true);
    try {
      const { file, roster } = await readGoogleSheetRoster(googleDriveAccessToken, activeGoogleSheetSource.spreadsheetId);
      setRosterState((current) => {
        const [withLocalImages] = preserveLocalImagesForDriveRosters([roster], current.rosters);
        const currentRoster = current.rosters.find((item) => item.id === current.activeRosterId);
        const nextRoster = normalizeRoster({
          ...withLocalImages,
          id: currentRoster?.id || withLocalImages.id,
          logo: withLocalImages.logo || currentRoster?.logo,
          cloudSource: sheetCloudSourceFromFile(file),
        });
        return {
          ...current,
          rosters: current.rosters.map((item) =>
            item.id === current.activeRosterId ? nextRoster : item,
          ),
          activeRosterId: nextRoster.id,
        };
      });
      showRosterToolsNotice("Latest changes loaded", "This device now has the latest shared roster. Local photos were preserved.", "success");
    } catch (error) {
      if (isMissingSharedRosterError(error)) {
        handleMissingActiveGoogleSheetLink();
        return;
      }
      showRosterToolsNotice("Could not reload shared roster", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetOpening(false);
    }
  };

  const saveAllSharedRostersToGoogleSheets = async () => {
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before saving shared rosters.", "warning");
      return;
    }

    const sharedRosters = rosters.filter(
      (roster) => roster.cloudSource?.provider === "google-sheets" && Boolean(roster.cloudSource.spreadsheetId),
    );

    if (sharedRosters.length === 0) {
      showRosterToolsNotice("No shared rosters", "Make or open a shared roster first.", "info");
      return;
    }

    setGoogleSheetSyncing(true);
    try {
      let savedCount = 0;
      let skippedEmptyCount = 0;
      const newerOnlineNames: string[] = [];
      const failedNames: string[] = [];
      const missingRosterIds = new Set<string>();
      const sourceUpdates = new Map<string, ReturnType<typeof sheetCloudSourceFromFile>>();

      for (const roster of sharedRosters) {
        const source = roster.cloudSource?.provider === "google-sheets" ? roster.cloudSource : null;
        const spreadsheetId = source?.spreadsheetId;
        if (!spreadsheetId) continue;

        if (roster.players.length === 0) {
          skippedEmptyCount += 1;
          continue;
        }

        try {
          const latestFile = await getGoogleSheetRosterFileMetadata(googleDriveAccessToken, spreadsheetId);
          if (isGoogleSheetRemoteNewer(latestFile.modifiedTime, source.lastRemoteModifiedAt)) {
            newerOnlineNames.push(roster.name);
            continue;
          }
          const file = await updateGoogleSheetRoster(googleDriveAccessToken, spreadsheetId, roster);
          sourceUpdates.set(roster.id, sheetCloudSourceFromFile(file));
          savedCount += 1;
        } catch (error) {
          if (isMissingSharedRosterError(error)) {
            missingRosterIds.add(roster.id);
          } else {
            failedNames.push(roster.name);
          }
        }
      }

      if (sourceUpdates.size > 0 || missingRosterIds.size > 0) {
        setRosterState((current) => ({
          ...current,
          rosters: current.rosters.map((roster) => {
            if (missingRosterIds.has(roster.id)) {
              const { cloudSource: _cloudSource, ...localRoster } = roster;
              return normalizeRoster({ ...localRoster, updatedAt: new Date().toISOString() });
            }
            const nextSource = sourceUpdates.get(roster.id);
            return nextSource
              ? normalizeRoster({ ...roster, cloudSource: nextSource, updatedAt: new Date().toISOString() })
              : roster;
          }),
        }));
      }

      const summaryLines = [
        savedCount > 0 ? `Saved ${savedCount} roster${savedCount === 1 ? "" : "s"}.` : "No rosters were saved.",
        newerOnlineNames.length > 0 ? `${newerOnlineNames.length} roster${newerOnlineNames.length === 1 ? " has" : "s have"} newer changes online. Get latest before saving: ${newerOnlineNames.slice(0, 3).join(", ")}${newerOnlineNames.length > 3 ? "…" : ""}` : "",
        skippedEmptyCount > 0 ? `Skipped ${skippedEmptyCount} empty shared roster${skippedEmptyCount === 1 ? "" : "s"} to avoid erasing shared data.` : "",
        missingRosterIds.size > 0 ? `Removed ${missingRosterIds.size} broken shared link${missingRosterIds.size === 1 ? "" : "s"} from this device.` : "",
        failedNames.length > 0 ? `Could not save: ${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? "…" : ""}` : "",
      ].filter(Boolean);

      showRosterToolsNotice(
        newerOnlineNames.length > 0 || failedNames.length > 0 || missingRosterIds.size > 0 ? "Shared roster save finished with notes" : "Shared rosters saved",
        summaryLines.join("\n"),
        newerOnlineNames.length > 0 || failedNames.length > 0 || missingRosterIds.size > 0 ? "warning" : "success",
      );
    } finally {
      setGoogleSheetSyncing(false);
    }
  };

  const getLatestForAllSharedRosters = async () => {
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before getting latest shared rosters.", "warning");
      return;
    }

    const sharedRosters = rosters.filter(
      (roster) => roster.cloudSource?.provider === "google-sheets" && Boolean(roster.cloudSource.spreadsheetId),
    );

    if (sharedRosters.length === 0) {
      showRosterToolsNotice("No shared rosters", "Make or open a shared roster first.", "info");
      return;
    }

    setGoogleSheetOpening(true);
    try {
      const loaded: { localRosterId: string; file: GoogleSheetRosterFile; roster: RoomRoster }[] = [];
      const missingRosterIds = new Set<string>();
      const failedNames: string[] = [];

      for (const roster of sharedRosters) {
        const source = roster.cloudSource?.provider === "google-sheets" ? roster.cloudSource : null;
        const spreadsheetId = source?.spreadsheetId;
        if (!spreadsheetId) continue;

        try {
          const latest = await readGoogleSheetRoster(googleDriveAccessToken, spreadsheetId);
          loaded.push({ localRosterId: roster.id, file: latest.file, roster: latest.roster });
        } catch (error) {
          if (isMissingSharedRosterError(error)) {
            missingRosterIds.add(roster.id);
          } else {
            failedNames.push(roster.name);
          }
        }
      }

      if (loaded.length > 0 || missingRosterIds.size > 0) {
        setRosterState((current) => {
          let nextRosters = current.rosters;
          loaded.forEach((item) => {
            const [withLocalImages] = preserveLocalImagesForDriveRosters([item.roster], nextRosters);
            const currentRoster = nextRosters.find((roster) => roster.id === item.localRosterId);
            const nextRoster = normalizeRoster({
              ...withLocalImages,
              id: currentRoster?.id || withLocalImages.id,
              logo: withLocalImages.logo || currentRoster?.logo,
              cloudSource: sheetCloudSourceFromFile(item.file),
            });
            nextRosters = nextRosters.map((roster) =>
              roster.id === item.localRosterId ? nextRoster : roster,
            );
          });
          if (missingRosterIds.size > 0) {
            nextRosters = nextRosters.map((roster) => {
              if (!missingRosterIds.has(roster.id)) return roster;
              const { cloudSource: _cloudSource, ...localRoster } = roster;
              return normalizeRoster({ ...localRoster, updatedAt: new Date().toISOString() });
            });
          }
          return { ...current, rosters: nextRosters };
        });
      }

      const summaryLines = [
        loaded.length > 0 ? `Got latest changes for ${loaded.length} roster${loaded.length === 1 ? "" : "s"}.` : "No rosters were updated.",
        missingRosterIds.size > 0 ? `Removed ${missingRosterIds.size} broken shared link${missingRosterIds.size === 1 ? "" : "s"} from this device.` : "",
        failedNames.length > 0 ? `Could not update: ${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? "…" : ""}` : "",
      ].filter(Boolean);

      showRosterToolsNotice(
        failedNames.length > 0 || missingRosterIds.size > 0 ? "Latest changes finished with notes" : "Latest changes received",
        summaryLines.join("\n"),
        failedNames.length > 0 || missingRosterIds.size > 0 ? "warning" : "success",
      );
    } finally {
      setGoogleSheetOpening(false);
    }
  };

  const openGoogleSheetRosterList = async () => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before opening shared rosters.", "warning");
      return;
    }
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before opening shared rosters.", "warning");
      return;
    }

    setGoogleSheetOpening(true);
    try {
      const files = await listGoogleSheetRosterFiles(googleDriveAccessToken);
      setGoogleSheetChoices(files);
    } catch (error) {
      showRosterToolsNotice("Could not list shared rosters", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetOpening(false);
    }
  };

  const openGoogleSheetRosterFile = async (picked: GoogleSheetRosterFile) => {
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before opening shared rosters.", "warning");
      return;
    }

    setGoogleSheetOpening(true);
    try {
      const { file, roster } = await readGoogleSheetRoster(googleDriveAccessToken, picked.id);
      setRosterState((current) => {
        const [withLocalImages] = preserveLocalImagesForDriveRosters([roster], current.rosters);
        const currentIsStarter =
          current.rosters.length === 1 &&
          current.rosters[0]?.players.length === 0 &&
          current.rosters[0]?.name === EMPTY_ROSTER_NAME;
        const existingIndex = current.rosters.findIndex(
          (item) =>
            (item.cloudSource?.provider === "google-sheets" && item.cloudSource.spreadsheetId === file.id) ||
            item.id === withLocalImages.id,
        );
        const baseRoster = normalizeRoster({
          ...withLocalImages,
          cloudSource: sheetCloudSourceFromFile(file),
        });

        if (currentIsStarter) {
          return { rosters: [baseRoster], activeRosterId: baseRoster.id };
        }

        if (existingIndex >= 0) {
          const previous = current.rosters[existingIndex];
          const nextRoster = normalizeRoster({
            ...baseRoster,
            id: previous.id,
            logo: baseRoster.logo || previous.logo,
          });
          return {
            rosters: current.rosters.map((item, index) =>
              index === existingIndex ? nextRoster : item,
            ),
            activeRosterId: nextRoster.id,
          };
        }

        const nextRoster = normalizeRoster({
          ...baseRoster,
          name: uniqueRosterName(baseRoster.name, current.rosters),
        });
        return {
          rosters: [...current.rosters, nextRoster],
          activeRosterId: nextRoster.id,
        };
      });
      setGoogleSheetChoices(null);
      setGoogleSheetOwnerEmailVisible(false);
      setGoogleSheetActionFile(null);
      setRosterFilesOpen(false);
      showRosterToolsNotice("Shared roster opened", `${file.name} is now available in Fair Teams.`, "success");
    } catch (error) {
      showRosterToolsNotice("Could not open shared roster", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetOpening(false);
    }
  };

  const closeGoogleSheetDeleteConfirm = () => {
    if (googleSheetDeleting) return;
    setGoogleSheetDeleteConfirm(null);
    setGoogleSheetDeleteSlide(0);
  };

  const startGoogleSheetDeleteConfirm = (file: GoogleSheetRosterFile) => {
    if (!isGoogleSheetOwnedByMe(file)) {
      showRosterToolsNotice(
        "Only the owner can delete it",
        "This shared roster belongs to another Google account. You can open it or remove your local copy, but only the owner can delete the shared Google Sheet.",
        "warning",
      );
      return;
    }
    setGoogleSheetOwnerEmailVisible(false);
    setGoogleSheetActionFile(null);
    setGoogleSheetDeleteSlide(0);
    setGoogleSheetDeleteConfirm({ file });
  };

  const confirmDeleteGoogleSheetRoster = async () => {
    if (googleSheetDeleteSlide < 95 || !googleSheetDeleteConfirm || googleSheetDeleting) return;
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with the owner account before deleting a shared roster.", "warning");
      return;
    }

    const file = googleSheetDeleteConfirm.file;
    setGoogleSheetDeleting(true);
    try {
      await trashGoogleSheetRoster(googleDriveAccessToken, file.id);
      setGoogleSheetChoices((choices) => choices ? choices.filter((item) => item.id !== file.id) : choices);
      setRosterState((current) => ({
        ...current,
        rosters: current.rosters.map((roster) => {
          if (roster.cloudSource?.provider === "google-sheets" && roster.cloudSource.spreadsheetId === file.id) {
            return normalizeRoster({ ...roster, cloudSource: undefined, updatedAt: new Date().toISOString() });
          }
          return roster;
        }),
      }));
      setGoogleSheetDeleteConfirm(null);
      setGoogleSheetDeleteSlide(0);
      showRosterToolsNotice(
        "Shared roster moved to trash",
        "The Google Sheet was moved to your Google Drive trash. Local copies already on devices are not deleted, but they are no longer linked to that shared roster.",
        "success",
      );
    } catch (error) {
      showRosterToolsNotice("Could not delete shared roster", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetDeleting(false);
    }
  };

  const openGoogleSheetShareModal = () => {
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before sharing this roster.", "warning");
      return;
    }
    if (!activeGoogleSheetSource?.spreadsheetId) {
      showRosterToolsNotice("Make it shared first", "Create a shared roster before adding another editor.", "warning");
      return;
    }
    setGoogleSheetShareEmail("");
    setGoogleSheetShareOpen(true);
  };

  const confirmGoogleSheetShare = async () => {
    const error = validateShareEmail(googleSheetShareEmail);
    if (error) {
      showRosterToolsNotice("Check email", error, "warning");
      return;
    }
    if (!activeGoogleSheetSource?.spreadsheetId) return;

    setGoogleSheetSharing(true);
    try {
      const email = normalizeShareEmail(googleSheetShareEmail);
      await shareGoogleSheetRosterWithEditor(
        googleDriveAccessToken,
        activeGoogleSheetSource.spreadsheetId,
        email,
      );
      setGoogleSheetShareOpen(false);
      setGoogleSheetShareEmail("");
      showRosterToolsNotice("Editor added", `${email} can now edit this shared roster through Fair Teams.`, "success");
    } catch (error) {
      if (isMissingSharedRosterError(error)) {
        handleMissingActiveGoogleSheetLink();
        setGoogleSheetShareOpen(false);
        return;
      }
      showRosterToolsNotice("Could not share roster", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetSharing(false);
    }
  };

  const openDriveShareModal = () => {
    if (!googleDriveConnected) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before sending a backup copy.", "warning");
      return;
    }
    if (isEmptyStarterRoster) {
      showRosterToolsNotice("No roster yet", "Create or import a roster first, then send a Drive backup copy.", "warning");
      return;
    }
    setDriveShareEmail("");
    setDriveRecipientName("");
    setDriveShareConfirm(null);
    setDriveShareOpen(true);
  };

  const addDriveRecipient = () => {
    const error = validateShareEmail(driveShareEmail);
    if (error) {
      showRosterToolsNotice("Check email", error, "warning");
      return;
    }
    const email = normalizeShareEmail(driveShareEmail);
    if (driveRecipients.some((recipient) => recipient.email === email)) {
      showRosterToolsNotice("Already saved", "That email is already in your send list.", "info");
      return;
    }
    const fallbackName = email.split("@")[0] || email;
    const recipient: DriveBackupRecipient = {
      id: `recipient_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: driveRecipientName.trim() || fallbackName,
      email,
    };
    setDriveRecipients((current) => [...current, recipient]);
    setSelectedDriveRecipientIds((current) => [...current, recipient.id]);
    setDriveRecipientName("");
    setDriveShareEmail("");
  };

  const removeDriveRecipient = (recipientId: string) => {
    setDriveRecipients((current) => current.filter((recipient) => recipient.id !== recipientId));
    setSelectedDriveRecipientIds((current) => current.filter((id) => id !== recipientId));
  };

  const toggleDriveRecipient = (recipientId: string) => {
    setSelectedDriveRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((id) => id !== recipientId)
        : [...current, recipientId],
    );
  };

  const prepareDriveShare = () => {
    const recipients = driveRecipients.filter((recipient) => selectedDriveRecipientIds.includes(recipient.id));
    if (recipients.length === 0) {
      showRosterToolsNotice("Choose recipients", "Select at least one saved person, or add a new email first.", "warning");
      return;
    }
    setDriveShareConfirm({ recipients });
  };

  const confirmDriveShare = async () => {
    if (!driveShareConfirm) return;
    setGoogleDriveSharing(true);
    try {
      const jsonText = allRostersToDriveBackupJson(rosterState);
      const file = await createGoogleDriveJsonFile(
        googleDriveAccessToken,
        allRostersDriveBackupFilename(rosters),
        jsonText,
      );
      await Promise.all(
        driveShareConfirm.recipients.map((recipient) =>
          shareGoogleDriveFileWithViewer(googleDriveAccessToken, file.id, recipient.email),
        ),
      );
      const names = driveShareConfirm.recipients.map((recipient) => recipient.name || recipient.email).join(", ");
      setDriveShareOpen(false);
      setDriveShareConfirm(null);
      showRosterToolsNotice(
        "Backup copy sent",
        `Created a new Drive backup copy and shared it with ${names}. Recipients can view/import the copy, but cannot edit your active backup file.`,
        "success",
      );
    } catch (error) {
      showRosterToolsNotice("Could not send backup copy", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveSharing(false);
    }
  };

  const loadDriveAccessList = async () => {
    if (!currentDriveBackup) return;
    setDriveAccessLoading(true);
    try {
      const permissions = await listGoogleDriveFilePermissions(googleDriveAccessToken, currentDriveBackup.id);
      setDriveAccessList(permissions.filter((permission) => !permission.deleted));
    } catch (error) {
      showRosterToolsNotice("Could not load sharing access", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setDriveAccessLoading(false);
    }
  };

  const openDriveAccessManager = async () => {
    if (!googleDriveConnected) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before managing Drive access.", "warning");
      return;
    }
    if (!currentDriveBackup) {
      showRosterToolsNotice("No Drive file selected", "Save or open a Drive backup first, then you can manage access to that selected file.", "warning");
      return;
    }
    setDriveAccessOpen(true);
    setDriveAccessList(null);
    await loadDriveAccessList();
  };

  const confirmRemoveDriveAccess = async () => {
    if (!driveRemoveConfirm || !currentDriveBackup) return;
    const permissionId = driveRemoveConfirm.permission.id;
    setDriveRemovingPermissionId(permissionId);
    try {
      await deleteGoogleDriveFilePermission(
        googleDriveAccessToken,
        currentDriveBackup.id,
        permissionId,
      );
      const removedLabel = driveRemoveConfirm.label;
      setDriveRemoveConfirm(null);
      setDriveAccessList((current) =>
        current ? current.filter((permission) => permission.id !== permissionId) : current,
      );
      showRosterToolsNotice("Access removed", `${removedLabel} can no longer access this Drive backup through this direct file permission.`, "success");
    } catch (error) {
      showRosterToolsNotice("Could not remove access", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setDriveRemovingPermissionId("");
    }
  };

  const exportSharedRoster = () => {
    if (!activeRoster) return;
    setRosterFilesOpen(false);
    downloadText(
      `fair-teams-${slugifyFilename(activeRoster.name)}.json`,
      rosterToShareJson(activeRoster),
      "application/json;charset=utf-8",
    );
  };

  const exportAllRostersBackup = () => {
    setRosterFilesOpen(false);
    downloadAllRostersBackup();
  };

  const openClearRoster = () => {
    setRosterFilesOpen(false);
    setRosterPickerOpen(false);
    setClearRosterSlide(0);
    setClearRosterOpen(true);
  };

  const openImportPicker = (mode: "shared" | "backup") => {
    setFileImportMode(mode);
    setRosterFilesOpen(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const addImportedRosters = (
    incomingRosters: RoomRoster[],
    mode: "shared" | "backup",
    sourceName: string,
  ) => {
    const normalizedIncoming = incomingRosters
      .map((roster) => ({
        ...roster,
        players: roster.players.map((player, playerIndex) =>
          normalizePlayer(player, playerIndex),
        ),
      }))
      .filter((roster) => roster.players.length > 0 || mode === "backup");

    if (normalizedIncoming.length === 0) {
      showRosterToolsNotice("Nothing to import", "No players or rosters were found in that file.", "warning");
      return;
    }

    setLocalImportPreview({
      mode,
      sourceName,
      rosters: normalizedIncoming,
      rosterCount: normalizedIncoming.length,
      playerCount: normalizedIncoming.reduce((sum, roster) => sum + roster.players.length, 0),
      rosterNames: normalizedIncoming.map((roster) => roster.name),
    });
  };

  const closeLocalImportPreview = () => {
    setLocalImportPreview(null);
  };

  const confirmLocalImport = () => {
    if (!localImportPreview) return;

    setRosterState((current) => {
      const currentIsStarter =
        current.rosters.length === 1 &&
        current.rosters[0]?.players.length === 0 &&
        current.rosters[0]?.name === EMPTY_ROSTER_NAME;
      const nextRosters = currentIsStarter ? [] : [...current.rosters];
      const added = localImportPreview.rosters.map((roster) => {
        const copied = createRoster(
          uniqueRosterName(roster.name, nextRosters),
          roster.players,
          { themeColor: roster.themeColor, logo: roster.logo },
        );
        nextRosters.push(copied);
        return copied;
      });
      return {
        rosters: nextRosters,
        activeRosterId: added[0]?.id || current.activeRosterId,
      };
    });

    const rosterCount = localImportPreview.rosterCount;
    const mode = localImportPreview.mode;
    setLocalImportPreview(null);
    showRosterToolsNotice(
      mode === "backup" ? "Backup imported" : "Roster imported",
      mode === "backup"
        ? `Added ${rosterCount} roster${rosterCount === 1 ? "" : "s"} from the backup file.`
        : `Added ${rosterCount} imported roster${rosterCount === 1 ? "" : "s"}.`,
      "success",
    );
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const importedRosters = parseRosterFile(text, file.name);
    addImportedRosters(importedRosters, fileImportMode, file.name);
  };

  const readLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file for the logo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraftGroupLogo(reader.result);
    };
    reader.onerror = () => alert("Could not read that logo image.");
    reader.readAsDataURL(file);
  };

  const closeClearRoster = () => {
    setClearRosterOpen(false);
    setClearRosterSlide(0);
  };

  const confirmClearRoster = () => {
    if (clearRosterSlide < 95) return;
    const removingSharedRoster = activeRosterIsShared;
    setRosterState((current) => {
      if (current.rosters.length <= 1) {
        const empty = createRoster(EMPTY_ROSTER_NAME, []);
        return { rosters: [empty], activeRosterId: empty.id };
      }
      const remaining = current.rosters.filter(
        (roster) => roster.id !== current.activeRosterId,
      );
      return {
        rosters: remaining,
        activeRosterId: remaining[0]?.id || current.activeRosterId,
      };
    });
    closeClearRoster();
    if (removingSharedRoster) {
      showRosterToolsNotice(
        "Shared roster removed from this device",
        "The Google Sheet was not changed or deleted. Open the shared roster again to get the latest version.",
        "success",
      );
    }
  };

  const visibleDriveBackupChoices = driveBackupChoices
    ? [...driveBackupChoices.mine, ...driveBackupChoices.shared]
    : [];
  const totalDriveBackupChoices = driveBackupChoices
    ? driveBackupChoices.mine.length + driveBackupChoices.shared.length
    : 0;

  if (showSplash) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white text-[#102A43] fairteams-splash-fade">
        <img
          src={fairTeamsLogo}
          alt="Fair Teams"
          className="w-24 h-24 object-contain mb-3"
        />
        <h1 className="text-4xl font-black tracking-tight leading-none">
          <span className="text-[#102A43]">FAIR</span>
          <span className="text-[#16A34A]"> TEAMS</span>
        </h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">
          Balanced teams. Better games.
        </p>
        <div className="mt-6 h-1 w-20 rounded-full bg-[#22C55E]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto relative shadow-2xl overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <header className="sticky top-0 z-30 border-b border-border bg-white px-4 pt-3 pb-2 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={
                  activeTab === "players" ? openGroupSettings : undefined
                }
                className={`group flex max-w-full min-w-0 items-center gap-2.5 text-left ${activeTab === "players" ? "transition-transform active:scale-[0.99]" : "cursor-default"}`}
                title={
                  activeTab === "players"
                    ? "Edit active roster name, logo, and color"
                    : activeRosterName
                }
                aria-label={
                  activeTab === "players"
                    ? "Edit active roster identity"
                    : `Current roster: ${activeRosterName}`
                }
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 bg-white shadow-sm"
                  style={logoRingStyle}
                >
                  <img
                    src={groupLogo || fairTeamsLogo}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="flex min-w-0 max-w-full items-center gap-1.5">
                  <h1 className="truncate text-[17px] font-black leading-tight tracking-tight text-[#102A43]">
                    {headerDisplayName}
                  </h1>
                  {activeTab === "players" && (
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-[#102A43]/45" />
                  )}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeTab === "teams" && (
                <span className="text-right text-[9px] font-extrabold leading-[0.95] text-slate-400 tracking-tight whitespace-nowrap">
                  <span className="block">Balanced teams.</span>
                  <span className="block">Better games.</span>
                </span>
              )}
              {activeTab !== "teams" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-xl border border-slate-200 bg-white/85 text-[#102A43] shadow-none"
                  onClick={() => setRosterFilesOpen(true)}
                  title="Roster tools"
                  aria-label="Roster tools"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    await importFile(file);
                  } catch (error) {
                    showRosterToolsNotice(
                      "Import failed",
                      error instanceof Error ? error.message : "Import failed.",
                      "error",
                    );
                  }
                }}
              />
            </div>
          </div>
          <div
            className="mx-1 mb-2 h-0.5 rounded-full"
            style={{ backgroundColor: identityAccentColor }}
          />

          <TabsList className="w-full h-11 bg-slate-100/90 grid grid-cols-3 rounded-2xl p-1 gap-1.5 border border-border/70 shadow-inner">
            <TabsTrigger
              value="players"
              className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <Users className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                Roster
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="today"
              className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <CalendarCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                Today
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="teams"
              className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <Shield className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                Teams
              </span>
            </TabsTrigger>
          </TabsList>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          <div className="flex min-h-[calc(100dvh-128px)] flex-col">
            <TabsContent
              value="players"
              className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50"
            >
              <PlayersTab
                players={players}
                setPlayers={replacePlayers}
                onScreenshotImport={() => {
                  setOcrImportContext("roster");
                  setActiveTab("today");
                  setTodayOcrOpenToken((token) => token + 1);
                }}
                reviewPlayerId={reviewAutoOpenPlayerId}
                reviewActivePlayerId={reviewActivePlayerId}
                reviewPlayerIndex={reviewPlayerIndex}
                reviewPlayerTotal={reviewPlayerQueue.length}
                onReviewPlayerHandled={() => setReviewAutoOpenPlayerId(null)}
                onReviewNext={openNextReviewPlayer}
                onReviewDone={finishReviewPlayerQueue}
              />
            </TabsContent>
            <TabsContent
              value="today"
              className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50"
            >
              <TodayTab
                players={players}
                setPlayers={replacePlayers}
                themeColor={headerColor}
                openOcrToken={todayOcrOpenToken}
                ocrImportContext={ocrImportContext}
                onOcrImportContextChange={setOcrImportContext}
                onOcrOpenHandled={() => setTodayOcrOpenToken(0)}
                onAddPlayerManually={() => setActiveTab("players")}
                onReviewNewPlayers={(playerIds) => {
                  if (!playerIds.length) return;
                  setActiveTab("players");
                  startReviewPlayerQueue(playerIds);
                }}
              />
            </TabsContent>
            <TabsContent
              value="teams"
              className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50"
            >
              <TeamsTab players={players} />
            </TabsContent>
            <PoweredByFairTeams />
          </div>
        </div>
      </Tabs>

      {groupSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Roster Identity
                </h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  Name, logo, and color are saved with this roster.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={cancelGroupSettings}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <section>
                <h3 className="text-sm font-black text-[#102A43]">
                  Roster Name
                </h3>
                <input
                  value={draftGroupName}
                  onChange={(e) => setDraftGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  maxLength={32}
                  enterKeyHint="done"
                  className="mt-2 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-[#102A43] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="Fair Teams"
                />
              </section>

              <section>
                <h3 className="text-sm font-black text-[#102A43]">
                  Roster Logo
                </h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                    <img
                      src={draftGroupLogo || fairTeamsLogo}
                      alt="Roster logo preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-2xl text-xs font-black"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      Choose logo
                    </Button>
                    {draftGroupLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 rounded-2xl text-xs font-bold text-slate-500"
                        onClick={() => setDraftGroupLogo("")}
                      >
                        Use default
                      </Button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) readLogoFile(file);
                      }}
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-[#102A43]">
                  Roster Color
                </h3>
                <div className="mt-2 grid grid-cols-5 gap-2.5">
                  {GROUP_COLOR_THEMES.map((theme) => {
                    const selected =
                      draftHeaderColor.toLowerCase() ===
                      theme.value.toLowerCase();
                    return (
                      <button
                        key={theme.name}
                        type="button"
                        onClick={() => setDraftHeaderColor(theme.value)}
                        className="group flex flex-col items-center gap-1 text-[10px] font-bold text-slate-600"
                        title={theme.name}
                      >
                        <span
                          className={`flex h-9 w-full min-w-0 items-center justify-center rounded-2xl border shadow-sm transition-transform group-active:scale-95 ${selected ? "border-blue-500 ring-2 ring-blue-200" : "border-white"}`}
                          style={{
                            background:
                              theme.value.toLowerCase() === "#ffffff"
                                ? "linear-gradient(135deg, #ffffff, #f8fafc)"
                                : `linear-gradient(135deg, ${theme.value}, ${hexToRgba(theme.value, 0.42)})`,
                          }}
                        >
                          {selected && (
                            <Check
                              className={`h-4 w-4 drop-shadow ${theme.value.toLowerCase() === "#ffffff" ? "text-slate-700" : "text-white"}`}
                            />
                          )}
                        </span>
                        <span className="truncate">{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="mt-5 flex gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-2xl text-sm font-black"
                onClick={cancelGroupSettings}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 flex-[1.4] rounded-2xl bg-[#102A43] text-sm font-black text-white"
                onClick={saveGroupSettings}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {rosterFilesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div>
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Roster Tools
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={() => setRosterFilesOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
              <button
                type="button"
                onClick={() => {
                  if (!isEmptyStarterRoster && rosters.length > 1) {
                    setRosterPickerOpen(true);
                  }
                }}
                className={`sticky top-0 z-20 flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 text-left shadow-sm backdrop-blur transition ${!isEmptyStarterRoster && rosters.length > 1 ? "active:scale-[0.99]" : "cursor-default"}`}
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Current roster
                  </span>
                  <span className="mt-1 block truncate text-sm font-black text-[#102A43]">
                    {isEmptyStarterRoster ? "Make a new roster" : activeRosterName}
                  </span>
                  <span className="block text-[11px] font-bold text-slate-500">
                    {isEmptyStarterRoster
                      ? "Create one below or import a roster"
                      : activeRosterIsShared
                        ? `${players.length} player${players.length === 1 ? "" : "s"} · ${activeSharedHasUnsavedChanges ? "shared changes not saved" : "shared"}`
                        : `${players.length} player${players.length === 1 ? "" : "s"}`}
                  </span>
                </span>
                {!isEmptyStarterRoster && rosters.length > 1 && (
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-lg font-black leading-none text-slate-400 shadow-sm">
                    ›
                  </span>
                )}
              </button>

              <div className={`rounded-2xl border border-slate-100 bg-white p-3 ${rosterToolsActivePanel ? "hidden" : ""}`}>
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Create roster
                </div>
                <div className="flex gap-2">
                  <input
                    value={newRosterName}
                    onChange={(e) => setNewRosterName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createNewRoster();
                      }
                    }}
                    className="h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    placeholder="New roster name"
                    maxLength={36}
                  />
                  <Button
                    type="button"
                    className="h-10 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white"
                    onClick={createNewRoster}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New
                  </Button>
                </div>
              </div>

              <div className={`overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${rosterToolsActivePanel && rosterToolsActivePanel !== "local" ? "hidden" : ""}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition active:scale-[0.99]"
                  onClick={() => rosterToolsActivePanel === "local" ? closeRosterToolsPanel() : openRosterToolsPanel("local")}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                      <Download className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Local Backup
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">
                        Export or import roster files.
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-lg font-black leading-none text-slate-400">
                    {rosterLocalBackupToolsOpen ? "−" : "›"}
                  </span>
                </button>

                {rosterLocalBackupToolsOpen && (
                  <div className="grid gap-2 border-t border-slate-100 p-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start rounded-2xl gap-3"
                      onClick={exportSharedRoster}
                      disabled={players.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      <span className="font-black">Export this roster</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start rounded-2xl gap-3"
                      onClick={() => openImportPicker("shared")}
                    >
                      <Upload className="h-4 w-4" />
                      <span className="font-black">Import one roster</span>
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start rounded-2xl gap-2 px-3"
                        onClick={exportAllRostersBackup}
                        disabled={isEmptyStarterRoster}
                      >
                        <Archive className="h-4 w-4" />
                        <span className="truncate text-xs font-black">Export all</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start rounded-2xl gap-2 px-3"
                        onClick={() => openImportPicker("backup")}
                      >
                        <ArchiveRestore className="h-4 w-4" />
                        <span className="truncate text-xs font-black">Import all</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className={`overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${rosterToolsActivePanel && rosterToolsActivePanel !== "cloud" ? "hidden" : ""}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition active:scale-[0.99]"
                  onClick={() => rosterToolsActivePanel === "cloud" ? closeRosterToolsPanel() : openRosterToolsPanel("cloud")}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <Cloud className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-blue-500">
                        Cloud Backup
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">
                        Save a safety copy in Google Drive.
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-lg font-black leading-none text-slate-400">
                    {rosterCloudBackupToolsOpen ? "−" : "›"}
                  </span>
                </button>

                {rosterCloudBackupToolsOpen && (
                  <div className="grid gap-3 border-t border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Google
                        </div>
                        <div className="mt-0.5 truncate text-xs font-black text-[#102A43]">
                          {connectedDriveUser?.emailAddress || (googleDriveConnected ? "Connected" : "Not signed in")}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={googleDriveConnected ? "ghost" : "default"}
                        className={`h-9 shrink-0 rounded-2xl px-3 text-xs font-black ${googleDriveConnected ? "text-slate-500 hover:bg-white hover:text-slate-700" : "bg-[#102A43] text-white hover:bg-[#0b2036]"}`}
                        onClick={googleDriveConnected ? disconnectGoogleDrive : connectGoogleDrive}
                        disabled={!googleDriveConfig.isConfigured || googleDriveConnecting}
                      >
                        {googleDriveConnecting ? "Connecting..." : googleDriveConnected ? "Disconnect" : "Sign in"}
                      </Button>
                    </div>

                    <div
                      className={`grid gap-3 transition ${!googleDriveConnected ? "pointer-events-none opacity-40 grayscale" : ""}`}
                      aria-disabled={!googleDriveConnected}
                    >
                      <div className="rounded-2xl bg-white/80 p-3">
                        <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                          Safety backup
                      </div>
                      <div className="mt-1 truncate text-xs font-black text-[#102A43]">
                        {currentDriveBackup?.name || "No backup selected"}
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        {currentDriveBackup
                          ? `Backup has ${formatBackupSummary(currentDriveBackup.rosterCount !== undefined && currentDriveBackup.playerCount !== undefined ? { rosterCount: currentDriveBackup.rosterCount, playerCount: currentDriveBackup.playerCount } : null)}`
                          : "Optional cloud safety copy."}
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="h-12 justify-start rounded-2xl gap-3 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                      onClick={saveAllRostersToGoogleDrive}
                      disabled={isEmptyStarterRoster || !googleDriveConnected || googleDriveSaving || googleDriveUpdating}
                      title={currentDriveBackup ? "Update the active Drive backup" : "Create a new Drive backup"}
                    >
                      {currentDriveBackup ? <RefreshCw className={`h-4 w-4 ${googleDriveUpdating ? "animate-spin" : ""}`} /> : <CloudUpload className="h-4 w-4" />}
                      <span className="font-black">
                        {googleDriveSaving || googleDriveUpdating ? "Saving..." : currentDriveBackup ? "Save backup" : "Create backup"}
                      </span>
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start rounded-2xl gap-2 border-blue-100 bg-white/90 px-3"
                        onClick={openGoogleDriveBackup}
                        disabled={!googleDriveConnected || googleDriveOpening}
                      >
                        <CloudDownload className="h-4 w-4" />
                        <span className="truncate text-xs font-black">{googleDriveOpening ? "Opening..." : "Restore"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start rounded-2xl gap-2 border-blue-100 bg-white/90 px-3"
                        onClick={saveDriveBackupAsNewCopy}
                        disabled={
                          isEmptyStarterRoster ||
                          !googleDriveConnected ||
                          googleDriveSaving ||
                          googleDriveOpening ||
                          googleDriveUpdating
                        }
                        title="Save as a separate Drive backup file"
                      >
                        <Archive className="h-4 w-4" />
                        <span className="truncate text-xs font-black">
                          {googleDriveSaving ? "Saving..." : "Archive copy"}
                        </span>
                      </Button>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start rounded-2xl gap-3 border-blue-100 bg-white/90"
                      onClick={openDriveShareModal}
                      disabled={isEmptyStarterRoster || !googleDriveConnected || googleDriveSharing}
                    >
                      <Share2 className="h-4 w-4" />
                      <span className="font-black">
                        {googleDriveSharing ? "Sending..." : "Send copy"}
                      </span>
                    </Button>

                      <button
                        type="button"
                        onClick={() => setDriveHelpOpen(true)}
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-blue-600"
                      >
                        <Info className="h-3 w-3" />
                        How cloud backup works
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={`overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${rosterToolsActivePanel && rosterToolsActivePanel !== "shared" ? "hidden" : ""}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition active:scale-[0.99]"
                  onClick={() => rosterToolsActivePanel === "shared" ? closeRosterToolsPanel() : openRosterToolsPanel("shared")}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Share2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-emerald-600">
                        Shared Roster
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">
                        {activeRosterIsShared ? "Shared with co-organizers." : "Work with co-organizers."}
                      </span>
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${activeRosterIsShared ? "bg-emerald-600 text-white" : "bg-slate-50 text-slate-500"}`}>
                    {activeRosterIsShared ? "Shared" : rosterSharedToolsOpen ? "Open" : "Local"}
                  </span>
                </button>

                {rosterSharedToolsOpen && (
                  <div className="grid gap-3 border-t border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Google
                        </div>
                        <div className="mt-0.5 truncate text-xs font-black text-[#102A43]">
                          {connectedDriveUser?.emailAddress || (googleDriveConnected ? "Connected" : "Not signed in")}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={googleDriveConnected ? "ghost" : "default"}
                        className={`h-9 shrink-0 rounded-2xl px-3 text-xs font-black ${googleDriveConnected ? "text-slate-500 hover:bg-white hover:text-slate-700" : "bg-[#102A43] text-white hover:bg-[#0b2036]"}`}
                        onClick={googleDriveConnected ? disconnectGoogleDrive : connectGoogleDrive}
                        disabled={!googleDriveConfig.isConfigured || googleDriveConnecting}
                      >
                        {googleDriveConnecting ? "Connecting..." : googleDriveConnected ? "Disconnect" : "Sign in"}
                      </Button>
                    </div>

                    <div
                      className={`grid gap-3 transition ${!googleDriveConnected ? "pointer-events-none opacity-40 grayscale" : ""}`}
                      aria-disabled={!googleDriveConnected}
                    >
                      <div className={`rounded-2xl border px-3 py-2 ${activeSharedHasUnsavedChanges ? "border-amber-100 bg-amber-50/80" : activeRosterIsShared ? "border-emerald-100 bg-emerald-50/70" : "border-slate-100 bg-white/85"}`}>
                        <div className={`text-[10px] font-black uppercase tracking-wide ${activeSharedHasUnsavedChanges ? "text-amber-700" : activeRosterIsShared ? "text-emerald-700" : "text-slate-400"}`}>
                          {activeRosterIsShared ? activeSharedHasUnsavedChanges ? "Unsaved changes" : "Shared" : "Not shared"}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
                          {activeRosterIsShared
                            ? activeSharedHasUnsavedChanges
                              ? "Save changes when you finish editing."
                              : `Saved ${formatSheetSyncTime(activeGoogleSheetSource?.lastSyncedAt).replace("Synced ", "")}`
                            : "This roster is saved only on this device."}
                        </div>
                      </div>

                      {activeRosterIsShared ? (
                      <>
                        <Button
                          type="button"
                          className="h-12 justify-start rounded-2xl gap-3 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                          onClick={() => saveActiveRosterToGoogleSheet()}
                          disabled={!googleDriveConnected || googleSheetSyncing || googleSheetOpening || isEmptyStarterRoster}
                        >
                          <RefreshCw className={`h-4 w-4 ${googleSheetSyncing ? "animate-spin" : ""}`} />
                          <span className="min-w-0 truncate font-black">
                            {googleSheetSyncing ? "Saving..." : "Save changes"}
                          </span>
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-emerald-100 bg-white/90 px-3"
                            onClick={reloadActiveRosterFromGoogleSheet}
                            disabled={!googleDriveConnected || googleSheetOpening || googleSheetSyncing}
                          >
                            <CloudDownload className="h-4 w-4" />
                            <span className="truncate text-xs font-black">
                              {googleSheetOpening ? "Getting latest..." : "Get latest changes"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-emerald-100 bg-white/90 px-3"
                            onClick={openGoogleSheetShareModal}
                            disabled={!googleDriveConnected || googleSheetSharing}
                          >
                            <Share2 className="h-4 w-4" />
                            <span className="truncate text-xs font-black">
                              {googleSheetSharing ? "Sharing..." : "Share"}
                            </span>
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 justify-start rounded-2xl gap-2 px-3 text-[11px] font-black text-slate-500 hover:bg-white/80 hover:text-slate-700"
                          onClick={disconnectActiveRosterFromGoogleSheet}
                          disabled={googleSheetSyncing || googleSheetOpening || googleSheetSharing}
                        >
                          <X className="h-3.5 w-3.5" />
                          Disconnect from shared roster
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 justify-start rounded-2xl gap-2 border-red-100 bg-red-50/70 px-3 text-red-700 hover:bg-red-100 hover:text-red-800"
                          onClick={openClearRoster}
                          disabled={googleSheetSyncing || googleSheetOpening || googleSheetSharing}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="text-xs font-black">Remove shared roster from this device</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        className="h-12 justify-start rounded-2xl gap-3 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                        onClick={makeActiveRosterShared}
                        disabled={!googleDriveConnected || googleSheetSyncing || isEmptyStarterRoster}
                      >
                        <Share2 className="h-4 w-4" />
                        <span className="min-w-0 truncate font-black">
                          {googleSheetSyncing ? "Creating..." : "Make this roster shared"}
                        </span>
                      </Button>
                    )}

                    <div className="rounded-2xl border border-emerald-100 bg-white/70 p-3">
                      <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                        All shared rosters
                      </div>
                      <div className="mt-1 text-xs font-black text-[#102A43]">
                        {sharedRosterCountLabel} on this device
                      </div>
                      <div className="mt-3 grid gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-emerald-100 bg-white/90 px-3"
                            onClick={saveAllSharedRostersToGoogleSheets}
                            disabled={!googleDriveConnected || googleSheetSyncing || googleSheetOpening || sharedGoogleSheetRosterCount === 0}
                          >
                            <RefreshCw className={`h-4 w-4 ${googleSheetSyncing ? "animate-spin" : ""}`} />
                            <span className="truncate text-xs font-black">
                              {googleSheetSyncing ? "Saving..." : "Save all"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-emerald-100 bg-white/90 px-3"
                            onClick={getLatestForAllSharedRosters}
                            disabled={!googleDriveConnected || googleSheetOpening || googleSheetSyncing || sharedGoogleSheetRosterCount === 0}
                          >
                            <CloudDownload className="h-4 w-4" />
                            <span className="truncate text-xs font-black">
                              {googleSheetOpening ? "Getting latest..." : "Get latest for all"}
                            </span>
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 justify-start rounded-2xl gap-3 border-emerald-100 bg-white/90"
                          onClick={openGoogleSheetRosterList}
                          disabled={!googleDriveConnected || googleSheetOpening}
                        >
                          <CloudDownload className="h-4 w-4" />
                          <span className="font-black">
                            {googleSheetOpening ? "Opening..." : "Open shared roster"}
                          </span>
                        </Button>
                      </div>
                    </div>

                      <div className="rounded-2xl bg-white/70 px-3 py-2">
                        <p className="text-[10px] font-semibold leading-snug text-slate-500">
                          {googleDriveConnected
                            ? "Get latest before editing. Save changes after editing."
                            : "Sign in with Google above to share rosters."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!rosterToolsActivePanel && !isEmptyStarterRoster && !activeRosterIsShared && (
                <div className="border-t border-slate-100 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-start rounded-2xl gap-3 border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"
                    onClick={openClearRoster}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="font-black">
                      {rosters.length > 1 ? "Delete current roster" : "Clear current roster"}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {rosterSwitchingName && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-[240px] rounded-3xl border border-slate-100 bg-white p-4 text-center shadow-2xl">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-[#102A43]" />
            <div className="text-sm font-black tracking-tight text-[#102A43]">
              Switching roster…
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-slate-500">
              {rosterSwitchingName}
            </div>
          </div>
        </div>
      )}

      {rosterPickerOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div>
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Current roster
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Choose the roster to use now.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={() => setRosterPickerOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
              {rosters.map((roster) => {
                const selected = roster.id === activeRosterId;
                return (
                  <button
                    key={roster.id}
                    type="button"
                    onClick={() => switchRosterWithPause(roster)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${selected ? "border-blue-200 bg-blue-50/80" : "border-slate-100 bg-slate-50/70"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#102A43]">
                        {roster.name}
                      </span>
                      <span className="block text-[11px] font-bold text-slate-500">
                        {roster.players.length} player
                        {roster.players.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selected ? (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#102A43] text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-lg font-black leading-none text-slate-400 shadow-sm">
                        ›
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {googleSheetChoices && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  Shared Roster
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  Open shared roster
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Choose a Fair Teams roster linked to this Google account.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => setGoogleSheetChoices(null)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {googleSheetChoices.length > 0 ? (
                <div className="space-y-2">
                  {googleSheetChoices.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => {
                        setGoogleSheetOwnerEmailVisible(false);
                        setGoogleSheetActionFile(file);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-left transition active:scale-[0.99]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#102A43]">
                          {file.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-bold text-emerald-700/75">
                          {isGoogleSheetOwnedByMe(file) ? "My shared roster" : "Shared with me"} · {getGoogleSheetOwnerLabel(file)} · {formatDriveModifiedTime(file.modifiedTime)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-lg font-black leading-none text-emerald-400 shadow-sm">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs font-semibold leading-snug text-amber-800">
                      No shared rosters found. Make a roster shared first, or ask the owner to share the Google Sheet with this account.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setGoogleSheetChoices(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {googleSheetActionFile && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  Shared Roster
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  {googleSheetActionFile.name}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  {getGoogleSheetOwnerLabel(googleSheetActionFile)} · {isGoogleSheetOwnedByMe(googleSheetActionFile) ? "Owned by this Google account" : "Shared with this Google account"} · {formatDriveModifiedTime(googleSheetActionFile.modifiedTime)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => {
                  setGoogleSheetOwnerEmailVisible(false);
                  setGoogleSheetActionFile(null);
                }}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-xs font-semibold leading-snug text-emerald-900/80">
                Recover/Open brings this shared roster back into Fair Teams on this device. It does not overwrite the Google Sheet.
              </p>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Owner
              </div>
              <div className="mt-1 text-xs font-black text-[#102A43]">
                {getGoogleSheetOwnerLabel(googleSheetActionFile).replace("Owner: ", "")}
              </div>
              {!isGoogleSheetOwnedByMe(googleSheetActionFile) && getGoogleSheetOwnerEmail(googleSheetActionFile) && (
                <div className="mt-2">
                  {googleSheetOwnerEmailVisible ? (
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Owner email
                      </div>
                      <div className="mt-0.5 truncate text-xs font-black text-[#102A43]">
                        {getGoogleSheetOwnerEmail(googleSheetActionFile)}
                      </div>
                      <p className="mt-1 text-[10px] font-semibold leading-snug text-slate-500">
                        Use this only to identify who can manage or delete this shared roster.
                      </p>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 rounded-xl px-0 text-[11px] font-black text-emerald-700 hover:bg-transparent hover:text-emerald-800"
                      onClick={() => setGoogleSheetOwnerEmailVisible(true)}
                    >
                      Show owner email
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => openGoogleSheetRosterFile(googleSheetActionFile)}
                disabled={googleSheetOpening || googleSheetDeleting}
              >
                {googleSheetOpening ? "Opening..." : "Recover / Open this roster"}
              </Button>
              {isGoogleSheetOwnedByMe(googleSheetActionFile) && (
                <div className="rounded-2xl border border-red-100 bg-red-50/70 p-3">
                  <div className="text-[10px] font-black uppercase tracking-wide text-red-700">
                    Danger zone
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-snug text-red-800/85">
                    Delete shared roster for everyone moves the Google Sheet to trash. Other organizers will lose access to this shared roster.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-10 w-full rounded-2xl border-red-200 bg-white text-xs font-black text-red-700 hover:bg-red-100 hover:text-red-800"
                    onClick={() => startGoogleSheetDeleteConfirm(googleSheetActionFile)}
                    disabled={googleSheetOpening || googleSheetDeleting}
                  >
                    Delete shared roster for everyone
                  </Button>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => {
                  setGoogleSheetOwnerEmailVisible(false);
                  setGoogleSheetActionFile(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {googleSheetDeleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-wide text-red-600">
                  Delete shared roster for everyone
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  {googleSheetDeleteConfirm.file.name}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This moves the Google Sheet to trash. Other organizers will lose access to this shared roster. Local copies already saved on devices are not deleted.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-red-700">
                <span>Slide to confirm</span>
                <span>{googleSheetDeleteSlide >= 95 ? "Ready" : `${googleSheetDeleteSlide}%`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={googleSheetDeleteSlide}
                onChange={(e) => setGoogleSheetDeleteSlide(Number(e.target.value))}
                className="w-full accent-red-600"
                aria-label="Slide to confirm shared roster deletion"
                disabled={googleSheetDeleting}
              />
              <p className="mt-2 text-[11px] font-semibold text-red-700/80">
                Only the owner should do this. You can restore the Sheet from Google Drive trash for a limited time if this was a mistake.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-red-600 text-white hover:bg-red-700"
                onClick={confirmDeleteGoogleSheetRoster}
                disabled={googleSheetDeleteSlide < 95 || googleSheetDeleting}
              >
                {googleSheetDeleting ? "Deleting..." : "Delete shared roster for everyone"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={closeGoogleSheetDeleteConfirm}
                disabled={googleSheetDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {googleSheetUpdatePrompt && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CloudDownload className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  Shared Roster
                </div>
                <h2 className="mt-1 text-base font-black tracking-tight text-[#102A43]">
                  Roster changed elsewhere
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This shared roster was changed after your last save. Get the latest changes before editing.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={getLatestAfterGoogleSheetUpdatePrompt}
                disabled={googleSheetOpening || googleSheetSyncing}
              >
                Get latest changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={dismissGoogleSheetUpdatePrompt}
                disabled={googleSheetOpening || googleSheetSyncing}
              >
                Not now
              </Button>
            </div>
          </div>
        </div>
      )}

      {googleSheetConflictConfirm && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-amber-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-wide text-amber-600">
                  Shared Roster
                </div>
                <h2 className="mt-1 text-base font-black tracking-tight text-[#102A43]">
                  Other changes found
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This roster was changed elsewhere after your last save. Get latest first, or overwrite those changes.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Last sync here
                </div>
                <div className="mt-1 text-xs font-black text-[#102A43]">
                  {formatSheetModifiedTime(googleSheetConflictConfirm.lastKnownRemoteModifiedAt)}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                  Sheet updated
                </div>
                <div className="mt-1 text-xs font-black text-[#102A43]">
                  {formatSheetModifiedTime(googleSheetConflictConfirm.file.modifiedTime)}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold leading-snug text-amber-800">
                Recommended: get latest first, review the roster, then save again if needed.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={getLatestAfterGoogleSheetConflict}
                disabled={googleSheetOpening || googleSheetSyncing}
              >
                Get latest first
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"
                onClick={overwriteGoogleSheetAfterConflict}
                disabled={googleSheetSyncing || googleSheetOpening}
              >
                Overwrite anyway
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setGoogleSheetConflictConfirm(null)}
                disabled={googleSheetSyncing || googleSheetOpening}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {googleSheetShareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  Shared Roster
                </div>
                <h2 className="mt-1 text-base font-black tracking-tight text-[#102A43]">
                  Share with editor
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Add one trusted organizer who should edit this roster through Fair Teams.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => setGoogleSheetShareOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                Linked sheet
              </div>
              <div className="mt-1 truncate text-sm font-black text-[#102A43]">
                {activeGoogleSheetSource?.spreadsheetName || activeRosterName}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Editor email
              </label>
              <input
                value={googleSheetShareEmail}
                onChange={(e) => setGoogleSheetShareEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmGoogleSheetShare();
                  }
                }}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="email@example.com"
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold leading-snug text-amber-800">
                This gives editor access to the hidden Google Sheet. Use this only with people you trust to manage the roster.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={confirmGoogleSheetShare}
                disabled={googleSheetSharing}
              >
                {googleSheetSharing ? "Sharing..." : "Share roster"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setGoogleSheetShareOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {driveHelpOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-blue-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                  Advanced Backup
                </div>
                <h2 className="mt-1 text-base font-black tracking-tight text-[#102A43]">
                  How it works
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => setDriveHelpOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="text-xs font-black text-[#102A43]">
                  Backup and handoff
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Advanced Backup saves roster text data to Google Drive. Use it to restore rosters, move between devices, or send a copy to another organizer.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                <div className="text-xs font-black text-amber-800">
                  Not live sync
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-amber-800/85">
                  Only one person should edit the latest roster at a time. If someone changes a copy, they should send the newest backup back.
                </p>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
                <div className="text-xs font-black text-[#102A43]">
                  Tip for trusted groups
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-600">
                  If your club already has a team Drive account, trusted organizers can connect Fair Teams to that same account on each device. Backups stay in one place, but it is still not live sync.
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="mt-4 h-11 w-full rounded-2xl bg-[#102A43] text-white hover:bg-[#0b2036]"
              onClick={() => setDriveHelpOpen(false)}
            >
              Got it
            </Button>
          </div>
        </div>
      )}

      {driveBackupChoices && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                  Advanced Backup
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  Open backup
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Choose a Fair Teams backup you saved from this app.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => setDriveBackupChoices(null)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {visibleDriveBackupChoices.length > 0 ? (
                <div className="space-y-2">
                  {visibleDriveBackupChoices.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => previewGoogleDriveBackupFile(file)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-3 py-3 text-left transition active:scale-[0.99]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#102A43]">
                          {file.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-bold text-blue-700/75">
                          {file.ownedByMe === false ? "Received copy" : "My backup"} · {formatDriveModifiedTime(file.modifiedTime)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-lg font-black leading-none text-blue-400 shadow-sm">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs font-semibold leading-snug text-amber-800">
                      No Fair Teams backups found. Save a backup first, or open a backup copy that someone sent to this Google account.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setDriveBackupChoices(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {driveShareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  Advanced Backup
                </div>
                <h2 className="mt-1 text-base font-black tracking-tight text-[#102A43]">
                  Send backup copy
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Send a view-only copy to another organizer.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => {
                  setDriveShareOpen(false);
                  setDriveShareConfirm(null);
                }}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Add person
                </div>
                <div className="mt-2 grid gap-2">
                  <input
                    value={driveRecipientName}
                    onChange={(e) => setDriveRecipientName(e.target.value)}
                    placeholder="Name, e.g. Sarah"
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                  <div className="flex gap-2">
                    <input
                      value={driveShareEmail}
                      onChange={(e) => setDriveShareEmail(e.target.value)}
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="email@example.com"
                      className="h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                    <Button
                      type="button"
                      className="h-10 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white"
                      onClick={addDriveRecipient}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Send to
                </div>
                {driveRecipients.length > 0 ? (
                  <div className="space-y-2">
                    {driveRecipients.map((recipient) => {
                      const selected = selectedDriveRecipientIds.includes(recipient.id);
                      return (
                        <div
                          key={recipient.id}
                          className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${selected ? "border-emerald-200 bg-white" : "border-white/70 bg-white/65"}`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleDriveRecipient(recipient.id)}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-transparent"}`}
                            aria-label={selected ? `Unselect ${recipient.name}` : `Select ${recipient.name}`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDriveRecipient(recipient.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-black text-[#102A43]">
                              {recipient.name || recipient.email}
                            </div>
                            <div className="truncate text-[11px] font-bold text-slate-500">
                              {recipient.email}
                            </div>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 rounded-xl text-slate-400"
                            onClick={() => removeDriveRecipient(recipient.id)}
                            title="Remove person"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/75 p-3 text-xs font-bold text-slate-500">
                    Add Sarah, Peter, or another organizer above.
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                <p className="text-xs font-semibold leading-snug text-amber-800">
                  Fair Teams creates a new text-only Drive backup copy and shares it as Viewer. Recipients can import the copy, but cannot edit your active backup.
                </p>
              </div>
            </div>

            <div className="grid gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={prepareDriveShare}
              >
                Continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setDriveShareOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {driveUpdateConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-amber-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Update active Drive backup?
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This will overwrite the selected Drive backup file.
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Safety backup file
              </div>
              <div className="mt-1 truncate text-sm font-black text-[#102A43]">
                {driveUpdateConfirm.file.name}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                  Backup now
                </div>
                <div className="mt-1 text-xs font-black text-[#102A43]">
                  {driveUpdateConfirm.readFailed ? "Could not check" : formatBackupSummary(driveUpdateConfirm.previous)}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  This device
                </div>
                <div className="mt-1 text-xs font-black text-[#102A43]">
                  {formatBackupSummary(driveUpdateConfirm.next)}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold leading-snug text-amber-800">
                Make sure this is the correct backup file before updating. Use “Save as copy” if you want a separate archive instead.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
                onClick={confirmUpdateCurrentGoogleDriveBackup}
                disabled={googleDriveUpdating}
              >
                {googleDriveUpdating ? "Updating..." : "Update this backup"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setDriveUpdateConfirm(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {driveShareConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-amber-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Send backup copy?
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This creates a new Drive file and shares it as Viewer. Make sure these recipients are correct.
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                Recipients
              </div>
              <div className="space-y-1.5">
                {driveShareConfirm.recipients.map((recipient) => (
                  <div key={recipient.id} className="truncate text-xs font-bold text-slate-700">
                    • {recipient.name || recipient.email} — {recipient.email}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold leading-snug text-amber-800">
                The backup contains roster text data such as names, ratings, traits, and notes. It does not include player photos or logo images.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl border-slate-200 bg-white text-xs font-black text-slate-700"
                onClick={downloadAllRostersBackup}
              >
                Export local backup first
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={confirmDriveShare}
                disabled={googleDriveSharing}
              >
                {googleDriveSharing ? "Sending..." : "Send copy"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={() => setDriveShareConfirm(null)}
                disabled={googleDriveSharing}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {localImportPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-[#102A43]/55">
                  {localImportPreview.mode === "backup" ? "Local backup files" : "Local roster file"}
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  Import this file?
                </h2>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {localImportPreview.sourceName}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={closeLocalImportPreview}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-center">
                  <div className="text-xl font-black text-[#102A43]">
                    {localImportPreview.rosterCount}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                    Rosters
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-center">
                  <div className="text-xl font-black text-[#102A43]">
                    {localImportPreview.playerCount}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                    Players
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Included rosters
                </div>
                <div className="space-y-1.5">
                  {localImportPreview.rosterNames.slice(0, 5).map((name, index) => (
                    <div key={`${name}-${index}`} className="truncate text-xs font-bold text-slate-700">
                      • {name}
                    </div>
                  ))}
                  {localImportPreview.rosterNames.length > 5 ? (
                    <div className="text-xs font-bold text-slate-400">
                      …and {localImportPreview.rosterNames.length - 5} more
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs font-semibold leading-snug text-amber-800">
                    {localImportPreview.mode === "backup"
                      ? "This adds rosters from the backup file. Your current rosters stay in the app."
                      : `This imports the file as a separate roster. Your current roster “${activeRosterName}” stays unchanged.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-[#102A43] text-white hover:bg-[#0b2036]"
                onClick={confirmLocalImport}
              >
                {localImportPreview.mode === "backup" ? "Add rosters from backup" : "Import as new roster"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={closeLocalImportPreview}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {rosterToolsNotice && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${rosterToolsNotice.tone === "success" ? "bg-emerald-50 text-emerald-600" : rosterToolsNotice.tone === "warning" ? "bg-amber-50 text-amber-600" : rosterToolsNotice.tone === "error" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                {rosterToolsNotice.tone === "success" ? <Check className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  {rosterToolsNotice.title}
                </h2>
                <p className="mt-1 whitespace-pre-line text-xs font-semibold leading-snug text-slate-500">
                  {rosterToolsNotice.message}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Button
                type="button"
                className="h-11 w-full rounded-2xl bg-[#102A43] text-white hover:bg-[#0b2036]"
                onClick={() => setRosterToolsNotice(null)}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {driveImportPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                  Google Drive backup
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  Open this backup?
                </h2>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {driveImportPreview.file.name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={closeDriveImportPreview}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-center">
                  <div className="text-xl font-black text-[#102A43]">
                    {driveImportPreview.rosterCount}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                    Rosters
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-center">
                  <div className="text-xl font-black text-[#102A43]">
                    {driveImportPreview.playerCount}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                    Players
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Included rosters
                </div>
                <div className="space-y-1.5">
                  {driveImportPreview.rosterNames.slice(0, 5).map((name, index) => (
                    <div key={`${name}-${index}`} className="truncate text-xs font-bold text-slate-700">
                      • {name}
                    </div>
                  ))}
                  {driveImportPreview.rosterNames.length > 5 ? (
                    <div className="text-xs font-bold text-slate-400">
                      …and {driveImportPreview.rosterNames.length - 5} more
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs font-semibold leading-snug text-amber-800">
                    Drive backups are text-only. Player photos and logo images are not imported from Drive, but matching local photos/logos are preserved where possible.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
                onClick={confirmAddDriveImport}
              >
                Add as new rosters
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"
                onClick={confirmReplaceDriveImport}
              >
                Replace all local rosters
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl text-slate-500"
                onClick={closeDriveImportPreview}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {clearRosterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  {activeRosterIsShared
                    ? `Remove “${activeRosterName}” from this device?`
                    : rosters.length > 1
                      ? `Delete “${activeRosterName}”?`
                      : `Clear “${activeRosterName}”?`}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  {activeRosterIsShared
                    ? "This removes only the local copy from this device. It will not delete, clear, or overwrite the shared Google Sheet."
                    : rosters.length > 1
                      ? "This deletes only the active roster. Your other rosters will stay."
                      : `You need at least one roster, so this removes all ${players.length} player profiles from this roster only.`}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-red-700">
                <span>Slide to confirm</span>
                <span>
                  {clearRosterSlide >= 95 ? "Ready" : `${clearRosterSlide}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={clearRosterSlide}
                onChange={(e) => setClearRosterSlide(Number(e.target.value))}
                className="w-full accent-red-600"
                aria-label="Slide to confirm roster action"
              />
              <p className="mt-2 text-[11px] font-semibold text-red-700/80">
                Move the slider all the way right, then confirm.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={closeClearRoster}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-red-600 text-white hover:bg-red-700"
                onClick={confirmClearRoster}
                disabled={clearRosterSlide < 95}
              >
                {activeRosterIsShared
                  ? "Remove from this device"
                  : rosters.length > 1
                    ? "Delete roster"
                    : "Clear roster"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
