import Phaser from 'phaser';
import type { PlaceColumn } from '../core/exercise/places';
import { CSS, FONT, PALETTE } from '../fx/palette';

/**
 * The frames: a sum or a difference as counters on a table.
 *
 * Every place gets ten slots. The two operands pour their digits in, and what
 * will not fit sits outside the frame where it can be seen not fitting. That
 * overflow is the whole of carrying — written as digits it is a small raised 1
 * that arrives from nowhere, and here it is ten counters that were already on
 * screen leaving together for the place above.
 *
 * Nothing resolves until the player answers. Before that the frames show only
 * what was poured in, because a frame that had already collapsed its ten and
 * printed the leftover would be handing over the digit the mode is asking for.
 * Answering is what sets the exchange running — right to left, one place at a
 * time, the way it is worked by hand — so the animation is the reward for the
 * arithmetic rather than a substitute for it.
 *
 * Subtraction runs the same exchange backwards. A column that cannot pay sends
 * up for a ten, it comes down and breaks into ten counters, and the subtrahend
 * takes what it is owed out of the pile.
 *
 * Frame-driven, like FractionBars and AreaModel — the scene hands it a delta.
 */

/** Counter pitch and size. Ten of them plus the overflow have to fit a flank. */
const PITCH = 17;
const PIP_R = 6;
/** Tall enough that the frame keeps its own line and the tag gets one below. */
const ROW_H = 54;
const FRAME_H = 30;
const LABEL_W = 62;
/** Room between the frame and the counters that would not go in it. */
const OUT_GAP = 14;
const FRAME_SLOTS = 10;

/** One place resolves over this. The chain is places × this, plus a beat. */
const ROW_MS = 280;
/** A new rung's counters arrive over this. */
const INTRO_MS = 460;

const WIDTH = LABEL_W + FRAME_SLOTS * PITCH + OUT_GAP + 9 * PITCH;

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** A counter's origin, which is what its colour says. */
type Source = 'top' | 'bottom' | 'carry' | 'borrowed';

const SOURCE_COLOUR: Record<Source, number> = {
  top: PALETTE.cyan,
  bottom: PALETTE.magenta,
  carry: PALETTE.yellow,
  borrowed: PALETTE.yellow,
};

export class PlaceFrames {
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private readonly x: number;
  private readonly y: number;
  private readonly op: 'add' | 'sub';

  private columns: PlaceColumn[] = [];
  private solved = false;
  private signature = '';
  private mode: 'idle' | 'intro' | 'resolve' = 'idle';
  private elapsed = 0;
  private visible = true;

  constructor(scene: Phaser.Scene, x: number, y: number, op: 'add' | 'sub') {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.op = op;
    this.gfx = scene.add.graphics();
  }

  /**
   * How long the exchange takes to run, so the scene can hold the rung on
   * screen until the counters have finished moving. Zero when this rung has no
   * exchange to make and there is nothing to wait for.
   */
  get resolveMs(): number {
    // A column that only pays still has counters to clear, so it needs its turn
    // as much as one that carries — stopping the clock at the last exchange cut
    // every difference off mid-fade.
    const last = this.columns.reduce(
      (deepest, c) => (c.event === 'none' && c.taken === 0 ? deepest : Math.max(deepest, c.place)),
      -1,
    );
    return last < 0 ? 0 : (last + 1) * ROW_MS + 220;
  }

  /**
   * The rung's columns, and whether it has been answered.
   *
   * Called on every keystroke, so a repaint that changes nothing must not
   * restart anything — only new counters or a fresh answer are events.
   */
  show(columns: readonly PlaceColumn[], solved: boolean): void {
    const signature = columns
      .map((c) => `${c.place}:${c.top}:${c.bottom}:${c.live ? 1 : 0}`)
      .join('|');
    this.columns = columns.map((c) => ({ ...c }));

    if (signature !== this.signature) {
      this.signature = signature;
      this.solved = solved;
      this.mode = 'intro';
      this.elapsed = 0;
    } else if (solved && !this.solved) {
      this.solved = true;
      this.mode = 'resolve';
      this.elapsed = 0;
    } else {
      this.solved = solved;
    }
    this.draw();
  }

  tick(dtMs: number): void {
    if (this.mode === 'idle' || !this.visible) return;
    this.elapsed += dtMs;
    const span = this.mode === 'intro' ? INTRO_MS : this.resolveMs;
    if (this.elapsed >= span) {
      this.elapsed = span;
      this.mode = 'idle';
    }
    this.draw();
  }

