import { describe, expect, it } from 'vitest';
import { selectTip } from '../src/core/coach/select';
import { TIPS, tipForSkill } from '../src/core/coach/tips';
import { CONFIG } from '../src/core/config';
import { createSkillTable, type SkillTable } from '../src/core/skills/rating';
import { allSkillIds, getSkill } from '../src/core/skills/taxonomy';

describe('the tip bank covers the taxonomy', () => {
  it('every skill has a tip', () => {
    // The coach silently skips a skill with no tip, so a missing entry is not
    // a gap on screen — it is a skill the operator can never talk about, and
    // nothing would ever say so. A new taxonomy entry must land here too.
    for (const id of allSkillIds()) {
      const tip = tipForSkill(id);
      expect(tip, `no tip for ${id}`).toBeDefined();
      expect(tip!.text.length).toBeGreaterThan(0);
    }
  });

  it('every tip points at a real skill, exactly once', () => {
    const seen = new Set<string>();
    for (const tip of TIPS) {
      expect(() => getSkill(tip.skillId)).not.toThrow();
      expect(seen.has(tip.skillId), `duplicate tip for ${tip.skillId}`).toBe(false);
      seen.add(tip.skillId);
    }
  });
});

describe('tip selection', () => {
  const RECENCY = 3;

  function tableWith(
    entries: Record<string, { rating: number; attempts?: number; lastAttemptWave?: number }>,
  ): SkillTable {
    const table = createSkillTable(allSkillIds(), CONFIG.rating);
    for (const [id, patch] of Object.entries(entries)) {
      const state = table[id];
      if (!state) throw new Error(`test table patches unknown skill ${id}`);
      table[id] = {
        ...state,
        rating: patch.rating,
        attempts: patch.attempts ?? 5,
        lastAttemptWave: patch.lastAttemptWave ?? 10,
      };
    }
    return table;
  }

  it('picks the lowest rated skill among those recently attempted', () => {
    const table = tableWith({
      'add.single': { rating: 900 },
      'sub.borrow': { rating: 300 },
      'mul.table.7': { rating: 600 },
    });
    expect(selectTip(table, 10, RECENCY)?.skillId).toBe('sub.borrow');
  });

  it('ignores skills never attempted, however low they sit', () => {
    // A fresh table is all initial ratings and zero attempts — tipping the
    // player about a skill they have not met is a lecture, not coaching.
    const table = tableWith({ 'mul.table.9': { rating: 800 } });
    expect(selectTip(table, 10, RECENCY)?.skillId).toBe('mul.table.9');
  });

  it('ignores skills attempted outside the recency window', () => {
    const table = tableWith({
      'sub.borrow': { rating: 300, lastAttemptWave: 2 },
      'mul.table.7': { rating: 600, lastAttemptWave: 9 },
    });
    expect(selectTip(table, 10, RECENCY)?.skillId).toBe('mul.table.7');
  });

  it('does not repeat the last tip while another candidate exists', () => {
    const table = tableWith({
      'sub.borrow': { rating: 300 },
      'mul.table.7': { rating: 600 },
    });
    expect(selectTip(table, 10, RECENCY, 'sub.borrow')?.skillId).toBe('mul.table.7');
  });

  it('repeats the last tip when it is the only candidate', () => {
    const table = tableWith({ 'sub.borrow': { rating: 300 } });
    expect(selectTip(table, 10, RECENCY, 'sub.borrow')?.skillId).toBe('sub.borrow');
  });

  it('returns undefined when nothing has been attempted recently', () => {
    const table = createSkillTable(allSkillIds(), CONFIG.rating);
    expect(selectTip(table, 10, RECENCY)).toBeUndefined();
  });

  it('skips ids the taxonomy has retired, which old saves may still hold', () => {
    const table = tableWith({ 'mul.table.7': { rating: 600 } });
    table['mul.table.13'] = {
      rating: 100,
      attempts: 5,
      correct: 3,
      fluency: 0,
      lastAttemptWave: 10,
    };
    expect(selectTip(table, 10, RECENCY)?.skillId).toBe('mul.table.7');
  });

  it('the tip returned is the tip for the skill picked', () => {
    const table = tableWith({ 'div.by.7': { rating: 250 } });
    const pick = selectTip(table, 10, RECENCY);
    expect(pick?.tip).toBe(tipForSkill('div.by.7'));
  });
});
