import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RoomRoster } from "@/lib/localRoster";
import {
  listenToFirebaseSharedRoster,
  saveFirebaseSharedRoster,
  type FirebaseSharedRosterSnapshot,
  type FirebaseSharedRosterSummary,
} from "@/lib/sharedRosterService";
import type { ActiveSharedWorkspaceAuthority } from "@/lib/activeSharedWorkspaceAuthority";
import {
  SharedRosterAutosyncController,
  type SharedRosterAutosyncSnapshot,
} from "@/lib/sharedRosterAutosyncController";

type Options = {
  roster: RoomRoster | undefined;
  authority: ActiveSharedWorkspaceAuthority;
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
  debounceMs?: number;
};

export type ActiveSharedRosterAutosync = SharedRosterAutosyncSnapshot & {
  retry: () => Promise<boolean>;
};

export function useActiveSharedRosterAutosync({
  roster,
  authority,
  onSaveConfirmed,
  onRemoteApplied,
  debounceMs = 900,
}: Options): ActiveSharedRosterAutosync {
  const callbacksRef = useRef({ onSaveConfirmed, onRemoteApplied });
  callbacksRef.current = { onSaveConfirmed, onRemoteApplied };
  const controllerRef = useRef<SharedRosterAutosyncController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new SharedRosterAutosyncController({
      saveRoster: saveFirebaseSharedRoster,
      onSaveConfirmed: (summary, localRosterId, savedRevision, savedRevisionKey) => {
        callbacksRef.current.onSaveConfirmed(
          summary,
          localRosterId,
          savedRevision,
          savedRevisionKey,
        );
      },
      onRemoteApplied: (snapshot, localRosterId) => {
        callbacksRef.current.onRemoteApplied(snapshot, localRosterId);
      },
    });
  }
  const controller = controllerRef.current;
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [online, setOnline] = useState(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ));
  const source = roster?.cloudSource?.provider === "firebase" ? roster.cloudSource : undefined;
  const localRosterId = roster?.id || "";
  const authoritativeRosterId = authority.authoritativeRosterId;

  useLayoutEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useLayoutEffect(() => {
    controller.configure({
      contextKey: authority.contextKey,
      localRosterId,
      roster,
      authorityStatus: authority.status,
      canEdit: authority.capabilities.canEditSharedRoster,
      online,
    });
  }, [
    authority.capabilities.canEditSharedRoster,
    authority.contextKey,
    authority.status,
    controller,
    localRosterId,
    online,
    roster,
    source?.firebaseVersion,
    source?.lastSyncedAt,
  ]);

  useEffect(() => {
    if (snapshot.status !== "scheduled") return;
    const timer = window.setTimeout(() => {
      void controller.saveLatest();
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [controller, debounceMs, snapshot]);

  useEffect(() => {
    if (
      !authority.capabilities.canReadSharedRoster
      || !authoritativeRosterId
      || authoritativeRosterId !== source?.firebaseRosterId
    ) return;
    const expectedContextKey = authority.contextKey;

    return listenToFirebaseSharedRoster(
      authoritativeRosterId,
      (remote) => {
        if (controller.getSnapshot().contextKey !== expectedContextKey) return;
        controller.handleRemoteSnapshot(remote);
      },
      (error) => {
        if (controller.getSnapshot().contextKey !== expectedContextKey) return;
        controller.handleRemoteError(error);
      },
      { serverOnly: true },
    );
  }, [
    authority.capabilities.canReadSharedRoster,
    authority.contextKey,
    authoritativeRosterId,
    controller,
    source?.firebaseRosterId,
  ]);

  return {
    ...snapshot,
    retry: () => controller.retry(),
  };
}
