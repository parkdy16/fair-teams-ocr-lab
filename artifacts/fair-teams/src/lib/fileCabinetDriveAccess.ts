import type { SharedRosterUser } from "./sharedRosterAuthState.ts";

export function fileCabinetGoogleLoginHint(user: SharedRosterUser | null) {
  if (!user?.providerIds?.includes("google.com")) return undefined;
  const email = user.email.trim();
  return email || undefined;
}

export async function fileCabinetDriveAccessToken(options: {
  driveStatus: "disconnected" | "connecting" | "connected" | "expired" | "error";
  accessToken: string;
  rememberedDriveAccount?: string;
  googleLoginHint?: string;
  requestDriveAccess: (loginHint?: string) => Promise<string>;
}) {
  if (options.driveStatus === "connected" && options.accessToken) {
    return options.accessToken;
  }
  return options.requestDriveAccess(
    options.rememberedDriveAccount ? undefined : options.googleLoginHint,
  );
}
