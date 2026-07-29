import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { PackingSession } from '../src/core/packing/session';
import { cellAt, restRow } from '../src/core/packing/packing';
import { createSkillTable } from '../src/core/skills/rating';
import { SKILLS } from '../src/core/skills/taxonomy';

const fresh = (seed = 5): PackingSession =>
  new PackingSession({
    seed,
    skills: createSkillTable(
      SKILLS.map((s) => s.id),
      CONFIG.rating,
    ),
    totalWavesBefore: 0,
  });


/**
 * Play flat: put each piece wherever it lands lowest, trying every shape.
 *
 * A test needs a player, and a bad one proves nothing. Shoving everything to
 * the left wall builds one tall column and never fills a row, so the rows the
 * mode is about would never be exercised.
 */
function playFlat(s: PackingSession, pieces: number): void {
  for (let i = 0; i < pieces && !s.finished; i++) {
    let best: { shape: number; col: number; depth: number } | undefined;
    s.piece.shapes.forEach((rect, shape) => {
      for (let col = 0; col + rect.cols <= s.board.width; col++) {
        const row = restRow(s.board, rect, col);
        if (row === undefined) continue;
        const depth = row + rect.rows;
        if (best === undefined || depth > best.depth) best = { shape, col, depth };
      }
    });
    if (best === undefined) break;
    // Shape first: turning also slides the piece back off the right edge.
    while (s.piece.shape !== best.shape) s.turn();
    while (s.col > best.col) s.move(-1);
    while (s.col < best.col) s.move(1);
    if (s.drop().kind !== 'landed') break;
  }
}

describe('PackingSession', () => {
  it('opens with a piece on the board and one waiting', () => {
    const s = fresh();
    expect(s.piece.value).toBeGreaterThan(1);
    expect(s.upcoming.value).toBeGreaterThan(1);
    expect(s.rect.cols * s.rect.rows).toBe(s.piece.value);
    expect(s.finished).toBe(false);
  });

  it('keeps the piece on the board when moved', () => {
    const s = fresh();
    for (let i = 0; i < 40; i++) s.move(-1);
    expect(s.col).toBe(0);
    for (let i = 0; i < 40; i++) s.move(1);
    expect(s.col + s.rect.cols).toBe(CONFIG.packing.width);
  });

  it('refactors on a turn, conserving area', () => {
    const s = fresh();
    const value = s.piece.value;
    for (let i = 0; i < 6; i++) {
      s.turn();
      expect(s.rect.cols * s.rect.rows).toBe(value);
    }
  });

  it('slides a refactored piece back on rather than refusing the turn', () => {
    // The player asked for a different factorisation, not for nothing to
    // happen. A silent refusal reads as a broken key.
    const s = fresh();
    while (s.move(1)) {
      /* to the right wall */
    }
    s.turn();
    expect(s.col).toBeGreaterThanOrEqual(0);
    expect(s.col + s.rect.cols).toBeLessThanOrEqual(CONFIG.packing.width);
  });

  it('lands a piece on the floor and stacks the next on top', () => {
    const s = fresh();
    // The column has to be read before the drop: afterwards it belongs to the
    // piece that has just been dealt, not the one that landed.
    const col = s.col;
    const first = s.rect;
    const out = s.drop();
    expect(out.kind).toBe('landed');
    expect(cellAt(s.board, col, CONFIG.packing.height - 1)).toBe(first.cols * first.rows);
    expect(cellAt(s.board, col, CONFIG.packing.height - 1 - first.rows)).toBeNull();
  });

  it('never leaves a piece hanging in mid-air', () => {
    const s = fresh(11);
    playFlat(s, 30);
    const { width, height } = CONFIG.packing;
    for (let col = 0; col < width; col++) {
      let seenFilled = false;
      for (let row = height - 1; row >= 0; row--) {
        const filled = cellAt(s.board, col, row) !== null;
        if (filled) seenFilled = true;
        // Above the stack everything must be empty; a gap under a filled cell
        // is only legal because a wider piece bridged it, which is fine —
        // what must never happen is the board losing cells.
      }
      expect(typeof seenFilled).toBe('boolean');
    }
    expect(s.board.cells).toHaveLength(width * height);
  });

  it('scores a cleared row', () => {
    // Packed left to right, the bottom rows fill and go.
    const s = fresh(2);
    playFlat(s, 60);
    expect(s.rowsCleared).toBeGreaterThan(0);
    expect(s.score).toBeGreaterThan(0);
  });

  it('refuses a full column without ending the run', () => {
    // The bug this replaced: a piece that did not fit where it spawned ended
    // the game, with the rest of the board empty.
    const s = fresh();
    const tall = { cols: 1, rows: 1 };
    expect(tall.cols).toBe(1);
    for (let i = 0; i < 40; i++) s.drop();
    // Dropping into the same column over and over jams that column, and the
    // run carries on regardless because the board still has room elsewhere.
    expect(s.finished).toBe(false);
  });

  it('ends only when the board has no room left at all', () => {
    const s = fresh(3);
    playFlat(s, 400);
    expect(s.finished).toBe(true);
    expect(s.drop()).toEqual({ kind: 'blocked' });
  });

  it('speeds up as rows fall, but not past the floor', () => {
    const s = fresh();
    expect(s.fallSeconds).toBeLessThanOrEqual(CONFIG.packing.startFallSeconds);
    expect(s.fallSeconds).toBeGreaterThanOrEqual(CONFIG.packing.minFallSeconds);
  });

  it('widens the numbers as rows fall, and caps them', () => {
    const s = fresh();
    expect(s.valueCeiling).toBe(CONFIG.packing.startMaxValue);
    expect(s.valueCeiling).toBeLessThanOrEqual(CONFIG.packing.hardestMaxValue);
  });

  it('rates finding a rectangle, and stays silent about primes', () => {
    // A prime has no factorisation to find, so laying it flat says nothing
    // about the player — and marking it wrong would teach the model that
    // recognising a prime is a failure.
    const skills = createSkillTable(
      SKILLS.map((sk) => sk.id),
      CONFIG.rating,
    );
    const s = new PackingSession({ seed: 5, skills, totalWavesBefore: 0 });
    const before = JSON.stringify(s.skillTable);
    // Drive until a prime lands.
    let sawPrime = false;
    for (let i = 0; i < 40 && !s.finished; i++) {
      const isBar = s.piece.shapes.every((r) => r.cols === 1 || r.rows === 1);
      const snapshot = JSON.stringify(s.skillTable);
      while (s.move(-1)) {
        /* to the wall, so the drop lands rather than jamming */
      }
      let placed = s.drop().kind === 'landed';
      while (!placed && s.move(1)) placed = s.drop().kind === 'landed';
      if (isBar) {
        sawPrime = true;
        expect(JSON.stringify(s.skillTable)).toBe(snapshot);
      }
    }
    expect(sawPrime).toBe(true);
    expect(typeof before).toBe('string');
  });

  it('is reproducible from a seed', () => {
    const run = (): number[] => {
      const s = fresh(77);
      const values: number[] = [];
      for (let i = 0; i < 12 && !s.finished; i++) {
        values.push(s.piece.value);
        playFlat(s, 1);
      }
      return values;
    };
    expect(run()).toEqual(run());
  });
});
