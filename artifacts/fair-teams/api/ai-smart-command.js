import { getFairTeamsKnowledgeForCommand, getDirectFairTeamsAnswerForCommand, FAIR_TEAMS_KNOWLEDGE_VERSION } from "./fair-teams-knowledge.js";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_SMART_COMMAND_MODEL || "gpt-4o-mini";
const MAX_COMMAND_CHARS = 4000;
const MAX_ROSTER_PLAYERS = 80;

function serverEnabled() {
  return String(process.env.AI_SMART_COMMAND_SERVER_ENABLED || "").toLowerCase() === "true";
}

function getAllowedBranch() {
  return process.env.AI_SMART_COMMAND_ALLOWED_BRANCH || "";
}

function runningBranch() {
  return process.env.VERCEL_GIT_COMMIT_REF || process.env.VERCEL_BRANCH_URL || "";
}

function branchAllowed() {
  const allowed = getAllowedBranch().trim();
  if (!allowed) return true;
  const branch = runningBranch();
  return branch === allowed || branch.includes(allowed);
}

function cleanString(value, max = 300) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function cleanRoster(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ROSTER_PLAYERS).map((player) => {
    const item = player && typeof player === "object" ? player : {};
    return {
      id: cleanString(item.id, 120),
      name: cleanString(item.name, 120),
      aka: cleanString(item.aka, 180),
      skill: cleanNumber(item.skill),
      attack: cleanNumber(item.attack),
      defense: cleanNumber(item.defense),
      speed: cleanNumber(item.speed),
      passing: cleanNumber(item.passing),
      isGoalkeeper: Boolean(item.isGoalkeeper),
      isPlaymaker: Boolean(item.isPlaymaker),
      isFinisher: Boolean(item.isFinisher),
      isDribbler: Boolean(item.isDribbler),
      isSentinel: Boolean(item.isSentinel),
      isEngine: Boolean(item.isEngine),
      isVersatile: Boolean(item.isVersatile),
      isSpaceFinder: Boolean(item.isSpaceFinder),
      isOrganizer: Boolean(item.isOrganizer),
      gender: cleanString(item.gender, 30),
      funBadge: cleanString(item.funBadge, 60),
      attending: Boolean(item.attending),
    };
  }).filter((player) => player.id && player.name);
}

function cleanContext(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    rosterName: cleanString(item.rosterName, 120),
    rosterMode: cleanString(item.rosterMode, 30),
    activeTab: cleanString(item.activeTab, 40),
    currentTeamCount: cleanNumber(item.currentTeamCount),
    currentPlayersPerTeam: cleanNumber(item.currentPlayersPerTeam),
    uiLanguage: cleanString(item.uiLanguage, 40),
  };
}

function normalizeForMatching(value) {
  return cleanString(value, 180)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function playerNameVariants(player) {
  const variants = [player.name];
  if (player.aka) {
    player.aka
      .split(/[,/;|·•]+|\baka\b|\bAKA\b/)
      .map((part) => cleanString(part, 80))
      .filter(Boolean)
      .forEach((part) => variants.push(part));
  }
  return Array.from(new Set(variants.map((name) => cleanString(name, 80)).filter(Boolean)));
}

function buildRosterNameIndex(roster) {
  const index = [];
  for (const player of roster) {
    for (const variant of playerNameVariants(player)) {
      const normalized = normalizeForMatching(variant);
      if (normalized) {
        index.push({ normalized, label: variant, playerId: player.id, rosterName: player.name });
      }
    }
  }
  return index;
}

function splitLikelyNameList(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  if (!command) return [];

  const firstSentence = command.split(/[.!?。！？]/)[0] || command;
  let segment = firstSentence;

  const listMarkers = [
    /\bare playing today\b/i,
    /\bplaying today\b/i,
    /\bare coming today\b/i,
    /\bcoming today\b/i,
    /\bspielen heute\b/i,
    /\bkommen heute\b/i,
    /\bheute dabei\b/i,
    /\bfor today\b/i,
    /\bselect\b/i,
    /\badd to today\b/i,
    /오늘\s*(와|와요|옴|뛰어|뜀|참석|참가)/,
  ];

  for (const marker of listMarkers) {
    const match = segment.match(marker);
    if (match && typeof match.index === "number") {
      segment = segment.slice(0, match.index);
      break;
    }
  }

  const hasListShape = /[,\n]/.test(segment) || /\b(and|und|그리고|랑|와|과)\b/.test(segment);
  if (!hasListShape) return [];

  return segment
    .replace(/\b(players?|people|spieler|today|heute|playing|coming|make|teams?)\b/gi, " ")
    .split(/[,\n]+|\s+and\s+|\s+und\s+|\s+그리고\s+|\s*랑\s*|\s*와\s*|\s*과\s*/i)
    .map((part) => cleanString(part, 80))
    .map((part) => part.replace(/^(and|und|그리고)\s+/i, "").trim())
    .filter((part) => part.length >= 2 && part.length <= 50)
    .filter((part) => !/\b(\d+\s*(v|vs|gegen|대)\s*\d*|make|team|teams|spieler|players?)\b/i.test(part));
}

function matchNameCandidate(candidate, rosterIndex) {
  const normalizedCandidate = normalizeForMatching(candidate);
  if (!normalizedCandidate) return { status: "unknown", spokenName: candidate, matches: [] };

  const exact = rosterIndex.filter((entry) => entry.normalized === normalizedCandidate);
  if (exact.length === 1) {
    return { status: "matched", spokenName: candidate, playerId: exact[0].playerId, rosterName: exact[0].rosterName, matchedAlias: exact[0].label, confidence: 0.98 };
  }
  if (exact.length > 1) {
    return { status: "ambiguous", spokenName: candidate, matches: exact.slice(0, 5).map((entry) => ({ playerId: entry.playerId, rosterName: entry.rosterName, matchedAlias: entry.label })) };
  }

  const loose = rosterIndex.filter((entry) => entry.normalized.includes(normalizedCandidate) || normalizedCandidate.includes(entry.normalized));
  const uniqueLoose = [];
  for (const entry of loose) {
    if (!uniqueLoose.some((item) => item.playerId === entry.playerId)) uniqueLoose.push(entry);
  }
  if (uniqueLoose.length === 1 && normalizedCandidate.length >= 3) {
    return { status: "possible_match", spokenName: candidate, playerId: uniqueLoose[0].playerId, rosterName: uniqueLoose[0].rosterName, matchedAlias: uniqueLoose[0].label, confidence: 0.72 };
  }
  if (uniqueLoose.length > 1) {
    return { status: "ambiguous", spokenName: candidate, matches: uniqueLoose.slice(0, 5).map((entry) => ({ playerId: entry.playerId, rosterName: entry.rosterName, matchedAlias: entry.label })) };
  }
  return { status: "unknown", spokenName: candidate, matches: [] };
}

function detectPlayersPerTeam(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  const patterns = [
    /\b(\d{1,2})\s*(?:v|vs|versus|gegen|대)\s*(\d{1,2})?\b/i,
    /\b(\d{1,2})\s*(?:a\s*side|per\s*team)\b/i,
    /(\d{1,2})\s*명씩/,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) {
      const left = Number(match[1]);
      const right = match[2] ? Number(match[2]) : left;
      if (Number.isFinite(left) && left > 0 && left <= 20 && (!right || right === left)) return left;
    }
  }
  return null;
}

function detectTeamCount(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  if (!command) return null;

  const patterns = [
    /\b(?:make|create|generate|build|split(?:\s+into)?|divide(?:\s+into)?)\s+(\d{1,2})\s+teams?\b/i,
    /\b(\d{1,2})\s+teams?\b/i,
    /\b(\d{1,2})\s+mannschaften\b/i,
    /\b(\d{1,2})\s+teams?\s*(?:machen|erstellen|bilden)\b/i,
    /(\d{1,2})\s*개\s*팀/,
    /(\d{1,2})\s*팀(?:으로|으로 나눠|으로 나누| 만들어| 만들)/,
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 2 && value <= 12) return value;
  }
  return null;
}

function detectSelectAllRosterPlayers(text) {
  const command = normalizeForMatching(text);
  if (!command) return false;

  const patterns = [
    /\b(select|choose|pick|mark|add)\b.*\b(all|everyone|everybody)\b.*\b(roster|players|people)?\b/i,
    /\b(all|everyone|everybody)\b.*\b(playing|today|roster|players|selected)\b/i,
    /\b(entire|whole)\b.*\b(roster|team list|player list)\b/i,
    /\balle\b.*\b(spieler|leute|kader)\b/i,
    /\balle\b.*\b(heute|auswahlen|markieren)\b/i,
    /모든\s*(선수|사람|멤버)/,
    /(전체|전부|다)\s*(선택|참석|오늘|로스터)/,
    /(로스터|명단)\s*(전체|전부|다)/,
  ];
  return patterns.some((pattern) => pattern.test(command));
}

function extractQuotedText(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  const quotePatterns = [
    /["“”']([^"“”']{1,240})["“”']/,
    /[„‚]([^„‚]{1,240})[“‘]/,
  ];
  for (const pattern of quotePatterns) {
    const match = command.match(pattern);
    if (match?.[1]) return cleanString(match[1], 240);
  }
  return "";
}

