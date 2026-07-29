import { CONFIG, type GameConfig } from '../config';
import { createRng, type Rng } from '../rng';
import { applyAttempt, type SkillTable } from '../skills/rating';
import {
  answerValue,
  generatePuzzle,
  type KakoomaCell,
  type KakoomaOp,
  type KakoomaPuzzle,
} from './kakooma';
import { kakoomaAttempt } from './skills';

/**
 * A Kakooma run: grids against a clock.
 *
 * Nine cells, solvable in any order, and once all nine are down their answers
 * are a tenth cell that closes the grid. Clearing a grid buys time back, so a
 * run lasts exactly as long as the player keeps finding things — which is the
 * arcade shape, and the reason this is a fluency mode rather than a second
 * teaching one. Exercise already owns thinking slowly.
 *
 * A wrong call costs seconds rather than a life. That is the same price Meteor
 * Defense charges for a wrong answer, and it is the honest one here: with nine
 * numbers on offer, guessing is a real strategy unless guessing is slower than
 * looking.
 *
 * Pure and seedable. The scene owns pixels and the clock's tick; this owns what
 * the numbers mean.
 */

export interface KakoomaSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  op?: KakoomaOp;
  config?: GameConfig;
}

export type CallOutcome =
  | { kind: 'solved'; cell: number; value: number; points: number; combo: number }
  | { kind: 'grid'; points: number; secondsGained: number }
  | { kind: 'wrong'; cell: number; secondsLost: number }
  | { kind: 'refused' };

export interface KakoomaSummary {
  score: number;
  gridsCleared: number;
  cellsSolved: number;
  misses: number;
  bestCombo: number;
}

export class KakoomaSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private readonly op: KakoomaOp;
  private readonly globalWave: number;
  private skills: SkillTable;

  private puzzle!: KakoomaPuzzle;
  /** Which cells are down. The final cell is tracked separately. */
  private solved: boolean[] = [];
  private finalSolved = false;
  /** When the live cell became visible, for the rating's response time. */
  private shownAt = 0;
  private elapsed = 0;

  private scoreValue = 0;
  private streak = 0;
  private best = 0;
  private grids = 0;
  private cells = 0;
  private missCount = 0;
  private secondsLeft: number;

  constructor(init: KakoomaSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.op = init.op ?? 'add';
    this.skills = init.skills;
    this.globalWave = init.totalWavesBefore + 1;
    this.secondsLeft = this.cfg.kakooma.startSeconds;
    this.deal();
  }

  // --- readouts ---

  get grid(): readonly KakoomaCell[] {
    return this.puzzle.cells;
  }
  get final(): KakoomaCell {
    return this.puzzle.final;
  }
  get solvedCells(): readonly boolean[] {
    return this.solved;
  }
  get finalIsSolved(): boolean {
    return this.finalSolved;
  }
  /** The final cell only opens once every cell above it is down. */
  get finalUnlocked(): boolean {
    return this.solved.every(Boolean);
  }
  get score(): number {
    return this.scoreValue;
  }
  get combo(): number {
    return Math.min(this.cfg.kakooma.maxCombo, 1 + Math.floor(this.streak / this.cfg.kakooma.comboStep));
  }
  get timeLeft(): number {
    return this.secondsLeft;
  }
  get over(): boolean {
    return this.secondsLeft <= 0;
  }
  get gridsCleared(): number {
    return this.grids;
  }
  get skillTable(): SkillTable {
    return this.skills;
  }
  get operation(): KakoomaOp {
    return this.op;
  }

  /**
   * The band this grid's numbers came from. Shown in the HUD because it is the
   * only thing that changes between grids, and a player who cannot see the
   * difficulty move has no evidence they are getting anywhere.
   */
  get range(): number {
    const k = this.cfg.kakooma;
    return Math.min(k.hardestMax, k.startMax + this.grids * k.maxPerGrid);
  }

  // --- play ---

  tick(dtSeconds: number): void {
    if (this.over) return;
    this.elapsed += dtSeconds * 1000;
    this.secondsLeft = Math.max(0, this.secondsLeft - dtSeconds);
  }

  /**
   * Call a number. `cell` is the grid index, or -1 for the final cell.
   *
   * Rating happens on the call, right or wrong, because a wrong call here is a
   * real claim about a fact — the player pointed at a number and said it was
   * the sum of two others.
   */
  call(cell: number, index: number): CallOutcome {
    if (this.over) return { kind: 'refused' };
    const isFinal = cell === -1;
    if (isFinal && (!this.finalUnlocked || this.finalSolved)) return { kind: 'refused' };
    if (!isFinal && (cell < 0 || cell >= this.solved.length || this.solved[cell])) {
      return { kind: 'refused' };
    }

    const target = isFinal ? this.puzzle.final : this.puzzle.cells[cell]!;
    const correct = index === target.answer;
    this.rate(target, correct);

    if (!correct) {
      this.missCount += 1;
      this.streak = 0;
      const cost = this.cfg.kakooma.wrongPenaltySeconds;
      this.secondsLeft = Math.max(0, this.secondsLeft - cost);
      return { kind: 'wrong', cell, secondsLost: cost };
    }

    const combo = this.combo;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    this.cells += 1;
    this.shownAt = this.elapsed;

    if (isFinal) {
      const points = this.cfg.kakooma.finalPoints * combo;
      this.scoreValue += points;
      this.finalSolved = true;
      this.grids += 1;
      const gained = this.cfg.kakooma.gridBonusSeconds;
      this.secondsLeft += gained;
      this.deal();
      return { kind: 'grid', points, secondsGained: gained };
    }

    const points = this.cfg.kakooma.cellPoints * combo;
    this.scoreValue += points;
    this.solved[cell] = true;
    return { kind: 'solved', cell, value: answerValue(target), points, combo };
  }

  summary(): KakoomaSummary {
    return {
      score: this.scoreValue,
      gridsCleared: this.grids,
      cellsSolved: this.cells,
      misses: this.missCount,
      bestCombo: this.best,
    };
  }

  // --- internals ---

  private rate(cell: KakoomaCell, correct: boolean): void {
    const [a, b] = cell.parts;
    const attempt = kakoomaAttempt(
      this.op,
      cell.values[a]!,
      cell.values[b]!,
      answerValue(cell),
      cell.values.length,
    );
    this.skills = applyAttempt(
      this.skills,
      attempt.skillIds,
      {
        correct,
        responseMs: Math.max(1, this.elapsed - this.shownAt),
        difficulty: attempt.difficulty,
        wave: this.globalWave,
      },
      this.cfg.rating,
    );
  }

  private deal(): void {
    const k = this.cfg.kakooma;
    const opts = {
      op: this.op,
      max: this.range,
      cellSize: k.cellSize,
      gridSize: k.gridSize,
    };
    // A band can be too tight to hide nine independent relationships in. Widen
    // rather than fail: a run that stalls because the generator gave up would
    // read as the game breaking, and the player cannot tell the difference.
    let puzzle = generatePuzzle(this.rng, opts);
    for (let widen = 1; !puzzle && widen <= 4; widen++) {
      puzzle = generatePuzzle(this.rng, { ...opts, max: opts.max + widen * 10 });
    }
    if (!puzzle) throw new Error(`Kakooma could not build a grid at max ${opts.max}`);
    this.puzzle = puzzle;
    this.solved = puzzle.cells.map(() => false);
    this.finalSolved = false;
    this.shownAt = this.elapsed;
  }
}
