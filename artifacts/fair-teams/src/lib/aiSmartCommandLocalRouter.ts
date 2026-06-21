import type {
  AiSmartCommandAction,
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
  return normalizeText(spokenName)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function extractMaybeListSegment(commandText: string) {
  const normalized = normalizeText(commandText);
  const markers = [
    "currently present players",
    "present players",
    "players currently present",
    "players present",
    "players playing today",
    "playing today",
    "who is here",
    "who are here",
    "who are playing",
    "today are",
    "here are",
    "with",
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
  segment = segment
    .replace(/^\b(are|is|as|include|including|players|player|people|members|today|now|currently|present|playing|here|with)\b\s*/g, "")
    .replace(/\b(yeah|yes|okay|ok|uh|um|erm|please)\b/g, " ")
    .replace(/\b(that s it|thats it|that is it|that s all|thats all|that is all|and that s it|and thats it|and that is it)\b.*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return segment || normalized;
}

function likelyPresentPlayerCommand(commandText: string) {
  const normalized = normalizeText(commandText);
  const hasRosterListLanguage = /\b(present|currently present|playing today|here|today|selected|select|choose|add|also|remove|unselect|deselect|not coming|out|absent|late)\b/.test(normalized);
  const hasTeamMakingLanguage = /\b(make|create|generate|prepare|build|sort|fair|team|teams|5v5|4v4|3v3|2v2)\b/.test(normalized);
  const hasListSignal = /,|\band\b/.test(commandText) || /\bwith\b/.test(normalized);
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

function currentTodaySelectionCount(players: AiSmartCommandRosterPlayer[]) {
  return players.filter((player) => Boolean(player.attending)).length;
}

function findPlayersMentioned(commandText: string, players: AiSmartCommandRosterPlayer[]) {
  const segment = extractMaybeListSegment(commandText);
  const normalizedSegment = normalizeText(segment);
  const matched = new Map<string, { player: AiSmartCommandRosterPlayer; spokenName: string; score: number }>();

  const candidateRows = players.flatMap((player) =>
    candidateNamesForPlayer(player).map((candidate) => ({ player, candidate })),
  ).sort((a, b) => b.candidate.length - a.candidate.length);

  candidateRows.forEach(({ player, candidate }) => {
    if (!hasWordPhrase(normalizedSegment, candidate)) return;
    const existing = matched.get(player.id);
    if (!existing || candidate.length > existing.spokenName.length) {
      matched.set(player.id, { player, spokenName: candidate, score: 1 });
    }
  });

  const chunks = segment
    .split(/,|\band\b|\+|&/i)
    .map((part) => normalizeText(part))
    .map((part) => part.replace(/\b(players?|people|today|present|currently|playing|here|fair|teams?|make|create|generate|prepare|build|sort|of|a|the|with|from|now|are|is|add|also|plus|forgot|late|remove|unselect|deselect|not|coming|playing)\b/g, " "))
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2);

  const unresolved: string[] = [];
  chunks.forEach((originalChunk) => {
    let chunk = originalChunk;
    [...matched.values()].forEach((item) => {
      candidateNamesForPlayer(item.player).forEach((candidate) => {
        chunk = chunk.replace(new RegExp(`(?:^|\\s)${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "g"), " ");
      });
    });
    chunk = chunk.replace(/\s+/g, " ").trim();
    if (!chunk) return;
    if ([...matched.values()].some((item) => fuzzyNameMatchScore(chunk, item.spokenName) >= 0.92)) return;

    let best: { player: AiSmartCommandRosterPlayer; candidate: string; score: number } | null = null;
    let secondBestScore = 0;
    candidateRows.forEach(({ player, candidate }) => {
      const score = fuzzyNameMatchScore(chunk, candidate);
      if (score > (best?.score || 0)) {
        secondBestScore = best?.score || 0;
        best = { player, candidate, score };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    });

    if (best && best.score >= 0.84 && best.score - secondBestScore >= 0.04) {
      const existing = matched.get(best.player.id);
      if (!existing || best.score > existing.score) {
        matched.set(best.player.id, { player: best.player, spokenName: chunk, score: best.score });
      }
    } else if (!/\b(v|vs|versus)\b|^\d+$/.test(chunk)) {
      unresolved.push(chunk);
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
  const replaceMode = wantsReplaceToday(commandText);
  const addMode = wantsAddToToday(commandText);
  const existingSelectionCount = currentTodaySelectionCount(players);
  const ambiguousWithExistingSelection = !removeMode && !replaceMode && existingSelectionCount > 0;

  if (matched.length === 0) {
    const uniqueUnresolved = [...new Set(unresolved)].slice(0, 8);
    return localResponse({
      normalizedIntent: "Update Today, but no roster names matched",
      assistantSummary: "I understood that you want to update Today, but I could not match those names to this roster.",
      confidence: 0.84,
      actions: uniqueUnresolved.slice(0, 3).map(createAddPlayerAction),
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

    if (ambiguousWithExistingSelection && !addMode) {
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
  }

  const uniqueUnresolved = [...new Set(unresolved)].slice(0, 8);
  if (uniqueUnresolved.length > 0) {
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
  const ambiguityText = ambiguousWithExistingSelection && !addMode
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
  const playersPerTeam = parseTeamSize(normalized);
  const neededForTeamSize = playersPerTeam ? playersPerTeam * 2 : null;
  const targetCount = requestedCount || neededForTeamSize;
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

  const selectAction = createEmptyAction("select_players");
  selectAction.capabilityId = "today.select_players";
  selectAction.distribution = "replace_today_selection";
  selectAction.reason = `${wantsWeakest ? "Weakest" : "Strongest"} ${rankedPlayers.length} players by roster skill. This replaces today's current selection.`;
  selectAction.playerRefs = rankedPlayers.map((player) => ({
    playerId: player.id,
    rosterName: player.name,
    spokenName: player.name,
    confidence: 1,
  }));

  const actions: AiSmartCommandAction[] = [selectAction];
  if (playersPerTeam) {
    const sizeAction = createEmptyAction("set_team_size");
    sizeAction.capabilityId = "teams.set_team_size";
    sizeAction.playersPerTeam = playersPerTeam;
    sizeAction.reason = `${playersPerTeam}v${playersPerTeam} using the selected ${rankedPlayers.length} players.`;
    actions.push(sizeAction);
  }

  return localResponse({
    normalizedIntent: `${wantsWeakest ? "Select weakest" : "Select strongest"} ${rankedPlayers.length} roster players${playersPerTeam ? ` for ${playersPerTeam}v${playersPerTeam}` : ""}`,
    assistantSummary: `I found the ${wantsWeakest ? "weakest" : "strongest"} ${rankedPlayers.length} players in this roster by skill and prepared an exact Today selection.${playersPerTeam ? ` Then set up ${playersPerTeam}v${playersPerTeam}.` : ""}`,
    confidence: 0.98,
    actions,
    confirmations: [],
    unresolved: [],
    debugWarnings: ["Handled by Fair Teams local ranked-selection parser."],
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
): AiSmartCommandResponse | null {
  const presentSelection = parsePresentPlayerSelectionCommand(commandText, players);
  if (presentSelection) return presentSelection;

  const rankedSelection = parseRankedRosterSelectionCommand(commandText, players);
  if (rankedSelection) return rankedSelection;

  const rosterQuestion = parseRosterQuestion(commandText, players);
  if (rosterQuestion) return rosterQuestion;

  return null;
}
