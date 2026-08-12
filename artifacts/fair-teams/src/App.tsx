import React, { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
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
  Copy,
  RefreshCw,
  Share2,
  UserMinus,
  FolderOpen,
  Info,
  ChevronRight,
  Building2,
} from "lucide-react";
import { PlayersTab } from "@/components/PlayersTab";
import { TodayTab } from "@/components/TodayTab";
import { TeamsTab } from "@/components/TeamsTab";
import { ClubTab } from "@/components/ClubTab";
import type { PairingRule } from "@/lib/types";
import type { AiSmartCommandAction } from "@/lib/aiSmartCommandTypes";
import { FirebaseSharedRosterAuthCard } from "@/components/FirebaseSharedRosterAuthCard";
import { FirebaseSharedRosterPublishCard } from "@/components/FirebaseSharedRosterPublishCard";
import { Button } from "@/components/ui/button";
import stripesLogo from "@/assets/stripes-logo-mark.png";
import {
  RoomPlayer,
  RoomRoster,
  createRoster,
  downloadText,
  loadRosterState,
  isRosterCloudShared,
  normalizePlayer,
  normalizeRoster,
  privateLocalRosters,
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
  trashGoogleDriveFile,
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
  updateGoogleSheetRosterAccessLabels,
  type GoogleSheetRosterFile,
} from "@/lib/googleSheetsFiles";
import { pickGoogleSheetRosterFile, warmUpGoogleDrivePicker } from "@/lib/googleDrivePicker";
import { leaveFirebaseSharedRosterAccess, listFirebaseSharedRosters, readFirebaseSharedRoster, type FirebaseSharedRosterSummary } from "@/lib/sharedRosterService";
import { fetchClubRatingSummaries, type ClubRatingSummary } from "@/lib/clubCollaborationService";
import { profileFromAveragedAttributes } from "@/lib/playerStyleProfile";

const GROUP_NAME_STORAGE_KEY = "fair-teams-group-name";
const HEADER_COLOR_STORAGE_KEY = "fair-teams-header-color-v2";
const GROUP_LOGO_STORAGE_KEY = "fair-teams-group-logo";
const DEFAULT_GROUP_NAME = "My Group";
const DEFAULT_HEADER_COLOR = "#FFFFFF";
const EMPTY_ROSTER_NAME = "New roster";
const ROSTERS_STORAGE_KEY = "fair-teams-rosters-v1";
const DRIVE_RECIPIENTS_STORAGE_KEY = "fair-teams-drive-backup-recipients-v1";
const DRIVE_ACTIVE_BACKUP_STORAGE_KEY = "fair-teams-drive-active-backup-v1";
const APP_VERSION = "1.70.5";

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
  return `Stripes - ${slugifyFilename(readableName)} - ${timestampForFilename()}.json`;
}

