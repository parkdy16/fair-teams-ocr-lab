import type { RoomPlayer, RoomRoster, RosterState } from "@/lib/localRoster";
import { normalizePlayer, normalizeRoster } from "@/lib/localRoster";
import { FAIR_TEAMS_DRIVE_BACKUP_VERSION } from "@/lib/googleDriveConfig";

export type GoogleDriveBackupKind = "single-roster" | "all-rosters";

export interface FairTeamsDriveBackup {
  app: "Fair Teams";
  type: "google-drive-text-backup";
  version: number;
  backupKind: GoogleDriveBackupKind;
  exportedAt: string;
  imagesIncluded: false;
  activeRosterId?: string;
  rosters: RoomRoster[];
}

const IMAGE_FIELD_NAMES = new Set([
  "profilePhoto",
  "photo",
  "photoUrl",
  "photoData",
  "avatar",
  "avatarUrl",
  "image",
  "imageUrl",
  "profileImage",
  "profileImageUrl",
  "logo",
  "logoImage",
  "logoData",
  "groupLogo",
  "teamLogo",
  "crest",
  "badgeImage",
  "base64",
]);

function removeKnownImageFields<T extends Record<string, unknown>>(record: T) {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (IMAGE_FIELD_NAMES.has(key)) continue;
    copy[key] = value;
  }
  return copy;
}

export function stripPlayerImages(player: RoomPlayer): RoomPlayer {
  return normalizePlayer(removeKnownImageFields(player as unknown as Record<string, unknown>) as Partial<RoomPlayer>);
}

export function stripRosterImages(roster: RoomRoster): RoomRoster {
  const normalized = normalizeRoster(roster);
  return normalizeRoster({
    ...removeKnownImageFields(normalized as unknown as Record<string, unknown>),
    logo: undefined,
    players: normalized.players.map(stripPlayerImages),
  });
}

export function createDriveBackup(
  rosters: RoomRoster[],
  activeRosterId: string | undefined,
  backupKind: GoogleDriveBackupKind,
): FairTeamsDriveBackup {
  const safeRosters = rosters.map(stripRosterImages);
  const safeActiveRosterId = activeRosterId && safeRosters.some((roster) => roster.id === activeRosterId)
    ? activeRosterId
    : safeRosters[0]?.id;

  return {
    app: "Fair Teams",
    type: "google-drive-text-backup",
    version: FAIR_TEAMS_DRIVE_BACKUP_VERSION,
    backupKind,
    exportedAt: new Date().toISOString(),
    imagesIncluded: false,
    activeRosterId: safeActiveRosterId,
    rosters: safeRosters,
  };
}

export function currentRosterToDriveBackupJson(roster: RoomRoster) {
  return JSON.stringify(createDriveBackup([roster], roster.id, "single-roster"), null, 2);
}

export function allRostersToDriveBackupJson(state: RosterState) {
  return JSON.stringify(createDriveBackup(state.rosters, state.activeRosterId, "all-rosters"), null, 2);
}

export function parseDriveBackupJson(text: string): FairTeamsDriveBackup {
  const parsed = JSON.parse(text);
  if (parsed?.app !== "Fair Teams" || parsed?.type !== "google-drive-text-backup") {
    throw new Error("This is not a Fair Teams Google Drive backup.");
  }
  if (!Array.isArray(parsed.rosters)) {
    throw new Error("Drive backup does not contain rosters.");
  }

  const rosters = parsed.rosters.map((roster: Partial<RoomRoster>, index: number) =>
    stripRosterImages(normalizeRoster(roster, index)),
  );
  const activeRosterId =
    typeof parsed.activeRosterId === "string" && rosters.some((roster) => roster.id === parsed.activeRosterId)
      ? parsed.activeRosterId
      : rosters[0]?.id;

  return {
    app: "Fair Teams",
    type: "google-drive-text-backup",
    version: Number(parsed.version) || FAIR_TEAMS_DRIVE_BACKUP_VERSION,
    backupKind: parsed.backupKind === "single-roster" ? "single-roster" : "all-rosters",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    imagesIncluded: false,
    activeRosterId,
    rosters,
  };
}
