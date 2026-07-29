import { describe, expect, it } from 'vitest';
import {
  answerValue,
  generateCell,
  generatePuzzle,
  isWellFormed,
  relationships,
  type KakoomaOptions,
} from '../src/core/kakooma/kakooma';
import { createRng } from '../src/core/rng';

const ADD: KakoomaOptions = { op: 'add', max: 20, cellSize: 9, gridSize: 9 };
const MUL: KakoomaOptions = { op: 'mul', max: 60, cellSize: 9, gridSize: 9 };

describe('relationships', () => {
  it('finds the sum hiding in a group', () => {
    const found = relationships([7, 15, 8, 3], 'add');
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ a: 0, b: 2, answer: 1 });
  });

  it('will not let a number be its own part', () => {
    // 4 + 4 = 8 needs two fours on the table, not one used twice.
    expect(relationships([4, 8, 9], 'add')).toHaveLength(0);
    expect(relationships([4, 4, 8], 'add')).toHaveLength(1);
  });

  it('counts a pair once, not once per ordering', () => {
    expect(relationships([2, 3, 5], 'add')).toHaveLength(1);
  });

  it('reads products the same way', () => {
    const found = relationships([3, 4, 12, 7], 'mul');
    expect(found).toHaveLength(1);
    expect(found[0]?.answer).toBe(2);
  });

  it('catches an ambiguous group', () => {
    // 1+2=3 and 2+3=5: two different numbers each qualify, so there is no
    // single right answer and the cell is unplayable.
    expect(relationships([1, 2, 3, 5], 'add').length).toBeGreaterThan(1);
    expect(isWellFormed([1, 2, 3, 5], 'add')).toBe(false);
  });
});

describe('generateCell', () => {
  it('hides exactly one relationship, and points at it', () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) {
      const cell = generateCell(rng, ADD);
      expect(cell).toBeDefined();
      expect(isWellFormed(cell!.values, 'add')).toBe(true);
      const [a, b] = cell!.parts;
      expect(cell!.values[a]! + cell!.values[b]!).toBe(answerValue(cell!));
    }
  });

  it('never lets the answer be found by taking the largest number', () => {
    // The point of bounding the whole cell rather than the addends. If the sum
    // were always the biggest thing on screen there would be nothing to search.
    const rng = createRng(5);
    let answerWasLargest = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
      const cell = generateCell(rng, ADD)!;
      if (answerValue(cell) === Math.max(...cell.values)) answerWasLargest += 1;
    }
    expect(answerWasLargest).toBeLessThan(runs * 0.6);
  });

  it('fills the cell to the requested size', () => {
    const rng = createRng(3);
    for (const cellSize of [4, 6, 9]) {
      const cell = generateCell(rng, { ...ADD, cellSize })!;
      expect(cell.values).toHaveLength(cellSize);
    }
  });

  it('repeats a number only to put a double on the table', () => {
    // 7 + 7 = 14 needs two sevens, and doubles are worth drilling, so the cell
    // is not all-distinct. But that is the *only* repeat allowed: any other
    // would give the player two identical numbers to choose between.
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) {
      const cell = generateCell(rng, ADD)!;
      const [a, b] = cell.parts;
      const doubled = cell.values[a] === cell.values[b];
      expect(new Set(cell.values).size).toBe(cell.values.length - (doubled ? 1 : 0));
    }
  });

  it('lands on a demanded answer, which is what makes the grid nest', () => {
    const rng = createRng(9);
    for (const target of [9, 12, 17, 20]) {
      const cell = generateCell(rng, ADD, target);
      expect(cell).toBeDefined();
      expect(answerValue(cell!)).toBe(target);
    }
  });

  it('gives up rather than looping when the range cannot hide a relationship', () => {
    // Nothing under 4 has room for a + b = c with three distinct numbers.
    expect(generateCell(createRng(1), { ...ADD, max: 3, cellSize: 4 })).toBeUndefined();
  });

  it('works in products as well as sums', () => {
    const rng = createRng(21);
    for (let i = 0; i < 100; i++) {
      const cell = generateCell(rng, { op: 'mul', max: 100, cellSize: 6, gridSize: 6 })!;
      expect(isWellFormed(cell.values, 'mul')).toBe(true);
      const [a, b] = cell.parts;
      expect(cell.values[a]! * cell.values[b]!).toBe(answerValue(cell));
    }
  });

  it('plants only times-table facts in a product cell', () => {
    // Left unbounded the generator happily plants 29 x 2 = 58 — arithmetic, but
    // not a fact anybody drills, and the skill mapping has nowhere to put it.
    const rng = createRng(31);
    for (let i = 0; i < 200; i++) {
      const cell = generateCell(rng, MUL)!;
      const [a, b] = cell.parts;
      expect(Math.max(cell.values[a]!, cell.values[b]!)).toBeLessThanOrEqual(12);
    }
  });

  it('fills a product cell only with plausible factors and products', () => {
    // A 47 on a multiplication board is dead weight: nobody considers it as a
    // factor or a product, so the search collapses onto the small numbers.
    const plausible = new Set<number>();
    for (let a = 2; a <= 12; a++) {
      plausible.add(a);
      for (let b = a; b <= 12; b++) plausible.add(a * b);
    }
    const rng = createRng(8);
    for (let i = 0; i < 200; i++) {
      for (const value of generateCell(rng, MUL)!.values) {
        expect(plausible.has(value)).toBe(true);
      }
    }
  });

  it('is reproducible from a seed', () => {
    expect(generateCell(createRng(77), ADD)).toEqual(generateCell(createRng(77), ADD));
    expect(generateCell(createRng(77), MUL)).toEqual(generateCell(createRng(77), MUL));
  });
});

describe('generatePuzzle', () => {
  it('nests: the answers of the cells are themselves a cell', () => {
    const rng = createRng(13);
    for (let i = 0; i < 40; i++) {
      const puzzle = generatePuzzle(rng, ADD);
      expect(puzzle).toBeDefined();
      const answers = puzzle!.cells.map(answerValue);
      // The final cell is exactly what the grid spells out, in order.
      expect(answers).toEqual([...puzzle!.final.values]);
      expect(isWellFormed(puzzle!.final.values, 'add')).toBe(true);
    }
  });

  it('gives every cell exactly one answer', () => {
    const puzzle = generatePuzzle(createRng(4), ADD)!;
    expect(puzzle.cells).toHaveLength(9);
    for (const cell of puzzle.cells) {
      expect(relationships(cell.values, 'add')).toHaveLength(1);
    }
  });

  it('nests products too', () => {
    const rng = createRng(17);
    for (let i = 0; i < 20; i++) {
      const puzzle = generatePuzzle(rng, MUL);
      expect(puzzle).toBeDefined();
      expect(puzzle!.cells.map(answerValue)).toEqual([...puzzle!.final.values]);
      expect(isWellFormed(puzzle!.final.values, 'mul')).toBe(true);
    }
  });

  it('is reproducible from a seed', () => {
    const a = generatePuzzle(createRng(101), ADD);
    const b = generatePuzzle(createRng(101), ADD);
    expect(a).toEqual(b);
  });
});
