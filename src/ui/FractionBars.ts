import Phaser from 'phaser';
import type { Bar } from '../core/exercise/slices';
import { CSS, FONT, PALETTE } from '../fx/palette';

/**
 * Fraction bars: a length of ground, cut into slices, some of them filled.
 *
 * The one thing this has to sell is that recutting does not change how much is
 * filled. So every bar is the same width on screen no matter how many slices it
 * carries, and the filled portion is drawn as one continuous block with the
 * cuts scored across it — rather than as a row of separate boxes, which would
 * make eight small filled slices look like more stuff than four large ones.
 * The boundary stays put and only the scoring changes.
 *
 * Which is exactly why it is animated. A bar that jumps from 1/2 to 2/4 between
 * frames has *told* the player the value is unchanged; a bar whose new cut
 * visibly grows down through the middle while the fill boundary does not budge
 * has *shown* them. The cut is the event, so the cut is what moves — and a fuse
 * runs the same thing backwards, the doomed lines shrinking away before the
 * survivors close up.
 *
 * Frame-driven: the owning scene calls `tick` with its delta.
 */

const BAR_H = 74;
const LABEL_W = 132;
/** A cut grows in over this long; a fuse takes the same going out. */
const CUT_MS = 340;
/** The opening draw: outline, then scoring, then the fill sweeping across. */
const INTRO_MS = 620;

type Phase = 'idle' | 'intro' | 'cut' | 'fuse';

interface Row {
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  /** What is on screen right now. */
  from: Bar;
  /** Where it is heading. Equal to `from` when idle. */
  to: Bar;
  phase: Phase;
  /** 0..1 through the current phase. */
  t: number;
  selected: boolean;
  visible: boolean;
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class FractionBars {
  private readonly rows: Row[] = [];
  private readonly barW: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, count: number, gap: number) {
    this.barW = width - LABEL_W;

    for (let i = 0; i < count; i++) {
      const container = scene.add.container(x, y + i * (BAR_H + gap));
      const gfx = scene.add.graphics();
      const label = scene.add
        .text(-width / 2 + LABEL_W / 2, 0, '', {
          fontFamily: FONT,
          fontSize: '30px',
          fontStyle: 'bold',
          color: CSS.white,
        })
        .setOrigin(0.5);
      container.add([gfx, label]);
      this.rows.push({
        container,
        gfx,
        label,
        from: { num: 0, den: 1 },
        to: { num: 0, den: 1 },
        phase: 'idle',
        t: 0,
        selected: false,
        visible: false,
      });
    }
  }

  /**
   * Bars to draw, and which one the verbs act on.
   *
   * A changed denominator starts a transition rather than replacing the
   * drawing: which way it changed is the difference between a cut and a fuse,
   * and those are opposite animations.
   */
  update(bars: readonly Bar[], selected: number): void {
    this.rows.forEach((row, i) => {
      const bar = bars[i];
      row.visible = bar !== undefined;
      row.container.setVisible(row.visible);
      if (!bar) return;
      row.selected = i === selected && bars.length > 1;

      if (row.to.den !== bar.den || row.to.num !== bar.num) {
        row.from = row.phase === 'idle' ? row.to : row.to;
        row.to = { ...bar };
        row.phase = bar.den > row.from.den ? 'cut' : 'fuse';
        row.t = 0;
      }
      this.draw(row);
    });
  }

  /** Draw the bars in from nothing — the opening of a new problem. */
  intro(bars: readonly Bar[], selected: number): void {
    this.rows.forEach((row, i) => {
      const bar = bars[i];
      row.visible = bar !== undefined;
      row.container.setVisible(row.visible);
      if (!bar) return;
      row.selected = i === selected && bars.length > 1;
      row.from = { ...bar };
      row.to = { ...bar };
      row.phase = 'intro';
      // Stagger the second bar so the two read as one sweep, not a flash.
      row.t = -i * 0.28;
      this.draw(row);
    });
  }

  /** Advance every running animation. Cheap and idempotent when nothing moves. */
  tick(dtMs: number): void {
    for (const row of this.rows) {
      if (row.phase === 'idle' || !row.visible) continue;
      const span = row.phase === 'intro' ? INTRO_MS : CUT_MS;
      row.t += dtMs / span;
      if (row.t >= 1) {
        row.t = 1;
        row.phase = 'idle';
        row.from = { ...row.to };
      }
      this.draw(row);
    }
  }

  get animating(): boolean {
    return this.rows.some((r) => r.visible && r.phase !== 'idle');
  }

  // --- drawing ---

