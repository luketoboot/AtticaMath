import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { earnedMilestones, newMilestones } from '../src/core/skills/milestones';
import type { SkillTable } from '../src/core/skills/rating';
import { getSkill } from '../src/core/skills/taxonomy';

const cfg = CONFIG;
const r = cfg.rating;

function mastered(skillId: string): SkillTable[string] {
  return {
    rating: getSkill(skillId).baseDifficulty + r.masteryMargin + 1,
    attempts: r.masteryMinAttempts,
    lastAttemptWave: 5,
  };
}

describe('earnedMilestones', () => {
  it('fires when rating clears the margin with enough attempts', () => {
    const table: SkillTable = { 'mul.table.12': mastered('mul.table.12') };
    const earned = earnedMilestones(table, cfg);
    expect(earned).toEqual([{ id: 'mastery.mul.table.12', label: '12s MASTERED' }]);
  });

  it('does not fire below the attempts floor', () => {
    const table: SkillTable = {
      'mul.table.9': { ...mastered('mul.table.9'), attempts: r.masteryMinAttempts - 1 },
    };
    expect(earnedMilestones(table, cfg)).toEqual([]);
  });

  it('does not fire below the rating margin', () => {
    const table: SkillTable = {
      'div.exact': {
        rating: getSkill('div.exact').baseDifficulty + r.masteryMargin - 10,
        attempts: 50,
        lastAttemptWave: 5,
      },
    };
    expect(earnedMilestones(table, cfg)).toEqual([]);
  });

  it('every skill has a milestone label path', () => {
    const table: SkillTable = {};
    for (const id of ['add.bridge', 'sub.borrow', 'ooo.basic', 'mul.4x1']) {
      table[id] = mastered(id);
    }
    const earned = earnedMilestones(table, cfg);
    expect(earned.length).toBe(4);
    for (const m of earned) expect(m.label.length).toBeGreaterThan(0);
  });
});

describe('newMilestones', () => {
  it('filters out already-surfaced milestones', () => {
    const table: SkillTable = {
      'mul.table.7': mastered('mul.table.7'),
      'mul.table.8': mastered('mul.table.8'),
    };
    const fresh = newMilestones(table, ['mastery.mul.table.7'], cfg);
    expect(fresh.map((m) => m.id)).toEqual(['mastery.mul.table.8']);
  });
});
