import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseFairTeamsSmartCommand, createAiSmartCommandContext, transcribeFairTeamsVoiceCommand } from "@/lib/aiSmartCommandClient";
import { applyFairTeamsAiTruthGuard, guardFairTeamsSmartCommandBeforeAi } from "@/lib/aiSmartCommandTrustGuard";
import { parseFairTeamsLocalSmartCommand } from "@/lib/aiSmartCommandLocalRouter";
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
  onParsed?: (result: AiSmartCommandResponse) => void;
  onApplyAction?: (action: AiSmartCommandAction) => Promise<string | void> | string | void;
  onOpenToday?: () => void;
};


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

function parseRankedRosterSelectionCommand(
  commandText: string,
  players: AiSmartCommandRosterPlayer[],
): AiSmartCommandResponse | null {
  const normalized = commandText
    .toLowerCase()
    .replace(/[×x]/g, "v")
    .replace(/versus|against|gegen/g, "v")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const wantsWeakest = /\b(weakest|worst|lowest|least skilled|beginners?)\b/.test(normalized);
  const wantsStrongest = /\b(strongest|best|highest|top)\b/.test(normalized);
  if (!wantsWeakest && !wantsStrongest) return null;
  if (!/\b(roster|players?|squad)\b/.test(normalized)) return null;

  const countMatch = normalized.match(/\b(?:weakest|worst|lowest|strongest|best|highest|top)\s+(\d{1,2})\b/) ||
    normalized.match(/\b(\d{1,2})\s+(?:weakest|worst|lowest|strongest|best|highest|top)\b/);
  const requestedCount = countMatch ? Number(countMatch[1]) : null;

  const teamSizeMatch = normalized.match(/\b(\d{1,2})\s*v\s*\1\b/) || normalized.match(/\b(\d{1,2})\s+v\s+\1\b/);
  const playersPerTeam = teamSizeMatch ? Number(teamSizeMatch[1]) : null;
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

  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: "en",
    normalizedIntent: `${wantsWeakest ? "Select weakest" : "Select strongest"} ${rankedPlayers.length} roster players${playersPerTeam ? ` for ${playersPerTeam}v${playersPerTeam}` : ""}`,
    assistantSummary: `I found the ${wantsWeakest ? "weakest" : "strongest"} ${rankedPlayers.length} players in this roster by skill and prepared an exact Today selection.${playersPerTeam ? ` Then set up ${playersPerTeam}v${playersPerTeam}.` : ""}`,
    confidence: 0.98,
    actions,
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback",
    debugWarnings: ["Handled by Fair Teams local ranked-selection parser."],
  };
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
  if (action.type === "select_players") return "Select";
  if (action.type === "set_team_size" || action.type === "set_team_count") return "Set";
  if (action.type === "generate_teams") return "Generate";
  return "Apply";
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

  const clearAssistantSession = () => {
    clearPersistedAiAssistantState(storageKey);
    setCommandText("");
    setVoiceTranscript("");
    setError("");
    setResult(null);
    setApplyMessage("");
    setShowTodayShortcut(false);
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
      const commandContext = createAiSmartCommandContext({ rosterName, rosterMode, activeTab });
      const localTrustGuard = guardFairTeamsSmartCommandBeforeAi(trimmedCommand, commandContext);
      if (localTrustGuard) {
        setResult(localTrustGuard);
        onParsed?.(localTrustGuard);
        return;
      }

      const localSmartCommand = parseFairTeamsLocalSmartCommand(trimmedCommand, players);
      if (localSmartCommand) {
        setResult(localSmartCommand);
        onParsed?.(localSmartCommand);
        return;
      }

      const localRankedSelection = parseRankedRosterSelectionCommand(trimmedCommand, players);
      if (localRankedSelection) {
        setResult(localRankedSelection);
        onParsed?.(localRankedSelection);
        return;
      }

      const parsedRaw = await parseFairTeamsSmartCommand({
        commandText: trimmedCommand,
        roster: players,
        context: commandContext,
      });
      const parsed = applyFairTeamsAiTruthGuard(trimmedCommand, parsedRaw);
      setResult(parsed);
      onParsed?.(parsed);
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
      if (action.type === "select_players" || action.type === "add_new_player_suggestion") {
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
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-700 shadow-sm">AI beta</span>
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
            <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-400" title={`${result.detectedLanguage} · ${Math.round(result.confidence * 100)}% · ${parseModeLabel(result.parseMode)}`}>
              Action cards
            </div>
          )}
          {result.actions.length > 0 && (
            <div className="mt-2 grid gap-1.5">
              {result.actions.map((action, index) => {
              const canApply = Boolean(onApplyAction && aiCommandActionCanApply(action));
              const key = `${action.type}-${index}`;
              return (
                <div key={key} className={`rounded-2xl border px-3 py-2.5 font-bold shadow-sm ${actionCardTone(action)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div>{actionCardTitle(action)}</div>
                      <div className="mt-0.5 text-[10px] font-black uppercase tracking-wide opacity-70">
                        {aiCommandSupportLabel(action)}
                      </div>
                    </div>
                    {canApply && (
                      <button
                        type="button"
                        className="shrink-0 rounded-full bg-violet-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
                        disabled={applyingKey === key}
                        onClick={() => applyAction(action, index)}
                      >
                        {applyingKey === key ? "Applying…" : actionPrimaryVerb(action)}
                      </button>
                    )}
                  </div>
                  {actionDetails(action) && (
                    <div className="mt-1.5 text-[11px] font-semibold leading-snug opacity-80">
                      {actionDetails(action)}
                    </div>
                  )}
                  {action.reason && (
                    <div className="mt-1 text-[11px] font-semibold leading-snug opacity-70">
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
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-600">I need you to check</div>
              {result.confirmations.map((confirmation) => (
                <div key={confirmation.id} className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800">
                  {confirmation.message}
                </div>
              ))}
            </div>
          )}
          {result.unresolved.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Follow-up needed</div>
              {result.unresolved.map((item, index) => (
                <div key={`${item.issue}-${index}`} className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-slate-700">
                  {item.message || item.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