  /**
   * Jump to the end of whatever is running.
   *
   * The exchange is worth watching once, not every time, and an animation that
   * cannot be dismissed is a toll rather than an explanation. Skipping is safe
   * here precisely because the end state is the informative one and it persists
   * — the counters left standing are the answer's digits either way.
   */
  finish(): void {
    if (this.mode === 'idle') return;
    this.elapsed = this.mode === 'intro' ? INTRO_MS : this.resolveMs;
    this.mode = 'idle';
    this.draw();
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.gfx.setVisible(on);
    for (const l of this.labels) if (l.text !== '') l.setVisible(on);
    for (const t of this.tags) if (t.text !== '') t.setVisible(on);
  }

  destroy(): void {
    this.gfx.destroy();
    for (const l of this.labels) l.destroy();
    for (const t of this.tags) t.destroy();
    this.labels.length = 0;
    this.tags.length = 0;
  }

  // --- geometry ---

  private get left(): number {
    return this.x - WIDTH / 2;
  }

  private get frameX(): number {
    return this.left + LABEL_W;
  }

  /**
   * Centre line of a row's frame, measured up from the ones.
   *
   * Anchored at the bottom rather than centred, because the column a carry
   * opens arrives at the *top* — centring would slide every frame down half a
   * row at the moment the player is watching a counter travel, which is the
   * one moment nothing else should move.
   */
  private frameY(index: number): number {
    return this.y - (this.columns.length - 1 - index) * ROW_H;
  }

  /** Centre of slot `i`, counting straight on past the frame into the overflow. */
  private slotX(i: number): number {
    const past = i >= FRAME_SLOTS ? OUT_GAP : 0;
    return this.frameX + i * PITCH + PITCH / 2 + past;
  }

  // --- drawing ---

  private draw(): void {
    const g = this.gfx;
    g.clear();
    for (const l of this.labels) l.setVisible(false);
    for (const t of this.tags) t.setVisible(false);
    if (!this.visible || this.columns.length === 0) return;

    this.columns.forEach((column, i) => this.drawRow(g, column, i));
  }

  private drawRow(g: Phaser.GameObjects.Graphics, column: PlaceColumn, index: number): void {
    // The place a carry opens has nothing in it until the carry gets there, so
    // it is not on screen at all — an empty frame standing above the number
    // would be the game telling the player this one carries.
    if (column.openedByCarry && !this.solved) return;

    const y = this.frameY(index);
    const dim = column.live ? 1 : 0.24;

    // The frame itself: ten slots, always drawn, so "full" is a fact about a
    // fixed container rather than about however many counters happen to be out.
    g.lineStyle(2, column.live ? PALETTE.cyanDim : PALETTE.deepPurple, 0.85 * dim);
    g.strokeRect(this.frameX, y - FRAME_H / 2, FRAME_SLOTS * PITCH, FRAME_H);
    // The halfway rule. Five is the other anchor the whole Playbook spends.
    g.lineStyle(1, PALETTE.deepPurple, 0.7 * dim);
    g.lineBetween(
      this.frameX + (FRAME_SLOTS / 2) * PITCH,
      y - FRAME_H / 2 + 3,
      this.frameX + (FRAME_SLOTS / 2) * PITCH,
      y + FRAME_H / 2 - 3,
    );

    this.text(this.labels, index, 12, CSS.cyanDim)
      .setVisible(true)
      .setOrigin(1, 0.5)
      .setPosition(this.frameX - 12, y)
      .setText(`${10 ** column.place}s`)
      .setAlpha(dim);

    if (this.solved) this.drawResolved(g, column, index, y, dim);
    else this.drawPoured(g, column, y, dim);
  }

