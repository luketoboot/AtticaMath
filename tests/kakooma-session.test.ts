import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { KakoomaSession } from '../src/core/kakooma/session';
import { kakoomaAttempt } from '../src/core/kakooma/skills';
import { createSkillTable } from '../src/core/skills/rating';
import { SKILLS } from '../src/core/skills/taxonomy';

const fresh = (): KakoomaSession =>
  new KakoomaSession({
    seed: 7,
    skills: createSkillTable(
      SKILLS.map((s) => s.id),
      CONFIG.rating,
    ),
    totalWavesBefore: 0,
  });

/** Solve every cell of the current grid the honest way. */
function clearGrid(session: KakoomaSession): void {
  session.grid.forEach((cell, i) => session.call(i, cell.answer));
}

describe('kakooma skills', () => {
  it('reads the fact that was found, not the cell it was in', () => {
    expect(kakoomaAttempt('add', 7, 8, 15, 9).skillIds).toEqual(['add.bridge']);
    expect(kakoomaAttempt('add', 2, 3, 5, 9).skillIds).toEqual(['add.single']);
    expect(kakoomaAttempt('add', 6, 4, 10, 9).skillIds).toEqual(['add.complement10']);
    expect(kakoomaAttempt('add', 14, 3, 17, 9).skillIds).toEqual(['add.double']);
    expect(kakoomaAttempt('mul', 3, 7, 21, 9).skillIds).toEqual(['mul.table.7']);
  });

  it('rates a found fact harder than a handed one, and harder in a bigger cell', () => {
    // The premise of the mode: nothing points at the 7 or the 8, so the same
    // fact is being tested under a search load.
    const handed = SKILLS.find((s) => s.id === 'add.bridge')!.baseDifficulty;
    const small = kakoomaAttempt('add', 7, 8, 15, 4).difficulty;
    const large = kakoomaAttempt('add', 7, 8, 15, 9).difficulty;
    expect(small).toBeGreaterThan(handed);
    expect(large).toBeGreaterThan(small);
  });

  it('only claims a times table for a fact that is one', () => {
    expect(kakoomaAttempt('mul', 13, 4, 52, 9).skillIds).toEqual(['mul.2x1']);
  });
});

describe('KakoomaSession', () => {
  it('opens with a full grid and a locked final cell', () => {
    const s = fresh();
    expect(s.grid).toHaveLength(CONFIG.kakooma.gridSize);
    expect(s.solvedCells.every((v) => !v)).toBe(true);
    expect(s.finalUnlocked).toBe(false);
  });

  it('refuses the final cell until every cell above it is down', () => {
    const s = fresh();
    expect(s.call(-1, s.final.answer).kind).toBe('refused');
    clearGrid(s);
    expect(s.finalUnlocked).toBe(true);
    expect(s.call(-1, s.final.answer).kind).toBe('grid');
  });

  it('scores a cell and refuses it twice', () => {
    const s = fresh();
    const first = s.call(0, s.grid[0]!.answer);
    expect(first.kind).toBe('solved');
    expect(s.score).toBeGreaterThan(0);
    expect(s.call(0, s.grid[0]!.answer).kind).toBe('refused');
  });

  it('charges a wrong call in seconds and breaks the streak', () => {
    const s = fresh();
    const before = s.timeLeft;
    const cell = s.grid[0]!;
    const wrong = (cell.answer + 1) % cell.values.length;
    const out = s.call(0, wrong);
    expect(out.kind).toBe('wrong');
    expect(s.timeLeft).toBeCloseTo(before - CONFIG.kakooma.wrongPenaltySeconds);
    expect(s.combo).toBe(1);
  });

  it('buys time back for a cleared grid and deals a fresh one', () => {
    const s = fresh();
    clearGrid(s);
    const before = s.timeLeft;
    const out = s.call(-1, s.final.answer);
    expect(out).toMatchObject({ kind: 'grid' });
    expect(s.timeLeft).toBeCloseTo(before + CONFIG.kakooma.gridBonusSeconds);
    expect(s.gridsCleared).toBe(1);
    // A new grid, unsolved and locked again.
    expect(s.solvedCells.every((v) => !v)).toBe(true);
    expect(s.finalUnlocked).toBe(false);
  });

  it('widens the number band as grids fall', () => {
    const s = fresh();
    const first = s.range;
    clearGrid(s);
    s.call(-1, s.final.answer);
    expect(s.range).toBeGreaterThan(first);
  });

  it('caps the band so it cannot run away', () => {
    const s = fresh();
    for (let i = 0; i < 40; i++) {
      clearGrid(s);
      s.call(-1, s.final.answer);
    }
    expect(s.range).toBe(CONFIG.kakooma.add.hardestMax);
  });

  it('runs out of time, and stops taking calls when it does', () => {
    const s = fresh();
    s.tick(CONFIG.kakooma.startSeconds + 1);
    expect(s.over).toBe(true);
    expect(s.call(0, s.grid[0]!.answer).kind).toBe('refused');
  });

  it('moves the rating of the fact that was found', () => {
    const s = fresh();
    const cell = s.grid[0]!;
    const [a, b] = cell.parts;
    const { skillIds } = kakoomaAttempt(
      'add',
      cell.values[a]!,
      cell.values[b]!,
      cell.values[cell.answer]!,
      cell.values.length,
    );
    const before = s.skillTable[skillIds[0]!]!.rating;
    s.call(0, cell.answer);
    expect(s.skillTable[skillIds[0]!]!.rating).toBeGreaterThan(before);
  });

  it('is reproducible from a seed', () => {
    const values = (): number[][] => fresh().grid.map((c) => [...c.values]);
    expect(values()).toEqual(values());
  });
});
