import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { num, op, type Token } from '../src/core/expression/expression';
import { ExpressionSession } from '../src/core/expression/session';
import { solveTarget } from '../src/core/expression/solve';
import { skillsForTokens, type ExpressionProblem } from '../src/core/expression/generate';
import { createSkillTable } from '../src/core/skills/rating';
import { allSkillIds } from '../src/core/skills/taxonomy';

function freshSession(
  overrides: Partial<ConstructorParameters<typeof ExpressionSession>[0]> = {},
): ExpressionSession {
  return new ExpressionSession({
    seed: 7,
    skills: {},
    totalWavesBefore: 0,
    ...overrides,
  });
}

/** A solution to a live target, found the same way the player would. */
function solutionFor(s: ExpressionSession, problem: ExpressionProblem): Token[] {
  const info = solveTarget(s.handChips, problem.target, CONFIG.expression.maxChips);
  expect(info, `hand ${s.handChips.join(',')} cannot make ${problem.target}`).not.toBeNull();
  return info!.example;
}

/** Start a wave and put one target in the air. */
function firstTarget(s: ExpressionSession): ExpressionProblem {
  s.nextWave();
  const problem = s.spawnTarget();
  expect(problem).not.toBeNull();
  return problem!;
}

describe('hand as the wave resource', () => {
  it('deals a full hand that can always build something', () => {
    const s = freshSession();
    s.nextWave();
    expect(s.handChips).toHaveLength(CONFIG.expression.handSize);
    expect(s.spawnTarget()).not.toBeNull();
  });

  it('every generated target is solvable with the hand in play', () => {
    const s = freshSession({ seed: 99 });
    for (let wave = 0; wave < 6; wave++) {
      s.nextWave();
      let problem = s.spawnTarget();
      while (problem) {
        const tokens = solutionFor(s, problem);
        expect(s.fire(tokens, 2000).result).toBe('hit');
        problem = s.spawnTarget();
      }
      s.endWave();
    }
  });

  it('stays solvable at ratings that demand whole-hand puzzles', () => {
    // At fourChipRating the generator aims for par 4 — the entire hand, now
    // that the hand is four chips. That is the tightest the solvability
    // promise gets, so drive it hard and check every target is still makeable.
    const skills = createSkillTable(allSkillIds(), CONFIG.rating);
    for (const state of Object.values(skills)) {
      state.rating = CONFIG.expression.fourChipRating + 100;
      state.attempts = 5;
    }
    const s = freshSession({ seed: 13, skills });
    let sawBigPar = false;
    for (let wave = 0; wave < 6; wave++) {
      s.nextWave();
      let problem = s.spawnTarget();
      while (problem) {
        if (problem.par >= 3) sawBigPar = true;
        expect(problem.par).toBeLessThanOrEqual(CONFIG.expression.handSize);
        const tokens = solutionFor(s, problem);
        expect(s.fire(tokens, 2000).result).toBe('hit');
        problem = s.spawnTarget();
      }
      s.endWave();
    }
    // The point of the test is the high-par path; prove it actually engaged.
    expect(sawBigPar).toBe(true);
  });

  it('spends the chips used and refills the hand', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    const tokens = solutionFor(s, problem);
    const before = [...s.handChips];

    expect(s.fire(tokens, 2000).result).toBe('hit');
    expect(s.handChips).toHaveLength(CONFIG.expression.handSize);
    // The specific chips it consumed are gone (multiset comparison).
    const pool = [...before];
    for (const t of tokens) {
      if (t.kind === 'num') pool.splice(pool.indexOf(t.value), 1);
    }
    for (const chip of pool) expect(s.handChips).toContain(chip);
  });

  it('refuses an expression using chips the player does not hold', () => {
    const s = freshSession();
    firstTarget(s);
    const notInHand = 97; // outside the chip range entirely
    const outcome = s.fire([num(notInHand), op('+'), num(notInHand)], 2000);
    expect(outcome).toEqual({ result: 'invalid', reason: 'not-in-hand' });
  });

  it('scrapping swaps a chip and costs combo clock', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    s.fire(solutionFor(s, problem), 1000); // get a combo going
    const clockBefore = s.comboFraction;

    expect(s.scrapChip(0)).not.toBeNull();
    expect(s.handChips).toHaveLength(CONFIG.expression.handSize);
    expect(s.comboFraction).toBeLessThan(clockBefore);
    expect(s.scrapChip(99)).toBeNull();
  });
});