function detectClubNoteText(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  if (!command || !/(note|notes|post.?it|club notes|notiz|notizen|memo|메모|노트|공지)/i.test(command)) return null;

  const quoted = extractQuotedText(command);
  if (quoted) return quoted;

  const patterns = [
    /(?:add|create|write|put|leave)\s+(?:a\s+)?(?:club\s+)?note\s+(?:saying|that says|with text)?\s*(.+)$/i,
    /(?:add|create|write|put|leave)\s+(.+?)\s+(?:to|in|on)\s+(?:club\s+)?notes?$/i,
    /(?:notiz|notizen)\s+(?:hinzufugen|erstellen|schreiben)\s*:?\s*(.+)$/i,
    /(?:메모|노트)\s*(?:추가|남겨|적어|써)\s*:?\s*(.+)$/i,
    /(.+?)\s*(?:라고|이라고)?\s*(?:메모|노트)\s*(?:추가|남겨|적어|써)/i,
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    const value = cleanString(match?.[1], 240);
    if (value) return value.replace(/^(saying|that says|text)\s+/i, "").trim();
  }

  return "";
}

function detectRosterColor(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  const patterns = [
    /(?:change|set|make)\s+(?:this\s+)?(?:roster|list|team\s+list)\s+color\s+(?:to\s+)?([\p{L}\p{N} -]{2,40})/iu,
    /(?:change|set|make)\s+(?:this\s+)?(?:roster|list|team\s+list)\s+([\p{L}\p{N} -]{2,40})\s*(?:color|colou?r)?$/iu,
    /(?:roster|liste|kader)\s*(?:farbe|color)\s*(?:auf|to)?\s*([\p{L}\p{N} -]{2,40})/iu,
    /(?:로스터|명단)\s*(?:색|색깔)\s*([\p{L}\p{N} -]{2,40})/iu,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    const color = cleanString(match?.[1], 40).replace(/[.!?。！？]+$/, "");
    if (color) return color;
  }
  return null;
}

function detectRosterRename(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  const quoted = extractQuotedText(command);
  const patterns = [
    /(?:rename|call)\s+(?:this\s+)?(?:roster|list|team\s+list)\s+(?:to\s+)?(.+)$/i,
    /(?:roster|list|team\s+list)\s+(?:name\s+)?(?:to|as)\s+(.+)$/i,
    /(?:kader|liste)\s+(?:umbenennen|nennen)\s*(?:in|zu)?\s*(.+)$/i,
    /(?:로스터|명단)\s*(?:이름|제목)?\s*(?:바꿔|변경)\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (!match) continue;
    const target = cleanString(quoted || match?.[1], 120).replace(/[.!?。！？]+$/, "");
    if (target) return target;
  }
  return null;
}

function detectOpenArea(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized) return null;
  const hasOpen = /\b(open|show|go to|switch to|bring me to|zeige|offne|geh zu|로 가|열어|보여)\b/i.test(normalized);
  if (!hasOpen) return null;
  if (/\b(roster|players|spieler|kader|명단|선수)\b/i.test(normalized)) return "roster";
  if (/\b(today|attendance|heute|오늘|참석)\b/i.test(normalized)) return "today";
  if (/\b(teams|team results|mannschaften|팀)\b/i.test(normalized)) return "teams";
  if (/\b(club|organizers|notes|equipment|클럽|메모|장비)\b/i.test(normalized)) return "club";
  return null;
}

function detectGenerateTeams(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized) return false;
  const patterns = [
    /\b(make|create|generate|build|split|divide)\b.*\bteams?\b/i,
    /\bteams?\b.*\b(make|create|generate|build)\b/i,
    /\bteams?\s*(?:machen|erstellen|bilden|generieren)\b/i,
    /\bmannschaften\s*(?:machen|erstellen|bilden)\b/i,
    /(팀)\s*(만들|짜|나눠|생성)/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function detectSpreadRole(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized) return null;
  const roleMap = [
    { role: "defender", patterns: [/defender/i, /defense/i, /verteidiger/i, /수비/] },
    { role: "attacker", patterns: [/attacker/i, /striker/i, /forward/i, /sturm/i, /공격/] },
    { role: "goalkeeper", patterns: [/goalkeeper/i, /keeper/i, /torwart/i, /키퍼|골키퍼/] },
    { role: "strong_player", patterns: [/strong/i, /best/i, /stark/i, /잘하는|강한/] },
    { role: "beginner", patterns: [/beginner/i, /new player/i, /anfanger/i, /초보/] },
  ];
  const hasSpread = /(one|each|every|spread|separate|distribute|balance|jeder|pro team|나눠|각 팀|한 명씩)/i.test(normalized);
  if (!hasSpread) return null;
  for (const item of roleMap) {
    if (item.patterns.some((pattern) => pattern.test(normalized))) {
      return { role: item.role, distribution: "spread_across_teams" };
    }
  }
  return null;
}

function looksLikeEquipmentText(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  if (!command) return false;
  return /(equipment|bag|bags|ball bag|bib bag|bibs|vests|cones|pump|football|balls|jerseys|kit|gear|ausrustung|ausrüstung|tasche|balltasche|balle|bälle|leibchen|hütchen|pumpe|trikots|장비|가방|공|조끼|콘|펌프)/iu.test(command);
}

function looksLikeFairTeamsQuestion(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  const normalized = normalizeForMatching(command);
  if (!normalized) return false;
  if (/[?？]$/.test(command.trim())) return true;
  return /^(what|why|how|where|when|who|which|can you explain|could you explain|tell me about|explain|was|wie|warum|wo|wann|wer|welche|was ist|wie funktioniert|erklar|erklär|erzaehl|erzähl|무엇|뭐|왜|어떻게|어디|언제|누가|설명|알려)/iu.test(normalized);
}

function looksLikeEquipmentActionText(text) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  if (!looksLikeEquipmentText(command)) return false;
  return /(move|give|assign|hand|transfer|put|set|change|bring|take|has|holds|holder|carry|carries|shift|add|create|make|new|verschieb|gib|hat|zu|bei|hinzufugen|hinzufügen|erstellen|옮겨|줘|담당|가지|가져|넘겨|추가|만들|등록)/iu.test(command);
}

function cleanEquipmentItemName(value) {
  return cleanString(value, 120)
    .replace(/^(the|a|an|this|that|one|specific|equipment|bag|item)\s+/i, "")
    .replace(/\s+(from|to|with|bei|zu|an|에게|한테)\s+.*$/iu, "")
    .replace(/[.!?。！？]+$/g, "")
    .trim();
}

function matchDestinationPlayer(value, rosterIndex) {
  const name = cleanString(value, 80).replace(/[.!?。！？]+$/g, "").trim();
  if (!name) return null;
  const match = matchNameCandidate(name, rosterIndex);
  if ((match.status === "matched" || match.status === "possible_match") && match.playerId) {
    return {
      playerId: match.playerId,
      rosterName: match.rosterName || name,
      spokenName: name,
      confidence: match.confidence || 0.8,
    };
  }
  return { playerId: null, rosterName: null, spokenName: name, confidence: 0 };
}

