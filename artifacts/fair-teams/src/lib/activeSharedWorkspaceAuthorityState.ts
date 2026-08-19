import type {
  FirebaseSharedGroupSummary,
  FirebaseSharedRosterSummary,
  FirebaseSharedWorkspaceAuthoritySnapshot,
  SharedRosterRole,
  SharedRosterUser,
} from "./sharedRosterService.ts";

export type ActiveSharedWorkspaceAuthorityStatus =
  | "local_only"
  | "signed_out"
  | "loading"
  | "authorized"
  | "access_lost"
  | "unavailable";

export type ActiveSharedWorkspaceReference = {
  localRosterId: string;
  firebaseRosterId?: string;
  cachedFirebaseGroupId?: string;
};

export type ActiveSharedWorkspaceCapabilities = {
  canReadSharedRoster: boolean;
  canEditSharedRoster: boolean;
  canRestoreSharedRosterBackup: boolean;
  canUseClubAccess: boolean;
  canManageOrganizers: boolean;
  canManageInvitations: boolean;
  canLeaveWorkspace: boolean;
  canUseProtectedGovernance: boolean;
  canUseFileCabinet: boolean;
  canReadEquipment: boolean;
  canEditEquipment: boolean;
  canReadAttendance: boolean;
  canEditAttendance: boolean;
  canReadClubRatings: boolean;
  canRatePlayer: boolean;
  canReadActionBoard: boolean;
  canEditActionBoard: boolean;
  canVoteActionBoard: boolean;
  canNotifyActionBoard: boolean;
  canReadClubResources: boolean;
  canEditClubResources: boolean;
  canUseClubNotes: boolean;
};

export type ActiveSharedWorkspaceAuthority = {
  contextKey: string;
  status: ActiveSharedWorkspaceAuthorityStatus;
  user: SharedRosterUser | null;
  reference: ActiveSharedWorkspaceReference;
  roster: FirebaseSharedRosterSummary | null;
  group: FirebaseSharedGroupSummary | null;
  rosterRole?: SharedRosterRole;
  groupRole?: SharedRosterRole;
  authoritativeRosterId?: string;
  authoritativeGroupId?: string;
  issues: string[];
  error?: string;
  capabilities: ActiveSharedWorkspaceCapabilities;
};

export const NO_ACTIVE_SHARED_WORKSPACE_CAPABILITIES: ActiveSharedWorkspaceCapabilities = {
  canReadSharedRoster: false,
  canEditSharedRoster: false,
  canRestoreSharedRosterBackup: false,
  canUseClubAccess: false,
  canManageOrganizers: false,
  canManageInvitations: false,
  canLeaveWorkspace: false,
  canUseProtectedGovernance: false,
  canUseFileCabinet: false,
  canReadEquipment: false,
  canEditEquipment: false,
  canReadAttendance: false,
  canEditAttendance: false,
  canReadClubRatings: false,
  canRatePlayer: false,
  canReadActionBoard: false,
  canEditActionBoard: false,
  canVoteActionBoard: false,
  canNotifyActionBoard: false,
  canReadClubResources: false,
  canEditClubResources: false,
  canUseClubNotes: false,
};

export function isAuthoritativeOrganizerRole(role?: SharedRosterRole) {
  return role === "owner" || role === "editor" || role === "organizer";
}

export function activeSharedWorkspaceContextKey(
  reference: ActiveSharedWorkspaceReference,
  userUid?: string,
) {
  return [
    userUid || "signed-out",
    reference.localRosterId || "no-local-roster",
    reference.firebaseRosterId || "local-only",
  ].join("\u0000");
}

export function activeSharedWorkspaceResolutionIsCurrent(
  resolutionGeneration: number,
  currentGeneration: number,
  expectedContextKey: string,
  currentContextKey: string,
) {
  return resolutionGeneration === currentGeneration
    && expectedContextKey === currentContextKey;
}

function inactiveAuthority(
  reference: ActiveSharedWorkspaceReference,
  user: SharedRosterUser | null,
  status: ActiveSharedWorkspaceAuthorityStatus,
  error?: string,
): ActiveSharedWorkspaceAuthority {
  return {
    contextKey: activeSharedWorkspaceContextKey(reference, user?.uid),
    status,
    user,
    reference,
    roster: null,
    group: null,
    issues: [],
    error,
    capabilities: { ...NO_ACTIVE_SHARED_WORKSPACE_CAPABILITIES },
  };
}

export function unresolvedActiveSharedWorkspaceAuthority(
  reference: ActiveSharedWorkspaceReference,
  authReady: boolean,
  user: SharedRosterUser | null,
): ActiveSharedWorkspaceAuthority {
  if (!reference.firebaseRosterId) {
    return inactiveAuthority(reference, user, "local_only");
  }
  if (!authReady) {
    return inactiveAuthority(reference, user, "loading");
  }
  if (!user) {
    return inactiveAuthority(reference, null, "signed_out");
  }
  return inactiveAuthority(reference, user, "loading");
}