  /**
   * Before the answer: what was poured in, and nothing else.
   *
   * The counters past the tenth are the point — they are outside the frame
   * because they do not fit, which is the question the rung is asking.
   */
  private drawPoured(
    g: Phaser.GameObjects.Graphics,
    column: PlaceColumn,
    y: number,
    dim: number,
  ): void {
    const intro = this.mode === 'intro' ? clamp01(this.elapsed / INTRO_MS) : 1;

    if (this.op === 'add') {
      const poured = column.top + column.bottom;
      for (let i = 0; i < poured; i++) {
        const source: Source = i < column.top ? 'top' : 'bottom';
        this.pip(g, this.slotX(i), y, source, this.stagger(intro, i, poured), dim);
      }
      return;
    }

    // A difference starts with what the top number has on the table, and marks
    // what is about to be taken. Where there is not enough, the shortfall is
    // drawn as empty outlines — the counters this column will have to send for.
    for (let i = 0; i < column.top; i++) {
      this.pip(g, this.slotX(i), y, 'top', this.stagger(intro, i, column.top), dim);
    }
    const owed = column.taken;
    const onHand = Math.min(owed, column.top);
    for (let i = column.top - onHand; i < column.top; i++) {
      this.strike(g, this.slotX(i), y, dim * clamp01((intro - 0.5) * 2));
    }
    for (let i = 0; i < owed - onHand; i++) {
      this.ghost(g, this.slotX(column.top + i), y, dim * clamp01((intro - 0.5) * 2));
    }
  }

  /**
   * After the answer: the exchange, running right to left.
   *
   * Each place gets its own window, and the pip that travels between them
   * leaves one window and lands in the next — which is why the windows are
   * keyed on place rather than on row, and why the ones go first.
   */
  private drawResolved(
    g: Phaser.GameObjects.Graphics,
    column: PlaceColumn,
    index: number,
    y: number,
    dim: number,
  ): void {
    const start = column.place * ROW_MS;
    const u = clamp01((this.elapsed - start) / ROW_MS);
    const aboveY = index > 0 ? this.frameY(index - 1) : y - ROW_H;

    if (this.op === 'add') {
      // The carry from below lands partway through that place's window, so it
      // is already sitting here when this column's own turn comes round.
      const carried = column.carryIn > 0 && this.elapsed >= (column.place - 1) * ROW_MS + ROW_MS * 0.55;
      const poured = column.top + column.bottom + (carried ? column.carryIn : 0);

      if (column.event !== 'carry') {
        for (let i = 0; i < poured; i++) {
          const source: Source = i < column.top ? 'top' : i < column.top + column.bottom ? 'bottom' : 'carry';
          this.pip(g, this.slotX(i), y, source, 1, dim);
        }
        return;
      }

      // The ten in the frame gather to the middle and go; the leftovers walk
      // back in behind them and become the answer's digit for this place.
      const gather = clamp01(u / 0.5);
      const walk = clamp01((u - 0.5) / 0.4);
      if (gather < 1) {
        const target = this.frameX + (FRAME_SLOTS * PITCH) / 2;
        const e = easeInOut(gather);
        for (let i = 0; i < FRAME_SLOTS; i++) {
          const source: Source = i < column.top ? 'top' : i < column.top + column.bottom ? 'bottom' : 'carry';
          const x = Phaser.Math.Linear(this.slotX(i), target, e);
          this.pip(g, x, y, source, 1 - e * 0.55, dim * (1 - e * 0.35));
        }
        // The frame flares as it fills: this container is what "full" means.
        g.lineStyle(3, PALETTE.yellow, 0.9 * e * dim);
        g.strokeRect(this.frameX, y - ROW_H / 2 + 7, FRAME_SLOTS * PITCH, ROW_H - 16);
      }

      for (let i = 0; i < column.result; i++) {
        const from = this.slotX(FRAME_SLOTS + i);
        const x = Phaser.Math.Linear(from, this.slotX(i), easeOut(walk));
        const source: Source =
          FRAME_SLOTS + i < column.top ? 'top' : FRAME_SLOTS + i < column.top + column.bottom ? 'bottom' : 'carry';
        this.pip(g, x, y, source, 1, dim);
      }

      // The one that leaves. It travels up the flank into the next frame's
      // first free slot, which is where it will be counted from.
      const fly = clamp01((u - 0.5) / 0.35);
      if (fly > 0 && fly < 1 && index > 0) {
        const above = this.columns[index - 1]!;
        const e = easeInOut(fly);
        const x = Phaser.Math.Linear(
          this.frameX + (FRAME_SLOTS * PITCH) / 2,
          this.slotX(above.top + above.bottom),
          e,
        );
        this.pip(g, x, Phaser.Math.Linear(y, aboveY, e), 'carry', 1.15, 1);
      }
      if (u > 0.85) this.tag(index, y, 'ONE CARRIES', CSS.yellow, dim);
      return;
    }

    // --- a difference ---

    // This column hands one down as soon as the place below starts its turn.
    const lentGone = column.lent > 0 && this.elapsed >= (column.place - 1) * ROW_MS;
    const base = Math.max(0, column.top - (lentGone ? column.lent : 0));
    const arrive = column.event === 'borrow' ? clamp01(u / 0.35) : 1;
    const take = clamp01((u - 0.45) / 0.4);

    // Every counter on the table, drawn once. Splitting this into a loop for
    // what is standing and another for what is going meant the second drew
    // fading counters on top of full-strength ones, and the taking never
    // showed — whatever is leaving has to be the same circle that was there.
    const shown = column.event === 'borrow' && arrive >= 1 ? column.held : base;
    const spread = column.event === 'borrow' ? clamp01((u - 0.35) / 0.2) : 1;
    const gone = take > 0 ? easeOut(take) : 0;
    for (let i = 0; i < shown; i++) {
      // Counters past what this column started with are the ten that came over,
      // and they spread out from where they landed.
      const borrowed = i >= base;
      const x = borrowed
        ? Phaser.Math.Linear(this.slotX(base), this.slotX(i), easeOut(spread))
        : this.slotX(i);
      // Taken off the end of the pile, so what is left standing is the answer's
      // digit and nothing has to be counted twice.
      const going = i >= column.result;
      this.pip(g, x, y, borrowed ? 'borrowed' : 'top', going ? 1 - gone : 1, dim * (going ? 1 - gone : 1));
      if (going && take <= 0) this.strike(g, x, y, dim);
    }

    if (column.event === 'borrow' && arrive < 1 && index > 0) {
      const e = easeInOut(arrive);
      const above = this.columns[index - 1]!;
      const fromX = this.slotX(Math.max(0, above.top - above.lent - 1));
      this.pip(
        g,
        Phaser.Math.Linear(fromX, this.slotX(base), e),
        Phaser.Math.Linear(aboveY, y, e),
        'borrowed',
        1.15,
        1,
      );
    }

    if (column.event === 'borrow' && u > 0.4) this.tag(index, y, 'A TEN COMES OVER', CSS.yellow, dim);
  }