function detectEquipmentAction(text, roster) {
  const command = cleanString(text, MAX_COMMAND_CHARS);
  if (!command || !looksLikeEquipmentText(command) || !looksLikeEquipmentActionText(command)) return null;

  const rosterIndex = buildRosterNameIndex(roster);
  const quoted = extractQuotedText(command);
  const isAdd = /\b(add|create|make|new|write|put)\b/i.test(command) && /\b(equipment|bag|item|gear|ball|bibs|cones|pump|장비|가방|공|조끼|콘|펌프)\b/iu.test(command);
  const isMove = /(move|give|assign|hand|transfer|put|set|change|bring|take|has|holds|holder|carry|carries|shift|move it|verschieb|gib|hat|zu|bei|옮겨|줘|담당|가지|가져|넘겨)/iu.test(command);

  if (isMove) {
    const patterns = [
      /(?:move|give|assign|hand|transfer|put|set|change|bring|take)\s+(?:the\s+)?(.+?)\s+(?:from\s+.+?\s+)?(?:to|for|with|under)\s+([\p{L}\p{N} ._'-]{2,80})/iu,
      /(?:move|give|assign|hand|transfer|put|set|change|bring|take)\s+(?:the\s+)?(.+?)\s+(?:zu|bei|an)\s+([\p{L}\p{N} ._'-]{2,80})/iu,
      /(?:move|give|assign|hand|transfer|put|set|change|bring|take)\s+(?:the\s+)?(.+?)\s+(?:에게|한테|로|으로)\s*([\p{L}\p{N} ._'-]{2,80})/iu,
      /([\p{L}\p{N} ._'-]{2,80})\s+(?:has|holds|takes|gets|carries)\s+(?:the\s+)?(.+?)(?:$|[.!?。！？])/iu,
      /([\p{L}\p{N} ._'-]{2,80})\s+(?:hat|nimmt|tragt|trägt|bekommt)\s+(?:die|den|das)?\s*(.+?)(?:$|[.!?。！？])/iu,
      /([\p{L}\p{N} ._'-]{2,80})\s*(?:가|이)?\s*(.+?)\s*(?:가져|가지|담당|들고|맡아)/iu,
    ];

    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (!match) continue;
      const first = cleanString(match[1], 120);
      const second = cleanString(match[2], 120);
      const destinationFirst = /\b(has|holds|takes|gets|carries|hat|nimmt|tragt|trägt|bekommt)\b/i.test(match[0]) || /(?:가져|가지|담당|들고|맡아)/.test(match[0]);
      const itemName = cleanEquipmentItemName(quoted || (destinationFirst ? second : first));
      const destinationName = cleanString(destinationFirst ? first : second, 80);
      const destinationRef = matchDestinationPlayer(destinationName, rosterIndex);
      return {
        type: "equipment_move_item",
        targetName: itemName || null,
        playerRefs: destinationRef ? [destinationRef] : [],
        rawDestinationName: destinationName || null,
        noteText: destinationName ? `Move ${itemName || "equipment item"} to ${destinationName}.` : null,
        missing: !itemName ? "item" : !destinationName ? "destination" : null,
      };
    }

    const itemOnly = cleanEquipmentItemName(quoted || command.replace(/^(please\s+)?(move|give|assign|hand|transfer|put|set|change|bring|take)\s+/i, ""));
    return {
      type: "equipment_move_item",
      targetName: itemOnly || null,
      playerRefs: [],
      rawDestinationName: null,
      noteText: itemOnly ? `Move ${itemOnly}.` : null,
      missing: itemOnly ? "destination" : "item_and_destination",
    };
  }

  if (isAdd) {
    const patterns = [
      /(?:add|create|make|new)\s+(?:an?\s+)?(?:equipment\s+)?(?:bag|item)?\s*(.+)$/iu,
      /(?:add|create|make|new)\s+(.+?)\s+(?:to|in|on)\s+(?:the\s+)?equipment(?:\s+board)?$/iu,
      /(?:장비|가방|공|조끼|콘|펌프)\s*(?:추가|만들|등록)\s*:?\s*(.+)$/iu,
    ];
    for (const pattern of patterns) {
      const match = command.match(pattern);
      const itemName = cleanEquipmentItemName(quoted || match?.[1]);
      if (itemName) {
        return {
          type: "equipment_add_item",
          targetName: itemName,
          playerRefs: [],
          rawDestinationName: null,
          noteText: itemName,
          missing: null,
        };
      }
    }
    return { type: "equipment_add_item", targetName: null, playerRefs: [], rawDestinationName: null, noteText: null, missing: "item" };
  }

  return {
    type: "equipment_move_item",
    targetName: null,
    playerRefs: [],
    rawDestinationName: null,
    noteText: null,
    missing: "item_and_destination",
  };
}

function buildCommandHints(commandText, roster) {
  const rosterIndex = buildRosterNameIndex(roster);
  const candidateNames = Array.from(new Set(splitLikelyNameList(commandText)));
  const candidatePlayers = candidateNames.map((candidate) => matchNameCandidate(candidate, rosterIndex));
  const playersPerTeam = detectPlayersPerTeam(commandText);
  const teamCount = detectTeamCount(commandText);
  const selectAllRosterPlayers = detectSelectAllRosterPlayers(commandText);
  const clubNoteText = detectClubNoteText(commandText);
  const rosterColor = detectRosterColor(commandText);
  const rosterRename = detectRosterRename(commandText);
  const targetArea = detectOpenArea(commandText);
  const generateTeams = detectGenerateTeams(commandText);
  const spreadRole = detectSpreadRole(commandText);
  const equipmentAction = detectEquipmentAction(commandText, roster);
  const matchedCount = candidatePlayers.filter((item) => item.status === "matched" || item.status === "possible_match").length;
  const unknownCount = candidatePlayers.filter((item) => item.status === "unknown").length;
  return {
    appKnowledgeVersion: `2026-06-20.smart-command-v6-knowledge-base:${FAIR_TEAMS_KNOWLEDGE_VERSION}`,
    candidateNames,
    candidatePlayers,
    selectAllRosterPlayers,
    detectedPlayersPerTeam: playersPerTeam,
    detectedTeamCount: teamCount,
    detectedClubNoteText: clubNoteText,
    detectedRosterColor: rosterColor,
    detectedRosterRename: rosterRename,
    detectedTargetArea: targetArea,
    detectedGenerateTeams: generateTeams,
    detectedSpreadRole: spreadRole,
    detectedEquipmentAction: equipmentAction,
    expectedPlayerCountForRequestedGame: playersPerTeam ? playersPerTeam * 2 : null,
    listedPlayerCount: candidateNames.length || null,
    strictAttendanceExtraction: candidateNames.length >= 8 ? "long_list_do_not_drop_names" : "normal",
    selectedAllPlayerCount: selectAllRosterPlayers ? roster.length : null,
    matchedListedPlayerCount: matchedCount || null,
    unknownListedPlayerCount: unknownCount || null,
    instruction: "These are deterministic hints from Fair Teams before calling AI. Use them unless the user text clearly contradicts them. Every candidate name must be represented in actions, confirmations, or unresolved items. For long attendance lists, do not summarize, truncate, or silently drop uncertain names; include low-confidence person-name candidates instead. If selectAllRosterPlayers is true, select every roster player. If detectedTeamCount is set, set that many teams; do not confuse it with players per team. If detectedClubNoteText, roster color, roster rename, target area, generate teams, spread role, or detectedEquipmentAction is set, return the matching app action even if not executable yet. Equipment move requests should mention the bag/item in targetName and the destination holder in playerRefs when known.",
  };
}

function fairTeamsOperatingManual() {
  return `FAIR TEAMS APP OPERATING MANUAL

Core app idea:
- Fair Teams helps a casual football organizer keep a roster, mark who is playing today, and generate balanced teams.
- The AI is an interpreter. It translates messy user language into allowed Fair Teams actions. It must not directly invent final teams.
- The existing app/team generator remains responsible for balancing and final team generation.

Main app areas:
1. Roster: all known players in the selected roster. Existing players have IDs. Unknown spoken names are not roster players yet.
2. Today: today's attendance/selection. Commands like "X is playing", "X kommt", "X 오늘 와", or a plain comma-separated list usually mean select those players for Today.
3. Teams: generated team results. Commands like "make teams" or "generate" request generation after setup actions are applied.
4. Club/shared rosters: shared rosters use simpler shared identity/Club rating ideas. Avoid private advanced assumptions unless data is present.

Fair Teams rating and roster-mode knowledge:
- If the user says "non-shared roster rating", "normal rating", "private rating", or "local rating", interpret the question in Fair Teams terms, not as generic sports analytics.
- In Fair Teams, a non-shared/local/private roster uses the normal private player profile. The organizer's own ratings and details are stored locally and used directly by the team generator.
- Normal private/local roster rating can include the main skill/OVR plus private advanced attributes such as attack, defense, passing, speed, and private special traits/abilities when the roster uses the full private profile.
- A shared/Club roster is different: each organizer submits their own private simple rating for a player. Other organizers do not see that person's individual rating.
- Shared/Club team generation uses the Club average/consensus rating, not one organizer's private advanced profile.
- In shared/Club mode, a collaborator normally sees the Club average only after submitting their own rating for that player, to reduce bias.
- Organizers can skip players they do not know and rate them later. Skipped/unrated players should appear as needing that organizer's rating.
- Shared/Club player edit is identity-focused: name, AKA/aliases, gender/category, vibe/personality note, and similar shared-safe identity fields. Private photos, advanced ratings, special abilities, and private details are not shared through Club rating.
- If the user asks "what is the difference between non-shared roster rating and normal rating", explain that those are effectively the same idea in Fair Teams if they mean local/private roster rating. The real contrast is private/local rating versus shared/Club average rating.
- Do not answer rating questions with generic phrases like "individual performance metrics" or "team dynamics". Answer concretely from the Fair Teams product model.

5. Equipment Board: shared/local organizer space for football bags and equipment. Bags/items have names and holders/owners. Commands like "move bib bag to Sarah", "George has the cones now", "give the blue ball bag to Tommy", "bibs Tasche zu Jan", or "조지에게 공 가방 줘" are equipment_move_item. Use targetName for the bag/item and playerRefs for the destination holder when the person is known. If the bag/item or destination is missing, ask a clarifying question instead of failing.

Important roster rules:
- Match player names using name and aka/aliases.
- Do not invent player IDs.
- If the user names an existing player, return that player in playerRefs.
- If the user names someone not in the roster, return add_new_player_suggestion and a missing_player confirmation.
- If a name could be several players, return ambiguous_player confirmation.
- Do not silently ignore names in a player list. For long lists, preserve the spoken order and include every possible person-name candidate, even if confidence is low.

Today/player-list rules:
- "Joon, Jorge, Jan are playing today" = select Joon, Jorge, Jan.
- "Tanja is late" or "Joon, Jorge and Tanja are here, but Tanja is late" = select the named players and mark the late player with mark_players_late.
- "Joon, Jorge, Jan. 5v5" also likely means select those names for Today.
- "5v5" means playersPerTeam=5, not five total players. Normally 5v5 needs 10 selected players.
- "make 6 teams" means teamCount=6, not 6v6.
- "select all players on the roster", "everyone is playing", "alle Spieler", or "모든 선수" means select every player in the current roster for Today.
- If only 5 names are listed for 5v5, set team size but add unresolved/missing_context explaining the mismatch.

Pairing rules:
- "Sarah and Tommy don't like each other", "nicht zusammen", "같이 두지 마" = add_pairing_rule keep_separate.
- "Sarah and Tommy came together", "couple", "same car", "같이" when positive = keep_together.

Team locks / colors:
- "George red", "George wears red", "George 빨강팀" = lock_player_to_team with teamLabel red.
- Team labels can be colors or app team labels. Keep the label exactly as user intended.

Balancing preferences:
- "one good defender in each team" = spread_role_across_teams, role defender, distribution one_per_team.
- "separate strong players" = balance_by_attribute or spread_role_across_teams with strong_player when appropriate.
- Use player stats/flags if present: defense, attack, passing, speed, skill, goalkeeper, playmaker, finisher, dribbler, sentinel, engine, versatile, space finder.
- If the role cannot be inferred from data, ask a clarifying question instead of pretending.

New player and skill rules:
- "Kira is a bit experienced" can suggest skill around 7/10.
- Beginner/new = 3-4. Average/okay = 5. Experienced/good = 7. Very strong = 8-9.
- Adding a player or setting a new-player skill requires confirmation.

Safety rules:
- No destructive roster changes without confirmation.
- Do not remove players unless the user explicitly asks and confirmation is required.
- Keep output concise and actionable.
- Prefer doing obvious safe setup actions and asking only for exceptions.`;
}



function fairTeamsCapabilityManifest() {
  return `FAIR TEAMS AI CAPABILITY MANIFEST

Important design rule:
- The AI may understand many app requests, but it may only mark actions as executable when the current app patch has an actual safe handler.
- If the intent is understood but not wired, return the appropriate action type with supportStatus="understood_not_wired" and explain that it is not wired yet.
- If the action is safe to preview but not apply yet, use supportStatus="preview_only".
- If the action is currently executable, use supportStatus="executable".

Currently executable in this test patch:
1. club.add_note -> type club_add_note
   - Adds a non-destructive post-it text to Club Notes.
   - Extract noteText exactly from commands like "add a note saying ...", "put ... in Club Notes", "Club Notes에 ... 적어줘".
   - Requires current shared roster + signed-in user at app level. If missing, the app will reject safely.

Currently understood but preview-only:
2. today.select_players -> type select_players
3. teams.set_team_size -> type set_team_size
4. teams.set_team_count -> type set_team_count
5. teams.pairing_rule -> type add_pairing_rule
6. teams.lock_player -> type lock_player_to_team
7. teams.spread_role -> type spread_role_across_teams
8. teams.balance_attribute -> type balance_by_attribute
9. teams.generate -> type generate_teams
10. roster.add_new_player -> type add_new_player_suggestion
11. roster.set_new_player_skill -> type set_new_player_skill

Understood but not wired yet:
12. roster.set_color -> type set_roster_color. Extract colorName/targetName.
13. roster.rename -> type rename_roster. Extract targetName.
14. navigation.open_area -> type open_app_area. Extract targetArea roster/today/teams/club.
15. equipment.add_item -> type equipment_add_item. Extract targetName/noteText when useful. Understood but not wired yet.
16. equipment.move_item -> type equipment_move_item. Extract targetName for the bag/item and playerRefs for the destination holder. Understood but not wired yet. If the item or destination is unclear, ask a clarifying question and use supportStatus="needs_confirmation".
17. club.delete_note -> type club_delete_note. Destructive; requires confirmation and not executable yet.

Field rules:
- Always include capabilityId for known capabilities, e.g. club.add_note or roster.set_color.
- Use noteText only for note/equipment text content.
- Use colorName for colors like navy, pink, red, blue, purple.
- Use targetName for roster names, equipment names, or rename targets.
- Use targetArea for app areas such as roster, today, teams, club.
- Use unsupported_action only if the request is outside Fair Teams app capability, not just unwired.`;
}

const jsonSchema = {
  name: "fair_teams_smart_command",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "ok", "detectedLanguage", "normalizedIntent", "assistantSummary", "confidence", "actions", "confirmations", "unresolved"],
    properties: {
      schemaVersion: { type: "number" },
      ok: { type: "boolean" },
      detectedLanguage: { type: "string" },
      normalizedIntent: { type: "string" },
      assistantSummary: { type: "string" },
      confidence: { type: "number" },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "playerRefs", "newPlayerName", "suggestedSkill", "playersPerTeam", "teamCount", "pairingKind", "teamLabel", "role", "attribute", "distribution", "noteText", "colorName", "targetName", "targetArea", "capabilityId", "supportStatus", "requiresConfirmation", "reason"],
          properties: {
            type: { type: "string", enum: ["select_players", "unselect_players", "mark_players_late", "add_new_player_suggestion", "set_new_player_skill", "set_team_size", "set_team_count", "add_pairing_rule", "lock_player_to_team", "spread_role_across_teams", "balance_by_attribute", "generate_teams", "club_add_note", "club_delete_note", "set_roster_color", "rename_roster", "open_app_area", "equipment_add_item", "equipment_move_item", "ask_confirmation", "ask_clarifying_question", "unsupported_action", "no_action"] },
            playerRefs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["playerId", "rosterName", "spokenName", "confidence"],
                properties: {
                  playerId: { type: ["string", "null"] },
                  rosterName: { type: ["string", "null"] },
                  spokenName: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            },
            newPlayerName: { type: ["string", "null"] },
            suggestedSkill: { type: ["number", "null"] },
            playersPerTeam: { type: ["number", "null"] },
            teamCount: { type: ["number", "null"] },
            pairingKind: { type: ["string", "null"], enum: ["keep_together", "keep_separate", "unknown", null] },
            teamLabel: { type: ["string", "null"] },
            role: { type: ["string", "null"], enum: ["defender", "attacker", "goalkeeper", "playmaker", "fast_player", "strong_player", "beginner", "experienced_player", "unknown", null] },
            attribute: { type: ["string", "null"] },
            distribution: { type: ["string", "null"] },
            noteText: { type: ["string", "null"] },
            colorName: { type: ["string", "null"] },
            targetName: { type: ["string", "null"] },
            targetArea: { type: ["string", "null"] },
            capabilityId: { type: ["string", "null"] },
            supportStatus: { type: ["string", "null"], enum: ["executable", "preview_only", "understood_not_wired", "needs_confirmation", "unsafe", "unknown", null] },
            requiresConfirmation: { type: "boolean" },
            reason: { type: ["string", "null"] }
          }
        }
      },
      confirmations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "type", "message", "playerRefs", "suggestedActionType"],
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["missing_player", "ambiguous_player", "add_rule", "add_new_player", "apply_action", "unsupported", "destructive_action", "unclear"] },
            message: { type: "string" },
            playerRefs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["playerId", "rosterName", "spokenName", "confidence"],
                properties: {
                  playerId: { type: ["string", "null"] },
                  rosterName: { type: ["string", "null"] },
                  spokenName: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            },
            suggestedActionType: { type: ["string", "null"], enum: ["select_players", "unselect_players", "mark_players_late", "add_new_player_suggestion", "set_new_player_skill", "set_team_size", "set_team_count", "add_pairing_rule", "lock_player_to_team", "spread_role_across_teams", "balance_by_attribute", "generate_teams", "club_add_note", "club_delete_note", "set_roster_color", "rename_roster", "open_app_area", "equipment_add_item", "equipment_move_item", "ask_confirmation", "ask_clarifying_question", "unsupported_action", "no_action", null] }
          }
        }
      },
      unresolved: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "issue", "message"],
          properties: {
            text: { type: "string" },
            issue: { type: "string", enum: ["unknown_player", "ambiguous_player", "unknown_intent", "missing_context", "unsupported_action"] },
            message: { type: "string" }
          }
        }
      }
    }
  }
};