function uniqueRosterName(name: string, rosters: RoomRoster[]) {
  const base = name.replace(/\s+/g, " ").trim() || "New roster";
  const taken = new Set(rosters.map((roster) => roster.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let index = 2;
  while (taken.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function RosterKindBadge({ roster }: { roster: RoomRoster }) {
  const shared = isRosterCloudShared(roster);
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] font-black uppercase tracking-wide ${shared ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100" : "bg-slate-100 text-slate-500"}`}
      title={shared ? "Shared roster" : "Local roster"}
    >
      {shared ? "Shared" : "Local"}
    </span>
  );
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

type DriveBackupDeleteConfirm = {
  file: GoogleDriveFileResult;
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

function formatTodayStartDateLabel(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" })
    .format(date)
    .toUpperCase();
  const month = new Intl.DateTimeFormat("en-US", { month: "short" })
    .format(date)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);

  return `${weekday} · ${month} ${day}`;
}

const APP_TAB_VALUES = ["players", "teams", "club"] as const;
type AppTab = (typeof APP_TAB_VALUES)[number];

function isAppTab(value: string): value is AppTab {
  return (APP_TAB_VALUES as readonly string[]).includes(value);
}

function TeamStripesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4" y="4" width="14" height="3" rx="1.5" fill="#3B82F6" transform="rotate(-8 11 5.5)" />
      <rect x="5" y="9" width="15" height="3" rx="1.5" fill="#84CC16" transform="rotate(-8 12.5 10.5)" />
      <rect x="3" y="14" width="14" height="3" rx="1.5" fill="#F59E0B" transform="rotate(-8 10 15.5)" />
      <rect x="6" y="19" width="13" height="2.5" rx="1.25" fill="#EF4444" transform="rotate(-8 12.5 20.25)" />
    </svg>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const finish = window.setTimeout(() => setShowSplash(false), 2250);
    return () => window.clearTimeout(finish);
  }, []);

  useEffect(() => {
    if (showSplash) return;
    let secondFrame = 0;
    const timers: number[] = [];
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setOnboardingReady(true);
        setOnboardingProbe((value) => value + 1);
      });
    });

    // Mobile browsers and installed PWAs can restore local state over several frames.
    // Probe a few times after startup so first-run detection does not depend on one render.
    [250, 750, 1500, 3000].forEach((delay) => {
      timers.push(window.setTimeout(() => setOnboardingProbe((value) => value + 1), delay));
    });

    const reprobe = () => setOnboardingProbe((value) => value + 1);
    window.addEventListener("pageshow", reprobe);
    document.addEventListener("visibilitychange", reprobe);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("pageshow", reprobe);
      document.removeEventListener("visibilitychange", reprobe);
    };
  }, [showSplash]);

  const [activeTab, setActiveTab] = useState<AppTab>("teams");
  const [teamsWorkspaceView, setTeamsWorkspaceView] = useState<"setup" | "result">("setup");
  const [sessionTeamCount, setSessionTeamCount] = useState(2);
  const [tutorialStep, setTutorialStep] = useState<string | null>(null);
  const [tutorialPlayerId, setTutorialPlayerId] = useState<string | null>(null);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingProbe, setOnboardingProbe] = useState(0);
  const [tutorialReplayMode, setTutorialReplayMode] = useState(false);
  const tutorialStartedRef = useRef(false);
  const tutorialSnapshotRef = useRef<{ rosterState: ReturnType<typeof loadRosterState>; activeTab: AppTab; todayRosterChosen: boolean } | null>(null);
  const tutorialActive = Boolean(tutorialStep);

  const tutorialCopy: Record<string, { title: string; body: string }> = {
    "open-add": { title: "Build your roster", body: "Tap the glowing Add Player button." },
    "add-manual": { title: "Add the player", body: "Choose Add manually. We filled in the practice player for you." },
    "submit-player": { title: "Add the player", body: "Tap Add Player to add Heung-min to the practice roster." },
    "open-edit": { title: "Edit the player", body: "Open Heung-min’s edit button." },
    "advanced-edit": { title: "Advanced Edit", body: "Open Advanced Edit. It is optional, but useful when you know a player well." },
    "save-edit": { title: "Save the profile", body: "You have seen the detailed controls. Save the player profile." },
    "flip-card": { title: "See the other side", body: "Tap Heung-min’s card to flip it and see more player information." },
    "today-tab": { title: "Teams", body: "Open Teams to choose who is playing today." },
    "select-today": { title: "Who is playing?", body: "Select Heung-min for this Session." },

    "generate": { title: "Create the teams", body: "Tap Generate. Stripes will balance the selected players." },
    "magic-wait": { title: "Balancing the session…", body: "Stripes is comparing the selected players and building even teams." },
    "magic-reveal": { title: "That’s the magic", body: "Each stripe is a team — balanced and ready to play." },
    "club-tab": { title: "Organize together", body: "Open Club to see the tools shared by co-organizers." },
    "club-intro": { title: "Club is for shared rosters", body: "Use Club when several organizers work on one roster together. If you use local rosters, you can skip this tab." },
    "help-question": { title: "Ask Stripes Help", body: "The question is ready. Tap Ask to see how in-app help works." },
    "roster-return": { title: "Back to your roster", body: "Return to Roster for the final setup step." },
    "settings-button": { title: "Roster controls", body: "Tap Settings to switch rosters, create new ones, and manage the app." },
    "recap": { title: "Your roster is ready", body: "One last look at the four main areas." },
    "create-roster": { title: "Now make it yours", body: "Name your real roster and tap New." },
  };

  const [aiTeamSetup, setAiTeamSetup] = useState<{ token: number; teamCount: number | null; autoGenerate?: boolean; shuffleEquals?: boolean }>({ token: 0, teamCount: null, autoGenerate: false, shuffleEquals: false });
  const [aiTeamsState, setAiTeamsState] = useState<{ hasTeams: boolean; teamCount: number; selectedCount: number }>({ hasTeams: false, teamCount: 2, selectedCount: 0 });
  const [clubBackTargetOpen, setClubBackTargetOpen] = useState(false);
  const [openPairingRulesToken, setOpenPairingRulesToken] = useState(0);
  const [externalAddPlayerRequest, setExternalAddPlayerRequest] = useState<{ token: number; name?: string } | null>(null);
  const activeTabRef = useRef<AppTab>("teams");
  const tabHistoryRef = useRef<AppTab[]>(["today"]);
  const restoringTabFromBackRef = useRef(false);
  const fairTeamsBackTrapArmedRef = useRef(false);
  const [todayRosterChosen, setTodayRosterChosen] = useState(false);
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
  const pairingRules = activeRoster?.pairingRules || [];
  const activeRosterName = activeRoster?.name || "Default roster";
  const headerColor = rosterThemeColor(activeRoster);
  const groupLogo = rosterLogo(activeRoster);
  const isEmptyStarterRoster =
    rosters.length === 1 && players.length === 0 && activeRosterName === EMPTY_ROSTER_NAME;
  const privateBackupRosters = privateLocalRosters(rosters);
  const hasPrivateBackupRosters = privateBackupRosters.some((roster) => roster.players.length > 0 || roster.name !== EMPTY_ROSTER_NAME);
  const privateBackupSummary = hasPrivateBackupRosters ? countBackupRosters(privateBackupRosters) : { rosterCount: 0, playerCount: 0 };
  const deviceBackupSummary = privateBackupSummary;
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
  const [driveBackupDeleteConfirm, setDriveBackupDeleteConfirm] = useState<DriveBackupDeleteConfirm | null>(null);
  const [googleDriveDeletingFileId, setGoogleDriveDeletingFileId] = useState("");
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
  const [googleSheetHelpOpen, setGoogleSheetHelpOpen] = useState(false);
  const [driveUpdateConfirm, setDriveUpdateConfirm] = useState<DriveUpdateConfirm | null>(null);
  const [googleSheetSyncing, setGoogleSheetSyncing] = useState(false);
  const [googleSheetOpening, setGoogleSheetOpening] = useState(false);
  const [googleSheetSharing, setGoogleSheetSharing] = useState(false);
  const [googleSheetChoices, setGoogleSheetChoices] = useState<GoogleSheetRosterFile[] | null>(null);
  const [googleSheetActionFile, setGoogleSheetActionFile] = useState<GoogleSheetRosterFile | null>(null);
  const [googleSheetDeleteConfirm, setGoogleSheetDeleteConfirm] = useState<GoogleSheetDeleteConfirm | null>(null);
  const [googleSheetDeleteSlide, setGoogleSheetDeleteSlide] = useState(0);
  const [googleSheetDeleting, setGoogleSheetDeleting] = useState(false);
  const [googleSheetShareOpen, setGoogleSheetShareOpen] = useState(false);
  const [googleSheetShareName, setGoogleSheetShareName] = useState("");
  const [googleSheetShareEmail, setGoogleSheetShareEmail] = useState("");
  const [googleSheetAccessList, setGoogleSheetAccessList] = useState<GoogleDrivePermissionResult[] | null>(null);
  const [googleSheetAccessLoading, setGoogleSheetAccessLoading] = useState(false);
  const [googleSheetRemovingPermissionId, setGoogleSheetRemovingPermissionId] = useState("");
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
  const activeFirebaseSource =
    activeRoster?.cloudSource?.provider === "firebase"
      ? activeRoster.cloudSource
      : null;
  const activeRosterIsShared = Boolean(activeGoogleSheetSource?.spreadsheetId || activeFirebaseSource?.firebaseRosterId);
  const activeRosterIsFirebaseShared = Boolean(activeFirebaseSource?.firebaseRosterId);
  const localRosterPickerChoices = rosters.filter((roster) => !isRosterCloudShared(roster));
  const sharedRosterPickerChoices = rosters.filter(isRosterCloudShared);
  const firebaseAccessLabelsFromSummary = (summary: FirebaseSharedRosterSummary) =>
    Object.fromEntries(
      [...(summary.memberEmails || []), ...(summary.pendingInviteEmails || [])]
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@"))
        .map((email) => [email, "editor"]),
    );

  const firebaseMemberNamesFromSummary = (summary: FirebaseSharedRosterSummary) => ({
    ...(summary.memberNamesByEmail || {}),
  });

  const rosterFirebaseSharedPeopleCount = (roster: RoomRoster | undefined) => {
    const source = roster?.cloudSource?.provider === "firebase" ? roster.cloudSource : undefined;
    if (!source?.firebaseRosterId) return 0;
    const emails = new Set<string>();
    const ownerEmail = source.firebaseOwnerEmail?.trim().toLowerCase();
    if (ownerEmail?.includes("@")) emails.add(ownerEmail);
    Object.keys(source.accessLabels || {}).forEach((email) => {
      const normalized = email.trim().toLowerCase();
      if (normalized.includes("@")) emails.add(normalized);
    });
    return emails.size || 1;
  };

  const activeFirebaseEquipmentHolderLabels = activeFirebaseSource
    ? Array.from(new Set([
        activeFirebaseSource.firebaseOwnerEmail,
        ...Object.keys(activeFirebaseSource.accessLabels || {}),
      ]
        .map((email) => (email || "").trim().toLowerCase())
        .filter((email) => email.includes("@"))))
    : [];
  const activeFirebaseEquipmentHolderNamesByEmail = activeFirebaseSource?.firebaseMemberNamesByEmail || {};
  const cleanFirebasePersonLabel = (email: string) => {
    const normalized = email.trim().toLowerCase();
    const savedName = activeFirebaseEquipmentHolderNamesByEmail[normalized] || activeFirebaseEquipmentHolderNamesByEmail[email];
    if (savedName?.trim()) return savedName.trim();
    return (normalized.split("@")[0] || "Organizer")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Organizer";
  };
  const activeFirebaseSharedPersonNames = activeFirebaseEquipmentHolderLabels
    .map(cleanFirebasePersonLabel)
    .filter((label, index, all) => Boolean(label) && all.indexOf(label) === index);

  const syncFirebaseRosterBadgesFromSummaries = (summaries: FirebaseSharedRosterSummary[]) => {
    if (!summaries.length) return;
    const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
    setRosterState((current) => {
      let changed = false;
      const rostersWithFreshBadges = current.rosters.map((roster) => {
        const source = roster.cloudSource?.provider === "firebase" ? roster.cloudSource : undefined;
        if (!source?.firebaseRosterId) return roster;
        const summary = summaryById.get(source.firebaseRosterId);
        if (!summary) return roster;

        const nextAccessLabels = firebaseAccessLabelsFromSummary(summary);
        const nextMemberNamesByEmail = firebaseMemberNamesFromSummary(summary);
        const currentLabels = source.accessLabels || {};
        const currentMemberNamesByEmail = source.firebaseMemberNamesByEmail || {};
        const currentLabelSignature = JSON.stringify(Object.keys(currentLabels).sort().map((email) => [email, currentLabels[email]]));
        const nextLabelSignature = JSON.stringify(Object.keys(nextAccessLabels).sort().map((email) => [email, nextAccessLabels[email]]));
        const currentMemberNameSignature = JSON.stringify(Object.keys(currentMemberNamesByEmail).sort().map((email) => [email, currentMemberNamesByEmail[email]]));
        const nextMemberNameSignature = JSON.stringify(Object.keys(nextMemberNamesByEmail).sort().map((email) => [email, nextMemberNamesByEmail[email]]));
        const nextGroupId = summary.groupId || source.firebaseGroupId;
        const nextGroupName = summary.groupName || source.firebaseGroupName;
        const nextRole = summary.currentUserRole || source.firebaseRole;
        const nextOwnerUid = summary.ownerUid || source.firebaseOwnerUid;
        const nextOwnerEmail = summary.ownerEmail || source.firebaseOwnerEmail;
        const nextLastSavedByEmail = summary.lastSavedByEmail || source.firebaseLastSavedByEmail;
        const metadataChanged =
          currentLabelSignature !== nextLabelSignature ||
          currentMemberNameSignature !== nextMemberNameSignature ||
          source.firebaseGroupId !== nextGroupId ||
          source.firebaseGroupName !== nextGroupName ||
          source.firebaseRole !== nextRole ||
          source.firebaseOwnerUid !== nextOwnerUid ||
          source.firebaseOwnerEmail !== nextOwnerEmail ||
          source.firebaseLastSavedByEmail !== nextLastSavedByEmail;

        if (!metadataChanged) return roster;
        changed = true;
        return normalizeRoster({
          ...roster,
          cloudSource: {
            ...source,
            firebaseGroupId: nextGroupId,
            firebaseGroupName: nextGroupName,
            firebaseRole: nextRole,
            firebaseOwnerUid: nextOwnerUid,
            firebaseOwnerEmail: nextOwnerEmail,
            firebaseLastSavedByEmail: nextLastSavedByEmail,
            firebaseMemberNamesByEmail: nextMemberNamesByEmail,
            accessLabels: nextAccessLabels,
          },
        });
      });
      return changed ? { ...current, rosters: rostersWithFreshBadges } : current;
    });
  };


  useEffect(() => {
    const rosterId = activeFirebaseSource?.firebaseRosterId;
    const missingFirebaseGroupLink = Boolean(rosterId && !activeFirebaseSource?.firebaseGroupId);
    if (!missingFirebaseGroupLink || !rosterId) return;
    let cancelled = false;

    const attachMissingGroupMetadata = async () => {
      try {
        const summaries = await listFirebaseSharedRosters();
        if (cancelled) return;
        const matchingSummary = summaries.find((summary) => summary.id === rosterId);
        if (matchingSummary?.groupId) {
          syncFirebaseRosterBadgesFromSummaries([matchingSummary]);
          return;
        }

        // Some older linked local rosters have the shared roster ID but not the
        // group metadata needed by the Club Equipment board. If the summary list
        // did not restore it, read the exact shared roster document as a fallback.
        const snapshot = await readFirebaseSharedRoster(rosterId);
        if (!cancelled) syncFirebaseRosterBadgesFromSummaries([snapshot]);
      } catch {
        // The Shared Roster tools will show detailed sign-in/permission errors.
        // Club stays in its safe reconnecting state until the group link is restored.
      }
    };

    attachMissingGroupMetadata();
    return () => {
      cancelled = true;
    };
  }, [activeFirebaseSource?.firebaseRosterId, activeFirebaseSource?.firebaseGroupId]);
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
  const [headerSharedPeopleOpen, setHeaderSharedPeopleOpen] = useState(false);
  const [sharedRosterLibraryOpenToken, setSharedRosterLibraryOpenToken] = useState(0);
  const [rosterSwitchingName, setRosterSwitchingName] = useState("");
  const [clearRosterOpen, setClearRosterOpen] = useState(false);
  const [clearRosterSlide, setClearRosterSlide] = useState(0);
  const [privateCopyConfirmOpen, setPrivateCopyConfirmOpen] = useState(false);
  const [privateCopyCreating, setPrivateCopyCreating] = useState(false);
  const [leaveSharedConfirmOpen, setLeaveSharedConfirmOpen] = useState(false);
  const [leaveSharedBusy, setLeaveSharedBusy] = useState(false);
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
  const finishSharedInviteOpen = (openedRoster: RoomRoster) => {
    setTodayRosterChosen(true);
    closeRosterToolsPanel();
    setRosterFilesOpen(false);
    setActiveTab(openedRoster.players.length > 0 ? "today" : "players");
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

  const cleanPersonName = (value?: string) => {
    const clean = (value || "").replace(/\s+/g, " ").trim();
    if (!clean || clean.includes("@")) return "";
    return clean.slice(0, 80);
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

  const getGoogleSheetOwnerEmail = (file?: GoogleSheetRosterFile | null) => {
    const owner = getGoogleSheetOwner(file);
    return owner?.emailAddress?.trim() || (isGoogleSheetOwnedByMe(file) ? connectedDriveUser?.emailAddress?.trim() || "" : "");
  };

  const getGoogleSheetOwnerName = (file?: GoogleSheetRosterFile | null) => {
    const owner = getGoogleSheetOwner(file);
    const name = cleanPersonName(owner?.displayName || (isGoogleSheetOwnedByMe(file) ? connectedDriveUser?.displayName : ""));
    if (name) return name;
    const email = getGoogleSheetOwnerEmail(file);
    return email || "Another organizer";
  };

  const getGoogleSheetOwnerLabel = (file?: GoogleSheetRosterFile | null) => {
    if (!file) return "Owner unknown";
    return `Owner: ${getGoogleSheetOwnerName(file)}`;
  };


  const getGoogleSheetSharedBy = (file?: GoogleSheetRosterFile | null) => {
    if (!file || isGoogleSheetOwnedByMe(file)) return null;
    return file.sharingUser || null;
  };

  const getGoogleSheetSharedByEmail = (file?: GoogleSheetRosterFile | null) =>
    getGoogleSheetSharedBy(file)?.emailAddress?.trim() || "";

  const getGoogleSheetSharedByName = (file?: GoogleSheetRosterFile | null) => {
    const sharedBy = getGoogleSheetSharedBy(file);
    const name = cleanPersonName(sharedBy?.displayName);
    if (name) return name;
    return sharedBy?.emailAddress?.trim() || "";
  };

  const getGoogleSheetSharedByLine = (file?: GoogleSheetRosterFile | null) => {
    if (!file) return "Shared details unknown";
    if (isGoogleSheetOwnedByMe(file)) {
      return connectedDriveUser?.emailAddress ? `Owned by ${connectedDriveUser.emailAddress}` : "Owned by this Google account";
    }
    const sharedByName = getGoogleSheetSharedByName(file);
    const sharedByEmail = getGoogleSheetSharedByEmail(file);
    if (sharedByName) return `Shared by ${sharedByName}${sharedByEmail && sharedByEmail !== sharedByName ? ` · ${sharedByEmail}` : ""}`;
    const ownerName = getGoogleSheetOwnerName(file);
    const ownerEmail = getGoogleSheetOwnerEmail(file);
    return `Owner: ${ownerName}${ownerEmail && ownerEmail !== ownerName ? ` · ${ownerEmail}` : ""}`;
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

  const sheetCloudSourceFromFile = (file: GoogleSheetRosterFile, accessLabels?: Record<string, string>) => ({
    provider: "google-sheets" as const,
    spreadsheetId: file.id,
    spreadsheetName: file.name,
    webViewLink: file.webViewLink,
    lastSyncedAt: new Date().toISOString(),
    lastRemoteModifiedAt: file.modifiedTime,
    syncMode: "manual" as const,
    ...(accessLabels && Object.keys(accessLabels).length ? { accessLabels } : {}),
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

  const permissionEmailMatchesConnectedUser = (permission: GoogleDrivePermissionResult) => {
    const connectedEmail = connectedDriveUser?.emailAddress;
    return Boolean(
      permission.emailAddress &&
      connectedEmail &&
      normalizeShareEmail(permission.emailAddress) === normalizeShareEmail(connectedEmail),
    );
  };

  const googleSheetAccessLabels = activeGoogleSheetSource?.accessLabels || {};

  const googleSheetAccessLabelForEmail = (email?: string) => {
    const normalized = email ? normalizeShareEmail(email) : "";
    return normalized ? cleanPersonName(googleSheetAccessLabels[normalized]) : "";
  };

  const drivePermissionDisplay = (permission: GoogleDrivePermissionResult) => {
    const email = permission.emailAddress?.trim() || "";
    const savedName = googleSheetAccessLabelForEmail(email);
    const googleName = cleanPersonName(permission.displayName);
    const connectedName = permissionEmailMatchesConnectedUser(permission) ? cleanPersonName(connectedDriveUser?.displayName) : "";
    const name = savedName || googleName || connectedName || email || drivePermissionLabel(permission);
    return { name, email };
  };

  const googleSheetOwnerPermissions = (googleSheetAccessList || []).filter((permission) => permission.role === "owner");
  const googleSheetEditorPermissions = (googleSheetAccessList || []).filter((permission) => permission.role === "writer");
  const googleSheetOtherPermissions = (googleSheetAccessList || []).filter(
    (permission) => permission.role !== "owner" && permission.role !== "writer",
  );
  const googleSheetPermissionEmails = new Set(
    (googleSheetAccessList || [])
      .map((permission) => permission.emailAddress ? normalizeShareEmail(permission.emailAddress) : "")
      .filter(Boolean),
  );
  const googleSheetSavedEditorEntries = Object.entries(googleSheetAccessLabels)
    .map(([email, name]) => ({ email: normalizeShareEmail(email), name: cleanPersonName(name) }))
    .filter((entry) => entry.email && entry.name && !googleSheetPermissionEmails.has(entry.email));
  const googleSheetHasPeopleAccessInfo = Boolean(
    (googleSheetAccessList && googleSheetAccessList.length > 0) || googleSheetSavedEditorEntries.length > 0,
  );
  const connectedGoogleUserOwnsActiveSheet = googleSheetOwnerPermissions.some(permissionEmailMatchesConnectedUser);

  const downloadAllRostersBackup = () => {
    if (!hasPrivateBackupRosters) {
      showRosterToolsNotice(
        "No local rosters to export",
        "Shared rosters stay online. Open Shared rosters to reopen them, or make a private copy first.",
        "warning",
      );
      return;
    }
    downloadText(
      `fair-teams-local-rosters-backup.json`,
      rostersToBackupJson(rosters, activeRosterId),
      "application/json;charset=utf-8",
    );
    showRosterToolsNotice("Local backup exported", `Exported ${formatBackupSummary(privateBackupSummary)}. Shared rosters were not included.`, "success");
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

  const appScrollLockActive =
    groupSettingsOpen ||
    rosterFilesOpen ||
    rosterPickerOpen ||
    clearRosterOpen ||
    Boolean(driveImportPreview) ||
    Boolean(driveBackupChoices) ||
    Boolean(driveBackupDeleteConfirm) ||
    Boolean(localImportPreview) ||
    Boolean(rosterToolsNotice) ||
    driveShareOpen ||
    Boolean(driveShareConfirm) ||
    driveAccessOpen ||
    Boolean(driveRemoveConfirm) ||
    driveHelpOpen ||
    googleSheetHelpOpen ||
    Boolean(driveUpdateConfirm) ||
    Boolean(googleSheetChoices) ||
    Boolean(googleSheetActionFile) ||
    Boolean(googleSheetDeleteConfirm) ||
    googleSheetShareOpen ||
    Boolean(googleSheetConflictConfirm) ||
    Boolean(googleSheetUpdatePrompt);

  useEffect(() => {
    const clearFairTeamsScrollLock = () => {
      if (document.body.dataset.fairTeamsScrollLock === "true") {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        document.body.style.pointerEvents = "";
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("pointer-events");
        document.body.style.removeProperty("padding-right");
        document.documentElement.style.removeProperty("overflow");
        delete document.body.dataset.fairTeamsScrollLock;
      }
    };

    if (!appScrollLockActive) {
      clearFairTeamsScrollLock();
      return;
    }

    document.body.dataset.fairTeamsScrollLock = "true";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      clearFairTeamsScrollLock();
    };
  }, [appScrollLockActive]);

  useEffect(() => {
    const recoverReleasedScroll = () => {
      if (!appScrollLockActive && document.body.dataset.fairTeamsScrollLock === "true") {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        document.body.style.pointerEvents = "";
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("pointer-events");
        document.body.style.removeProperty("padding-right");
        document.documentElement.style.removeProperty("overflow");
        delete document.body.dataset.fairTeamsScrollLock;
      }
    };

    window.addEventListener("focus", recoverReleasedScroll);
    document.addEventListener("visibilitychange", recoverReleasedScroll);
    return () => {
      window.removeEventListener("focus", recoverReleasedScroll);
      document.removeEventListener("visibilitychange", recoverReleasedScroll);
    };
  }, [appScrollLockActive]);

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

  const shouldShowTodayStartHeader =
    activeTab === "teams" && teamsWorkspaceView === "setup" && rosters.length > 0 && !todayRosterChosen;
  const headerDisplayName = shouldShowTodayStartHeader
    ? formatTodayStartDateLabel()
    : activeRosterName || "Stripes";
  const isWhiteHeaderColor = headerColor.toLowerCase() === "#ffffff";
  const identityAccentColor = shouldShowTodayStartHeader
    ? "#E2E8F0"
    : isWhiteHeaderColor
      ? "#E2E8F0"
      : headerColor;
  const logoRingStyle = {
    borderColor: shouldShowTodayStartHeader
      ? "#E2E8F0"
      : isWhiteHeaderColor
        ? "#E2E8F0"
        : headerColor,
    boxShadow: shouldShowTodayStartHeader || isWhiteHeaderColor
      ? "0 1px 2px rgba(15, 23, 42, 0.08)"
      : `0 0 0 2px ${hexToRgba(headerColor, 0.14)}`,
  } as React.CSSProperties;

  useEffect(() => {
    setDraftGroupName(activeRosterName);
    setDraftHeaderColor(headerColor);
    setDraftGroupLogo(groupLogo);
  }, [activeRosterName, headerColor, groupLogo]);

  const replacePlayers = (nextPlayers: RoomPlayer[]) => {
    const normalizedPlayers = nextPlayers.map((player, index) => normalizePlayer(player, index));
    const safePlayerIds = new Set(normalizedPlayers.map((player) => player.id));
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? {
              ...roster,
              players: normalizedPlayers,
              pairingRules: (roster.pairingRules || []).filter((rule) =>
                safePlayerIds.has(rule.playerAId) &&
                safePlayerIds.has(rule.playerBId) &&
                rule.playerAId !== rule.playerBId,
              ),
              updatedAt: new Date().toISOString(),
            }
          : roster,
      ),
    }));
  };

  const replacePairingRules = (nextPairingRules: PairingRule[]) => {
    const safePlayerIds = new Set(players.map((player) => player.id));
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? {
              ...roster,
              pairingRules: nextPairingRules.filter((rule) =>
                (rule.kind === "together" || rule.kind === "separate") &&
                safePlayerIds.has(rule.playerAId) &&
                safePlayerIds.has(rule.playerBId) &&
                rule.playerAId !== rule.playerBId,
              ),
              updatedAt: new Date().toISOString(),
            }
          : roster,
      ),
    }));
  };

  const prepareTeamsFromAi = (teamCount: number, options: { autoGenerate?: boolean; shuffleEquals?: boolean } = {}) => {
    const safeTeamCount = Math.min(6, Math.max(2, Math.round(teamCount)));
    setSessionTeamCount(safeTeamCount);
    setTeamsWorkspaceView(options.autoGenerate ? "result" : "setup");
    setAiTeamSetup({
      token: Date.now(),
      teamCount: safeTeamCount,
      autoGenerate: Boolean(options.autoGenerate),
      shuffleEquals: Boolean(options.shuffleEquals),
    });
    setActiveTab("teams");
    return safeTeamCount;
  };

  const applyAiSmartCommandActionFromApp = async (action: AiSmartCommandAction) => {
    if (action.type === "select_players") {
      const playerIds = new Set(
        action.playerRefs
          .map((playerRef) => playerRef.playerId)
          .filter((playerId): playerId is string => Boolean(playerId)),
      );
      if (playerIds.size === 0) {
        throw new Error("I understood a player-selection request, but could not match any roster players.");
      }

      const shouldReplaceTodaySelection = /replace|exact|only/i.test(String(action.distribution || ""));
      replacePlayers(
        players.map((player) => {
          if (playerIds.has(player.id)) {
            return { ...player, attending: true, todayStatus: "here" };
          }
          if (shouldReplaceTodaySelection) {
            return { ...player, attending: false, todayStatus: "" };
          }
          return player;
        }),
      );
      setTodayRosterChosen(true);

      const shouldGenerateAfterSelection = shouldReplaceTodaySelection && /then_generate/i.test(String(action.distribution || ""));
      if (shouldGenerateAfterSelection) {
        let teamCount = typeof action.teamCount === "number" ? Math.round(action.teamCount) : null;
        const playersPerTeam = typeof action.playersPerTeam === "number" ? Math.round(action.playersPerTeam) : null;
        if (!teamCount && playersPerTeam && playersPerTeam > 0 && playerIds.size % playersPerTeam === 0) {
          teamCount = playerIds.size / playersPerTeam;
        }
        if (!teamCount || teamCount < 2 || playerIds.size < teamCount) {
          return `Replaced Session with ${playerIds.size} player${playerIds.size === 1 ? "" : "s"}. I still need a valid team count before generating teams.`;
        }
        const safeTeamCount = prepareTeamsFromAi(teamCount, { autoGenerate: true });
        return `Replaced Session with ${playerIds.size} player${playerIds.size === 1 ? "" : "s"} and generated ${safeTeamCount} balanced team${safeTeamCount === 1 ? "" : "s"}.`;
      }

      return shouldReplaceTodaySelection
        ? `Replaced Session with ${playerIds.size} player${playerIds.size === 1 ? "" : "s"}.`
        : `Added/selected ${playerIds.size} player${playerIds.size === 1 ? "" : "s"} for Session without clearing the current selection.`;
    }

    if (action.type === "mark_players_late") {
      const playerIds = new Set(
        action.playerRefs
          .map((playerRef) => playerRef.playerId)
          .filter((playerId): playerId is string => Boolean(playerId)),
      );
      if (playerIds.size === 0) {
        throw new Error("I understood a late-player request, but could not match any roster players.");
      }

      replacePlayers(
        players.map((player) =>
          playerIds.has(player.id)
            ? { ...player, attending: true, todayStatus: "late" }
            : player,
        ),
      );
      setTodayRosterChosen(true);
      return `Marked ${playerIds.size} player${playerIds.size === 1 ? "" : "s"} as late in Session.`;
    }

    if (action.type === "unselect_players") {
      const playerIds = new Set(
        action.playerRefs
          .map((playerRef) => playerRef.playerId)
          .filter((playerId): playerId is string => Boolean(playerId)),
      );
      if (playerIds.size === 0) {
        throw new Error("I understood a remove-from-Session request, but could not match any roster players.");
      }

      replacePlayers(
        players.map((player) =>
          playerIds.has(player.id)
            ? { ...player, attending: false, todayStatus: "" }
            : player,
        ),
      );
      setTodayRosterChosen(true);
      return `Removed ${playerIds.size} player${playerIds.size === 1 ? "" : "s"} from Session without changing anyone else.`;
    }

    if (action.type === "add_new_player_suggestion") {
      const newPlayerName = action.newPlayerName?.trim();
      if (!newPlayerName) {
        throw new Error("I understood a new-player request, but no player name was found.");
      }

      const normalizeLookupName = (name: string) =>
        name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
      const nextNameKey = normalizeLookupName(newPlayerName);
      const duplicate = players.find((player) => {
        const names = [player.name, player.aka]
          .join(" ")
          .split(/[,/;|·•]+|\baka\b|\bAKA\b/i)
          .map((part) => normalizeLookupName(part))
          .filter(Boolean);
        return names.includes(nextNameKey);
      });
      if (duplicate) {
        replacePlayers(
          players.map((player) =>
            player.id === duplicate.id
              ? { ...player, attending: true, todayStatus: "here" }
              : player,
          ),
        );
        setTodayRosterChosen(true);
        return `${duplicate.name} is already in this roster, so I selected them for Session.`;
      }

      const suggestedSkill =
        typeof action.suggestedSkill === "number" && Number.isFinite(action.suggestedSkill)
          ? Math.min(10, Math.max(1, Math.round(action.suggestedSkill * 2) / 2))
          : 5;
      const now = new Date().toISOString();
      const nextPlayer = normalizePlayer(
        {
          name: newPlayerName,
          skill: suggestedSkill,
          attack: suggestedSkill,
          defense: suggestedSkill,
          speed: suggestedSkill,
          passing: suggestedSkill,
          stamina: suggestedSkill,
          physical: suggestedSkill,
          teamPlay: 2,
          attending: true,
          todayStatus: "here",
          isNew: true,
          createdAt: now,
          updatedAt: now,
        },
        players.length,
      );
      replacePlayers([...players, nextPlayer]);
      setTodayRosterChosen(true);
      setReviewPlayerQueue([nextPlayer.id]);
      setReviewPlayerIndex(0);
      setReviewAutoOpenPlayerId(nextPlayer.id);
      setActiveTab("players");
      return `Added ${nextPlayer.name} as a new player, selected them for Session, and opened their player profile for review.`;
    }

    if (action.type === "set_team_count") {
      if (typeof action.teamCount !== "number") {
        throw new Error("I understood a team-count request, but no team count was found.");
      }
      const safeTeamCount = prepareTeamsFromAi(action.teamCount);
      return `Prepared the Teams tab for ${safeTeamCount} team${safeTeamCount === 1 ? "" : "s"}.`;
    }

    if (action.type === "set_team_size") {
      const playersPerTeam = action.playersPerTeam;
      if (typeof playersPerTeam !== "number" || playersPerTeam < 1) {
        throw new Error("I understood a team-size request, but no team size was found.");
      }
      const selectedCount = players.filter((player) => player.attending).length;
      if (selectedCount < playersPerTeam * 2) {
        throw new Error(`${playersPerTeam}v${playersPerTeam} needs at least ${playersPerTeam * 2} selected players. Select more players first.`);
      }
      if (selectedCount % playersPerTeam !== 0) {
        throw new Error(`${playersPerTeam}v${playersPerTeam} does not fit ${selectedCount} selected players evenly. Select ${playersPerTeam * 2}, ${playersPerTeam * 3}, or ${playersPerTeam * 4} players, or use a team-count command instead.`);
      }
      const safeTeamCount = prepareTeamsFromAi(selectedCount / playersPerTeam);
      return `Prepared ${safeTeamCount} team${safeTeamCount === 1 ? "" : "s"} for ${playersPerTeam}v${playersPerTeam}.`;
    }

    if (action.type === "generate_teams") {
      const selectedCount = players.filter((player) => player.attending).length;
      if (selectedCount < 2) {
        throw new Error("Select at least two players in Session before generating teams.");
      }

      let teamCount = typeof action.teamCount === "number" ? action.teamCount : null;
      const playersPerTeam = action.playersPerTeam;
      if (!teamCount && typeof playersPerTeam === "number" && playersPerTeam > 0) {
        if (selectedCount < playersPerTeam * 2) {
          throw new Error(`${playersPerTeam}v${playersPerTeam} needs at least ${playersPerTeam * 2} selected players. Select more players first.`);
        }
        if (selectedCount % playersPerTeam !== 0) {
          throw new Error(`${playersPerTeam}v${playersPerTeam} does not fit ${selectedCount} selected players evenly. Ask for a number of teams instead.`);
        }
        teamCount = selectedCount / playersPerTeam;
      }
      if (!teamCount) {
        throw new Error("I understood a generate-teams request, but I need the number of teams first.");
      }
      if (teamCount < 2 || selectedCount < teamCount) {
        throw new Error(`I can’t make ${teamCount} teams from ${selectedCount} selected player${selectedCount === 1 ? "" : "s"}.`);
      }
      const shuffleEquals = /shuffle|different|mix|fresh|new/i.test(`${action.distribution || ""} ${action.reason || ""}`);
      const safeTeamCount = prepareTeamsFromAi(teamCount, { autoGenerate: true, shuffleEquals });
      return `Generated ${safeTeamCount} balanced team${safeTeamCount === 1 ? "" : "s"} from ${selectedCount} selected player${selectedCount === 1 ? "" : "s"}.`;
    }

    if (action.type === "add_pairing_rule") {
      const kind = action.pairingKind === "keep_together" ? "together" : action.pairingKind === "keep_separate" ? "separate" : null;
      const playerIds = action.playerRefs
        .map((playerRef) => playerRef.playerId)
        .filter((playerId): playerId is string => Boolean(playerId));
      const [playerAId, playerBId] = playerIds;
      if (!kind || !playerAId || !playerBId || playerAId === playerBId) {
        throw new Error("I understood a pairing rule, but could not match two roster players.");
      }

      const duplicate = pairingRules.some((rule) => {
        const samePlayers =
          (rule.playerAId === playerAId && rule.playerBId === playerBId) ||
          (rule.playerAId === playerBId && rule.playerBId === playerAId);
        return rule.kind === kind && samePlayers;
      });
      if (duplicate) {
        return "That pairing rule already exists.";
      }

      const nextRule: PairingRule = {
        id: `ai-pair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        playerAId,
        playerBId,
        createdAt: new Date().toISOString(),
      };
      replacePairingRules([...pairingRules, nextRule]);
      return kind === "together" ? "Added a Keep Together rule." : "Added a Keep Separate rule.";
    }

    if (action.type === "open_app_area") {
      const rawArea = String(action.targetArea || "").trim().toLowerCase();
      const targetTab = rawArea.includes("roster") || rawArea.includes("player")
        ? "players"
        : rawArea.includes("today") || rawArea.includes("session") || rawArea.includes("attendance") || rawArea.includes("team")
          ? "teams"
          : rawArea.includes("club") || rawArea.includes("organizer") || rawArea.includes("equipment") || rawArea.includes("note")
            ? "club"
            : null;
      if (!targetTab || !isAppTab(targetTab)) {
        throw new Error("I understood an open-area request, but I could not tell which Stripes tab to open.");
      }
      if (targetTab === "teams" && (rawArea.includes("today") || rawArea.includes("session") || rawArea.includes("attendance"))) setTeamsWorkspaceView("setup");
      setActiveTab(targetTab);
      return `Opened ${targetTab === "players" ? "Roster" : targetTab === "teams" ? "Teams" : "Club"}.`;
    }

    throw new Error("Stripes understands this, but it is not wired to apply yet.");
  };


  const openFirebaseSharedRosterAsLocalCopy = (sharedRoster: RoomRoster, sourceName: string, firebaseSummary?: FirebaseSharedRosterSummary) => {
    const firebaseRosterId = firebaseSummary?.id;
    let openedExisting = false;

    setRosterState((current) => {
      const existingLinkedRoster = firebaseRosterId
        ? current.rosters.find((roster) => roster.cloudSource?.provider === "firebase" && roster.cloudSource.firebaseRosterId === firebaseRosterId)
        : undefined;

      if (existingLinkedRoster) {
        openedExisting = true;
        return {
          ...current,
          activeRosterId: existingLinkedRoster.id,
        };
      }

      const imported = createRoster(
        firebaseSummary
          ? sourceName || sharedRoster.name || "Shared roster"
          : uniqueRosterName(sourceName || sharedRoster.name || "Firebase roster", current.rosters),
        sharedRoster.players,
        { themeColor: sharedRoster.themeColor },
      );
      const linkedRoster = normalizeRoster({
        ...imported,
        pairingRules: sharedRoster.pairingRules || [],
        cloudSource: firebaseSummary
          ? {
              provider: "firebase",
              firebaseRosterId: firebaseSummary.id,
              firebaseGroupId: firebaseSummary.groupId,
              firebaseGroupName: firebaseSummary.groupName,
              firebaseVersion: firebaseSummary.version,
              firebaseOwnerUid: firebaseSummary.ownerUid,
              firebaseOwnerEmail: firebaseSummary.ownerEmail,
              firebaseRole: firebaseSummary.currentUserRole,
              firebaseLastSavedByEmail: firebaseSummary.lastSavedByEmail,
              firebaseMemberNamesByEmail: firebaseMemberNamesFromSummary(firebaseSummary),
              lastSyncedAt: new Date().toISOString(),
              lastRemoteModifiedAt: firebaseSummary.updatedAt,
              accessLabels: firebaseAccessLabelsFromSummary(firebaseSummary),
              syncMode: "manual",
            }
          : undefined,
      });
      return {
        rosters: [...current.rosters, linkedRoster],
        activeRosterId: linkedRoster.id,
      };
    });
    setRosterToolsNotice({
      tone: "success",
      title: openedExisting ? "Shared roster selected" : "Firebase roster opened",
      message: openedExisting
        ? `${firebaseSummary?.groupName ? `${firebaseSummary.groupName} · ` : ""}${sourceName || sharedRoster.name || "Shared roster"} is already open on this device.`
        : `${firebaseSummary?.groupName ? `${firebaseSummary.groupName} · ` : ""}${sourceName || sharedRoster.name || "Shared roster"} was opened on this device. It remains an online shared roster connected to your account.`,
    });
  };

  const markActiveFirebaseRosterSaved = (summary: FirebaseSharedRosterSummary, localRosterId?: string) => {
    setRosterState((current) => {
      const targetRosterId = localRosterId || current.activeRosterId;
      return {
        ...current,
        rosters: current.rosters.map((roster) =>
          roster.id === targetRosterId
            ? normalizeRoster({
                ...roster,
                cloudSource: {
                  provider: "firebase",
                  firebaseRosterId: summary.id,
                  firebaseGroupId: summary.groupId,
                  firebaseGroupName: summary.groupName,
                  firebaseVersion: summary.version,
                  firebaseOwnerUid: summary.ownerUid,
                  firebaseOwnerEmail: summary.ownerEmail,
                  firebaseRole: summary.currentUserRole,
                  firebaseLastSavedByEmail: summary.lastSavedByEmail,
                  firebaseMemberNamesByEmail: firebaseMemberNamesFromSummary(summary),
                  accessLabels: firebaseAccessLabelsFromSummary(summary),
                  lastSyncedAt: summary.updatedAt || new Date().toISOString(),
                  lastRemoteModifiedAt: summary.updatedAt,
                  syncMode: "manual",
                },
                updatedAt: summary.updatedAt || new Date().toISOString(),
              })
            : roster,
        ),
      };
    });
  };



  const refreshFirebaseRosterIdentityFromRemote = (remoteRoster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => {
    setRosterState((current) => {
      const targetRosterId = localRosterId || current.activeRosterId;
      return {
        ...current,
        rosters: current.rosters.map((roster) => {
          if (roster.id !== targetRosterId) return roster;
          return normalizeRoster({
            ...roster,
            name: sourceName || remoteRoster.name || roster.name,
            themeColor: remoteRoster.themeColor || roster.themeColor,
            cloudSource: {
              provider: "firebase",
              firebaseRosterId: summary.id,
              firebaseGroupId: summary.groupId,
              firebaseGroupName: summary.groupName,
              firebaseVersion: summary.version,
              firebaseOwnerUid: summary.ownerUid,
              firebaseOwnerEmail: summary.ownerEmail,
              firebaseRole: summary.currentUserRole,
              firebaseLastSavedByEmail: summary.lastSavedByEmail,
              firebaseMemberNamesByEmail: firebaseMemberNamesFromSummary(summary),
              accessLabels: firebaseAccessLabelsFromSummary(summary),
              lastSyncedAt: summary.updatedAt || new Date().toISOString(),
              lastRemoteModifiedAt: summary.updatedAt,
              syncMode: "manual",
            },
          });
        }),
      };
    });
  };

  const refreshActiveFirebaseRosterFromRemote = (remoteRoster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => {
    setRosterState((current) => {
      const targetRosterId = localRosterId || current.activeRosterId;
      return {
        ...current,
        rosters: current.rosters.map((roster) => {
          if (roster.id !== targetRosterId) return roster;

          const photoById = new Map(roster.players.filter((player) => player.profilePhoto).map((player) => [player.id, player.profilePhoto]));
          const photoByName = new Map(
            roster.players
              .filter((player) => player.profilePhoto)
              .map((player) => [player.name.trim().toLowerCase(), player.profilePhoto]),
          );

          const refreshedPlayers = remoteRoster.players.map((player, index) =>
            normalizePlayer({
              ...player,
              profilePhoto: photoById.get(player.id) || photoByName.get(player.name.trim().toLowerCase()) || player.profilePhoto,
            }, index),
          );

          return normalizeRoster({
            ...roster,
            // Shared identity must refresh together with players so roster renames
            // and theme changes appear on every connected device.
            name: sourceName || remoteRoster.name || roster.name,
            themeColor: remoteRoster.themeColor || roster.themeColor,
            players: refreshedPlayers,
            pairingRules: remoteRoster.pairingRules || [],
            cloudSource: {
              provider: "firebase",
              firebaseRosterId: summary.id,
              firebaseGroupId: summary.groupId,
              firebaseGroupName: summary.groupName,
              firebaseVersion: summary.version,
              firebaseOwnerUid: summary.ownerUid,
              firebaseOwnerEmail: summary.ownerEmail,
              firebaseRole: summary.currentUserRole,
              firebaseLastSavedByEmail: summary.lastSavedByEmail,
              firebaseMemberNamesByEmail: firebaseMemberNamesFromSummary(summary),
              accessLabels: firebaseAccessLabelsFromSummary(summary),
              lastSyncedAt: summary.updatedAt || new Date().toISOString(),
              lastRemoteModifiedAt: summary.updatedAt,
              syncMode: "manual",
            },
            updatedAt: summary.updatedAt || new Date().toISOString(),
          });
        }),
      };
    });
    setRosterToolsNotice({
      tone: "success",
      title: "Shared roster updated",
      message: `${summary.groupName ? `${summary.groupName} · ` : ""}${sourceName || remoteRoster.name || "Shared roster"} shared player info and pairing rules were updated from online version ${summary.version}. Private/local rosters were not affected.`,
    });
  };


  const makePrivateCopyOfActiveSharedRoster = async () => {
    if (!activeRoster || !activeRosterIsFirebaseShared || privateCopyCreating) return;
    const sharedRosterId = activeRoster.cloudSource?.firebaseRosterId;
    setPrivateCopyCreating(true);
    try {
      const clubSummaryByPlayerId = new Map<string, ClubRatingSummary>();
      if (sharedRosterId) {
        try {
          const summaries = await fetchClubRatingSummaries(sharedRosterId);
          summaries.forEach((summary) => {
            if (summary.ratingCount > 0 && typeof summary.averageSkill === "number") {
              clubSummaryByPlayerId.set(summary.playerId, summary);
            }
          });
        } catch (error) {
          console.warn("Could not load Club averages for private copy; using neutral ratings.", error);
        }
      }

      const copiedPlayers = activeRoster.players.map((player, index) => {
        const summary = clubSummaryByPlayerId.get(player.id);
        const startingSkill = summary?.averageSkill ?? player.skill ?? 5;
        const copiedProfile = summary
          ? profileFromAveragedAttributes(startingSkill, {
              attack: summary.averageAttack ?? undefined,
              defense: summary.averageDefense ?? undefined,
              speed: summary.averageSpeed ?? undefined,
              passing: summary.averagePassing ?? undefined,
              stamina: summary.averageStamina ?? undefined,
              physical: summary.averagePhysical ?? undefined,
            })
          : {
              attack: player.attack,
              defense: player.defense,
              speed: player.speed,
              passing: player.passing,
              stamina: player.stamina,
              physical: player.physical,
              teamPlay: player.teamPlay,
            };
        return normalizePlayer({
          id: player.id,
          name: player.name,
          aka: player.aka,
          gender: player.gender,
          isNew: player.isNew,
          funBadge: player.funBadge,
          skill: startingSkill,
          attack: copiedProfile.attack,
          defense: copiedProfile.defense,
          speed: copiedProfile.speed,
          passing: copiedProfile.passing,
          stamina: copiedProfile.stamina,
          physical: copiedProfile.physical,
          teamPlay: summary ? 2 : copiedProfile.teamPlay,
          profilePhoto: undefined,
          isGoalkeeper: Boolean((summary?.gkYesCount || 0) > 0 || (!summary && player.isGoalkeeper)),
          isPlaymaker: false,
          isFinisher: false,
          isDribbler: false,
          isSentinel: false,
          isEngine: false,
          isVersatile: false,
          isSpaceFinder: false,
          isLongPass: false,
          isTikiTaka: false,
          isCrossing: false,
          isAerial: false,
          isPowerShot: false,
          isBulldog: false,
          isOrganizer: false,
          attending: false,
          todayStatus: "here",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, index);
      });

      const copyName = uniqueRosterName(`${activeRoster.name || "Shared roster"} private copy`, rosters);
      const localCopy = normalizeRoster({
        ...createRoster(copyName, copiedPlayers, {
          themeColor: activeRoster.themeColor,
          logo: activeRoster.logo,
        }),
        pairingRules: activeRoster.pairingRules || [],
        cloudSource: undefined,
        updatedAt: new Date().toISOString(),
      });

      setRosterState((current) => ({
        rosters: [...current.rosters, localCopy],
        activeRosterId: localCopy.id,
      }));
      setPrivateCopyConfirmOpen(false);
      setTodayRosterChosen(true);
      setActiveTab("players");
      const seededCount = copiedPlayers.filter((player) => clubSummaryByPlayerId.has(player.id)).length;
      showRosterToolsNotice(
        "Private copy created",
        `“${localCopy.name}” is a clean local roster. It copied shared names, Club stat averages, and GK flags for ${seededCount} player${seededCount === 1 ? "" : "s"}; photos and special abilities were reset.`,
        "success",
      );
    } finally {
      setPrivateCopyCreating(false);
    }
  };


  const leaveActiveSharedRoster = async () => {
    if (!activeRoster || !activeRosterIsFirebaseShared || leaveSharedBusy) return;
    const firebaseRosterId = activeRoster.cloudSource?.firebaseRosterId;
    if (!firebaseRosterId) return;
    setLeaveSharedBusy(true);
    try {
      const result = await leaveFirebaseSharedRosterAccess(firebaseRosterId);
      const affectedRosterIds = new Set(result.rosterIds);
      const affectedGroupId = result.groupId || activeRoster.cloudSource?.firebaseGroupId;
      setRosterState((current) => {
        const remaining = current.rosters.filter((roster) => {
          const source = roster.cloudSource?.provider === "firebase" ? roster.cloudSource : undefined;
          if (!source?.firebaseRosterId) return true;
          if (affectedRosterIds.has(source.firebaseRosterId)) return false;
          if (affectedGroupId && source.firebaseGroupId === affectedGroupId) return false;
          return true;
        });
        if (remaining.length === 0) {
          const empty = createRoster(EMPTY_ROSTER_NAME, []);
          return { rosters: [empty], activeRosterId: empty.id };
        }
        return { rosters: remaining, activeRosterId: remaining[0]?.id || current.activeRosterId };
      });
      setLeaveSharedConfirmOpen(false);
      setTeamsWorkspaceView("setup");
      setActiveTab("teams");
      setTodayRosterChosen(false);
      showRosterToolsNotice(
        "Left shared roster",
        result.groupName
          ? `You left “${result.groupName}”. Shared roster copies from that group were removed from this device.`
          : `You left “${activeRosterName}”. The local opened copy was removed from this device.`,
        "success",
      );
    } catch (error) {
      showRosterToolsNotice("Could not leave shared roster", error instanceof Error ? error.message : "Try again after signing in.", "error");
    } finally {
      setLeaveSharedBusy(false);
    }
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

  const renderRosterPickerOption = (roster: RoomRoster) => {
    const selected = roster.id === activeRosterId;
    const shared = isRosterCloudShared(roster);
    return (
      <button
        key={roster.id}
        type="button"
        onClick={() => switchRosterWithPause(roster)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
          selected
            ? shared
              ? "border-violet-200 bg-violet-50/90"
              : "border-blue-200 bg-blue-50/80"
            : shared
              ? "border-violet-100 bg-violet-50/50 hover:bg-violet-50"
              : "border-slate-100 bg-slate-50/70 hover:bg-white"
        }`}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-bold text-[#102A43]">
              {roster.name}
            </span>
            <RosterKindBadge roster={roster} />
            {roster.cloudSource?.provider === "firebase" && roster.cloudSource.firebaseRosterId && (
              <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-white px-1.5 text-[10px] font-black text-violet-700 shadow-sm ring-1 ring-violet-100">
                <Users className="h-3 w-3" />
                {rosterFirebaseSharedPeopleCount(roster)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
            {roster.players.length} player
            {roster.players.length === 1 ? "" : "s"}
            {shared ? " · opens from Shared rosters" : " · private on this device"}
          </span>
        </span>
        {selected ? (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${shared ? "bg-violet-700" : "bg-[#102A43]"}`}>
            <Check className="h-4 w-4" />
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-lg font-black leading-none text-slate-400 shadow-sm">
            ›
          </span>
        )}
      </button>
    );
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
      void warmUpGoogleDrivePicker();
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
      showRosterToolsNotice("Choose a Stripes backup", "Please select a Stripes .json backup file.", "warning");
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
      setDriveBackupTab("mine");
    } catch (error) {
      showRosterToolsNotice("Could not list Google Drive backups", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveOpening(false);
    }
  };


  const confirmTrashGoogleDriveBackup = async () => {
    if (!driveBackupDeleteConfirm) return;
    const file = driveBackupDeleteConfirm.file;
    if (file.ownedByMe === false) {
      setDriveBackupDeleteConfirm(null);
      showRosterToolsNotice(
        "Cannot delete received backup",
        "This backup belongs to someone else. Ask the owner to delete it, or remove it directly from Google Drive.",
        "warning",
      );
      return;
    }

    setGoogleDriveDeletingFileId(file.id);
    try {
      await trashGoogleDriveFile(googleDriveAccessToken, file.id);
      setDriveBackupChoices((current) => current
        ? {
            mine: current.mine.filter((item) => item.id !== file.id),
            shared: current.shared.filter((item) => item.id !== file.id),
          }
        : current,
      );
      if (currentDriveBackup?.id === file.id) {
        setCurrentDriveBackup(null);
      }
      setDriveBackupDeleteConfirm(null);
      showRosterToolsNotice("Backup moved to trash", `${file.name} was moved to your Google Drive trash.`, "success");
    } catch (error) {
      showRosterToolsNotice("Could not delete backup", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleDriveDeletingFileId("");
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
    showRosterToolsNotice("Google Drive import complete", `Replaced local rosters with ${rosterCount} roster${rosterCount === 1 ? "" : "s"} from Google Drive. Shared roster links are not restored from backups.`, "success");
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
    if (!hasPrivateBackupRosters) {
      showRosterToolsNotice("No local rosters to back up", "Shared rosters stay online in Shared rosters. Make a private copy first if you want a local backup version.", "warning");
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
    if (!hasPrivateBackupRosters) {
      showRosterToolsNotice("No local rosters to back up", "Shared rosters stay online in Shared rosters. Make a private copy first if you want a local backup version.", "warning");
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
      "This Google account cannot find the linked shared roster. It may have been deleted, moved to trash, or not shared with this account. Stripes kept the local roster on this device and removed the broken link. Use Open a shared roster to connect again.",
      "warning",
    );
  };

  const updateActiveRosterGoogleSheetSource = (file: GoogleSheetRosterFile, accessLabels = activeGoogleSheetSource?.accessLabels) => {
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? normalizeRoster({
              ...roster,
              cloudSource: sheetCloudSourceFromFile(file, accessLabels),
              updatedAt: new Date().toISOString(),
            })
          : roster,
      ),
    }));
  };

  const disconnectActiveRosterFromGoogleSheet = () => {
    if (!activeGoogleSheetSource?.spreadsheetId) {
      showRosterToolsNotice("No shared roster linked", "This roster is already saved only on this device.", "info");
      return false;
    }
    const confirmed = window.confirm(
      `Stop syncing this roster?

The shared Google Sheet will not be deleted. This device will keep a local copy only.`,
    );
    if (!confirmed) return false;

    removeActiveRosterGoogleSheetLink();
    showRosterToolsNotice(
      "Syncing stopped",
      "This device now keeps a local copy only. The shared roster still exists and can be opened again later.",
      "success",
    );
    return true;
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
      // Routine shared-roster saves are intentionally silent. Surface only problems that need attention.
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
          cloudSource: sheetCloudSourceFromFile(file, withLocalImages.cloudSource?.accessLabels),
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
          sourceUpdates.set(roster.id, sheetCloudSourceFromFile(file, source.accessLabels));
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

      const sharedSaveNeedsAttention = newerOnlineNames.length > 0 || failedNames.length > 0 || missingRosterIds.size > 0 || skippedEmptyCount > 0;
      if (sharedSaveNeedsAttention) {
        showRosterToolsNotice(
          "Shared roster save finished with notes",
          summaryLines.join("\n"),
          "warning",
        );
      }
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
              cloudSource: sheetCloudSourceFromFile(item.file, withLocalImages.cloudSource?.accessLabels),
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


  const findGoogleSheetRosterInDrive = async () => {
    if (!googleDriveConfig.isConfigured) {
      showRosterToolsNotice("Google Drive not configured", "Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY before opening shared rosters.", "warning");
      return;
    }
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before opening shared rosters.", "warning");
      return;
    }

    // Google Picker is its own overlay. Close Stripes overlays first so the
    // picker is not hidden behind our modal stack and the app does not feel frozen.
    setGoogleSheetChoices(null);
    setGoogleSheetActionFile(null);
    setGoogleSheetShareOpen(false);
    setRosterToolsNotice(null);
    setGoogleSheetOpening(false);

    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const picked = await pickGoogleSheetRosterFile(googleDriveAccessToken);
      if (!picked) return;

      setGoogleSheetOpening(true);
      const file = await getGoogleSheetRosterFileMetadata(googleDriveAccessToken, picked.id);
      setGoogleSheetActionFile(file);
    } catch (error) {
      showRosterToolsNotice("Could not open shared roster file", error instanceof Error ? error.message : "Please try again.", "error");
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
          cloudSource: sheetCloudSourceFromFile(file, withLocalImages.cloudSource?.accessLabels),
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
      setGoogleSheetActionFile(null);
      setRosterFilesOpen(false);
      showRosterToolsNotice("Shared roster opened", `${file.name} is now available in Stripes.`, "success");
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

  const loadGoogleSheetAccessList = async () => {
    if (!googleDriveAccessToken || !activeGoogleSheetSource?.spreadsheetId) return;
    setGoogleSheetAccessLoading(true);
    try {
      const permissions = await listGoogleDriveFilePermissions(googleDriveAccessToken, activeGoogleSheetSource.spreadsheetId);
      setGoogleSheetAccessList(permissions.filter((permission) => !permission.deleted));
    } catch (error) {
      if (isMissingSharedRosterError(error)) {
        handleMissingActiveGoogleSheetLink();
        setGoogleSheetShareOpen(false);
        return;
      }
      setGoogleSheetAccessList([]);
      showRosterToolsNotice("Could not load sharing access", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetAccessLoading(false);
    }
  };

  const openGoogleSheetShareModal = async () => {
    if (!googleDriveAccessToken) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before managing sharing access.", "warning");
      return;
    }
    if (!activeGoogleSheetSource?.spreadsheetId) {
      showRosterToolsNotice("Make it shared first", "Create or open a shared roster before managing access.", "warning");
      return;
    }
    setGoogleSheetShareName("");
    setGoogleSheetShareEmail("");
    setGoogleSheetAccessList(null);
    setGoogleSheetShareOpen(true);
    await loadGoogleSheetAccessList();
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
      const editorName = cleanPersonName(googleSheetShareName);
      const nextAccessLabels = { ...(activeGoogleSheetSource.accessLabels || {}) };
      if (editorName) {
        nextAccessLabels[email] = editorName;
      }

      await shareGoogleSheetRosterWithEditor(
        googleDriveAccessToken,
        activeGoogleSheetSource.spreadsheetId,
        email,
      );

      const updatedFile = await updateGoogleSheetRosterAccessLabels(
        googleDriveAccessToken,
        activeGoogleSheetSource.spreadsheetId,
        nextAccessLabels,
      );
      updateActiveRosterGoogleSheetSource(updatedFile, nextAccessLabels);
      setGoogleSheetShareName("");
      setGoogleSheetShareEmail("");
      await loadGoogleSheetAccessList();
      showRosterToolsNotice("Editor added", `${editorName || email} can now edit this shared roster through Stripes.`, "success");
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

  const removeGoogleSheetEditorAccess = async (permission: GoogleDrivePermissionResult) => {
    if (!activeGoogleSheetSource?.spreadsheetId || !permission.id) return;
    const label = drivePermissionLabel(permission);
    const confirmed = window.confirm(`Remove access for ${label}?

They will no longer be able to open or edit this shared roster unless it is shared with them again.`);
    if (!confirmed) return;

    setGoogleSheetRemovingPermissionId(permission.id);
    try {
      await deleteGoogleDriveFilePermission(googleDriveAccessToken, activeGoogleSheetSource.spreadsheetId, permission.id);
      const email = permission.emailAddress ? normalizeShareEmail(permission.emailAddress) : "";
      if (email && activeGoogleSheetSource.accessLabels?.[email]) {
        const nextAccessLabels = { ...activeGoogleSheetSource.accessLabels };
        delete nextAccessLabels[email];
        const updatedFile = await updateGoogleSheetRosterAccessLabels(
          googleDriveAccessToken,
          activeGoogleSheetSource.spreadsheetId,
          nextAccessLabels,
        );
        updateActiveRosterGoogleSheetSource(updatedFile, nextAccessLabels);
      }
      setGoogleSheetAccessList((current) => current ? current.filter((item) => item.id !== permission.id) : current);
      showRosterToolsNotice("Access removed", `${label} can no longer access this shared roster through this direct file permission.`, "success");
    } catch (error) {
      showRosterToolsNotice("Could not remove access", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setGoogleSheetRemovingPermissionId("");
    }
  };

  const openDriveShareModal = () => {
    if (!googleDriveConnected) {
      showRosterToolsNotice("Sign in with Google first", "Sign in with your Google account before sending a backup copy.", "warning");
      return;
    }
    if (!hasPrivateBackupRosters) {
      showRosterToolsNotice("No local rosters to back up", "Shared rosters stay online in Shared rosters. Make a private copy first if you want a local backup version.", "warning");
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
    const removingFirebaseSharedRoster = activeRosterIsFirebaseShared;
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
        removingFirebaseSharedRoster
          ? "The online Firebase shared roster was not changed or deleted. Sign in and open it again from Club → Shared rosters."
          : "The online shared roster was not changed or deleted. Open the shared roster again to get the latest version.",
        "success",
      );
    }
  };


  const openSharedRostersFromLocalFlow = () => {
    closeClearRoster();
    setRosterFilesOpen(false);
    setRosterToolsOpen(false);
    setRosterSharedToolsOpen(false);
    setRosterLocalBackupToolsOpen(false);
    setActiveTab("club");
    setSharedRosterLibraryOpenToken((token) => token + 1);
  };

  const visibleDriveBackupChoices = driveBackupChoices
    ? [...driveBackupChoices.mine]
    : [];
  const totalDriveBackupChoices = driveBackupChoices
    ? driveBackupChoices.mine.length
    : 0;

  const closeTopLevelOverlayForBack = () => {
    if (clearRosterOpen) {
      closeClearRoster();
      return true;
    }
    if (groupSettingsOpen) {
      cancelGroupSettings();
      return true;
    }
    if (rosterPickerOpen) {
      setRosterPickerOpen(false);
      return true;
    }
    if (headerSharedPeopleOpen) {
      setHeaderSharedPeopleOpen(false);
      return true;
    }
    if (googleSheetShareOpen) {
      setGoogleSheetShareOpen(false);
      return true;
    }
    if (driveBackupDeleteConfirm) {
      setDriveBackupDeleteConfirm(null);
      return true;
    }
    if (driveShareOpen) {
      setDriveShareOpen(false);
      return true;
    }
    if (driveAccessOpen) {
      setDriveAccessOpen(false);
      return true;
    }
    if (driveHelpOpen) {
      setDriveHelpOpen(false);
      return true;
    }
    if (googleSheetHelpOpen) {
      setGoogleSheetHelpOpen(false);
      return true;
    }
    if (rosterFilesOpen) {
      if (rosterToolsActivePanel) {
        closeRosterToolsPanel();
        return true;
      }
      setRosterFilesOpen(false);
      return true;
    }
    return false;
  };

  const goBackToPreviousTab = () => {
    const stack = tabHistoryRef.current.filter(isAppTab);
    const currentTab = activeTabRef.current;
    if (stack.length <= 1) return false;

    const nextStack = [...stack];
    if (nextStack[nextStack.length - 1] === currentTab) {
      nextStack.pop();
    }
    while (nextStack.length > 1 && nextStack[nextStack.length - 1] === currentTab) {
      nextStack.pop();
    }

    const previousTab = nextStack[nextStack.length - 1];
    if (!previousTab || previousTab === currentTab) return false;

    tabHistoryRef.current = nextStack;
    restoringTabFromBackRef.current = true;
    setActiveTab(previousTab);
    return true;
  };

  const pushFairTeamsBackTrap = () => {
    if (typeof window === "undefined") return;
    try {
      window.history.pushState(
        { fairTeamsBackTrap: true },
        "",
        window.location.href,
      );
      fairTeamsBackTrapArmedRef.current = true;
    } catch {
      // Browser history integration is a progressive enhancement.
    }
  };

  const hasTopLevelBackTarget =
    clearRosterOpen ||
    groupSettingsOpen ||
    rosterPickerOpen ||
    headerSharedPeopleOpen ||
    googleSheetShareOpen ||
    Boolean(driveBackupDeleteConfirm) ||
    driveShareOpen ||
    driveAccessOpen ||
    driveHelpOpen ||
    googleSheetHelpOpen ||
    rosterFilesOpen ||
    clubBackTargetOpen ||
    tabHistoryRef.current.length > 1 ||
    activeTab !== "teams";

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (restoringTabFromBackRef.current) {
      restoringTabFromBackRef.current = false;
      return;
    }

    const stack = tabHistoryRef.current;
    if (stack[stack.length - 1] !== activeTab) {
      tabHistoryRef.current = [...stack, activeTab].slice(-16);
    }
  }, [activeTab]);

  useEffect(() => {
    if (showSplash || !hasTopLevelBackTarget || fairTeamsBackTrapArmedRef.current) return;
    pushFairTeamsBackTrap();
  }, [hasTopLevelBackTarget, showSplash]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      fairTeamsBackTrapArmedRef.current = false;

      const childBackEvent = new Event("fairteams:native-back", { cancelable: true });
      const childDidNotHandleBack = window.dispatchEvent(childBackEvent);
      if (!childDidNotHandleBack) {
        pushFairTeamsBackTrap();
        return;
      }

      if (closeTopLevelOverlayForBack()) {
        pushFairTeamsBackTrap();
        return;
      }

      if (goBackToPreviousTab()) {
        pushFairTeamsBackTrap();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    clearRosterOpen,
    driveAccessOpen,
    driveBackupDeleteConfirm,
    driveHelpOpen,
    driveShareOpen,
    googleSheetHelpOpen,
    googleSheetShareOpen,
    groupSettingsOpen,
    headerSharedPeopleOpen,
    rosterFilesOpen,
    rosterPickerOpen,
    rosterToolsActivePanel,
  ]);

  const startGuidedTour = (replay = false) => {
    if (tutorialStartedRef.current || tutorialStep) return;
    tutorialStartedRef.current = true;
    tutorialSnapshotRef.current = { rosterState, activeTab, todayRosterChosen };
    setTutorialReplayMode(replay);
    const now = new Date().toISOString();
    const practiceNames = [
      ["Leo", 9], ["Cristiano", 9], ["Marta", 9],
      ["Zinedine", 8], ["Ronaldinho", 8], ["Luka", 8],
      ["Andrés", 7], ["Didier", 7], ["Manuel", 8],
    ] as const;
    const practicePlayers: RoomPlayer[] = practiceNames.map(([name, skill], index) => normalizePlayer({
      id: `tutorial-${index + 1}`,
      roomId: 1,
      name,
      gender: index === 2 ? "female" : "male",
      skill,
      attack: skill,
      defense: Math.max(1, skill - (index % 3)),
      speed: Math.max(1, skill - (index % 2)),
      passing: skill,
      stamina: Math.max(1, skill - 1),
      physical: Math.max(1, skill - 1),
      teamPlay: 2,
      isGoalkeeper: name === "Manuel",
      isNew: false,
      attending: index < 9,
      todayStatus: "here",
      createdAt: now,
      updatedAt: now,
    }, index));
    replacePlayers(practicePlayers);
    setTodayRosterChosen(true);
    setActiveTab("players");
    setTutorialStep("open-add");
  };

  const finishGuidedTour = () => {
    localStorage.setItem("fairteams-onboarding-v140-complete", "1");
    if (tutorialReplayMode && tutorialSnapshotRef.current) {
      setRosterState(tutorialSnapshotRef.current.rosterState);
      setActiveTab(tutorialSnapshotRef.current.activeTab);
      setTodayRosterChosen(tutorialSnapshotRef.current.todayRosterChosen);
    }
    tutorialSnapshotRef.current = null;
    tutorialStartedRef.current = false;
    setTutorialReplayMode(false);
    setTutorialPlayerId(null);
    setTutorialStep(null);
  };

  const skipGuidedTour = () => {
    localStorage.setItem("fairteams-onboarding-v140-complete", "1");
    if (tutorialSnapshotRef.current) {
      setRosterState(tutorialSnapshotRef.current.rosterState);
      setActiveTab(tutorialSnapshotRef.current.activeTab);
      setTodayRosterChosen(tutorialSnapshotRef.current.todayRosterChosen);
    }
    tutorialSnapshotRef.current = null;
    tutorialStartedRef.current = false;
    setTutorialReplayMode(false);
    setTutorialPlayerId(null);
    setRosterFilesOpen(false);
    setTutorialStep(null);
  };

  useEffect(() => {
    if (!onboardingReady || tutorialStep || tutorialStartedRef.current) return;

    const url = new URL(window.location.href);
    const forceTour = url.searchParams.get("tour") === "1";
    const onboardingComplete = localStorage.getItem("fairteams-onboarding-v140-complete") === "1";
    const hasAnyPlayers = rosters.some((roster) => roster.players.length > 0);
    const hasSharedRoster = rosters.some((roster) => isRosterCloudShared(roster));
    const unusedApp = !hasAnyPlayers && !hasSharedRoster;

    if (forceTour) {
      url.searchParams.delete("tour");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      if (!unusedApp) return;
    }

    if (onboardingComplete || !unusedApp) return;
    startGuidedTour(false);
  }, [onboardingReady, onboardingProbe, tutorialStep, rosters, activeRosterId]);


  const handleTutorialBack = () => {
    if (!tutorialStep) return;
    if (tutorialStep === "today-tab") { setActiveTab("players"); setTutorialStep("flip-card"); return; }
    if (tutorialStep === "generate") { setTeamsWorkspaceView("setup"); setActiveTab("teams"); setTutorialStep("select-today"); return; }
    if (tutorialStep === "club-tab") { setActiveTab("teams"); setTutorialStep("magic-reveal"); return; }
    if (tutorialStep === "club-intro") { setTutorialStep("club-tab"); return; }
    if (tutorialStep === "roster-return") { setActiveTab("club"); setTutorialStep("help-question"); return; }
    if (tutorialStep === "settings-button") { setActiveTab("players"); setTutorialStep("roster-return"); return; }
    if (tutorialStep === "create-roster") { setRosterFilesOpen(false); setTutorialStep("settings-button"); return; }
  };

  const tutorialCanGoBack = ["today-tab", "generate", "club-tab", "club-intro", "roster-return", "settings-button", "create-roster"].includes(tutorialStep || "");

  const handleTutorialAction = (action: string, playerId?: string) => {
    if (!tutorialStep) return;
    if (action === "add-options-opened" && tutorialStep === "open-add") setTutorialStep("add-manual");
    else if (action === "manual-opened" && tutorialStep === "add-manual") setTutorialStep("submit-player");
    else if (action === "player-added" && tutorialStep === "submit-player") { setTutorialPlayerId(playerId || null); setTutorialStep("open-edit"); }
    else if (action === "edit-opened" && tutorialStep === "open-edit") setTutorialStep("advanced-edit");
    else if (action === "advanced-opened" && tutorialStep === "advanced-edit") setTutorialStep("save-edit");
    else if (action === "edit-saved" && tutorialStep === "save-edit") setTutorialStep("flip-card");
    else if (action === "card-flipped" && tutorialStep === "flip-card") setTutorialStep("today-tab");
    else if (action === "today-selected" && tutorialStep === "select-today") setTutorialStep("generate");
    else if (action === "generated" && tutorialStep === "generate") {
      setTutorialStep("magic-wait");
      window.setTimeout(() => setTutorialStep("magic-reveal"), 1450);
      window.setTimeout(() => setTutorialStep("club-tab"), 4300);
    }
    else if (action === "help-question-submitted" && tutorialStep === "help-question") {
      window.setTimeout(() => setTutorialStep("roster-return"), 3200);
    }
  };

  if (showSplash) {
    return (
      <div className="stripes-splash min-h-[100dvh] flex flex-col items-center justify-center bg-white text-[#102A43]">
        <div className="stripes-splash-mark" aria-label="Stripes">
          <img src={stripesLogo} alt="" className="stripes-splash-final" aria-hidden="true" />
        </div>
        <div className="stripes-splash-copy text-center">
          <h1 className="stripes-display text-[42px] font-semibold tracking-[-0.035em] leading-none text-[#102A43]">
            Stripes
          </h1>
          <p className="mt-3 text-sm font-semibold tracking-[0.025em] text-slate-500">
            Organizer’s unfair advantage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tutorial-active={tutorialActive ? "true" : undefined}
      className="fairteams-visual-refresh stripes-type-ui flex h-[100dvh] min-h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-background md:max-w-3xl lg:w-[96vw] lg:max-w-[1760px] lg:rounded-none xl:my-3 xl:h-[calc(100dvh-1.5rem)] xl:min-h-[calc(100dvh-1.5rem)] xl:rounded-[2rem] xl:border xl:border-slate-200 xl:shadow-xl mx-auto relative"
      style={{ "--roster-accent": identityAccentColor } as React.CSSProperties}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (!isAppTab(value)) return;
          if (tutorialStep === "today-tab" && value === "teams") { setTeamsWorkspaceView("setup"); setActiveTab("teams"); setTutorialStep("select-today"); return; }
          if (tutorialStep === "club-tab" && value === "club") {
            setActiveTab("club");
            replacePlayers([]);
            window.setTimeout(() => setTutorialStep("club-intro"), 350);
            return;
          }
          if (tutorialStep === "roster-return" && value === "players") {
            setActiveTab("players");
            setTutorialStep("settings-button");
            return;
          }
          if (tutorialActive) return;
          if (value === "players" && activeTab !== "players") setOpenPairingRulesToken(0);
          setActiveTab(value);
        }}
        className={`fairteams-desktop-workspace relative flex min-h-0 flex-1 flex-col ${shouldShowTodayStartHeader ? "" : "lg:pl-[204px]"}`}
      >
        <FirebaseSharedRosterPublishCard
          headless
          backgroundSync
          activeRoster={activeRoster}
          rosters={rosters}
          isEmptyRoster={isEmptyStarterRoster}
          onOpenRoster={openFirebaseSharedRosterAsLocalCopy}
          onRosterSaved={markActiveFirebaseRosterSaved}
          onRefreshActiveRoster={refreshActiveFirebaseRosterFromRemote}
          onRefreshRosterIdentity={refreshFirebaseRosterIdentityFromRemote}
          onSharedRosterSummariesUpdated={syncFirebaseRosterBadgesFromSummaries}
          onSharedInviteOpened={finishSharedInviteOpen}
        />

        {!shouldShowTodayStartHeader && (
          <aside className="absolute inset-y-0 left-0 z-40 hidden w-[204px] flex-col border-r border-slate-200 bg-white/96 p-4 backdrop-blur lg:flex">
            <div className="flex items-center px-1.5 py-2">
              <span className="flex h-16 w-full items-center justify-center overflow-hidden rounded-[1.35rem] border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
                <img src={stripesLogo} alt="Stripes" className="h-[3.65rem] w-[3.65rem] object-contain" />
              </span>
            </div>
            <TabsList className="mt-6 flex h-auto w-full flex-col gap-1.5 rounded-none border-0 bg-transparent p-0 shadow-none">
              {([
                ["players", "Roster", Users],
                ["teams", "Teams", RefreshCw],
                ["club", "Club", Building2],
              ] as const).map(([value, label, Icon]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={`fairteams-tab-trigger fairteams-desktop-nav-trigger stripes-type-ui flex h-[3.5rem] w-full justify-start gap-3.5 rounded-xl border border-transparent px-3.5 text-[17px] font-black text-slate-500 shadow-none transition-colors hover:bg-slate-50 data-[state=active]:border-slate-200 data-[state=active]:bg-slate-50 data-[state=active]:text-[#102A43] data-[state=active]:shadow-none ${(tutorialStep === "today-tab" && value === "teams") || (tutorialStep === "club-tab" && value === "club") || (tutorialStep === "roster-return" && value === "players") ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                >
                  {value === "teams" ? (
                    <TeamStripesIcon className="h-6 w-6 shrink-0" />
                  ) : (
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                  )}
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-auto" aria-hidden="true" />
          </aside>
        )}

        {!shouldShowTodayStartHeader && (
          <header className="sticky top-0 z-30 hidden min-h-[82px] items-center justify-between gap-5 border-b border-slate-200 bg-white/94 px-7 py-3 shadow-sm backdrop-blur lg:flex">
            <div className="flex min-w-0 items-center">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="stripes-type-ui truncate text-[26px] font-black tracking-tight text-[#102A43]" title={activeRosterName}>{activeRosterName}</h1>
                  {!isEmptyStarterRoster && (
                    <span className={`stripes-type-ui inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] font-black uppercase tracking-wide ${activeRosterIsShared ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100" : "bg-slate-100 text-slate-500"}`}>
                      {activeRosterIsShared ? "Shared" : "Local"}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] font-bold text-slate-400">{activeTab === "players" ? "Roster" : activeTab === "teams" ? "Teams" : "Club"}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={openGroupSettings} className="stripes-type-ui inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] font-black text-[#102A43] shadow-sm hover:bg-slate-50" title="Edit roster">
                <Pencil className="h-[18px] w-[18px]" strokeWidth={2.25} /> Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  closeRosterToolsPanel();
                  setRosterFilesOpen(true);
                  if (tutorialStep === "settings-button") {
                    if (tutorialReplayMode) {
                      setRosterFilesOpen(false);
                      setTutorialStep("recap");
                    } else {
                      window.requestAnimationFrame(() => setTutorialStep("create-roster"));
                    }
                  }
                }}
                className={`stripes-type-ui inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] font-black text-[#102A43] shadow-sm hover:bg-slate-50 ${tutorialStep === "settings-button" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                title="Roster tools"
              >
                <Settings className="h-[18px] w-[18px]" strokeWidth={2.25} /> Settings
              </button>
            </div>
          </header>
        )}

        <header className="sticky top-0 z-30 border-b border-border bg-white/92 px-2 pt-3 pb-2 shadow-sm backdrop-blur min-[310px]:px-4 lg:hidden">
          <div className="flex items-center justify-between gap-2 px-0 pb-2 min-[310px]:gap-3 min-[310px]:px-1">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={
                  activeTab === "players" ? openGroupSettings : undefined
                }
                className={`group flex max-w-full min-w-0 items-center gap-2 text-left min-[310px]:gap-2.5 ${activeTab === "players" ? "transition-transform active:scale-[0.99]" : "cursor-default"}`}
                title={
                  activeTab === "players"
                    ? "Edit active roster name, logo, and color"
                    : headerDisplayName
                }
                aria-label={
                  activeTab === "players"
                    ? "Edit active roster identity"
                    : shouldShowTodayStartHeader
                      ? `Session start: ${headerDisplayName}`
                      : `Current roster: ${activeRosterName}`
                }
              >
                {!shouldShowTodayStartHeader && (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-white shadow-sm min-[310px]:h-9 min-[310px]:w-9 min-[310px]:rounded-2xl"
                    style={logoRingStyle}
                  >
                    <img
                      src={groupLogo || stripesLogo}
                      alt=""
                      className="h-[88%] w-[88%] object-contain"
                    />
                  </span>
                )}
                <span className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <h1
                    className={`stripes-type-ui min-w-0 max-w-full flex-[1_1_100%] truncate leading-tight text-[#102A43] min-[310px]:flex-[1_1_auto] ${
                      shouldShowTodayStartHeader
                        ? "text-[14px] font-black uppercase tracking-[0.075em] text-[#102A43]/65"
                        : "text-[17px] font-black tracking-tight"
                    }`}
                  >
                    {headerDisplayName}
                  </h1>
                  {!shouldShowTodayStartHeader && !isEmptyStarterRoster && (
                    <span
                      className={`stripes-type-ui inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10px] font-black uppercase tracking-wide min-[310px]:text-[11px] ${activeRosterIsShared ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100" : "bg-slate-100 text-slate-500"}`}
                      title={activeRosterIsShared ? "Shared roster" : "Local roster"}
                    >
                      {activeRosterIsShared ? "Shared" : "Local"}
                    </span>
                  )}
                  {activeRosterIsFirebaseShared && !shouldShowTodayStartHeader && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="stripes-type-ui inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 text-[10px] font-black text-emerald-700 active:scale-95"
                      title="Organizers"
                      aria-label="Show people with access"
                      onClick={(event) => {
                        event.stopPropagation();
                        setHeaderSharedPeopleOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          setHeaderSharedPeopleOpen(true);
                        }
                      }}
                    >
                      <Users className="h-3 w-3" />
                      {rosterFirebaseSharedPeopleCount(activeRoster)}
                    </span>
                  )}
                  {activeTab === "players" && (
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#102A43]/65 shadow-sm transition-colors group-hover:text-[#102A43] min-[310px]:h-6 min-[310px]:w-6"
                      title="Edit roster"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeTab === "teams" && (
                <span className="hidden text-right text-[9px] font-extrabold leading-[0.95] text-slate-400 tracking-tight whitespace-nowrap min-[310px]:block">
                  <span className="block">Balanced teams.</span>
                  <span className="block">Better games.</span>
                </span>
              )}
              {activeTab !== "teams" && activeTab !== "club" && !shouldShowTodayStartHeader && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={`h-8 w-8 rounded-xl border border-slate-200 bg-white/85 text-[#102A43] shadow-none min-[310px]:h-9 min-[310px]:w-9 ${tutorialStep === "settings-button" ? "fairteams-tutorial-pulse" : ""}`}
                  onClick={() => {
                    closeRosterToolsPanel();
                    setRosterFilesOpen(true);
                    if (tutorialStep === "settings-button") {
                      if (tutorialReplayMode) {
                        setRosterFilesOpen(false);
                        setTutorialStep("recap");
                      } else {
                        window.requestAnimationFrame(() => setTutorialStep("create-roster"));
                      }
                    }
                  }}
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
        </header>

        {headerSharedPeopleOpen && (
          <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/20 p-3 sm:items-center" onClick={() => setHeaderSharedPeopleOpen(false)}>
            <div className="w-full max-w-xs rounded-3xl border border-slate-100 bg-white p-3 shadow-[0_14px_40px_rgba(15,23,42,0.16)]" onClick={(event) => event.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-sm font-black text-[#102A43]">Organizers</div>
                  <div className="text-[10px] font-bold text-slate-400">People who can open this shared roster</div>
                </div>
                <button type="button" onClick={() => setHeaderSharedPeopleOpen(false)} className="rounded-full bg-slate-50 p-2 text-slate-500 active:scale-95" aria-label="Close organizers">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-1.5">
                {activeFirebaseSharedPersonNames.length ? activeFirebaseSharedPersonNames.map((name) => (
                  <div key={name} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-[#102A43]">{name}</div>
                )) : (
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">Only you</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto p-4 md:p-5 lg:px-7 lg:py-6 ${shouldShowTodayStartHeader ? "pb-6 md:pb-6" : activeTab === "teams" && teamsWorkspaceView === "setup" ? "pb-36 md:pb-36 lg:pb-28" : "pb-20 md:pb-20 lg:pb-6"}`} style={{ WebkitOverflowScrolling: "touch" }}>
          <div className={`mx-auto flex min-h-[calc(100dvh-116px)] w-full flex-col ${shouldShowTodayStartHeader ? "lg:max-w-6xl lg:justify-center" : activeTab === "players" ? "lg:max-w-[1480px]" : activeTab === "teams" && teamsWorkspaceView === "setup" ? "lg:max-w-[1480px]" : activeTab === "teams" ? "lg:max-w-none" : "lg:mx-0 lg:max-w-none"}`}>
            <TabsContent
              value="players"
              forceMount
              className={`fairteams-tab-panel m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 ${activeTab === "players" ? "block" : "hidden"}`}
            >
              <PlayersTab
                players={players}
                setPlayers={replacePlayers}
                pairingRules={pairingRules}
                setPairingRules={replacePairingRules}
                onScreenshotImport={() => {
                  setOcrImportContext("roster");
                  setTeamsWorkspaceView("setup");
                  setActiveTab("teams");
                  setTodayOcrOpenToken((token) => token + 1);
                }}
                reviewPlayerId={reviewAutoOpenPlayerId}
                reviewActivePlayerId={reviewActivePlayerId}
                reviewPlayerIndex={reviewPlayerIndex}
                reviewPlayerTotal={reviewPlayerQueue.length}
                onReviewPlayerHandled={() => setReviewAutoOpenPlayerId(null)}
                onReviewNext={openNextReviewPlayer}
                onReviewDone={finishReviewPlayerQueue}
                openPairingRulesToken={openPairingRulesToken}
                openAddPlayerRequest={externalAddPlayerRequest}
                isSharedRoster={activeRosterIsFirebaseShared}
                sharedRosterId={activeFirebaseSource?.firebaseRosterId}
                sharedOrganizerCount={rosterFirebaseSharedPeopleCount(activeRoster)}
                tutorialStep={tutorialStep}
                onTutorialAction={handleTutorialAction}
              />
            </TabsContent>
            <TabsContent
              value="teams"
              forceMount
              className={`fairteams-tab-panel m-0 ${activeTab === "teams" ? "block" : "hidden"}`}
            >
              <div className={teamsWorkspaceView === "setup" ? "block" : "hidden"}>
                <TodayTab
                  players={players}
                  setPlayers={replacePlayers}
                  themeColor={headerColor}
                  rosterChoices={rosters}
                  activeRosterId={activeRosterId}
                  onChooseRoster={switchRoster}
                  todayRosterChosen={todayRosterChosen}
                  onTodayRosterChosen={() => setTodayRosterChosen(true)}
                  onChooseEmptyRoster={() => setActiveTab("players")}
                  onOpenRosterPicker={() => setRosterPickerOpen(true)}
                  tutorialTargetPlayerId={tutorialStep === "select-today" ? tutorialPlayerId : null}
                  onTutorialSelected={(playerId) => handleTutorialAction("today-selected", playerId)}
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
              </div>
              <div className={teamsWorkspaceView === "result" ? "block" : "hidden"}>
                <TeamsTab
                  players={players}
                  pairingRules={pairingRules}
                  isSharedRoster={activeRosterIsFirebaseShared}
                  sharedRosterId={activeFirebaseSource?.firebaseRosterId}
                  onOpenClubRatings={() => setActiveTab("club")}
                  onEditPlayers={() => setTeamsWorkspaceView("setup")}
                  aiTeamSetupToken={aiTeamSetup.token}
                  aiTeamCount={aiTeamSetup.teamCount}
                  aiAutoGenerate={Boolean(aiTeamSetup.autoGenerate)}
                  aiShuffleEquals={Boolean(aiTeamSetup.shuffleEquals)}
                  onAiTeamStateChange={setAiTeamsState}
                  tutorialStep={tutorialStep}
                  onTutorialAction={handleTutorialAction}
                />
              </div>
            </TabsContent>
            <TabsContent
              value="club"
              className="fairteams-tab-panel m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50"
            >
              <ClubTab
                isActive={activeTab === "club"}
                activeRosterName={activeRosterName}
                workspaceKey={activeRosterId}
                themeColor={headerColor}
                playerCount={players.length}
                players={players}
                isSharedRoster={activeRosterIsFirebaseShared}
                sharedRosterId={activeFirebaseSource?.firebaseRosterId}
                sharedPeopleCount={rosterFirebaseSharedPeopleCount(activeRoster)}
                canSwitchRoster={!isEmptyStarterRoster && rosters.length > 1}
                onOpenRosterPicker={() => setRosterPickerOpen(true)}
                onBackTargetChange={setClubBackTargetOpen}
                pairingRules={pairingRules}
                onOpenPairingRules={() => {
                  setOpenPairingRulesToken((token) => token + 1);
                }}
                onOpenSharedRosters={() => {
                  setSharedRosterLibraryOpenToken((token) => token + 1);
                }}
                onOpenTeams={() => setActiveTab("teams")}
                onRequestAddPlayer={(suggestedName) => {
                  setExternalAddPlayerRequest({ token: Date.now(), name: suggestedName });
                  setActiveTab("players");
                }}
                currentTeamCount={aiTeamsState.teamCount}
                currentTeamsGenerated={aiTeamsState.hasTeams}
                onApplyAiSmartCommandAction={applyAiSmartCommandActionFromApp}
                onOpenTodayFromAi={() => {
                  setTodayRosterChosen(true);
                  setTeamsWorkspaceView("setup");
                  setActiveTab("teams");
                }}
                tutorialStep={tutorialStep}
                onTutorialAction={handleTutorialAction}
                sharedToolsNode={(
                  <FirebaseSharedRosterPublishCard
                    variant="compact"
                    backgroundSync={false}
                    activeRoster={activeRoster}
                    rosters={rosters}
                    isEmptyRoster={isEmptyStarterRoster}
                    onOpenRoster={openFirebaseSharedRosterAsLocalCopy}
                    onRosterSaved={markActiveFirebaseRosterSaved}
                    onRefreshActiveRoster={refreshActiveFirebaseRosterFromRemote}
          onRefreshRosterIdentity={refreshFirebaseRosterIdentityFromRemote}
                    onSharedRosterSummariesUpdated={syncFirebaseRosterBadgesFromSummaries}
                    onSharedInviteOpened={finishSharedInviteOpen}
                    openLibraryToken={sharedRosterLibraryOpenToken}
                    onMakePrivateCopy={activeRosterIsFirebaseShared ? (() => setPrivateCopyConfirmOpen(true)) : undefined}
                    onHideOnDevice={activeRosterIsFirebaseShared ? openClearRoster : undefined}
                  />
                )}
                equipmentGroupId={activeFirebaseSource?.firebaseRosterId ? `roster:${activeFirebaseSource.firebaseRosterId}` : undefined}
                equipmentHolderLabels={activeFirebaseEquipmentHolderLabels}
                equipmentHolderNamesByEmail={activeFirebaseEquipmentHolderNamesByEmail}
              />
            </TabsContent>
          </div>
        </div>

        {!shouldShowTodayStartHeader && activeTab === "teams" && teamsWorkspaceView === "setup" && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 hidden lg:block">
            <div className="mx-auto w-[96vw] max-w-[1760px] pl-[204px]">
              <div className="stripes-generate-dock stripes-type-ui pointer-events-auto mx-auto flex w-full max-w-md items-stretch gap-2 rounded-2xl p-1 shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
                <label className="relative block h-12 w-[68px] shrink-0" title="Number of teams">
                  <span className="pointer-events-none absolute left-0 right-0 top-1 text-center text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Teams</span>
                  <select
                    aria-label="Number of teams"
                    value={sessionTeamCount}
                    onChange={(event) => setSessionTeamCount(Number(event.target.value))}
                    className="stripes-team-count h-12 w-full rounded-xl border border-slate-200 bg-white px-2 pb-0.5 pt-3 text-center text-[19px] font-black leading-none text-[#102A43] shadow-sm outline-none transition active:scale-[0.98] focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    data-testid="desktop-team-count"
                  >
                    {[2, 3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => { prepareTeamsFromAi(sessionTeamCount, { autoGenerate: true }); if (tutorialStep === "generate") handleTutorialAction("generated"); }}
                  disabled={players.filter((player) => player.attending).length < 2}
                  className={`stripes-generate-button flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl px-4 text-[14px] font-black text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${tutorialStep === "generate" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                  title={players.filter((player) => player.attending).length < 2 ? "Select at least 2 players" : `Generate ${sessionTeamCount} teams`}
                  data-testid="desktop-generate-teams"
                >
                  Generate teams
                </button>
              </div>
            </div>
          </div>
        )}

        {!shouldShowTodayStartHeader && (
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_14px_rgba(15,23,42,0.035)] backdrop-blur md:max-w-3xl lg:hidden">
            {activeTab === "teams" && teamsWorkspaceView === "setup" && (
              <div className="stripes-generate-dock stripes-type-ui mx-auto mb-2 flex w-full max-w-md items-stretch gap-2 rounded-2xl p-1">
                <label className="relative block h-12 w-[68px] shrink-0" title="Number of teams">
                  <span className="pointer-events-none absolute left-0 right-0 top-1 text-center text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Teams</span>
                  <select
                    aria-label="Number of teams"
                    value={sessionTeamCount}
                    onChange={(event) => setSessionTeamCount(Number(event.target.value))}
                    className="stripes-team-count h-12 w-full rounded-xl border border-slate-200 bg-white px-2 pb-0.5 pt-3 text-center text-[19px] font-black leading-none text-[#102A43] shadow-sm outline-none transition active:scale-[0.98] focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    data-testid="session-team-count"
                  >
                    {[2, 3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => { prepareTeamsFromAi(sessionTeamCount, { autoGenerate: true }); if (tutorialStep === "generate") handleTutorialAction("generated"); }}
                  disabled={players.filter((player) => player.attending).length < 2}
                  className={`stripes-generate-button flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl px-4 text-[14px] font-black text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${tutorialStep === "generate" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                  title={players.filter((player) => player.attending).length < 2 ? "Select at least 2 players" : `Generate ${sessionTeamCount} teams`}
                  data-testid="session-generate-teams"
                >
                  Generate teams
                </button>
              </div>
            )}
            <TabsList className="mx-auto grid h-[50px] w-full max-w-md grid-cols-3 gap-1 rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm md:h-[58px] md:max-w-2xl md:gap-1.5 md:p-2">
              <TabsTrigger
                value="players"
                className={`fairteams-tab-trigger ${tutorialStep === "roster-return" ? "fairteams-tutorial-pulse relative z-[82]" : ""} fairteams-footer-text-tab flex h-full items-center justify-center rounded-xl text-slate-500 transition-all`}
              >
                <span className="text-[12px] font-semibold leading-none tracking-tight md:text-[14px] md:font-bold">Roster</span>
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className={`fairteams-tab-trigger ${tutorialStep === "today-tab" ? "fairteams-tutorial-pulse relative z-[82]" : ""} fairteams-footer-text-tab flex h-full items-center justify-center rounded-xl text-slate-500 transition-all`}
              >
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold leading-none tracking-tight md:gap-1.5 md:text-[14px] md:font-bold"><TeamStripesIcon className="h-3.5 w-3.5 md:h-[18px] md:w-[18px]" /> Teams</span>
              </TabsTrigger>
              <TabsTrigger
                value="club"
                className={`fairteams-tab-trigger ${tutorialStep === "club-tab" ? "fairteams-tutorial-pulse relative z-[82]" : ""} fairteams-footer-text-tab flex h-full items-center justify-center rounded-xl text-slate-500 transition-all`}
              >
                <span className="text-[12px] font-semibold leading-none tracking-tight md:text-[14px] md:font-bold">Club</span>
              </TabsTrigger>
            </TabsList>
          </div>
        )}
      </Tabs>

      {tutorialStep && tutorialCopy[tutorialStep] && (() => {
        const tutorialProgress: Record<string, number> = {
          "open-add": 1,
          "add-manual": 2,
          "submit-player": 3,
          "open-edit": 4,
          "advanced-edit": 5,
          "save-edit": 6,
          "flip-card": 7,
          "today-tab": 8,
          "select-today": 9,
          "generate": 10,
          "magic-wait": 11,
          "magic-reveal": 11,
          "club-tab": 12,
          "club-intro": 13,
          "help-question": 14,
          "roster-return": 15,
          "settings-button": 16,
          "create-roster": 17,
          "recap": 18,
        };
        const tutorialTotal = 18;
        const currentNumber = tutorialProgress[tutorialStep] ?? 1;
        const largeStep = ["magic-wait", "magic-reveal", "club-intro", "recap"].includes(tutorialStep);
        const coachPlacement: Record<string, string> = {
          "open-add": "bottom-[calc(5.6rem+env(safe-area-inset-bottom))]",
          "add-manual": "top-[0.75rem]",
          "submit-player": "top-[0.5rem]",
          "open-edit": "bottom-[calc(5.8rem+env(safe-area-inset-bottom))]",
          "advanced-edit": "top-[0.5rem]",
          "save-edit": "top-[0.5rem]",
          "flip-card": "top-[12.75rem]",
          "today-tab": "bottom-[calc(6.4rem+env(safe-area-inset-bottom))]",
          "select-today": "bottom-[calc(6.4rem+env(safe-area-inset-bottom))]",
          "generate": "bottom-[9rem]",
          "club-tab": "bottom-[calc(5.6rem+env(safe-area-inset-bottom))]",
          "help-question": "top-[0.75rem]",
          "roster-return": "bottom-[calc(6.4rem+env(safe-area-inset-bottom))]",
          "settings-button": "bottom-[calc(5.6rem+env(safe-area-inset-bottom))]",
          "create-roster": "top-[0.75rem]",
        };
        const coachPosition = coachPlacement[tutorialStep] ?? "top-[5.25rem]";

        if (!largeStep) {
          return (
            <div
              className={`pointer-events-none fixed inset-x-3 z-[95] mx-auto max-w-sm lg:max-w-lg ${coachPosition}`}
            >
              <div className="pointer-events-auto rounded-2xl border border-emerald-100 bg-white/98 px-3.5 py-3 shadow-[0_12px_34px_rgba(15,23,42,.16)] backdrop-blur-sm lg:rounded-3xl lg:px-6 lg:py-5">
                <div className="flex items-start gap-3 lg:gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-black leading-tight text-[#102A43] lg:text-[22px]">{tutorialCopy[tutorialStep].title}</div>
                    <div className="mt-1 text-[12px] font-semibold leading-snug text-slate-600 lg:mt-2 lg:text-[16px] lg:leading-relaxed">{tutorialCopy[tutorialStep].body}</div>
                  </div>
                  <div className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 lg:px-3 lg:py-1.5 lg:text-[12px]">{currentNumber}/{tutorialTotal}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 lg:mt-4">
                  <div>
                    {tutorialCanGoBack && (
                      <button type="button" onClick={handleTutorialBack} className="fairteams-tutorial-action text-[11px] font-black text-slate-500 underline decoration-slate-300 underline-offset-2 lg:text-sm">Back</button>
                    )}
                  </div>
                  <button type="button" onClick={skipGuidedTour} className="fairteams-tutorial-action text-[11px] font-black text-slate-500 underline decoration-slate-300 underline-offset-2 lg:text-sm">Skip tutorial</button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className={tutorialStep === "recap"
            ? "fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-5 pointer-events-auto lg:p-10"
            : tutorialStep === "club-intro"
              ? "fixed inset-0 z-[95] flex items-end justify-center bg-black/20 p-3 pb-[calc(5.4rem+env(safe-area-inset-bottom))] pointer-events-auto"
              : "fixed inset-x-3 z-[95] mx-auto max-w-md rounded-[26px] border border-white/90 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,.24)] pointer-events-auto bottom-[calc(5.4rem+env(safe-area-inset-bottom))]"}>
            <div className={tutorialStep === "recap"
              ? "w-full max-w-md rounded-[28px] border border-white/90 bg-white p-6 shadow-[0_28px_90px_rgba(0,0,0,.38)] lg:max-w-2xl lg:p-9"
              : tutorialStep === "club-intro"
                ? "w-full max-w-md rounded-[26px] border border-white/90 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,.24)] lg:max-w-xl lg:p-8"
                : "contents"}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">Guided kick-off</div>
              <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{currentNumber} / {tutorialTotal}</div>
            </div>
            {tutorialStep === "magic-reveal" && <div className="mb-1 text-3xl">✨⚽✨</div>}
            <div className={`mt-2 font-black leading-tight tracking-tight text-[#102A43] lg:mt-3 ${tutorialStep === "magic-reveal" ? "text-[30px] lg:text-[40px]" : "text-[24px] lg:text-[34px]"}`}>{tutorialCopy[tutorialStep].title}</div>
            <div className="mt-2 text-[15px] font-semibold leading-relaxed text-slate-600 lg:mt-3 lg:text-[18px]">{tutorialCopy[tutorialStep].body}</div>
            {tutorialStep === "club-intro" && (
              <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-2">
                <button type="button" onClick={handleTutorialBack} className="fairteams-tutorial-action h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600">Back</button>
              <button
                type="button"
                className="fairteams-tutorial-action h-12 flex-[1.4] rounded-2xl bg-[#102A43] text-sm font-black text-white shadow-sm"
                onClick={() => {
                  setTutorialStep("help-question");
                  window.setTimeout(() => {
                    document.getElementById("fairteams-help-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    window.setTimeout(() => document.getElementById("fairteams-help-question")?.focus(), 350);
                  }, 60);
                }}
              >
                Continue
              </button>
                <button type="button" onClick={skipGuidedTour} className="fairteams-tutorial-action col-span-2 mt-1 text-xs font-black text-slate-500 underline decoration-slate-300 underline-offset-2 lg:text-sm">Skip tutorial</button>
              </div>
            )}
            {tutorialStep === "recap" && (
              <div className="mt-4 space-y-2.5">
                {[
                  ["Roster", "Your full player list"],
                  ["Teams", "Choose players, build, and present teams"],
                  ["Club", "Shared-roster tools"],
                ].map(([label, detail]) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 ${label === "Club" ? "border-violet-100 bg-violet-50/70" : "border-transparent bg-slate-50"}`}
                  >
                    <span className={`text-sm font-black ${label === "Club" ? "text-violet-800" : "text-[#102A43]"}`}>{label}</span>
                    <span className={`text-right text-xs font-bold ${label === "Club" ? "text-violet-600" : "text-slate-500"}`}>{detail}</span>
                  </div>
                ))}
                <button type="button" className="fairteams-tutorial-action mt-2 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-sm" onClick={finishGuidedTour}>
                  {tutorialReplayMode ? "Return to my app" : "Start using Stripes"}
                </button>
                <button type="button" onClick={skipGuidedTour} className="fairteams-tutorial-action w-full py-1 text-xs font-black text-slate-500 underline decoration-slate-300 underline-offset-2 lg:text-sm">Skip tutorial</button>
              </div>
            )}
            </div>
          </div>
        );
      })()}

      {groupSettingsOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold tracking-tight text-[#102A43]">
                  Edit roster
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Name, logo, and color
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl text-slate-500 hover:text-slate-800"
                onClick={cancelGroupSettings}
                title="Close"
                aria-label="Close edit roster"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <section>
                <h3 className="text-[13px] font-bold text-[#102A43]">
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
                  className="mt-2 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102A43] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="Stripes"
                />
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#102A43]">
                  Roster Logo
                </h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                    <img
                      src={draftGroupLogo || stripesLogo}
                      alt="Roster logo preview"
                      className="h-[90%] w-[90%] object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-2xl text-xs font-bold"
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
                <h3 className="text-[13px] font-bold text-[#102A43]">
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
                className="h-11 flex-1 rounded-2xl text-sm font-bold"
                onClick={cancelGroupSettings}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 flex-[1.4] rounded-2xl bg-[#102A43] text-sm font-bold text-white"
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
                <p className="mt-0.5 text-[10px] font-bold text-slate-400">Stripes v{APP_VERSION}</p>
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

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>
              <div
                className={`sticky top-0 z-20 flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 text-left shadow-sm backdrop-blur transition ${!isEmptyStarterRoster && rosters.length > 1 ? "cursor-pointer active:scale-[0.995] hover:border-slate-300 hover:bg-white" : ""}`}
                role={!isEmptyStarterRoster && rosters.length > 1 ? "button" : undefined}
                tabIndex={!isEmptyStarterRoster && rosters.length > 1 ? 0 : undefined}
                title={!isEmptyStarterRoster && rosters.length > 1 ? "Change roster" : undefined}
                aria-label={!isEmptyStarterRoster && rosters.length > 1 ? "Change current roster" : "Current roster"}
                onClick={() => {
                  if (!isEmptyStarterRoster && rosters.length > 1) {
                    setRosterPickerOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (!isEmptyStarterRoster && rosters.length > 1 && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setRosterPickerOpen(true);
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                    Current roster
                  </span>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-black text-[#102A43]">
                      {isEmptyStarterRoster ? "Make a new roster" : activeRosterName}
                    </span>
                    {!isEmptyStarterRoster && activeRoster && <RosterKindBadge roster={activeRoster} />}
                    {!isEmptyStarterRoster && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openGroupSettings();
                        }}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#102A43]/65 shadow-sm transition active:scale-[0.98] hover:text-[#102A43]"
                        title="Edit roster"
                        aria-label="Edit current roster"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className={`mt-0.5 block w-full text-left text-[11px] font-semibold leading-snug whitespace-normal min-[310px]:truncate ${!isEmptyStarterRoster && rosters.length > 1 ? "text-slate-500" : "text-slate-500"}`}>
                    {isEmptyStarterRoster
                      ? "Create one below or import a roster"
                      : activeRosterIsShared
                        ? `${players.length} player${players.length === 1 ? "" : "s"} · ${activeSharedHasUnsavedChanges ? "Shared changes not saved" : "Shared roster"}`
                        : `${players.length} player${players.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                {!isEmptyStarterRoster && rosters.length > 1 && (
                  <div className="pointer-events-none flex shrink-0 items-center gap-1 rounded-full px-1 text-[11px] font-black uppercase tracking-wide text-[#102A43]/55">
                    <span>Change</span>
                    <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
                  </div>
                )}
              </div>

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
                        if (tutorialStep === "create-roster") {
                          setRosterFilesOpen(false);
                          setTutorialStep("recap");
                        }
                      }
                    }}
                    className={`h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 ${tutorialStep === "create-roster" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                    placeholder="New roster name"
                    maxLength={36}
                  />
                  <Button
                    type="button"
                    className={`h-10 rounded-2xl bg-[#102A43] px-3 text-xs font-black text-white ${tutorialStep === "create-roster" ? "fairteams-tutorial-pulse relative z-[82]" : ""}`}
                    onClick={() => { createNewRoster(); if (tutorialStep === "create-roster") { setRosterFilesOpen(false); setTutorialStep("recap"); } }}
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
                      <span className="mt-0.5 block text-xs font-semibold leading-snug whitespace-normal text-slate-600 min-[310px]:truncate">
                        Export or import local roster files.
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
                      disabled={players.length === 0 || activeRosterIsShared}
                      title={activeRosterIsShared ? "Shared rosters stay online. Use Make private copy first if you want a local export." : "Export this local roster"}
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
                        disabled={!hasPrivateBackupRosters}
                        title="Exports local/private rosters only. Shared rosters stay online."
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

                    {!isEmptyStarterRoster && (
                      <div className="border-t border-slate-100 pt-2">
                        {activeRosterIsShared && (
                          <div className="mb-2 rounded-2xl border border-violet-100 bg-violet-50/80 p-3">
                            <div className="flex items-start gap-2">
                              <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                                  Shared roster
                                </div>
                                <p className="mt-1 text-[11px] font-semibold leading-snug text-violet-900/80">
This is a shared roster. Local Backup can only remove/disassociate this device’s copy. Use Shared rosters to reopen, manage people, or owner-delete online.
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="mt-2 h-9 w-full justify-start rounded-2xl gap-2 border-violet-100 bg-white px-3 text-violet-700 hover:bg-violet-50"
                                  onClick={openSharedRostersFromLocalFlow}
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                  <span className="truncate text-xs font-black">Manage Shared rosters</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className={`h-11 w-full justify-start rounded-2xl gap-3 ${activeRosterIsShared ? "border-violet-100 bg-white text-violet-700 hover:bg-violet-50 hover:text-violet-800" : "border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"}`}
                          onClick={openClearRoster}
                        >
                          {activeRosterIsShared ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          <span className="font-black">
                            {activeRosterIsShared
                              ? "Remove local copy from this device"
                              : rosters.length > 1
                                ? "Delete current roster"
                                : "Clear current roster"}
                          </span>
                        </Button>
                      </div>
                    )}
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
                      <span className="mt-0.5 block text-xs font-semibold leading-snug whitespace-normal text-slate-600 min-[310px]:truncate">
                        Private backup of local rosters.
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
                          : "Optional private backup for local rosters."}
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="h-12 justify-start rounded-2xl gap-3 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                      onClick={saveAllRostersToGoogleDrive}
                      disabled={!hasPrivateBackupRosters || !googleDriveConnected || googleDriveSaving || googleDriveUpdating}
                      title={currentDriveBackup ? "Update your private local-rosters backup" : "Create a private backup of local rosters"}
                    >
                      {currentDriveBackup ? <RefreshCw className={`h-4 w-4 ${googleDriveUpdating ? "animate-spin" : ""}`} /> : <CloudUpload className="h-4 w-4" />}
                      <span className="font-black">
                        {googleDriveSaving || googleDriveUpdating ? "Saving..." : currentDriveBackup ? "Update backup" : "Back up all rosters"}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full justify-start rounded-2xl gap-2 border-blue-100 bg-white/90 px-3"
                      onClick={openGoogleDriveBackup}
                      disabled={!googleDriveConnected || googleDriveOpening}
                    >
                      <CloudDownload className="h-4 w-4" />
                      <span className="truncate text-xs font-black">{googleDriveOpening ? "Opening..." : "Browse backups"}</span>
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

              <div className={`hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${rosterToolsActivePanel && rosterToolsActivePanel !== "shared" ? "hidden" : ""}`}>
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
                      <span className="mt-0.5 block text-xs font-semibold leading-snug whitespace-normal text-slate-600 min-[310px]:truncate">
                        {activeRoster?.cloudSource?.provider === "firebase" ? "Firebase shared roster." : "Invite and sync online."}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-lg font-black leading-none text-slate-400">
                    {rosterSharedToolsOpen ? "−" : "›"}
                  </span>
                </button>

                {rosterSharedToolsOpen && (
                  <div className="grid gap-3 border-t border-slate-100 p-3">
                    <FirebaseSharedRosterAuthCard />
                    <FirebaseSharedRosterPublishCard
                      backgroundSync={false}
                      activeRoster={activeRoster}
                      rosters={rosters}
                      isEmptyRoster={isEmptyStarterRoster}
                      onOpenRoster={openFirebaseSharedRosterAsLocalCopy}
                      onRosterSaved={markActiveFirebaseRosterSaved}
                      onRefreshActiveRoster={refreshActiveFirebaseRosterFromRemote}
          onRefreshRosterIdentity={refreshFirebaseRosterIdentityFromRemote}
                      onSharedRosterSummariesUpdated={syncFirebaseRosterBadgesFromSummaries}
                      onSharedInviteOpened={finishSharedInviteOpen}
                      openLibraryToken={sharedRosterLibraryOpenToken}
                    />

                    <details className="rounded-2xl border border-amber-100 bg-amber-50/60 p-2">
                      <summary className="cursor-pointer list-none rounded-xl px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                        Legacy Google Sheets tools (temporary)
                      </summary>
                      <p className="px-2 pb-2 pt-1 text-[11px] font-semibold leading-snug text-slate-600">
                        Firebase is now the main shared-roster path. These old tools stay hidden for safety during migration.
                      </p>
                      <div className="grid gap-3">
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                        Old Google Sheets sharing
                      </div>
                      <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
                        Kept temporarily for safety while Firebase shared rosters are built.
                      </p>
                    </div>
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
                              ? "Save shared when you finish editing."
                              : `Saved ${formatSheetSyncTime(activeGoogleSheetSource?.lastSyncedAt).replace("Synced ", "")}`
                            : "This roster is saved only on this device."}
                        </div>
                      </div>

                      {activeRosterIsShared ? (
                      <>
                        <div className="grid gap-2">
                          <div className="px-1 text-[10px] font-black uppercase tracking-wide text-emerald-600">
                            Shared roster
                          </div>
                          <Button
                            type="button"
                            className="h-12 justify-start rounded-2xl gap-3 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                            onClick={() => saveActiveRosterToGoogleSheet()}
                            disabled={!googleDriveConnected || googleSheetSyncing || googleSheetOpening || isEmptyStarterRoster}
                          >
                            <CloudUpload className="h-4 w-4" />
                            <span className="min-w-0 truncate font-black">
                              {googleSheetSyncing ? "Saving..." : "Save to shared roster"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-emerald-100 bg-white/90 px-3"
                            onClick={reloadActiveRosterFromGoogleSheet}
                            disabled={!googleDriveConnected || googleSheetOpening || googleSheetSyncing}
                          >
                            <CloudDownload className="h-4 w-4" />
                            <span className="truncate text-xs font-black">
                              {googleSheetOpening ? "Getting..." : "Get latest"}
                            </span>
                          </Button>
                        </div>

                        <div className="grid gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-slate-100 bg-white/90 px-3"
                            onClick={openGoogleSheetShareModal}
                            disabled={!googleDriveConnected || googleSheetSharing || googleSheetAccessLoading}
                          >
                            <Share2 className="h-4 w-4" />
                            <span className="truncate text-xs font-black">
                              {googleSheetAccessLoading ? "Loading access..." : "People & access"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 justify-start rounded-2xl gap-2 border-slate-100 bg-white/90 px-3"
                            onClick={openGoogleSheetRosterList}
                            disabled={!googleDriveConnected || googleSheetOpening}
                          >
                            <FolderOpen className="h-4 w-4" />
                            <span className="truncate text-xs font-black">
                              {googleSheetOpening ? "Opening..." : "Open shared roster library"}
                            </span>
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
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
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 justify-start rounded-2xl gap-2 border-slate-100 bg-white/90 px-3"
                          onClick={openGoogleSheetRosterList}
                          disabled={!googleDriveConnected || googleSheetOpening}
                        >
                          <FolderOpen className="h-4 w-4" />
                          <span className="truncate text-xs font-black">
                            {googleSheetOpening ? "Opening..." : "Open shared roster library"}
                          </span>
                        </Button>
                      </>
                    )}

                      <div className="rounded-2xl bg-white/70 px-3 py-2">
                        <p className="text-[10px] font-semibold leading-snug text-slate-500">
                          {googleDriveConnected
                            ? "Get latest before editing. Save to shared roster after editing."
                            : "Sign in with Google above to share rosters."}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setGoogleSheetHelpOpen(true)}
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-600"
                    >
                      <Info className="h-3 w-3" />
                      How shared roster works
                    </button>
                      </div>
                    </details>
                  </div>
                )}
              </div>

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
                  Change roster
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Local rosters stay private. Shared rosters stay connected to your account.
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

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Local rosters</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{localRosterPickerChoices.length}</span>
                </div>
                {localRosterPickerChoices.length > 0 ? (
                  <div className="space-y-2">
                    {localRosterPickerChoices.map(renderRosterPickerOption)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs font-semibold text-slate-500">
                    No private local rosters on this device.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-violet-700">Shared rosters opened here</span>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700 ring-1 ring-violet-100">{sharedRosterPickerChoices.length}</span>
                </div>
                {sharedRosterPickerChoices.length > 0 ? (
                  <div className="space-y-2">
                    {sharedRosterPickerChoices.map(renderRosterPickerOption)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-violet-100 bg-violet-50/60 px-3 py-3 text-xs font-semibold text-violet-800/75">
                    No shared roster is open on this device. Use Club → Shared rosters to open one from your account.
                  </div>
                )}
              </div>
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
                  Shared roster library
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  {connectedDriveUser?.emailAddress
                    ? `Signed in as ${connectedDriveUser.emailAddress}. Rosters you opened in Stripes appear here.`
                    : "Rosters you opened in Stripes appear here."}
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
                        setGoogleSheetActionFile(file);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-left transition active:scale-[0.99]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-[#102A43]">
                          {file.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-bold text-emerald-700/75">
                          {isGoogleSheetOwnedByMe(file) ? "Role: Owner" : "Role: Editor"} · {formatDriveModifiedTime(file.modifiedTime)}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
                          {getGoogleSheetSharedByLine(file)}
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
                      No shared rosters opened yet. Ask the owner to share it with {connectedDriveUser?.emailAddress || "this Google account"}, then tap Open shared roster file.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-start rounded-2xl gap-2 border-slate-200 bg-white/90 px-3 text-slate-700 hover:bg-white"
                onClick={findGoogleSheetRosterInDrive}
                disabled={googleSheetOpening}
              >
                <FolderOpen className="h-4 w-4" />
                <span className="truncate text-xs font-black">
                  {googleSheetOpening ? "Opening..." : "Open shared roster file"}
                </span>
              </Button>
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
                  {isGoogleSheetOwnedByMe(googleSheetActionFile) ? "Role: Owner" : "Role: Editor"} · {formatDriveModifiedTime(googleSheetActionFile.modifiedTime)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => {
                  setGoogleSheetActionFile(null);
                }}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-xs font-semibold leading-snug text-emerald-900/80">
                Opens this shared roster in Stripes on this device. It does not overwrite the Google Sheet.
              </p>
            </div>

            {!isGoogleSheetOwnedByMe(googleSheetActionFile) && getGoogleSheetSharedByName(googleSheetActionFile) && (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Shared by
                </div>
                <div className="mt-1 truncate text-xs font-black text-[#102A43]">
                  {getGoogleSheetSharedByName(googleSheetActionFile)}
                </div>
                {getGoogleSheetSharedByEmail(googleSheetActionFile) && (
                  <div className="mt-0.5 truncate text-[10px] font-semibold text-emerald-700/75">
                    {getGoogleSheetSharedByEmail(googleSheetActionFile)}
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Owner
              </div>
              <div className="mt-1 truncate text-xs font-black text-[#102A43]">
                {getGoogleSheetOwnerName(googleSheetActionFile)}
              </div>
              {getGoogleSheetOwnerEmail(googleSheetActionFile) && (
                <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                  {getGoogleSheetOwnerEmail(googleSheetActionFile)}
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
                {googleSheetOpening ? "Opening..." : "Open this roster"}
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
          <div className={`w-full max-w-sm rounded-3xl border bg-white p-4 shadow-2xl ${activeRosterIsShared ? "border-violet-100" : "border-red-100"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${activeRosterIsShared ? "bg-violet-50 text-violet-600" : "bg-red-50 text-red-600"}`}>
                {activeRosterIsShared ? <Share2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
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

            {activeRosterIsShared && (
              <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/80 p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                  <p className="text-[11px] font-semibold leading-snug text-violet-900/80">
                    Removing the local copy is safe. It does not delete the online shared roster, remove collaborators, or change other organizers’ copies.
                  </p>
                </div>
              </div>
            )}

            <div className={`mt-4 rounded-2xl border p-3 ${activeRosterIsShared ? "border-violet-100 bg-violet-50/70" : "border-red-100 bg-red-50/70"}`}>
              <div className={`mb-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide ${activeRosterIsShared ? "text-violet-700" : "text-red-700"}`}>
                <span>Slide to confirm</span>
                <span>{googleSheetDeleteSlide >= 95 ? "Ready" : `${googleSheetDeleteSlide}%`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={googleSheetDeleteSlide}
                onChange={(e) => setGoogleSheetDeleteSlide(Number(e.target.value))}
                className={`w-full ${activeRosterIsShared ? "accent-violet-600" : "accent-red-600"}`}
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
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  Shared Roster
                </div>
                <h2 className="mt-1 text-base font-black tracking-tight text-[#102A43]">
                  People & access
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  See who can use this shared roster.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-emerald-700"
                  onClick={findGoogleSheetRosterInDrive}
                  disabled={googleSheetOpening}
                  title="Open shared roster file"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  onClick={() => setGoogleSheetShareOpen(false)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Linked roster
                </div>
                <div className="mt-1 truncate text-[13px] font-bold text-[#102A43]">
                  {activeGoogleSheetSource?.spreadsheetName || activeRosterName}
                </div>
                <div className="mt-1 text-[10px] font-semibold leading-snug text-emerald-800/75">
                  {formatSheetSyncTime(activeGoogleSheetSource?.lastSyncedAt)}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Organizers
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 rounded-xl px-2 text-[10px] font-black text-slate-500 hover:bg-white"
                    onClick={() => void loadGoogleSheetAccessList()}
                    disabled={googleSheetAccessLoading}
                    title="Refresh access list"
                  >
                    <RefreshCw className={`mr-1 h-3 w-3 ${googleSheetAccessLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {googleSheetAccessLoading && !googleSheetAccessList ? (
                  <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                    Loading sharing access…
                  </div>
                ) : googleSheetHasPeopleAccessInfo ? (
                  <div className="mt-3 grid gap-2">
                    <div>
                      <div className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Owner
                      </div>
                      <div className="mt-1 grid gap-1.5">
                        {googleSheetOwnerPermissions.length > 0 ? googleSheetOwnerPermissions.map((permission) => {
                          const display = drivePermissionDisplay(permission);
                          return (
                            <div key={permission.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-black text-[#102A43]">
                                  {display.name}
                                </div>
                                {display.email && (
                                  <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                    {display.email}
                                  </div>
                                )}
                              </div>
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                Owner
                              </span>
                            </div>
                          );
                        }) : (
                          <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                            Owner not shown by Google Drive.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Editors
                      </div>
                      <div className="mt-1 grid gap-1.5">
                        {googleSheetEditorPermissions.length > 0 || googleSheetSavedEditorEntries.length > 0 ? (
                          <>
                            {googleSheetEditorPermissions.map((permission) => {
                              const removing = googleSheetRemovingPermissionId === permission.id;
                              const canRemove = connectedGoogleUserOwnsActiveSheet && canRemoveDrivePermission(permission) && !permissionEmailMatchesConnectedUser(permission);
                              const display = drivePermissionDisplay(permission);
                              return (
                                <div key={permission.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-black text-[#102A43]">
                                      {display.name}
                                    </div>
                                    {display.email && (
                                      <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                        {display.email}
                                      </div>
                                    )}
                                    {drivePermissionIsInherited(permission) && (
                                      <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                        From shared folder access
                                      </div>
                                    )}
                                  </div>
                                  {canRemove ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="h-8 shrink-0 rounded-xl px-2 text-[10px] font-black text-red-600 hover:bg-red-50 hover:text-red-700"
                                      onClick={() => removeGoogleSheetEditorAccess(permission)}
                                      disabled={Boolean(googleSheetRemovingPermissionId)}
                                      title="Remove editor access"
                                    >
                                      <UserMinus className="mr-1 h-3 w-3" />
                                      {removing ? "Removing..." : "Remove"}
                                    </Button>
                                  ) : (
                                    <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500">
                                      Editor
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {googleSheetSavedEditorEntries.map((entry) => (
                              <div key={`saved-${entry.email}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-black text-[#102A43]">
                                    {entry.name}
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                    {entry.email}
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                  Editor
                                </span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                            No editors added yet.
                          </div>
                        )}
                      </div>
                    </div>

                    {googleSheetOtherPermissions.length > 0 && (
                      <div>
                        <div className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Other access
                        </div>
                        <div className="mt-1 grid gap-1.5">
                          {googleSheetOtherPermissions.map((permission) => {
                            const display = drivePermissionDisplay(permission);
                            return (
                              <div key={permission.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-black text-[#102A43]">
                                    {display.name}
                                  </div>
                                  {display.email && (
                                    <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                      {display.email}
                                    </div>
                                  )}
                                </div>
                                <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500">
                                  {formatDrivePermissionRole(permission.role)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                    Sharing access could not be loaded.
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3">
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Add editor
                </label>
                <input
                  value={googleSheetShareName}
                  onChange={(e) => setGoogleSheetShareName(e.target.value)}
                  type="text"
                  autoCapitalize="words"
                  autoCorrect="off"
                  placeholder="Name, optional"
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
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
                <Button
                  type="button"
                  className="mt-2 h-11 w-full rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={confirmGoogleSheetShare}
                  disabled={googleSheetSharing}
                >
                  {googleSheetSharing ? "Sharing..." : "Add editor"}
                </Button>
                <p className="mt-2 text-[10px] font-semibold leading-snug text-slate-500">
                  Name is only a friendly label. Email is the real Google access.
                </p>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Other shared rosters
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Open a roster someone shared with this Google account.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10 w-full justify-start rounded-2xl gap-2 border-slate-200 bg-white/90 px-3 text-slate-700 hover:bg-white"
                  onClick={findGoogleSheetRosterInDrive}
                  disabled={googleSheetOpening}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="truncate text-xs font-black">
                    {googleSheetOpening ? "Opening..." : "Open shared roster file"}
                  </span>
                </Button>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Connection
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Stop syncing keeps this roster locally on this device. The shared roster is not deleted.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10 w-full justify-start rounded-2xl gap-2 border-slate-200 bg-white/90 px-3 text-slate-600 hover:bg-white hover:text-slate-800"
                  onClick={() => {
                    if (disconnectActiveRosterFromGoogleSheet()) setGoogleSheetShareOpen(false);
                  }}
                  disabled={googleSheetSyncing || googleSheetOpening || googleSheetSharing}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="truncate text-xs font-black">Stop syncing this roster</span>
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-100 p-4">
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full rounded-2xl text-slate-500"
                onClick={() => setGoogleSheetShareOpen(false)}
              >
                Done
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
                  Cloud Backup
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
                  Backup and device transfer
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Cloud Backup saves a private text-only backup of your local/private rosters to Google Drive. Shared rosters stay online in Shared rosters and are not included.
                </p>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-3">
                <div className="text-xs font-black text-blue-800">
                  Use across devices
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-blue-800/85">
                  Save local rosters on one device, then restore them on another device signed in with the same Google account. It is private manual backup/restore, not collaboration or live sync.
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

      {googleSheetHelpOpen && (
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
                  How it works
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => setGoogleSheetHelpOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="text-xs font-black text-[#102A43]">
                  Share one roster
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Shared Roster lets trusted co-organizers open the same roster in Stripes. You can see the owner and editors in People & access.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
                <div className="text-xs font-black text-emerald-800">
                  Save and get latest
                </div>
                <p className="mt-1 text-xs font-semibold leading-snug text-emerald-800/85">
                  It does not update automatically. Get latest before editing, then save changes when you finish. Player photos stay on each device.
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="mt-4 h-11 w-full rounded-2xl bg-[#102A43] text-white hover:bg-[#0b2036]"
              onClick={() => setGoogleSheetHelpOpen(false)}
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
                  Cloud Backup
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-[#102A43]">
                  Choose backup
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Nothing changes yet. Pick a private backup to preview its rosters.
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
                    <div
                      key={file.id}
                      className="flex w-full items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-2.5 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => previewGoogleDriveBackupFile(file)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-1 py-1 text-left transition active:scale-[0.99]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold text-[#102A43]">
                            {file.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] font-bold text-blue-700/75">
                            Backup file · {formatDriveModifiedTime(file.modifiedTime)}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-blue-500">
                          Preview
                        </span>
                      </button>

                      {file.ownedByMe !== false && (
                        <button
                          type="button"
                          onClick={() => setDriveBackupDeleteConfirm({ file })}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-white text-red-500 shadow-sm transition active:scale-[0.96]"
                          title="Delete backup"
                          aria-label={`Delete ${file.name}`}
                          disabled={googleDriveDeletingFileId === file.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs font-semibold leading-snug text-amber-800">
                      No private Cloud Backup files found. Save a backup first.
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
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {driveBackupDeleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Delete this backup?
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This moves the backup file to Google Drive trash. It does not change rosters already saved on this device.
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-red-600">
                Backup file
              </div>
              <div className="mt-1 truncate text-[13px] font-bold text-[#102A43]">
                {driveBackupDeleteConfirm.file.name}
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-red-700/80">
                {formatDriveModifiedTime(driveBackupDeleteConfirm.file.modifiedTime)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-2xl text-slate-500"
                onClick={() => setDriveBackupDeleteConfirm(null)}
                disabled={Boolean(googleDriveDeletingFileId)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-red-600 text-white hover:bg-red-700"
                onClick={confirmTrashGoogleDriveBackup}
                disabled={Boolean(googleDriveDeletingFileId)}
              >
                {googleDriveDeletingFileId ? "Deleting..." : "Move to trash"}
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
                  This will overwrite the selected all-rosters Drive backup file.
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Safety backup file
              </div>
              <div className="mt-1 truncate text-[13px] font-bold text-[#102A43]">
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
                Make sure this is the correct private all-rosters backup before updating. This will replace the backup file with the current roster list from this device.
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
                  Backup preview
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

      {leaveSharedConfirmOpen && activeRosterIsFirebaseShared && (
        <div
          className="fixed inset-0 z-[86] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !leaveSharedBusy && setLeaveSharedConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border border-violet-100 bg-white p-4 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <UserMinus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-[#102A43]">Leave shared roster?</h2>
                <p className="mt-1 text-sm font-semibold leading-snug text-slate-600">
                  This removes your account from “{activeRosterName}” and removes the opened copy from this device.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                Account access
              </div>
              <p className="mt-1 text-[11px] font-semibold leading-snug text-violet-800/80">
                Other organizers keep access. The owner keeps the online roster. To only hide this device copy without leaving, use Hide on device instead.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-slate-200 bg-white text-xs font-black text-slate-600"
                onClick={() => setLeaveSharedConfirmOpen(false)}
                disabled={leaveSharedBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-violet-600 text-xs font-black text-white hover:bg-violet-700"
                onClick={leaveActiveSharedRoster}
                disabled={leaveSharedBusy}
              >
                {leaveSharedBusy ? "Leaving…" : "Leave roster"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {privateCopyConfirmOpen && activeRosterIsFirebaseShared && (
        <div
          className="fixed inset-0 z-[86] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPrivateCopyConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border border-violet-100 bg-white p-4 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <Copy className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-[#102A43]">Make private copy?</h2>
                <p className="mt-1 text-sm font-semibold leading-snug text-slate-600">
                  Create a clean local roster from “{activeRosterName}”. The shared roster stays online and unchanged.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                Private copy
              </div>
              <p className="mt-1 text-[11px] font-semibold leading-snug text-violet-800/80">
                The copy uses shared names, Club stat averages, and GK flags as the starting local profile. Photos and advanced private traits are reset so the roster starts clean.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-slate-200 bg-white text-xs font-black text-slate-600"
                onClick={() => setPrivateCopyConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-violet-600 text-xs font-black text-white hover:bg-violet-700"
                onClick={makePrivateCopyOfActiveSharedRoster}
              >
                Make copy
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

      {rosterToolsNotice && rosterToolsNotice.tone !== "success" && (
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
                className="h-10 w-full rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]"
                onClick={() => setRosterToolsNotice(null)}
              >
                OK
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
          <div className={`w-full max-w-sm rounded-3xl border bg-white p-4 shadow-2xl ${activeRosterIsShared ? "border-violet-100" : "border-red-100"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${activeRosterIsShared ? "bg-violet-50 text-violet-600" : "bg-red-50 text-red-600"}`}>
                {activeRosterIsShared ? <Share2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  {activeRosterIsShared
                    ? "This is a shared roster"
                    : rosters.length > 1
                      ? `Delete “${activeRosterName}”?`
                      : `Clear “${activeRosterName}”?`}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  {activeRosterIsShared
                    ? `“${activeRosterName}” is linked online. This action only removes the local copy on this device. To manage people or delete the online shared roster for everyone, go to Club → Shared rosters.`
                    : rosters.length > 1
                      ? "This deletes only the active roster. Your other rosters will stay."
                      : `You need at least one roster, so this removes all ${players.length} player profiles from this roster only.`}
                </p>
              </div>
            </div>

            {activeRosterIsShared && (
              <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/80 p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                  <p className="text-[11px] font-semibold leading-snug text-violet-900/80">
                    Removing/disassociating the local copy is safe. It does not delete the online shared roster, remove collaborators, or change other organizers’ copies.
                  </p>
                </div>
              </div>
            )}

            <div className={`mt-4 rounded-2xl border p-3 ${activeRosterIsShared ? "border-violet-100 bg-violet-50/70" : "border-red-100 bg-red-50/70"}`}>
              <div className={`mb-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide ${activeRosterIsShared ? "text-violet-700" : "text-red-700"}`}>
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
                className={`w-full ${activeRosterIsShared ? "accent-violet-600" : "accent-red-600"}`}
                aria-label="Slide to confirm roster action"
              />
              <p className={`mt-2 text-[11px] font-semibold ${activeRosterIsShared ? "text-violet-700/80" : "text-red-700/80"}`}>
                Move the slider all the way right, then confirm.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              {activeRosterIsShared && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-2xl border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
                  onClick={openSharedRostersFromLocalFlow}
                >
                  <FolderOpen className="mr-1.5 h-4 w-4" />
                  Open Shared rosters instead
                </Button>
              )}
              <div className="flex items-center justify-end gap-2">
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
                  className={`rounded-xl text-white ${activeRosterIsShared ? "bg-violet-600 hover:bg-violet-700" : "bg-red-600 hover:bg-red-700"}`}
                  onClick={confirmClearRoster}
                  disabled={clearRosterSlide < 95}
                >
                  {activeRosterIsShared
                    ? "Remove local copy only"
                    : rosters.length > 1
                      ? "Delete roster"
                      : "Clear roster"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
