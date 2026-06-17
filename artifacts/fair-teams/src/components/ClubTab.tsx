import React from "react";
import { CheckCircle2, ClipboardList, PackageOpen, Share2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type ClubTabProps = {
  activeRosterName: string;
  playerCount: number;
  isSharedRoster: boolean;
  collaboratorCount: number;
  onOpenSharedTools: () => void;
};

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

export function ClubTab({
  activeRosterName,
  playerCount,
  isSharedRoster,
  collaboratorCount,
  onOpenSharedTools,
}: ClubTabProps) {
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
              Shared roster, organizer votes, and equipment tracking will live here.
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
                {playerCount} player{playerCount === 1 ? "" : "s"} · {isSharedRoster ? `${collaboratorCount} collaborator${collaboratorCount === 1 ? "" : "s"}` : "local roster"}
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
        title="Collaborate"
        description="Invite organizers, open shared rosters, save changes, and get latest roster updates."
      >
        <Button
          type="button"
          className="h-11 w-full rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]"
          onClick={onOpenSharedTools}
        >
          Open shared roster tools
        </Button>
      </ClubFeatureCard>

      <ClubFeatureCard
        icon={<ClipboardList className="h-5 w-5" />}
        eyebrow="Votes"
        title="Make organizer decisions"
        description="Simple anonymous-display votes for captains, schedule decisions, board roles, or private organizer questions."
      >
        <div className="grid gap-2 rounded-2xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Aggregate results only. No public names next to choices.
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl border-dashed text-xs font-black text-slate-500"
            disabled
          >
            Voting backend not connected yet
          </Button>
        </div>
      </ClubFeatureCard>

      <ClubFeatureCard
        icon={<PackageOpen className="h-5 w-5" />}
        eyebrow="Equipment"
        title="Who has the bags?"
        description="A playful realtime board for balls, cones, bibs, first-aid spray, keys, and other shared gear."
      >
        <div className="grid grid-cols-3 gap-2">
          {["Club storage", "Joon", "Unknown"].map((column, index) => (
            <div key={column} className="rounded-2xl bg-slate-50 p-2">
              <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">
                {column}
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-black text-[#102A43] shadow-sm">
                {index === 0 ? "Bibs" : index === 1 ? "Ball bag" : "Pump?"}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          UI preview only for now.
        </div>
      </ClubFeatureCard>

      <section className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-4 text-center">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
          Launch plan
        </div>
        <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
          This tab is visible during testing. Later, normal solo users will keep the simpler Roster · Today · Teams navigation.
        </p>
      </section>
    </div>
  );
}