function makePlayerRef(player, spokenName) {
  return {
    playerId: player?.id || null,
    rosterName: player?.name || null,
    spokenName: spokenName || player?.name || "",
    confidence: player?.id ? 1 : 0,
  };
}

function baseAction(type, overrides = {}) {
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
    supportStatus: "preview_only",
    requiresConfirmation: false,
    reason: null,
    ...overrides,
  };
}

function buildDeterministicPlan(commandHints, roster) {
  const actions = [];
  const confirmations = [];
  const unresolved = [];

  const matchedRefs = [];
  for (const candidate of commandHints.candidatePlayers || []) {
    if ((candidate.status === "matched" || candidate.status === "possible_match") && candidate.playerId) {
      matchedRefs.push({
        playerId: candidate.playerId,
        rosterName: candidate.rosterName || candidate.spokenName,
        spokenName: candidate.spokenName,
        confidence: candidate.confidence || (candidate.status === "matched" ? 0.98 : 0.72),
      });
    }
    if (candidate.status === "unknown") {
      actions.push(baseAction("add_new_player_suggestion", {
        newPlayerName: candidate.spokenName,
        capabilityId: "roster.add_new_player",
        supportStatus: "needs_confirmation",
        requiresConfirmation: true,
        reason: `${candidate.spokenName} is not in this roster yet.`,
      }));
      confirmations.push({
        id: `missing-${normalizeForMatching(candidate.spokenName) || candidate.spokenName}`,
        type: "missing_player",
        message: `${candidate.spokenName} is not in this roster. Add as a new player?`,
        playerRefs: [{ playerId: null, rosterName: null, spokenName: candidate.spokenName, confidence: 0 }],
        suggestedActionType: "add_new_player_suggestion",
      });
    }
    if (candidate.status === "ambiguous") {
      confirmations.push({
        id: `ambiguous-${normalizeForMatching(candidate.spokenName) || candidate.spokenName}`,
        type: "ambiguous_player",
        message: `${candidate.spokenName} could match more than one player. Please choose the right one.`,
        playerRefs: (candidate.matches || []).map((match) => ({
          playerId: match.playerId || null,
          rosterName: match.rosterName || null,
          spokenName: candidate.spokenName,
          confidence: 0.5,
        })),
        suggestedActionType: "select_players",
      });
    }
  }

  if (matchedRefs.length > 0) {
    actions.unshift(baseAction("select_players", {
      playerRefs: matchedRefs,
      capabilityId: "today.select_players",
      supportStatus: "preview_only",
      reason: "Select the named existing players for Today.",
    }));
  }

  if (commandHints.selectAllRosterPlayers && roster.length > 0) {
    actions.unshift(baseAction("select_players", {
      playerRefs: roster.map((player) => makePlayerRef(player)),
      capabilityId: "today.select_players",
      supportStatus: "preview_only",
      reason: "Select every player in the current roster for Today.",
    }));
  }

  if (commandHints.detectedPlayersPerTeam) {
    actions.push(baseAction("set_team_size", {
      playersPerTeam: commandHints.detectedPlayersPerTeam,
      capabilityId: "teams.set_team_size",
      supportStatus: "preview_only",
      reason: `Set the match to ${commandHints.detectedPlayersPerTeam}v${commandHints.detectedPlayersPerTeam}.`,
    }));
  }

  if (commandHints.detectedTeamCount) {
    actions.push(baseAction("set_team_count", {
      teamCount: commandHints.detectedTeamCount,
      capabilityId: "teams.set_team_count",
      supportStatus: "preview_only",
      reason: `Create ${commandHints.detectedTeamCount} teams.`,
    }));
  }

  if (typeof commandHints.detectedClubNoteText === "string") {
    actions.push(baseAction("club_add_note", {
      noteText: commandHints.detectedClubNoteText,
      capabilityId: "club.add_note",
      supportStatus: commandHints.detectedClubNoteText ? "executable" : "needs_confirmation",
      requiresConfirmation: !commandHints.detectedClubNoteText,
      reason: commandHints.detectedClubNoteText ? "Add this text to Club Notes." : "The command mentions Club Notes, but the note text is unclear.",
    }));
  }

  if (commandHints.detectedRosterColor) {
    actions.push(baseAction("set_roster_color", {
      colorName: commandHints.detectedRosterColor,
      capabilityId: "roster.set_color",
      supportStatus: "understood_not_wired",
      reason: "Fair Teams understood the color change, but roster color changes are not wired to AI yet.",
    }));
  }

  if (commandHints.detectedRosterRename) {
    actions.push(baseAction("rename_roster", {
      targetName: commandHints.detectedRosterRename,
      capabilityId: "roster.rename",
      supportStatus: "understood_not_wired",
      reason: "Fair Teams understood the rename request, but roster rename is not wired to AI yet.",
    }));
  }

  if (commandHints.detectedTargetArea) {
    actions.push(baseAction("open_app_area", {
      targetArea: commandHints.detectedTargetArea,
      capabilityId: "navigation.open_area",
      supportStatus: "understood_not_wired",
      reason: "Fair Teams understood the navigation request, but AI navigation is not wired yet.",
    }));
  }

  if (commandHints.detectedSpreadRole) {
    actions.push(baseAction("spread_role_across_teams", {
      role: commandHints.detectedSpreadRole.role,
      distribution: commandHints.detectedSpreadRole.distribution,
      capabilityId: "teams.spread_role",
      supportStatus: "preview_only",
      reason: `Spread ${commandHints.detectedSpreadRole.role.replace(/_/g, " ")} across teams.`,
    }));
  }

  if (commandHints.detectedEquipmentAction) {
    const equipment = commandHints.detectedEquipmentAction;
    const capabilityId = equipment.type === "equipment_add_item" ? "equipment.add_item" : "equipment.move_item";
    const label = equipment.type === "equipment_add_item" ? "Add equipment item" : "Move equipment item";
    actions.push(baseAction(equipment.type, {
      playerRefs: Array.isArray(equipment.playerRefs) ? equipment.playerRefs : [],
      targetName: equipment.targetName || null,
      noteText: equipment.noteText || null,
      capabilityId,
      supportStatus: equipment.missing ? "needs_confirmation" : "understood_not_wired",
      requiresConfirmation: Boolean(equipment.missing),
      reason: equipment.missing
        ? `${label} understood, but Fair Teams needs the ${equipment.missing.replace(/_/g, " ")}.`
        : `${label} understood, but Equipment Board changes are not wired to AI yet.`,
    }));
    if (equipment.missing) {
      unresolved.push({
        text: equipment.targetName || "equipment request",
        issue: "missing_context",
        message: equipment.missing === "destination"
          ? "Which person should hold this equipment bag?"
          : equipment.missing === "item"
            ? "Which equipment bag or item should I move?"
            : "Which equipment bag should move, and who should hold it?",
      });
    }
  }

  if (commandHints.detectedGenerateTeams) {
    actions.push(baseAction("generate_teams", {
      capabilityId: "teams.generate",
      supportStatus: "preview_only",
      reason: "Generate teams after setup actions are applied.",
    }));
  }

  if (commandHints.detectedPlayersPerTeam && commandHints.listedPlayerCount && commandHints.listedPlayerCount < commandHints.expectedPlayerCountForRequestedGame) {
    unresolved.push({
      text: `${commandHints.listedPlayerCount} listed players for ${commandHints.detectedPlayersPerTeam}v${commandHints.detectedPlayersPerTeam}`,
      issue: "missing_context",
      message: `${commandHints.detectedPlayersPerTeam}v${commandHints.detectedPlayersPerTeam} needs ${commandHints.expectedPlayerCountForRequestedGame} players, but only ${commandHints.listedPlayerCount} names were listed.`,
    });
  }

  if (commandHints.detectedTeamCount && commandHints.selectAllRosterPlayers && roster.length > 0 && roster.length < commandHints.detectedTeamCount) {
    unresolved.push({
      text: `${roster.length} players for ${commandHints.detectedTeamCount} teams`,
      issue: "missing_context",
      message: `You have ${roster.length} roster players, which is fewer than ${commandHints.detectedTeamCount} teams.`,
    });
  }

  return { actions, confirmations, unresolved };
}

