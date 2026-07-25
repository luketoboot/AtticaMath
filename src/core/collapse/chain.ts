/**
 * Collapse chain meter.
 *
 * Consecutive collapses inside a shrinking window climb a tier ladder. Tiers
 * rather than a smooth curve, so every crossing is an event the audio and
 * visuals can land on — a number that slowly creeps up is not something a
 * player can feel.
 *
 * Pure and time-injected: the scene passes its own clock in, so this is
 * deterministic under test.
 */

export interface ChainConfig {
  /** Window at tier 0, and how much each tier shortens it. */
  baseWindowSeconds: number;
  windowShrinkPerTier: number;
  minWindowSeconds: number;
  /** Chain counts at which each tier begins; index 0 is implicitly 0. */
  tierThresholds: readonly number[];
  /** Score multiplier per tier. Must be one longer than tierThresholds. */
  tierMultipliers: readonly number[];
}

export interface ChainState {
  /** Consecutive collapses without letting the window lapse. */
  count: number;
  /** Timestamp (ms) at which the chain lapses. */
  expiresAtMs: number;
}

export function newChain(): ChainState {
  return { count: 0, expiresAtMs: 0 };
}

export function tierOf(count: number, cfg: ChainConfig): number {
  let tier = 0;
  for (const threshold of cfg.tierThresholds) {
    if (count >= threshold) tier += 1;
    else break;
  }
  return tier;
}

export function multiplierOf(count: number, cfg: ChainConfig): number {
  const tier = tierOf(count, cfg);
  return cfg.tierMultipliers[Math.min(tier, cfg.tierMultipliers.length - 1)] ?? 1;
}

export function windowFor(tier: number, cfg: ChainConfig): number {
  return Math.max(cfg.minWindowSeconds, cfg.baseWindowSeconds - tier * cfg.windowShrinkPerTier);
}

/** True once the window has lapsed. A chain of 0 is never "live". */
export function isLive(state: ChainState, nowMs: number): boolean {
  return state.count > 0 && nowMs < state.expiresAtMs;
}

/** Fraction of the current window still on the clock, 0..1. */
export function remainingFraction(state: ChainState, nowMs: number, cfg: ChainConfig): number {
  if (!isLive(state, nowMs)) return 0;
  const tier = tierOf(state.count, cfg);
  const windowMs = windowFor(tier, cfg) * 1000;
  return Math.max(0, Math.min(1, (state.expiresAtMs - nowMs) / windowMs));
}

export interface ChainAdvance {
  state: ChainState;
  /** Tier after this collapse. */
  tier: number;
  /** True when this collapse crossed into a higher tier. */
  tierUp: boolean;
  multiplier: number;
}

/** Register a collapse. A lapsed chain restarts at 1 rather than continuing. */
export function advance(state: ChainState, nowMs: number, cfg: ChainConfig): ChainAdvance {
  const before = isLive(state, nowMs) ? tierOf(state.count, cfg) : 0;
  const count = (isLive(state, nowMs) ? state.count : 0) + 1;
  const tier = tierOf(count, cfg);
  return {
    state: { count, expiresAtMs: nowMs + windowFor(tier, cfg) * 1000 },
    tier,
    tierUp: tier > before,
    multiplier: multiplierOf(count, cfg),
  };
}

/** Drop the chain outright — taking damage, or a misread. */
export function breakChain(): ChainState {
  return newChain();
}
