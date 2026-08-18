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
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StripesConfirmContent, StripesWorkspaceContent } from "@/components/ui/stripes-modal";
import { fileCabinetDriveAccessToken } from "@/lib/fileCabinetDriveAccess";
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
  googleLoginHint?: string;
  accessToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectDrive: (loginHint?: string) => Promise<string>;
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
  googleLoginHint,
  accessToken,
  open,
  onOpenChange,
  onConnectDrive,
  onDriveAuthorizationExpired,
}: Props) {
  const [location, setLocation] = useState<SharedWorkspaceCabinetLocation | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>("unchecked");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"connect" | "my_drive" | "shared_drive" | "save" | "remove" | "">("");
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
        setNotice(error.message || "Could not load the File Cabinet location.");
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
      if (state === "reconnect") onDriveAuthorizationExpired("Reconnect Google Drive to verify the File Cabinet location.");
    }).catch((error: unknown) => {
      if (!active) return;
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        setLiveState("reconnect");
        onDriveAuthorizationExpired("Reconnect Google Drive to verify the File Cabinet location.");
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
      setNotice("File Cabinet location saved. Existing Google folders and files were not changed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the File Cabinet location.");
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

  const driveTokenForAction = () => fileCabinetDriveAccessToken({
    driveStatus,
    accessToken,
    rememberedDriveAccount: driveAccountLabel,
    googleLoginHint,
    requestDriveAccess: onConnectDrive,
  });

  const reconnectForVerification = async () => {
    setBusy("connect");
    setNotice("");
    try {
      const actionToken = await driveTokenForAction();
      if (actionToken) setNotice("Google Drive connected. Checking the saved File Cabinet location…");
    } finally {
      setBusy((current) => current === "connect" ? "" : current);
    }
  };

  const useManagedMyDrive = async () => {
    setBusy("my_drive");
    setNotice("");
    try {
      const actionToken = await driveTokenForAction();
      if (!actionToken) return;
      const result = await resolveManagedMyDriveCabinetFolder(actionToken);
      if (result.status === "ambiguous") {
        setNotice("Multiple Stripes Cabinet folders were found. The current File Cabinet location was not changed.");
        return;
      }
      if (result.status !== "ready") {
        setNotice("The File Cabinet folder in My Drive is unavailable.");
        return;
      }
      await prepareLocation(myDriveCabinetLocationDraft(result.folder));
    } catch (error) {
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        onDriveAuthorizationExpired("Reconnect Google Drive, then choose the File Cabinet location again.");
      }
      setNotice(error instanceof Error ? error.message : "Could not prepare File Cabinet in My Drive.");
    } finally {
      setBusy((current) => current === "my_drive" ? "" : current);
    }
  };

  const chooseSharedDrive = async () => {
    setBusy("shared_drive");
    setNotice("");
    try {
      const actionToken = await driveTokenForAction();
      if (!actionToken) return;
      const result = await selectGoogleDriveSharedCabinetLocation(actionToken);
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
      setNotice("Stripes no longer uses that File Cabinet location. Google folders and files were not deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove the File Cabinet relationship.");
    } finally {
      setBusy("");
      setRemoveConfirmOpen(false);
    }
  };

  const backingText = location?.backing === "shared_drive" ? "Shared Drive" : "My Drive";
  const availabilityText = liveState === "available"
    ? "Available"
    : liveState === "checking"
      ? "Checking access…"
      : liveState === "insufficient"
        ? "Insufficient Google access"
        : liveState === "unavailable"
          ? "Unavailable"
          : driveStatus === "expired"
            ? "Reconnect Drive to verify"
            : "Connect Drive to verify";
  const actionDisabled = Boolean(busy) || driveStatus === "connecting";
  const driveReady = driveStatus === "connected" && Boolean(accessToken);

  return (
    <>
      <section className="order-7 overflow-hidden rounded-[1.7rem] border border-blue-100 bg-blue-50/60 p-3 shadow-sm ring-1 ring-blue-50 lg:col-span-1 lg:col-start-1 lg:row-start-4 lg:p-4" aria-label="File Cabinet">
        <button
          type="button"
          className="stripes-type-ui flex w-full min-w-0 items-center gap-2.5 text-left active:scale-[0.99]"
          onClick={() => onOpenChange(true)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100 lg:h-10 lg:w-10">
            <FolderOpen className="h-5 w-5 lg:h-6 lg:w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-black leading-tight text-[#102A43] lg:text-[22px]">File Cabinet</span>
            <span className="mt-0.5 block truncate text-[10px] font-bold text-blue-700/75 lg:text-[13px]">
              {location ? locationLabel(location) : "Club files and documents"}
            </span>
            {location && (
              <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500 lg:text-[12px]">
                {backingText} · {availabilityText}
              </span>
            )}
          </span>
          <span className="text-xl font-black text-blue-300" aria-hidden="true">›</span>
        </button>
      </section>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <StripesWorkspaceContent onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader className="border-b border-blue-100 bg-blue-50/70 px-4 py-3 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-[#102A43]">
              <FolderOpen className="h-5 w-5 text-blue-700" />
              File Cabinet
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              Club files and documents
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {loadingLocation ? (
              <div className="flex min-h-40 items-center justify-center text-sm font-bold text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading File Cabinet…
              </div>
            ) : (
              <div className="mx-auto max-w-xl">
                {location ? (
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
                    <div className="text-[10px] font-black uppercase tracking-wide text-blue-700">Current location</div>
                    <div className="mt-1 break-words text-base font-black text-[#102A43]">{locationLabel(location)}</div>
                    <div className="mt-1 text-xs font-bold text-slate-600">{backingText} · {availabilityText}</div>
                    {driveAccountLabel && <div className="mt-1 break-words text-[11px] font-semibold text-slate-500">Google Drive: {driveAccountLabel}</div>}
                    {!driveReady && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 h-9 rounded-xl border-blue-100 bg-white px-3 text-xs font-black text-blue-800"
                        onClick={() => void reconnectForVerification()}
                        disabled={actionDisabled}
                      >
                        {busy === "connect" || driveStatus === "connecting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {driveStatus === "expired" ? "Reconnect Google Drive" : "Connect Google Drive"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-center">
                    <div className="text-xl font-black text-[#102A43]">Set up File Cabinet</div>
                    <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-relaxed text-slate-500">
                      Choose where Google should keep this club’s files and documents.
                    </p>
                  </div>
                )}

                <div className={location ? "mt-4" : "mt-5"}>
                  {location && <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Change location</div>}
                  <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                    <Button
                      type="button"
                      className="relative min-h-14 whitespace-normal rounded-2xl bg-blue-700 px-3 text-sm font-black text-white hover:bg-blue-800"
                      onClick={() => void useManagedMyDrive()}
                      disabled={actionDisabled}
                    >
                      {busy === "my_drive" || (busy === "" && driveStatus === "connecting") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HardDrive className="mr-2 h-4 w-4 shrink-0" />}
                      {busy === "my_drive" ? "Preparing…" : "Use My Drive"}
                      {!location && <span className="absolute right-2 top-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] uppercase tracking-wide">Recommended</span>}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-14 whitespace-normal rounded-2xl border-blue-100 bg-white px-3 text-sm font-black text-blue-800"
                      onClick={() => void chooseSharedDrive()}
                      disabled={actionDisabled}
                    >
                      {busy === "shared_drive" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4 shrink-0" />}
                      {busy === "shared_drive" ? "Choosing…" : "Choose Shared Drive"}
                    </Button>
                  </div>
                </div>

                {location && (
                  <button type="button" className="mt-3 text-xs font-black text-slate-500 underline-offset-2 hover:underline" onClick={() => setRemoveConfirmOpen(true)} disabled={Boolean(busy)}>
                    Remove File Cabinet relationship
                  </button>
                )}
                {notice && <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-bold leading-snug text-slate-700" role="status">{notice}</div>}
              </div>
            )}
          </div>
        </StripesWorkspaceContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingReplacement)} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingReplacement(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change File Cabinet?</AlertDialogTitle>
            <AlertDialogDescription>
              Stripes will stop using the current Google folder as this club’s File Cabinet. Existing folders and files will remain unchanged in Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingReplacement) void saveLocation(pendingReplacement); }} disabled={busy === "save"}>Change File Cabinet</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove File Cabinet relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              Stripes will forget this club’s File Cabinet location. The Google folder, files and Google permissions will not be changed or deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeLocation()} disabled={busy === "remove"}>Remove relationship</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>
    </>
  );
}
