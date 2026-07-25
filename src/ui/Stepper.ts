/**
 * `[ − ] ████████░░ 80% [ + ]` — one adjustable value as a menu row.
 *
 * The row focuses as a single item and swallows left/right, so a screen full of
 * these walks top to bottom and adjusts side to side. Mouse users get the two
 * chips; keyboard users never have to reach for them.
 */
import Phaser from 'phaser';
import { CSS, FONT, PALETTE } from '../fx/palette';
import type { MenuItem } from './MenuNav';
import { neonChip } from './panels';

export interface StepperOptions {
  y: number;
  label: string;
  get: () => number;
  set: (value: number) => void;
  /** Defaults to a 0–1 range in tenths. */
  min?: number;
  max?: number;
  step?: number;
  /** Second line under the label. */
  hint?: string;
  /** Row geometry, as fractions of the screen width. */
  labelX?: number;
  minusX?: number;
  barX?: number;
  plusX?: number;
  fontSize?: number;
  /** Cells in the bar. */
  cells?: number;
  /**
   * Shipped value for this row. Providing it colours the readout whenever the
   * player has moved off it — worth spotting at a glance when you come back
   * later wondering why the picture looks wrong.
   */
  shipped?: number;
}

export interface Stepper extends MenuItem {
  /** Redraw after the value changed from somewhere other than this row. */
  refresh(): void;
}

const BAR_FILLED = '█';
const BAR_EMPTY = '░';

export function stepperRow(scene: Phaser.Scene, opts: StepperOptions): Stepper {
  const { width } = scene.scale;
  const min = opts.min ?? 0;
  const max = opts.max ?? 1;
  const step = opts.step ?? 0.1;
  const cells = opts.cells ?? 10;
  const fontSize = opts.fontSize ?? 22;
  const labelX = (opts.labelX ?? 0.24) * width;
  const minusX = (opts.minusX ?? 0.44) * width;
  const barX = (opts.barX ?? 0.62) * width;
  const plusX = (opts.plusX ?? 0.8) * width;

  const name = scene.add
    .text(labelX, opts.y, opts.label, {
      fontFamily: FONT,
      fontSize: `${fontSize}px`,
      color: CSS.cyanDim,
    })
    .setOrigin(0, 0.5);
  if (opts.hint !== undefined) {
    name.setY(opts.y - 8);
    scene.add
      .text(labelX, opts.y + 12, opts.hint, {
        fontFamily: FONT,
        fontSize: '10px',
        color: CSS.cyanDim,
      })
      .setOrigin(0, 0.5)
      .setAlpha(0.6);
  }

  const value = scene.add
    .text(barX, opts.y, '', {
      fontFamily: FONT,
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      color: CSS.white,
    })
    .setOrigin(0.5);

  const get = opts.get;
  const render = (): void => {
    const v = get();
    const filled = Phaser.Math.Clamp(Math.round(((v - min) / (max - min)) * cells), 0, cells);
    const moved = opts.shipped !== undefined && v !== opts.shipped;
    value
      .setText(
        `${BAR_FILLED.repeat(filled)}${BAR_EMPTY.repeat(cells - filled)} ${Math.round(v * 100)}%`,
      )
      .setColor(moved ? CSS.yellow : CSS.white);
  };

  const adjust = (dir: -1 | 1): void => {
    const raw = get() + dir * step;
    // Back onto the step grid: repeated float adds otherwise drift off the
    // round values the readout claims.
    const snapped = Math.round(raw / step) * step;
    opts.set(Phaser.Math.Clamp(Math.round(snapped * 1000) / 1000, min, max));
    render();
  };
  render();

  const chip = { size: 38, fontSize: 24, accent: PALETTE.magentaHot } as const;
  neonChip(scene, minusX, opts.y, '−', () => adjust(-1), chip);
  neonChip(scene, plusX, opts.y, '+', () => adjust(1), chip);

  // Unfilled rect spanning label→[+], so the cursor frames the whole row rather
  // than one of the two chips. Purely a bounds source, never drawn.
  const left = labelX;
  const right = plusX + 24;
  const bounds = scene.add.rectangle((left + right) / 2, opts.y, right - left, 46);
  return { target: bounds, onAdjust: adjust, refresh: render };
}
