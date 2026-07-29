import { describe, expect, it } from 'vitest';
import { candidates, exactIndex, matchBuffer } from '../src/core/kakooma/typing';

describe('typing a number you found', () => {
  it('fires on the whole number, not on a prefix that happens to be unique', () => {
    // 13 is the only number here starting with 1, but firing on the 1 alone
    // would leave the 3 arriving with nothing to mean — a buzz at a player who
    // typed exactly the right thing.
    expect(matchBuffer([13, 5, 8], '1')).toEqual({ kind: 'wait', candidates: [0] });
    expect(matchBuffer([13, 5, 8], '13')).toEqual({ kind: 'fire', index: 0 });
    expect(matchBuffer([13, 5, 8], '5')).toEqual({ kind: 'fire', index: 1 });
  });

  it('waits while a number is still the start of another', () => {
    // The case that broke it: typing "20" in a cell holding a 2 as well.
    const values = [2, 20, 7];
    expect(matchBuffer(values, '2')).toEqual({ kind: 'wait', candidates: [0, 1] });
    expect(matchBuffer(values, '20')).toEqual({ kind: 'fire', index: 1 });
  });

  it('calls a dead end rather than swallowing it', () => {
    expect(matchBuffer([2, 20, 7], '9')).toEqual({ kind: 'dead' });
    expect(matchBuffer([2, 20, 7], '21')).toEqual({ kind: 'dead' });
  });

  it('settles a doubled number instead of waiting on it forever', () => {
    // A cell holds two tens only when ten is half of its doubled pair, so
    // calling either is the same claim with the same outcome.
    expect(matchBuffer([10, 20, 10], '10')).toEqual({ kind: 'fire', index: 0 });
  });

  it('treats an empty buffer as nothing typed yet', () => {
    expect(matchBuffer([4, 5], '')).toEqual({ kind: 'wait', candidates: [0, 1] });
  });

  it('lists what is still live, so the cell can light them up', () => {
    expect(candidates([1, 12, 15, 3], '1')).toEqual([0, 1, 2]);
    expect(candidates([1, 12, 15, 3], '')).toEqual([0, 1, 2, 3]);
    expect(candidates([1, 12, 15, 3], '4')).toEqual([]);
  });

  it('finds the number written exactly this way, for a hand-committed call', () => {
    // Without this, "2" in a cell holding 2 and 20 could never be meant.
    expect(exactIndex([2, 20, 7], '2')).toBe(0);
    expect(exactIndex([2, 20, 7], '20')).toBe(1);
    expect(exactIndex([2, 20, 7], '3')).toBeUndefined();
    expect(exactIndex([2, 20, 7], '')).toBeUndefined();
  });

  it('never fires on a number the cell does not hold', () => {
    const values = [11, 14, 3, 8];
    for (const buffer of ['1', '11', '14', '3', '8']) {
      const match = matchBuffer(values, buffer);
      if (match.kind === 'fire') expect(values[match.index]).toBeDefined();
    }
    expect(matchBuffer(values, '2').kind).toBe('dead');
  });
});
