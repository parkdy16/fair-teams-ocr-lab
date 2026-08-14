import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  GOOGLE_FIREBASE_PROVIDER_ID,
  STRIPES_GOOGLE_AUTH_FLOW,
  STRIPES_GOOGLE_IDENTITY_SCOPES,
  googleLinkPreservesUid,
  googleAuthError,
  hasGoogleProvider,
  pendingGoogleLinkDecision,
} from "./firebaseGoogleAuthPolicy.ts";
import { toSharedRosterUser } from "./sharedRosterAuthState.ts";
import { resolveWorkspaceInvitationOnboardingView } from "./workspaceInvitationOnboardingState.ts";

test("Google authentication uses popup and identity-only scopes", () => {
  assert.equal(STRIPES_GOOGLE_AUTH_FLOW, "popup");
  assert.deepEqual([...STRIPES_GOOGLE_IDENTITY_SCOPES], ["openid", "email", "profile"]);
  assert.equal(STRIPES_GOOGLE_IDENTITY_SCOPES.some((scope) => /drive/i.test(scope)), false);
  const source = fs.readFileSync(new URL("./firebaseGoogleAuth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /googleapis\.com\/auth\/drive|drive\.file/i);
});

test("Google users enter the existing shared auth identity without changing UID", () => {
  const user = toSharedRosterUser({
    uid: "existing-uid",
    email: "organizer@example.com",
    displayName: "Organizer",
    emailVerified: true,
    providerData: [{ providerId: GOOGLE_FIREBASE_PROVIDER_ID }],
  });
  assert.deepEqual(user, {
    uid: "existing-uid",
    email: "organizer@example.com",
    displayName: "Organizer",
    emailVerified: true,
    providerIds: [GOOGLE_FIREBASE_PROVIDER_ID],
  });
  assert.equal(hasGoogleProvider(user), true);
});

test("provider conflicts instruct existing-method sign-in and never propose migration", () => {
  const error = googleAuthError({ code: "auth/account-exists-with-different-credential" });
  assert.equal(error.reason, "existing_method");
  assert.match(error.message, /existing method|another sign-in method/i);
  assert.doesNotMatch(error.message, /migrate|merge|move data/i);
  const source = fs.readFileSync(new URL("./firebaseGoogleAuth.ts", import.meta.url), "utf8");
  assert.match(source, /GoogleAuthProvider\.credentialFromError/);
  assert.match(source, /linkWithCredential\(currentUser, pending\.credential\)/);
  assert.doesNotMatch(source, /linkWithPopup|unlink\(/);
  assert.doesNotMatch(source, /firestore|memberUids|memberEmails/i);
});

test("provider-conflict linking requires the matching existing email and preserves UID", () => {
  assert.equal(pendingGoogleLinkDecision("person@example.com", " PERSON@example.com "), "link");
  assert.equal(pendingGoogleLinkDecision("person@example.com", "other@example.com"), "wrong_email");
  assert.equal(pendingGoogleLinkDecision(null, "person@example.com"), "none");
  assert.equal(googleLinkPreservesUid("existing-uid", "existing-uid"), true);
  assert.equal(googleLinkPreservesUid("existing-uid", "different-uid"), false);
});

test("pending Google credentials stay in memory and cancellation does not mutate Firebase accounts", () => {
  const source = fs.readFileSync(new URL("./firebaseGoogleAuth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|firestore|location\.|URLSearchParams|console\./i);
  const cancel = source.slice(
    source.indexOf("export function clearPendingGoogleLinkCredential"),
    source.indexOf("export async function completePendingGoogleLinkForCurrentUser"),
  );
  assert.match(cancel, /pendingGoogleLink = null/);
  assert.doesNotMatch(cancel, /signOut|deleteUser|unlink|linkWithCredential/);
});

test("Google invitation identity still resolves only to explicit Join or wrong-account state", () => {
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: false,
    context: { state: "pending", viewerStatus: "matching_verified" },
  }), "join_ready");
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: false,
    context: { state: "pending", viewerStatus: "wrong_email" },
  }), "wrong_account");

  const onboarding = fs.readFileSync(new URL("../components/WorkspaceInvitationOnboarding.tsx", import.meta.url), "utf8");
  const googleHandler = onboarding.slice(
    onboarding.indexOf("const handleGoogleSignIn"),
    onboarding.indexOf("const handleCreateAccount"),
  );
  assert.match(googleHandler, /refreshContext/);
  assert.doesNotMatch(googleHandler, /acceptWorkspaceOrganizerInvitation|handleJoin/);
});

test("email and password authentication remains available as fallback", () => {
  const service = fs.readFileSync(new URL("./sharedRosterService.ts", import.meta.url), "utf8");
  assert.match(service, /signInWithEmailAndPassword/);
  assert.match(service, /createUserWithEmailAndPassword/);
});
