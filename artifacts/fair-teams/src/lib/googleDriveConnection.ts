export type GoogleDriveConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "expired"
  | "error";

export type GoogleDriveScopeStatus = "unknown" | "granted" | "missing";

export interface GoogleDriveConnectedAccount {
  displayName?: string;
  emailAddress?: string;
}

export interface GoogleDriveConnectionSnapshot {
  status: GoogleDriveConnectionStatus;
  account: GoogleDriveConnectedAccount | null;
  requestedScopes: string[];
  grantedScopes: string[];
  requiredScopeStatus: GoogleDriveScopeStatus;
  expiresAt: number | null;
  error: string | null;
}

export interface GoogleDriveTokenResult {
  accessToken: string;
  expiresIn?: number;
  scope?: string;
}

export interface GoogleDriveConnectionDependencies {
  requestedScope: string;
  requestAccessToken: (prompt: "consent" | "") => Promise<GoogleDriveTokenResult>;
  revokeAccessToken: (accessToken: string) => Promise<void>;
  loadAccount: (accessToken: string) => Promise<GoogleDriveConnectedAccount>;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}

export interface GoogleDriveDisconnectResult {
  revoked: boolean;
  revokeError: string | null;
}

type Listener = (snapshot: GoogleDriveConnectionSnapshot) => void;

