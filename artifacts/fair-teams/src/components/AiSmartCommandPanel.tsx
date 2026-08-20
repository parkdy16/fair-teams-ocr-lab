import React, { useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { parseFairTeamsSmartCommand, createAiSmartCommandContext, transcribeFairTeamsVoiceCommand } from "@/lib/aiSmartCommandClient";
import { applyFairTeamsAiTruthGuard, guardFairTeamsSmartCommandBeforeAi } from "@/lib/aiSmartCommandTrustGuard";
import { parseFairTeamsLocalSmartCommand } from "@/lib/aiSmartCommandLocalRouter";
import {
  bulkRosterSelectionExcludedText,
  isUseExistingPlayerAction,
  USE_EXISTING_PLAYER_DISTRIBUTION,
} from "@/lib/aiSmartCommandActionSemantics";
import { bestPlayerNameMatch, candidateNamesForRosterPlayer, normalizePlayerNameForMatch, scorePlayerNameMatch } from "@/lib/playerNameMatching";
import {
  isAiSmartCommandEnabled,
  type AiSmartCommandAction,
  type AiSmartCommandResponse,
  type AiSmartCommandRosterPlayer,
} from "@/lib/aiSmartCommandTypes";
import {
  aiCommandActionCanApply,
  aiCommandCapabilityLabel,
  aiCommandSupportLabel,
  getAiCommandCapability,
} from "@/lib/aiSmartCommandCapabilities";
import {
  aiTargetAreaText,
  canonicalAiSmartCommandConversationPresenter,
  createAiSmartCommandTrustGuardPresenter,
  formatPercent,
  getResolvedUiLocale,
  translate,
  type AiSmartCommandConversationPresenter,
  useStripesTranslation,
} from "@/i18n";

const AI_CONVERSATION = canonicalAiSmartCommandConversationPresenter;
const AI_CONVERSATION_TRUST_GUARD = createAiSmartCommandTrustGuardPresenter(AI_CONVERSATION);

type AiSmartCommandPanelProps = {
  players: AiSmartCommandRosterPlayer[];
  rosterName?: string;
  rosterMode?: "local" | "shared";
  activeTab?: string;
  currentTeamCount?: number | null;
  currentTeamsGenerated?: boolean;
  onParsed?: (result: AiSmartCommandResponse) => void;
  onApplyAction?: (action: AiSmartCommandAction) => Promise<string | void> | string | void;
  onOpenToday?: () => void;
  onQuestionSubmitted?: () => void;
  tutorialActive?: boolean;
  tutorialQuestion?: string;
};

function formatAiUnitList(
  values: readonly string[],
  conversation: AiSmartCommandConversationPresenter,
) {
  return conversation.formatList(values, { type: "unit" });
}


function actionLabel(actionType: string) {
  return actionType.replace(/_/g, " ");
}

function actionDetails(action: AiSmartCommandAction) {
  const details: string[] = [];
  if (action.playerRefs.length > 0) {
    details.push(action.playerRefs.map((player) => player.rosterName || player.spokenName).join(", "));
  }
  if (action.newPlayerName) details.push(`new player: ${action.newPlayerName}`);
  if (action.suggestedSkill) details.push(`skill ${action.suggestedSkill}`);
  if (action.playersPerTeam) details.push(`${action.playersPerTeam}v${action.playersPerTeam}`);
  if (action.teamCount) details.push(`${action.teamCount} teams`);
  if (action.pairingKind) details.push(action.pairingKind.replace(/_/g, " "));
  if (action.teamLabel) details.push(`team: ${action.teamLabel}`);
  if (action.role) details.push(`role: ${action.role.replace(/_/g, " ")}`);
  if (action.noteText) details.push(`note: “${action.noteText}”`);
  if (action.colorName) details.push(`color: ${action.colorName}`);
  if (action.targetName) details.push(`target: ${action.targetName}`);
  if (action.targetArea) details.push(`manual path: ${action.targetArea}`);
  return details.join(" · ");
}

function aiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function friendlyAiError(error: unknown) {
  const message = aiErrorMessage(error);
  if (/json|structured|parse|schema/i.test(message)) {
    return translate("ai.error.invalidAnswer");
  }
  if (/disabled|branch|configured|key/i.test(message)) return message;
  if (/openai|request failed|502|network|fetch/i.test(message)) {
    return translate("ai.error.connection");
  }
  if (/fair teams ai command failed|ai command failed/i.test(message)) {
    return translate("ai.error.unableToAnswerWithExamples");
  }
  return message || translate("ai.error.unableToAnswer");
}


function isAiAnswerOnlyResult(response: AiSmartCommandResponse | null | undefined) {
  if (!response) return false;
  const mode = String(response.parseMode || "");
  const hasActions = Array.isArray(response.actions) && response.actions.some((action) => action.type !== "no_action");
  const hasConfirmations = Array.isArray(response.confirmations) && response.confirmations.length > 0;
  const hasUnresolved = Array.isArray(response.unresolved) && response.unresolved.length > 0;
  return !hasActions && !hasConfirmations && !hasUnresolved && /knowledge|answer|conversation|chat/i.test(mode);
}


function normalizeAiStatFieldName(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getVisibleNumericPlayerValue(player: AiSmartCommandRosterPlayer, requestedField: string): number | null {
  const item = player as any;
  const field = normalizeAiStatFieldName(requestedField);
  const candidates = field.includes("attack") || field.includes("attk") || field.includes("offen")
    ? ["attack", "attk", "offense", "attacking"]
    : field.includes("defen") || field.includes("def")
      ? ["defense", "defence", "def"]
      : field.includes("speed") || field.includes("pace") || field.includes("fast")
        ? ["speed", "pace"]
        : field.includes("pass") || field.includes("playmak")
          ? ["passing", "pass"]
          : field.includes("stamina") || field.includes("endur") || field.includes("fitness") || field.includes("physical")
            ? ["stamina", "endurance", "fitness", "physical"]
            : ["skill", "ovr", "overall", "rating"];

  for (const key of candidates) {
    const value = Number(item?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function detectRosterStatQuestionForFallback(commandText: string) {
  const text = String(commandText || "").trim();
  const normalized = normalizeAiStatFieldName(text);
  if (!normalized || !/(\?|who|which|lowest|highest|best|worst|weakest|strongest|fastest|slowest|least|most)/i.test(text)) return null;
  if (!/\b(roster|player|players|team|squad)\b/i.test(text)) return null;

  const wantsLowest = /\b(lowest|least|worst|weakest|slowest|bottom)\b/i.test(text);
  const wantsHighest = /\b(highest|most|best|strongest|fastest|top)\b/i.test(text);
  if (!wantsLowest && !wantsHighest) return null;

  const field = /\b(stamina|endurance|fitness|physical)\b/i.test(text) ? "stamina"
    : /\b(attk|attack|attacking|offense|offence)\b/i.test(text) ? "attack"
      : /\b(def|defense|defence|defending)\b/i.test(text) ? "defense"
        : /\b(speed|pace|fastest|slowest)\b/i.test(text) ? "speed"
          : /\b(pass|passing|playmaking|playmaker)\b/i.test(text) ? "passing"
            : "OVR";

  return { field, direction: wantsLowest ? "lowest" : "highest" } as const;
}



function looksLikePlayerRatingHowToHelpRequest(commandText: string) {
  const text = String(commandText || "").trim();
  if (!text) return false;
  const isQuestion = /\?|\b(how|where|what|can i|can you|help|explain|show me|start|begin)\b/i.test(text);
  const mentionsRating = /\b(rate|rating|ratings|skill|ovr|score|level)\b/i.test(text);
  const mentionsPlayer = /\b(player|players|someone|a player|roster)\b/i.test(text) || /\brate\s+\w+/i.test(text);
  const looksLikeAction = /^\s*(rate|set|change|make)\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]+\s+(?:to|as)\s+\d+/i.test(text);
  return isQuestion && mentionsRating && mentionsPlayer && !looksLikeAction;
}

function buildPlayerRatingHowToHelpAnswer(
  commandText: string,
  rosterMode: "local" | "shared",
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  if (!looksLikePlayerRatingHowToHelpRequest(commandText)) return null;

  const assistantSummary = rosterMode === "shared"
    ? translate("ai.panel.help.sharedPlayerRating")
    : translate("ai.panel.help.localPlayerRating");

  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: commandText.slice(0, 300),
    assistantSummary,
    confidence: 0.8,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Answered player-rating how-to request locally after AI route failed."],
  } as any;
}

function looksLikeSharedRosterRatingHelpRequest(commandText: string) {
  const text = String(commandText || "").trim();
  if (!text) return false;
  return /\b(shared|club)\b/i.test(text)
    && /\b(rate|rating|ratings|skill|ovr)\b/i.test(text)
    && /\b(i want|want to|how|can i|where|start|begin|open|rate for|rating for)\b/i.test(text);
}

function buildSharedRosterRatingHelpAnswer(
  commandText: string,
  rosterMode: "local" | "shared",
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  if (!looksLikeSharedRosterRatingHelpRequest(commandText)) return null;

  const assistantSummary = rosterMode === "shared"
    ? translate("ai.panel.help.sharedRosterRatings")
    : translate("ai.panel.help.localRosterSharedRatings");

  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: commandText.slice(0, 300),
    assistantSummary,
    confidence: 0.78,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Answered shared-rating help request locally after AI route failed."],
  } as any;
}

function buildActionBoardHelpAnswer(
  commandText: string,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const text = String(commandText || "").trim();
  if (!text || !/\b(action board|task board|tasks and votes|tasks & votes|decision board)\b/i.test(text)) return null;
  const isQuestion = /\?|\b(what|how|why|where|explain|help|can i|can we|does|do)\b/i.test(text);
  if (!isQuestion) return null;
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: text.slice(0, 300),
    assistantSummary: translate("ai.panel.help.actionBoard"),
    confidence: 0.99,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Answered Action Board help from current in-app product knowledge before AI routing."],
  } as any;
}

function buildClubAttendanceHelpAnswer(
  commandText: string,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const text = String(commandText || "").trim();
  if (!text || !/\b(club attendance|attendance issue|attendance issues|no-show|no show|last-minute cancellation|last minute cancellation|warning template|warning templates|copy warning|dismissal from group|tardy record)\b/i.test(text)) return null;
  const isQuestion = /\?|\b(what|how|why|where|explain|help|can i|can we|does|do)\b/i.test(text);
  if (!isQuestion) return null;
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: text.slice(0, 300),
    assistantSummary: translate("ai.panel.help.clubAttendance"),
    confidence: 0.99,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Answered Club attendance help from current in-app product knowledge before AI routing."],
  } as any;
}

