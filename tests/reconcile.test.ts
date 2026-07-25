import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { defaultSave, loadSave, memoryAdapter, writeSave } from '../src/core/save/save';
import { reconcileTable } from '../src/core/skills/placement';
import { createSkillTable, type SkillTable } from '../src/core/skills/rating';
import { allSkillIds, getSkill, maxTier } from '../src/core/skills/taxonomy';
import { composeWave } from '../src/core/waves/compose';

/**
 * Stand-ins for "skills the taxonomy grew after this profile placed". Real ids
 * so getSkill resolves, but the tests only assume they exist, not which ones.
 */
const LATE = ['add.complement10', 'add.complement100', 'sub.zeros', 'pct.what'] as const;

/** A post-placement table from before LATE existed, at a uniform gap vs base. */
function elderTable(gap: number): SkillTable {
  const table = createSkillTable(
    allSkillIds().filter((id) => !LATE.includes(id as (typeof LATE)[number])),
    CONFIG.rating,
  );
  for (const [id, state] of Object.entries(table)) {
    state.rating = getSkill(id).baseDifficulty + gap;
    state.attempts = 5;
  }
  return table;
}

describe('reconcileTable', () => {
  it('fills exactly the missing ids and touches nothing else', () => {
    const table = elderTable(50);
    const next = reconcileTable(table, CONFIG);
    expect(Object.keys(next).sort()).toEqual(allSkillIds().sort());
    for (const id of Object.keys(table)) {
      expect(next[id]).toBe(table[id]); // same object, not a copy at a new rating
    }
    for (const id of LATE) {
      expect(next[id]!.attempts).toBe(0);
      expect(next[id]!.lastAttemptWave).toBe(-1);
    }
  });

  it('returns the table unchanged when nothing is missing', () => {
    const full = createSkillTable(allSkillIds(), CONFIG.rating);
    expect(reconcileTable(full, CONFIG)).toBe(full);
  });

  it('is idempotent', () => {
    const once = reconcileTable(elderTable(50), CONFIG);
    expect(reconcileTable(once, CONFIG)).toBe(once);
  });

  it('seeds fluent for a profile above par everywhere', () => {
    const next = reconcileTable(elderTable(CONFIG.waves.fluentMargin), CONFIG);
    for (const id of LATE) {
      expect(next[id]!.rating).toBe(getSkill(id).baseDifficulty + CONFIG.waves.fluentMargin);
    }
  });

  it('seeds at or below base for a profile below par from the first tier', () => {
    const next = reconcileTable(elderTable(-100), CONFIG);
    for (const id of LATE) {
      expect(next[id]!.rating).toBeLessThanOrEqual(getSkill(id).baseDifficulty);
    }
  });

  it('seeds around the falloff tier for a mid-progression profile', () => {
    const table = elderTable(0);
    const cut = Math.floor(maxTier() / 2);
    for (const [id, state] of Object.entries(table)) {
      const skill = getSkill(id);
      state.rating = skill.baseDifficulty + (skill.tier < cut ? 80 : -80);
    }
    const next = reconcileTable(table, CONFIG);
    for (const id of LATE) {
      const skill = getSkill(id);
      const expected =
        skill.tier < cut
          ? skill.baseDifficulty + CONFIG.waves.fluentMargin
          : skill.tier === cut
            ? skill.baseDifficulty
            : Math.max(CONFIG.rating.minRating, skill.baseDifficulty - CONFIG.waves.fluentMargin);
      expect(next[id]!.rating).toBe(expected);
    }
  });

  it('handles a retired skill id in the table without exploding', () => {
    const table = elderTable(50);
    table['mul.table.13'] = { rating: 900, attempts: 3, lastAttemptWave: 4 };
    const next = reconcileTable(table, CONFIG);
    expect(next['mul.table.13']).toBe(table['mul.table.13']); // kept, just not rated
    for (const id of LATE) expect(next[id]).toBeDefined();
  });

  it('REGRESSION: skills added after placement become reachable in waves', () => {
    // The bug: composeWave buckets Object.entries(table), so an id absent from
    // an existing save could never be drawn, no matter how many waves passed.
    const table = reconcileTable(elderTable(CONFIG.waves.fluentMargin), CONFIG);
    const rng = createRng(7);
    const seen = new Set<string>();
    for (let w = 1; w < 300; w++) {
      for (const p of composeWave(table, w, CONFIG, rng).problems) {
        p.skillIds.forEach((id) => seen.add(id));
      }
    }
    for (const id of LATE) expect(seen.has(id), `${id} never drawn`).toBe(true);
  });
});

describe('loadSave reconciliation', () => {
  it('patches a placed profile missing taxonomy ids', () => {
    const storage = memoryAdapter();
    const save = defaultSave();
    save.skills = elderTable(50);
    save.placementDone = true;
    writeSave(storage, save);

    const loaded = loadSave(storage);
    for (const id of LATE) expect(loaded.skills[id]).toBeDefined();
  });

  it('leaves an unplaced profile alone — the sweep will seed it', () => {
    const storage = memoryAdapter();
    const save = defaultSave();
    save.placementDone = false;
    writeSave(storage, save);

    expect(Object.keys(loadSave(storage).skills)).toHaveLength(0);
  });
});