  private draw(row: Row): void {
    const g = row.gfx;
    const w = this.barW;
    const left = -w / 2 + LABEL_W / 2;
    const top = -BAR_H / 2;
    g.clear();

    const t = Math.max(0, Math.min(1, row.t));
    const intro = row.phase === 'intro' ? easeOut(t) : 1;
    if (intro <= 0) {
      row.label.setText('');
      return;
    }

    // The outline draws itself open from the left before anything goes in it.
    const drawnW = w * intro;

    g.fillStyle(PALETTE.deepPurple, 0.55);
    g.fillRect(left, top, drawnW, BAR_H);

    // The filled part is one block, not a run of boxes: how much is filled is
    // the quantity that must look unchanged when the slices multiply. During
    // the opening it sweeps across, so the eye watches the boundary arrive.
    const fillFrac = row.to.num / row.to.den;
    const filled = Math.min(drawnW, w * fillFrac * (row.phase === 'intro' ? intro : 1));
    g.fillStyle(PALETTE.cyan, 0.5);
    g.fillRect(left, top, filled, BAR_H);

    this.drawCuts(row, g, left, top, drawnW, t);

    // The boundary of the filled part is the number, so it is drawn brightest.
    // It pulses on a recut precisely because it is the thing that did not move.
    const settling = row.phase === 'cut' || row.phase === 'fuse';
    g.lineStyle(settling ? 3 + 3 * (1 - easeOut(t)) : 3, PALETTE.cyan, 1);
    g.lineBetween(left + filled, top - 3, left + filled, top + BAR_H + 3);

    g.lineStyle(row.selected ? 3 : 2, row.selected ? PALETTE.yellow : PALETTE.cyanDim, 1);
    g.strokeRect(left, top, drawnW, BAR_H);

    row.label
      .setText(`${row.to.num}/${row.to.den}`)
      .setColor(row.selected ? CSS.yellow : CSS.white)
      .setAlpha(intro);
  }

  /**
   * The scoring, which is where the whole animation lives.
   *
   * Cuts that survive a transition are drawn solid. Cuts that are arriving grow
   * down from the middle; cuts that are leaving shrink back into it. A line
   * that is in both the old and the new bar never moves, so the player can see
   * that recutting adds detail rather than rearranging anything.
   */
  private drawCuts(
    row: Row,
    g: Phaser.GameObjects.Graphics,
    left: number,
    top: number,
    drawnW: number,
    t: number,
  ): void {
    const w = this.barW;
    const oldDen = row.from.den;
    const newDen = row.to.den;
    const mid = top + BAR_H / 2;

    // Fine scoring thins out so a heavily cut bar reads as heavily cut rather
    // than as a solid block of lines.
    const weight = (den: number): { width: number; alpha: number } =>
      den > 60
        ? { width: 1, alpha: 0.28 }
        : den > 24
          ? { width: 1, alpha: 0.5 }
          : { width: 2, alpha: 0.9 };

    /** Does a cut at index i of `den` also exist in a bar of `otherDen`? */
    const survives = (i: number, den: number, otherDen: number): boolean =>
      (i * otherDen) % den === 0;

    const eased = easeInOut(t);

    for (let i = 1; i < newDen; i++) {
      const x = left + (i * w) / newDen;
      if (x > left + drawnW) continue;

      let grow = 1;
      let fade = 1;
      if (row.phase === 'cut' && !survives(i, newDen, oldDen)) {
        // A brand-new score line, growing out of the middle.
        grow = eased;
        fade = eased;
      } else if (row.phase === 'intro') {
        // Staggered so the scoring reads left to right rather than all at once.
        const per = Math.max(0.0001, 1 / Math.max(1, newDen));
        grow = Math.max(0, Math.min(1, (t - i * per * 0.5) / 0.35));
        fade = grow;
      }
      if (grow <= 0) continue;

      const { width, alpha } = weight(newDen);
      g.lineStyle(width, PALETTE.white, alpha * fade);
      g.lineBetween(x, mid - (BAR_H / 2) * grow, x, mid + (BAR_H / 2) * grow);
    }

    // On a fuse, the doomed lines are still on screen, shrinking away.
    if (row.phase === 'fuse') {
      const dying = 1 - eased;
      const { width, alpha } = weight(oldDen);
      for (let i = 1; i < oldDen; i++) {
        if (survives(i, oldDen, newDen)) continue;
        const x = left + (i * w) / oldDen;
        if (x > left + drawnW) continue;
        g.lineStyle(width, PALETTE.magenta, alpha * dying);
        g.lineBetween(x, mid - (BAR_H / 2) * dying, x, mid + (BAR_H / 2) * dying);
      }
    }
  }

  destroy(): void {
    for (const row of this.rows) row.container.destroy();
    this.rows.length = 0;
  }
}
