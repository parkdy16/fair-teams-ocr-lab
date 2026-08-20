// H3-C EXPERIMENT ONLY.
// This pure evaluator is intentionally outside the production team-generator graph.

export interface ExperimentalPlayer {
  id: string;
  overallSkill: number;
  profile?: Readonly<Record<string, number>>;
}

export type ExperimentalSubstitutionMode =
  | "fixed-on-field"
  | "equal-on-field-with-rotation";

export interface ExperimentalTeamAssignment {
  teamId: string;
  playerIds: readonly string[];
  activePlayerCount: number;
}

export interface ExperimentalPreviousTeamAssignment {
  teamId: string;
  playerIds: readonly string[];
}

export interface ExperimentalMatchFormat {
  candidateId: string;
  numberOfTeams: number;
  teams: readonly ExperimentalTeamAssignment[];
  substitutionMode: ExperimentalSubstitutionMode;
  previousTeams?: readonly ExperimentalPreviousTeamAssignment[];
}

export interface ExperimentalHardConstraint {
  id: string;
  isViolated: (teamByPlayerId: ReadonlyMap<string, string>) => boolean;
}

export interface NumericalAdvantagePolicyContext {
  matchFormat: ExperimentalMatchFormat;
  team: ExperimentalTeamAssignment;
}

export type NumericalAdvantagePolicy = (
  context: NumericalAdvantagePolicyContext,
) => number;

export interface ExperimentalTeamFairnessMetrics {
  teamId: string;
  playerIds: readonly string[];
  assignedPlayerCount: number;
  activePlayerCount: number;
  rawOverallSkillTotal: number;
  overallSkillAveragePerPlayer: number;
  profileTotals: Readonly<Record<string, number>>;
  profileObservationCounts: Readonly<Record<string, number>>;
  numericalAdvantageAdjustment: number;
  effectiveStrength: number;
}

export interface ExperimentalAssignmentDisruption {
  comparablePlayerCount: number;
  changedPlayerCount: number;
  changedPlayerIds: readonly string[];
}

export interface ExperimentalFairnessEvaluation {
  candidateId: string;
  teams: readonly ExperimentalTeamFairnessMetrics[];
  rawOverallSkillTotalSpread: number;
  overallSkillAverageSpread: number;
  activePlayerCountSpread: number;
  profileTotalSpreads: Readonly<Record<string, number>>;
  hardConstraintViolations: readonly string[];
  assignmentDisruption?: ExperimentalAssignmentDisruption;
  effectiveStrengthDifference: number;
}

export interface EvaluateExperimentalFairnessInput {
  players: readonly ExperimentalPlayer[];
  matchFormat: ExperimentalMatchFormat;
  numericalAdvantagePolicy?: NumericalAdvantagePolicy;
  hardConstraints?: readonly ExperimentalHardConstraint[];
}

export const noNumericalAdvantagePolicy: NumericalAdvantagePolicy = () => 0;

export function createPerExtraActivePlayerNumericalAdvantagePolicy(
  adjustmentPerExtraActivePlayer: number,
): NumericalAdvantagePolicy {
  assertFiniteNumber(
    adjustmentPerExtraActivePlayer,
    "Numerical-advantage adjustment must be finite.",
  );

  return ({ matchFormat, team }) => {
    if (matchFormat.substitutionMode === "equal-on-field-with-rotation") return 0;

    const minimumActivePlayerCount = Math.min(
      ...matchFormat.teams.map((candidateTeam) => candidateTeam.activePlayerCount),
    );
    return roundMetric(
      (team.activePlayerCount - minimumActivePlayerCount)
      * adjustmentPerExtraActivePlayer,
    );
  };
}

