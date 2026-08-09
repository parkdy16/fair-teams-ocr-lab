const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const REGION = process.env.FAIRTEAMS_FUNCTIONS_REGION || "europe-west1";
const THREAD_COLLECTION = "actionBoardNotificationThreads";
const USER_COLLECTION = "fairTeamsUsers";
const PUSH_INSTALLATION_COLLECTION = "fairTeamsPushInstallations";
const SMTP_CONFIG = defineSecret("FAIRTEAMS_SMTP_CONFIG");

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

function smtpSettings() {
  let raw = {};
  try {
    raw = JSON.parse(SMTP_CONFIG.value() || "{}");
  } catch {
    throw new HttpsError("failed-precondition", "Fair Teams SMTP secret must be valid JSON.");
  }
  const host = cleanText(raw.host, 180);
  const user = cleanText(raw.user, 220);
  const password = String(raw.password || "");
  const from = cleanText(raw.from, 260);
  const replyTo = cleanText(raw.replyTo, 260);
  const port = Number(raw.port || 465);
  const secure = raw.secure === undefined ? port === 465 : Boolean(raw.secure);
  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    throw new HttpsError("failed-precondition", "Fair Teams email is not configured yet.");
  }
  return { host, port, secure, user, password, from, replyTo };
}

function mailTransport() {
  const config = smtpSettings();
  return {
    config,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    }),
  };
}

function emailBodies({ senderName, step, topicContext, customMessage, appUrl }) {
  const contextLines = [`Topic: ${step.topicTitle}`, ...topicContext];
  const text = [
    `Fair Teams · ${step.topicTitle}`,
    "",
    `${step.label}: ${step.text}`,
    customMessage ? `Message from ${senderName}: ${customMessage}` : `Sent by ${senderName}`,
    "",
    "Topic so far",
    ...contextLines.map((line) => `- ${line}`),
    "",
    appUrl ? `Open Fair Teams: ${appUrl}` : "Open Fair Teams to respond or continue the topic.",
  ].join("\n");

  const contextHtml = contextLines.map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`).join("");
  const messageHtml = customMessage
    ? `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-radius:12px"><strong>${escapeHtml(senderName)}:</strong> ${escapeHtml(customMessage)}</div>`
    : `<p style="color:#64748b">Sent by ${escapeHtml(senderName)}</p>`;
  const button = appUrl
    ? `<p style="margin-top:22px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#102A43;color:white;text-decoration:none;padding:10px 16px;border-radius:12px;font-weight:700">Open in Fair Teams</a></p>`
    : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#102A43;line-height:1.5">
      <div style="font-size:13px;font-weight:700;color:#64748b;margin-bottom:8px">Fair Teams · ${escapeHtml(step.topicTitle)}</div>
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c3aed">${escapeHtml(step.label)}</div>
      <h2 style="font-size:20px;line-height:1.25;margin:6px 0 10px">${escapeHtml(step.text)}</h2>
      ${messageHtml}
      <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:14px">
        <div style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Topic so far</div>
        <ul style="padding-left:20px;margin:8px 0 0">${contextHtml}</ul>
      </div>
      ${button}
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">This notification was sent manually by an organizer. Fair Teams does not automatically email board activity.</p>
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

exports.notifyActionBoardStep = onCall({ region: REGION, timeoutSeconds: 60, secrets: [SMTP_CONFIG] }, async (request) => {
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
      const { config: smtp, transporter } = mailTransport();
      for (const recipientEmail of requestedEmails) {
        try {
          const thread = await emailThreadFor(db, scope, cardId, recipientEmail);
          const isFirst = !thread.exists;
          const currentMessageId = isFirst
            ? thread.rootMessageId
            : `<ft-${messageIdPart(`${requestId}|${recipientEmail}`)}@${thread.domain}>`;
          const bodies = emailBodies({ senderName, step, topicContext, customMessage, appUrl });
          await transporter.sendMail({
            from: smtp.from,
            replyTo: smtp.replyTo || undefined,
            to: recipientEmail,
            subject: `Fair Teams · ${step.topicTitle}`,
            text: bodies.text,
            html: bodies.html,
            messageId: currentMessageId,
            inReplyTo: isFirst ? undefined : thread.rootMessageId,
            references: isFirst ? undefined : [thread.rootMessageId],
            headers: { "X-Fair-Teams-Topic": String(cardId) },
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
    if (push && !recipientUids.length && !email) {
      throw new HttpsError("failed-precondition", "None of the selected organizers has a push-capable Fair Teams account yet.");
    }
    if (push && recipientUids.length) {
      const userSnaps = await Promise.all(recipientUids.map((uid) => db.collection(USER_COLLECTION).doc(uid).get()));
      const fids = Array.from(new Set(userSnaps.flatMap((snap) => {
        const data = snap.exists ? snap.data() || {} : {};
        return Array.isArray(data.pushFids) ? data.pushFids.map(String).filter(Boolean) : [];
      })));
      if (!fids.length && !email) {
        throw new HttpsError("failed-precondition", "None of the selected organizers has phone notifications enabled yet.");
      }
      if (fids.length) {
        const pushBody = customMessage || `${senderName} needs your attention: ${step.text}`;
        const result = await getMessaging().sendEachForMulticast({
          fids,
          notification: { title: `Fair Teams · ${step.topicTitle}`, body: pushBody.slice(0, 180) },
          data: { topicId: String(cardId), stepKind, stepId: String(stepId || "") },
          webpush: appUrl ? { fcmOptions: { link: appUrl } } : undefined,
        });
        pushTargetCount = result.successCount;
      }
    }

    const requestedChannelSuccesses = emailQueuedCount + pushTargetCount;
    if (!requestedChannelSuccesses) {
      const firstEmailError = emailFailures[0]?.message;
      throw new HttpsError("unavailable", firstEmailError || "Notification could not be delivered.");
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
