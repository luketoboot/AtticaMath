import { describe, expect, it } from 'vitest';
import { ladderFor, layerAt, type ExerciseProblem } from '../src/core/exercise/layers';
import { placeColumnsFor, resultDigits } from '../src/core/exercise/places';
import { createRng } from '../src/core/rng';

describe('place columns', () => {
  it('leaves products and quotients to the area model', () => {
    expect(placeColumnsFor({ op: 'mul', a: 47, b: 6 }, 0)).toEqual([]);
    expect(placeColumnsFor({ op: 'div', a: 738, b: 6 }, 0)).toEqual([]);
  });

  it('reads a sum column by column, highest place first', () => {
    const columns = placeColumnsFor({ op: 'add', a: 679, b: 834 }, 0);
    // Three places plus the column the carry makes.
    expect(columns.map((c) => c.place)).toEqual([3, 2, 1, 0]);
    expect(resultDigits(columns)).toEqual([1, 5, 1, 3]);
    expect(columns.map((c) => c.event)).toEqual(['none', 'carry', 'carry', 'carry']);
  });

  it('carries out of a column only the one that arrived made overflow', () => {
    // 6 + 3 is nine and stops there; it is the pip from the ones that tips it.
    const columns = placeColumnsFor({ op: 'add', a: 68, b: 34 }, 0);
    const tens = columns.find((c) => c.place === 1)!;
    expect(tens.carryIn).toBe(1);
    expect(tens.held).toBe(10);
    expect(tens.event).toBe('carry');
    expect(resultDigits(columns)).toEqual([1, 0, 2]);
  });

  it('borrows down a cascade the naive reading would miss', () => {
    // The tens of 110 − 19 look fine on their own digits: 1 covers 1. They only
    // fail because the ones already took the one away.
    const columns = placeColumnsFor({ op: 'sub', a: 110, b: 19 }, 0);
    const tens = columns.find((c) => c.place === 1)!;
    expect(tens.lent).toBe(1);
    expect(tens.event).toBe('borrow');
    expect(resultDigits(columns)).toEqual([0, 9, 1]);
  });

  it('empties the places the dial has dropped out of focus', () => {
    const columns = placeColumnsFor({ op: 'add', a: 679, b: 834 }, 1);
    const ones = columns.find((c) => c.place === 0)!;
    expect(ones.live).toBe(false);
    expect(ones.held).toBe(0);
    const tens = columns.find((c) => c.place === 1)!;
    expect(tens.live).toBe(true);
    expect(tens.held).toBe(10);
  });

  it('never asks a column to hold more than two rows of a frame', () => {
    // The renderer draws ten slots in a frame and the overflow beside it, so a
    // column that could hold twenty would have nowhere to put the rest.
    const rng = createRng(7);
    for (let i = 0; i < 400; i++) {
      const a = Math.floor(rng.next() * 9999) + 1;
      const b = Math.floor(rng.next() * 9999) + 1;
      for (const problem of [
        { op: 'add', a, b } as ExerciseProblem,
        { op: 'sub', a: Math.max(a, b), b: Math.min(a, b) } as ExerciseProblem,
      ]) {
        for (const column of placeColumnsFor(problem, 0)) {
          expect(column.held).toBeGreaterThanOrEqual(0);
          expect(column.held).toBeLessThanOrEqual(19);
          expect(column.result).toBeGreaterThanOrEqual(0);
          expect(column.result).toBeLessThanOrEqual(9);
        }
      }
    }
  });

  it('spells out the answer of every rung it is drawn beside', () => {
    // The load-bearing one: the pips on screen have to add up to the number the
    // player is being asked to type, or the picture is lying.
    const rng = createRng(31);
    for (let i = 0; i < 300; i++) {
      const a = Math.floor(rng.next() * 9999) + 1;
      const b = Math.floor(rng.next() * 9999) + 1;
      const problems: ExerciseProblem[] = [
        { op: 'add', a, b },
        { op: 'sub', a: Math.max(a, b), b: Math.min(a, b) },
      ];
      for (const problem of problems) {
        for (const depth of ladderFor(problem)) {
          const columns = placeColumnsFor(problem, depth);
          const spelled = Number(resultDigits(columns).join(''));
          expect(spelled).toBe(layerAt(problem, depth).value);
        }
      }
    }
  });

  it('accounts for every pip it draws', () => {
    // What is held is what arrived, and what remains is what was not taken.
    const rng = createRng(99);
    for (let i = 0; i < 200; i++) {
      const a = Math.floor(rng.next() * 999) + 1;
      const b = Math.floor(rng.next() * 999) + 1;
      for (const column of placeColumnsFor({ op: 'add', a, b }, 0)) {
        expect(column.held).toBe(column.top + column.bottom + column.carryIn);
      }
      for (const column of placeColumnsFor(
        { op: 'sub', a: Math.max(a, b), b: Math.min(a, b) },
        0,
      )) {
        expect(column.held).toBe(column.top - column.lent + (column.event === 'borrow' ? 10 : 0));
        expect(column.result).toBe(column.held - column.taken);
      }
    }
  });
});
