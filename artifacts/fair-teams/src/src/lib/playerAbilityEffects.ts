export type AbilityEffectCarrier = Partial<{
  isGoalkeeper: boolean;
  isPlaymaker: boolean;
  isFinisher: boolean;
  isDribbler: boolean;
  isSentinel: boolean;
  isEngine: boolean;
  isVersatile: boolean;
  isSpaceFinder: boolean;
  isLongPass: boolean;
  isTikiTaka: boolean;
  isCrossing: boolean; // Technician (legacy key name)
  isAerial: boolean;   // Header (legacy key name)
  isPowerShot: boolean;
  isBulldog: boolean;
}>;

export type AbilityStatBoosts = {
  attack: number;
  defense: number;
  passing: number;
  speed: number;
  stamina: number;
  physical: number;
};

const MAX_TRAIT_BOOST_PER_STAT = 2;

function capBoosts(boosts: AbilityStatBoosts): AbilityStatBoosts {
  return {
    attack: Math.min(MAX_TRAIT_BOOST_PER_STAT, boosts.attack),
    defense: Math.min(MAX_TRAIT_BOOST_PER_STAT, boosts.defense),
    passing: Math.min(MAX_TRAIT_BOOST_PER_STAT, boosts.passing),
    speed: Math.min(MAX_TRAIT_BOOST_PER_STAT, boosts.speed),
    stamina: Math.min(MAX_TRAIT_BOOST_PER_STAT, boosts.stamina),
    physical: Math.min(MAX_TRAIT_BOOST_PER_STAT, boosts.physical),
  };
}

export function getSpecialSkillStatBoosts(player: AbilityEffectCarrier): AbilityStatBoosts {
  const boosts: AbilityStatBoosts = {
    attack: 0,
    defense: 0,
    passing: 0,
    speed: 0,
    stamina: 0,
    physical: 0,
  };

  if (player.isFinisher) {
    boosts.attack += 1.0;
  }
  if (player.isPowerShot) {
    boosts.attack += 1.0;
    boosts.physical += 0.5;
  }
  if (player.isDribbler) {
    boosts.attack += 0.5;
    boosts.speed += 0.8;
  }
  if (player.isSpaceFinder) {
    boosts.attack += 0.6;
    boosts.speed += 0.4;
    boosts.passing += 0.2;
  }

  if (player.isPlaymaker) {
    boosts.passing += 1.0;
    boosts.attack += 0.2;
  }
  // Internal compatibility: older saved rosters used isCrossing for Crossing.
  // It now represents Technician.
  if (player.isCrossing) {
    boosts.passing += 0.8;
    boosts.attack += 0.4;
  }
  if (player.isTikiTaka) {
    boosts.passing += 1.0;
    boosts.stamina += 0.3;
  }
  if (player.isLongPass) {
    boosts.passing += 1.0;
    boosts.attack += 0.3;
  }
  if (player.isEngine) {
    boosts.stamina += 1.0;
    boosts.speed += 0.5;
  }
  if (player.isVersatile) {
    boosts.attack += 0.3;
    boosts.defense += 0.3;
    boosts.passing += 0.3;
    boosts.speed += 0.3;
    boosts.stamina += 0.3;
  }

  if (player.isSentinel) {
    boosts.defense += 1.0;
    boosts.stamina += 0.2;
  }
  // Internal compatibility: older saved rosters used isAerial for Aerial.
  // It now represents Header.
  if (player.isAerial) {
    boosts.physical += 0.7;
    boosts.defense += 0.5;
    boosts.attack += 0.3;
  }
  if (player.isBulldog) {
    boosts.defense += 0.7;
    boosts.stamina += 0.7;
  }

  // Goalkeeper is intentionally role-only here. It helps organizers spread GK options,
  // but it should not inflate outfield balance strength.
  return capBoosts(boosts);
}
