"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INVITATION_TTL_MS,
  RESEND_COOLDOWN_MS,
  invitationEmail,
  invitationExpiryMillis,
  invitationState,
  maskInvitationEmail,
  officialInvitationUrl,
  resendAvailability,
  sanitizedInvitationContext,
  shouldReusePendingInvitation,
  validateInvitationRequest,
} = require("./workspaceInvitation");

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
