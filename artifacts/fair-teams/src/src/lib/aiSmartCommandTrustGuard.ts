import type {
  AiSmartCommandAction,
  AiSmartCommandContext,
  AiSmartCommandResponse,
} from "./aiSmartCommandTypes";

function normalizeCommandText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9가-힣äöüß\s?!.:-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyAction(overrides: Partial<AiSmartCommandAction>): AiSmartCommandAction {
  return {
    type: "unsupported_action",
    playerRefs: [],
    newPlayerName: null,
    suggestedSkill: null,
    playersPerTeam: null,
    teamCount: null,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: null,
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: null,
    supportStatus: "understood_not_wired",
    requiresConfirmation: false,
    reason: null,
    ...overrides,
  };
}

function guardResponse(params: {
  normalizedIntent: string;
  assistantSummary: string;
  actions?: AiSmartCommandAction[];
  unresolvedMessage?: string;
  debugWarning: string;
}): AiSmartCommandResponse {
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "en",
    normalizedIntent: params.normalizedIntent,
    assistantSummary: params.assistantSummary,
    confidence: 0.99,
    actions: params.actions || [],
    confirmations: [],
    unresolved: params.unresolvedMessage
      ? [{ text: params.normalizedIntent, issue: "unsupported_action", message: params.unresolvedMessage }]
      : [],
    parseMode: "local_fallback",
    debugWarnings: [params.debugWarning],
  };
}

function isQuestion(text: string) {
  return /\?|\b(is|are|am|does|do|can|could|should|would|will|what|why|how|where|when)\b/.test(text);
}

function looksLikeActionRequest(text: string) {
  if (/\b(explain|tell me about|what is|what are|how does|how do i|why)\b/.test(text)) return false;
  return /\b(can you|could you|would you|please|pls|help me|i want you to|i need you to|let's|lets)\s+(save|back ?up|backup|export|restore|download|upload|sync|change|rename|delete|remove|open|go|show|select|make|create|add|move|rate|share|invite|import|scan|generate|set)\b/.test(text) ||
    /^(save|back ?up|backup|export|restore|download|upload|sync|change|rename|delete|remove|open|go|show|select|make|create|add|move|rate|share|invite|import|scan|generate|set)\b/.test(text);
}

function isLocalSaveOrBackupRequest(text: string) {
  const asksSave = /\b(save|saved|store|stored|local|locally|phone|device|backup|back up|export|download)\b/.test(text);
  const mentionsRoster = /\b(roster|players?|team list|list)\b/.test(text);
  const actionish = /\b(can you|could you|please|pls|save|store|backup|back up|export|download)\b/.test(text);
  return asksSave && mentionsRoster && actionish;
}

function isFontOrTextSizeFeedback(text: string) {
  return /\b(font|text|letters?|type|typography|readability|readable|small|tiny|too small|size)\b/.test(text) &&
    /\b(small|tiny|hard to read|readability|readable|okay|ok|setting|adjust|bigger|larger|increase|change)\b/.test(text);
}

function isGenericUiFeedback(text: string) {
  return /\b(seems|looks|feels|too|quite|weird|awkward|ugly|nice|okay|ok|good|bad|small|big|crowded|confusing)\b/.test(text) &&
    /\b(ui|ux|design|layout|button|font|text|screen|modal|tab|card|box|color|icon)\b/.test(text);
}

function suspiciousGenericFeatureClaim(summary: string) {
  const text = normalizeCommandText(summary);
  return /\b(settings?\b.*\b(adjust|change|customize)|adjust\b.*\bsettings?|font size setting|accessibility settings? inside fair teams|you can change it in settings)\b/.test(text);
}

export function guardFairTeamsSmartCommandBeforeAi(
  commandText: string,
  context: AiSmartCommandContext = {},
): AiSmartCommandResponse | null {
  const text = normalizeCommandText(commandText);
  if (!text) return null;

  if (isLocalSaveOrBackupRequest(text)) {
    const rosterName = context.rosterName ? `“${context.rosterName}”` : "the current roster";
    return guardResponse({
      normalizedIntent: "Save or back up the current roster locally",
      assistantSummary: `I understand this as a save/backup action for ${rosterName}. I can’t trigger Local Backup from the assistant yet. Your local roster edits are normally stored on this device automatically, but for a real backup file use Roster Tools → Local Backup.`,
      actions: [emptyAction({
        targetName: "Local roster backup",
        targetArea: "Roster Tools → Local Backup",
        reason: "The assistant can explain where this is, but it is not wired to create or export a local backup file yet.",
      })],
      unresolvedMessage: "Manual path: Roster Tools → Local Backup.",
      debugWarning: "Guarded unsupported local save/backup action before AI parser.",
    });
  }

  if (isFontOrTextSizeFeedback(text)) {
    return guardResponse({
      normalizedIntent: "Font size or readability feedback",
      assistantSummary: "There is no font-size setting in Fair Teams right now. If the text feels too small on your phone, that is useful design feedback, not something hidden in Settings. The UI would need to be adjusted in the app design.",
      debugWarning: "Guarded font/readability question to prevent invented settings.",
    });
  }

  if (isGenericUiFeedback(text) && isQuestion(text)) {
    return guardResponse({
      normalizedIntent: "UI/UX feedback question",
      assistantSummary: "That sounds like UI feedback rather than an app action. I should not invent a setting or feature here. If something feels too small, crowded, or confusing, it probably needs a design adjustment in Fair Teams itself.",
      debugWarning: "Guarded generic UI feedback question to avoid generic app advice.",
    });
  }

  return null;
}

export function applyFairTeamsAiTruthGuard(
  commandText: string,
  response: AiSmartCommandResponse,
): AiSmartCommandResponse {
  const text = normalizeCommandText(commandText);
  const summary = response.assistantSummary || "";

  if (isFontOrTextSizeFeedback(text) && suspiciousGenericFeatureClaim(summary)) {
    return guardResponse({
      normalizedIntent: "Font size or readability feedback",
      assistantSummary: "There is no font-size setting in Fair Teams right now. If the text feels too small, that is valid feedback for improving the UI. I should not suggest a setting that does not exist.",
      debugWarning: "Replaced AI response that invented a font/settings feature.",
    });
  }

  if (isLocalSaveOrBackupRequest(text) && response.actions.length === 0) {
    return guardResponse({
      normalizedIntent: "Save or back up the current roster locally",
      assistantSummary: "I understand this as an action request, but the assistant cannot create a local backup file yet. Local roster edits are stored on this device automatically; for a real backup/export file, use Roster Tools → Local Backup.",
      actions: [emptyAction({
        targetName: "Local roster backup",
        targetArea: "Roster Tools → Local Backup",
        reason: "This is a real Fair Teams workflow, but it is not wired as an AI action yet.",
      })],
      unresolvedMessage: "Manual path: Roster Tools → Local Backup.",
      debugWarning: "Replaced informational AI answer for local save/backup action request.",
    });
  }

  if (looksLikeActionRequest(text) && response.actions.length === 0 && response.unresolved.length === 0) {
    return {
      ...response,
      assistantSummary: `${response.assistantSummary || "I understood the request."}\n\nI should be clear: I do not have an action card for this yet, so I did not change anything in the app.`,
      unresolved: [{
        text: commandText,
        issue: "unsupported_action",
        message: "No supported action is wired for this request yet.",
      }],
      debugWarnings: [...(response.debugWarnings || []), "Truth guard added unsupported-action notice after AI returned no actions."],
    };
  }

  return response;
}
