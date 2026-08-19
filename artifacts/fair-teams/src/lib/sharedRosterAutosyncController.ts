import type { RoomRoster } from "./localRoster.ts";
import type {
  FirebaseSharedRosterSnapshot,
  FirebaseSharedRosterSummary,
} from "./sharedRosterService.ts";
import type { ActiveSharedWorkspaceAuthorityStatus } from "./activeSharedWorkspaceAuthorityState.ts";
import { firebaseSharedRosterMaterialRevisionKey } from "./sharedRosterSyncPayload.ts";

export type SharedRosterAutosyncStatus =
  | "local_only"
  | "synced"
  | "scheduled"
  | "saving"
  | "failed"
  | "conflict"
  | "blocked"
  | "offline";

export type SharedRosterAutosyncErrorKind =
  | "authority"
  | "network"
  | "conflict"
  | "unknown";

export type SharedRosterAutosyncBlockReason =
  | "signed_out"
  | "loading"
  | "access_lost"
  | "unavailable"
  | "read_only";

export type SharedRosterAutosyncSnapshot = {
  contextKey: string;
  status: SharedRosterAutosyncStatus;
  latestRevision: number;
  confirmedRevision: number;
  inFlightRevision: number | null;
  hasUnsyncedChanges: boolean;
  lastConfirmedAt: string | null;
  errorKind: SharedRosterAutosyncErrorKind | null;
  errorCode: string | null;
  errorMessage: string | null;
  blockReason: SharedRosterAutosyncBlockReason | null;
  retryable: boolean;
};

export const LOCAL_ONLY_SHARED_ROSTER_AUTOSYNC_SNAPSHOT: SharedRosterAutosyncSnapshot = {
  contextKey: "",
  status: "local_only",
  latestRevision: 0,
  confirmedRevision: 0,
  inFlightRevision: null,
  hasUnsyncedChanges: false,
  lastConfirmedAt: null,
  errorKind: null,
  errorCode: null,
  errorMessage: null,
  blockReason: null,
  retryable: false,
};

export type SharedRosterAutosyncAvailability = {
  authorityStatus: ActiveSharedWorkspaceAuthorityStatus;
  canEdit: boolean;
  online: boolean;
};

export type SharedRosterAutosyncContext = SharedRosterAutosyncAvailability & {
  contextKey: string;
  localRosterId: string;
  roster: RoomRoster | undefined;
};

export type SharedRosterAutosyncFailure = {
  kind: SharedRosterAutosyncErrorKind;
  code: string;
  message: string;
};

export type SharedRosterAutosyncPresentation = {
  label: string;
  detail: string;
  tone: "success" | "progress" | "warning" | "error" | "muted";
  busy: boolean;
};

export type SharedRosterAutosyncDependencies = {
  saveRoster: (roster: RoomRoster) => Promise<FirebaseSharedRosterSummary>;
  onSaveConfirmed: (
    summary: FirebaseSharedRosterSummary,
    localRosterId: string,
    savedRevision: number,
    savedRevisionKey: string,
  ) => void;
  onRemoteApplied: (
    snapshot: FirebaseSharedRosterSnapshot,
    localRosterId: string,
  ) => void;
  classifyError?: (error: unknown) => SharedRosterAutosyncFailure;
};

type Listener = (snapshot: SharedRosterAutosyncSnapshot) => void;

type PhysicalSave = {
  contextKey: string;
  operationId: number;
  promise: Promise<boolean>;
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? String(code) : "";
}

export function classifySharedRosterAutosyncError(error: unknown): SharedRosterAutosyncFailure {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error || "");
  if (
    code === "shared-roster-version-conflict"
    || /saved by someone else|online roster changed|remote version/i.test(message)
  ) {
    return {
      kind: "conflict",
      code: code || "shared-roster-version-conflict",
      message: "The online roster changed. Your edits are still saved on this device.",
    };
  }
  if (
    /permission-denied|unauthenticated|failed-precondition/i.test(code)
    || /permission denied|missing or insufficient permissions|not a member|edit permission/i.test(message)
  ) {
    return {
      kind: "authority",
      code: code || "shared-roster-access-changed",
      message: "Shared roster access changed. Your edits are still saved on this device.",
    };
  }
  if (
    /unavailable|deadline-exceeded|resource-exhausted|network-request-failed/i.test(code)
    || /network|offline|could not reach|temporarily unavailable/i.test(message)
  ) {
    return {
      kind: "network",
      code: code || "shared-roster-network-unavailable",
      message: "Stripes could not reach Firebase. Your edits are saved on this device.",
    };
  }
  return {
    kind: "unknown",
    code: code || "shared-roster-sync-failed",
    message: "Stripes could not sync this roster. Your edits are saved on this device.",
  };
}

