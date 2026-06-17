import React, { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ClubTabProps = {
  activeRosterName: string;
  playerCount: number;
  isSharedRoster: boolean;
  collaboratorCount: number;
  onOpenSharedTools: () => void;
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

const VOTE_PREVIEW_STORAGE_KEY = "fairteams.clubVotes.preview.v1";

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
  playerCount,
  isSharedRoster,
  collaboratorCount,
  onOpenSharedTools,
}: ClubTabProps) {
  const [votes, setVotes] = useState<ClubVote[]>(() => {
    if (typeof window === "undefined") return [];
    return parseVotes(window.localStorage.getItem(VOTE_PREVIEW_STORAGE_KEY));
  });
  const [voteDialogOpen, setVoteDialogOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionText, setOptionText] = useState("Yes\nNo");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VOTE_PREVIEW_STORAGE_KEY, JSON.stringify(votes));
  }, [votes]);

  const openVotes = useMemo(() => votes.filter((vote) => vote.status === "open"), [votes]);
  const closedVotes = useMemo(() => votes.filter((vote) => vote.status === "closed"), [votes]);

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

  const canCreateVote = question.trim().length > 0 && optionText.split("\n").filter((line) => line.trim()).length >= 2;

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

      <Dialog open={voteDialogOpen} onOpenChange={(open) => {
        setVoteDialogOpen(open);
        if (!open) resetVoteForm();
      }}>
        <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-3xl p-0">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-[#102A43]">
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
                className="min-h-24 rounded-2xl border-slate-200 text-sm font-semibold"
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
                className="min-h-28 rounded-2xl border-slate-200 text-sm font-semibold"
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
                className="h-11 rounded-2xl text-sm font-black"
                onClick={() => setVoteDialogOpen(false)}
              >
                <X className="mr-1.5 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]"
                disabled={!canCreateVote}
                onClick={createVote}
              >
                Create vote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
