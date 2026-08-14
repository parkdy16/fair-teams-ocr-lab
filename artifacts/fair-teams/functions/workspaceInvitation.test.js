"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INVITATION_TTL_MS,
  RESEND_COOLDOWN_MS,
  invitationEmail,
  invitationExpiryMillis,
  invitationMembershipUpdates,
  invitationState,
  invitationViewerStatus,
  invitationWorkspaceName,
  legacyInvitationRecord,
  maskInvitationEmail,
  officialInvitationUrl,
  planInvitationAcceptance,
  resendAvailability,
  sanitizedInvitationContext,
  shouldReusePendingInvitation,
  shouldReuseWorkspaceInvitation,
  supersededInvitationStatus,
  validateInvitationAcceptance,
  validateInvitationRequest,
} = require("./workspaceInvitation");
const { removeOrganizerMembership } = require("./organizerRemoval");

const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const WORKSPACE = {
  name: "Thursday Football",
  memberUids: ["sender", "existing"],
  memberEmails: ["sender@example.com", "existing@example.com"],
  roleByUid: { sender: "organizer", existing: "editor" },
  memberUidByEmail: {
    "sender@example.com": "sender",
    "existing@example.com": "existing",
  },
};
const VERIFIED_SENDER = {
  uid: "sender",
  email: "Sender@Example.com",
  emailVerified: true,
};

function assertInvitationError(callback, code) {
  assert.throws(callback, (error) => error?.name === "WorkspaceInvitationError" && error?.code === code);
}

test("self-invites are rejected after email normalization", () => {
  assertInvitationError(() => validateInvitationRequest({
    actor: VERIFIED_SENDER,
    workspace: WORKSPACE,
    targetEmail: " sender@EXAMPLE.com ",
  }), "invalid-argument");
});

test("existing organizers cannot be invited again", () => {
  assertInvitationError(() => validateInvitationRequest({
    actor: VERIFIED_SENDER,
    workspace: WORKSPACE,
    targetEmail: "EXISTING@example.com",
  }), "already-exists");
});

test("callers outside the active organizer set are rejected", () => {
  assertInvitationError(() => validateInvitationRequest({
    actor: { uid: "outsider", email: "outsider@example.com", emailVerified: true },
    workspace: WORKSPACE,
    targetEmail: "new@example.com",
  }), "permission-denied");
});

test("unverified organizers cannot manage invitations", () => {
  assertInvitationError(() => validateInvitationRequest({
    actor: { ...VERIFIED_SENDER, emailVerified: false },
    workspace: WORKSPACE,
    targetEmail: "new@example.com",
  }), "failed-precondition");
});

test("unauthenticated callers are rejected", () => {
  assertInvitationError(() => validateInvitationRequest({
    actor: null,
    workspace: WORKSPACE,
    targetEmail: "new@example.com",
  }), "unauthenticated");
});

test("a valid pending invitation is reused but an expired invitation is not", () => {
  const pending = { status: "pending", expiresAtIso: new Date(NOW + 1).toISOString() };
  const expired = { status: "pending", expiresAtIso: new Date(NOW).toISOString() };
  assert.equal(shouldReusePendingInvitation(pending, NOW), true);
  assert.equal(shouldReusePendingInvitation(expired, NOW), false);
  assert.equal(invitationState(expired, NOW), "expired");
  assert.equal(invitationExpiryMillis(NOW), NOW + INVITATION_TTL_MS);
});

test("resend cooldown is enforced for five minutes from the last attempt", () => {
  const invitation = {
    status: "pending",
    expiresAtIso: new Date(NOW + INVITATION_TTL_MS).toISOString(),
    lastSendAttemptAtIso: new Date(NOW).toISOString(),
  };
  assert.deepEqual(resendAvailability(invitation, NOW + RESEND_COOLDOWN_MS - 1), {
    allowed: false,
    state: "pending",
    retryAfterMillis: 1,
    availableAtMillis: NOW + RESEND_COOLDOWN_MS,
  });
  assert.equal(resendAvailability(invitation, NOW + RESEND_COOLDOWN_MS).allowed, true);
});

