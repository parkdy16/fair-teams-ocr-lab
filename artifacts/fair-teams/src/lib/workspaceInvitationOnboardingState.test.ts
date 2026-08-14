import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_RESET_CONFIRMATION,
  canSubmitWorkspaceInvitationJoin,
  openAcceptedWorkspaceInvitation,
  resolveWorkspaceInvitationManagementGroupId,
  resolveWorkspaceInvitationOnboardingView,
  urlWithoutWorkspaceInvitation,
  workspaceInvitationQueryFromUrl,
  workspaceInvitationSenderStatus,
  workspaceInvitationSuppressesGuidedTour,
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

test("invitation management resolves the loaded workspace or its carried roster/source identity", () => {
  assert.equal(resolveWorkspaceInvitationManagementGroupId({
    loadedGroupId: "loaded-group",
  }), "loaded-group");
  assert.equal(resolveWorkspaceInvitationManagementGroupId({
    loadedGroupId: "loaded-group",
    rosterGroupId: "roster-group",
  }), "roster-group");
  assert.equal(resolveWorkspaceInvitationManagementGroupId({
    sourceGroupId: "source-group",
  }), "source-group");
});

test("legacy pending invitation management can use the roster group ID and fails closed without one", () => {
  assert.equal(resolveWorkspaceInvitationManagementGroupId({
    loadedGroupId: null,
    rosterGroupId: " legacy-roster-group ",
  }), "legacy-roster-group");
  assert.equal(resolveWorkspaceInvitationManagementGroupId({}), null);
});

test("invitation query accepts one valid opaque ID and rejects malformed or duplicate values", () => {
  assert.deepEqual(
    workspaceInvitationQueryFromUrl("https://stripes.work/app?invite=abcDEF_1234567890-x"),
    { invitationId: "abcDEF_1234567890-x", invalidInvitation: false },
  );
  assert.deepEqual(
    workspaceInvitationQueryFromUrl("https://stripes.work/app?invite=too-short"),
    { invitationId: null, invalidInvitation: true },
  );
  assert.deepEqual(
    workspaceInvitationQueryFromUrl("https://stripes.work/app?invite=abcDEF_1234567890-x&invite=abcDEF_1234567890-y"),
    { invitationId: null, invalidInvitation: true },
  );
  assert.deepEqual(
    workspaceInvitationQueryFromUrl("https://stripes.work/app?view=teams"),
    { invitationId: null, invalidInvitation: false },
  );
});

test("invitation cleanup removes only invite and preserves other query values and hash", () => {
  assert.equal(
    urlWithoutWorkspaceInvitation("https://stripes.work/app?mode=compact&invite=abcDEF_1234567890-x&lang=de#players"),
    "/app?mode=compact&lang=de#players",
  );
});

test("accepted workspace handoff tries roster IDs in order and cleans up only after success", async () => {
  const attempts: string[] = [];
  const opened: string[] = [];

  const result = await openAcceptedWorkspaceInvitation({
    rosterIds: ["unavailable-roster", "available-roster", "later-roster"],
    openRoster: async (rosterId) => {
      attempts.push(rosterId);
      if (rosterId === "unavailable-roster") throw new Error("not available");
    },
    onOpened: (rosterId) => opened.push(rosterId),
  });

  assert.equal(result, "available-roster");
  assert.deepEqual(attempts, ["unavailable-roster", "available-roster"]);
  assert.deepEqual(opened, ["available-roster"]);
});

test("failed accepted workspace handoff retries the retained result without accepting again", async () => {
  let cleanupCount = 0;
  let acceptanceCount = 0;
  const acceptOnce = () => {
    acceptanceCount += 1;
    return { rosterIds: ["first-roster", "second-roster"] };
  };
  const acceptedResult = acceptOnce();

  await assert.rejects(openAcceptedWorkspaceInvitation({
    rosterIds: acceptedResult.rosterIds,
    openRoster: async () => {
      throw new Error("offline");
    },
    onOpened: () => {
      cleanupCount += 1;
    },
  }), /offline/);

  assert.equal(cleanupCount, 0);
  assert.equal(acceptanceCount, 1);

  await openAcceptedWorkspaceInvitation({
    rosterIds: acceptedResult.rosterIds,
    openRoster: async () => undefined,
    onOpened: () => {
      cleanupCount += 1;
    },
  });

  assert.equal(cleanupCount, 1);
  assert.equal(acceptanceCount, 1);
});

test("guided tour suppression applies only while a valid invitation flow is active", () => {
  const valid = workspaceInvitationQueryFromUrl("/app?invite=abcDEF_1234567890-x");
  const invalid = workspaceInvitationQueryFromUrl("/app?invite=invalid");

  assert.equal(workspaceInvitationSuppressesGuidedTour(valid.invitationId), true);
  assert.equal(workspaceInvitationSuppressesGuidedTour(invalid.invitationId), false);
  assert.equal(workspaceInvitationSuppressesGuidedTour(null), false);
});
