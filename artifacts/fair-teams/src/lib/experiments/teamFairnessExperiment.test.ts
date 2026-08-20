import assert from "node:assert/strict";
import test from "node:test";

import {
  createPerExtraActivePlayerNumericalAdvantagePolicy,
  evaluateExperimentalFairness,
  type ExperimentalFairnessEvaluation,
  type ExperimentalMatchFormat,
  type ExperimentalPlayer,
} from "./teamFairnessExperiment.ts";

const NINE_PLAYER_OVR_FIXTURE: readonly ExperimentalPlayer[] = [
  { id: "p1", overallSkill: 9.31 },
  { id: "p2", overallSkill: 8.8 },
  { id: "p3", overallSkill: 8.19 },
  { id: "p4", overallSkill: 7.62 },
  { id: "p5", overallSkill: 7.03 },
  { id: "p6", overallSkill: 6.55 },
  { id: "p7", overallSkill: 5.86 },
  { id: "p8", overallSkill: 5.46 },
  { id: "p9", overallSkill: 4.88 },
];

test("9-player sweep enumerates every 4v5 split and exposes assumption-driven preference changes", () => {
  const candidates = enumerateFourVsFiveCandidates(NINE_PLAYER_OVR_FIXTURE);
  assert.equal(candidates.length, 126);

  let previous: ExperimentalFairnessEvaluation | undefined;
  const summary = [0, 1, 2, 3, 4, 5].map((adjustmentPerExtraActivePlayer) => {
    const numericalAdvantagePolicy =
      createPerExtraActivePlayerNumericalAdvantagePolicy(adjustmentPerExtraActivePlayer);
    const preferred = selectPreferredCandidate(
      NINE_PLAYER_OVR_FIXTURE,
      candidates,
      adjustmentPerExtraActivePlayer,
    );
    const withDisruption = previous
      ? evaluateExperimentalFairness({
          players: NINE_PLAYER_OVR_FIXTURE,
          matchFormat: {
            ...candidates.find(
              (candidate) => candidate.candidateId === preferred.candidateId,
            )!,
            previousTeams: previous.teams.map((team) => ({
              teamId: team.teamId,
              playerIds: team.playerIds,
            })),
          },
          numericalAdvantagePolicy,
        })
      : preferred;

    previous = preferred;
    return {
      adjustmentPerExtraActivePlayer,
      fourPlayerTeam: preferred.teams[0]!.playerIds,
      rawOvrTotals: preferred.teams.map((team) => team.rawOverallSkillTotal),
      ovrAverages: preferred.teams.map((team) => team.overallSkillAveragePerPlayer),
      effectiveStrengthDifference: preferred.effectiveStrengthDifference,
      movedFromPrevious: withDisruption.assignmentDisruption?.changedPlayerIds ?? [],
    };
  });

  assert.deepEqual(summary, [
    {
      adjustmentPerExtraActivePlayer: 0,
      fourPlayerTeam: ["p1", "p2", "p3", "p8"],
      rawOvrTotals: [31.76, 31.94],
      ovrAverages: [7.94, 6.388],
      effectiveStrengthDifference: 0.18,
      movedFromPrevious: [],
    },
    {
      adjustmentPerExtraActivePlayer: 1,
      fourPlayerTeam: ["p1", "p2", "p4", "p6"],
      rawOvrTotals: [32.28, 31.42],
      ovrAverages: [8.07, 6.284],
      effectiveStrengthDifference: 0.14,
      movedFromPrevious: ["p3", "p4", "p6", "p8"],
    },
    {
      adjustmentPerExtraActivePlayer: 2,
      fourPlayerTeam: ["p1", "p2", "p3", "p6"],
      rawOvrTotals: [32.85, 30.85],
      ovrAverages: [8.2125, 6.17],
      effectiveStrengthDifference: 0,
      movedFromPrevious: ["p3", "p4"],
    },
    {
      adjustmentPerExtraActivePlayer: 3,
      fourPlayerTeam: ["p1", "p2", "p3", "p5"],
      rawOvrTotals: [33.33, 30.37],
      ovrAverages: [8.3325, 6.074],
      effectiveStrengthDifference: 0.04,
      movedFromPrevious: ["p5", "p6"],
    },
    {
      adjustmentPerExtraActivePlayer: 4,
      fourPlayerTeam: ["p1", "p2", "p3", "p4"],
      rawOvrTotals: [33.92, 29.78],
      ovrAverages: [8.48, 5.956],
      effectiveStrengthDifference: 0.14,
      movedFromPrevious: ["p4", "p5"],
    },
    {
      adjustmentPerExtraActivePlayer: 5,
      fourPlayerTeam: ["p1", "p2", "p3", "p4"],
      rawOvrTotals: [33.92, 29.78],
      ovrAverages: [8.48, 5.956],
      effectiveStrengthDifference: 0.86,
      movedFromPrevious: [],
    },
  ]);
});

