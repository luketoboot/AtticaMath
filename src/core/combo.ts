/**
 * The combo meter: the scoring spine every mode hangs off.
 *
 * A plain streak that only breaks on a miss is invisible — nothing is at stake
 * between one kill and the next. This meter puts a clock on the streak, so the
 * pressure comes from the player's own pace rather than from the wave timer,
 * and it tiers the multiplier so that climbing produces *events* worth
 * celebrating instead of a smooth curve nobody notices.
 *
 * Pure and immutable: every function returns fresh state, nothing here reads a
 * clock. The scene ticks it with its own delta.
 */
import type { ComboConfig } from './config';

export interface ComboState {
  /** Consecutive successes. */
  count: number;
  /** Seconds left before the combo cools off; 0 when there is no combo. */
  timeLeft: number;
  /** Highest count reached this run — survives breaks, for end-of-run stats. */
  best: number;
  /** Seconds of overdrive remaining; 0 when not in overdrive. */
  overdriveLeft: number;
}

export function createCombo(): ComboState {
  return { count: 0, timeLeft: 0, best: 0, overdriveLeft: 0 };
}

/** Tier for a raw count, ignoring overdrive. */
function tierForCount(count: number, cfg: ComboConfig): number {
  let tier = 0;
  for (const threshold of cfg.tierThresholds) {
    if (count >= threshold) tier += 1;
  }
  return Math.min(tier, cfg.tierMultipliers.length - 1);
}

/** How long a combo at this tier may idle. Higher tiers demand more tempo. */
export function comboWindowSeconds(tier: number, cfg: ComboConfig): number {
  return Math.max(cfg.minWindowSeconds, cfg.baseWindowSeconds - cfg.windowShrinkPerTier * tier);
}

/** Current tier. Overdrive pins it to the top so the whole window pays out at max. */
export function comboTier(state: ComboState, cfg: ComboConfig): number {
  if (state.overdriveLeft > 0) return cfg.tierMultipliers.length - 1;
  return tierForCount(state.count, cfg);
}

export function comboMultiplier(state: ComboState, cfg: ComboConfig): number {
  return cfg.tierMultipliers[comboTier(state, cfg)] ?? 1;
}

/** 0..1 for the HUD drain bar. */
export function comboFraction(state: ComboState, cfg: ComboConfig): number {
  if (state.count === 0) return 0;
  const window = comboWindowSeconds(comboTier(state, cfg), cfg);
  return Math.max(0, Math.min(1, state.timeLeft / window));
}

export function overdriveActive(state: ComboState): boolean {
  return state.overdriveLeft > 0;
}

/** Bleed the clock. Returns a broken combo once the window empties. */
export function tickCombo(state: ComboState, dtSeconds: number, _cfg: ComboConfig): ComboState {
  if (state.count === 0 && state.overdriveLeft <= 0) return state;
  const overdriveLeft = Math.max(0, state.overdriveLeft - dtSeconds);
  const timeLeft = state.timeLeft - dtSeconds;
  // The overdrive clock keeps running while frozen: the reward window is not a
  // rest, you still have to feed the combo to hold it.
  if (timeLeft <= 0) return { count: 0, timeLeft: 0, best: state.best, overdriveLeft: 0 };
  return { count: state.count, timeLeft, best: state.best, overdriveLeft };
}

/**
 * A correct answer. `gain` is above 1 for bonus targets.
 *
 * Overdrive fires on every crossing of a multiple of `overdriveAt`, so a long
 * run keeps being rewarded rather than paying out once and going quiet.
 */
export function comboHit(state: ComboState, cfg: ComboConfig, gain = 1): ComboState {
  const count = state.count + Math.max(1, Math.floor(gain));
  const crossed =
    cfg.overdriveAt > 0 &&
    Math.floor(count / cfg.overdriveAt) > Math.floor(state.count / cfg.overdriveAt);
  return {
    count,
    timeLeft: comboWindowSeconds(tierForCount(count, cfg), cfg),
    best: Math.max(state.best, count),
    overdriveLeft: crossed ? cfg.overdriveSeconds : state.overdriveLeft,
  };
}

/** Hard reset — a landed meteor, or a wave cleared imperfectly. */
export function comboBreak(state: ComboState): ComboState {
  return { count: 0, timeLeft: 0, best: state.best, overdriveLeft: 0 };
}

/**
 * A wrong digit. It costs clock, never the combo itself — mistakes cost time,
 * never progress. Running the clock out this way still breaks it, which is the
 * player's own doing.
 */
export function comboWrongDigit(state: ComboState, cfg: ComboConfig): ComboState {
  if (state.count === 0) return state;
  const timeLeft = state.timeLeft - cfg.wrongDigitPenaltySeconds;
  if (timeLeft <= 0) return comboBreak(state);
  return { ...state, timeLeft };
}

/**
 * Took a hit from something that isn't a math failure (meteor gunfire). Halves
 * the combo rather than clearing it: dodging is a separate skill and should not
 * erase a math run outright.
 */
export function comboDamaged(state: ComboState, cfg: ComboConfig): ComboState {
  if (state.count === 0) return state;
  const count = Math.floor(state.count * cfg.damageKeepFraction);
  if (count <= 0) return comboBreak(state);
  // Clamp the clock to the lower tier's window so the demotion is felt.
  const timeLeft = Math.min(state.timeLeft, comboWindowSeconds(tierForCount(count, cfg), cfg));
  return { count, timeLeft, best: state.best, overdriveLeft: state.overdriveLeft };
}

// --- pace coupling ---
//
// Playing well makes the game faster, which makes it worth more. The corollary
// matters just as much: a player who is struggling is handed a slower game
// without ever being told that is what happened.

/** Tier used for pacing, capped below the scoring tier so speed stays readable. */
export function paceTier(state: ComboState, cfg: ComboConfig): number {
  return Math.min(comboTier(state, cfg), cfg.maxPaceTier);
}

/** Multiplier on descent speed. */
export function paceFallMultiplier(state: ComboState, cfg: ComboConfig): number {
  return 1 + cfg.fallSpeedPerTier * paceTier(state, cfg);
}

/** Multiplier on the gap between spawns (below 1 — the board fills faster). */
export function paceSpawnGapMultiplier(state: ComboState, cfg: ComboConfig): number {
  return Math.pow(cfg.spawnGapPerTier, paceTier(state, cfg));
}

/** Extra simultaneous targets allowed at this tier. */
export function paceExtraConcurrent(state: ComboState, cfg: ComboConfig): number {
  return Math.floor(paceTier(state, cfg) * cfg.concurrentPerTier);
}
