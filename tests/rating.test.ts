import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  applyAttempt,
  createSkillTable,
  expectedScore,
  fluencySample,
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
  const base = { rating: 500, attempts: 20, correct: 20, fluency: 1, lastAttemptWave: 0 };

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

  it('takes an untimed answer at face value, however long it took', () => {
    // Exercise mode invites the player to think. Answering slowly there must
    // not read as answering slowly.
    const slow = updateSkill(base, { correct: true, responseMs: 60000, difficulty: 500, wave: 5 }, cfg);
    const untimed = updateSkill(
      base,
      { correct: true, responseMs: 60000, difficulty: 500, wave: 5, untimed: true },
      cfg,
    );
    expect(untimed.rating).toBeGreaterThan(slow.rating);
    // Neither faster nor slower than target — just unscaled.
    const unscaled = updateSkill(base, { correct: true, responseMs: 4000, difficulty: 500, wave: 5 }, cfg);
    expect(untimed.rating).toBeCloseTo(unscaled.rating, 6);
  });

  it('leaves fluency untouched on an untimed answer', () => {
    const state = { ...base, fluency: 2.4 };
    const next = updateSkill(
      state,
      { correct: true, responseMs: 60000, difficulty: 500, wave: 5, untimed: true },
      cfg,
    );
    expect(next.fluency).toBe(2.4);
    expect(next.correct).toBe(state.correct + 1);
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
    const low = { rating: cfg.minRating + 1, attempts: 50, correct: 50, fluency: 1, lastAttemptWave: 0 };
    const next = updateSkill(low, { correct: false, responseMs: 5000, difficulty: 2000, wave: 1 }, cfg);
    expect(next.rating).toBeGreaterThanOrEqual(cfg.minRating);
  });
});

describe('updateSkill with a graded partial', () => {
  const base = { rating: 500, attempts: 20, correct: 20, fluency: 1, lastAttemptWave: 0 };

  it('moves nothing when the evidence matches expectation', () => {
    // The whole point of the seam: a batch that discriminated no better than
    // chance lands on 0.5, and against a problem at the player's own rating
    // that is exactly the expected score, so the rating holds.
    const next = updateSkill(
      base,
      { correct: false, responseMs: 0, difficulty: 500, wave: 5, untimed: true, partial: 0.5 },
      cfg,
    );
    expect(next.rating).toBeCloseTo(base.rating, 9);
  });

  it('scales the delta between the miss and the hit it replaces', () => {
    const attempt = { correct: true, responseMs: 0, difficulty: 500, wave: 5, untimed: true };
    const miss = updateSkill(base, { ...attempt, partial: 0 }, cfg).rating;
    const half = updateSkill(base, { ...attempt, partial: 0.5 }, cfg).rating;
    const full = updateSkill(base, { ...attempt, partial: 1 }, cfg).rating;
    expect(miss).toBeLessThan(half);
    expect(half).toBeLessThan(full);
  });

  it('overrides the rating delta but never the mastery counter', () => {
    // A batch can be poor evidence and still be a pass, or vice versa. The two
    // must be able to disagree, or d' would be grinding out milestones.
    const next = updateSkill(
      base,
      { correct: true, responseMs: 0, difficulty: 500, wave: 5, untimed: true, partial: 0 },
      cfg,
    );
    expect(next.rating).toBeLessThan(base.rating);
    expect(next.correct).toBe(base.correct + 1);
  });

  it('clamps out of range rather than letting it overshoot a hit', () => {
    const attempt = { correct: true, responseMs: 0, difficulty: 500, wave: 5, untimed: true };
    const over = updateSkill(base, { ...attempt, partial: 1.7 }, cfg);
    const hit = updateSkill(base, { ...attempt, partial: 1 }, cfg);
    expect(over.rating).toBeCloseTo(hit.rating, 9);

    const under = updateSkill(base, { ...attempt, partial: -0.3 }, cfg);
    const miss = updateSkill(base, { ...attempt, partial: 0 }, cfg);
    expect(under.rating).toBeCloseTo(miss.rating, 9);
  });

  it('falls back to the hit/miss bit when the number is not one', () => {
    // A degenerate d' (0/0) must not be able to write NaN into a save file.
    for (const bad of [NaN, Infinity, -Infinity]) {
      const next = updateSkill(
        base,
        { correct: true, responseMs: 0, difficulty: 500, wave: 5, untimed: true, partial: bad },
        cfg,
      );
      expect(Number.isFinite(next.rating)).toBe(true);
      expect(next.rating).toBeGreaterThan(base.rating);
    }
  });

  it('leaves fluency alone, since a batch has no pace', () => {
    const state = { ...base, fluency: 2.4 };
    const next = updateSkill(
      state,
      { correct: true, responseMs: 0, difficulty: 500, wave: 5, untimed: true, partial: 0.95 },
      cfg,
    );
    expect(next.fluency).toBe(2.4);
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

describe('fluency', () => {
  const target = targetLatencyMs(500, cfg);

  it('seeds on the first correct answer rather than easing up from zero', () => {
    const fresh = freshSkillState(cfg);
    const next = updateSkill(fresh, { correct: true, responseMs: target / 2, difficulty: 500, wave: 1 }, cfg);
    // Twice as fast as target, and nothing to average against yet.
    expect(next.fluency).toBeCloseTo(2, 5);
    expect(next.correct).toBe(1);
  });

  it('ignores the clock on a miss — staring time is not recall time', () => {
    const state = { ...freshSkillState(cfg), correct: 3, fluency: 1.8 };
    const next = updateSkill(state, { correct: false, responseMs: 60_000, difficulty: 500, wave: 1 }, cfg);
    expect(next.fluency).toBe(1.8);
    expect(next.correct).toBe(3);
    expect(next.attempts).toBe(1);
  });

  it('moves slowly, so one lucky answer cannot buy fluency', () => {
    let state = { ...freshSkillState(cfg), correct: 1, fluency: 1 };
    state = updateSkill(state, { correct: true, responseMs: 1, difficulty: 500, wave: 1 }, cfg);
    // A single implausibly fast answer is capped and then heavily damped.
    expect(state.fluency).toBeLessThan(1 + cfg.maxFluencySample * cfg.fluencyAlpha);
  });

  it('converges on sustained pace', () => {
    let state = freshSkillState(cfg);
    for (let i = 0; i < 400; i++) {
      state = updateSkill(state, { correct: true, responseMs: target / 2, difficulty: 500, wave: i }, cfg);
    }
    expect(state.fluency).toBeCloseTo(2, 1);
  });

  it('caps a single sample so a zero-time answer cannot dominate', () => {
    expect(fluencySample(0, target, cfg)).toBe(cfg.maxFluencySample);
    expect(fluencySample(1, target, cfg)).toBe(cfg.maxFluencySample);
  });
});