export function sharedRosterAutosyncRevisionKey(roster: RoomRoster | undefined) {
  return firebaseSharedRosterMaterialRevisionKey(roster);
}

export function sharedRosterHasUnsyncedLocalChanges(roster: RoomRoster | undefined) {
  const source = roster?.cloudSource?.provider === "firebase" ? roster.cloudSource : undefined;
  if (!roster || !source?.firebaseRosterId) return false;
  if (!source.firebaseLastSyncedMaterialKey) return true;
  return sharedRosterAutosyncRevisionKey(roster) !== source.firebaseLastSyncedMaterialKey;
}

export function sharedRosterAutosyncPresentation(
  snapshot: SharedRosterAutosyncSnapshot,
): SharedRosterAutosyncPresentation {
  if (snapshot.status === "synced") {
    return {
      label: "Saved online",
      detail: "This device matches the shared Firebase roster.",
      tone: "success",
      busy: false,
    };
  }
  if (snapshot.status === "scheduled") {
    return {
      label: "Saved on this device · Waiting to sync",
      detail: "Your latest edit is stored locally and will be saved online shortly.",
      tone: "progress",
      busy: true,
    };
  }
  if (snapshot.status === "saving") {
    return {
      label: "Saving online…",
      detail: "Your latest edit is already saved on this device.",
      tone: "progress",
      busy: true,
    };
  }
  if (snapshot.status === "conflict") {
    return {
      label: "Online version changed",
      detail: "Your unsynced edits remain on this device. Stripes did not overwrite either version.",
      tone: "error",
      busy: false,
    };
  }
  if (snapshot.status === "failed") {
    return {
      label: snapshot.hasUnsyncedChanges
        ? "Saved on this device · Not synced"
        : "Online sync status unavailable",
      detail: snapshot.errorMessage || "Stripes could not confirm the shared roster state.",
      tone: "error",
      busy: false,
    };
  }
  if (snapshot.status === "offline") {
    return {
      label: snapshot.hasUnsyncedChanges
        ? "Saved on this device · Offline"
        : "Saved online · Offline",
      detail: snapshot.hasUnsyncedChanges
        ? "Your edit will remain local until this device reconnects."
        : "The last confirmed online save remains available on this device.",
      tone: "warning",
      busy: false,
    };
  }
  if (snapshot.status === "blocked") {
    if (snapshot.blockReason === "read_only") {
      return {
        label: snapshot.hasUnsyncedChanges
          ? "Saved on this device · No edit access"
          : "View only · Online roster",
        detail: snapshot.hasUnsyncedChanges
          ? "This account cannot save these local edits to the shared roster."
          : "This account can view the shared roster but cannot edit it.",
        tone: snapshot.hasUnsyncedChanges ? "warning" : "muted",
        busy: false,
      };
    }
    const reason = snapshot.blockReason === "signed_out"
      ? "Sign in to sync"
      : snapshot.blockReason === "loading"
        ? "Checking shared access…"
        : snapshot.blockReason === "access_lost"
          ? "Shared access lost"
          : "Shared sync unavailable";
    return {
      label: snapshot.hasUnsyncedChanges ? `Saved on this device · ${reason}` : reason,
      detail: snapshot.errorMessage || "Local roster data remains saved on this device.",
      tone: snapshot.hasUnsyncedChanges ? "warning" : "muted",
      busy: snapshot.blockReason === "loading",
    };
  }
  return {
    label: "Local roster",
    detail: "This roster is saved on this device.",
    tone: "muted",
    busy: false,
  };
}

