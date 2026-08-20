"use strict";

module.exports = {
  common: {
    brand: "Stripes",
    fallbackOrganizer: "Organizer",
    fallbackInviter: "An organizer",
    fallbackWorkspace: "Stripes workspace",
  },
  emails: {
    verification: {
      subject: "Verify your Stripes email",
      heading: "Verify your email",
      intro: "Verify your email to finish setting up your Stripes account or organizer invitation.",
      linkLabel: "Verify email: {{link}}",
      button: "Verify email",
      requestedNotice: "This link was requested for your Stripes account. If you did not request it, you can ignore this email.",
    },
    workspaceInvitation: {
      subject: "Join {{workspaceName}} in Stripes",
      textIntro: "{{inviterName}} invited you to join {{workspaceName}} in Stripes.",
      textJoin: "Join {{workspaceName}}: {{link}}",
      htmlHeading: "Join {{workspaceName}}",
      htmlIntro: "{{inviterName}} invited you to join this workspace as an organizer.",
      button: "Join {{workspaceName}}",
      expiry: "This invitation expires on {{expiryDate}}. Sign in with and verify the invited email before joining.",
    },
    organizerJoined: {
      subject: "{{organizerName}} joined {{workspaceName}} in Stripes",
      heading: "New organizer joined",
      joinedBody: "{{organizerName}} ({{organizerEmail}}) joined {{workspaceName}} as an organizer on {{acceptanceDate}}.",
      invitedBy: "Invited by: {{inviterName}}.",
      accessImmediate: "Normal organizer access is available immediately.",
      governanceEligible: "Protected organizer-removal proposal and voting rights begin on {{eligibilityDate}}.",
    },
  },
  notifications: {
    actionBoard: {
      fallbackTopic: "Action Board topic",
      fallbackDecision: "Decision",
      fallbackAction: "Action",
      step: {
        idea: "Idea",
        scheduling: "Scheduling",
        playerDecision: "Player decision",
        equipmentDecision: "Equipment decision",
        decision: "Decision",
        action: "Action",
      },
      email: {
        subject: "Stripes · {{topicTitle}}",
        replySubject: "Re: Stripes · {{topicTitle}}",
        topicContext: "Topic: {{topicTitle}}",
        stepLine: "{{stepLabel}}: {{stepText}}",
        messageFrom: "Message from {{senderName}}: {{message}}",
        sentBy: "Sent by {{senderName}}",
        contextHeading: "Topic so far",
        openWithUrl: "Open Stripes: {{appUrl}}",
        openWithoutUrl: "Open Stripes to respond or continue the topic.",
        openButton: "Open in Stripes",
        footer: "This notification was sent manually by an organizer. Stripes does not automatically email board activity.",
      },
      push: {
        title: "Stripes · {{topicTitle}}",
        defaultBody: "{{senderName}} needs your attention: {{stepText}}",
      },
    },
  },
};
