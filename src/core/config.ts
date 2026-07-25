/**
 * Every tunable in the game lives here. No magic numbers scattered in code.
 */
import type { ChainConfig } from './collapse/chain';
import type { FlightConfig } from './flight/newtonian';
import type { AsteroidOptions } from './shapes/asteroid';

export interface RatingConfig {
  /** Starting rating for every skill before placement. */
  initialRating: number;
  /** Rating floor/ceiling. */
  minRating: number;
  maxRating: number;
  /** Base K factor for rating updates. */
  kFactor: number;
  /** K multiplier while a skill has few attempts (fast convergence early). */
  provisionalKMultiplier: number;
  /** Attempts below which a skill is considered provisional. */
  provisionalAttempts: number;
  /** Elo logistic scale (rating gap that maps to ~10x expected odds). */
  logisticScale: number;
  /** Speed factor bounds applied to correct-answer updates. */
  minSpeedFactor: number;
  maxSpeedFactor: number;
  /** Target answer latency (ms) per difficulty band; bands are difficulty thresholds. */
  latencyBands: readonly { maxDifficulty: number; targetMs: number }[];
  /** Fallback target latency for anything above the last band. */
  fallbackTargetMs: number;
  /** Rating margin above a skill's base difficulty that counts as mastery. */
  masteryMargin: number;
  /** Attempts required before a mastery milestone can fire. */
  masteryMinAttempts: number;
}

export interface WaveConfig {
  /** Portion of a wave drawn from fluent skills (rating comfortably above problem difficulty). */
  fluentShare: number;
  /** Portion drawn from frontier skills (near the rating edge). */
  frontierShare: number;
  /** Portion drawn from decayed skills (not seen recently). */
  reviewShare: number;
  /** Problems per wave, ramping over the run. */
  baseProblemsPerWave: number;
  problemsPerWaveGrowth: number;
  maxProblemsPerWave: number;
  /** Rating margin defining "fluent": rating - difficulty >= this. */
  fluentMargin: number;
  /** Rating window defining "frontier": |rating - difficulty| < this. */
  frontierWindow: number;
  /** A skill counts as decayed if not attempted in this many waves. */
  decayedAfterWaves: number;
  /** Number of stealth placement waves at cold start. */
  placementWaves: number;
  /** Problems per placement wave. */
  placementProblems: number;
  /** Weight multiplier applied to the coached skill in the wave after a tip. */
  coachedSkillWeight: number;
}

export interface MeteorConfig {
  /** Seconds a meteor takes to cross the screen at wave 1, difficulty floor. */
  baseFallSeconds: number;
  /** Fall time shrinks by this factor per wave (compounding). */
  fallSpeedupPerWave: number;
  /** Minimum fall seconds regardless of wave. */
  minFallSeconds: number;
  /** Extra fall time granted per difficulty point above player's rating (harder = slower). */
  difficultySlowdownMs: number;
  /** Delay between meteor spawns within a wave (seconds). */
  baseSpawnGapSeconds: number;
  minSpawnGapSeconds: number;
  spawnGapShrinkPerWave: number;
  /** Base HP; meteors that land subtract 1. */
  baseHp: number;
  /** Breather between waves (seconds). */
  breatherSeconds: number;
  /** Max meteors simultaneously on screen. */
  maxConcurrentMeteors: number;
  /**
   * Marked meteors drawn from frontier skills, worth far more if you take them
   * early. Greed points at the skills the player is weakest on, and it reads as
   * risk appetite rather than as remediation.
   */
  hotPerWave: number;
  hotScoreMultiplier: number;
  hotComboGain: number;
  /** A hot meteor pays its bonus only while it has fallen less than this. */
  hotHighFraction: number;
}

/** Power-up drops. See core/drops.ts. */
export interface DropConfig {
  /** Meteors per wave that carry a payload. */
  carriersPerWave: number;
  /** Descent speed of a dropped pickup (px/sec). */
  fallSpeed: number;
  /** How close the cannon must be, horizontally, to catch one. */
  catchRadius: number;
  freezeSeconds: number;
  doubleSeconds: number;
  doubleMultiplier: number;
  /** Kills covered by one chain pickup. */
  chainKills: number;
  /** Seconds of damage immunity from a shield pickup. */
  shieldSeconds: number;
  /** HP at or below which repair takes its boosted weight. */
  lowHpAt: number;
  lowHpRepairWeight: number;
  weights: Readonly<
    Record<'freeze' | 'nuke' | 'repair' | 'double' | 'chain' | 'shield', number>
  >;
  /**
   * What each mode is allowed to drop. An effect that has no meaning in a mode
   * is left out rather than given a strained reinterpretation — a pickup that
   * does nothing is worse than no pickup.
   */
  pools: Readonly<Record<'meteor' | 'expression' | 'factor' | 'collapse' | 'boss', readonly DropKindName[]>>;
}

