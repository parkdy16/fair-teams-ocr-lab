import { useEffect, useState } from "react";
import { Building2, FolderOpen, HardDrive, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StripesConfirmContent } from "@/components/ui/stripes-modal";
import { resolveManagedMyDriveCabinetFolder } from "@/lib/googleDriveCabinetApi";
import { isGoogleDriveAuthorizationExpiredError } from "@/lib/googleDriveConnection";
import {
  resolveGoogleDriveSharedCabinetLocation,
  selectGoogleDriveSharedCabinetLocation,
} from "@/lib/googleDriveSharedCabinetApi";
import {
  isSameSharedWorkspaceCabinetLocation,
  myDriveCabinetLocationDraft,
  sharedDriveCabinetLocationDraft,
  type SharedWorkspaceCabinetLocation,
  type SharedWorkspaceCabinetLocationDraft,
} from "@/lib/sharedWorkspaceCabinet";
import {
  listenToSharedWorkspaceCabinetLocation,
  removeSharedWorkspaceCabinetLocation,
  saveSharedWorkspaceCabinetLocation,
  type SharedWorkspaceCabinetScope,
} from "@/lib/sharedWorkspaceCabinetService";

type Props = {
  scope: SharedWorkspaceCabinetScope;
  driveStatus: "disconnected" | "connecting" | "connected" | "expired" | "error";
  driveAccountLabel?: string;
  accessToken: string;
  onConnectDrive: () => Promise<unknown> | unknown;
  onDriveAuthorizationExpired: (message: string) => void;
};

type LiveState = "unchecked" | "checking" | "available" | "unavailable" | "insufficient" | "reconnect";

function locationLabel(location: SharedWorkspaceCabinetLocation) {
  return location.displayName || (location.backing === "my_drive" ? "Stripes Cabinet" : "Shared Drive folder");
}

