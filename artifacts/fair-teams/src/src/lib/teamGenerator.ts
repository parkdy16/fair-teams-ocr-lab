import { getSpecialSkillStatBoosts } from "./playerAbilityEffects";
import { FieldSize, PairingRule, Player, Team, TeamColor } from "./types";

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

function cloneTeams(teams: Team[]): Team[] {
  return teams.map((team) => ({ ...team, players: [...team.players] }));
}

function cleanActivePairingRules(rules: PairingRule[] | undefined, players: Player[]) {
  if (!rules?.length) return [];
  const activeIds = new Set(players.map((player) => player.id));
  const seen = new Set<string>();
  const cleaned: PairingRule[] = [];

  rules.forEach((rule) => {
    if (!rule || (rule.kind !== "together" && rule.kind !== "separate")) return;
    if (!rule.playerAId || !rule.playerBId || rule.playerAId === rule.playerBId) return;
    if (!activeIds.has(rule.playerAId) || !activeIds.has(rule.playerBId)) return;
    const ordered = [rule.playerAId, rule.playerBId].sort().join("|");
    const key = `${rule.kind}|${ordered}`;
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(rule);
  });

  return cleaned;
}

function teamIndexByPlayerId(teams: Team[]) {
  const index = new Map<string, number>();
  teams.forEach((team, teamIndex) => {
    team.players.forEach((player) => index.set(player.id, teamIndex));
  });
  return index;
}

function pairingRuleScore(teams: Team[], rules: PairingRule[], fieldSize: FieldSize) {
  const playerTeam = teamIndexByPlayerId(teams);
  let score = 0;

  rules.forEach((rule) => {
    const aTeam = playerTeam.get(rule.playerAId);
    const bTeam = playerTeam.get(rule.playerBId);
    if (aTeam === undefined || bTeam === undefined) return;

    if (rule.kind === "separate" && aTeam === bTeam) {
      score += 10000;
    }
    if (rule.kind === "together" && aTeam !== bTeam) {
      score += 4000;
    }
  });

  const sizes = teams.map((team) => team.players.length);
  const maxSize = Math.max(...sizes, 0);
  const minSize = Math.min(...sizes, 0);
  score += (maxSize - minSize) * 80;

  const totals = teams.map((team) => team.players.reduce((sum, player) => sum + getBalanceSkill(player, fieldSize), 0));
  const maxTotal = Math.max(...totals, 0);
  const minTotal = Math.min(...totals, 0);
  score += (maxTotal - minTotal) * 8;

  return score;
}

function improvePairingRules(teams: Team[], rules: PairingRule[] | undefined, fieldSize: FieldSize): Team[] {
  const activeRules = cleanActivePairingRules(rules, teams.flatMap((team) => team.players));
  if (activeRules.length === 0 || teams.length < 2) return teams;

  let current = cloneTeams(teams);
  let currentScore = pairingRuleScore(current, activeRules, fieldSize);

  for (let pass = 0; pass < 8; pass++) {
    let bestTeams = current;
    let bestScore = currentScore;

    for (let a = 0; a < current.length; a++) {
      for (let b = a + 1; b < current.length; b++) {
        for (let ai = 0; ai < current[a]!.players.length; ai++) {
          for (let bi = 0; bi < current[b]!.players.length; bi++) {
            const candidate = cloneTeams(current);
            const playerA = candidate[a]!.players[ai]!;
            const playerB = candidate[b]!.players[bi]!;
            candidate[a]!.players[ai] = playerB;
            candidate[b]!.players[bi] = playerA;

            const score = pairingRuleScore(candidate, activeRules, fieldSize);
            if (score + 0.001 < bestScore) {
              bestScore = score;
              bestTeams = candidate;
            }
          }
        }
      }
    }

    if (bestScore + 0.001 >= currentScore) break;
    current = bestTeams;
    currentScore = bestScore;
  }

  return recomputeStats(current, fieldSize);
}

export function generateTeams(
  players: Player[],
  numTeams: number,
  shuffleEquals: boolean = false,
  fieldSize: FieldSize = "medium",
  pairingRules: PairingRule[] = []
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

  return improvePairingRules(teams, pairingRules, fieldSize);
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
