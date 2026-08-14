import {
  getIdToken,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  type ActionCodeSettings,
} from "firebase/auth";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
import {
  toSharedRosterUser,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";

const STRIPES_APP_URL = "https://stripes.work/app";
const OPAQUE_INVITATION_ID = /^[A-Za-z0-9_-]{16,200}$/;

export type WorkspaceInvitationSenderStatus =
  | "signed_out"
  | "verification_required"
  | "ready";

export function cleanWorkspaceInvitationId(value: string) {
  const invitationId = value.trim();
  if (!OPAQUE_INVITATION_ID.test(invitationId)) {
    throw new Error("Choose a valid organizer invitation.");
  }
  return invitationId;
}

export function workspaceInvitationContinuationUrl(invitationId?: string) {
  if (!invitationId) return STRIPES_APP_URL;
  const safeInvitationId = cleanWorkspaceInvitationId(invitationId);
  return `${STRIPES_APP_URL}?invite=${encodeURIComponent(safeInvitationId)}`;
}

export function workspaceInvitationActionCodeSettings(
  invitationId?: string,
): ActionCodeSettings {
  return {
    url: workspaceInvitationContinuationUrl(invitationId),
    handleCodeInApp: false,
  };
}

export function workspaceInvitationSenderStatus(
  user: SharedRosterUser | null,
): WorkspaceInvitationSenderStatus {
  if (!user) return "signed_out";
  return user.emailVerified ? "ready" : "verification_required";
}

function requireCurrentUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user) throw new Error("Sign in to continue.");
  return user;
}

export async function sendStripesEmailVerification(invitationId?: string) {
  await sendEmailVerification(
    requireCurrentUser(),
    workspaceInvitationActionCodeSettings(invitationId),
  );
}

export async function sendStripesPasswordResetEmail(
  email: string,
  invitationId?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Enter your email address.");
  await sendPasswordResetEmail(
    getFairTeamsAuth(),
    normalizedEmail,
    workspaceInvitationActionCodeSettings(invitationId),
  );
}

export async function reloadAndRefreshStripesAuthIdentity(): Promise<SharedRosterUser> {
  const user = requireCurrentUser();
  await reload(user);
  await getIdToken(user, true);
  const refreshedUser = toSharedRosterUser(getFairTeamsAuth().currentUser || user);
  if (!refreshedUser) throw new Error("Firebase did not return an account email.");
  return refreshedUser;
}
