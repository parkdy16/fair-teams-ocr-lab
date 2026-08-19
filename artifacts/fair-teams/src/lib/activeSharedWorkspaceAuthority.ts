import { useEffect, useMemo, useRef, useState } from "react";
import {
  listenToFirebaseSharedWorkspaceAuthority,
  listenToSharedRosterUser,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import {
  activeSharedWorkspaceContextKey,
  activeSharedWorkspaceResolutionIsCurrent,
  resolveActiveSharedWorkspaceAuthority,
  unavailableActiveSharedWorkspaceAuthority,
  unresolvedActiveSharedWorkspaceAuthority,
  type ActiveSharedWorkspaceAuthority,
  type ActiveSharedWorkspaceReference,
} from "@/lib/activeSharedWorkspaceAuthorityState";

export * from "@/lib/activeSharedWorkspaceAuthorityState";

export function useActiveSharedWorkspaceAuthority(
  reference: ActiveSharedWorkspaceReference,
): ActiveSharedWorkspaceAuthority {
  const stableReference = useMemo<ActiveSharedWorkspaceReference>(() => ({
    localRosterId: reference.localRosterId,
    firebaseRosterId: reference.firebaseRosterId,
    cachedFirebaseGroupId: reference.cachedFirebaseGroupId,
  }), [reference.localRosterId, reference.firebaseRosterId, reference.cachedFirebaseGroupId]);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [resolved, setResolved] = useState<ActiveSharedWorkspaceAuthority>(() => (
    unresolvedActiveSharedWorkspaceAuthority(stableReference, false, null)
  ));
  const resolutionGenerationRef = useRef(0);
  const currentContextKey = activeSharedWorkspaceContextKey(stableReference, user?.uid);
  const currentContextKeyRef = useRef(currentContextKey);
  currentContextKeyRef.current = currentContextKey;

  useEffect(() => listenToSharedRosterUser((nextUser) => {
    resolutionGenerationRef.current += 1;
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const retry = () => setRetryGeneration((current) => current + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  useEffect(() => {
    const generation = resolutionGenerationRef.current + 1;
    resolutionGenerationRef.current = generation;
    const unresolved = unresolvedActiveSharedWorkspaceAuthority(stableReference, authReady, user);
    setResolved(unresolved);
    if (!stableReference.firebaseRosterId || !authReady || !user) return;

    const expectedContextKey = activeSharedWorkspaceContextKey(stableReference, user.uid);
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = listenToFirebaseSharedWorkspaceAuthority(
        user.uid,
        (snapshot) => {
          if (!activeSharedWorkspaceResolutionIsCurrent(
            generation,
            resolutionGenerationRef.current,
            expectedContextKey,
            currentContextKeyRef.current,
          )) return;
          setResolved(resolveActiveSharedWorkspaceAuthority(stableReference, user, snapshot));
        },
        (error) => {
          if (!activeSharedWorkspaceResolutionIsCurrent(
            generation,
            resolutionGenerationRef.current,
            expectedContextKey,
            currentContextKeyRef.current,
          )) return;
          setResolved(unavailableActiveSharedWorkspaceAuthority(stableReference, user, error));
        },
      );
    } catch (error) {
      if (activeSharedWorkspaceResolutionIsCurrent(
        generation,
        resolutionGenerationRef.current,
        expectedContextKey,
        currentContextKeyRef.current,
      )) {
        setResolved(unavailableActiveSharedWorkspaceAuthority(stableReference, user, error));
      }
    }

    return () => {
      if (resolutionGenerationRef.current === generation) {
        resolutionGenerationRef.current += 1;
      }
      unsubscribe();
    };
  }, [authReady, retryGeneration, stableReference, user?.uid]);

  if (resolved.contextKey !== currentContextKey) {
    return unresolvedActiveSharedWorkspaceAuthority(stableReference, authReady, user);
  }
  return resolved.user?.uid === user?.uid ? { ...resolved, user } : resolved;
}
