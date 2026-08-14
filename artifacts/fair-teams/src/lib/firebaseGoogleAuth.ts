import {
  GoogleAuthProvider,
  getIdTokenResult,
  linkWithCredential,
  reload,
  signInWithPopup,
  type AuthCredential,
  type AuthError,
  type User,
} from "firebase/auth";
import { getFairTeamsAuth } from "@/lib/firebaseClient";
import {
  sharedRosterUserWithTokenVerification,
  toSharedRosterUser,
  type SharedRosterUser,
} from "@/lib/sharedRosterAuthState";
import {
  StripesGoogleAuthError,
  googleLinkPreservesUid,
  googleAuthError,
  pendingGoogleLinkDecision,
} from "@/lib/firebaseGoogleAuthPolicy";
export {
  GOOGLE_FIREBASE_PROVIDER_ID,
  STRIPES_GOOGLE_AUTH_FLOW,
  STRIPES_GOOGLE_IDENTITY_SCOPES,
  StripesGoogleAuthError,
  googleAuthError,
  googleLinkPreservesUid,
  hasGoogleProvider,
  pendingGoogleLinkDecision,
} from "@/lib/firebaseGoogleAuthPolicy";

const PENDING_GOOGLE_LINK_MAX_AGE_MS = 10 * 60 * 1000;
type PendingGoogleLink = {
  credential: AuthCredential;
  email: string;
  createdAt: number;
};
let pendingGoogleLink: PendingGoogleLink | null = null;

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

async function refreshedSharedRosterUser(user: User) {
  await reload(user);
  const tokenResult = await getIdTokenResult(user, true);
  const sharedUser = toSharedRosterUser(getFairTeamsAuth().currentUser || user);
  if (!sharedUser) throw new StripesGoogleAuthError("unavailable", "Google did not return an account email.");
  return sharedRosterUserWithTokenVerification(sharedUser, tokenResult.claims);
}

export async function signInToSharedRostersWithGoogle(): Promise<SharedRosterUser> {
  clearPendingGoogleLinkCredential();
  try {
    const result = await signInWithPopup(getFairTeamsAuth(), googleProvider());
    return await refreshedSharedRosterUser(result.user);
  } catch (error) {
    const authError = error as AuthError;
    if (String(authError?.code || "").toLowerCase().includes("account-exists-with-different-credential")) {
      const credential = GoogleAuthProvider.credentialFromError(authError);
      const email = String(authError.customData?.email || "").trim().toLowerCase();
      if (credential && email) {
        pendingGoogleLink = { credential, email, createdAt: Date.now() };
      }
    }
    throw googleAuthError(error);
  }
}

function activePendingGoogleLink() {
  if (pendingGoogleLink && pendingGoogleLink.createdAt + PENDING_GOOGLE_LINK_MAX_AGE_MS > Date.now()) {
    return pendingGoogleLink;
  }
  pendingGoogleLink = null;
  return null;
}

export function hasPendingGoogleLinkCredential() {
  return Boolean(activePendingGoogleLink());
}

export function clearPendingGoogleLinkCredential() {
  pendingGoogleLink = null;
}

export async function completePendingGoogleLinkForCurrentUser(): Promise<{
  linked: boolean;
  user: SharedRosterUser;
}> {
  const currentUser = getFairTeamsAuth().currentUser;
  if (!currentUser?.email) {
    throw new StripesGoogleAuthError("unavailable", "Sign in with your existing Stripes method first.");
  }
  const pending = activePendingGoogleLink();
  if (!pending) return { linked: false, user: await refreshedSharedRosterUser(currentUser) };
  if (pendingGoogleLinkDecision(pending.email, currentUser.email) !== "link") {
    throw new StripesGoogleAuthError(
      "wrong_existing_email",
      "Sign out and use the existing Stripes account with the same email as the Google account.",
    );
  }
  const originalUid = currentUser.uid;
  const originalEmail = currentUser.email.trim().toLowerCase();
  try {
    const result = await linkWithCredential(currentUser, pending.credential);
    if (!googleLinkPreservesUid(originalUid, result.user.uid)
      || result.user.email?.trim().toLowerCase() !== originalEmail) {
      throw new StripesGoogleAuthError("unavailable", "Google sign-in could not be connected safely.");
    }
    pendingGoogleLink = null;
    return { linked: true, user: await refreshedSharedRosterUser(result.user) };
  } catch (error) {
    throw googleAuthError(error);
  }
}