function blockReasonForAvailability(
  availability: SharedRosterAutosyncAvailability,
): SharedRosterAutosyncBlockReason | null {
  if (availability.authorityStatus === "signed_out") return "signed_out";
  if (availability.authorityStatus === "loading") return "loading";
  if (availability.authorityStatus === "access_lost") return "access_lost";
  if (availability.authorityStatus === "unavailable") return "unavailable";
  if (availability.authorityStatus === "authorized" && !availability.canEdit) return "read_only";
  return null;
}

function rosterWithExpectedFirebaseVersion(roster: RoomRoster, version: number) {
  const source = roster.cloudSource?.provider === "firebase" ? roster.cloudSource : undefined;
  if (!source) return roster;
  return {
    ...roster,
    cloudSource: {
      ...source,
      firebaseVersion: Math.max(1, version || source.firebaseVersion || 1),
    },
  };
}

export class SharedRosterAutosyncController {
  private readonly dependencies: SharedRosterAutosyncDependencies;
  private readonly listeners = new Set<Listener>();
  private snapshot: SharedRosterAutosyncSnapshot = {
    ...LOCAL_ONLY_SHARED_ROSTER_AUTOSYNC_SNAPSHOT,
  };
  private context: SharedRosterAutosyncContext | null = null;
  private latestRoster: RoomRoster | undefined;
  private observedRevisionKey = "";
  private remoteVersion = 0;
  private operationId = 0;
  private physicalSave: PhysicalSave | null = null;
  private deferredRemote: FirebaseSharedRosterSnapshot | null = null;
  private errorSource: "save" | "listener" | null = null;

