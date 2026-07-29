import { CONFIG, type GameConfig } from '../config';
import { createRng, type Rng } from '../rng';
import { applyAttempt, type SkillTable } from '../skills/rating';
import { SKILLS, type SkillId } from '../skills/taxonomy';
import {
  clearRows,
  createBoard,
  currentRect,
  fitsSomewhere,
  fullRows,
  hasRectangle,
  makePiece,
  nextValue,
  place,
  restRow,
  rotate,
  type Board,
  type Piece,
  type Rect,
} from './packing';

/**
 * A GNOMON run: pack numbers into rows by the rectangles they can make.
 *
 * The rating signal here is narrower than the other modes and worth being
 * honest about. Landing a piece is not right or wrong — anything that fits,
 * fits. What the mode actually asks is whether the player can *find* a
 * factorisation, so that is what it rates: putting a number down as a proper
 * rectangle is evidence about its times-table family, and putting it down as a
 * bar when a rectangle was available is evidence against.
 *
 * A prime is never rated. It has no rectangle to find, so laying it flat says
 * nothing about the player and marking it wrong would teach the model that
 * knowing a prime when you see one is a failure.
 */

export interface PackingSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  config?: GameConfig;
}

export type DropOutcome =
  | { kind: 'landed'; rowsCleared: number; points: number; usedRectangle: boolean }
  | { kind: 'blocked' };

export interface PackingSummary {
  score: number;
  rowsCleared: number;
  piecesLanded: number;
  rectangles: number;
  bars: number;
}

export class PackingSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private readonly globalWave: number;
  private skills: SkillTable;

  private boardState: Board;
  private live: Piece;
  private nextUp: Piece;
  private column = 0;
  private over = false;

  private scoreValue = 0;
  private rows = 0;
  private landed = 0;
  private rects = 0;
  private barsLaid = 0;
  private droppedAt = 0;
  private elapsed = 0;

  constructor(init: PackingSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = init.skills;
    this.globalWave = init.totalWavesBefore + 1;
    const p = this.cfg.packing;
    this.boardState = createBoard(p.width, p.height);
    this.live = this.deal();
    this.nextUp = this.deal();
    this.centre();
  }

  // --- readouts ---

  get board(): Board {
    return this.boardState;
  }
  get piece(): Piece {
    return this.live;
  }
  get upcoming(): Piece {
    return this.nextUp;
  }
  get rect(): Rect {
    return currentRect(this.live);
  }
  get col(): number {
    return this.column;
  }
  get score(): number {
    return this.scoreValue;
  }
  get rowsCleared(): number {
    return this.rows;
  }
  get finished(): boolean {
    return this.over;
  }
  get skillTable(): SkillTable {
    return this.skills;
  }

  /** Where the live piece would come to rest, or undefined when it cannot land. */
  get landingRow(): number | undefined {
    return restRow(this.boardState, this.rect, this.column);
  }

  /** Seconds per row, tightening as rows fall. */
  get fallSeconds(): number {
    const p = this.cfg.packing;
    return Math.max(p.minFallSeconds, p.startFallSeconds * Math.pow(p.fallSpeedupPerClear, this.rows));
  }

  /** The widest number in play, shown so the player can see difficulty move. */
  get valueCeiling(): number {
    const p = this.cfg.packing;
    return Math.min(p.hardestMaxValue, p.startMaxValue + this.rows * p.maxValuePerClear);
  }

  // --- play ---

  tick(dtSeconds: number): void {
    this.elapsed += dtSeconds * 1000;
  }

  move(by: number): boolean {
    if (this.over) return false;
    const next = this.column + by;
    if (next < 0 || next + this.rect.cols > this.boardState.width) return false;
    this.column = next;
    return true;
  }

  /**
   * Refactor the live piece.
   *
   * A shape that would hang off the right edge slides back on rather than being
   * refused: the player asked for a different factorisation, not for the piece
   * to stay where it was, and refusing silently reads as a broken key.
   */
  turn(by = 1): boolean {
    if (this.over || this.live.shapes.length < 2) return false;
    this.live = rotate(this.live, by);
    const overhang = this.column + this.rect.cols - this.boardState.width;
    if (overhang > 0) this.column = Math.max(0, this.column - overhang);
    return true;
  }

  /** Land the live piece where it is. */
  drop(): DropOutcome {
    if (this.over) return { kind: 'blocked' };
    const row = this.landingRow;
    // A column with no room is a refusal, not a death. The run ends only when
    // the piece has nowhere to go in any shape, anywhere on the board.
    if (row === undefined) return { kind: 'blocked' };

    const rect = this.rect;
    const usedRectangle = rect.cols > 1 && rect.rows > 1;
    this.rate(rect, usedRectangle);

    this.boardState = place(this.boardState, rect, this.column, row, this.live.value);
    const full = fullRows(this.boardState);
    if (full.length > 0) this.boardState = clearRows(this.boardState, full);

    const p = this.cfg.packing;
    // Rows are worth more together, which is what makes it worth building a
    // deep flat stack rather than clearing one row at a time.
    const points = full.length * p.rowPoints * full.length + (usedRectangle ? p.rectanglePoints : 0);
    this.scoreValue += points;
    this.rows += full.length;
    this.landed += 1;
    if (usedRectangle) this.rects += 1;
    else this.barsLaid += 1;

    this.live = this.nextUp;
    this.nextUp = this.deal();
    this.centre();
    this.droppedAt = this.elapsed;
    if (!fitsSomewhere(this.boardState, this.live.shapes)) this.over = true;

    return { kind: 'landed', rowsCleared: full.length, points, usedRectangle };
  }

  summary(): PackingSummary {
    return {
      score: this.scoreValue,
      rowsCleared: this.rows,
      piecesLanded: this.landed,
      rectangles: this.rects,
      bars: this.barsLaid,
    };
  }

  // --- internals ---

  /**
   * Rate the factorisation, not the placement.
   *
   * A piece with no rectangle to find is skipped entirely: laying a prime flat
   * is the only thing that could have been done with it.
   */
  private rate(rect: Rect, usedRectangle: boolean): void {
    if (!hasRectangle(this.live.shapes)) return;
    const family = Math.max(rect.cols, rect.rows);
    const id: SkillId =
      usedRectangle && family >= 2 && family <= 12
        ? (`mul.table.${family}` as SkillId)
        : 'factor.smallest';
    if (!SKILLS.some((s) => s.id === id)) return;
    const base = SKILLS.find((s) => s.id === id)?.baseDifficulty ?? 400;
    this.skills = applyAttempt(
      this.skills,
      [id],
      {
        correct: usedRectangle,
        responseMs: Math.max(1, this.elapsed - this.droppedAt),
        difficulty: base,
        wave: this.globalWave,
      },
      this.cfg.rating,
    );
  }

  private deal(): Piece {
    const p = this.cfg.packing;
    const value = nextValue(this.rng, p.minValue, this.valueCeiling, p.width, p.height);
    return makePiece(value, p.width, p.height);
  }

  private centre(): void {
    this.column = Math.max(0, Math.floor((this.boardState.width - this.rect.cols) / 2));
  }
}
