import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlayer } from "./localRoster.ts";
import { generateTeams, getWeightedSkill, recomputeStats } from "./teamGenerator.ts";
import type { PairingRule, Player, Team } from "./types.ts";

function representativePlayers(): Player[] {
  return [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 7.5, 6.5, 5.5, 4.5].map((skill, index) =>
    normalizePlayer({
      id: `player-${index + 1}`,
      name: `Player ${index + 1}`,
      gender: index < 3 ? "female" : "male",
      skill,
      attack: skill,
      defense: skill,
      speed: index % 3 === 0 ? Math.min(10, skill + 1) : skill,
      passing: skill,
      stamina: skill,
      physical: skill,
      teamPlay: 2,
      todayStatus: index === 11 ? "not_here_yet" : "here",
      attending: true,
      createdAt: "2026-08-19T09:00:00.000Z",
    }, index),
  );
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  const normalized = normalizePlayer({
    id,
    name: `Player ${id}`,
    gender: "male",
    skill: 6,
    attack: 6,
    defense: 6,
    speed: 6,
    passing: 6,
    stamina: 6,
    physical: 6,
    teamPlay: 2,
    todayStatus: "here",
    attending: true,
    createdAt: "2026-08-19T09:00:00.000Z",
    ...overrides,
  }, 0);

  return {
    ...normalized,
    ...overrides,
    id,
    name: overrides.name ?? normalized.name,
    gender: overrides.gender ?? normalized.gender,
  };
}

function assertNoCorruptAssignments(teams: Team[], requestedTeams: number, selectedPlayers: Player[]) {
  assert.equal(teams.length, requestedTeams);
  const assignedIds = teams.flatMap((team) => team.players.map((player) => player.id));
  const expectedIds = selectedPlayers.map((player) => player.id).sort();
  const uniqueAssignedIds = [...new Set(assignedIds)].sort();
  assert.deepEqual(uniqueAssignedIds, expectedIds);
  assert.equal(assignedIds.length, selectedPlayers.length);
  assert.equal(new Set(assignedIds).size, selectedPlayers.length);
  teams.forEach((team) => {
    team.players.forEach((player) => {
      assert.ok(selectedPlayers.some((selected) => selected.id === player.id));
    });
  });
}

function teamIndex(teams: Team[], playerId: string) {
  return teams.findIndex((team) => team.players.some((player) => player.id === playerId));
}

