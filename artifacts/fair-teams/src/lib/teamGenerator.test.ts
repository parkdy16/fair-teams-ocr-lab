import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlayer } from "./localRoster.ts";
import { generateTeams } from "./teamGenerator.ts";
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

function assertStructurallyValid(teams: Team[], players: Player[], requestedTeams: number) {
  assert.equal(teams.length, requestedTeams);
  const assignedIds = teams.flatMap((team) => team.players.map((player) => player.id));
  assert.deepEqual([...assignedIds].sort(), players.map((player) => player.id).sort());
  assert.equal(new Set(assignedIds).size, players.length);
  const sizes = teams.map((team) => team.players.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
}

function teamIndex(teams: Team[], playerId: string) {
  return teams.findIndex((team) => team.players.some((player) => player.id === playerId));
}

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