/** Kept as a string union here so config does not import from drops. */
type DropKindName = 'freeze' | 'nuke' | 'repair' | 'double' | 'chain' | 'shield';

/**
 * Meteor gunfire and player dodging (Meteor Defense). Meteors take aimed shots
 * at the cannon; the player slides left/right to get out of the way.
 */
export interface HazardConfig {
  /** Run wave at which meteors start shooting. Placement waves are always safe. */
  firstArmedWave: number;
  /** Per-second odds one live meteor opens fire, at firstArmedWave. */
  baseFireChancePerSecond: number;
  /** Fire-chance multiplier per wave beyond firstArmedWave (compounding). */
  fireChanceGrowthPerWave: number;
  maxFireChancePerSecond: number;
  /** A meteor cannot fire again within this many seconds. */
  fireCooldownSeconds: number;
  /** A meteor must fall this far before it can shoot — no point-blank spawns. */
  armingFallPixels: number;
  /** Shot travel speed (px/sec) at firstArmedWave, and its ramp. */
  bulletSpeed: number;
  bulletSpeedGrowthPerWave: number;
  maxBulletSpeed: number;
  /** A shot crossing the ground line within this many px of the cannon connects. */
  bulletHitRadius: number;
  /** Cannon traverse speed (px/sec). */
  playerSpeed: number;
  /** How close to either screen edge the cannon may get. */
  playerEdgeMargin: number;
  /** Invulnerability after taking a hit, so one shot can't chain into a death. */
  invulnSeconds: number;
}

/**
 * Combo meter and the pace it drives. See core/combo.ts — the multiplier is
 * tiered rather than smooth so that each crossing is an event, and the pace
 * coupling means good play speeds the game up.
 */
export interface ComboConfig {
  /** Idle window at tier 0, shrinking per tier down to the floor. */
  baseWindowSeconds: number;
  windowShrinkPerTier: number;
  minWindowSeconds: number;
  /** Combo counts at which each tier begins. */
  tierThresholds: readonly number[];
  /** Score multiplier per tier; index 0 is "no combo". */
  tierMultipliers: readonly number[];
  /** Seconds a wrong digit knocks off the window. */
  wrongDigitPenaltySeconds: number;
  /** Fraction of the combo kept when a meteor's shot connects. */
  damageKeepFraction: number;
  /** Combo count (and every multiple of it) that triggers overdrive. */
  overdriveAt: number;
  overdriveSeconds: number;
  /** Descent speed multiplier per pace tier. */
  fallSpeedPerTier: number;
  /** Spawn-gap multiplier per pace tier (below 1 = faster). */
  spawnGapPerTier: number;
  /** Extra concurrent targets per pace tier, floored. */
  concurrentPerTier: number;
  /** Pace stops climbing here even though the multiplier does not. */
  maxPaceTier: number;
}

export interface ScoreConfig {
  /** Base points for a kill. */
  killBase: number;
  /** Extra points per difficulty point of the problem. */
  difficultyBonus: number;
  /** Streak multiplier step per consecutive kill (1.0, 1.1, 1.2, ...). Used by
   * the modes that still run a plain streak; meteor mode uses the combo tiers. */
  streakStep: number;
  maxStreakMultiplier: number;
  /** Bonus multiplier for answering faster than target latency. */
  speedBonusMultiplier: number;
}

export interface ExpressionConfig {
  /** Targets per wave, ramping over the run. */
  baseTargetsPerWave: number;
  targetsPerWaveGrowth: number;
  maxTargetsPerWave: number;
  /** Chips held at once. Refilled to this after every successful fire. */
  handSize: number;
  /** Targets falling at the same time. */
  targetsOnScreen: number;
  /** Hard ceiling on chips per expression — also the solver's search depth. */
  maxChips: number;
  /** Chips are drawn from this range, with an occasional big one mixed in. */
  chipMin: number;
  chipMax: number;
  bigChips: readonly number[];
  bigChipChance: number;
  /** Legal target range. */
  minTarget: number;
  maxTarget: number;
  /** Seconds a target takes to fall at wave 1. */
  baseFallSeconds: number;
  fallSpeedupPerWave: number;
  minFallSeconds: number;
  /** Extra fall seconds per chip of par beyond two (bigger puzzles get more time). */
  extraSecondsPerChip: number;
  /** Score bonus for solving a target in par chips. */
  parBonus: number;
  /** Score bonus per distinct operator in the fired expression. */
  varietyBonusPerOperator: number;
  /** Weight multiplier for operators the player has been avoiding. */
  avoidedOpWeight: number;
  /** Overall rating thresholds that raise the target size to 3 and 4 chips. */
  threeChipRating: number;
  fourChipRating: number;
  /** Composer lockout after firing an expression no live target wanted. */
  misfireLockSeconds: number;
  /** Combo clock a scrapped chip costs. */
  scrapPenaltySeconds: number;
}

