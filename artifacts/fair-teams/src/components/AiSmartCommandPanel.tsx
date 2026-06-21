import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseFairTeamsSmartCommand, createAiSmartCommandContext, transcribeFairTeamsVoiceCommand } from "@/lib/aiSmartCommandClient";
import { applyFairTeamsAiTruthGuard, guardFairTeamsSmartCommandBeforeAi } from "@/lib/aiSmartCommandTrustGuard";
import { parseFairTeamsLocalSmartCommand } from "@/lib/aiSmartCommandLocalRouter";
import { bestPlayerNameMatch, candidateNamesForRosterPlayer, normalizePlayerNameForMatch, scorePlayerNameMatch } from "@/lib/playerNameMatching";
import {
  isAiSmartCommandEnabled,
  type AiSmartCommandAction,
  type AiSmartCommandResponse,
  type AiSmartCommandRosterPlayer,
} from "@/lib/aiSmartCommandTypes";
import {
  aiCommandActionCanApply,
  aiCommandSupportLabel,
  getAiCommandCapability,
} from "@/lib/aiSmartCommandCapabilities";

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
};


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

function friendlyAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/json|structured|parse|schema/i.test(message)) {
    return "Fair Teams understood part of this, but the AI answer was not clean enough. Try again or use a shorter command.";
  }
  if (/disabled|branch|configured|key/i.test(message)) return message;
  if (/openai|request failed|502|network|fetch/i.test(message)) {
    return "Fair Teams AI could not connect cleanly. Try again in a moment.";
  }
  if (/fair teams ai command failed|ai command failed/i.test(message)) {
    return "I could not answer that cleanly, but I can still help with basic Fair Teams questions. Try asking: “How do I add a player?” or “How do I edit a player?”";
  }
  return message || "I could not answer that cleanly. Try asking again in a shorter way.";
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
): AiSmartCommandResponse | null {
  if (!looksLikePlayerRatingHowToHelpRequest(commandText)) return null;

  const assistantSummary = rosterMode === "shared"
    ? "To rate a player in a shared roster, open the shared roster’s Club area and use the player rating/review section. Your rating is private: other organizers should not see your individual score. Fair Teams combines submitted ratings into the Club average for shared team generation. If you do not know a player yet, you can skip them and rate them later."
    : "To rate a player in a local roster, open the Roster tab, tap the player card, then edit their rating/player details. Local roster ratings are your own private ratings and are used directly when Fair Teams generates balanced teams. In a local roster, you can use the normal player profile; shared/Club ratings only appear after you create, join, or open a shared roster.";

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
): AiSmartCommandResponse | null {
  if (!looksLikeSharedRosterRatingHelpRequest(commandText)) return null;

  const assistantSummary = rosterMode === "shared"
    ? "You are already in a shared roster. To rate players for this shared roster, open the Club area and use the rating/review section there. Your rating is private: other organizers should not see your individual score, and Fair Teams uses the Club average for shared team generation."
    : "You are on a local/private roster right now, so shared roster ratings are not available here. Local rosters use your own normal ratings directly. To rate for a shared roster, first create or open a shared roster from the Club/shared roster area, then use the shared rating flow there. Your original local roster stays private.";

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

function looksLikeBasicPlayerHelpQuestion(commandText: string) {
  const text = String(commandText || "").trim();
  if (!text) return null;
  const isHowTo = /\?|\b(how\s+do\s+i|how\s+to|where\s+do\s+i|where\s+is|show\s+me\s+how|help\s+me)\b/i.test(text);
  if (!isHowTo) return null;
  if (/\b(add|create|new)\b.*\b(player|players)\b/i.test(text) || /\b(player|players)\b.*\b(add|create|new)\b/i.test(text)) return "add_player";
  if (/\b(edit|change|update|rename)\b.*\b(player|players|player card|details)\b/i.test(text) || /\b(player|players|player card|details)\b.*\b(edit|change|update|rename)\b/i.test(text)) return "edit_player";
  return null;
}

function buildBasicPlayerHelpAnswer(commandText: string): AiSmartCommandResponse | null {
  const topic = looksLikeBasicPlayerHelpQuestion(commandText);
  if (!topic) return null;

  const assistantSummary = topic === "add_player"
    ? "To add a player, go to the Roster tab and tap Add Player. Add the player’s name first, then you can fill in rating/details if you want. After adding them, they become part of this roster and can be selected in Today for team generation."
    : "To edit a player, go to the Roster tab and tap that player’s card. From there you can update their name, AKA/aliases, rating/details, visible traits, notes/category, and local photo if your roster uses those fields. Local roster edits stay private on your device; shared rosters only sync shared-safe player info.";

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
  const fieldLabel = hasSpecificField ? request.field : "OVR/skill";
  const names = shown
    .map((row, index) => `${index + 1}. ${row.player.name || "Player"} (${fieldLabel} ${Number((row as any)[valueKey])})`)
    .join("\n");
  const prefix = hasSpecificField
    ? `Based on the visible ${request.field} values I can see, here are the ${request.direction} players:`
    : `I cannot see a separate ${request.field} value for this roster here, so I will answer from the visible OVR/skill instead:`;

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
  return Boolean(
    action?.type === "select_players" &&
      /(ranked_roster_selection|bulk_all_except|bulk_all_roster)/i.test(String(action.distribution || "") + " " + String(action.reason || "")),
  );
}

function bulkRosterSelectionExcludedText(action: AiSmartCommandAction) {
  const reason = String(action.reason || "");
  const match = reason.match(/excluding (.+?)\.?$/i);
  return match?.[1]?.trim() || "";
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
    || /\b(all|everyone|everybody|entire|whole)\b.{0,35}\b(roster|players|player list|team list)\b/i.test(text)
    || /\b(roster|player list|team list)\b.{0,35}\b(all|everyone|everybody|entire|whole)\b/i.test(text);
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
  const match = String(commandText || "").match(/\b(?:except|excluding|without|but\s+not|other\s+than|minus)\s+(.+?)(?:\b(?:and\s+then|then|make|generate|split|divide|with|from|on\s+my\s+roster)\b|$)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,;\n]+|\s+and\s+|\s+und\s+|\s+그리고\s+|\s*랑\s*|\s*와\s*|\s*과\s*/i)
    .map((part) => part
      .replace(/^(?:the\s+)?(?:player|person)\s+/i, "")
      .replace(/^(?:except|excluding|without|but\s+not|not|minus)\s+/i, "")
      .replace(/\b(?:please|thanks|then|make|generate|teams?|players?|roster)\b/gi, " ")
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
  candidateLabel?: string,
): AiSmartCommandAction {
  const excludedIds = new Set(excludedPlayers.map((player) => player.id).filter(Boolean));
  const selectedRefs = players
    .filter((player) => player?.id && !excludedIds.has(player.id))
    .map((player) => localBulkPlayerRef(player));
  const excludedNames = excludedPlayers.map((player) => player.name).filter(Boolean).join(", ");
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
    targetName: null,
    targetArea: null,
    capabilityId: "today.select_players",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: excludedPlayers.length > 0
      ? `Select ${selectedRefs.length} of ${players.length} roster players, excluding ${candidateLabel || excludedNames}.`
      : `Select every player in the current roster (${players.length} players).`,
  };
}

