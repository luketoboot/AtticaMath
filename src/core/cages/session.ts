import { CONFIG, type GameConfig } from '../config';
import { createRng, type Rng } from '../rng';
import { applyAttempt, type SkillTable } from '../skills/rating';
import { SKILLS, type SkillId } from '../skills/taxonomy';
import { cageSatisfied, checkGrid, generate, type Cage, type CageOp, type CagePuzzle } from './cages';

/**
 * A CAGES set: puzzles worked at your own pace.
 *
 * Untimed on purpose. The mode's whole claim is that it cannot be played
 * without arithmetic, and a clock would push a stuck player into guessing
 * digits — which is the one way to play it that teaches nothing. Exercise made
 * the same call for the same reason.
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
  | { kind: 'solved'; points: number }
  | { kind: 'refused' };

export interface CageSummary {
  score: number;
  solved: number;
  mistakes: number;
  cleanPuzzles: number;
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

  private scoreValue = 0;
  private solvedCount = 0;
  private mistakeCount = 0;
  private cleanCount = 0;
  private mistakesThisPuzzle = 0;
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
  get score(): number {
    return this.scoreValue;
  }
  get solved(): number {
    return this.solvedCount;
  }
  get mistakes(): number {
    return this.mistakeCount;
  }
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

  tick(dtSeconds: number): void {
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
    if (!correct) this.mistakeCount += 1, (this.mistakesThisPuzzle += 1);
    if (!this.rated.has(id)) {
      this.rated.add(id);
      this.rate(cage, filled, correct);
    }

    const state = checkGrid(this.board, this.values);
    if (state.complete) {
      const points =
        this.cfg.cages.solvePoints + (this.mistakesThisPuzzle === 0 ? this.cfg.cages.cleanBonus : 0);
      this.scoreValue += points;
      this.solvedCount += 1;
      if (this.mistakesThisPuzzle === 0) this.cleanCount += 1;
      if (this.solvedCount >= this.cfg.cages.puzzlesPerSet) this.done = true;
      else this.deal();
      return { kind: 'solved', points };
    }
    return { kind: 'cage', cage: id, correct };
  }

  summary(): CageSummary {
    return {
      score: this.scoreValue,
      solved: this.solvedCount,
      mistakes: this.mistakeCount,
      cleanPuzzles: this.cleanCount,
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
        // Nothing here is a race, so the clock is not read as evidence.
        untimed: true,
        wave: this.globalWave,
      },
      this.cfg.rating,
    );
    this.cageShownAt = this.elapsed;
  }

  private deal(): void {
    const puzzle = generate(this.rng, { size: this.size, ops: this.ops });
    // Falling back to sums rather than failing: a set that stopped dealing
    // would read as the game breaking, and every cage can carry a sum.
    this.board = puzzle ?? generate(this.rng, { size: this.size, ops: ['add'] })!;
    this.values = new Array(this.size * this.size).fill(0);
    this.rated = new Set();
    this.mistakesThisPuzzle = 0;
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
