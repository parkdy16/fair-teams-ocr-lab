import {
  getIdTokenResult,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  type ActionCodeSettings,
} from "firebase/auth";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
import {
  sharedRosterUserWithTokenVerification,
} from "@/lib/sharedRosterAuthState";
import {
  toSharedRosterUser,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import { cleanWorkspaceInvitationId } from "@/lib/workspaceInvitationOnboardingState";
export {
  cleanWorkspaceInvitationId,
  requireRefreshedWorkspaceInvitationSender,
  workspaceInvitationSenderStatus,
  type WorkspaceInvitationSenderStatus,
} from "@/lib/workspaceInvitationOnboardingState";

const STRIPES_APP_URL = "https://stripes.work/app";

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
  const tokenResult = await getIdTokenResult(user, true);
  const refreshedUser = toSharedRosterUser(getFairTeamsAuth().currentUser || user);
  if (!refreshedUser) throw new Error("Firebase did not return an account email.");
  return sharedRosterUserWithTokenVerification(refreshedUser, tokenResult.claims);
}
