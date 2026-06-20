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

function actionCardTitle(action: AiSmartCommandAction) {
  const capability = getAiCommandCapability(action);
  if (capability?.label) return capability.label;
  if (action.type === "no_action") return "No app action needed";
  if (action.type === "unsupported_action") return "Not a Fair Teams action";
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
  if (action.type === "select_players") return "Select";
  if (action.type === "set_team_size" || action.type === "set_team_count") return "Set";
  if (action.type === "generate_teams") return "Generate";
  return "Apply";
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
    return "Talk to Fair Teams… try: hey there · how does this work? · George red · make 5v5 teams";
  }, []);

  if (!enabled) return null;

  const submit = async () => {
    if (busy) return;
    const trimmedCommand = commandText.trim();
    if (!trimmedCommand) return;

    setError("");
    setApplyMessage("");


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
          <h3 className="mt-0.5 text-base font-black text-[#102A43]">Fair Teams Assistant</h3>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-violet-800/75">
            Talk naturally. I can explain Fair Teams, then show safe action cards when something can be done.
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
        {busy ? "Thinking…" : "Send"}
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
