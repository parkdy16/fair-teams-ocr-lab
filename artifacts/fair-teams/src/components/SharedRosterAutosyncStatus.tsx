import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sharedRosterAutosyncPresentation,
  type SharedRosterAutosyncSnapshot,
} from "@/lib/sharedRosterAutosyncController";

type Props = {
  snapshot: SharedRosterAutosyncSnapshot;
  onRetry: () => void;
  variant?: "inline" | "panel";
};

const toneClasses = {
  success: "border-emerald-100 bg-emerald-50/80 text-emerald-800",
  progress: "border-violet-100 bg-violet-50/80 text-violet-800",
  warning: "border-amber-100 bg-amber-50/90 text-amber-900",
  error: "border-rose-100 bg-rose-50/90 text-rose-800",
  muted: "border-slate-100 bg-slate-50/90 text-slate-600",
} as const;

export function SharedRosterAutosyncStatus({
  snapshot,
  onRetry,
  variant = "panel",
}: Props) {
  if (snapshot.status === "local_only") return null;
  const presentation = sharedRosterAutosyncPresentation(snapshot);
  const Icon = presentation.busy
    ? Loader2
    : snapshot.status === "synced"
      ? CheckCircle2
      : snapshot.status === "offline"
        ? WifiOff
        : AlertTriangle;

  if (variant === "inline") {
    return (
      <div
        className={`flex min-h-8 min-w-0 items-center gap-2 border-y px-3 py-1.5 text-[11px] font-black lg:px-7 lg:text-[12px] ${toneClasses[presentation.tone]}`}
        role="status"
        aria-live={snapshot.status === "failed" || snapshot.status === "conflict" ? "assertive" : "polite"}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${presentation.busy ? "animate-spin" : ""}`} />
        <span className="min-w-0 flex-1 truncate">{presentation.label}</span>
        {snapshot.retryable && (
          <Button
            type="button"
            variant="outline"
            className="h-6 shrink-0 rounded-lg border-current/20 bg-white/80 px-2 text-[10px] font-black text-current hover:bg-white"
            onClick={onRetry}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 items-start gap-2 rounded-2xl border px-3 py-2 ${toneClasses[presentation.tone]}`}
      role="status"
      aria-live={snapshot.status === "failed" || snapshot.status === "conflict" ? "assertive" : "polite"}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${presentation.busy ? "animate-spin" : ""}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black leading-snug">{presentation.label}</div>
        <div className="mt-0.5 text-[10px] font-semibold leading-snug opacity-80">{presentation.detail}</div>
      </div>
      {snapshot.retryable && (
        <Button
          type="button"
          variant="outline"
          className="h-8 shrink-0 rounded-xl border-current/20 bg-white/80 px-2 text-[10px] font-black text-current hover:bg-white"
          onClick={onRetry}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
