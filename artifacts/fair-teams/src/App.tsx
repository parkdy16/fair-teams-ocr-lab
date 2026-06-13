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
  Package,
  Plus,
  ChevronDown,
  Share2,
  ArchiveRestore,
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

const GROUP_NAME_STORAGE_KEY = "fair-teams-group-name";
const HEADER_COLOR_STORAGE_KEY = "fair-teams-header-color-v2";
const GROUP_LOGO_STORAGE_KEY = "fair-teams-group-logo";
const DEFAULT_GROUP_NAME = "My Group";
const DEFAULT_HEADER_COLOR = "#3B82F6";


function readStoredGroupName() {
  try {
    return window.localStorage.getItem(GROUP_NAME_STORAGE_KEY) || DEFAULT_GROUP_NAME;
  } catch {
    return DEFAULT_GROUP_NAME;
  }
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
  const [ocrImportContext, setOcrImportContext] = useState<"today" | "roster">("today");
  const [groupName, setGroupName] = useState(() => readStoredGroupName());
  const [rosterState, setRosterState] = useState(() => loadRosterState(readStoredGroupName()));
  const rosters = rosterState.rosters;
  const activeRosterId = rosterState.activeRosterId;
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId) || rosters[0];
  const players = activeRoster?.players || [];
  const activeRosterName = activeRoster?.name || "Default roster";
  const [headerColor, setHeaderColor] = useState(() => {
    try {
      return (
        window.localStorage.getItem(HEADER_COLOR_STORAGE_KEY) ||
        DEFAULT_HEADER_COLOR
      );
    } catch {
      return DEFAULT_HEADER_COLOR;
    }
  });
  const [groupLogo, setGroupLogo] = useState(() => {
    try {
      return window.localStorage.getItem(GROUP_LOGO_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState(groupName);
  const [draftHeaderColor, setDraftHeaderColor] = useState(headerColor);
  const [draftGroupLogo, setDraftGroupLogo] = useState(groupLogo);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [rosterFilesOpen, setRosterFilesOpen] = useState(false);
  const [clearRosterOpen, setClearRosterOpen] = useState(false);
  const [clearRosterSlide, setClearRosterSlide] = useState(0);
  const [rosterManagerOpen, setRosterManagerOpen] = useState(false);
  const [newRosterName, setNewRosterName] = useState("");
  const [renameRosterName, setRenameRosterName] = useState(activeRosterName);
  const [fileImportMode, setFileImportMode] = useState<"shared" | "backup">("shared");

  useEffect(() => {
    saveRosterState(rosterState);
  }, [rosterState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GROUP_NAME_STORAGE_KEY, groupName);
    } catch {
      // Local storage can fail in private browsing, but the app should keep working.
    }
  }, [groupName]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HEADER_COLOR_STORAGE_KEY, headerColor);
    } catch {
      // Keep working even if local storage is unavailable.
    }
  }, [headerColor]);

  useEffect(() => {
    try {
      if (groupLogo) {
        window.localStorage.setItem(GROUP_LOGO_STORAGE_KEY, groupLogo);
      } else {
        window.localStorage.removeItem(GROUP_LOGO_STORAGE_KEY);
      }
    } catch {
      // Keep working even if local storage is unavailable.
    }
  }, [groupLogo]);

  const openGroupSettings = () => {
    setDraftGroupName(groupName);
    setDraftHeaderColor(headerColor);
    setDraftGroupLogo(groupLogo);
    setGroupSettingsOpen(true);
  };

  const saveGroupSettings = () => {
    const nextName = draftGroupName.trim() || DEFAULT_GROUP_NAME;
    setGroupName(nextName);
    setDraftGroupName(nextName);
    setHeaderColor(draftHeaderColor);
    setGroupLogo(draftGroupLogo);
    setGroupSettingsOpen(false);
  };

  const cancelGroupSettings = () => {
    setDraftGroupName(groupName);
    setDraftHeaderColor(headerColor);
    setDraftGroupLogo(groupLogo);
    setGroupSettingsOpen(false);
  };

  const headerDisplayName =
    groupName.trim() && groupName !== DEFAULT_GROUP_NAME
      ? groupName
      : "Fair Teams";
  const isWhiteHeaderColor = headerColor.toLowerCase() === "#ffffff";
  const identityAccentColor = isWhiteHeaderColor ? "#E2E8F0" : headerColor;
  const logoRingStyle = {
    borderColor: isWhiteHeaderColor ? "#E2E8F0" : headerColor,
    boxShadow: isWhiteHeaderColor
      ? "0 1px 2px rgba(15, 23, 42, 0.08)"
      : `0 0 0 2px ${hexToRgba(headerColor, 0.14)}`,
  } as React.CSSProperties;

  useEffect(() => {
    setRenameRosterName(activeRosterName);
  }, [activeRosterName]);

  const replacePlayers = (nextPlayers: RoomPlayer[]) => {
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? {
              ...roster,
              players: nextPlayers.map((player, index) => normalizePlayer(player, index)),
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
    const name = uniqueRosterName(newRosterName || `Roster ${rosters.length + 1}`, rosters);
    const roster = createRoster(name, []);
    setRosterState((current) => ({
      rosters: [...current.rosters, roster],
      activeRosterId: roster.id,
    }));
    setNewRosterName("");
  };

  const renameActiveRoster = () => {
    const nextName = uniqueRosterName(
      renameRosterName || activeRosterName,
      rosters.filter((roster) => roster.id !== activeRosterId),
    );
    setRosterState((current) => ({
      ...current,
      rosters: current.rosters.map((roster) =>
        roster.id === current.activeRosterId
          ? { ...roster, name: nextName, updatedAt: new Date().toISOString() }
          : roster,
      ),
    }));
    setRenameRosterName(nextName);
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
    setRosterManagerOpen(false);
    setClearRosterSlide(0);
    setClearRosterOpen(true);
  };

  const openImportPicker = (mode: "shared" | "backup") => {
    setFileImportMode(mode);
    setRosterFilesOpen(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const addImportedRosters = (incomingRosters: RoomRoster[], mode: "shared" | "backup") => {
    const normalizedIncoming = incomingRosters
      .map((roster) => ({
        ...roster,
        players: roster.players.map((player, playerIndex) => normalizePlayer(player, playerIndex)),
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
    const moreText = normalizedIncoming.length > 4 ? `\n…and ${normalizedIncoming.length - 4} more` : "";
    const ok = window.confirm(
      mode === "backup"
        ? `Add ${normalizedIncoming.length} roster${normalizedIncoming.length === 1 ? "" : "s"} from this backup?\n\n${namesPreview}${moreText}\n\nYour current rosters will stay.`
        : `Import this as a separate roster?\n\n${namesPreview}\n\nYour current roster “${activeRosterName}” will stay unchanged.`,
    );
    if (!ok) return;

    setRosterState((current) => {
      const nextRosters = [...current.rosters];
      const added = normalizedIncoming.map((roster) => {
        const copied = createRoster(uniqueRosterName(roster.name, nextRosters), roster.players);
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
        return {
          ...current,
          rosters: current.rosters.map((roster) =>
            roster.id === current.activeRosterId
              ? { ...roster, players: [], updatedAt: new Date().toISOString() }
              : roster,
          ),
        };
      }
      const remaining = current.rosters.filter((roster) => roster.id !== current.activeRosterId);
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
              {activeTab === "players" ? (
                <button
                  type="button"
                  onClick={openGroupSettings}
                  className="group flex max-w-full min-w-0 items-center gap-2.5 text-left transition-transform active:scale-[0.99]"
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
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-[#102A43]/45" />
                  </span>
                </button>
              ) : (
                <div className="flex max-w-full min-w-0 items-center gap-2.5 text-left">
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
                  <h1 className="truncate text-[17px] font-black leading-tight tracking-tight text-[#102A43]">
                    {headerDisplayName}
                  </h1>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {activeTab === "players" && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-xl bg-white/85 border border-slate-200 px-3 gap-1.5 text-[12px] font-black text-[#102A43]"
                  onClick={() => {
                  setRosterManagerOpen(false);
                  setRosterFilesOpen(true);
                }}
                  title="Roster files"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Files</span>
                </Button>
              )}
              {activeTab !== "players" && (
                <span className="text-[11px] font-extrabold text-slate-400 tracking-tight whitespace-nowrap">
                  Balanced teams. Better games.
                </span>
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

          <button
            type="button"
            onClick={() => setRosterManagerOpen(true)}
            className="mx-1 mb-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-left shadow-sm transition active:scale-[0.99]"
            title="Switch roster"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-[#102A43] shadow-sm">
                <Users className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Active roster
                </span>
                <span className="block truncate text-sm font-black text-[#102A43]">
                  {activeRosterName}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-extrabold text-slate-500">
              {players.length} player{players.length === 1 ? "" : "s"}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </button>

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
          <div className="flex min-h-[calc(100dvh-168px)] flex-col">
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
                  Group Settings
                </h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  Name, logo, and color theme.
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
                  Group Name
                </h3>
                <input
                  value={draftGroupName}
                  onChange={(e) => setDraftGroupName(e.target.value)}
                  maxLength={32}
                  className="mt-2 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-[#102A43] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="Fair Teams"
                />
              </section>

              <section>
                <h3 className="text-sm font-black text-[#102A43]">
                  Group Logo
                </h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                    <img
                      src={draftGroupLogo || fairTeamsLogo}
                      alt="Group logo preview"
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
                  Group Color
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

      {rosterManagerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Rosters
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Switch classes or groups. Each roster stays separate.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={() => setRosterManagerOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
              {rosters.map((roster) => {
                const selected = roster.id === activeRosterId;
                return (
                  <button
                    key={roster.id}
                    type="button"
                    onClick={() => {
                      switchRoster(roster.id);
                      setRosterManagerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${selected ? "border-blue-200 bg-blue-50/80" : "border-slate-100 bg-slate-50/70"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#102A43]">
                        {roster.name}
                      </span>
                      <span className="block text-[11px] font-bold text-slate-500">
                        {roster.players.length} player{roster.players.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selected && (
                      <span className="shrink-0 rounded-full bg-[#102A43] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex gap-2">
                <input
                  value={newRosterName}
                  onChange={(e) => setNewRosterName(e.target.value)}
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

            <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Rename active roster
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={renameRosterName}
                  onChange={(e) => setRenameRosterName(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#102A43] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="Roster name"
                  maxLength={36}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-2xl px-3 text-xs font-black"
                  onClick={renameActiveRoster}
                >
                  Save
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-2xl text-xs font-black"
                onClick={() => {
                  setRosterManagerOpen(false);
                  setRosterFilesOpen(true);
                }}
              >
                <Package className="mr-1.5 h-3.5 w-3.5" />
                Files
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-2xl border-red-100 bg-red-50/70 text-xs font-black text-red-700 hover:bg-red-100 hover:text-red-800"
                onClick={openClearRoster}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {rosters.length > 1 ? "Delete" : "Clear"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rosterFilesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black tracking-tight text-[#102A43]">
                  Files
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Share one roster or back up everything on this device.
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

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Current roster
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-black text-[#102A43]">
                  {activeRosterName}
                </div>
                <div className="shrink-0 text-[11px] font-extrabold text-slate-500">
                  {players.length} player{players.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl gap-3"
                onClick={exportSharedRoster}
                disabled={players.length === 0}
              >
                <Share2 className="h-4 w-4" />
                <span className="font-black">Share current roster</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl gap-3"
                onClick={() => openImportPicker("shared")}
              >
                <Upload className="h-4 w-4" />
                <span className="font-black">Import shared roster</span>
              </Button>
              <div className="my-1 h-px bg-slate-100" />
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl gap-3"
                onClick={exportAllRostersBackup}
                disabled={rosters.length === 0}
              >
                <Download className="h-4 w-4" />
                <span className="font-black">Backup all rosters</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl gap-3"
                onClick={() => openImportPicker("backup")}
              >
                <ArchiveRestore className="h-4 w-4" />
                <span className="font-black">Restore / add backup</span>
              </Button>
              <div className="my-1 h-px bg-slate-100" />
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl gap-3 border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"
                onClick={openClearRoster}
              >
                <Trash2 className="h-4 w-4" />
                <span className="font-black">
                  {rosters.length > 1 ? "Delete current roster" : "Clear current roster"}
                </span>
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
                  {rosters.length > 1 ? `Delete “${activeRosterName}”?` : `Clear “${activeRosterName}”?`}
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
