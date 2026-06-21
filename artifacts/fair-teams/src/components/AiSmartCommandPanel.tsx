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
  return message || "Fair Teams AI command failed.";
}

function parseModeLabel(mode?: AiSmartCommandResponse["parseMode"]) {
  if (mode === "local_fallback") return "Local reply / safety fallback";
  if (mode === "ai_with_local_hints") return "AI + app rules";
  if (mode === "ai") return "AI parser";
  return "AI beta";
}

function actionCardTitle(action: AiSmartCommandAction) {
  if (action.type === "select_players") {
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

const AI_ASSISTANT_VERSION_LABEL = "AI beta · v1.4 review";

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
};

function cleanAiSpokenName(value?: string | null) {
  return String(value || "")
    .replace(/[“”"']/g, " ")
    .replace(/\b(?:is|are|was|were|here|today|playing|coming|players?|people|with|and|so|let'?s|make|team|teams|only)\b/gi, " ")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aiNameKey(value?: string | null) {
  return normalizePlayerNameForMatch(cleanAiSpokenName(value)).replace(/\s+/g, "");
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
  if (action.type === "add_new_player_suggestion" && action.newPlayerName) return true;
  return ["select_players", "unselect_players", "mark_players_late", "add_pairing_rule", "lock_player_to_team"].includes(action.type) && action.playerRefs.length > 0;
}

function buildAiReviewItems(result: AiSmartCommandResponse | null, players: AiSmartCommandRosterPlayer[]): AiReviewItem[] {
  if (!result || !players.length) return [];
  const byKey = new Map<string, AiReviewItem>();
  const addHeardName = (rawName?: string | null) => {
    const heardName = cleanAiSpokenName(rawName) || String(rawName || "").trim();
    const key = aiNameKey(heardName);
    if (!key || heardName.length < 2) return null;
    if (!byKey.has(key)) byKey.set(key, { key, heardName, options: [] });
    return byKey.get(key)!;
  };

  for (const action of result.actions || []) {
    if (action.type === "add_new_player_suggestion" && action.newPlayerName) {
      addHeardName(action.newPlayerName);
    }
    if (["select_players", "unselect_players", "mark_players_late", "add_pairing_rule", "lock_player_to_team"].includes(action.type)) {
      for (const ref of action.playerRefs || []) {
        addHeardName(ref.spokenName || ref.rosterName);
      }
    }
  }
  for (const item of result.unresolved || []) {
    if (item.issue === "unknown_player" || item.issue === "ambiguous_player") addHeardName(item.text);
  }

  const items = Array.from(byKey.values()).map((item) => {
    const ranked = rankedOcrStyleRosterMatches(item.heardName, players, 5);
    const seen = new Set<string>();
    const options: AiReviewOption[] = [];
    for (const match of ranked) {
      if (seen.has(match.player.id)) continue;
      seen.add(match.player.id);
      options.push({
        kind: "existing",
        playerId: match.player.id,
        rosterName: match.player.name,
        heardName: item.heardName,
        score: match.score,
      });
    }
    options.push({ kind: "new", heardName: item.heardName, rosterName: item.heardName });
    options.push({ kind: "skip", heardName: item.heardName });
    return { ...item, options };
  });

  return items.filter((item) => item.options.some((option) => option.kind === "existing") || item.heardName.length >= 2);
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

function buildActionFromReviewSelections(
  result: AiSmartCommandResponse,
  items: AiReviewItem[],
  selections: Record<string, string>,
): AiSmartCommandAction | null {
  const playerRefs = items.flatMap((item) => {
    const selected = selections[item.key];
    const option = item.options.find((candidate) => candidate.kind === "existing" && candidate.playerId === selected);
    if (!option?.playerId) return [];
    return [{
      playerId: option.playerId,
      rosterName: option.rosterName || null,
      spokenName: item.heardName,
      confidence: Math.min(1, Math.max(0.72, (option.score || 90) / 100)),
    }];
  });
  if (playerRefs.length === 0) return null;

  const teamAction = result.actions.find(actionHasTeamFollowup);
  const shouldGenerate = Boolean(teamAction) || /generate|make|team/i.test(result.normalizedIntent || "");
  return {
    type: "select_players",
    playerRefs,
    newPlayerName: null,
    suggestedSkill: null,
    playersPerTeam: teamAction?.playersPerTeam ?? null,
    teamCount: teamAction?.teamCount ?? null,
    pairingKind: null,
    teamLabel: null,
    role: null,
    attribute: null,
    distribution: shouldGenerate ? "replace_today_selection_then_generate" : "replace_today_selection",
    noteText: null,
    colorName: null,
    targetName: null,
    targetArea: null,
    capabilityId: "today.select_players",
    supportStatus: "executable",
    requiresConfirmation: false,
    reason: shouldGenerate
      ? "Reviewed AI names, then replace Today and generate teams."
      : "Reviewed AI names, then replace Today with confirmed players.",
  };
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

  const aiReviewItems = useMemo(() => buildAiReviewItems(result, players), [result, players]);
  const hasAiReviewItems = aiReviewItems.length > 0;

  useEffect(() => {
    if (!hasAiReviewItems) {
      setReviewOpen(false);
      setReviewSelections({});
      return;
    }
    setReviewSelections(getAiReviewDefaultSelections(aiReviewItems));
  }, [hasAiReviewItems, aiReviewItems]);

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
  };

  const applyReviewedAiNames = async () => {
    if (!result || !onApplyAction) return;
    const action = buildActionFromReviewSelections(result, aiReviewItems, reviewSelections);
    if (!action) {
      setError("Choose at least one existing roster player before applying.");
      return;
    }
    await applyAction(action, -1);
    setReviewOpen(false);
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
      const localTrustGuard = guardFairTeamsSmartCommandBeforeAi(trimmedCommand, commandContext);
      if (localTrustGuard) {
        const enhanced = enhanceAiResultWithOcrStyleRosterMatching(localTrustGuard, players);
        setResult(enhanced);
        onParsed?.(enhanced);
        return;
      }

      try {
        const parsedRaw = await parseFairTeamsSmartCommand({
          commandText: trimmedCommand,
          roster: players,
          context: commandContext,
        });
        const parsed = enhanceAiResultWithOcrStyleRosterMatching(applyFairTeamsAiTruthGuard(trimmedCommand, parsedRaw), players);
        setResult(parsed);
        onParsed?.(parsed);
        return;
      } catch (aiErr) {
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
      setError(friendlyAiError(err));
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
    if (!onApplyAction || !aiCommandActionCanApply(action)) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply this action yet.");
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
                    Check heard names against your roster before changing Today.
                  </div>
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
          {result.unresolved.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{unresolvedTitle(result)}</div>
              {result.unresolved.map((item, index) => (
                <div key={`${item.issue}-${index}`} className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-slate-700">
                  {item.message || item.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reviewOpen && result && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/35 px-3 pb-3 pt-10 sm:items-center sm:pb-10">
          <div className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-violet-500">Fair Teams Assistant</div>
              <div className="mt-0.5 text-lg font-black text-[#102A43]">Review AI names</div>
              <div className="mt-1 text-xs font-semibold leading-snug text-slate-500">
                Like Screenshot Import, confirm the roster match before Today changes. New-player choices stay manual for now.
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto px-4 py-3">
              <div className="grid gap-2">
                {aiReviewItems.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Heard</div>
                        <div className="text-sm font-black text-[#102A43]">{item.heardName}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReviewSelections((current) => ({ ...current, [item.key]: "skip" }))}
                        className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 shadow-sm"
                      >
                        Skip
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.options.map((option) => {
                        const value = option.kind === "existing" ? option.playerId! : option.kind;
                        const selected = reviewSelections[item.key] === value;
                        const disabled = option.kind === "new";
                        return (
                          <button
                            key={`${item.key}-${value}`}
                            type="button"
                            disabled={disabled}
                            onClick={() => setReviewSelections((current) => ({ ...current, [item.key]: value }))}
                            className={`rounded-full px-2.5 py-1.5 text-[10px] font-black leading-none shadow-sm disabled:opacity-45 ${selected ? "bg-violet-600 text-white" : "bg-white text-slate-700"}`}
                            title={disabled ? "Use the separate Add new player action when this is truly new." : undefined}
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
                {applyingKey === "select_players--1" ? "Applying…" : "Apply reviewed names"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
