import {
  bestPlayerNameMatch,
  candidateNamesForRosterPlayer,
  compactPlayerNameKey,
  displayNameFromSpokenInput,
} from "./playerNameMatching";
import type {
  AiSmartCommandAction,
  AiSmartCommandContext,
  AiSmartCommandResponse,
  AiSmartCommandRosterPlayer,
} from "./aiSmartCommandTypes";

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

function createAddPlayerAction(name: string): AiSmartCommandAction {
  const action = createEmptyAction("add_new_player_suggestion");
  action.capabilityId = "roster.add_new_player";
  action.supportStatus = "executable";
  action.newPlayerName = displaySpokenName(name);
  action.suggestedSkill = 5;
  action.reason = "Add this missing name to the roster, then mark them present for Today.";
  return action;
}

function createUseExistingPlayerAction(player: AiSmartCommandRosterPlayer, spokenName: string, reason?: string): AiSmartCommandAction {
  const action = createEmptyAction("select_players");
  action.capabilityId = "today.select_players";
  action.distribution = "add_today_selection";
  action.playerRefs = [{
    playerId: player.id,
    rosterName: player.name,
    spokenName: displaySpokenName(spokenName),
    confidence: 0.9,
  }];
  action.reason = reason || `Possible existing match for “${displaySpokenName(spokenName)}”. Use this if you meant ${player.name} instead of adding a new player.`;
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
    .replace(/\b(players?|people|members|present|currently|playing|here|fair|balanced|teams?|make|create|generate|prepare|build|sort|of|a|the|from|now|are|is|was|were|be|select|choose|add|also|plus|too|forgot|late|remove|unselect|deselect|take|out|not|coming|cannot|can t|cancel|absent|play|playing|with|who|else|we|i|have|has|got|heard|said|mentioned|these|those|this|that)\b/g, " ")
    .replace(/\b(v|vs|versus)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(new|player|players|today|tab|current|okay|ok|yes|yeah|and|or|with|from|to|the|a|an)$/i.test(text)) return "";
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
  const best = bestPlayerNameMatch(name, players, { includeDisplayName: true });
  if (!best) return null;
  return {
    player: best.player,
    candidate: best.candidate,
    score: best.score / 100,
    secondBestScore: best.secondBestScore / 100,
  };
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
): AiSmartCommandResponse | null {
  if (!wantsExplicitNewPlayer(commandText)) return null;

  const names = extractExplicitNewPlayerNames(commandText);
  if (names.length === 0) return localResponse({
    normalizedIntent: "Add new player, but no clean name found",
    assistantSummary: "I understood that you want to add a new player, but I could not isolate the name cleanly. Try saying “add Raphael as new player.”",
    confidence: 0.78,
    actions: [],
    confirmations: [],
    unresolved: [{
      text: commandText,
      issue: "missing_context",
      message: "I could not find a clean new-player name in that command.",
    }],
    debugWarnings: ["Explicit new-player intent detected, but no clean name survived command-word cleanup."],
  });

  const actions: AiSmartCommandAction[] = [];
  const confirmations: AiSmartCommandResponse["confirmations"] = [];
  const unresolved: AiSmartCommandResponse["unresolved"] = [];
  const possibleMatches: string[] = [];

  names.forEach((name) => {
    const addAction = createAddPlayerAction(name);
    addAction.reason = `Add ${name} as a new roster player, then mark them present for Today.`;
    actions.push(addAction);

    const similar = bestRosterNameMatch(name, players);
    if (similar && similar.score >= 0.84) {
      const exactSame = compactPlayerNameKey(similar.player.name) === compactPlayerNameKey(name) || candidateNamesForRosterPlayer(similar.player, { includeDisplayName: true }).some((candidate) => compactPlayerNameKey(candidate) === compactPlayerNameKey(name));
      if (exactSame) {
        actions.push(createUseExistingPlayerAction(similar.player, name, `${similar.player.name} is already in this roster. Use this if you meant the existing player instead of creating a duplicate.`));
        possibleMatches.push(`${name} is already close to ${similar.player.name}`);
      } else if (similar.score - similar.secondBestScore >= 0.03) {
        actions.push(createUseExistingPlayerAction(similar.player, name));
        confirmations.push({
          id: `similar-${compactKey(name)}-${similar.player.id}`,
          type: "ambiguous_player",
          message: `“${name}” looks similar to existing roster player ${similar.player.name}. Add ${name} only if this is a different person.`,
          playerRefs: [{
            playerId: similar.player.id,
            rosterName: similar.player.name,
            spokenName: name,
            confidence: similar.score,
          }],
          suggestedActionType: "select_players",
        });
        possibleMatches.push(`${name} ↔ ${similar.player.name}`);
      }
    }
  });

  const matchText = possibleMatches.length > 0
    ? ` I also found possible existing match${possibleMatches.length === 1 ? "" : "es"}: ${possibleMatches.join(", ")}.`
    : "";

  return localResponse({
    normalizedIntent: "Add explicit new player",
    assistantSummary: `I understood this as a new-player request: ${names.join(", ")}.${matchText} I will not silently merge a new-player request into an existing roster name.`,
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

  // In mixed commands like “Today we have Joon, Jorge… can you make teams?”,
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
  return (hasRosterListLanguage && (hasListSignal || hasTeamMakingLanguage)) || hasSinglePersonCorrectionLanguage;
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

    if (best && best.score >= 0.84 && best.score - best.secondBestScore >= 0.04) {
      const existing = matched.get(best.player.id);
      if (!existing || best.score > existing.score) {
        matched.set(best.player.id, { player: best.player, spokenName: chunk, score: best.score });
      }
    } else if (!/\b(v|vs|versus)\b|^\d+$/.test(chunk)) {
      // Voice transcripts sometimes arrive without commas: “June Ian Tanya Briesh”.
      // If the whole chunk is too messy, try each word as a possible spoken name.
      const looseWords = chunk.split(/\s+/).map(cleanNameChunkForMatching).filter((part) => part.length >= 2);
      let matchedLooseWord = false;
      looseWords.forEach((looseWord) => {
        const looseBest = bestRosterNameMatch(looseWord, players);

        if (looseBest && looseBest.score >= 0.84 && looseBest.score - looseBest.secondBestScore >= 0.04) {
          const existing = matched.get(looseBest.player.id);
          if (!existing || looseBest.score > existing.score) {
            matched.set(looseBest.player.id, { player: looseBest.player, spokenName: looseWord, score: looseBest.score });
          }
          matchedLooseWord = true;
        } else if (looseWord.length >= 2 && !/^\d+$/.test(looseWord)) {
          unresolved.push(looseWord);
        }
      });
      if (!matchedLooseWord && looseWords.length === 0) unresolved.push(chunk);
    }
  });

  const orderedMatched = [...matched.values()].sort((a, b) => {
    const ai = normalizedSegment.indexOf(normalizeText(a.spokenName));
    const bi = normalizedSegment.indexOf(normalizeText(b.spokenName));
    if (ai !== bi) return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
    return a.player.name.localeCompare(b.player.name);
  });

  return { matched: orderedMatched, unresolved: [...new Set(unresolved)] };
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
    openToday.targetArea = "Today";
    openToday.reason = "Select who is playing in Today first, then generate fair teams.";
    return localResponse({
      normalizedIntent: "Generate teams from Today selection",
      assistantSummary: "I can help make teams, but there are not enough players selected in Today yet. Select who is playing first, then ask me to make teams.",
      confidence: 0.93,
      actions: [openToday],
      confirmations: [],
      unresolved: [{
        text: "Today selection",
        issue: "missing_context",
        message: "Select at least two players in Today before generating teams.",
      }],
      debugWarnings: ["Handled by local team-generation orchestrator: no selected players."],
    });
  }

  let teamCount = requestedTeamCount || (shouldReuseExistingTeamCount ? existingTeamCount : null);
  if (!teamCount && requestedPlayersPerTeam) {
    if (selectedCount < requestedPlayersPerTeam * 2) {
      return localResponse({
        normalizedIntent: `Generate ${requestedPlayersPerTeam}v${requestedPlayersPerTeam} teams`,
        assistantSummary: `${requestedPlayersPerTeam}v${requestedPlayersPerTeam} needs at least ${requestedPlayersPerTeam * 2} selected players, but Today has ${selectedCount}. Add more players or ask for a different team setup.`,
        confidence: 0.94,
        actions: [],
        confirmations: [],
        unresolved: [{
          text: `${selectedCount} selected players for ${requestedPlayersPerTeam}v${requestedPlayersPerTeam}`,
          issue: "missing_context",
          message: `${requestedPlayersPerTeam}v${requestedPlayersPerTeam} needs ${requestedPlayersPerTeam * 2} players.`,
        }],
        debugWarnings: ["Handled by local team-generation orchestrator: not enough players for requested v-size."],
      });
    }
    if (selectedCount % requestedPlayersPerTeam !== 0) {
      return localResponse({
        normalizedIntent: `Generate ${requestedPlayersPerTeam}v${requestedPlayersPerTeam} teams`,
        assistantSummary: `${requestedPlayersPerTeam}v${requestedPlayersPerTeam} does not fit ${selectedCount} selected players evenly. Ask for a number of teams instead, or adjust Today selection.`,
        confidence: 0.92,
        actions: [],
        confirmations: [],
        unresolved: [{
          text: `${selectedCount} selected players for ${requestedPlayersPerTeam}v${requestedPlayersPerTeam}`,
          issue: "missing_context",
          message: `${selectedCount} selected players cannot be divided evenly into ${requestedPlayersPerTeam}-player teams.`,
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
        ? `I can make fair teams from the ${selectedCount} players selected in Today. How many teams should I make? For example: “make 2 teams.”`
        : `I can make teams from the ${selectedCount} selected players, but I need the number of teams first.`,
      confidence: 0.9,
      actions: [],
      confirmations: [],
      unresolved: [{
        text: "team count",
        issue: "missing_context",
        message: "How many teams should I make?",
      }],
      debugWarnings: ["Handled by local team-generation orchestrator: team count clarification needed."],
    });
  }

  if (teamCount < 2 || teamCount > 8 || selectedCount < teamCount) {
    return localResponse({
      normalizedIntent: "Generate teams, invalid team count",
      assistantSummary: `I can’t make ${teamCount} teams from ${selectedCount} selected player${selectedCount === 1 ? "" : "s"}. Choose fewer teams or select more players.`,
      confidence: 0.93,
      actions: [],
      confirmations: [],
      unresolved: [{
        text: `${teamCount} teams from ${selectedCount} players`,
        issue: "missing_context",
        message: "The selected player count does not fit that team count.",
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
  generateAction.reason = `${wantsShuffle ? "Reshuffle using the same team setup" : "Generate fair teams"} from the ${selectedCount} players currently selected in Today.`;

  return localResponse({
    normalizedIntent: `Generate ${teamCount} teams from Today selection`,
    assistantSummary: wantsShuffle
      ? `I can reshuffle ${teamCount} team${teamCount === 1 ? "" : "s"} from the ${selectedCount} players selected in Today.`
      : `I can make ${teamCount} fair team${teamCount === 1 ? "" : "s"} from the ${selectedCount} players selected in Today.`,
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
    return localResponse({
      normalizedIntent: "Update Today, but no roster names matched",
      assistantSummary: "I understood that you want to update Today, but I could not match those names to this roster.",
      confidence: 0.84,
      actions: removeMode ? [] : uniqueUnresolved.slice(0, 3).map(createAddPlayerAction),
      confirmations: [],
      unresolved: uniqueUnresolved.map((name) => ({
        text: name,
        issue: "unknown_player",
        message: `I could not find “${displaySpokenName(name)}” in this roster.`,
      })),
      debugWarnings: ["Handled by local present-player parser with no roster matches."],
    });
  }

  const makePlayerRefs = () => matched.map(({ player, spokenName, score }) => ({
    playerId: player.id,
    rosterName: player.name,
    spokenName,
    confidence: Math.min(1, Math.max(0.72, score)),
  }));

  const actions: AiSmartCommandAction[] = [];
  if (removeMode) {
    const removeAction = createEmptyAction("unselect_players");
    removeAction.capabilityId = "today.unselect_players";
    removeAction.distribution = "remove_today_selection";
    removeAction.playerRefs = makePlayerRefs();
    removeAction.reason = "Remove these matched players from Today without changing anyone else.";
    actions.push(removeAction);
  } else {
    const selectAction = createEmptyAction("select_players");
    selectAction.capabilityId = "today.select_players";
    selectAction.distribution = replaceMode ? "replace_today_selection" : "add_today_selection";
    selectAction.reason = replaceMode
      ? "Replace Today with only these matched players."
      : existingSelectionCount > 0
        ? "Add these matched players to the existing Today selection. This will not clear players already selected."
        : "Select these matched players for Today.";
    selectAction.playerRefs = makePlayerRefs();
    actions.push(selectAction);

    if (replaceMode && exactListMode && existingSelectionCount > 0) {
      const addAction = createEmptyAction("select_players");
      addAction.capabilityId = "today.select_players";
      addAction.distribution = "add_today_selection";
      addAction.playerRefs = makePlayerRefs();
      addAction.reason = "Alternative: add these matched players to the existing Today selection without clearing anyone else.";
      actions.push(addAction);
    } else if (ambiguousWithExistingSelection && !addMode) {
      const replaceAction = createEmptyAction("select_players");
      replaceAction.capabilityId = "today.select_players";
      replaceAction.distribution = "replace_today_selection";
      replaceAction.playerRefs = makePlayerRefs();
      replaceAction.reason = "Alternative: clear the current Today selection and use only these matched players.";
      actions.push(replaceAction);
    }
  }

  const playersPerTeam = parseTeamSize(commandText);
  if (!removeMode && playersPerTeam) {
    const sizeAction = createEmptyAction("set_team_size");
    sizeAction.capabilityId = "teams.set_team_size";
    sizeAction.playersPerTeam = playersPerTeam;
    sizeAction.reason = `${playersPerTeam}v${playersPerTeam}.`;
    actions.push(sizeAction);
  } else if (!removeMode && wantsBalancedTeams(commandText) && matched.length >= 4) {
    const teamCountAction = createEmptyAction("set_team_count");
    teamCountAction.capabilityId = "teams.set_team_count";
    teamCountAction.teamCount = 2;
    teamCountAction.reason = "Prepare a two-team setup from the current Today selection.";
    actions.push(teamCountAction);

    const generateAction = createEmptyAction("generate_teams");
    generateAction.capabilityId = "teams.generate";
    generateAction.supportStatus = "executable";
    generateAction.teamCount = 2;
    generateAction.distribution = wantsDifferentTeamMix(commandText) ? "shuffle_equals" : "balanced";
    generateAction.reason = "Generate two fair teams after these matched players are selected.";
    actions.push(generateAction);
  }

  const uniqueUnresolved = [...new Set(unresolved)].slice(0, 8);
  if (uniqueUnresolved.length > 0 && !removeMode) {
    actions.push(...uniqueUnresolved.slice(0, 3).map(createAddPlayerAction));
  }

  const names = matched.map(({ player, spokenName, score }) => {
    const heard = displaySpokenName(spokenName);
    const heardKey = compactKey(heard);
    const rosterKey = compactKey(player.name);
    return score < 0.99 && heardKey && rosterKey && heardKey !== rosterKey
      ? `${heard} → ${player.name}`
      : player.name;
  });
  const missedText = uniqueUnresolved.length > 0 ? ` I could not confidently match: ${uniqueUnresolved.slice(0, 5).map(displaySpokenName).join(", ")}.` : "";
  const modeText = removeMode
    ? "remove from Today"
    : replaceMode
      ? "replace Today with"
      : existingSelectionCount > 0
        ? "add to Today"
        : "select for Today";
  const teamText = !removeMode && playersPerTeam
    ? ` I also prepared a ${playersPerTeam}v${playersPerTeam} setup.`
    : !removeMode && wantsBalancedTeams(commandText) && matched.length >= 4
      ? " I also prepared a 2-team setup."
      : "";
  const ambiguityText = exactListMode && replaceMode && existingSelectionCount > 0
    ? ` You already have ${existingSelectionCount} player${existingSelectionCount === 1 ? "" : "s"} selected, so I treated this as today’s new list. Use the add option if you only meant to add them.`
    : ambiguousWithExistingSelection && !addMode
      ? ` You already have ${existingSelectionCount} player${existingSelectionCount === 1 ? "" : "s"} selected, so I will not clear them unless you tap Replace Today.`
      : "";

  return localResponse({
    normalizedIntent: removeMode ? "Remove matched players from Today" : replaceMode ? "Replace Today selection with matched players" : "Update Today selection with matched players",
    assistantSummary: `I matched ${matched.length} player${matched.length === 1 ? "" : "s"} to ${modeText}: ${names.join(", ")}.${teamText}${ambiguityText}${missedText}`,
    confidence: unresolved.length > 0 ? 0.88 : 0.98,
    actions,
    confirmations: [],
    unresolved: uniqueUnresolved.map((name) => ({
      text: name,
      issue: "unknown_player",
      message: `I could not confidently match “${displaySpokenName(name)}” to this roster.`,
    })),
    debugWarnings: ["Handled by Fair Teams local present-player parser with fuzzy roster matching and safe Today selection mode."],
  });
}

function parseRankedRosterSelectionCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
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
    ? `${wantsWeakest ? "Weakest" : "Strongest"} ${rankedPlayers.length} players by roster skill. This will clear Today, select those players, then generate ${finalTeamCount} fair teams.`
    : `${wantsWeakest ? "Weakest" : "Strongest"} ${rankedPlayers.length} players by roster skill. This replaces today's current selection.`;
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
      ? `I found the ${wantsWeakest ? "weakest" : "strongest"} ${rankedPlayers.length} players in this roster by skill. Because you asked for teams too, I will first clear Today and select those ${rankedPlayers.length} players, then generate ${finalTeamCount} fair teams.`
      : `I found the ${wantsWeakest ? "weakest" : "strongest"} ${rankedPlayers.length} players in this roster by skill and prepared an exact Today selection.${playersPerTeam ? ` Then set up ${playersPerTeam}v${playersPerTeam}.` : ""}`,
    confidence: 0.98,
    actions,
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Handled by Fair Teams local ranked-selection parser before current-Today team generation."],
  });
}

function describeTopPlayers(players: AiSmartCommandRosterPlayer[], field: keyof AiSmartCommandRosterPlayer, label: string, highIsBest = true) {
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
    return `By ${label}, the top tied players are ${tiedFirst.map((player) => `${player.name} (${Number(player[field])})`).join(", ")}.`;
  }
  return `By ${label}, ${top[0].name} is highest at ${firstValue}. Next: ${top.slice(1).map((player) => `${player.name} (${Number(player[field])})`).join(", ") || "no close runner-up"}.`;
}

function parseRosterQuestion(commandText: string, players: AiSmartCommandRosterPlayer[]): AiSmartCommandResponse | null {
  const normalized = normalizeText(commandText);
  const isQuestion = /\b(who|which|what|show|tell|list)\b/.test(normalized) || commandText.includes("?");
  if (!isQuestion) return null;

  let summary: string | null = null;
  if (/\b(fastest|quickest|speed|pace)\b/.test(normalized)) {
    summary = describeTopPlayers(players, "speed", "speed");
    if (!summary) summary = "Fair Teams does not have enough speed data in this roster to say who is fastest.";
  } else if (/\b(strongest|best|top|highest skill|best player)\b/.test(normalized)) {
    summary = describeTopPlayers(players, "skill", "overall skill");
    if (!summary) summary = "Fair Teams does not have enough skill data in this roster to rank the strongest players.";
  } else if (/\b(weakest|beginner|lowest skill|worst)\b/.test(normalized)) {
    summary = describeTopPlayers(players, "skill", "overall skill", false);
    if (!summary) summary = "Fair Teams does not have enough skill data in this roster to rank the weakest players.";
  } else if (/\b(goalkeepers?|keeper|gk)\b/.test(normalized)) {
    const keepers = players.filter((player) => player.isGoalkeeper);
    summary = keepers.length > 0
      ? `Goalkeepers in this roster: ${keepers.map((player) => player.name).join(", ")}.`
      : "I do not see any players marked as goalkeeper in this roster.";
  } else if (/\b(selected|present|here|playing today|today)\b/.test(normalized)) {
    const selected = players.filter((player) => player.attending);
    summary = selected.length > 0
      ? `Currently selected for Today: ${selected.map((player) => player.name).join(", ")}.`
      : "No players are currently selected for Today.";
  } else if (/\b(unrated|not rated|missing rating|need rating|needs rating)\b/.test(normalized)) {
    const unrated = players.filter((player) => typeof player.skill !== "number" || !Number.isFinite(player.skill));
    summary = unrated.length > 0
      ? `Players missing a skill rating: ${unrated.map((player) => player.name).join(", ")}.`
      : "Every player in this roster appears to have a skill rating.";
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
): AiSmartCommandResponse | null {
  const explicitNewPlayer = parseExplicitNewPlayerCommand(commandText, players);
  if (explicitNewPlayer) return explicitNewPlayer;

  // Mixed attendance + team commands are common: “Today we have Joon, Jorge…
  // can you make teams?” In that case, parse and confirm the named Today list
  // before using any previously selected players. Plain team setup commands like
  // “make teams of 2” still go to the team orchestrator first.
  if (shouldPreferAttendanceListBeforeTeams(commandText)) {
    const presentSelectionFirst = parsePresentPlayerSelectionCommand(commandText, players);
    if (presentSelectionFirst) return presentSelectionFirst;
  }

  // Ranked roster requests such as “best 10 from the roster” or
  // “two teams of five with the best players” must be handled before the
  // current-Today team orchestrator. Otherwise the assistant may incorrectly
  // use whoever is already selected in Today.
  const rankedSelection = parseRankedRosterSelectionCommand(commandText, players);
  if (rankedSelection) return rankedSelection;

  // Team-generation and shuffle commands must be handled before generic name-list parsing.
  // Otherwise natural phrases like “shuffle the teams” or “make teams of 2” can be
  // misread as fake player names.
  const teamGeneration = parseGenerateTeamsFromSelectionCommand(commandText, players, context);
  if (teamGeneration) return teamGeneration;

  const presentSelection = parsePresentPlayerSelectionCommand(commandText, players);
  if (presentSelection) return presentSelection;

  const rosterQuestion = parseRosterQuestion(commandText, players);
  if (rosterQuestion) return rosterQuestion;

  return null;
}
