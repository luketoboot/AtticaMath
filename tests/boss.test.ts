import { describe, expect, it } from 'vitest';
import { BossSession } from '../src/core/boss/session';
import { CONFIG } from '../src/core/config';
import { num, op } from '../src/core/expression/expression';

function freshSession(overrides: Partial<ConstructorParameters<typeof BossSession>[0]> = {}): BossSession {
  return new BossSession({
    seed: 21,
    skills: {},
    totalWavesBefore: 0,
    ...overrides,
  });
}

describe('BossSession', () => {
  it('starts at boss 1 with configured HP', () => {
    const s = freshSession();
    expect(s.bossNumber).toBe(1);
    expect(s.bossHp).toBe(CONFIG.boss.baseHp);
  });

  it('expression value is the damage dealt', () => {
    const s = freshSession();
    const outcome = s.fireExpression([num(12), op('×'), num(11)], 3000);
    expect(outcome).toMatchObject({ result: 'hit', damage: 132 });
    expect(s.bossHp).toBe(CONFIG.boss.baseHp - 132);
    expect(s.score).toBe(132 * CONFIG.boss.scorePerDamage);
  });

  it('invalid expressions misfire without damage', () => {
    const s = freshSession();
    const outcome = s.fireExpression([num(7), op('÷'), num(2)], 3000);
    expect(outcome.result).toBe('invalid');
    expect(s.bossHp).toBe(CONFIG.boss.baseHp);
    expect(s.misfires).toBe(1);
  });

  it('downing a boss scales the next one and pays the bonus', () => {
    const s = freshSession();
    let guard = 0;
    while (s.bossNumber === 1 && guard++ < 50) {
      s.fireExpression([num(25), op('×'), num(25)], 2000);
    }
    expect(s.bossNumber).toBe(2);
    expect(s.bossMaxHp).toBe(Math.round(CONFIG.boss.baseHp * CONFIG.boss.hpGrowthPerBoss));
    expect(s.bossHp).toBe(s.bossMaxHp);
    expect(s.score).toBeGreaterThanOrEqual(CONFIG.boss.defeatBonus);
  });

  it('firing updates the skills its operators exercise', () => {
    const s = freshSession();
    s.fireExpression([num(7), op('×'), num(8)], 2000);
    expect(s.skillTable['mul.table.8']).toBeDefined();
    expect(s.skillTable['mul.table.8']!.attempts).toBe(1);
  });

  it('attack problems come from the adaptive composer', () => {
    const s = freshSession();
    for (let i = 0; i < 20; i++) {
      const p = s.nextAttackProblem();
      expect(p.prompt.length).toBeGreaterThan(0);
      expect(p.answer).toMatch(/^\d+$/);
    }
  });

  it('blocking an attack scores and extends the streak', () => {
    const s = freshSession();
    const p = s.nextAttackProblem();
    const points = s.blockAttack(p, 1500);
    expect(points).toBeGreaterThan(0);
    expect(s.streak).toBe(1);
    expect(s.blocks).toBe(1);
  });

  it('a landed attack costs hp and resets the streak', () => {
    const s = freshSession();
    const p = s.nextAttackProblem();
    s.blockAttack(p, 1500);
    const p2 = s.nextAttackProblem();
    s.attackLands(p2, 10000);
    expect(s.hp).toBe(CONFIG.meteors.baseHp - 1);
    expect(s.streak).toBe(0);
  });

  it('attacks speed up on later bosses', () => {
    const s = freshSession();
    const early = s.attackIntervalSeconds();
    let guard = 0;
    while (s.bossNumber < 4 && guard++ < 200) {
      s.fireExpression([num(25), op('×'), num(25)], 2000);
    }
    expect(s.attackIntervalSeconds()).toBeLessThan(early);
    expect(s.attackTravelSeconds()).toBeLessThanOrEqual(CONFIG.boss.attackTravelSeconds);
  });

  it('deals hands of the configured size', () => {
    const s = freshSession();
    const hand = s.dealHand();
    expect(hand.length).toBe(CONFIG.boss.handSize);
    for (const v of hand) {
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(25);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = freshSession({ seed: 77 });
    const b = freshSession({ seed: 77 });
    expect(a.dealHand()).toEqual(b.dealHand());
    expect(a.nextAttackProblem().prompt).toBe(b.nextAttackProblem().prompt);
  });

  it('game over at zero hp', () => {
    const s = freshSession();
    for (let i = 0; i < CONFIG.meteors.baseHp; i++) {
      s.attackLands(s.nextAttackProblem(), 9000);
    }
    expect(s.gameOver).toBe(true);
    expect(s.stats().misses).toBe(CONFIG.meteors.baseHp);
  });
});
