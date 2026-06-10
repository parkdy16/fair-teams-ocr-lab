import { FieldSize, Player, Team, TeamColor } from "./types";

const DEFAULT_COLORS: TeamColor[] = ["red", "blue", "lime", "yellow", "orange", "black"];

export function getWeightedSkill(player: Player, fieldSize: FieldSize = "medium") {
  const weights = fieldSize === "small"
    ? { attack: 0.25, passing: 0.30, defense: 0.25, speed: 0.10, stamina: 0.10 }
    : fieldSize === "large"
      ? { attack: 0.15, passing: 0.20, defense: 0.20, speed: 0.20, stamina: 0.25 }
      : { attack: 0.20, passing: 0.20, defense: 0.20, speed: 0.20, stamina: 0.20 };

  const attack = player.attack + (player.isSpaceFinder ? 0.3 : 0);
  const defense = player.defense + (player.isSpaceFinder ? 0.3 : 0);

  return Number((
    attack * weights.attack +
    player.passing * weights.passing +
    defense * weights.defense +
    player.speed * weights.speed +
    player.stamina * weights.stamina
  ).toFixed(1));
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

  // Always assign to the team with the lowest current total skill
  const assignToLowest = (player: Player) => {
    const t = teams.reduce((a, b) => (a.totalSkill <= b.totalSkill ? a : b));
    t.players.push(player);
    t.totalSkill = Number((t.totalSkill + getWeightedSkill(player, fieldSize)).toFixed(1));
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

  // Split into buckets
  const females = players.filter(p => p.gender === "female").sort(bySkillDesc);
  const runners = players.filter(p => p.gender !== "female" && p.speed >= 7).sort(bySkillDesc);
  const rest    = players.filter(p => p.gender !== "female" && p.speed < 7).sort(bySkillDesc);

  // Pass 1: Give each team at most one female (greedy — avoids stacking top females on one team)
  const femalesForPass1 = females.splice(0, Math.min(numTeams, females.length));
  femalesForPass1.forEach(assignToLowest);

  // Pass 2: Give each team at most one runner (greedy)
  const runnersForPass1 = runners.splice(0, Math.min(numTeams, runners.length));
  runnersForPass1.forEach(assignToLowest);

  // Pass 3: All remaining players distributed greedily by skill descending
  [...females, ...runners, ...rest].sort(bySkillDesc).forEach(assignToLowest);

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
    const totalSkill = Number(t.players.reduce((sum, p) => sum + getWeightedSkill(p, fieldSize), 0).toFixed(1));
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
