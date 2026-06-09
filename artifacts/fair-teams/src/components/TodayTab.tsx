import React, { useState } from "react";
import type { RoomPlayer } from "@/lib/localRoster";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";


function displayName(player: Pick<RoomPlayer, "name" | "aka">) {
  const aka = player.aka?.trim();
  return aka ? `${player.name} (${aka})` : player.name;
}

function NewBadge() {
  return <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-800 border border-sky-200">NEW</span>;
}
function GKBadge() {
  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800 border border-emerald-200">GK</span>;
}

function ORGBadge() {
  return <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-black text-orange-800 border border-orange-200">ORG</span>;
}

export function TodayTab({ players, setPlayers }: { players: RoomPlayer[]; setPlayers: (players: RoomPlayer[]) => void }) {
  const [search, setSearch] = useState("");

  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = search.trim()
    ? sorted.filter(p => displayName(p).toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const selectedCount = players.filter(p => p.attending).length;

  const togglePlayer = (player: RoomPlayer) => {
    setPlayers(players.map(p => p.id === player.id ? { ...p, attending: !p.attending } : p));
  };

  if (players.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground font-medium">Add players in the Roster tab first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between bg-primary text-primary-foreground p-3 rounded-xl shadow-sm">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">Attending Today</span>
          <span className="text-xl font-black leading-tight">{selectedCount} <span className="text-xs font-medium opacity-80">/ {players.length}</span></span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPlayers(players.map(p => ({ ...p, attending: true })))} className="h-7 text-[10px] font-bold uppercase px-2" >
            All
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPlayers(players.map(p => ({ ...p, attending: false })))} className="h-7 text-[10px] font-bold uppercase px-2 opacity-80 hover:opacity-100 bg-slate-900/10 hover:bg-slate-900/20 text-white border-transparent" >
            Clear
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 pl-8 pr-8 text-xs"
          data-testid="today-search"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 bg-muted/50 rounded-xl border border-dashed border-border">
          <p className="text-muted-foreground font-medium text-xs">No players match "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {filtered.map(player => (
            <label
              key={player.id}
              className={`flex items-center gap-2 px-2.5 py-2 border rounded-lg cursor-pointer transition-colors ${player.attending ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              data-testid={`attendance-row-${player.id}`}
            >
              <Checkbox
                checked={!!player.attending}
                onCheckedChange={() => togglePlayer(player)}
                className="w-4 h-4 rounded-full border-2 shrink-0 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                data-testid={`attendance-check-${player.id}`}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <div className={`font-bold text-xs truncate leading-tight ${player.attending ? "text-primary" : "text-foreground"}`}>{displayName(player)}</div>
                <div className="mt-0.5 flex items-center gap-1 min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium shrink-0">OVR {player.skill} · TP {player.teamPlay ?? 2}</span>
                  {(player.isNew || player.isGoalkeeper || player.isOrganizer) && (
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {player.isNew && <NewBadge />}{player.isGoalkeeper && <GKBadge />}
                      {player.isOrganizer && <ORGBadge />}
                    </div>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
