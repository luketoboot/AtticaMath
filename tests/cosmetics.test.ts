import { describe, expect, it } from 'vitest';
import {
  badgeFor,
  burstFor,
  buyCosmetic,
  cannonFor,
  cosmeticsOfKind,
  defaultEquipped,
  emptyProgress,
  findCosmetic,
  hullFor,
  isOwned,
  resolveEquipped,
  trailFor,
  unlockState,
  BADGES,
  BURSTS,
  CANNONS,
  COSMETIC_KINDS,
  COSMETICS,
  DEFAULT_BADGE,
  DEFAULT_BURST,
  DEFAULT_CANNON,
  DEFAULT_HULL,
  DEFAULT_TRAIL,
  HULLS,
  SLOT_FOR_KIND,
  TRAILS,
  type CosmeticProgress,
} from '../src/core/cosmetics/cosmetics';
import { allSkillIds } from '../src/core/skills/taxonomy';

/** A profile that has done everything, for "is it reachable at all" checks. */
function maxedProgress(): CosmeticProgress {
  return {
    bestScore: 10_000_000,
    totalWaves: 100_000,
    milestones: allSkillIds().map((id) => `mastery.${id}`),
  };
}

describe('the catalogue', () => {
  it('has unique ids', () => {
    const ids = COSMETICS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every kind a free starter, so a fresh save is already wearable', () => {
    for (const { kind } of COSMETIC_KINDS) {
      const free = cosmeticsOfKind(kind).filter((c) => c.price === 0);
      expect(free, `${kind} needs exactly one free starter`).toHaveLength(1);
      // ...and the starter must never be gated, or a fresh save wears nothing.
      expect(unlockState(free[0]!, emptyProgress()).unlocked).toBe(true);
    }
    expect(hullFor(DEFAULT_HULL).price).toBe(0);
    expect(trailFor(DEFAULT_TRAIL).price).toBe(0);
    expect(cannonFor(DEFAULT_CANNON).price).toBe(0);
    expect(burstFor(DEFAULT_BURST).price).toBe(0);
    expect(badgeFor(DEFAULT_BADGE).price).toBe(0);
  });

  it('covers every shelf the shop offers, and nothing lands off-shelf', () => {
    const kinds = new Set(COSMETIC_KINDS.map((k) => k.kind));
    for (const c of COSMETICS) expect(kinds.has(c.kind)).toBe(true);
    for (const { kind } of COSMETIC_KINDS) {
      // Two rows of five is what the shelf renders without leaving the screen.
      expect(cosmeticsOfKind(kind).length).toBeGreaterThanOrEqual(4);
      expect(cosmeticsOfKind(kind).length).toBeLessThanOrEqual(10);
    }
  });

  it('routes every kind to its own equipped slot', () => {
    const slots = Object.values(SLOT_FOR_KIND);
    expect(new Set(slots).size).toBe(slots.length);
    for (const { kind } of COSMETIC_KINDS) {
      expect(defaultEquipped()[SLOT_FOR_KIND[kind]]).toBeDefined();
    }
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

  it('keeps every cannon a decoration over the same firing point', () => {
    for (const cannon of CANNONS) {
      expect(cannon.outline.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of cannon.outline) {
        // Muzzles point up (never below the ground line) and no barrel reaches
        // wider or taller than the silhouette the crush box already assumes.
        expect(y).toBeLessThanOrEqual(0);
        expect(Math.abs(x)).toBeLessThanOrEqual(40);
        expect(y).toBeGreaterThanOrEqual(-60);
      }
      expect(cannon.treadHalf).toBeGreaterThan(0);
    }
  });

  it('gives every badge a shape a painter knows', () => {
    const shapes = new Set([
      'star', 'diamond', 'triangle', 'circle', 'square',
      'cross', 'ring', 'bolt', 'hex', 'chevron',
    ]);
    for (const badge of BADGES) expect(shapes.has(badge.shape)).toBe(true);
  });

  it('prices nothing negatively, and prices everything gated', () => {
    for (const c of COSMETICS) {
      expect(c.price).toBeGreaterThanOrEqual(0);
      // A free item with an unlock would be a trophy pretending to be a price
      // tag; a gated item must cost something, or the gate is the whole cost.
      if (c.price === 0) expect(c.unlock ?? { kind: 'open' }).toEqual({ kind: 'open' });
    }
  });

  it('leaves every locked item actually reachable', () => {
    const maxed = maxedProgress();
    for (const c of COSMETICS) {
      expect(unlockState(c, maxed).unlocked, `${c.id} can never unlock`).toBe(true);
    }
  });

  it('names a real skill in every skill-gated unlock', () => {
    const ids = new Set(allSkillIds());
    for (const c of COSMETICS) {
      if (c.unlock?.kind === 'skill') expect(ids.has(c.unlock.skillId)).toBe(true);
    }
  });

  it('is considerably deeper than a starter shelf', () => {
    expect(COSMETICS.length).toBeGreaterThanOrEqual(30);
    expect(COSMETICS.filter((c) => c.unlock !== undefined).length).toBeGreaterThanOrEqual(8);
  });
});

describe('unlockState', () => {
  const progress: CosmeticProgress = {
    bestScore: 12_000,
    totalWaves: 45,
    milestones: ['mastery.mul.table.9', 'mastery.add.single', 'noise.not-a-mastery'],
  };

  it('passes an open item with no requirement line', () => {
    expect(unlockState({ ...stub, unlock: { kind: 'open' } }, progress)).toEqual({ unlocked: true });
    // An absent unlock means open, so the common case needs no field at all.
    expect(unlockState(stub, progress).unlocked).toBe(true);
  });

  it('gates on best score, inclusively', () => {
    expect(unlockState({ ...stub, unlock: { kind: 'score', value: 12_000 } }, progress).unlocked).toBe(true);
    expect(unlockState({ ...stub, unlock: { kind: 'score', value: 12_001 } }, progress).unlocked).toBe(false);
  });

  it('gates on lifetime waves, inclusively', () => {
    expect(unlockState({ ...stub, unlock: { kind: 'waves', value: 45 } }, progress).unlocked).toBe(true);
    expect(unlockState({ ...stub, unlock: { kind: 'waves', value: 46 } }, progress).unlocked).toBe(false);
  });

  it('counts only mastery milestones', () => {
    // Three milestones are stored but one is not a mastery; it must not count.
    expect(unlockState({ ...stub, unlock: { kind: 'mastery', count: 2 } }, progress).unlocked).toBe(true);
    expect(unlockState({ ...stub, unlock: { kind: 'mastery', count: 3 } }, progress).unlocked).toBe(false);
  });

  it('gates on one named skill', () => {
    expect(unlockState({ ...stub, unlock: { kind: 'skill', skillId: 'mul.table.9' } }, progress).unlocked).toBe(true);
    expect(unlockState({ ...stub, unlock: { kind: 'skill', skillId: 'mul.table.7' } }, progress).unlocked).toBe(false);
  });

  it('always says what a locked item is waiting for', () => {
    for (const c of COSMETICS) {
      const state = unlockState(c, emptyProgress());
      if (!state.unlocked) expect(state.requirement?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

const stub = {
  id: 'test.item',
  kind: 'badge' as const,
  name: 'TEST',
  description: '',
  price: 100,
};

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

  it('will not sell a locked item at any price', () => {
    const locked = COSMETICS.find((c) => c.unlock !== undefined)!;
    const res = buyCosmetic(locked.id, 9_999_999, [], emptyProgress());
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('locked');
    expect(res.credits).toBe(9_999_999);
  });

  it('reports locked before broke, so the player grinds the right thing', () => {
    const locked = COSMETICS.find((c) => c.unlock !== undefined)!;
    // Broke AND locked: the answer must be the gate, not the price tag.
    expect(buyCosmetic(locked.id, 0, [], emptyProgress()).reason).toBe('locked');
  });

  it('sells the same item once the record earns it', () => {
    const locked = COSMETICS.find((c) => c.unlock !== undefined)!;
    const res = buyCosmetic(locked.id, 9_999_999, [], maxedProgress());
    expect(res.ok).toBe(true);
    expect(res.owned).toContain(locked.id);
  });

  it('defaults to no progress, so an unlock is never granted by omission', () => {
    const locked = COSMETICS.find((c) => c.unlock !== undefined)!;
    expect(buyCosmetic(locked.id, 9_999_999, []).reason).toBe('locked');
  });
});

describe('resolveEquipped', () => {
  it('keeps a valid, owned choice', () => {
    expect(
      resolveEquipped({ hull: 'hull.wedge', trail: 'trail.ember' }, ['hull.wedge', 'trail.ember']),
    ).toEqual({ ...defaultEquipped(), hull: 'hull.wedge', trail: 'trail.ember' });
  });

  it('falls back when the save names something unowned', () => {
    expect(resolveEquipped({ hull: 'hull.ring', trail: 'trail.bone' }, [])).toEqual(defaultEquipped());
  });

  it('falls back on junk rather than rendering nothing', () => {
    expect(resolveEquipped(null, [])).toEqual(defaultEquipped());
    expect(resolveEquipped({ hull: 7 }, [])).toEqual(defaultEquipped());
    expect(resolveEquipped({ hull: 'hull.nope', trail: 'trail.nope' }, [])).toEqual(defaultEquipped());
  });

  it('fills in slots a save predates, which is how a new shelf ships', () => {
    // Exactly the shape written before cannons, bursts and badges existed.
    const old = { hull: 'hull.wedge', trail: 'trail.ember' };
    const out = resolveEquipped(old, ['hull.wedge', 'trail.ember']);
    expect(out.cannon).toBe(DEFAULT_CANNON);
    expect(out.burst).toBe(DEFAULT_BURST);
    expect(out.badge).toBe(DEFAULT_BADGE);
    expect(out.hull).toBe('hull.wedge');
  });

  it('never returns a slot the player cannot wear', () => {
    const out = resolveEquipped(
      { hull: 'hull.sable', trail: 'trail.void', cannon: 'cannon.wing', burst: 'burst.white', badge: 'badge.star' },
      [],
    );
    for (const [, id] of Object.entries(out)) expect(isOwned(id, [])).toBe(true);
  });
});

describe('lookups', () => {
  it('falls back to the starter for an unknown id', () => {
    expect(hullFor('hull.nope').id).toBe(DEFAULT_HULL);
    expect(trailFor('trail.nope').id).toBe(DEFAULT_TRAIL);
    expect(cannonFor('cannon.nope').id).toBe(DEFAULT_CANNON);
    expect(burstFor('burst.nope').id).toBe(DEFAULT_BURST);
    expect(badgeFor('badge.nope').id).toBe(DEFAULT_BADGE);
  });

  it('files each shelf under its own kind', () => {
    for (const { kind } of COSMETIC_KINDS) {
      for (const c of cosmeticsOfKind(kind)) expect(c.kind).toBe(kind);
    }
    expect(cosmeticsOfKind('hull')).toHaveLength(HULLS.length);
    expect(cosmeticsOfKind('trail')).toHaveLength(TRAILS.length);
    expect(cosmeticsOfKind('cannon')).toHaveLength(CANNONS.length);
    expect(cosmeticsOfKind('burst')).toHaveLength(BURSTS.length);
    expect(cosmeticsOfKind('badge')).toHaveLength(BADGES.length);
  });
});
