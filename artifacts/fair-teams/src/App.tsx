import React, { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, CalendarCheck, Shield, Download, Upload, Pencil, Check, X, Palette } from "lucide-react";
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
const DEFAULT_GROUP_NAME = "Fair Teams";
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
  const canEditHeader = activeTab === "players";

  const headerStyle: React.CSSProperties = isDefaultHeaderColor
    ? {
        background: "rgba(255,255,255,0.98)",
        boxShadow: "0 4px 14px rgba(15, 42, 67, 0.08)",
      }
    : {
        background: `linear-gradient(90deg, ${hexToRgba(headerColor, 0.14)} 0%, ${hexToRgba(headerColor, 0.06)} 18%, rgba(255,255,255,0.98) 48%, rgba(255,255,255,0.98) 100%)`,
        boxShadow: `0 4px 14px rgba(15, 42, 67, 0.10), inset 5px 0 0 ${headerColor}`,
      };

  const replacePlayers = (nextPlayers: RoomPlayer[]) => {
    setPlayers(nextPlayers);
  };

  const exportCsv = () => {
    downloadText("fair-teams-roster.csv", playersToCsv(players), "text/csv;charset=utf-8");
  };

  const exportJson = () => {
    downloadText(
      "fair-teams-roster-backup.json",
      JSON.stringify(players, null, 2),
      "application/json;charset=utf-8",
    );
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
        <p className="mt-3 text-sm font-semibold text-slate-500">Balanced teams. Better games.</p>
        <div className="mt-6 h-1 w-20 rounded-full bg-[#22C55E]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background w-full max-w-md mx-auto relative shadow-2xl overflow-hidden">
      <header className="px-5 pt-3 pb-2 bg-background">
        <div className="relative rounded-[1.15rem] border border-slate-200 text-[#102A43] px-3.5 py-2.5 flex items-center gap-2.5" style={headerStyle}>
          <div className="relative z-10 min-w-0 flex-1">
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
                  className="min-w-0 flex-1 h-9 rounded-xl bg-white/95 text-[#102A43] px-3 text-sm font-extrabold outline-none border border-white/30 shadow-sm"
                  placeholder="Group name"
                />
                <Button variant="secondary" size="icon" className="h-9 w-9 rounded-xl" onClick={saveGroupName} title="Save group name">
                  <Check className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="icon" className="h-9 w-9 rounded-xl" onClick={cancelGroupNameEdit} title="Cancel">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : canEditHeader ? (
              <button type="button" onClick={startGroupNameEdit} className="group text-left min-w-0 max-w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="text-[15px] font-black leading-tight truncate tracking-tight">{groupName}</h1>
                  <Pencil className="w-3.5 h-3.5 text-[#102A43]/55 opacity-90 group-active:scale-95 shrink-0" />
                </div>
              </button>
            ) : (
              <div className="text-left min-w-0 max-w-full">
                <h1 className="text-[15px] font-black leading-tight truncate tracking-tight">{groupName}</h1>
              </div>
            )}
          </div>

          {!isEditingGroupName && (
            <div className="relative z-10 flex gap-1 shrink-0 items-center">
              {canEditHeader && (
                <label className="relative h-7 w-7 rounded-lg bg-slate-100 shadow-sm border border-slate-200 flex items-center justify-center cursor-pointer active:scale-95 transition-transform" title="Pick header team color">
                  <Palette className="w-3.5 h-3.5 text-[#102A43]" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: headerColor }} />
                  <input
                    type="color"
                    value={headerColor}
                    onChange={e => setHeaderColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Pick header team color"
                  />
                </label>
              )}

              {activeTab === "players" && (
                <>
                  <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" onClick={exportCsv} title="Export Roster" disabled={players.length === 0}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" onClick={() => fileInputRef.current?.click()} title="Import Roster">
                    <Upload className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
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
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-2 shadow-sm">
          <TabsList className="w-full h-11 bg-slate-100/90 grid grid-cols-3 rounded-2xl p-1 gap-1.5 border border-border/70 shadow-inner">
            <TabsTrigger value="players" className="rounded-xl flex items-center justify-center gap-1.5 h-full text-muted-foreground transition-all data-[state=active]:bg-[#102A43] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Users className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Players</span>
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
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
    </div>
  );
}

export default App;