test("public invitation context contains only sanitized minimal fields", () => {
  const context = sanitizedInvitationContext({
    workspaceNameSnapshot: "  Thursday   Football ",
    inviterDisplayNameSnapshot: " Alex Organizer ",
    normalizedEmail: "recipient.long@example.com",
    status: "pending",
    expiresAtIso: new Date(NOW + INVITATION_TTL_MS).toISOString(),
    groupId: "private-group-id",
    invitedByUid: "private-sender-uid",
    deliveryStatus: "sent",
  }, NOW);
  assert.deepEqual(Object.keys(context), [
    "workspaceName",
    "inviterDisplayName",
    "state",
    "expiresAt",
    "maskedInvitedEmail",
  ]);
  assert.equal(context.workspaceName, "Thursday Football");
  assert.equal(context.maskedInvitedEmail, maskInvitationEmail("recipient.long@example.com"));
  assert.equal(JSON.stringify(context).includes("recipient.long@example.com"), false);
  assert.equal(JSON.stringify(context).includes("private-group-id"), false);
});

test("invitation naming prefers a meaningful authoritative workspace name", () => {
  assert.equal(invitationWorkspaceName({
    name: "Thursday Football",
    lastSavedRosterName: "Tuesday Training",
  }, {
    workspaceNameSnapshot: "Friday Football",
  }), "Thursday Football");
});

test("invitation naming falls back to the meaningful shared-roster name", () => {
  assert.equal(invitationWorkspaceName({
    name: "",
    lastSavedRosterName: "Tuesday Training",
  }, {
    workspaceNameSnapshot: "Friday Football",
  }), "Tuesday Training");
});

test("the historical My Group placeholder cannot override a real roster name", () => {
  assert.equal(invitationWorkspaceName({
    name: "  My Group  ",
    lastSavedRosterName: "  Sunday   Kickabout ",
  }, {
    workspaceNameSnapshot: "My Group",
  }), "Sunday Kickabout");
});

test("invitation naming uses a neutral fallback when workspace and roster names are generic", () => {
  assert.equal(invitationWorkspaceName({
    name: "My Stripes group",
    lastSavedRosterName: "Shared roster",
  }), "Stripes workspace");
});

test("a generic Shared roster snapshot cannot survive placeholder current names", () => {
  assert.equal(invitationWorkspaceName({
    name: "My Group",
    lastSavedRosterName: "Shared roster",
  }, {
    workspaceNameSnapshot: "Shared roster",
  }), "Stripes workspace");
});

test("a generic New roster snapshot cannot survive placeholder current names", () => {
  assert.equal(invitationWorkspaceName({
    name: "My Stripes group",
    lastSavedRosterName: "New roster",
  }, {
    workspaceNameSnapshot: "New roster",
  }), "Stripes workspace");
});

test("a meaningful legacy snapshot remains available when the group is unavailable", () => {
  assert.equal(invitationWorkspaceName(null, {
    workspaceNameSnapshot: "Friday Football",
  }), "Friday Football");
});

test("invitation email and sanitized context use the same resolved workspace name", () => {
  const invitationId = "A1b2C3d4E5f6G7h8I9j0";
  const workspaceName = invitationWorkspaceName({
    name: "My Group",
    lastSavedRosterName: "Friday Football",
  });
  const invitation = {
    workspaceNameSnapshot: workspaceName,
    inviterDisplayNameSnapshot: "Alex Organizer",
    normalizedEmail: "recipient@example.com",
    status: "pending",
    expiresAtIso: new Date(NOW + INVITATION_TTL_MS).toISOString(),
  };
  const context = sanitizedInvitationContext(invitation, NOW);
  const email = invitationEmail({
    invitationId,
    workspaceName,
    inviterDisplayName: invitation.inviterDisplayNameSnapshot,
    expiresAtIso: invitation.expiresAtIso,
  });
  assert.equal(context.workspaceName, "Friday Football");
  assert.match(email.subject, /^Join Friday Football in Stripes$/);
  assert.match(email.text, /join Friday Football in Stripes/);
});

