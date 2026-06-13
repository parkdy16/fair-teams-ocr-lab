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
  parseRosterFile,
  rosterToShareJson,
  rostersToBackupJson,
  saveRosterState,
} from "@/lib/localRoster";
import { getGoogleDriveConfig } from "@/lib/googleDriveConfig";

const GROUP_NAME_STORAGE_KEY = "fair-teams-group-name";
const HEADER_COLOR_STORAGE_KEY = "fair-teams-header-color-v2";
const GROUP_LOGO_STORAGE_KEY = "fair-teams-group-logo";
const DEFAULT_GROUP_NAME = "My Group";
const DEFAULT_HEADER_COLOR = "#3B82F6";
const EMPTY_ROSTER_NAME = "New roster";
const ROSTERS_STORAGE_KEY = "fair-teams-rosters-v1";

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
  const googleDriveConfig = getGoogleDriveConfig();
  const googleDriveStatusText = googleDriveConfig.isConfigured
    ? "Ready for Drive connection setup"
    : "Add Google Client ID and API key to .env.local";
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState(activeRosterName);
  const [draftHeaderColor, setDraftHeaderColor] = useState(headerColor);
  const [draftGroupLogo, setDraftGroupLogo] = useState(groupLogo);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [rosterFilesOpen, setRosterFilesOpen] = useState(false);
  const [rosterPickerOpen, setRosterPickerOpen] = useState(false);
  const [clearRosterOpen, setClearRosterOpen] = useState(false);
  const [clearRosterSlide, setClearRosterSlide] = useState(0);
  const [newRosterName, setNewRosterName] = useState("");
  const [fileImportMode, setFileImportMode] = useState<"shared" | "backup">(
    "shared",
  );

  useEffect(() => {
    saveRosterState(rosterState);
  }, [rosterState]);

  useEffect(() => {
    const shouldLockScroll =
      groupSettingsOpen ||
      rosterFilesOpen ||
      rosterPickerOpen ||
      clearRosterOpen;
    if (!shouldLockScroll) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [groupSettingsOpen, rosterFilesOpen, rosterPickerOpen, clearRosterOpen]);

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

  const showGoogleDriveComingSoon = (action: string) => {
    window.alert(
      googleDriveConfig.isConfigured
        ? `${action} will be connected in the next Google Drive patch. This first UI step only confirms the safe Drive section placement.`
        : "Google Drive keys are not configured yet. Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY to .env.local first.",
    );
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
    downloadText(
      `fair-teams-all-rosters-backup.json`,
      rostersToBackupJson(rosters, activeRosterId),
      "application/json;charset=utf-8",
    );
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
      alert("No players found in that file.");
      return;
    }

    const namesPreview = normalizedIncoming
      .slice(0, 4)
      .map((roster) => `• ${roster.name}`)
      .join("\n");
    const moreText =
      normalizedIncoming.length > 4
        ? `\n…and ${normalizedIncoming.length - 4} more`
        : "";
    const ok = window.confirm(
      mode === "backup"
        ? `Add ${normalizedIncoming.length} roster${normalizedIncoming.length === 1 ? "" : "s"} from this backup?\n\n${namesPreview}${moreText}\n\nYour current rosters will stay.`
        : `Import this as a separate roster?\n\n${namesPreview}\n\nYour current roster “${activeRosterName}” will stay unchanged.`,
    );
    if (!ok) return;

    setRosterState((current) => {
      const currentIsStarter =
        current.rosters.length === 1 &&
        current.rosters[0]?.players.length === 0 &&
        current.rosters[0]?.name === EMPTY_ROSTER_NAME;
      const nextRosters = currentIsStarter ? [] : [...current.rosters];
      const added = normalizedIncoming.map((roster) => {
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

  const importFile = async (file: File) => {
    const text = await file.text();
    const importedRosters = parseRosterFile(text, file.name);
    addImportedRosters(importedRosters, fileImportMode);
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
  };

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
                    alert(
                      error instanceof Error ? error.message : "Import failed.",
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
                onAddPlayerManually={() => setActiveTab("players")}
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
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Manage roster files and backups.
                </p>
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

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
              <button
                type="button"
                onClick={() => {
                  if (!isEmptyStarterRoster && rosters.length > 1) {
                    setRosterPickerOpen(true);
                  }
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-left transition ${!isEmptyStarterRoster && rosters.length > 1 ? "active:scale-[0.99]" : "cursor-default"}`}
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
                      : `${players.length} player${players.length === 1 ? "" : "s"}`}
                  </span>
                </span>
                {!isEmptyStarterRoster && rosters.length > 1 && (
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-lg font-black leading-none text-slate-400 shadow-sm">
                    ›
                  </span>
                )}
              </button>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  New roster
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

              <div className="rounded-2xl border border-blue-100 bg-blue-50/55 p-3 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                    <Cloud className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                      Google Drive backup
                    </div>
                    <p className="mt-1 text-xs font-bold leading-snug text-slate-600">
                      Direct Drive connection. Text-only backups: no player photos or logo images.
                    </p>
                    <div className={`mt-2 rounded-2xl px-2.5 py-1.5 text-[11px] font-black ${googleDriveConfig.isConfigured ? "bg-white text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {googleDriveStatusText}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-start rounded-2xl gap-3 border-blue-100 bg-white/90"
                    onClick={() => showGoogleDriveComingSoon("Save all rosters to Google Drive")}
                    disabled={isEmptyStarterRoster}
                  >
                    <CloudUpload className="h-4 w-4" />
                    <span className="font-black">Save all rosters to Drive</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-start rounded-2xl gap-3 border-blue-100 bg-white/90"
                    onClick={() => showGoogleDriveComingSoon("Open a Google Drive backup")}
                  >
                    <CloudDownload className="h-4 w-4" />
                    <span className="font-black">Open Drive backup</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-start rounded-2xl gap-3 border-blue-100 bg-white/90"
                    onClick={() => showGoogleDriveComingSoon("Update the current Google Drive backup")}
                    disabled
                    title="Available after a Drive backup has been opened"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="font-black">Update current Drive backup</span>
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 border-t border-slate-100 pt-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Local file backup
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start rounded-2xl gap-3"
                  onClick={exportSharedRoster}
                  disabled={players.length === 0}
                >
                  <Download className="h-4 w-4" />
                  <span className="font-black">Export current roster</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start rounded-2xl gap-3"
                  onClick={() => openImportPicker("shared")}
                >
                  <Upload className="h-4 w-4" />
                  <span className="font-black">Import single roster</span>
                </Button>
                <div className="my-1 h-px bg-slate-100" />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start rounded-2xl gap-3"
                  onClick={exportAllRostersBackup}
                  disabled={isEmptyStarterRoster}
                >
                  <Archive className="h-4 w-4" />
                  <span className="font-black">Export all rosters</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start rounded-2xl gap-3"
                  onClick={() => openImportPicker("backup")}
                >
                  <ArchiveRestore className="h-4 w-4" />
                  <span className="font-black">Import all rosters</span>
                </Button>
                {!isEmptyStarterRoster && (
                  <>
                    <div className="my-1 h-px bg-slate-100" />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start rounded-2xl gap-3 border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"
                      onClick={openClearRoster}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="font-black">
                        {rosters.length > 1
                          ? "Delete current roster"
                          : "Clear current roster"}
                      </span>
                    </Button>
                  </>
                )}
              </div>
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
                    onClick={() => {
                      switchRoster(roster.id);
                      setRosterPickerOpen(false);
                      setRosterFilesOpen(false);
                    }}
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
                  {rosters.length > 1
                    ? `Delete “${activeRosterName}”?`
                    : `Clear “${activeRosterName}”?`}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  {rosters.length > 1
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
                {rosters.length > 1 ? "Delete roster" : "Clear roster"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
