import React, { useEffect, useMemo, useState } from "react";
import { CloudDownload, FolderOpen, Save, Share2, Trash2, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RoomRoster } from "@/lib/localRoster";
import {
  acceptFirebaseGroupInvite,
  cancelFirebaseGroupInvite,
  createFirebaseSharedRoster,
  deleteFirebaseSharedRoster,
  inviteEmailToFirebaseSharedGroup,
  listenToSharedRosterUser,
  removeFirebaseSharedGroupMember,
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
  variant?: "full" | "compact";
  activeRoster: RoomRoster | undefined;
  rosters?: RoomRoster[];
  isEmptyRoster: boolean;
  onOpenRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
  onRosterSaved?: (summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onRefreshActiveRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onSharedRosterSummariesUpdated?: (summaries: FirebaseSharedRosterSummary[]) => void;
  onSharedInviteOpened?: (roster: RoomRoster) => void;
  openLibraryToken?: number;
};

function friendlyFirestoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/permission-denied|Missing or insufficient permissions/i.test(message)) return "Permission denied.";
  if (/network/i.test(message)) return "Network error.";
  if (/saved by someone else|changed elsewhere|Remote version/i.test(message)) return "Saved elsewhere. Get latest first.";
  return message.replace(/^Firebase:\s*/i, "");
}

function fallbackNameFromEmail(email?: string) {
  if (!email) return "—";
  const prefix = email.split("@")[0] || email;
  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w/g, (char) => char.toUpperCase()) || email;
}

function displayNameForEmail(email: string | undefined, memberNamesByEmail?: Record<string, string>, currentUserEmail?: string) {
  if (!email) return "—";
  const normalized = email.trim().toLowerCase();
  if (currentUserEmail && normalized === currentUserEmail.trim().toLowerCase()) return "You";
  const savedName = memberNamesByEmail?.[normalized] || memberNamesByEmail?.[email];
  return savedName || fallbackNameFromEmail(email);
}

function mergedMemberNames(group?: FirebaseSharedGroupSummary | null, roster?: FirebaseSharedRosterSummary | null) {
  return {
    ...(roster?.memberNamesByEmail || {}),
    ...(group?.memberNamesByEmail || {}),
  };
}

function canRoleSave(role?: string, isOwner?: boolean) {
  return role === "editor" || role === "owner" || Boolean(isOwner);
}

