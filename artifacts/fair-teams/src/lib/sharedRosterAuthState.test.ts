import assert from "node:assert/strict";
import test from "node:test";
import {
  sharedRosterUserWithTokenVerification,
  toSharedRosterUser,
} from "./sharedRosterAuthState.ts";
import { workspaceInvitationSenderStatus } from "./workspaceInvitationOnboardingState.ts";

function firebaseUser({
  uid = "organizer-1",
  email = "organizer@example.com",
  emailVerified = false,
}: {
  uid?: string;
  email?: string | null;
  emailVerified?: boolean;
} = {}) {
  return {
    uid,
    email,
    displayName: "Organizer",
    emailVerified,
    providerData: [],
  };
}

test("unverified, verified, different-account, and signed-out auth snapshots map safely", () => {
  assert.equal(
    workspaceInvitationSenderStatus(toSharedRosterUser(firebaseUser())),
    "verification_required",
  );
  assert.equal(
    workspaceInvitationSenderStatus(toSharedRosterUser(firebaseUser({ emailVerified: true }))),
    "ready",
  );
  assert.equal(
    workspaceInvitationSenderStatus(toSharedRosterUser(firebaseUser({
      uid: "organizer-2",
      email: "other@example.com",
      emailVerified: false,
    }))),
    "verification_required",
  );
  assert.equal(workspaceInvitationSenderStatus(toSharedRosterUser(null)), "signed_out");
});

test("normal listener reconstruction preserves Firebase verified state", () => {
  const firstListenerValue = toSharedRosterUser(firebaseUser({ emailVerified: true }));
  const reconstructedValue = toSharedRosterUser(firebaseUser({ emailVerified: true }));

  assert.deepEqual(reconstructedValue, firstListenerValue);
  assert.equal(workspaceInvitationSenderStatus(reconstructedValue), "ready");
});

test("normal listener reconstruction preserves Google provider identity", () => {
  const googleUser = toSharedRosterUser({
    ...firebaseUser({ emailVerified: true }),
    providerData: [{ providerId: "google.com" }],
  });
  assert.deepEqual(googleUser?.providerIds, ["google.com"]);
  assert.equal(googleUser?.uid, "organizer-1");
  assert.equal(googleUser?.emailVerified, true);
});

test("action readiness requires both refreshed Firebase user state and token verification", () => {
  const verifiedUser = toSharedRosterUser(firebaseUser({ emailVerified: true }));
  assert.ok(verifiedUser);

  const readyUser = sharedRosterUserWithTokenVerification(verifiedUser, { email_verified: true });
  const staleTokenUser = sharedRosterUserWithTokenVerification(verifiedUser, { email_verified: false });

  assert.equal(workspaceInvitationSenderStatus(readyUser), "ready");
  assert.equal(workspaceInvitationSenderStatus(staleTokenUser), "verification_required");
});
