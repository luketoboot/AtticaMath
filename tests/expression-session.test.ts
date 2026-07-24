import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { num, op } from '../src/core/expression/expression';
import { ExpressionSession } from '../src/core/expression/session';

function freshSession(
  overrides: Partial<ConstructorParameters<typeof ExpressionSession>[0]> = {},
): ExpressionSession {
  return new ExpressionSession({
    seed: 7,
    skills: {},
    totalWavesBefore: 0,
    ownedUpgrades: [],
    loadout: [],
    ...overrides,
  });
}

describe('ExpressionSession', () => {
  it('produces waves of the configured size', () => {
    const s = freshSession();
    const wave = s.nextWave();
    expect(wave.length).toBe(CONFIG.expression.baseTargetsPerWave);
  });

  it('firing the canonical solution is always a hit', () => {
    const s = freshSession();
    for (const p of s.nextWave()) {
      const outcome = s.fire(p, p.canonical, 3000);
      expect(outcome.result).toBe('hit');
    }
    expect(s.kills).toBe(CONFIG.expression.baseTargetsPerWave);
    expect(s.score).toBeGreaterThan(0);
  });

  it('wrong value counts as a misfire, not a miss', () => {
    const s = freshSession();
    const [p] = s.nextWave();
    const outcome = s.fire(p!, [num(1), op('+'), num(1)], 3000);
    expect(outcome.result === 'wrong' || outcome.result === 'hit').toBe(true);
    if (outcome.result === 'wrong') {
      expect(s.misfires).toBe(1);
      expect(s.hp).toBe(CONFIG.meteors.baseHp);
      expect(s.misses).toBe(0);
    }
  });

  it('invalid expressions report a reason', () => {
    const s = freshSession();
    const [p] = s.nextWave();
    const outcome = s.fire(p!, [num(1), op('+')], 3000);
    expect(outcome).toEqual({ result: 'invalid', reason: 'malformed' });
  });

  it('a landed target costs hp and breaks the streak', () => {
    const s = freshSession();
    const wave = s.nextWave();
    s.fire(wave[0]!, wave[0]!.canonical, 2000);
    expect(s.streak).toBe(1);
    s.recordMiss(wave[1]!, 20000);
    expect(s.streak).toBe(0);
    expect(s.hp).toBe(CONFIG.meteors.baseHp - 1);
  });

  it('hits update the tagged skills', () => {
    const s = freshSession();
    const [p] = s.nextWave();
    s.fire(p!, p!.canonical, 2000);
    for (const id of p!.skillIds) {
      expect(s.skillTable[id]).toBeDefined();
      expect(s.skillTable[id]!.attempts).toBeGreaterThan(0);
    }
  });

  it('tracks operator usage from fired expressions', () => {
    const s = freshSession();
    const [p] = s.nextWave();
    const outcome = s.fire(p!, p!.canonical, 2000);
    expect(outcome.result).toBe('hit');
    const total = Object.values(s.operatorUsage).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('pays efficiency and variety bonuses', () => {
    const s = freshSession();
    // Hand-built problem: target 23 via 4 × 5 + 3, hand has 2 decoys.
    const problem = {
      id: 999,
      target: 23,
      hand: [4, 5, 3, 9, 2],
      canonical: [num(4), op('×'), num(5), op('+'), num(3)],
      skillIds: ['mul.table.5', 'add.double'],
      difficulty: 500,
      chipCount: 3,
    };
    const outcome = s.fire(problem, problem.canonical, 2000);
    expect(outcome.result).toBe('hit');
    if (outcome.result === 'hit') {
      expect(outcome.efficiencyBonus).toBe(2 * CONFIG.expression.efficiencyBonusPerChip);
      expect(outcome.varietyBonus).toBe(2 * CONFIG.expression.varietyBonusPerOperator);
    }
  });

  it('offers a coach tip after a wave with attempts', () => {
    const s = freshSession();
    const wave = s.nextWave();
    for (const p of wave) s.fire(p, p.canonical, 15000);
    const pick = s.endWave();
    expect(pick).toBeDefined();
  });

  it('game over at zero hp', () => {
    const s = freshSession();
    const wave = s.nextWave();
    for (let i = 0; i < CONFIG.meteors.baseHp; i++) s.recordMiss(wave[i % wave.length]!, 30000);
    expect(s.gameOver).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const a = freshSession({ seed: 123 }).nextWave();
    const b = freshSession({ seed: 123 }).nextWave();
    expect(a.map((p) => p.target)).toEqual(b.map((p) => p.target));
    expect(a.map((p) => p.hand)).toEqual(b.map((p) => p.hand));
  });

  it('bigger puzzles fall longer', () => {
    const s = freshSession();
    s.nextWave();
    const small = { ...s.nextWave()[0]!, chipCount: 2 };
    const large = { ...small, chipCount: 4 };
    expect(s.fallSeconds(large)).toBeGreaterThan(s.fallSeconds(small));
  });
});
