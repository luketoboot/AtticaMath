import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { legalPairs } from '../src/core/polarity/divisors';
import {
  FORMATIONS,
  classesOf,
  durationOf,
  formationById,
  hasSafePath,
  isChainable,
  maxLinks,
  type CarrierClass,
  type Slot,
} from '../src/core/polarity/formations';
import { isFillable } from '../src/core/polarity/motes';

const cfg = CONFIG.polarity;
const range = { lo: cfg.valueLo, hi: cfg.valueHi };

describe('maxLinks', () => {
  it('counts clean triples', () => {
    expect(maxLinks(['aOnly', 'aOnly', 'aOnly'], cfg.chain)).toBe(1);
    expect(maxLinks(Array<CarrierClass>(9).fill('aOnly'), cfg.chain)).toBe(3);
  });

  it('knows a carrier can be left alive', () => {
    // The b in the middle is simply not shot.
    expect(maxLinks(['aOnly', 'aOnly', 'bOnly', 'aOnly'], cfg.chain)).toBe(1);
  });

  it('finds nothing in a wave that alternates too tightly', () => {
    expect(maxLinks(['aOnly', 'bOnly', 'aOnly', 'bOnly'], cfg.chain)).toBe(0);
  });

  it('spends bridges on whichever run needs them', () => {
    expect(maxLinks(['aOnly', 'aOnly', 'bridge'], cfg.chain)).toBe(1);
    expect(maxLinks(['bridge', 'bridge', 'bridge'], cfg.chain)).toBe(1);
    // Two a's and two b's link nothing; add one bridge and one of them closes.
    expect(maxLinks(['aOnly', 'aOnly', 'bOnly', 'bOnly'], cfg.chain)).toBe(0);
    expect(maxLinks(['aOnly', 'aOnly', 'bridge', 'bOnly', 'bOnly'], cfg.chain)).toBe(1);
  });

  it('respects order, not just totals', () => {
    // The same six carriers: groupable, then not.
    const grouped: CarrierClass[] = ['aOnly', 'aOnly', 'aOnly', 'bOnly', 'bOnly', 'bOnly'];
    const split: CarrierClass[] = ['aOnly', 'bOnly', 'aOnly', 'bOnly', 'aOnly', 'bOnly'];
    expect(maxLinks(grouped, cfg.chain)).toBe(2);
    expect(maxLinks(split, cfg.chain)).toBe(1);
  });
});

describe('every authored wave', () => {
  it('is a real set of carriers in time order', () => {
    expect(FORMATIONS.length).toBeGreaterThan(0);
    for (const f of FORMATIONS) {
      expect(f.slots.length).toBeGreaterThan(0);
      const times = f.slots.map((s) => s.atSeconds);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      for (const s of f.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(1);
        expect(s.speed).toBeGreaterThan(0);
        expect(s.hp).toBeGreaterThanOrEqual(1);
        expect(s.fireEvery).toBeGreaterThan(0);
      }
    }
  });

  it('has a unique id and can be found by it', () => {
    const ids = FORMATIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(formationById(id).id).toBe(id);
    expect(() => formationById('nope')).toThrow();
  });

  it('yields enough links to be worth the name', () => {
    for (const f of FORMATIONS) {
      expect(isChainable(classesOf(f), cfg.chain, cfg.path), f.id).toBe(true);
    }
  });

  it('can be flown through without ramming anything', () => {
    // Carriers are solid to both polarities, so avoiding them is the one demand
    // a wave makes that no amount of reading can answer.
    for (const f of FORMATIONS) {
      expect(hasSafePath(f, cfg.path), f.id).toBe(true);
    }
  });

  it('can be filled by every pair the game deals, wilds included', () => {
    for (const f of FORMATIONS) {
      for (const [a, b] of legalPairs()) {
        expect(
          isFillable([...classesOf(f), 'neither'], a, b, range),
          `${f.id} on ${a}/${b}`,
        ).toBe(true);
      }
    }
  });

  it('offers both colours and at least one bridge, so the mode is present', () => {
    for (const f of FORMATIONS) {
      const classes = classesOf(f);
      expect(classes, f.id).toContain('aOnly');
      expect(classes, f.id).toContain('bOnly');
      expect(classes, f.id).toContain('bridge');
    }
  });

  it('never fields a carrier no polarity could break', () => {
    // A carrier divisible by neither divisor would be immortal. The type says
    // so; this says the authored data agrees.
    for (const f of FORMATIONS) {
      for (const cls of classesOf(f)) expect(cls).not.toBe('neither');
    }
  });

  it('runs for a sane length', () => {
    for (const f of FORMATIONS) {
      expect(durationOf(f)).toBeGreaterThan(3);
      expect(durationOf(f)).toBeLessThan(30);
    }
  });
});

describe('hasSafePath', () => {
  const slot = (atSeconds: number, x: number): Slot => ({
    atSeconds,
    cls: 'aOnly',
    x,
    driftX: 0,
    speed: 1,
    hp: 1,
    fireEvery: 2,
  });

  it('passes a wave with nothing in it', () => {
    expect(hasSafePath({ id: 't', name: 'T', slots: [] }, cfg.path)).toBe(true);
  });

  it('fails a wall the ship cannot be off', () => {
    const wall = Array.from({ length: 41 }, (_, i) => slot(2, i / 40));
    expect(hasSafePath({ id: 't', name: 'T', slots: wall }, cfg.path)).toBe(false);
  });

  it('fails a jump the ship cannot make in time', () => {
    const trap = [slot(0.02, 0.5), slot(0.04, 0.02), slot(0.05, 0.06), slot(0.06, 0.1)];
    const wide = { ...cfg.path, killHalfWidth: 0.45 };
    expect(hasSafePath({ id: 't', name: 'T', slots: trap }, wide)).toBe(false);
  });

  it('passes the same jump given time to make it', () => {
    const roomy = [slot(1, 0.5), slot(4, 0.02), slot(7, 0.9)];
    expect(hasSafePath({ id: 't', name: 'T', slots: roomy }, cfg.path)).toBe(true);
  });
});
