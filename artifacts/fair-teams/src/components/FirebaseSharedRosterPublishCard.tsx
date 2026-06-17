import React, { useEffect, useMemo, useState } from "react";
import { CloudDownload, Save, Share2, Trash2, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomRoster } from "@/lib/localRoster";
import {
  acceptFirebaseGroupInvite,
  cancelFirebaseGroupInvite,
  createFirebaseSharedRoster,
  deleteFirebaseSharedRoster,
  inviteEmailToFirebaseSharedGroup,
  listenToSharedRosterUser,
  listFirebaseGroupInvites,
  listFirebaseSharedGroups,
  listFirebaseSharedRosters,
  readFirebaseSharedRoster,
  saveFirebaseSharedRoster,
  type FirebaseGroupInvite,
  type FirebaseSharedGroupSummary,
  type FirebaseSharedRosterSummary,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";

type Props = {
  activeRoster: RoomRoster | undefined;
  rosters?: RoomRoster[];
  isEmptyRoster: boolean;
  onOpenRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
  onRosterSaved?: (summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onRefreshActiveRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onSharedRosterSummariesUpdated?: (summaries: FirebaseSharedRosterSummary[]) => void;
  onSharedInviteOpened?: (roster: RoomRoster) => void;
};

function friendlyFirestoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/permission-denied|Missing or insufficient permissions/i.test(message)) return "Permission denied.";
  if (/network/i.test(message)) return "Network error.";
  if (/saved by someone else|changed elsewhere|Remote version/i.test(message)) return "Saved elsewhere. Get latest first.";
  return message.replace(/^Firebase:\s*/i, "");
}

function shortName(email?: string) {
  if (!email) return "—";
  return email.split("@")[0] || email;
}

function canRoleSave(role?: string, isOwner?: boolean) {
  return role === "editor" || role === "owner" || Boolean(isOwner);
}

function modalShell(title: string, onClose: () => void, body: React.ReactNode) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="text-sm font-black text-[#102A43]">{title}</div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-50 p-2 text-slate-500 active:scale-95">
            <X className="h-4 w-4" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

