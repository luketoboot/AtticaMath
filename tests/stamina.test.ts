import { describe, expect, it } from 'vitest';
import { CONFIG, type StaminaConfig } from '../src/core/config';
import {
  canType,
  createStamina,
  recoveryFraction,
  spendStamina,
  staminaFraction,
  tickStamina,
  type StaminaState,
} from '../src/core/stamina';

const cfg: StaminaConfig = CONFIG.stamina;

/** Run the clock forward in small steps, the way a frame loop would. */
const run = (state: StaminaState, seconds: number, c = cfg): StaminaState => {
  let s = state;
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) s = tickStamina(s, step, c);
  return s;
};

describe('a full tank', () => {
  it('starts full and typeable', () => {
    const s = createStamina(cfg);
    expect(s.current).toBe(cfg.max);
    expect(canType(s)).toBe(true);
    expect(staminaFraction(s, cfg)).toBe(1);
  });

  it('does not overfill', () => {
    expect(run(createStamina(cfg), 5).current).toBe(cfg.max);
  });
});

describe('mistakes', () => {
  it('cost a fixed bite', () => {
    const s = spendStamina(createStamina(cfg), cfg);
    expect(s.current).toBe(cfg.max - cfg.costPerMistake);
    expect(canType(s)).toBe(true);
  });

  it('empty the tank after the budgeted number of them', () => {
    let s = createStamina(cfg);
    const budget = Math.ceil(cfg.max / cfg.costPerMistake);
    for (let i = 0; i < budget - 1; i++) s = spendStamina(s, cfg);
    expect(canType(s), 'still typeable one mistake before empty').toBe(true);
    s = spendStamina(s, cfg);
    expect(s.current).toBe(0);
    expect(canType(s)).toBe(false);
  });

  it('never go below empty however many land', () => {
    let s = createStamina(cfg);
    for (let i = 0; i < 50; i++) s = spendStamina(s, cfg);
    expect(s.current).toBe(0);
  });
});

describe('regeneration', () => {
  it('waits out the delay before refilling', () => {
    const spent = spendStamina(createStamina(cfg), cfg);
    // Mid-delay: nothing has come back yet.
    const early = run(spent, cfg.regenDelaySeconds * 0.5);
    expect(early.current).toBe(spent.current);
    const later = run(spent, cfg.regenDelaySeconds + 1);
    expect(later.current).toBeGreaterThan(spent.current);
  });

  it('pushes recovery back on every fresh mistake', () => {
    // Two mistakes a moment apart leave less in the tank than two spread out,
    // which is what makes spraying digits dig a hole.
    let burst = spendStamina(createStamina(cfg), cfg);
    burst = spendStamina(run(burst, 0.1), cfg);
    burst = run(burst, 2);

    let spaced = spendStamina(createStamina(cfg), cfg);
    spaced = run(spaced, 2);
    spaced = spendStamina(spaced, cfg);
    spaced = run(spaced, 2);

    expect(spaced.current).toBeGreaterThan(burst.current);
  });

  it('refills a whole tank in the advertised time', () => {
    let s = createStamina(cfg);
    for (let i = 0; i < 10; i++) s = spendStamina(s, cfg);
    const seconds = cfg.max / cfg.regenPerSecond + cfg.regenDelaySeconds;
    expect(run(s, seconds + 0.5).current).toBe(cfg.max);
  });
});

describe('lockout', () => {
  it('holds past zero until the recovery line', () => {
    let s = createStamina(cfg);
    for (let i = 0; i < 10; i++) s = spendStamina(s, cfg);
    expect(canType(s)).toBe(false);

    // A trickle back is not enough — this is the tap-one-digit-per-frame hole.
    s = run(s, cfg.regenDelaySeconds + 0.1);
    expect(s.current).toBeGreaterThan(0);
    expect(s.current).toBeLessThan(cfg.recoverAt);
    expect(canType(s)).toBe(false);

    s = run(s, cfg.recoverAt / cfg.regenPerSecond + 0.2);
    expect(s.current).toBeGreaterThanOrEqual(cfg.recoverAt);
    expect(canType(s)).toBe(true);
  });

  it('reports progress out of the hole while locked', () => {
    let s = createStamina(cfg);
    for (let i = 0; i < 10; i++) s = spendStamina(s, cfg);
    expect(recoveryFraction(s, cfg)).toBe(0);
    s = run(s, cfg.regenDelaySeconds + cfg.recoverAt / cfg.regenPerSecond / 2);
    expect(recoveryFraction(s, cfg)).toBeGreaterThan(0.3);
    expect(recoveryFraction(s, cfg)).toBeLessThan(1);
  });

  it('reads as full recovery when not locked at all', () => {
    expect(recoveryFraction(createStamina(cfg), cfg)).toBe(1);
  });

  it('re-locks when a mistake empties an already-recovering tank', () => {
    let s = createStamina(cfg);
    for (let i = 0; i < 10; i++) s = spendStamina(s, cfg);
    s = run(s, 20);
    expect(canType(s)).toBe(true);
    for (let i = 0; i < 10; i++) s = spendStamina(s, cfg);
    expect(canType(s)).toBe(false);
  });
});

describe('frame-rate independence', () => {
  it('regenerates the same amount however the time is sliced', () => {
    const spent = spendStamina(createStamina(cfg), cfg);
    let coarse = spent;
    for (let i = 0; i < 6; i++) coarse = tickStamina(coarse, 0.5, cfg);
    const fine = run(spent, 3);
    expect(fine.current).toBeCloseTo(coarse.current, 6);
  });
});

describe('the tuning holds its promises', () => {
  it('lets an honest wave pass without the meter mattering', () => {
    // Two mistakes across a wave, well spaced: barely a dent by the end.
    let s = createStamina(cfg);
    s = run(spendStamina(s, cfg), 6);
    s = run(spendStamina(s, cfg), 6);
    expect(s.current).toBe(cfg.max);
    expect(canType(s)).toBe(true);
  });

  it('shuts a masher down inside a couple of seconds', () => {
    let s = createStamina(cfg);
    let elapsed = 0;
    // A digit every 100ms that goes nowhere.
    while (canType(s) && elapsed < 10) {
      s = spendStamina(s, cfg);
      s = run(s, 0.1);
      elapsed += 0.1;
    }
    expect(canType(s)).toBe(false);
    expect(elapsed).toBeLessThan(2);
  });
});