test("numerical-advantage policy distinguishes equal teams, permanent 4v5, and 4v4 with a rotating substitute", () => {
  const policy = createPerExtraActivePlayerNumericalAdvantagePolicy(2.5);
  const tenPlayers = Array.from({ length: 10 }, (_, index) => ({
    id: `equal-${index + 1}`,
    overallSkill: 6,
  }));

  const equalFiveVsFive = evaluateExperimentalFairness({
    players: tenPlayers,
    matchFormat: {
      candidateId: "equal-5v5",
      numberOfTeams: 2,
      substitutionMode: "fixed-on-field",
      teams: [
        { teamId: "A", playerIds: tenPlayers.slice(0, 5).map(({ id }) => id), activePlayerCount: 5 },
        { teamId: "B", playerIds: tenPlayers.slice(5).map(({ id }) => id), activePlayerCount: 5 },
      ],
    },
    numericalAdvantagePolicy: policy,
  });
  assert.deepEqual(
    equalFiveVsFive.teams.map((team) => team.numericalAdvantageAdjustment),
    [0, 0],
  );

  const fourVsFive = evaluateExperimentalFairness({
    players: NINE_PLAYER_OVR_FIXTURE,
    matchFormat: matchFormat4v5("permanent-4v5", ["p1", "p2", "p3", "p8"]),
    numericalAdvantagePolicy: policy,
  });
  assert.deepEqual(
    fourVsFive.teams.map((team) => team.numericalAdvantageAdjustment),
    [0, 2.5],
  );
  assert.equal(fourVsFive.activePlayerCountSpread, 1);

  const equalOnFieldWithSubstitute = evaluateExperimentalFairness({
    players: NINE_PLAYER_OVR_FIXTURE,
    matchFormat: {
      ...matchFormat4v5("rotating-substitute", ["p1", "p2", "p3", "p8"]),
      substitutionMode: "equal-on-field-with-rotation",
      teams: [
        { teamId: "A", playerIds: ["p1", "p2", "p3", "p8"], activePlayerCount: 4 },
        { teamId: "B", playerIds: ["p4", "p5", "p6", "p7", "p9"], activePlayerCount: 4 },
      ],
    },
    numericalAdvantagePolicy: policy,
  });
  assert.deepEqual(
    equalOnFieldWithSubstitute.teams.map((team) => team.numericalAdvantageAdjustment),
    [0, 0],
  );
  assert.equal(equalOnFieldWithSubstitute.activePlayerCountSpread, 0);
});

test("profile composition remains observable without changing OVR fairness", () => {
  const players: readonly ExperimentalPlayer[] = [
    profilePlayer("p1", 10, 0),
    profilePlayer("p2", 9, 1),
    profilePlayer("p3", 8, 2),
    profilePlayer("p4", 7, 3),
    profilePlayer("p5", 3, 7),
    profilePlayer("p6", 2, 8),
    profilePlayer("p7", 1, 9),
    profilePlayer("p8", 0, 10),
  ];

  const concentrated = evaluateExperimentalFairness({
    players,
    matchFormat: fixedFourVsFour("profile-concentrated", ["p1", "p2", "p3", "p4"]),
  });
  const balanced = evaluateExperimentalFairness({
    players,
    matchFormat: fixedFourVsFour("profile-balanced", ["p1", "p4", "p5", "p8"]),
  });

  assert.equal(concentrated.rawOverallSkillTotalSpread, 0);
  assert.equal(balanced.rawOverallSkillTotalSpread, 0);
  assert.deepEqual(concentrated.profileTotalSpreads, { attack: 28, defense: 28 });
  assert.deepEqual(balanced.profileTotalSpreads, { attack: 0, defense: 0 });
  assert.deepEqual(
    concentrated.teams.map((team) => team.profileTotals),
    [
      { attack: 34, defense: 6 },
      { attack: 6, defense: 34 },
    ],
  );
});

test("hard-constraint violations are reported independently", () => {
  const players = Array.from({ length: 4 }, (_, index) => ({
    id: `p${index + 1}`,
    overallSkill: 6,
  }));
  const result = evaluateExperimentalFairness({
    players,
    matchFormat: {
      candidateId: "constraint-demo",
      numberOfTeams: 2,
      substitutionMode: "fixed-on-field",
      teams: [
        { teamId: "A", playerIds: ["p1", "p2"], activePlayerCount: 2 },
        { teamId: "B", playerIds: ["p3", "p4"], activePlayerCount: 2 },
      ],
    },
    hardConstraints: [
      {
        id: "p1-p2-must-be-separate",
        isViolated: (teamByPlayerId) =>
          teamByPlayerId.get("p1") === teamByPlayerId.get("p2"),
      },
    ],
  });

  assert.equal(result.rawOverallSkillTotalSpread, 0);
  assert.deepEqual(result.hardConstraintViolations, ["p1-p2-must-be-separate"]);
});

