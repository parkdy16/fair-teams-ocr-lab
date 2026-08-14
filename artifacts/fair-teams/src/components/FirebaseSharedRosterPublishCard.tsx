import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FolderOpen, History, Loader2, Mail, RotateCcw, Share2, ShieldCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StripesConfirmContent } from "@/components/ui/stripes-modal";
import type { RoomRoster } from "@/lib/localRoster";
import {
  createFirebaseSharedRoster,
  listenToFirebaseSharedRoster,
  listenToSharedRosterUser,
  listFirebaseSharedGroups,
  listFirebaseSharedRosters,
  listFirebaseSharedRosterBackups,
  readFirebaseSharedRoster,
  restoreFirebaseSharedRosterBackup,
  saveFirebaseSharedRoster,
  type FirebaseSharedRosterBackup,
  type FirebaseSharedGroupSummary,
  type FirebaseSharedRosterSummary,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import {
  acceptWorkspaceOrganizerInvitation,
  cancelWorkspaceOrganizerInvitation,
  createWorkspaceOrganizerInvitation,
  listWorkspaceRecipientInvitations,
  listWorkspaceOrganizerInvitations,
  resendWorkspaceOrganizerInvitation,
  type WorkspaceRecipientInvitation,
  type WorkspaceOrganizerInvitation,
} from "@/lib/sharedWorkspaceInvitationService";
import {
  reloadAndRefreshStripesAuthIdentity,
  sendStripesEmailVerification,
  workspaceInvitationSenderStatus,
} from "@/lib/sharedWorkspaceInvitationAuth";
import {
  castOrganizerRemovalBallot,
  getOrganizerRemovalParticipation,
  listenToOrganizerRemovalProposal,
  listenToOrganizerRemovalProposals,
  startOrganizerRemovalProposal,
  type OrganizerRemovalBallotChoice,
  type OrganizerRemovalParticipation,
  type OrganizerRemovalProposal,
} from "@/lib/sharedWorkspaceGovernanceService";
import { resolveWorkspaceInvitationManagementGroupId } from "@/lib/workspaceInvitationOnboardingState";

type Props = {
  variant?: "full" | "compact";
  activeRoster: RoomRoster | undefined;
  rosters?: RoomRoster[];
  isEmptyRoster: boolean;
  onOpenRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
  onRosterSaved?: (summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onRefreshActiveRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onRefreshRosterIdentity?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onSharedRosterSummariesUpdated?: (summaries: FirebaseSharedRosterSummary[]) => void;
  onSharedInviteOpened?: (roster: RoomRoster) => void;
  openLibraryToken?: number;
  onMakePrivateCopy?: () => void;
  onHideOnDevice?: () => void;
  backgroundSync?: boolean;
  headless?: boolean;
};

function friendlyFirestoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/permission-denied|Missing or insufficient permissions/i.test(message)) return "Permission denied.";
  if (/network/i.test(message)) return "Network error.";
  if (/saved by someone else|changed elsewhere|Remote version/i.test(message)) return "Online roster changed. Stripes will update and try again.";
  return message.replace(/^Firebase:\s*/i, "");
}

function friendlyInvitationVerificationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/auth\/network-request-failed|network/i.test(message)) return "Network error. Check your connection and try again.";
  if (/auth\/too-many-requests|resource-exhausted/i.test(message)) return "Too many attempts. Try again later.";
  if (/auth\/invalid-user-token|auth\/user-token-expired/i.test(message)) return "Sign in again before verifying your email.";
  return "Stripes could not complete email verification. Try again.";
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

function canRoleSave(role?: string) {
  return role === "organizer" || role === "editor" || role === "owner";
}

