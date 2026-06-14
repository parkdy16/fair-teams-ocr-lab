import { getSpecialSkillStatBoosts } from "./playerAbilityEffects";
import { FieldSize, Player, Team, TeamColor } from "./types";

const DEFAULT_COLORS: TeamColor[] = ["red", "blue", "lime", "yellow", "orange", "black"];

export function getWeightedSkill(player: Player, fieldSize: FieldSize = "medium") {
  const weights = fieldSize === "small"
    ? { attack: 0.22, passing: 0.26, defense: 0.22, speed: 0.15, stamina: 0.15 }
    : fieldSize === "large"
      ? { attack: 0.16, passing: 0.18, defense: 0.20, speed: 0.22, stamina: 0.24 }
      : { attack: 0.20, passing: 0.20, defense: 0.20, speed: 0.20, stamina: 0.20 };

  const boosts = getSpecialSkillStatBoosts(player);
  const attack = Math.min(10, player.attack + boosts.attack);
  const defense = Math.min(10, player.defense + boosts.defense);
  const passing = Math.min(10, player.passing + boosts.passing);
  const speed = Math.min(10, player.speed + boosts.speed);
  const stamina = Math.min(10, player.stamina + boosts.stamina);

  return Number((
    attack * weights.attack +
    passing * weights.passing +
    defense * weights.defense +
    speed * weights.speed +
    stamina * weights.stamina
  ).toFixed(1));
}

const NOT_HERE_YET_BALANCE_WEIGHT = 0.35;

function isNotHereYet(player: Player) {
  return player.todayStatus === "not_here_yet";
}

function getBalanceSkill(player: Player, fieldSize: FieldSize = "medium") {
  const skill = getWeightedSkill(player, fieldSize);
  return Number((skill * (isNotHereYet(player) ? NOT_HERE_YET_BALANCE_WEIGHT : 1)).toFixed(1));
}

export function generateTeams(
  players: Player[],
  numTeams: number,
  shuffleEquals: boolean = false,
  fieldSize: FieldSize = "medium"
): Team[] {
  if (numTeams < 2 || players.length === 0) return [];

  const teams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
    id: String(i + 1),
    name: `Team ${i + 1}`,
    players: [],
    totalSkill: 0,
    averageSkill: 0,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  // Checked-in players carry normal weight. Not-here-yet players still get teams,
  // but count lightly so the kickoff balance stays fair.
  const assignToLowest = (player: Player) => {
    const t = teams.reduce((a, b) => (a.totalSkill <= b.totalSkill ? a : b));
    t.players.push(player);
    t.totalSkill = Number((t.totalSkill + getBalanceSkill(player, fieldSize)).toFixed(1));
  };

  const assignLateToLowestLateCount = (player: Player) => {
    const t = teams.reduce((best, candidate) => {
      const bestLate = best.players.filter(isNotHereYet).length;
      const candidateLate = candidate.players.filter(isNotHereYet).length;
      if (candidateLate !== bestLate) return candidateLate < bestLate ? candidate : best;
      return candidate.totalSkill < best.totalSkill ? candidate : best;
    });
    t.players.push(player);
    t.totalSkill = Number((t.totalSkill + getBalanceSkill(player, fieldSize)).toFixed(1));
  };

  // Pre-compute stable noise per player so sorting is consistent within one call
  const noise = new Map(
    players.map(p => [
      p.id,
      shuffleEquals ? (Math.random() - 0.5) * 0.99 : 0,
    ])
  );
  const sk = (p: Player) => getWeightedSkill(p, fieldSize) + (noise.get(p.id) ?? 0);
  const bySkillDesc = (a: Player, b: Player) => sk(b) - sk(a);

  // Split into checked-in buckets first. Late players are assigned afterward
  // so they are spread across teams without ruining current-field balance.
  const herePlayers = players.filter(p => !isNotHereYet(p));
  const latePlayers = players.filter(isNotHereYet).sort(bySkillDesc);
  const females = herePlayers.filter(p => p.gender === "female").sort(bySkillDesc);
  const runners = herePlayers.filter(p => p.gender !== "female" && p.speed >= 7).sort(bySkillDesc);
  const rest    = herePlayers.filter(p => p.gender !== "female" && p.speed < 7).sort(bySkillDesc);

  // Pass 1: Give each team at most one female (greedy — avoids stacking top females on one team)
  const femalesForPass1 = females.splice(0, Math.min(numTeams, females.length));
  femalesForPass1.forEach(assignToLowest);

  // Pass 2: Give each team at most one runner (greedy)
  const runnersForPass1 = runners.splice(0, Math.min(numTeams, runners.length));
  runnersForPass1.forEach(assignToLowest);

  // Pass 3: All remaining checked-in players distributed greedily by skill descending
  [...females, ...runners, ...rest].sort(bySkillDesc).forEach(assignToLowest);

  // Pass 4: Assign not-here-yet players evenly across teams.
  latePlayers.forEach(assignLateToLowestLateCount);

  // Compute averages
  teams.forEach(t => {
    t.averageSkill =
      t.players.length > 0
        ? Number((t.totalSkill / t.players.length).toFixed(1))
        : 0;
  });

  return teams;
}

export function recomputeStats(teams: Team[], fieldSize: FieldSize = "medium"): Team[] {
  return teams.map(t => {
    const totalSkill = Number(t.players.reduce((sum, p) => sum + getBalanceSkill(p, fieldSize), 0).toFixed(1));
    return {
      ...t,
      totalSkill,
      averageSkill:
        t.players.length > 0
          ? Number((totalSkill / t.players.length).toFixed(1))
          : 0,
    };
  });
}
