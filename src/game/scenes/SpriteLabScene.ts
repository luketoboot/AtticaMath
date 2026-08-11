import Phaser from 'phaser';
import { CONFIG } from '../../core/config';
import type { MoteClass } from '../../core/polarity/signal';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBullet, drawCarrier, type CarrierDetail } from '../PolarityEnemyGfx';

/**
 * A measuring instrument, not a screen anybody plays.
 *
 * The question it answers: a carrier is about sixty pixels wide on a 1280
 * stage, and then the CRT blooms it, tears it with scanlines and splits it
 * with chromatic aberration. How much drawn detail actually survives that, and
 * at what size does more of it start to pay?
 *
 * Arguing about this is pointless and rendering it is cheap, so: every
 * treatment against every size, at true scale, through the real pipeline, with
 * the shipping size marked so the comparison has an anchor. Detail that cannot
 * be told apart in this shot is detail not worth drawing.
 *
 * Registered so `npm run shot -- SpriteLab` can reach it. It is a dev tool and
 * it is fine to delete once the question is settled — the answer lives in
 * whichever `CarrierDetail` the scene ends up passing.
 */

const SIZES = [26, 32, 38] as const;
const ROWS: readonly { detail: CarrierDetail; label: string; note: string }[] = [
  { detail: 'flat', label: 'FLAT', note: 'one stroke weight all round — what shipped before' },
  { detail: 'rim', label: 'RIM', note: 'shipping now — white highlight over a full neon edge' },
  { detail: 'full', label: 'FULL', note: 'rim plus asymmetric panel work' },
];
const CLASSES: readonly MoteClass[] = ['aOnly', 'bOnly', 'bridge'];

export class SpriteLabScene extends Phaser.Scene {
  constructor() {
    super('SpriteLab');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    applyCrt(this);

    this.add
      .text(width / 2, 22, 'SPRITE LAB — WHAT SURVIVES THE CRT', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: CSS.magentaHot,
      })
      .setOrigin(0.5, 0);

    // Column headings: the sizes, with the one in the game called out.
    SIZES.forEach((r, col) => {
      const x = this.colX(col);
      const shipping = r === CONFIG.polarity.carrierRadius;
      this.add
        .text(x, 62, `r${r}${shipping ? '  ← SHIPPING' : ''}`, {
          fontFamily: FONT,
          fontSize: '14px',
          fontStyle: 'bold',
          color: shipping ? CSS.yellow : CSS.cyanDim,
        })
        .setOrigin(0.5);
      this.add
        .text(x, 78, `${Math.round(r * 2.36)}px wide`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5);
    });

    // One row per treatment, one HUNTER per size, so the only thing changing
    // left to right is scale and top to bottom is how much was drawn.
    ROWS.forEach((row, i) => {
      const y = 150 + i * 132;
      this.add.text(28, y - 26, row.label, {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: CSS.cyan,
      });
      this.add.text(28, y - 6, row.note, { fontFamily: FONT, fontSize: '11px', color: CSS.cyanDim });
      this.add.rectangle(28, y + 16, width - 56, 1, PALETTE.cyan).setOrigin(0, 0.5).setAlpha(0.15);

      SIZES.forEach((r, col) => this.carrier('aOnly', r, row.detail, this.colX(col), y + 44));
    });

    // The silhouette check: all three classes together, at the size the rows
    // above argue for. If two of these are hard to tell apart here, no amount
    // of interior detail fixes it.
    const y = 150 + ROWS.length * 132 + 4;
    this.add.text(28, y - 26, 'SILHOUETTE', {
      fontFamily: FONT,
      fontSize: '17px',
      fontStyle: 'bold',
      color: CSS.cyan,
    });
    this.add.text(28, y - 6, 'three hulls at r32, then every bullet class at true size', {
      fontFamily: FONT,
      fontSize: '11px',
      color: CSS.cyanDim,
    });
    this.add.rectangle(28, y + 16, width - 56, 1, PALETTE.cyan).setOrigin(0, 0.5).setAlpha(0.15);

    CLASSES.forEach((cls, i) => this.carrier(cls, 32, 'full', this.colX(i), y + 44));
    // Bullets at true size beside them: the field is mostly these, and a wild
    // is a bullet only — no carrier can be one, so none is drawn as a hull.
    const bullets: MoteClass[] = ['aOnly', 'bOnly', 'bridge', 'neither'];
    bullets.forEach((cls, i) => this.bullet(cls, this.colX(3) + i * 48, y + 44));
  }

  private colX(col: number): number {
    return 250 + col * 200;
  }

  private carrier(cls: MoteClass, r: number, detail: CarrierDetail, x: number, y: number): void {
    const gfx = this.add.graphics();
    drawCarrier(gfx, cls, r, false, detail);
    // The number is part of the read — a hull that looks good empty and cannot
    // hold three digits is not a carrier.
    const label = this.add
      .text(0, 0, '384', {
        fontFamily: FONT,
        fontSize: '21px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0.5);
    this.add.container(x, y, [gfx, label]);
  }

  private bullet(cls: MoteClass, x: number, y: number): void {
    const gfx = this.add.graphics();
    drawBullet(gfx, cls, CONFIG.polarity.bulletRadius);
    const label = this.add
      .text(0, 0, '96', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: CSS.white })
      .setOrigin(0.5);
    this.add.container(x, y, [gfx, label]);
  }
}
