/**
 * How hard a wave is allowed to be.
 *
 * Everything that makes POLARITY dangerous used to arrive at once: bridges
 * threw ten-bullet rings from the opening wave, fans came in at wave three on
 * top of them, and the fire rate never eased. A player met the mode's hardest
 * pattern before they had worked out what the two colours meant.
 *
 * So the pressure is a curve rather than a constant, and it is a curve you can
 * read. Every knob here is monotonic in the wave number and every one of them
 * starts somewhere gentle:
 *
 *   - **Rate.** Early waves stretch the gap between a carrier's shots by half
 *     again. It closes to the authored interval by the time the mode has been
 *     explained by playing it.
 *   - **Shape.** Aimed shots only for the first two waves — one bullet with an
 *     obvious origin, which is how you learn that colour decides whether it
 *     hurts. Fans arrive at three, rings at five, and the ring grows from six
 *     bullets to ten over the waves after that.
 *   - **Wilds.** The shots no polarity makes safe start scarce, because early
 *     on the lesson is "read the colour" and a wild is the one bullet where
 *     reading it does not help.
 *   - **Speed.** Both the carriers' descent and their fire ramp, so the same
 *     pattern gets harder to answer before it gets more complicated.
 *
 * Pure, so the whole ramp can be asserted rather than felt out one run at a
 * time.
 */

export interface HeatConfig {
  /** Fire intervals are stretched by this on wave 1, easing to 1. */
  openingFireStretch: number;
  /** Waves taken to reach the authored fire rate. */
  fireStretchWaves: number;
  /** First wave that fans, and first that rings. */
  fanFromWave: number;
  ringFromWave: number;
  /** Odds of a fan once fans are unlocked, and its ceiling. */
  fanChanceBase: number;
  fanChanceGrowth: number;
  maxFanChance: number;
  /** Ring size when rings unlock, how fast it grows, and its cap. */
  ringBulletsBase: number;
  ringBulletsPerWave: number;
  maxRingBullets: number;
  /** Wild share at the start, its growth, and its ceiling. */
  wildShareBase: number;
  wildShareGrowth: number;
  maxWildShare: number;
  /** Bullet speed on wave 1, what each wave adds, and the cap. */
  bulletSpeedBase: number;
  bulletSpeedPerWave: number;
  maxBulletSpeed: number;
  /** Carrier descent, likewise. */
  carrierSpeedBase: number;
  carrierSpeedPerWave: number;
  maxCarrierSpeed: number;
}

export interface WaveHeat {
  /** Multiplier on a carrier's authored fire interval. Above 1 is slower. */
  fireStretch: number;
  fanChance: number;
  /** Bullets in a ring, or 0 while rings are still locked. */
  ringBullets: number;
  wildShare: number;
  bulletSpeed: number;
  carrierSpeed: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The pressure for a given wave of a run. Wave 1 is the first. */
export function heatFor(wave: number, cfg: HeatConfig): WaveHeat {
  const w = Math.max(1, wave);
  // 0 on the opening wave, 1 once the stretch has fully closed.
  const settled = clamp((w - 1) / Math.max(1, cfg.fireStretchWaves), 0, 1);

  const fansOpen = w >= cfg.fanFromWave;
  const ringsOpen = w >= cfg.ringFromWave;

  return {
    fireStretch: cfg.openingFireStretch + (1 - cfg.openingFireStretch) * settled,
    fanChance: fansOpen
      ? clamp(cfg.fanChanceBase + (w - cfg.fanFromWave) * cfg.fanChanceGrowth, 0, cfg.maxFanChance)
      : 0,
    ringBullets: ringsOpen
      ? Math.round(
          clamp(
            cfg.ringBulletsBase + (w - cfg.ringFromWave) * cfg.ringBulletsPerWave,
            cfg.ringBulletsBase,
            cfg.maxRingBullets,
          ),
        )
      : 0,
    wildShare: clamp(cfg.wildShareBase + (w - 1) * cfg.wildShareGrowth, 0, cfg.maxWildShare),
    bulletSpeed: clamp(
      cfg.bulletSpeedBase + (w - 1) * cfg.bulletSpeedPerWave,
      cfg.bulletSpeedBase,
      cfg.maxBulletSpeed,
    ),
    carrierSpeed: clamp(
      cfg.carrierSpeedBase + (w - 1) * cfg.carrierSpeedPerWave,
      cfg.carrierSpeedBase,
      cfg.maxCarrierSpeed,
    ),
  };
}
