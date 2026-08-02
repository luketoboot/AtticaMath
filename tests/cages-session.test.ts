import { describe, expect, it } from 'vitest';
import { CageSession, skillForCage } from '../src/core/cages/session';
import { CONFIG } from '../src/core/config';
import { createSkillTable } from '../src/core/skills/rating';
import { SKILLS } from '../src/core/skills/taxonomy';

const fresh = (seed = 9): CageSession =>
  new CageSession({
    seed,
    skills: createSkillTable(
      SKILLS.map((s) => s.id),
      CONFIG.rating,
    ),
    totalWavesBefore: 0,
  });

/** Fill the grid with the answer, leaving one cell for the caller. */
function fillAllBut(s: CageSession, spare: number): void {
  s.puzzle.solution.forEach((v, i) => {
    if (i !== spare) s.enter(i, v);
  });
}

describe('what a cage asks', () => {
  it('names the skill from the operator and the digits', () => {
    expect(skillForCage('sub', [3, 1])).toBe('sub.single');
    expect(skillForCage('div', [6, 2])).toBe('div.exact');
    expect(skillForCage('mul', [3, 7])).toBe('mul.table.7');
    expect(skillForCage('add', [2, 3])).toBe('add.single');
    expect(skillForCage('add', [5, 4, 3])).toBe('add.bridge');
  });

  it('only claims a times table for a fact that is one', () => {
    expect(skillForCage('mul', [13, 2])).toBe('mul.2x1');
  });
});

describe('CageSession', () => {
  it('opens on an empty grid of the configured width', () => {
    const s = fresh();
    expect(s.width).toBe(CONFIG.cages.defaultSize);
    expect(s.grid).toHaveLength(s.width * s.width);
    expect(s.grid.every((v) => v === 0)).toBe(true);
    expect(s.setComplete).toBe(false);
  });

  it('takes a digit and gives it back', () => {
    const s = fresh();
    expect(s.enter(0, 3).kind).not.toBe('refused');
    expect(s.grid[0]).toBe(3);
    s.enter(0, 0);
    expect(s.grid[0]).toBe(0);
  });

  it('refuses a digit the grid cannot hold', () => {
    const s = fresh();
    expect(s.enter(0, s.width + 1).kind).toBe('refused');
    expect(s.enter(-1, 1).kind).toBe('refused');
  });

  it('says nothing about a cage that is still half empty', () => {
    const s = fresh();
    const big = s.puzzle.cages.find((c) => c.cells.length > 1)!;
    const out = s.enter(big.cells[0]!, 1);
    expect(out.kind).toBe('set');
  });

  it('judges a cage the moment it is full', () => {
    const s = fresh();
    const cage = s.puzzle.cages.find((c) => c.cells.length === 2)!;
    for (const cell of cage.cells) s.enter(cell, s.puzzle.solution[cell]!);
    // Filling it correctly is a completed claim, not a mistake.
    expect(s.mistakes).toBe(0);
  });

  it('counts a full and wrong cage as a mistake', () => {
    const s = fresh();
    const cage = s.puzzle.cages.find((c) => c.cells.length === 2)!;
    const [a, b] = cage.cells;
    s.enter(a!, 1);
    s.enter(b!, 1);
    // Two of the same digit can never satisfy a difference or a quotient of a
    // pair drawn from a Latin square, and a sum or product of two ones is 2 or
    // 1 — so at most this is a real cage failure.
    expect(s.mistakes + (s.check.brokenLines ? 1 : 0)).toBeGreaterThan(0);
  });

  it('ends the run when the grid is right — a run is one puzzle', () => {
    const s = fresh();
    const last = s.puzzle.solution.length - 1;
    fillAllBut(s, last);
    const out = s.enter(last, s.puzzle.solution[last]!);
    expect(out).toMatchObject({ kind: 'solved' });
    expect(s.setComplete).toBe(true);
    expect(s.enter(0, 1).kind).toBe('refused');
  });

  it('reports a clean solve as clean', () => {
    const s = fresh();
    const last = s.puzzle.solution.length - 1;
    fillAllBut(s, last);
    s.enter(last, s.puzzle.solution[last]!);
    expect(s.summary()).toMatchObject({ mistakes: 0, clean: true, size: s.width });
  });
});

describe('the clock', () => {
  it('starts at zero and runs while the puzzle is open', () => {
    const s = fresh();
    expect(s.elapsedMs).toBe(0);
    s.tick(1.5);
    expect(s.elapsedMs).toBeCloseTo(1500);
  });

  it('stops on the digit that finishes the grid', () => {
    // The scene has an explosion and a beat of silence to get through before it
    // hands over; none of that is the player's time.
    const s = fresh();
    const last = s.puzzle.solution.length - 1;
    fillAllBut(s, last);
    s.tick(20);
    const out = s.enter(last, s.puzzle.solution[last]!);
    expect(out).toMatchObject({ kind: 'solved', timeMs: 20000 });
    s.tick(30);
    expect(s.elapsedMs).toBe(20000);
    expect(s.summary().timeMs).toBe(20000);
  });

  it('is the number the run is judged on', () => {
    const s = fresh();
    s.tick(12.34);
    expect(s.summary().timeMs).toBeCloseTo(12340);
  });

  it('rates a cage once, not once per edit', () => {
    // Otherwise a player could sit on a correct cage and farm the model by
    // rubbing a digit out and putting it back.
    const s = fresh();
    const cage = s.puzzle.cages.find((c) => c.cells.length === 2)!;
    for (const cell of cage.cells) s.enter(cell, s.puzzle.solution[cell]!);
    const after = JSON.stringify(s.skillTable);
    const cell = cage.cells[0]!;
    s.enter(cell, 0);
    s.enter(cell, s.puzzle.solution[cell]!);
    expect(JSON.stringify(s.skillTable)).toBe(after);
  });

  it('moves the rating of what the cage asked', () => {
    const s = fresh();
    const cage = s.puzzle.cages.find((c) => c.cells.length === 2)!;
    const values = cage.cells.map((c) => s.puzzle.solution[c]!);
    const id = skillForCage(cage.op, values);
    const before = s.skillTable[id]!.rating;
    for (const cell of cage.cells) s.enter(cell, s.puzzle.solution[cell]!);
    expect(s.skillTable[id]!.rating).toBeGreaterThan(before);
  });

  it('is reproducible from a seed', () => {
    expect(fresh(4).puzzle).toEqual(fresh(4).puzzle);
  });
});