  constructor(dependencies: SharedRosterAutosyncDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispose() {
    this.operationId += 1;
    this.context = null;
    this.latestRoster = undefined;
    this.physicalSave = null;
    this.deferredRemote = null;
    this.listeners.clear();
  }

  configure(nextContext: SharedRosterAutosyncContext) {
    const source = nextContext.roster?.cloudSource?.provider === "firebase"
      ? nextContext.roster.cloudSource
      : undefined;
    const isShared = Boolean(source?.firebaseRosterId);
    const nextRevisionKey = sharedRosterAutosyncRevisionKey(nextContext.roster);

    if (!this.context || this.context.contextKey !== nextContext.contextKey) {
      this.operationId += 1;
      this.physicalSave = null;
      this.deferredRemote = null;
      this.errorSource = null;
      this.context = nextContext;
      this.latestRoster = nextContext.roster;
      this.observedRevisionKey = nextRevisionKey;
      this.remoteVersion = typeof source?.firebaseVersion === "number" ? source.firebaseVersion : 0;
      const dirty = isShared && sharedRosterHasUnsyncedLocalChanges(nextContext.roster);
      this.snapshot = this.withDerivedFields({
        contextKey: nextContext.contextKey,
        status: isShared ? this.availableStatus(dirty, nextContext, null) : "local_only",
        latestRevision: dirty ? 1 : 0,
        confirmedRevision: 0,
        inFlightRevision: null,
        hasUnsyncedChanges: dirty,
        lastConfirmedAt: source?.lastSyncedAt || null,
        errorKind: null,
        errorCode: null,
        errorMessage: null,
        blockReason: isShared ? blockReasonForAvailability(nextContext) : null,
        retryable: false,
      });
      this.emit();
      return;
    }

    const previousContext = this.context;
    const localRevisionChanged = Boolean(
      isShared
      && nextRevisionKey
      && nextRevisionKey !== this.observedRevisionKey,
    );
    this.context = nextContext;
    this.latestRoster = nextContext.roster;
    if (typeof source?.firebaseVersion === "number") {
      this.remoteVersion = Math.max(this.remoteVersion, source.firebaseVersion);
    }

    if (!isShared) {
      this.invalidateInFlight();
      this.observedRevisionKey = nextRevisionKey;
      this.snapshot = this.withDerivedFields({
        ...this.snapshot,
        status: "local_only",
        latestRevision: 0,
        confirmedRevision: 0,
        inFlightRevision: null,
        hasUnsyncedChanges: false,
        errorKind: null,
        errorCode: null,
        errorMessage: null,
        blockReason: null,
      });
      this.emit();
      return;
    }

    if (localRevisionChanged) {
      this.observedRevisionKey = nextRevisionKey;
      this.recordLocalRevision();
    }

    const lostAuthority = (
      previousContext.authorityStatus === "authorized"
      && previousContext.canEdit
      && (nextContext.authorityStatus !== "authorized" || !nextContext.canEdit)
    );
    if (lostAuthority) this.invalidateInFlight();

    this.applyAvailability(previousContext);
    this.emit();
  }

  async retry() {
    return this.saveLatest();
  }

  async saveLatest(): Promise<boolean> {
    const context = this.context;
    if (!context || !this.latestRoster || !this.snapshot.hasUnsyncedChanges) return false;
    if (this.snapshot.status === "conflict") return false;
    if (context.authorityStatus !== "authorized" || !context.canEdit || !context.online) return false;
    if (this.physicalSave?.contextKey === context.contextKey) return this.physicalSave.promise;

    const revision = this.snapshot.latestRevision;
    const rosterToSave = rosterWithExpectedFirebaseVersion(this.latestRoster, this.remoteVersion);
    const operationId = ++this.operationId;
    this.snapshot = this.withDerivedFields({
      ...this.snapshot,
      status: "saving",
      inFlightRevision: revision,
      errorKind: null,
      errorCode: null,
      errorMessage: null,
      blockReason: null,
    });
    this.errorSource = null;
    this.emit();

    const promise = this.dependencies.saveRoster(rosterToSave)
      .then((summary) => {
        if (!this.operationIsCurrent(context.contextKey, operationId)) return false;
        if (this.context?.authorityStatus !== "authorized" || !this.context.canEdit) return false;

        this.remoteVersion = summary.version;
        this.dependencies.onSaveConfirmed(
          summary,
          context.localRosterId,
          revision,
          sharedRosterAutosyncRevisionKey(rosterToSave),
        );
        const confirmedRevision = Math.max(this.snapshot.confirmedRevision, revision);
        this.snapshot = {
          ...this.snapshot,
          confirmedRevision,
          inFlightRevision: null,
          lastConfirmedAt: summary.updatedAt || new Date().toISOString(),
          errorKind: null,
          errorCode: null,
          errorMessage: null,
          blockReason: null,
        };

        const deferredRemote = this.deferredRemote;
        this.deferredRemote = null;
        if (deferredRemote && deferredRemote.version > summary.version) {
          if (this.snapshot.latestRevision > confirmedRevision) {
            this.markConflict();
          } else {
            this.applyRemote(deferredRemote);
          }
        } else {
          this.snapshot = this.withDerivedFields({
            ...this.snapshot,
            status: this.availableStatus(
              this.snapshot.latestRevision > confirmedRevision,
              this.context!,
            ),
          });
          this.emit();
        }
        return true;
      })
      .catch((error) => {
        if (!this.operationIsCurrent(context.contextKey, operationId)) return false;
        const deferredRemote = this.deferredRemote;
        this.deferredRemote = null;
        if (deferredRemote && deferredRemote.version > this.remoteVersion) {
          this.markConflict();
          return false;
        }
        const failure = (this.dependencies.classifyError || classifySharedRosterAutosyncError)(error);
        this.errorSource = "save";
        this.snapshot = this.withDerivedFields({
          ...this.snapshot,
          status: failure.kind === "conflict"
            ? "conflict"
            : failure.kind === "authority"
              ? "blocked"
              : failure.kind === "network" && !this.context!.online
                ? "offline"
                : "failed",
          inFlightRevision: null,
          errorKind: failure.kind,
          errorCode: failure.code,
          errorMessage: failure.message,
          blockReason: failure.kind === "authority"
            ? blockReasonForAvailability(this.context!) || "unavailable"
            : null,
        });
        this.emit();
        return false;
      })
      .finally(() => {
        if (this.physicalSave?.operationId !== operationId) return;
        this.physicalSave = null;
        if (this.context?.contextKey !== context.contextKey) return;
        if (this.snapshot.inFlightRevision === revision) {
          this.snapshot = this.withDerivedFields({
            ...this.snapshot,
            inFlightRevision: null,
            status: this.availableStatus(this.snapshot.hasUnsyncedChanges, this.context),
          });
        } else {
          this.snapshot = this.withDerivedFields({ ...this.snapshot });
        }
        this.emit();
      });

    this.physicalSave = { contextKey: context.contextKey, operationId, promise };
    return promise;
  }

  handleRemoteSnapshot(remote: FirebaseSharedRosterSnapshot) {
    if (
      !this.context
      || this.context.authorityStatus !== "authorized"
      || remote.id !== this.authoritativeRosterId()
    ) return;
    if (remote.version < this.remoteVersion) return;

    if (remote.version === this.remoteVersion) {
      const source = this.latestRoster?.cloudSource?.provider === "firebase"
        ? this.latestRoster.cloudSource
        : undefined;
      const canBootstrapMaterialConfirmation = (
        !source?.firebaseLastSyncedMaterialKey
        && this.snapshot.inFlightRevision === null
        && !this.physicalSave
        && sharedRosterAutosyncRevisionKey(this.latestRoster)
          === sharedRosterAutosyncRevisionKey(remote.roster)
      );
      if (canBootstrapMaterialConfirmation) {
        this.applyRemote(remote);
        return;
      }
      if (this.errorSource === "listener") {
        this.errorSource = null;
        this.snapshot = this.withDerivedFields({
          ...this.snapshot,
          status: this.availableStatus(this.snapshot.hasUnsyncedChanges, this.context),
          errorKind: null,
          errorCode: null,
          errorMessage: null,
          blockReason: blockReasonForAvailability(this.context),
        });
        this.emit();
      }
      return;
    }

    if (this.snapshot.inFlightRevision !== null || this.physicalSave?.contextKey === this.context.contextKey) {
      if (!this.deferredRemote || remote.version > this.deferredRemote.version) {
        this.deferredRemote = remote;
      }
      return;
    }
    if (this.snapshot.hasUnsyncedChanges) {
      this.markConflict();
      return;
    }
    this.applyRemote(remote);
  }

  handleRemoteError(error: unknown) {
    if (!this.context || this.context.authorityStatus !== "authorized") return;
    const failure = (this.dependencies.classifyError || classifySharedRosterAutosyncError)(error);
    this.errorSource = "listener";
    this.snapshot = this.withDerivedFields({
      ...this.snapshot,
      status: failure.kind === "authority"
        ? "blocked"
        : failure.kind === "network" && !this.context.online
          ? "offline"
          : "failed",
      errorKind: failure.kind,
      errorCode: failure.code,
      errorMessage: this.snapshot.hasUnsyncedChanges
        ? failure.message
        : "Stripes could not confirm the current online roster state.",
      blockReason: failure.kind === "authority"
        ? blockReasonForAvailability(this.context) || "unavailable"
        : null,
    });
    this.emit();
  }

  private authoritativeRosterId() {
    const source = this.latestRoster?.cloudSource?.provider === "firebase"
      ? this.latestRoster.cloudSource
      : undefined;
    return source?.firebaseRosterId || "";
  }

  private operationIsCurrent(contextKey: string, operationId: number) {
    return this.context?.contextKey === contextKey && this.operationId === operationId;
  }

  private invalidateInFlight() {
    if (this.snapshot.inFlightRevision === null) return;
    this.operationId += 1;
    this.snapshot = {
      ...this.snapshot,
      inFlightRevision: null,
    };
  }

  private recordLocalRevision() {
    const latestRevision = this.snapshot.latestRevision + 1;
    this.snapshot = {
      ...this.snapshot,
      latestRevision,
      hasUnsyncedChanges: true,
    };
    if (this.snapshot.status === "conflict") return;
    if (this.snapshot.inFlightRevision !== null) {
      this.snapshot = { ...this.snapshot, status: "saving" };
      return;
    }
    if (this.snapshot.errorKind === "authority" && this.errorSource === "save") {
      this.snapshot = { ...this.snapshot, status: "blocked" };
      return;
    }
    this.errorSource = null;
    this.snapshot = {
      ...this.snapshot,
      status: this.availableStatus(true, this.context!),
      errorKind: null,
      errorCode: null,
      errorMessage: null,
      blockReason: blockReasonForAvailability(this.context!),
    };
  }

  private applyAvailability(previous: SharedRosterAutosyncContext) {
    const context = this.context!;
    const dirty = this.snapshot.latestRevision > this.snapshot.confirmedRevision;
    const blockReason = blockReasonForAvailability(context);
    if (blockReason) {
      this.snapshot = this.withDerivedFields({
        ...this.snapshot,
        status: "blocked",
        blockReason,
      });
      return;
    }
    if (this.snapshot.inFlightRevision !== null) {
      this.snapshot = this.withDerivedFields({
        ...this.snapshot,
        status: "saving",
        blockReason: null,
      });
      return;
    }
    if (!context.online) {
      this.snapshot = this.withDerivedFields({
        ...this.snapshot,
        status: "offline",
        blockReason: null,
      });
      return;
    }
    if (this.snapshot.status === "conflict" && dirty) {
      this.snapshot = this.withDerivedFields({ ...this.snapshot, blockReason: null });
      return;
    }

    const authorityRestored = (
      previous.authorityStatus !== "authorized"
      || !previous.canEdit
    ) && context.authorityStatus === "authorized" && context.canEdit;
    const reconnected = !previous.online && context.online;
    const mayAutomaticallyResume = authorityRestored
      || (reconnected && this.snapshot.errorKind === "network")
      || this.snapshot.status === "scheduled";

    if (dirty && this.snapshot.status === "failed" && !mayAutomaticallyResume) {
      this.snapshot = this.withDerivedFields({ ...this.snapshot, blockReason: null });
      return;
    }
    if (dirty && this.snapshot.errorKind === "authority" && !authorityRestored) {
      this.snapshot = this.withDerivedFields({
        ...this.snapshot,
        status: "blocked",
        blockReason: "unavailable",
      });
      return;
    }

    if (mayAutomaticallyResume) this.errorSource = null;
    this.snapshot = this.withDerivedFields({
      ...this.snapshot,
      status: dirty ? "scheduled" : "synced",
      errorKind: dirty && !mayAutomaticallyResume ? this.snapshot.errorKind : null,
      errorCode: dirty && !mayAutomaticallyResume ? this.snapshot.errorCode : null,
      errorMessage: dirty && !mayAutomaticallyResume ? this.snapshot.errorMessage : null,
      blockReason: null,
    });
  }

  private availableStatus(
    dirty: boolean,
    context: SharedRosterAutosyncContext,
    inFlightRevision: number | null = this.snapshot.inFlightRevision,
  ): SharedRosterAutosyncStatus {
    if (blockReasonForAvailability(context)) return "blocked";
    if (inFlightRevision !== null) return "saving";
    if (!context.online) return "offline";
    return dirty ? "scheduled" : "synced";
  }

  private markConflict() {
    this.errorSource = "save";
    this.snapshot = this.withDerivedFields({
      ...this.snapshot,
      status: "conflict",
      inFlightRevision: null,
      errorKind: "conflict",
      errorCode: "shared-roster-version-conflict",
      errorMessage: "The online roster changed. Your edits are still saved on this device.",
      blockReason: null,
    });
    this.emit();
  }

  private applyRemote(remote: FirebaseSharedRosterSnapshot) {
    const context = this.context!;
    this.remoteVersion = remote.version;
    this.observedRevisionKey = sharedRosterAutosyncRevisionKey(remote.roster);
    this.latestRoster = remote.roster;
    this.errorSource = null;
    this.snapshot = this.withDerivedFields({
      ...this.snapshot,
      status: blockReasonForAvailability(context)
        ? "blocked"
        : context.online
          ? "synced"
          : "offline",
      confirmedRevision: this.snapshot.latestRevision,
      inFlightRevision: null,
      lastConfirmedAt: remote.updatedAt || new Date().toISOString(),
      errorKind: null,
      errorCode: null,
      errorMessage: null,
      blockReason: blockReasonForAvailability(context),
    });
    this.dependencies.onRemoteApplied(remote, context.localRosterId);
    this.emit();
  }

  private withDerivedFields(snapshot: SharedRosterAutosyncSnapshot) {
    const hasUnsyncedChanges = snapshot.latestRevision > snapshot.confirmedRevision;
    const context = this.context;
    return {
      ...snapshot,
      hasUnsyncedChanges,
      retryable: Boolean(
        context
        && hasUnsyncedChanges
        && snapshot.inFlightRevision === null
        && snapshot.status !== "conflict"
        && context.authorityStatus === "authorized"
        && context.canEdit
        && context.online,
      ),
    };
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
