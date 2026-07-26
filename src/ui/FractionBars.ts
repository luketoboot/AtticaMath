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
 * The boundary stays put and only the scoring changes. That is the lesson.
 */

const BAR_H = 74;
const LABEL_W = 132;

interface Row {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  fill: Phaser.GameObjects.Graphics;
  cuts: Phaser.GameObjects.Graphics;
  frame: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

export class FractionBars {
  private readonly rows: Row[] = [];
  private readonly barW: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, count: number, gap: number) {
    this.barW = width - LABEL_W;

    for (let i = 0; i < count; i++) {
      const container = scene.add.container(x, y + i * (BAR_H + gap));
      const bg = scene.add.graphics();
      const fill = scene.add.graphics();
      const cuts = scene.add.graphics();
      const frame = scene.add.graphics();
      const label = scene.add
        .text(-width / 2 + LABEL_W / 2, 0, '', {
          fontFamily: FONT,
          fontSize: '30px',
          fontStyle: 'bold',
          color: CSS.white,
        })
        .setOrigin(0.5);
      container.add([bg, fill, cuts, frame, label]);
      this.rows.push({ container, bg, fill, cuts, frame, label });
    }
  }

  /** Bars to draw, and which one the verbs will act on. */
  update(bars: readonly Bar[], selected: number): void {
    this.rows.forEach((row, i) => {
      const bar = bars[i];
      row.container.setVisible(bar !== undefined);
      if (!bar) return;
      this.paint(row, bar, i === selected && bars.length > 1);
    });
  }

  private paint(row: Row, bar: Bar, selected: boolean): void {
    const w = this.barW;
    const left = -w / 2 + LABEL_W / 2;
    const top = -BAR_H / 2;

    row.bg.clear();
    row.bg.fillStyle(PALETTE.deepPurple, 0.55);
    row.bg.fillRect(left, top, w, BAR_H);

    // The filled part is one block, not a run of boxes: how much is filled is
    // the quantity that must look unchanged when the slices multiply.
    row.fill.clear();
    const filled = (bar.num / bar.den) * w;
    row.fill.fillStyle(PALETTE.cyan, 0.5);
    row.fill.fillRect(left, top, filled, BAR_H);

    // Cuts scored across the whole bar. They thin out as they multiply so a
    // finely cut bar reads as finely cut rather than as a solid block of lines.
    row.cuts.clear();
    const step = w / bar.den;
    const alpha = bar.den > 60 ? 0.28 : bar.den > 24 ? 0.5 : 0.9;
    row.cuts.lineStyle(bar.den > 40 ? 1 : 2, PALETTE.white, alpha);
    for (let i = 1; i < bar.den; i++) {
      const x = left + i * step;
      row.cuts.lineBetween(x, top, x, top + BAR_H);
    }
    // The boundary of the filled part is the number, so it is drawn brightest.
    row.cuts.lineStyle(3, PALETTE.cyan, 1);
    row.cuts.lineBetween(left + filled, top - 3, left + filled, top + BAR_H + 3);

    row.frame.clear();
    row.frame.lineStyle(selected ? 3 : 2, selected ? PALETTE.yellow : PALETTE.cyanDim, 1);
    row.frame.strokeRect(left, top, w, BAR_H);

    row.label.setText(`${bar.num}/${bar.den}`).setColor(selected ? CSS.yellow : CSS.white);
  }

  destroy(): void {
    for (const row of this.rows) row.container.destroy();
    this.rows.length = 0;
  }
}
