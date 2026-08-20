import {
  bestPlayerNameMatch,
  candidateNamesForRosterPlayer,
  compactPlayerNameKey,
  displayNameFromSpokenInput,
} from "./playerNameMatching.ts";
import type {
  AiSmartCommandAction,
  AiSmartCommandContext,
  AiSmartCommandResponse,
  AiSmartCommandRosterPlayer,
} from "./aiSmartCommandTypes";
import {
  canonicalAiSmartCommandConversationPresenter,
  type AiSmartCommandConversationPresenter,
} from "../i18n/aiSmartCommandConversation.ts";
import { aiTargetAreaText } from "../i18n/aiSmartCommandPresentation.ts";
import { USE_EXISTING_PLAYER_DISTRIBUTION } from "./aiSmartCommandActionSemantics.ts";

function formatLocalUnitList(
  values: readonly string[],
  conversation: AiSmartCommandConversationPresenter,
) {
  return conversation.formatList(values, { type: "unit" });
}

function createEmptyAction(type: AiSmartCommandAction["type"]): AiSmartCommandAction {
  return {
    type,
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
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: null,
  };
}

function localResponse(partial: Omit<AiSmartCommandResponse, "schemaVersion" | "ok" | "detectedLanguage" | "confidence" | "parseMode"> & {
  confidence?: number;
  detectedLanguage?: string;
}): AiSmartCommandResponse {
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: partial.detectedLanguage || "en",
    confidence: partial.confidence ?? 0.96,
    parseMode: "local_fallback",
    ...partial,
  };
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\bversus\b|\bagainst\b|\bgegen\b/g, " v ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAliasValues(value?: string) {
  return String(value || "")
    .split(/[,/;|·•]+|\baka\b|\bnickname\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function compactKey(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function words(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function candidateNamesForPlayer(player: AiSmartCommandRosterPlayer) {
  const rawNames = [player.name, ...splitAliasValues(player.aka)].filter(Boolean);
  const names = new Set<string>();

  rawNames.forEach((rawName) => {
    const cleaned = normalizeText(rawName);
    if (!cleaned) return;
    names.add(cleaned);

    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      names.add(`${parts[0]} ${parts[parts.length - 1][0]}`);
      names.add(`${parts[0]} ${parts[parts.length - 1]}`);
    }
    if (parts[0] && parts[0].length >= 3) names.add(parts[0]);
  });

  return [...names].filter((name) => name.length >= 2);
}

function hasWordPhrase(haystack: string, phrase: string) {
  if (!haystack || !phrase) return false;
  return new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(haystack);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

function voiceNameKey(value: string) {
  let key = compactKey(value);
  if (!key) return "";

  // Android/Samsung voice transcription often writes names phonetically in English.
  // This stays roster-relative: it only helps when a spoken chunk is close to a real roster name.
  key = key
    .replace(/george/g, "jorj")
    .replace(/jorge/g, "jorj")
    .replace(/brijesh/g, "briesh")
    .replace(/brijes/g, "briesh")
    .replace(/brioche/g, "briesh")
    .replace(/brioch/g, "briesh")
    .replace(/briesh/g, "briesh")
    .replace(/ph/g, "f")
    .replace(/ije/g, "ie")
    .replace(/ij/g, "i")
    .replace(/y/g, "i")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/ue/g, "u")
    .replace(/^geor/g, "jor")
    .replace(/^geo/g, "jo")
    .replace(/z/g, "s")
    .replace(/sh$/g, "s")
    .replace(/e$/g, "");

  // Joon/June and similar vowel noise. Keep one vowel, not the exact spelling.
  return key.replace(/[aeiou]+/g, (match) => match[0]);
}

function likelySameSpokenName(spoken: string, candidate: string) {
  const a = voiceNameKey(spoken);
  const b = voiceNameKey(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && a[0] === b[0]) {
    const distance = levenshtein(a, b);
    const similarity = 1 - distance / Math.max(a.length, b.length);
    return similarity >= 0.84;
  }
  return false;
}

function fuzzyNameMatchScore(spoken: string, candidate: string) {
  const a = compactKey(spoken);
  const b = compactKey(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const spokenKey = voiceNameKey(spoken);
  const candidateKey = voiceNameKey(candidate);
  if (spokenKey && candidateKey && spokenKey === candidateKey) return 0.96;

  if (likelySameSpokenName(spoken, candidate)) return 0.9;

  if (a.length >= 4 && b.length >= 4) {
    const distance = levenshtein(a, b);
    const maxLength = Math.max(a.length, b.length);
    const similarity = 1 - distance / maxLength;
    if (similarity >= 0.86) return similarity;
    if (similarity >= 0.82 && a.slice(0, 2) === b.slice(0, 2) && Math.min(a.length, b.length) >= 5) return similarity;
  }
  return 0;
}

function displaySpokenName(spokenName: string) {
  return displayNameFromSpokenInput(spokenName);
}

function createAddPlayerAction(
  name: string,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandAction {
  const action = createEmptyAction("add_new_player_suggestion");
  action.capabilityId = "roster.add_new_player";
  action.supportStatus = "executable";
  action.newPlayerName = displaySpokenName(name);
  action.suggestedSkill = 5;
  action.reason = translate("ai.local.reason.addMissingPlayer");
  return action;
}

function createUseExistingPlayerAction(
  player: AiSmartCommandRosterPlayer,
  spokenName: string,
  translate: AiSmartCommandConversationPresenter,
  reason?: string,
): AiSmartCommandAction {
  const action = createEmptyAction("select_players");
  action.capabilityId = "today.select_players";
  action.distribution = USE_EXISTING_PLAYER_DISTRIBUTION;
  action.playerRefs = [{
    playerId: player.id,
    rosterName: player.name,
    spokenName: displaySpokenName(spokenName),
    confidence: 0.9,
  }];
  action.reason = reason || translate("ai.local.reason.possibleExistingMatch", {
    spokenName: displaySpokenName(spokenName),
    playerName: player.name,
  });
  return action;
}

function cleanupSpellingHints(value: string) {
  let text = normalizeText(value);

  // Voice users often clarify spelling: “Fillip with F”, “Philip spelled with F”.
  // Keep the name, remove the hint words, and only lightly adjust common first-letter hints.
  text = text.replace(/\b(philip|phillip|filip|fillip)\s+(?:spelled\s+)?with\s+(?:an?\s+)?f\b/g, (match, name) => {
    if (String(name).startsWith("ph")) return "filip";
    return String(name);
  });
  text = text.replace(/\b(filip|fillip|philip|phillip)\s+(?:spelled\s+)?with\s+(?:a\s+)?ph\b/g, "philip");
  text = text.replace(/\b([a-z][a-z-]{1,})\s+(?:spelled\s+)?with\s+(?:an?\s+)?[a-z]\b/g, "$1");
  text = text.replace(/\b(?:spelled|written)\s+(?:with\s+)?(?:an?\s+)?[a-z]\b/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function stripCommandNoise(value: string) {
  return cleanupSpellingHints(value)
    .replace(/\b(okay|ok|yes|yeah|yep|please|pls|uh|um|erm|hey|fair teams?)\b/g, " ")
    .replace(/\b(current|today|the)\s+(?:today\s+)?tab\b/g, " ")
    .replace(/\b(?:from|in|on|to)\s+(?:the\s+)?(?:current\s+)?today(?:\s+tab)?\b/g, " ")
    .replace(/\b(?:who\s+else|and\s+who\s+else|who\s+is\s+else)\b/g, " ")
    .replace(/\b(?:as|like|for)\s+(?:a\s+)?new\s+(?:player|person|name|roster\s+player)\b/g, " ")
    .replace(/\b(?:new\s+player|new\s+person|new\s+name|roster\s+player)\b/g, " ")
    .replace(/\b(that s it|thats it|that is it|that s all|thats all|that is all|and that s it|and thats it|and that is it)\b.*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNameChunkForMatching(value: string) {
  let text = stripCommandNoise(value);
  text = text
    .replace(/\b(players?|people|members|present|currently|playing|here|but|except|though|although|fair|balanced|teams?|make|create|generate|prepare|build|sort|of|a|the|from|now|are|is|was|were|be|select|choose|add|also|plus|too|forgot|late|remove|unselect|deselect|take|out|not|coming|cannot|can t|cancel|absent|play|playing|with|who|else|we|i|have|has|got|heard|said|mentioned|these|those|this|that)\b/g, " ")
    .replace(/\b(v|vs|versus)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(new|player|players|today|tab|current|okay|ok|yes|yeah|and|or|but|except|though|although|with|from|to|the|a|an)$/i.test(text)) return "";
  if (/^\d+$/.test(text)) return "";
  return text;
}

function splitPotentialNameList(value: string) {
  const cleaned = stripCommandNoise(value)
    .replace(/\b(?:and also|as well as|together with)\b/g, " and ")
    .replace(/\+/g, " and ");

  return cleaned
    .split(/,|\band\b|\bplus\b|&/i)
    .map(cleanNameChunkForMatching)
    .filter((part) => part.length >= 2);
}

function wantsExplicitNewPlayer(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(add|create|make|suggest)\b.*\bnew\s+(player|person|name|roster\s+player)\b/.test(normalized) ||
    /\b(?:as|like|for)\s+(?:a\s+)?new\s+(?:player|person|name|roster\s+player)\b/.test(normalized) ||
    /\bnot\s+(?:in|on)\s+(?:the\s+)?roster\b/.test(normalized);
}

function bestRosterNameMatch(name: string, players: AiSmartCommandRosterPlayer[]) {
  const externalBest = bestPlayerNameMatch(name, players, { includeDisplayName: true });
  let best: { player: AiSmartCommandRosterPlayer; candidate: string; score: number } | null = externalBest
    ? { player: externalBest.player, candidate: externalBest.candidate, score: externalBest.score / 100 }
    : null;
  let secondBestScore = externalBest ? externalBest.secondBestScore / 100 : 0;

  // The shared playerNameMatching helper is intentionally conservative. For voice
  // commands we also need roster-relative phonetic recovery: June -> Joon,
  // Yan -> Jan, Anya -> Tanja, Briesh -> Brijesh. This does not add a player by
  // itself; it only chooses an existing roster player when the match is clearly
  // stronger than alternatives.
  players.forEach((player) => {
    candidateNamesForRosterPlayer(player, { includeDisplayName: true }).forEach((candidate) => {
      const score = fuzzyNameMatchScore(name, candidate);
      if (score <= 0) return;
      if (!best || score > best.score) {
        if (!best || best.player.id !== player.id) secondBestScore = best?.score ?? secondBestScore;
        best = { player, candidate, score };
      } else if (best.player.id !== player.id && score > secondBestScore) {
        secondBestScore = score;
      }
    });
  });

  if (!best) return null;
  return {
    player: best.player,
    candidate: best.candidate,
    score: best.score,
    secondBestScore,
  };
}

function possibleRosterNameMatch(name: string, players: AiSmartCommandRosterPlayer[]) {
  const best = bestRosterNameMatch(name, players);
  if (!best) return null;
  // This is intentionally lower than the automatch threshold. It is for a safe
  // “maybe you meant…” action card, not silent selection. This prevents voice
  // slips like “Anya” or “Rish” from immediately becoming new-player suggestions.
  if (best.score >= 0.72 && best.score - best.secondBestScore >= 0.03) return best;
  return null;
}

function extractExplicitNewPlayerNames(commandText: string) {
  let text = cleanupSpellingHints(commandText);
  text = text
    .replace(/^\s*(okay|ok|yes|yeah|please|pls|hey)\s+/g, "")
    .replace(/\b(?:can you|could you|please|pls|i want to|i need to|let s|lets)\b/g, " ")
    .replace(/\b(?:add|create|make|suggest|put|mark|select)\b/g, " ")
    .replace(/\b(?:to|into|in|on)\s+(?:the\s+)?(?:roster|player\s+list)\b/g, " ")
    .replace(/\b(?:to|for)\s+(?:the\s+)?(?:current\s+)?today(?:\s+tab)?\b/g, " ")
    .replace(/\b(?:who\s+else|and\s+who\s+else|who\s+is\s+else)\b/g, " ")
    .replace(/\b(?:as|like|for)\s+(?:a\s+)?new\s+(?:player|person|name|roster\s+player)\b/g, " ")
    .replace(/\b(?:new\s+player|new\s+person|new\s+name|roster\s+player)\b/g, " ")
    .replace(/\b(?:and\s+)?(?:mark|select)\s+(?:him|her|them|those|these)?\s*(?:as\s+)?(?:present|here|playing)\b/g, " ")
    .replace(/\b(?:today|current tab|today tab|current today tab)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [...new Set(splitPotentialNameList(text).map(displaySpokenName).filter(Boolean))].slice(0, 6);
}

function parseExplicitNewPlayerCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  if (!wantsExplicitNewPlayer(commandText)) return null;

  const names = extractExplicitNewPlayerNames(commandText);
  if (names.length === 0) return localResponse({
    normalizedIntent: "Add new player, but no clean name found",
    assistantSummary: translate("ai.local.newPlayer.missingNameSummary"),
    confidence: 0.78,
    actions: [],
    confirmations: [],
    unresolved: [{
      text: commandText,
      issue: "missing_context",
      message: translate("ai.local.newPlayer.missingNameMessage"),
    }],
    debugWarnings: ["Explicit new-player intent detected, but no clean name survived command-word cleanup."],
  });

  const actions: AiSmartCommandAction[] = [];
  const confirmations: AiSmartCommandResponse["confirmations"] = [];
  const unresolved: AiSmartCommandResponse["unresolved"] = [];
  const possibleMatches: string[] = [];

  names.forEach((name) => {
    const addAction = createAddPlayerAction(name, translate);
    addAction.reason = translate("ai.local.reason.addNamedPlayer", { name });
    actions.push(addAction);

    const similar = bestRosterNameMatch(name, players);
    if (similar && similar.score >= 0.84) {
      const exactSame = compactPlayerNameKey(similar.player.name) === compactPlayerNameKey(name) || candidateNamesForRosterPlayer(similar.player, { includeDisplayName: true }).some((candidate) => compactPlayerNameKey(candidate) === compactPlayerNameKey(name));
      if (exactSame) {
        actions.push(createUseExistingPlayerAction(
          similar.player,
          name,
          translate,
          translate("ai.local.reason.existingPlayerDuplicate", { playerName: similar.player.name }),
        ));
        possibleMatches.push(translate("ai.local.newPlayer.possibleMatch.existing", {
          name,
          playerName: similar.player.name,
        }));
      } else if (similar.score - similar.secondBestScore >= 0.03) {
        actions.push(createUseExistingPlayerAction(similar.player, name, translate));
        confirmations.push({
          id: `similar-${compactKey(name)}-${similar.player.id}`,
          type: "ambiguous_player",
          message: translate("ai.local.newPlayer.similarPlayerMessage", { name, playerName: similar.player.name }),
          playerRefs: [{
            playerId: similar.player.id,
            rosterName: similar.player.name,
            spokenName: name,
            confidence: similar.score,
          }],
          suggestedActionType: "select_players",
        });
        possibleMatches.push(translate("ai.local.newPlayer.possibleMatch.similar", {
          name,
          playerName: similar.player.name,
        }));
      }
    }
  });

  const matchText = possibleMatches.length > 0
    ? translate("ai.local.newPlayer.possibleMatches", {
      count: possibleMatches.length,
      matches: formatLocalUnitList(possibleMatches, translate),
    })
    : "";

  return localResponse({
    normalizedIntent: "Add explicit new player",
    assistantSummary: translate("ai.local.newPlayer.summary", {
      names: formatLocalUnitList(names, translate),
      matchText,
    }),
    confidence: 0.95,
    actions,
    confirmations,
    unresolved,
    debugWarnings: ["Handled by explicit new-player parser before normal fuzzy roster matching."],
  });
}

function extractMaybeListSegment(commandText: string) {
  const normalized = normalizeText(commandText);
  const markers = [
    "currently present players",
    "present players",
    "players currently present",
    "players present",
    "players playing today",
    "playing today",
    "today we have",
    "today i have",
    "we have",
    "we got",
    "we ve got",
    "who is here",
    "who are here",
    "who are playing",
    "today are",
    "here are",
    "with players",
    "with the players",
    "make a team with",
    "make teams with",
    "make fair teams with",
    "make balanced teams with",
    "create a team with",
    "create teams with",
    "generate a team with",
    "generate teams with",
    "prepare a team with",
    "prepare teams with",
    "build a team with",
    "build teams with",
    "team with",
    "teams with",
  ];

  let bestIndex = -1;
  let bestMarker = "";
  markers.forEach((marker) => {
    const index = normalized.indexOf(marker);
    if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
      bestIndex = index;
      bestMarker = marker;
    }
  });

  if (bestIndex < 0) return normalized;
  let segment = normalized.slice(bestIndex + bestMarker.length).trim();

  // In mixed commands like “Session we have Joon, Jorge… can you make teams?”,
  // only the attendance list should be sent to name matching. Otherwise the
  // team request can be misread as fake player names.
  const stopPhrases = [
    "can you make",
    "could you make",
    "please make",
    "make a team",
    "make teams",
    "make fair",
    "create a team",
    "create teams",
    "generate a team",
    "generate teams",
    "prepare teams",
    "build teams",
    "split into teams",
  ];
  let stopIndex = -1;
  stopPhrases.forEach((phrase) => {
    const index = segment.indexOf(phrase);
    if (index >= 0 && (stopIndex < 0 || index < stopIndex)) stopIndex = index;
  });
  if (stopIndex >= 0) segment = segment.slice(0, stopIndex).trim();

  segment = stripCommandNoise(segment)
    .replace(/^\b(are|is|as|include|including|players|player|people|members|today|now|currently|present|playing|here|with|have|got)\b\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return segment || stripCommandNoise(normalized) || normalized;
}

function likelyPresentPlayerCommand(commandText: string) {
  const normalized = normalizeText(commandText);
  const hasRosterListLanguage = /\b(present|currently present|playing today|here|today|selected|select|choose|add|also|remove|unselect|deselect|not coming|out|absent|late)\b/.test(normalized);
  const hasTeamMakingLanguage = /\b(make|create|generate|prepare|build|sort|fair|team|teams|5v5|4v4|3v3|2v2)\b/.test(normalized);
  const hasListSignal = /,|\band\b|\bplus\b|&/.test(commandText);
  const hasSinglePersonCorrectionLanguage = /\b(add|also|plus|forgot|late|remove|unselect|deselect|not coming|isn t coming|is not coming|not playing|not here|out today)\b/.test(normalized);
  const hasPlainVoiceAttendancePhrase = /\b(are here|are playing|are coming|playing today|coming today|today we have|we have|we got|they are here)\b/.test(normalized);
  const hasTeamWithNameList = hasTeamMakingLanguage && hasListSignal && /\bwith\b/.test(normalized);
  return (hasRosterListLanguage && (hasListSignal || hasTeamMakingLanguage || hasPlainVoiceAttendancePhrase)) || hasTeamWithNameList || hasSinglePersonCorrectionLanguage;
}

function wantsRemoveFromToday(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(remove|unselect|deselect|take out|not coming|isn t coming|is not coming|can t come|cannot come|cancel|absent|out today|not playing|not here)\b/.test(normalized);
}

function wantsReplaceToday(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(only|exactly|replace|clear|reset|start over|instead|use these|these are all|that is everyone|thats everyone|everyone is)\b/.test(normalized);
}

function wantsAddToToday(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(add|also|plus|too|as well|forgot|late|just arrived|is here|are here|came|coming|joined)\b/.test(normalized);
}

function wantsLateTodayStatus(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(late|later|coming late|arriving late|will be late|is late|are late|comes later|come later|arrives later)\b/.test(normalized);
}

function extractLateNameSegment(commandText: string) {
  const normalized = normalizeText(commandText);
  if (!wantsLateTodayStatus(normalized)) return "";

  const lateBefore = normalized.match(/\b(?:late|later)\s+(?:is|are|player|person|for)?\s*([a-z][a-z\s'-]{1,80})$/);
  if (lateBefore?.[1]) return stripCommandNoise(lateBefore[1]);

  const lateAfter = normalized.match(/([a-z][a-z\s,'-]{1,120})\s+(?:is|are|will be|will|comes?|come|arrives?|arrive|arriving|coming)?\s*(?:a bit\s+)?(?:late|later)\b/);
  if (!lateAfter?.[1]) return "";

  const beforeLate = stripCommandNoise(lateAfter[1])
    .replace(/.*\b(?:but|except|although|though|and)\b\s+/g, " ")
    .replace(/\b(?:everyone|everybody|all)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = splitPotentialNameList(beforeLate);
  return candidates[candidates.length - 1] || beforeLate;
}

function createMarkLateAction(
  playerRefs: AiSmartCommandAction["playerRefs"],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandAction {
  const action = createEmptyAction("mark_players_late");
  action.capabilityId = "today.mark_late";
  action.supportStatus = "executable";
  action.distribution = "mark_late_today";
  action.playerRefs = playerRefs;
  action.reason = translate("ai.local.reason.markLate");
  return action;
}

function wantsExactTodayList(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(?:today\s+(?:we\s+)?have|today\s+(?:i\s+)?have|we\s+have|we\s+got|we\s+ve\s+got|here\s+today|these\s+(?:people|players)|with\s+these\s+(?:people|players)|the\s+(?:people|players)\s+(?:i\s+)?mentioned|this\s+group)\b/.test(normalized);
}

function shouldPreferAttendanceListBeforeTeams(commandText: string) {
  const normalized = normalizeText(commandText);
  const hasTeamRequest = /\b(make|create|generate|prepare|build|split|divide|fair|balanced|team|teams)\b/.test(normalized);
  return hasTeamRequest && wantsExactTodayList(commandText);
}

function currentTodaySelectionCount(players: AiSmartCommandRosterPlayer[]) {
  return players.filter((player) => Boolean(player.attending)).length;
}

function findPlayersMentioned(commandText: string, players: AiSmartCommandRosterPlayer[]) {
  const segment = extractMaybeListSegment(commandText);
  const normalizedSegment = stripCommandNoise(segment);
  const matched = new Map<string, { player: AiSmartCommandRosterPlayer; spokenName: string; score: number }>();

  const candidateRows = players.flatMap((player) =>
    candidateNamesForRosterPlayer(player, { includeDisplayName: true }).map((candidate) => ({ player, candidate })),
  ).sort((a, b) => b.candidate.length - a.candidate.length);

  candidateRows.forEach(({ player, candidate }) => {
    if (!hasWordPhrase(normalizedSegment, candidate)) return;
    const existing = matched.get(player.id);
    if (!existing || candidate.length > existing.spokenName.length) {
      matched.set(player.id, { player, spokenName: candidate, score: 1 });
    }
  });

  const chunks = splitPotentialNameList(segment);

  const unresolved: string[] = [];
  chunks.forEach((originalChunk) => {
    let chunk = originalChunk;
    [...matched.values()].forEach((item) => {
      candidateNamesForRosterPlayer(item.player, { includeDisplayName: true }).forEach((candidate) => {
        chunk = chunk.replace(new RegExp(`(?:^|\\s)${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "g"), " ");
      });
    });
    chunk = chunk.replace(/\s+/g, " ").trim();
    if (!chunk) return;
    if ([...matched.values()].some((item) => fuzzyNameMatchScore(chunk, item.spokenName) >= 0.92)) return;

    const best = bestRosterNameMatch(chunk, players);

    const looseWords = !/\b(v|vs|versus)\b|^\d+$/.test(chunk)
      ? chunk.split(/\s+/).map(cleanNameChunkForMatching).filter((part) => part.length >= 2)
      : [];
    const shouldAlsoTryLooseWords = looseWords.length >= 2 && (!best || best.score < 0.99);

    let matchedLooseWord = false;
    const canUseFullChunk = looseWords.length <= 1;

    if (!canUseFullChunk || !best || best.score < 0.99 || shouldAlsoTryLooseWords) {
      // Voice transcripts sometimes arrive without commas after normalization:
      // “Yan June Anya Briesh”. Try each word first so a long merged phrase never
      // becomes “yan june anya briesh -> Brijesh”.
      looseWords.forEach((looseWord) => {
        const looseBest = bestRosterNameMatch(looseWord, players);

        if (looseBest && looseBest.score >= 0.84 && looseBest.score - looseBest.secondBestScore >= 0.04) {
          const existing = matched.get(looseBest.player.id);
          if (!existing || looseBest.score > existing.score || existing.spokenName.split(/\s+/).length > 1) {
            matched.set(looseBest.player.id, { player: looseBest.player, spokenName: looseWord, score: looseBest.score });
          }
          matchedLooseWord = true;
        } else if (looseWord.length >= 2 && !/^\d+$/.test(looseWord)) {
          unresolved.push(looseWord);
        }
      });
    }

    if (best && best.score >= 0.84 && best.score - best.secondBestScore >= 0.04 && (!matchedLooseWord || canUseFullChunk)) {
      const existing = matched.get(best.player.id);
      if (!existing || best.score > existing.score) {
        matched.set(best.player.id, { player: best.player, spokenName: chunk, score: best.score });
      }
    }

    if (!matchedLooseWord && looseWords.length === 0 && (!best || best.score < 0.84)) unresolved.push(chunk);
  });

  const orderedMatched = [...matched.values()].sort((a, b) => {
    const ai = normalizedSegment.indexOf(normalizeText(a.spokenName));
    const bi = normalizedSegment.indexOf(normalizeText(b.spokenName));
    if (ai !== bi) return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
    return a.player.name.localeCompare(b.player.name);
  });

  return { matched: orderedMatched, unresolved: [...new Set(unresolved)] };
}

function parseOpenAreaCommand(
  commandText: string,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const normalized = normalizeText(commandText);
  if (!/\b(open|show|go to|switch to|take me to|bring me to)\b/.test(normalized)) return null;
  let targetArea: string | null = null;
  if (/\b(roster|players?|player list)\b/.test(normalized)) targetArea = "Roster";
  else if (/\b(today|attendance|who is here|present players)\b/.test(normalized)) targetArea = "Session";
  else if (/\b(teams?|team results|generated teams)\b/.test(normalized)) targetArea = "Teams";
  else if (/\b(club|organizers?|notes?|equipment|gear)\b/.test(normalized)) targetArea = "Club";
  if (!targetArea) return null;

  const action = createEmptyAction("open_app_area");
  action.capabilityId = "navigation.open_area";
  action.supportStatus = "executable";
  action.targetArea = targetArea;
  const targetAreaText = aiTargetAreaText(targetArea, translate);
  action.reason = translate("ai.local.reason.openArea", { area: targetAreaText });
  return localResponse({
    normalizedIntent: translate("ai.local.navigation.intent", { area: targetAreaText }),
    assistantSummary: translate("ai.local.navigation.openSummary", { area: targetAreaText }),
    confidence: 0.97,
    actions: [action],
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Handled by local navigation parser."],
  });
}

function wantsSelectAllRosterPlayers(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(select|choose|mark|add|use)\b.*\b(all|everyone|everybody|entire roster|whole roster|all players)\b/.test(normalized) ||
    /\b(all|everyone|everybody)\b.*\b(playing|here|today|selected|available)\b/.test(normalized) ||
    /\b(entire|whole)\s+(?:current\s+)?roster\b/.test(normalized);
}

function parseSelectAllRosterCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  if (!wantsSelectAllRosterPlayers(commandText)) return null;
  const rosterPlayers = players.filter((player) => player.id && player.name);
  if (rosterPlayers.length === 0) return null;

  const requestedTeamCount = parseRequestedTeamCount(commandText);
  const playersPerTeam = parseTeamSize(commandText);
  let teamCount = requestedTeamCount;
  if (!teamCount && playersPerTeam && rosterPlayers.length % playersPerTeam === 0 && rosterPlayers.length >= playersPerTeam * 2) {
    teamCount = rosterPlayers.length / playersPerTeam;
  }

  const selectAction = createEmptyAction("select_players");
  selectAction.capabilityId = "today.select_players";
  selectAction.distribution = teamCount ? "replace_today_selection_then_generate" : "replace_today_selection";
  selectAction.teamCount = teamCount || null;
  selectAction.playersPerTeam = playersPerTeam;
  selectAction.reason = teamCount
    ? translate("ai.local.reason.selectAllThenGenerate", { count: rosterPlayers.length, teamCount })
    : translate("ai.local.reason.selectAll", { count: rosterPlayers.length });
  selectAction.playerRefs = rosterPlayers.map((player) => ({
    playerId: player.id,
    rosterName: player.name,
    spokenName: player.name,
    confidence: 1,
  }));

  return localResponse({
    normalizedIntent: teamCount ? `Select all roster players and generate ${teamCount} teams` : "Select all roster players for Session",
    assistantSummary: teamCount
      ? translate("ai.local.selectAll.summaryWithTeams", { count: rosterPlayers.length, teamCount })
      : translate("ai.local.selectAll.summary", { count: rosterPlayers.length }),
    confidence: 0.98,
    actions: [selectAction],
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Handled by local select-all roster parser."],
  });
}

function parseAppKnowledgeQuestion(
  commandText: string,
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const normalized = normalizeText(commandText);
  const looksLikeQuestion = /\?|\b(what|why|how|where|when|which|explain|tell me|what does|what is|difference|different)\b/.test(normalized);
  if (!looksLikeQuestion) return null;
  if (/\b(make|create|generate|select|add|remove|replace|clear|shuffle|mark)\b/.test(normalized) && !/\b(what|why|how|explain|difference|different)\b/.test(normalized)) return null;

  let summary = "";
  let topic = "Stripes help";

  if (/\b(fair teams assistant|ai assistant|assistant|what can you do|what do you do)\b/.test(normalized)) {
    topic = "Stripes Assistant";
    summary = translate("ai.local.knowledge.assistant");
  } else if (/\b(voice select|voice selection|voice command).{0,40}\b(ai|assistant)\b|\b(ai|assistant).{0,40}\b(voice select|voice selection)\b/.test(normalized)) {
    topic = "Voice Select vs AI Assistant";
    summary = translate("ai.local.knowledge.voiceVsAssistant");
  } else if (/\b(voice select|voice selection)\b/.test(normalized)) {
    topic = "Voice Select";
    summary = translate("ai.local.knowledge.voiceSelect");
  } else if (/\b(screenshot import|smart import|ocr|crop|lost and found|meetup import|better scan)\b/.test(normalized)) {
    topic = "Smart Import";
    summary = translate("ai.local.knowledge.smartImport");
  } else if (/\b(roster tab|roster|player list)\b/.test(normalized)) {
    topic = "Roster";
    summary = translate("ai.local.knowledge.roster");
  } else if (/\b(action board|task board|tasks and votes|tasks & votes|decision board)\b/.test(normalized)) {
    topic = "Action Board";
    summary = translate("ai.local.knowledge.actionBoard");
  } else if (/\b(club attendance|attendance issue|attendance issues|no-show|no show|last-minute cancellation|last minute cancellation|warning template|warning templates|copy warning|dismissal from group|tardy record)\b/.test(normalized)) {
    topic = "Club attendance";
    summary = translate("ai.local.knowledge.clubAttendance");
  } else if (/\b(today tab|today|session|present players|who is playing)\b/.test(normalized)) {
    topic = "Session";
    summary = translate("ai.local.knowledge.session");
  } else if (/\b(teams tab|team generation|generate teams|5v5|6v6|fair teams)\b/.test(normalized)) {
    topic = "Teams";
    summary = translate("ai.local.knowledge.teams");
  } else if (/\b(club access|shared access|share roster|shared roster|organizers|collaborators)\b/.test(normalized)) {
    topic = "Club Access";
    summary = translate("ai.local.knowledge.clubAccess");
  } else if (/\b(club notes|shared notes|notes)\b/.test(normalized)) {
    topic = "Club Notes";
    summary = translate("ai.local.knowledge.clubNotes");
  } else if (/\b(equipment|gear|bags|balls|cones|bibs|stripes)\b/.test(normalized)) {
    topic = "Equipment";
    summary = translate("ai.local.knowledge.equipment");
  } else if (/\b(player management|ratings|rating|rules|warnings)\b/.test(normalized)) {
    topic = "Player Management";
    summary = translate("ai.local.knowledge.playerManagement");
  } else if (/\b(club tab|club)\b/.test(normalized)) {
    topic = "Club";
    summary = translate("ai.local.knowledge.club");
  } else if (/\b(special abilities|special ability|traits|trait|playmaker|speedster|goalkeeper|gk)\b/.test(normalized)) {
    topic = "Special abilities";
    summary = translate("ai.local.knowledge.specialAbilities");
  }

  if (!summary) return null;
  return localResponse({
    normalizedIntent: `Answer app question: ${topic}`,
    assistantSummary: summary,
    confidence: 0.96,
    actions: [],
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Answered by local Stripes app knowledge layer before server AI."],
  });
}

function parseTeamSize(commandText: string) {
  const normalized = normalizeText(commandText).replace(/[×x]/g, "v");
  const teamSizeMatch = normalized.match(/\b(\d{1,2})\s*v\s*\1\b/) || normalized.match(/\b(\d{1,2})\s+v\s+\1\b/);
  return teamSizeMatch ? Number(teamSizeMatch[1]) : null;
}

function wordNumberToInt(value: string) {
  const normalized = normalizeText(value);
  const map: Record<string, number> = {
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
  };
  return map[normalized] || null;
}

function parseRequestedTeamCount(commandText: string) {
  const normalized = normalizeText(commandText).replace(/[×x]/g, "v");
  const numericMatch = normalized.match(/\b(?:make|create|generate|prepare|build|split|divide)(?:\s+into)?\s+(\d{1,2})\s+teams?\b/) ||
    normalized.match(/\b(\d{1,2})\s+teams?\b/);
  if (numericMatch) {
    const value = Number(numericMatch[1]);
    if (Number.isFinite(value) && value >= 2 && value <= 8) return value;
  }

  const wordMatch = normalized.match(/\b(?:make|create|generate|prepare|build|split|divide)(?:\s+into)?\s+(one|two|three|four|five|six|seven|eight)\s+teams?\b/) ||
    normalized.match(/\b(one|two|three|four|five|six|seven|eight)\s+teams?\b/);
  if (wordMatch) {
    const value = wordNumberToInt(wordMatch[1]);
    if (value && value >= 2 && value <= 8) return value;
  }
  return null;
}

function parseExplicitTeamLayout(commandText: string) {
  const normalized = normalizeText(commandText).replace(/[×x]/g, "v");
  const numberPattern = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
  const layoutMatch = normalized.match(new RegExp(`\\b${numberPattern}\\s+teams?\\s+(?:of|with|with\\s+about|with\\s+roughly)\\s+${numberPattern}\\b`));
  if (!layoutMatch) return null;

  const teamCountRaw = layoutMatch[1];
  const playersPerTeamRaw = layoutMatch[2];
  const teamCount = /^\\d+$/.test(teamCountRaw) ? Number(teamCountRaw) : wordNumberToInt(teamCountRaw);
  const playersPerTeam = /^\\d+$/.test(playersPerTeamRaw) ? Number(playersPerTeamRaw) : wordNumberToInt(playersPerTeamRaw);
  if (!teamCount || !playersPerTeam) return null;
  if (teamCount < 2 || teamCount > 8 || playersPerTeam < 1 || playersPerTeam > 20) return null;
  return { teamCount, playersPerTeam };
}

function hasRequestedTeamSetupLanguage(commandText: string) {
  const normalized = normalizeText(commandText).replace(/[×x]/g, "v");
  return Boolean(
    parseRequestedTeamCount(commandText) ||
      parseTeamSize(commandText) ||
      /\b(?:one|two|three|four|five|six|seven|eight)\s+teams?\b/.test(normalized) ||
      /\b\d{1,2}\s+teams?\b/.test(normalized) ||
      /\bteams?\s+of\s+(?:one|two|three|four|five|six|seven|eight|\d{1,2})\b/.test(normalized),
  );
}

function wantsTeamGenerationFromCurrentSelection(commandText: string, context?: AiSmartCommandContext) {
  const normalized = normalizeText(commandText);
  const normalizedV = normalized.replace(/[×x]/g, "v");
  const hasGenerateVerb = /\b(make|create|generate|prepare|build|split|divide|draw|mix|shuffle|reshuffle|reroll)\b/.test(normalized);
  const hasTeamWord = /\b(fair|balanced|team|teams|5v5|4v4|3v3|2v2)\b/.test(normalizedV);
  const refersToCurrentSelection = /\b(selected|selection|currently selected|today|today tab|present|here|playing|current players|these players|them)\b/.test(normalized);
  const hasTeamSetupLanguage = hasRequestedTeamSetupLanguage(commandText);
  const shuffleExistingTeams = Boolean(context?.currentTeamsGenerated) && /\b(shuffle|reshuffle|reroll|different mix|new mix|another mix|mix them up|mix again)\b/.test(normalized);

  // Older routing treated any comma/"and" in a team-generation sentence as a player list.
  // That made normal speech like “make teams of 2, so basically two teams” fall through to
  // the server AI, which could invent fake player names from command words. Team setup
  // language should be handled by the deterministic local team orchestrator first.
  const hasListSignal = /,|\band\b|\bplus\b|&/.test(commandText);
  return (
    shuffleExistingTeams ||
    (hasGenerateVerb && hasTeamWord && (refersToCurrentSelection || hasTeamSetupLanguage || !hasListSignal))
  );
}

function wantsDifferentTeamMix(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(different|new|again|reshuffle|shuffle|mix|mixed|mix up|configuration|reroll|another)\b/.test(normalized);
}

function parseGenerateTeamsFromSelectionCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
  context?: AiSmartCommandContext,
): AiSmartCommandResponse | null {
  if (!wantsTeamGenerationFromCurrentSelection(commandText, context)) return null;

  const selectedPlayers = players.filter((player) => Boolean(player.attending));
  const selectedCount = selectedPlayers.length;
  const explicitTeamLayout = parseExplicitTeamLayout(commandText);
  const requestedTeamCount = explicitTeamLayout?.teamCount || parseRequestedTeamCount(commandText);
  const requestedPlayersPerTeam = explicitTeamLayout?.playersPerTeam || parseTeamSize(commandText);
  const wantsShuffle = wantsDifferentTeamMix(commandText);
  const existingTeamCount = typeof context?.currentTeamCount === "number" && context.currentTeamCount >= 2
    ? Math.round(context.currentTeamCount)
    : null;
  const shouldReuseExistingTeamCount = wantsShuffle && Boolean(context?.currentTeamsGenerated) && !requestedTeamCount && !requestedPlayersPerTeam;

  if (selectedCount < 2) {
    const openToday = createEmptyAction("open_app_area");
    openToday.capabilityId = "navigation.open_area";
    openToday.supportStatus = "understood_not_wired";
    openToday.targetArea = "Session";
    openToday.reason = translate("ai.local.teamGeneration.selectFirstReason");
    return localResponse({
      normalizedIntent: "Generate teams from Session selection",
      assistantSummary: translate("ai.local.teamGeneration.selectFirstSummary"),
      confidence: 0.93,
      actions: [openToday],
      confirmations: [],
      unresolved: [{
        text: "Session selection",
        issue: "missing_context",
        message: translate("ai.local.teamGeneration.selectFirstMessage"),
      }],
      debugWarnings: ["Handled by local team-generation orchestrator: no selected players."],
    });
  }

  let teamCount = requestedTeamCount || (shouldReuseExistingTeamCount ? existingTeamCount : null);
  if (!teamCount && requestedPlayersPerTeam) {
    if (selectedCount < requestedPlayersPerTeam * 2) {
      return localResponse({
        normalizedIntent: `Generate ${requestedPlayersPerTeam}v${requestedPlayersPerTeam} teams`,
        assistantSummary: translate("ai.local.teamGeneration.insufficientSizeSummary", {
          playersPerTeam: requestedPlayersPerTeam,
          neededCount: requestedPlayersPerTeam * 2,
          selectedCount,
        }),
        confidence: 0.94,
        actions: [],
        confirmations: [],
        unresolved: [{
          text: `${selectedCount} selected players for ${requestedPlayersPerTeam}v${requestedPlayersPerTeam}`,
          issue: "missing_context",
          message: translate("ai.local.teamGeneration.insufficientSizeMessage", {
            playersPerTeam: requestedPlayersPerTeam,
            neededCount: requestedPlayersPerTeam * 2,
          }),
        }],
        debugWarnings: ["Handled by local team-generation orchestrator: not enough players for requested v-size."],
      });
    }
    if (selectedCount % requestedPlayersPerTeam !== 0) {
      return localResponse({
        normalizedIntent: `Generate ${requestedPlayersPerTeam}v${requestedPlayersPerTeam} teams`,
        assistantSummary: translate("ai.local.teamGeneration.unevenSizeSummary", {
          playersPerTeam: requestedPlayersPerTeam,
          selectedCount,
        }),
        confidence: 0.92,
        actions: [],
        confirmations: [],
        unresolved: [{
          text: `${selectedCount} selected players for ${requestedPlayersPerTeam}v${requestedPlayersPerTeam}`,
          issue: "missing_context",
          message: translate("ai.local.teamGeneration.unevenSizeMessage", {
            playersPerTeam: requestedPlayersPerTeam,
            selectedCount,
          }),
        }],
        debugWarnings: ["Handled by local team-generation orchestrator: uneven requested v-size."],
      });
    }
    teamCount = selectedCount / requestedPlayersPerTeam;
  }

  if (!teamCount) {
    const suggested = selectedCount >= 4 ? 2 : null;
    return localResponse({
      normalizedIntent: "Generate teams, missing team count",
      assistantSummary: suggested
        ? translate("ai.local.teamGeneration.missingCountSuggestedSummary", { selectedCount })
        : translate("ai.local.teamGeneration.missingCountSummary", { selectedCount }),
      confidence: 0.9,
      actions: [],
      confirmations: [],
      unresolved: [{
        text: "team count",
        issue: "missing_context",
        message: translate("ai.local.teamGeneration.missingCountMessage"),
      }],
      debugWarnings: ["Handled by local team-generation orchestrator: team count clarification needed."],
    });
  }

  if (teamCount < 2 || teamCount > 8 || selectedCount < teamCount) {
    return localResponse({
      normalizedIntent: "Generate teams, invalid team count",
      assistantSummary: translate("ai.local.teamGeneration.invalidCountSummary", {
        count: selectedCount,
        teamCount,
      }),
      confidence: 0.93,
      actions: [],
      confirmations: [],
      unresolved: [{
        text: `${teamCount} teams from ${selectedCount} players`,
        issue: "missing_context",
        message: translate("ai.local.teamGeneration.invalidCountMessage"),
      }],
      debugWarnings: ["Handled by local team-generation orchestrator: invalid team count."],
    });
  }

  const generateAction = createEmptyAction("generate_teams");
  generateAction.capabilityId = "teams.generate";
  generateAction.supportStatus = "executable";
  generateAction.teamCount = teamCount;
  generateAction.playersPerTeam = requestedPlayersPerTeam;
  generateAction.distribution = wantsShuffle ? "shuffle_equals" : "balanced";
  generateAction.reason = wantsShuffle
    ? translate("ai.local.teamGeneration.shuffleReason", { selectedCount })
    : translate("ai.local.teamGeneration.generateReason", { selectedCount });

  return localResponse({
    normalizedIntent: `Generate ${teamCount} teams from Session selection`,
    assistantSummary: wantsShuffle
      ? translate("ai.local.teamGeneration.shuffleSummary", { count: teamCount, selectedCount })
      : translate("ai.local.teamGeneration.generateSummary", { count: teamCount, selectedCount }),
    confidence: 0.98,
    actions: [generateAction],
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Handled by local team-generation orchestrator before server AI."],
  });
}

function wantsBalancedTeams(commandText: string) {
  const normalized = normalizeText(commandText);
  return /\b(make|create|generate|prepare|build)\b/.test(normalized) && /\b(fair|balanced|team|teams)\b/.test(normalized);
}

function parsePresentPlayerSelectionCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  if (!likelyPresentPlayerCommand(commandText)) return null;

  const { matched, unresolved } = findPlayersMentioned(commandText, players);
  if (matched.length === 0 && unresolved.length === 0) return null;

  const removeMode = wantsRemoveFromToday(commandText);
  const exactListMode = wantsExactTodayList(commandText);
  const replaceMode = wantsReplaceToday(commandText) || exactListMode;
  const addMode = wantsAddToToday(commandText);
  const existingSelectionCount = currentTodaySelectionCount(players);
  const ambiguousWithExistingSelection = !removeMode && !replaceMode && existingSelectionCount > 0;

  if (matched.length === 0) {
    const uniqueUnresolved = [...new Set(unresolved)].slice(0, 8);
    const possibleMatchActions = removeMode
      ? []
      : uniqueUnresolved
        .map((name) => ({ name, possible: possibleRosterNameMatch(name, players) }))
        .filter((row): row is { name: string; possible: NonNullable<ReturnType<typeof possibleRosterNameMatch>> } => Boolean(row.possible))
        .slice(0, 3)
        .map(({ name, possible }) => createUseExistingPlayerAction(possible.player, name, translate, translate("ai.local.reason.voicePossibleMatch", {
          spokenName: displaySpokenName(name),
          playerName: possible.player.name,
        })));
    const possibleKeys = new Set(possibleMatchActions.flatMap((action) => action.playerRefs.map((ref) => compactKey(ref.spokenName))));
    const addActions = removeMode
      ? []
      : uniqueUnresolved
        .filter((name) => !possibleKeys.has(compactKey(displaySpokenName(name))))
        .slice(0, Math.max(0, 3 - possibleMatchActions.length))
        .map((name) => createAddPlayerAction(name, translate));
    return localResponse({
      normalizedIntent: "Update Session, but no roster names matched",
      assistantSummary: possibleMatchActions.length > 0
        ? translate("ai.local.selection.noMatchPossibleSummary")
        : translate("ai.local.selection.noMatchSummary"),
      confidence: possibleMatchActions.length > 0 ? 0.86 : 0.84,
      actions: [...possibleMatchActions, ...addActions],
      confirmations: [],
      unresolved: uniqueUnresolved.map((name) => {
        const possible = possibleRosterNameMatch(name, players);
        return {
          text: name,
          issue: possible ? "ambiguous_player" : "unknown_player",
          message: possible
            ? translate("ai.local.selection.didYouMean", {
              spokenName: displaySpokenName(name),
              playerName: possible.player.name,
            })
            : translate("ai.local.selection.notFound", { spokenName: displaySpokenName(name) }),
        };
      }),
      debugWarnings: ["Handled by local present-player parser with no roster matches."],
    });
  }

  const makePlayerRefs = () => matched.map(({ player, spokenName, score }) => ({
    playerId: player.id,
    rosterName: player.name,
    spokenName,
    confidence: Math.min(1, Math.max(0.72, score)),
  }));

  const lateSegment = removeMode ? "" : extractLateNameSegment(commandText);
  const lateMatched = lateSegment ? findPlayersMentioned(lateSegment, players).matched : [];
  const latePlayerIds = new Set(lateMatched.map((item) => item.player.id));

  const actions: AiSmartCommandAction[] = [];
  if (removeMode) {
    const removeAction = createEmptyAction("unselect_players");
    removeAction.capabilityId = "today.unselect_players";
    removeAction.distribution = "remove_today_selection";
    removeAction.playerRefs = makePlayerRefs();
    removeAction.reason = translate("ai.local.reason.removeMatched");
    actions.push(removeAction);
  } else {
    const selectAction = createEmptyAction("select_players");
    selectAction.capabilityId = "today.select_players";
    selectAction.distribution = replaceMode ? "replace_today_selection" : "add_today_selection";
    selectAction.reason = replaceMode
      ? translate("ai.local.reason.replaceMatched")
      : existingSelectionCount > 0
        ? translate("ai.local.reason.addMatchedKeepExisting")
        : translate("ai.local.reason.selectMatched");
    selectAction.playerRefs = makePlayerRefs();
    actions.push(selectAction);

    if (replaceMode && exactListMode && existingSelectionCount > 0) {
      const addAction = createEmptyAction("select_players");
      addAction.capabilityId = "today.select_players";
      addAction.distribution = "add_today_selection";
      addAction.playerRefs = makePlayerRefs();
      addAction.reason = translate("ai.local.reason.alternativeAddMatched");
      actions.push(addAction);
    } else if (ambiguousWithExistingSelection && !addMode) {
      const replaceAction = createEmptyAction("select_players");
      replaceAction.capabilityId = "today.select_players";
      replaceAction.distribution = "replace_today_selection";
      replaceAction.playerRefs = makePlayerRefs();
      replaceAction.reason = translate("ai.local.reason.alternativeReplaceMatched");
      actions.push(replaceAction);
    }
  }

  if (!removeMode && lateMatched.length > 0) {
    actions.push(createMarkLateAction(lateMatched.map(({ player, spokenName, score }) => ({
      playerId: player.id,
      rosterName: player.name,
      spokenName,
      confidence: Math.min(1, Math.max(0.72, score)),
    })), translate));
  }

  const playersPerTeam = parseTeamSize(commandText);
  if (!removeMode && playersPerTeam) {
    const sizeAction = createEmptyAction("set_team_size");
    sizeAction.capabilityId = "teams.set_team_size";
    sizeAction.playersPerTeam = playersPerTeam;
    sizeAction.reason = translate("ai.local.reason.teamSize", { playersPerTeam });
    actions.push(sizeAction);
  } else if (!removeMode && wantsBalancedTeams(commandText) && matched.length >= 4) {
    const teamCountAction = createEmptyAction("set_team_count");
    teamCountAction.capabilityId = "teams.set_team_count";
    teamCountAction.teamCount = 2;
    teamCountAction.reason = translate("ai.local.reason.prepareTwoTeams");
    actions.push(teamCountAction);

    const generateAction = createEmptyAction("generate_teams");
    generateAction.capabilityId = "teams.generate";
    generateAction.supportStatus = "executable";
    generateAction.teamCount = 2;
    generateAction.distribution = wantsDifferentTeamMix(commandText) ? "shuffle_equals" : "balanced";
    generateAction.reason = translate("ai.local.reason.generateTwoTeams");
    actions.push(generateAction);
  }

  const uniqueUnresolved = [...new Set(unresolved)].slice(0, 8);
  if (uniqueUnresolved.length > 0 && !removeMode) {
    const possibleRows = uniqueUnresolved
      .map((name) => ({ name, possible: possibleRosterNameMatch(name, players) }))
      .filter((row): row is { name: string; possible: NonNullable<ReturnType<typeof possibleRosterNameMatch>> } => Boolean(row.possible));
    const possibleKeys = new Set<string>();
    possibleRows.slice(0, 3).forEach(({ name, possible }) => {
      possibleKeys.add(compactKey(displaySpokenName(name)));
      actions.push(createUseExistingPlayerAction(possible.player, name, translate, translate("ai.local.reason.voicePossibleMatch", {
        spokenName: displaySpokenName(name),
        playerName: possible.player.name,
      })));
    });
    const remainingSlots = Math.max(0, 3 - possibleRows.length);
    if (remainingSlots > 0) {
      actions.push(...uniqueUnresolved
        .filter((name) => !possibleKeys.has(compactKey(displaySpokenName(name))))
        .slice(0, remainingSlots)
        .map((name) => createAddPlayerAction(name, translate)));
    }
  }

  const names = matched.map(({ player, spokenName, score }) => {
    const heard = displaySpokenName(spokenName);
    const heardKey = compactKey(heard);
    const rosterKey = compactKey(player.name);
    return score < 0.99 && heardKey && rosterKey && heardKey !== rosterKey
      ? `${heard} → ${player.name}`
      : player.name;
  });
  const missedText = uniqueUnresolved.length > 0
    ? translate("ai.local.selection.missedSuffix", {
      names: formatLocalUnitList(uniqueUnresolved.slice(0, 5).map(displaySpokenName), translate),
    })
    : "";
  const modeText = removeMode
    ? translate("ai.local.selection.modeRemove")
    : replaceMode
      ? translate("ai.local.selection.modeReplace")
      : existingSelectionCount > 0
        ? translate("ai.local.selection.modeAdd")
        : translate("ai.local.selection.modeSelect");
  const teamText = !removeMode && playersPerTeam
    ? translate("ai.local.selection.teamSizeSuffix", { playersPerTeam })
    : !removeMode && wantsBalancedTeams(commandText) && matched.length >= 4
      ? translate("ai.local.selection.twoTeamSuffix")
      : "";
  const lateText = !removeMode && lateMatched.length > 0
    ? translate("ai.local.selection.lateSuffix", {
      count: lateMatched.length,
      names: formatLocalUnitList(lateMatched.map((item) => item.player.name), translate),
    })
    : "";
  const ambiguityText = exactListMode && replaceMode && existingSelectionCount > 0
    ? translate("ai.local.selection.exactListExistingSuffix", { count: existingSelectionCount })
    : ambiguousWithExistingSelection && !addMode
      ? translate("ai.local.selection.keepExistingSuffix", { count: existingSelectionCount })
      : "";

  return localResponse({
    normalizedIntent: removeMode ? "Remove matched players from Session" : replaceMode ? "Replace Session selection with matched players" : "Update Session selection with matched players",
    assistantSummary: translate("ai.local.selection.matchedSummary", {
      count: matched.length,
      mode: modeText,
      names: formatLocalUnitList(names, translate),
      lateText,
      teamText,
      ambiguityText,
      missedText,
    }),
    confidence: unresolved.length > 0 ? 0.88 : 0.98,
    actions,
    confirmations: [],
    unresolved: uniqueUnresolved.map((name) => {
      const possible = possibleRosterNameMatch(name, players);
      return {
        text: name,
        issue: possible ? "ambiguous_player" : "unknown_player",
        message: possible
          ? translate("ai.local.selection.didYouMean", {
            spokenName: displaySpokenName(name),
            playerName: possible.player.name,
          })
          : translate("ai.local.selection.notConfident", { spokenName: displaySpokenName(name) }),
      };
    }),
    debugWarnings: ["Handled by Stripes local present-player parser with fuzzy roster matching and safe Session selection mode."],
  });
}

function parseRankedRosterSelectionCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const normalized = normalizeText(commandText).replace(/[×x]/g, "v");
  const wantsWeakest = /\b(weakest|worst|lowest|least skilled|beginners?)\b/.test(normalized);
  const wantsStrongest = /\b(strongest|best|highest|top)\b/.test(normalized);
  if (!wantsWeakest && !wantsStrongest) return null;
  if (!/\b(roster|players?|squad)\b/.test(normalized)) return null;

  const countMatch = normalized.match(/\b(?:weakest|worst|lowest|strongest|best|highest|top)\s+(\d{1,2})\b/) ||
    normalized.match(/\b(\d{1,2})\s+(?:weakest|worst|lowest|strongest|best|highest|top)\b/);
  const requestedCount = countMatch ? Number(countMatch[1]) : null;
  const explicitTeamLayout = parseExplicitTeamLayout(commandText);
  const requestedTeamCount = explicitTeamLayout?.teamCount || parseRequestedTeamCount(commandText);
  const playersPerTeam = explicitTeamLayout?.playersPerTeam || parseTeamSize(normalized);
  const neededForExplicitLayout = explicitTeamLayout ? explicitTeamLayout.teamCount * explicitTeamLayout.playersPerTeam : null;
  const neededForTeamSize = playersPerTeam ? playersPerTeam * 2 : null;
  const targetCount = requestedCount || neededForExplicitLayout || neededForTeamSize;
  if (!targetCount || targetCount < 2) return null;

  const rankedPlayers = [...players]
    .filter((player) => player.id && player.name)
    .sort((a, b) => {
      const aSkill = typeof a.skill === "number" ? a.skill : 5;
      const bSkill = typeof b.skill === "number" ? b.skill : 5;
      if (aSkill !== bSkill) return wantsWeakest ? aSkill - bSkill : bSkill - aSkill;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .slice(0, targetCount);

  if (rankedPlayers.length === 0) return null;

  const finalTeamCount = requestedTeamCount || (playersPerTeam && rankedPlayers.length % playersPerTeam === 0 ? rankedPlayers.length / playersPerTeam : null);
  const canGenerateAfterSelection = Boolean(finalTeamCount && finalTeamCount >= 2 && rankedPlayers.length >= finalTeamCount);

  const selectAction = createEmptyAction("select_players");
  selectAction.capabilityId = "today.select_players";
  selectAction.distribution = canGenerateAfterSelection ? "replace_today_selection_then_generate" : "replace_today_selection";
  selectAction.playersPerTeam = playersPerTeam;
  selectAction.teamCount = canGenerateAfterSelection ? finalTeamCount : null;
  selectAction.reason = canGenerateAfterSelection
    ? wantsWeakest
      ? translate("ai.local.ranked.weakestReasonWithTeams", { count: rankedPlayers.length, teamCount: finalTeamCount })
      : translate("ai.local.ranked.strongestReasonWithTeams", { count: rankedPlayers.length, teamCount: finalTeamCount })
    : wantsWeakest
      ? translate("ai.local.ranked.weakestReason", { count: rankedPlayers.length })
      : translate("ai.local.ranked.strongestReason", { count: rankedPlayers.length });
  selectAction.playerRefs = rankedPlayers.map((player) => ({
    playerId: player.id,
    rosterName: player.name,
    spokenName: player.name,
    confidence: 1,
  }));

  const actions: AiSmartCommandAction[] = [selectAction];

  return localResponse({
    normalizedIntent: `${wantsWeakest ? "Select weakest" : "Select strongest"} ${rankedPlayers.length} roster players${canGenerateAfterSelection ? ` and generate ${finalTeamCount} teams` : playersPerTeam ? ` for ${playersPerTeam}v${playersPerTeam}` : ""}`,
    assistantSummary: canGenerateAfterSelection
      ? wantsWeakest
        ? translate("ai.local.ranked.weakestSummaryWithTeams", { count: rankedPlayers.length, teamCount: finalTeamCount })
        : translate("ai.local.ranked.strongestSummaryWithTeams", { count: rankedPlayers.length, teamCount: finalTeamCount })
      : wantsWeakest
        ? translate("ai.local.ranked.weakestSummary", {
          count: rankedPlayers.length,
          teamSizeText: playersPerTeam ? translate("ai.local.ranked.teamSizeSuffix", { playersPerTeam }) : "",
        })
        : translate("ai.local.ranked.strongestSummary", {
          count: rankedPlayers.length,
          teamSizeText: playersPerTeam ? translate("ai.local.ranked.teamSizeSuffix", { playersPerTeam }) : "",
        }),
    confidence: 0.98,
    actions,
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Handled by Stripes local ranked-selection parser before current-Session team generation."],
  });
}

function describeTopPlayers(
  players: AiSmartCommandRosterPlayer[],
  field: keyof AiSmartCommandRosterPlayer,
  label: string,
  translate: AiSmartCommandConversationPresenter,
  highIsBest = true,
) {
  const ranked = players
    .filter((player) => player.id && player.name && typeof player[field] === "number")
    .sort((a, b) => {
      const av = Number(a[field]);
      const bv = Number(b[field]);
      if (av !== bv) return highIsBest ? bv - av : av - bv;
      return a.name.localeCompare(b.name);
    });

  if (ranked.length === 0) return null;
  const top = ranked.slice(0, 3);
  const firstValue = Number(top[0][field]);
  const tiedFirst = ranked.filter((player) => Number(player[field]) === firstValue).slice(0, 5);
  if (tiedFirst.length > 1) {
    return translate("ai.local.rosterQuestion.tiedTop", {
      label,
      players: formatLocalUnitList(
        tiedFirst.map((player) => `${player.name} (${translate.formatNumber(Number(player[field]))})`),
        translate,
      ),
    });
  }
  return translate("ai.local.rosterQuestion.highest", {
    label,
    playerName: top[0].name,
    value: firstValue,
    nextPlayers: formatLocalUnitList(
      top.slice(1).map((player) => `${player.name} (${translate.formatNumber(Number(player[field]))})`),
      translate,
    ) || translate("ai.local.rosterQuestion.noRunnerUp"),
  });
}

function parseRosterQuestion(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  translate: AiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const normalized = normalizeText(commandText);
  const isQuestion = /\b(who|which|what|show|tell|list)\b/.test(normalized) || commandText.includes("?");
  if (!isQuestion) return null;

  let summary: string | null = null;
  if (/\b(fastest|quickest|speed|pace)\b/.test(normalized)) {
    summary = describeTopPlayers(players, "speed", translate("ai.local.rosterQuestion.speedLabel"), translate);
    if (!summary) summary = translate("ai.local.rosterQuestion.notEnoughSpeed");
  } else if (/\b(strongest|best|top|highest skill|best player)\b/.test(normalized)) {
    summary = describeTopPlayers(players, "skill", translate("ai.local.rosterQuestion.overallSkillLabel"), translate);
    if (!summary) summary = translate("ai.local.rosterQuestion.notEnoughStrongest");
  } else if (/\b(weakest|beginner|lowest skill|worst)\b/.test(normalized)) {
    summary = describeTopPlayers(players, "skill", translate("ai.local.rosterQuestion.overallSkillLabel"), translate, false);
    if (!summary) summary = translate("ai.local.rosterQuestion.notEnoughWeakest");
  } else if (/\b(goalkeepers?|keeper|gk)\b/.test(normalized)) {
    const keepers = players.filter((player) => player.isGoalkeeper);
    summary = keepers.length > 0
      ? translate("ai.local.rosterQuestion.goalkeepers", { names: formatLocalUnitList(keepers.map((player) => player.name), translate) })
      : translate("ai.local.rosterQuestion.noGoalkeepers");
  } else if (/\b(selected|present|here|playing today|today)\b/.test(normalized)) {
    const selected = players.filter((player) => player.attending);
    summary = selected.length > 0
      ? translate("ai.local.rosterQuestion.selected", { names: formatLocalUnitList(selected.map((player) => player.name), translate) })
      : translate("ai.local.rosterQuestion.noneSelected");
  } else if (/\b(unrated|not rated|missing rating|need rating|needs rating)\b/.test(normalized)) {
    const unrated = players.filter((player) => typeof player.skill !== "number" || !Number.isFinite(player.skill));
    summary = unrated.length > 0
      ? translate("ai.local.rosterQuestion.unrated", { names: formatLocalUnitList(unrated.map((player) => player.name), translate) })
      : translate("ai.local.rosterQuestion.allRated");
  }

  if (!summary) return null;
  return localResponse({
    normalizedIntent: "Answer roster data question",
    assistantSummary: summary,
    confidence: 0.97,
    actions: [],
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Answered from local roster data before server AI."],
  });
}

export function parseFairTeamsLocalSmartCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
  context?: AiSmartCommandContext,
  conversation: AiSmartCommandConversationPresenter = canonicalAiSmartCommandConversationPresenter,
): AiSmartCommandResponse | null {
  const explicitNewPlayer = parseExplicitNewPlayerCommand(commandText, players, conversation);
  if (explicitNewPlayer) return explicitNewPlayer;

  const selectAllRoster = parseSelectAllRosterCommand(commandText, players, conversation);
  if (selectAllRoster) return selectAllRoster;

  // Mixed attendance + team commands are common: “Session we have Joon, Jorge…
  // can you make teams?” In that case, parse and confirm the named Session list
  // before using any previously selected players. Plain team setup commands like
  // “make teams of 2” still go to the team orchestrator first.
  if (shouldPreferAttendanceListBeforeTeams(commandText)) {
    const presentSelectionFirst = parsePresentPlayerSelectionCommand(commandText, players, conversation);
    if (presentSelectionFirst) return presentSelectionFirst;
  }

  // Ranked roster requests such as “best 10 from the roster” or
  // “two teams of five with the best players” must be handled before the
  // current-Session team orchestrator. Otherwise the assistant may incorrectly
  // use whoever is already selected in Session.
  const rankedSelection = parseRankedRosterSelectionCommand(commandText, players, conversation);
  if (rankedSelection) return rankedSelection;

  // Team-generation and shuffle commands must be handled before generic name-list parsing.
  // Otherwise natural phrases like “shuffle the teams” or “make teams of 2” can be
  // misread as fake player names.
  const teamGeneration = parseGenerateTeamsFromSelectionCommand(commandText, players, conversation, context);
  if (teamGeneration) return teamGeneration;

  const presentSelection = parsePresentPlayerSelectionCommand(commandText, players, conversation);
  if (presentSelection) return presentSelection;

  const rosterQuestion = parseRosterQuestion(commandText, players, conversation);
  if (rosterQuestion) return rosterQuestion;

  const openArea = parseOpenAreaCommand(commandText, conversation);
  if (openArea) return openArea;

  const appKnowledge = parseAppKnowledgeQuestion(commandText, conversation);
  if (appKnowledge) return appKnowledge;

  return null;
}
