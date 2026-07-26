/**
 * Stamina: what a wrong answer costs beyond time.
 *
 * The buffer fires the moment it matches a live answer, which makes mashing
 * digits a real strategy — spray enough of them at a field of meteors and some
 * will land, and the only price was combo clock. That is a strategy the game
 * should not reward, because it is the one strategy that involves no
 * arithmetic.
 *
 * So a dead-end buffer — digits no live answer even begins with, which is this
 * game's version of committing to a wrong answer — costs stamina. Stamina comes
 * back on its own, so a player who is thinking never notices it. Empty the
 * meter and the keys stop answering until it recovers: mashing locks you out of
 * exactly the thing you were mashing.
 *
 * Recovery has a lip on purpose. Unlocking the instant the meter leaves zero
 * would let a masher tap out one digit per frame forever; it stays locked until
 * there is enough in the tank for a real attempt.
 *
 * Pure and frame-rate independent — everything is per second.
 */
import type { StaminaConfig } from './config';

export interface StaminaState {
  /** Points in the tank, 0..max. */
  current: number;
  /** Locked out. Stays true until `current` reaches `recoverAt`. */
  exhausted: boolean;
  /** Seconds before regen resumes; a fresh mistake resets it. */
  cooldown: number;
}

export function createStamina(cfg: StaminaConfig): StaminaState {
  return { current: cfg.max, exhausted: false, cooldown: 0 };
}

/** Bleed the cooldown, then refill. */
export function tickStamina(state: StaminaState, dtSeconds: number, cfg: StaminaConfig): StaminaState {
  const cooldown = Math.max(0, state.cooldown - dtSeconds);
  // The delay is what makes a burst of mistakes compound: each one pushes
  // recovery back, so spraying digits digs a hole rather than idling in one.
  const current =
    cooldown > 0
      ? state.current
      : Math.min(cfg.max, state.current + cfg.regenPerSecond * dtSeconds);
  return {
    current,
    cooldown,
    exhausted: state.exhausted ? current < cfg.recoverAt : false,
  };
}

/** Charge one mistake. Empties into a lockout when the tank cannot cover it. */
export function spendStamina(state: StaminaState, cfg: StaminaConfig): StaminaState {
  const current = Math.max(0, state.current - cfg.costPerMistake);
  return {
    current,
    cooldown: cfg.regenDelaySeconds,
    // Already locked out stays locked out until the recovery line, however the
    // meter got here.
    exhausted: state.exhausted || current <= 0,
  };
}

/** Whether the buffer should accept a digit at all. */
export function canType(state: StaminaState): boolean {
  return !state.exhausted;
}

/** 0..1, for the bar. */
export function staminaFraction(state: StaminaState, cfg: StaminaConfig): number {
  return cfg.max <= 0 ? 0 : Math.min(1, Math.max(0, state.current / cfg.max));
}

/**
 * How close a locked-out player is to typing again, 0..1. Distinct from the
 * fill: the bar shows what is in the tank, this shows progress out of the hole,
 * and during a lockout that is the number the player is actually waiting on.
 */
export function recoveryFraction(state: StaminaState, cfg: StaminaConfig): number {
  if (!state.exhausted || cfg.recoverAt <= 0) return 1;
  return Math.min(1, Math.max(0, state.current / cfg.recoverAt));
}
