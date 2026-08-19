import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFairTeamsAuth, getFairTeamsFirestore } from "./firebaseClient.ts";
import {
  checkFileCabinetResourceRemoval,
  parseFileCabinetResource,
  validateFileCabinetResourceDraft,
  validateFileCabinetResourceMetadataUpdate,
  type FileCabinetResource,
  type FileCabinetResourceDraft,
  type FileCabinetResourceMetadataUpdate,
  type FileCabinetResourceRemovalBlocked,
} from "./fileCabinetResource.ts";
import type { SharedWorkspaceCabinetScope } from "./sharedWorkspaceCabinetService.ts";

function cleanScope(scope: SharedWorkspaceCabinetScope) {
  const id = String(scope.id || "").trim();
  if (
    (scope.kind !== "group" && scope.kind !== "roster")
    || !id
    || id.includes("/")
    || id.length > 200
    || /[\u0000-\u001f\u007f]/.test(id)
  ) {
    throw new Error("Choose a valid shared workspace.");
  }
  return { kind: scope.kind, id } as const;
}

function cleanResourceId(value: string) {
  const resourceId = String(value || "").trim();
  if (
    !resourceId
    || resourceId.includes("/")
    || resourceId.length > 200
    || /[\u0000-\u001f\u007f]/.test(resourceId)
  ) {
    throw new Error("Choose a valid File Cabinet resource.");
  }
  return resourceId;
}

function requireCurrentFirebaseUid() {
  const uid = getFairTeamsAuth().currentUser?.uid?.trim() || "";
  if (!uid) throw new Error("Sign in to use the File Cabinet.");
  return uid;
}

function fileCabinetResourcesCollection(scope: SharedWorkspaceCabinetScope) {
  const clean = cleanScope(scope);
  const collectionName = clean.kind === "group" ? "sharedGroups" : "sharedRosters";
  return collection(
    getFairTeamsFirestore(),
    collectionName,
    clean.id,
    "cabinetResources",
  );
}

function fileCabinetResourceDoc(
  scope: SharedWorkspaceCabinetScope,
  resourceId: string,
) {
  return doc(fileCabinetResourcesCollection(scope), cleanResourceId(resourceId));
}

function parseResourceSnapshots(
  snapshots: readonly QueryDocumentSnapshot<DocumentData, DocumentData>[],
) {
  const resources = snapshots.map((snapshot) => {
    const resource = parseFileCabinetResource(
      snapshot.id,
      snapshot.data({ serverTimestamps: "estimate" }),
    );
    if (!resource) {
      throw new Error("A saved File Cabinet resource is invalid or unsupported.");
    }
    return resource;
  });

  return resources.sort(
    (left, right) => right.updatedAt - left.updatedAt
      || left.displayName.localeCompare(right.displayName)
      || left.resourceId.localeCompare(right.resourceId),
  );
}

export async function createFileCabinetResource(
  scope: SharedWorkspaceCabinetScope,
  value: FileCabinetResourceDraft,
): Promise<string> {
  const uid = requireCurrentFirebaseUid();
  const draft = validateFileCabinetResourceDraft(value);
  const reference = doc(fileCabinetResourcesCollection(scope));
  await setDoc(reference, {
    ...draft,
    resourceId: reference.id,
    createdByUid: uid,
    createdAt: serverTimestamp(),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function listFileCabinetResources(
  scope: SharedWorkspaceCabinetScope,
): Promise<FileCabinetResource[]> {
  requireCurrentFirebaseUid();
  const snapshot = await getDocs(fileCabinetResourcesCollection(scope));
  return parseResourceSnapshots(snapshot.docs);
}

export function listenToFileCabinetResources(
  scope: SharedWorkspaceCabinetScope,
  onResources: (resources: FileCabinetResource[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireCurrentFirebaseUid();
  return onSnapshot(
    fileCabinetResourcesCollection(scope),
    (snapshot) => {
      try {
        onResources(parseResourceSnapshots(snapshot.docs));
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error
            : new Error("Could not read File Cabinet resources."),
        );
      }
    },
    (error) => onError?.(error),
  );
}

export async function updateFileCabinetResourceMetadata(
  scope: SharedWorkspaceCabinetScope,
  resourceId: string,
  value: FileCabinetResourceMetadataUpdate,
): Promise<void> {
  const uid = requireCurrentFirebaseUid();
  const update = validateFileCabinetResourceMetadataUpdate(value);
  await updateDoc(fileCabinetResourceDoc(scope, resourceId), {
    displayName: update.displayName,
    contexts: update.contexts,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function removeFileCabinetResource(
  scope: SharedWorkspaceCabinetScope,
  resourceId: string,
): Promise<
  | { status: "removed" }
  | { status: "not_found" }
  | FileCabinetResourceRemovalBlocked
> {
  requireCurrentFirebaseUid();
  const reference = fileCabinetResourceDoc(scope, resourceId);
  return runTransaction(getFairTeamsFirestore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return { status: "not_found" };

    const resource = parseFileCabinetResource(snapshot.id, snapshot.data());
    if (!resource) {
      throw new Error("The saved File Cabinet resource is invalid or unsupported.");
    }

    const removal = checkFileCabinetResourceRemoval(resource);
    if (removal.status === "blocked_by_relationships") return removal;

    transaction.delete(reference);
    return { status: "removed" };
  });
}
