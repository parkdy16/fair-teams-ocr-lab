export type WorkspaceInvitationOnboardingView =
  | "loading"
  | "unavailable"
  | "expired"
  | "cancelled"
  | "accepted"
  | "auth_choice"
  | "wrong_account"
  | "verification_required"
  | "join_ready";

const OPAQUE_INVITATION_ID = /^[A-Za-z0-9_-]{16,200}$/;

export function cleanWorkspaceInvitationId(value: string) {
  const invitationId = value.trim();
  if (!OPAQUE_INVITATION_ID.test(invitationId)) {
    throw new Error("Choose a valid organizer invitation.");
  }
  return invitationId;
}

export type WorkspaceInvitationQuery = {
  invitationId: string | null;
  invalidInvitation: boolean;
};

export function workspaceInvitationQueryFromUrl(value: string): WorkspaceInvitationQuery {
  let url: URL;
  try {
    url = new URL(value, "https://stripes.work");
  } catch {
    return { invitationId: null, invalidInvitation: false };
  }

  const invitationValues = url.searchParams.getAll("invite");
  if (invitationValues.length === 0) {
    return { invitationId: null, invalidInvitation: false };
  }
  if (invitationValues.length !== 1) {
    return { invitationId: null, invalidInvitation: true };
  }

  try {
    return {
      invitationId: cleanWorkspaceInvitationId(invitationValues[0]),
      invalidInvitation: false,
    };
  } catch {
    return { invitationId: null, invalidInvitation: true };
  }
}

export function urlWithoutWorkspaceInvitation(value: string) {
  const url = new URL(value, "https://stripes.work");
  url.searchParams.delete("invite");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function workspaceInvitationSuppressesGuidedTour(invitationId: string | null) {
  return Boolean(invitationId);
}

export async function openAcceptedWorkspaceInvitation({
  rosterIds,
  openRoster,
  onOpened,
}: {
  rosterIds: string[];
  openRoster: (rosterId: string) => void | Promise<void>;
  onOpened: (rosterId: string) => void;
}) {
  const candidateIds = Array.from(new Set(rosterIds.map((id) => id.trim()).filter(Boolean)));
  let lastError: unknown;

  for (const rosterId of candidateIds) {
    try {
      await openRoster(rosterId);
    } catch (error) {
      lastError = error;
      continue;
    }
    onOpened(rosterId);
    return rosterId;
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("The joined workspace does not have an available roster yet.");
}

export type WorkspaceInvitationOnboardingContextState = {
  state: "pending" | "expired" | "cancelled" | "accepted";
  viewerStatus:
    | "signed_out"
    | "wrong_email"
    | "matching_unverified"
    | "matching_verified";
};

export const PASSWORD_RESET_CONFIRMATION =
  "If an account exists for that email, check your inbox.";

export function resolveWorkspaceInvitationOnboardingView({
  loading,
  unavailable,
  context,
}: {
  loading: boolean;
  unavailable: boolean;
  context: WorkspaceInvitationOnboardingContextState | null;
}): WorkspaceInvitationOnboardingView {
  if (loading) return "loading";
  if (unavailable || !context) return "unavailable";
  if (context.state === "expired") return "expired";
  if (context.state === "cancelled") return "cancelled";
  if (context.state === "accepted") return "accepted";
  if (context.viewerStatus === "signed_out") return "auth_choice";
  if (context.viewerStatus === "wrong_email") return "wrong_account";
  if (context.viewerStatus === "matching_unverified") return "verification_required";
  return "join_ready";
}

export function canSubmitWorkspaceInvitationJoin(
  view: WorkspaceInvitationOnboardingView,
  submissionPending: boolean,
) {
  return view === "join_ready" && !submissionPending;
}

export type WorkspaceInvitationSenderStatus =
  | "signed_out"
  | "verification_required"
  | "ready";

export function workspaceInvitationSenderStatus(
  user: { emailVerified: boolean } | null,
): WorkspaceInvitationSenderStatus {
  if (!user) return "signed_out";
  return user.emailVerified ? "ready" : "verification_required";
}

export async function requireRefreshedWorkspaceInvitationSender<
  T extends { emailVerified: boolean },
>(refreshIdentity: () => Promise<T | null>): Promise<T> {
  const user = await refreshIdentity();
  if (!user) throw new Error("Sign in before managing organizer invitations.");
  if (!user.emailVerified) throw new Error("Verify your Stripes account email before continuing.");
  return user;
}

export function resolveWorkspaceInvitationManagementGroupId({
  loadedGroupId,
  rosterGroupId,
  sourceGroupId,
}: {
  loadedGroupId?: string | null;
  rosterGroupId?: string | null;
  sourceGroupId?: string | null;
}) {
  return [rosterGroupId, loadedGroupId, sourceGroupId]
    .map((value) => value?.trim() || "")
    .find(Boolean) || null;
}