export function FirebaseSharedRosterPublishCard({ activeRoster, rosters = [], isEmptyRoster, onOpenRoster, onRosterSaved, onRefreshActiveRoster, onSharedRosterSummariesUpdated, onSharedInviteOpened }: Props) {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [sharedGroups, setSharedGroups] = useState<FirebaseSharedGroupSummary[]>([]);
  const [sharedRosters, setSharedRosters] = useState<FirebaseSharedRosterSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FirebaseGroupInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [collaboratorRosterId, setCollaboratorRosterId] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => listenToSharedRosterUser((nextUser) => {
    setUser(nextUser);
    if (!nextUser) {
      setSharedGroups([]);
      setSharedRosters([]);
      setIncomingInvites([]);
    }
  }), []);

  const activeFirebaseSource = activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource : null;
  const activeSharedRosterId = activeFirebaseSource?.firebaseRosterId || "";
  const activeSharedRoster = useMemo(
    () => sharedRosters.find((roster) => roster.id === activeSharedRosterId) || null,
    [sharedRosters, activeSharedRosterId],
  );
  const activeGroup = useMemo(
    () => sharedGroups.find((group) => group.id === (activeSharedRoster?.groupId || activeFirebaseSource?.firebaseGroupId)) || null,
    [sharedGroups, activeSharedRoster?.groupId, activeFirebaseSource?.firebaseGroupId],
  );
  const collaboratorRoster = useMemo(
    () => collaboratorRosterId ? sharedRosters.find((roster) => roster.id === collaboratorRosterId) || activeSharedRoster : null,
    [sharedRosters, collaboratorRosterId, activeSharedRoster],
  );
  const collaboratorGroup = useMemo(
    () => sharedGroups.find((group) => group.id === collaboratorRoster?.groupId) || activeGroup,
    [sharedGroups, collaboratorRoster?.groupId, activeGroup],
  );
  const sharedRosterById = useMemo(() => new Map(sharedRosters.map((roster) => [roster.id, roster])), [sharedRosters]);
  const linkedRosters = useMemo(() => rosters.filter((roster) => roster.cloudSource?.provider === "firebase" && roster.cloudSource.firebaseRosterId), [rosters]);
  const remoteUpdatedLinkedRosters = useMemo(() => linkedRosters.filter((roster) => {
    const source = roster.cloudSource;
    if (source?.provider !== "firebase" || !source.firebaseRosterId) return false;
    const remoteSummary = sharedRosterById.get(source.firebaseRosterId);
    const localVersion = typeof source.firebaseVersion === "number" ? source.firebaseVersion : 0;
    return Boolean(remoteSummary && remoteSummary.version > localVersion);
  }), [linkedRosters, sharedRosterById]);
  const activeRole = activeFirebaseSource?.firebaseRole || (activeFirebaseSource?.firebaseOwnerUid === user?.uid ? "owner" : activeSharedRoster?.currentUserRole);
  const activeCanSave = canRoleSave(activeRole, activeFirebaseSource?.firebaseOwnerUid === user?.uid || activeSharedRoster?.ownerUid === user?.uid);
  const activeHasLocalChanges = (() => {
    if (!activeRoster || !activeFirebaseSource) return false;
    const localTime = Date.parse(activeRoster.updatedAt || activeRoster.createdAt || "");
    const syncedTime = Date.parse(activeFirebaseSource.lastSyncedAt || "");
    if (!Number.isFinite(localTime)) return false;
    if (!Number.isFinite(syncedTime)) return true;
    return localTime > syncedTime + 1000;
  })();
  const updateCount = remoteUpdatedLinkedRosters.length;

  const refreshSharedData = async () => {
    if (!user) return;
    setBusy((current) => current || "refresh");
    try {
      const [groups, rosters, invites] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters(), listFirebaseGroupInvites()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setIncomingInvites(invites);
      onSharedRosterSummariesUpdated?.(rosters);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy((current) => current === "refresh" ? "" : current);
    }
  };

  useEffect(() => {
    if (user) void refreshSharedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleShareActiveRoster = async () => {
    if (!user || !activeRoster || isEmptyRoster || busy) return;
    setBusy("publish");
    setNotice(null);
    try {
      const created = await createFirebaseSharedRoster(activeRoster, undefined, activeRoster.name || "Shared roster");
      onRosterSaved?.(created, activeRoster.id);
      await refreshSharedData();
      setNotice({ tone: "success", text: "Roster shared." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleSaveActiveRoster = async () => {
    if (!user || !activeRoster || !activeFirebaseSource || busy) return;
    if (!activeHasLocalChanges) {
      setNotice({ tone: "info", text: "No changes to save." });
      return;
    }
    if (!activeCanSave) {
      setNotice({ tone: "error", text: "You can open this roster, but not save changes." });
      return;
    }
    setBusy("save");
    setNotice(null);
    try {
      const saved = await saveFirebaseSharedRoster(activeRoster);
      onRosterSaved?.(saved, activeRoster.id);
      await refreshSharedData();
      setNotice({ tone: "success", text: "Roster saved." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleGetLatest = async () => {
    if (!user || busy) return;
    const targets = remoteUpdatedLinkedRosters;
    if (!targets.length) {
      setNotice({ tone: "info", text: "Already up to date." });
      return;
    }
    setBusy("reload");
    setNotice(null);
    try {
      let refreshed = 0;
      for (const localRoster of targets) {
        const rosterId = localRoster.cloudSource?.provider === "firebase" ? localRoster.cloudSource.firebaseRosterId : undefined;
        if (!rosterId) continue;
        const snapshot = await readFirebaseSharedRoster(rosterId);
        onRefreshActiveRoster?.(snapshot.roster, snapshot.name, snapshot, localRoster.id);
        refreshed += 1;
      }
      await refreshSharedData();
      setNotice({ tone: "success", text: refreshed === 1 ? "Player cards and pairing rules updated." : `${refreshed} rosters updated with latest player cards and pairing rules.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleOpenRoster = async (rosterId: string) => {
    if (!user || busy) return;
    setBusy(`open:${rosterId}`);
    setNotice(null);
    try {
      const snapshot = await readFirebaseSharedRoster(rosterId);
      onOpenRoster?.(snapshot.roster, snapshot.name, snapshot);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleInvite = async () => {
    if (!user || !collaboratorGroup || !inviteEmail.trim() || busy) return;
    setBusy("invite");
    setNotice(null);
    try {
      await inviteEmailToFirebaseSharedGroup(collaboratorGroup.id, inviteEmail);
      setInviteEmail("");
      await refreshSharedData();
      setNotice({ tone: "success", text: "Collaborator invited." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleCancelInvite = async (email: string) => {
    if (!collaboratorGroup || busy) return;
    setBusy(`cancel:${email}`);
    setNotice(null);
    try {
      await cancelFirebaseGroupInvite(collaboratorGroup.id, email);
      await refreshSharedData();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleAcceptInvite = async (groupId: string) => {
    if (!user || busy) return;
    setBusy(`accept:${groupId}`);
    setNotice(null);
    try {
      const acceptedGroup = await acceptFirebaseGroupInvite(groupId);
      const groupRosters = await listFirebaseSharedRosters(groupId);
      const rosterToOpen = groupRosters[0];

      if (rosterToOpen) {
        const snapshot = await readFirebaseSharedRoster(rosterToOpen.id);
        onOpenRoster?.(snapshot.roster, snapshot.name, snapshot);
        onSharedInviteOpened?.(snapshot.roster);
        setNotice({ tone: "success", text: `${snapshot.name || acceptedGroup.name || "Shared roster"} opened.` });
      } else {
        await refreshSharedData();
        setNotice({ tone: "success", text: "Shared roster added." });
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleRemoveSharedRoster = async (rosterId: string) => {
    const ok = window.confirm("Delete this shared roster online?");
    if (!ok) return;
    setBusy(`delete:${rosterId}`);
    setNotice(null);
    try {
      await deleteFirebaseSharedRoster(rosterId);
      await refreshSharedData();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const openCollaborators = (rosterId?: string) => {
    setCollaboratorRosterId(rosterId || activeSharedRosterId || "");
  };

  return (
    <div className="grid gap-3">
      {incomingInvites.length > 0 && (
        <div className="grid gap-1.5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
          {incomingInvites.slice(0, 3).map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-2 py-2">
              <div className="min-w-0 truncate text-xs font-black text-[#102A43]">{invite.name}</div>
              <Button type="button" variant="outline" className="h-8 rounded-xl border-emerald-100 px-2 text-[10px] font-black text-emerald-700" onClick={() => handleAcceptInvite(invite.id)} disabled={Boolean(busy)}>
                {busy === `accept:${invite.id}` ? "Accepting…" : "Accept"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {updateCount > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] font-bold leading-snug text-amber-800">
          {updateCount === 1 ? "1 shared roster has roster updates." : `${updateCount} shared rosters have roster updates.`} Get latest updates player cards and pairing rules. Local photos, colors, logo, and device settings stay on this device.
        </div>
      )}

      {!activeSharedRoster ? (
        <Button type="button" className="h-11 rounded-2xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700" onClick={handleShareActiveRoster} disabled={!user || isEmptyRoster || Boolean(busy)}>
          <Share2 className="mr-1.5 h-4 w-4" />
          {busy === "publish" ? "Sharing…" : "Share this roster"}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="h-10 rounded-2xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700" onClick={handleSaveActiveRoster} disabled={!user || !activeCanSave || !activeHasLocalChanges || Boolean(busy)}>
            <Save className="mr-1.5 h-4 w-4" />
            {busy === "save" ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-100 bg-white text-xs font-black" onClick={handleGetLatest} disabled={!user || !remoteUpdatedLinkedRosters.length || Boolean(busy)}>
            <CloudDownload className="mr-1.5 h-4 w-4" />
            {busy === "reload" ? "Getting…" : "Get latest"}
          </Button>
        </div>
      )}

      <div className="grid gap-2">
        <div className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Shared rosters</div>
        {sharedRosters.length === 0 ? (
          <div className="px-1 py-1 text-[11px] font-bold text-slate-500">No shared rosters</div>
        ) : (
          <div className="grid gap-1.5">
            {sharedRosters.slice(0, 10).map((roster) => {
              const group = sharedGroups.find((item) => item.id === roster.groupId);
              const collaboratorCount = group ? Math.max(0, group.memberCount - 1) + (group.pendingInviteEmails?.length || 0) : Math.max(0, (roster.memberEmails?.length || 1) - 1) + (roster.pendingInviteEmails?.length || 0);
              const linked = linkedRosters.some((local) => local.cloudSource?.provider === "firebase" && local.cloudSource.firebaseRosterId === roster.id);
              const isOwner = roster.ownerUid === user?.uid;
              return (
                <div key={roster.id} className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-emerald-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => handleOpenRoster(roster.id)} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{roster.name}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">saved by {shortName(roster.lastSavedByEmail || roster.ownerEmail)}</span>
                  </button>
                  <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl bg-white px-2 text-[10px] font-black text-emerald-700 shadow-sm">
                    <Users className="h-3.5 w-3.5" />
                    {collaboratorCount}
                  </button>
                  {isOwner && (
                    <button type="button" onClick={() => handleRemoveSharedRoster(roster.id)} className="rounded-xl bg-white p-2 text-rose-600 shadow-sm" disabled={Boolean(busy)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      {collaboratorRoster && modalShell("Collaborators", () => setCollaboratorRosterId(""), (
        <div className="grid gap-3">
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-[#102A43]">{collaboratorRoster.name}</div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold outline-none" placeholder="email@example.com" />
            <Button type="button" className="h-10 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white" onClick={handleInvite} disabled={!inviteEmail.trim() || Boolean(busy)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="grid gap-1.5">
            {(collaboratorGroup?.memberEmails || collaboratorRoster.memberEmails || []).map((email) => (
              <div key={email} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                <span className="truncate">{email}</span>
                <span className="text-[10px] text-emerald-700">{email === collaboratorRoster.ownerEmail ? "owner" : "active"}</span>
              </div>
            ))}
            {(collaboratorGroup?.pendingInviteEmails || collaboratorRoster.pendingInviteEmails || []).map((email) => (
              <div key={email} className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                <span className="min-w-0 truncate">{email}</span>
                <button type="button" onClick={() => handleCancelInvite(email)} className="rounded-full bg-white p-1.5 text-amber-700" disabled={Boolean(busy)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