function buildLocalBulkRosterSelectionAnswer(commandText: string, players: AiSmartCommandRosterPlayer[]): AiSmartCommandResponse | null {
  if (!looksLikeLocalBulkRosterCommand(commandText) || !Array.isArray(players) || players.length === 0) return null;
  const excludedNames = localBulkExcludedNames(commandText);

  if (excludedNames.length === 0) {
    const action = makeLocalBulkSelectAction(players, [], commandText);
    return {
      schemaVersion: 1,
      ok: true,
      detectedLanguage: "unknown",
      normalizedIntent: commandText.slice(0, 300),
      assistantSummary: localBulkShouldGenerate(commandText)
        ? `I’ll select all ${players.length} roster players locally, then set up the requested teams.`
        : `I’ll select all ${players.length} roster players locally.`,
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
      const action = makeLocalBulkSelectAction(players, [matches[0]], commandText, matches[0].name || heardName);
      return {
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: commandText.slice(0, 300),
        assistantSummary: `I heard “${heardName}” as the player to leave out. I found ${matches[0].name}. Tap below and I’ll select everyone else locally — no long name review.`,
        confidence: 0.92,
        actions: [action],
        confirmations: [],
        unresolved: [],
        parseMode: "local_fallback" as any,
        debugWarnings: ["Handled all-except roster command locally before OpenAI."],
      } as any;
    }
    if (matches.length > 1) {
      const actions = matches.map((player) => makeLocalBulkSelectAction(players, [player], commandText, player.name || heardName));
      return {
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: commandText.slice(0, 300),
        assistantSummary: `I heard “${heardName}” as the player to leave out. Choose the right player below; then I’ll select everyone else locally.`,
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
      assistantSummary: `I heard “${heardName}” as the player to leave out, but I couldn’t match that to this roster. I didn’t change anything.`,
      confidence: 0.7,
      actions: [],
      confirmations: [],
      unresolved: [{ text: heardName, issue: "unknown_player", message: `Choose which roster player to leave out for “${heardName}”.` }],
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
      assistantSummary: `I understood this as a select-all-except command, but I need clearer matches for: ${unresolved.join(", ")}. I didn’t change anything.`,
      confidence: 0.72,
      actions: [],
      confirmations: [],
      unresolved: unresolved.map((name) => ({ text: name, issue: "unknown_player", message: `Choose which roster player to leave out for “${name}”.` })),
      parseMode: "local_fallback" as any,
      debugWarnings: ["All-except roster command stopped locally because one or more excluded players were unclear."],
    } as any;
  }

  const uniqueResolved = resolved.filter((player, index, rows) => player?.id && rows.findIndex((row) => row.id === player.id) === index);
  const action = makeLocalBulkSelectAction(players, uniqueResolved, commandText);
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "unknown",
    normalizedIntent: commandText.slice(0, 300),
    assistantSummary: `I’ll select everyone except ${uniqueResolved.map((player) => player.name).join(", ")} locally — no long name review.`,
    confidence: 0.9,
    actions: [action],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback" as any,
    debugWarnings: ["Handled multi-exclusion roster command locally before OpenAI."],
  } as any;
}