function looksLikeBasicPlayerHelpQuestion(commandText: string) {
  const text = String(commandText || "").trim();
  if (!text) return null;
  const isHowTo = /\?|\b(how\s+do\s+i|how\s+to|where\s+do\s+i|where\s+is|show\s+me\s+how|help\s+me)\b/i.test(text);
  if (!isHowTo) return null;
  if (/\b(add|create|new)\b.*\b(player|players)\b/i.test(text) || /\b(player|players)\b.*\b(add|create|new)\b/i.test(text)) return "add_player";
  if (/\b(edit|change|update|rename)\b.*\b(player|players|player card|details)\b/i.test(text) || /\b(player|players|player card|details)\b.*\b(edit|change|update|rename)\b/i.test(text)) return "edit_player";
  return null;
}

function buildBasicPlayerHelpAnswer(
  commandText: string,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const topic = looksLikeBasicPlayerHelpQuestion(commandText);
  if (!topic) return null;

  const assistantSummary = topic === "add_player"
    ? translate("ai.panel.help.addPlayer")
    : translate("ai.panel.help.editPlayer");

  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: commandText.slice(0, 300),
    assistantSummary,
    confidence: 0.86,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Answered basic player help locally before AI routing."],
  } as any;
}

function buildLocalRosterStatFallbackAnswer(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const request = detectRosterStatQuestionForFallback(commandText);
  if (!request || !Array.isArray(players) || players.length === 0) return null;

  const rows = players
    .map((player) => ({
      player,
      specificValue: getVisibleNumericPlayerValue(player, request.field),
      ovrValue: getVisibleNumericPlayerValue(player, "OVR"),
    }))
    .filter((row) => Number.isFinite(Number(row.specificValue)) || Number.isFinite(Number(row.ovrValue)));

  if (rows.length === 0) return null;

  const hasSpecificField = rows.some((row) => Number.isFinite(Number(row.specificValue)));
  const valueKey = hasSpecificField ? "specificValue" : "ovrValue";
  const sorted = [...rows].sort((a, b) => {
    const av = Number((a as any)[valueKey]);
    const bv = Number((b as any)[valueKey]);
    return request.direction === "lowest" ? av - bv : bv - av;
  });
  const shown = sorted.slice(0, Math.min(5, sorted.length));
  const fieldLabel = hasSpecificField ? request.field : translate("ai.panel.rosterStats.fallbackField");
  const names = shown
    .map((row, index) => translate("ai.panel.rosterStats.row", {
      index: index + 1,
      player: row.player.name || translate("ai.panel.rosterStats.playerFallback"),
      field: fieldLabel,
      value: Number((row as any)[valueKey]),
    }))
    .join("\n");
  const prefix = hasSpecificField
    ? translate("ai.panel.rosterStats.visibleSummary", {
      field: request.field,
      direction: request.direction,
    })
    : translate("ai.panel.rosterStats.fallbackSummary", { field: request.field });

  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: commandText.slice(0, 300),
    assistantSummary: `${prefix}\n${names}`,
    confidence: hasSpecificField ? 0.82 : 0.62,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: [hasSpecificField ? "Answered roster stat question locally after AI route failed." : "Requested stat was unavailable; answered with visible OVR/skill instead."],
  } as any;
}


function isRankedRosterSelectionAction(action: AiSmartCommandAction | null | undefined) {
  if (action?.type !== "select_players") return false;
  if (/(ranked_roster_selection|bulk_all_except|bulk_all_roster)/i.test(String(action.distribution || ""))) {
    return true;
  }

  // Compatibility for older/provider actions that encoded the marker in an
  // English reason before current actions supplied a structured distribution.
  return /(ranked_roster_selection|bulk_all_except|bulk_all_roster)/i.test(String(action.reason || ""));
}

function actionRequestsShuffle(action: AiSmartCommandAction) {
  if (/shuffle|different|mix|fresh|reroll/i.test(String(action.distribution || ""))) {
    return true;
  }

  // Compatibility for older/provider actions without a structured shuffle
  // distribution. Current local conversation prose is not parsed here.
  return /shuffle|different|mix|fresh|reroll/i.test(String(action.reason || ""));
}

const BULK_TEAM_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function localBulkPhoneticKey(value?: string | null) {
  return compactNameForCompare(value)
    .replace(/oo/g, "u")
    .replace(/ou/g, "u")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/e$/g, "");
}

function localBulkVisibleNames(player: AiSmartCommandRosterPlayer) {
  const names = [player.name || ""];
  if (player.aka) {
    player.aka
      .split(/[,/;|·•]+|\baka\b/i)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => names.push(part));
  }
  return names.filter(Boolean);
}

function looksLikeLocalBulkRosterCommand(commandText: string) {
  const text = String(commandText || "").trim();
  if (!text) return false;
  if (/^\s*(how|what|why|where|when|who|which)\b/i.test(text)) return false;
  const hasAction = /\b(select|choose|pick|mark|add|use|take|make|create|generate|split|divide)\b/i.test(text);
  const hasAllRoster = /\b(select|choose|pick|mark|add|use|take)\b.{0,35}\b(all|everyone|everybody)\b/i.test(text)
    || /\b(all|everyone|everybody|entire|whole)\b.{0,35}\b(roster|players?|player list|team list)\b/i.test(text)
    || /\b(roster|players?|player list|team list)\b.{0,35}\b(all|everyone|everybody|entire|whole)\b/i.test(text);
  return hasAction && hasAllRoster;
}

function localBulkTeamCount(commandText: string) {
  const text = String(commandText || "");
  const numeric = text.match(/\b(?:make|create|generate|split|divide(?:\s+into)?)\s+(\d{1,2})\s+teams?\b/i)
    || text.match(/\b(\d{1,2})\s+teams?\b/i);
  const numericValue = Number(numeric?.[1]);
  if (Number.isFinite(numericValue) && numericValue >= 2 && numericValue <= 12) return numericValue;
  const wordPattern = Object.keys(BULK_TEAM_WORDS).join("|");
  const word = text.match(new RegExp(`\\b(?:make|create|generate|split|divide(?:\\s+into)?)\\s+(${wordPattern})\\s+teams?\\b`, "i"))
    || text.match(new RegExp(`\\b(${wordPattern})\\s+teams?\\b`, "i"));
  const value = word?.[1] ? BULK_TEAM_WORDS[word[1].toLowerCase()] : null;
  return value && value >= 2 && value <= 12 ? value : null;
}

function localBulkShouldGenerate(commandText: string) {
  return /\b(make|create|generate|split|divide)\b.*\bteams?\b/i.test(commandText) || Boolean(localBulkTeamCount(commandText));
}

function localBulkExcludedNames(commandText: string) {
  const text = String(commandText || "");
  const exclusionPhrase = "except(?:\\s+for)?|excluding|exclude|without|but\\s+(?:exclude|excluding|not|leave\\s+out)|other\\s+than|minus|leave\\s+out|leaving\\s+out|apart\\s+from";
  const stopper = "and\\s+then|then|make|create|generate|split|divide|with|from|on\\s+my\\s+roster|in\\s+my\\s+roster|on\\s+the\\s+roster|in\\s+the\\s+roster";
  const match = text.match(new RegExp(`\\b(?:${exclusionPhrase})\\s+(.+?)(?=\\b(?:${stopper})\\b|$)`, "i"));
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,;\n]+|\s+and\s+|\s+und\s+|\s+그리고\s+|\s*랑\s*|\s*와\s*|\s*과\s*/i)
    .map((part) => part
      .replace(/^(?:the\s+)?(?:player|person)\s+/i, "")
      .replace(new RegExp(`^(?:${exclusionPhrase}|not)\\s+`, "i"), "")
      .replace(/\b(?:please|thanks|then|make|create|generate|teams?|players?|roster)\b/gi, " ")
      .replace(/[.!?。！？,;]+$/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter((part) => part.length >= 2 && part.length <= 80);
}

function localBulkCandidateMatches(rawName: string, players: AiSmartCommandRosterPlayer[]) {
  const targetKey = localBulkPhoneticKey(rawName);
  const phoneticMatches = players.filter((player) => {
    if (!player?.id) return false;
    return localBulkVisibleNames(player).some((name) => localBulkPhoneticKey(name) === targetKey);
  });
  if (phoneticMatches.length > 0) return phoneticMatches.slice(0, 4);

  return rankedOcrStyleRosterMatches(rawName, players, 4)
    .filter((match) => match.score >= 78)
    .map((match) => match.player)
    .filter((player, index, rows) => player?.id && rows.findIndex((row) => row.id === player.id) === index)
    .slice(0, 4);
}

function localBulkPlayerRef(player: AiSmartCommandRosterPlayer, spokenName?: string) {
  return {
    playerId: player.id || null,
    rosterName: player.name || null,
    spokenName: spokenName || player.name || "",
    confidence: player.id ? 1 : 0,
  };
}

function makeLocalBulkSelectAction(
  players: AiSmartCommandRosterPlayer[],
  excludedPlayers: AiSmartCommandRosterPlayer[],
  commandText: string,
  translate: AiSmartCommandConversationPresenter,
  candidateLabel?: string,
): AiSmartCommandAction {
  const excludedIds = new Set(excludedPlayers.map((player) => player.id).filter(Boolean));
  const selectedRefs = players
    .filter((player) => player?.id && !excludedIds.has(player.id))
    .map((player) => localBulkPlayerRef(player));
  const excludedNames = formatAiUnitList(
    excludedPlayers.map((player) => player.name).filter(Boolean),
    translate,
  );
  const teamCount = localBulkTeamCount(commandText);
  const thenGenerate = localBulkShouldGenerate(commandText);
  return {
    type: "select_players",
    playerRefs: selectedRefs,
    newPlayerName: null,
    suggestedSkill: null,
    playersPerTeam: null,
    teamCount,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: `replace_today_selection:${excludedPlayers.length > 0 ? "bulk_all_except" : "bulk_all_roster"}:local_fast${thenGenerate ? ":then_generate" : ""}`,
    noteText: null,
    colorName: null,
    targetName: excludedPlayers.length > 0 ? candidateLabel || excludedNames : null,
    targetArea: null,
    capabilityId: "today.select_players",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: excludedPlayers.length > 0
      ? translate("ai.panel.bulk.reasonExcluding", {
        count: players.length,
        selectedCount: selectedRefs.length,
        playerCount: players.length,
        names: candidateLabel || excludedNames,
      })
      : translate("ai.panel.bulk.reasonAll", { count: players.length }),
  };
}

function buildLocalBulkRosterSelectionAnswer(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  if (!looksLikeLocalBulkRosterCommand(commandText) || !Array.isArray(players) || players.length === 0) return null;
  const excludedNames = localBulkExcludedNames(commandText);

  if (excludedNames.length === 0) {
    const action = makeLocalBulkSelectAction(players, [], commandText, translate);
    return {
      schemaVersion: 1,
      ok: true,
      detectedLanguage: "unknown",
      normalizedIntent: commandText.slice(0, 300),
      assistantSummary: localBulkShouldGenerate(commandText)
        ? translate("ai.panel.bulk.selectAllWithTeams", { count: players.length })
        : translate("ai.panel.bulk.selectAll", { count: players.length }),
      confidence: 0.94,
      actions: [action],
      confirmations: [],
      unresolved: [],
      parseMode: "local_fallback" as any,
      debugWarnings: ["Handled select-all roster command locally before OpenAI to avoid slow 60-name review."],
    } as any;
  }

  if (excludedNames.length === 1) {
    const heardName = excludedNames[0];
    const matches = localBulkCandidateMatches(heardName, players);
    if (matches.length === 1) {
      const action = makeLocalBulkSelectAction(players, [matches[0]], commandText, translate, matches[0].name || heardName);
      return {
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: commandText.slice(0, 300),
        assistantSummary: translate("ai.panel.bulk.singleMatch", {
          heardName,
          playerName: matches[0].name,
        }),
        confidence: 0.92,
        actions: [action],
        confirmations: [],
        unresolved: [],
        parseMode: "local_fallback" as any,
        debugWarnings: ["Handled all-except roster command locally before OpenAI."],
      } as any;
    }
    if (matches.length > 1) {
      const actions = matches.map((player) => makeLocalBulkSelectAction(players, [player], commandText, translate, player.name || heardName));
      return {
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: commandText.slice(0, 300),
        assistantSummary: translate("ai.panel.bulk.chooseMatch", { heardName }),
        confidence: 0.86,
        actions,
        confirmations: [],
        unresolved: [],
        parseMode: "local_fallback" as any,
        debugWarnings: ["Handled ambiguous all-except roster command locally before OpenAI."],
      } as any;
    }
    return {
      schemaVersion: 1,
      ok: true,
      detectedLanguage: "unknown",
      normalizedIntent: commandText.slice(0, 300),
      assistantSummary: translate("ai.panel.bulk.noMatch", { heardName }),
      confidence: 0.7,
      actions: [],
      confirmations: [],
      unresolved: [{
        text: heardName,
        issue: "unknown_player",
        message: translate("ai.panel.bulk.choosePlayer", { name: heardName }),
      }],
      parseMode: "local_fallback" as any,
      debugWarnings: ["All-except roster command stopped locally because the excluded player was unknown."],
    } as any;
  }

  const resolved: AiSmartCommandRosterPlayer[] = [];
  const unresolved: string[] = [];
  for (const heardName of excludedNames) {
    const matches = localBulkCandidateMatches(heardName, players);
    if (matches.length === 1) resolved.push(matches[0]);
    else unresolved.push(heardName);
  }
  if (unresolved.length > 0) {
    return {
      schemaVersion: 1,
      ok: true,
      detectedLanguage: "unknown",
      normalizedIntent: commandText.slice(0, 300),
      assistantSummary: translate("ai.panel.bulk.unclearMatches", { names: formatAiUnitList(unresolved, translate) }),
      confidence: 0.72,
      actions: [],
      confirmations: [],
      unresolved: unresolved.map((name) => ({
        text: name,
        issue: "unknown_player",
        message: translate("ai.panel.bulk.choosePlayer", { name }),
      })),
      parseMode: "local_fallback" as any,
      debugWarnings: ["All-except roster command stopped locally because one or more excluded players were unclear."],
    } as any;
  }

  const uniqueResolved = resolved.filter((player, index, rows) => player?.id && rows.findIndex((row) => row.id === player.id) === index);
  const action = makeLocalBulkSelectAction(players, uniqueResolved, commandText, translate);
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: commandText.slice(0, 300),
    assistantSummary: translate("ai.panel.bulk.selectedExcept", {
      names: formatAiUnitList(uniqueResolved.map((player) => player.name), translate),
    }),
    confidence: 0.9,
    actions: [action],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Handled multi-exclusion roster command locally before OpenAI."],
  } as any;
}