/** Factor Storm: the free-flight arena. See core/factor/. */
export interface FactorConfig {
  /** Drift speed, radius and lifetime of a pickup pod left by a carrier rock. */
  pickupDrift: number;
  pickupRadius: number;
  pickupLifeSeconds: number;
  /** Rocks at the start of wave 1, and how many more each wave adds. */
  baseRocks: number;
  rocksPerWave: number;
  maxRocks: number;
  /** Factors multiplied together to build a rock; grows with the wave. */
  baseFactorParts: number;
  maxFactorParts: number;
  minRockValue: number;
  maxRockValue: number;
  /** Drift speed (px/sec) of the biggest and smallest rocks. */
  slowestDrift: number;
  fastestDrift: number;
  /** Radius mapping: rocks scale with the digit count of their value. */
  minRadius: number;
  maxRadius: number;
  /** Invulnerability after a collision. */
  invulnSeconds: number;
  /** Push applied to ship and rock when they collide. */
  collisionKnockback: number;
  /** Scoring. */
  destroyBase: number;
  splitBase: number;
  scorePerValue: number;
  primeMultiplier: number;
  balancedMultiplier: number;
  /** Speed given to the two halves of a split, pushing them apart. */
  splitSpeed: number;
  /**
   * Degrees a rock must sit closer to the nose than the current lock before
   * it steals the highlight. Damping, not delay: turning still sweeps the
   * lock instantly; only drift within this wedge is ignored.
   */
  aimHysteresisDeg: number;
}

export interface BossConfig {
  /** First boss HP; later bosses multiply. */
  baseHp: number;
  hpGrowthPerBoss: number;
  /** Number chips dealt per damage hand. */
  handSize: number;
  /** Seconds between boss attacks, shrinking per boss. */
  attackIntervalSeconds: number;
  minAttackIntervalSeconds: number;
  attackIntervalShrinkPerBoss: number;
  /** Seconds an attack takes to reach the player, shrinking per boss. */
  attackTravelSeconds: number;
  minAttackTravelSeconds: number;
  attackTravelShrinkPerBoss: number;
  /** Score per point of expression damage dealt. */
  scorePerDamage: number;
  /** Flat score bonus for downing a boss. */
  defeatBonus: number;
  /** Fraction of a boss's max HP a nuke pickup takes off. */
  nukeFraction: number;
  /** Attacks between carriers. Blocking a carrier hands over its pickup. */
  attacksPerCarrier: number;
  /** Score for blocking an attack. */
  blockScore: number;
}

export interface EconomyConfig {
  /** Currency per point of score, end of run. */
  creditsPerScore: number;
  /** Flat bonus per wave survived. */
  creditsPerWave: number;
}

/**
 * Rotate-and-thrust flight shared by every free-flight mode, so Factor Storm
 * and Collapse never drift apart in feel. Set drag to 0 for true frictionless
 * Continuum coasting.
 */
export type { FlightConfig } from './flight/newtonian';