function modalShell(title: string, onClose: () => void, body: React.ReactNode) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-h-[86svh] max-w-md overflow-y-auto rounded-3xl border border-slate-100 p-3 shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
        <DialogHeader className="px-1 pb-1 text-left">
          <DialogTitle className="text-sm font-black text-[#102A43]">{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

export function FirebaseSharedRosterPublishCard({ variant = "full", activeRoster, rosters = [], isEmptyRoster, onOpenRoster, onRosterSaved, onRefreshActiveRoster, onSharedRosterSummariesUpdated, onSharedInviteOpened, openLibraryToken = 0 }: Props) {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [sharedGroups, setSharedGroups] = useState<FirebaseSharedGroupSummary[]>([]);
  const [sharedRosters, setSharedRosters] = useState<FirebaseSharedRosterSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FirebaseGroupInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [collaboratorRosterId, setCollaboratorRosterId] = useState("");
  const [sharedRosterLibraryOpen, setSharedRosterLibraryOpen] = useState(false);
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

  useEffect(() => {
    if (openLibraryToken <= 0) return;
    setSharedRosterLibraryOpen(true);
  }, [openLibraryToken]);

  const handleShareActiveRoster = async () => {
    if (!user || !activeRoster || isEmptyRoster || busy) return;
    const confirmed = window.confirm(
      `Create a shared copy of ${activeRoster.name || "this roster"}?

Your local roster will stay local. Fair Teams will create a separate shared roster for organizers and open that shared copy on this device.`,
    );
    if (!confirmed) return;

    setBusy("publish");
    setNotice(null);
    try {
      const created = await createFirebaseSharedRoster(activeRoster, undefined, activeRoster.name || "Shared roster");
      onOpenRoster?.(activeRoster, activeRoster.name || created.name || "Shared roster", created);
      await refreshSharedData();
      setNotice({ tone: "success", text: "Shared copy created. Your local roster stayed local." });
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

  const handleRemoveSharedRoster = async (rosterId: string, rosterName = "this shared roster") => {
    const typed = window.prompt(
      `Delete “${rosterName}” online for everyone?\n\nThis is different from removing a local copy from this device. The shared roster will disappear for all organizers.\n\nType DELETE to confirm.`,
    );
    if (typed !== "DELETE") {
      if (typed !== null) setNotice({ tone: "info", text: "Online shared roster was not deleted." });
      return;
    }
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

  const canManageCollaborators = collaboratorGroup?.currentUserRole === "owner"
    || collaboratorGroup?.currentUserRole === "editor"
    || collaboratorRoster?.currentUserRole === "owner"
    || collaboratorRoster?.currentUserRole === "editor";

  const handleRemoveCollaborator = async (email: string) => {
    const groupId = collaboratorGroup?.id || collaboratorRoster?.groupId;
    if (!groupId) {
      setNotice({ tone: "error", text: "This older shared roster is missing its group link." });
      return;
    }
    const ok = window.confirm(`Remove ${email} from this shared roster?`);
    if (!ok) return;
    setBusy(`remove:${email}`);
    setNotice(null);
    try {
      await removeFirebaseSharedGroupMember(groupId, email);
      await refreshSharedData();
      setNotice({ tone: "success", text: "Collaborator removed." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const collaboratorsModal = collaboratorRoster ? modalShell("People", () => setCollaboratorRosterId(""), (
    <div className="grid gap-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold outline-none" placeholder="email@example.com" />
        <Button type="button" className="h-10 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white" onClick={handleInvite} disabled={!inviteEmail.trim() || Boolean(busy)}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="grid gap-1.5">
        {canManageCollaborators && (
          <div className="rounded-2xl bg-violet-50 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
            Add organizers here. Remove is available for non-owner collaborators.
          </div>
        )}
        {(() => {
          const memberNamesByEmail = mergedMemberNames(collaboratorGroup, collaboratorRoster);
          const memberEmails = collaboratorGroup?.memberEmails || collaboratorRoster.memberEmails || [];
          const pendingEmails = collaboratorGroup?.pendingInviteEmails || collaboratorRoster.pendingInviteEmails || [];
          return (
            <>
              {memberEmails.map((email) => {
                const normalizedEmail = email.trim().toLowerCase();
                const label = displayNameForEmail(email, memberNamesByEmail, user?.email);
                const isOwnerEmail = normalizedEmail === (collaboratorRoster.ownerEmail || "").trim().toLowerCase();
                const isCurrentUser = normalizedEmail === (user?.email || "").trim().toLowerCase();
                const canRemoveThisMember = canManageCollaborators && !isOwnerEmail && !isCurrentUser;
                return (
                  <div key={email} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                    <div className="min-w-0">
                      <div className="truncate">{label}</div>
                      <div className="truncate text-[10px] text-slate-500">{email}</div>
                    </div>
                    {canRemoveThisMember ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveCollaborator(email)}
                        disabled={Boolean(busy)}
                        className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-rose-600 shadow-sm disabled:opacity-50"
                      >
                        {busy === `remove:${email}` ? "…" : "Remove"}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px] text-emerald-700">{isOwnerEmail ? "owner" : isCurrentUser ? "you" : "active"}</span>
                    )}
                  </div>
                );
              })}
              {pendingEmails.map((email) => (
                <div key={email} className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                  <div className="min-w-0">
                    <div className="truncate">{displayNameForEmail(email, memberNamesByEmail, user?.email)}</div>
                    <div className="truncate text-[10px] text-amber-700">Pending · {email}</div>
                  </div>
                  <button type="button" onClick={() => handleCancelInvite(email)} className="rounded-full bg-white p-1.5 text-amber-700" disabled={Boolean(busy)}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </>
          );
        })()}
      </div>
    </div>
  )) : null;


  const sharedRosterLibraryModal = sharedRosterLibraryOpen ? modalShell(
    "Shared rosters",
    () => setSharedRosterLibraryOpen(false),
    <div className="grid gap-2">
      {!user ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold leading-snug text-slate-500">
          Sign in to open shared rosters.
        </div>
      ) : sharedRosters.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold leading-snug text-slate-500">
          No online shared rosters found for this account yet.
        </div>
      ) : (
        <>
          {linkedRosters.length === 0 ? (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
No shared roster is open on this device. Choose one below to open it on this device.
            </div>
          ) : null}
          <div className="grid max-h-[52svh] gap-1.5 overflow-y-auto pr-1">
            {sharedRosters.map((roster) => {
              const group = sharedGroups.find((item) => item.id === roster.groupId);
              const collaboratorCount = group ? Math.max(0, group.memberCount - 1) + (group.pendingInviteEmails?.length || 0) : Math.max(0, (roster.memberEmails?.length || 1) - 1) + (roster.pendingInviteEmails?.length || 0);
              const linked = linkedRosters.some((local) => local.cloudSource?.provider === "firebase" && local.cloudSource.firebaseRosterId === roster.id);
              const isOwner = roster.ownerUid === user?.uid;
              const showOnlineDelete = isOwner;
              const memberNamesByEmail = mergedMemberNames(group, roster);
              const savedByName = displayNameForEmail(roster.lastSavedByEmail || roster.ownerEmail, memberNamesByEmail, user?.email);
              return (
                <div key={`modal-${roster.id}`} className={`grid ${showOnlineDelete ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-emerald-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => { void handleOpenRoster(roster.id); setSharedRosterLibraryOpen(false); }} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{roster.name}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">{linked ? "Open on this device" : "Open shared roster"} · saved by {savedByName}</span>
                  </button>
                  <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl border border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm hover:bg-violet-50">
                    <Users className="h-3.5 w-3.5" />
                    {collaboratorCount}
                  </button>
                  {showOnlineDelete && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSharedRoster(roster.id, roster.name)}
                      className="flex h-8 items-center gap-1 rounded-xl border border-rose-100 bg-white px-2 text-[10px] font-black text-rose-600 shadow-sm hover:bg-rose-50"
                      disabled={Boolean(busy)}
                      title="Delete online for everyone"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Online delete</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>,
  ) : null;


  if (variant === "compact") {
    return (
      <div className="grid gap-2">
        {incomingInvites.length > 0 && (
          <div className="grid gap-1.5">
            {incomingInvites.slice(0, 2).map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2">
                <div className="min-w-0 truncate text-xs font-black text-[#102A43]">Invite: {invite.name}</div>
                <Button type="button" variant="outline" className="h-8 rounded-xl border-emerald-100 bg-white px-2 text-[10px] font-black text-emerald-700" onClick={() => handleAcceptInvite(invite.id)} disabled={Boolean(busy)}>
                  {busy === `accept:${invite.id}` ? "…" : "Accept"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {updateCount > 0 && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] font-bold text-amber-800">
            {updateCount === 1 ? "1 update available." : `${updateCount} updates available.`}
          </div>
        )}

        <Button type="button" variant="outline" className="h-10 rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50" onClick={() => setSharedRosterLibraryOpen(true)} disabled={!user || Boolean(busy)}>
          <FolderOpen className="mr-1.5 h-4 w-4" />
          Shared rosters
        </Button>

        {!activeSharedRoster ? (
          <Button type="button" className="h-10 rounded-2xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700" onClick={handleShareActiveRoster} disabled={!user || isEmptyRoster || Boolean(busy)}>
            <Share2 className="mr-1.5 h-4 w-4" />
            {busy === "publish" ? "Creating…" : "Create shared copy"}
          </Button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" className="h-10 rounded-2xl bg-emerald-600 px-2 text-xs font-black text-white hover:bg-emerald-700" onClick={handleSaveActiveRoster} disabled={!user || !activeCanSave || !activeHasLocalChanges || Boolean(busy)}>
              <Save className="mr-1 h-4 w-4" />
              {busy === "save" ? "…" : "Save"}
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-100 bg-white px-2 text-xs font-black" onClick={handleGetLatest} disabled={!user || !remoteUpdatedLinkedRosters.length || Boolean(busy)}>
              <CloudDownload className="mr-1 h-4 w-4" />
              {busy === "reload" ? "…" : "Latest"}
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-2xl border-violet-100 bg-white px-2 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50" onClick={() => openCollaborators(activeSharedRosterId)} disabled={!user || Boolean(busy)}>
              <Users className="mr-1 h-4 w-4" />
              People
            </Button>
          </div>
        )}

        {notice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}
        {sharedRosterLibraryModal}
        {collaboratorsModal}
      </div>
    );
  }
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
          {busy === "publish" ? "Creating…" : "Create shared copy"}
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
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-snug text-slate-500">
            No online shared rosters found for this account. If you just removed a local copy, make sure you are signed in with the same organizer account.
          </div>
        ) : (
          <>
            {linkedRosters.length === 0 ? (
              <div className="mb-2 rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
No shared roster is open on this device. Choose an online shared roster below to open it here.
              </div>
            ) : null}
            <div className="grid gap-1.5">
            {sharedRosters.slice(0, 10).map((roster) => {
              const group = sharedGroups.find((item) => item.id === roster.groupId);
              const collaboratorCount = group ? Math.max(0, group.memberCount - 1) + (group.pendingInviteEmails?.length || 0) : Math.max(0, (roster.memberEmails?.length || 1) - 1) + (roster.pendingInviteEmails?.length || 0);
              const linked = linkedRosters.some((local) => local.cloudSource?.provider === "firebase" && local.cloudSource.firebaseRosterId === roster.id);
              const isOwner = roster.ownerUid === user?.uid;
              const showOnlineDelete = variant === "full" && isOwner;
              const memberNamesByEmail = mergedMemberNames(group, roster);
              const savedByName = displayNameForEmail(roster.lastSavedByEmail || roster.ownerEmail, memberNamesByEmail, user?.email);
              return (
                <div key={roster.id} className={`grid ${showOnlineDelete ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-emerald-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => handleOpenRoster(roster.id)} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{roster.name}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">saved by {savedByName}</span>
                  </button>
                  <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl border border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm hover:bg-violet-50">
                    <Users className="h-3.5 w-3.5" />
                    {collaboratorCount}
                  </button>
                  {showOnlineDelete && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSharedRoster(roster.id, roster.name)}
                      className="flex h-8 items-center gap-1 rounded-xl border border-rose-100 bg-white px-2 text-[10px] font-black text-rose-600 shadow-sm hover:bg-rose-50"
                      disabled={Boolean(busy)}
                      title="Delete online for everyone"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Online delete</span>
                    </button>
                  )}
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      {notice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

{collaboratorsModal}
    </div>
  );
}
