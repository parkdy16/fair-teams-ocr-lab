import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
  type User,
} from "firebase/auth";
import { getFirebaseProjectId, getFairTeamsAuth } from "@/lib/firebaseClient";

export type SharedRosterUser = {
  uid: string;
  email: string;
  displayName?: string;
};

function toSharedRosterUser(user: User | null): SharedRosterUser | null {
  if (!user || !user.email) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || undefined,
  };
}

export function listenToSharedRosterUser(callback: (user: SharedRosterUser | null) => void): Unsubscribe {
  return onAuthStateChanged(getFairTeamsAuth(), (user) => {
    callback(toSharedRosterUser(user));
  });
}

export async function createSharedRosterAccount(email: string, password: string): Promise<SharedRosterUser> {
  const result = await createUserWithEmailAndPassword(getFairTeamsAuth(), email.trim(), password);
  const user = toSharedRosterUser(result.user);
  if (!user) throw new Error("Firebase created the account but did not return an email address.");
  return user;
}

export async function signInToSharedRosters(email: string, password: string): Promise<SharedRosterUser> {
  const result = await signInWithEmailAndPassword(getFairTeamsAuth(), email.trim(), password);
  const user = toSharedRosterUser(result.user);
  if (!user) throw new Error("Firebase signed in but did not return an email address.");
  return user;
}

export async function signOutOfSharedRosters() {
  await signOut(getFairTeamsAuth());
}

export function getSharedRosterBackendLabel() {
  return `Firebase · ${getFirebaseProjectId()}`;
}