test("Live Split disruption counts only existing players whose team changed", () => {
  const players = Array.from({ length: 5 }, (_, index) => ({
    id: `p${index + 1}`,
    overallSkill: 6,
  }));
  const result = evaluateExperimentalFairness({
    players,
    matchFormat: {
      candidateId: "disruption-demo",
      numberOfTeams: 2,
      substitutionMode: "fixed-on-field",
      teams: [
        { teamId: "A", playerIds: ["p1", "p3"], activePlayerCount: 2 },
        { teamId: "B", playerIds: ["p2", "p4", "p5"], activePlayerCount: 3 },
      ],
      previousTeams: [
        { teamId: "A", playerIds: ["p1", "p2"] },
        { teamId: "B", playerIds: ["p3", "p4"] },
      ],
    },
  });

  assert.deepEqual(result.assignmentDisruption, {
    comparablePlayerCount: 4,
    changedPlayerCount: 2,
    changedPlayerIds: ["p2", "p3"],
  });
});

function selectPreferredCandidate(
  players: readonly ExperimentalPlayer[],
  candidates: readonly ExperimentalMatchFormat[],
  adjustmentPerExtraActivePlayer: number,
) {
  const numericalAdvantagePolicy =
    createPerExtraActivePlayerNumericalAdvantagePolicy(adjustmentPerExtraActivePlayer);
  const ranked = candidates
    .map((matchFormat) => evaluateExperimentalFairness({
      players,
      matchFormat,
      numericalAdvantagePolicy,
    }))
    .sort((left, right) =>
      left.effectiveStrengthDifference - right.effectiveStrengthDifference
      || left.candidateId.localeCompare(right.candidateId));

  assert.ok(ranked[0]);
  assert.ok(ranked[1]);
  assert.notEqual(
    ranked[0].effectiveStrengthDifference,
    ranked[1].effectiveStrengthDifference,
    `Fixture should have one preferred candidate at adjustment ${adjustmentPerExtraActivePlayer}.`,
  );
  return ranked[0];
}

function enumerateFourVsFiveCandidates(players: readonly ExperimentalPlayer[]) {
  const candidates: ExperimentalMatchFormat[] = [];
  const playerIds = players.map((player) => player.id);

  for (let first = 0; first < playerIds.length - 3; first += 1) {
    for (let second = first + 1; second < playerIds.length - 2; second += 1) {
      for (let third = second + 1; third < playerIds.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < playerIds.length; fourth += 1) {
          const fourPlayerIds = [
            playerIds[first]!,
            playerIds[second]!,
            playerIds[third]!,
            playerIds[fourth]!,
          ];
          candidates.push(
            matchFormat4v5(`four:${fourPlayerIds.join(",")}`, fourPlayerIds),
          );
        }
      }
    }
  }

  return candidates;
}

function matchFormat4v5(
  candidateId: string,
  fourPlayerIds: readonly string[],
): ExperimentalMatchFormat {
  const fourPlayerSet = new Set(fourPlayerIds);
  const fivePlayerIds = NINE_PLAYER_OVR_FIXTURE
    .map((player) => player.id)
    .filter((playerId) => !fourPlayerSet.has(playerId));

  return {
    candidateId,
    numberOfTeams: 2,
    substitutionMode: "fixed-on-field",
    teams: [
      { teamId: "A", playerIds: fourPlayerIds, activePlayerCount: 4 },
      { teamId: "B", playerIds: fivePlayerIds, activePlayerCount: 5 },
    ],
  };
}

function fixedFourVsFour(
  candidateId: string,
  firstTeamPlayerIds: readonly string[],
): ExperimentalMatchFormat {
  const firstTeamPlayerIdSet = new Set(firstTeamPlayerIds);
  const playerIds = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);

  return {
    candidateId,
    numberOfTeams: 2,
    substitutionMode: "fixed-on-field",
    teams: [
      { teamId: "A", playerIds: firstTeamPlayerIds, activePlayerCount: 4 },
      {
        teamId: "B",
        playerIds: playerIds.filter((playerId) => !firstTeamPlayerIdSet.has(playerId)),
        activePlayerCount: 4,
      },
    ],
  };
}

function profilePlayer(id: string, attack: number, defense: number): ExperimentalPlayer {
  return {
    id,
    overallSkill: 6,
    profile: { attack, defense },
  };
}
