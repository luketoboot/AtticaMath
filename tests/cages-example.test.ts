import { describe, expect, it } from 'vitest';
import {
  cageEdges,
  cageHead,
  cageSatisfied,
  countSolutions,
  neighbours,
} from '../src/core/cages/cages';
import { EXAMPLE_PUZZLE, EXAMPLE_STEPS } from '../src/core/cages/example';

const SIZE = EXAMPLE_PUZZLE.size;
const CELLS = SIZE * SIZE;

/** The board as it stands before step `n` runs. */
function boardBefore(n: number): number[] {
  const grid = new Array<number>(CELLS).fill(0);
  for (const step of EXAMPLE_STEPS.slice(0, n)) {
    for (const fill of step.fills) grid[fill.cell] = fill.value;
  }
  return grid;
}

describe('the worked example puzzle', () => {
  it('is a puzzle the game could have dealt', () => {
    const covered = EXAMPLE_PUZZLE.cages.flatMap((c) => c.cells).sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: CELLS }, (_, i) => i));
    for (const cage of EXAMPLE_PUZZLE.cages) {
      expect(cage.cells.length, `${cage.target}`).toBeLessThanOrEqual(4);
      const inCage = new Set(cage.cells);
      const reached = new Set([cage.cells[0]!]);
      const queue = [cage.cells[0]!];
      while (queue.length > 0) {
        for (const n of neighbours(queue.pop()!, SIZE)) {
          if (inCage.has(n) && !reached.has(n)) {
            reached.add(n);
            queue.push(n);
          }
        }
      }
      expect(reached.size, 'a cage must be one contiguous region').toBe(cage.cells.length);
    }
  });

  it('labels every cage truthfully against its own answer', () => {
    for (const cage of EXAMPLE_PUZZLE.cages) {
      const values = cage.cells.map((c) => EXAMPLE_PUZZLE.solution[c]!);
      expect(cageSatisfied(cage, values), `${cage.target} ${cage.op}`).toBe(true);
    }
  });

  it('has exactly one answer', () => {
    expect(countSolutions(SIZE, EXAMPLE_PUZZLE.cages, 3)).toBe(1);
  });

  it('shows all four operators, since that is what a player has to recognise', () => {
    const ops = new Set(EXAMPLE_PUZZLE.cages.map((c) => c.op));
    expect([...ops].sort()).toEqual(['add', 'div', 'mul', 'sub']);
  });
});

describe('the walkthrough', () => {
  it('writes every cell exactly once', () => {
    const written = EXAMPLE_STEPS.flatMap((s) => s.fills.map((f) => f.cell)).sort((a, b) => a - b);
    expect(written).toEqual(Array.from({ length: CELLS }, (_, i) => i));
  });

  it('writes the answer, never something it will have to take back', () => {
    for (const step of EXAMPLE_STEPS) {
      for (const fill of step.fills) {
        expect(fill.value, `cell ${fill.cell}`).toBe(EXAMPLE_PUZZLE.solution[fill.cell]);
      }
    }
  });

  it('opens by stating the rules before writing anything', () => {
    expect(EXAMPLE_STEPS[0]!.fills).toEqual([]);
  });

  it('never asks the player to guess', () => {
    // The claim the mode is built on, applied to its own teaching material: at
    // the moment each digit is written, no other digit could go in that cell —
    // every alternative leaves the rest of the grid unfillable. A step that
    // failed this would be showing a player a leap they could not have made.
    const grid = new Array<number>(CELLS).fill(0);
    for (const [n, step] of EXAMPLE_STEPS.entries()) {
      for (const fill of step.fills) {
        for (let other = 1; other <= SIZE; other++) {
          if (other === fill.value) continue;
          grid[fill.cell] = other;
          const survives = countSolutions(SIZE, EXAMPLE_PUZZLE.cages, 1, grid);
          expect(survives, `step ${n + 1}: cell ${fill.cell} could also have been ${other}`).toBe(0);
        }
        grid[fill.cell] = fill.value;
      }
    }
  });

  it('leaves a solved grid behind', () => {
    expect(boardBefore(EXAMPLE_STEPS.length)).toEqual([...EXAMPLE_PUZZLE.solution]);
  });

  it('lights only cages that exist', () => {
    for (const step of EXAMPLE_STEPS) {
      for (const id of step.lit) {
        expect(EXAMPLE_PUZZLE.cages[id], `cage ${id}`).toBeDefined();
      }
    }
  });

  it('says something at every step, short enough to read at a glance', () => {
    for (const [n, step] of EXAMPLE_STEPS.entries()) {
      expect(step.say.length, `step ${n + 1} is silent`).toBeGreaterThan(20);
      expect(step.say.length, `step ${n + 1} runs off the panel`).toBeLessThan(300);
    }
  });

  it('stays short enough that a stuck player will sit through it', () => {
    expect(EXAMPLE_STEPS.length).toBeLessThanOrEqual(12);
  });
});

describe('cage outlines', () => {
  it('draws a line between two cages and never inside one', () => {
    const edges = cageEdges(SIZE, EXAMPLE_PUZZLE.cages);
    // The 2÷ cage is cells 0 and 4, one above the other: the seam between them
    // is inside the cage, so neither may carry a line along it.
    expect(edges.some((e) => e.cell === 0 && e.y1 === 1 && e.y2 === 1)).toBe(false);
    expect(edges.some((e) => e.cell === 4 && e.y1 === 0 && e.y2 === 0)).toBe(false);
    // ...but the cage's own left side is the grid's edge, and is drawn.
    expect(edges.some((e) => e.cell === 0 && e.x1 === 0 && e.x2 === 0)).toBe(true);
  });

  it('boxes a single-cell cage on all four sides', () => {
    const edges = cageEdges(SIZE, EXAMPLE_PUZZLE.cages).filter((e) => e.cell === 3);
    expect(edges).toHaveLength(4);
  });

  it('writes a label in the cage top-left', () => {
    expect(cageHead({ cells: [7, 11, 15], op: 'add', target: 9 })).toBe(7);
    expect(cageHead({ cells: [11, 7, 15], op: 'add', target: 9 })).toBe(7);
  });
});
