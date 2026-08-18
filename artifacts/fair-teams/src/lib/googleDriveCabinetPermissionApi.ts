import {
  deleteGoogleDriveFilePermission,
  listGoogleDriveFilePermissions,
  shareGoogleDriveFileWithEditor,
  updateGoogleDriveFilePermissionRole,
} from "./googleDriveFiles.ts";
import { GoogleDriveCabinetPermissionController } from "./googleDriveCabinetPermissions.ts";

export function createGoogleDriveCabinetPermissionController() {
  return new GoogleDriveCabinetPermissionController({
    listPermissions: listGoogleDriveFilePermissions,
    createEditorPermission: shareGoogleDriveFileWithEditor,
    updatePermissionRole: updateGoogleDriveFilePermissionRole,
    deletePermission: deleteGoogleDriveFilePermission,
  });
}
