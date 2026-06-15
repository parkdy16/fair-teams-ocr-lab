import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CloudDownload, Inbox, ListChecks, Mail, RefreshCw, Save, Settings, Trash2, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomRoster } from "@/lib/localRoster";
import {
  acceptFirebaseGroupInvite,
  cancelFirebaseGroupInvite,
  createFirebaseSharedGroup,
  createFirebaseSharedRoster,
  deleteFirebaseSharedGroup,
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

function labelRole(role?: string, isOwner?: boolean) {
  if (role === "owner" || isOwner) return "Owner";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "Member";
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

export function FirebaseSharedRosterPublishCard({ activeRoster, rosters = [], isEmptyRoster, onOpenRoster, onRosterSaved, onRefreshActiveRoster }: Props) {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState<"publish" | "refresh" | "save" | "reload" | string>("");
  const [sharedGroups, setSharedGroups] = useState<FirebaseSharedGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [sharedRosters, setSharedRosters] = useState<FirebaseSharedRosterSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FirebaseGroupInvite[]>([]);
  const [newGroupName, setNewGroupName] = useState("My group");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedLocalRosterIds, setSelectedLocalRosterIds] = useState<string[]>([]);
  const [modal, setModal] = useState<"groups" | "rosters" | "collaborators" | "" >("");
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = listenToSharedRosterUser((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setSharedGroups([]);
        setSharedRosters([]);
        setIncomingInvites([]);
        setSelectedGroupId("");
      }
    });
    return unsubscribe;
  }, []);

  const selectedGroup = useMemo(() => sharedGroups.find((group) => group.id === selectedGroupId) || null, [selectedGroupId, sharedGroups]);
  const visibleRosters = useMemo(() => selectedGroupId ? sharedRosters.filter((roster) => roster.groupId === selectedGroupId) : [], [selectedGroupId, sharedRosters]);
  const activeFirebaseSource = activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource : null;
  const activeFirebaseRole = activeFirebaseSource?.firebaseRole || (activeFirebaseSource?.firebaseOwnerUid === user?.uid ? "owner" : activeFirebaseSource?.firebaseRosterId ? "editor" : undefined);
  const activeCanSave = canRoleSave(activeFirebaseRole, activeFirebaseSource?.firebaseOwnerUid === user?.uid);
  const selectedGroupLinkedRosters = useMemo(() => rosters.filter((roster) => {
    const source = roster.cloudSource;
    return source?.provider === "firebase" && Boolean(source.firebaseRosterId) && source.firebaseGroupId === selectedGroupId;
  }), [rosters, selectedGroupId]);
  const selectedGroupLinkedRosterIds = useMemo(() => new Set(selectedGroupLinkedRosters.map((roster) => roster.cloudSource?.provider === "firebase" ? roster.cloudSource.firebaseRosterId : undefined).filter(Boolean)), [selectedGroupLinkedRosters]);
  const sharedRosterById = useMemo(() => new Map(sharedRosters.map((roster) => [roster.id, roster])), [sharedRosters]);
  const localRosterHasUnsavedFirebaseChanges = (roster: RoomRoster) => {
    const source = roster.cloudSource;
    if (source?.provider !== "firebase") return false;
    const localTime = Date.parse(roster.updatedAt || roster.createdAt || "");
    const syncedTime = Date.parse(source.lastSyncedAt || "");
    if (!Number.isFinite(localTime)) return false;
    if (!Number.isFinite(syncedTime)) return true;
    return localTime > syncedTime + 1000;
  };
  const selectedGroupChangedLinkedRosters = useMemo(
    () => selectedGroupLinkedRosters.filter(localRosterHasUnsavedFirebaseChanges),
    [selectedGroupLinkedRosters],
  );
  const selectedGroupRemoteUpdatedLinkedRosters = useMemo(
    () => selectedGroupLinkedRosters.filter((roster) => {
      const source = roster.cloudSource;
      if (source?.provider !== "firebase" || !source.firebaseRosterId) return false;
      const remoteSummary = sharedRosterById.get(source.firebaseRosterId);
      const localVersion = typeof source.firebaseVersion === "number" ? source.firebaseVersion : 0;
      return Boolean(remoteSummary && remoteSummary.version > localVersion);
    }),
    [selectedGroupLinkedRosters, sharedRosterById],
  );
  const selectedGroupCanSave = selectedGroupChangedLinkedRosters.some((roster) => {
    const source = roster.cloudSource;
    const role = source?.provider === "firebase" ? source.firebaseRole || (source.firebaseOwnerUid === user?.uid ? "owner" : undefined) : undefined;
    return canRoleSave(role, source?.provider === "firebase" && source.firebaseOwnerUid === user?.uid);
  });
  const canSaveActiveRoster = Boolean(user && selectedGroup && selectedGroupChangedLinkedRosters.length && selectedGroupCanSave && !busy);
  const canRefreshActiveRoster = Boolean(user && selectedGroup && selectedGroupRemoteUpdatedLinkedRosters.length && !busy);
  const collaboratorCount = selectedGroup ? selectedGroup.memberCount + (selectedGroup.pendingInviteEmails?.length || 0) : 0;

  const refreshSharedData = async (nextUser = user) => {
    if (!nextUser) return;
    setBusy("refresh");
    setNotice(null);
    try {
      const [groups, rosters, invites] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters(), listFirebaseGroupInvites()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setIncomingInvites(invites);
      const stillExists = groups.some((group) => group.id === selectedGroupId);
      if (!stillExists) setSelectedGroupId(groups[0]?.id || "");
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (user) void refreshSharedData(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (activeRoster?.id) setSelectedLocalRosterIds([activeRoster.id]);
  }, [activeRoster?.id]);

  const handleCreateGroup = async () => {
    if (!user || busy || !newGroupName.trim()) return;
    setBusy("group");
    setNotice(null);
    try {
      const created = await createFirebaseSharedGroup(newGroupName);
      const groups = await listFirebaseSharedGroups();
      setSharedGroups(groups);
      setSelectedGroupId(created.id);
      setNewGroupName("My group");
      setModal("");
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleDeleteSelectedGroup = async () => {
    if (!selectedGroup || busy) return;
    const ok = window.confirm(`Delete ${selectedGroup.name}? Shared rosters in this group will be removed online.`);
    if (!ok) return;
    setBusy("delete-group");
    setNotice(null);
    try {
      await deleteFirebaseSharedGroup(selectedGroup.id);
      await refreshSharedData();
      setModal("");
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleAddSelectedRosters = async () => {
    if (!user || !selectedGroup || busy) return;
    const picked = rosters.filter((roster) => selectedLocalRosterIds.includes(roster.id) && roster.players.length > 0);
    if (!picked.length) return;
    setBusy("publish");
    setNotice(null);
    try {
      for (const roster of picked) await createFirebaseSharedRoster(roster, selectedGroup.id, selectedGroup.name);
      const [groups, shared] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(shared);
      setModal("");
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleRemoveSharedRoster = async (rosterId: string) => {
    const ok = window.confirm("Remove this shared roster from the group?");
    if (!ok) return;
    setBusy(`delete-roster:${rosterId}`);
    setNotice(null);
    try {
      await deleteFirebaseSharedRoster(rosterId);
      const [groups, shared] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(shared);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleInviteToSelectedGroup = async () => {
    if (!user || !selectedGroup || busy || !inviteEmail.trim()) return;
    setBusy("invite");
    setNotice(null);
    try {
      await inviteEmailToFirebaseSharedGroup(selectedGroup.id, inviteEmail);
      setInviteEmail("");
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleCancelInvite = async (email: string) => {
    if (!selectedGroup || busy) return;
    setBusy(`cancel:${email}`);
    setNotice(null);
    try {
      await cancelFirebaseGroupInvite(selectedGroup.id, email);
      const groups = await listFirebaseSharedGroups();
      setSharedGroups(groups);
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
      const accepted = await acceptFirebaseGroupInvite(groupId);
      await refreshSharedData();
      setSelectedGroupId(accepted.id);
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

  const handleRefreshActiveRoster = async () => {
    if (!user || !selectedGroup || busy) return;
    if (!selectedGroupRemoteUpdatedLinkedRosters.length) {
      setNotice({ tone: "info", text: "Already up to date." });
      return;
    }
    setBusy("reload");
    setNotice(null);
    try {
      let refreshedCount = 0;
      for (const localRoster of selectedGroupRemoteUpdatedLinkedRosters) {
        const rosterId = localRoster.cloudSource?.provider === "firebase" ? localRoster.cloudSource.firebaseRosterId : undefined;
        if (!rosterId) continue;
        const snapshot = await readFirebaseSharedRoster(rosterId);
        onRefreshActiveRoster?.(snapshot.roster, snapshot.name, snapshot, localRoster.id);
        refreshedCount += 1;
      }
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setNotice({ tone: "success", text: refreshedCount === 1 ? "Roster updated." : `${refreshedCount} rosters updated.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleSaveActiveRoster = async () => {
    if (!user || !selectedGroup || busy) return;
    const changedEditableRosters = selectedGroupChangedLinkedRosters.filter((localRoster) => {
      const source = localRoster.cloudSource;
      const role = source?.provider === "firebase" ? source.firebaseRole || (source.firebaseOwnerUid === user.uid ? "owner" : undefined) : undefined;
      return canRoleSave(role, source?.provider === "firebase" && source.firebaseOwnerUid === user.uid);
    });
    if (!changedEditableRosters.length) {
      setNotice({ tone: "info", text: "No changes to save." });
      return;
    }
    setBusy("save");
    setNotice(null);
    try {
      let savedCount = 0;
      let latestGroupId = selectedGroup.id;
      for (const localRoster of changedEditableRosters) {
        const saved = await saveFirebaseSharedRoster(localRoster);
        onRosterSaved?.(saved, localRoster.id);
        savedCount += 1;
        if (saved.groupId) latestGroupId = saved.groupId;
      }
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setSelectedGroupId(latestGroupId);
      setNotice({ tone: "success", text: savedCount === 1 ? "Roster saved." : `${savedCount} rosters saved.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const toggleLocalRoster = (rosterId: string) => {
    setSelectedLocalRosterIds((current) => current.includes(rosterId) ? current.filter((id) => id !== rosterId) : [...current, rosterId]);
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <div className="text-[10px] font-black uppercase tracking-wide text-emerald-600">Shared group</div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              disabled={!user || !sharedGroups.length || Boolean(busy)}
              className="h-11 w-full appearance-none rounded-2xl border border-slate-100 bg-slate-50 px-3 pr-9 text-sm font-black text-[#102A43] outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-50"
            >
              <option value="">No shared group</option>
              {sharedGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
          </div>
          <Button type="button" variant="outline" className="h-11 w-11 rounded-2xl border-slate-100 bg-slate-50 p-0" onClick={() => setModal("groups")} disabled={!user}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

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

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Rosters</div>
          <Button type="button" variant="ghost" className="h-7 rounded-xl px-2 text-[10px] font-black text-emerald-700" onClick={() => setModal("rosters")} disabled={!user || !selectedGroup}>
            Manage
          </Button>
        </div>
        {visibleRosters.length === 0 ? (
          <div className="px-1 py-1 text-[11px] font-bold text-slate-500">No rosters</div>
        ) : (
          <div className="grid gap-1">
            {visibleRosters.slice(0, 8).map((roster) => (
              <button key={roster.id} type="button" onClick={() => handleOpenRoster(roster.id)} disabled={Boolean(busy)} className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left active:scale-[0.99] ${selectedGroupLinkedRosterIds.has(roster.id) ? "bg-emerald-50" : "bg-slate-50"}`}>
                <span className="min-w-0 truncate text-xs font-black text-[#102A43]">{roster.name}</span>
                <span className="shrink-0 truncate text-[10px] font-semibold text-slate-500">saved by {shortName(roster.lastSavedByEmail || roster.ownerEmail)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="h-10 rounded-2xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700" onClick={handleSaveActiveRoster} disabled={!canSaveActiveRoster}>
          <Save className="mr-1.5 h-4 w-4" />
          {busy === "save" ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-100 bg-white text-xs font-black" onClick={handleRefreshActiveRoster} disabled={!canRefreshActiveRoster}>
          <CloudDownload className="mr-1.5 h-4 w-4" />
          {busy === "reload" ? "Getting…" : "Get latest"}
        </Button>
      </div>

      <button type="button" onClick={() => setModal("collaborators")} disabled={!user || !selectedGroup} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-left active:scale-[0.99] disabled:opacity-60">
        <span>
          <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">Collaborators</span>
          <span className="block text-xs font-black text-[#102A43]">{selectedGroup ? `${selectedGroup.memberCount} active${selectedGroup.pendingInviteEmails?.length ? ` · ${selectedGroup.pendingInviteEmails.length} pending` : ""}` : "No group selected"}</span>
        </span>
        <Users className="h-4 w-4 text-emerald-600" />
      </button>

      {notice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      {modal === "groups" && modalShell("Groups", () => setModal(""), (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold outline-none" placeholder="New group name" />
            <Button type="button" className="h-10 rounded-2xl bg-emerald-600 text-xs font-black text-white" onClick={handleCreateGroup} disabled={!newGroupName.trim() || Boolean(busy)}>
              Create group
            </Button>
          </div>
          {sharedGroups.length > 0 && <div className="grid gap-1.5">{sharedGroups.map((group) => (
            <button key={group.id} type="button" onClick={() => { setSelectedGroupId(group.id); setModal(""); }} className={`rounded-2xl px-3 py-2 text-left text-xs font-black ${group.id === selectedGroupId ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-[#102A43]"}`}>{group.name}</button>
          ))}</div>}
          {selectedGroup && selectedGroup.ownerUid === user?.uid && (
            <Button type="button" variant="outline" className="h-10 rounded-2xl border-rose-100 text-xs font-black text-rose-700" onClick={handleDeleteSelectedGroup} disabled={Boolean(busy)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete group
            </Button>
          )}
        </div>
      ))}

      {modal === "rosters" && modalShell("Rosters", () => setModal(""), (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            {rosters.filter((roster) => roster.players.length > 0).map((roster) => (
              <label key={roster.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                <input type="checkbox" checked={selectedLocalRosterIds.includes(roster.id)} onChange={() => toggleLocalRoster(roster.id)} />
                <span className="min-w-0 flex-1 truncate">{roster.name}</span>
                <span className="text-[10px] text-slate-400">{roster.players.length}</span>
              </label>
            ))}
          </div>
          <Button type="button" className="h-10 rounded-2xl bg-emerald-600 text-xs font-black text-white" onClick={handleAddSelectedRosters} disabled={!selectedGroup || !selectedLocalRosterIds.length || Boolean(busy)}>
            Add selected
          </Button>
          {visibleRosters.length > 0 && <div className="grid gap-1.5 border-t border-slate-100 pt-2">{visibleRosters.map((roster) => (
            <div key={roster.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-[#102A43] shadow-sm">
              <span className="min-w-0 truncate">{roster.name}</span>
              <button type="button" onClick={() => handleRemoveSharedRoster(roster.id)} className="rounded-full bg-rose-50 p-1.5 text-rose-600" disabled={Boolean(busy)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}</div>}
        </div>
      ))}

      {modal === "collaborators" && modalShell("Collaborators", () => setModal(""), (
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold outline-none" placeholder="email@example.com" />
            <Button type="button" className="h-10 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white" onClick={handleInviteToSelectedGroup} disabled={!inviteEmail.trim() || Boolean(busy)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="grid gap-1.5">
            {(selectedGroup?.memberEmails || []).map((email) => (
              <div key={email} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-[#102A43]"><span className="truncate">{email}</span><span className="text-[10px] text-emerald-700">active</span></div>
            ))}
            {(selectedGroup?.pendingInviteEmails || []).map((email) => (
              <div key={email} className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                <span className="min-w-0 truncate">{email}</span>
                <button type="button" onClick={() => handleCancelInvite(email)} className="rounded-full bg-white p-1.5 text-amber-700" disabled={Boolean(busy)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {!selectedGroup?.memberEmails?.length && !selectedGroup?.pendingInviteEmails?.length && <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">No collaborators</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
