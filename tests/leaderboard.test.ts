import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  LEADERBOARD_MODES,
  MODE_LABEL,
  MODE_TAB_LABEL,
  formatBoardScore,
  formatBoardSecondary,
  formatClock,
  insertScore,
  isInitialChar,
  modeFromSceneKey,
  normalizeBoard,
  normalizeInitials,
  ordinal,
  qualifies,
  rankingFor,
  type ScoreEntry,
} from '../src/core/leaderboard/leaderboard';
import { LocalLeaderboardStore } from '../src/game/leaderboardStore';
import type { StorageAdapter } from '../src/core/save/save';

function entry(initials: string, score: number, at = 1000): ScoreEntry {
  return { initials, score, wave: 3, at };
}

/** In-memory adapter so the store can be tested without a browser. */
function memoryStorage(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    read: (k) => data.get(k) ?? null,
    write: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

describe('initials', () => {
  it('uppercases and keeps three characters', () => {
    expect(normalizeInitials('abc')).toBe('ABC');
    expect(normalizeInitials('LUKE')).toBe('LUK');
    expect(normalizeInitials('A')).toBe('A  ');
    expect(normalizeInitials('')).toBe('   ');
  });

  it('replaces characters it cannot show with blanks', () => {
    expect(normalizeInitials('a!b')).toBe('A B');
    expect(normalizeInitials('<<<')).toBe('   ');
  });

  it('accepts letters, digits and blank at the keyboard', () => {
    expect(isInitialChar('a')).toBe(true);
    expect(isInitialChar('Z')).toBe(true);
    expect(isInitialChar('7')).toBe(true);
    expect(isInitialChar(' ')).toBe(true);
    expect(isInitialChar('!')).toBe(false);
    expect(isInitialChar('ab')).toBe(false);
  });
});

describe('ranking', () => {
  it('orders by score, highest first', () => {
    const board = normalizeBoard([entry('AAA', 100), entry('BBB', 300), entry('CCC', 200)]);
    expect(board.map((e) => e.initials)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('keeps the older entry ahead on a tie', () => {
    const board = normalizeBoard([entry('NEW', 500, 2000), entry('OLD', 500, 1000)]);
    expect(board.map((e) => e.initials)).toEqual(['OLD', 'NEW']);
  });

  it('trims to the board size', () => {
    const many = Array.from({ length: 25 }, (_, i) => entry('AAA', i + 1, i));
    expect(normalizeBoard(many)).toHaveLength(BOARD_SIZE);
    expect(normalizeBoard(many)[0]!.score).toBe(25);
  });

  it('throws out junk rather than showing it', () => {
    const board = normalizeBoard([
      entry('AAA', 0),
      entry('BBB', -50),
      { initials: 'CCC', score: Number.NaN, wave: 1, at: 1 },
      entry('DDD', 10),
    ]);
    expect(board.map((e) => e.initials)).toEqual(['DDD']);
  });

  it('repairs stored entries as it reads them', () => {
    const board = normalizeBoard([{ initials: 'luke!', score: 10.7, wave: -3, at: 5 }]);
    expect(board[0]).toEqual({ initials: 'LUK', score: 10, wave: 0, at: 5 });
  });
});

describe('qualification', () => {
  const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry('AAA', 100 + i * 10, i));

  it('takes anything positive while there is room', () => {
    expect(qualifies([], 1)).toBe(true);
    expect(qualifies([entry('AAA', 9999)], 1)).toBe(true);
  });

  it('refuses a zero or negative score even on an empty board', () => {
    expect(qualifies([], 0)).toBe(false);
    expect(qualifies([], -10)).toBe(false);
  });

  it('needs beating, not matching, once the board is full', () => {
    const lowest = full[BOARD_SIZE - 1]!.score;
    expect(qualifies(full, lowest + 1)).toBe(true);
    expect(qualifies(full, lowest)).toBe(false);
    expect(qualifies(full, lowest - 1)).toBe(false);
  });
});

describe('insertScore', () => {
  it('reports where the entry landed', () => {
    const board = [entry('AAA', 300, 1), entry('BBB', 100, 2)];
    const result = insertScore(board, entry('NEW', 200, 3));
    expect(result.rank).toBe(1);
    expect(result.board.map((e) => e.initials)).toEqual(['AAA', 'NEW', 'BBB']);
  });

  it('reports -1 when the score misses a full board', () => {
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry('AAA', 500 + i, i));
    const result = insertScore(full, entry('LOW', 1, 999));
    expect(result.rank).toBe(-1);
    expect(result.board).toHaveLength(BOARD_SIZE);
  });

  it('does not mutate the board it was given', () => {
    const board = [entry('AAA', 300, 1)];
    insertScore(board, entry('BBB', 400, 2));
    expect(board).toHaveLength(1);
  });
});

describe('a board that ranks on time', () => {
  it('puts the smallest number first', () => {
    const board = normalizeBoard(
      [entry('SLO', 240_000), entry('FST', 92_000), entry('MID', 143_000)],
      BOARD_SIZE,
      'low',
    );
    expect(board.map((e) => e.initials)).toEqual(['FST', 'MID', 'SLO']);
  });

  it('still keeps the older of two identical times ahead', () => {
    const board = normalizeBoard(
      [entry('NEW', 90_000, 2000), entry('OLD', 90_000, 1000)],
      BOARD_SIZE,
      'low',
    );
    expect(board.map((e) => e.initials)).toEqual(['OLD', 'NEW']);
  });

  it('qualifies a time that is under the slowest on a full board', () => {
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry('AAA', 100_000 + i * 1000));
    const board = normalizeBoard(full, BOARD_SIZE, 'low');
    expect(qualifies(board, 99_000, BOARD_SIZE, 'low')).toBe(true);
    expect(qualifies(board, 200_000, BOARD_SIZE, 'low')).toBe(false);
    // Matching the cut is not beating it, exactly as on a points board.
    expect(qualifies(board, board[BOARD_SIZE - 1]!.score, BOARD_SIZE, 'low')).toBe(false);
  });

  it('ranks a new time where it belongs', () => {
    const board = normalizeBoard([entry('AAA', 100_000), entry('BBB', 200_000)], BOARD_SIZE, 'low');
    expect(insertScore(board, entry('NEW', 150_000, 3000), BOARD_SIZE, 'low').rank).toBe(1);
    expect(insertScore(board, entry('WIN', 50_000, 3000), BOARD_SIZE, 'low').rank).toBe(0);
  });

  it('is how the store reads and writes the CAGES board, without being told', () => {
    // The direction belongs to the mode. A caller that had to remember it would
    // eventually forget, and a backwards board looks completely normal.
    const store = new LocalLeaderboardStore(memoryStorage());
    return (async (): Promise<void> => {
      await store.submit('cages', entry('SLO', 240_000, 1));
      await store.submit('cages', entry('FST', 92_000, 2));
      expect((await store.load('cages')).map((e) => e.initials)).toEqual(['FST', 'SLO']);
      // And the points boards are untouched by any of it.
      await store.submit('meteor', entry('LOW', 100, 1));
      await store.submit('meteor', entry('TOP', 9000, 2));
      expect((await store.load('meteor')).map((e) => e.initials)).toEqual(['TOP', 'LOW']);
    })();
  });

  it('names CAGES as the timed one and everything else as points', () => {
    expect(rankingFor('cages')).toBe('low');
    for (const mode of LEADERBOARD_MODES) {
      if (mode !== 'cages') expect(rankingFor(mode), mode).toBe('high');
    }
  });
});

describe('reading a board out', () => {
  it('writes a duration as a stopwatch does', () => {
    expect(formatClock(0)).toBe('0:00.00');
    expect(formatClock(9_990)).toBe('0:09.99');
    expect(formatClock(62_500)).toBe('1:02.50');
    expect(formatClock(600_000)).toBe('10:00.00');
    // Long enough to be embarrassing is still printed honestly rather than
    // rolling over into a good-looking time.
    expect(formatClock(3_723_000)).toBe('62:03.00');
    expect(formatClock(-5)).toBe('0:00.00');
  });

  it('prints points as points and times as times', () => {
    expect(formatBoardScore('meteor', 42_000)).toBe('42000');
    expect(formatBoardScore('cages', 92_340)).toBe('1:32.34');
  });

  it('says what the second number means in the mode it came from', () => {
    expect(formatBoardSecondary('meteor', 12)).toBe('WAVE 12');
    expect(formatBoardSecondary('cages', 0)).toBe('CLEAN');
    expect(formatBoardSecondary('cages', 1)).toBe('1 WRONG');
  });
});

describe('presentation helpers', () => {
  it('maps scene keys to boards, defaulting to meteor', () => {
    expect(modeFromSceneKey('Expression')).toBe('expression');
    expect(modeFromSceneKey('Factor')).toBe('factor');
    expect(modeFromSceneKey('Collapse')).toBe('collapse');
    expect(modeFromSceneKey('Boss')).toBe('boss');
    expect(modeFromSceneKey('Game')).toBe('meteor');
    expect(modeFromSceneKey(undefined)).toBe('meteor');
  });

  it('gives every playable mode a board, a tab and a name', () => {
    // The tab row and the scene-key map are the two places a new mode gets
    // forgotten, so hold them to the mode list rather than to a literal.
    for (const mode of LEADERBOARD_MODES) {
      expect(MODE_LABEL[mode]).toBeTruthy();
      expect(MODE_TAB_LABEL[mode]).toBeTruthy();
    }
    const boards = new Set(
      ['Game', 'Expression', 'Factor', 'Collapse', 'Kakooma', 'Cages'].map(modeFromSceneKey),
    );
    expect([...boards].sort()).toEqual([...LEADERBOARD_MODES].sort());
  });

  it('keeps the benched boss board addressable without giving it a tab', () => {
    // Boss Rush is cut from the menu, but saves may hold boss scores and the
    // dormant scene still resolves its board. Only the tab row forgets it.
    expect(modeFromSceneKey('Boss')).toBe('boss');
    expect(MODE_LABEL.boss).toBeTruthy();
    expect(LEADERBOARD_MODES).not.toContain('boss');
  });

  it('writes ordinals the way a cabinet does', () => {
    expect(ordinal(1)).toBe('1ST');
    expect(ordinal(2)).toBe('2ND');
    expect(ordinal(3)).toBe('3RD');
    expect(ordinal(4)).toBe('4TH');
    expect(ordinal(11)).toBe('11TH');
    expect(ordinal(21)).toBe('21ST');
  });
});

describe('LocalLeaderboardStore', () => {
  it('round-trips a submitted score', async () => {
    const store = new LocalLeaderboardStore(memoryStorage());
    const result = await store.submit('meteor', entry('LUK', 5000));
    expect(result.rank).toBe(0);
    expect(await store.load('meteor')).toHaveLength(1);
  });

  it('keeps each mode on its own board', async () => {
    const store = new LocalLeaderboardStore(memoryStorage());
    await store.submit('meteor', entry('AAA', 100));
    await store.submit('factor', entry('BBB', 200));
    expect((await store.load('meteor')).map((e) => e.initials)).toEqual(['AAA']);
    expect((await store.load('factor')).map((e) => e.initials)).toEqual(['BBB']);
    expect(await store.load('boss')).toEqual([]);
  });

  it('remembers the last initials used', async () => {
    const store = new LocalLeaderboardStore(memoryStorage());
    expect(await store.lastInitials()).toBe('AAA');
    await store.rememberInitials('zed');
    expect(await store.lastInitials()).toBe('ZED');
  });

  it('survives corrupt storage instead of throwing', async () => {
    const storage = memoryStorage();
    storage.write('mathgame.board.meteor', '{ not json');
    const store = new LocalLeaderboardStore(storage);
    expect(await store.load('meteor')).toEqual([]);

    storage.write('mathgame.board.factor', '{"nope":true}');
    expect(await store.load('factor')).toEqual([]);
  });

  it('never grows past the board size', async () => {
    const store = new LocalLeaderboardStore(memoryStorage());
    for (let i = 0; i < BOARD_SIZE + 8; i++) {
      await store.submit('meteor', entry('AAA', 100 + i, i));
    }
    expect(await store.load('meteor')).toHaveLength(BOARD_SIZE);
  });
});
