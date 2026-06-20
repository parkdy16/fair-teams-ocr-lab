import React, { useMemo, useState } from "react";
import { parseFairTeamsSmartCommand, createAiSmartCommandContext } from "@/lib/aiSmartCommandClient";
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
  onApplyAction?: (action: AiSmartCommandAction) => Promise<void> | void;
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
  if (action.playersPerTeam) details.push(`${action.playersPerTeam}v${action.playersPerTeam}`);
  if (action.teamCount) details.push(`${action.teamCount} teams`);
  if (action.pairingKind) details.push(action.pairingKind.replace(/_/g, " "));
  if (action.teamLabel) details.push(`team: ${action.teamLabel}`);
  if (action.role) details.push(`role: ${action.role.replace(/_/g, " ")}`);
  if (action.noteText) details.push(`note: “${action.noteText}”`);
  if (action.colorName) details.push(`color: ${action.colorName}`);
  if (action.targetName) details.push(`target: ${action.targetName}`);
  if (action.targetArea) details.push(`area: ${action.targetArea}`);
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

type LocalAssistantReply = {
  summary: string;
  normalizedIntent: string;
  detectedLanguage?: string;
};

function compactCommandText(text: string) {
  return text
    .toLowerCase()
    .replace(/[.!?。！？,，]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAppCommand(text: string) {
  return /\b(roster|player|players|team|teams|today|club|note|notes|select|make|generate|pair|separate|together|red|blue|green|yellow|color|colour|rename|equipment|add|delete|remove|skill)\b/i.test(text)
    || /(팀|선수|명단|오늘|클럽|노트|메모|추가|삭제|분리|같이|빨강|파랑|색|장비)/.test(text);
}

function localAssistantReplyFor(commandText: string): LocalAssistantReply | null {
  const raw = commandText.trim();
  const text = compactCommandText(raw);
  if (!text) return null;

  const wordCount = text.split(" ").filter(Boolean).length;

  const isHelp =
    /^(help|what can you do|what do you do|how does this work|show examples|examples|commands?)$/.test(text)
    || /^(hilfe|was kannst du|beispiele|befehle)$/.test(text)
    || /(뭐 할 수|무엇을 할 수|도움|예시|명령)/.test(raw);

  if (isHelp) {
    return {
      normalizedIntent: "local_help",
      detectedLanguage: "local",
      summary:
        "Try commands like: “Select George, Sarah and Tommy for today.” · “Make 5v5 teams.” · “Keep Sarah and Tommy separate.” · “Add a Club note saying bring two balls.”",
    };
  }

  const isThanks =
    /^(thanks|thank you|thx|cheers|ok thanks|okay thanks)$/.test(text)
    || /^(danke|danke dir|vielen dank|merci)$/.test(text)
    || /(고마워|고맙|감사)/.test(raw);

  if (isThanks && wordCount <= 5) {
    return {
      normalizedIntent: "local_thanks",
      detectedLanguage: "local",
      summary: "You’re welcome. Send another Fair Teams command whenever you want.",
    };
  }

  const isGreeting =
    /^(hi|hello|hey|hey there|yo|hiya|good morning|good afternoon|good evening)$/.test(text)
    || /^(hallo|hi|hey|moin|servus|guten morgen|guten tag|guten abend)$/.test(text)
    || /^(안녕|안녕하세요|하이|ㅎㅇ)/.test(raw)
    || /^(bonjour|hola|ciao|salut|hej|merhaba)$/.test(text);

  if (isGreeting && wordCount <= 5 && !looksLikeAppCommand(raw)) {
    return {
      normalizedIntent: "local_greeting",
      detectedLanguage: "local",
      summary:
        "Hey — tell me what you want to do with Today players, teams, pairing rules, Club notes, or roster changes. For examples, type “help.”",
    };
  }

  const isDismissal =
    /^(never mind|nevermind|forget it|cancel|stop|no thanks|not now)$/.test(text)
    || /^(egal|abbrechen|stopp|nicht jetzt)$/.test(text)
    || /(취소|됐어|그만|나중에)/.test(raw);

  if (isDismissal && wordCount <= 5) {
    return {
      normalizedIntent: "local_dismissal",
      detectedLanguage: "local",
      summary: "No problem. I won’t change anything.",
    };
  }

  return null;
}

function makeLocalAssistantResponse(reply: LocalAssistantReply): AiSmartCommandResponse {
  return {
    schemaVersion: 1,
    ok: true,
    detectedLanguage: reply.detectedLanguage || "local",
    normalizedIntent: reply.normalizedIntent,
    assistantSummary: reply.summary,
    confidence: 1,
    actions: [],
    confirmations: [],
    unresolved: [],
    parseMode: "local_fallback",
    debugWarnings: ["Answered locally before calling the AI backend."],
  };
}

export function AiSmartCommandPanel({
  players,
  rosterName,
  rosterMode = "local",
  activeTab,
  onParsed,
  onApplyAction,
}: AiSmartCommandPanelProps) {
  const enabled = isAiSmartCommandEnabled();
  const [commandText, setCommandText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiSmartCommandResponse | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");

  const placeholder = useMemo(() => {
    return "Try: add a note saying bring pump · George red · Sarah and Tommy don’t like each other · change roster color to navy";
  }, []);

  if (!enabled) return null;

  const submit = async () => {
    if (busy) return;
    const trimmedCommand = commandText.trim();
    if (!trimmedCommand) return;

    setError("");
    setApplyMessage("");

    const localReply = localAssistantReplyFor(trimmedCommand);
    if (localReply) {
      const parsed = makeLocalAssistantResponse(localReply);
      setResult(parsed);
      onParsed?.(parsed);
      return;
    }

    setBusy(true);
    try {
      const parsed = await parseFairTeamsSmartCommand({
        commandText: trimmedCommand,
        roster: players,
        context: createAiSmartCommandContext({ rosterName, rosterMode, activeTab }),
      });
      setResult(parsed);
      onParsed?.(parsed);
    } catch (err) {
      setError(friendlyAiError(err));
    } finally {
      setBusy(false);
    }
  };

  const applyAction = async (action: AiSmartCommandAction, index: number) => {
    if (!onApplyAction || !aiCommandActionCanApply(action)) return;
    const key = `${action.type}-${index}`;
    setApplyingKey(key);
    setError("");
    setApplyMessage("");
    try {
      await onApplyAction(action);
      setApplyMessage("Applied.");
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
          <h3 className="mt-0.5 text-base font-black text-[#102A43]">Ask Fair Teams</h3>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-violet-800/75">
            Multilingual command test. Fair Teams understands many app actions; only safely wired actions can be applied.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-700 shadow-sm">AI beta</span>
      </div>

      <textarea
        value={commandText}
        onChange={(event) => setCommandText(event.target.value)}
        rows={4}
        className="mt-3 w-full resize-none rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-semibold text-[#102A43] outline-none focus:border-violet-300"
        placeholder={placeholder}
      />

      <button
        type="button"
        onClick={submit}
        disabled={busy || !commandText.trim()}
        className="mt-2 h-10 w-full rounded-2xl bg-[#102A43] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
      >
        {busy ? "Understanding…" : "Understand command"}
      </button>

      {error && (
        <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}
      {applyMessage && (
        <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          {applyMessage}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-2xl bg-white p-3 text-xs text-[#102A43] shadow-sm">
          <div className="font-black">{result.assistantSummary || "Command parsed."}</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            Language: {result.detectedLanguage} · Confidence: {Math.round(result.confidence * 100)}% · {parseModeLabel(result.parseMode)}
          </div>
          {result.actions.length === 0 && (
            <div className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-bold leading-snug text-violet-800">
              Local reply — no AI call used.
            </div>
          )}
          {result.actions.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              {result.actions.map((action, index) => {
              const capability = getAiCommandCapability(action);
              const canApply = Boolean(onApplyAction && aiCommandActionCanApply(action));
              const key = `${action.type}-${index}`;
              return (
                <div key={key} className="rounded-xl bg-slate-50 px-3 py-2 font-bold">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="capitalize">{capability?.label || actionLabel(action.type)}</div>
                      <div className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
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
                        {applyingKey === key ? "Applying…" : "Apply"}
                      </button>
                    )}
                  </div>
                  {actionDetails(action) && (
                    <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
                      {actionDetails(action)}
                    </div>
                  )}
                  {action.reason && (
                    <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
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
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-600">Needs check</div>
              {result.confirmations.map((confirmation) => (
                <div key={confirmation.id} className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800">
                  {confirmation.message}
                </div>
              ))}
            </div>
          )}
          {result.unresolved.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Not handled yet</div>
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
