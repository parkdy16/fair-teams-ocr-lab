import React, { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, CalendarCheck, Shield, Download, Upload, Pencil, Check, X, Palette, Trash2, AlertTriangle } from "lucide-react";
import { PlayersTab } from "@/components/PlayersTab";
import { TodayTab } from "@/components/TodayTab";
import { TeamsTab } from "@/components/TeamsTab";
import { Button } from "@/components/ui/button";
import fairTeamsLogo from "@/assets/fairteams-logo.png";
import {
  RoomPlayer,
  csvToPlayers,
  downloadText,
  loadPlayers,
  normalizePlayer,
  playersToCsv,
  savePlayers,
} from "@/lib/localRoster";

const GROUP_NAME_STORAGE_KEY = "fair-teams-group-name";
const HEADER_COLOR_STORAGE_KEY = "fair-teams-header-color-v2";
const DEFAULT_GROUP_NAME = "My Group";
const DEFAULT_HEADER_COLOR = "#FFFFFF";

function hexToRgba(hex: string, alpha: number) {
  const normalized = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : DEFAULT_HEADER_COLOR;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PoweredByFairTeams() {
  return (
    <div className="mt-7 mb-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 select-none">
      <span>Powered by</span>
      <img src={fairTeamsLogo} alt="" className="h-5 w-5 object-contain opacity-80" />
      <span className="text-[#102A43]/70">Fair Teams</span>
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

  const [players, setPlayers] = useState<RoomPlayer[]>(() => loadPlayers());
  const [activeTab, setActiveTab] = useState("players");
  const [groupName, setGroupName] = useState(() => {
    try {
      return window.localStorage.getItem(GROUP_NAME_STORAGE_KEY) || DEFAULT_GROUP_NAME;
    } catch {
      return DEFAULT_GROUP_NAME;
    }
  });
  const [headerColor, setHeaderColor] = useState(() => {
    try {
      return window.localStorage.getItem(HEADER_COLOR_STORAGE_KEY) || DEFAULT_HEADER_COLOR;
    } catch {
      return DEFAULT_HEADER_COLOR;
    }
  });
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState(groupName);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rosterFilesOpen, setRosterFilesOpen] = useState(false);
  const [clearRosterOpen, setClearRosterOpen] = useState(false);
  const [clearRosterSlide, setClearRosterSlide] = useState(0);

  useEffect(() => {
    savePlayers(players);
  }, [players]);

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

  const startGroupNameEdit = () => {
    setDraftGroupName(groupName);
    setIsEditingGroupName(true);
  };

  const saveGroupName = () => {
    const nextName = draftGroupName.trim() || DEFAULT_GROUP_NAME;
    setGroupName(nextName);
    setDraftGroupName(nextName);
    setIsEditingGroupName(false);
  };

  const cancelGroupNameEdit = () => {
    setDraftGroupName(groupName);
    setIsEditingGroupName(false);
  };

  const isDefaultHeaderColor = headerColor.toUpperCase() === DEFAULT_HEADER_COLOR;
  const canEditHeader = true;

  const replacePlayers = (nextPlayers: RoomPlayer[]) => {
    setPlayers(nextPlayers);
  };

  const exportCsv = () => {
    setRosterFilesOpen(false);
    downloadText("fair-teams-roster.csv", playersToCsv(players), "text/csv;charset=utf-8");
  };



  const openClearRoster = () => {
    setRosterFilesOpen(false);
    setClearRosterSlide(0);
    setClearRosterOpen(true);
  };

  const openImportPicker = () => {
    setRosterFilesOpen(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const closeClearRoster = () => {
    setClearRosterOpen(false);
    setClearRosterSlide(0);
  };

  const confirmClearRoster = () => {
    if (clearRosterSlide < 95) return;
    setPlayers([]);
    closeClearRoster();
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith(".json")
      ? JSON.parse(text)
      : csvToPlayers(text);

    if (!Array.isArray(imported)) {
      throw new Error("Import file does not contain a roster list.");
    }

    const normalized = file.name.toLowerCase().endsWith(".json")
      ? imported.map((p, index) => normalizePlayer(p, index)).filter(p => p.name)
      : imported;

    if (normalized.length === 0) {
      alert("No players found in that file.");
      return;
    }

    const ok = window.confirm(`Import ${normalized.length} players? This replaces the current roster on this device.`);
    if (ok) setPlayers(normalized);
  };

  if (showSplash) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white text-[#102A43] fairteams-splash-fade">
        <img src={fairTeamsLogo} alt="Fair Teams" className="w-24 h-24 object-contain mb-3" />
        <h1 className="text-4xl font-black tracking-tight leading-none">
          <span className="text-[#102A43]">FAIR</span><span className="text-[#16A34A]"> TEAMS</span>
        </h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Fair teams. Fun games.</p>
        <div className="mt-6 h-1 w-20 rounded-full bg-[#22C55E]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto relative shadow-2xl overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 pt-3 pb-2 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <div className="min-w-0 flex-1">
              {isEditingGroupName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={draftGroupName}
                    onChange={e => setDraftGroupName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveGroupName();
                      if (e.key === "Escape") cancelGroupNameEdit();
                    }}
                    autoFocus
                    maxLength={32}
                    className="min-w-0 flex-1 h-9 rounded-xl bg-white text-[#102A43] px-3 text-sm font-extrabold outline-none border border-slate-200 shadow-sm"
                    placeholder="Group name"
                  />
                  <Button variant="secondary" size="icon" className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200" onClick={saveGroupName} title="Save group name">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="icon" className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200" onClick={cancelGroupNameEdit} title="Cancel">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <button type="button" onClick={startGroupNameEdit} className="group flex items-center gap-1.5 text-left min-w-0 max-w-full active:scale-[0.99] transition-transform">
                  <span className="h-2 w-2 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: headerColor }} />
                  <h1 className="text-[15px] font-black leading-tight truncate tracking-tight text-[#102A43]">{groupName}</h1>
                  <Pencil className="w-3.5 h-3.5 text-[#102A43]/45 opacity-90 shrink-0" />
                </button>
              )}
            </div>

            {!isEditingGroupName && (
              <div className="flex items-center gap-1.5 shrink-0">
                {activeTab === "players" && (
                  <>
                    <label className="relative h-7 w-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer active:scale-95 transition-transform" title="Pick group color">
                      <Palette className="w-3.5 h-3.5 text-[#102A43]/80" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: headerColor }} />
                      <input
                        type="color"
                        value={headerColor}
                        onChange={e => setHeaderColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        aria-label="Pick group color"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200"
                      onClick={() => setRosterFilesOpen(true)}
                      title="Roster files"
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
                {activeTab !== "players" && <span className="text-[11px] font-extrabold text-slate-400 tracking-tight whitespace-nowrap">Fair teams. Fun games.</span>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      await importFile(file);
                    } catch (error) {
                      alert(error instanceof Error ? error.message : "Import failed.");
                    }
                  }}
                />
              </div>
            )}
          </div>

          <TabsList className="w-full h-11 bg-slate-100/90 grid grid-cols-3 rounded-2xl p-1 gap-1.5 border border-border/70 shadow-inner">
            <TabsTrigger value="players" className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Users className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Roster</span>
            </TabsTrigger>
            <TabsTrigger value="today" className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <CalendarCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Today</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Shield className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Teams</span>
            </TabsTrigger>
          </TabsList>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          <TabsContent value="players" className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50">
            <PlayersTab players={players} setPlayers={replacePlayers} />
          </TabsContent>
          <TabsContent value="today" className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50">
            <TodayTab players={players} setPlayers={replacePlayers} />
          </TabsContent>
          <TabsContent value="teams" className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50">
            <TeamsTab players={players} />
          </TabsContent>
          <PoweredByFairTeams />
        </div>
      </Tabs>


      {rosterFilesOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black tracking-tight text-[#102A43]">Roster files</h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  Import, export, or clear the roster on this device.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setRosterFilesOpen(false)} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 grid gap-2">
              <Button type="button" variant="outline" className="h-12 justify-start rounded-2xl gap-3" onClick={openImportPicker}>
                <Upload className="h-4 w-4" />
                <span className="font-black">Import roster</span>
              </Button>
              <Button type="button" variant="outline" className="h-12 justify-start rounded-2xl gap-3" onClick={exportCsv} disabled={players.length === 0}>
                <Download className="h-4 w-4" />
                <span className="font-black">Export CSV</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl gap-3 border-red-100 bg-red-50/70 text-red-700 hover:bg-red-100 hover:text-red-800"
                onClick={openClearRoster}
                disabled={players.length === 0}
              >
                <Trash2 className="h-4 w-4" />
                <span className="font-black">Clear roster</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {clearRosterOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#102A43]">Clear entire roster?</h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                  This removes all {players.length} player profiles from this device. Export a backup first if you need one.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-red-700">
                <span>Slide to confirm</span>
                <span>{clearRosterSlide >= 95 ? "Ready" : `${clearRosterSlide}%`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={clearRosterSlide}
                onChange={e => setClearRosterSlide(Number(e.target.value))}
                className="w-full accent-red-600"
                aria-label="Slide to confirm clearing roster"
              />
              <p className="mt-2 text-[11px] font-semibold text-red-700/80">
                Move the slider all the way right, then press Clear roster.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={closeClearRoster}>Cancel</Button>
              <Button
                type="button"
                className="rounded-xl bg-red-600 text-white hover:bg-red-700"
                onClick={confirmClearRoster}
                disabled={clearRosterSlide < 95}
              >
                Clear roster
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