test("invitation viewer status is signed_out without an authenticated identity", () => {
  assert.equal(invitationViewerStatus(
    { normalizedEmail: "recipient@example.com" },
    null,
  ), "signed_out");
});

test("invitation viewer status rejects an authenticated wrong email", () => {
  assert.equal(invitationViewerStatus(
    { normalizedEmail: "recipient@example.com" },
    { uid: "forwarded-user", email: "other@example.com", emailVerified: true },
  ), "wrong_email");
});

test("invitation viewer status recognizes a normalized matching unverified email", () => {
  assert.equal(invitationViewerStatus(
    { normalizedEmail: "recipient@example.com" },
    { uid: "recipient", email: " Recipient@Example.com ", emailVerified: false },
  ), "matching_unverified");
});

test("invitation viewer status recognizes a normalized matching verified email", () => {
  assert.equal(invitationViewerStatus(
    { normalizedEmail: "recipient@example.com" },
    { uid: "recipient", email: "RECIPIENT@example.com", emailVerified: true },
  ), "matching_verified");
});

test("official invitation links always use the Stripes production app origin", () => {
  const invitationId = "A1b2C3d4E5f6G7h8I9j0";
  assert.equal(
    officialInvitationUrl(invitationId),
    `https://stripes.work/app?invite=${invitationId}`,
  );
  assert.throws(() => officialInvitationUrl("https://evil.example/invite"), TypeError);
});

test("invitation email is branded, escaped, and uses the official contextual link", () => {
  const invitationId = "A1b2C3d4E5f6G7h8I9j0";
  const email = invitationEmail({
    invitationId,
    workspaceName: "Club <A>",
    inviterDisplayName: "Alex & Sam",
    expiresAtIso: new Date(NOW + INVITATION_TTL_MS).toISOString(),
  });
  assert.equal(email.link, `https://stripes.work/app?invite=${invitationId}`);
  assert.match(email.subject, /^Join Club <A> in Stripes$/);
  assert.match(email.text, /invited you to join/);
  assert.match(email.html, /Club &lt;A&gt;/);
  assert.doesNotMatch(email.html, /Club <A>/);
});

const VERIFIED_RECIPIENT = {
  uid: "recipient-uid",
  email: "recipient@example.com",
  emailVerified: true,
};
const ACCEPTANCE_WORKSPACE = {
  name: "Thursday Football",
  memberUids: ["sender"],
  memberEmails: ["sender@example.com"],
  pendingInviteEmails: ["recipient@example.com", "other@example.com"],
  roleByUid: { sender: "organizer" },
  memberNamesByUid: { sender: "Sender" },
  memberNamesByEmail: { "sender@example.com": "Sender" },
  memberUidByEmail: { "sender@example.com": "sender" },
  unrelated: { keep: true },
};

function pendingAcceptanceInvitation(overrides = {}) {
  return {
    groupId: "group-one",
    normalizedEmail: "recipient@example.com",
    status: "pending",
    expiresAtIso: new Date(NOW + INVITATION_TTL_MS).toISOString(),
    ...overrides,
  };
}

test("an unauthenticated recipient cannot accept an invitation", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: { uid: "", email: "", emailVerified: false },
    invitation: pendingAcceptanceInvitation(),
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), "unauthenticated");
});

test("an unverified recipient cannot accept an invitation", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: { ...VERIFIED_RECIPIENT, emailVerified: false },
    invitation: pendingAcceptanceInvitation(),
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), "failed-precondition");
});

test("a different verified email cannot accept a forwarded invitation URL", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: { uid: "forwarded-user", email: "other-person@example.com", emailVerified: true },
    invitation: pendingAcceptanceInvitation(),
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), "permission-denied");
});

test("cancelled invitations remain harmless even when their email was already sent", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation({ status: "cancelled" }),
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), "failed-precondition");
});

test("expired invitations cannot be accepted", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation({ expiresAtIso: new Date(NOW).toISOString() }),
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), "failed-precondition");
});

