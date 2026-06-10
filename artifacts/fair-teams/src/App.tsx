import React, { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, CalendarCheck, Shield, Download, Upload, Pencil, Check, X, Palette } from "lucide-react";
import { PlayersTab } from "@/components/PlayersTab";
import { TodayTab } from "@/components/TodayTab";
import { TeamsTab } from "@/components/TeamsTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  const [showRosterImportDialog, setShowRosterImportDialog] = useState(false);
  const [pastedRosterText, setPastedRosterText] = useState("");
  const [importStatus, setImportStatus] = useState("");
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
  const canEditHeader = true;

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

  const readImportFileAsText = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Could not read the selected roster file."));
      reader.readAsText(file);
    });
  };

  const importRosterText = async (text: string, sourceName = "pasted.csv") => {
    const lowerName = sourceName.toLowerCase();
    const trimmedText = text.trim();

    if (!trimmedText) {
      throw new Error("No roster data found.");
    }

    setImportStatus("Parsing roster…");
    const imported = lowerName.endsWith(".json")
      ? JSON.parse(trimmedText)
      : csvToPlayers(trimmedText);

    if (!Array.isArray(imported)) {
      throw new Error("Import file does not contain a roster list.");
    }

    const normalized = lowerName.endsWith(".json")
      ? imported.map((p, index) => normalizePlayer(p, index)).filter(p => p.name)
      : imported;

    if (normalized.length === 0) {
      throw new Error("No players found in that roster.");
    }

    const ok = window.confirm(`Import ${normalized.length} players? This replaces the current roster on this device.`);
    if (!ok) {
      setImportStatus("Import cancelled.");
      return;
    }

    setImportStatus("Importing roster…");
    setPlayers(normalized);
    setPastedRosterText("");
    setShowRosterImportDialog(false);
    setImportStatus("");
  };

  const importFile = async (file: File) => {
    setImportStatus(`Reading ${file.name}…`);
    const text = await readImportFileAsText(file);
    await importRosterText(text, file.name);
  };

  const importPastedRoster = async () => {
    try {
      await importRosterText(pastedRosterText, "pasted.csv");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setImportStatus(message);
      alert(message);
    }
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
                  <Button type="button" variant="secondary" size="icon" className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200" onClick={saveGroupName} title="Save group name">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="secondary" size="icon" className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200" onClick={cancelGroupNameEdit} title="Cancel">
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
                    <Button type="button" variant="secondary" size="icon" className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" onClick={exportCsv} title="Export Roster" disabled={players.length === 0}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="secondary" size="icon" className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setImportStatus(""); setShowRosterImportDialog(true); }} title="Import Roster">
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
                  onClick={e => e.stopPropagation()}
                  onChange={async e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    input.value = "";
                    if (!file) return;
                    try {
                      await importFile(file);
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Import failed.";
                      setImportStatus(message);
                      alert(message);
                    }
                  }}
                />
                <Dialog open={showRosterImportDialog} onOpenChange={setShowRosterImportDialog}>
                  <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-3xl p-5">
                    <DialogHeader>
                      <DialogTitle>Import roster</DialogTitle>
                      <DialogDescription>
                        Choose a CSV/JSON roster file, or paste CSV text if your tablet has trouble opening files.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Button
                        type="button"
                        className="w-full rounded-2xl bg-[#102A43] text-white"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setImportStatus("");
                          fileInputRef.current?.click();
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" /> Choose CSV file
                      </Button>

                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Paste CSV text</p>
                        <Textarea
                          value={pastedRosterText}
                          onChange={e => setPastedRosterText(e.target.value)}
                          placeholder="name,attack,defense,..."
                          className="min-h-32 rounded-2xl text-sm"
                        />
                      </div>

                      {importStatus && (
                        <p className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{importStatus}</p>
                      )}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => setShowRosterImportDialog(false)}>Cancel</Button>
                      <Button type="button" className="rounded-2xl bg-[#16A34A] text-white" onClick={importPastedRoster} disabled={!pastedRosterText.trim()}>Import pasted</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
    </div>
  );
}

export default App;
