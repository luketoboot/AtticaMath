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
    const filter: SkillFilter = { op: 'add', maxDigits: 4 };
    expect(skillMatchesFilter(getSkill('add.double'), filter)).toBe(true);
    expect(skillMatchesFilter(getSkill('sub.borrow'), filter)).toBe(false);
    expect(skillMatchesFilter(getSkill('mul.table.7'), filter)).toBe(false);
  });

  it('digit cap is a ceiling, not an exact match', () => {
    const filter: SkillFilter = { op: 'add', maxDigits: 3 };
    expect(skillMatchesFilter(getSkill('add.single'), filter)).toBe(true); // 1 digit
    expect(skillMatchesFilter(getSkill('add.double'), filter)).toBe(true); // 2 digits
    expect(skillMatchesFilter(getSkill('add.triple'), filter)).toBe(true); // 3 digits
    expect(skillMatchesFilter(getSkill('add.quad'), filter)).toBe(false); // 4 digits out
  });

  it("'all' admits every family including mixed", () => {
    const filter: SkillFilter = { op: 'all', maxDigits: 4 };
    expect(filteredSkillIds(filter).length).toBe(allSkillIds().length);
  });

  it('every op/digit combination has at least one skill', () => {
    for (const op of ['add', 'sub', 'mul', 'div'] as const) {
      for (const maxDigits of [1, 2, 3, 4] as const) {
        const ids = filteredSkillIds({ op, maxDigits });
        expect(ids.length, `${op} @ ${maxDigits} digits is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('filtered wave composition', () => {
  it('composeWave only emits problems from the filtered pool', () => {
    const filter: SkillFilter = { op: 'sub', maxDigits: 2 };
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
    const filter: SkillFilter = { op: 'mul', maxDigits: 1 };
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
    const filter: SkillFilter = { op: 'add', maxDigits: 2 };
    const s = new RunSession({
      seed: 9,
      skills: {},
      totalWavesBefore: 0,
      placementDone: false,
      ownedUpgrades: [],
      loadout: [],
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
