import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sharedRosterAutosyncPresentation,
  type SharedRosterAutosyncPresentation,
  type SharedRosterAutosyncSnapshot,
} from "@/lib/sharedRosterAutosyncController";
import { useStripesTranslation, type StripesTranslator } from "@/i18n";

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

function autosyncFailureDetail(
  snapshot: SharedRosterAutosyncSnapshot,
  t: StripesTranslator,
  fallback: string,
) {
  switch (snapshot.errorReason) {
    case "online_changed":
      return t("shared.autosync.failure.onlineChanged");
    case "access_changed":
      return t("shared.autosync.failure.accessChanged");
    case "network_unavailable":
      return t("shared.autosync.failure.networkUnavailable");
    case "sync_failed":
      return t("shared.autosync.failure.syncFailed");
    case "online_state_unconfirmed":
      return t("shared.autosync.failure.onlineStateUnconfirmed");
    default:
      return snapshot.errorMessage || fallback;
  }
}

export function sharedRosterAutosyncCatalogPresentation(
  snapshot: SharedRosterAutosyncSnapshot,
  t: StripesTranslator,
): SharedRosterAutosyncPresentation {
  const visual = sharedRosterAutosyncPresentation(snapshot);
  if (snapshot.status === "synced") {
    return {
      ...visual,
      label: t("shared.autosync.synced.label"),
      detail: t("shared.autosync.synced.detail"),
    };
  }
  if (snapshot.status === "scheduled") {
    return {
      ...visual,
      label: t("shared.autosync.scheduled.label"),
      detail: t("shared.autosync.scheduled.detail"),
    };
  }
  if (snapshot.status === "saving") {
    return {
      ...visual,
      label: t("shared.autosync.saving.label"),
      detail: t("shared.autosync.saving.detail"),
    };
  }
  if (snapshot.status === "conflict") {
    return {
      ...visual,
      label: t("shared.autosync.conflict.label"),
      detail: t("shared.autosync.conflict.detail"),
    };
  }
  if (snapshot.status === "failed") {
    return {
      ...visual,
      label: snapshot.hasUnsyncedChanges
        ? t("shared.autosync.failed.unsyncedLabel")
        : t("shared.autosync.failed.cleanLabel"),
      detail: autosyncFailureDetail(
        snapshot,
        t,
        t("shared.autosync.failed.detail"),
      ),
    };
  }
  if (snapshot.status === "offline") {
    return {
      ...visual,
      label: snapshot.hasUnsyncedChanges
        ? t("shared.autosync.offline.unsyncedLabel")
        : t("shared.autosync.offline.cleanLabel"),
      detail: snapshot.hasUnsyncedChanges
        ? t("shared.autosync.offline.unsyncedDetail")
        : t("shared.autosync.offline.cleanDetail"),
    };
  }
  if (snapshot.status === "blocked") {
    if (snapshot.blockReason === "read_only") {
      return {
        ...visual,
        label: snapshot.hasUnsyncedChanges
          ? t("shared.autosync.readOnly.unsyncedLabel")
          : t("shared.autosync.readOnly.cleanLabel"),
        detail: snapshot.hasUnsyncedChanges
          ? t("shared.autosync.readOnly.unsyncedDetail")
          : t("shared.autosync.readOnly.cleanDetail"),
      };
    }
    const reason = snapshot.blockReason === "signed_out"
      ? t("shared.autosync.blocked.signedOut")
      : snapshot.blockReason === "loading"
        ? t("shared.autosync.blocked.loading")
        : snapshot.blockReason === "access_lost"
          ? t("shared.autosync.blocked.accessLost")
          : t("shared.autosync.blocked.unavailable");
    return {
      ...visual,
      label: snapshot.hasUnsyncedChanges
        ? t("shared.autosync.blocked.savedLabel", { reason })
        : reason,
      detail: autosyncFailureDetail(
        snapshot,
        t,
        t("shared.autosync.blocked.detail"),
      ),
    };
  }
  return {
    ...visual,
    label: t("shared.autosync.local.label"),
    detail: t("shared.autosync.local.detail"),
  };
}

export function SharedRosterAutosyncStatus({
  snapshot,
  onRetry,
  variant = "panel",
}: Props) {
  const { t } = useStripesTranslation();
  if (snapshot.status === "local_only") return null;
  const presentation = sharedRosterAutosyncCatalogPresentation(snapshot, t);
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
            {t("shared.autosync.retry")}
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
          {t("shared.autosync.retry")}
        </Button>
      )}
    </div>
  );
}
