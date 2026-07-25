import { describe, expect, it } from 'vitest';
import {
  buyCosmetic,
  defaultEquipped,
  findCosmetic,
  hullFor,
  isOwned,
  resolveEquipped,
  trailFor,
  COSMETICS,
  DEFAULT_HULL,
  DEFAULT_TRAIL,
  HULLS,
  TRAILS,
} from '../src/core/cosmetics/cosmetics';

describe('the catalogue', () => {
  it('has unique ids', () => {
    const ids = COSMETICS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every kind a free starter, so a fresh save is already wearable', () => {
    expect(HULLS.filter((h) => h.price === 0)).toHaveLength(1);
    expect(TRAILS.filter((t) => t.price === 0)).toHaveLength(1);
    expect(hullFor(DEFAULT_HULL).price).toBe(0);
    expect(trailFor(DEFAULT_TRAIL).price).toBe(0);
  });

  it('keeps every hull the same size, because size would be an advantage', () => {
    // Outlines are in ship-radius units and the renderer scales them all by the
    // one shared radius, so this holds as long as nothing strays far from 1.
    for (const hull of HULLS) {
      for (const [x, y] of hull.outline) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.5);
      }
      expect(hull.outline.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('prices nothing negatively', () => {
    for (const c of COSMETICS) expect(c.price).toBeGreaterThanOrEqual(0);
  });
});

describe('ownership', () => {
  it('treats free items as owned without a purchase', () => {
    expect(isOwned(DEFAULT_HULL, [])).toBe(true);
    expect(isOwned(DEFAULT_TRAIL, [])).toBe(true);
  });

  it('requires a purchase for anything priced', () => {
    expect(isOwned('hull.wedge', [])).toBe(false);
    expect(isOwned('hull.wedge', ['hull.wedge'])).toBe(true);
  });

  it('never owns something that does not exist', () => {
    expect(isOwned('hull.nope', ['hull.nope'])).toBe(false);
  });
});

describe('buyCosmetic', () => {
  it('deducts the price and grants the item', () => {
    const def = findCosmetic('hull.wedge')!;
    const res = buyCosmetic('hull.wedge', 1000, []);
    expect(res.ok).toBe(true);
    expect(res.credits).toBe(1000 - def.price);
    expect(res.owned).toContain('hull.wedge');
  });

  it('rejects when broke and keeps the credits', () => {
    const res = buyCosmetic('hull.ring', 5, []);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('insufficient');
    expect(res.credits).toBe(5);
  });

  it('refuses to sell the same thing twice', () => {
    const res = buyCosmetic('hull.wedge', 9999, ['hull.wedge']);
    expect(res.reason).toBe('already-owned');
  });

  it('refuses to sell the free starter', () => {
    expect(buyCosmetic(DEFAULT_HULL, 9999, []).reason).toBe('already-owned');
  });

  it('rejects unknown ids', () => {
    expect(buyCosmetic('hull.nope', 9999, []).reason).toBe('unknown');
  });

  it('does not mutate the list it was given', () => {
    const owned: string[] = [];
    buyCosmetic('hull.wedge', 9999, owned);
    expect(owned).toHaveLength(0);
  });
});

describe('resolveEquipped', () => {
  it('keeps a valid, owned choice', () => {
    expect(resolveEquipped({ hull: 'hull.wedge', trail: 'trail.ember' }, ['hull.wedge', 'trail.ember'])).toEqual(
      { hull: 'hull.wedge', trail: 'trail.ember' },
    );
  });

  it('falls back when the save names something unowned', () => {
    expect(resolveEquipped({ hull: 'hull.ring', trail: 'trail.bone' }, [])).toEqual(defaultEquipped());
  });

  it('falls back on junk rather than rendering nothing', () => {
    expect(resolveEquipped(null, [])).toEqual(defaultEquipped());
    expect(resolveEquipped({ hull: 7 }, [])).toEqual(defaultEquipped());
    expect(resolveEquipped({ hull: 'hull.nope', trail: 'trail.nope' }, [])).toEqual(defaultEquipped());
  });
});

describe('lookups', () => {
  it('falls back to the starter for an unknown id', () => {
    expect(hullFor('hull.nope').id).toBe(DEFAULT_HULL);
    expect(trailFor('trail.nope').id).toBe(DEFAULT_TRAIL);
  });
});
