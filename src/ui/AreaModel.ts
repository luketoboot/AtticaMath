import Phaser from 'phaser';
import { CSS, FONT, PALETTE } from '../fx/palette';

/**
 * The area model: a product drawn as the rectangle it is.
 *
 * `47 × 6` is a block 47 wide and 6 tall, and splitting the 47 into 40 and 7
 * cuts that block into two panes whose areas add back to the whole. That is the
 * distributive law, and it is the one fact about multiplication that a column
 * of digits cannot show — the digits are the answer's bookkeeping, the
 * rectangle is the reason.
 *
 * Which makes it the right picture for the dial. When the player drops a place
 * off the first factor, a pane splits off the right-hand side; when the place
 * comes back, it slides in and rejoins. The panes are labelled with their own
 * products, so the running total the mode asks for is visibly the sum of the
 * areas on screen.
 *
 * Division borrows the same drawing read the other way: the block is the
 * dividend, its height is the divisor, and each rung claims a chunk of the
 * width. The chunks are the partial quotients.
 *
 * Frame-driven, like FractionBars — the scene hands it a delta.
 */

/** One vertical slab of the block: a place's contribution to the product. */
export interface Pane {
  /** The part of the split factor this pane covers: 40, then 7. */
  part: number;
  /** Its area — what this pane contributes to the total. */
  area: number;
  /** Whether the player has reached this pane yet. */
  live: boolean;
}

const SPLIT_MS = 380;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export class AreaModel {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private sideLabel?: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
  private readonly x: number;
  private readonly y: number;
  private readonly w: number;
  private readonly h: number;

  private panes: Pane[] = [];
  private prevCount = 0;
  private t = 1;
  /** The height factor, drawn down the left edge. */
  private multiplier = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.w = width;
    this.h = height;
    this.gfx = scene.add.graphics();
  }

  /**
   * Show this split. A pane count that has grown animates the new pane
   * separating off; one that has shrunk animates it rejoining.
   */
  show(panes: readonly Pane[], multiplier: number): void {
    // Only a change in how many slabs are *lit* is an event worth animating —
    // the block itself is always fully drawn, dim where it is unclaimed.
    const litNow = panes.filter((p) => p.live).length;
    if (litNow !== this.prevCount) {
      this.prevCount = litNow;
      this.t = 0;
    }
    this.panes = panes.map((p) => ({ ...p }));
    this.multiplier = multiplier;
    this.draw();
  }

  tick(dtMs: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dtMs / SPLIT_MS);
    this.draw();
  }

  setVisible(on: boolean): void {
    this.gfx.setVisible(on);
    for (const l of this.labels) l.setVisible(on);
    this.sideLabel?.setVisible(on);
  }

  /** Labels are created on demand and reused, never left as holes in the array. */
  private label(i: number): Phaser.GameObjects.Text {
    const existing = this.labels[i];
    if (existing) return existing;
    const text = this.scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: CSS.white })
      .setOrigin(0.5);
    this.labels[i] = text;
    return text;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    for (const l of this.labels) l.setVisible(false);
    this.sideLabel?.setVisible(false);
    if (this.panes.length === 0) return;

    const total = this.panes.reduce((sum, p) => sum + p.part, 0);
    if (total <= 0) return;

    const eased = easeOut(this.t);
    // The gap panes open between themselves as they separate. It is what makes
    // a split read as "this came apart" rather than as a line appearing.
    const gap = 7 * eased;
    const usable = this.w - gap * (this.panes.length - 1);
    const left = this.x - this.w / 2;
    const top = this.y - this.h / 2;

    let cursor = left;
    this.panes.forEach((pane, i) => {
      const paneW = (pane.part / total) * usable;
      // The slab that just lit up is the one that travels: it slides into
      // place rather than simply appearing there.
      const isNew = pane.live && i === this.prevCount - 1;
      const slide = isNew ? (1 - eased) * -paneW * 0.4 : 0;
      const px = cursor + slide;

      const accent = !pane.live ? PALETTE.purple : i === this.panes.length - 1 ? PALETTE.yellow : PALETTE.cyan;
      g.fillStyle(accent, pane.live ? 0.22 : 0.08);
      g.fillRect(px, top, paneW, this.h);
      g.lineStyle(pane.live ? 2.5 : 1.5, accent, pane.live ? 1 : 0.5);
      g.strokeRect(px, top, paneW, this.h);

      // Its own share of the answer, written inside its own area — so the
      // running total the mode asks for is visibly the sum of what is on screen.
      const text = this.label(i);
      if (paneW > 42) {
        text
          .setVisible(true)
          .setPosition(px + paneW / 2, this.y)
          .setAlign('center')
          .setFontSize(paneW > 92 ? 15 : 12)
          .setText(pane.live ? `${pane.part} × ${this.multiplier}\n${pane.area}` : String(pane.part))
          .setColor(pane.live ? CSS.white : CSS.purple)
          .setAlpha(pane.live ? 1 : 0.6);
      }
      cursor += paneW + gap;
    });

    // The factor held whole, down the left edge: the height of the block.
    this.sideLabel ??= this.scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: CSS.magentaHot })
      .setOrigin(0.5);
    this.sideLabel
      .setVisible(true)
      .setPosition(left - 26, this.y)
      .setText(String(this.multiplier));
  }

  destroy(): void {
    this.gfx.destroy();
    for (const l of this.labels) l.destroy();
    this.sideLabel?.destroy();
    this.labels.length = 0;
  }
}
