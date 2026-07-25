import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { bulletSpeed, fireChancePerSecond, meteorsArmed, rollFire } from '../src/core/hazard/gunfire';
import { createRng } from '../src/core/rng';
import { RunSession } from '../src/core/session';

const H = CONFIG.hazard;

describe('arming', () => {
  it('holds fire through placement no matter the wave', () => {
    expect(meteorsArmed(9, true, CONFIG)).toBe(false);
  });

  it('holds fire until firstArmedWave, then arms', () => {
    expect(meteorsArmed(H.firstArmedWave - 1, false, CONFIG)).toBe(false);
    expect(meteorsArmed(H.firstArmedWave, false, CONFIG)).toBe(true);
  });
});

describe('threat ramp', () => {
  it('fire chance climbs wave over wave and caps', () => {
    const early = fireChancePerSecond(H.firstArmedWave, CONFIG);
    const later = fireChancePerSecond(H.firstArmedWave + 5, CONFIG);
    expect(early).toBeCloseTo(H.baseFireChancePerSecond);
    expect(later).toBeGreaterThan(early);
    expect(fireChancePerSecond(500, CONFIG)).toBe(H.maxFireChancePerSecond);
  });

  it('bullet speed climbs and caps', () => {
    expect(bulletSpeed(H.firstArmedWave, CONFIG)).toBeCloseTo(H.bulletSpeed);
    expect(bulletSpeed(H.firstArmedWave + 5, CONFIG)).toBeGreaterThan(H.bulletSpeed);
    expect(bulletSpeed(500, CONFIG)).toBe(H.maxBulletSpeed);
  });

  it('never ramps below the base for pre-armed waves', () => {
    expect(fireChancePerSecond(0, CONFIG)).toBeCloseTo(H.baseFireChancePerSecond);
    expect(bulletSpeed(0, CONFIG)).toBeCloseTo(H.bulletSpeed);
  });
});

describe('rollFire', () => {
  it('is a no-op for zero chance or zero elapsed time', () => {
    const rng = createRng(1);
    expect(rollFire(rng, 0, 1)).toBe(false);
    expect(rollFire(rng, 0.5, 0)).toBe(false);
  });

  /** Shots per simulated second at a given frame budget. */
  function rate(dt: number, seed: number): number {
    const rng = createRng(seed);
    const seconds = 4000;
    let shots = 0;
    for (let i = 0; i < seconds / dt; i++) {
      if (rollFire(rng, 0.3, dt)) shots++;
    }
    return shots / seconds;
  }

  it('fires at the same rate regardless of frame rate', () => {
    const at60 = rate(1 / 60, 7);
    const at15 = rate(1 / 15, 7);
    // A flat p*dt roll would drift with dt; the survival form holds the rate at
    // the -ln(1 - p) hazard rate for any frame budget.
    const expected = -Math.log(1 - 0.3);
    expect(at60).toBeCloseTo(expected, 1);
    expect(at15).toBeCloseTo(expected, 1);
    expect(Math.abs(at60 - at15)).toBeLessThan(0.03);
  });
});

describe('session gunfire integration', () => {
  function armedSession(): RunSession {
    const s = new RunSession({
      seed: 42,
      skills: {},
      totalWavesBefore: 0,
      placementDone: true,
      ownedUpgrades: [],
      loadout: [],
    });
    for (let w = 0; w < H.firstArmedWave; w++) s.nextWave();
    return s;
  }

  it('is unarmed during placement and armed once the run gets going', () => {
    const s = new RunSession({
      seed: 42,
      skills: {},
      totalWavesBefore: 0,
      placementDone: false,
      ownedUpgrades: [],
      loadout: [],
    });
    s.nextWave();
    expect(s.meteorsArmed).toBe(false);
    expect(s.rollMeteorFire(10)).toBe(false);
    expect(armedSession().meteorsArmed).toBe(true);
  });

  it('a shot costs hp and half the combo, but leaves the shield alone', () => {
    const s = new RunSession({
      seed: 42,
      skills: {},
      totalWavesBefore: 0,
      placementDone: true,
      ownedUpgrades: ['upgrade.shield'],
      loadout: ['upgrade.shield'],
    });
    const plan = s.nextWave();
    for (let i = 0; i < 6; i++) s.recordHit(plan.problems[i]!, 1200);
    const hp = s.hp;
    const streak = s.streak;

    s.takeDamage();
    expect(s.hp).toBe(hp - 1); // the miss shield is for math, not for dodging
    // Halved, not cleared: dodging is a reflex test, not a math failure.
    expect(s.streak).toBe(Math.floor(streak * CONFIG.combo.damageKeepFraction));
    expect(s.streak).toBeGreaterThan(0);
    expect(s.shotsTaken).toBe(1);

    // ...and the shield is still there for the first meteor that lands.
    s.recordMiss(plan.problems[1]!, 12000);
    expect(s.hp).toBe(hp - 1);
  });

  it('shots can end the run', () => {
    const s = armedSession();
    for (let i = 0; i < CONFIG.meteors.baseHp; i++) s.takeDamage();
    expect(s.gameOver).toBe(true);
  });

  it('gunfire rolls do not disturb wave composition', () => {
    const a = armedSession();
    const b = armedSession();
    for (let i = 0; i < 300; i++) b.rollMeteorFire(1 / 60);
    expect(a.nextWave().problems.map((p) => p.prompt)).toEqual(
      b.nextWave().problems.map((p) => p.prompt),
    );
  });
});
