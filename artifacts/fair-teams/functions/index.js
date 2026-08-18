const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const {
  activeWorkspaceNotificationRecipients,
  buildOrganizerRemovalElectorate,
  evaluateOrganizerRemovalVote,
  GOVERNANCE_ELIGIBILITY_DELAY_MS,
  governanceEligibleOrganizerUids,
  memberDisplayName,
  organizerGovernanceEligibility,
  organizerMembershipFingerprint,
  organizerUidsFromWorkspace,
  resolveMemberUidByEmail,
} = require("./organizerRemoval");
const {
  castOrganizerRemovalBallotTransaction,
  OrganizerRemovalTransactionError,
} = require("./organizerRemovalTransaction");
const {
  activeMemberIncludes,
  deliverOrganizerJoinedNotification,
  WorkspaceInvitationError,
  invitationEmail,
  invitationExpiryMillis,
  invitationLockId,
  invitationState,
  invitationViewerStatus,
  invitationWorkspaceName,
  legacyInvitationRecord,
  normalizeInvitationEmail,
  organizerJoinedNotification,
  pendingInvitationIncludes,
  planInvitationAcceptance,
  resendAvailability,
  sanitizedInvitationContext,
  shouldReuseWorkspaceInvitation,
  supersededInvitationStatus,
  timestampMillis,
  validateInvitationActor,
  validateInvitationRequest,
  verifiedInvitationIdentity,
} = require("./workspaceInvitation");
const {
  EmailVerificationError,
  verificationContinuationUrl,
  verificationEmail,
  verificationIdentity,
  verificationSendResult,
  verificationThrottlePlan,
} = require("./emailVerification");
const {
  WorkspaceClosureError,
  resumableWorkspaceClosure,
  validateWorkspaceClosure,
  workspaceClosureCleanupTargets,
  workspaceClosureId,
  workspaceClosureState,
} = require("./workspaceClosure");
const {
  preflightGroupRosterLinkage,
  WorkspaceRosterLinkageError,
} = require("./workspaceRosterLinkage");

initializeApp();

const REGION = process.env.FAIRTEAMS_FUNCTIONS_REGION || "europe-west1";
const THREAD_COLLECTION = "actionBoardNotificationThreads";
const USER_COLLECTION = "fairTeamsUsers";
const PUSH_INSTALLATION_COLLECTION = "fairTeamsPushInstallations";
const WORKSPACE_INVITATION_COLLECTION = "sharedWorkspaceInvitations";
const WORKSPACE_INVITATION_LOCK_COLLECTION = "sharedWorkspaceInvitationLocks";
const WORKSPACE_CLOSURE_COLLECTION = "sharedWorkspaceClosures";
const EMAIL_VERIFICATION_THROTTLE_COLLECTION = "authEmailVerificationThrottles";
const MAX_GOVERNANCE_TRANSACTION_DOCUMENTS = 440;
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueEmails(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanEmail).filter((email) => email.includes("@"))));
}

function cleanText(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeScope(scopeId) {
  const raw = String(scopeId || "").trim();
  if (!raw) throw new HttpsError("invalid-argument", "Missing board scope.");
  if (raw.startsWith("roster:")) return { kind: "roster", id: raw.slice(7) };
  if (raw.startsWith("group:")) return { kind: "group", id: raw.slice(6) };
  return { kind: "group", id: raw };
}

function scopeRefs(db, scopeId) {
  const scope = safeScope(scopeId);
  const parent = db.collection(scope.kind === "roster" ? "sharedRosters" : "sharedGroups").doc(scope.id);
  const cardBase = parent.collection("taskBoard").doc("config").collection("cards");
  return { scope, parent, cardBase };
}

function actorName(auth) {
  return cleanText(auth?.token?.name || auth?.token?.email?.split("@")[0] || "Organizer", 60) || "Organizer";
}

function notificationForTarget(card, stepKind, stepId) {
  if (stepKind === "topic") return card.topicNotification || null;
  if (stepKind === "decision") {
    const decisions = Array.isArray(card.decisions) ? card.decisions : [];
    const index = decisions.findIndex((item) => String(item?.id || "") === stepId);
    if (index < 0) throw new HttpsError("not-found", "This decision no longer exists.");
    return decisions[index]?.notification || null;
  }
  if (stepKind === "action") {
    const actions = Array.isArray(card.actions) ? card.actions : [];
    const index = actions.findIndex((item) => String(item?.id || "") === stepId);
    if (index < 0) throw new HttpsError("not-found", "This action no longer exists.");
    return actions[index]?.notification || null;
  }
  throw new HttpsError("invalid-argument", "Unknown notification step.");
}

function applyNotification(card, stepKind, stepId, notification) {
  if (stepKind === "topic") return { topicNotification: notification };
  if (stepKind === "decision") {
    const decisions = Array.isArray(card.decisions) ? card.decisions.map((item) => ({ ...item })) : [];
    const index = decisions.findIndex((item) => String(item?.id || "") === stepId);
    if (index < 0) throw new HttpsError("not-found", "This decision no longer exists.");
    decisions[index].notification = notification;
    return { decisions, vote: decisions[decisions.length - 1] || null };
  }
  if (stepKind === "action") {
    const actions = Array.isArray(card.actions) ? card.actions.map((item) => ({ ...item })) : [];
    const index = actions.findIndex((item) => String(item?.id || "") === stepId);
    if (index < 0) throw new HttpsError("not-found", "This action no longer exists.");
    actions[index].notification = notification;
    return { actions };
  }
  throw new HttpsError("invalid-argument", "Unknown notification step.");
}

function stepInfo(card, stepKind, stepId) {
  const topicTitle = cleanText(card.title || "Action Board topic", 160);
  if (stepKind === "topic") {
    return { topicTitle, label: "Idea", text: topicTitle, createdAt: Number(card.createdAt || 0) };
  }
  if (stepKind === "decision") {
    const decisions = Array.isArray(card.decisions) ? card.decisions : [];
    const decision = decisions.find((item) => String(item?.id || "") === stepId);
    if (!decision) throw new HttpsError("not-found", "This decision no longer exists.");
    const question = cleanText(decision.title || decision.question || decision.questions?.[0]?.text || "Decision", 220);
    const label = decision.decisionType === "schedule" || decision.kind === "schedule"
      ? "Scheduling"
      : decision.decisionType === "players"
        ? "Player decision"
        : decision.decisionType === "equipment"
          ? "Equipment decision"
          : "Decision";
    return { topicTitle, label, text: question, createdAt: Number(decision.createdAt || card.createdAt || 0) };
  }
  const actions = Array.isArray(card.actions) ? card.actions : [];
  const action = actions.find((item) => String(item?.id || "") === stepId);
  if (!action) throw new HttpsError("not-found", "This action no longer exists.");
  return { topicTitle, label: "Action", text: cleanText(action.text || "Action", 220), createdAt: Number(action.createdAt || card.createdAt || 0) };
}

function decisionHeading(decision) {
  return cleanText(decision?.title || decision?.question || decision?.questions?.[0]?.text || "Decision", 160);
}

function priorContext(card, targetCreatedAt) {
  const entries = [];
  for (const decision of Array.isArray(card.decisions) ? card.decisions : []) {
    const createdAt = Number(decision?.createdAt || 0);
    if (createdAt && createdAt < targetCreatedAt) {
      const prefix = decision?.status === "closed" || decision?.mode === "recorded" ? "✓" : "•";
      entries.push({ createdAt, text: `${prefix} ${decisionHeading(decision)}` });
    }
  }
  for (const action of Array.isArray(card.actions) ? card.actions : []) {
    const createdAt = Number(action?.createdAt || 0);
    if (createdAt && createdAt < targetCreatedAt) {
      const prefix = action?.status === "done" ? "✓" : "•";
      entries.push({ createdAt, text: `${prefix} ${cleanText(action?.text || "Action", 160)}` });
    }
  }
  return entries.sort((a, b) => a.createdAt - b.createdAt).slice(-4).map((item) => item.text);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function messageIdPart(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
}

function validOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function resendSettings() {
  const apiKey = String(RESEND_API_KEY.value() || "").trim();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Stripes email is not configured yet.");
  }
  return {
    apiKey,
    from: "Stripes <notifications@stripes.work>",
  };
}

async function sendResendEmail({
  to,
  subject,
  text,
  html,
  messageId,
  inReplyTo,
  references,
  topicId,
}) {
  const { apiKey, from } = resendSettings();

  const headers = {};

  if (topicId) headers["X-Fair-Teams-Topic"] = String(topicId);
  if (messageId) headers["Message-ID"] = messageId;
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references) {
    headers.References = Array.isArray(references)
      ? references.join(" ")
      : String(references);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Stripes/1.0",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      cleanText(payload?.message || `Resend email failed (${response.status})`, 180)
    );
  }

  return payload;
}

function verificationHttpsError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof EmailVerificationError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return new HttpsError("internal", "Stripes could not send the verification email. Try again.");
}

