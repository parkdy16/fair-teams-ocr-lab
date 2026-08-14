const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const {
  buildOrganizerRemovalElectorate,
  evaluateOrganizerRemovalVote,
  memberDisplayName,
  organizerMembershipFingerprint,
  organizerUidsFromWorkspace,
  removeOrganizerMembership,
  resolveMemberEmailByUid,
  resolveMemberUidByEmail,
} = require("./organizerRemoval");

initializeApp();

const REGION = process.env.FAIRTEAMS_FUNCTIONS_REGION || "europe-west1";
const THREAD_COLLECTION = "actionBoardNotificationThreads";
const USER_COLLECTION = "fairTeamsUsers";
const PUSH_INSTALLATION_COLLECTION = "fairTeamsPushInstallations";
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

  const headers = {
    "X-Fair-Teams-Topic": String(topicId),
  };

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
      headers,
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
      const linkedRosterIds = Array.from(new Set(
        (Array.isArray(groupData.rosterIds) ? groupData.rosterIds : [])
          .filter((rosterId) => typeof rosterId === "string" && rosterId.length > 0),
      ));
      if (linkedRosterIds.some((rosterId) => rosterId.includes("/"))) {
        throw new HttpsError("failed-precondition", "This workspace has an invalid linked-roster record.");
      }
      if (organizerUids.length + linkedRosterIds.length + 4 > MAX_GOVERNANCE_TRANSACTION_DOCUMENTS) {
        throw new HttpsError("resource-exhausted", "This workspace is too large for one protected removal transaction.");
      }
      const currentMembershipFingerprint = organizerMembershipFingerprint(organizerUids);

      const targetUid = resolveMemberUidByEmail(groupData, targetEmail);
      if (!targetUid || !organizerUids.includes(targetUid)) {
        throw new HttpsError("failed-precondition", "That organizer is no longer active in this workspace.");
      }
      if (targetUid === request.auth.uid) {
        throw new HttpsError("invalid-argument", "Use Leave shared roster to remove your own access.");
      }

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
            if (!activePrivateSnap.exists
              || activePrivateData.membershipFingerprint === currentMembershipFingerprint) {
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

      const electorate = buildOrganizerRemovalElectorate(groupData, targetUid);
      const initialResult = evaluateOrganizerRemovalVote({
        totalOrganizerCount: electorate.totalOrganizerCount,
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
        schemaVersion: 1,
        status: initialResult.status,
        targetUid,
        targetDisplayNameSnapshot,
        totalOrganizerCount: electorate.totalOrganizerCount,
        eligibleOrganizerCount: electorate.eligibleOrganizerCount,
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
          schemaVersion: 1,
          proposalId: proposalRef.id,
          targetUid,
          proposedByUid: request.auth.uid,
          organizerUids: electorate.organizerUids,
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
        eligibleOrganizerCount: electorate.eligibleOrganizerCount,
        requiredYes: electorate.requiredYes,
        castCount: 0,
        outcomeReason: initialResult.outcomeReason,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
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
    && eligibleVoterUids.includes(request.auth.uid);

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
    return await db.runTransaction(async (tx) => {
      const [groupSnap, proposalSnap, privateSnap, controlSnap, ballotSnap] = await tx.getAll(
        groupRef,
        proposalRef,
        privateRef,
        controlRef,
        ballotRef,
      );
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "This shared workspace no longer exists.");
      }
      if (!proposalSnap.exists) {
        throw new HttpsError("not-found", "This organizer-removal vote no longer exists.");
      }

      const proposalData = proposalSnap.data() || {};
      if (proposalData.status !== "open") {
        throw new HttpsError("failed-precondition", "This organizer-removal vote is already closed.");
      }
      if (!privateSnap.exists
        || !controlSnap.exists
        || controlSnap.data()?.activeProposalId !== proposalId) {
        throw new HttpsError("failed-precondition", "This organizer-removal vote is not active.");
      }

      const groupData = groupSnap.data() || {};
      const privateData = privateSnap.data() || {};
      const currentOrganizerUids = organizerUidsFromWorkspace(groupData);
      if (!currentOrganizerUids.includes(request.auth.uid)) {
        throw new HttpsError("permission-denied", "Only an active organizer can vote.");
      }

      const votedUids = Array.from(new Set(
        (Array.isArray(privateData.votedUids) ? privateData.votedUids : [])
          .filter((uid) => typeof uid === "string" && uid.length > 0),
      ));
      const currentMembershipFingerprint = organizerMembershipFingerprint(currentOrganizerUids);
      if (privateData.membershipFingerprint !== currentMembershipFingerprint) {
        tx.update(proposalRef, {
          status: "cancelled",
          yesCount: null,
          noCount: null,
          castCount: Number.isInteger(privateData.castCount) ? privateData.castCount : 0,
          outcomeReason: "membership_changed",
          closedAt: FieldValue.serverTimestamp(),
          closedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
        votedUids.forEach((voterUid) => {
          tx.delete(privateRef.collection("ballots").doc(voterUid));
        });
        tx.delete(privateRef);
        tx.delete(controlRef);
        return {
          ok: true,
          proposalId,
          status: "cancelled",
          castCount: Number.isInteger(privateData.castCount) ? privateData.castCount : 0,
          outcomeReason: "membership_changed",
        };
      }

      const targetUid = String(privateData.targetUid || "");
      const eligibleVoterUids = Array.isArray(privateData.eligibleVoterUids)
        ? privateData.eligibleVoterUids.filter((uid) => typeof uid === "string" && uid.length > 0)
        : [];
      if (!targetUid || targetUid !== proposalData.targetUid) {
        throw new HttpsError("failed-precondition", "This organizer-removal vote has invalid target data.");
      }
      if (request.auth.uid === targetUid || !eligibleVoterUids.includes(request.auth.uid)) {
        throw new HttpsError("permission-denied", "You are not eligible to vote on this proposal.");
      }
      if (ballotSnap.exists || votedUids.includes(request.auth.uid)) {
        throw new HttpsError("failed-precondition", "Your ballot has already been recorded.");
      }

      const nextYesCount = Number(privateData.yesCount || 0) + (choice === "yes" ? 1 : 0);
      const nextNoCount = Number(privateData.noCount || 0) + (choice === "no" ? 1 : 0);
      const result = evaluateOrganizerRemovalVote({
        totalOrganizerCount: Number(proposalData.totalOrganizerCount),
        yesCount: nextYesCount,
        noCount: nextNoCount,
      });
      const nextVotedUids = [...votedUids, request.auth.uid];
      let linkedRosterRefs = [];
      let linkedRosterSnaps = [];
      let targetEmail = "";

      if (result.status === "passed") {
        targetEmail = resolveMemberEmailByUid(groupData, targetUid);
        if (!targetEmail || !targetEmail.includes("@")) {
          throw new HttpsError("failed-precondition", "The target organizer has an incomplete membership record.");
        }
        const linkedRosterIds = Array.from(new Set(
          (Array.isArray(groupData.rosterIds) ? groupData.rosterIds : [])
            .filter((rosterId) => typeof rosterId === "string" && rosterId.length > 0),
        ));
        if (linkedRosterIds.some((rosterId) => rosterId.includes("/"))) {
          throw new HttpsError("failed-precondition", "This workspace has an invalid linked-roster record.");
        }
        if (linkedRosterIds.length + nextVotedUids.length + 4 > MAX_GOVERNANCE_TRANSACTION_DOCUMENTS) {
          throw new HttpsError("resource-exhausted", "This workspace is too large for one protected removal transaction.");
        }
        linkedRosterRefs = linkedRosterIds.map((rosterId) => db.collection("sharedRosters").doc(rosterId));
        linkedRosterSnaps = linkedRosterRefs.length ? await tx.getAll(...linkedRosterRefs) : [];
      }

      if (result.status === "open") {
        tx.create(ballotRef, {
          choice,
          castAt: FieldValue.serverTimestamp(),
          castAtIso: nowIso,
        });
        tx.update(privateRef, {
          yesCount: result.yesCount,
          noCount: result.noCount,
          castCount: result.castCount,
          votedUids: nextVotedUids,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
        tx.update(proposalRef, {
          castCount: result.castCount,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      } else {
        tx.update(proposalRef, {
          status: result.status,
          yesCount: result.yesCount,
          noCount: result.noCount,
          castCount: result.castCount,
          outcomeReason: result.outcomeReason,
          closedAt: FieldValue.serverTimestamp(),
          closedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });

        if (result.status === "passed") {
          tx.update(groupRef, {
            ...removeOrganizerMembership(groupData, targetUid, targetEmail),
            updatedAt: FieldValue.serverTimestamp(),
            updatedAtIso: nowIso,
          });
          linkedRosterSnaps.forEach((rosterSnap, index) => {
            if (!rosterSnap.exists) return;
            const rosterData = rosterSnap.data() || {};
            const rosterTargetEmail = resolveMemberEmailByUid(rosterData, targetUid) || targetEmail;
            tx.update(linkedRosterRefs[index], {
              ...removeOrganizerMembership(rosterData, targetUid, rosterTargetEmail),
              updatedAt: FieldValue.serverTimestamp(),
              updatedAtIso: nowIso,
            });
          });
        }

        votedUids.forEach((voterUid) => {
          tx.delete(privateRef.collection("ballots").doc(voterUid));
        });
        tx.delete(privateRef);
        tx.delete(controlRef);
      }

      return {
        ok: true,
        proposalId,
        status: result.status,
        castCount: result.castCount,
        requiredYes: result.requiredYes,
        yesCount: result.status === "open" ? null : result.yesCount,
        noCount: result.status === "open" ? null : result.noCount,
        outcomeReason: result.outcomeReason,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
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
  const memberUids = Array.isArray(parentData.memberUids) ? parentData.memberUids.map(String) : [];
  if (!memberUids.includes(request.auth.uid)) throw new HttpsError("permission-denied", "Only club organizers can notify this board.");

  const allowedEmails = uniqueEmails(parentData.memberEmails || []);
  const requestedEmails = uniqueEmails(request.data?.recipientEmails || []).filter((value) => value !== cleanEmail(request.auth.token.email));
  if (!requestedEmails.length) throw new HttpsError("invalid-argument", "Choose at least one other organizer.");
  if (requestedEmails.length > 30) throw new HttpsError("invalid-argument", "Choose fewer organizers.");
  const invalid = requestedEmails.filter((recipient) => !allowedEmails.includes(recipient));
  if (invalid.length) throw new HttpsError("permission-denied", "A selected recipient is not an organizer in this club.");

  const memberUidByEmail = parentData.memberUidByEmail && typeof parentData.memberUidByEmail === "object" ? parentData.memberUidByEmail : {};
  const fallbackEmails = uniqueEmails(parentData.memberEmails || []);
  const recipientUids = requestedEmails.map((recipient) => {
    const explicit = String(memberUidByEmail[recipient] || "");
    if (explicit) return explicit;
    const index = fallbackEmails.indexOf(recipient);
    return index >= 0 ? String(memberUids[index] || "") : "";
  }).filter(Boolean);

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
