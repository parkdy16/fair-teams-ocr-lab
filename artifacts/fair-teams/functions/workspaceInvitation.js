"use strict";

const crypto = require("node:crypto");
const { organizerUidsFromWorkspace } = require("./organizerRemoval");

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const OFFICIAL_APP_URL = "https://stripes.work/app";

class WorkspaceInvitationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceInvitationError";
    this.code = code;
  }
}

function normalizeInvitationEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validInvitationEmail(value) {
  const email = normalizeInvitationEmail(value);
  return email.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanInvitationText(value, fallback, maximum = 120) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
  return cleaned || fallback;
}

function timestampMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && typeof value.toMillis === "function") {
    const parsed = Number(value.toMillis());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function existingOrganizerEmails(workspace) {
  const data = workspace && typeof workspace === "object" ? workspace : {};
  const organizerUids = new Set(organizerUidsFromWorkspace(data));
  const emails = new Set();
  const uidByEmail = data.memberUidByEmail && typeof data.memberUidByEmail === "object"
    ? data.memberUidByEmail
    : {};

  for (const [email, uid] of Object.entries(uidByEmail)) {
    if (organizerUids.has(uid)) emails.add(normalizeInvitationEmail(email));
  }

  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  const memberEmails = Array.isArray(data.memberEmails) ? data.memberEmails : [];
  memberEmails.forEach((email, index) => {
    if (organizerUids.has(memberUids[index])) {
      emails.add(normalizeInvitationEmail(email));
    }
  });

  if (organizerUids.has(data.ownerUid)) {
    emails.add(normalizeInvitationEmail(data.ownerEmail));
  }

  emails.delete("");
  return emails;
}

function validateInvitationActor({ actor, workspace }) {
  const { uid, email: actorEmail } = verifiedInvitationIdentity(actor);

  const organizerUids = organizerUidsFromWorkspace(workspace);
  if (!organizerUids.includes(uid)) {
    throw new WorkspaceInvitationError(
      "permission-denied",
      "Only an active organizer can manage invitations.",
    );
  }

  return { actorEmail, organizerUids };
}

function verifiedInvitationIdentity(actor) {
  const uid = typeof actor?.uid === "string" ? actor.uid.trim() : "";
  if (!uid) {
    throw new WorkspaceInvitationError("unauthenticated", "Sign in first.");
  }

  const actorEmail = normalizeInvitationEmail(actor?.email);
  if (!actor?.emailVerified || !validInvitationEmail(actorEmail)) {
    throw new WorkspaceInvitationError(
      "failed-precondition",
      "Verify your Stripes account email before continuing.",
    );
  }
  return { uid, email: actorEmail };
}

function validateInvitationRequest({ actor, workspace, targetEmail }) {
  const { actorEmail, organizerUids } = validateInvitationActor({ actor, workspace });

  const normalizedTargetEmail = normalizeInvitationEmail(targetEmail);
  if (!validInvitationEmail(normalizedTargetEmail)) {
    throw new WorkspaceInvitationError("invalid-argument", "Enter a valid email address to invite.");
  }
  if (normalizedTargetEmail === actorEmail) {
    throw new WorkspaceInvitationError("invalid-argument", "You cannot invite your own email address.");
  }
  if (existingOrganizerEmails(workspace).has(normalizedTargetEmail)) {
    throw new WorkspaceInvitationError("already-exists", "That email already belongs to an organizer.");
  }

  return {
    actorEmail,
    normalizedTargetEmail,
    organizerUids,
  };
}

function invitationExpiryMillis(createdAtMillis) {
  const createdAt = Number(createdAtMillis);
  if (!Number.isFinite(createdAt) || createdAt < 0) {
    throw new TypeError("createdAtMillis must be a valid timestamp.");
  }
  return createdAt + INVITATION_TTL_MS;
}

function pendingInvitationIncludes(workspace, email) {
  const normalizedEmail = normalizeInvitationEmail(email);
  return (Array.isArray(workspace?.pendingInviteEmails) ? workspace.pendingInviteEmails : [])
    .some((candidate) => normalizeInvitationEmail(candidate) === normalizedEmail);
}

function activeMemberIncludes(workspace, uid, email) {
  const normalizedEmail = normalizeInvitationEmail(email);
  if ((Array.isArray(workspace?.memberUids) ? workspace.memberUids : []).includes(uid)) return true;
  if ((Array.isArray(workspace?.memberEmails) ? workspace.memberEmails : [])
    .some((candidate) => normalizeInvitationEmail(candidate) === normalizedEmail)) return true;
  const uidByEmail = workspace?.memberUidByEmail && typeof workspace.memberUidByEmail === "object"
    ? workspace.memberUidByEmail
    : {};
  return Object.entries(uidByEmail).some(([candidateEmail, candidateUid]) => (
    normalizeInvitationEmail(candidateEmail) === normalizedEmail || candidateUid === uid
  ));
}

function validateInvitationAcceptance({ actor, invitation, workspace, nowMillis = Date.now() }) {
  const identity = verifiedInvitationIdentity(actor);
  const invitedEmail = normalizeInvitationEmail(invitation?.normalizedEmail);
  if (!validInvitationEmail(invitedEmail) || identity.email !== invitedEmail) {
    throw new WorkspaceInvitationError(
      "permission-denied",
      "Sign in with the verified email address that received this invitation.",
    );
  }

  const state = invitationState(invitation, nowMillis);
  if (state === "expired") {
    throw new WorkspaceInvitationError("failed-precondition", "This invitation has expired.");
  }
  if (state === "cancelled") {
    throw new WorkspaceInvitationError("failed-precondition", "This invitation was cancelled.");
  }
  if (state === "accepted") {
    throw new WorkspaceInvitationError("already-exists", "This invitation has already been accepted.");
  }
  if (state !== "pending") {
    throw new WorkspaceInvitationError("failed-precondition", "This invitation is no longer pending.");
  }
  if (!pendingInvitationIncludes(workspace, invitedEmail)) {
    throw new WorkspaceInvitationError("failed-precondition", "This invitation is no longer active.");
  }
  if (activeMemberIncludes(workspace, identity.uid, invitedEmail)) {
    throw new WorkspaceInvitationError("already-exists", "This account is already a workspace member.");
  }
  return identity;
}

function invitationMembershipUpdates(workspace, { uid, email, displayName }) {
  const normalizedEmail = normalizeInvitationEmail(email);
  if (!uid || !validInvitationEmail(normalizedEmail)) {
    throw new TypeError("A valid invitation recipient is required.");
  }
  const safeName = cleanInvitationText(
    displayName,
    normalizedEmail.split("@")[0] || "Organizer",
    80,
  );
  const existingMemberUids = Array.isArray(workspace?.memberUids)
    ? [...workspace.memberUids]
    : [];
  const memberUids = existingMemberUids.includes(uid)
    ? existingMemberUids
    : [...existingMemberUids, uid];
  const existingMemberEmails = Array.isArray(workspace?.memberEmails)
    ? [...workspace.memberEmails]
    : [];
  const memberEmails = existingMemberEmails.some(
    (candidate) => normalizeInvitationEmail(candidate) === normalizedEmail,
  )
    ? existingMemberEmails
    : [...existingMemberEmails, normalizedEmail];
  const pendingInviteEmails = (Array.isArray(workspace?.pendingInviteEmails)
    ? workspace.pendingInviteEmails
    : [])
    .filter((candidate) => normalizeInvitationEmail(candidate) !== normalizedEmail);

  return {
    memberUids,
    memberEmails,
    pendingInviteEmails,
    roleByUid: {
      ...(workspace?.roleByUid && typeof workspace.roleByUid === "object" ? workspace.roleByUid : {}),
      [uid]: "organizer",
    },
    memberNamesByUid: {
      ...(workspace?.memberNamesByUid && typeof workspace.memberNamesByUid === "object"
        ? workspace.memberNamesByUid
        : {}),
      [uid]: safeName,
    },
    memberNamesByEmail: {
      ...(workspace?.memberNamesByEmail && typeof workspace.memberNamesByEmail === "object"
        ? workspace.memberNamesByEmail
        : {}),
      [normalizedEmail]: safeName,
    },
    memberUidByEmail: {
      ...(workspace?.memberUidByEmail && typeof workspace.memberUidByEmail === "object"
        ? workspace.memberUidByEmail
        : {}),
      [normalizedEmail]: uid,
    },
  };
}

function planInvitationAcceptance({ actor, invitation, workspace, linkedRosters, displayName, nowMillis }) {
  const identity = validateInvitationAcceptance({ actor, invitation, workspace, nowMillis });
  const recipient = { ...identity, displayName };
  return {
    identity,
    workspaceUpdates: invitationMembershipUpdates(workspace, recipient),
    rosterUpdates: (Array.isArray(linkedRosters) ? linkedRosters : [])
      .map((roster) => invitationMembershipUpdates(roster, recipient)),
  };
}

function legacyInvitationRecord({ groupId, normalizedEmail, workspaceName, nowMillis = Date.now() }) {
  const email = normalizeInvitationEmail(normalizedEmail);
  if (!groupId || !validInvitationEmail(email)) {
    throw new TypeError("A valid legacy workspace invitation is required.");
  }
  const expiresAtMillis = invitationExpiryMillis(nowMillis);
  return {
    schemaVersion: 1,
    groupId,
    normalizedEmail: email,
    status: "pending",
    workspaceNameSnapshot: cleanInvitationText(workspaceName, "Stripes workspace", 120),
    invitedByUid: null,
    inviterDisplayNameSnapshot: "A workspace organizer",
    legacyAdopted: true,
    createdAtIso: new Date(nowMillis).toISOString(),
    updatedAtIso: new Date(nowMillis).toISOString(),
    expiresAtIso: new Date(expiresAtMillis).toISOString(),
    lastSendAttemptAtIso: null,
    lastSentAtIso: null,
    deliveryStatus: "not_sent",
    deliveryError: null,
    sendAttemptId: null,
  };
}

function invitationState(invitation, nowMillis = Date.now()) {
  const rawStatus = typeof invitation?.status === "string" ? invitation.status : "pending";
  if (rawStatus !== "pending") return rawStatus;
  const expiresAt = timestampMillis(invitation?.expiresAt)
    || timestampMillis(invitation?.expiresAtIso);
  return expiresAt > 0 && expiresAt <= nowMillis ? "expired" : "pending";
}

function shouldReusePendingInvitation(invitation, nowMillis = Date.now()) {
  return Boolean(invitation) && invitationState(invitation, nowMillis) === "pending";
}

function shouldReuseWorkspaceInvitation({ invitation, workspace, email, nowMillis = Date.now() }) {
  const normalizedEmail = normalizeInvitationEmail(email);
  return validInvitationEmail(normalizedEmail)
    && normalizeInvitationEmail(invitation?.normalizedEmail) === normalizedEmail
    && pendingInvitationIncludes(workspace, normalizedEmail)
    && shouldReusePendingInvitation(invitation, nowMillis);
}

function supersededInvitationStatus(workspace, email) {
  return pendingInvitationIncludes(workspace, email) ? "expired" : "cancelled";
}

function resendAvailability(invitation, nowMillis = Date.now()) {
  const state = invitationState(invitation, nowMillis);
  if (state !== "pending") {
    return { allowed: false, state, retryAfterMillis: 0, availableAtMillis: 0 };
  }
  const lastAttempt = timestampMillis(invitation?.lastSendAttemptAt)
    || timestampMillis(invitation?.lastSendAttemptAtIso);
  const availableAtMillis = lastAttempt > 0 ? lastAttempt + RESEND_COOLDOWN_MS : nowMillis;
  return {
    allowed: nowMillis >= availableAtMillis,
    state,
    retryAfterMillis: Math.max(0, availableAtMillis - nowMillis),
    availableAtMillis,
  };
}

function invitationLockId(groupId, normalizedEmail) {
  const group = String(groupId || "").trim();
  const email = normalizeInvitationEmail(normalizedEmail);
  if (!group || !email) throw new TypeError("A workspace and invited email are required.");
  return crypto.createHash("sha256").update(`${group}\n${email}`, "utf8").digest("hex");
}

function officialInvitationUrl(invitationId) {
  const id = String(invitationId || "").trim();
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(id)) {
    throw new TypeError("invitationId must be an opaque invitation identifier.");
  }
  return `${OFFICIAL_APP_URL}?invite=${encodeURIComponent(id)}`;
}