describe('recalibration', () => {
  it('scrapping a chip never strands a falling target', () => {
    // Scrap is the third way the hand changes (fire and redeal are the
    // others), and it must honour the same promise: every number in the air
    // stays makeable with the chips in the tray.
    const s = freshSession({ seed: 17 });
    for (let wave = 0; wave < 8; wave++) {
      s.nextWave();
      while (s.liveTargets.length < CONFIG.expression.targetsOnScreen && s.spawnTarget()) {
        /* fill the air */
      }
      let step = 0;
      while (s.liveTargets.length > 0 && step < 30) {
        s.scrapChip(step % CONFIG.expression.handSize);
        step += 1;
        for (const live of s.liveTargets) {
          expect(
            solveTarget(s.handChips, live.target, CONFIG.expression.maxChips),
            `after scrap, target ${live.target} unreachable from ${s.handChips.join(',')}`,
          ).not.toBeNull();
        }
        const target = s.liveTargets[0]!;
        expect(s.fire(solutionFor(s, target), 2000).result).toBe('hit');
        if (s.liveTargets.length < CONFIG.expression.targetsOnScreen) s.spawnTarget();
      }
      s.endWave();
    }
  });

  it('re-rolls a live target the spent chips put out of reach', () => {
    // Drive many hits with two targets in the air and assert the invariant that
    // matters: every live target is always solvable with the current hand.
    const s = freshSession({ seed: 31 });
    let recalibrations = 0;
    for (let wave = 0; wave < 8; wave++) {
      s.nextWave();
      while (s.liveTargets.length < CONFIG.expression.targetsOnScreen && s.spawnTarget()) {
        /* fill the air */
      }
      while (s.liveTargets.length > 0) {
        const target = s.liveTargets[0]!;
        const outcome = s.fire(solutionFor(s, target), 2000);
        expect(outcome.result).toBe('hit');
        if (outcome.result === 'hit') recalibrations += outcome.recalibrated.length;

        for (const live of s.liveTargets) {
          expect(
            solveTarget(s.handChips, live.target, CONFIG.expression.maxChips),
            `live target ${live.target} unreachable from ${s.handChips.join(',')}`,
          ).not.toBeNull();
        }
        if (s.liveTargets.length < CONFIG.expression.targetsOnScreen) s.spawnTarget();
      }
      s.endWave();
    }
    // The guard should have actually fired at least once over that many hits,
    // otherwise this test proves nothing.
    expect(recalibrations).toBeGreaterThan(0);
  });

  it('never puts two live targets on the same number', () => {
    const s = freshSession({ seed: 5 });
    for (let wave = 0; wave < 5; wave++) {
      s.nextWave();
      while (s.liveTargets.length < CONFIG.expression.targetsOnScreen && s.spawnTarget()) {
        /* fill the air */
      }
      const values = s.liveTargets.map((t) => t.target);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe('scoring and rating', () => {
  it('credits exactly the skills of the fired expression', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    const solution = solutionFor(s, problem);
    const expected = skillsForTokens(solution);
    expect(expected.length).toBeGreaterThan(0);

    expect(s.fire(solution, 2000).result).toBe('hit');

    const attempted = Object.entries(s.skillTable)
      .filter(([, state]) => state.attempts > 0)
      .map(([id]) => id);
    // Not "at least these" — exactly these. The generator's own route must not
    // leave a mark when the player took a different one.
    expect(attempted.sort()).toEqual([...expected].sort());
  });

  it('pays a par bonus only for a par-length solution', () => {
    const s = freshSession({ seed: 21 });
    let sawPar = false;
    for (let wave = 0; wave < 6 && !sawPar; wave++) {
      s.nextWave();
      let problem = s.spawnTarget();
      while (problem) {
        const outcome = s.fire(solutionFor(s, problem), 1500);
        if (outcome.result === 'hit') {
          // solutionFor returns a par-length example, so the bonus must apply.
          expect(outcome.parBonus).toBe(CONFIG.expression.parBonus);
          sawPar = true;
        }
        problem = s.spawnTarget();
      }
      s.endWave();
    }
    expect(sawPar).toBe(true);
  });

  it('a wrong value breaks the combo but costs no chips and no hp', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    s.fire(solutionFor(s, problem), 1000);
    expect(s.streak).toBe(1);

    const hand = [...s.handChips];
    const outcome = s.fire([num(hand[0]!), op('+'), num(hand[1]!)], 1000);
    if (outcome.result === 'wrong') {
      expect(s.streak).toBe(0);
      expect(s.hp).toBe(CONFIG.meteors.baseHp);
      expect(s.misses).toBe(0);
      expect(s.handChips).toEqual(hand);
    }
  });

  it('invalid expressions report a reason and change nothing', () => {
    const s = freshSession();
    firstTarget(s);
    const hand = [...s.handChips];
    expect(s.fire([num(hand[0]!), op('+')], 1000)).toEqual({
      result: 'invalid',
      reason: 'malformed',
    });
    expect(s.handChips).toEqual(hand);
    expect(s.hp).toBe(CONFIG.meteors.baseHp);
  });
});

describe('run flow', () => {
  it('a landed target costs hp and breaks the combo', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    s.fire(solutionFor(s, problem), 1500);
    expect(s.streak).toBe(1);

    const next = s.spawnTarget()!;
    s.recordMiss(next, 20000);
    expect(s.streak).toBe(0);
    expect(s.hp).toBe(CONFIG.meteors.baseHp - 1);
    expect(s.liveTargets.find((t) => t.id === next.id)).toBeUndefined();
  });

  it('game over at zero hp', () => {
    const s = freshSession();
    s.nextWave();
    for (let i = 0; i < CONFIG.meteors.baseHp; i++) {
      const problem = s.spawnTarget();
      if (!problem) break;
      s.recordMiss(problem, 30000);
    }
    expect(s.gameOver).toBe(true);
  });

  it('offers a coach tip after a wave with attempts', () => {
    const s = freshSession();
    s.nextWave();
    let problem = s.spawnTarget();
    while (problem) {
      s.fire(solutionFor(s, problem), 15000);
      problem = s.spawnTarget();
    }
    expect(s.endWave()).toBeDefined();
  });

  it('is deterministic for the same seed', () => {
    const targets = (seed: number): number[] => {
      const s = freshSession({ seed });
      s.nextWave();
      const out: number[] = [];
      let problem = s.spawnTarget();
      while (problem) {
        out.push(problem.target);
        s.fire(solutionFor(s, problem), 2000);
        problem = s.spawnTarget();
      }
      return out;
    };
    expect(targets(123)).toEqual(targets(123));
  });

  it('bigger puzzles fall longer', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    const small = { ...problem, par: 2 };
    const large = { ...problem, par: 4 };
    expect(s.fallSeconds(large)).toBeGreaterThan(s.fallSeconds(small));
  });

  it('tracks operator usage from fired expressions', () => {
    const s = freshSession();
    const problem = firstTarget(s);
    expect(s.fire(solutionFor(s, problem), 2000).result).toBe('hit');
    const total = Object.values(s.operatorUsage).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });
});
