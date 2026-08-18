import type { GoogleDrivePermissionResult } from "./googleDriveFiles.ts";

export type GoogleDriveCabinetAccess = "owner" | "editor" | "commenter" | "viewer" | "unknown";
export type GoogleDriveCabinetPermissionSource = "direct" | "inherited" | "mixed" | "unknown";

export interface GoogleDriveCabinetPermission {
  id: string;
  type: string;
  role: string;
  access: GoogleDriveCabinetAccess;
  source: GoogleDriveCabinetPermissionSource;
  emailAddress?: string;
  displayName?: string;
  inheritedFrom?: string;
  canRemoveDirectly: boolean;
}

export interface GoogleDriveCabinetPermissionDependencies {
  listPermissions: (accessToken: string, folderId: string) => Promise<GoogleDrivePermissionResult[]>;
  createEditorPermission: (
    accessToken: string,
    folderId: string,
    emailAddress: string,
  ) => Promise<GoogleDrivePermissionResult>;
  updatePermissionRole: (
    accessToken: string,
    folderId: string,
    permissionId: string,
    role: "writer",
  ) => Promise<GoogleDrivePermissionResult>;
  deletePermission: (accessToken: string, folderId: string, permissionId: string) => Promise<void>;
}

export type GoogleDriveCabinetPermissionState =
  | {
      status: "ready";
      scope: "cabinet_root";
      childAccessMayDiffer: true;
      permissions: GoogleDriveCabinetPermission[];
    }
  | {
      status: "reconnect_required" | "insufficient_permission" | "error";
      scope: "cabinet_root";
      childAccessMayDiffer: true;
      error: string;
    };

export type GoogleDriveCabinetPermissionMutation =
  | {
      status: "ready";
      scope: "cabinet_root";
      childAccessMayDiffer: true;
      action: "created" | "updated" | "existing" | "direct_removed" | "already_absent";
      permission?: GoogleDriveCabinetPermission;
      inheritedAccessMayRemain?: boolean;
    }
  | {
      status: "protected" | "reconnect_required" | "insufficient_permission" | "error";
      scope: "cabinet_root";
      childAccessMayDiffer: true;
      error: string;
    };

const ROOT_SCOPE = {
  scope: "cabinet_root" as const,
  childAccessMayDiffer: true as const,
};

export function normalizeGoogleAccountEmail(value: string) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function permissionAccess(role: string): GoogleDriveCabinetAccess {
  if (role === "owner") return "owner";
  if (role === "writer") return "editor";
  if (role === "commenter") return "commenter";
  if (role === "reader") return "viewer";
  return "unknown";
}

export function normalizeGoogleDriveCabinetPermission(
  permission: GoogleDrivePermissionResult,
): GoogleDriveCabinetPermission {
  const permissionDetails = permission.permissionDetails || [];
  const directDetail = permissionDetails.find((detail) => detail.inherited === false);
  const inheritedDetail = permissionDetails.find((detail) => detail.inherited === true);
  const source: GoogleDriveCabinetPermissionSource = directDetail && inheritedDetail
    ? "mixed"
    : directDetail
      ? "direct"
      : inheritedDetail
        ? "inherited"
        : "unknown";
  const emailAddress = permission.emailAddress
    ? normalizeGoogleAccountEmail(permission.emailAddress)
    : undefined;
  const access = permissionAccess(permission.role);

  return {
    id: permission.id,
    type: permission.type,
    role: permission.role,
    access,
    source,
    ...(emailAddress ? { emailAddress } : {}),
    ...(permission.displayName ? { displayName: permission.displayName } : {}),
    ...(inheritedDetail?.inheritedFrom ? { inheritedFrom: inheritedDetail.inheritedFrom } : {}),
    canRemoveDirectly:
      permission.type === "user"
      && (source === "direct" || source === "mixed")
      && access !== "owner",
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; code?: unknown };
  const status = Number(record.status ?? record.code);
  return Number.isFinite(status) ? status : undefined;
}

function operationError(error: unknown): GoogleDriveCabinetPermissionMutation {
  const status = errorStatus(error);
  if (status === 401) {
    return { ...ROOT_SCOPE, status: "reconnect_required", error: errorMessage(error, "Reconnect Google Drive, then retry.") };
  }
  if (status === 403) {
    return { ...ROOT_SCOPE, status: "insufficient_permission", error: errorMessage(error, "Google Drive did not allow this sharing change.") };
  }
  return { ...ROOT_SCOPE, status: "error", error: errorMessage(error, "Google Drive sharing could not be changed.") };
}

function isExplicitGoogleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export class GoogleDriveCabinetPermissionController {
  private readonly mutationTails = new Map<string, Promise<void>>();
  private readonly dependencies: GoogleDriveCabinetPermissionDependencies;

  constructor(dependencies: GoogleDriveCabinetPermissionDependencies) {
    this.dependencies = dependencies;
  }

  async inspect(accessToken: string, folderId: string): Promise<GoogleDriveCabinetPermissionState> {
    try {
      const permissions = await this.dependencies.listPermissions(accessToken, folderId);
      return {
        ...ROOT_SCOPE,
        status: "ready",
        permissions: permissions.filter((permission) => !permission.deleted).map(normalizeGoogleDriveCabinetPermission),
      };
    } catch (error) {
      const status = errorStatus(error);
      if (status === 401) {
        return { ...ROOT_SCOPE, status: "reconnect_required", error: errorMessage(error, "Reconnect Google Drive, then retry.") };
      }
      if (status === 403) {
        return { ...ROOT_SCOPE, status: "insufficient_permission", error: errorMessage(error, "Google Drive did not allow Stripes to inspect sharing access.") };
      }
      return { ...ROOT_SCOPE, status: "error", error: errorMessage(error, "Google Drive sharing access could not be inspected.") };
    }
  }

  grantOrganizerEditor(
    accessToken: string,
    folderId: string,
    googleEmailAddress: string,
  ): Promise<GoogleDriveCabinetPermissionMutation> {
    const emailAddress = normalizeGoogleAccountEmail(googleEmailAddress);
    if (!isExplicitGoogleEmail(emailAddress)) {
      return Promise.resolve({
        ...ROOT_SCOPE,
        status: "error",
        error: "Enter the Google account email that should receive Cabinet access.",
      });
    }

    return this.enqueue(folderId, async () => {
      try {
        const permissions = (await this.dependencies.listPermissions(accessToken, folderId))
          .filter((permission) => !permission.deleted)
          .map(normalizeGoogleDriveCabinetPermission);
        const matches = permissions.filter(
          (permission) => permission.type === "user" && permission.emailAddress === emailAddress,
        );
        const sufficient = matches.find(
          (permission) => permission.access === "owner" || permission.access === "editor",
        );
        if (sufficient) {
          return { ...ROOT_SCOPE, status: "ready", action: "existing", permission: sufficient };
        }

        const directPermission = matches.find(
          (permission) => permission.source === "direct" || permission.source === "mixed",
        );
        if (directPermission) {
          const updated = await this.dependencies.updatePermissionRole(
            accessToken,
            folderId,
            directPermission.id,
            "writer",
          );
          return {
            ...ROOT_SCOPE,
            status: "ready",
            action: "updated",
            permission: normalizeGoogleDriveCabinetPermission(updated),
          };
        }

        if (matches.some((permission) => permission.source === "unknown")) {
          return {
            ...ROOT_SCOPE,
            status: "protected",
            error: "Google Drive did not identify whether this existing access is direct or inherited, so Stripes did not create or change a permission.",
          };
        }

        const created = await this.dependencies.createEditorPermission(accessToken, folderId, emailAddress);
        return {
          ...ROOT_SCOPE,
          status: "ready",
          action: "created",
          permission: normalizeGoogleDriveCabinetPermission(created),
        };
      } catch (error) {
        return operationError(error);
      }
    });
  }

  removeDirectPermission(
    accessToken: string,
    folderId: string,
    permissionId: string,
    expectedGoogleEmailAddress: string,
  ): Promise<GoogleDriveCabinetPermissionMutation> {
    const expectedEmailAddress = normalizeGoogleAccountEmail(expectedGoogleEmailAddress);
    return this.enqueue(folderId, async () => {
      try {
        const current = (await this.dependencies.listPermissions(accessToken, folderId))
          .filter((permission) => !permission.deleted)
          .find((permission) => permission.id === permissionId);
        if (!current) {
          return { ...ROOT_SCOPE, status: "ready", action: "already_absent" };
        }

        const permission = normalizeGoogleDriveCabinetPermission(current);
        if (
          !permission.canRemoveDirectly
          || !expectedEmailAddress
          || permission.emailAddress !== expectedEmailAddress
        ) {
          return {
            ...ROOT_SCOPE,
            status: "protected",
            error: "Stripes can remove only the selected direct Google-user permission. Owner, inherited and unrelated access stays unchanged.",
          };
        }

        await this.dependencies.deletePermission(accessToken, folderId, permission.id);
        return {
          ...ROOT_SCOPE,
          status: "ready",
          action: "direct_removed",
          permission,
          inheritedAccessMayRemain: permission.source === "mixed",
        };
      } catch (error) {
        return operationError(error);
      }
    });
  }

  private enqueue<T>(folderId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTails.get(folderId) || Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.mutationTails.set(folderId, tail);
    tail.finally(() => {
      if (this.mutationTails.get(folderId) === tail) this.mutationTails.delete(folderId);
    });
    return result;
  }
}