function maskInvitationEmail(value) {
  const email = normalizeInvitationEmail(value);
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  const local = email.slice(0, at);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, Math.min(local.length - 1, 8)))}${email.slice(at)}`;
}

function sanitizedInvitationContext(invitation, nowMillis = Date.now()) {
  return {
    workspaceName: cleanInvitationText(invitation?.workspaceNameSnapshot, "Stripes workspace", 120),
    inviterDisplayName: cleanInvitationText(invitation?.inviterDisplayNameSnapshot, "An organizer", 80),
    state: invitationState(invitation, nowMillis),
    expiresAt: new Date(
      timestampMillis(invitation?.expiresAt) || timestampMillis(invitation?.expiresAtIso),
    ).toISOString(),
    maskedInvitedEmail: maskInvitationEmail(invitation?.normalizedEmail),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function invitationEmail({ invitationId, workspaceName, inviterDisplayName, expiresAtIso }) {
  const name = cleanInvitationText(workspaceName, "Stripes workspace", 120);
  const inviter = cleanInvitationText(inviterDisplayName, "An organizer", 80);
  const link = officialInvitationUrl(invitationId);
  const expiry = new Date(expiresAtIso);
  if (!Number.isFinite(expiry.getTime())) throw new TypeError("expiresAtIso must be valid.");
  const expiryLabel = expiry.toISOString().slice(0, 10);
  const subject = `Join ${name} in Stripes`;
  const text = [
    `${inviter} invited you to join ${name} in Stripes.`,
    "",
    `Join ${name}: ${link}`,
    "",
    `This invitation expires on ${expiryLabel}. Sign in with and verify the invited email before joining.`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#102A43;line-height:1.5">
      <div style="font-size:13px;font-weight:800;color:#7c3aed;margin-bottom:10px">Stripes</div>
      <h2 style="font-size:22px;line-height:1.25;margin:0 0 12px">Join ${escapeHtml(name)}</h2>
      <p style="margin:0 0 18px">${escapeHtml(inviter)} invited you to join this workspace as an organizer.</p>
      <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#102A43;color:#fff;text-decoration:none;padding:11px 17px;border-radius:12px;font-weight:700">Join ${escapeHtml(name)}</a></p>
      <p style="font-size:12px;color:#64748b;margin:0">This invitation expires on ${escapeHtml(expiryLabel)}. Sign in with and verify the invited email before joining.</p>
    </div>`;
  return { subject, text, html, link };
}

module.exports = {
  activeMemberIncludes,
  INVITATION_TTL_MS,
  OFFICIAL_APP_URL,
  RESEND_COOLDOWN_MS,
  WorkspaceInvitationError,
  invitationEmail,
  invitationExpiryMillis,
  invitationLockId,
  invitationMembershipUpdates,
  invitationState,
  legacyInvitationRecord,
  maskInvitationEmail,
  normalizeInvitationEmail,
  officialInvitationUrl,
  pendingInvitationIncludes,
  planInvitationAcceptance,
  resendAvailability,
  sanitizedInvitationContext,
  shouldReusePendingInvitation,
  shouldReuseWorkspaceInvitation,
  supersededInvitationStatus,
  timestampMillis,
  validateInvitationActor,
  validateInvitationAcceptance,
  validateInvitationRequest,
  verifiedInvitationIdentity,
};
