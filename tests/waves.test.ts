import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { createSkillTable, type SkillTable } from '../src/core/skills/rating';
import { allSkillIds, getSkill } from '../src/core/skills/taxonomy';
import { categorizeSkills, composePlacementWave, composeWave } from '../src/core/waves/compose';

function tableWith(overrides: Record<string, { rating: number; attempts?: number; lastAttemptWave?: number }>): SkillTable {
  const table = createSkillTable(allSkillIds(), CONFIG.rating);
  for (const [id, o] of Object.entries(overrides)) {
    table[id] = {
      rating: o.rating,
      attempts: o.attempts ?? 10,
      lastAttemptWave: o.lastAttemptWave ?? 10,
    };
  }
  return table;
}

describe('categorizeSkills', () => {
  it('classifies fluent, frontier and review buckets', () => {
    const wave = 12;
    const table = tableWith({
      'add.single': { rating: getSkill('add.single').baseDifficulty + 300 }, // fluent
      'mul.table.7': { rating: getSkill('mul.table.7').baseDifficulty + 10 }, // frontier
      'div.exact': {
        rating: getSkill('div.exact').baseDifficulty + 200,
        lastAttemptWave: wave - CONFIG.waves.decayedAfterWaves,
      }, // decayed
    });
    const buckets = categorizeSkills(table, wave, CONFIG);
    expect(buckets.fluent).toContain('add.single');
    expect(buckets.frontier).toContain('mul.table.7');
    expect(buckets.review).toContain('div.exact');
  });
});

describe('composeWave', () => {
  it('roughly matches the 70/20/10 configured split', () => {
    const wave = 20;
    // Build a table where all three buckets are well populated and recent.
    const overrides: Record<string, { rating: number; lastAttemptWave?: number }> = {};
    const ids = allSkillIds();
    ids.forEach((id, i) => {
      const base = getSkill(id).baseDifficulty;
      if (i % 3 === 0) overrides[id] = { rating: base + 300, lastAttemptWave: wave - 1 };
      else if (i % 3 === 1) overrides[id] = { rating: base + 10, lastAttemptWave: wave - 1 };
      else overrides[id] = { rating: base + 200, lastAttemptWave: wave - CONFIG.waves.decayedAfterWaves };
    });
    const table = tableWith(overrides);

    const counts = { fluent: 0, frontier: 0, review: 0 };
    let total = 0;
    const rng = createRng(555);
    for (let i = 0; i < 200; i++) {
      const plan = composeWave(table, wave, CONFIG, rng);
      for (const c of plan.categories) {
        counts[c] += 1;
        total += 1;
      }
    }
    expect(counts.fluent / total).toBeGreaterThan(0.6);
    expect(counts.fluent / total).toBeLessThan(0.8);
    expect(counts.frontier / total).toBeGreaterThan(0.12);
    expect(counts.frontier / total).toBeLessThan(0.28);
    expect(counts.review / total).toBeGreaterThan(0.04);
    expect(counts.review / total).toBeLessThan(0.16);
  });

  it('overweights the coached skill', () => {
    const wave = 20;
    // Two frontier skills only; coached one should dominate the frontier draws.
    const overrides: Record<string, { rating: number; lastAttemptWave: number }> = {};
    for (const id of allSkillIds()) {
      overrides[id] = { rating: getSkill(id).baseDifficulty + 10, lastAttemptWave: wave - 1 };
    }
    const table = tableWith(overrides);
    const rng = createRng(31);
    let coachedCount = 0;
    let totalProblems = 0;
    for (let i = 0; i < 50; i++) {
      const plan = composeWave(table, wave, CONFIG, rng, 'mul.table.9');
      for (const p of plan.problems) {
        if (p.skillIds.includes('mul.table.9')) coachedCount += 1;
        totalProblems += 1;
      }
    }
    // Uncoached expectation would be ~1/25 of draws; coached should be well above.
    expect(coachedCount / totalProblems).toBeGreaterThan(2 / 25);
  });

  it('never returns an empty wave even with an empty table', () => {
    const rng = createRng(1);
    const plan = composeWave({}, 1, CONFIG, rng);
    expect(plan.problems.length).toBeGreaterThan(0);
  });
});

describe('composePlacementWave', () => {
  it('sweeps from easy tiers to hard tiers', () => {
    const rng = createRng(77);
    const first = composePlacementWave(1, CONFIG, rng);
    const last = composePlacementWave(CONFIG.waves.placementWaves, CONFIG, rng);
    const avgTier = (plan: typeof first): number => {
      const tiers = plan.problems.map((p) => getSkill(p.skillIds[0]!).tier);
      return tiers.reduce((a, b) => a + b, 0) / tiers.length;
    };
    expect(avgTier(first)).toBeLessThan(avgTier(last));
  });

  it('produces the configured number of problems', () => {
    const rng = createRng(3);
    const plan = composePlacementWave(1, CONFIG, rng);
    expect(plan.problems.length).toBe(CONFIG.waves.placementProblems);
  });
});

describe('meteor payloads', () => {
  it('marks hot meteors only on frontier problems', () => {
    const table = tableWith({});
    const rng = createRng(7);
    let hotSeen = 0;
    let carriersSeen = 0;
    for (let wave = 1; wave <= 12; wave++) {
      const plan = composeWave(table, wave, CONFIG, rng);
      plan.payloads.forEach((payload, i) => {
        if (payload === 'hot') {
          hotSeen += 1;
          expect(plan.categories[i]).toBe('frontier');
        }
        if (payload === 'carrier') carriersSeen += 1;
      });
    }
    // Guard against the assertion above passing because nothing was ever marked.
    expect(hotSeen).toBeGreaterThan(0);
    expect(carriersSeen).toBeGreaterThan(0);
  });

  it('never exceeds the configured counts, and never double-marks a meteor', () => {
    const table = tableWith({});
    const rng = createRng(11);
    for (let wave = 1; wave <= 12; wave++) {
      const plan = composeWave(table, wave, CONFIG, rng);
      expect(plan.payloads).toHaveLength(plan.problems.length);
      const hot = plan.payloads.filter((p) => p === 'hot').length;
      const carriers = plan.payloads.filter((p) => p === 'carrier').length;
      expect(hot).toBeLessThanOrEqual(CONFIG.meteors.hotPerWave);
      expect(carriers).toBeLessThanOrEqual(CONFIG.drops.carriersPerWave);
    }
  });

  it('leaves placement waves unmarked so the sweep stays clean', () => {
    const rng = createRng(3);
    for (let wave = 1; wave <= CONFIG.waves.placementWaves; wave++) {
      const plan = composePlacementWave(wave, CONFIG, rng);
      expect(plan.payloads.every((p) => p === 'none')).toBe(true);
    }
  });
});