function parseModeLabel(mode?: AiSmartCommandResponse["parseMode"]) {
  if (mode === "local_fallback") return "Local reply / safety fallback";
  if (mode === "ai_with_local_hints") return "AI + app rules";
  if (mode === "ai") return "AI parser";
  return "AI beta";
}

function actionCardTitle(action: AiSmartCommandAction) {
  if (action.type === "select_players") {
    if (isRankedRosterSelectionAction(action)) {
      const excluded = bulkRosterSelectionExcludedText(action);
      return excluded ? `Leave out ${excluded}` : "Use roster selection";
    }
    if (/possible existing match/i.test(String(action.reason || ""))) return "Use existing player";
    if (/then_generate/i.test(String(action.distribution || "")) || action.teamCount) return "Replace Today + generate";
    if (/replace|exact|only/i.test(String(action.distribution || ""))) return "Replace Today selection";
    return "Add to Today";
  }
  if (action.type === "unselect_players") return "Remove from Today";
  if (action.type === "mark_players_late") return "Mark late";
  if (action.type === "add_new_player_suggestion") return "Add new player";
  if (action.type === "open_app_area") return action.targetArea ? `Open ${action.targetArea}` : "Open app area";
  if (action.type === "generate_teams" && /shuffle|different|mix|fresh|reroll/i.test(String(action.distribution || "") + " " + String(action.reason || ""))) return "Shuffle teams";
  const capability = getAiCommandCapability(action);
  if (capability?.label) return capability.label;
  if (action.type === "no_action") return "No app action needed";
  if (action.type === "unsupported_action") return action.targetName || "Not available yet";
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
  if (action.type === "club_add_note") return "Add note";
  if (action.type === "add_new_player_suggestion") return "Add player";
  if (action.type === "select_players") {
    if (isRankedRosterSelectionAction(action)) return "Use players";
    if (/then_generate/i.test(String(action.distribution || "")) || action.teamCount) return "Replace + Generate";
    return /replace|exact|only/i.test(String(action.distribution || "")) ? "Replace Today" : "Add to Today";
  }
  if (action.type === "unselect_players") return "Remove";
  if (action.type === "mark_players_late") return "Mark late";
  if (action.type === "open_app_area") return "Open";
  if (action.type === "set_team_size" || action.type === "set_team_count") return "Set";
  if (action.type === "generate_teams") return /shuffle|different|mix|fresh|reroll/i.test(String(action.distribution || "") + " " + String(action.reason || "")) ? "Shuffle" : "Generate";
  return "Apply";
}