  // --- pieces ---

  /** Counters arrive left to right rather than all at once, so they read as poured. */
  private stagger(intro: number, i: number, count: number): number {
    if (intro >= 1) return 1;
    const per = 0.6 / Math.max(1, count);
    return clamp01((intro - i * per) / 0.35);
  }

  private pip(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    source: Source,
    scale: number,
    alpha: number,
  ): void {
    if (scale <= 0 || alpha <= 0) return;
    const colour = SOURCE_COLOUR[source];
    g.fillStyle(colour, 0.85 * alpha);
    g.fillCircle(x, y, PIP_R * scale);
    g.lineStyle(1.5, colour, alpha);
    g.strokeCircle(x, y, PIP_R * scale);
  }

  /** A counter spoken for, before it is actually taken. */
  private strike(g: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number): void {
    if (alpha <= 0) return;
    const r = PIP_R * 0.9;
    g.lineStyle(2, PALETTE.magentaHot, alpha);
    g.lineBetween(x - r, y - r, x + r, y + r);
    g.lineBetween(x - r, y + r, x + r, y - r);
  }

  /** A counter this column does not have and will have to send for. */
  private ghost(g: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number): void {
    if (alpha <= 0) return;
    g.lineStyle(1.5, PALETTE.red, 0.8 * alpha);
    g.strokeCircle(x, y, PIP_R);
  }

  /**
   * What just happened to this place, in the gap below its frame — inside the
   * panel's own width, because the flank ends where the ladder begins.
   */
  private tag(index: number, y: number, text: string, colour: string, alpha: number): void {
    this.text(this.tags, index, 11, colour)
      .setVisible(true)
      .setOrigin(0, 0.5)
      .setPosition(this.frameX, y + FRAME_H / 2 + 9)
      .setText(text)
      .setColor(colour)
      .setAlpha(alpha);
  }

  /**
   * A pooled label, grown to reach `i` rather than assigned at it.
   *
   * Only some rows carry a tag, so assigning by index would leave holes — and a
   * `for…of` over a sparse array visits them and hands back `undefined`, which
   * is a crash in the clearing loop rather than at the site of the mistake.
   * Filling the gap keeps every pool dense by construction.
   */
  private text(
    pool: Phaser.GameObjects.Text[],
    i: number,
    size: number,
    colour: string,
  ): Phaser.GameObjects.Text {
    while (pool.length <= i) {
      pool.push(
        this.scene.add.text(0, 0, '', {
          fontFamily: FONT,
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color: colour,
        }),
      );
    }
    return pool[i]!;
  }
}