function buildDeterministicActions(commandHints, roster) {
  return buildDeterministicPlan(commandHints, roster).actions;
}

function hasAction(actions, type) {
  return Array.isArray(actions) && actions.some((action) => action?.type === type);
}

const KNOWN_ACTION_TYPES = new Set(jsonSchema.schema.properties.actions.items.properties.type.enum);
const KNOWN_CONFIRMATION_TYPES = new Set(jsonSchema.schema.properties.confirmations.items.properties.type.enum);
const KNOWN_UNRESOLVED_ISSUES = new Set(jsonSchema.schema.properties.unresolved.items.properties.issue.enum);
const KNOWN_SUPPORT_STATUSES = new Set(["executable", "preview_only", "understood_not_wired", "needs_confirmation", "unsafe", "unknown"]);

const CAPABILITY_STATUS_BY_ACTION = {
  select_players: ["today.select_players", "preview_only"],
  unselect_players: ["today.select_players", "preview_only"],
  mark_players_late: ["today.mark_late", "executable"],
  set_team_size: ["teams.set_team_size", "preview_only"],
  set_team_count: ["teams.set_team_count", "preview_only"],
  add_pairing_rule: ["teams.pairing_rule", "preview_only"],
  lock_player_to_team: ["teams.lock_player", "preview_only"],
  spread_role_across_teams: ["teams.spread_role", "preview_only"],
  balance_by_attribute: ["teams.balance_attribute", "preview_only"],
  generate_teams: ["teams.generate", "preview_only"],
  add_new_player_suggestion: ["roster.add_new_player", "needs_confirmation"],
  set_new_player_skill: ["roster.set_new_player_skill", "needs_confirmation"],
  club_add_note: ["club.add_note", "executable"],
  club_delete_note: ["club.delete_note", "unsafe"],
  set_roster_color: ["roster.set_color", "understood_not_wired"],
  rename_roster: ["roster.rename", "understood_not_wired"],
  open_app_area: ["navigation.open_area", "executable"],
  equipment_add_item: ["equipment.add_item", "understood_not_wired"],
  equipment_move_item: ["equipment.move_item", "understood_not_wired"],
};