function parseModeLabel(mode?: AiSmartCommandResponse["parseMode"]) {
  if (mode === "local_fallback") return translate("ai.parseMode.localFallback");
  if (mode === "ai_with_local_hints") return translate("ai.parseMode.aiWithRules");
  if (mode === "ai") return translate("ai.parseMode.ai");
  return translate("ai.parseMode.beta");
}

function actionCardTitle(action: AiSmartCommandAction) {
  if (action.type === "select_players") {
    if (isRankedRosterSelectionAction(action)) {
      const excluded = bulkRosterSelectionExcludedText(action);
      return excluded ? translate("ai.action.leaveOut", { names: excluded }) : translate("ai.action.useRosterSelection");
    }
    if (isUseExistingPlayerAction(action)) return translate("ai.action.useExistingPlayer");
    if (/then_generate/i.test(String(action.distribution || "")) || action.teamCount) return translate("ai.action.replaceAndGenerate");
    if (/replace|exact|only/i.test(String(action.distribution || ""))) return translate("ai.action.replaceSessionSelection");
    return translate("ai.action.addToSession");
  }
  if (action.type === "unselect_players") return translate("ai.action.removeFromSession");
  if (action.type === "mark_players_late") return translate("ai.action.markLate");
  if (action.type === "add_new_player_suggestion") return translate("ai.action.addNewPlayer");
  if (action.type === "open_app_area") return action.targetArea
    ? translate("ai.action.openArea", { area: aiTargetAreaText(action.targetArea, translate) })
    : translate("ai.action.openAppArea");
  if (action.type === "generate_teams" && actionRequestsShuffle(action)) return translate("ai.action.shuffleTeams");
  const capability = getAiCommandCapability(action);
  if (capability) return aiCommandCapabilityLabel(capability);
  if (action.type === "no_action") return translate("ai.action.noActionNeeded");
  if (action.type === "unsupported_action") return action.targetName || translate("ai.action.notAvailable");
  return actionLabel(action.type);
}