function modalShell(title: string, onClose: () => void, body: React.ReactNode) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent
        className="max-h-[86svh] max-w-md overflow-y-auto rounded-3xl border border-slate-100 p-3 shadow-[0_14px_40px_rgba(15,23,42,0.16)]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-1 pb-1 text-left">
          <DialogTitle className="text-sm font-black text-[#102A43]">{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

export function FirebaseSharedRosterPublishCard({ variant = "full", activeRoster, rosters = [], isEmptyRoster, onOpenRoster, onRosterSaved, onRefreshActiveRoster, onRefreshRosterIdentity, onSharedRosterSummariesUpdated, onSharedInviteOpened, openLibraryToken = 0, onMakePrivateCopy, onHideOnDevice, backgroundSync = true, headless = false }: Props) {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [sharedGroups, setSharedGroups] = useState<FirebaseSharedGroupSummary[]>([]);
  const [sharedRosters, setSharedRosters] = useState<FirebaseSharedRosterSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<WorkspaceRecipientInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [workspaceInvitations, setWorkspaceInvitations] = useState<WorkspaceOrganizerInvitation[]>([]);
  const [invitationListGroupId, setInvitationListGroupId] = useState("");
  const [invitationLoadError, setInvitationLoadError] = useState("");
  const [collaboratorRosterId, setCollaboratorRosterId] = useState("");
  const [sharedRosterLibraryOpen, setSharedRosterLibraryOpen] = useState(false);
  const [backupRosterId, setBackupRosterId] = useState("");
  const [sharedRosterBackups, setSharedRosterBackups] = useState<FirebaseSharedRosterBackup[]>([]);
  const [removalProposals, setRemovalProposals] = useState<OrganizerRemovalProposal[]>([]);
  const [removalParticipation, setRemovalParticipation] = useState<OrganizerRemovalParticipation | null>(null);
  const [removalError, setRemovalError] = useState("");
  const [senderVerificationNotice, setSenderVerificationNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [invitationNotice, setInvitationNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState<
    | { kind: "propose"; targetEmail: string; targetName: string }
    | { kind: "ballot"; proposalId: string; targetName: string; choice: OrganizerRemovalBallotChoice }
    | null
  >(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<"idle" | "saving" | "saved" | "syncing" | "error">("idle");
  const lastLiveRosterVersionRef = useRef(0);
  const senderInvitationStatus = workspaceInvitationSenderStatus(user);

  useEffect(() => listenToSharedRosterUser((nextUser) => {
    setUser(nextUser);
    if (!nextUser) {
      setSharedGroups([]);
      setSharedRosters([]);
      setIncomingInvites([]);
      setWorkspaceInvitations([]);
      setInvitationListGroupId("");
      setInvitationLoadError("");
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
    () => sharedGroups.find((group) => group.id === collaboratorRoster?.groupId)
      || (collaboratorRoster?.id === activeSharedRosterId ? activeGroup : null),
    [sharedGroups, collaboratorRoster?.groupId, collaboratorRoster?.id, activeSharedRosterId, activeGroup],
  );
  const collaboratorGroupId = resolveWorkspaceInvitationManagementGroupId({
    loadedGroupId: collaboratorGroup?.id,
    rosterGroupId: collaboratorRoster?.groupId,
    sourceGroupId: collaboratorRoster?.id === activeSharedRosterId
      ? activeFirebaseSource?.firebaseGroupId
      : null,
  });
  const activeRemovalProposal = useMemo(
    () => removalProposals.find((proposal) => proposal.status === "open") || null,
    [removalProposals],
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
  const activeRole = activeFirebaseSource?.firebaseRole || activeSharedRoster?.currentUserRole;
  const activeCanSave = canRoleSave(activeRole);
  const activeHasLocalChanges = (() => {
    if (!activeRoster || !activeFirebaseSource) return false;
    const localTime = Date.parse(activeRoster.updatedAt || activeRoster.createdAt || "");
    const syncedTime = Date.parse(activeFirebaseSource.lastSyncedAt || "");
    if (!Number.isFinite(localTime)) return false;
    if (!Number.isFinite(syncedTime)) return true;
    return localTime > syncedTime;
  })();
  const autoStatusText = activeSharedRoster
    ? autoSyncStatus === "saving"
      ? "Saving online…"
      : autoSyncStatus === "syncing"
        ? "Live update received…"
        : autoSyncStatus === "error"
          ? "Couldn’t update online."
          : activeHasLocalChanges
            ? "Saving online…"
            : "Live · saved online"
    : "";
  const AutoStatusIcon = autoSyncStatus === "saving" || autoSyncStatus === "syncing" || activeHasLocalChanges ? Loader2 : CheckCircle2;

  const refreshSharedData = async () => {
    if (!user) return;
    setBusy((current) => current || "refresh");
    try {
      const [groups, rosters, invites] = await Promise.all([
        listFirebaseSharedGroups(),
        listFirebaseSharedRosters(),
        listWorkspaceRecipientInvitations().catch(() => []),
      ]);
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

  const refreshWorkspaceInvitations = async (groupId: string) => {
    const invitations = await listWorkspaceOrganizerInvitations(groupId);
    setWorkspaceInvitations(invitations);
    setInvitationListGroupId(groupId);
    setInvitationLoadError("");
  };

  useEffect(() => {
    const groupId = collaboratorGroupId;
    const role = collaboratorGroup?.currentUserRole || collaboratorRoster?.currentUserRole;
    if (!user || senderInvitationStatus !== "ready" || !groupId || !collaboratorRosterId || !canRoleSave(role)) {
      setWorkspaceInvitations([]);
      setInvitationListGroupId("");
      setInvitationLoadError("");
      return;
    }
    let cancelled = false;
    void listWorkspaceOrganizerInvitations(groupId)
      .then((invitations) => {
        if (cancelled) return;
        setWorkspaceInvitations(invitations);
        setInvitationListGroupId(groupId);
        setInvitationLoadError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setInvitationLoadError(friendlyFirestoreError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [
    user,
    senderInvitationStatus,
    collaboratorGroupId,
    collaboratorGroup?.currentUserRole,
    collaboratorRoster?.currentUserRole,
    collaboratorRosterId,
  ]);

  useEffect(() => {
    const groupId = collaboratorGroup?.id;
    if (!user || !groupId || !collaboratorRosterId) {
      setRemovalProposals([]);
      setRemovalParticipation(null);
      setRemovalError("");
      return;
    }
    setRemovalError("");
    return listenToOrganizerRemovalProposals(groupId, setRemovalProposals, (error) => {
      setRemovalError(friendlyFirestoreError(error));
    });
  }, [user, collaboratorGroup?.id, collaboratorRosterId]);

  useEffect(() => {
    const groupId = collaboratorGroup?.id;
    const proposalId = activeRemovalProposal?.id;
    if (!user || !groupId || !proposalId || !collaboratorRosterId) return;
    return listenToOrganizerRemovalProposal(groupId, proposalId, (proposal) => {
      if (!proposal) return;
      setRemovalError("");
      setRemovalProposals((current) => [proposal, ...current.filter((item) => item.id !== proposal.id)]);
    }, (error) => {
      setRemovalError(friendlyFirestoreError(error));
    });
  }, [user, collaboratorGroup?.id, collaboratorRosterId, activeRemovalProposal?.id]);

  useEffect(() => {
    const groupId = collaboratorGroup?.id;
    if (!user || !groupId || !activeRemovalProposal || activeRemovalProposal.status !== "open") {
      setRemovalParticipation(null);
      return;
    }
    const proposalId = activeRemovalProposal.id;
    let cancelled = false;
    setRemovalParticipation(null);
    void getOrganizerRemovalParticipation(groupId, proposalId)
      .then((participation) => {
        if (!cancelled) setRemovalParticipation(participation);
      })
      .catch((error) => {
        if (!cancelled) setRemovalError(friendlyFirestoreError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [user, collaboratorGroup?.id, activeRemovalProposal?.id, activeRemovalProposal?.status]);

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

Your local roster will stay local. Stripes will copy shared identity fields only, reset private extras, and use your current skill numbers as your first Club ratings.`,
    );
    if (!confirmed) return;

    setBusy("publish");
    setNotice(null);
    try {
      const created = await createFirebaseSharedRoster(activeRoster, undefined, activeRoster.name || "Shared roster");
      const snapshot = await readFirebaseSharedRoster(created.id);
      onOpenRoster?.(snapshot.roster, snapshot.name || created.name || "Shared roster", snapshot);
      await refreshSharedData();
      setNotice({ tone: "success", text: "Shared copy created. Your local roster stayed local. Current skills became your first Club ratings." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const autoRefreshLinkedRosters = async (targets: RoomRoster[] = remoteUpdatedLinkedRosters) => {
    if (!user || busy || !targets.length) return;
    setBusy("autosync");
    setAutoSyncStatus("syncing");
    try {
      let refreshed = 0;
      for (const localRoster of targets) {
        const rosterId = localRoster.cloudSource?.provider === "firebase" ? localRoster.cloudSource.firebaseRosterId : undefined;
        if (!rosterId) continue;
        if (localRoster.id === activeRoster?.id && activeHasLocalChanges) continue;
        const snapshot = await readFirebaseSharedRoster(rosterId);
        onRefreshActiveRoster?.(snapshot.roster, snapshot.name, snapshot, localRoster.id);
        refreshed += 1;
      }
      await refreshSharedData();
      if (refreshed > 0) {
        setAutoSyncStatus("saved");
        setNotice(null);
      } else {
        setAutoSyncStatus("idle");
      }
    } catch (error) {
      setAutoSyncStatus("error");
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy((current) => current === "autosync" ? "" : current);
    }
  };

  useEffect(() => {
    if (!backgroundSync || !user || !activeRoster || !activeFirebaseSource || !activeSharedRosterId || !activeCanSave || !activeHasLocalChanges || busy) return;
    const timeout = window.setTimeout(() => {
      setBusy("autosave");
      setAutoSyncStatus("saving");
      setNotice(null);
      void saveFirebaseSharedRoster(activeRoster)
        .then(async (saved) => {
          onRosterSaved?.(saved, activeRoster.id);
          await refreshSharedData();
          setAutoSyncStatus("saved");
          setNotice(null);
        })
        .catch((error) => {
          setAutoSyncStatus("error");
          setNotice({ tone: "error", text: friendlyFirestoreError(error) });
        })
        .finally(() => {
          setBusy((current) => current === "autosave" ? "" : current);
        });
    }, 900);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundSync, user?.uid, activeRoster?.id, activeRoster?.updatedAt, activeFirebaseSource?.firebaseVersion, activeFirebaseSource?.lastSyncedAt, activeCanSave, activeHasLocalChanges, busy]);

  useEffect(() => {
    if (!backgroundSync || !user || !activeSharedRosterId || !activeRoster || !activeFirebaseSource) return;
    lastLiveRosterVersionRef.current = typeof activeFirebaseSource.firebaseVersion === "number" ? activeFirebaseSource.firebaseVersion : 0;
    return listenToFirebaseSharedRoster(activeSharedRosterId, (snapshot) => {
      const localVersion = lastLiveRosterVersionRef.current;
      if (snapshot.version <= localVersion) return;
      lastLiveRosterVersionRef.current = snapshot.version;
      setAutoSyncStatus("syncing");

      // Roster identity is safe to apply even when this device has unsaved
      // player/rating edits. This keeps the main header name and theme color
      // live without replacing local work in progress.
      onRefreshRosterIdentity?.(snapshot.roster, snapshot.name, snapshot, activeRoster.id);
      if (!activeHasLocalChanges) {
        onRefreshActiveRoster?.(snapshot.roster, snapshot.name, snapshot, activeRoster.id);
      }
      setAutoSyncStatus("saved");
    }, (error) => {
      setAutoSyncStatus("error");
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundSync, user?.uid, activeSharedRosterId, activeRoster?.id, activeFirebaseSource?.firebaseVersion, activeHasLocalChanges]);

  useEffect(() => {
    if (!backgroundSync || !user || busy || remoteUpdatedLinkedRosters.length === 0) return;
    const safeTargets = remoteUpdatedLinkedRosters.filter((roster) => !(roster.id === activeRoster?.id && activeHasLocalChanges));
    if (!safeTargets.length) return;
    const timeout = window.setTimeout(() => {
      void autoRefreshLinkedRosters(safeTargets);
    }, 1200);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundSync, user?.uid, busy, remoteUpdatedLinkedRosters.length, activeRoster?.id, activeHasLocalChanges]);

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

  const handleInvite = async (emailOverride?: string) => {
    const emailToInvite = (emailOverride || inviteEmail).trim();
    if (!user || !emailToInvite || busy) return;
    if (senderInvitationStatus !== "ready") {
      setInvitationNotice({ tone: "info", text: "Verify your email before inviting another organizer." });
      return;
    }
    if (!collaboratorGroupId) {
      setInvitationNotice({ tone: "error", text: "This shared roster is missing its workspace link. Refresh shared rosters and try again." });
      return;
    }
    setBusy("invite");
    setInvitationNotice(null);
    try {
      const result = await createWorkspaceOrganizerInvitation(collaboratorGroupId, emailToInvite);
      if (!emailOverride) setInviteEmail("");
      await Promise.all([
        refreshSharedData(),
        refreshWorkspaceInvitations(collaboratorGroupId),
      ]);
      setInvitationNotice(result.reused
        ? { tone: "info", text: "That invitation is already pending. Use Resend if another email is needed." }
        : result.emailSent
          ? { tone: "success", text: "Invitation email sent." }
          : { tone: "error", text: "The invitation is pending, but the email could not be sent. Try Resend." });
    } catch (error) {
      setInvitationNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleCancelInvite = async (invitation: WorkspaceOrganizerInvitation) => {
    if (busy) return;
    if (!collaboratorGroupId) {
      setInvitationNotice({ tone: "error", text: "This shared roster is missing its workspace link. Refresh shared rosters and try again." });
      return;
    }
    setBusy(`cancel:${invitation.invitedEmail}`);
    setInvitationNotice(null);
    try {
      await cancelWorkspaceOrganizerInvitation(collaboratorGroupId, invitation);
      await Promise.all([
        refreshSharedData(),
        refreshWorkspaceInvitations(collaboratorGroupId),
      ]);
      setInvitationNotice({ tone: "success", text: "Invitation cancelled." });
    } catch (error) {
      setInvitationNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleSendOrganizerVerification = async () => {
    if (!user || busy) return;
    setBusy("organizer-verification-email");
    setSenderVerificationNotice(null);
    try {
      await sendStripesEmailVerification();
      setSenderVerificationNotice({ tone: "success", text: "Verification email sent. Check your inbox." });
    } catch (error) {
      setSenderVerificationNotice({ tone: "error", text: friendlyInvitationVerificationError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleRefreshOrganizerVerification = async () => {
    if (!user || busy) return;
    setBusy("organizer-verification-refresh");
    setSenderVerificationNotice(null);
    try {
      const refreshedUser = await reloadAndRefreshStripesAuthIdentity();
      setUser(refreshedUser);
      setSenderVerificationNotice(refreshedUser.emailVerified
        ? { tone: "success", text: "Email verified. You can invite organizers now." }
        : { tone: "info", text: "Verification is not confirmed yet. Open the email link, then try again." });
    } catch (error) {
      setSenderVerificationNotice({ tone: "error", text: friendlyInvitationVerificationError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleResendInvite = async (invitation: WorkspaceOrganizerInvitation) => {
    if (!invitation.invitationId || busy) return;
    if (!collaboratorGroupId) {
      setInvitationNotice({ tone: "error", text: "This shared roster is missing its workspace link. Refresh shared rosters and try again." });
      return;
    }
    setBusy(`resend:${invitation.invitationId}`);
    setInvitationNotice(null);
    try {
      const result = await resendWorkspaceOrganizerInvitation(invitation.invitationId);
      await refreshWorkspaceInvitations(collaboratorGroupId);
      setInvitationNotice(result.emailSent
        ? { tone: "success", text: "Invitation email resent." }
        : { tone: "error", text: "The invitation remains pending, but the email could not be sent." });
    } catch (error) {
      setInvitationNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleStartOrganizerRemoval = async (targetEmail: string, targetName: string) => {
    if (!collaboratorGroup || busy) return;
    setBusy(`removal-proposal:${targetEmail}`);
    setRemovalError("");
    setNotice(null);
    try {
      const result = await startOrganizerRemovalProposal(collaboratorGroup.id, targetEmail);
      setNotice({
        tone: "info",
        text: result.status === "failed"
          ? `${targetName} was not removed because the required Yes threshold cannot be reached.`
          : `Protected organizer vote started for ${targetName}.`,
      });
    } catch (error) {
      setRemovalError(friendlyFirestoreError(error));
    } finally {
      setBusy("");
    }
  };

  const handleCastOrganizerRemovalBallot = async (
    proposalId: string,
    choice: OrganizerRemovalBallotChoice,
  ) => {
    if (!collaboratorGroup || busy) return;
    setBusy(`removal-ballot:${proposalId}`);
    setRemovalError("");
    setNotice(null);
    try {
      const result = await castOrganizerRemovalBallot(collaboratorGroup.id, proposalId, choice);
      if (result.status === "open") {
        setRemovalParticipation((current) => current && current.proposalId === proposalId
          ? { ...current, hasVoted: true }
          : current);
      }
      setNotice({
        tone: result.status === "cancelled" ? "info" : "success",
        text: result.status === "passed"
          ? "The vote passed. Organizer access was removed."
          : result.status === "failed"
            ? "The vote closed without removing the organizer."
            : result.status === "cancelled"
              ? "The vote was cancelled because organizer membership changed."
              : "Your secret ballot was recorded.",
      });
      if (result.status === "passed") await refreshSharedData();
    } catch (error) {
      setRemovalError(friendlyFirestoreError(error));
    } finally {
      setBusy("");
    }
  };

  const confirmOrganizerRemovalAction = () => {
    const pending = removalConfirm;
    setRemovalConfirm(null);
    if (!pending) return;
    if (pending.kind === "propose") {
      void handleStartOrganizerRemoval(pending.targetEmail, pending.targetName);
      return;
    }
    void handleCastOrganizerRemovalBallot(pending.proposalId, pending.choice);
  };

  const handleAcceptInvite = async (invitationId: string) => {
    if (!user || busy) return;
    setBusy(`accept:${invitationId}`);
    setNotice(null);
    try {
      const acceptedInvitation = await acceptWorkspaceOrganizerInvitation(invitationId);
      const groupRosters = await listFirebaseSharedRosters(acceptedInvitation.groupId);
      const rosterToOpen = groupRosters[0];

      if (rosterToOpen) {
        const snapshot = await readFirebaseSharedRoster(rosterToOpen.id);
        onOpenRoster?.(snapshot.roster, snapshot.name, snapshot);
        onSharedInviteOpened?.(snapshot.roster);
        setNotice({ tone: "success", text: `${snapshot.name || acceptedInvitation.workspaceName || "Shared roster"} opened.` });
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

  const openBackupHistory = async (rosterId: string) => {
    if (!user || busy) return;
    setBusy(`backups:${rosterId}`);
    setNotice(null);
    try {
      const backups = await listFirebaseSharedRosterBackups(rosterId);
      setSharedRosterBackups(backups);
      setBackupRosterId(rosterId);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };

  const handleRestoreBackup = async (backup: FirebaseSharedRosterBackup) => {
    if (!backupRosterId || busy) return;
    const label = backup.savedAtIso ? new Date(backup.savedAtIso).toLocaleString() : `Version ${backup.version}`;
    const confirmed = window.confirm(`Restore the shared roster backup from ${label}?\n\nThe current live roster will be saved as another backup first.`);
    if (!confirmed) return;
    setBusy(`restore:${backup.id}`);
    setNotice(null);
    try {
      const restored = await restoreFirebaseSharedRosterBackup(backupRosterId, backup.id);
      if (activeRoster?.cloudSource?.provider === "firebase" && activeRoster.cloudSource.firebaseRosterId === backupRosterId) {
        onRefreshActiveRoster?.(restored.roster, restored.name, restored, activeRoster.id);
      }
      await refreshSharedData();
      setBackupRosterId("");
      setSharedRosterBackups([]);
      setNotice({ tone: "success", text: `Backup restored · ${restored.playerCount} players.` });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error) });
    } finally {
      setBusy("");
    }
  };


  const openCollaborators = (rosterId?: string) => {
    setInvitationNotice(null);
    setCollaboratorRosterId(rosterId || activeSharedRosterId || "");
  };

  const canManageCollaborators = collaboratorGroup?.currentUserRole === "organizer"
    || collaboratorGroup?.currentUserRole === "owner"
    || collaboratorGroup?.currentUserRole === "editor"
    || collaboratorRoster?.currentUserRole === "organizer"
    || collaboratorRoster?.currentUserRole === "owner"
    || collaboratorRoster?.currentUserRole === "editor";
  const canManageInvitations = canManageCollaborators && senderInvitationStatus === "ready";

  const recentRemovalResults = removalProposals
    .filter((proposal) => proposal.status !== "open")
    .slice(0, 3);
  const removalGovernancePanel = collaboratorGroup && canManageCollaborators ? (
    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <div className="min-w-0">
          <div className="text-xs font-black text-[#102A43]">Protected organizer removal</div>
          <div className="mt-0.5 text-[10px] font-semibold leading-snug text-slate-500">
            Ballots are secret and immutable. Live Yes and No totals stay hidden until the vote closes.
          </div>
        </div>
      </div>

      {removalError && (
        <div className="rounded-xl bg-rose-50 px-2.5 py-2 text-[10px] font-bold leading-snug text-rose-700">
          {removalError}
        </div>
      )}

      {activeRemovalProposal ? (
        <div className="grid gap-2 rounded-xl bg-violet-50/80 p-2.5">
          <div className="min-w-0">
            <div className="break-words text-xs font-black text-[#102A43]">
              Remove {activeRemovalProposal.targetDisplayNameSnapshot}?
            </div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-800">
              {activeRemovalProposal.castCount} of {activeRemovalProposal.eligibleOrganizerCount} eligible organizers responded. {activeRemovalProposal.requiredYes} Yes votes are required from {activeRemovalProposal.totalOrganizerCount} total organizers.
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-violet-100" aria-hidden="true">
            <div
              className="h-full rounded-full bg-violet-500 transition-[width]"
              style={{ width: `${Math.min(100, (activeRemovalProposal.castCount / activeRemovalProposal.eligibleOrganizerCount) * 100)}%` }}
            />
          </div>
          {activeRemovalProposal.targetUid === user?.uid ? (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold leading-snug text-slate-600">
              You are the target of this proposal and cannot vote. Only aggregate turnout and the final result are visible.
            </div>
          ) : removalParticipation == null ? (
            <div className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking voting eligibility...
            </div>
          ) : removalParticipation.hasVoted ? (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold leading-snug text-emerald-700">
              Your secret ballot is recorded. It cannot be changed.
            </div>
          ) : removalParticipation.eligible ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                className="min-h-10 whitespace-normal rounded-xl bg-rose-600 px-2 text-[10px] font-black leading-tight text-white hover:bg-rose-700"
                disabled={Boolean(busy)}
                onClick={() => setRemovalConfirm({
                  kind: "ballot",
                  proposalId: activeRemovalProposal.id,
                  targetName: activeRemovalProposal.targetDisplayNameSnapshot,
                  choice: "yes",
                })}
              >
                Yes, remove
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-10 whitespace-normal rounded-xl border-violet-200 bg-white px-2 text-[10px] font-black leading-tight text-violet-700"
                disabled={Boolean(busy)}
                onClick={() => setRemovalConfirm({
                  kind: "ballot",
                  proposalId: activeRemovalProposal.id,
                  targetName: activeRemovalProposal.targetDisplayNameSnapshot,
                  choice: "no",
                })}
              >
                No, keep
              </Button>
            </div>
          ) : (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold leading-snug text-slate-600">
              You are not eligible to vote on this proposal.
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-semibold leading-snug text-slate-500">
          To remove another organizer, start a proposal from their organizer row. The target cannot vote.
        </div>
      )}

      {recentRemovalResults.length > 0 && (
        <div className="grid gap-1.5">
          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Recent results</div>
          {recentRemovalResults.map((proposal) => (
            <div key={proposal.id} className="rounded-xl bg-slate-50 px-2.5 py-2">
              <div className="break-words text-[10px] font-black text-[#102A43]">
                {proposal.targetDisplayNameSnapshot} - {proposal.status === "passed" ? "Removed" : proposal.status === "failed" ? "Not removed" : "Cancelled"}
              </div>
              <div className="mt-0.5 text-[9px] font-semibold leading-snug text-slate-500">
                {proposal.status === "cancelled"
                  ? `Organizer membership changed / ${proposal.castCount} ballot${proposal.castCount === 1 ? "" : "s"} cast`
                  : `${proposal.yesCount ?? 0} Yes / ${proposal.noCount ?? 0} No / ${proposal.requiredYes} Yes required`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const removalConfirmModal = (
    <AlertDialog open={Boolean(removalConfirm)} onOpenChange={(open) => {
      if (!open) setRemovalConfirm(null);
    }}>
      <StripesConfirmContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {removalConfirm?.kind === "propose"
              ? `Start a vote about ${removalConfirm.targetName}?`
              : `Record a ${removalConfirm?.choice === "yes" ? "Yes" : "No"} ballot?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {removalConfirm?.kind === "propose" ? (
              "This starts a protected secret ballot. The target cannot vote. Stripes will calculate the required Yes threshold from the current active organizer electorate."
            ) : (
              `Your ${removalConfirm?.choice === "yes" ? "Yes vote supports removal" : "No vote keeps the organizer"}. Your choice is secret and cannot be changed after it is recorded.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmOrganizerRemovalAction}
            className={removalConfirm?.kind === "propose" || removalConfirm?.choice === "yes"
              ? "bg-rose-600 text-white hover:bg-rose-700"
              : "bg-violet-600 text-white hover:bg-violet-700"}
          >
            {removalConfirm?.kind === "propose"
              ? "Start vote"
              : removalConfirm?.choice === "yes"
                ? "Record Yes"
                : "Record No"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </StripesConfirmContent>
    </AlertDialog>
  );


  const collaboratorsModal = collaboratorRoster ? modalShell("Organizers", () => setCollaboratorRosterId(""), (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
        Organizers can open this shared roster, submit their own Club ratings, and help keep shared player info up to date.
      </div>

      {canManageInvitations ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" className="h-10 rounded-2xl border border-violet-100 bg-white px-3 text-sm font-bold outline-none" placeholder="email@example.com" />
          <Button type="button" className="h-10 rounded-2xl bg-violet-600 px-3 text-xs font-black text-white hover:bg-violet-700" onClick={() => void handleInvite()} disabled={!inviteEmail.trim() || Boolean(busy)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite
          </Button>
        </div>
      ) : canManageCollaborators && senderInvitationStatus === "verification_required" ? (
        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-black text-amber-900">Verify your email before inviting another organizer.</div>
          <div className="text-[10px] font-semibold leading-snug text-amber-800">
            Stripes will return you to the normal app after Firebase verifies your account.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-9 whitespace-normal rounded-xl border-amber-200 bg-white px-2 text-[10px] font-black text-amber-900" onClick={() => void handleSendOrganizerVerification()} disabled={Boolean(busy)}>
              <Mail className="h-3.5 w-3.5" />
              {busy === "organizer-verification-email" ? "Sending…" : "Send verification email"}
            </Button>
            <Button type="button" className="min-h-9 whitespace-normal rounded-xl bg-violet-600 px-2 text-[10px] font-black text-white hover:bg-violet-700" onClick={() => void handleRefreshOrganizerVerification()} disabled={Boolean(busy)}>
              {busy === "organizer-verification-refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              I’ve verified — continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold leading-snug text-slate-500">
          You can view organizers here. To stop being part of this roster, use Leave shared roster from the Club page.
        </div>
      )}
      {senderVerificationNotice && (
        <div className={`rounded-2xl px-3 py-2 text-[10px] font-bold leading-snug ${senderVerificationNotice.tone === "error" ? "bg-rose-50 text-rose-800" : senderVerificationNotice.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`} role="status">
          {senderVerificationNotice.text}
        </div>
      )}
      {invitationNotice && (
        <div className={`rounded-2xl px-3 py-2 text-[10px] font-bold leading-snug ${invitationNotice.tone === "error" ? "bg-rose-50 text-rose-800" : invitationNotice.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`} role="status">
          {invitationNotice.text}
        </div>
      )}

      <div className="grid gap-1.5">
        {canManageCollaborators && (
          <div className="rounded-2xl bg-white px-3 py-2 text-[11px] font-bold leading-snug text-slate-500 shadow-sm">
            Organizers have equal access. One organizer cannot remove another without the protected vote below.
          </div>
        )}
        {removalGovernancePanel}
        {invitationLoadError && (
          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[10px] font-bold leading-snug text-amber-800">
            {invitationLoadError}
          </div>
        )}
        {(() => {
          const memberNamesByEmail = mergedMemberNames(collaboratorGroup, collaboratorRoster);
          const memberEmails = collaboratorGroup?.memberEmails || collaboratorRoster.memberEmails || [];
          const pendingEmails = collaboratorGroup?.pendingInviteEmails || collaboratorRoster.pendingInviteEmails || [];
          const pendingInvitations = invitationListGroupId === collaboratorGroupId
            ? workspaceInvitations
            : pendingEmails.map((email): WorkspaceOrganizerInvitation => ({
                invitationId: null,
                invitedEmail: email,
                state: "pending",
                expiresAt: null,
                deliveryStatus: "not_sent",
                lastSentAt: null,
                resendAvailableAt: null,
              }));
          return (
            <>
              {memberEmails.map((email) => {
                const normalizedEmail = email.trim().toLowerCase();
                const label = displayNameForEmail(email, memberNamesByEmail, user?.email);
                const isCurrentUser = normalizedEmail === (user?.email || "").trim().toLowerCase();
                return (
                  <div key={email} className="grid gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-[#102A43] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate">{label}</div>
                      <div className="truncate text-[10px] text-slate-500">{email}</div>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 sm:justify-end">
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${isCurrentUser ? "bg-violet-100 text-violet-700" : "bg-white text-slate-500"}`}>
                        {isCurrentUser ? "You" : "Organizer"}
                      </span>
                      {canManageCollaborators && collaboratorGroup && !isCurrentUser && (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-8 min-w-0 flex-1 whitespace-normal rounded-xl border-rose-100 bg-white px-2 text-[9px] font-black leading-tight text-rose-700 sm:flex-none"
                          disabled={Boolean(busy) || Boolean(activeRemovalProposal)}
                          onClick={() => setRemovalConfirm({
                            kind: "propose",
                            targetEmail: email,
                            targetName: label,
                          })}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          {activeRemovalProposal ? "Vote open" : "Propose removal"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {pendingInvitations.map((invitation) => {
                const deliveryLabel = invitation.state === "expired"
                  ? "Expired"
                  : invitation.deliveryStatus === "sent"
                    ? "Email sent"
                    : invitation.deliveryStatus === "failed"
                      ? "Email delivery failed"
                      : invitation.deliveryStatus === "sending"
                        ? "Sending email…"
                        : "Email not sent yet";
                return (
                  <div key={invitation.invitationId || invitation.invitedEmail} className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                    <div className="min-w-0">
                      <div className="truncate">{displayNameForEmail(invitation.invitedEmail, memberNamesByEmail, user?.email)}</div>
                      <div className="truncate text-[10px] text-amber-700">Pending invite · {invitation.invitedEmail}</div>
                      <div className="text-[9px] font-black text-amber-600">{deliveryLabel}</div>
                    </div>
                    {canManageInvitations ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {invitation.state === "expired" || !invitation.invitationId ? (
                          <Button type="button" variant="outline" className="h-8 rounded-xl border-amber-200 bg-white px-2 text-[9px] font-black text-amber-800" onClick={() => void handleInvite(invitation.invitedEmail)} disabled={Boolean(busy)}>
                            Send email
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" className="h-8 rounded-xl border-amber-200 bg-white px-2 text-[9px] font-black text-amber-800" onClick={() => void handleResendInvite(invitation)} disabled={Boolean(busy)}>
                            Resend
                          </Button>
                        )}
                        <button type="button" onClick={() => void handleCancelInvite(invitation)} className="rounded-full bg-white p-1.5 text-amber-700" disabled={Boolean(busy)} aria-label={`Cancel invite for ${invitation.invitedEmail}`}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-700">Pending</span>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  )) : null;


  const backupHistoryModal = backupRosterId ? modalShell(
    "Restore backup",
    () => { setBackupRosterId(""); setSharedRosterBackups([]); },
    <div className="grid gap-2">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
        Stripes keeps up to 10 automatic backups. Restoring also saves the current live roster first.
      </div>
      {sharedRosterBackups.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-500">
          No backups yet. The first backup is created before the next shared-roster change.
        </div>
      ) : (
        <div className="grid max-h-[56svh] gap-1.5 overflow-y-auto pr-1">
          {sharedRosterBackups.map((backup) => (
            <button
              key={backup.id}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void handleRestoreBackup(backup)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-[#102A43]">
                  {backup.savedAtIso ? new Date(backup.savedAtIso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : `Version ${backup.version}`}
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
                  {backup.playerCount} player{backup.playerCount === 1 ? "" : "s"}{backup.savedByEmail ? ` · ${displayNameForEmail(backup.savedByEmail, activeSharedRoster?.memberNamesByEmail, user?.email)}` : ""}
                </span>
              </span>
              <RotateCcw className="h-4 w-4 shrink-0 text-violet-600" />
            </button>
          ))}
        </div>
      )}
    </div>,
  ) : null;

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
              const memberNamesByEmail = mergedMemberNames(group, roster);
              const savedByName = displayNameForEmail(roster.lastSavedByEmail || roster.ownerEmail, memberNamesByEmail, user?.email);
              return (
                <div key={`modal-${roster.id}`} className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-violet-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => { void handleOpenRoster(roster.id); setSharedRosterLibraryOpen(false); }} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{roster.name}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">{linked ? "Open on this device" : "Open shared roster"} · saved by {savedByName}</span>
                  </button>
                  <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl border border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm hover:bg-violet-50">
                    <Users className="h-3.5 w-3.5" />
                    {collaboratorCount}
                  </button>
                </div>
              );
            })}
          </div>
          {activeSharedRoster && (onMakePrivateCopy || onHideOnDevice) ? (
            <div className="grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
              <div className="truncate text-[11px] font-black text-violet-800">
                Current roster: {activeSharedRoster.name || "Shared roster"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {onMakePrivateCopy ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                    onClick={() => { setSharedRosterLibraryOpen(false); onMakePrivateCopy?.(); }}
                  >
                    Private copy
                  </Button>
                ) : <div />}
                {onHideOnDevice ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                    onClick={() => { setSharedRosterLibraryOpen(false); onHideOnDevice?.(); }}
                  >
                    Hide on device
                  </Button>
                ) : <div />}
              </div>
            </div>
          ) : null}
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
              <div key={invite.invitationId} className="flex items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2">
                <div className="min-w-0 truncate text-xs font-black text-[#102A43]">Invite: {invite.workspaceName}</div>
                <Button type="button" variant="outline" className="h-8 rounded-xl border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700" onClick={() => handleAcceptInvite(invite.invitationId)} disabled={Boolean(busy) || invite.state !== "pending"}>
                  {busy === `accept:${invite.invitationId}` ? "…" : invite.state === "expired" ? "Expired" : "Accept"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!activeSharedRoster ? (
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="h-9 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => setSharedRosterLibraryOpen(true)} disabled={!user || Boolean(busy)}>
              <FolderOpen className="mr-1.5 h-4 w-4" />
              Rosters
            </Button>
            <Button type="button" className="h-9 justify-start rounded-2xl bg-violet-600 px-3 text-left text-[11px] font-black text-white hover:bg-violet-700" onClick={handleShareActiveRoster} disabled={!user || isEmptyRoster || Boolean(busy)}>
              <Share2 className="mr-1.5 h-4 w-4" />
              {busy === "publish" ? "Creating…" : "Create shared copy"}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-full min-h-11 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => setSharedRosterLibraryOpen(true)} disabled={!user || Boolean(busy)}>
              <FolderOpen className="mr-1 h-4 w-4" />
              Rosters
            </Button>
            <Button type="button" variant="outline" className="h-full min-h-11 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => openCollaborators(activeSharedRosterId)} disabled={!user || Boolean(busy)}>
              <Users className="mr-1 h-4 w-4" />
              Organizers
            </Button>
            {activeCanSave && (
              <Button type="button" variant="outline" className="col-span-2 h-10 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => void openBackupHistory(activeSharedRosterId)} disabled={!user || Boolean(busy)}>
                <History className="mr-1.5 h-4 w-4" />
                Restore backup
              </Button>
            )}
          </div>
        )}

        {notice?.tone === "error" && <div className="rounded-2xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">{notice.text}</div>}
        {sharedRosterLibraryModal}
        {backupHistoryModal}
        {collaboratorsModal}
        {removalConfirmModal}
      </div>
    );
  }

  if (headless) return null;

  return (
    <div className="grid gap-3">
      {incomingInvites.length > 0 && (
        <div className="grid gap-1.5 rounded-2xl border border-violet-100 bg-violet-50/70 p-2">
          {incomingInvites.slice(0, 3).map((invite) => (
            <div key={invite.invitationId} className="flex items-center justify-between gap-2 rounded-xl bg-white px-2 py-2">
              <div className="min-w-0 truncate text-xs font-black text-[#102A43]">{invite.workspaceName}</div>
              <Button type="button" variant="outline" className="h-8 rounded-xl border-violet-100 px-2 text-[10px] font-black text-violet-700" onClick={() => handleAcceptInvite(invite.invitationId)} disabled={Boolean(busy) || invite.state !== "pending"}>
                {busy === `accept:${invite.invitationId}` ? "Accepting…" : invite.state === "expired" ? "Expired" : "Accept"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!activeSharedRoster ? (
        <Button type="button" className="h-11 rounded-2xl bg-violet-600 text-xs font-black text-white hover:bg-violet-700" onClick={handleShareActiveRoster} disabled={!user || isEmptyRoster || Boolean(busy)}>
          <Share2 className="mr-1.5 h-4 w-4" />
          {busy === "publish" ? "Creating…" : "Create shared copy"}
        </Button>
      ) : (
        <div className="grid gap-2">
          <div className={`flex h-11 items-center justify-between rounded-2xl border px-3 text-xs font-black ${autoSyncStatus === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-violet-100 bg-violet-50 text-violet-700"}`}>
            <span>{autoStatusText}</span>
            <AutoStatusIcon className={`h-4 w-4 ${(autoSyncStatus === "saving" || autoSyncStatus === "syncing" || activeHasLocalChanges) ? "animate-spin" : ""}`} />
          </div>
          {activeCanSave && (
            <Button type="button" variant="outline" className="h-10 justify-start rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700" onClick={() => void openBackupHistory(activeSharedRosterId)} disabled={Boolean(busy)}>
              <History className="mr-1.5 h-4 w-4" />
              Restore backup
            </Button>
          )}
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
              const memberNamesByEmail = mergedMemberNames(group, roster);
              const savedByName = displayNameForEmail(roster.lastSavedByEmail || roster.ownerEmail, memberNamesByEmail, user?.email);
              return (
                <div key={roster.id} className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-violet-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => handleOpenRoster(roster.id)} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{roster.name}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">saved by {savedByName}</span>
                  </button>
                  <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl border border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm hover:bg-violet-50">
                    <Users className="h-3.5 w-3.5" />
                    {collaboratorCount}
                  </button>
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      {notice && <div className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-violet-50 text-violet-700"}`}>{notice.text}</div>}

{backupHistoryModal}
{collaboratorsModal}
{removalConfirmModal}
    </div>
  );
}
