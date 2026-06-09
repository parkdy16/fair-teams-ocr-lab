export type Gender = "male" | "female" | "other";

export type FunBadge = "loudmouth" | "warrior" | "samba" | "maradoner" | "reluctant-gk" | "first-10" | "always-late" | "unbothered" | "wildcard" | "third-half" | "club-ambassador" | "cfo" | "club-chef";

export interface Player {
  id: string;
  name: string;
  aka?: string;
  gender: Gender;
  skill: number;    // computed overall 0-10
  attack: number;   // 1-10
  defense: number;  // 1-10
  speed: number;    // 1-10
  passing: number;  // 1-10
  stamina: number;  // 1-10
  physical: number; // 1-10
  teamPlay: number; // 1-3 (low / average / high)
  profilePhoto?: string;
  isGoalkeeper?: boolean;
  isPlaymaker?: boolean;
  isFinisher?: boolean;
  isDribbler?: boolean;
  isSentinel?: boolean;
  isEngine?: boolean;
  isVersatile?: boolean;
  isSpaceFinder?: boolean;
  isOrganizer?: boolean;
  isNew?: boolean;
  funBadge?: FunBadge;
}

export type AttendanceMap = Record<string, boolean>;

export type TeamColor = "red" | "blue" | "lime" | "yellow" | "orange" | "black";

export type FieldSize = "small" | "medium" | "large";

export interface Team {
  id: string;
  name: string;
  players: Player[];
  totalSkill: number;
  averageSkill: number;
  color: TeamColor;
}
