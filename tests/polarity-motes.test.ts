import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { classOf, isHeuristicProof, legalPairs, splitOf } from '../src/core/polarity/divisors';
import { FORMATIONS, classesOf } from '../src/core/polarity/formations';
import {
  candidatesFor,
  fillSlots,
  isFillable,
  isProofForPair,
  nearestSplit,
} from '../src/core/polarity/motes';
import { createRng } from '../src/core/rng';
import type { MoteClass } from '../src/core/polarity/signal';

const cfg = CONFIG.polarity;
const range = { lo: cfg.valueLo, hi: cfg.valueHi };

describe('candidates', () => {
  it('only ever offers values of the class asked for', () => {
    for (const [a, b] of legalPairs()) {
      for (const cls of ['aOnly', 'bOnly', 'bridge', 'neither'] as const) {
        const { proof, leaky } = candidatesFor(cls, a, b, range);
        for (const v of [...proof, ...leaky]) expect(classOf(v, a, b)).toBe(cls);
      }
    }
  });

  it('sorts them by whether the surface checks would have answered it', () => {
    const { proof, leaky } = candidatesFor('neither', 4, 7, range);
    for (const v of proof) expect(isProofForPair(v, 4, 7)).toBe(true);
    for (const v of leaky) expect(isProofForPair(v, 4, 7)).toBe(false);
    // In a fours wave the odd numbers are the giveaways, and there are plenty.
    expect(leaky.every((v) => v % 2 === 1)).toBe(true);
    expect(proof.length).toBeGreaterThan(0);
  });

  it('needs both divisors to survive, not just one', () => {
    // 85 is odd, so the fours check settles it without any thought.
    expect(isHeuristicProof(85, 7)).toBe(true);
    expect(isProofForPair(85, 4, 7)).toBe(false);
  });
});

describe('fillSlots', () => {
  it('gives every slot a value of its own class', () => {
    const rng = createRng(4);
    for (const f of FORMATIONS) {
      const classes = classesOf(f);
      for (const [a, b] of legalPairs()) {
        const values = fillSlots(rng, classes, a, b, range, cfg.pool);
        expect(values.length).toBe(classes.length);
        values.forEach((v, i) => expect(classOf(v, a, b)).toBe(classes[i]));
      }
    }
  });

  it('hits the heuristic-proof share across a wave', () => {
    // Rolled as a budget over the wave rather than per mote, so a wave is never
    // accidentally all-giveaway.
    let proof = 0;
    let total = 0;
    for (let seed = 0; seed < 500; seed++) {
      const rng = createRng(seed);
      const classes = classesOf(FORMATIONS[seed % FORMATIONS.length]!);
      const values = fillSlots(rng, classes, 4, 7, range, cfg.pool);
      for (const v of values) {
        if (isProofForPair(v, 4, 7)) proof += 1;
        total += 1;
      }
    }
    const share = proof / total;
    expect(share).toBeGreaterThan(cfg.pool.heuristicProofShare - 0.12);
  });

  it('pulls the non-multiples toward the near misses', () => {
    // The research point: 85 is a far harder thing to keep off than 60 is, and
    // difficulty that comes from the split is difficulty about the arithmetic.
    let near = 0;
    let total = 0;
    for (let seed = 0; seed < 400; seed++) {
      const rng = createRng(seed + 900);
      const values = fillSlots(rng, Array<MoteClass>(8).fill('neither'), 4, 7, range, cfg.pool);
      for (const v of values) {
        if (nearestSplit(v, 4, 7) <= 2) near += 1;
        total += 1;
      }
    }
    expect(near / total).toBeGreaterThan(0.5);
  });

  it('does not make every non-multiple a near miss', () => {
    // A pool of nothing but traps is its own kind of dishonest — the player
    // would learn that anything close is always a miss.
    const splits = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed + 55);
      for (const v of fillSlots(rng, Array<MoteClass>(8).fill('neither'), 4, 7, range, cfg.pool)) {
        splits.add(splitOf(v, 7));
      }
    }
    expect(splits.size).toBeGreaterThan(2);
  });

  it('is deterministic under a seed', () => {
    const classes = classesOf(FORMATIONS[0]!);
    const a = fillSlots(createRng(77), classes, 3, 4, range, cfg.pool);
    const b = fillSlots(createRng(77), classes, 3, 4, range, cfg.pool);
    expect(a).toEqual(b);
  });

  it('varies between seeds, so a formation is not one fixed sum', () => {
    const classes = classesOf(FORMATIONS[0]!);
    const a = fillSlots(createRng(1), classes, 3, 4, range, cfg.pool);
    const b = fillSlots(createRng(2), classes, 3, 4, range, cfg.pool);
    expect(a).not.toEqual(b);
  });
});

describe('isFillable', () => {
  it('accepts a pair with room for every class it is asked for', () => {
    expect(isFillable(['aOnly', 'bOnly', 'bridge', 'neither'], 3, 4, range)).toBe(true);
  });

  it('refuses when the range holds no common multiple to bridge with', () => {
    // Sevens and elevens meet at 77, so a range that stops short has no bridges.
    expect(isFillable(['bridge'], 7, 11, { lo: 12, hi: 60 })).toBe(false);
    expect(isFillable(['bridge'], 7, 11, { lo: 12, hi: 100 })).toBe(true);
  });

  it('is what catches the sparse pairs before a player meets them', () => {
    // Threes and fours meet every twelve; sixes and eights every twenty-four.
    // A narrow range is fine for the first and empty for the second.
    const narrow = { lo: 12, hi: 20 };
    expect(isFillable(['bridge'], 3, 4, narrow)).toBe(true);
    expect(isFillable(['bridge'], 6, 8, narrow)).toBe(false);
  });
});
