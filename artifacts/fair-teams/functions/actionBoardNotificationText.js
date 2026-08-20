"use strict";

const { backendT } = require("./i18n");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function actionBoardEmailSubject(topicTitle, isFirst, locale) {
  return backendT(
    isFirst
      ? "notifications.actionBoard.email.subject"
      : "notifications.actionBoard.email.replySubject",
    { topicTitle },
    locale,
  );
}

function actionBoardEmailBodies({
  senderName,
  step,
  topicContext,
  customMessage,
  appUrl,
  locale,
}) {
  const contextLines = [
    backendT(
      "notifications.actionBoard.email.topicContext",
      { topicTitle: step.topicTitle },
      locale,
    ),
    ...topicContext,
  ];
  const text = [
    actionBoardEmailSubject(step.topicTitle, true, locale),
    "",
    backendT(
      "notifications.actionBoard.email.stepLine",
      { stepLabel: step.label, stepText: step.text },
      locale,
    ),
    customMessage
      ? backendT(
        "notifications.actionBoard.email.messageFrom",
        { senderName, message: customMessage },
        locale,
      )
      : backendT(
        "notifications.actionBoard.email.sentBy",
        { senderName },
        locale,
      ),
    "",
    backendT("notifications.actionBoard.email.contextHeading", {}, locale),
    ...contextLines.map((line) => `- ${line}`),
    "",
    appUrl
      ? backendT(
        "notifications.actionBoard.email.openWithUrl",
        { appUrl },
        locale,
      )
      : backendT("notifications.actionBoard.email.openWithoutUrl", {}, locale),
  ].join("\n");

  const contextHtml = contextLines
    .map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`)
    .join("");
  const messageHtml = customMessage
    ? `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-radius:12px"><strong>${escapeHtml(senderName)}:</strong> ${escapeHtml(customMessage)}</div>`
    : `<p style="color:#64748b">${backendT(
      "notifications.actionBoard.email.sentBy",
      { senderName: escapeHtml(senderName) },
      locale,
    )}</p>`;
  const button = appUrl
    ? `<p style="margin-top:22px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#102A43;color:white;text-decoration:none;padding:10px 16px;border-radius:12px;font-weight:700">${backendT("notifications.actionBoard.email.openButton", {}, locale)}</a></p>`
    : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#102A43;line-height:1.5">
      <div style="font-size:13px;font-weight:700;color:#64748b;margin-bottom:8px">${actionBoardEmailSubject(escapeHtml(step.topicTitle), true, locale)}</div>
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c3aed">${escapeHtml(step.label)}</div>
      <h2 style="font-size:20px;line-height:1.25;margin:6px 0 10px">${escapeHtml(step.text)}</h2>
      ${messageHtml}
      <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:14px">
        <div style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${backendT("notifications.actionBoard.email.contextHeading", {}, locale)}</div>
        <ul style="padding-left:20px;margin:8px 0 0">${contextHtml}</ul>
      </div>
      ${button}
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">${backendT("notifications.actionBoard.email.footer", {}, locale)}</p>
    </div>`;
  return { text, html };
}

function actionBoardPushNotification({ senderName, step, customMessage, locale }) {
  const body = customMessage || backendT(
    "notifications.actionBoard.push.defaultBody",
    { senderName, stepText: step.text },
    locale,
  );
  return {
    title: backendT(
      "notifications.actionBoard.push.title",
      { topicTitle: step.topicTitle },
      locale,
    ),
    body: body.slice(0, 180),
  };
}

module.exports = {
  actionBoardEmailBodies,
  actionBoardEmailSubject,
  actionBoardPushNotification,
};