async function releaseVerificationAttempt(db, throttleRef, attemptId) {
  await db.runTransaction(async (tx) => {
    const throttleSnap = await tx.get(throttleRef);
    if (!throttleSnap.exists) return;
    const current = throttleSnap.data() || {};
    const attempts = (Array.isArray(current.attempts) ? current.attempts : [])
      .filter((attempt) => String(attempt?.id || "") !== attemptId);
    tx.set(throttleRef, {
      ...current,
      attempts,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
  });
}

exports.sendStripesEmailVerification = onCall({
  region: REGION,
  timeoutSeconds: 60,
  secrets: [RESEND_API_KEY],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getFirestore();
  const firebaseAuth = getAuth();
  const attemptId = crypto.randomUUID();
  const now = Date.now();
  const throttleRef = db.collection(EMAIL_VERIFICATION_THROTTLE_COLLECTION)
    .doc(request.auth.uid);
  let identity;
  let plan;
  let deliveryAttempted = false;

  try {
    const authUser = await firebaseAuth.getUser(request.auth.uid);
    identity = verificationIdentity(authUser);
    const continuationUrl = verificationContinuationUrl(request.data?.invitationId);

    plan = await db.runTransaction(async (tx) => {
      const throttleSnap = await tx.get(throttleRef);
      const current = throttleSnap.exists ? throttleSnap.data() || {} : {};
      const nextPlan = verificationThrottlePlan(current.attempts, now);
      if (!nextPlan.allowed) {
        const resendAvailableAt = new Date(nextPlan.retryAtMillis).toISOString();
        const message = nextPlan.reason === "daily_limit"
          ? "The daily verification-email limit has been reached. Try again later."
          : "Wait before requesting another verification email.";
        throw new EmailVerificationError("resource-exhausted", message, {
          reason: nextPlan.reason,
          resendAvailableAt,
        });
      }
      tx.set(throttleRef, {
        schemaVersion: 1,
        uid: identity.uid,
        attempts: [
          ...nextPlan.attempts.map((attempt) => ({
            id: attempt.id,
            at: Timestamp.fromMillis(attempt.atMillis),
          })),
          { id: attemptId, at: Timestamp.fromMillis(now) },
        ],
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: new Date(now).toISOString(),
      });
      return nextPlan;
    });

    const verificationUrl = await firebaseAuth.generateEmailVerificationLink(identity.email, {
      url: continuationUrl,
      handleCodeInApp: false,
    });
    const content = verificationEmail(verificationUrl);
    deliveryAttempted = true;
    await sendResendEmail({
      to: identity.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    return verificationSendResult(plan);
  } catch (error) {
    if (plan && !deliveryAttempted) {
      await releaseVerificationAttempt(db, throttleRef, attemptId).catch(() => undefined);
    }
    if (!(error instanceof EmailVerificationError) && !(error instanceof HttpsError)) {
      console.error("Could not send Stripes verification email");
      if (plan && deliveryAttempted) {
        throw new HttpsError(
          "internal",
          "Stripes could not send the verification email. Try again.",
          {
            reason: "delivery_failed",
            resendAvailableAt: new Date(plan.retryAtMillis).toISOString(),
          },
        );
      }
    }
    throw verificationHttpsError(error);
  }
});

function emailBodies({ senderName, step, topicContext, customMessage, appUrl }) {
  const contextLines = [`Topic: ${step.topicTitle}`, ...topicContext];
  const text = [
    `Stripes · ${step.topicTitle}`,
    "",
    `${step.label}: ${step.text}`,
    customMessage ? `Message from ${senderName}: ${customMessage}` : `Sent by ${senderName}`,
    "",
    "Topic so far",
    ...contextLines.map((line) => `- ${line}`),
    "",
    appUrl ? `Open Stripes: ${appUrl}` : "Open Stripes to respond or continue the topic.",
  ].join("\n");

  const contextHtml = contextLines.map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`).join("");
  const messageHtml = customMessage
    ? `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-radius:12px"><strong>${escapeHtml(senderName)}:</strong> ${escapeHtml(customMessage)}</div>`
    : `<p style="color:#64748b">Sent by ${escapeHtml(senderName)}</p>`;
  const button = appUrl
    ? `<p style="margin-top:22px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#102A43;color:white;text-decoration:none;padding:10px 16px;border-radius:12px;font-weight:700">Open in Stripes</a></p>`
    : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#102A43;line-height:1.5">
      <div style="font-size:13px;font-weight:700;color:#64748b;margin-bottom:8px">Stripes · ${escapeHtml(step.topicTitle)}</div>
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c3aed">${escapeHtml(step.label)}</div>
      <h2 style="font-size:20px;line-height:1.25;margin:6px 0 10px">${escapeHtml(step.text)}</h2>
      ${messageHtml}
      <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:14px">
        <div style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Topic so far</div>
        <ul style="padding-left:20px;margin:8px 0 0">${contextHtml}</ul>
      </div>
      ${button}
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">This notification was sent manually by an organizer. Stripes does not automatically email board activity.</p>
    </div>`;
  return { text, html };
}

async function emailThreadFor(db, scope, cardId, recipientEmail) {
  const threadKey = messageIdPart(`${scope.kind}|${scope.id}|${cardId}|${recipientEmail}`);
  const ref = db.collection(THREAD_COLLECTION).doc(threadKey);
  const snap = await ref.get();
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "fair-teams-dev";
  const domain = `${projectId}.firebaseapp.com`;
  const rootMessageId = `<ft-${threadKey}@${domain}>`;
  return { ref, exists: snap.exists, rootMessageId, domain };
}

function invitationActor(request) {
  return {
    uid: request.auth?.uid || "",
    email: request.auth?.token?.email || "",
    emailVerified: request.auth?.token?.email_verified === true,
  };
}

function invitationHttpsError(error, fallbackMessage) {
  if (error instanceof HttpsError) return error;
  if (error instanceof WorkspaceRosterLinkageError) {
    return new HttpsError(error.code, error.message);
  }
  if (error instanceof WorkspaceInvitationError) {
    return new HttpsError(error.code, error.message);
  }
  console.error(fallbackMessage, error);
  return new HttpsError("internal", fallbackMessage);
}

function closureHttpsError(error, fallbackMessage) {
  if (error instanceof HttpsError) return error;
  if (error instanceof WorkspaceClosureError) {
    return new HttpsError(error.code, error.message);
  }
  console.error(fallbackMessage, error);
  return new HttpsError("internal", fallbackMessage);
}

function safeInvitationId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(id)) {
    throw new HttpsError("invalid-argument", "Choose a valid invitation.");
  }
  return id;
}

function safeWorkspaceId(value) {
  const id = cleanText(value, 200);
  if (!id || id.includes("/")) {
    throw new HttpsError("invalid-argument", "Choose a valid shared workspace.");
  }
  return id;
}

function isoFromInvitationValue(value) {
  const millis = timestampMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : null;
}

function organizerInvitationSummary(invitationId, invitation, nowMillis = Date.now()) {
  const availability = resendAvailability(invitation, nowMillis);
  return {
    invitationId: invitationId || null,
    invitedEmail: normalizeInvitationEmail(invitation?.normalizedEmail),
    state: invitationState(invitation, nowMillis),
    expiresAt: isoFromInvitationValue(invitation?.expiresAt)
      || isoFromInvitationValue(invitation?.expiresAtIso),
    deliveryStatus: cleanText(invitation?.deliveryStatus || "not_sent", 40),
    lastSentAt: isoFromInvitationValue(invitation?.lastSentAt)
      || isoFromInvitationValue(invitation?.lastSentAtIso),
    resendAvailableAt: availability.availableAtMillis > nowMillis
      ? new Date(availability.availableAtMillis).toISOString()
      : null,
  };
}

function recipientInvitationSummary(invitationId, invitation, nowMillis = Date.now()) {
  return {
    invitationId,
    ...sanitizedInvitationContext(invitation, nowMillis),
  };
}

function invitationWithWorkspaceName(invitation, workspace) {
  return {
    ...invitation,
    workspaceNameSnapshot: invitationWorkspaceName(workspace, invitation),
  };
}

function authoritativeWorkspaceName(workspace) {
  return invitationWorkspaceName(workspace);
}

async function deleteQueryDocuments(db, query) {
  while (true) {
    const snapshot = await query.limit(400).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function finishWorkspaceClosureCleanup(db, cleanup) {
  const targets = workspaceClosureCleanupTargets(cleanup);
  for (const root of targets.firestoreRoots) {
    const collection = root.kind === "group" ? "sharedGroups" : "sharedRosters";
    await db.recursiveDelete(db.collection(collection).doc(root.id));
  }

  if (targets.deleteInvitationStateForGroupId) {
    await deleteQueryDocuments(
      db,
      db.collection(WORKSPACE_INVITATION_COLLECTION)
        .where("groupId", "==", targets.deleteInvitationStateForGroupId),
    );
    await deleteQueryDocuments(
      db,
      db.collection(WORKSPACE_INVITATION_LOCK_COLLECTION)
        .where("groupId", "==", targets.deleteInvitationStateForGroupId),
    );
  }

  for (const scope of targets.notificationScopes) {
    await deleteQueryDocuments(
      db,
      db.collection(THREAD_COLLECTION)
        .where("scopeKind", "==", scope.kind)
        .where("scopeId", "==", scope.id),
    );
  }

  const bucket = getStorage().bucket();
  for (const prefix of targets.storagePrefixes) {
    await bucket.deleteFiles({ prefix, force: true });
  }
}

async function ensureRecipientInvitationForGroup(db, groupId, recipient, nowMillis) {
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const lockRef = db.collection(WORKSPACE_INVITATION_LOCK_COLLECTION)
    .doc(invitationLockId(groupId, recipient.email));
  const adoptedInvitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION).doc();
  const nowIso = new Date(nowMillis).toISOString();

  return db.runTransaction(async (tx) => {
    const [groupSnap, lockSnap] = await tx.getAll(groupRef, lockRef);
    if (!groupSnap.exists) return null;
    const groupData = groupSnap.data() || {};
    if (!pendingInvitationIncludes(groupData, recipient.email)
      || activeMemberIncludes(groupData, recipient.uid, recipient.email)) {
      return null;
    }

    const activeInvitationId = lockSnap.exists
      ? String(lockSnap.data()?.activeInvitationId || "")
      : "";
    if (activeInvitationId) {
      const activeInvitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION)
        .doc(safeInvitationId(activeInvitationId));
      const activeInvitationSnap = await tx.get(activeInvitationRef);
      if (!activeInvitationSnap.exists) {
        throw new HttpsError("failed-precondition", "This invitation has invalid server state.");
      }
      const activeInvitation = activeInvitationSnap.data() || {};
      if (activeInvitation.groupId !== groupId
        || normalizeInvitationEmail(activeInvitation.normalizedEmail) !== recipient.email) {
        throw new HttpsError("failed-precondition", "This invitation has invalid server state.");
      }
      return {
        invitationId: activeInvitationRef.id,
        invitation: activeInvitation,
      };
    }

    const adopted = legacyInvitationRecord({
      groupId,
      normalizedEmail: recipient.email,
      workspaceName: invitationWorkspaceName(groupData),
      nowMillis,
    });
    const expiresAtMillis = Date.parse(adopted.expiresAtIso);
    const invitation = {
      ...adopted,
      createdAt: Timestamp.fromMillis(nowMillis),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      lastSendAttemptAt: null,
      lastSentAt: null,
    };
    tx.create(adoptedInvitationRef, invitation);
    tx.set(lockRef, {
      schemaVersion: 1,
      groupId,
      activeInvitationId: adoptedInvitationRef.id,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
    return {
      invitationId: adoptedInvitationRef.id,
      invitation,
    };
  });
}

async function deliverWorkspaceInvitation(db, invitationRef, invitation, sendAttemptId) {
  let emailSent = false;
  let deliveryStatus = "failed";
  let deliveryError = "";

  try {
    const content = invitationEmail({
      invitationId: invitationRef.id,
      workspaceName: invitation.workspaceNameSnapshot,
      inviterDisplayName: invitation.inviterDisplayNameSnapshot,
      expiresAtIso: invitation.expiresAtIso,
    });
    await sendResendEmail({
      to: invitation.normalizedEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    emailSent = true;
    deliveryStatus = "sent";
  } catch (error) {
    deliveryError = cleanText(error instanceof Error ? error.message : error, 180)
      || "Invitation email could not be sent.";
    console.error("Could not send workspace invitation email", error);
  }

  const completedAt = Date.now();
  const completedAtIso = new Date(completedAt).toISOString();
  await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(invitationRef);
    if (!currentSnap.exists) return;
    const current = currentSnap.data() || {};
    if (current.status !== "pending" || current.sendAttemptId !== sendAttemptId) return;
    tx.update(invitationRef, {
      deliveryStatus,
      deliveryError: deliveryError || FieldValue.delete(),
      lastSentAt: emailSent ? Timestamp.fromMillis(completedAt) : current.lastSentAt || null,
      lastSentAtIso: emailSent ? completedAtIso : current.lastSentAtIso || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: completedAtIso,
    });
  });

  return { emailSent, deliveryStatus };
}

exports.createWorkspaceOrganizerInvitation = onCall({
  region: REGION,
  timeoutSeconds: 60,
  secrets: [RESEND_API_KEY],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const groupId = safeWorkspaceId(request.data?.groupId);
  const requestedEmail = normalizeInvitationEmail(request.data?.invitedEmail);
  if (!requestedEmail || !requestedEmail.includes("@") || requestedEmail.length > 320) {
    throw new HttpsError("invalid-argument", "Enter a valid email address to invite.");
  }
  const db = getFirestore();
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const invitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION).doc();
  let lockRef;

  try {
    lockRef = db.collection(WORKSPACE_INVITATION_LOCK_COLLECTION)
      .doc(invitationLockId(groupId, requestedEmail));
  } catch (error) {
    throw invitationHttpsError(error, "Could not create this invitation.");
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAtMillis = invitationExpiryMillis(now);
  const expiresAtIso = new Date(expiresAtMillis).toISOString();
  const sendAttemptId = crypto.randomUUID();

  let transactionResult;
  try {
    transactionResult = await db.runTransaction(async (tx) => {
      const [groupSnap, lockSnap] = await tx.getAll(groupRef, lockRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }

      const groupData = groupSnap.data() || {};
      const validated = validateInvitationRequest({
        actor: invitationActor(request),
        workspace: groupData,
        targetEmail: requestedEmail,
      });
      const normalizedEmail = validated.normalizedTargetEmail;

      const activeInvitationId = lockSnap.exists
        ? String(lockSnap.data()?.activeInvitationId || "")
        : "";
      let activeInvitationRef = null;
      let activeInvitationSnap = null;
      if (activeInvitationId) {
        activeInvitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION)
          .doc(safeInvitationId(activeInvitationId));
        activeInvitationSnap = await tx.get(activeInvitationRef);
      }

      if (activeInvitationSnap?.exists) {
        const activeInvitation = activeInvitationSnap.data() || {};
        if (activeInvitation.groupId === groupId
          && shouldReuseWorkspaceInvitation({
            invitation: activeInvitation,
            workspace: groupData,
            email: normalizedEmail,
            nowMillis: now,
          })) {
          return {
            reused: true,
            invitationId: activeInvitationRef.id,
            invitation: activeInvitation,
          };
        }
      }

      const { rosterRefs } = await preflightGroupRosterLinkage({
        transaction: tx,
        firestore: db,
        expectedGroupId: groupId,
        workspace: groupData,
        maxRosterCount: MAX_GOVERNANCE_TRANSACTION_DOCUMENTS - 3,
        tooLargeMessage: "This workspace is too large for one invitation transaction.",
      });
      const workspaceNameSnapshot = invitationWorkspaceName(groupData);
      const inviterDisplayNameSnapshot = actorName(request.auth);
      const invitation = {
        schemaVersion: 1,
        groupId,
        normalizedEmail,
        status: "pending",
        workspaceNameSnapshot,
        invitedByUid: request.auth.uid,
        inviterDisplayNameSnapshot,
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
        expiresAt: Timestamp.fromMillis(expiresAtMillis),
        expiresAtIso,
        lastSendAttemptAt: Timestamp.fromMillis(now),
        lastSendAttemptAtIso: nowIso,
        lastSentAt: null,
        lastSentAtIso: null,
        deliveryStatus: "sending",
        deliveryError: null,
        sendAttemptId,
      };

      if (activeInvitationSnap?.exists && activeInvitationSnap.data()?.status === "pending") {
        const replacementStatus = supersededInvitationStatus(groupData, normalizedEmail);
        tx.update(activeInvitationRef, {
          status: replacementStatus,
          ...(replacementStatus === "cancelled" ? {
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledAtIso: nowIso,
            cancellationReason: "workspace-no-longer-pending",
          } : {}),
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      }

      tx.create(invitationRef, invitation);
      tx.set(lockRef, {
        schemaVersion: 1,
        groupId,
        activeInvitationId: invitationRef.id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      tx.update(groupRef, {
        pendingInviteEmails: FieldValue.arrayUnion(normalizedEmail),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      rosterRefs.forEach((rosterRef) => {
        tx.update(rosterRef, {
          pendingInviteEmails: FieldValue.arrayUnion(normalizedEmail),
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      });

      return {
        reused: false,
        invitationId: invitationRef.id,
        invitation,
      };
    });
  } catch (error) {
    throw invitationHttpsError(error, "Could not create this invitation.");
  }

  if (transactionResult.reused) {
    return {
      ok: true,
      reused: true,
      emailSent: false,
      invitation: organizerInvitationSummary(
        transactionResult.invitationId,
        transactionResult.invitation,
        now,
      ),
    };
  }

  const delivery = await deliverWorkspaceInvitation(
    db,
    invitationRef,
    transactionResult.invitation,
    sendAttemptId,
  );
  return {
    ok: true,
    reused: false,
    emailSent: delivery.emailSent,
    invitation: organizerInvitationSummary(transactionResult.invitationId, {
      ...transactionResult.invitation,
      deliveryStatus: delivery.deliveryStatus,
      lastSentAtIso: delivery.emailSent ? new Date().toISOString() : null,
    }),
  };
});

exports.resendWorkspaceOrganizerInvitation = onCall({
  region: REGION,
  timeoutSeconds: 60,
  secrets: [RESEND_API_KEY],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const invitationId = safeInvitationId(request.data?.invitationId);
  const db = getFirestore();
  const invitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION).doc(invitationId);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sendAttemptId = crypto.randomUUID();
  let invitation;

  try {
    invitation = await db.runTransaction(async (tx) => {
      const invitationSnap = await tx.get(invitationRef);
      if (!invitationSnap.exists) {
        throw new HttpsError("not-found", "This invitation no longer exists.");
      }
      const invitationData = invitationSnap.data() || {};
      const groupId = safeWorkspaceId(invitationData.groupId);
      const groupRef = db.collection("sharedGroups").doc(groupId);
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }

      const groupData = groupSnap.data() || {};
      const validated = validateInvitationRequest({
        actor: invitationActor(request),
        workspace: groupData,
        targetEmail: invitationData.normalizedEmail,
      });
      if (!pendingInvitationIncludes(groupData, validated.normalizedTargetEmail)) {
        throw new HttpsError(
          "failed-precondition",
          "This invitation is no longer active. Send a new invitation instead.",
        );
      }
      const availability = resendAvailability(invitationData, now);
      if (availability.state === "expired") {
        throw new HttpsError("failed-precondition", "This invitation has expired. Send a new invitation instead.");
      }
      if (availability.state !== "pending") {
        throw new HttpsError("failed-precondition", "This invitation is no longer pending.");
      }
      if (!availability.allowed) {
        const seconds = Math.max(1, Math.ceil(availability.retryAfterMillis / 1000));
        throw new HttpsError("resource-exhausted", `Wait ${seconds} seconds before resending this invitation.`);
      }

      const workspaceNameSnapshot = invitationWorkspaceName(groupData, invitationData);
      tx.update(invitationRef, {
        workspaceNameSnapshot,
        deliveryStatus: "sending",
        deliveryError: FieldValue.delete(),
        sendAttemptId,
        lastSendAttemptAt: Timestamp.fromMillis(now),
        lastSendAttemptAtIso: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      return {
        ...invitationData,
        workspaceNameSnapshot,
        deliveryStatus: "sending",
        deliveryError: null,
        sendAttemptId,
        lastSendAttemptAt: Timestamp.fromMillis(now),
        lastSendAttemptAtIso: nowIso,
      };
    });
  } catch (error) {
    throw invitationHttpsError(error, "Could not resend this invitation.");
  }

  const delivery = await deliverWorkspaceInvitation(db, invitationRef, invitation, sendAttemptId);
  return {
    ok: true,
    emailSent: delivery.emailSent,
    invitation: organizerInvitationSummary(invitationId, {
      ...invitation,
      deliveryStatus: delivery.deliveryStatus,
      lastSentAtIso: delivery.emailSent ? new Date().toISOString() : invitation.lastSentAtIso,
    }),
  };
});

exports.cancelWorkspaceOrganizerInvitation = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const groupId = safeWorkspaceId(request.data?.groupId);
  const requestedInvitationId = request.data?.invitationId
    ? safeInvitationId(request.data.invitationId)
    : "";
  const requestedEmail = normalizeInvitationEmail(request.data?.invitedEmail);
  if (!requestedInvitationId && (!requestedEmail || !requestedEmail.includes("@"))) {
    throw new HttpsError("invalid-argument", "Choose an invitation to cancel.");
  }

  const db = getFirestore();
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }
      const groupData = groupSnap.data() || {};
      validateInvitationActor({ actor: invitationActor(request), workspace: groupData });

      let invitationRef = requestedInvitationId
        ? db.collection(WORKSPACE_INVITATION_COLLECTION).doc(requestedInvitationId)
        : null;
      let invitationSnap = invitationRef ? await tx.get(invitationRef) : null;
      if (requestedInvitationId && !invitationSnap.exists) {
        throw new HttpsError("not-found", "This invitation no longer exists.");
      }
      if (invitationSnap?.exists && invitationSnap.data()?.groupId !== groupId) {
        throw new HttpsError("permission-denied", "This invitation does not belong to that workspace.");
      }

      let normalizedEmail = invitationSnap?.exists
        ? normalizeInvitationEmail(invitationSnap.data()?.normalizedEmail)
        : requestedEmail;
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        throw new HttpsError("failed-precondition", "This invitation has invalid recipient data.");
      }
      const lockRef = db.collection(WORKSPACE_INVITATION_LOCK_COLLECTION)
        .doc(invitationLockId(groupId, normalizedEmail));
      const lockSnap = await tx.get(lockRef);

      if (lockSnap.exists && lockSnap.data()?.activeInvitationId) {
        const lockedInvitationId = safeInvitationId(lockSnap.data().activeInvitationId);
        if (!invitationRef || invitationRef.id !== lockedInvitationId) {
          const lockedInvitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION)
            .doc(lockedInvitationId);
          const lockedInvitationSnap = await tx.get(lockedInvitationRef);
          if (lockedInvitationSnap.exists) {
            if (lockedInvitationSnap.data()?.groupId !== groupId
              || normalizeInvitationEmail(lockedInvitationSnap.data()?.normalizedEmail) !== normalizedEmail) {
              throw new HttpsError("failed-precondition", "This invitation has invalid workspace data.");
            }
            invitationRef = lockedInvitationRef;
            invitationSnap = lockedInvitationSnap;
          } else {
            throw new HttpsError("failed-precondition", "This invitation has invalid workspace data.");
          }
        }
      }

      const { rosterRefs } = await preflightGroupRosterLinkage({
        transaction: tx,
        firestore: db,
        expectedGroupId: groupId,
        workspace: groupData,
        maxRosterCount: MAX_GOVERNANCE_TRANSACTION_DOCUMENTS - 3,
        tooLargeMessage: "This workspace is too large for one invitation transaction.",
      });

      tx.update(groupRef, {
        pendingInviteEmails: FieldValue.arrayRemove(normalizedEmail),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      rosterRefs.forEach((rosterRef) => {
        tx.update(rosterRef, {
          pendingInviteEmails: FieldValue.arrayRemove(normalizedEmail),
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      });
      if (invitationRef && invitationSnap?.exists) {
        tx.update(invitationRef, {
          status: "cancelled",
          cancelledByUid: request.auth.uid,
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      }
      if (lockSnap.exists) tx.delete(lockRef);

      return { ok: true };
    });
  } catch (error) {
    throw invitationHttpsError(error, "Could not cancel this invitation.");
  }
});

exports.getWorkspaceOrganizerInvitationContext = onCall({ region: REGION }, async (request) => {
  const invitationId = safeInvitationId(request.data?.invitationId);
  const db = getFirestore();
  const invitationSnap = await db
    .collection(WORKSPACE_INVITATION_COLLECTION)
    .doc(invitationId)
    .get();
  if (!invitationSnap.exists) {
    throw new HttpsError("not-found", "This invitation no longer exists.");
  }
  const invitation = invitationSnap.data() || {};
  const groupId = safeWorkspaceId(invitation.groupId);
  const groupSnap = await db.collection("sharedGroups").doc(groupId).get();
  if (!groupSnap.exists) {
    throw new HttpsError("not-found", "This shared workspace is no longer available.");
  }
  const invitationContext = invitationWithWorkspaceName(
    invitation,
    groupSnap.data() || {},
  );
  return {
    ...sanitizedInvitationContext(invitationContext),
    viewerStatus: invitationViewerStatus(invitation, invitationActor(request)),
  };
});

exports.getSharedWorkspaceClosureState = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const rosterId = safeWorkspaceId(request.data?.rosterId);
  const db = getFirestore();
  try {
    const closureSnapshot = await db.collection(WORKSPACE_CLOSURE_COLLECTION)
      .where("rosterIds", "array-contains", rosterId)
      .limit(20)
      .get();
    const resumable = resumableWorkspaceClosure({
      actorUid: request.auth.uid,
      rosterId,
      checkpoints: closureSnapshot.docs.map((document) => document.data() || {}),
    });
    if (resumable) return resumable;

    const rosterSnap = await db.collection("sharedRosters").doc(rosterId).get();
    if (!rosterSnap.exists) {
      throw new HttpsError("not-found", "This shared roster no longer exists.");
    }
    const roster = rosterSnap.data() || {};
    const rawGroupId = typeof roster.groupId === "string" ? roster.groupId.trim() : "";
    if (rawGroupId) {
      const groupId = safeWorkspaceId(rawGroupId);
      const groupSnap = await db.collection("sharedGroups").doc(groupId).get();
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }
      const group = groupSnap.data() || {};
      return {
        workspaceKind: "group",
        workspaceId: groupId,
        groupId,
        rosterId,
        ...workspaceClosureState({
          actorUid: request.auth.uid,
          workspace: group,
          workspaceName: authoritativeWorkspaceName(group),
        }),
      };
    }

    return {
      workspaceKind: "roster",
      workspaceId: rosterId,
      groupId: null,
      rosterId,
      ...workspaceClosureState({
        actorUid: request.auth.uid,
        workspace: roster,
        workspaceName: authoritativeWorkspaceName(roster),
      }),
    };
  } catch (error) {
    throw closureHttpsError(error, "Could not load workspace closure status.");
  }
});

exports.closeSharedWorkspace = onCall({
  region: REGION,
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const rosterId = safeWorkspaceId(request.data?.rosterId);
  const workspaceKind = String(request.data?.workspaceKind || "").trim();
  const workspaceId = safeWorkspaceId(request.data?.workspaceId);
  const confirmationName = cleanText(request.data?.confirmationName, 120);
  let cleanup;
  let closureRef;
  const db = getFirestore();

  try {
    const closureId = workspaceClosureId(workspaceKind, workspaceId);
    closureRef = db.collection(WORKSPACE_CLOSURE_COLLECTION).doc(closureId);
    cleanup = await db.runTransaction(async (tx) => {
      const closureSnap = await tx.get(closureRef);
      if (closureSnap.exists) {
        const existing = closureSnap.data() || {};
        if (existing.closedByUid !== request.auth.uid
          || existing.workspaceKind !== workspaceKind
          || existing.workspaceId !== workspaceId
          || existing.rosterId !== rosterId) {
          throw new HttpsError("permission-denied", "This workspace closure cannot be resumed by this account.");
        }
        return {
          workspaceKind,
          workspaceId,
          workspaceName: cleanText(existing.workspaceName, 120) || "Stripes workspace",
          groupId: typeof existing.groupId === "string" ? existing.groupId : null,
          rosterId,
          rosterIds: Array.isArray(existing.rosterIds) ? existing.rosterIds : [],
        };
      }

      const rosterRef = db.collection("sharedRosters").doc(rosterId);
      const rosterSnap = await tx.get(rosterRef);
      if (!rosterSnap.exists) {
        throw new HttpsError("not-found", "This shared roster no longer exists.");
      }
      const roster = rosterSnap.data() || {};
      const rosterGroupId = typeof roster.groupId === "string" ? roster.groupId.trim() : "";
      const nowIso = new Date().toISOString();

      if (workspaceKind === "group") {
        if (!rosterGroupId || rosterGroupId !== workspaceId) {
          throw new HttpsError("failed-precondition", "This roster is not linked to that shared workspace.");
        }
        const groupRef = db.collection("sharedGroups").doc(workspaceId);
        const groupSnap = await tx.get(groupRef);
        if (!groupSnap.exists) {
          throw new HttpsError("not-found", "This shared workspace no longer exists.");
        }
        const group = groupSnap.data() || {};
        const workspaceName = authoritativeWorkspaceName(group);
        validateWorkspaceClosure({
          actorUid: request.auth.uid,
          workspace: group,
          workspaceName,
          confirmationName,
        });

        const linkedRosterQuery = db.collection("sharedRosters").where("groupId", "==", workspaceId);
        const linkedRosterSnap = await tx.get(linkedRosterQuery);
        const rosterIds = linkedRosterSnap.docs.map((document) => document.id);
        if (!rosterIds.includes(rosterId)) {
          throw new HttpsError("failed-precondition", "This roster is no longer linked to the shared workspace.");
        }
        if (rosterIds.length + 2 > MAX_GOVERNANCE_TRANSACTION_DOCUMENTS) {
          throw new HttpsError("resource-exhausted", "This workspace is too large for one closure transaction.");
        }

        const result = {
          workspaceKind,
          workspaceId,
          workspaceName,
          groupId: workspaceId,
          rosterId,
          rosterIds,
        };
        tx.create(closureRef, {
          schemaVersion: 1,
          ...result,
          closedByUid: request.auth.uid,
          cleanupStatus: "pending",
          createdAt: FieldValue.serverTimestamp(),
          createdAtIso: nowIso,
        });
        linkedRosterSnap.docs.forEach((document) => tx.delete(document.ref));
        tx.delete(groupRef);
        return result;
      }

      if (workspaceKind !== "roster" || workspaceId !== rosterId || rosterGroupId) {
        throw new HttpsError("failed-precondition", "This is not a standalone shared roster.");
      }
      const workspaceName = authoritativeWorkspaceName(roster);
      validateWorkspaceClosure({
        actorUid: request.auth.uid,
        workspace: roster,
        workspaceName,
        confirmationName,
      });
      const result = {
        workspaceKind,
        workspaceId,
        workspaceName,
        groupId: null,
        rosterId,
        rosterIds: [rosterId],
      };
      tx.create(closureRef, {
        schemaVersion: 1,
        ...result,
        closedByUid: request.auth.uid,
        cleanupStatus: "pending",
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: nowIso,
      });
      tx.delete(rosterRef);
      return result;
    });
  } catch (error) {
    throw closureHttpsError(error, "Could not close this shared workspace.");
  }

  try {
    await finishWorkspaceClosureCleanup(db, cleanup);
    await closureRef.delete();
  } catch (error) {
    console.error("Could not finish shared-workspace closure cleanup", error);
    await closureRef.set({
      cleanupStatus: "failed",
      cleanupFailedAt: FieldValue.serverTimestamp(),
      cleanupFailedAtIso: new Date().toISOString(),
    }, { merge: true }).catch(() => undefined);
    throw new HttpsError(
      "internal",
      "The workspace was closed, but cleanup is still finishing. Try again to complete it.",
    );
  }

  return {
    ok: true,
    workspaceName: cleanup.workspaceName,
    groupId: cleanup.groupId,
    rosterIds: cleanup.rosterIds,
  };
});

exports.listWorkspaceOrganizerInvitations = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const groupId = safeWorkspaceId(request.data?.groupId);
  const db = getFirestore();
  const groupRef = db.collection("sharedGroups").doc(groupId);

  try {
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "This shared workspace no longer exists.");
    }
    const groupData = groupSnap.data() || {};
    validateInvitationActor({ actor: invitationActor(request), workspace: groupData });

    const invitationsSnap = await db.collection(WORKSPACE_INVITATION_COLLECTION)
      .where("groupId", "==", groupId)
      .get();
    const recordsByEmail = new Map();
    invitationsSnap.docs.forEach((invitationDoc) => {
      const data = invitationDoc.data() || {};
      const email = normalizeInvitationEmail(data.normalizedEmail);
      if (!email) return;
      const current = recordsByEmail.get(email);
      const createdAt = timestampMillis(data.createdAt) || timestampMillis(data.createdAtIso);
      const currentCreatedAt = current
        ? timestampMillis(current.data.createdAt) || timestampMillis(current.data.createdAtIso)
        : -1;
      if (!current || createdAt > currentCreatedAt) {
        recordsByEmail.set(email, { id: invitationDoc.id, data });
      }
    });

    const pendingEmails = uniqueEmails(groupData.pendingInviteEmails);
    const invitations = pendingEmails.map((email) => {
      const record = recordsByEmail.get(email);
      if (record) return organizerInvitationSummary(record.id, record.data);
      return {
        invitationId: null,
        invitedEmail: email,
        state: "pending",
        expiresAt: null,
        deliveryStatus: "not_sent",
        lastSentAt: null,
        resendAvailableAt: null,
      };
    });

    return { invitations };
  } catch (error) {
    throw invitationHttpsError(error, "Could not load workspace invitations.");
  }
});

exports.listWorkspaceRecipientInvitations = onCall({ region: REGION }, async (request) => {
  let recipient;
  try {
    recipient = verifiedInvitationIdentity(invitationActor(request));
  } catch (error) {
    throw invitationHttpsError(error, "Could not load your invitations.");
  }

  const db = getFirestore();
  const now = Date.now();
  try {
    const groupSnapshot = await db.collection("sharedGroups")
      .where("pendingInviteEmails", "array-contains", recipient.email)
      .limit(50)
      .get();
    const records = await Promise.all(groupSnapshot.docs.map(async (groupDoc) => {
      const record = await ensureRecipientInvitationForGroup(db, groupDoc.id, recipient, now);
      return record ? { ...record, workspace: groupDoc.data() || {} } : null;
    }));
    const invitations = records
      .filter(Boolean)
      .map((record) => recipientInvitationSummary(
        record.invitationId,
        invitationWithWorkspaceName(record.invitation, record.workspace),
        now,
      ))
      .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
    return { invitations };
  } catch (error) {
    throw invitationHttpsError(error, "Could not load your invitations.");
  }
});

exports.acceptWorkspaceOrganizerInvitation = onCall({
  region: REGION,
  timeoutSeconds: 60,
  secrets: [RESEND_API_KEY],
}, async (request) => {
  let recipient;
  try {
    recipient = verifiedInvitationIdentity(invitationActor(request));
  } catch (error) {
    throw invitationHttpsError(error, "Could not accept this invitation.");
  }

  const invitationId = safeInvitationId(request.data?.invitationId);
  const db = getFirestore();
  const invitationRef = db.collection(WORKSPACE_INVITATION_COLLECTION).doc(invitationId);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  let acceptance;
  try {
    acceptance = await db.runTransaction(async (tx) => {
      const invitationSnap = await tx.get(invitationRef);
      if (!invitationSnap.exists) {
        throw new HttpsError("not-found", "This invitation no longer exists.");
      }
      const invitationData = invitationSnap.data() || {};
      const groupId = safeWorkspaceId(invitationData.groupId);
      const invitedEmail = normalizeInvitationEmail(invitationData.normalizedEmail);
      const groupRef = db.collection("sharedGroups").doc(groupId);
      const lockRef = db.collection(WORKSPACE_INVITATION_LOCK_COLLECTION)
        .doc(invitationLockId(groupId, invitedEmail));
      const [groupSnap, lockSnap] = await tx.getAll(groupRef, lockRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }

      const groupData = groupSnap.data() || {};
      const {
        rosterIds,
        rosterRefs,
        linkedRosters,
      } = await preflightGroupRosterLinkage({
        transaction: tx,
        firestore: db,
        expectedGroupId: groupId,
        workspace: groupData,
        maxRosterCount: MAX_GOVERNANCE_TRANSACTION_DOCUMENTS - 3,
        tooLargeMessage: "This workspace is too large for one invitation transaction.",
      });
      const plan = planInvitationAcceptance({
        actor: invitationActor(request),
        invitation: invitationData,
        workspace: groupData,
        linkedRosters,
        displayName: actorName(request.auth),
        nowMillis: now,
        joinedAt: Timestamp.fromMillis(now),
        governanceEligibleAt: Timestamp.fromMillis(now + GOVERNANCE_ELIGIBILITY_DELAY_MS),
      });

      if (!lockSnap.exists || lockSnap.data()?.activeInvitationId !== invitationId) {
        throw new HttpsError("failed-precondition", "This invitation is no longer active.");
      }
      if (plan.identity.uid !== recipient.uid || plan.identity.email !== recipient.email) {
        throw new HttpsError("permission-denied", "This invitation does not match the signed-in account.");
      }

      tx.update(groupRef, {
        ...plan.workspaceUpdates,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      rosterRefs.forEach((rosterRef, index) => {
        tx.update(rosterRef, {
          ...plan.rosterUpdates[index],
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      });
      tx.update(invitationRef, {
        status: "accepted",
        acceptedByUid: recipient.uid,
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedAtIso: nowIso,
        acceptedOrganizerGovernanceEligibleAt: Timestamp.fromMillis(
          now + GOVERNANCE_ELIGIBILITY_DELAY_MS,
        ),
        acceptedOrganizerGovernanceEligibleAtIso: new Date(
          now + GOVERNANCE_ELIGIBILITY_DELAY_MS,
        ).toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      tx.delete(lockRef);

      const result = {
        ok: true,
        invitationId,
        groupId,
        workspaceName: invitationWorkspaceName(groupData, invitationData),
        rosterIds,
        acceptedAt: nowIso,
        governanceEligibleAt: new Date(now + GOVERNANCE_ELIGIBILITY_DELAY_MS).toISOString(),
      };
      return {
        result,
        notification: organizerJoinedNotification({
          workspace: groupData,
          invitation: { ...invitationData, status: "accepted" },
          newOrganizerUid: recipient.uid,
          newOrganizerEmail: recipient.email,
          newOrganizerDisplayName: actorName(request.auth),
          acceptedAtIso: nowIso,
          governanceEligibleAtIso: result.governanceEligibleAt,
        }),
      };
    });
  } catch (error) {
    throw invitationHttpsError(error, "Could not accept this invitation.");
  }

  let delivery = {
    status: "failed",
    recipientCount: acceptance.notification?.recipientEmails.length || 0,
    sentCount: 0,
    failedCount: acceptance.notification?.recipientEmails.length || 0,
  };
  try {
    delivery = await deliverOrganizerJoinedNotification(
      acceptance.notification,
      sendResendEmail,
    );
  } catch (error) {
    console.error("Could not deliver new-organizer governance notification", error);
  }

  try {
    await invitationRef.set({
      organizerJoinedNotificationStatus: delivery.status,
      organizerJoinedNotificationRecipientCount: delivery.recipientCount,
      organizerJoinedNotificationSentCount: delivery.sentCount,
      organizerJoinedNotificationFailedCount: delivery.failedCount,
      organizerJoinedNotificationUpdatedAt: FieldValue.serverTimestamp(),
      organizerJoinedNotificationUpdatedAtIso: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.error("Could not record new-organizer notification delivery state", error);
  }

  return {
    ...acceptance.result,
    organizerJoinedNotificationStatus: delivery.status,
  };
});

exports.startOrganizerRemovalProposal = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const groupId = cleanText(request.data?.groupId, 200);
  const targetEmail = cleanEmail(request.data?.targetEmail);
  if (!groupId || groupId.includes("/")) {
    throw new HttpsError("invalid-argument", "Choose a valid shared workspace.");
  }
  if (!targetEmail || !targetEmail.includes("@") || targetEmail.length > 320) {
    throw new HttpsError("invalid-argument", "Choose a valid organizer.");
  }

  const db = getFirestore();
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const proposalRef = groupRef.collection("organizerRemovalProposals").doc();
  const privateRef = groupRef.collection("organizerRemovalPrivate").doc(proposalRef.id);
  const controlRef = groupRef.collection("organizerRemovalControl").doc("state");
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  try {
    return await db.runTransaction(async (tx) => {
      const [groupSnap, controlSnap] = await tx.getAll(groupRef, controlRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }

      const groupData = groupSnap.data() || {};
      const organizerUids = organizerUidsFromWorkspace(groupData);
      if (!organizerUids.includes(request.auth.uid)) {
        throw new HttpsError("permission-denied", "Only an active organizer can propose removal.");
      }
      const proposerEligibility = organizerGovernanceEligibility(
        groupData,
        request.auth.uid,
        now,
      );
      if (!proposerEligibility.eligible) {
        throw new HttpsError(
          "failed-precondition",
          "Protected organizer-removal proposals are not available to this organizer yet.",
        );
      }
      const governanceEligibleUids = governanceEligibleOrganizerUids(groupData, now);
      if (governanceEligibleUids.length < 2) {
        throw new HttpsError(
          "failed-precondition",
          "At least two governance-eligible organizers are required to start a removal vote.",
        );
      }
      await preflightGroupRosterLinkage({
        transaction: tx,
        firestore: db,
        expectedGroupId: groupId,
        workspace: groupData,
        maxRosterCount: MAX_GOVERNANCE_TRANSACTION_DOCUMENTS - organizerUids.length - 4,
        tooLargeMessage: "This workspace is too large for one protected removal transaction.",
      });
      const targetUid = resolveMemberUidByEmail(groupData, targetEmail);
      if (!targetUid || !organizerUids.includes(targetUid)) {
        throw new HttpsError("failed-precondition", "That organizer is no longer active in this workspace.");
      }
      if (targetUid === request.auth.uid) {
        throw new HttpsError("invalid-argument", "Use Leave shared roster to remove your own access.");
      }

      const electorate = buildOrganizerRemovalElectorate(groupData, targetUid, now);
      const currentMembershipFingerprint = organizerMembershipFingerprint([
        targetUid,
        ...electorate.governanceEligibleOrganizerUids,
      ]);

      const activeProposalId = controlSnap.exists
        ? String(controlSnap.data()?.activeProposalId || "")
        : "";
      let staleActiveProposal = null;
      if (activeProposalId) {
        const activeProposalRef = groupRef.collection("organizerRemovalProposals").doc(activeProposalId);
        const activeProposalSnap = await tx.get(activeProposalRef);
        if (activeProposalSnap.exists) {
          const activeStatus = String(activeProposalSnap.data()?.status || "");
          if (!["passed", "failed", "cancelled"].includes(activeStatus)) {
            const activePrivateRef = groupRef.collection("organizerRemovalPrivate").doc(activeProposalId);
            const activePrivateSnap = await tx.get(activePrivateRef);
            const activePrivateData = activePrivateSnap.exists ? activePrivateSnap.data() || {} : {};
            const activeFrozenGovernanceUids = Array.from(new Set(
              (Array.isArray(activePrivateData.governanceEligibleOrganizerUids)
                ? activePrivateData.governanceEligibleOrganizerUids
                : activePrivateData.organizerUids || [])
                .filter((uid) => typeof uid === "string" && uid.length > 0),
            ));
            const activeTargetUid = String(activePrivateData.targetUid || "");
            const activeRelevantUids = Array.from(new Set([
              activeTargetUid,
              ...activeFrozenGovernanceUids,
            ])).filter((uid) => organizerUids.includes(uid));
            const activeMembershipFingerprint = organizerMembershipFingerprint(activeRelevantUids);
            if (!activePrivateSnap.exists
              || activePrivateData.membershipFingerprint === activeMembershipFingerprint) {
              throw new HttpsError("failed-precondition", "An organizer-removal vote is already open.");
            }
            staleActiveProposal = {
              proposalRef: activeProposalRef,
              privateRef: activePrivateRef,
              castCount: Number.isInteger(activePrivateData.castCount) ? activePrivateData.castCount : 0,
              votedUids: Array.from(new Set(
                (Array.isArray(activePrivateData.votedUids) ? activePrivateData.votedUids : [])
                  .filter((uid) => typeof uid === "string" && uid.length > 0),
              )),
            };
          }
        }
      }

      const initialResult = evaluateOrganizerRemovalVote({
        totalOrganizerCount: electorate.totalOrganizerCount,
        eligibleOrganizerCount: electorate.eligibleOrganizerCount,
        yesCount: 0,
        noCount: 0,
      });
      const targetDisplayNameSnapshot = memberDisplayName(groupData, targetUid, targetEmail);
      const membershipFingerprint = currentMembershipFingerprint;
      const isOpen = initialResult.status === "open";

      if (staleActiveProposal) {
        tx.update(staleActiveProposal.proposalRef, {
          status: "cancelled",
          yesCount: null,
          noCount: null,
          castCount: staleActiveProposal.castCount,
          outcomeReason: "membership_changed",
          closedAt: FieldValue.serverTimestamp(),
          closedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
        staleActiveProposal.votedUids.forEach((voterUid) => {
          tx.delete(staleActiveProposal.privateRef.collection("ballots").doc(voterUid));
        });
        tx.delete(staleActiveProposal.privateRef);
      }

      tx.create(proposalRef, {
        schemaVersion: 2,
        status: initialResult.status,
        targetUid,
        targetDisplayNameSnapshot,
        totalOrganizerCount: electorate.totalOrganizerCount,
        eligibleGovernanceOrganizerCount: electorate.eligibleGovernanceOrganizerCount,
        eligibleOrganizerCount: electorate.eligibleOrganizerCount,
        targetGovernanceEligible: electorate.targetGovernanceEligible,
        requiredYes: electorate.requiredYes,
        yesCount: isOpen ? null : initialResult.yesCount,
        noCount: isOpen ? null : initialResult.noCount,
        castCount: initialResult.castCount,
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
        closedAt: isOpen ? null : FieldValue.serverTimestamp(),
        closedAtIso: isOpen ? null : nowIso,
        outcomeReason: initialResult.outcomeReason,
      });

      if (isOpen) {
        tx.create(privateRef, {
          schemaVersion: 2,
          proposalId: proposalRef.id,
          targetUid,
          proposedByUid: request.auth.uid,
          organizerUids: electorate.governanceEligibleOrganizerUids,
          governanceEligibleOrganizerUids: electorate.governanceEligibleOrganizerUids,
          eligibleVoterUids: electorate.eligibleVoterUids,
          membershipFingerprint,
          yesCount: 0,
          noCount: 0,
          castCount: 0,
          votedUids: [],
          createdAt: FieldValue.serverTimestamp(),
          createdAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
        tx.set(controlRef, {
          schemaVersion: 1,
          activeProposalId: proposalRef.id,
          membershipFingerprint,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      } else if (controlSnap.exists) {
        tx.delete(controlRef);
      }

      return {
        ok: true,
        proposalId: proposalRef.id,
        status: initialResult.status,
        targetDisplayNameSnapshot,
        totalOrganizerCount: electorate.totalOrganizerCount,
        eligibleGovernanceOrganizerCount: electorate.eligibleGovernanceOrganizerCount,
        eligibleOrganizerCount: electorate.eligibleOrganizerCount,
        targetGovernanceEligible: electorate.targetGovernanceEligible,
        requiredYes: electorate.requiredYes,
        castCount: 0,
        outcomeReason: initialResult.outcomeReason,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof WorkspaceRosterLinkageError) {
      throw new HttpsError(error.code, error.message);
    }
    console.error("Could not create organizer-removal proposal", error);
    throw new HttpsError("internal", "Could not start the organizer-removal vote.");
  }
});

exports.getOrganizerRemovalState = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const groupId = cleanText(request.data?.groupId, 200);
  const proposalId = cleanText(request.data?.proposalId, 200);
  if (!groupId || groupId.includes("/") || !proposalId || proposalId.includes("/")) {
    throw new HttpsError("invalid-argument", "Choose a valid organizer-removal vote.");
  }

  const db = getFirestore();
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const proposalRef = groupRef.collection("organizerRemovalProposals").doc(proposalId);
  const privateRef = groupRef.collection("organizerRemovalPrivate").doc(proposalId);
  const [groupSnap, proposalSnap, privateSnap] = await db.getAll(groupRef, proposalRef, privateRef);
  if (!groupSnap.exists || !proposalSnap.exists) {
    throw new HttpsError("not-found", "This organizer-removal vote no longer exists.");
  }

  const groupData = groupSnap.data() || {};
  const proposalData = proposalSnap.data() || {};
  const organizerUids = organizerUidsFromWorkspace(groupData);
  const isTarget = proposalData.targetUid === request.auth.uid;
  if (!organizerUids.includes(request.auth.uid) && !isTarget) {
    throw new HttpsError("permission-denied", "You cannot view this organizer-removal vote.");
  }

  const privateData = privateSnap.exists ? privateSnap.data() || {} : {};
  const eligibleVoterUids = Array.isArray(privateData.eligibleVoterUids)
    ? privateData.eligibleVoterUids
    : [];
  const votedUids = Array.isArray(privateData.votedUids) ? privateData.votedUids : [];
  const isOpen = proposalData.status === "open";
  const eligible = isOpen
    && organizerUids.includes(request.auth.uid)
    && eligibleVoterUids.includes(request.auth.uid)
    && organizerGovernanceEligibility(groupData, request.auth.uid).eligible;

  return {
    proposalId,
    status: String(proposalData.status || ""),
    eligible,
    hasVoted: eligible && votedUids.includes(request.auth.uid),
  };
});

exports.castOrganizerRemovalBallot = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const groupId = cleanText(request.data?.groupId, 200);
  const proposalId = cleanText(request.data?.proposalId, 200);
  const choice = String(request.data?.choice || "").trim().toLowerCase();
  if (!groupId || groupId.includes("/") || !proposalId || proposalId.includes("/")) {
    throw new HttpsError("invalid-argument", "Choose a valid organizer-removal vote.");
  }
  if (!["yes", "no"].includes(choice)) {
    throw new HttpsError("invalid-argument", "Choose Yes or No.");
  }

  const db = getFirestore();
  const groupRef = db.collection("sharedGroups").doc(groupId);
  const proposalRef = groupRef.collection("organizerRemovalProposals").doc(proposalId);
  const privateRef = groupRef.collection("organizerRemovalPrivate").doc(proposalId);
  const controlRef = groupRef.collection("organizerRemovalControl").doc("state");
  const ballotRef = privateRef.collection("ballots").doc(request.auth.uid);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  try {
    return await db.runTransaction((tx) => castOrganizerRemovalBallotTransaction({
      transaction: tx,
      firestore: db,
      refs: {
        groupRef,
        proposalRef,
        privateRef,
        controlRef,
        ballotRef,
      },
      actorUid: request.auth.uid,
      groupId,
      proposalId,
      choice,
      nowMillis: now,
      nowIso,
      maxTransactionDocuments: MAX_GOVERNANCE_TRANSACTION_DOCUMENTS,
      fieldValue: FieldValue,
    }));
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof OrganizerRemovalTransactionError) {
      throw new HttpsError(error.code, error.message);
    }
    if (error instanceof WorkspaceRosterLinkageError) {
      throw new HttpsError(error.code, error.message);
    }
    console.error("Could not cast organizer-removal ballot", error);
    throw new HttpsError("internal", "Could not record the organizer-removal ballot.");
  }
});

exports.registerPushInstallation = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const installationId = cleanText(request.data?.installationId, 300);
  if (!installationId || installationId.length < 10) throw new HttpsError("invalid-argument", "Invalid push installation.");
  const db = getFirestore();
  const installationKey = messageIdPart(installationId);
  const installationRef = db.collection(PUSH_INSTALLATION_COLLECTION).doc(installationKey);
  const currentUserRef = db.collection(USER_COLLECTION).doc(request.auth.uid);
  await db.runTransaction(async (tx) => {
    const installationSnap = await tx.get(installationRef);
    const oldOwnerUid = installationSnap.exists ? String(installationSnap.data()?.ownerUid || "") : "";
    if (oldOwnerUid && oldOwnerUid !== request.auth.uid) {
      tx.set(db.collection(USER_COLLECTION).doc(oldOwnerUid), {
        pushFids: FieldValue.arrayRemove(installationId),
        pushUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    tx.set(currentUserRef, {
      email: cleanEmail(request.auth.token.email),
      displayName: actorName(request.auth),
      pushFids: FieldValue.arrayUnion(installationId),
      pushEnabled: true,
      pushUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(installationRef, {
      ownerUid: request.auth.uid,
      ownerEmail: cleanEmail(request.auth.token.email),
      installationId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { ok: true };
});

exports.notifyActionBoardStep = onCall({ region: REGION, timeoutSeconds: 60, secrets: [RESEND_API_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const db = getFirestore();
  const { scopeId, cardId, stepKind, stepId, email, push } = request.data || {};
  if (!cardId || !["topic", "decision", "action"].includes(stepKind)) throw new HttpsError("invalid-argument", "Choose a valid Action Board step.");
  if (!email && !push) throw new HttpsError("invalid-argument", "Choose email or phone notification.");

  const { scope, parent, cardBase } = scopeRefs(db, scopeId);
  const parentSnap = await parent.get();
  if (!parentSnap.exists) throw new HttpsError("not-found", "This shared club no longer exists.");
  const parentData = parentSnap.data() || {};
  if (!organizerUidsFromWorkspace(parentData).includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Only club organizers can notify this board.");
  }

  const activeRecipients = activeWorkspaceNotificationRecipients(parentData);
  const activeRecipientUidByEmail = new Map(activeRecipients.map((recipient) => [recipient.email, recipient.uid]));
  const requestedEmails = uniqueEmails(request.data?.recipientEmails || []).filter((value) => value !== cleanEmail(request.auth.token.email));
  if (!requestedEmails.length) throw new HttpsError("invalid-argument", "Choose at least one other organizer.");
  if (requestedEmails.length > 30) throw new HttpsError("invalid-argument", "Choose fewer organizers.");
  const invalid = requestedEmails.filter((recipient) => !activeRecipientUidByEmail.has(recipient));
  if (invalid.length) throw new HttpsError("permission-denied", "A selected recipient is not an organizer in this club.");

  const recipientUids = requestedEmails
    .map((recipient) => activeRecipientUidByEmail.get(recipient) || "")
    .filter(Boolean);

  const cardRef = cardBase.doc(String(cardId));
  const requestId = crypto.randomUUID();
  const now = Date.now();
  const senderName = actorName(request.auth);
  const senderEmail = cleanEmail(request.auth.token.email);
  let cardData;

  await db.runTransaction(async (tx) => {
    const cardSnap = await tx.get(cardRef);
    if (!cardSnap.exists) throw new HttpsError("not-found", "This topic no longer exists.");
    cardData = cardSnap.data() || {};
    const existing = notificationForTarget(cardData, stepKind, String(stepId || ""));
    if (existing?.status === "sent") throw new HttpsError("failed-precondition", "This step has already been notified.");
    if (existing?.status === "queued" && now - Number(existing.sentAt || 0) < 120000) {
      throw new HttpsError("failed-precondition", "This notification is already being sent.");
    }
    const queued = {
      status: "queued",
      requestId,
      sentAt: now,
      sentAtIso: new Date(now).toISOString(),
      sentByUid: request.auth.uid,
      sentByName: senderName,
      sentByEmail: senderEmail,
      recipientEmails: requestedEmails,
      channels: [email ? "email" : null, push ? "push" : null].filter(Boolean),
      message: cleanText(request.data?.message, 500) || null,
    };
    tx.update(cardRef, {
      ...applyNotification(cardData, stepKind, String(stepId || ""), queued),
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: new Date(now).toISOString(),
    });
  });

  try {
    const step = stepInfo(cardData, stepKind, String(stepId || ""));
    const topicContext = priorContext(cardData, step.createdAt);
    const appOrigin = validOrigin(request.data?.origin);
    const appUrl = appOrigin ? `${appOrigin}/` : "";
    const customMessage = cleanText(request.data?.message, 500);

    let emailQueuedCount = 0;
    const emailFailures = [];
    if (email) {
      for (const recipientEmail of requestedEmails) {
        try {
          const thread = await emailThreadFor(db, scope, cardId, recipientEmail);
          const isFirst = !thread.exists;
          const currentMessageId = isFirst
            ? thread.rootMessageId
            : `<ft-${messageIdPart(`${requestId}|${recipientEmail}`)}@${thread.domain}>`;
          const bodies = emailBodies({ senderName, step, topicContext, customMessage, appUrl });
          await sendResendEmail({
            to: recipientEmail,
            subject: isFirst
              ? `Stripes · ${step.topicTitle}`
              : `Re: Stripes · ${step.topicTitle}`,
            text: bodies.text,
            html: bodies.html,
            messageId: currentMessageId,
            inReplyTo: isFirst ? undefined : thread.rootMessageId,
            references: isFirst ? undefined : [thread.rootMessageId],
            topicId: cardId,
          });
          const threadPayload = {
            scopeKind: scope.kind,
            scopeId: scope.id,
            topicId: String(cardId),
            recipientEmail,
            rootMessageId: thread.rootMessageId,
            lastMessageId: currentMessageId,
            lastNotifiedAt: FieldValue.serverTimestamp(),
          };
          if (!thread.exists) threadPayload.createdAt = FieldValue.serverTimestamp();
          await thread.ref.set(threadPayload, { merge: true });
          emailQueuedCount += 1;
        } catch (mailError) {
          emailFailures.push({ recipientEmail, message: cleanText(mailError?.message || "Email failed", 180) });
        }
      }
    }

    let pushTargetCount = 0;
    let pushStaleCount = 0;
    if (push && !recipientUids.length && !email) {
      throw new HttpsError("failed-precondition", "None of the selected organizers has a push-capable Stripes account yet.");
    }
    if (push && recipientUids.length) {
      const userSnaps = await Promise.all(recipientUids.map((uid) => db.collection(USER_COLLECTION).doc(uid).get()));
      const fidOwnerUids = new Map();
      const fids = Array.from(new Set(userSnaps.flatMap((snap, index) => {
        const data = snap.exists ? snap.data() || {} : {};
        const userFids = Array.isArray(data.pushFids) ? data.pushFids.map(String).filter(Boolean) : [];
        const ownerUid = String(recipientUids[index] || "");
        userFids.forEach((fid) => {
          if (!fidOwnerUids.has(fid)) fidOwnerUids.set(fid, new Set());
          if (ownerUid) fidOwnerUids.get(fid).add(ownerUid);
        });
        return userFids;
      })));
      if (!fids.length && !email) {
        throw new HttpsError("failed-precondition", "None of the selected organizers has phone notifications enabled yet.");
      }
      if (fids.length) {
        const pushBody = customMessage || `${senderName} needs your attention: ${step.text}`;
        const result = await getMessaging().sendEachForMulticast({
          fids,
          notification: { title: `Stripes · ${step.topicTitle}`, body: pushBody.slice(0, 180) },
          data: { topicId: String(cardId), stepKind, stepId: String(stepId || "") },
          webpush: appUrl ? { fcmOptions: { link: appUrl } } : undefined,
        });
        if (result.failureCount) {
          const staleFids = [];
          result.responses.forEach((response, index) => {
            if (!response.success) {
              const failedFid = String(fids[index] || "");
              const code = response.error?.code || "";
              const message = response.error?.message || "";
              console.error("Stripes push failed", {
                index,
                fidSuffix: failedFid.slice(-8),
                code,
                message,
              });
              if (failedFid && (code === "messaging/registration-token-not-registered" || message === "NotRegistered")) {
                staleFids.push(failedFid);
              }
            }
          });

          if (staleFids.length) {
            pushStaleCount = staleFids.length;
            const staleByUid = new Map();
            staleFids.forEach((fid) => {
              const ownerUids = fidOwnerUids.get(fid) || new Set();
              ownerUids.forEach((uid) => {
                if (!staleByUid.has(uid)) staleByUid.set(uid, new Set());
                staleByUid.get(uid).add(fid);
              });
            });

            const cleanup = db.batch();
            staleByUid.forEach((uidFids, uid) => {
              cleanup.set(db.collection(USER_COLLECTION).doc(uid), {
                pushFids: FieldValue.arrayRemove(...Array.from(uidFids)),
                pushUpdatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            });
            staleFids.forEach((fid) => {
              cleanup.delete(db.collection(PUSH_INSTALLATION_COLLECTION).doc(messageIdPart(fid)));
            });
            await cleanup.commit();
          }
        }
        pushTargetCount = result.successCount;
      }
    }

    const requestedChannelSuccesses = emailQueuedCount + pushTargetCount;
    if (!requestedChannelSuccesses) {
      const firstEmailError = emailFailures[0]?.message;
      const pushError = pushStaleCount
        ? "Couldn’t reach one or more organizers by phone."
        : "";
      throw new HttpsError("unavailable", firstEmailError || pushError || "Notification could not be delivered.");
    }

    const sentAt = Date.now();
    await db.runTransaction(async (tx) => {
      const cardSnap = await tx.get(cardRef);
      if (!cardSnap.exists) return;
      const current = cardSnap.data() || {};
      const existing = notificationForTarget(current, stepKind, String(stepId || ""));
      if (existing?.requestId !== requestId && existing?.status === "sent") return;
      const sent = {
        ...existing,
        status: "sent",
        requestId,
        sentAt,
        sentAtIso: new Date(sentAt).toISOString(),
        sentByUid: request.auth.uid,
        sentByName: senderName,
        sentByEmail: senderEmail,
        recipientEmails: requestedEmails,
        channels: [email ? "email" : null, push ? "push" : null].filter(Boolean),
        emailQueuedCount,
        pushTargetCount,
        emailFailedCount: emailFailures.length,
        emailFailedRecipients: emailFailures.map((item) => item.recipientEmail),
        message: customMessage || null,
      };
      tx.update(cardRef, {
        ...applyNotification(current, stepKind, String(stepId || ""), sent),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: new Date(sentAt).toISOString(),
      });
    });

    return { ok: true, emailQueuedCount, pushTargetCount, recipientCount: requestedEmails.length };
  } catch (error) {
    const failedAt = Date.now();
    try {
      await db.runTransaction(async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists) return;
        const current = cardSnap.data() || {};
        const existing = notificationForTarget(current, stepKind, String(stepId || ""));
        if (existing?.requestId !== requestId) return;
        const failed = {
          ...existing,
          status: "failed",
          failedAt,
          failedAtIso: new Date(failedAt).toISOString(),
          error: cleanText(error?.message || "Notification failed", 240),
        };
        tx.update(cardRef, {
          ...applyNotification(current, stepKind, String(stepId || ""), failed),
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: new Date(failedAt).toISOString(),
        });
      });
    } catch (_) {
      // Preserve the original send error.
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", cleanText(error?.message || "Could not send notification", 240));
  }
});