export function evaluateExperimentalFairness({
  players,
  matchFormat,
  numericalAdvantagePolicy = noNumericalAdvantagePolicy,
  hardConstraints = [],
}: EvaluateExperimentalFairnessInput): ExperimentalFairnessEvaluation {
  const playerById = validatePlayers(players);
  const teamByPlayerId = validateMatchFormat(matchFormat, playerById);
  const profileKeys = collectProfileKeys(players);

  const teams = matchFormat.teams.map((team) => {
    const assignedPlayers = team.playerIds.map((playerId) => playerById.get(playerId)!);
    const rawOverallSkillTotal = roundMetric(
      assignedPlayers.reduce((total, player) => total + player.overallSkill, 0),
    );
    const { totals: profileTotals, counts: profileObservationCounts } =
      profileMetrics(assignedPlayers, profileKeys);
    const numericalAdvantageAdjustment = roundMetric(
      numericalAdvantagePolicy({ matchFormat, team }),
    );
    assertFiniteNumber(
      numericalAdvantageAdjustment,
      `Numerical-advantage policy returned a non-finite value for team ${team.teamId}.`,
    );

    return {
      teamId: team.teamId,
      playerIds: [...team.playerIds],
      assignedPlayerCount: assignedPlayers.length,
      activePlayerCount: team.activePlayerCount,
      rawOverallSkillTotal,
      overallSkillAveragePerPlayer: roundMetric(
        rawOverallSkillTotal / assignedPlayers.length,
      ),
      profileTotals,
      profileObservationCounts,
      numericalAdvantageAdjustment,
      effectiveStrength: roundMetric(
        rawOverallSkillTotal + numericalAdvantageAdjustment,
      ),
    } satisfies ExperimentalTeamFairnessMetrics;
  });

  const hardConstraintViolations = hardConstraints
    .filter((constraint) => constraint.isViolated(teamByPlayerId))
    .map((constraint) => constraint.id);

  return {
    candidateId: matchFormat.candidateId,
    teams,
    rawOverallSkillTotalSpread: metricSpread(
      teams.map((team) => team.rawOverallSkillTotal),
    ),
    overallSkillAverageSpread: metricSpread(
      teams.map((team) => team.overallSkillAveragePerPlayer),
    ),
    activePlayerCountSpread: metricSpread(
      teams.map((team) => team.activePlayerCount),
    ),
    profileTotalSpreads: Object.fromEntries(
      profileKeys.map((profileKey) => [
        profileKey,
        metricSpread(teams.map((team) => team.profileTotals[profileKey] ?? 0)),
      ]),
    ),
    hardConstraintViolations,
    assignmentDisruption: matchFormat.previousTeams
      ? measureAssignmentDisruption(matchFormat.previousTeams, teamByPlayerId)
      : undefined,
    effectiveStrengthDifference: metricSpread(
      teams.map((team) => team.effectiveStrength),
    ),
  };
}

function validatePlayers(players: readonly ExperimentalPlayer[]) {
  invariant(players.length > 0, "At least one experimental player is required.");
  const playerById = new Map<string, ExperimentalPlayer>();

  players.forEach((player) => {
    invariant(player.id.length > 0, "Experimental player IDs must not be empty.");
    invariant(!playerById.has(player.id), `Duplicate experimental player ID: ${player.id}.`);
    assertFiniteNumber(
      player.overallSkill,
      `Overall skill must be finite for player ${player.id}.`,
    );
    Object.entries(player.profile ?? {}).forEach(([profileKey, value]) => {
      invariant(profileKey.length > 0, `Profile keys must not be empty for player ${player.id}.`);
      assertFiniteNumber(
        value,
        `Profile value ${profileKey} must be finite for player ${player.id}.`,
      );
    });
    playerById.set(player.id, player);
  });

  return playerById;
}

