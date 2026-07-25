import { describe, expect, it } from 'vitest';
import {
  comboBreak,
  comboDamaged,
  comboFraction,
  comboHit,
  comboMultiplier,
  comboTier,
  comboWindowSeconds,
  comboWrongDigit,
  createCombo,
  overdriveActive,
  paceExtraConcurrent,
  paceFallMultiplier,
  paceSpawnGapMultiplier,
  tickCombo,
  type ComboState,
} from '../src/core/combo';
import { CONFIG } from '../src/core/config';

const cfg = CONFIG.combo;

/** Land `n` hits from a fresh combo. */
function build(n: number): ComboState {
  let state = createCombo();
  for (let i = 0; i < n; i++) state = comboHit(state, cfg);
  return state;
}

describe('combo tiers', () => {
  it('starts at tier 0 with no multiplier', () => {
    const state = createCombo();
    expect(comboTier(state, cfg)).toBe(0);
    expect(comboMultiplier(state, cfg)).toBe(1);
  });

  it('crosses a tier at each threshold', () => {
    cfg.tierThresholds.forEach((threshold, i) => {
      expect(comboTier(build(threshold - 1), cfg)).toBe(i);
      expect(comboTier(build(threshold), cfg)).toBe(i + 1);
    });
  });

  it('multiplier rises with the tier and stops at the top', () => {
    const top = cfg.tierMultipliers.length - 1;
    expect(comboMultiplier(build(cfg.tierThresholds[0]!), cfg)).toBeGreaterThan(1);
    expect(comboMultiplier(build(1000), cfg)).toBe(cfg.tierMultipliers[top]);
  });

  it('shrinks the window as the tier climbs, never below the floor', () => {
    expect(comboWindowSeconds(1, cfg)).toBeLessThan(comboWindowSeconds(0, cfg));
    expect(comboWindowSeconds(99, cfg)).toBe(cfg.minWindowSeconds);
  });
});

describe('combo clock', () => {
  it('refills the window on every hit', () => {
    const state = tickCombo(build(1), 1, cfg);
    expect(state.timeLeft).toBeLessThan(comboWindowSeconds(0, cfg));
    expect(comboHit(state, cfg).timeLeft).toBe(comboWindowSeconds(0, cfg));
  });

  it('breaks when the window empties', () => {
    const state = tickCombo(build(3), comboWindowSeconds(0, cfg) + 0.01, cfg);
    expect(state.count).toBe(0);
    expect(state.timeLeft).toBe(0);
  });

  it('is inert once broken', () => {
    const broken = comboBreak(build(5));
    expect(tickCombo(broken, 10, cfg)).toBe(broken);
  });

  it('remembers the best count across breaks', () => {
    const state = comboBreak(build(7));
    expect(state.best).toBe(7);
    expect(comboHit(state, cfg).best).toBe(7);
  });

  it('reports the drain fraction for the HUD', () => {
    expect(comboFraction(createCombo(), cfg)).toBe(0);
    expect(comboFraction(build(1), cfg)).toBe(1);
    const half = tickCombo(build(1), comboWindowSeconds(0, cfg) / 2, cfg);
    expect(comboFraction(half, cfg)).toBeCloseTo(0.5, 5);
  });
});

describe('penalties', () => {
  it('wrong digits cost clock, not combo', () => {
    const before = build(5);
    const after = comboWrongDigit(before, cfg);
    expect(after.count).toBe(before.count);
    expect(after.timeLeft).toBeCloseTo(before.timeLeft - cfg.wrongDigitPenaltySeconds, 5);
  });

  it('a wrong digit can still run the clock out', () => {
    let state = build(5);
    state = tickCombo(state, comboWindowSeconds(1, cfg) - 0.1, cfg);
    expect(comboWrongDigit(state, cfg).count).toBe(0);
  });

  it('ignores wrong digits with no combo running', () => {
    const state = createCombo();
    expect(comboWrongDigit(state, cfg)).toBe(state);
  });

  it('damage halves the combo instead of clearing it', () => {
    expect(comboDamaged(build(10), cfg).count).toBe(5);
    expect(comboDamaged(build(1), cfg).count).toBe(0);
  });
});

describe('overdrive', () => {
  it('fires on reaching the threshold', () => {
    expect(overdriveActive(build(cfg.overdriveAt - 1))).toBe(false);
    expect(overdriveActive(build(cfg.overdriveAt))).toBe(true);
  });

  it('pins the multiplier to the top tier while it runs', () => {
    const top = cfg.tierMultipliers[cfg.tierMultipliers.length - 1];
    expect(comboMultiplier(build(cfg.overdriveAt), cfg)).toBe(top);
  });

  it('expires on the clock and re-arms for the next multiple', () => {
    let state = build(cfg.overdriveAt);
    state = tickCombo(state, cfg.overdriveSeconds + 0.01, cfg);
    expect(overdriveActive(state)).toBe(false);
    // Not every subsequent hit re-triggers it...
    expect(overdriveActive(comboHit(state, cfg))).toBe(false);
    // ...only the next multiple does.
    let next = state;
    while (next.count < cfg.overdriveAt * 2) next = comboHit(next, cfg);
    expect(overdriveActive(next)).toBe(true);
  });

  it('is cleared by a break', () => {
    expect(overdriveActive(comboBreak(build(cfg.overdriveAt)))).toBe(false);
  });

  it('a bonus gain that jumps the threshold still triggers it', () => {
    const state = comboHit(build(cfg.overdriveAt - 1), cfg, 3);
    expect(state.count).toBe(cfg.overdriveAt + 2);
    expect(overdriveActive(state)).toBe(true);
  });
});

describe('pace coupling', () => {
  it('speeds descent and spawning as the tier climbs', () => {
    const calm = createCombo();
    const hot = build(cfg.tierThresholds[1]!);
    expect(paceFallMultiplier(hot, cfg)).toBeGreaterThan(paceFallMultiplier(calm, cfg));
    expect(paceSpawnGapMultiplier(hot, cfg)).toBeLessThan(paceSpawnGapMultiplier(calm, cfg));
  });

  it('caps the pace even when the multiplier keeps climbing', () => {
    const capped = paceFallMultiplier(build(1000), cfg);
    expect(capped).toBe(1 + cfg.fallSpeedPerTier * cfg.maxPaceTier);
  });

  it('widens the board a step at a time', () => {
    expect(paceExtraConcurrent(createCombo(), cfg)).toBe(0);
    expect(paceExtraConcurrent(build(1000), cfg)).toBe(
      Math.floor(cfg.maxPaceTier * cfg.concurrentPerTier),
    );
  });
});