const DEFAULT_EXPIRY_SKEW_MS = 5_000;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function parseGoogleDriveScopes(scope?: string) {
  return String(scope || "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isGoogleDriveAuthorizationExpiredError(error: unknown) {
  if (!error) return false;
  if (typeof error === "object") {
    const record = error as { status?: unknown; code?: unknown };
    if (record.status === 401 || record.code === 401 || record.code === "401") return true;
  }
  return /(?:drive|google).*(?:expired|reconnect)|(?:expired|reconnect).*(?:drive|google)/i.test(
    errorMessage(error, ""),
  );
}

export function canDisconnectGoogleDrive(snapshot: GoogleDriveConnectionSnapshot) {
  if (snapshot.status === "connected" || snapshot.status === "expired") return true;
  return snapshot.status === "error" && Boolean(snapshot.account);
}

export class GoogleDriveConnectionController {
  private readonly dependencies: Required<
    Pick<GoogleDriveConnectionDependencies, "requestedScope" | "requestAccessToken" | "revokeAccessToken" | "loadAccount">
  > & Pick<GoogleDriveConnectionDependencies, "now" | "schedule" | "cancelSchedule">;
  private readonly listeners = new Set<Listener>();
  private snapshot: GoogleDriveConnectionSnapshot;
  private accessToken = "";
  private expiryHandle: unknown = null;
  private operationId = 0;

  constructor(dependencies: GoogleDriveConnectionDependencies) {
    this.dependencies = dependencies;
    this.snapshot = {
      status: "disconnected",
      account: null,
      requestedScopes: [dependencies.requestedScope],
      grantedScopes: [],
      requiredScopeStatus: "unknown",
      expiresAt: null,
      error: null,
    };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getAccessToken() {
    return this.snapshot.status === "connected" ? this.accessToken : "";
  }

  async connect() {
    if (this.snapshot.status === "connecting") return this.snapshot;

    const requiredScopeMissing = this.snapshot.requiredScopeStatus === "missing";
    const reconnecting = !requiredScopeMissing && (
      this.snapshot.status === "expired" || Boolean(this.snapshot.account)
    );
    const operationId = ++this.operationId;
    this.clearExpirySchedule();
    this.update({
      ...this.snapshot,
      status: "connecting",
      error: null,
    });

    try {
      const result = await this.dependencies.requestAccessToken(reconnecting ? "" : "consent");
      if (operationId !== this.operationId) {
        await this.safeRevoke(result.accessToken);
        return this.snapshot;
      }

      const grantedScopes = parseGoogleDriveScopes(result.scope);
      const requiredScopeStatus: GoogleDriveScopeStatus = result.scope
        ? grantedScopes.includes(this.dependencies.requestedScope)
          ? "granted"
          : "missing"
        : "unknown";

      if (requiredScopeStatus === "missing") {
        await this.safeRevoke(result.accessToken);
        this.accessToken = "";
        this.update({
          ...this.snapshot,
          status: "error",
          grantedScopes,
          requiredScopeStatus,
          expiresAt: null,
          error: "Google Drive did not grant the required Drive file permission.",
        });
        return this.snapshot;
      }

      let account: GoogleDriveConnectedAccount | null = null;
      try {
        account = await this.dependencies.loadAccount(result.accessToken);
      } catch (error) {
        if (isGoogleDriveAuthorizationExpiredError(error)) {
          await this.safeRevoke(result.accessToken);
          this.accessToken = "";
          this.update({
            ...this.snapshot,
            status: "expired",
            grantedScopes,
            requiredScopeStatus,
            expiresAt: null,
            error: errorMessage(error, "Google Drive access expired. Reconnect to continue."),
          });
          return this.snapshot;
        }
      }

      if (operationId !== this.operationId) {
        await this.safeRevoke(result.accessToken);
        return this.snapshot;
      }

      this.accessToken = result.accessToken;
      const expiresIn = Number(result.expiresIn);
      const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
        ? this.now() + (expiresIn * 1_000)
        : null;

      this.update({
        status: "connected",
        account,
        requestedScopes: [this.dependencies.requestedScope],
        grantedScopes,
        requiredScopeStatus,
        expiresAt,
        error: null,
      });
      this.scheduleExpiry(expiresAt);
      return this.snapshot;
    } catch (error) {
      if (operationId !== this.operationId) return this.snapshot;
      this.accessToken = "";
      this.update({
        ...this.snapshot,
        status: "error",
        expiresAt: null,
        error: errorMessage(error, "Could not connect Google Drive."),
      });
      return this.snapshot;
    }
  }

  markExpired(message = "Google Drive access expired. Reconnect to continue.") {
    ++this.operationId;
    this.accessToken = "";
    this.clearExpirySchedule();
    this.update({
      ...this.snapshot,
      status: "expired",
      expiresAt: null,
      error: message,
    });
  }

  async disconnect(): Promise<GoogleDriveDisconnectResult> {
    ++this.operationId;
    const tokenToRevoke = this.accessToken;
    this.accessToken = "";
    this.clearExpirySchedule();
    this.update({
      status: "disconnected",
      account: null,
      requestedScopes: [this.dependencies.requestedScope],
      grantedScopes: [],
      requiredScopeStatus: "unknown",
      expiresAt: null,
      error: null,
    });

    if (!tokenToRevoke) return { revoked: false, revokeError: null };
    try {
      await this.dependencies.revokeAccessToken(tokenToRevoke);
      return { revoked: true, revokeError: null };
    } catch (error) {
      return {
        revoked: false,
        revokeError: errorMessage(error, "Google could not revoke the previous Drive authorization."),
      };
    }
  }

  private now() {
    return this.dependencies.now?.() ?? Date.now();
  }

  private update(snapshot: GoogleDriveConnectionSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private scheduleExpiry(expiresAt: number | null) {
    if (!expiresAt) return;
    const schedule = this.dependencies.schedule || ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
    const delayMs = Math.max(0, expiresAt - this.now() - DEFAULT_EXPIRY_SKEW_MS);
    this.expiryHandle = schedule(() => {
      this.expiryHandle = null;
      if (this.snapshot.status === "connected") this.markExpired();
    }, delayMs);
  }

  private clearExpirySchedule() {
    if (this.expiryHandle === null) return;
    const cancel = this.dependencies.cancelSchedule || ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    cancel(this.expiryHandle);
    this.expiryHandle = null;
  }

  private async safeRevoke(accessToken: string) {
    try {
      await this.dependencies.revokeAccessToken(accessToken);
    } catch {
      // The token is never retained locally when validation or a stale request fails.
    }
  }
}
