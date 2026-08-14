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
