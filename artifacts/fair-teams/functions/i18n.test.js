"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_BACKEND_LOCALE,
  SUPPORTED_BACKEND_LOCALES,
  backendT,
  resolveBackendLocale,
} = require("./i18n");
const {
  actionBoardEmailBodies,
  actionBoardEmailSubject,
  actionBoardPushNotification,
} = require("./actionBoardNotificationText");
const { verificationEmail } = require("./emailVerification");
const {
  invitationEmail,
  organizerJoinedNotification,
} = require("./workspaceInvitation");

const NOW = Date.parse("2026-08-20T10:00:00.000Z");

test("backend locale resolution keeps English canonical and falls back safely", () => {
  assert.equal(DEFAULT_BACKEND_LOCALE, "en");
  assert.deepEqual(SUPPORTED_BACKEND_LOCALES, ["en"]);
  for (const value of [undefined, null, "", "en", "EN-us", "en_GB", "de", "ko", "bad locale"]) {
    assert.equal(resolveBackendLocale(value), "en");
  }
});

test("backend catalog interpolates values, falls back to English, and rejects missing keys", () => {
  assert.equal(
    backendT(
      "emails.workspaceInvitation.subject",
      { workspaceName: "Thursday Football" },
      "de-DE",
    ),
    "Join Thursday Football in Stripes",
  );
  assert.equal(
    backendT(
      "notifications.actionBoard.push.defaultBody",
      { senderName: "Alex", stepText: "Choose the time" },
    ),
    "Alex needs your attention: Choose the time",
  );
  assert.throws(
    () => backendT("emails.notARealTemplate"),
    /Missing backend translation key: emails\.notARealTemplate/,
  );
});

test("verification email preserves exact English output and HTML escaping", () => {
  const link = "https://example.test/action?value=one&next=\"two\"";
  const english = verificationEmail(link);
  const unsupportedLocale = verificationEmail(link, "de-DE");

  assert.deepEqual(unsupportedLocale, english);
  assert.equal(english.subject, "Verify your Stripes email");
  assert.equal(english.text, [
    "Stripes",
    "",
    "Verify your email to finish setting up your Stripes account or organizer invitation.",
    "",
    `Verify email: ${link}`,
    "",
    "This link was requested for your Stripes account. If you did not request it, you can ignore this email.",
  ].join("\n"));
  assert.match(english.html, /Verify your email/);
  assert.match(english.html, /&amp;/);
  assert.match(english.html, /&quot;/);
  assert.doesNotMatch(english.html, /next="two"/);
});

test("workspace invitation email preserves text, official URL, UTC date, and HTML escaping", () => {
  const input = {
    invitationId: "A1b2C3d4E5f6G7h8I9j0",
    workspaceName: "Club <A>",
    inviterDisplayName: "Alex & Sam",
    expiresAtIso: new Date(NOW).toISOString(),
  };
  const english = invitationEmail(input);
  const unsupportedLocale = invitationEmail({ ...input, locale: "ko" });

  assert.deepEqual(unsupportedLocale, english);
  assert.equal(english.subject, "Join Club <A> in Stripes");
  assert.equal(english.text, [
    "Alex & Sam invited you to join Club <A> in Stripes.",
    "",
    "Join Club <A>: https://stripes.work/app?invite=A1b2C3d4E5f6G7h8I9j0",
    "",
    "This invitation expires on 2026-08-20. Sign in with and verify the invited email before joining.",
  ].join("\n"));
  assert.match(english.html, /Club &lt;A&gt;/);
  assert.match(english.html, /Alex &amp; Sam/);
  assert.doesNotMatch(english.html, /Club <A>/);
  assert.equal(english.link, "https://stripes.work/app?invite=A1b2C3d4E5f6G7h8I9j0");
});