function normalizePlayerRef(ref) {
  const item = ref && typeof ref === "object" ? ref : {};
  return {
    playerId: typeof item.playerId === "string" && item.playerId ? item.playerId : null,
    rosterName: typeof item.rosterName === "string" && item.rosterName ? cleanString(item.rosterName, 120) : null,
    spokenName: cleanString(item.spokenName, 120),
    confidence: Number.isFinite(Number(item.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : 0,
  };
}

function normalizeAction(action) {
  const item = action && typeof action === "object" ? action : {};
  const rawType = cleanString(item.type, 80);
  const type = KNOWN_ACTION_TYPES.has(rawType) ? rawType : "unsupported_action";
  const capabilityDefault = CAPABILITY_STATUS_BY_ACTION[type] || [null, type === "unsupported_action" ? "understood_not_wired" : "unknown"];
  const rawStatus = cleanString(item.supportStatus, 40);
  const supportStatus = KNOWN_SUPPORT_STATUSES.has(rawStatus) ? rawStatus : capabilityDefault[1];
  const playerRefs = Array.isArray(item.playerRefs) ? item.playerRefs.map(normalizePlayerRef).filter((ref) => ref.spokenName || ref.rosterName || ref.playerId) : [];
  return baseAction(type, {
    playerRefs,
    newPlayerName: typeof item.newPlayerName === "string" && item.newPlayerName.trim() ? cleanString(item.newPlayerName, 120) : null,
    suggestedSkill: Number.isFinite(Number(item.suggestedSkill)) ? Math.max(1, Math.min(10, Number(item.suggestedSkill))) : null,
    playersPerTeam: Number.isFinite(Number(item.playersPerTeam)) ? Number(item.playersPerTeam) : null,
    teamCount: Number.isFinite(Number(item.teamCount)) ? Number(item.teamCount) : null,
    pairingKind: ["keep_together", "keep_separate", "unknown"].includes(item.pairingKind) ? item.pairingKind : null,
    teamLabel: typeof item.teamLabel === "string" && item.teamLabel.trim() ? cleanString(item.teamLabel, 80) : null,
    role: ["defender", "attacker", "goalkeeper", "playmaker", "fast_player", "strong_player", "beginner", "experienced_player", "unknown"].includes(item.role) ? item.role : null,
    attribute: typeof item.attribute === "string" && item.attribute.trim() ? cleanString(item.attribute, 80) : null,
    distribution: typeof item.distribution === "string" && item.distribution.trim() ? cleanString(item.distribution, 120) : null,
    noteText: typeof item.noteText === "string" && item.noteText.trim() ? cleanString(item.noteText, 240) : null,
    colorName: typeof item.colorName === "string" && item.colorName.trim() ? cleanString(item.colorName, 40) : null,
    targetName: typeof item.targetName === "string" && item.targetName.trim() ? cleanString(item.targetName, 120) : null,
    targetArea: typeof item.targetArea === "string" && item.targetArea.trim() ? cleanString(item.targetArea, 40) : null,
    capabilityId: typeof item.capabilityId === "string" && item.capabilityId.trim() ? cleanString(item.capabilityId, 80) : capabilityDefault[0],
    supportStatus,
    requiresConfirmation: Boolean(item.requiresConfirmation) || supportStatus === "needs_confirmation" || supportStatus === "unsafe",
    reason: typeof item.reason === "string" && item.reason.trim() ? cleanString(item.reason, 300) : null,
  });
}

function normalizeConfirmation(confirmation, index) {
  const item = confirmation && typeof confirmation === "object" ? confirmation : {};
  const rawType = cleanString(item.type, 40);
  return {
    id: cleanString(item.id, 80) || `check-${index}`,
    type: KNOWN_CONFIRMATION_TYPES.has(rawType) ? rawType : "unclear",
    message: cleanString(item.message, 300) || "Fair Teams needs your confirmation.",
    playerRefs: Array.isArray(item.playerRefs) ? item.playerRefs.map(normalizePlayerRef) : [],
    suggestedActionType: KNOWN_ACTION_TYPES.has(cleanString(item.suggestedActionType, 80)) ? cleanString(item.suggestedActionType, 80) : null,
  };
}

function normalizeUnresolved(unresolved, index) {
  const item = unresolved && typeof unresolved === "object" ? unresolved : {};
  const rawIssue = cleanString(item.issue, 40);
  return {
    text: cleanString(item.text, 300),
    issue: KNOWN_UNRESOLVED_ISSUES.has(rawIssue) ? rawIssue : "unknown_intent",
    message: cleanString(item.message, 300) || "Fair Teams understood this, but it is not wired safely yet.",
  };
}

function normalizeParsedResponse(parsed, commandText) {
  const item = parsed && typeof parsed === "object" ? parsed : {};
  const actions = Array.isArray(item.actions) ? item.actions.map(normalizeAction) : [];
  const confirmations = Array.isArray(item.confirmations) ? item.confirmations.map(normalizeConfirmation) : [];
  const unresolved = Array.isArray(item.unresolved) ? item.unresolved.map(normalizeUnresolved) : [];
  return {
    schemaVersion: 1,
    ok: typeof item.ok === "boolean" ? item.ok : actions.length > 0,
    detectedLanguage: cleanString(item.detectedLanguage, 40) || "unknown",
    normalizedIntent: cleanString(item.normalizedIntent, 300) || cleanString(commandText, 300),
    assistantSummary: cleanString(item.assistantSummary, 700) || "Fair Teams understood the command.",
    confidence: Number.isFinite(Number(item.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : 0.5,
    actions,
    confirmations,
    unresolved,
    parseMode: "ai",
  };
}

function mergeUniqueByKey(existing, incoming, keyFn) {
  const output = Array.isArray(existing) ? [...existing] : [];
  for (const item of incoming || []) {
    const key = keyFn(item);
    if (!output.some((old) => keyFn(old) === key)) output.push(item);
  }
  return output;
}

const PLAYER_ACTION_TYPES = new Set([
  "select_players",
  "unselect_players",
  "mark_players_late",
  "add_pairing_rule",
  "lock_player_to_team",
  "add_new_player_suggestion",
  "set_new_player_skill",
]);

function isPlayerNameAction(action) {
  return Boolean(action && PLAYER_ACTION_TYPES.has(action.type));
}

function isPlayerNameConfirmation(confirmation) {
  return confirmation && (confirmation.type === "missing_player" || confirmation.type === "ambiguous_player");
}

function isPlayerNameUnresolved(item) {
  return item && (item.issue === "unknown_player" || item.issue === "ambiguous_player");
}

function hasAiExtractedPlayers(normalized) {
  return Boolean(
    normalized.actions.some(isPlayerNameAction) ||
      normalized.confirmations.some(isPlayerNameConfirmation) ||
      normalized.unresolved.some(isPlayerNameUnresolved),
  );
}

function filterOutPlayerNameNoise(plan) {
  return {
    actions: plan.actions.filter((action) => !isPlayerNameAction(action)),
    confirmations: plan.confirmations.filter((confirmation) => !isPlayerNameConfirmation(confirmation)),
    unresolved: plan.unresolved.filter((item) => !isPlayerNameUnresolved(item)),
  };
}

function mergeDeterministicActions(parsed, commandHints, roster) {
  const normalized = normalizeParsedResponse(parsed, commandHints?.commandText || "");
  const rawDeterministic = buildDeterministicPlan(commandHints, roster);
  const aiHandledPlayerNames = hasAiExtractedPlayers(normalized);
  const deterministic = aiHandledPlayerNames ? filterOutPlayerNameNoise(rawDeterministic) : rawDeterministic;
  const merged = { ...normalized };

  // Important: when the AI has already hand-picked the people from the transcript,
  // do not re-add local regex candidate names. The local hints can contain filler
  // words such as "like", "to", "only", or merged phrase blobs. Keep deterministic
  // hints for team count, team size, generate, notes, equipment, etc., but let the
  // AI be the source of truth for the initial name list.
  merged.actions = mergeUniqueByKey(
    deterministic.actions,
    normalized.actions,
    (action) => `${action.type}:${action.newPlayerName || action.noteText || action.colorName || action.targetName || action.targetArea || action.playersPerTeam || action.teamCount || action.pairingKind || action.teamLabel || action.playerRefs.map((p) => p.playerId || p.spokenName).join("+")}`,
  );
  merged.confirmations = mergeUniqueByKey(normalized.confirmations, deterministic.confirmations, (item) => item.id || item.message);
  merged.unresolved = mergeUniqueByKey(normalized.unresolved, deterministic.unresolved, (item) => `${item.issue}:${item.text || item.message}`);

  if (rawDeterministic.actions.length > 0) merged.parseMode = "ai_with_local_hints";
  if (merged.actions.length > 0) merged.ok = true;
  if (aiHandledPlayerNames && rawDeterministic.actions.some(isPlayerNameAction)) {
    merged.debugWarnings = [
      ...(Array.isArray(merged.debugWarnings) ? merged.debugWarnings : []),
      "AI-extracted player names used; local regex name candidates suppressed to avoid filler-word false names.",
    ];
  }
  return merged;
}

function extractJsonObject(text) {
  const raw = cleanString(text, 20000);
  if (!raw) return "";
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (unfenced.startsWith("{") && unfenced.endsWith("}")) return unfenced;
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first >= 0 && last > first) return unfenced.slice(first, last + 1);
  return "";
}


function looksLikeCasualConversation(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized) return false;
  const short = normalized.split(" ").filter(Boolean).length <= 8;
  if (/^(hi|hello|hey|hey there|yo|hallo|moin|servus|안녕|안녕하세요|bonjour|hola|ciao|thanks|thank you|danke|고마워)/i.test(text.trim())) return true;
  if (short && /(what can you do|help|weather|wetter|날씨|how are you|who are you)/i.test(text)) return true;
  return false;
}

function looksLikeFairTeamsAnswerQuestion(text) {
  const raw = cleanString(text, MAX_COMMAND_CHARS);
  const normalized = normalizeForMatching(raw);
  if (!normalized) return false;

  const questionFrame = /(^|\b)(what|what\s|whats|how|why|where|when|which|who|can i|should i|do i|does|is|are|will|would|explain|tell me|show me how|difference|different|compare|versus|vs|meaning|mean|help me understand)\b/i.test(raw)
    || /[?？]$/.test(raw.trim())
    || /\b(unterschied|was ist|wie funktioniert|warum|wo ist|kann ich|erklär|erklaer|차이|무엇|뭐야|어떻게|왜|설명)\b/i.test(raw);
  if (!questionFrame) return false;

  const appTopic = /\b(fair teams|app|roster|shared roster|local roster|private roster|cloud backup|backup|restore|sync|collaboration|organizer|club|club rating|rating|skill|today|teams|team generation|smart import|ocr|screenshot|review names|lost.?found|voice|assistant|equipment|bag|notes|pairing|lock|copy|duplicate|import|export)\b/i.test(raw)
    || /(로스터|공유|백업|클럽|평점|오늘|팀|선수|장비|스크린샷|음성)/i.test(raw);
  if (!appTopic) return false;

  // Mixed requests such as "what is shared roster and create one" should still be allowed
  // to create action cards. Pure explanation questions should not.
  const explicitFollowUpAction = /\b(and|then|also)\s+(select|choose|pick|mark|add|remove|move|give|assign|set|make|create|generate|split|divide|keep|separate|pair|lock|put|rename|change|open|show|go to|back up|backup)\b/i.test(raw);
  return !explicitFollowUpAction;
}

function normalizeKnowledgeAnswerResponse(parsed, commandText, fallbackAnswer = null) {
  const normalized = normalizeParsedResponse(parsed, commandText);
  const fallbackSummary = fallbackAnswer?.assistantSummary || "I can explain that, but I do not have enough Fair Teams detail yet.";
  return {
    ...normalized,
    ok: true,
    assistantSummary: cleanString(normalized.assistantSummary, 900) || fallbackSummary,
    confidence: Math.max(0.7, normalized.confidence || fallbackAnswer?.confidence || 0.7),
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "ai_knowledge_answer",
  };
}

function hasStrongAppCommandIntent(commandText, commandHints) {
  const text = cleanString(commandText, MAX_COMMAND_CHARS);
  const hints = commandHints && typeof commandHints === "object" ? commandHints : {};

  // Action hints should win over product Q&A routing. Otherwise commands like
  // "Joon and Jorge are playing today" can be mistaken for a Today-tab help question.
  if (Array.isArray(hints.candidateNames) && hints.candidateNames.length > 0) return true;
  if (hints.selectAllRosterPlayers) return true;
  if (hints.detectedClubNoteText) return true;
  if (hints.detectedRosterColor) return true;
  if (hints.detectedRosterRename) return true;
  if (hints.detectedTargetArea) return true;
  if (hints.detectedSpreadRole) return true;
  if (hints.detectedEquipmentAction) return true;

  // Size/count alone can appear in explanatory questions, so require a verb/action frame.
  if ((hints.detectedPlayersPerTeam || hints.detectedTeamCount) && detectGenerateTeams(text)) return true;
  if (hints.detectedGenerateTeams) return true;

  // Imperative/action wording should beat question routing even if the sentence contains a tab name.
  return /\b(select|choose|pick|mark|add|remove|move|give|assign|set|make|create|generate|split|divide|keep|separate|pair|lock|put|rename|change|open|show|go to)\b/iu.test(text)
    || /(선택|추가|삭제|옮겨|나눠|만들|생성|바꿔|변경|열어|보여|같이|떨어뜨려|따로)/u.test(text);
}

function deterministicFallbackResponse(commandText, commandHints, roster, fallbackReason = "AI response could not be parsed safely.") {
  const plan = buildDeterministicPlan(commandHints, roster);
  const unresolved = [...plan.unresolved];

  if (plan.actions.length === 0 && looksLikeCasualConversation(commandText)) {
    return {
      schemaVersion: 1,
      ok: true,
      detectedLanguage: "unknown",
      normalizedIntent: cleanString(commandText, 300),
      assistantSummary: "I’m here, but I could not connect to the AI assistant cleanly just now. Try again in a moment.",
      confidence: 0.35,
      actions: [],
      confirmations: [],
      unresolved: [],
      parseMode: "local_fallback",
      debugWarnings: [fallbackReason],
    };
  }

  if (plan.actions.length === 0) {
    unresolved.push({
      text: commandText,
      issue: "unknown_intent",
      message: "I understood you, but I could not safely turn that into a Fair Teams action yet.",
    });
  }

  return {
    schemaVersion: 1,
    ok: plan.actions.length > 0,
    detectedLanguage: "unknown",
    normalizedIntent: cleanString(commandText, 300),
    assistantSummary: plan.actions.length > 0
      ? "I used Fair Teams app rules because the AI answer was not reliable."
      : "I can talk with you, but I could not safely handle that request yet.",
    confidence: plan.actions.length > 0 ? 0.72 : 0.25,
    actions: plan.actions,
    confirmations: plan.confirmations,
    unresolved,
    parseMode: "local_fallback",
    debugWarnings: [fallbackReason],
  };
}

function systemPrompt() {
  return `You are Fair Teams Assistant, a friendly multilingual assistant for a casual football team-making app.

${fairTeamsOperatingManual()}

${fairTeamsCapabilityManifest()}

Conversation behavior:
- The user should be able to talk to you naturally. You are not only a command parser.
- If the user sends a greeting, thanks, small talk, or asks what you can do, answer warmly in assistantSummary with actions=[], confirmations=[], unresolved=[], ok=true.
- If the user asks a Fair Teams product question, answer from the provided fairTeamsKnowledge sections and the operating manual with concrete app-specific details. This includes questions about local/private rosters, shared rosters, Club ratings, normal ratings, Today, Teams, pairing rules, Equipment Board, Club Notes, backup, Smart Import, screenshots, voice, and AI assistant limits. For feature-explanation questions, sound user-facing and helpful; do not mention beta branches, wiring status, schemas, JSON, API routes, or implementation details unless the user explicitly asks about implementation.
- Product answers should feel like a friendly organizer explaining the app to another organizer. Start with the practical difference or next useful idea. Prefer short paragraphs, plain words, and examples like "Use Cloud Backup when..." / "Use Shared Roster when...". Do not sound like a command router, developer note, or release log.
- For Fair Teams product Q&A, do not invent features that are not in fairTeamsKnowledge or the operating manual. If a detail is not specified, say "I don't have that Fair Teams detail yet" and then explain the nearest known behavior.
- Never answer Fair Teams product questions with generic sports-app or generic AI guesses. If the user says "in this app", "Fair Teams", "roster rating", "Club", "Smart Import", "Lost & Found", "Equipment Board", or names a tab/feature, treat it as an app-specific question.
- If the user asks a simple general question, answer briefly when it does not require live/current data and does not distract from Fair Teams.
- If the user asks for live/current outside data such as weather, news, scores, prices, or schedules, do not invent it because no live data tool is connected in Fair Teams yet. Say that live data is not connected yet and gently steer back to Fair Teams.
- If the user asks something outside Fair Teams but harmless, be brief and helpful. If it is too broad, explain that your main role is Fair Teams setup.
- App actions still matter: when the user asks for roster, Today, team, pairing, Club Notes, equipment, or app settings changes, return safe structured actions underneath the assistant message.

Output contract:
- Return the same language-independent JSON action schema regardless of input language.
- The user may speak or type in any language, including mixed-language commands.
- detectedLanguage may be any BCP-47-like language string such as en, de, ko, es, mixed, or unknown.
- Preserve player names exactly as user says them when uncertain. Do not translate names.
- You are the primary planner. Read commandText yourself first, then use commandHints as helpful clues only. Do not rely only on commandHints.
- If commandHints misses, merges, or pollutes a name list, correct it from commandText. Example: "Arthur is here, Ayashini, Anna... let's make a team" is an attendance list plus generate-teams request.
- Attendance/list patterns include "X is here, Y, Z", "today we have X, Y", "make a team with X, Y", "X, Y and Z are playing", and similar natural speech. Extract all person names before deciding to generate teams.
- When a command contains both player names and "make/generate teams", return select_players first, then set_team_count/set_team_size if stated, then generate_teams. Do not fall back to current Today selection when names are present. Do not omit names just because the list is long.
- Use roster names and aliases to match likely speech/transcription errors. Prefer existing roster players over adding new players when there is a plausible phonetic/near spelling match, e.g. June→Joon, Yan→Jan, Anya→Tanja, Briesh/Presh→Brijesh, Ayesha/Ayeshni→Ayashini, Unursha→Onursha/Onursah, Onursa→Onursah.
- For each heard person name, compare it against every roster.name and roster.aka before using add_new_player_suggestion. If one or more roster names are plausible, return select_players playerRefs for the plausible existing roster IDs and put the heard value in spokenName. Let the app review modal handle ambiguity. Only use add_new_player_suggestion when no existing roster/aka is plausible.
- You are the source of truth for the initial spoken/typed person list. Use commandText first and hand-pick only real person names from the transcript; commandHints.candidateNames may be noisy and must not be copied blindly.
- Every real person name you identify from commandText must appear in select_players, add_new_player_suggestion, confirmations, or unresolved, in the same order it was spoken/typed. If 21 people are mentioned, the structured output must account for 21 people, not a shorter summary.
- However, completeness never means copying app words. Ignore instruction/filler words such as have, has, had, new, four, here, today, players, people, only, make, team, teams, with, so, let's, like, to, from, in, on, the, a, an, please, okay, ok, and similar non-name words.
- If a token could be either a filler/instruction word or a name, omit it unless it exactly appears in roster.name/roster.aka or is clearly introduced as a person's name.
- If the command includes a phrase such as "four new players" but does not provide those names, do not invent names from "four" or "new". Use unresolved missing_context for the missing names.
- For attendance commands, use add_new_player_suggestion only for plausible human names. Never create new-player suggestions for app words, sentence fragments, or multi-word blobs that include filler words.
- If commandHints.strictAttendanceExtraction is long_list_do_not_drop_names, treat the command as an attendance register: be exhaustive, preserve order, and include uncertain person-name candidates as unresolved/add_new_player_suggestion rather than dropping them. The word "person-name" is important: app/instruction words must still be excluded.
- If commandHints.selectAllRosterPlayers is true, create select_players containing every roster player.
- When commandHints detects playersPerTeam, create set_team_size unless the user clearly meant something else.
- When commandHints detects teamCount, create set_team_count. "make 6 teams" means teamCount=6, not 6v6.
- If commandHints says a listed player is unknown, create add_new_player_suggestion for that exact name and missing_player confirmation.
- If commandHints says only 5 listed names were provided for 5v5, still set playersPerTeam=5 and add unresolved missing_context.
- AI does not generate final teams. It only returns safe app actions for Fair Teams to execute.
- Do not claim something is impossible just because it is not wired. Return the best matching app action with supportStatus=understood_not_wired.
- For Club Notes requests, return club_add_note with noteText and supportStatus=executable.
- For Equipment Board move requests, return equipment_move_item with targetName for the bag/item and playerRefs for the destination holder if known. Do not answer that you cannot understand; if incomplete, ask which bag or which person.
- For obvious app commands in commandHints, return the action even if you also need to ask follow-up questions.
- For conversation-only messages, do not use unsupported_action. Just put the natural reply in assistantSummary and leave actions/confirmations/unresolved empty.
- For Fair Teams product explanation questions, answer as a knowledgeable Fair Teams assistant using fairTeamsKnowledge. Keep actions/confirmations/unresolved empty unless the user also asks you to do something in the app.
- Example: if asked about non-shared vs normal rating, explain that local/private/non-shared rating is the normal private rating, while shared/Club rating is private per-organizer input averaged into a Club rating used for shared team generation.
- Never return prose outside JSON. Never omit required fields.
- Be concise, natural, and friendly in assistantSummary. Use the user's likely UI language.`;
}
export default async function handler(req, res) {
  res.setHeader?.("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }
  if (!serverEnabled()) {
    return res.status(403).json({ error: "AI Smart Command is disabled on this deployment." });
  }
  if (!branchAllowed()) {
    return res.status(403).json({ error: "AI Smart Command is not enabled for this branch." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const commandText = cleanString(body.commandText, MAX_COMMAND_CHARS);
  const roster = cleanRoster(body.roster);
  const context = cleanContext(body.context);
  const commandHints = { ...buildCommandHints(commandText, roster), commandText };
  const fairTeamsKnowledge = getFairTeamsKnowledgeForCommand(commandText, context);

  if (!commandText) {
    return res.status(400).json({ error: "Missing commandText." });
  }

  const strongAppCommandIntent = hasStrongAppCommandIntent(commandText, commandHints);
  const answerQuestionMode = !strongAppCommandIntent && looksLikeFairTeamsAnswerQuestion(commandText);
  const directFairTeamsAnswer = strongAppCommandIntent ? null : getDirectFairTeamsAnswerForCommand(commandText, context);

  if (!process.env.OPENAI_API_KEY) {
    if (directFairTeamsAnswer) {
      return res.status(200).json({
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: cleanString(commandText, 300),
        assistantSummary: directFairTeamsAnswer.assistantSummary,
        confidence: directFairTeamsAnswer.confidence,
        actions: [],
        confirmations: [],
        unresolved: [],
        parseMode: "fair_teams_knowledge_base",
        debugWarnings: [`Answered from Fair Teams knowledge topic: ${directFairTeamsAnswer.topic} because API key is not configured.`],
      });
    }
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  const task = answerQuestionMode
    ? "AI ASSISTANT V1.13 KNOWLEDGE ANSWER MODE. The user is asking a Fair Teams product question, not asking you to perform an app action. Answer naturally from fairTeamsKnowledge and the operating manual. Return actions=[], confirmations=[], unresolved=[]. Do not create backup/import/team/action cards just because the question mentions those features. Answer from the user's perspective, in friendly plain language. For comparisons, explain when to use each feature. If the answer is not in fairTeamsKnowledge, say you do not have that Fair Teams detail yet and explain the nearest known behavior."
    : "AI PLANNER V1.12 STRICT NAME EXTRACTOR. Reply as the Fair Teams Assistant. If this is conversation or a simple question, answer naturally in assistantSummary with no actions. If this is a Fair Teams product question, answer from fairTeamsKnowledge and the operating manual, not from generic sports-app assumptions. If this is a Fair Teams app request, read commandText yourself and build a safe action plan. Use commandHints only as helper clues, not as the source of truth. Action requests always beat product Q&A. For attendance commands, first do a strict name-extraction pass over commandText: identify the continuous spoken/typed attendance list, preserve order, and output ONLY real person-name candidates from that list. Do not copy noisy commandHints candidate names. Never output instruction/filler words such as have, has, had, new, four, like, to, from, in, on, with, here, today, only, make, team, teams, players, people, okay, or let's as player names unless that exact word is an existing roster.name or roster.aka. If the user says a count such as 'four new players' without saying their names, do not create names from the count; add unresolved missing_context saying the new player names were not provided. After the strict name list is built, match each name against roster.name and roster.aka. Prefer plausible existing roster IDs over add_new_player_suggestion for speech errors such as June/Joon, Yan/Jan, Anya/Tanja, Briesh/Presh/Brijesh, Ayesha/Ayashini, Unursha/Onursha, Sari Savage/Ceri Savage. For mixed commands like 'Arthur is here, Ayashini, Anna... let's make a team', return select_players first, then set_team_count/set_team_size if stated, then generate_teams. Do not generate from current Today selection when names are present. Completeness still matters: if 21 real people are named, account for 21 people, but uncertainty should become unresolved/add_new_player_suggestion for plausible human names only, never app words or sentence fragments.";

  const payload = {
    model: DEFAULT_MODEL,
    temperature: answerQuestionMode ? 0.35 : 0.1,
    max_output_tokens: answerQuestionMode ? 1200 : 3600,
    input: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          task,
          commandText,
          context,
          roster: answerQuestionMode ? roster.slice(0, 20).map((player) => ({ id: player.id, name: player.name, attending: player.attending })) : roster,
          commandHints: answerQuestionMode ? { appKnowledgeVersion: commandHints.appKnowledgeVersion, answerQuestionMode: true } : commandHints,
          fairTeamsKnowledge,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        ...jsonSchema,
      },
    },
  };

  let aiResponse;
  try {
    aiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    if (answerQuestionMode && directFairTeamsAnswer) {
      return res.status(200).json({
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: cleanString(commandText, 300),
        assistantSummary: directFairTeamsAnswer.assistantSummary,
        confidence: directFairTeamsAnswer.confidence,
        actions: [],
        confirmations: [],
        unresolved: [],
        parseMode: "fair_teams_knowledge_base",
        debugWarnings: [`AI request failed; used Fair Teams knowledge topic: ${directFairTeamsAnswer.topic}`],
      });
    }
    return res.status(200).json(deterministicFallbackResponse(commandText, commandHints, roster, "OpenAI request failed before completion."));
  }

  const aiPayload = await aiResponse.json().catch(() => null);
  if (!aiResponse.ok) {
    const message = aiPayload?.error?.message || "OpenAI request failed.";
    if (answerQuestionMode && directFairTeamsAnswer) {
      return res.status(200).json({
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: cleanString(commandText, 300),
        assistantSummary: directFairTeamsAnswer.assistantSummary,
        confidence: directFairTeamsAnswer.confidence,
        actions: [],
        confirmations: [],
        unresolved: [],
        parseMode: "fair_teams_knowledge_base",
        debugWarnings: [`AI request failed; used Fair Teams knowledge topic: ${directFairTeamsAnswer.topic}`],
      });
    }
    return res.status(200).json(deterministicFallbackResponse(commandText, commandHints, roster, message));
  }

  const outputText = typeof aiPayload?.output_text === "string"
    ? aiPayload.output_text
    : Array.isArray(aiPayload?.output)
      ? aiPayload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
          .map((content) => content?.text || "")
          .join("\n")
          .trim()
      : "";

  if (!outputText) {
    if (answerQuestionMode && directFairTeamsAnswer) {
      return res.status(200).json({
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: cleanString(commandText, 300),
        assistantSummary: directFairTeamsAnswer.assistantSummary,
        confidence: directFairTeamsAnswer.confidence,
        actions: [],
        confirmations: [],
        unresolved: [],
        parseMode: "fair_teams_knowledge_base",
        debugWarnings: [`AI returned no output; used Fair Teams knowledge topic: ${directFairTeamsAnswer.topic}`],
      });
    }
    return res.status(200).json(deterministicFallbackResponse(commandText, commandHints, roster, "AI returned no structured output."));
  }

  try {
    const jsonText = extractJsonObject(outputText) || outputText;
    const parsed = JSON.parse(jsonText);
    if (answerQuestionMode) {
      return res.status(200).json(normalizeKnowledgeAnswerResponse(parsed, commandText, directFairTeamsAnswer));
    }
    return res.status(200).json(mergeDeterministicActions(parsed, commandHints, roster));
  } catch {
    if (answerQuestionMode && directFairTeamsAnswer) {
      return res.status(200).json({
        schemaVersion: 1,
        ok: true,
        detectedLanguage: "unknown",
        normalizedIntent: cleanString(commandText, 300),
        assistantSummary: directFairTeamsAnswer.assistantSummary,
        confidence: directFairTeamsAnswer.confidence,
        actions: [],
        confirmations: [],
        unresolved: [],
        parseMode: "fair_teams_knowledge_base",
        debugWarnings: [`AI answer failed; used Fair Teams knowledge topic: ${directFairTeamsAnswer.topic}`],
      });
    }
    return res.status(200).json(deterministicFallbackResponse(commandText, commandHints, roster, "AI returned malformed JSON."));
  }
}