export function unavailableActiveSharedWorkspaceAuthority(
  reference: ActiveSharedWorkspaceReference,
  user: SharedRosterUser,
  error: unknown,
): ActiveSharedWorkspaceAuthority {
  return inactiveAuthority(
    reference,
    user,
    "unavailable",
    error instanceof Error ? error.message : "Could not verify shared workspace access.",
  );
}

export function resolveActiveSharedWorkspaceAuthority(
  reference: ActiveSharedWorkspaceReference,
  user: SharedRosterUser,
  snapshot: FirebaseSharedWorkspaceAuthoritySnapshot,
): ActiveSharedWorkspaceAuthority {
  const expectedContextKey = activeSharedWorkspaceContextKey(reference, user.uid);
  if (snapshot.userUid !== user.uid) {
    return inactiveAuthority(reference, user, "loading");
  }

  const rosterId = reference.firebaseRosterId || "";
  const roster = snapshot.rosters.find((candidate) => candidate.id === rosterId) || null;
  if (!roster) {
    return {
      ...inactiveAuthority(reference, user, "access_lost"),
      contextKey: expectedContextKey,
    };
  }

  const rawGroupId = roster.groupId;
  const normalizedGroupId = rawGroupId?.trim() || undefined;
  const groupIdMalformed = typeof rawGroupId === "string"
    && rawGroupId !== (normalizedGroupId || "");
  const authoritativeGroupId = groupIdMalformed ? undefined : normalizedGroupId;
  const group = authoritativeGroupId
    ? snapshot.groups.find((candidate) => candidate.id === authoritativeGroupId) || null
    : null;
  const rosterRole = roster.currentUserRole;
  const groupRole = group?.currentUserRole;
  const rosterOrganizer = isAuthoritativeOrganizerRole(rosterRole);
  const groupOrganizer = isAuthoritativeOrganizerRole(groupRole);
  const linked = Boolean(authoritativeGroupId);
  const dualOrganizer = !groupIdMalformed && rosterOrganizer && (!linked || groupOrganizer);
  const issues: string[] = [];
  const cachedGroupId = reference.cachedFirebaseGroupId?.trim() || undefined;

  if (groupIdMalformed) issues.push("authoritative_roster_group_id_malformed");
  if (linked && !group) issues.push("authoritative_group_membership_missing");
  if (cachedGroupId && cachedGroupId !== authoritativeGroupId) {
    issues.push("cached_group_id_differs_from_authoritative_roster");
  }
  if (group && rosterRole && groupRole && rosterRole !== groupRole) {
    issues.push("roster_group_roles_differ");
  }

  return {
    contextKey: expectedContextKey,
    status: "authorized",
    user,
    reference,
    roster,
    group,
    rosterRole,
    groupRole,
    authoritativeRosterId: roster.id,
    authoritativeGroupId,
    issues,
    capabilities: {
      canReadSharedRoster: true,
      // The current roster save transaction also updates its linked group.
      canEditSharedRoster: dualOrganizer,
      canRestoreSharedRosterBackup: rosterOrganizer,
      canUseClubAccess: !groupIdMalformed && (linked ? groupOrganizer : rosterOrganizer),
      canManageOrganizers: !groupIdMalformed && (linked ? groupOrganizer : rosterOrganizer),
      canManageInvitations: !groupIdMalformed && linked && groupOrganizer,
      canLeaveWorkspace: dualOrganizer,
      canUseProtectedGovernance: !groupIdMalformed && linked && groupOrganizer,
      canUseFileCabinet: !groupIdMalformed && (linked ? groupOrganizer : rosterOrganizer),
      canReadEquipment: true,
      canEditEquipment: rosterOrganizer,
      canReadAttendance: true,
      canEditAttendance: rosterOrganizer,
      canReadClubRatings: true,
      canRatePlayer: true,
      canReadActionBoard: true,
      canEditActionBoard: rosterOrganizer,
      canVoteActionBoard: rosterOrganizer,
      canNotifyActionBoard: rosterOrganizer,
      canReadClubResources: true,
      canEditClubResources: rosterOrganizer,
      canUseClubNotes: true,
    },
  };
}

export function activeSharedWorkspaceAuthorityMessage(
  authority: ActiveSharedWorkspaceAuthority,
) {
  if (authority.status === "signed_out") return "Sign in to check this shared workspace.";
  if (authority.status === "loading") return "Checking shared workspace access…";
  if (authority.status === "access_lost") return "This account no longer has access to this shared workspace.";
  if (authority.status === "unavailable") return "Shared workspace access is temporarily unavailable.";
  if (authority.issues.includes("authoritative_roster_group_id_malformed")) {
    return "Roster access is confirmed, but its linked club reference is invalid.";
  }
  if (authority.issues.includes("authoritative_group_membership_missing")) {
    return "Roster access is confirmed, but linked club access is unavailable for this account.";
  }
  return "";
}
