export type Gender = "male" | "female" | "other";

export type FunBadge = "cool-head" | "unbothered" | "wildcard" | "silent-mode" | "smooth-talker" | "no-filter" | "human-alarm" | "influencer" | "main-character" | "old-school" | "always-late" | "early-exit" | "first-5" | "eighty-minute-warmup" | "third-half" | "yellow-card" | "var-caller" | "kit-collector" | "shoe-collector" | "fashion-icon" | "club-legend" | "snack-captain" | "cameo" | "mastermind";

export type TodayStatus = "here" | "not_here_yet";

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
  isLongPass?: boolean;
  isTikiTaka?: boolean;
  isCrossing?: boolean;
  isAerial?: boolean;
  isPowerShot?: boolean;
  isBulldog?: boolean;
  isOrganizer?: boolean;
  isNew?: boolean;
  funBadge?: FunBadge;
  todayStatus?: TodayStatus;
}

export type AttendanceMap = Record<string, boolean>;

export type TeamColor = "red" | "blue" | "lime" | "yellow" | "orange" | "black" | "white";

export type FieldSize = "small" | "medium" | "large";

export interface Team {
  id: string;
  name: string;
  players: Player[];
  totalSkill: number;
  averageSkill: number;
  color: TeamColor;
}
