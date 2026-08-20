import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FolderOpen, History, Loader2, Mail, RotateCcw, Share2, ShieldCheck, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
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
import { SharedRosterAutosyncStatus } from "@/components/SharedRosterAutosyncStatus";
import { StripesConfirmContent } from "@/components/ui/stripes-modal";
import type { RoomRoster } from "@/lib/localRoster";
import {
  adoptFirebaseSharedRosterCreation,
  createFirebaseSharedRoster,
  DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
  listFirebaseSharedGroups,
  listFirebaseSharedRosters,
  listFirebaseSharedRosterBackups,
  readFirebaseSharedRoster,
  restoreFirebaseSharedRosterBackup,
  type FirebaseSharedRosterBackup,
  type FirebaseSharedGroupSummary,
  type FirebaseSharedRosterSummary,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import type { ActiveSharedRosterAutosync } from "@/lib/sharedRosterAutosync";
import { LOCAL_ONLY_SHARED_ROSTER_AUTOSYNC_SNAPSHOT } from "@/lib/sharedRosterAutosyncController";
import {
  unresolvedActiveSharedWorkspaceAuthority,
  type ActiveSharedWorkspaceAuthority,
} from "@/lib/activeSharedWorkspaceAuthority";
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
  requireRefreshedWorkspaceInvitationSender,
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
import {
  governanceEligibilityDateLabel,
  organizerGovernanceEligibilityState,
} from "@/lib/organizerGovernanceEligibility";
import { resolveWorkspaceInvitationManagementGroupId } from "@/lib/workspaceInvitationOnboardingState";
import {
  verificationEmailError,
} from "@/lib/stripesEmailVerificationService";
import {
  getSharedWorkspaceClosureState,
  type SharedWorkspaceClosureState,
} from "@/lib/sharedWorkspaceClosureService";
import {
  activeSharedWorkspaceAuthorityText,
  formatDateTime,
  formatNumber,
  sharedRosterSummaryNameText,
  useStripesTranslation,
  verificationEmailErrorText,
  verificationResendText,
  type StripesTranslator,
} from "@/i18n";

type Props = {
  variant?: "full" | "compact";
  activeRoster: RoomRoster | undefined;
  activeAuthority?: ActiveSharedWorkspaceAuthority;
  autosync?: ActiveSharedRosterAutosync;
  rosters?: RoomRoster[];
  isEmptyRoster: boolean;
  onOpenRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary) => void;
  // Kept as type-only compatibility for the tracked stale src/src callers.
  onRosterSaved?: (summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onRefreshActiveRoster?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  // Kept as type-only compatibility for the tracked stale src/src callers.
  onRefreshRosterIdentity?: (roster: RoomRoster, sourceName: string, summary: FirebaseSharedRosterSummary, localRosterId?: string) => void;
  onSharedRosterSummariesUpdated?: (summaries: FirebaseSharedRosterSummary[]) => void;
  onSharedInviteOpened?: (roster: RoomRoster) => void;
  openLibraryToken?: number;
  onMakePrivateCopy?: () => void;
  onHideOnDevice?: () => void;
  onLeaveSharedRoster?: () => void;
  onCloseSharedWorkspace?: (state: SharedWorkspaceClosureState) => void;
  backgroundSync?: boolean;
  headless?: boolean;
};

function friendlyFirestoreError(error: unknown, t: StripesTranslator) {
  const message = error instanceof Error ? error.message : String(error || t("shared.publish.errors.generic"));
  if (/permission-denied|Missing or insufficient permissions/i.test(message)) return t("shared.publish.errors.permissionDenied");
  if (/network/i.test(message)) return t("shared.publish.errors.network");
  if (/saved by someone else|changed elsewhere|Remote version/i.test(message)) return t("shared.publish.errors.remoteChanged");
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

function displayNameForEmail(email: string | undefined, memberNamesByEmail: Record<string, string> | undefined, currentUserEmail: string | undefined, t: StripesTranslator) {
  if (!email) return "—";
  const normalized = email.trim().toLowerCase();
  if (currentUserEmail && normalized === currentUserEmail.trim().toLowerCase()) return t("shared.publish.you");
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

export function FirebaseSharedRosterPublishCard({ variant = "full", activeRoster, activeAuthority = unresolvedActiveSharedWorkspaceAuthority({
  localRosterId: activeRoster?.id || "",
  firebaseRosterId: activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource.firebaseRosterId : undefined,
  cachedFirebaseGroupId: activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource.firebaseGroupId : undefined,
}, false, null), autosync, rosters = [], isEmptyRoster, onOpenRoster, onRefreshActiveRoster, onSharedRosterSummariesUpdated, onSharedInviteOpened, openLibraryToken = 0, onMakePrivateCopy, onHideOnDevice, onLeaveSharedRoster, onCloseSharedWorkspace, backgroundSync = true, headless = false }: Props) {
  const { t, locale } = useStripesTranslation();
  const user = activeAuthority.user;
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
  const [workspaceClosureState, setWorkspaceClosureState] = useState<SharedWorkspaceClosureState | null>(null);
  const [workspaceClosureLoading, setWorkspaceClosureLoading] = useState(false);
  const [workspaceClosureError, setWorkspaceClosureError] = useState("");
  const [senderVerificationNotice, setSenderVerificationNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [senderVerificationResendAt, setSenderVerificationResendAt] = useState<string | null>(null);
  const [senderVerificationClock, setSenderVerificationClock] = useState(() => Date.now());
  const [invitationNotice, setInvitationNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState<
    | { kind: "propose"; targetEmail: string; targetName: string }
    | { kind: "ballot"; proposalId: string; targetName: string; choice: OrganizerRemovalBallotChoice }
    | null
  >(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const activeAutosync = autosync || {
    ...LOCAL_ONLY_SHARED_ROSTER_AUTOSYNC_SNAPSHOT,
    retry: async () => false,
  };
  const sharedDataRequestRef = useRef(0);
  const currentUserUidRef = useRef(user?.uid || "");
  currentUserUidRef.current = user?.uid || "";
  const senderInvitationStatus = workspaceInvitationSenderStatus(user);
  const senderVerificationCooldownLabel = verificationResendText(senderVerificationResendAt, senderVerificationClock, t);

  useEffect(() => {
    if (!senderVerificationResendAt || Date.parse(senderVerificationResendAt) <= Date.now()) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setSenderVerificationClock(now);
      if (Date.parse(senderVerificationResendAt) <= now) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [senderVerificationResendAt]);

  const activeFirebaseSource = activeRoster?.cloudSource?.provider === "firebase" ? activeRoster.cloudSource : null;
  const activeSharedRosterId = activeFirebaseSource?.firebaseRosterId || "";
  const activeSharedRoster = activeAuthority.status === "authorized"
    ? activeAuthority.roster
    : null;
  const activeGroup = activeAuthority.status === "authorized"
    ? activeAuthority.group
    : null;
  const collaboratorRoster = useMemo(
    () => collaboratorRosterId
      ? collaboratorRosterId === activeSharedRosterId
        ? activeSharedRoster
        : sharedRosters.find((roster) => roster.id === collaboratorRosterId) || null
      : null,
    [sharedRosters, collaboratorRosterId, activeSharedRoster],
  );
  const collaboratorGroup = useMemo(
    () => collaboratorRoster?.id === activeSharedRosterId
      ? activeGroup
      : sharedGroups.find((group) => group.id === collaboratorRoster?.groupId) || null,
    [sharedGroups, collaboratorRoster?.groupId, collaboratorRoster?.id, activeSharedRosterId, activeGroup],
  );
  const collaboratorGroupId = resolveWorkspaceInvitationManagementGroupId({
    loadedGroupId: collaboratorGroup?.id,
    rosterGroupId: collaboratorRoster?.groupId,
    sourceGroupId: null,
  });
  const collaboratorIsActive = collaboratorRoster?.id === activeSharedRosterId;
  const collaboratorRosterOrganizer = canRoleSave(collaboratorRoster?.currentUserRole);
  const collaboratorGroupOrganizer = canRoleSave(collaboratorGroup?.currentUserRole);
  const canManageCollaborators = collaboratorIsActive
    ? activeAuthority.capabilities.canManageOrganizers
    : collaboratorRoster?.groupId
      ? collaboratorGroupOrganizer
      : collaboratorRosterOrganizer;
  const canManageInvitations = (
    collaboratorIsActive
      ? activeAuthority.capabilities.canManageInvitations
      : Boolean(collaboratorRoster?.groupId && collaboratorGroupOrganizer)
  ) && senderInvitationStatus === "ready";
  const canLeaveActiveWorkspace = collaboratorIsActive && activeAuthority.capabilities.canLeaveWorkspace;
  const canUseActiveGovernance = collaboratorIsActive
    ? activeAuthority.capabilities.canUseProtectedGovernance
    : Boolean(collaboratorGroup && collaboratorGroupOrganizer);
  const activeRemovalProposal = useMemo(
    () => removalProposals.find((proposal) => proposal.status === "open") || null,
    [removalProposals],
  );
  const currentRemovalEligibility = useMemo(() => organizerGovernanceEligibilityState(
    collaboratorGroup?.organizerGovernanceEligibleAtByUid,
    user?.uid,
  ), [collaboratorGroup?.organizerGovernanceEligibleAtByUid, user?.uid]);
  const removalEligibilityLabel = currentRemovalEligibility.eligibleAt == null
    ? ""
    : governanceEligibilityDateLabel(currentRemovalEligibility.eligibleAt, locale);
  const sharedRosterById = useMemo(() => new Map(sharedRosters.map((roster) => [roster.id, roster])), [sharedRosters]);
  const linkedRosters = useMemo(() => rosters.filter((roster) => roster.cloudSource?.provider === "firebase" && roster.cloudSource.firebaseRosterId), [rosters]);
  const remoteUpdatedLinkedRosters = useMemo(() => linkedRosters.filter((roster) => {
    const source = roster.cloudSource;
    if (source?.provider !== "firebase" || !source.firebaseRosterId) return false;
    const remoteSummary = sharedRosterById.get(source.firebaseRosterId);
    const localVersion = typeof source.firebaseVersion === "number" ? source.firebaseVersion : 0;
    return Boolean(remoteSummary && remoteSummary.version > localVersion);
  }), [linkedRosters, sharedRosterById]);
  const canOpenRosterOrganizers = (
    roster: FirebaseSharedRosterSummary,
    group?: FirebaseSharedGroupSummary,
  ) => roster.id === activeSharedRosterId
    ? activeAuthority.capabilities.canUseClubAccess
    : roster.groupId
      ? Boolean(group && canRoleSave(group.currentUserRole))
      : canRoleSave(roster.currentUserRole);
  const refreshSharedData = async () => {
    const expectedUserUid = user?.uid || "";
    if (!expectedUserUid) return;
    const requestGeneration = sharedDataRequestRef.current + 1;
    sharedDataRequestRef.current = requestGeneration;
    setBusy((current) => current || "refresh");
    try {
      const [groups, rosters, invites] = await Promise.all([
        listFirebaseSharedGroups(),
        listFirebaseSharedRosters(),
        listWorkspaceRecipientInvitations().catch(() => []),
      ]);
      if (currentUserUidRef.current === expectedUserUid && sharedDataRequestRef.current === requestGeneration) {
        setSharedGroups(groups);
        setSharedRosters(rosters);
        setIncomingInvites(invites);
        onSharedRosterSummariesUpdated?.(rosters);
      }
    } catch (error) {
      if (currentUserUidRef.current === expectedUserUid && sharedDataRequestRef.current === requestGeneration) {
        setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
      }
    } finally {
      if (currentUserUidRef.current === expectedUserUid && sharedDataRequestRef.current === requestGeneration) {
        setBusy((current) => current === "refresh" ? "" : current);
      }
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
    if (!user || !groupId || !collaboratorRosterId || !canManageInvitations) {
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
        setInvitationLoadError(friendlyFirestoreError(error, t));
      });
    return () => {
      cancelled = true;
    };
  }, [
    user,
    senderInvitationStatus,
    collaboratorGroupId,
    canManageInvitations,
    collaboratorRosterId,
  ]);

  useEffect(() => {
    const groupId = collaboratorGroup?.id;
    if (!user || !groupId || !collaboratorRosterId || !canUseActiveGovernance) {
      setRemovalProposals([]);
      setRemovalParticipation(null);
      setRemovalError("");
      return;
    }
    setRemovalError("");
    return listenToOrganizerRemovalProposals(groupId, setRemovalProposals, (error) => {
      setRemovalError(friendlyFirestoreError(error, t));
    });
  }, [user, collaboratorGroup?.id, collaboratorRosterId, canUseActiveGovernance]);

  useEffect(() => {
    const groupId = collaboratorGroup?.id;
    const proposalId = activeRemovalProposal?.id;
    if (!user || !groupId || !proposalId || !collaboratorRosterId || !canUseActiveGovernance) return;
    return listenToOrganizerRemovalProposal(groupId, proposalId, (proposal) => {
      if (!proposal) return;
      setRemovalError("");
      setRemovalProposals((current) => [proposal, ...current.filter((item) => item.id !== proposal.id)]);
    }, (error) => {
      setRemovalError(friendlyFirestoreError(error, t));
    });
  }, [user, collaboratorGroup?.id, collaboratorRosterId, activeRemovalProposal?.id, canUseActiveGovernance]);

  useEffect(() => {
    const groupId = collaboratorGroup?.id;
    if (!user || !groupId || !canUseActiveGovernance || !activeRemovalProposal || activeRemovalProposal.status !== "open") {
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
        if (!cancelled) setRemovalError(friendlyFirestoreError(error, t));
      });
    return () => {
      cancelled = true;
    };
  }, [user, collaboratorGroup?.id, canUseActiveGovernance, activeRemovalProposal?.id, activeRemovalProposal?.status]);

  useEffect(() => {
    sharedDataRequestRef.current += 1;
    setSharedGroups([]);
    setSharedRosters([]);
    setIncomingInvites([]);
    setWorkspaceInvitations([]);
    setInvitationListGroupId("");
    setInvitationLoadError("");
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
      t("shared.publish.confirmCreate", { name: activeRoster.name || t("shared.publish.thisRoster") }),
    );
    if (!confirmed) return;

    setBusy("publish");
    setNotice(null);
    try {
      const created = await createFirebaseSharedRoster(
        activeRoster,
        undefined,
        activeRoster.name || DEFAULT_FIREBASE_SHARED_ROSTER_NAME,
      );
      const snapshot = await readFirebaseSharedRoster(created.id);
      if (onOpenRoster) {
        onOpenRoster(
          snapshot.roster,
          snapshot.name || created.name || t("shared.publish.sharedRoster"),
          snapshot,
        );
        adoptFirebaseSharedRosterCreation(activeRoster.id, created.id);
      }
      let refreshWarning = "";
      try {
        await refreshSharedData();
      } catch {
        refreshWarning = t("shared.publish.notices.listRefreshFailed");
      }
      const secondaryWarnings = [created.creationWarning, refreshWarning].filter(Boolean).join(" ");
      setNotice({
        tone: secondaryWarnings ? "info" : "success",
        text: secondaryWarnings
          ? t("shared.publish.notices.createdWithWarnings", { warnings: secondaryWarnings })
          : t("shared.publish.notices.created"),
      });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const autoRefreshLinkedRosters = async (targets: RoomRoster[] = remoteUpdatedLinkedRosters) => {
    if (!user || busy || !targets.length) return;
    const expectedUserUid = user.uid;
    setBusy("autosync");
    try {
      let refreshed = 0;
      for (const localRoster of targets) {
        const rosterId = localRoster.cloudSource?.provider === "firebase" ? localRoster.cloudSource.firebaseRosterId : undefined;
        if (!rosterId) continue;
        // Active-roster remote state is owned by the canonical autosync controller.
        if (localRoster.id === activeRoster?.id) continue;
        const snapshot = await readFirebaseSharedRoster(rosterId);
        if (currentUserUidRef.current !== expectedUserUid) return;
        onRefreshActiveRoster?.(snapshot.roster, snapshot.name, snapshot, localRoster.id);
        refreshed += 1;
      }
      await refreshSharedData();
      if (refreshed > 0) {
        setNotice(null);
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy((current) => current === "autosync" ? "" : current);
    }
  };

  useEffect(() => {
    if (!backgroundSync || !user || busy || remoteUpdatedLinkedRosters.length === 0) return;
    const safeTargets = remoteUpdatedLinkedRosters.filter((roster) => roster.id !== activeRoster?.id);
    if (!safeTargets.length) return;
    const timeout = window.setTimeout(() => {
      void autoRefreshLinkedRosters(safeTargets);
    }, 1200);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundSync, user?.uid, busy, remoteUpdatedLinkedRosters.length, activeRoster?.id]);

  const handleOpenRoster = async (rosterId: string) => {
    if (!user || busy) return;
    setBusy(`open:${rosterId}`);
    setNotice(null);
    try {
      const snapshot = await readFirebaseSharedRoster(rosterId);
      onOpenRoster?.(snapshot.roster, snapshot.name, snapshot);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const refreshInvitationSenderForAction = () => requireRefreshedWorkspaceInvitationSender(async () => {
    const refreshedUser = await reloadAndRefreshStripesAuthIdentity();
    return refreshedUser;
  });

  const handleInvite = async (emailOverride?: string) => {
    const emailToInvite = (emailOverride || inviteEmail).trim();
    if (!canManageInvitations || !user || !emailToInvite || busy) return;
    if (!collaboratorGroupId) {
      setInvitationNotice({ tone: "error", text: t("shared.publish.errors.missingWorkspaceLink") });
      return;
    }
    setBusy("invite");
    setInvitationNotice(null);
    try {
      await refreshInvitationSenderForAction();
      const result = await createWorkspaceOrganizerInvitation(collaboratorGroupId, emailToInvite);
      if (!emailOverride) setInviteEmail("");
      await Promise.all([
        refreshSharedData(),
        refreshWorkspaceInvitations(collaboratorGroupId),
      ]);
      setInvitationNotice(result.reused
        ? { tone: "info", text: t("shared.publish.invitation.alreadyPending") }
        : result.emailSent
          ? { tone: "success", text: t("shared.publish.invitation.emailSent") }
          : { tone: "error", text: t("shared.publish.invitation.emailFailed") });
    } catch (error) {
      setInvitationNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const handleCancelInvite = async (invitation: WorkspaceOrganizerInvitation) => {
    if (!canManageInvitations || busy) return;
    if (!collaboratorGroupId) {
      setInvitationNotice({ tone: "error", text: t("shared.publish.errors.missingWorkspaceLink") });
      return;
    }
    setBusy(`cancel:${invitation.invitedEmail}`);
    setInvitationNotice(null);
    try {
      await refreshInvitationSenderForAction();
      await cancelWorkspaceOrganizerInvitation(collaboratorGroupId, invitation);
      await Promise.all([
        refreshSharedData(),
        refreshWorkspaceInvitations(collaboratorGroupId),
      ]);
      setInvitationNotice({ tone: "success", text: t("shared.publish.invitation.cancelled") });
    } catch (error) {
      setInvitationNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const handleSendOrganizerVerification = async () => {
    if (!user || busy) return;
    setBusy("organizer-verification-email");
    setSenderVerificationNotice(null);
    try {
      const verification = await sendStripesEmailVerification();
      setSenderVerificationResendAt(verification.resendAvailableAt);
      setSenderVerificationClock(Date.now());
      setSenderVerificationNotice({ tone: "success", text: t("shared.publish.invitation.verificationSent") });
    } catch (error) {
      const safeError = verificationEmailError(error);
      setSenderVerificationResendAt(safeError.resendAvailableAt);
      setSenderVerificationClock(Date.now());
      setSenderVerificationNotice({ tone: "error", text: verificationEmailErrorText(safeError, t) });
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
      setSenderVerificationNotice(refreshedUser.emailVerified
        ? { tone: "success", text: t("shared.publish.invitation.emailVerified") }
        : { tone: "info", text: t("shared.publish.invitation.verificationPending") });
    } catch (error) {
      setSenderVerificationNotice({ tone: "error", text: t("shared.publish.invitation.verificationRefreshFailed") });
    } finally {
      setBusy("");
    }
  };

  const handleResendInvite = async (invitation: WorkspaceOrganizerInvitation) => {
    if (!canManageInvitations || !invitation.invitationId || busy) return;
    if (!collaboratorGroupId) {
      setInvitationNotice({ tone: "error", text: t("shared.publish.errors.missingWorkspaceLink") });
      return;
    }
    setBusy(`resend:${invitation.invitationId}`);
    setInvitationNotice(null);
    try {
      await refreshInvitationSenderForAction();
      const result = await resendWorkspaceOrganizerInvitation(invitation.invitationId);
      await refreshWorkspaceInvitations(collaboratorGroupId);
      setInvitationNotice(result.emailSent
        ? { tone: "success", text: t("shared.publish.invitation.emailResent") }
        : { tone: "error", text: t("shared.publish.invitation.emailResendFailed") });
    } catch (error) {
      setInvitationNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const handleStartOrganizerRemoval = async (targetEmail: string, targetName: string) => {
    if (!canUseActiveGovernance || !collaboratorGroup || busy) return;
    if (!currentRemovalEligibility.eligible) {
      setRemovalError(removalEligibilityLabel
        ? t("shared.publish.governance.availableOn", { date: removalEligibilityLabel })
        : t("shared.publish.governance.unavailable"));
      return;
    }
    setBusy(`removal-proposal:${targetEmail}`);
    setRemovalError("");
    setNotice(null);
    try {
      const result = await startOrganizerRemovalProposal(collaboratorGroup.id, targetEmail);
      setNotice({
        tone: "info",
        text: result.status === "failed"
          ? t("shared.publish.governance.thresholdUnreachable", { name: targetName })
          : t("shared.publish.governance.voteStarted", { name: targetName }),
      });
    } catch (error) {
      setRemovalError(friendlyFirestoreError(error, t));
    } finally {
      setBusy("");
    }
  };

  const handleCastOrganizerRemovalBallot = async (
    proposalId: string,
    choice: OrganizerRemovalBallotChoice,
  ) => {
    if (!canUseActiveGovernance || !collaboratorGroup || busy) return;
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
          ? t("shared.publish.governance.votePassed")
          : result.status === "failed"
            ? t("shared.publish.governance.voteFailed")
            : result.status === "cancelled"
              ? t("shared.publish.governance.voteCancelled")
              : t("shared.publish.governance.ballotRecorded"),
      });
      if (result.status === "passed") await refreshSharedData();
    } catch (error) {
      setRemovalError(friendlyFirestoreError(error, t));
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
        setNotice({
          tone: "success",
          text: t("shared.publish.invitation.rosterOpened", {
            name: sharedRosterSummaryNameText(snapshot, t) || acceptedInvitation.workspaceName,
          }),
        });
      } else {
        await refreshSharedData();
        setNotice({ tone: "success", text: t("shared.publish.invitation.rosterAdded") });
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const openBackupHistory = async (rosterId: string) => {
    if (!user || busy || (rosterId === activeSharedRosterId && !activeAuthority.capabilities.canRestoreSharedRosterBackup)) return;
    setBusy(`backups:${rosterId}`);
    setNotice(null);
    try {
      const backups = await listFirebaseSharedRosterBackups(rosterId);
      setSharedRosterBackups(backups);
      setBackupRosterId(rosterId);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };

  const handleRestoreBackup = async (backup: FirebaseSharedRosterBackup) => {
    if (!backupRosterId || busy || (backupRosterId === activeSharedRosterId && !activeAuthority.capabilities.canRestoreSharedRosterBackup)) return;
    const label = backup.savedAtIso
      ? formatDateTime(locale, new Date(backup.savedAtIso), {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        })
      : t("shared.publish.backup.version", { version: backup.version });
    const confirmed = window.confirm(t("shared.publish.backup.confirmRestore", { label }));
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
      setNotice({ tone: "success", text: t("shared.publish.backup.restored", { count: restored.playerCount }) });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyFirestoreError(error, t) });
    } finally {
      setBusy("");
    }
  };


  const openCollaborators = (rosterId?: string) => {
    const targetRosterId = rosterId || activeSharedRosterId || "";
    const targetRoster = targetRosterId === activeSharedRosterId
      ? activeSharedRoster
      : sharedRosters.find((roster) => roster.id === targetRosterId) || null;
    const targetGroup = targetRosterId === activeSharedRosterId
      ? activeGroup
      : sharedGroups.find((group) => group.id === targetRoster?.groupId);
    if (!targetRoster || !canOpenRosterOrganizers(targetRoster, targetGroup || undefined)) return;
    setInvitationNotice(null);
    setWorkspaceClosureState(null);
    setWorkspaceClosureError("");
    setCollaboratorRosterId(targetRosterId);
  };

  const canRequestWorkspaceClosure = Boolean(onCloseSharedWorkspace);

  useEffect(() => {
    const checkingCollaborators = Boolean(
      collaboratorRosterId && collaboratorRoster?.id === activeSharedRosterId,
    );
    const checkingRecovery = Boolean(activeSharedRosterId && !activeSharedRoster);
    if (!canRequestWorkspaceClosure
      || !user
      || (!checkingRecovery && (!canLeaveActiveWorkspace || !checkingCollaborators))) {
      setWorkspaceClosureState(null);
      setWorkspaceClosureError("");
      setWorkspaceClosureLoading(false);
      return;
    }
    const queriedRosterId = checkingRecovery ? activeSharedRosterId : collaboratorRosterId;
    let cancelled = false;
    setWorkspaceClosureLoading(true);
    setWorkspaceClosureError("");
    void getSharedWorkspaceClosureState(queriedRosterId)
      .then((state) => {
        if (!cancelled) setWorkspaceClosureState(state);
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceClosureState(null);
          setWorkspaceClosureError(checkingRecovery ? "" : friendlyFirestoreError(error, t));
        }
      })
      .finally(() => {
        if (!cancelled) setWorkspaceClosureLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    canRequestWorkspaceClosure,
    user,
    canLeaveActiveWorkspace,
    collaboratorRosterId,
    collaboratorRoster?.id,
    activeSharedRosterId,
    activeSharedRoster,
  ]);

  const recentRemovalResults = removalProposals
    .filter((proposal) => proposal.status !== "open")
    .slice(0, 3);
  const removalGovernancePanel = collaboratorGroup && canUseActiveGovernance ? (
    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <div className="min-w-0">
          <div className="text-xs font-black text-[#102A43]">{t("shared.publish.governance.title")}</div>
          <div className="mt-0.5 text-[10px] font-semibold leading-snug text-slate-500">
            {t("shared.publish.governance.secretBallotHelp")}
          </div>
        </div>
      </div>

      {removalError && (
        <div className="rounded-xl bg-rose-50 px-2.5 py-2 text-[10px] font-bold leading-snug text-rose-700">
          {removalError}
        </div>
      )}

      {!currentRemovalEligibility.eligible && (
        <div className="rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-bold leading-snug text-slate-600">
          {removalEligibilityLabel
            ? t("shared.publish.governance.availableOn", { date: removalEligibilityLabel })
            : t("shared.publish.governance.unavailable")}
        </div>
      )}

      {activeRemovalProposal ? (
        <div className="grid gap-2 rounded-xl bg-violet-50/80 p-2.5">
          <div className="min-w-0">
            <div className="break-words text-xs font-black text-[#102A43]">
              {t("shared.publish.governance.removeTarget", { name: activeRemovalProposal.targetDisplayNameSnapshot })}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-violet-800">
              {t("shared.publish.governance.turnout", {
                cast: activeRemovalProposal.castCount,
                eligible: activeRemovalProposal.eligibleOrganizerCount,
                required: activeRemovalProposal.requiredYes,
                total: activeRemovalProposal.totalOrganizerCount,
              })}
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
              {t("shared.publish.governance.targetCannotVote")}
            </div>
          ) : removalParticipation == null ? (
            <div className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("shared.publish.governance.checkingEligibility")}
            </div>
          ) : removalParticipation.hasVoted ? (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold leading-snug text-emerald-700">
              {t("shared.publish.governance.ballotRecordedImmutable")}
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
                {t("shared.publish.governance.yesRemove")}
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
                {t("shared.publish.governance.noKeep")}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold leading-snug text-slate-600">
              {t("shared.publish.governance.notEligible")}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-semibold leading-snug text-slate-500">
          {currentRemovalEligibility.eligible
            ? t("shared.publish.governance.startHelp")
            : t("shared.publish.governance.activationHelp")}
        </div>
      )}

      {recentRemovalResults.length > 0 && (
        <div className="grid gap-1.5">
          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t("shared.publish.governance.recentResults")}</div>
          {recentRemovalResults.map((proposal) => (
            <div key={proposal.id} className="rounded-xl bg-slate-50 px-2.5 py-2">
              <div className="break-words text-[10px] font-black text-[#102A43]">
                {t("shared.publish.governance.resultLabel", {
                  name: proposal.targetDisplayNameSnapshot,
                  status: proposal.status === "passed"
                    ? t("shared.publish.governance.resultRemoved")
                    : proposal.status === "failed"
                      ? t("shared.publish.governance.resultNotRemoved")
                      : t("shared.publish.governance.resultCancelled"),
                })}
              </div>
              <div className="mt-0.5 text-[9px] font-semibold leading-snug text-slate-500">
                {proposal.status === "cancelled"
                  ? t("shared.publish.governance.cancelledBallots", {
                      ballots: t("shared.publish.governance.ballotCount", { count: proposal.castCount }),
                    })
                  : t("shared.publish.governance.resultCounts", {
                      yes: proposal.yesCount ?? 0,
                      no: proposal.noCount ?? 0,
                      required: proposal.requiredYes,
                    })}
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
              ? t("shared.publish.governance.confirmProposalTitle", { name: removalConfirm.targetName })
              : t("shared.publish.governance.confirmBallotTitle", {
                  choice: removalConfirm?.choice === "yes" ? t("common.yes") : t("common.no"),
                })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {removalConfirm?.kind === "propose" ? (
              t("shared.publish.governance.confirmProposalDescription")
            ) : (
              t("shared.publish.governance.confirmBallotDescription", {
                effect: removalConfirm?.choice === "yes"
                  ? t("shared.publish.governance.yesVoteEffect")
                  : t("shared.publish.governance.noVoteEffect"),
              })
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmOrganizerRemovalAction}
            className={removalConfirm?.kind === "propose" || removalConfirm?.choice === "yes"
              ? "bg-rose-600 text-white hover:bg-rose-700"
              : "bg-violet-600 text-white hover:bg-violet-700"}
          >
            {removalConfirm?.kind === "propose"
              ? t("shared.publish.governance.startVote")
              : removalConfirm?.choice === "yes"
                ? t("shared.publish.governance.recordYes")
                : t("shared.publish.governance.recordNo")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </StripesConfirmContent>
    </AlertDialog>
  );


  const collaboratorsModal = collaboratorRoster ? modalShell(t("shared.publish.organizers.title"), () => setCollaboratorRosterId(""), (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
        {t("shared.publish.organizers.description")}
      </div>

      {canManageInvitations ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" className="h-10 rounded-2xl border border-violet-100 bg-white px-3 text-sm font-bold outline-none" placeholder={t("shared.publish.organizers.emailPlaceholder")} />
          <Button type="button" className="h-10 rounded-2xl bg-violet-600 px-3 text-xs font-black text-white hover:bg-violet-700" onClick={() => void handleInvite()} disabled={!inviteEmail.trim() || Boolean(busy)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t("shared.publish.organizers.invite")}
          </Button>
        </div>
      ) : canManageCollaborators && senderInvitationStatus === "verification_required" ? (
        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-black text-amber-900">{t("shared.publish.organizers.verifyBeforeInvite")}</div>
          <div className="text-[10px] font-semibold leading-snug text-amber-800">
            {t("shared.publish.organizers.verificationReturnHelp")}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-9 whitespace-normal rounded-xl border-amber-200 bg-white px-2 text-[10px] font-black text-amber-900" onClick={() => void handleSendOrganizerVerification()} disabled={Boolean(busy) || Boolean(senderVerificationCooldownLabel)}>
              <Mail className="h-3.5 w-3.5" />
              {busy === "organizer-verification-email" ? t("shared.publish.organizers.sending") : t("shared.publish.organizers.sendVerification")}
            </Button>
            <Button type="button" className="min-h-9 whitespace-normal rounded-xl bg-violet-600 px-2 text-[10px] font-black text-white hover:bg-violet-700" onClick={() => void handleRefreshOrganizerVerification()} disabled={Boolean(busy)}>
              {busy === "organizer-verification-refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {t("shared.publish.organizers.verifiedContinue")}
            </Button>
          </div>
          {senderVerificationCooldownLabel && <div className="text-[10px] font-bold text-amber-800">{senderVerificationCooldownLabel}</div>}
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold leading-snug text-slate-500">
          {t("shared.publish.organizers.readOnlyHelp")}
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
            {t("shared.publish.organizers.equalAccessHelp")}
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
                const label = displayNameForEmail(email, memberNamesByEmail, user?.email, t);
                const isCurrentUser = normalizedEmail === (user?.email || "").trim().toLowerCase();
                return (
                  <div key={email} className="grid gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-[#102A43] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate">{label}</div>
                      <div className="truncate text-[10px] text-slate-500">{email}</div>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 sm:justify-end">
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${isCurrentUser ? "bg-violet-100 text-violet-700" : "bg-white text-slate-500"}`}>
                        {isCurrentUser ? t("shared.publish.you") : t("shared.publish.organizer")}
                      </span>
                      {canManageCollaborators && collaboratorGroup && !isCurrentUser && (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-8 min-w-0 flex-1 whitespace-normal rounded-xl border-rose-100 bg-white px-2 text-[9px] font-black leading-tight text-rose-700 sm:flex-none"
                          disabled={Boolean(busy) || Boolean(activeRemovalProposal) || !currentRemovalEligibility.eligible}
                          onClick={() => setRemovalConfirm({
                            kind: "propose",
                            targetEmail: email,
                            targetName: label,
                          })}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          {activeRemovalProposal
                            ? t("shared.publish.organizers.voteOpen")
                            : currentRemovalEligibility.eligible
                              ? t("shared.publish.organizers.proposeRemoval")
                              : t("shared.publish.organizers.removalUnavailable")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {pendingInvitations.map((invitation) => {
                const deliveryLabel = invitation.state === "expired"
                  ? t("shared.publish.organizers.expired")
                  : invitation.deliveryStatus === "sent"
                    ? t("shared.publish.organizers.emailSent")
                    : invitation.deliveryStatus === "failed"
                      ? t("shared.publish.organizers.emailDeliveryFailed")
                      : invitation.deliveryStatus === "sending"
                        ? t("shared.publish.organizers.sendingEmail")
                        : t("shared.publish.organizers.emailNotSent");
                return (
                  <div key={invitation.invitationId || invitation.invitedEmail} className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-[#102A43]">
                    <div className="min-w-0">
                      <div className="truncate">{displayNameForEmail(invitation.invitedEmail, memberNamesByEmail, user?.email, t)}</div>
                      <div className="truncate text-[10px] text-amber-700">{t("shared.publish.organizers.pendingInvite", { email: invitation.invitedEmail })}</div>
                      <div className="text-[9px] font-black text-amber-600">{deliveryLabel}</div>
                    </div>
                    {canManageInvitations ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {invitation.state === "expired" || !invitation.invitationId ? (
                          <Button type="button" variant="outline" className="h-8 rounded-xl border-amber-200 bg-white px-2 text-[9px] font-black text-amber-800" onClick={() => void handleInvite(invitation.invitedEmail)} disabled={Boolean(busy)}>
                            {t("shared.publish.organizers.sendEmail")}
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" className="h-8 rounded-xl border-amber-200 bg-white px-2 text-[9px] font-black text-amber-800" onClick={() => void handleResendInvite(invitation)} disabled={Boolean(busy)}>
                            {t("shared.publish.organizers.resend")}
                          </Button>
                        )}
                        <button type="button" onClick={() => void handleCancelInvite(invitation)} className="rounded-full bg-white p-1.5 text-amber-700" disabled={Boolean(busy)} aria-label={t("shared.publish.organizers.cancelInvite", { email: invitation.invitedEmail })}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-700">{t("shared.publish.organizers.pending")}</span>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>

      {(onLeaveSharedRoster || onCloseSharedWorkspace) && canLeaveActiveWorkspace && (
        <div className="grid gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 p-3">
          <div>
            <div className="text-xs font-black text-rose-800">{t("shared.publish.closure.membershipTitle")}</div>
            <p className="mt-0.5 text-[10px] font-semibold leading-snug text-rose-700">
              {t("shared.publish.closure.leaveHelp")}
            </p>
          </div>
          {workspaceClosureState?.cleanupPending ? (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-black leading-snug text-rose-800">
              {t("shared.publish.closure.alreadyClosed")}
            </div>
          ) : workspaceClosureState?.isLastOrganizer && (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-black leading-snug text-rose-800">
              {t("shared.publish.closure.lastOrganizer")}
            </div>
          )}
          {workspaceClosureError && (
            <div className="rounded-xl bg-white px-2.5 py-2 text-[10px] font-bold leading-snug text-rose-700" role="alert">
              {workspaceClosureError}
            </div>
          )}
          {onLeaveSharedRoster && (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full rounded-2xl border-rose-200 bg-white text-xs font-black text-rose-700 hover:bg-rose-100 hover:text-rose-800"
              onClick={() => {
                setCollaboratorRosterId("");
                onLeaveSharedRoster();
              }}
              disabled={workspaceClosureLoading || workspaceClosureState?.isLastOrganizer || workspaceClosureState?.cleanupPending}
            >
              <UserMinus className="h-4 w-4" />
              {t("shared.publish.closure.leave")}
            </Button>
          )}
          {onCloseSharedWorkspace && (
            <>
              {!workspaceClosureLoading && workspaceClosureState && !workspaceClosureState.canClose && (
                <p className="text-[10px] font-semibold leading-snug text-rose-700">
                  {t("shared.publish.closure.closeRequirement")}
                </p>
              )}
              <Button
                type="button"
                className="h-10 w-full rounded-2xl bg-rose-700 text-xs font-black text-white hover:bg-rose-800"
                onClick={() => {
                  if (!workspaceClosureState?.canClose) return;
                  setCollaboratorRosterId("");
                  onCloseSharedWorkspace(workspaceClosureState);
                }}
                disabled={workspaceClosureLoading || !workspaceClosureState?.canClose}
              >
                {workspaceClosureLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {workspaceClosureState?.cleanupPending ? t("shared.publish.closure.finishCleanup") : t("shared.publish.closure.close")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )) : null;


  const backupHistoryModal = backupRosterId ? modalShell(
    t("shared.publish.backup.restoreTitle"),
    () => { setBackupRosterId(""); setSharedRosterBackups([]); },
    <div className="grid gap-2">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
        {t("shared.publish.backup.description")}
      </div>
      {sharedRosterBackups.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-500">
          {t("shared.publish.backup.empty")}
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
                  {backup.savedAtIso
                    ? formatDateTime(locale, new Date(backup.savedAtIso), {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : t("shared.publish.backup.version", { version: backup.version })}
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
                  {backup.savedByEmail
                    ? t("shared.publish.backup.playersAndSaver", {
                        players: t("common.playerCount", { count: backup.playerCount }),
                        name: displayNameForEmail(backup.savedByEmail, activeSharedRoster?.memberNamesByEmail, user?.email, t),
                      })
                    : t("common.playerCount", { count: backup.playerCount })}
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
    t("shared.publish.library.title"),
    () => setSharedRosterLibraryOpen(false),
    <div className="grid gap-2">
      {!user ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold leading-snug text-slate-500">
          {t("shared.publish.library.signIn")}
        </div>
      ) : sharedRosters.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold leading-snug text-slate-500">
          {t("shared.publish.library.empty")}
        </div>
      ) : (
        <>
          {linkedRosters.length === 0 ? (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
              {t("shared.publish.library.notOpenOnDevice")}
            </div>
          ) : null}
          <div className="grid max-h-[52svh] gap-1.5 overflow-y-auto pr-1">
            {sharedRosters.map((roster) => {
              const group = sharedGroups.find((item) => item.id === roster.groupId);
              const collaboratorCount = group ? Math.max(0, group.memberCount - 1) + (group.pendingInviteEmails?.length || 0) : Math.max(0, (roster.memberEmails?.length || 1) - 1) + (roster.pendingInviteEmails?.length || 0);
              const linked = linkedRosters.some((local) => local.cloudSource?.provider === "firebase" && local.cloudSource.firebaseRosterId === roster.id);
              const memberNamesByEmail = mergedMemberNames(group, roster);
              const savedByName = displayNameForEmail(roster.lastSavedByEmail || roster.ownerEmail, memberNamesByEmail, user?.email, t);
              return (
                <div key={`modal-${roster.id}`} className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-violet-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => { void handleOpenRoster(roster.id); setSharedRosterLibraryOpen(false); }} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{sharedRosterSummaryNameText(roster, t)}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">{t("shared.publish.library.savedBy", {
                      action: linked ? t("shared.publish.library.openOnDevice") : t("shared.publish.library.openSharedRoster"),
                      name: savedByName,
                    })}</span>
                  </button>
                  {canOpenRosterOrganizers(roster, group) ? (
                    <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl border border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm hover:bg-violet-50">
                      <Users className="h-3.5 w-3.5" />
                      {formatNumber(locale, collaboratorCount)}
                    </button>
                  ) : <span className="text-[10px] font-black text-slate-400">{formatNumber(locale, collaboratorCount)}</span>}
                </div>
              );
            })}
          </div>
          {activeSharedRoster && (onMakePrivateCopy || onHideOnDevice) ? (
            <div className="grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
              <div className="truncate text-[11px] font-black text-violet-800">
                {t("shared.publish.library.currentRoster", { name: sharedRosterSummaryNameText(activeSharedRoster, t) })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {onMakePrivateCopy ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                    onClick={() => { setSharedRosterLibraryOpen(false); onMakePrivateCopy?.(); }}
                  >
                    {t("shared.publish.library.privateCopy")}
                  </Button>
                ) : <div />}
                {onHideOnDevice ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                    onClick={() => { setSharedRosterLibraryOpen(false); onHideOnDevice?.(); }}
                  >
                    {t("shared.publish.library.hideOnDevice")}
                  </Button>
                ) : <div />}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>,
  ) : null;

  const workspaceClosureRecoveryPanel = workspaceClosureState?.cleanupPending && onCloseSharedWorkspace ? (
    <div className="grid gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
      <div>
        <div className="text-xs font-black text-rose-900">{t("shared.publish.closure.cleanupPending")}</div>
        <p className="mt-0.5 text-[10px] font-semibold leading-snug text-rose-800">
          {t("shared.publish.closure.cleanupWorkspace", { name: workspaceClosureState.workspaceName })}
        </p>
      </div>
      <Button
        type="button"
        className="h-10 rounded-2xl bg-rose-700 text-xs font-black text-white hover:bg-rose-800"
        onClick={() => onCloseSharedWorkspace(workspaceClosureState)}
      >
        <Trash2 className="h-4 w-4" />
        {t("shared.publish.closure.finishCleanup")}
      </Button>
    </div>
  ) : null;

  const activeAuthorityText = activeSharedWorkspaceAuthorityText(activeAuthority, t);
  const activeSharedReferenceUnresolved = Boolean(
    activeSharedRosterId && activeAuthority.status !== "authorized",
  );
  const activeAuthorityPanel = activeSharedReferenceUnresolved ? (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800" role="status">
      {activeAuthorityText || t("shared.publish.authorityUnconfirmed")}
    </div>
  ) : null;


  if (variant === "compact") {
    return (
      <div className="grid gap-2">
        {workspaceClosureRecoveryPanel}
        {activeAuthorityPanel}
        {activeSharedRoster && (
          <SharedRosterAutosyncStatus
            snapshot={activeAutosync}
            onRetry={() => void activeAutosync.retry()}
          />
        )}
        {incomingInvites.length > 0 && (
          <div className="grid gap-1.5">
            {incomingInvites.slice(0, 2).map((invite) => (
              <div key={invite.invitationId} className="flex items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-2">
                <div className="min-w-0 truncate text-xs font-black text-[#102A43]">{t("shared.publish.invitation.compactTitle", { workspace: invite.workspaceName })}</div>
                <Button type="button" variant="outline" className="h-8 rounded-xl border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700" onClick={() => handleAcceptInvite(invite.invitationId)} disabled={Boolean(busy) || invite.state !== "pending"}>
                  {busy === `accept:${invite.invitationId}` ? "…" : invite.state === "expired" ? t("shared.publish.organizers.expired") : t("shared.publish.invitation.accept")}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!activeSharedRoster ? activeSharedReferenceUnresolved ? (
          <Button type="button" variant="outline" className="h-9 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => setSharedRosterLibraryOpen(true)} disabled={!user || Boolean(busy)}>
            <FolderOpen className="mr-1.5 h-4 w-4" />
            {t("shared.publish.rosters")}
          </Button>
        ) : (
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="h-9 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => setSharedRosterLibraryOpen(true)} disabled={!user || Boolean(busy)}>
              <FolderOpen className="mr-1.5 h-4 w-4" />
              {t("shared.publish.rosters")}
            </Button>
            <Button type="button" className="h-9 justify-start rounded-2xl bg-violet-600 px-3 text-left text-[11px] font-black text-white hover:bg-violet-700" onClick={handleShareActiveRoster} disabled={!user || isEmptyRoster || Boolean(busy)}>
              <Share2 className="mr-1.5 h-4 w-4" />
              {busy === "publish" ? t("shared.publish.creating") : t("shared.publish.createSharedCopy")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-full min-h-11 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => setSharedRosterLibraryOpen(true)} disabled={!user || Boolean(busy)}>
              <FolderOpen className="mr-1 h-4 w-4" />
              {t("shared.publish.rosters")}
            </Button>
            {activeAuthority.capabilities.canUseClubAccess ? (
              <Button type="button" variant="outline" className="h-full min-h-11 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => openCollaborators(activeSharedRosterId)} disabled={!user || Boolean(busy)}>
                <Users className="mr-1 h-4 w-4" />
                {t("shared.publish.organizers.title")}
              </Button>
            ) : <div />}
            {activeAuthority.capabilities.canRestoreSharedRosterBackup && (
              <Button type="button" variant="outline" className="col-span-2 h-10 justify-start rounded-2xl border-violet-100 bg-white/70 px-3 text-left text-[11px] font-black text-violet-700 shadow-sm hover:bg-white" onClick={() => void openBackupHistory(activeSharedRosterId)} disabled={!user || Boolean(busy)}>
                <History className="mr-1.5 h-4 w-4" />
                {t("shared.publish.backup.restoreTitle")}
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
      {workspaceClosureRecoveryPanel}
      {activeAuthorityPanel}
      {incomingInvites.length > 0 && (
        <div className="grid gap-1.5 rounded-2xl border border-violet-100 bg-violet-50/70 p-2">
          {incomingInvites.slice(0, 3).map((invite) => (
            <div key={invite.invitationId} className="flex items-center justify-between gap-2 rounded-xl bg-white px-2 py-2">
              <div className="min-w-0 truncate text-xs font-black text-[#102A43]">{invite.workspaceName}</div>
              <Button type="button" variant="outline" className="h-8 rounded-xl border-violet-100 px-2 text-[10px] font-black text-violet-700" onClick={() => handleAcceptInvite(invite.invitationId)} disabled={Boolean(busy) || invite.state !== "pending"}>
                {busy === `accept:${invite.invitationId}` ? t("shared.publish.invitation.accepting") : invite.state === "expired" ? t("shared.publish.organizers.expired") : t("shared.publish.invitation.accept")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!activeSharedRoster ? activeSharedReferenceUnresolved ? null : (
        <Button type="button" className="h-11 rounded-2xl bg-violet-600 text-xs font-black text-white hover:bg-violet-700" onClick={handleShareActiveRoster} disabled={!user || isEmptyRoster || Boolean(busy)}>
          <Share2 className="mr-1.5 h-4 w-4" />
          {busy === "publish" ? t("shared.publish.creating") : t("shared.publish.createSharedCopy")}
        </Button>
      ) : (
        <div className="grid gap-2">
          <SharedRosterAutosyncStatus
            snapshot={activeAutosync}
            onRetry={() => void activeAutosync.retry()}
          />
          {activeAuthority.capabilities.canRestoreSharedRosterBackup && (
            <Button type="button" variant="outline" className="h-10 justify-start rounded-2xl border-violet-100 bg-white px-3 text-xs font-black text-violet-700" onClick={() => void openBackupHistory(activeSharedRosterId)} disabled={Boolean(busy)}>
              <History className="mr-1.5 h-4 w-4" />
              {t("shared.publish.backup.restoreTitle")}
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <div className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{t("shared.publish.library.title")}</div>
        {sharedRosters.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-snug text-slate-500">
            {t("shared.publish.full.empty")}
          </div>
        ) : (
          <>
            {linkedRosters.length === 0 ? (
              <div className="mb-2 rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
                {t("shared.publish.full.notOpenOnDevice")}
              </div>
            ) : null}
            <div className="grid gap-1.5">
            {sharedRosters.slice(0, 10).map((roster) => {
              const group = sharedGroups.find((item) => item.id === roster.groupId);
              const collaboratorCount = group ? Math.max(0, group.memberCount - 1) + (group.pendingInviteEmails?.length || 0) : Math.max(0, (roster.memberEmails?.length || 1) - 1) + (roster.pendingInviteEmails?.length || 0);
              const linked = linkedRosters.some((local) => local.cloudSource?.provider === "firebase" && local.cloudSource.firebaseRosterId === roster.id);
              const memberNamesByEmail = mergedMemberNames(group, roster);
              const savedByName = displayNameForEmail(roster.lastSavedByEmail || roster.ownerEmail, memberNamesByEmail, user?.email, t);
              return (
                <div key={roster.id} className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl px-3 py-2 ${linked ? "bg-violet-50" : "bg-slate-50"}`}>
                  <button type="button" onClick={() => handleOpenRoster(roster.id)} disabled={Boolean(busy)} className="min-w-0 text-left active:scale-[0.99]">
                    <span className="block truncate text-xs font-black text-[#102A43]">{sharedRosterSummaryNameText(roster, t)}</span>
                    <span className="block truncate text-[10px] font-semibold text-slate-500">{t("shared.publish.full.savedBy", { name: savedByName })}</span>
                  </button>
                  {canOpenRosterOrganizers(roster, group) ? (
                    <button type="button" onClick={() => openCollaborators(roster.id)} className="flex h-8 items-center gap-1 rounded-xl border border-violet-100 bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm hover:bg-violet-50">
                      <Users className="h-3.5 w-3.5" />
                      {formatNumber(locale, collaboratorCount)}
                    </button>
                  ) : <span className="text-[10px] font-black text-slate-400">{formatNumber(locale, collaboratorCount)}</span>}
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