function validateMatchFormat(
  matchFormat: ExperimentalMatchFormat,
  playerById: ReadonlyMap<string, ExperimentalPlayer>,
) {
  invariant(matchFormat.candidateId.length > 0, "Candidate ID must not be empty.");
  invariant(
    Number.isInteger(matchFormat.numberOfTeams) && matchFormat.numberOfTeams >= 2,
    "An experimental match format requires at least two teams.",
  );
  invariant(
    matchFormat.teams.length === matchFormat.numberOfTeams,
    "Match-format team count does not match its assignments.",
  );

  const seenTeamIds = new Set<string>();
  const teamByPlayerId = new Map<string, string>();

  matchFormat.teams.forEach((team) => {
    invariant(team.teamId.length > 0, "Experimental team IDs must not be empty.");
    invariant(!seenTeamIds.has(team.teamId), `Duplicate experimental team ID: ${team.teamId}.`);
    invariant(team.playerIds.length > 0, `Team ${team.teamId} must have assigned players.`);
    invariant(
      Number.isInteger(team.activePlayerCount)
      && team.activePlayerCount > 0
      && team.activePlayerCount <= team.playerIds.length,
      `Team ${team.teamId} has an invalid active-player count.`,
    );

    if (matchFormat.substitutionMode === "fixed-on-field") {
      invariant(
        team.activePlayerCount === team.playerIds.length,
        `Fixed-on-field team ${team.teamId} must keep every assigned player active.`,
      );
    }

    seenTeamIds.add(team.teamId);
    team.playerIds.forEach((playerId) => {
      invariant(playerById.has(playerId), `Unknown assigned experimental player: ${playerId}.`);
      invariant(!teamByPlayerId.has(playerId), `Player ${playerId} is assigned more than once.`);
      teamByPlayerId.set(playerId, team.teamId);
    });
  });

  if (matchFormat.substitutionMode === "equal-on-field-with-rotation") {
    invariant(
      new Set(matchFormat.teams.map((team) => team.activePlayerCount)).size === 1,
      "Rotating-substitute formats require equal on-field player counts.",
    );
  }

  const missingPlayerIds = [...playerById.keys()].filter(
    (playerId) => !teamByPlayerId.has(playerId),
  );
  invariant(
    missingPlayerIds.length === 0,
    `Unassigned experimental players: ${missingPlayerIds.join(", ")}.`,
  );

  return teamByPlayerId;
}

function collectProfileKeys(players: readonly ExperimentalPlayer[]) {
  return [...new Set(players.flatMap((player) => Object.keys(player.profile ?? {})))].sort();
}

function profileMetrics(
  players: readonly ExperimentalPlayer[],
  profileKeys: readonly string[],
) {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};

  profileKeys.forEach((profileKey) => {
    const observedValues = players
      .map((player) => player.profile?.[profileKey])
      .filter((value): value is number => value !== undefined);
    totals[profileKey] = roundMetric(
      observedValues.reduce((total, value) => total + value, 0),
    );
    counts[profileKey] = observedValues.length;
  });

  return { totals, counts };
}

function measureAssignmentDisruption(
  previousTeams: readonly ExperimentalPreviousTeamAssignment[],
  currentTeamByPlayerId: ReadonlyMap<string, string>,
): ExperimentalAssignmentDisruption {
  const previousTeamByPlayerId = new Map<string, string>();

  previousTeams.forEach((team) => {
    team.playerIds.forEach((playerId) => {
      invariant(
        !previousTeamByPlayerId.has(playerId),
        `Previous assignment includes player ${playerId} more than once.`,
      );
      previousTeamByPlayerId.set(playerId, team.teamId);
    });
  });

  const comparablePlayerIds = [...currentTeamByPlayerId.keys()]
    .filter((playerId) => previousTeamByPlayerId.has(playerId));
  const changedPlayerIds = comparablePlayerIds
    .filter(
      (playerId) => previousTeamByPlayerId.get(playerId) !== currentTeamByPlayerId.get(playerId),
    )
    .sort();

  return {
    comparablePlayerCount: comparablePlayerIds.length,
    changedPlayerCount: changedPlayerIds.length,
    changedPlayerIds,
  };
}

function metricSpread(values: readonly number[]) {
  return roundMetric(Math.max(...values) - Math.min(...values));
}

function roundMetric(value: number) {
  return Number(value.toFixed(8));
}

function assertFiniteNumber(value: number, message: string): void {
  invariant(Number.isFinite(value), message);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
