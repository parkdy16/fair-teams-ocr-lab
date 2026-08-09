import { getFunctions, httpsCallable } from "firebase/functions";
import { getMessaging, isSupported, onRegistered, register } from "firebase/messaging";
import { getFairTeamsAuth, getFairTeamsFirebaseApp } from "@/lib/firebaseClient";

export type ActionBoardNotificationStepKind = "topic" | "decision" | "action";

export type SendActionBoardNotificationInput = {
  scopeId: string;
  cardId: string;
  stepKind: ActionBoardNotificationStepKind;
  stepId?: string;
  recipientEmails: string[];
  email: boolean;
  push: boolean;
  message?: string;
  origin?: string;
};

export type SendActionBoardNotificationResult = {
  ok: boolean;
  emailQueuedCount: number;
  pushTargetCount: number;
  recipientCount: number;
};

export type PhoneNotificationStatus = "unsupported" | "blocked" | "available" | "enabled";

function functionsRegion() {
  return (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1").trim();
}

function functionsClient() {
  return getFunctions(getFairTeamsFirebaseApp(), functionsRegion());
}

function cleanEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => value.includes("@"))));
}

export async function sendActionBoardNotification(input: SendActionBoardNotificationInput) {
  const user = getFairTeamsAuth().currentUser;
  if (!user) throw new Error("Sign in before notifying organizers.");
  const callable = httpsCallable<SendActionBoardNotificationInput, SendActionBoardNotificationResult>(
    functionsClient(),
    "notifyActionBoardStep",
  );
  const result = await callable({
    ...input,
    recipientEmails: cleanEmails(input.recipientEmails),
    message: input.message?.trim().slice(0, 500) || undefined,
    origin: input.origin || (typeof window !== "undefined" ? window.location.origin : undefined),
  });
  return result.data;
}

async function supportedMessaging() {
  if (typeof window === "undefined" || typeof Notification === "undefined" || !window.isSecureContext) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function getPhoneNotificationStatus(): Promise<PhoneNotificationStatus> {
  if (!(await supportedMessaging())) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "available";
  const user = getFairTeamsAuth().currentUser;
  if (!user) return "available";
  const localKey = `fairteams-push-enabled:${user.uid}`;
  return typeof window !== "undefined" && window.localStorage.getItem(localKey) === "1" ? "enabled" : "available";
}

async function registerCurrentInstallation(markEnabled: boolean): Promise<void> {
  const user = getFairTeamsAuth().currentUser;
  if (!user?.email) throw new Error("Sign in before enabling phone notifications.");

  const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();
  if (!vapidKey) throw new Error("Web Push is not configured yet. Add VITE_FIREBASE_VAPID_KEY.");

  const messaging = getMessaging(getFairTeamsFirebaseApp());
  const registerInstallation = httpsCallable<{ installationId: string }, { ok: boolean }>(
    functionsClient(),
    "registerPushInstallation",
  );

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      callback();
    };
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Phone notification registration timed out."))), 12000);

    unsubscribe = onRegistered(messaging, (installationId) => {
      if (!installationId) return;
      void registerInstallation({ installationId })
        .then(() => {
          if (markEnabled) window.localStorage.setItem(`fairteams-push-enabled:${user.uid}`, "1");
          window.clearTimeout(timeout);
          finish(resolve);
        })
        .catch((error) => {
          window.clearTimeout(timeout);
          finish(() => reject(error));
        });
    });

    register(messaging, { vapidKey }).catch((error) => {
      window.clearTimeout(timeout);
      finish(() => reject(error));
    });
  });
}

export async function enablePhoneNotifications(): Promise<void> {
  const user = getFairTeamsAuth().currentUser;
  if (!user?.email) throw new Error("Sign in before enabling phone notifications.");
  if (!(await supportedMessaging())) throw new Error("Phone notifications are not supported in this browser.");

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "Notifications are blocked in this browser." : "Notification permission was not granted.");
  }

  await registerCurrentInstallation(true);
}

export async function syncPhoneNotificationsIfEnabled(): Promise<void> {
  const user = getFairTeamsAuth().currentUser;
  if (!user || typeof window === "undefined") return;
  if (!(await supportedMessaging()) || Notification.permission !== "granted") return;

  // Once browser permission has been granted, quietly refresh the FCM registration
  // whenever Stripes starts. Firebase recommends register() on startup so FID
  // changes and refreshed registrations are uploaded to the app server.
  await registerCurrentInstallation(true);
}
