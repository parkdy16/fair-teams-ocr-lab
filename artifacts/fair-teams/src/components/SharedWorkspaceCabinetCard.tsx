import { useEffect, useRef, useState } from "react";
import { Building2, ExternalLink, FileText, FolderOpen, HardDrive, Link2, Loader2, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { StripesConfirmContent, StripesWorkspaceContent } from "@/components/ui/stripes-modal";
import {
  checkFileCabinetResourceRemoval,
  createExternalLinkFileCabinetResourceDraft,
  createGoogleDriveFileCabinetResourceDraft,
  type FileCabinetResource,
} from "@/lib/fileCabinetResource";
import {
  resolveFileCabinetResourceProvider,
  selectFileCabinetGoogleDriveResource,
  type FileCabinetResourceProviderResolution,
} from "@/lib/fileCabinetResourceProvider";
import {
  createFileCabinetResource,
  listenToFileCabinetResources,
  removeFileCabinetResource,
} from "@/lib/fileCabinetResourceService";
import { fileCabinetDriveAccessToken } from "@/lib/fileCabinetDriveAccess";
import {
  authorizeRecordedMyDriveCabinetFolder,
  resolveManagedMyDriveCabinetFolder,
} from "@/lib/googleDriveCabinetApi";
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
import { formatNumber, useStripesTranslation, type StripesTranslator } from "@/i18n";

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

function locationLabel(location: SharedWorkspaceCabinetLocation, t: StripesTranslator) {
  return location.displayName || (location.backing === "my_drive" ? t("cabinet.defaultMyDriveName") : t("cabinet.defaultSharedDriveName"));
}

function externalLinkDefaultName(value: string, t: StripesTranslator) {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, "") || t("cabinet.webLink");
  } catch {
    return t("cabinet.webLink");
  }
}

function relationshipBlockedRemovalText(
  result: {
    relationshipKinds: Array<"action_board" | "equipment">;
    message: string;
  },
  t: StripesTranslator,
) {
  const hasActionBoard = result.relationshipKinds.includes("action_board");
  const hasEquipment = result.relationshipKinds.includes("equipment");
  if (hasActionBoard && hasEquipment) return t("cabinet.notices.removeBlocked.both");
  if (hasActionBoard) return t("cabinet.notices.removeBlocked.actionBoard");
  if (hasEquipment) return t("cabinet.notices.removeBlocked.equipment");
  return result.message;
}

function resourceStateText(state: FileCabinetResourceProviderResolution | undefined, t: StripesTranslator) {
  if (!state) return t("cabinet.state.checking");
  if (state.status === "ready") return t("cabinet.state.ready");
  if (state.status === "reconnect_required") return t("cabinet.state.reconnect");
  if (state.status === "insufficient_permission") return t("cabinet.state.insufficient");
  if (state.status === "unsupported") return t("cabinet.state.unsupported");
  return t("cabinet.state.unavailable");
}

