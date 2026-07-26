import { describe, expect, it } from 'vitest';
import {
  drillFilterFor,
  PLAYBOOK_GROUPS,
  TECHNIQUES,
  techniqueForSkill,
  weakestAttempted,
} from '../src/core/coach/techniques';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { RunSession } from '../src/core/session';
import { createSkillTable, type SkillTable } from '../src/core/skills/rating';
import { allSkillIds, getSkill, skillMatchesFilter } from '../src/core/skills/taxonomy';
import { composeWave } from '../src/core/waves/compose';

describe('the playbook covers the taxonomy', () => {
  it('every skill has a technique with a title, a method and worked examples', () => {
    for (const id of allSkillIds()) {
      const tech = techniqueForSkill(id);
      expect(tech, `no technique for ${id}`).toBeDefined();
      expect(tech!.title.length).toBeGreaterThan(0);
      expect(tech!.method.length).toBeGreaterThan(0);
      for (const line of tech!.method) expect(line.length).toBeGreaterThan(0);
      // At least two gaze paths per move: one example reads as the trick's
      // whole domain; two show the move surviving different numbers.
      expect(tech!.examples.length, `${id} needs 2+ examples`).toBeGreaterThanOrEqual(2);
      for (const line of tech!.examples) expect(line.length).toBeGreaterThan(0);
    }
  });

  it('every technique points at a real skill, exactly once', () => {
    const seen = new Set<string>();
    for (const tech of TECHNIQUES) {
      expect(() => getSkill(tech.skillId)).not.toThrow();
      expect(seen.has(tech.skillId), `duplicate technique for ${tech.skillId}`).toBe(false);
      seen.add(tech.skillId);
    }
  });

  it('every skill lands in exactly one browser group', () => {
    for (const id of allSkillIds()) {
      const homes = PLAYBOOK_GROUPS.filter((g) => g.prefixes.some((p) => id.startsWith(p)));
      expect(homes.length, `${id} lives in ${homes.length} groups`).toBe(1);
    }
  });
});

describe('drillFilterFor', () => {
  it('always admits the skill it drills', () => {
    // The one invariant that must never break: a drill whose filter excludes
    // its own skill would weight a skill the wave can never draw.
    for (const id of allSkillIds()) {
      expect(
        skillMatchesFilter(getSkill(id), drillFilterFor(id)),
        `${id} excluded from its own drill`,
      ).toBe(true);
    }
  });

  it('keeps fraction drills out of integer digit gates and vice versa', () => {
    expect(drillFilterFor('pct.of').fractions).toBe(true);
    expect(drillFilterFor('sub.zeros').fractions).toBe(false);
    expect(drillFilterFor('mul.table.9').op).toBe('mul');
    expect(drillFilterFor('frac.lcd').op).toBe('all'); // mixed family opens up
  });
});

describe('weakestAttempted', () => {
  it('picks the lowest-rated skill the player has met', () => {
    const table: SkillTable = {
      'add.single': { rating: 700, attempts: 9, correct: 9, fluency: 1, lastAttemptWave: 4 },
      'sub.borrow': { rating: 380, attempts: 3, correct: 3, fluency: 1, lastAttemptWave: 4 },
      'mul.table.7': { rating: 350, attempts: 0, correct: 0, fluency: 1, lastAttemptWave: -1 }, // seeded, never met
    };
    expect(weakestAttempted(table)).toBe('sub.borrow');
  });

  it('returns undefined with nothing attempted', () => {
    expect(weakestAttempted({})).toBeUndefined();
    expect(weakestAttempted({ 'add.single': { rating: 500, attempts: 0, correct: 0, fluency: 1, lastAttemptWave: -1 } }))
      .toBeUndefined();
  });
});

describe('drilled runs', () => {
  it('a coached skill is overweighted in every wave, not just the first', () => {
    const skills = createSkillTable(allSkillIds(), CONFIG.rating);
    for (const [id, state] of Object.entries(skills)) {
      state.rating = getSkill(id).baseDifficulty + CONFIG.waves.fluentMargin;
      state.attempts = 1;
    }
    const drilled = new RunSession({
      seed: 41,
      skills,
      totalWavesBefore: 0,
      placementDone: true,
      coachedSkill: 'mul.table.7',
    });
    let total = 0;
    let coached = 0;
    for (let w = 0; w < 30; w++) {
      for (const p of drilled.nextWave().problems) {
        total += 1;
        if (p.skillIds.includes('mul.table.7')) coached += 1;
      }
    }
    // coachedSkillWeight adds copies to the draw pool, so the drilled skill
    // should run well past a uniform share of the full taxonomy.
    const uniform = total / allSkillIds().length;
    expect(coached).toBeGreaterThan(uniform * 1.8);
  });

  it('composeWave respects a drill filter and its coached skill together', () => {
    const skills = createSkillTable(allSkillIds(), CONFIG.rating);
    for (const [id, state] of Object.entries(skills)) {
      state.rating = getSkill(id).baseDifficulty + CONFIG.waves.fluentMargin;
      state.attempts = 1;
    }
    const filter = drillFilterFor('sub.zeros');
    const rng = createRng(3);
    for (let w = 1; w < 12; w++) {
      const plan = composeWave(skills, w, CONFIG, rng, 'sub.zeros', filter);
      for (const p of plan.problems) {
        for (const id of p.skillIds) {
          expect(skillMatchesFilter(getSkill(id), filter), `${id} escaped the drill filter`).toBe(
            true,
          );
        }
      }
    }
  });
});