function normalizeTeamStats(teams: Team[]) {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    playerIds: [...team.players.map((player) => player.id)].sort(),
    totalSkill: team.totalSkill,
    averageSkill: team.averageSkill,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function assertStructurallyValid(teams: Team[], players: Player[], requestedTeams: number) {
  assert.equal(teams.length, requestedTeams);
  const assignedIds = teams.flatMap((team) => team.players.map((player) => player.id));
  assert.deepEqual([...assignedIds].sort(), players.map((player) => player.id).sort());
  assert.equal(new Set(assignedIds).size, players.length);
  const sizes = teams.map((team) => team.players.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
}

test("independent OVR remains the strength guardrail for an asymmetric detailed profile", () => {
  const goalThreat = player("ovr-nine-goal-threat", {
    skill: 9,
    overallIndependent: true,
    attack: 10,
    defense: 4,
    speed: 8.5,
    passing: 7.5,
    stamina: 7,
    physical: 8,
  });

  assert.equal(getWeightedSkill(goalThreat, "small"), 9);
  assert.equal(getWeightedSkill(goalThreat, "medium"), 9);
  assert.equal(getWeightedSkill(goalThreat, "large"), 9);
});

test("representative roster generates the requested balanced team count without loss or duplication", () => {
  const players = representativePlayers();
  const teams = generateTeams(players, 3, false, "medium");
  assertStructurallyValid(teams, players, 3);
});

test("a feasible keep-separate pairing remains on different teams", () => {
  const players = representativePlayers();
  const rule: PairingRule = {
    id: "separate-1",
    kind: "separate",
    playerAId: "player-1",
    playerBId: "player-2",
  };
  const teams = generateTeams(players, 3, false, "medium", [rule]);
  assertStructurallyValid(teams, players, 3);
  assert.notEqual(teamIndex(teams, rule.playerAId), teamIndex(teams, rule.playerBId));
});

test("a feasible keep-together pairing remains on the same team", () => {
  const players = representativePlayers();
  const rule: PairingRule = {
    id: "together-1",
    kind: "together",
    playerAId: "player-1",
    playerBId: "player-2",
  };
  const teams = generateTeams(players, 3, false, "medium", [rule]);
  assertStructurallyValid(teams, players, 3);
  assert.equal(teamIndex(teams, rule.playerAId), teamIndex(teams, rule.playerBId));
});

test("repeated deterministic inputs remain structurally valid without freezing incidental order", () => {
  const players = representativePlayers();
  const first = generateTeams(players, 3, false, "large");
  const second = generateTeams(players, 3, false, "large");
  assertStructurallyValid(first, players, 3);
  assertStructurallyValid(second, players, 3);
});

test("every selected input player appears exactly once and no unexpected players are introduced", () => {
  const players = [
    ...representativePlayers().slice(0, 5),
    player("extra-1", { skill: 4.5 }),
    player("extra-2", { skill: 9 }),
  ];
  const teams = generateTeams(players, 3, false);
  assertNoCorruptAssignments(teams, 3, players);
});

test("10 selected players for 2 teams produces complete membership and near-even sizes", () => {
  const players = Array.from({ length: 10 }, (_, index) => player(`ten-${index}`, { skill: 6 + (index % 2) * 0.25 }));
  const teams = generateTeams(players, 2, false);
  assertNoCorruptAssignments(teams, 2, players);
  const sizes = teams.map((team) => team.players.length).sort((a, b) => a - b);
  assert.deepEqual(sizes, [5, 5]);
});

test("12 players for 2 teams produces complete membership and near-even sizes", () => {
  const players = Array.from({ length: 12 }, (_, index) => player(`two-${index}`, { speed: 5 + (index % 3), skill: 5.5 }));
  const teams = generateTeams(players, 2, false);
  assertNoCorruptAssignments(teams, 2, players);
  const sizes = teams.map((team) => team.players.length);
  assert.equal(Math.min(...sizes), 6);
  assert.equal(Math.max(...sizes), 6);
});

test("odd-player rosters preserve all players for 9 and 11 entries", () => {
  const oddNine = Array.from({ length: 9 }, (_, index) => player(`odd9-${index}`, { attack: 5 + (index % 3) * 0.5 }));
  const oddEleven = Array.from({ length: 11 }, (_, index) => player(`odd11-${index}`, { attack: 5 + (index % 3) * 0.5 }));

  const teamsForNine = generateTeams(oddNine, 2, false);
  const teamsForEleven = generateTeams(oddEleven, 3, false);

  assertNoCorruptAssignments(teamsForNine, 2, oddNine);
  assertNoCorruptAssignments(teamsForEleven, 3, oddEleven);
  assert.ok(teamsForNine.some((team) => team.players.length === 5));
  assert.ok(teamsForNine.some((team) => team.players.length === 4));
  assert.ok(teamsForEleven.some((team) => team.players.length === 4));
  assert.ok(teamsForEleven.some((team) => team.players.length === 3));
});

test("all-equal pool is structurally stable and complete", () => {
  const players = Array.from({ length: 11 }, (_, index) => player(`equal-${index}`, { attack: 7, defense: 7, speed: 7, passing: 7, stamina: 7, skill: 7 }));
  const teams = generateTeams(players, 3, false);
  assertNoCorruptAssignments(teams, 3, players);
  const sizes = teams.map((team) => team.players.length);
  assert.equal(Math.max(...sizes) - Math.min(...sizes), 1);
});

test("extreme-strength outliers are not dropped and preserve full team coverage", () => {
  const players = [
    player("star", { attack: 10, defense: 10, speed: 10, passing: 10, stamina: 10, skill: 10 }),
    player("p2", { attack: 1, defense: 1, speed: 1, passing: 1, stamina: 1, skill: 1 }),
    player("p3", { attack: 1, defense: 1, speed: 1, passing: 1, stamina: 1, skill: 1 }),
    player("p4", { attack: 1, defense: 1, speed: 1, passing: 1, stamina: 1, skill: 1 }),
    player("p5", { attack: 1, defense: 1, speed: 1, passing: 1, stamina: 1, skill: 1 }),
    player("p6", { attack: 1, defense: 1, speed: 1, passing: 1, stamina: 1, skill: 1 }),
  ];
  const teams = generateTeams(players, 3, false);
  assertNoCorruptAssignments(teams, 3, players);
  assert.ok(teams.some((team) => team.players.some((candidate) => candidate.id === "star")));
});

test("no-shuffle generation is deterministic for identical deterministic input", () => {
  const players = representativePlayers();
  const first = generateTeams(players, 3, false, "large");
  const second = generateTeams(players, 3, false, "large");

  assert.deepEqual(normalizeTeamStats(first), normalizeTeamStats(second));
});

test("shuffle mode preserves membership invariants", () => {
  const players = representativePlayers();
  const shuffleOne = generateTeams(players, 3, true);
  const shuffleTwo = generateTeams(players, 3, true);
  assertNoCorruptAssignments(shuffleOne, 3, players);
  assertNoCorruptAssignments(shuffleTwo, 3, players);
  assert.deepEqual([...shuffleOne.flatMap((team) => team.players.map((p) => p.id)).sort()], players.map((p) => p.id).sort());
  assert.deepEqual([...shuffleTwo.flatMap((team) => team.players.map((p) => p.id)).sort()], players.map((p) => p.id).sort());
});

test("valid keep-together constraints are respected when feasible", () => {
  const players = [player("together-a", { gender: "female", attack: 8 }), player("together-b", { attack: 7.5, speed: 8 }), ...representativePlayers().slice(2)];
  const rule: PairingRule = {
    id: "together-test",
    kind: "together",
    playerAId: "together-a",
    playerBId: "together-b",
  };

  const teams = generateTeams(players, 4, false, "medium", [rule]);
  assertNoCorruptAssignments(teams, 4, players);
  assert.equal(teamIndex(teams, "together-a"), teamIndex(teams, "together-b"));
});

test("valid keep-separate constraints are respected when feasible", () => {
  const players = [player("separate-a", { speed: 9, defense: 8 }), player("separate-b", { speed: 8, defense: 8 }), ...representativePlayers().slice(2)];
  const rule: PairingRule = {
    id: "separate-test",
    kind: "separate",
    playerAId: "separate-a",
    playerBId: "separate-b",
  };

  const teams = generateTeams(players, 4, false, "medium", [rule]);
  assertNoCorruptAssignments(teams, 4, players);
  assert.notEqual(teamIndex(teams, "separate-a"), teamIndex(teams, "separate-b"));
});

test("stale or malformed pairing rules fail safely through existing cleaning behavior", () => {
  const players = representativePlayers();
  const malformedRules = [
    { id: "ignored-kind", kind: "unknown", playerAId: "player-1", playerBId: "player-2", createdAt: "2026-08-19T09:00:00.000Z" },
    { id: "missing-player", kind: "separate", playerAId: "player-1", playerBId: "missing-1", createdAt: "2026-08-19T09:00:00.000Z" },
    { id: "self", kind: "together", playerAId: "player-1", playerBId: "player-1", createdAt: "2026-08-19T09:00:00.000Z" },
    { id: "dup", kind: "together", playerAId: "player-2", playerBId: "player-3", createdAt: "2026-08-19T09:00:00.000Z" },
    { id: "dup-swapped", kind: "together", playerAId: "player-3", playerBId: "player-2", createdAt: "2026-08-19T09:00:00.000Z" },
  ] as unknown as PairingRule[];

  const teams = generateTeams(players, 3, false, "medium", malformedRules);
  assertNoCorruptAssignments(teams, 3, players);
});

test("recomputeStats recalculates complete, deterministic team aggregates", () => {
  const teams = [
    {
      id: "1",
      name: "Team 1",
      color: "red" as const,
      players: [
        player("recompute-a", { skill: 4, attack: 4, defense: 4, speed: 4, passing: 4, stamina: 4 }),
        player("recompute-b", { skill: 8, attack: 8, defense: 8, speed: 8, passing: 8, stamina: 8 }),
      ],
      totalSkill: 0,
      averageSkill: 0,
    },
    {
      id: "2",
      name: "Team 2",
      color: "blue" as const,
      players: [player("recompute-c", { skill: 6, attack: 6, defense: 6, speed: 6, passing: 6, stamina: 6 })],
      totalSkill: 0,
      averageSkill: 0,
    },
  ] as Team[];

  const [team1, team2] = teams;
  const rec = recomputeStats(teams, "medium");
  assert.deepEqual(rec.map((team) => team.id), ["1", "2"]);
  assert.equal(team1.players.length, 2);
  assert.equal(rec[0]!.players.length, team1.players.length);
  assert.equal(rec[1]!.players.length, team2.players.length);
  assert.equal(
    team1.players.every((candidate) => ["recompute-a", "recompute-b"].includes(candidate.id)),
    true,
  );
  assert.equal(
    team2.players.every((candidate) => candidate.id === "recompute-c"),
    true,
  );

  const expectedTeam1Total = Number((team1.players
    .reduce((sum, player) => sum + player.attack * 0.2 + player.passing * 0.2 + player.defense * 0.2 + player.speed * 0.2 + player.stamina * 0.2, 0)
  ).toFixed(1));
  assert.equal(rec[0]!.totalSkill, expectedTeam1Total);
  assert.equal(rec[0]!.averageSkill, Number((expectedTeam1Total / team1.players.length).toFixed(1)));
  assert.equal(rec[0]!.averageSkill >= 0, true);
  assert.equal(rec[1]!.averageSkill >= 0, true);
});

test("invalid generation input fails safely", () => {
  const players = representativePlayers();
  assert.deepEqual(generateTeams(players, 1, false), []);
  assert.deepEqual(generateTeams(players, 0, false), []);
  assert.deepEqual(generateTeams(players, -4, false), []);
  assert.deepEqual(generateTeams([], 2, false), []);
});

test("9-player 4v5 characterization snapshot captures on-field and legacy-lean strength facts", () => {
  const players = characterizationPlayers4v5();

  const teams = generateTeams(players, 2, false, "medium");
  assertNoCorruptAssignments(teams, 2, players);

  const teamSizes = teams.map((team) => team.players.length).sort((a, b) => a - b);
  assert.deepEqual(teamSizes, [4, 5]);

  const totals = teams.map((team) => team.totalSkill);
  const spread = Number((Math.max(...totals) - Math.min(...totals)).toFixed(2));
  assert.ok(spread >= 0);

  const ordered = teams.map((team) => ({
    teamId: team.id,
    size: team.players.length,
    totalSkill: team.totalSkill,
    averageSkill: team.averageSkill,
  })).sort((a, b) => a.teamId.localeCompare(b.teamId));

  assert.equal(spread, 2.1);
  assert.deepEqual(ordered, [
    { teamId: "1", size: 4, totalSkill: 23, averageSkill: 5.8 },
    { teamId: "2", size: 5, totalSkill: 25.1, averageSkill: 5 },
  ]);
});

function characterizationPlayers4v5() {
  return [
    player("characterization-1", { attack: 9, defense: 8, passing: 9, speed: 8, stamina: 8, skill: 8 }),
    player("characterization-2", { attack: 8, defense: 7, passing: 7, speed: 8, stamina: 7, skill: 7 }),
    player("characterization-3", { attack: 6, defense: 6, passing: 6, speed: 6, stamina: 6, skill: 6 }),
    player("characterization-4", { attack: 6, defense: 6, passing: 5, speed: 7, stamina: 6, skill: 6 }),
    player("characterization-5", { attack: 5, defense: 5, passing: 5, speed: 5, stamina: 5, skill: 5 }),
    player("characterization-6", { attack: 5, defense: 5, passing: 5, speed: 5, stamina: 5, skill: 5 }),
    player("characterization-7", { attack: 4, defense: 4, passing: 4, speed: 4, stamina: 4, skill: 4 }),
    player("characterization-8", { attack: 4, defense: 4, passing: 3, speed: 4, stamina: 3, skill: 4 }),
    player("characterization-9", { todayStatus: "not_here_yet", attack: 7, defense: 8, passing: 8, speed: 8, stamina: 8, skill: 8 }),
  ];
}