function resourceProviderFailureText(
  state: Exclude<FileCabinetResourceProviderResolution, { status: "ready" }>,
  t: StripesTranslator,
) {
  const fallbackMessage = state.message;
  switch (state.reason) {
    case "drive_reconnect_verify":
      return t("cabinet.providerResolution.driveReconnectVerify");
    case "drive_insufficient_permission":
      return t("cabinet.providerResolution.driveInsufficientPermission");
    case "drive_item_unavailable":
      return t("cabinet.providerResolution.driveItemUnavailable");
    case "unsupported_metadata":
      return t("cabinet.providerResolution.unsupportedMetadata");
    case "invalid_external_link":
      return t("cabinet.providerResolution.invalidExternalLink");
    case "unsupported_provider":
      return t("cabinet.providerResolution.unsupportedProvider");
    case "drive_connect_verify":
      return t("cabinet.providerResolution.driveConnectVerify");
    case "recorded_drive_item_unavailable":
      return t("cabinet.providerResolution.recordedDriveItemUnavailable");
    case "drive_connect_choose":
      return t("cabinet.providerResolution.driveConnectChoose");
    case "picker_unsupported_metadata":
      return t("cabinet.providerResolution.pickerUnsupportedMetadata");
    case "selected_drive_item_unavailable":
      return t("cabinet.providerResolution.selectedDriveItemUnavailable");
    default:
      return fallbackMessage;
  }
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
  const { t, locale } = useStripesTranslation();
  const [location, setLocation] = useState<SharedWorkspaceCabinetLocation | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>("unchecked");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"connect" | "authorize_my_drive" | "my_drive" | "shared_drive" | "save" | "remove" | "">("");
  const [pendingReplacement, setPendingReplacement] = useState<SharedWorkspaceCabinetLocationDraft | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [resources, setResources] = useState<FileCabinetResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [resourceStates, setResourceStates] = useState<Record<string, FileCabinetResourceProviderResolution>>({});
  const [resourceNotice, setResourceNotice] = useState("");
  const [resourceBusy, setResourceBusy] = useState("");
  const [externalLinkEditorOpen, setExternalLinkEditorOpen] = useState(false);
  const [externalLinkUrl, setExternalLinkUrl] = useState("");
  const [externalLinkName, setExternalLinkName] = useState("");
  const [pendingResourceRemoval, setPendingResourceRemoval] = useState<FileCabinetResource | null>(null);
  const driveAuthorizationExpiredRef = useRef(onDriveAuthorizationExpired);

  useEffect(() => {
    driveAuthorizationExpiredRef.current = onDriveAuthorizationExpired;
  }, [onDriveAuthorizationExpired]);

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
        setNotice(error.message || t("cabinet.errors.loadLocation"));
        setLoadingLocation(false);
      },
    );
  }, [scope.kind, scope.id]);

  useEffect(() => {
    setLoadingResources(true);
    setResourceNotice("");
    setResources([]);
    setResourceStates({});
    setExternalLinkEditorOpen(false);
    setExternalLinkUrl("");
    setExternalLinkName("");
    setPendingResourceRemoval(null);
    try {
      return listenToFileCabinetResources(
        scope,
        (next) => {
          setResources(next);
          setLoadingResources(false);
        },
        (error) => {
          setResourceNotice(error.message || t("cabinet.errors.loadItems"));
          setLoadingResources(false);
        },
      );
    } catch (error) {
      setResourceNotice(error instanceof Error ? error.message : t("cabinet.errors.loadItems"));
      setLoadingResources(false);
      return undefined;
    }
  }, [scope.kind, scope.id]);

  useEffect(() => {
    if (!location) setExternalLinkEditorOpen(false);
  }, [location]);

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
      if (state === "reconnect") onDriveAuthorizationExpired(t("cabinet.drive.reconnectVerifyLocation"));
    }).catch((error: unknown) => {
      if (!active) return;
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        setLiveState("reconnect");
        onDriveAuthorizationExpired(t("cabinet.drive.reconnectVerifyLocation"));
      } else {
        setLiveState("unavailable");
      }
    });
    return () => { active = false; };
  }, [accessToken, driveStatus, location, onDriveAuthorizationExpired]);

  useEffect(() => {
    let active = true;
    setResourceStates({});
    if (!open || !resources.length) return () => { active = false; };
    const providerAccessToken = driveStatus === "connected" ? accessToken : "";

    void Promise.all(resources.map(async (resource) => ({
      resourceId: resource.resourceId,
      state: await resolveFileCabinetResourceProvider(resource, providerAccessToken),
    }))).then((resolved) => {
      if (!active) return;
      setResourceStates(Object.fromEntries(resolved.map(({ resourceId, state }) => [resourceId, state])));
      if (providerAccessToken && resolved.some(({ state }) => state.status === "reconnect_required")) {
        driveAuthorizationExpiredRef.current(t("cabinet.drive.reconnectVerifyItems"));
      }
    });

    return () => { active = false; };
  }, [accessToken, driveStatus, open, resources]);

  const saveLocation = async (next: SharedWorkspaceCabinetLocationDraft) => {
    setBusy("save");
    setNotice("");
    try {
      await saveSharedWorkspaceCabinetLocation(scope, next);
      setNotice(t("cabinet.notices.locationSaved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("cabinet.errors.saveLocation"));
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
      if (actionToken) setNotice(t("cabinet.notices.driveConnected"));
    } finally {
      setBusy((current) => current === "connect" ? "" : current);
    }
  };

  const authorizeRecordedMyDrive = async () => {
    if (!location || location.backing !== "my_drive") return;
    setBusy("authorize_my_drive");
    setNotice("");
    try {
      const actionToken = await driveTokenForAction();
      if (!actionToken) return;
      const result = await authorizeRecordedMyDriveCabinetFolder(actionToken, location.folderId);
      if (result.status === "selection_cancelled") {
        setNotice(t("cabinet.notices.authorizationCancelled"));
        return;
      }
      if (result.status === "ready") {
        setLiveState("available");
        setNotice(t("cabinet.notices.accountAuthorized"));
        return;
      }
      if (result.status === "reconnect_required") {
        setLiveState("reconnect");
        onDriveAuthorizationExpired(result.error);
      } else if (result.status === "insufficient_permission") {
        setLiveState("insufficient");
      } else {
        setLiveState("unavailable");
      }
      setNotice(result.error);
    } catch (error) {
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        setLiveState("reconnect");
        onDriveAuthorizationExpired(t("cabinet.drive.reconnectAuthorizeAgain"));
      } else {
        setLiveState("unavailable");
      }
      setNotice(error instanceof Error ? error.message : t("cabinet.errors.authorizeFolder"));
    } finally {
      setBusy((current) => current === "authorize_my_drive" ? "" : current);
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
        setNotice(t("cabinet.notices.multipleFolders"));
        return;
      }
      if (result.status !== "ready") {
        setNotice(t("cabinet.notices.myDriveUnavailable"));
        return;
      }
      await prepareLocation(myDriveCabinetLocationDraft(result.folder));
    } catch (error) {
      if (isGoogleDriveAuthorizationExpiredError(error)) {
        onDriveAuthorizationExpired(t("cabinet.drive.reconnectChooseAgain"));
      }
      setNotice(error instanceof Error ? error.message : t("cabinet.errors.prepareMyDrive"));
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
      setNotice(error instanceof Error ? error.message : t("cabinet.errors.chooseSharedDrive"));
    } finally {
      setBusy((current) => current === "shared_drive" ? "" : current);
    }
  };

  const removeLocation = async () => {
    setBusy("remove");
    setNotice("");
    try {
      await removeSharedWorkspaceCabinetLocation(scope);
      setNotice(t("cabinet.notices.relationshipRemoved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("cabinet.errors.removeRelationship"));
    } finally {
      setBusy("");
      setRemoveConfirmOpen(false);
    }
  };

  const addGoogleDriveResource = async () => {
    if (!location || busy || resourceBusy || driveStatus === "connecting") return;
    setResourceBusy("drive");
    setResourceNotice("");
    try {
      const actionToken = await driveTokenForAction();
      const result = await selectFileCabinetGoogleDriveResource(actionToken);
      if (result.status === "selection_cancelled") return;
      if (result.status !== "ready") {
        const resultMessage = resourceProviderFailureText(result, t);
        if (result.status === "reconnect_required" && actionToken) {
          onDriveAuthorizationExpired(resultMessage);
        }
        setResourceNotice(resultMessage);
        return;
      }
      await createFileCabinetResource(scope, createGoogleDriveFileCabinetResourceDraft(
        result.providerResourceId,
        result.displayName,
        result.resourceKind,
        result.mimeType,
      ));
      setResourceNotice(t("cabinet.notices.driveItemAdded"));
    } catch (error) {
      setResourceNotice(error instanceof Error ? error.message : t("cabinet.errors.addDriveItem"));
    } finally {
      setResourceBusy("");
    }
  };

  const addExternalLink = async () => {
    if (!location || busy || resourceBusy) return;
    setResourceBusy("link");
    setResourceNotice("");
    try {
      const draft = createExternalLinkFileCabinetResourceDraft(
        externalLinkUrl,
        externalLinkName.trim() || externalLinkDefaultName(externalLinkUrl, t),
      );
      await createFileCabinetResource(scope, draft);
      setExternalLinkUrl("");
      setExternalLinkName("");
      setExternalLinkEditorOpen(false);
      setResourceNotice(t("cabinet.notices.webLinkAdded"));
    } catch (error) {
      setResourceNotice(error instanceof Error ? error.message : t("cabinet.errors.addWebLink"));
    } finally {
      setResourceBusy("");
    }
  };

  const openResource = (resource: FileCabinetResource) => {
    const state = resourceStates[resource.resourceId];
    if (state?.status !== "ready") return;
    const opened = window.open(state.openUrl, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  };

  const requestResourceRemoval = (resource: FileCabinetResource) => {
    const removal = checkFileCabinetResourceRemoval(resource);
    if (removal.status === "blocked_by_relationships") {
      setResourceNotice(relationshipBlockedRemovalText(removal, t));
      return;
    }
    setResourceNotice("");
    setPendingResourceRemoval(resource);
  };

  const removeResource = async () => {
    if (!pendingResourceRemoval || resourceBusy) return;
    setResourceBusy(`remove:${pendingResourceRemoval.resourceId}`);
    setResourceNotice("");
    try {
      const result = await removeFileCabinetResource(
        scope,
        pendingResourceRemoval.resourceId,
      );
      if (result.status === "blocked_by_relationships") {
        setResourceNotice(relationshipBlockedRemovalText(result, t));
      } else if (result.status === "removed") {
        setResourceNotice(t("cabinet.notices.entryRemoved"));
      } else {
        setResourceNotice(t("cabinet.notices.entryAlreadyRemoved"));
      }
      setPendingResourceRemoval(null);
    } catch (error) {
      setResourceNotice(error instanceof Error ? error.message : t("cabinet.errors.removeEntry"));
    } finally {
      setResourceBusy("");
    }
  };

  const backingText = location?.backing === "shared_drive" ? t("cabinet.backing.sharedDrive") : t("cabinet.backing.myDrive");
  const availabilityText = liveState === "available"
    ? t("cabinet.availability.available")
    : liveState === "checking"
      ? t("cabinet.availability.checking")
      : liveState === "insufficient"
        ? t("cabinet.availability.insufficient")
        : liveState === "unavailable"
          ? t("cabinet.availability.unavailable")
          : driveStatus === "expired"
            ? t("cabinet.availability.reconnect")
            : t("cabinet.availability.connect");
  const actionDisabled = Boolean(busy) || driveStatus === "connecting";
  const driveReady = driveStatus === "connected" && Boolean(accessToken);

  return (
    <>
      <section className="order-7 overflow-hidden rounded-[1.7rem] border border-blue-100 bg-blue-50/60 p-3 shadow-sm ring-1 ring-blue-50 lg:col-span-1 lg:col-start-1 lg:row-start-4 lg:p-4" aria-label={t("cabinet.title")}>
        <button
          type="button"
          className="stripes-type-ui flex w-full min-w-0 items-center gap-2.5 text-left active:scale-[0.99]"
          onClick={() => onOpenChange(true)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100 lg:h-10 lg:w-10">
            <FolderOpen className="h-5 w-5 lg:h-6 lg:w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-black leading-tight text-[#102A43] lg:text-[22px]">{t("cabinet.title")}</span>
            <span className="mt-0.5 block truncate text-[10px] font-bold text-blue-700/75 lg:text-[13px]">
              {location ? locationLabel(location, t) : t("cabinet.subtitle")}
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
              {t("cabinet.title")}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              {t("cabinet.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {loadingLocation ? (
              <div className="flex min-h-40 items-center justify-center text-sm font-bold text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("cabinet.loading")}
              </div>
            ) : (
              <div className="mx-auto max-w-xl">
                {location ? (
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
                    <div className="text-[10px] font-black uppercase tracking-wide text-blue-700">{t("cabinet.currentLocation")}</div>
                    <div className="mt-1 break-words text-base font-black text-[#102A43]">{locationLabel(location, t)}</div>
                    <div className="mt-1 text-xs font-bold text-slate-600">{backingText} · {availabilityText}</div>
                    {driveAccountLabel && <div className="mt-1 break-words text-[11px] font-semibold text-slate-500">{t("cabinet.googleDriveAccount", { account: driveAccountLabel })}</div>}
                    {!driveReady && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 h-9 rounded-xl border-blue-100 bg-white px-3 text-xs font-black text-blue-800"
                        onClick={() => void reconnectForVerification()}
                        disabled={actionDisabled}
                      >
                        {busy === "connect" || driveStatus === "connecting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {driveStatus === "expired" ? t("cabinet.reconnectGoogleDrive") : t("cabinet.connectGoogleDrive")}
                      </Button>
                    )}
                    {location.backing === "my_drive" && driveReady && liveState === "unavailable" && (
                      <div className="mt-3 rounded-2xl border border-blue-100 bg-white/80 p-3">
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-600">
                          {t("cabinet.authorizeHelp")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 h-9 rounded-xl border-blue-100 bg-white px-3 text-xs font-black text-blue-800"
                          onClick={() => void authorizeRecordedMyDrive()}
                          disabled={actionDisabled}
                        >
                          {busy === "authorize_my_drive" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                          {busy === "authorize_my_drive" ? t("cabinet.authorizing") : t("cabinet.authorize")}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-center">
                    <div className="text-xl font-black text-[#102A43]">{t("cabinet.setup")}</div>
                    <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-relaxed text-slate-500">
                      {t("cabinet.setupHelp")}
                    </p>
                  </div>
                )}

                <div className={location ? "mt-4" : "mt-5"}>
                  {location && <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">{t("cabinet.changeLocation")}</div>}
                  <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                    <Button
                      type="button"
                      className="relative min-h-14 whitespace-normal rounded-2xl bg-blue-700 px-3 text-sm font-black text-white hover:bg-blue-800"
                      onClick={() => void useManagedMyDrive()}
                      disabled={actionDisabled}
                    >
                      {busy === "my_drive" || (busy === "" && driveStatus === "connecting") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HardDrive className="mr-2 h-4 w-4 shrink-0" />}
                      {busy === "my_drive" ? t("cabinet.preparing") : t("cabinet.useMyDrive")}
                      {!location && <span className="absolute right-2 top-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] uppercase tracking-wide">{t("cabinet.recommended")}</span>}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-14 whitespace-normal rounded-2xl border-blue-100 bg-white px-3 text-sm font-black text-blue-800"
                      onClick={() => void chooseSharedDrive()}
                      disabled={actionDisabled}
                    >
                      {busy === "shared_drive" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4 shrink-0" />}
                      {busy === "shared_drive" ? t("cabinet.choosing") : t("cabinet.chooseSharedDrive")}
                    </Button>
                  </div>
                </div>

                {location && (
                  <button type="button" className="mt-3 text-xs font-black text-slate-500 underline-offset-2 hover:underline" onClick={() => setRemoveConfirmOpen(true)} disabled={Boolean(busy)}>
                    {t("cabinet.removeRelationship")}
                  </button>
                )}
                {notice && <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-bold leading-snug text-slate-700" role="status">{notice}</div>}

                <section className="mt-5 border-t border-slate-100 pt-4" aria-label={t("cabinet.itemsAria")}>
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[#102A43]">{t("cabinet.itemsTitle")}</div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        {t("cabinet.itemsHelp")}
                      </div>
                    </div>
                    {!loadingResources && resources.length > 0 && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                        {formatNumber(locale, resources.length)}
                      </span>
                    )}
                  </div>

                  {location && (
                    <div className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-0 rounded-xl border-blue-100 bg-white px-3 text-xs font-black text-blue-800"
                        onClick={() => void addGoogleDriveResource()}
                        disabled={actionDisabled || Boolean(resourceBusy)}
                      >
                        {resourceBusy === "drive" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                        {resourceBusy === "drive" ? t("cabinet.adding") : t("cabinet.addFromDrive")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-0 rounded-xl border-blue-100 bg-white px-3 text-xs font-black text-blue-800"
                        onClick={() => setExternalLinkEditorOpen((current) => !current)}
                        disabled={Boolean(busy) || Boolean(resourceBusy)}
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        {t("cabinet.addWebLink")}
                      </Button>
                    </div>
                  )}

                  {location && externalLinkEditorOpen && (
                    <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
                      <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500" htmlFor="file-cabinet-link-url">
                        {t("cabinet.webAddress")}
                      </label>
                      <Input
                        id="file-cabinet-link-url"
                        type="url"
                        inputMode="url"
                        value={externalLinkUrl}
                        onChange={(event) => setExternalLinkUrl(event.target.value)}
                        placeholder={t("cabinet.webAddressPlaceholder")}
                        className="mt-1 h-10 rounded-xl border-blue-100 bg-white text-sm"
                      />
                      <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500" htmlFor="file-cabinet-link-name">
                        {t("cabinet.name")} <span className="normal-case text-slate-400">{t("cabinet.optional")}</span>
                      </label>
                      <Input
                        id="file-cabinet-link-name"
                        value={externalLinkName}
                        onChange={(event) => setExternalLinkName(event.target.value)}
                        maxLength={200}
                        placeholder={t("cabinet.namePlaceholder")}
                        className="mt-1 h-10 rounded-xl border-blue-100 bg-white text-sm"
                      />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-xl px-3 text-xs font-black text-slate-500"
                          onClick={() => setExternalLinkEditorOpen(false)}
                          disabled={Boolean(busy) || Boolean(resourceBusy)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          className="h-9 rounded-xl bg-blue-700 px-3 text-xs font-black text-white hover:bg-blue-800"
                          onClick={() => void addExternalLink()}
                          disabled={!externalLinkUrl.trim() || Boolean(busy) || Boolean(resourceBusy)}
                        >
                          {resourceBusy === "link" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                          {resourceBusy === "link" ? t("cabinet.adding") : t("cabinet.addLink")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {loadingResources ? (
                    <div className="mt-3 flex min-h-20 items-center justify-center rounded-2xl bg-slate-50 text-xs font-bold text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("cabinet.loadingItems")}
                    </div>
                  ) : resources.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-5 text-center">
                      <div className="text-sm font-black text-[#102A43]">{t("cabinet.empty.title")}</div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">
                        {location ? t("cabinet.empty.withLocation") : t("cabinet.empty.withoutLocation")}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {resources.map((resource) => {
                        const state = resourceStates[resource.resourceId];
                        const ResourceIcon = resource.provider === "external_link"
                          ? Link2
                          : resource.resourceKind === "folder"
                            ? FolderOpen
                            : FileText;
                        return (
                          <div key={resource.resourceId} className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                              <ResourceIcon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-[1_1_9rem]">
                              <span className="block truncate text-xs font-black text-[#102A43]">{resource.displayName}</span>
                              <span className="block truncate text-[10px] font-semibold text-slate-500">
                                {resource.provider === "google_drive" ? t("cabinet.provider.googleDrive") : t("cabinet.webLink")} · {resourceStateText(state, t)}
                              </span>
                            </span>
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                              {state?.status === "ready" ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-8 rounded-lg px-2 text-[10px] font-black text-blue-700"
                                  onClick={() => openResource(resource)}
                                >
                                  {t("cabinet.open")} <ExternalLink className="ml-1 h-3 w-3" />
                                </Button>
                              ) : state?.status === "reconnect_required" && resource.provider === "google_drive" ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-8 rounded-lg px-2 text-[10px] font-black text-blue-700"
                                  onClick={() => void reconnectForVerification()}
                                  disabled={actionDisabled}
                                >
                                  {t("cabinet.connect")}
                                </Button>
                              ) : null}
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                onClick={() => requestResourceRemoval(resource)}
                                disabled={Boolean(resourceBusy)}
                                aria-label={t("cabinet.removeItemAria", { name: resource.displayName })}
                              >
                                {resourceBusy === `remove:${resource.resourceId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {resourceNotice && (
                    <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-bold leading-snug text-slate-700" role="status">
                      {resourceNotice}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </StripesWorkspaceContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingReplacement)} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingReplacement(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cabinet.confirm.changeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cabinet.confirm.changeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingReplacement) void saveLocation(pendingReplacement); }} disabled={busy === "save"}>{t("cabinet.confirm.changeAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cabinet.confirm.removeRelationshipTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cabinet.confirm.removeRelationshipDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeLocation()} disabled={busy === "remove"}>{t("cabinet.confirm.removeRelationshipAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingResourceRemoval)} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingResourceRemoval(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cabinet.confirm.removeEntryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cabinet.confirm.removeEntryDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeResource()} disabled={resourceBusy.startsWith("remove:")}>{t("cabinet.confirm.removeEntryAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>
    </>
  );
}
