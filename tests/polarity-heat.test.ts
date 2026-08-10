import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { heatFor } from '../src/core/polarity/heat';
import { GUNS, POD_GUNS } from '../src/core/polarity/guns';

const cfg = CONFIG.polarity.heat;
const waves = Array.from({ length: 30 }, (_, i) => i + 1);

describe('the opening waves are gentle', () => {
  it('aims every shot until the player has met the colours', () => {
    // One bullet with an obvious origin is how you learn that colour decides
    // whether it hurts. A ring on wave one teaches nothing but panic.
    for (let w = 1; w < cfg.fanFromWave; w++) {
      expect(heatFor(w, cfg).fanChance, `wave ${w}`).toBe(0);
      expect(heatFor(w, cfg).ringBullets, `wave ${w}`).toBe(0);
    }
  });

  it('holds the rings back further still', () => {
    for (let w = 1; w < cfg.ringFromWave; w++) {
      expect(heatFor(w, cfg).ringBullets, `wave ${w}`).toBe(0);
    }
    expect(heatFor(cfg.ringFromWave, cfg).ringBullets).toBeGreaterThan(0);
  });

  it('fires slowly at first and settles to the authored rate', () => {
    expect(heatFor(1, cfg).fireStretch).toBeCloseTo(cfg.openingFireStretch, 6);
    expect(heatFor(1 + cfg.fireStretchWaves, cfg).fireStretch).toBeCloseTo(1, 6);
    // And never speeds past what the formations were authored for.
    for (const w of waves) expect(heatFor(w, cfg).fireStretch).toBeGreaterThanOrEqual(1);
  });

  it('starts with few wilds, since reading the colour cannot save you from one', () => {
    expect(heatFor(1, cfg).wildShare).toBeCloseTo(cfg.wildShareBase, 6);
    expect(heatFor(1, cfg).wildShare).toBeLessThan(0.12);
  });
});

describe('the ramp only ever goes one way', () => {
  const monotonic = (pick: (w: number) => number, dir: 'up' | 'down') => {
    for (let w = 2; w <= 40; w++) {
      const prev = pick(w - 1);
      const now = pick(w);
      if (dir === 'up') expect(now, `wave ${w}`).toBeGreaterThanOrEqual(prev);
      else expect(now, `wave ${w}`).toBeLessThanOrEqual(prev);
    }
  };

  it('never eases off', () => {
    monotonic((w) => heatFor(w, cfg).fanChance, 'up');
    monotonic((w) => heatFor(w, cfg).ringBullets, 'up');
    monotonic((w) => heatFor(w, cfg).wildShare, 'up');
    monotonic((w) => heatFor(w, cfg).bulletSpeed, 'up');
    monotonic((w) => heatFor(w, cfg).carrierSpeed, 'up');
    monotonic((w) => heatFor(w, cfg).fireStretch, 'down');
  });

  it('stops somewhere, so wave forty is playable rather than a wall', () => {
    const late = heatFor(40, cfg);
    expect(late.fanChance).toBeLessThanOrEqual(cfg.maxFanChance);
    expect(late.ringBullets).toBeLessThanOrEqual(cfg.maxRingBullets);
    expect(late.wildShare).toBeLessThanOrEqual(cfg.maxWildShare);
    expect(late.bulletSpeed).toBeLessThanOrEqual(cfg.maxBulletSpeed);
    expect(late.carrierSpeed).toBeLessThanOrEqual(cfg.maxCarrierSpeed);
  });

  it('is defined below wave one rather than going strange', () => {
    expect(heatFor(0, cfg)).toEqual(heatFor(1, cfg));
    expect(heatFor(-5, cfg)).toEqual(heatFor(1, cfg));
  });

  it('leaves the ship comfortably faster than anything it must dodge', () => {
    const late = heatFor(40, cfg);
    expect(CONFIG.polarity.shipSpeed).toBeGreaterThan(late.bulletSpeed * 2);
    expect(CONFIG.polarity.shipSpeed).toBeGreaterThan(late.carrierSpeed * 5);
  });
});

describe('the roster is priced against BOLT', () => {
  const dps = (kind: keyof typeof GUNS): number => {
    const g = GUNS[kind];
    // Single-target output per second, ignoring what a gun's shape buys it.
    return (g.damage * (g.homes ? g.bolts : 1)) / g.cooldown;
  };

  it('gives BOLT a real reason to exist', () => {
    // An accurate pod may not beat the free gun at plain output. It has to pay
    // for its advantage in coverage, reach or certainty instead.
    for (const kind of POD_GUNS) {
      if (GUNS[kind].jitterDegrees > 0) continue;
      expect(dps(kind), kind).toBeLessThanOrEqual(dps('bolt') + 1e-9);
    }
  });

  it('lets GATLING outgun it, and charges for that in aim and in seconds', () => {
    // The one exception, and the reasons it is allowed to be one.
    expect(dps('gatling')).toBeGreaterThan(dps('bolt'));
    expect(GUNS.gatling.jitterDegrees).toBeGreaterThan(4);
    const seconds = GUNS.gatling.ammo! * GUNS.gatling.cooldown;
    expect(seconds).toBeLessThan(10);
  });

  it('keeps every other gun honest about where its bolts go', () => {
    for (const kind of POD_GUNS) {
      if (kind === 'gatling') expect(GUNS[kind].jitterDegrees).toBeGreaterThan(0);
      else expect(GUNS[kind].jitterDegrees, kind).toBe(0);
    }
  });

  it('makes SEEKER pay for never missing', () => {
    expect(GUNS.seeker.cooldown).toBeGreaterThan(GUNS.bolt.cooldown * 2);
    expect(GUNS.seeker.speedScale).toBeLessThan(0.8);
    expect(dps('seeker')).toBeLessThanOrEqual(dps('bolt'));
  });

  it('makes SPREAD wide enough that its outer bolts go somewhere else', () => {
    // At fifteen degrees all three landed on one carrier at close range, which
    // made the crowd gun a single-target gun with triple damage.
    expect(GUNS.spread.spreadDegrees).toBeGreaterThanOrEqual(22);
    expect(GUNS.spread.bolts).toBeGreaterThan(1);
    // And slow enough that a point-blank triple is a reward, not the gun.
    expect(GUNS.spread.cooldown).toBeGreaterThan(GUNS.bolt.cooldown * 1.5);
  });

  it('makes LANCE worth lining a column up for', () => {
    expect(GUNS.lance.pierces).toBe(true);
    expect(GUNS.lance.damage).toBeGreaterThan(GUNS.bolt.damage);
    expect(GUNS.lance.cooldown).toBeGreaterThan(GUNS.bolt.cooldown * 2);
  });

  it('ships no screen-clear at all', () => {
    // One existed and it was the best gun in the game by a distance: a button
    // that deleted the wave's whole arithmetic. Every gun must be aimed.
    for (const g of Object.values(GUNS)) {
      expect(g.bolts, g.kind).toBeGreaterThan(0);
    }
  });

  it('gives every pod enough rounds to be felt', () => {
    for (const kind of POD_GUNS) {
      const g = GUNS[kind];
      expect(g.ammo! * g.cooldown, kind).toBeGreaterThan(3);
    }
  });
});
