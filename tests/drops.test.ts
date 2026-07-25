import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  applyDrop,
  chainReady,
  consumeChain,
  createDrops,
  descentFrozen,
  DROP_KINDS,
  DROP_LABEL,
  dropMultiplier,
  rollDrop,
  shieldActive,
  tickDrops,
  DropTracker,
  type DropKind,
} from '../src/core/drops';
import { createRng } from '../src/core/rng';

const cfg = CONFIG.drops;

/** Roll `n` drops from one seeded stream and tally the kinds. */
function tally(n: number, hp: number): Record<DropKind, number> {
  const rng = createRng(1234);
  const counts = { freeze: 0, nuke: 0, repair: 0, double: 0, chain: 0, shield: 0 };
  for (let i = 0; i < n; i++) counts[rollDrop(rng, hp, cfg)] += 1;
  return counts;
}

describe('drop effects', () => {
  it('freeze halts descent for its window', () => {
    let state = applyDrop(createDrops(), 'freeze', cfg);
    expect(descentFrozen(state)).toBe(true);
    state = tickDrops(state, cfg.freezeSeconds + 0.01);
    expect(descentFrozen(state)).toBe(false);
  });

  it('x2 doubles the score while it runs', () => {
    let state = applyDrop(createDrops(), 'double', cfg);
    expect(dropMultiplier(state, cfg)).toBe(cfg.doubleMultiplier);
    state = tickDrops(state, cfg.doubleSeconds + 0.01);
    expect(dropMultiplier(state, cfg)).toBe(1);
  });

  it('a second x2 refreshes the window instead of stacking the multiplier', () => {
    let state = applyDrop(createDrops(), 'double', cfg);
    state = tickDrops(state, cfg.doubleSeconds / 2);
    state = applyDrop(state, 'double', cfg);
    expect(state.doubleLeft).toBe(cfg.doubleSeconds);
    expect(dropMultiplier(state, cfg)).toBe(cfg.doubleMultiplier);
  });

  it('chain covers a fixed number of shots and is spent one at a time', () => {
    let state = applyDrop(createDrops(), 'chain', cfg);
    expect(state.chainLeft).toBe(cfg.chainKills);
    for (let i = 0; i < cfg.chainKills; i++) {
      expect(chainReady(state)).toBe(true);
      state = consumeChain(state);
    }
    expect(chainReady(state)).toBe(false);
    expect(consumeChain(state)).toBe(state);
  });

  it('chain does not expire on the clock', () => {
    const state = tickDrops(applyDrop(createDrops(), 'chain', cfg), 600);
    expect(chainReady(state)).toBe(true);
  });

  it('nuke and repair carry no timer — the caller applies them', () => {
    const fresh = createDrops();
    expect(applyDrop(fresh, 'nuke', cfg)).toBe(fresh);
    expect(applyDrop(fresh, 'repair', cfg)).toBe(fresh);
  });

  it('every kind has a label', () => {
    for (const kind of DROP_KINDS) expect(DROP_LABEL[kind].length).toBeGreaterThan(0);
  });
});

describe('drop table', () => {
  it('can roll every kind', () => {
    const counts = tally(400, 5);
    for (const kind of DROP_KINDS) expect(counts[kind], kind).toBeGreaterThan(0);
  });

  it('leans on repair when the player is nearly dead', () => {
    const healthy = tally(400, 5);
    const dying = tally(400, cfg.lowHpAt);
    expect(dying.repair).toBeGreaterThan(healthy.repair);
  });

  it('is deterministic for a given stream', () => {
    expect(tally(50, 4)).toEqual(tally(50, 4));
  });
});


describe('mode pools', () => {
  it('only ever rolls from the pool it was given', () => {
    const rng = createRng(7);
    const pool: DropKind[] = ['repair', 'shield'];
    for (let i = 0; i < 300; i++) {
      expect(pool).toContain(rollDrop(rng, 5, cfg, pool));
    }
  });

  it('falls back to the full set rather than crashing on an empty pool', () => {
    expect(DROP_KINDS).toContain(rollDrop(createRng(1), 5, cfg, []));
  });

  it('keeps chain out of every mode that cannot use it', () => {
    // A pickup that does nothing is worse than no pickup, and chain only means
    // something where several targets can share an answer.
    for (const [mode, pool] of Object.entries(cfg.pools)) {
      if (mode === 'meteor') continue;
      expect(pool, `${mode} cannot honour a chain pickup`).not.toContain('chain');
    }
  });

  it('gives every mode something to drop', () => {
    for (const [mode, pool] of Object.entries(cfg.pools)) {
      expect(pool.length, `${mode} has an empty pool`).toBeGreaterThan(0);
      for (const kind of pool) expect(DROP_KINDS).toContain(kind);
    }
  });
});

describe('DropTracker', () => {
  const tracker = (): DropTracker => new DropTracker(99, cfg, DROP_KINDS);

  it('starts with nothing running', () => {
    const t = tracker();
    expect(t.frozen).toBe(false);
    expect(t.shielded).toBe(false);
    expect(t.chainReady).toBe(false);
    expect(t.multiplier).toBe(1);
  });

  it('runs an effect down over time', () => {
    const t = tracker();
    t.apply('shield');
    expect(t.shielded).toBe(true);
    t.tick(cfg.shieldSeconds - 0.01);
    expect(t.shielded).toBe(true);
    t.tick(0.02);
    expect(t.shielded).toBe(false);
  });

  it('doubles the score while x2 is up, and stops when it lapses', () => {
    const t = tracker();
    t.apply('double');
    expect(t.multiplier).toBe(cfg.doubleMultiplier);
    t.tick(cfg.doubleSeconds + 0.1);
    expect(t.multiplier).toBe(1);
  });

  it('spends chain one kill at a time', () => {
    const t = tracker();
    t.apply('chain');
    for (let i = 0; i < cfg.chainKills; i++) {
      expect(t.chainReady).toBe(true);
      t.useChain();
    }
    expect(t.chainReady).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const a = new DropTracker(4242, cfg, DROP_KINDS);
    const b = new DropTracker(4242, cfg, DROP_KINDS);
    for (let i = 0; i < 40; i++) expect(a.roll(5)).toBe(b.roll(5));
  });

  it('hands out a snapshot that matches the free functions', () => {
    const t = tracker();
    t.apply('freeze');
    expect(descentFrozen(t.snapshot)).toBe(true);
    expect(shieldActive(t.snapshot)).toBe(false);
  });
});
