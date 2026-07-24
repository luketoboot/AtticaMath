import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  applyAttempt,
  createSkillTable,
  expectedScore,
  freshSkillState,
  speedFactor,
  targetLatencyMs,
  updateSkill,
} from '../src/core/skills/rating';

const cfg = CONFIG.rating;

describe('expectedScore', () => {
  it('is 0.5 when rating equals difficulty', () => {
    expect(expectedScore(500, 500, cfg)).toBeCloseTo(0.5);
  });

  it('rises with rating advantage', () => {
    expect(expectedScore(900, 500, cfg)).toBeGreaterThan(0.85);
    expect(expectedScore(100, 500, cfg)).toBeLessThan(0.15);
  });
});

describe('targetLatencyMs', () => {
  it('uses bands in order', () => {
    expect(targetLatencyMs(100, cfg)).toBe(2500);
    expect(targetLatencyMs(500, cfg)).toBe(4000);
    expect(targetLatencyMs(999, cfg)).toBe(6000);
  });

  it('falls back above the last band', () => {
    expect(targetLatencyMs(2500, cfg)).toBe(cfg.fallbackTargetMs);
  });
});

describe('speedFactor', () => {
  it('rewards fast answers and clamps', () => {
    expect(speedFactor(1000, 4000, cfg)).toBe(cfg.maxSpeedFactor);
    expect(speedFactor(4000, 4000, cfg)).toBeCloseTo(1);
    expect(speedFactor(40000, 4000, cfg)).toBe(cfg.minSpeedFactor);
  });
});

describe('updateSkill', () => {
  const base = { rating: 500, attempts: 20, lastAttemptWave: 0 };

  it('raises rating on a correct answer', () => {
    const next = updateSkill(base, { correct: true, responseMs: 3000, difficulty: 500, wave: 5 }, cfg);
    expect(next.rating).toBeGreaterThan(base.rating);
    expect(next.attempts).toBe(21);
    expect(next.lastAttemptWave).toBe(5);
  });

  it('lowers rating on a miss', () => {
    const next = updateSkill(base, { correct: false, responseMs: 9000, difficulty: 500, wave: 5 }, cfg);
    expect(next.rating).toBeLessThan(base.rating);
  });

  it('fast correct moves more than slow correct', () => {
    const fast = updateSkill(base, { correct: true, responseMs: 1000, difficulty: 500, wave: 5 }, cfg);
    const slow = updateSkill(base, { correct: true, responseMs: 20000, difficulty: 500, wave: 5 }, cfg);
    expect(fast.rating - base.rating).toBeGreaterThan(slow.rating - base.rating);
    expect(slow.rating).toBeGreaterThan(base.rating); // slow correct is still positive
  });

  it('provisional skills move faster', () => {
    const fresh = freshSkillState(cfg);
    const seasoned = { ...fresh, attempts: cfg.provisionalAttempts + 5 };
    const attempt = { correct: true, responseMs: 3000, difficulty: 500, wave: 1 };
    const dFresh = updateSkill(fresh, attempt, cfg).rating - fresh.rating;
    const dSeasoned = updateSkill(seasoned, attempt, cfg).rating - seasoned.rating;
    expect(dFresh).toBeGreaterThan(dSeasoned);
  });

  it('beating a harder problem pays more than an easy one', () => {
    const hard = updateSkill(base, { correct: true, responseMs: 4000, difficulty: 800, wave: 5 }, cfg);
    const easy = updateSkill(base, { correct: true, responseMs: 4000, difficulty: 200, wave: 5 }, cfg);
    expect(hard.rating - base.rating).toBeGreaterThan(easy.rating - base.rating);
  });

  it('clamps to configured bounds', () => {
    const low = { rating: cfg.minRating + 1, attempts: 50, lastAttemptWave: 0 };
    const next = updateSkill(low, { correct: false, responseMs: 5000, difficulty: 2000, wave: 1 }, cfg);
    expect(next.rating).toBeGreaterThanOrEqual(cfg.minRating);
  });
});

describe('applyAttempt', () => {
  it('updates every component skill and leaves others alone', () => {
    const table = createSkillTable(['add.single', 'add.bridge', 'mul.table.9'], cfg);
    const next = applyAttempt(
      table,
      ['add.single', 'add.bridge'],
      { correct: true, responseMs: 2000, difficulty: 300, wave: 2 },
      cfg,
    );
    expect(next['add.single']!.rating).toBeGreaterThan(cfg.initialRating);
    expect(next['add.bridge']!.rating).toBeGreaterThan(cfg.initialRating);
    expect(next['mul.table.9']!.rating).toBe(cfg.initialRating);
    // Original table untouched (pure update).
    expect(table['add.single']!.rating).toBe(cfg.initialRating);
  });

  it('creates state for unknown skills on the fly', () => {
    const next = applyAttempt({}, ['div.exact'], { correct: true, responseMs: 2000, difficulty: 600, wave: 1 }, cfg);
    expect(next['div.exact']).toBeDefined();
    expect(next['div.exact']!.attempts).toBe(1);
  });
});
