import { describe, expect, it } from 'vitest';
import {
  advance,
  breakChain,
  isLive,
  multiplierOf,
  newChain,
  remainingFraction,
  tierOf,
  windowFor,
  type ChainConfig,
} from '../src/core/collapse/chain';

const CFG: ChainConfig = {
  baseWindowSeconds: 10,
  windowShrinkPerTier: 2,
  minWindowSeconds: 4,
  tierThresholds: [2, 4, 7],
  tierMultipliers: [1, 2, 3, 4],
};

describe('tiers', () => {
  it('climbs at each threshold', () => {
    expect(tierOf(0, CFG)).toBe(0);
    expect(tierOf(1, CFG)).toBe(0);
    expect(tierOf(2, CFG)).toBe(1);
    expect(tierOf(3, CFG)).toBe(1);
    expect(tierOf(4, CFG)).toBe(2);
    expect(tierOf(7, CFG)).toBe(3);
    expect(tierOf(99, CFG)).toBe(3);
  });

  it('maps tiers to multipliers and never runs off the end', () => {
    expect(multiplierOf(1, CFG)).toBe(1);
    expect(multiplierOf(2, CFG)).toBe(2);
    expect(multiplierOf(4, CFG)).toBe(3);
    expect(multiplierOf(1000, CFG)).toBe(4);
  });

  it('shrinks the window per tier down to the floor', () => {
    expect(windowFor(0, CFG)).toBe(10);
    expect(windowFor(1, CFG)).toBe(8);
    expect(windowFor(3, CFG)).toBe(4);
    expect(windowFor(9, CFG)).toBe(4); // clamped
  });
});

describe('advance', () => {
  it('starts a chain at one', () => {
    const step = advance(newChain(), 1000, CFG);
    expect(step.state.count).toBe(1);
    expect(step.tier).toBe(0);
    expect(step.multiplier).toBe(1);
    expect(step.tierUp).toBe(false);
  });

  it('accumulates while the window holds', () => {
    let state = newChain();
    let now = 0;
    for (let i = 1; i <= 4; i++) {
      const step = advance(state, now, CFG);
      state = step.state;
      expect(step.state.count).toBe(i);
      now += 1000;
    }
  });

  it('flags the collapse that crosses into a new tier', () => {
    let state = advance(newChain(), 0, CFG).state; // count 1
    const second = advance(state, 500, CFG); // count 2 -> tier 1
    expect(second.tierUp).toBe(true);
    state = second.state;
    const third = advance(state, 1000, CFG); // count 3, still tier 1
    expect(third.tierUp).toBe(false);
  });

  it('restarts at one when the window has lapsed', () => {
    const first = advance(newChain(), 0, CFG);
    expect(first.state.expiresAtMs).toBe(10_000);
    const late = advance(first.state, 11_000, CFG);
    expect(late.state.count).toBe(1);
    expect(late.multiplier).toBe(1);
  });

  it('a higher tier gets a shorter window', () => {
    let state = newChain();
    let now = 0;
    for (let i = 0; i < 4; i++) {
      state = advance(state, now, CFG).state;
      now += 100;
    }
    // count 4 => tier 2 => window 6s
    expect(state.expiresAtMs - now + 100).toBe(6000);
  });
});

describe('liveness', () => {
  it('an empty chain is never live', () => {
    expect(isLive(newChain(), 0)).toBe(false);
  });

  it('goes dead once the window passes', () => {
    const { state } = advance(newChain(), 0, CFG);
    expect(isLive(state, 9_999)).toBe(true);
    expect(isLive(state, 10_001)).toBe(false);
  });

  it('reports the remaining window as a fraction', () => {
    const { state } = advance(newChain(), 0, CFG);
    expect(remainingFraction(state, 0, CFG)).toBeCloseTo(1, 6);
    expect(remainingFraction(state, 5000, CFG)).toBeCloseTo(0.5, 6);
    expect(remainingFraction(state, 20_000, CFG)).toBe(0);
  });

  it('breaking drops it to nothing', () => {
    const { state } = advance(newChain(), 0, CFG);
    expect(isLive(state, 100)).toBe(true);
    expect(isLive(breakChain(), 100)).toBe(false);
  });
});