const AI_ASSISTANT_VERSION_LABEL = "AI beta · v1.28 fast bulk select";

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
    distribution: "add_today_selection",
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: "today.select_players",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: `Possible existing match from the roster matcher: “${cleanAiSpokenName(spokenName) || spokenName}” → ${match.player.name}.`,
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
): AiSmartCommandResponse {
  if (!players.length || !response?.actions) return response;

  const resolvedNames = new Set<string>();
  const extraActions: AiSmartCommandAction[] = [];
  const repairedActions = response.actions.flatMap((action): AiSmartCommandAction[] => {
    if (action.type === "add_new_player_suggestion" && action.newPlayerName) {
      const matches = rankedOcrStyleRosterMatches(action.newPlayerName, players, 5);
      if (matches.length > 0) {
        resolvedNames.add(aiNameKey(action.newPlayerName));
        return matches.map((match) => makeExistingPlayerActionFromAiName(action.newPlayerName!, match, action));
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
    matches.forEach((match) => extraActions.push(makeExistingPlayerActionFromAiName(item.text, match)));
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
    assistantSummary: `${response.assistantSummary} I also checked close roster-name matches and kept close alternatives when names were ambiguous.`,
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
  if (option.kind === "skip") return "Skip";
  if (option.kind === "new") return `Add “${option.heardName}”`;
  const scoreText = typeof option.score === "number" ? ` · ${Math.round(option.score)}%` : "";
  return `${option.rosterName || "Player"}${scoreText}`;
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

function makeReviewAddNewPlayerAction(item: AiReviewItem): AiSmartCommandAction | null {
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
    reason: `Reviewed AI name as a new roster player: “${newPlayerName}”.`,
  };
}

function makeReviewGenerateTeamsAction(teamAction?: AiSmartCommandAction | null): AiSmartCommandAction {
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
    reason: "Generate teams after applying reviewed AI names.",
  };
}

function buildActionsFromReviewSelections(
  result: AiSmartCommandResponse,
  items: AiReviewItem[],
  selections: Record<string, string>,
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
      reason: "Reviewed AI names, then replace Today with confirmed existing players.",
    });
  }

  const seenNewNames = new Set<string>();
  for (const item of items) {
    if (selections[item.key] !== "new") continue;
    const newKey = aiNameKey(item.heardName);
    if (!newKey || seenNewNames.has(newKey)) continue;
    seenNewNames.add(newKey);
    const addAction = makeReviewAddNewPlayerAction(item);
    if (addAction) actions.push(addAction);
  }

  if (shouldGenerate && actions.length > 0) {
    actions.push(makeReviewGenerateTeamsAction(teamAction));
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
  const rosterName = ref.rosterName || ref.spokenName || "Player";
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
  const playerWord = count === 1 ? "player" : "players";

  if (action.type === "select_players") {
    if (isRankedRosterSelectionAction(action)) {
      const excluded = bulkRosterSelectionExcludedText(action);
      const teamFollowup = action.teamCount
        ? ` Then make ${action.teamCount} team${action.teamCount === 1 ? "" : "s"}.`
        : /then_generate/i.test(String(action.distribution || ""))
          ? " Then generate teams."
          : "";
      if (excluded) return `Will clear Today and select ${count} roster players, leaving out ${excluded}.${teamFollowup}`;
      return `Will clear Today and select ${count} ${playerWord} from the roster.${teamFollowup}`;
    }
    if (/then_generate/i.test(String(action.distribution || "")) || action.teamCount) {
      const teamText = action.teamCount
        ? `${action.teamCount} team${action.teamCount === 1 ? "" : "s"}`
        : action.playersPerTeam
          ? `${action.playersPerTeam}v${action.playersPerTeam} teams`
          : "fair teams";
      return `Will clear Today, select ${count} ${playerWord}, then generate ${teamText}.`;
    }
    if (/replace|exact|only/i.test(String(action.distribution || ""))) {
      return `Will clear Today and select ${count} ${playerWord}.`;
    }
    if (/possible existing match/i.test(String(action.reason || ""))) {
      return `Will use this existing roster player and mark them present Today.`;
    }
    return `Will add/select ${count} ${playerWord} for Today without clearing anyone else.`;
  }
  if (action.type === "unselect_players") {
    return `Will remove ${count} ${playerWord} from Today without changing anyone else.`;
  }
  if (action.type === "mark_players_late") {
    return `Will mark ${count} ${playerWord} as late in Today and keep them selected.`;
  }
  if (action.type === "add_new_player_suggestion") {
    return `Will add this as a new roster player and mark them present Today.`;
  }
  if (action.type === "set_team_size" && action.playersPerTeam) {
    return `Will set team size to ${action.playersPerTeam}v${action.playersPerTeam}.`;
  }
  if (action.type === "set_team_count" && action.teamCount) {
    return `Will set up ${action.teamCount} teams.`;
  }
  if (action.type === "generate_teams") {
    const isShuffle = /shuffle|different|mix|fresh|reroll/i.test(String(action.distribution || "") + " " + String(action.reason || ""));
    if (action.teamCount) return isShuffle
      ? `Will reshuffle ${action.teamCount} team${action.teamCount === 1 ? "" : "s"} from the current Today selection.`
      : `Will generate ${action.teamCount} fair team${action.teamCount === 1 ? "" : "s"} from the current Today selection.`;
    if (action.playersPerTeam) return isShuffle
      ? `Will reshuffle ${action.playersPerTeam}v${action.playersPerTeam} teams from the current Today selection.`
      : `Will generate ${action.playersPerTeam}v${action.playersPerTeam} teams from the current Today selection.`;
    return isShuffle ? "Will reshuffle teams from the current Today selection." : "Will generate fair teams from the current Today selection.";
  }
  if (action.type === "club_add_note") {
    return "Will add this as a Club note.";
  }
  if (action.type === "open_app_area") {
    return action.targetArea ? `Will open ${action.targetArea}.` : "Will open the requested Fair Teams area.";
  }
  if (action.type === "unsupported_action") {
    return action.targetArea ? `Manual path: ${action.targetArea}` : "I understood this, but it is not wired as an app action yet.";
  }
  return action.reason || "Ready to apply.";
}

function secondaryActionDetails(action: AiSmartCommandAction) {
  const details: string[] = [];
  if (action.newPlayerName && action.type !== "add_new_player_suggestion") details.push(`new player: ${action.newPlayerName}`);
  if (action.suggestedSkill && action.type === "add_new_player_suggestion") details.push(`starting skill ${action.suggestedSkill}`);
  if (action.teamLabel) details.push(`team: ${action.teamLabel}`);
  if (action.pairingKind) details.push(action.pairingKind.replace(/_/g, " "));
  if (action.role) details.push(`role: ${action.role.replace(/_/g, " ")}`);
  if (action.noteText) details.push(`note: “${action.noteText}”`);
  if (action.colorName) details.push(`color: ${action.colorName}`);
  return details.join(" · ");
}

function unresolvedTitle(result: AiSmartCommandResponse) {
  const hasUnknownPlayers = result.unresolved.some((item) => item.issue === "unknown_player" || item.issue === "ambiguous_player");
  if (hasUnknownPlayers) return "Could not match";
  return "Follow-up needed";
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
}: AiSmartCommandPanelProps) {
  const enabled = isAiSmartCommandEnabled();
  const storageKey = useMemo(() => safeStorageKey(rosterMode, rosterName), [rosterMode, rosterName]);
  const [commandText, setCommandText] = useState("");
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

  const placeholder = useMemo(() => {
    return "Talk to Fair Teams… try: hey there · how does this work? · George red · make 5v5 teams";
  }, []);

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
  };

  const updateReviewHeardName = (item: AiReviewItem, value: string) => {
    setReviewNameEdits((current) => ({ ...current, [item.key]: value }));
    const updated = rebuildAiReviewItemWithEditedName(item, value, players);
    const firstExisting = updated.options.find((option) => option.kind === "existing");
    setReviewSelections((current) => ({ ...current, [item.key]: firstExisting?.playerId || "new" }));
  };

  const applyReviewedAiNames = async () => {
    if (!result || !onApplyAction) return;
    const actions = buildActionsFromReviewSelections(result, aiReviewItems, reviewSelections);
    if (actions.length === 0) {
      setError("Choose at least one roster player or add a new player before applying.");
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

      const directBasicHelp = buildBasicPlayerHelpAnswer(trimmedCommand)
        || buildPlayerRatingHowToHelpAnswer(trimmedCommand, rosterMode)
        || buildSharedRosterRatingHelpAnswer(trimmedCommand, rosterMode)
        || buildLocalRosterStatFallbackAnswer(trimmedCommand, players);
      if (directBasicHelp) {
        setResult(directBasicHelp);
        onParsed?.(directBasicHelp);
        return;
      }

      const directBulkRosterSelection = buildLocalBulkRosterSelectionAnswer(trimmedCommand, players);
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
          : applyFairTeamsAiTruthGuard(trimmedCommand, parsedRaw);
        const parsed = enhanceAiResultWithOcrStyleRosterMatching(guardedRaw, players);
        setResult(parsed);
        onParsed?.(parsed);
        return;
      } catch (aiErr) {
        const localTrustGuard = guardFairTeamsSmartCommandBeforeAi(trimmedCommand, commandContext);
        if (localTrustGuard) {
          const enhanced = enhanceAiResultWithOcrStyleRosterMatching(localTrustGuard, players);
          setResult(enhanced);
          onParsed?.(enhanced);
          return;
        }

        const localSmartCommand = parseFairTeamsLocalSmartCommand(trimmedCommand, players, commandContext);
        if (localSmartCommand) {
          const enhancedLocal = enhanceAiResultWithOcrStyleRosterMatching({
            ...localSmartCommand,
            debugWarnings: [
              ...((localSmartCommand as any).debugWarnings || []),
              `AI planner unavailable; used local fallback: ${aiErr instanceof Error ? aiErr.message : String(aiErr || "unknown error")}`,
            ],
          }, players);
          setResult(enhancedLocal);
          onParsed?.(enhancedLocal);
          return;
        }
        throw aiErr;
      }
    } catch (err) {
      const ratingHowToHelp = buildPlayerRatingHowToHelpAnswer(trimmedCommand, rosterMode);
      if (ratingHowToHelp) {
        setResult(ratingHowToHelp);
        onParsed?.(ratingHowToHelp);
      } else {
        const sharedRatingHelp = buildSharedRosterRatingHelpAnswer(trimmedCommand, rosterMode);
        if (sharedRatingHelp) {
          setResult(sharedRatingHelp);
          onParsed?.(sharedRatingHelp);
        } else {
          const localStatAnswer = buildLocalRosterStatFallbackAnswer(trimmedCommand, players);
          if (localStatAnswer) {
            setResult(localStatAnswer);
            onParsed?.(localStatAnswer);
          } else if (/Fair Teams AI command failed|AI command failed/i.test(friendlyAiError(err)) && /\b(rate|rating|ratings|skill|ovr)\b/i.test(trimmedCommand)) {
            const safeRatingHelp = buildPlayerRatingHowToHelpAnswer("How do I rate a player?", rosterMode);
            if (safeRatingHelp) {
              setResult({
                ...safeRatingHelp,
                normalizedIntent: trimmedCommand.slice(0, 300),
                debugWarnings: ["Used safe rating help instead of showing a generic AI failure."],
              });
              onParsed?.(safeRatingHelp);
            } else {
              setError("I can explain ratings, but I could not handle that exact wording. In a local roster, open Roster, tap a player card, and edit the player rating/details there.");
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
      setError("Voice recording is not available in this browser yet.");
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
        setError("Voice recording failed. Try again in a moment.");
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
      setError(err instanceof Error && /permission|denied/i.test(err.message) ? "Microphone permission was blocked. Allow microphone access and try again." : "Could not start voice recording.");
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
      setApplyMessage(typeof message === "string" && message.trim() ? message : "Applied.");
      if (action.type === "select_players" || action.type === "unselect_players" || action.type === "mark_players_late" || action.type === "add_new_player_suggestion") {
        setShowTodayShortcut(true);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply this action yet.");
      return false;
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <section className="rounded-3xl border border-violet-100 bg-violet-50/70 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-violet-600">Experimental</div>
          <h3 className="mt-0.5 text-base font-black text-[#102A43]">Fair Teams Assistant</h3>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-violet-800/75">
            Talk naturally. I can explain Fair Teams, then show safe action cards when something can be done.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-700 shadow-sm">{AI_ASSISTANT_VERSION_LABEL}</span>
          {(commandText.trim() || result || applyMessage || error || voiceTranscript) && (
            <button
              type="button"
              onClick={clearAssistantSession}
              className="rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide text-violet-600 active:scale-[0.98]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <textarea
        value={commandText}
        onChange={(event) => setCommandText(event.target.value)}
        rows={4}
        className="mt-3 w-full resize-none rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-semibold text-[#102A43] outline-none focus:border-violet-300"
        placeholder={placeholder}
      />

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || voiceBusy || !commandText.trim()}
          className="h-10 rounded-2xl bg-[#102A43] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
        >
          {busy ? "Thinking…" : "Send"}
        </button>
        <button
          type="button"
          onClick={recording ? stopVoiceRecording : startVoiceRecording}
          disabled={busy || voiceBusy}
          className={`h-10 rounded-2xl px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45 ${recording ? "bg-rose-600" : "bg-violet-600"}`}
        >
          {voiceBusy ? "Hearing…" : recording ? "Done" : "Voice"}
        </button>
      </div>
      {recording && (
        <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
          Listening… tap Done when you finish speaking.
        </div>
      )}
      {voiceTranscript && !recording && (
        <div className="mt-2 rounded-2xl border border-violet-100 bg-white px-3 py-2 text-[11px] font-semibold text-violet-800">
          I heard: “{voiceTranscript}”
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
              View Today
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-2xl bg-white p-3 text-xs text-[#102A43] shadow-sm">
          <div className="rounded-2xl bg-violet-50 px-3 py-2 text-sm font-bold leading-snug text-[#102A43]">
            {result.assistantSummary || "I’m listening."}
          </div>
          {(result.actions.length > 0 || result.confirmations.length > 0 || result.unresolved.length > 0) && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400" title={`${result.detectedLanguage} · ${Math.round(result.confidence * 100)}% · ${parseModeLabel(result.parseMode)}`}>
              <span>Review before applying</span>
              <span className="normal-case tracking-normal text-slate-300">{parseModeLabel(result.parseMode)}</span>
            </div>
          )}
          {hasAiReviewItems && (
            <div className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2.5 font-bold text-amber-900 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] leading-tight">Review AI names</div>
                  <div className="mt-1 text-[11px] font-semibold leading-snug opacity-80">
                    {aiReviewStats.heard} names heard · {aiReviewStats.selected} selected · {aiReviewStats.needsReview} need your check
                  </div>
                  {aiReviewSourceStats.transcript > aiReviewSourceStats.ai && (
                    <div className="mt-1 text-[10px] font-bold leading-snug opacity-70">
                      Checking transcript order: {aiReviewSourceStats.transcript} possible names · AI returned {aiReviewSourceStats.ai}.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white"
                >
                  Review
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
                  <span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-black leading-none shadow-sm">+{aiReviewItems.length - 10} more</span>
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
                        {applyingKey === key ? "Applying…" : actionPrimaryVerb(action)}
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
                          +{playerLabels.length - 12} more
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
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-600">Check before choosing</div>
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
              <div className="text-[10px] font-black uppercase tracking-wide text-violet-500">Fair Teams Assistant</div>
              <div className="mt-0.5 text-lg font-black text-[#102A43]">Review AI names</div>
              <div className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                {aiReviewStats.heard} names heard · {aiReviewStats.selected} selected · {aiReviewStats.needsReview} need your check
              </div>
              {aiReviewSourceStats.transcript > aiReviewSourceStats.ai && (
                <div className="mt-1 text-[10px] font-bold leading-snug text-amber-600">
                  I added possible missed transcript names in the original spoken order.
                </div>
              )}
              {aiReviewStats.duplicateSelected > 0 && (
                <div className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                  {aiReviewStats.duplicateSelected} duplicate selection{aiReviewStats.duplicateSelected === 1 ? "" : "s"} found. Duplicates will only be applied once.
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
                          <span>Heard · tap to correct</span>
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
                          placeholder="Correct heard name"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setReviewSelections((current) => ({ ...current, [item.key]: "skip" }))}
                        className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 shadow-sm"
                      >
                        Skip
                      </button>
                    </div>
                    {(() => {
                      const selected = reviewSelections[item.key];
                      const duplicate = Boolean(selected && selected !== "new" && selected !== "skip" && (selectedPlayerIdCounts.get(selected) || 0) > 1);
                      return duplicate ? (
                        <div className="mt-2 rounded-xl bg-amber-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                          Duplicate match — this player will only be selected once
                        </div>
                      ) : null;
                    })()}
                    <div className="mt-2 text-[10px] font-bold leading-snug text-slate-400">
                      Edit the heard name to refresh roster suggestions.
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
                            title={option.kind === "new" ? "Add this as a new roster player and mark them present Today." : undefined}
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
                Cancel
              </button>
              <button
                type="button"
                onClick={applyReviewedAiNames}
                disabled={!onApplyAction || applyingKey === "select_players--1"}
                className="h-11 rounded-2xl bg-[#102A43] text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
              >
                {applyingKey === "select_players--1" ? "Applying…" : `Apply ${aiReviewStats.selected} player${aiReviewStats.selected === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
