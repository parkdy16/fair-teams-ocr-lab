import React, { useEffect, useState } from "react";
import { CloudDownload, CloudUpload, Database, ListChecks, RefreshCw, Save, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomRoster } from "@/lib/localRoster";
import {
  createFirebaseSharedRoster,
  listenToSharedRosterUser,
  listFirebaseSharedRosters,
  readFirebaseSharedRoster,
  saveFirebaseSharedRoster,
  type FirebaseSharedRosterSummary,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";

type Props = {
  activeRoster: RoomRoster | undefined;
  isEmptyRoster: boolean;
  onOpenRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
  onRosterSaved?: (summary: FirebaseSharedRosterSummary) => void;
  onRefreshActiveRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
};

function friendlyFirestoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/permission-denied|Missing or insufficient permissions/i.test(message)) {
    return "Firestore rules are still locked. Add the shared roster rules in Firebase Console, then try again.";
  }
  if (/network/i.test(message)) return "Network error. Check your connection and try again.";
  return message.replace(/^Firebase:\s*/i, "");
}

function formatWhen(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FirebaseSharedRosterPublishCard({ activeRoster, isEmptyRoster, onOpenRoster, onRosterSaved, onRefreshActiveRoster }: Props) {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState<"publish" | "refresh" | "save" | "reload" | string>("");
  const [sharedRosters, setSharedRosters] = useState<FirebaseSharedRosterSummary[]>([]);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = listenToSharedRosterUser((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setSharedRosters([]);
      }
    });
    return unsubscribe;
  }, []);

  const refreshSharedRosters = async (nextUser = user) => {
    if (!nextUser) return;
    setBusy("refresh");
    setNotice(null);
    try {
      const rosters = await listFirebaseSharedRosters();
      setSharedRosters(rosters);
      setNotice({ tone: "info", text: rosters.length ? `Found ${rosters.length} Firebase shared roster${rosters.length === 1 ? "" : "s"}.` : "No Firebase shared rosters yet." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (user) {
      void refreshSharedRosters(user);
    }
    // Intentionally refresh when the signed-in Firebase user changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);


  const handleOpenRoster = async (rosterId: string) => {
    if (!user || busy) return;
    setBusy(`open:${rosterId}`);
    setNotice(null);
    try {
      const snapshot = await readFirebaseSharedRoster(rosterId);
      onOpenRoster?.(snapshot.roster, snapshot.name, snapshot);
      setNotice({ tone: "success", text: `Opened ${snapshot.name} as a linked local copy. You can save changes back to Firebase now.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };


  const handleRefreshActiveRoster = async () => {
    const rosterId = activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource.firebaseRosterId : undefined;
    if (!user || !rosterId || busy) return;
    setBusy("reload");
    setNotice(null);
    try {
      const snapshot = await readFirebaseSharedRoster(rosterId);
      onRefreshActiveRoster?.(snapshot.roster, snapshot.name, snapshot);
      const rosters = await listFirebaseSharedRosters();
      setSharedRosters(rosters);
      setNotice({ tone: "success", text: `Refreshed ${snapshot.name} from Firebase version ${snapshot.version}.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };


  const handleSaveActiveRoster = async () => {
    if (!user || !activeRoster || busy) return;
    setBusy("save");
    setNotice(null);
    try {
      const saved = await saveFirebaseSharedRoster(activeRoster);
      onRosterSaved?.(saved);
      const rosters = await listFirebaseSharedRosters();
      setSharedRosters(rosters);
      setNotice({ tone: "success", text: `Saved ${saved.name} to Firebase as version ${saved.version}.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handlePublish = async () => {
    if (!user || !activeRoster || isEmptyRoster || busy) return;
    setBusy("publish");
    setNotice(null);
    try {
      const created = await createFirebaseSharedRoster(activeRoster);
      setNotice({ tone: "success", text: `Created Firebase shared roster: ${created.name}. Invites and sync come next.` });
      const rosters = await listFirebaseSharedRosters();
      setSharedRosters(rosters);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const disabledReason = !authReady
    ? "Checking Firebase sign-in…"
    : !user
      ? "Sign in above to create a Firebase shared roster."
      : !activeRoster
        ? "No active roster found."
        : isEmptyRoster
          ? "Add players before creating a shared roster."
          : "Ready to create a Firebase shared roster test.";

  const activeFirebaseSource = activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource : null;
  const canSaveActiveRoster = Boolean(user && activeRoster && activeFirebaseSource?.firebaseRosterId && !busy);
  const canRefreshActiveRoster = canSaveActiveRoster;

  return (
    <div className="grid gap-3 rounded-3xl border border-violet-100 bg-violet-50/60 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-2xl bg-white p-2 text-violet-700 shadow-sm">
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-wide text-violet-700">
            Firebase Firestore test
          </div>
          <div className="mt-0.5 text-sm font-black tracking-tight text-[#102A43]">
            Create shared roster document
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
            This publishes a photo-free copy of the current roster to Firestore. It does not replace your local roster yet.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          Current roster
        </div>
        <div className="mt-0.5 truncate text-xs font-black text-[#102A43]">
          {activeRoster?.name || "No roster"}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
          {activeRoster ? `${activeRoster.players.length} player${activeRoster.players.length === 1 ? "" : "s"}` : disabledReason}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="h-11 justify-start rounded-2xl gap-2 bg-violet-600 px-3 text-xs font-black text-white shadow-sm hover:bg-violet-700"
          onClick={handlePublish}
          disabled={!user || !activeRoster || isEmptyRoster || Boolean(busy)}
        >
          <CloudUpload className="h-4 w-4" />
          {busy === "publish" ? "Creating…" : "Create Firebase shared roster"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start rounded-2xl gap-2 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50"
          onClick={handleSaveActiveRoster}
          disabled={!canSaveActiveRoster}
        >
          <Save className="h-4 w-4" />
          {busy === "save" ? "Saving…" : "Save active Firebase roster"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start rounded-2xl gap-2 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50 sm:col-span-2"
          onClick={handleRefreshActiveRoster}
          disabled={!canRefreshActiveRoster}
        >
          <CloudDownload className="h-4 w-4" />
          {busy === "reload" ? "Refreshing…" : "Refresh active Firebase roster"}
        </Button>
      </div>

      {activeFirebaseSource?.firebaseRosterId ? (
        <div className="rounded-2xl bg-white/75 px-3 py-2 text-[11px] font-bold leading-snug text-slate-600">
          Active roster is linked to Firebase version {activeFirebaseSource.firebaseVersion || 1}. Save will check the remote version before overwriting.
        </div>
      ) : null}

      <div className="grid gap-2 rounded-2xl bg-white/75 p-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <ListChecks className="h-3.5 w-3.5" />
            My Firebase rosters
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 rounded-xl px-2 text-[10px] font-black text-violet-700"
            onClick={() => refreshSharedRosters()}
            disabled={!user || Boolean(busy)}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {!user ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            Sign in above to list Firebase shared rosters.
          </div>
        ) : sharedRosters.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            No Firebase shared rosters yet.
          </div>
        ) : (
          <div className="grid gap-1.5">
            {sharedRosters.slice(0, 4).map((roster) => (
              <div key={roster.id} className="grid gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#102A43]">
                    <Share2 className="h-3.5 w-3.5 text-violet-600" />
                    <span className="min-w-0 flex-1 truncate">{roster.name}</span>
                    <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">v{roster.version}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    {roster.playerCount} player{roster.playerCount === 1 ? "" : "s"} · {formatWhen(roster.updatedAt)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 justify-start rounded-xl gap-1.5 border-violet-100 bg-violet-50/60 px-2 text-[10px] font-black text-violet-700"
                  onClick={() => handleOpenRoster(roster.id)}
                  disabled={!user || Boolean(busy)}
                >
                  <CloudDownload className="h-3.5 w-3.5" />
                  {busy === `open:${roster.id}` ? "Opening…" : "Open local copy"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {notice ? (
        <div
          className={`rounded-2xl px-3 py-2 text-[11px] font-bold leading-snug ${
            notice.tone === "success"
              ? "bg-emerald-50 text-emerald-700"
              : notice.tone === "error"
                ? "bg-rose-50 text-rose-700"
                : "bg-white/80 text-slate-600"
          }`}
        >
          {notice.text}
        </div>
      ) : (
        <div className="rounded-2xl bg-white/70 px-3 py-2 text-[11px] font-bold leading-snug text-slate-500">
          {disabledReason}
        </div>
      )}
    </div>
  );
}
