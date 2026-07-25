/**
 * Meteor gunfire rules: when a falling meteor takes a shot at the player, how
 * fast that shot travels, and how the threat ramps across a run. Pure and
 * seedable — the scene supplies only the clock.
 */
import type { GameConfig } from '../config';
import type { Rng } from '../rng';

/** Meteors hold fire through placement and the opening wave of every run. */
export function meteorsArmed(wave: number, inPlacement: boolean, cfg: GameConfig): boolean {
  return !inPlacement && wave >= cfg.hazard.firstArmedWave;
}

/** Per-second odds that one live meteor opens fire, ramping wave over wave. */
export function fireChancePerSecond(wave: number, cfg: GameConfig): number {
  const h = cfg.hazard;
  const ramp = Math.max(0, wave - h.firstArmedWave);
  return Math.min(
    h.maxFireChancePerSecond,
    h.baseFireChancePerSecond * Math.pow(h.fireChanceGrowthPerWave, ramp),
  );
}

/** Shot travel speed in px/sec for a wave. */
export function bulletSpeed(wave: number, cfg: GameConfig): number {
  const h = cfg.hazard;
  const ramp = Math.max(0, wave - h.firstArmedWave);
  return Math.min(h.maxBulletSpeed, h.bulletSpeed * Math.pow(h.bulletSpeedGrowthPerWave, ramp));
}

/**
 * Roll a per-second chance across one frame of `dtSeconds`. Going through the
 * survival probability rather than a flat `p * dt` keeps the shot rate the same
 * at 30fps and at 144fps.
 *
 * `chancePerSecond` is the odds of *at least one* shot over a second of rolling;
 * the expected shot count over that second is the slightly higher
 * `-ln(1 - chancePerSecond)`. The per-meteor cooldown is what actually bounds
 * the rate in play, so the distinction only matters to the tests.
 */
export function rollFire(rng: Rng, chancePerSecond: number, dtSeconds: number): boolean {
  if (chancePerSecond <= 0 || dtSeconds <= 0) return false;
  const perSecond = Math.min(1, chancePerSecond);
  return rng.chance(1 - Math.pow(1 - perSecond, dtSeconds));
}
