export type SharedRosterUser = {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  providerIds?: string[];
};

type FirebaseAuthUserSnapshot = {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  providerData?: Array<{ providerId: string }>;
};

export function toSharedRosterUser(user: FirebaseAuthUserSnapshot | null): SharedRosterUser | null {
  if (!user || !user.email) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || undefined,
    emailVerified: user.emailVerified,
    providerIds: Array.from(new Set(
      (user.providerData || []).map((profile) => profile.providerId).filter(Boolean),
    )),
  };
}

export function sharedRosterUserWithTokenVerification(
  user: SharedRosterUser,
  tokenClaims: Record<string, unknown>,
): SharedRosterUser {
  return {
    ...user,
    emailVerified: user.emailVerified && tokenClaims.email_verified === true,
  };
}