test("already-consumed invitations and duplicate acceptance attempts are rejected", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation({ status: "accepted" }),
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), "already-exists");

  const firstUpdates = invitationMembershipUpdates(ACCEPTANCE_WORKSPACE, {
    uid: VERIFIED_RECIPIENT.uid,
    email: VERIFIED_RECIPIENT.email,
    displayName: "Recipient",
  });
  const afterFirstAcceptance = { ...ACCEPTANCE_WORKSPACE, ...firstUpdates };
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation({ status: "accepted" }),
    workspace: afterFirstAcceptance,
    nowMillis: NOW,
  }), "already-exists");
});

test("an existing workspace member cannot accept another invitation", () => {
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation(),
    workspace: {
      ...ACCEPTANCE_WORKSPACE,
      memberUids: ["sender", VERIFIED_RECIPIENT.uid],
    },
    nowMillis: NOW,
  }), "already-exists");
});

test("cancellation wins over acceptance without changing membership", () => {
  const cancelledWorkspace = {
    ...ACCEPTANCE_WORKSPACE,
    pendingInviteEmails: ["other@example.com"],
  };
  assertInvitationError(() => planInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation({ status: "cancelled" }),
    workspace: cancelledWorkspace,
    linkedRosters: [],
    displayName: "Recipient",
    nowMillis: NOW,
  }), "failed-precondition");
  assert.deepEqual(cancelledWorkspace.memberUids, ["sender"]);
});

test("acceptance removes pending email from every linked roster and preserves unrelated data", () => {
  const linkedRosters = [
    {
      memberUids: ["sender"],
      memberEmails: ["SENDER@example.com"],
      pendingInviteEmails: ["recipient@example.com", "keep@example.com"],
      roleByUid: { sender: "organizer" },
      rosterData: { players: ["unchanged"] },
    },
    {
      memberUids: ["sender"],
      memberEmails: ["sender@example.com"],
      pendingInviteEmails: ["RECIPIENT@example.com"],
      roleByUid: { sender: "organizer" },
      version: 17,
    },
  ];
  const plan = planInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation(),
    workspace: ACCEPTANCE_WORKSPACE,
    linkedRosters,
    displayName: "Recipient Name",
    nowMillis: NOW,
  });
  const updatedWorkspace = { ...ACCEPTANCE_WORKSPACE, ...plan.workspaceUpdates };
  const updatedRosters = linkedRosters.map((roster, index) => ({
    ...roster,
    ...plan.rosterUpdates[index],
  }));

  assert.deepEqual(updatedWorkspace.unrelated, { keep: true });
  assert.deepEqual(updatedWorkspace.pendingInviteEmails, ["other@example.com"]);
  assert.equal(updatedWorkspace.roleByUid[VERIFIED_RECIPIENT.uid], "organizer");
  assert.equal(updatedWorkspace.memberUidByEmail[VERIFIED_RECIPIENT.email], VERIFIED_RECIPIENT.uid);
  assert.deepEqual(updatedRosters[0].pendingInviteEmails, ["keep@example.com"]);
  assert.deepEqual(updatedRosters[0].memberEmails, ["SENDER@example.com", VERIFIED_RECIPIENT.email]);
  assert.deepEqual(updatedRosters[0].rosterData, { players: ["unchanged"] });
  assert.deepEqual(updatedRosters[1].pendingInviteEmails, []);
  assert.equal(updatedRosters[1].version, 17);
});

test("a legitimate legacy pending email can be adopted into the trusted flow", () => {
  const invitation = legacyInvitationRecord({
    groupId: "legacy-group",
    normalizedEmail: VERIFIED_RECIPIENT.email,
    workspaceName: "Legacy Club",
    nowMillis: NOW,
  });
  assert.equal(invitation.legacyAdopted, true);
  assert.equal(invitation.status, "pending");
  assert.equal(invitationState(invitation, NOW), "pending");
  assert.deepEqual(validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation,
    workspace: ACCEPTANCE_WORKSPACE,
    nowMillis: NOW,
  }), {
    uid: VERIFIED_RECIPIENT.uid,
    email: VERIFIED_RECIPIENT.email,
  });
});

