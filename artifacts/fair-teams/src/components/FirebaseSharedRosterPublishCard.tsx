import React, { useEffect, useMemo, useState } from "react";
import { Check, CloudDownload, CloudUpload, Database, Inbox, ListChecks, Mail, RefreshCw, Save, Share2, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomRoster } from "@/lib/localRoster";
import {
  acceptFirebaseGroupInvite,
  createFirebaseSharedGroup,
  createFirebaseSharedRoster,
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
  isEmptyRoster: boolean;
  onOpenRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
  onRosterSaved?: (summary: FirebaseSharedRosterSummary) => void;
  onRefreshActiveRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
};

function friendlyFirestoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/permission-denied|Missing or insufficient permissions/i.test(message)) {
    return "Firestore rules are still locked. Add the shared group rules in Firebase Console, then try again.";
  }
  if (/network/i.test(message)) return "Network error. Check your connection and try again.";
  if (/saved by someone else|changed elsewhere|Remote version/i.test(message)) {
    return message.replace(/^Firebase:\s*/i, "");
  }
  return message.replace(/^Firebase:\s*/i, "");
}

function formatWhen(value?: string) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

export function FirebaseSharedRosterPublishCard({ activeRoster, isEmptyRoster, onOpenRoster, onRosterSaved, onRefreshActiveRoster }: Props) {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState<"publish" | "refresh" | "save" | "reload" | string>("");
  const [sharedGroups, setSharedGroups] = useState<FirebaseSharedGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [sharedRosters, setSharedRosters] = useState<FirebaseSharedRosterSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FirebaseGroupInvite[]>([]);
  const [groupName, setGroupName] = useState("My Fair Teams group");
  const [inviteEmail, setInviteEmail] = useState("");
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

  const selectedGroup = useMemo(
    () => sharedGroups.find((group) => group.id === selectedGroupId) || null,
    [selectedGroupId, sharedGroups],
  );

  const visibleRosters = useMemo(
    () => selectedGroupId ? sharedRosters.filter((roster) => roster.groupId === selectedGroupId) : sharedRosters,
    [selectedGroupId, sharedRosters],
  );

  const refreshSharedData = async (nextUser = user) => {
    if (!nextUser) return;
    setBusy("refresh");
    setNotice(null);
    try {
      const [groups, rosters, invites] = await Promise.all([
        listFirebaseSharedGroups(),
        listFirebaseSharedRosters(),
        listFirebaseGroupInvites(),
      ]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setIncomingInvites(invites);
      if (!selectedGroupId && groups[0]) {
        setSelectedGroupId(groups[0].id);
      }
      setNotice({ tone: "info", text: `${groups.length ? `Found ${groups.length} shared group${groups.length === 1 ? "" : "s"}` : "No shared groups yet"} · ${rosters.length} roster${rosters.length === 1 ? "" : "s"}${invites.length ? ` · ${invites.length} group invite${invites.length === 1 ? "" : "s"}` : ""}.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (user) {
      void refreshSharedData(user);
    }
    // Intentionally refresh when the signed-in Firebase user changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleCreateGroup = async () => {
    if (!user || busy) return;
    setBusy("group");
    setNotice(null);
    try {
      const created = await createFirebaseSharedGroup(groupName);
      const groups = await listFirebaseSharedGroups();
      setSharedGroups(groups);
      setSelectedGroupId(created.id);
      setNotice({ tone: "success", text: `Created shared group: ${created.name}. Add rosters inside this group, then invite co-organizers once.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleInviteToSelectedGroup = async () => {
    const groupId = selectedGroupId || activeRoster?.cloudSource?.firebaseGroupId;
    if (!user || !groupId || busy) return;
    setBusy("invite");
    setNotice(null);
    try {
      await inviteEmailToFirebaseSharedGroup(groupId, inviteEmail);
      const invitedEmail = inviteEmail.trim().toLowerCase();
      setInviteEmail("");
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setNotice({ tone: "success", text: `Invite saved for ${invitedEmail}. They can sign in and accept the group invite inside Fair Teams.` });
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
      const [groups, rosters, invites] = await Promise.all([
        listFirebaseSharedGroups(),
        listFirebaseSharedRosters(),
        listFirebaseGroupInvites(),
      ]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      setIncomingInvites(invites);
      setSelectedGroupId(accepted.id);
      setNotice({ tone: "success", text: `Accepted invite to ${accepted.name}. Its shared rosters are now available in Fair Teams.` });
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
      setNotice({ tone: "success", text: `Opened ${snapshot.groupName ? `${snapshot.groupName} · ` : ""}${snapshot.name} as a linked local copy. Save changes when you want to update the shared roster.` });
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
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      if (snapshot.groupId) setSelectedGroupId(snapshot.groupId);
      setNotice({ tone: "success", text: `Got latest ${snapshot.groupName ? `${snapshot.groupName} · ` : ""}${snapshot.name} from shared roster version ${snapshot.version}.` });
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
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      if (saved.groupId) setSelectedGroupId(saved.groupId);
      setNotice({ tone: "success", text: `Saved ${saved.groupName ? `${saved.groupName} · ` : ""}${saved.name} to version ${saved.version}. Group members can use Get latest to see this update.` });
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
      const created = await createFirebaseSharedRoster(activeRoster, selectedGroupId || undefined, groupName);
      const [groups, rosters] = await Promise.all([listFirebaseSharedGroups(), listFirebaseSharedRosters()]);
      setSharedGroups(groups);
      setSharedRosters(rosters);
      if (created.groupId) setSelectedGroupId(created.groupId);
      setNotice({ tone: "success", text: `Created ${created.groupName ? `${created.groupName} · ` : ""}${created.name}. Open it as a linked copy before saving edits back online.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const disabledReason = !authReady
    ? "Checking Firebase sign-in…"
    : !user
      ? "Sign in above to create or join shared groups."
      : !activeRoster
        ? "No active roster found."
        : isEmptyRoster
          ? "Add players before creating a shared roster."
          : "Ready to add this roster to a shared group.";

  const activeFirebaseSource = activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource : null;
  const activeFirebaseRole = activeFirebaseSource?.firebaseRole || (activeFirebaseSource?.firebaseOwnerUid === user?.uid ? "owner" : activeFirebaseSource?.firebaseRosterId ? "editor" : undefined);
  const activeCanSave = canRoleSave(activeFirebaseRole, activeFirebaseSource?.firebaseOwnerUid === user?.uid);
  const canSaveActiveRoster = Boolean(user && activeRoster && activeFirebaseSource?.firebaseRosterId && activeCanSave && !busy);
  const canRefreshActiveRoster = Boolean(user && activeRoster && activeFirebaseSource?.firebaseRosterId && !busy);
  const canInviteToGroup = Boolean(user && (selectedGroupId || activeFirebaseSource?.firebaseGroupId) && !busy);

  return (
    <div className="grid gap-3 rounded-3xl border border-violet-100 bg-violet-50/60 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-2xl bg-white p-2 text-violet-700 shadow-sm">
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-wide text-violet-700">
            Shared groups
          </div>
          <div className="mt-0.5 text-sm font-black tracking-tight text-[#102A43]">
            Groups, organizers, and rosters
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
            Build collaboration around real groups like LazyLousy Berlin or Nicole’s Classes. Invite organizers once, then share rosters inside the group.
          </p>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl bg-white/75 p-2">
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
          <Users className="h-3.5 w-3.5" />
          Create or choose group
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="LazyLousy Berlin"
            className="h-10 rounded-2xl border border-violet-100 bg-white px-3 text-xs font-bold text-[#102A43] outline-none placeholder:text-slate-300 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            disabled={!user || Boolean(busy)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start rounded-2xl gap-1.5 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50"
            onClick={handleCreateGroup}
            disabled={!user || !groupName.trim() || Boolean(busy)}
          >
            <Users className="h-3.5 w-3.5" />
            {busy === "group" ? "Creating…" : "Create group"}
          </Button>
        </div>
        {sharedGroups.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto px-1 pb-1">
            {sharedGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black shadow-sm ${selectedGroupId === group.id ? "bg-violet-600 text-white" : "bg-white text-violet-700"}`}
              >
                {group.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          Selected group
        </div>
        <div className="mt-0.5 truncate text-xs font-black text-[#102A43]">
          {selectedGroup?.name || "No shared group selected"}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
          {selectedGroup
            ? `${labelRole(selectedGroup.currentUserRole, selectedGroup.ownerUid === user?.uid)} · ${selectedGroup.memberCount} member${selectedGroup.memberCount === 1 ? "" : "s"} · ${selectedGroup.rosterCount} roster${selectedGroup.rosterCount === 1 ? "" : "s"}${selectedGroup.lastSavedByEmail ? ` · Last saved by ${selectedGroup.lastSavedByEmail}` : ""}`
            : "Create a group first, or accept a group invite."}
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          Active local roster
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
          {busy === "publish" ? "Adding…" : selectedGroup ? "Add roster to selected group" : "Create group + add roster"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start rounded-2xl gap-2 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50"
          onClick={handleSaveActiveRoster}
          disabled={!canSaveActiveRoster}
        >
          <Save className="h-4 w-4" />
          {busy === "save" ? "Saving…" : activeCanSave ? "Save changes to group roster" : "View-only — cannot save"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start rounded-2xl gap-2 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50 sm:col-span-2"
          onClick={handleRefreshActiveRoster}
          disabled={!canRefreshActiveRoster}
        >
          <CloudDownload className="h-4 w-4" />
          {busy === "reload" ? "Refreshing…" : "Get latest from group roster"}
        </Button>
      </div>

      <div className={`rounded-2xl border px-3 py-2 ${activeFirebaseSource?.firebaseRosterId ? "border-emerald-100 bg-emerald-50/80" : "border-white/70 bg-white/75"}`}>
        <div className={`text-[10px] font-black uppercase tracking-wide ${activeFirebaseSource?.firebaseRosterId ? "text-emerald-700" : "text-slate-400"}`}>
          {activeFirebaseSource?.firebaseRosterId ? "Linked group roster" : "Local-only roster"}
        </div>
        <div className="mt-1 text-[11px] font-bold leading-snug text-slate-600">
          {activeFirebaseSource?.firebaseRosterId
            ? `${activeFirebaseSource.firebaseGroupName ? `${activeFirebaseSource.firebaseGroupName} · ` : ""}Version ${activeFirebaseSource.firebaseVersion || 1} · ${labelRole(activeFirebaseRole, activeFirebaseSource.firebaseOwnerUid === user?.uid)}${activeFirebaseSource.firebaseLastSavedByEmail ? ` · Last saved by ${activeFirebaseSource.firebaseLastSavedByEmail}` : ""}. Save checks the remote version before overwriting.`
            : "Create or open a group roster before using save, refresh, or invites."}
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl bg-white/75 p-2">
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
          <UserPlus className="h-3.5 w-3.5" />
          Invite co-organizer to group
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="sarah@example.com"
            className="h-10 rounded-2xl border border-violet-100 bg-white px-3 text-xs font-bold text-[#102A43] outline-none placeholder:text-slate-300 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            disabled={!canInviteToGroup}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start rounded-2xl gap-1.5 border-violet-200 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50"
            onClick={handleInviteToSelectedGroup}
            disabled={!canInviteToGroup || !inviteEmail.trim()}
          >
            <Mail className="h-3.5 w-3.5" />
            {busy === "invite" ? "Inviting…" : "Invite"}
          </Button>
        </div>
        <div className="px-1 text-[10px] font-semibold leading-snug text-slate-500">
          Invites now belong to the group. Sarah accepts once, then sees all rosters inside that group.
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl bg-white/75 p-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <Inbox className="h-3.5 w-3.5" />
            Group invites for me
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 rounded-xl px-2 text-[10px] font-black text-violet-700"
            onClick={() => refreshSharedData()}
            disabled={!user || Boolean(busy)}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`} />
            Check
          </Button>
        </div>

        {!user ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            Sign in above to check invites.
          </div>
        ) : incomingInvites.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            No pending group invites for this email.
          </div>
        ) : (
          <div className="grid gap-1.5">
            {incomingInvites.slice(0, 4).map((invite) => (
              <div key={invite.id} className="grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#102A43]">
                    <Mail className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate">{invite.name}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-emerald-700">group invite</span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    From {invite.ownerEmail || "owner"} · {invite.rosterCount} roster{invite.rosterCount === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 justify-start rounded-xl gap-1.5 border-emerald-100 bg-white px-2 text-[10px] font-black text-emerald-700"
                  onClick={() => handleAcceptInvite(invite.id)}
                  disabled={!user || Boolean(busy)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {busy === `accept:${invite.id}` ? "Accepting…" : "Accept group invite"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 rounded-2xl bg-white/75 p-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <ListChecks className="h-3.5 w-3.5" />
            Rosters in selected group
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 rounded-xl px-2 text-[10px] font-black text-violet-700"
            onClick={() => refreshSharedData()}
            disabled={!user || Boolean(busy)}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {!user ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            Sign in above to list group rosters.
          </div>
        ) : visibleRosters.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            No rosters in this group yet.
          </div>
        ) : (
          <div className="grid gap-1.5">
            {visibleRosters.slice(0, 6).map((roster) => (
              <div key={roster.id} className="grid gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#102A43]">
                    <Share2 className="h-3.5 w-3.5 text-violet-600" />
                    <span className="min-w-0 flex-1 truncate">{roster.name}</span>
                    <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">{labelRole(roster.currentUserRole, roster.ownerUid === user?.uid).toLowerCase()}</span>
                    <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">v{roster.version}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    {roster.groupName ? `${roster.groupName} · ` : ""}{roster.playerCount} player{roster.playerCount === 1 ? "" : "s"} · {formatWhen(roster.updatedAt)}{roster.lastSavedByEmail ? ` · saved by ${roster.lastSavedByEmail}` : ""}
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
                  {busy === `open:${roster.id}` ? "Opening…" : "Open linked copy"}
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
