import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { earnedMilestones, masteryProgress, newMilestones } from '../src/core/skills/milestones';
import type { SkillTable } from '../src/core/skills/rating';
import { getSkill } from '../src/core/skills/taxonomy';

const cfg = CONFIG;
const r = cfg.rating;

/** Clears all three gates: rating margin, volume of correct answers, and speed. */
function mastered(skillId: string): SkillTable[string] {
  return {
    rating: getSkill(skillId).baseDifficulty + r.masteryMargin + 1,
    attempts: r.masteryMinCorrect,
    correct: r.masteryMinCorrect,
    fluency: r.masteryFluency,
    lastAttemptWave: 5,
  };
}

describe('earnedMilestones', () => {
  it('fires when every gate is cleared', () => {
    const table: SkillTable = { 'mul.table.12': mastered('mul.table.12') };
    const earned = earnedMilestones(table, cfg);
    expect(earned).toEqual([{ id: 'mastery.mul.table.12', label: '12s MASTERED' }]);
  });

  it('does not fire below the volume floor', () => {
    const table: SkillTable = {
      'mul.table.9': { ...mastered('mul.table.9'), correct: r.masteryMinCorrect - 1 },
    };
    expect(earnedMilestones(table, cfg)).toEqual([]);
  });

  it('does not fire below the rating margin', () => {
    // A hard skill, so the rating gate still discriminates: an easy one seeds
    // above its own mastery line and is decided by volume and speed alone.
    const hard = 'mul.3x2';
    const table: SkillTable = {
      [hard]: { ...mastered(hard), rating: getSkill(hard).baseDifficulty + r.masteryMargin - 10 },
    };
    expect(earnedMilestones(table, cfg)).toEqual([]);
  });

  it('does not fire for correct-but-slow answers', () => {
    const table: SkillTable = {
      'mul.table.9': { ...mastered('mul.table.9'), fluency: r.masteryFluency - 0.2 },
    };
    expect(earnedMilestones(table, cfg)).toEqual([]);
  });

  it('counts correct answers, not attempts — misses cannot grind out mastery', () => {
    const table: SkillTable = {
      'mul.table.9': { ...mastered('mul.table.9'), attempts: 10_000, correct: 5 },
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

describe('masteryProgress', () => {
  /**
   * The regression this whole model exists for. Every skill seeds at
   * `initialRating`, which already clears the mastery line of any skill whose
   * base difficulty is low enough — so the old rating-only bar rendered full
   * before the player had answered a single problem.
   */
  it('reads empty for an easy skill at the seed rating', () => {
    const easy = getSkill('add.single');
    expect(easy.baseDifficulty + r.masteryMargin).toBeLessThanOrEqual(r.initialRating);

    const seeded = { rating: r.initialRating, attempts: 0, correct: 0, fluency: 0, lastAttemptWave: -1 };
    expect(masteryProgress(seeded, easy, cfg).overall).toBe(0);
  });

  it('stays near empty after a couple of fast correct answers', () => {
    const easy = getSkill('add.single');
    const twice = { rating: r.initialRating + 40, attempts: 2, correct: 2, fluency: 2, lastAttemptWave: 1 };
    expect(masteryProgress(twice, easy, cfg).overall).toBeLessThan(0.05);
  });

  it('is held back by whichever gate is weakest, and names it', () => {
    const skill = getSkill('mul.table.7');
    const quickButUnproven = {
      rating: 3000,
      attempts: 10,
      correct: 10,
      fluency: r.masteryFluency,
      lastAttemptWave: 1,
    };
    const p = masteryProgress(quickButUnproven, skill, cfg);
    expect(p.limiting).toBe('volume');
    expect(p.overall).toBeCloseTo(10 / r.masteryMinCorrect, 5);

    const manyButSlow = {
      rating: 3000,
      attempts: 500,
      correct: 500,
      fluency: r.masteryFluency / 2,
      lastAttemptWave: 1,
    };
    expect(masteryProgress(manyButSlow, skill, cfg).limiting).toBe('speed');
  });

  it('never reports progress for a skill with no state', () => {
    expect(masteryProgress(undefined, getSkill('add.single'), cfg).overall).toBe(0);
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