test("self-leave cleanup makes a stale invitation unusable without touching other pending invites", () => {
  const afterSelfLeave = {
    ...ACCEPTANCE_WORKSPACE,
    pendingInviteEmails: ACCEPTANCE_WORKSPACE.pendingInviteEmails
      .filter((email) => email.toLowerCase() !== VERIFIED_RECIPIENT.email),
  };
  assert.deepEqual(afterSelfLeave.pendingInviteEmails, ["other@example.com"]);
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation(),
    workspace: afterSelfLeave,
    nowMillis: NOW,
  }), "failed-precondition");
});

test("protected organizer removal clears stale invitation state and makes its old URL fail closed", () => {
  const activeOrganizerWithStaleInvite = {
    ...ACCEPTANCE_WORKSPACE,
    memberUids: ["sender", VERIFIED_RECIPIENT.uid],
    memberEmails: ["sender@example.com", VERIFIED_RECIPIENT.email],
    roleByUid: { sender: "organizer", [VERIFIED_RECIPIENT.uid]: "organizer" },
    memberNamesByUid: { sender: "Sender", [VERIFIED_RECIPIENT.uid]: "Recipient" },
    memberNamesByEmail: {
      "sender@example.com": "Sender",
      [VERIFIED_RECIPIENT.email]: "Recipient",
    },
    memberUidByEmail: {
      "sender@example.com": "sender",
      [VERIFIED_RECIPIENT.email]: VERIFIED_RECIPIENT.uid,
    },
  };
  const afterMembershipEnds = {
    ...activeOrganizerWithStaleInvite,
    ...removeOrganizerMembership(
      activeOrganizerWithStaleInvite,
      VERIFIED_RECIPIENT.uid,
      VERIFIED_RECIPIENT.email,
    ),
  };

  assert.deepEqual(afterMembershipEnds.pendingInviteEmails, ["other@example.com"]);
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: pendingAcceptanceInvitation(),
    workspace: afterMembershipEnds,
    nowMillis: NOW,
  }), "failed-precondition");
  assert.equal(shouldReuseWorkspaceInvitation({
    invitation: pendingAcceptanceInvitation(),
    workspace: afterMembershipEnds,
    email: VERIFIED_RECIPIENT.email,
    nowMillis: NOW,
  }), false);
});

test("a deliberate later invitation supersedes stale state and can be accepted normally", () => {
  const afterMembershipEnds = {
    ...ACCEPTANCE_WORKSPACE,
    pendingInviteEmails: ["other@example.com"],
  };
  const staleInvitation = pendingAcceptanceInvitation({ invitationId: "old-invitation" });
  assert.equal(shouldReuseWorkspaceInvitation({
    invitation: staleInvitation,
    workspace: afterMembershipEnds,
    email: VERIFIED_RECIPIENT.email,
    nowMillis: NOW,
  }), false);
  const invalidatedStaleInvitation = {
    ...staleInvitation,
    status: supersededInvitationStatus(afterMembershipEnds, VERIFIED_RECIPIENT.email),
  };
  assert.equal(invalidatedStaleInvitation.status, "cancelled");

  const afterFreshInvite = {
    ...afterMembershipEnds,
    pendingInviteEmails: [...afterMembershipEnds.pendingInviteEmails, VERIFIED_RECIPIENT.email],
  };
  const freshInvitation = pendingAcceptanceInvitation({ invitationId: "fresh-invitation" });
  assert.equal(shouldReuseWorkspaceInvitation({
    invitation: freshInvitation,
    workspace: afterFreshInvite,
    email: VERIFIED_RECIPIENT.email,
    nowMillis: NOW,
  }), true);
  assert.deepEqual(validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: freshInvitation,
    workspace: afterFreshInvite,
    nowMillis: NOW,
  }), {
    uid: VERIFIED_RECIPIENT.uid,
    email: VERIFIED_RECIPIENT.email,
  });
  assertInvitationError(() => validateInvitationAcceptance({
    actor: VERIFIED_RECIPIENT,
    invitation: invalidatedStaleInvitation,
    workspace: afterFreshInvite,
    nowMillis: NOW,
  }), "failed-precondition");
  assert.equal(afterFreshInvite.pendingInviteEmails.includes("other@example.com"), true);
});
