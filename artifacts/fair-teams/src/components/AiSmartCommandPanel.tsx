import React, { useMemo, useState } from "react";
import { parseFairTeamsSmartCommand, createAiSmartCommandContext } from "@/lib/aiSmartCommandClient";
import { isAiSmartCommandEnabled, type AiSmartCommandResponse, type AiSmartCommandRosterPlayer } from "@/lib/aiSmartCommandTypes";

type AiSmartCommandPanelProps = {
  players: AiSmartCommandRosterPlayer[];
  rosterName?: string;
  rosterMode?: "local" | "shared";
  activeTab?: string;
  onParsed?: (result: AiSmartCommandResponse) => void;
};

function actionLabel(actionType: string) {
  return actionType.replace(/_/g, " ");
}

export function AiSmartCommandPanel({
  players,
  rosterName,
  rosterMode = "local",
  activeTab,
  onParsed,
}: AiSmartCommandPanelProps) {
  const enabled = isAiSmartCommandEnabled();
  const [commandText, setCommandText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiSmartCommandResponse | null>(null);

  const placeholder = useMemo(() => {
    return "Try: George, Sarah, Tommy, Kira. 6v6. Sarah and Tommy don’t like each other. George red.";
  }, []);

  if (!enabled) return null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const parsed = await parseFairTeamsSmartCommand({
        commandText,
        roster: players,
        context: createAiSmartCommandContext({ rosterName, rosterMode, activeTab }),
      });
      setResult(parsed);
      onParsed?.(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fair Teams AI command failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-violet-100 bg-violet-50/70 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-violet-600">Experimental</div>
          <h3 className="mt-0.5 text-base font-black text-[#102A43]">Ask Fair Teams</h3>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-violet-800/75">
            Multilingual smart command test. It suggests safe app actions, but does not change anything automatically yet.
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

      {result && (
        <div className="mt-3 rounded-2xl bg-white p-3 text-xs text-[#102A43] shadow-sm">
          <div className="font-black">{result.assistantSummary || "Command parsed."}</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            Language: {result.detectedLanguage} · Confidence: {Math.round(result.confidence * 100)}%
          </div>
          <div className="mt-3 grid gap-1.5">
            {result.actions.map((action, index) => (
              <div key={`${action.type}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 font-bold">
                {actionLabel(action.type)}
                {action.playerRefs.length > 0 ? ` · ${action.playerRefs.map((player) => player.rosterName || player.spokenName).join(", ")}` : ""}
                {action.playersPerTeam ? ` · ${action.playersPerTeam}v${action.playersPerTeam}` : ""}
                {action.pairingKind ? ` · ${action.pairingKind.replace(/_/g, " ")}` : ""}
                {action.teamLabel ? ` · ${action.teamLabel}` : ""}
              </div>
            ))}
          </div>
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
        </div>
      )}
    </section>
  );
}
