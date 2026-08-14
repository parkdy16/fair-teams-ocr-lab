import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_RESET_CONFIRMATION,
  canSubmitWorkspaceInvitationJoin,
  resolveWorkspaceInvitationOnboardingView,
  workspaceInvitationSenderStatus,
} from "./workspaceInvitationOnboardingState.ts";

const pendingContext = {
  state: "pending" as const,
  viewerStatus: "signed_out" as const,
};

test("signed-out pending invitations offer authentication choices", () => {
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: false,
    context: pendingContext,
  }), "auth_choice");
});

test("loading and unavailable invitation states fail closed", () => {
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: true,
    unavailable: false,
    context: pendingContext,
  }), "loading");
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: true,
    context: null,
  }), "unavailable");
});

test("wrong, unverified, and verified identities resolve to distinct safe states", () => {
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: false,
    context: { ...pendingContext, viewerStatus: "wrong_email" },
  }), "wrong_account");
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: false,
    context: { ...pendingContext, viewerStatus: "matching_unverified" },
  }), "verification_required");
  assert.equal(resolveWorkspaceInvitationOnboardingView({
    loading: false,
    unavailable: false,
    context: { ...pendingContext, viewerStatus: "matching_verified" },
  }), "join_ready");
});

test("accepted, expired, and cancelled invitations are terminal regardless of viewer", () => {
  for (const state of ["accepted", "expired", "cancelled"] as const) {
    assert.equal(resolveWorkspaceInvitationOnboardingView({
      loading: false,
      unavailable: false,
      context: { state, viewerStatus: "matching_verified" },
    }), state);
  }
});

test("Join is enabled only for a verified match and only once at a time", () => {
  assert.equal(canSubmitWorkspaceInvitationJoin("join_ready", false), true);
  assert.equal(canSubmitWorkspaceInvitationJoin("join_ready", true), false);
  assert.equal(canSubmitWorkspaceInvitationJoin("verification_required", false), false);
  assert.equal(canSubmitWorkspaceInvitationJoin("wrong_account", false), false);
});

test("password reset confirmation is generic and contains no submitted address", () => {
  assert.equal(PASSWORD_RESET_CONFIRMATION, "If an account exists for that email, check your inbox.");
  assert.equal(PASSWORD_RESET_CONFIRMATION.includes("recipient@example.com"), false);
});

test("sender readiness distinguishes signed-out, unverified, and verified organizers", () => {
  assert.equal(workspaceInvitationSenderStatus(null), "signed_out");
  assert.equal(workspaceInvitationSenderStatus({ emailVerified: false }), "verification_required");
  assert.equal(workspaceInvitationSenderStatus({ emailVerified: true }), "ready");
});