export function SharedWorkspaceCabinetCard({
  scope,
  driveStatus,
  driveAccountLabel,
  accessToken,
  onConnectDrive,
  onDriveAuthorizationExpired,
}: Props) {
  const [location, setLocation] = useState<SharedWorkspaceCabinetLocation | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>("unchecked");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"my_drive" | "shared_drive" | "save" | "remove" | "">("");
  const [pendingReplacement, setPendingReplacement] = useState<SharedWorkspaceCabinetLocationDraft | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  useEffect(() => {
    setLoadingLocation(true);
    setNotice("");
    return listenToSharedWorkspaceCabinetLocation(
      scope,
      (next) => {
        setLocation(next);
        setLoadingLocation(false);
      },
      (error) => {
        setNotice(error.message || "Could not load the Club Cabinet location.");
        setLoadingLocation(false);
      },
    );
  }, [scope.kind, scope.id]);

  useEffect(() => {
    let active = true;
    if (!location || driveStatus !== "connected" || !accessToken) {
      setLiveState("unchecked");
      return () => { active = false; };
    }
    setLiveState("checking");
    const check = location.backing === "my_drive"
      ? resolveManagedMyDriveCabinetFolder(accessToken, location.folderId, true)
          .then((result) => result.status === "ready" ? "available" as const : "unavailable" as const)
      : resolveGoogleDriveSharedCabinetLocation(
          accessToken,
          location.folderId,
          location.driveId || "",
        ).then((result) => {
          if (result.status === "ready") return "available" as const;
          if (result.status === "reconnect_required") return "reconnect" as const;
          if (result.status === "insufficient_permission") return "insufficient" as const;
          return "unavailable" as const;
        });
    void check.then((state) => {
      if (!active) return;
      setLiveState(state);
      if (state === "reconnect") onDriveAuthorizationExpired("Reconnect Google Drive to verify the Club Cabinet location.");
    }).catch((error: unknown) => {
      if (!active) return;
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        setLiveState("reconnect");
        onDriveAuthorizationExpired("Reconnect Google Drive to verify the Club Cabinet location.");
      } else {
        setLiveState("unavailable");
      }
    });
    return () => { active = false; };
  }, [accessToken, driveStatus, location, onDriveAuthorizationExpired]);

  const saveLocation = async (next: SharedWorkspaceCabinetLocationDraft) => {
    setBusy("save");
    setNotice("");
    try {
      await saveSharedWorkspaceCabinetLocation(scope, next);
      setNotice("Club Cabinet location saved. Existing Google folders and files were not changed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the Club Cabinet location.");
    } finally {
      setBusy("");
      setPendingReplacement(null);
    }
  };

  const prepareLocation = async (next: SharedWorkspaceCabinetLocationDraft) => {
    if (location && !isSameSharedWorkspaceCabinetLocation(location, next)) {
      setPendingReplacement(next);
      return;
    }
    await saveLocation(next);
  };

  const useManagedMyDrive = async () => {
    if (!accessToken || driveStatus !== "connected") return;
    setBusy("my_drive");
    setNotice("");
    try {
      const result = await resolveManagedMyDriveCabinetFolder(accessToken);
      if (result.status === "ambiguous") {
        setNotice("Multiple managed Stripes Cabinet folders were found. The current location was not changed.");
        return;
      }
      if (result.status !== "ready") {
        setNotice("The managed My Drive Cabinet folder is unavailable.");
        return;
      }
      await prepareLocation(myDriveCabinetLocationDraft(result.folder));
    } catch (error) {
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        onDriveAuthorizationExpired("Reconnect Google Drive, then choose the Cabinet location again.");
      }
      setNotice(error instanceof Error ? error.message : "Could not prepare the My Drive Cabinet.");
    } finally {
      setBusy((current) => current === "my_drive" ? "" : current);
    }
  };

  const chooseSharedDrive = async () => {
    if (!accessToken || driveStatus !== "connected") return;
    setBusy("shared_drive");
    setNotice("");
    try {
      const result = await selectGoogleDriveSharedCabinetLocation(accessToken);
      if (result.status === "selection_cancelled") return;
      if (result.status !== "ready") {
        if (result.status === "reconnect_required") onDriveAuthorizationExpired(result.error);
        setNotice(result.error);
        return;
      }
      await prepareLocation(sharedDriveCabinetLocationDraft(result));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not choose the Shared Drive folder.");
    } finally {
      setBusy((current) => current === "shared_drive" ? "" : current);
    }
  };

  const removeLocation = async () => {
    setBusy("remove");
    setNotice("");
    try {
      await removeSharedWorkspaceCabinetLocation(scope);
      setNotice("Stripes no longer uses that Cabinet location. Google folders and files were not deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove the Club Cabinet relationship.");
    } finally {
      setBusy("");
      setRemoveConfirmOpen(false);
    }
  };

  const statusText = loadingLocation
    ? "Loading Cabinet location…"
    : !location
      ? "No Club Cabinet location configured"
      : liveState === "available"
        ? `${locationLabel(location)} · Available`
        : liveState === "checking"
          ? `${locationLabel(location)} · Checking access…`
          : liveState === "insufficient"
            ? `${locationLabel(location)} · Insufficient Google access`
            : liveState === "unavailable"
              ? `${locationLabel(location)} · Unavailable`
              : `${locationLabel(location)} · Connect Drive to verify`;

  const driveReady = driveStatus === "connected" && Boolean(accessToken);

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3" aria-label="Club Cabinet location">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
          <FolderOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-wide text-blue-700">Club Cabinet</div>
          <div className="mt-0.5 break-words text-xs font-black text-[#102A43]">{statusText}</div>
          <div className="mt-1 text-[10px] font-semibold leading-snug text-slate-500">
            {location?.backing === "shared_drive" ? "Shared Drive backing" : location ? "My Drive backing" : "Google stores the files; Stripes remembers this club location."}
            {driveAccountLabel ? ` · Drive: ${driveAccountLabel}` : ""}
          </div>
        </div>
      </div>

      {!driveReady ? (
        <Button
          type="button"
          className="mt-3 h-9 w-full rounded-xl bg-blue-700 text-xs font-black text-white hover:bg-blue-800"
          onClick={() => void onConnectDrive()}
          disabled={driveStatus === "connecting"}
        >
          {driveStatus === "connecting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {driveStatus === "expired" ? "Reconnect Google Drive" : "Connect Google Drive"}
        </Button>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
          <Button type="button" variant="outline" className="min-h-9 whitespace-normal rounded-xl border-blue-100 bg-white px-2 text-[10px] font-black text-blue-800" onClick={() => void useManagedMyDrive()} disabled={Boolean(busy)}>
            <HardDrive className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            {busy === "my_drive" ? "Checking…" : "Use My Drive Cabinet"}
          </Button>
          <Button type="button" variant="outline" className="min-h-9 whitespace-normal rounded-xl border-blue-100 bg-white px-2 text-[10px] font-black text-blue-800" onClick={() => void chooseSharedDrive()} disabled={Boolean(busy)}>
            <Building2 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            {busy === "shared_drive" ? "Choosing…" : "Choose Shared Drive"}
          </Button>
        </div>
      )}

      {location && (
        <button type="button" className="mt-2 text-[10px] font-black text-slate-500 underline-offset-2 hover:underline" onClick={() => setRemoveConfirmOpen(true)} disabled={Boolean(busy)}>
          Remove Cabinet relationship
        </button>
      )}
      {notice && <div className="mt-2 rounded-xl bg-white/80 px-2.5 py-2 text-[10px] font-bold leading-snug text-slate-700" role="status">{notice}</div>}

      <AlertDialog open={Boolean(pendingReplacement)} onOpenChange={(open) => { if (!open) setPendingReplacement(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Club Cabinet?</AlertDialogTitle>
            <AlertDialogDescription>
              Stripes will stop using the current Google folder as this club’s Cabinet. Existing folders and files will remain unchanged in Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingReplacement) void saveLocation(pendingReplacement); }} disabled={busy === "save"}>Change Cabinet</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Club Cabinet relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              Stripes will forget this club’s Cabinet location. The Google folder, files and Google permissions will not be changed or deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeLocation()} disabled={busy === "remove"}>Remove relationship</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>
    </section>
  );
}