test("organizer-joined email preserves recipients, wording, dates, and escaping", () => {
  const input = {
    workspace: {
      name: "Club <A>",
      memberUids: ["sender", "other", "recipient"],
      memberEmails: ["sender@example.com", "other@example.com", "recipient@example.com"],
      memberEmailByUid: {
        sender: "sender@example.com",
        other: "other@example.com",
        recipient: "recipient@example.com",
      },
      roleByUid: { sender: "organizer", other: "editor", recipient: "organizer" },
    },
    invitation: {
      status: "accepted",
      inviterDisplayNameSnapshot: "Sender & Co",
      workspaceNameSnapshot: "Club <A>",
    },
    newOrganizerUid: "recipient",
    newOrganizerEmail: "recipient@example.com",
    newOrganizerDisplayName: "Recipient <Name>",
    acceptedAtIso: "2026-08-20T10:00:00.000Z",
    governanceEligibleAtIso: "2026-09-03T10:00:00.000Z",
  };
  const english = organizerJoinedNotification(input);
  const unsupportedLocale = organizerJoinedNotification({ ...input, locale: "de" });

  assert.deepEqual(unsupportedLocale, english);
  assert.deepEqual(english.recipientEmails, ["sender@example.com", "other@example.com"]);
  assert.equal(english.subject, "Recipient <Name> joined Club <A> in Stripes");
  assert.equal(english.text, [
    "Recipient <Name> (recipient@example.com) joined Club <A> as an organizer on 2026-08-20.",
    "Invited by: Sender & Co.",
    "Normal organizer access is available immediately.",
    "Protected organizer-removal proposal and voting rights begin on 2026-09-03.",
  ].join("\n"));
  assert.match(english.html, /Recipient &lt;Name&gt;/);
  assert.match(english.html, /Club &lt;A&gt;/);
  assert.match(english.html, /Sender &amp; Co/);
});

test("Action Board email preserves exact text, user content, HTML escaping, and subjects", () => {
  const input = {
    senderName: "Alex & Sam",
    step: {
      topicTitle: "Training <time>",
      label: "Decision",
      text: "Choose A & B",
    },
    topicContext: ["✓ Earlier <decision>"],
    customMessage: "Please choose <today> & reply.",
    appUrl: "https://stripes.work/?a=1&b=2",
  };
  const english = actionBoardEmailBodies(input);
  const unsupportedLocale = actionBoardEmailBodies({ ...input, locale: "ko-KR" });

  assert.deepEqual(unsupportedLocale, english);
  assert.equal(actionBoardEmailSubject(input.step.topicTitle, true), "Stripes · Training <time>");
  assert.equal(actionBoardEmailSubject(input.step.topicTitle, false), "Re: Stripes · Training <time>");
  assert.equal(english.text, [
    "Stripes · Training <time>",
    "",
    "Decision: Choose A & B",
    "Message from Alex & Sam: Please choose <today> & reply.",
    "",
    "Topic so far",
    "- Topic: Training <time>",
    "- ✓ Earlier <decision>",
    "",
    "Open Stripes: https://stripes.work/?a=1&b=2",
  ].join("\n"));
  assert.match(english.html, /Training &lt;time&gt;/);
  assert.match(english.html, /Choose A &amp; B/);
  assert.match(english.html, /Please choose &lt;today&gt; &amp; reply\./);
  assert.match(english.html, /Earlier &lt;decision&gt;/);
  assert.match(english.html, /https:\/\/stripes\.work\/\?a=1&amp;b=2/);
  assert.doesNotMatch(english.html, /Training <time>/);
});

test("Action Board email and push preserve fallback branches and push truncation", () => {
  const step = {
    topicTitle: "Thursday Football",
    label: "Action",
    text: "Bring the bibs",
  };
  const bodies = actionBoardEmailBodies({
    senderName: "Alex",
    step,
    topicContext: [],
    customMessage: "",
    appUrl: "",
  });
  assert.equal(bodies.text, [
    "Stripes · Thursday Football",
    "",
    "Action: Bring the bibs",
    "Sent by Alex",
    "",
    "Topic so far",
    "- Topic: Thursday Football",
    "",
    "Open Stripes to respond or continue the topic.",
  ].join("\n"));
  assert.doesNotMatch(bodies.html, /Open in Stripes/);

  const fallbackPush = actionBoardPushNotification({
    senderName: "Alex",
    step,
    customMessage: "",
  });
  assert.deepEqual(fallbackPush, {
    title: "Stripes · Thursday Football",
    body: "Alex needs your attention: Bring the bibs",
  });

  const longCustomMessage = "x".repeat(220);
  const customPush = actionBoardPushNotification({
    senderName: "Alex",
    step,
    customMessage: longCustomMessage,
  });
  assert.equal(customPush.body, longCustomMessage.slice(0, 180));
  assert.equal(customPush.body.length, 180);
});
