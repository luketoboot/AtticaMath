import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { RunSession } from '../src/core/session';
import { createSkillTable } from '../src/core/skills/rating';
import {
  allSkillIds,
  filteredSkillIds,
  getSkill,
  skillMatchesFilter,
  type SkillFilter,
} from '../src/core/skills/taxonomy';
import { composePlacementWave, composeWave } from '../src/core/waves/compose';

describe('skillMatchesFilter', () => {
  it('filters by operation family', () => {
    const filter: SkillFilter = { op: 'add', maxDigits: 4, fractions: false };
    expect(skillMatchesFilter(getSkill('add.double'), filter)).toBe(true);
    expect(skillMatchesFilter(getSkill('sub.borrow'), filter)).toBe(false);
    expect(skillMatchesFilter(getSkill('mul.table.7'), filter)).toBe(false);
  });

  it('digit cap is a ceiling, not an exact match', () => {
    const filter: SkillFilter = { op: 'add', maxDigits: 3, fractions: false };
    expect(skillMatchesFilter(getSkill('add.single'), filter)).toBe(true); // 1 digit
    expect(skillMatchesFilter(getSkill('add.double'), filter)).toBe(true); // 2 digits
    expect(skillMatchesFilter(getSkill('add.triple'), filter)).toBe(true); // 3 digits
    expect(skillMatchesFilter(getSkill('add.quad'), filter)).toBe(false); // 4 digits out
  });

  it("'all' with fractions admits every skill in the taxonomy", () => {
    const filter: SkillFilter = { op: 'all', maxDigits: 4, fractions: true };
    expect(filteredSkillIds(filter).length).toBe(allSkillIds().length);
  });

  it('the digit cap never smuggles fractions in', () => {
    // The complaint this encodes: asking for two-digit arithmetic used to
    // deliver 3/4 = ?%, because fraction skills carry a digits field too.
    for (const maxDigits of [1, 2, 3, 4] as const) {
      const ids = filteredSkillIds({ op: 'all', maxDigits, fractions: false });
      expect(ids.some((id) => id.startsWith('frac.') || id.startsWith('pct.'))).toBe(false);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it('the fraction toggle ignores the digit cap entirely', () => {
    const ids = filteredSkillIds({ op: 'all', maxDigits: 1, fractions: true });
    // pct.of is a 3-digit skill; the 1-digit cap speaks only for integers.
    expect(ids).toContain('pct.of');
    expect(ids).toContain('frac.percent');
    expect(ids).not.toContain('add.double');
  });

  it('fractions still respect the operation family', () => {
    const add: SkillFilter = { op: 'add', maxDigits: 4, fractions: true };
    expect(skillMatchesFilter(getSkill('frac.add.same'), add)).toBe(true);
    expect(skillMatchesFilter(getSkill('frac.of'), add)).toBe(false); // op mul
    expect(skillMatchesFilter(getSkill('pct.of'), add)).toBe(false); // op mul
  });

  it('every op/digit combination has at least one skill', () => {
    for (const op of ['add', 'sub', 'mul', 'div'] as const) {
      for (const maxDigits of [1, 2, 3, 4] as const) {
        const ids = filteredSkillIds({ op, maxDigits, fractions: false });
        expect(ids.length, `${op} @ ${maxDigits} digits is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('filtered wave composition', () => {
  it('composeWave only emits problems from the filtered pool', () => {
    const filter: SkillFilter = { op: 'sub', maxDigits: 2, fractions: false };
    const table = createSkillTable(allSkillIds(), CONFIG.rating);
    const rng = createRng(5);
    for (let w = 0; w < 20; w++) {
      const plan = composeWave(table, 10 + w, CONFIG, rng, undefined, filter);
      for (const p of plan.problems) {
        for (const id of p.skillIds) {
          expect(skillMatchesFilter(getSkill(id), filter), `${id} escaped the filter`).toBe(true);
        }
      }
    }
  });

  it('placement waves respect the filter', () => {
    const filter: SkillFilter = { op: 'mul', maxDigits: 1, fractions: false };
    const rng = createRng(6);
    for (let w = 1; w <= CONFIG.waves.placementWaves; w++) {
      const plan = composePlacementWave(w, CONFIG, rng, filter);
      expect(plan.problems.length).toBeGreaterThan(0);
      for (const p of plan.problems) {
        for (const id of p.skillIds) {
          expect(skillMatchesFilter(getSkill(id), filter)).toBe(true);
        }
      }
    }
  });

  it('RunSession honors its filter across placement and normal waves', () => {
    const filter: SkillFilter = { op: 'add', maxDigits: 2, fractions: false };
    const s = new RunSession({
      seed: 9,
      skills: {},
      totalWavesBefore: 0,
      placementDone: false,
      filter,
    });
    for (let w = 0; w < 6; w++) {
      const plan = s.nextWave();
      for (const p of plan.problems) {
        for (const id of p.skillIds) {
          expect(skillMatchesFilter(getSkill(id), filter), `${id} escaped in wave ${w + 1}`).toBe(true);
        }
        s.recordHit(p, 2000);
      }
      s.endWave();
    }
  });
});