function actionCardTone(action: AiSmartCommandAction) {
  const status = action.supportStatus || getAiCommandCapability(action)?.supportStatus || "unknown";
  if (status === "executable") return "border-emerald-100 bg-emerald-50 text-emerald-900";
  if (status === "needs_confirmation") return "border-amber-100 bg-amber-50 text-amber-900";
  if (status === "unsafe") return "border-rose-100 bg-rose-50 text-rose-900";
  if (status === "understood_not_wired") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-violet-100 bg-violet-50 text-[#102A43]";
}

function actionPrimaryVerb(action: AiSmartCommandAction) {
  if (action.type === "club_add_note") return translate("ai.verb.addNote");
  if (action.type === "add_new_player_suggestion") return translate("ai.verb.addPlayer");
  if (action.type === "select_players") {
    if (isRankedRosterSelectionAction(action)) return translate("ai.verb.usePlayers");
    if (/then_generate/i.test(String(action.distribution || "")) || action.teamCount) return translate("ai.verb.replaceAndGenerate");
    return /replace|exact|only/i.test(String(action.distribution || "")) ? translate("ai.verb.replaceSession") : translate("ai.verb.addToSession");
  }
  if (action.type === "unselect_players") return translate("common.remove");
  if (action.type === "mark_players_late") return translate("ai.action.markLate");
  if (action.type === "open_app_area") return translate("common.open");
  if (action.type === "set_team_size" || action.type === "set_team_count") return translate("ai.verb.set");
  if (action.type === "generate_teams") return actionRequestsShuffle(action) ? translate("ai.verb.shuffle") : translate("ai.verb.generate");
  return translate("ai.verb.apply");
}

type AiRosterMatch = {
  player: AiSmartCommandRosterPlayer;
  score: number;
  secondBestScore: number;
};

type AiReviewOption = {
  kind: "existing" | "new" | "skip";
  playerId?: string;
  rosterName?: string;
  heardName: string;
  score?: number;
};

type AiReviewItem = {
  key: string;
  heardName: string;
  options: AiReviewOption[];
  sourcePosition: number;
  source: "ai" | "transcript" | "merged";
};

type AiTranscriptNameCandidate = {
  name: string;
  position: number;
};

function cleanAiSpokenName(value?: string | null) {
  const raw = String(value || "")
    .replace(/[“”"']/g, " ")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  // Do not permanently erase a single-word value here. A rare player/nickname could
  // genuinely be "New" or "Four". Source-specific stop-word filtering happens later,
  // where roster matches and AI-vs-transcript origin are known.
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return raw;

  return raw
    .replace(/\b(?:is|are|was|were|be|been|being|am|have|has|had|having|here|today|playing|coming|players?|people|person|with|and|or|so|let'?s|lets|make|create|generate|build|split|divide|team|teams|only|like|to|from|in|on|at|the|a|an|please|okay|ok|then|also|just|now|old|next|last|first|second|third|fourth|fair|teams?)\b/gi, " ")
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi, " ")
    .replace(/\b(?:new)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function aiNameKey(value?: string | null) {
  return normalizePlayerNameForMatch(cleanAiSpokenName(value)).replace(/\s+/g, "");
}

function isLikelyFullRosterName(value: string, players: AiSmartCommandRosterPlayer[]) {
  const cleaned = cleanAiSpokenName(value);
  const normalized = normalizePlayerNameForMatch(cleaned);
  if (!normalized) return false;
  const match = bestPlayerNameMatch(cleaned, players, { includeDisplayName: true });
  if (!match || match.score < 94 || match.score < match.secondBestScore + 7) return false;
  // Do not preserve a long merged blob just because it contains one roster token.
  // Only keep it whole when the matched roster candidate itself equals the heard phrase.
  return aiNameKey(match.candidate) === aiNameKey(cleaned);
}

function splitNameWordsPreservingInitials(words: string[]) {
  const names: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = words[index + 1];
    if (!word || word.length < 2) continue;
    if (next && /^[A-Za-z]$/.test(next) && word.length >= 3) {
      names.push(`${word} ${next.toUpperCase()}`);
      index += 1;
      continue;
    }
    if (/^[A-Za-z]$/.test(word)) continue;
    names.push(word);
  }
  return names;
}

function splitAiHeardNameForReview(rawName: string | null | undefined, players: AiSmartCommandRosterPlayer[]) {
  const cleaned = cleanAiSpokenName(rawName);
  if (!cleaned) return [];

  const delimiterParts = String(rawName || cleaned)
    .replace(/[“”"']/g, " ")
    .split(/[,;\n]+|\s+&\s+|\s+\+\s+|\s+and\s+|\s+und\s+|\s+그리고\s+/i)
    .map((part) => cleanAiSpokenName(part))
    .filter((part) => part.length >= 2);

  const parts = delimiterParts.length > 1 ? delimiterParts : [cleaned];
  const names: string[] = [];
  for (const part of parts) {
    const normalizedWords = normalizePlayerNameForMatch(part).split(/\s+/).filter(Boolean);
    if (normalizedWords.length <= 2 || isLikelyFullRosterName(part, players)) {
      names.push(displayAiHeardName(part));
      continue;
    }
    splitNameWordsPreservingInitials(part.split(/\s+/).filter(Boolean)).forEach((name) => names.push(displayAiHeardName(name)));
  }

  const seen = new Set<string>();
  return names.filter((name) => {
    const key = aiNameKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAiReviewStopName(value?: string | null) {
  const key = aiNameKey(value);
  if (!key) return true;
  return /^(like|to|from|in|on|at|the|a|an|with|and|or|so|ok|okay|please|team|teams|player|players|people|person|today|here|only|make|create|generate|build|split|divide|lets|let|fair|now|then|also|just|have|has|had|having|new|old|next|last|first|second|third|fourth|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|v|vs)$/.test(key);
}


function hasStrongRosterFallbackMatch(value?: string | null, players: AiSmartCommandRosterPlayer[] = []) {
  const best = rankedOcrStyleRosterMatches(value, players, 1)[0];
  return Boolean(best && best.score >= 78);
}

function looksLikeSafeMultiWordNewName(value?: string | null) {
  const cleaned = cleanAiSpokenName(value);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  return words.every((word) => word.length >= 3 && !isAiReviewStopName(word));
}

function isWeakTranscriptFallbackName(value?: string | null, players: AiSmartCommandRosterPlayer[] = []) {
  const cleaned = cleanAiSpokenName(value);
  const key = aiNameKey(cleaned);
  if (!key || isAiReviewStopName(cleaned)) return true;
  if (/^\d+$/.test(key)) return true;
  if (hasStrongRosterFallbackMatch(cleaned, players)) return false;
  if (looksLikeSafeMultiWordNewName(cleaned)) return false;
  return true;
}

function isWeakAiExtractedName(value?: string | null, players: AiSmartCommandRosterPlayer[] = []) {
  const cleaned = cleanAiSpokenName(value);
  const key = aiNameKey(cleaned);
  if (!key) return true;
  if (/^\d+$/.test(key)) return true;
  // AI-extracted names are trusted more than transcript fallback, but app/instruction
  // words still should not become review rows unless they match this roster.
  if (isAiReviewStopName(cleaned) && !hasStrongRosterFallbackMatch(cleaned, players)) return true;
  return false;
}

function findApproxSourcePosition(sourceText: string, heardName: string, fallbackPosition: number) {
  const source = String(sourceText || "");
  const cleaned = cleanAiSpokenName(heardName);
  if (!source || !cleaned) return fallbackPosition;
  const lowerSource = source.toLowerCase();
  const direct = lowerSource.indexOf(cleaned.toLowerCase());
  if (direct >= 0) return direct;

  const words = cleaned.toLowerCase().split(/\s+/).filter((word) => word.length >= 2);
  const positions = words
    .map((word) => lowerSource.indexOf(word))
    .filter((position) => position >= 0);
  return positions.length > 0 ? Math.min(...positions) : fallbackPosition;
}

function cleanTranscriptListSegment(text: string) {
  return String(text || "")
    .replace(/[“”"']/g, " ")
    .replace(/\b(?:okay|ok|please|so|then|also|just|now)\b/gi, " ")
    .replace(/\b(?:let'?s|lets)\s+(?:make|create|generate|build|split|divide)\b.*$/i, " ")
    .replace(/\b(?:make|create|generate|build|split|divide)\s+(?:a\s+)?(?:team|teams)\b.*$/i, " ")
    .replace(/\b(?:is|are|was|were)\s+(?:here|playing|coming|available|in)\b/gi, ",")
    .replace(/\b(?:here|today|playing|coming|available|players?|people|person|these|those|only|have|has|had|new|old|make|create|generate|build|split|divide|team|teams?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTranscriptNameCandidates(sourceText: string, players: AiSmartCommandRosterPlayer[]): AiTranscriptNameCandidate[] {
  const raw = String(sourceText || "").trim();
  if (!raw) return [];
  const hasAttendanceShape = /[,;\n]/.test(raw)
    || /\b(today\s+we\s+have|we\s+have|with|is\s+here|are\s+here|playing\s+today|coming\s+today|are\s+playing)\b/i.test(raw)
    || /\b(make|create|generate|build|split)\b.*\bwith\b/i.test(raw);
  if (!hasAttendanceShape) return [];

  let segment = raw;
  const withMatch = segment.match(/\b(?:make|create|generate|build|split|divide)\b.*?\bwith\b/i);
  if (withMatch && typeof withMatch.index === "number") {
    segment = segment.slice(withMatch.index + withMatch[0].length);
  } else {
    const starters = [
      /\btoday\s+we\s+have\b/i,
      /\bwe\s+have\b/i,
      /\bfor\s+today\b/i,
      /\btoday\b/i,
    ];
    for (const starter of starters) {
      const match = segment.match(starter);
      if (match && typeof match.index === "number" && match.index < Math.max(24, segment.length / 3)) {
        segment = segment.slice(match.index + match[0].length);
        break;
      }
    }
  }

  const cleanedSegment = cleanTranscriptListSegment(segment);
  if (!cleanedSegment) return [];
  const pieces = cleanedSegment
    .split(/[,;\n]+|\s+&\s+|\s+\+\s+|\s+and\s+|\s+und\s+|\s+그리고\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates: AiTranscriptNameCandidate[] = [];
  for (const piece of pieces) {
    const names = splitAiHeardNameForReview(piece, players);
    for (const name of names) {
      if (isWeakTranscriptFallbackName(name, players)) continue;
      const normalizedWords = normalizePlayerNameForMatch(name).split(/\s+/).filter(Boolean);
      if (normalizedWords.length > 3 && !isLikelyFullRosterName(name, players)) continue;
      candidates.push({ name, position: findApproxSourcePosition(raw, name, candidates.length * 1000) });
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = aiNameKey(candidate.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.position - b.position);
}

function displayAiHeardName(value?: string | null) {
  const cleaned = cleanAiSpokenName(value);
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => /^[A-Za-z]$/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function rankedOcrStyleRosterMatches(spokenName: string | null | undefined, players: AiSmartCommandRosterPlayer[], limit = 5): AiRosterMatch[] {
  const cleaned = cleanAiSpokenName(spokenName);
  const normalized = normalizePlayerNameForMatch(cleaned);
  if (!normalized || normalized.length < 2) return [];

  const rows = players
    .map((player) => {
      const candidates = candidateNamesForRosterPlayer(player, { includeDisplayName: true });
      const isExact = candidates.includes(normalized);
      const score = isExact ? 100 : scorePlayerNameMatch(cleaned, player, { includeDisplayName: true });
      return { player, score, secondBestScore: 0 };
    })
    .filter((row) => row.player?.id && row.score > 0)
    .sort((a, b) => b.score - a.score || String(a.player.name || "").localeCompare(String(b.player.name || "")));

  if (!rows.length) return [];
  const bestScore = rows[0].score;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const suggestThreshold = wordCount === 1 ? 78 : 72;
  if (bestScore < suggestThreshold) return [];

  const closeWindow = bestScore >= 96 ? 8 : 10;
  const kept = rows
    .filter((row) => row.score >= suggestThreshold && row.score >= bestScore - closeWindow)
    .slice(0, limit);

  return kept.map((row, index) => ({
    ...row,
    secondBestScore: index === 0 ? (kept[1]?.score || rows[1]?.score || 0) : bestScore,
  }));
}

function findOcrStyleRosterMatch(spokenName: string | null | undefined, players: AiSmartCommandRosterPlayer[]): AiRosterMatch | null {
  return rankedOcrStyleRosterMatches(spokenName, players, 1)[0] || null;
}

function isAmbiguousRosterName(spokenName: string | null | undefined, players: AiSmartCommandRosterPlayer[]) {
  const matches = rankedOcrStyleRosterMatches(spokenName, players, 5);
  if (matches.length <= 1) return false;
  const bestScore = matches[0].score;
  const secondScore = matches[1].score;
  const cleaned = cleanAiSpokenName(spokenName);
  const normalized = normalizePlayerNameForMatch(cleaned);
  const firstToken = normalized.split(/\s+/).filter(Boolean)[0] || normalized;
  const sameBaseCount = matches.filter((match) => {
    const rosterFirst = normalizePlayerNameForMatch(match.player.name).split(/\s+/).filter(Boolean)[0] || "";
    return rosterFirst && scorePlayerNameMatch(firstToken, { id: match.player.id, name: rosterFirst, aka: match.player.aka }, { includeDisplayName: true }) >= 86;
  }).length;
  return secondScore >= bestScore - 6 || sameBaseCount >= 2;
}

function makeExistingPlayerActionFromAiName(
  spokenName: string,
  match: AiRosterMatch,
  translate: AiSmartCommandConversationPresenter,
  template?: AiSmartCommandAction,
): AiSmartCommandAction {
  return {
    type: "select_players",
    playerRefs: [{
      playerId: match.player.id,
      rosterName: match.player.name,
      spokenName: cleanAiSpokenName(spokenName) || spokenName,
      confidence: Math.min(1, Math.max(0.72, match.score / 100)),
    }],
    newPlayerName: null,
    suggestedSkill: null,
    playersPerTeam: template?.playersPerTeam ?? null,
    teamCount: template?.teamCount ?? null,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: USE_EXISTING_PLAYER_DISTRIBUTION,
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: "today.select_players",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: translate("ai.panel.match.possibleReason", {
      spokenName: cleanAiSpokenName(spokenName) || spokenName,
      playerName: match.player.name,
    }),
  };
}

function repairAiPlayerRefsWithRosterMatcher(
  action: AiSmartCommandAction,
  players: AiSmartCommandRosterPlayer[],
  resolvedNames: Set<string>,
): AiSmartCommandAction {
  if (!["select_players", "unselect_players", "mark_players_late", "add_pairing_rule", "lock_player_to_team"].includes(action.type)) return action;
  if (!Array.isArray(action.playerRefs) || action.playerRefs.length === 0) return action;

  const playerRefs = action.playerRefs.map((ref) => {
    if (ref.playerId) return ref;
    const spokenName = ref.spokenName || ref.rosterName || "";
    if (isAmbiguousRosterName(spokenName, players)) return ref;
    const match = findOcrStyleRosterMatch(spokenName, players);
    if (!match) return ref;
    resolvedNames.add(aiNameKey(spokenName));
    return {
      ...ref,
      playerId: match.player.id,
      rosterName: match.player.name,
      spokenName: cleanAiSpokenName(spokenName) || spokenName,
      confidence: Math.min(1, Math.max(0.72, match.score / 100)),
    };
  });

  return { ...action, playerRefs };
}

function enhanceAiResultWithOcrStyleRosterMatching(
  response: AiSmartCommandResponse,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse {
  if (!players.length || !response?.actions) return response;

  const resolvedNames = new Set<string>();
  const extraActions: AiSmartCommandAction[] = [];
  const repairedActions = response.actions.flatMap((action): AiSmartCommandAction[] => {
    if (action.type === "add_new_player_suggestion" && action.newPlayerName) {
      const matches = rankedOcrStyleRosterMatches(action.newPlayerName, players, 5);
      if (matches.length > 0) {
        resolvedNames.add(aiNameKey(action.newPlayerName));
        return matches.map((match) => makeExistingPlayerActionFromAiName(action.newPlayerName!, match, translate, action));
      }
    }
    return [repairAiPlayerRefsWithRosterMatcher(action, players, resolvedNames)];
  });

  for (const item of response.unresolved || []) {
    if (item.issue !== "unknown_player" && item.issue !== "ambiguous_player") continue;
    const key = aiNameKey(item.text);
    if (!key || resolvedNames.has(key)) continue;
    const matches = rankedOcrStyleRosterMatches(item.text, players, 5);
    if (matches.length === 0) continue;
    resolvedNames.add(key);
    matches.forEach((match) => extraActions.push(makeExistingPlayerActionFromAiName(item.text, match, translate)));
  }

  if (resolvedNames.size === 0 && extraActions.length === 0) return response;

  const seenActionKeys = new Set<string>();
  const actions = [...repairedActions, ...extraActions].filter((action) => {
    const key = `${action.type}:${action.newPlayerName || action.playerRefs.map((ref) => ref.playerId || ref.spokenName).join("+")}:${action.teamCount || ""}:${action.playersPerTeam || ""}:${action.distribution || ""}`;
    if (seenActionKeys.has(key)) return false;
    seenActionKeys.add(key);
    return true;
  });

  const unresolved = (response.unresolved || []).filter((item) => !resolvedNames.has(aiNameKey(item.text)));
  const confirmations = (response.confirmations || []).filter((item) => {
    const candidateKeys = [item.message, ...item.playerRefs.map((ref) => ref.spokenName || ref.rosterName)].map(aiNameKey).filter(Boolean);
    return !candidateKeys.some((key) => resolvedNames.has(key));
  });

  return {
    ...response,
    actions,
    confirmations,
    unresolved,
    parseMode: response.parseMode === "local_fallback" ? response.parseMode : "ai_with_local_hints",
    assistantSummary: `${response.assistantSummary}${translate("ai.panel.match.alternativesSuffix")}`,
    debugWarnings: [...(response.debugWarnings || []), "AI names repaired with OCR-style roster matcher and ranked alternatives before display."],
  };
}


function actionHasTeamFollowup(action: AiSmartCommandAction) {
  return /then_generate/i.test(String(action.distribution || "")) || Boolean(action.teamCount) || action.type === "generate_teams";
}

function isAiNameReviewAction(action: AiSmartCommandAction) {
  if (isRankedRosterSelectionAction(action)) return false;
  if (action.type === "add_new_player_suggestion" && action.newPlayerName) return true;
  return ["select_players", "unselect_players", "mark_players_late", "add_pairing_rule", "lock_player_to_team"].includes(action.type) && action.playerRefs.length > 0;
}

function buildAiReviewOptions(heardName: string, players: AiSmartCommandRosterPlayer[]): AiReviewOption[] {
  const ranked = rankedOcrStyleRosterMatches(heardName, players, 5);
  const seen = new Set<string>();
  const options: AiReviewOption[] = [];
  for (const match of ranked) {
    if (seen.has(match.player.id)) continue;
    seen.add(match.player.id);
    options.push({
      kind: "existing",
      playerId: match.player.id,
      rosterName: match.player.name,
      heardName,
      score: match.score,
    });
  }
  options.push({ kind: "new", heardName, rosterName: heardName });
  options.push({ kind: "skip", heardName });
  return options;
}

function rebuildAiReviewItemWithEditedName(item: AiReviewItem, editedName: string | undefined, players: AiSmartCommandRosterPlayer[]): AiReviewItem {
  const heardName = displayAiHeardName(editedName || item.heardName);
  if (!heardName) return item;
  return {
    ...item,
    heardName,
    options: buildAiReviewOptions(heardName, players),
  };
}

function applyAiReviewNameEdits(items: AiReviewItem[], edits: Record<string, string>, players: AiSmartCommandRosterPlayer[]) {
  return items.map((item) => rebuildAiReviewItemWithEditedName(item, edits[item.key], players));
}

function buildAiReviewItems(result: AiSmartCommandResponse | null, players: AiSmartCommandRosterPlayer[], sourceText = ""): AiReviewItem[] {
  if (!result || !players.length) return [];
  const byKey = new Map<string, AiReviewItem>();
  let fallbackPosition = 100000;
  const addHeardName = (rawName?: string | null, source: "ai" | "transcript" = "ai", explicitPosition?: number) => {
    const heardNames = splitAiHeardNameForReview(rawName, players);
    const added: AiReviewItem[] = [];
    for (const heardName of heardNames) {
      const key = aiNameKey(heardName);
      const weak = source === "transcript"
        ? isWeakTranscriptFallbackName(heardName, players)
        : isWeakAiExtractedName(heardName, players);
      if (!key || heardName.length < 2 || weak) continue;
      const position = typeof explicitPosition === "number"
        ? explicitPosition
        : findApproxSourcePosition(sourceText, heardName, fallbackPosition++);
      const existing = byKey.get(key);
      if (existing) {
        existing.sourcePosition = Math.min(existing.sourcePosition, position);
        existing.source = existing.source === source ? existing.source : "merged";
      } else {
        byKey.set(key, { key, heardName, options: [], sourcePosition: position, source });
      }
      added.push(byKey.get(key)!);
    }
    return added[0] || null;
  };

  const transcriptCandidates = extractTranscriptNameCandidates(sourceText, players);

  for (const action of result.actions || []) {
    if (isRankedRosterSelectionAction(action)) continue;
    if (action.type === "add_new_player_suggestion" && action.newPlayerName) {
      addHeardName(action.newPlayerName, "ai");
    }
    if (["select_players", "unselect_players", "mark_players_late", "add_pairing_rule", "lock_player_to_team"].includes(action.type)) {
      for (const ref of action.playerRefs || []) {
        addHeardName(ref.spokenName || ref.rosterName, "ai");
      }
    }
  }
  const hasBulkRosterSelectionAction = (result.actions || []).some(isRankedRosterSelectionAction);
  for (const item of result.unresolved || []) {
    if (hasBulkRosterSelectionAction) continue;
    if (item.issue === "unknown_player" || item.issue === "ambiguous_player") addHeardName(item.text, "ai");
  }

  // Fallback transcript recovery is a safety net, not the main name source.
  // Use it only when the AI returned no names, or when a long transcript appears to
  // have clearly more roster-like names than the AI extracted. This avoids random
  // command words such as "have", "new", or "four" entering the review modal.
  const aiNameCount = byKey.size;
  const safeTranscriptCandidates = transcriptCandidates.filter((candidate) => !isWeakTranscriptFallbackName(candidate.name, players));
  const shouldUseTranscriptFallback = aiNameCount === 0
    || (safeTranscriptCandidates.length >= 8 && safeTranscriptCandidates.length > aiNameCount + 2);
  if (shouldUseTranscriptFallback) {
    for (const candidate of safeTranscriptCandidates) {
      addHeardName(candidate.name, "transcript", candidate.position);
    }
  }

  const items = Array.from(byKey.values()).map((item) => ({
    ...item,
    options: buildAiReviewOptions(item.heardName, players),
  }));

  return items
    .filter((item) => item.source !== "transcript" || !isWeakTranscriptFallbackName(item.heardName, players))
    .filter((item) => item.source !== "ai" || !isWeakAiExtractedName(item.heardName, players))
    .filter((item) => item.options.some((option) => option.kind === "existing") || item.heardName.length >= 2)
    .sort((a, b) => a.sourcePosition - b.sourcePosition || a.heardName.localeCompare(b.heardName));
}

function getAiReviewSourceStats(items: AiReviewItem[]) {
  const transcript = items.filter((item) => item.source === "transcript" || item.source === "merged").length;
  const ai = items.filter((item) => item.source === "ai" || item.source === "merged").length;
  return { transcript, ai };
}

function getAiReviewDefaultSelections(items: AiReviewItem[]) {
  const selections: Record<string, string> = {};
  for (const item of items) {
    const firstExisting = item.options.find((option) => option.kind === "existing");
    selections[item.key] = firstExisting?.playerId || "new";
  }
  return selections;
}

function reviewOptionLabel(option: AiReviewOption) {
  if (option.kind === "skip") return translate("ai.review.skip");
  if (option.kind === "new") return translate("ai.review.addName", { name: option.heardName });
  const player = option.rosterName || translate("ai.review.playerFallback");
  return typeof option.score === "number"
    ? translate("ai.review.playerWithScore", {
        player,
        score: formatPercent(getResolvedUiLocale(), option.score / 100, {
          maximumFractionDigits: 0,
        }),
      })
    : translate("ai.review.playerWithoutScore", { player });
}

function reviewItemNeedsAttention(item: AiReviewItem) {
  const existingOptions = item.options.filter((option) => option.kind === "existing");
  if (existingOptions.length === 0) return true;
  const bestScore = existingOptions[0]?.score || 0;
  const secondScore = existingOptions[1]?.score || 0;
  return bestScore < 94 || existingOptions.length > 1 && secondScore >= bestScore - 8;
}

function getAiReviewStats(items: AiReviewItem[], selections: Record<string, string>) {
  const heard = items.length;
  const selectedPlayerIds = items
    .map((item) => selections[item.key])
    .filter((value): value is string => Boolean(value && value !== "new" && value !== "skip"));
  const newSelectedCount = items.filter((item) => selections[item.key] === "new").length;
  const uniqueSelected = new Set(selectedPlayerIds).size;
  const needsReview = items.filter(reviewItemNeedsAttention).length;
  const duplicateSelected = Math.max(0, selectedPlayerIds.length - uniqueSelected);
  return {
    heard,
    matched: Math.max(0, heard - needsReview),
    needsReview,
    selected: uniqueSelected + newSelectedCount,
    duplicateSelected,
    newSelectedCount,
  };
}

function getSelectedPlayerIdCounts(items: AiReviewItem[], selections: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const selected = selections[item.key];
    if (!selected || selected === "new" || selected === "skip") continue;
    counts.set(selected, (counts.get(selected) || 0) + 1);
  }
  return counts;
}

function makeReviewAddNewPlayerAction(
  item: AiReviewItem,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandAction | null {
  const newPlayerName = displayAiHeardName(item.heardName);
  if (!newPlayerName || newPlayerName.length < 2) return null;
  return {
    type: "add_new_player_suggestion",
    playerRefs: [],
    newPlayerName,
    suggestedSkill: null,
    playersPerTeam: null,
    teamCount: null,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: "add_today_selection",
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: "roster.add_new_player",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: translate("ai.panel.review.newPlayerReason", { name: newPlayerName }),
  };
}

function makeReviewGenerateTeamsAction(
  translate: AiSmartCommandConversationPresenter,
  teamAction?: AiSmartCommandAction | null,
): AiSmartCommandAction {
  return {
    type: "generate_teams",
    playerRefs: [],
    newPlayerName: null,
    suggestedSkill: null,
    playersPerTeam: teamAction?.playersPerTeam ?? null,
    teamCount: teamAction?.teamCount ?? null,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: "from_reviewed_today_selection",
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: "teams.generate",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: translate("ai.panel.review.generateReason"),
  };
}

function buildActionsFromReviewSelections(
  result: AiSmartCommandResponse,
  items: AiReviewItem[],
  selections: Record<string, string>,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandAction[] {
  const seenPlayerIds = new Set<string>();
  const playerRefs = items.flatMap((item) => {
    const selected = selections[item.key];
    const option = item.options.find((candidate) => candidate.kind === "existing" && candidate.playerId === selected);
    if (!option?.playerId || seenPlayerIds.has(option.playerId)) return [];
    seenPlayerIds.add(option.playerId);
    return [{
      playerId: option.playerId,
      rosterName: option.rosterName || null,
      spokenName: item.heardName,
      confidence: Math.min(1, Math.max(0.72, (option.score || 90) / 100)),
    }];
  });

  const actions: AiSmartCommandAction[] = [];
  const teamAction = result.actions.find(actionHasTeamFollowup);
  // Current responses carry a structured team action. The English normalized-
  // intent fallback remains only for older/provider responses that predate that
  // structure; current localized presentation never depends on this branch.
  const shouldGenerate = Boolean(teamAction) || /generate|make|team/i.test(result.normalizedIntent || "");

  if (playerRefs.length > 0) {
    actions.push({
      type: "select_players",
      playerRefs,
      newPlayerName: null,
      suggestedSkill: null,
      playersPerTeam: null,
      teamCount: null,
      pairingKind: null,
      teamLabel: null,
      role: null,
      attribute: null,
      distribution: shouldGenerate ? "replace_today_selection" : "replace_today_selection",
      noteText: null,
      colorName: null,
      targetName: null,
      targetArea: null,
      capabilityId: "today.select_players",
      supportStatus: "executable",
      requiresConfirmation: false,
      reason: translate("ai.panel.review.replaceReason"),
    });
  }

  const seenNewNames = new Set<string>();
  for (const item of items) {
    if (selections[item.key] !== "new") continue;
    const newKey = aiNameKey(item.heardName);
    if (!newKey || seenNewNames.has(newKey)) continue;
    seenNewNames.add(newKey);
    const addAction = makeReviewAddNewPlayerAction(item, translate);
    if (addAction) actions.push(addAction);
  }

  if (shouldGenerate && actions.length > 0) {
    actions.push(makeReviewGenerateTeamsAction(translate, teamAction));
  }

  return actions;
}

function shouldHideActionBecauseReviewHandlesIt(action: AiSmartCommandAction) {
  return isAiNameReviewAction(action);
}

function compactNameForCompare(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function playerRefLabel(ref: AiSmartCommandAction["playerRefs"][number]) {
  const rosterName = ref.rosterName || ref.spokenName || translate("ai.review.playerFallback");
  const spokenName = ref.spokenName || rosterName;
  const heard = compactNameForCompare(spokenName);
  const roster = compactNameForCompare(rosterName);
  if (heard && roster && heard !== roster && ref.confidence < 0.99) {
    return `${spokenName} → ${rosterName}`;
  }
  return rosterName;
}

function actionPlayerSummary(action: AiSmartCommandAction) {
  if (action.type === "add_new_player_suggestion" && action.newPlayerName) {
    return [`${action.newPlayerName}`];
  }
  return action.playerRefs.map(playerRefLabel).filter(Boolean);
}

function actionImpactLine(action: AiSmartCommandAction) {
  const count = action.type === "add_new_player_suggestion" && action.newPlayerName
    ? 1
    : action.playerRefs.length;
  if (action.type === "select_players") {
    if (isRankedRosterSelectionAction(action)) {
      const excluded = bulkRosterSelectionExcludedText(action);
      const teamFollowup = action.teamCount
        ? translate("ai.impact.thenMakeTeams", { count: action.teamCount })
        : /then_generate/i.test(String(action.distribution || ""))
          ? translate("ai.impact.thenGenerateTeams")
          : "";
      if (excluded) return translate("ai.impact.selectRosterExcept", { count, excluded, teamFollowup });
      return translate("ai.impact.selectFromRoster", { count, teamFollowup });
    }
    if (/then_generate/i.test(String(action.distribution || "")) || action.teamCount) {
      const teamText = action.teamCount
        ? translate("ai.impact.teamCountText", { count: action.teamCount })
        : action.playersPerTeam
          ? translate("ai.impact.teamSizeText", { count: action.playersPerTeam })
          : translate("ai.impact.balancedTeams");
      return translate("ai.impact.selectThenGenerate", { count, teamText });
    }
    if (/replace|exact|only/i.test(String(action.distribution || ""))) {
      return translate("ai.impact.replaceSession", { count });
    }
    if (isUseExistingPlayerAction(action)) {
      return translate("ai.impact.useExistingPlayer");
    }
    return translate("ai.impact.addToSession", { count });
  }
  if (action.type === "unselect_players") {
    return translate("ai.impact.removeFromSession", { count });
  }
  if (action.type === "mark_players_late") {
    return translate("ai.impact.markLate", { count });
  }
  if (action.type === "add_new_player_suggestion") {
    return translate("ai.impact.addNewPlayer");
  }
  if (action.type === "set_team_size" && action.playersPerTeam) {
    return translate("ai.impact.setTeamSize", { count: action.playersPerTeam });
  }
  if (action.type === "set_team_count" && action.teamCount) {
    return translate("ai.impact.setTeamCount", { count: action.teamCount });
  }
  if (action.type === "generate_teams") {
    const isShuffle = actionRequestsShuffle(action);
    if (action.teamCount) return isShuffle
      ? translate("ai.impact.reshuffleTeamCount", { count: action.teamCount })
      : translate("ai.impact.generateTeamCount", { count: action.teamCount });
    if (action.playersPerTeam) return isShuffle
      ? translate("ai.impact.reshuffleTeamSize", { count: action.playersPerTeam })
      : translate("ai.impact.generateTeamSize", { count: action.playersPerTeam });
    return isShuffle ? translate("ai.impact.reshuffleTeams") : translate("ai.impact.generateTeams");
  }
  if (action.type === "club_add_note") {
    return translate("ai.impact.addClubNote");
  }
  if (action.type === "open_app_area") {
    return action.targetArea
      ? translate("ai.impact.openArea", { area: aiTargetAreaText(action.targetArea, translate) })
      : translate("ai.impact.openRequestedArea");
  }
  if (action.type === "unsupported_action") {
    return action.targetArea
      ? translate("ai.impact.manualPath", { area: aiTargetAreaText(action.targetArea, translate) })
      : translate("ai.impact.notWired");
  }
  return action.reason || translate("ai.impact.ready");
}

function secondaryActionDetails(action: AiSmartCommandAction) {
  const details: string[] = [];
  if (action.newPlayerName && action.type !== "add_new_player_suggestion") details.push(translate("ai.details.newPlayer", { name: action.newPlayerName }));
  if (action.suggestedSkill && action.type === "add_new_player_suggestion") details.push(translate("ai.details.startingSkill", { skill: action.suggestedSkill }));
  if (action.teamLabel) details.push(translate("ai.details.team", { team: action.teamLabel }));
  if (action.pairingKind) details.push(action.pairingKind.replace(/_/g, " "));
  if (action.role) details.push(translate("ai.details.role", { role: action.role.replace(/_/g, " ") }));
  if (action.noteText) details.push(translate("ai.details.note", { note: action.noteText }));
  if (action.colorName) details.push(translate("ai.details.color", { color: action.colorName }));
  return details.join(" · ");
}

function unresolvedTitle(result: AiSmartCommandResponse) {
  const hasUnknownPlayers = result.unresolved.some((item) => item.issue === "unknown_player" || item.issue === "ambiguous_player");
  if (hasUnknownPlayers) return translate("ai.unresolved.couldNotMatch");
  return translate("ai.unresolved.followUpNeeded");
}

type PersistedAiAssistantState = {
  commandText?: string;
  voiceTranscript?: string;
  error?: string;
  result?: AiSmartCommandResponse | null;
  applyMessage?: string;
  showTodayShortcut?: boolean;
  updatedAt?: number;
};

const AI_ASSISTANT_SESSION_PREFIX = "fairteams.aiAssistant.club.v1";

function safeStorageKey(rosterMode: string, rosterName?: string) {
  const cleanName = (rosterName || "current-roster")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "current-roster";
  return `${AI_ASSISTANT_SESSION_PREFIX}.${rosterMode}.${cleanName}`;
}

function readPersistedAiAssistantState(storageKey: string): PersistedAiAssistantState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAiAssistantState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedAiAssistantState(storageKey: string, state: PersistedAiAssistantState) {
  if (typeof window === "undefined") return;
  try {
    const hasSomethingToRemember = Boolean(
      state.commandText?.trim() ||
        state.voiceTranscript?.trim() ||
        state.error?.trim() ||
        state.result ||
        state.applyMessage?.trim(),
    );
    if (!hasSomethingToRemember) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // If session storage is unavailable or full, the assistant still works normally.
  }
}

function clearPersistedAiAssistantState(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage errors.
  }
}

export function AiSmartCommandPanel({
  players,
  rosterName,
  rosterMode = "local",
  activeTab,
  currentTeamCount = null,
  currentTeamsGenerated = false,
  onParsed,
  onApplyAction,
  onOpenToday,
  onQuestionSubmitted,
  tutorialActive = false,
  tutorialQuestion = translate("ai.panel.tutorial.question"),
}: AiSmartCommandPanelProps) {
  const { t, locale } = useStripesTranslation();
  const enabled = isAiSmartCommandEnabled();
  const storageKey = useMemo(() => safeStorageKey(rosterMode, rosterName), [rosterMode, rosterName]);
  const [commandText, setCommandText] = useState("");
  const [tutorialAnswerReady, setTutorialAnswerReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiSmartCommandResponse | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [showTodayShortcut, setShowTodayShortcut] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSelections, setReviewSelections] = useState<Record<string, string>>({});
  const [reviewNameEdits, setReviewNameEdits] = useState<Record<string, string>>({});
  const [helpExpanded, setHelpExpanded] = useState(Boolean(tutorialActive));

  const placeholder = t("ai.input.placeholder");

  useEffect(() => {
    if (!tutorialActive) {
      setTutorialAnswerReady(false);
      return;
    }
    setTutorialAnswerReady(false);
    setHelpExpanded(true);
    setCommandText((current) => current.trim() ? current : tutorialQuestion);
  }, [tutorialActive, tutorialQuestion]);

  useEffect(() => {
    if (!enabled) return;
    const saved = readPersistedAiAssistantState(storageKey);
    if (!saved) {
      setCommandText("");
      setVoiceTranscript("");
      setError("");
      setResult(null);
      setApplyMessage("");
      setShowTodayShortcut(false);
      return;
    }
    setCommandText(saved.commandText || "");
    setVoiceTranscript(saved.voiceTranscript || "");
    setError(saved.error || "");
    setResult(saved.result || null);
    setApplyMessage(saved.applyMessage || "");
    setShowTodayShortcut(Boolean(saved.showTodayShortcut));
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || busy || voiceBusy || recording) return;
    writePersistedAiAssistantState(storageKey, {
      commandText,
      voiceTranscript,
      error,
      result,
      applyMessage,
      showTodayShortcut,
    });
  }, [enabled, storageKey, commandText, voiceTranscript, error, result, applyMessage, showTodayShortcut, busy, voiceBusy, recording]);

  const hasAssistantContent = Boolean(commandText.trim() || result || applyMessage || error || voiceTranscript);
  const isHelpExpanded = tutorialActive || helpExpanded || Boolean(result || applyMessage || error || voiceTranscript);

  const aiReviewSourceText = voiceTranscript || commandText;
  const baseAiReviewItems = useMemo(() => buildAiReviewItems(result, players, aiReviewSourceText), [result, players, aiReviewSourceText]);
  const aiReviewItems = useMemo(() => applyAiReviewNameEdits(baseAiReviewItems, reviewNameEdits, players), [baseAiReviewItems, reviewNameEdits, players]);
  const hasAiReviewItems = aiReviewItems.length > 0;
  const aiReviewStats = useMemo(() => getAiReviewStats(aiReviewItems, reviewSelections), [aiReviewItems, reviewSelections]);
  const aiReviewSourceStats = useMemo(() => getAiReviewSourceStats(aiReviewItems), [aiReviewItems]);
  const selectedPlayerIdCounts = useMemo(() => getSelectedPlayerIdCounts(aiReviewItems, reviewSelections), [aiReviewItems, reviewSelections]);

  useEffect(() => {
    if (!baseAiReviewItems.length) {
      setReviewOpen(false);
      setReviewSelections({});
      setReviewNameEdits({});
      return;
    }
    setReviewNameEdits({});
    setReviewSelections(getAiReviewDefaultSelections(baseAiReviewItems));
  }, [baseAiReviewItems]);

  const clearAssistantSession = () => {
    clearPersistedAiAssistantState(storageKey);
    setCommandText("");
    setVoiceTranscript("");
    setError("");
    setResult(null);
    setApplyMessage("");
    setShowTodayShortcut(false);
    setReviewOpen(false);
    setReviewSelections({});
    setReviewNameEdits({});
    setHelpExpanded(Boolean(tutorialActive));
  };

  const updateReviewHeardName = (item: AiReviewItem, value: string) => {
    setReviewNameEdits((current) => ({ ...current, [item.key]: value }));
    const updated = rebuildAiReviewItemWithEditedName(item, value, players);
    const firstExisting = updated.options.find((option) => option.kind === "existing");
    setReviewSelections((current) => ({ ...current, [item.key]: firstExisting?.playerId || "new" }));
  };

  const applyReviewedAiNames = async () => {
    if (!result || !onApplyAction) return;
    const actions = buildActionsFromReviewSelections(result, aiReviewItems, reviewSelections, AI_CONVERSATION);
    if (actions.length === 0) {
      setError(t("ai.error.chooseReviewPlayer"));
      return;
    }

    setError("");
    let appliedAny = false;
    for (let index = 0; index < actions.length; index += 1) {
      const applied = await applyAction(actions[index], -1 - index);
      if (!applied) return;
      appliedAny = true;
    }
    if (appliedAny) {
      setReviewOpen(false);
      onOpenToday?.();
    }
  };

  if (!enabled) return null;

  const submitText = async (rawCommand: string) => {
    if (busy) return;
    const trimmedCommand = rawCommand.trim();
    if (!trimmedCommand) return;

    if (tutorialActive && /shared\s+rosters?/i.test(trimmedCommand)) {
      const tutorialAnswer = {
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "en",
        normalizedIntent: trimmedCommand.slice(0, 300),
        assistantSummary: AI_CONVERSATION("ai.panel.tutorial.answer"),
        confidence: 1,
        actions: [],
        confirmations: [],
        unresolved: [],
        parseMode: "local_tutorial_answer",
        debugWarnings: ["Answered the guided-tour question locally without an AI request."],
      } as any;
      setError("");
      setApplyMessage("");
      setShowTodayShortcut(false);
      setResult(tutorialAnswer);
      setTutorialAnswerReady(true);
      onParsed?.(tutorialAnswer);
      onQuestionSubmitted?.();
      return;
    }

    onQuestionSubmitted?.();
    setError("");
    setApplyMessage("");
    setShowTodayShortcut(false);
    setBusy(true);
    try {
      const commandContext = createAiSmartCommandContext({
        rosterName,
        rosterMode,
        activeTab,
        currentTeamCount: typeof currentTeamCount === "number" ? currentTeamCount : undefined,
        currentTeamsGenerated,
      });

      const directBasicHelp = buildActionBoardHelpAnswer(trimmedCommand, AI_CONVERSATION)
        || buildClubAttendanceHelpAnswer(trimmedCommand, AI_CONVERSATION)
        || buildBasicPlayerHelpAnswer(trimmedCommand, AI_CONVERSATION)
        || buildPlayerRatingHowToHelpAnswer(trimmedCommand, rosterMode, AI_CONVERSATION)
        || buildSharedRosterRatingHelpAnswer(trimmedCommand, rosterMode, AI_CONVERSATION)
        || buildLocalRosterStatFallbackAnswer(trimmedCommand, players, AI_CONVERSATION);
      if (directBasicHelp) {
        setResult(directBasicHelp);
        onParsed?.(directBasicHelp);
        return;
      }

      const directBulkRosterSelection = buildLocalBulkRosterSelectionAnswer(trimmedCommand, players, AI_CONVERSATION);
      if (directBulkRosterSelection) {
        setResult(directBulkRosterSelection);
        onParsed?.(directBulkRosterSelection);
        return;
      }

      try {
        // OpenAI/server route makes the first meaning decision. The local guard is
        // now only a fallback when the server cannot answer, so product questions
        // like "What is Cloud Backup?" cannot be hijacked by local action keywords.
        const parsedRaw = await parseFairTeamsSmartCommand({
          commandText: trimmedCommand,
          roster: players,
          context: commandContext,
        });
        const guardedRaw = isAiAnswerOnlyResult(parsedRaw)
          ? parsedRaw
          : applyFairTeamsAiTruthGuard(trimmedCommand, parsedRaw, AI_CONVERSATION_TRUST_GUARD);
        const parsed = enhanceAiResultWithOcrStyleRosterMatching(guardedRaw, players, AI_CONVERSATION);
        setResult(parsed);
        onParsed?.(parsed);
        return;
      } catch (aiErr) {
        const localTrustGuard = guardFairTeamsSmartCommandBeforeAi(
          trimmedCommand,
          commandContext,
          AI_CONVERSATION_TRUST_GUARD,
        );
        if (localTrustGuard) {
          const enhanced = enhanceAiResultWithOcrStyleRosterMatching(localTrustGuard, players, AI_CONVERSATION);
          setResult(enhanced);
          onParsed?.(enhanced);
          return;
        }

        const localSmartCommand = parseFairTeamsLocalSmartCommand(
          trimmedCommand,
          players,
          commandContext,
          AI_CONVERSATION,
        );
        if (localSmartCommand) {
          const enhancedLocal = enhanceAiResultWithOcrStyleRosterMatching({
            ...localSmartCommand,
            debugWarnings: [
              ...((localSmartCommand as any).debugWarnings || []),
              `AI planner unavailable; used local fallback: ${aiErr instanceof Error ? aiErr.message : String(aiErr || "unknown error")}`,
            ],
          }, players, AI_CONVERSATION);
          setResult(enhancedLocal);
          onParsed?.(enhancedLocal);
          return;
        }
        throw aiErr;
      }
    } catch (err) {
      const ratingHowToHelp = buildPlayerRatingHowToHelpAnswer(trimmedCommand, rosterMode, AI_CONVERSATION);
      if (ratingHowToHelp) {
        setResult(ratingHowToHelp);
        onParsed?.(ratingHowToHelp);
      } else {
        const sharedRatingHelp = buildSharedRosterRatingHelpAnswer(trimmedCommand, rosterMode, AI_CONVERSATION);
        if (sharedRatingHelp) {
          setResult(sharedRatingHelp);
          onParsed?.(sharedRatingHelp);
        } else {
          const localStatAnswer = buildLocalRosterStatFallbackAnswer(trimmedCommand, players, AI_CONVERSATION);
          if (localStatAnswer) {
            setResult(localStatAnswer);
            onParsed?.(localStatAnswer);
          } else if (/Stripes AI command failed|AI command failed/i.test(aiErrorMessage(err)) && /\b(rate|rating|ratings|skill|ovr)\b/i.test(trimmedCommand)) {
            const safeRatingHelp = buildPlayerRatingHowToHelpAnswer("How do I rate a player?", rosterMode, AI_CONVERSATION);
            if (safeRatingHelp) {
              setResult({
                ...safeRatingHelp,
                normalizedIntent: trimmedCommand.slice(0, 300),
                debugWarnings: ["Used safe rating help instead of showing a generic AI failure."],
              });
              onParsed?.(safeRatingHelp);
            } else {
              setError(t("ai.error.ratingHelpFallback"));
            }
          } else {
            setError(friendlyAiError(err));
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    await submitText(commandText);
  };

  const stopVoiceTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (busy || voiceBusy || recording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(t("ai.error.voiceUnavailable"));
      return;
    }

    setError("");
    setApplyMessage("");
    setShowTodayShortcut(false);
    setVoiceTranscript("");
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError(t("ai.error.voiceFailed"));
        setRecording(false);
        stopVoiceTracks();
      };
      recorder.onstop = async () => {
        setRecording(false);
        setVoiceBusy(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          stopVoiceTracks();
          const { transcript } = await transcribeFairTeamsVoiceCommand(audioBlob);
          setVoiceTranscript(transcript);
          setCommandText(transcript);
          await submitText(transcript);
        } catch (err) {
          setError(friendlyAiError(err));
        } finally {
          setVoiceBusy(false);
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
        }
      };
      recorder.start();
      setRecording(true);
    } catch (err) {
      stopVoiceTracks();
      setRecording(false);
      setError(err instanceof Error && /permission|denied/i.test(err.message)
        ? t("ai.error.microphonePermission")
        : t("ai.error.voiceStart"));
    }
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      stopVoiceTracks();
      return;
    }
    recorder.stop();
  };

  const applyAction = async (action: AiSmartCommandAction, index: number) => {
    if (!onApplyAction || !aiCommandActionCanApply(action)) return false;
    const key = `${action.type}-${index}`;
    setApplyingKey(key);
    setError("");
    setApplyMessage("");
    setShowTodayShortcut(false);
    try {
      const message = await onApplyAction(action);
        setApplyMessage(typeof message === "string" && message.trim() ? message : t("ai.status.applied"));
      if (action.type === "select_players" || action.type === "unselect_players" || action.type === "mark_players_late" || action.type === "add_new_player_suggestion") {
        setShowTodayShortcut(true);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ai.error.applyAction"));
      return false;
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <section className="stripes-type-ui overflow-hidden rounded-[1.7rem] border border-slate-200 bg-[#f7f8fa] p-3 shadow-sm ring-1 ring-slate-100 lg:p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 lg:h-10 lg:w-10">
              <CircleHelp className="h-[18px] w-[18px] lg:h-6 lg:w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[17px] font-black leading-tight text-[#102A43] lg:text-[22px]">{t("ai.header.title")}</h3>
                <span className="hidden rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-slate-500 shadow-sm ring-1 ring-slate-200 lg:inline-flex">{t("ai.header.version")}</span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500 lg:text-[13px]">
                {t("ai.header.description")}
              </p>
            </div>
          </div>
          {hasAssistantContent && (
            <button
              type="button"
              onClick={clearAssistantSession}
              className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 active:scale-[0.98]"
            >
              {t("ai.actions.clear")}
            </button>
          )}
        </div>

        <div className="mt-3">
          <textarea
            id="fairteams-help-question"
            value={commandText}
            onChange={(event) => setCommandText(event.target.value)}
            onFocus={() => setHelpExpanded(true)}
            rows={isHelpExpanded ? 3 : 2}
            className={`w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold lg:text-[16px] text-[#102A43] outline-none focus:border-slate-400 ${isHelpExpanded ? "min-h-[84px] lg:min-h-[104px]" : "min-h-[58px] lg:min-h-[64px]"} ${tutorialActive ? "fairteams-tutorial-pulse" : ""}`}
            placeholder={placeholder}
          />
          <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,4.5rem),1fr))] gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || voiceBusy || !commandText.trim()}
              className={`h-10 rounded-2xl bg-[#102A43] px-3 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-45 lg:h-11 lg:px-4 lg:text-[13px] ${tutorialActive ? "fairteams-tutorial-pulse" : ""}`}
            >
              {busy ? t("ai.status.thinking") : t("ai.actions.ask")}
            </button>
            <button
              type="button"
              onClick={recording ? stopVoiceRecording : startVoiceRecording}
              disabled={busy || voiceBusy}
              className={`h-10 rounded-2xl px-3 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-45 lg:h-11 lg:px-4 lg:text-[13px] ${recording ? "bg-rose-600" : "bg-slate-600"}`}
            >
              {voiceBusy ? t("ai.status.hearing") : recording ? t("common.done") : t("ai.actions.voice")}
            </button>
          </div>
        </div>
      </div>
      {recording && (
        <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
          {t("ai.voice.listeningHelp")}
        </div>
      )}
      {voiceTranscript && !recording && (
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
          {t("ai.voice.heard", { transcript: voiceTranscript })}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}
      {applyMessage && (
        <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          <div>{applyMessage}</div>
          {showTodayShortcut && onOpenToday && (
            <button
              type="button"
              onClick={onOpenToday}
              className="mt-2 rounded-full bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white"
            >
              {t("ai.actions.viewSession")}
            </button>
          )}
        </div>
      )}

      {result && (
        <div
          id="fairteams-help-answer"
          className={`mt-3 rounded-2xl bg-white p-3 text-xs text-[#102A43] shadow-sm lg:p-4 lg:text-sm ${tutorialAnswerReady ? "fairteams-tutorial-pulse ring-2 ring-violet-300" : ""}`}
        >
          {tutorialAnswerReady && (
            <div className="mb-2 inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">
              {t("ai.status.answerReady")}
            </div>
          )}
          <div className="rounded-2xl bg-violet-50 px-3 py-2 text-sm font-bold leading-snug text-[#102A43] lg:px-4 lg:py-3 lg:text-[15px] lg:leading-relaxed">
            {result.assistantSummary || t("ai.status.listening")}
          </div>
          {(result.actions.length > 0 || result.confirmations.length > 0 || result.unresolved.length > 0) && (
            <div
              className="mt-2 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400"
              title={`${result.detectedLanguage} · ${formatPercent(locale, result.confidence, { maximumFractionDigits: 0 })} · ${parseModeLabel(result.parseMode)}`}
            >
              <span>{t("ai.review.beforeApplying")}</span>
              <span className="normal-case tracking-normal text-slate-300">{parseModeLabel(result.parseMode)}</span>
            </div>
          )}
          {hasAiReviewItems && (
            <div className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2.5 font-bold text-amber-900 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] leading-tight">{t("ai.review.title")}</div>
                  <div className="mt-1 text-[11px] font-semibold leading-snug opacity-80">
                    {t("ai.review.summary", aiReviewStats)}
                  </div>
                  {aiReviewSourceStats.transcript > aiReviewSourceStats.ai && (
                    <div className="mt-1 text-[10px] font-bold leading-snug opacity-70">
                      {t("ai.review.transcriptComparison", aiReviewSourceStats)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white"
                >
                  {t("ai.review.open")}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {aiReviewItems.slice(0, 10).map((item) => {
                  const selected = reviewSelections[item.key];
                  const option = item.options.find((candidate) => candidate.playerId === selected);
                  return (
                    <span key={item.key} className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-black leading-none shadow-sm">
                      {option?.rosterName && compactNameForCompare(option.rosterName) !== compactNameForCompare(item.heardName)
                        ? `${item.heardName} → ${option.rosterName}`
                        : option?.rosterName || item.heardName}
                    </span>
                  );
                })}
                {aiReviewItems.length > 10 && (
                  <span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-black leading-none shadow-sm">{t("ai.review.more", { count: aiReviewItems.length - 10 })}</span>
                )}
              </div>
            </div>
          )}
          {result.actions.filter((action) => !(hasAiReviewItems && shouldHideActionBecauseReviewHandlesIt(action))).length > 0 && (
            <div className="mt-2 grid gap-2">
              {result.actions.filter((action) => !(hasAiReviewItems && shouldHideActionBecauseReviewHandlesIt(action))).map((action, index) => {
              const canApply = Boolean(onApplyAction && aiCommandActionCanApply(action));
              const key = `${action.type}-${index}`;
              const playerLabels = actionPlayerSummary(action);
              const secondaryDetails = secondaryActionDetails(action);
              return (
                <div key={key} className={`rounded-2xl border px-3 py-2.5 font-bold shadow-sm ${actionCardTone(action)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] leading-tight">{actionCardTitle(action)}</div>
                      <div className="mt-1 text-[11px] font-semibold leading-snug opacity-80">
                        {actionImpactLine(action)}
                      </div>
                    </div>
                    {canApply && (
                      <button
                        type="button"
                        className="shrink-0 rounded-full bg-violet-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
                        disabled={applyingKey === key}
                        onClick={() => applyAction(action, index)}
                      >
                        {applyingKey === key ? t("ai.status.applying") : actionPrimaryVerb(action)}
                      </button>
                    )}
                  </div>
                  {playerLabels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {playerLabels.slice(0, 12).map((label, labelIndex) => (
                        <span key={`${key}-player-${labelIndex}`} className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black leading-none shadow-sm">
                          {label}
                        </span>
                      ))}
                      {playerLabels.length > 12 && (
                        <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black leading-none shadow-sm">
                          {t("ai.review.more", { count: playerLabels.length - 12 })}
                        </span>
                      )}
                    </div>
                  )}
                  {secondaryDetails && (
                    <div className="mt-1.5 text-[11px] font-semibold leading-snug opacity-75">
                      {secondaryDetails}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10px] font-black uppercase tracking-wide opacity-60">
                    {aiCommandSupportLabel(action)}
                  </div>
                  {action.reason && action.reason !== actionImpactLine(action) && (
                    <div className="mt-1 text-[10px] font-semibold leading-snug opacity-55">
                      {action.reason}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
          {result.confirmations.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-600">{t("ai.review.checkBeforeChoosing")}</div>
              {result.confirmations.map((confirmation) => (
                <div key={confirmation.id} className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800">
                  {confirmation.message}
                </div>
              ))}
            </div>
          )}
          {result.unresolved.filter((item) => !(hasAiReviewItems && (item.issue === "unknown_player" || item.issue === "ambiguous_player"))).length > 0 && (
            <div className="mt-3 grid gap-1.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{unresolvedTitle(result)}</div>
              {result.unresolved.filter((item) => !(hasAiReviewItems && (item.issue === "unknown_player" || item.issue === "ambiguous_player"))).map((item, index) => (
                <div key={`${item.issue}-${index}`} className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-slate-700">
                  {item.message || item.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reviewOpen && result && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/35 px-3 py-6">
          <div className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-violet-500">{t("ai.review.assistantName")}</div>
              <div className="mt-0.5 text-lg font-black text-[#102A43]">{t("ai.review.title")}</div>
              <div className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                {t("ai.review.summary", aiReviewStats)}
              </div>
              {aiReviewSourceStats.transcript > aiReviewSourceStats.ai && (
                <div className="mt-1 text-[10px] font-bold leading-snug text-amber-600">
                  {t("ai.review.addedTranscriptNames")}
                </div>
              )}
              {aiReviewStats.duplicateSelected > 0 && (
                <div className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                  {t("ai.review.duplicateSelections", { count: aiReviewStats.duplicateSelected })}
                </div>
              )}
            </div>
            <div className="max-h-[58vh] overflow-y-auto px-4 py-3">
              <div className="grid gap-2">
                {aiReviewItems.map((item, itemIndex) => (
                  <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-slate-500 shadow-sm">{itemIndex + 1}</span>
                          <span>{t("ai.review.heardCorrect")}</span>
                        </div>
                        <input
                          type="text"
                          value={reviewNameEdits[item.key] ?? item.heardName}
                          onChange={(event) => updateReviewHeardName(item, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-black text-[#102A43] outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                          placeholder={t("ai.review.correctNamePlaceholder")}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setReviewSelections((current) => ({ ...current, [item.key]: "skip" }))}
                        className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 shadow-sm"
                      >
                        {t("ai.review.skip")}
                      </button>
                    </div>
                    {(() => {
                      const selected = reviewSelections[item.key];
                      const duplicate = Boolean(selected && selected !== "new" && selected !== "skip" && (selectedPlayerIdCounts.get(selected) || 0) > 1);
                      return duplicate ? (
                        <div className="mt-2 rounded-xl bg-amber-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                          {t("ai.review.duplicateMatch")}
                        </div>
                      ) : null;
                    })()}
                    <div className="mt-2 text-[10px] font-bold leading-snug text-slate-400">
                      {t("ai.review.editNameHelp")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.options.map((option) => {
                        const value = option.kind === "existing" ? option.playerId! : option.kind;
                        const selected = reviewSelections[item.key] === value;
                        const disabled = false;
                        return (
                          <button
                            key={`${item.key}-${value}`}
                            type="button"
                            disabled={disabled}
                            onClick={() => setReviewSelections((current) => ({ ...current, [item.key]: value }))}
                            className={`rounded-full px-2.5 py-1.5 text-[10px] font-black leading-none shadow-sm disabled:opacity-45 ${selected ? "bg-violet-600 text-white" : "bg-white text-slate-700"}`}
                            title={option.kind === "new" ? t("ai.impact.addNewPlayer") : undefined}
                          >
                            {reviewOptionLabel(option)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1.3fr] gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="h-11 rounded-2xl bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-600"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={applyReviewedAiNames}
                disabled={!onApplyAction || applyingKey === "select_players--1"}
                className="h-11 rounded-2xl bg-[#102A43] text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
              >
                {applyingKey === "select_players--1" ? t("ai.status.applying") : t("ai.review.applyPlayers", { count: aiReviewStats.selected })}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
