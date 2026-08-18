import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFairTeamsAuth, getFairTeamsFirestore } from "./firebaseClient.ts";
import {
  parseSharedWorkspaceCabinetLocation,
  validateSharedWorkspaceCabinetLocationDraft,
  type SharedWorkspaceCabinetLocation,
  type SharedWorkspaceCabinetLocationDraft,
} from "./sharedWorkspaceCabinet.ts";

export type SharedWorkspaceCabinetScope = {
  kind: "group" | "roster";
  id: string;
};

function cleanScope(scope: SharedWorkspaceCabinetScope) {
  const id = String(scope.id || "").trim();
  if ((scope.kind !== "group" && scope.kind !== "roster") || !id || id.includes("/") || id.length > 200) {
    throw new Error("Choose a valid shared workspace.");
  }
  return { kind: scope.kind, id } as const;
}

function cabinetConfigRef(scope: SharedWorkspaceCabinetScope) {
  const clean = cleanScope(scope);
  const collectionName = clean.kind === "group" ? "sharedGroups" : "sharedRosters";
  return doc(getFairTeamsFirestore(), collectionName, clean.id, "cabinet", "config");
}

function requireCurrentOrganizerUid() {
  const uid = getFairTeamsAuth().currentUser?.uid || "";
  if (!uid) throw new Error("Sign in to configure the File Cabinet.");
  return uid;
}

export async function getSharedWorkspaceCabinetLocation(
  scope: SharedWorkspaceCabinetScope,
): Promise<SharedWorkspaceCabinetLocation | null> {
  const snapshot = await getDoc(cabinetConfigRef(scope));
  if (!snapshot.exists()) return null;
  const location = parseSharedWorkspaceCabinetLocation(snapshot.data());
  if (!location) throw new Error("The saved File Cabinet location is invalid.");
  return location;
}

export function listenToSharedWorkspaceCabinetLocation(
  scope: SharedWorkspaceCabinetScope,
  onLocation: (location: SharedWorkspaceCabinetLocation | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    cabinetConfigRef(scope),
    (snapshot) => {
      if (!snapshot.exists()) {
        onLocation(null);
        return;
      }
      const location = parseSharedWorkspaceCabinetLocation(snapshot.data());
      if (!location) {
        onError?.(new Error("The saved File Cabinet location is invalid."));
        return;
      }
      onLocation(location);
    },
    (error) => onError?.(error),
  );
}

export async function saveSharedWorkspaceCabinetLocation(
  scope: SharedWorkspaceCabinetScope,
  value: SharedWorkspaceCabinetLocationDraft,
) {
  const configuredByUid = requireCurrentOrganizerUid();
  const location = validateSharedWorkspaceCabinetLocationDraft(value);
  await setDoc(cabinetConfigRef(scope), {
    ...location,
    configuredByUid,
    configuredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function removeSharedWorkspaceCabinetLocation(
  scope: SharedWorkspaceCabinetScope,
) {
  requireCurrentOrganizerUid();
  await deleteDoc(cabinetConfigRef(scope));
}