/** Collapse: push fractions into their matching percentage. */
export interface CollapseConfig {
  /** Pairs on the field at wave 1, and how many more each wave adds. */
  basePairs: number;
  pairsPerWave: number;
  maxPairs: number;
  /** Waves at which the pool opens to tier 2 and tier 3 values. */
  tier2Wave: number;
  tier3Wave: number;
  /** Chance a fraction is shown unreduced (2/4 rather than 1/2). */
  unreducedChance: number;
  /** Drift speed range (px/sec) for free-floating tokens. */
  slowestDrift: number;
  fastestDrift: number;
  fractionRadius: number;
  percentRadius: number;
  /** Gunnery: one shot per cooldown, bolts expire rather than fly forever. */
  fireCooldownSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
  projectileLifeSeconds: number;
  /**
   * Swapping guns locks out fire for this long. The lockout is what makes the
   * swap a decision instead of a free toggle — and it gives the reload its room.
   */
  swapLockoutSeconds: number;
  /** An armed token releases itself after this long, so a stall has a cost. */
  armedSeconds: number;
  /** Fire lockout after misreading an equivalence. */
  mismatchLockoutSeconds: number;
  startingHp: number;
  invulnSeconds: number;
  collisionKnockback: number;
  /** Kickback the ship takes from its own gun, px/s per shot. */
  recoilImpulse: number;
  /** Passing this close to a solid token without touching it pays out. */
  nearMissRadius: number;
  nearMissBonus: number;
  /** Chain meter — see core/collapse/chain.ts. */
  chain: ChainConfig;
  /** Scoring. */
  matchBase: number;
  tierBonus: number;
  unreducedBonus: number;
}

/** Feel tunables: shake, hit-stop, glow pulses, particle counts, sfx pitch. */
export interface JuiceConfig {
  /** Camera shake (duration ms, intensity as a fraction of viewport). */
  killShakeMs: number;
  killShakeIntensity: number;
  /** Added to kill shake per extra target the spread cannon catches. */
  spreadShakePerTarget: number;
  landShakeMs: number;
  landShakeIntensity: number;
  bossHitShakeMs: number;
  bossHitShakeIntensity: number;
  bossDownShakeMs: number;
  bossDownShakeIntensity: number;
  gameOverShakeMs: number;
  gameOverShakeIntensity: number;
  /** Hit-stop: freeze scale (0 = full stop) held for this long, then released. */
  hitStopMs: number;
  hitStopScale: number;
  /** Heavier hit-stop for landings and boss kills. */
  heavyHitStopMs: number;
  /** Glow added on top of the baseline by a pulse, and how fast it decays (per second). */
  glowPulseKill: number;
  glowPulseHeavy: number;
  glowPulseDecayPerSecond: number;
  /** Particle counts. */
  killParticles: number;
  fastKillParticles: number;
  landParticles: number;
  /** Shockwave ring radius and lifetime on a kill. */
  shockwaveRadius: number;
  shockwaveMs: number;
  /** SFX pitch rises with the streak: 1 + streak * step, capped. */
  streakPitchStep: number;
  maxStreakPitch: number;
}

/**
 * The CRT itself: the glass, not the game. Every one of these is visible on
 * screen, so they are the first knobs to reach for if the picture is too dim,
 * too busy, or too washed out on someone else's monitor.
 */
export interface CrtConfig {
  /** Baseline phosphor bloom; pulses ride on top of it. */
  glowBase: number;
  /** Brightness a pixel must exceed before it blooms at all. */
  bloomThreshold: number;
  /**
   * Barrel distortion. 0 is a flat panel. Above ~0.13 the corners start pushing
   * the HUD, which sits 24px from the edge, out under the bezel.
   */
  curvature: number;
  /** Corner radius of the glass, in screen widths. */
  cornerRadius: number;
  /** Strength of the RGB aperture mask (0 = off, 1 = full stripe). */
  maskStrength: number;
  /** Scanline depth. */
  scanlineDepth: number;
  /** Reflected-light sheen on the glass. */
  glareStrength: number;
  /** Radial chromatic split at the edges. */
  aberration: number;
  /** Vignette falloff. */
  vignette: number;
}

export interface GameConfig {
  rating: RatingConfig;
  waves: WaveConfig;
  meteors: MeteorConfig;
  combo: ComboConfig;
  drops: DropConfig;
  expression: ExpressionConfig;
  flight: FlightConfig;
  /** Rock silhouettes, shared by every mode that fields asteroids. */
  asteroid: AsteroidOptions & { minSpinDeg: number; maxSpinDeg: number };
  factor: FactorConfig;
  collapse: CollapseConfig;
  boss: BossConfig;
  hazard: HazardConfig;
  score: ScoreConfig;
  economy: EconomyConfig;
  juice: JuiceConfig;
  crt: CrtConfig;
}

