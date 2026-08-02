import { CONFIG, type GameConfig } from '../config';
import { createRng, type Rng } from '../rng';
import { applyAttempt, type SkillTable } from '../skills/rating';
import { SKILLS, type SkillId } from '../skills/taxonomy';
import { cageSatisfied, checkGrid, generate, type Cage, type CageOp, type CagePuzzle } from './cages';

/**
 * One CAGES puzzle, against a clock.
 *
 * A run is a single grid and the run's result is how long it took, which is
 * what reaches the board. That makes the mode a race, and a race is only fair
 * if the clock measures the same thing for everyone: it starts when the grid is
 * first shown, it stops the moment the last digit lands, and it does not run
 * while the rules or the worked example are open — the scene pauses for those,
 * and a paused scene stops ticking, so reading is free by construction.
 *
 * Rating stays untimed even though the run is not. The clock here is mostly
 * deduction — hunting for the cage that gives, backtracking a wrong guess —
 * and reading that as slowness at the seven times table would teach the model
 * something false about the player's arithmetic. What the ratings see is which
 * cages were right, exactly as before.
 *
 * Rating happens per cage rather than per puzzle. A cage is a self-contained
 * arithmetic claim: fill "24×" with three digits and either they multiply to
 * twenty-four or they do not, and that is evidence about the seven times table
 * or whatever else it took. Rating whole puzzles would blur a dozen separate
 * facts into one verdict.
 */

export interface CageSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  size?: number;
  ops?: readonly CageOp[];
  config?: GameConfig;
}

export type EnterOutcome =
  | { kind: 'set'; cell: number }
  | { kind: 'cage'; cage: number; correct: boolean }
  | { kind: 'solved'; timeMs: number }
  | { kind: 'refused' };

export interface CageSummary {
  /** The run's result, and what the board ranks. */
  timeMs: number;
  mistakes: number;
  clean: boolean;
  size: number;
}

export class CageSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private readonly globalWave: number;
  private readonly size: number;
  private readonly ops: readonly CageOp[];
  private skills: SkillTable;

  private board!: CagePuzzle;
  private values!: number[];
  /** Cages already rated, so holding a cage right does not farm the model. */
  private rated = new Set<number>();
  private elapsed = 0;
  private cageShownAt = 0;
  /** Where the clock stopped, so a solved run's time cannot creep afterwards. */
  private finishedAt: number | undefined;

  private mistakeCount = 0;
  private done = false;

  constructor(init: CageSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = init.skills;
    this.globalWave = init.totalWavesBefore + 1;
    this.size = init.size ?? this.cfg.cages.defaultSize;
    this.ops = init.ops ?? (['add', 'sub', 'mul', 'div'] as const);
    this.deal();
  }

  // --- readouts ---

  get puzzle(): CagePuzzle {
    return this.board;
  }
  get grid(): readonly number[] {
    return this.values;
  }
  /** Milliseconds on the clock: live while playing, frozen once solved. */
  get elapsedMs(): number {
    return this.finishedAt ?? this.elapsed;
  }
  get mistakes(): number {
    return this.mistakeCount;
  }
  /** True once the puzzle is solved. A run is one grid. */
  get setComplete(): boolean {
    return this.done;
  }
  get skillTable(): SkillTable {
    return this.skills;
  }
  get width(): number {
    return this.size;
  }

  get check(): ReturnType<typeof checkGrid> {
    return checkGrid(this.board, this.values);
  }

  /** Which cage a cell belongs to. */
  cageOf(cell: number): number {
    return this.board.cages.findIndex((c) => c.cells.includes(cell));
  }

  // --- play ---

  /** Advance the clock. Not called while the scene is paused, which is the point. */
  tick(dtSeconds: number): void {
    if (this.done) return;
    this.elapsed += dtSeconds * 1000;
  }

  /** Put a digit in a cell, or 0 to rub it out. */
  enter(cell: number, value: number): EnterOutcome {
    if (this.done) return { kind: 'refused' };
    if (cell < 0 || cell >= this.values.length) return { kind: 'refused' };
    if (value < 0 || value > this.size) return { kind: 'refused' };
    if (this.values[cell] === value) return { kind: 'refused' };

    this.values[cell] = value;
    const id = this.cageOf(cell);
    const cage = this.board.cages[id];
    if (!cage) return { kind: 'set', cell };

    const filled = cage.cells.map((c) => this.values[c] ?? 0);
    if (filled.some((v) => v === 0)) return { kind: 'set', cell };

    // A cage only becomes a claim once it is full. Rating a half-written one
    // would mark a player wrong for not having finished.
    const correct = cageSatisfied(cage, filled);
    if (!correct) this.mistakeCount += 1;
    if (!this.rated.has(id)) {
      this.rated.add(id);
      this.rate(cage, filled, correct);
    }

    const state = checkGrid(this.board, this.values);
    if (state.complete) {
      // The clock stops on the digit that finishes the grid, not on whatever
      // the scene gets around to doing about it.
      this.finishedAt = this.elapsed;
      this.done = true;
      return { kind: 'solved', timeMs: this.finishedAt };
    }
    return { kind: 'cage', cage: id, correct };
  }

  summary(): CageSummary {
    return {
      timeMs: this.elapsedMs,
      mistakes: this.mistakeCount,
      clean: this.mistakeCount === 0,
      size: this.size,
    };
  }

  // --- internals ---

  /**
   * What a filled cage says about the player.
   *
   * The operator names the skill and the digits set its weight — a times cage
   * is evidence about the family of its largest factor, which is how every
   * other mode reads a product.
   */
  private rate(cage: Cage, values: readonly number[], correct: boolean): void {
    const id = skillForCage(cage.op, values);
    if (!SKILLS.some((s) => s.id === id)) return;
    const base = SKILLS.find((s) => s.id === id)?.baseDifficulty ?? 400;
    this.skills = applyAttempt(
      this.skills,
      [id],
      {
        correct,
        responseMs: Math.max(1, this.elapsed - this.cageShownAt),
        difficulty: base + (cage.cells.length - 2) * this.cfg.cages.perCellDifficulty,
        // The run is a race; this is not. Time between cages is mostly spent
        // deducing which cage to open next, and charging that to the seven
        // times table would teach the model something false.
        untimed: true,
        wave: this.globalWave,
      },
      this.cfg.rating,
    );
    this.cageShownAt = this.elapsed;
  }

  private deal(): void {
    const puzzle = generate(this.rng, { size: this.size, ops: this.ops });
    // Falling back to sums rather than failing: a run that never dealt a grid
    // would read as the game breaking, and every cage can carry a sum.
    this.board = puzzle ?? generate(this.rng, { size: this.size, ops: ['add'] })!;
    this.values = new Array(this.size * this.size).fill(0);
    this.rated = new Set();
    this.cageShownAt = this.elapsed;
  }
}

/** The taxonomy's name for what a cage asked. Exported for the coach and tests. */
export function skillForCage(op: CageOp, values: readonly number[]): SkillId {
  if (op === 'sub') return 'sub.single';
  if (op === 'div') return 'div.exact';
  if (op === 'mul') {
    const family = Math.max(...values);
    return family >= 2 && family <= 12 ? (`mul.table.${family}` as SkillId) : 'mul.2x1';
  }
  const total = values.reduce((sum, v) => sum + v, 0);
  return total > 10 ? 'add.bridge' : 'add.single';
}