export const CONFIG: GameConfig = {
  rating: {
    initialRating: 500,
    minRating: 0,
    maxRating: 3000,
    kFactor: 24,
    provisionalKMultiplier: 2.5,
    provisionalAttempts: 8,
    logisticScale: 400,
    minSpeedFactor: 0.4,
    maxSpeedFactor: 1.6,
    latencyBands: [
      { maxDifficulty: 400, targetMs: 2500 },
      { maxDifficulty: 700, targetMs: 4000 },
      { maxDifficulty: 1000, targetMs: 6000 },
      { maxDifficulty: 1400, targetMs: 9000 },
    ],
    fallbackTargetMs: 12000,
    masteryMargin: 250,
    masteryMinAttempts: 10,
  },
  waves: {
    fluentShare: 0.7,
    frontierShare: 0.2,
    reviewShare: 0.1,
    baseProblemsPerWave: 8,
    problemsPerWaveGrowth: 1,
    maxProblemsPerWave: 16,
    fluentMargin: 150,
    frontierWindow: 100,
    decayedAfterWaves: 6,
    placementWaves: 3,
    placementProblems: 8,
    coachedSkillWeight: 3,
  },
  meteors: {
    baseFallSeconds: 10,
    fallSpeedupPerWave: 0.94,
    minFallSeconds: 5,
    difficultySlowdownMs: 8,
    baseSpawnGapSeconds: 2.2,
    minSpawnGapSeconds: 0.9,
    spawnGapShrinkPerWave: 0.93,
    baseHp: 5,
    breatherSeconds: 3.5,
    maxConcurrentMeteors: 5,
    hotPerWave: 2,
    hotScoreMultiplier: 3,
    hotComboGain: 2,
    hotHighFraction: 0.55,
  },
  drops: {
    carriersPerWave: 1,
    fallSpeed: 95,
    catchRadius: 62,
    freezeSeconds: 3,
    doubleSeconds: 8,
    doubleMultiplier: 2,
    chainKills: 3,
    shieldSeconds: 8,
    lowHpAt: 2,
    lowHpRepairWeight: 6,
    weights: { freeze: 3, nuke: 2, repair: 2, double: 3, chain: 3, shield: 3 },
    pools: {
      // Chain is meteor-only: "one answer kills everything sharing it" needs
      // meteors that share an answer.
      meteor: ['freeze', 'nuke', 'repair', 'double', 'chain', 'shield'],
      expression: ['freeze', 'nuke', 'repair', 'double', 'shield'],
      factor: ['freeze', 'nuke', 'repair', 'double', 'shield'],
      collapse: ['freeze', 'nuke', 'repair', 'double', 'shield'],
      // Nothing falls in a boss fight, so freeze has nothing to halt; the nuke
      // becomes a chunk taken out of the boss instead of a cleared board.
      boss: ['nuke', 'repair', 'double', 'shield'],
    },
  },
  combo: {
    baseWindowSeconds: 4.5,
    windowShrinkPerTier: 0.5,
    minWindowSeconds: 2,
    tierThresholds: [4, 8, 12, 16],
    tierMultipliers: [1, 1.5, 2, 3, 4],
    wrongDigitPenaltySeconds: 0.5,
    damageKeepFraction: 0.5,
    overdriveAt: 20,
    overdriveSeconds: 5,
    fallSpeedPerTier: 0.08,
    spawnGapPerTier: 0.92,
    concurrentPerTier: 0.5,
    maxPaceTier: 4,
  },
  expression: {
    baseTargetsPerWave: 5,
    targetsPerWaveGrowth: 1,
    maxTargetsPerWave: 9,
    handSize: 6,
    targetsOnScreen: 2,
    maxChips: 4,
    chipMin: 2,
    chipMax: 12,
    bigChips: [15, 20, 25, 50],
    bigChipChance: 0.15,
    minTarget: 3,
    maxTarget: 999,
    baseFallSeconds: 18,
    fallSpeedupPerWave: 0.95,
    minFallSeconds: 9,
    extraSecondsPerChip: 5,
    parBonus: 150,
    varietyBonusPerOperator: 60,
    avoidedOpWeight: 2.5,
    threeChipRating: 550,
    fourChipRating: 850,
    misfireLockSeconds: 1.2,
    scrapPenaltySeconds: 1.5,
  },
  asteroid: {
    minVertices: 9,
    maxVertices: 14,
    jitter: 0.24,
    notchChance: 0.28,
    notchDepth: 0.3,
    minSpinDeg: 8,
    maxSpinDeg: 34,
  },
  flight: {
    rotationSpeedDeg: 240,
    thrustAccel: 496,
    reverseScale: 0.5,
    // Near-frictionless: the ship coasts and you fly by planning momentum.
    // Set to 0 for literal Continuum physics.
    drag: 0.08,
    maxSpeed: 430,
    shipRadius: 18,
  },
  factor: {
    pickupDrift: 18,
    pickupRadius: 22,
    pickupLifeSeconds: 14,
    baseRocks: 3,
    rocksPerWave: 1,
    maxRocks: 8,
    baseFactorParts: 2,
    maxFactorParts: 3,
    minRockValue: 12,
    maxRockValue: 240,
    slowestDrift: 22,
    fastestDrift: 95,
    minRadius: 26,
    maxRadius: 62,
    invulnSeconds: 1.4,
    collisionKnockback: 260,
    destroyBase: 120,
    splitBase: 60,
    scorePerValue: 1.5,
    primeMultiplier: 2.5,
    balancedMultiplier: 2,
    splitSpeed: 90,
    aimHysteresisDeg: 6,
  },
  collapse: {
    basePairs: 3,
    pairsPerWave: 1,
    maxPairs: 7,
    tier2Wave: 3,
    tier3Wave: 5,
    unreducedChance: 0.35,
    slowestDrift: 14,
    fastestDrift: 46,
    fractionRadius: 34,
    percentRadius: 38,
    fireCooldownSeconds: 0.22,
    projectileSpeed: 620,
    projectileRadius: 7,
    projectileLifeSeconds: 1.6,
    swapLockoutSeconds: 0.17,
    armedSeconds: 9,
    mismatchLockoutSeconds: 0.45,
    startingHp: 3,
    invulnSeconds: 1.4,
    collisionKnockback: 300,
    recoilImpulse: 42,
    nearMissRadius: 26,
    nearMissBonus: 25,
    chain: {
      baseWindowSeconds: 7,
      windowShrinkPerTier: 0.9,
      minWindowSeconds: 3.5,
      tierThresholds: [2, 4, 7, 11],
      tierMultipliers: [1, 1.5, 2, 3, 4],
    },
    matchBase: 150,
    tierBonus: 75,
    unreducedBonus: 50,
  },
  boss: {
    baseHp: 250,
    hpGrowthPerBoss: 1.45,
    handSize: 5,
    attackIntervalSeconds: 10,
    minAttackIntervalSeconds: 5,
    attackIntervalShrinkPerBoss: 0.92,
    attackTravelSeconds: 9,
    minAttackTravelSeconds: 5,
    attackTravelShrinkPerBoss: 0.95,
    scorePerDamage: 3,
    defeatBonus: 1500,
    nukeFraction: 0.18,
    attacksPerCarrier: 4,
    blockScore: 150,
  },
  hazard: {
    firstArmedWave: 2,
    baseFireChancePerSecond: 0.16,
    fireChanceGrowthPerWave: 1.12,
    maxFireChancePerSecond: 0.8,
    fireCooldownSeconds: 2.4,
    armingFallPixels: 120,
    bulletSpeed: 250,
    bulletSpeedGrowthPerWave: 1.03,
    maxBulletSpeed: 460,
    bulletHitRadius: 30,
    playerSpeed: 520,
    playerEdgeMargin: 44,
    invulnSeconds: 1.2,
  },
  score: {
    killBase: 100,
    difficultyBonus: 0.25,
    streakStep: 0.1,
    maxStreakMultiplier: 3,
    speedBonusMultiplier: 1.5,
  },
  economy: {
    creditsPerScore: 0.01,
    creditsPerWave: 15,
  },
  juice: {
    killShakeMs: 160,
    killShakeIntensity: 0.011,
    spreadShakePerTarget: 0.005,
    landShakeMs: 420,
    landShakeIntensity: 0.028,
    bossHitShakeMs: 200,
    bossHitShakeIntensity: 0.014,
    bossDownShakeMs: 700,
    bossDownShakeIntensity: 0.035,
    gameOverShakeMs: 900,
    gameOverShakeIntensity: 0.03,
    hitStopMs: 55,
    hitStopScale: 0.12,
    heavyHitStopMs: 110,
    glowPulseKill: 0.5,
    glowPulseHeavy: 1.1,
    glowPulseDecayPerSecond: 4.5,
    killParticles: 34,
    fastKillParticles: 52,
    landParticles: 46,
    shockwaveRadius: 130,
    shockwaveMs: 320,
    streakPitchStep: 0.035,
    maxStreakPitch: 1.7,
  },
  crt: {
    glowBase: 0.22,
    bloomThreshold: 0.26,
    curvature: 0.12,
    cornerRadius: 0.05,
    maskStrength: 0.6,
    scanlineDepth: 0.26,
    glareStrength: 1.5,
    aberration: 0.0032,
    vignette: 0.85,
  },
};
