import Phaser from 'phaser';
import { PAD_LAYOUT, stepPad, type PadDir } from '../core/input/padnav';
import { CSS, FONT, PALETTE } from '../fx/palette';
import { keyEventGate } from '../game/input/freshKey';
import { paintPanel } from './panels';

/**
 * On-screen numpad, driven by pointer or keyboard.
 *
 * Two audiences share it. Touch players tap it — it defaults on for them. And
 * players on keyboards without a numpad summon it with TAB and steer it with
 * the arrows or vim keys (HJKL), ENTER to type the lit cell. While it is open
 * it claims the arrow keys (the owning scene masks them out of movement), but
 * HJKL never collide with WASD — so the two-handed flight modes keep their
 * split: left hand flies, right hand types.
 *
 * Bottom-right, semi-transparent, chamfered like every other panel: it should
 * read as part of the cockpit, not a dialog over the game.
 */

/** The arrow codes a scene should mask out of movement while the pad is open. */
export const PAD_CLAIMED_CODES: readonly string[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

const NAV_CODES: Readonly<Record<string, PadDir>> = {
  ArrowUp: 'up',
  KeyK: 'up',
  ArrowDown: 'down',
  KeyJ: 'down',
  ArrowLeft: 'left',
  KeyH: 'left',
  ArrowRight: 'right',
  KeyL: 'right',
};

const CELL = 62;
const GAP = 6;
const COLS = 3;

/**
 * Whether the pad was open when the player last left a run. Session-scoped on
 * purpose: someone who summoned the pad wants it in the next mode too, but a
 * desktop profile should not be haunted by one experiment forever.
 */
let padOpenThisSession: boolean | null = null;

interface Cell {
  index: number;
  label: string;
  panel: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}

export interface NumpadOptions {
  /** Fired whenever the pad opens or closes, including the initial state. */
  onOpenChange?: (open: boolean) => void;
}

export class Numpad {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cells: Cell[] = [];
  private readonly onDigit: (digit: string) => void;
  private readonly onClear: () => void;
  private readonly onOpenChange: ((open: boolean) => void) | undefined;
  /** Start on 5 — the physical home key of a real numpad. */
  private cursor = PAD_LAYOUT.indexOf('5');
  /** Drops Phaser's queue-replay duplicates; see input/freshKey. */
  private readonly fresh = keyEventGate();

  constructor(
    scene: Phaser.Scene,
    onDigit: (digit: string) => void,
    onClear: () => void,
    opts: NumpadOptions = {},
  ) {
    this.scene = scene;
    this.onDigit = onDigit;
    this.onClear = onClear;
    this.onOpenChange = opts.onOpenChange;
    const { width, height } = scene.scale;

    const gridW = COLS * CELL + (COLS - 1) * GAP;
    const originX = width - gridW - 18;
    const originY = height - 4 * CELL - 3 * GAP - 110;

    const children: Phaser.GameObjects.GameObject[] = [];
    PAD_LAYOUT.forEach((label, i) => {
      if (label === '') return;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = col * CELL + CELL / 2;
      const y = row * CELL + CELL / 2;
      const panel = scene.add.graphics({ x, y });
      const text = scene.add
        .text(x, y, label, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold' })
        .setOrigin(0.5);
      const cell: Cell = { index: i, label, panel, text };
      this.paintCell(cell, false);

      panel.setInteractive(
        new Phaser.Geom.Rectangle(-CELL / 2 + 2, -CELL / 2 + 2, CELL - 4, CELL - 4),
        Phaser.Geom.Rectangle.Contains,
      );
      panel.input!.cursor = 'pointer';
      panel.on('pointerdown', () => {
        this.cursor = i;
        this.press();
      });

      this.cells.push(cell);
      children.push(panel, text);
    });

    // The keys the pad answers to, so summoning it needs no reading.
    children.push(
      scene.add
        .text(gridW / 2, 4 * CELL + 3 * GAP + 8, 'TAB · ←↑↓→/HJKL · ENTER', {
          fontFamily: FONT,
          fontSize: '10px',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5, 0),
    );

    // Faint enough to see the field through — in Factor Storm rocks drift
    // right through this corner, and a solid pad would hide one. The lit cell
    // still reads because it is the only yellow thing in the grid.
    this.container = scene.add
      .container(originX, originY, children)
      .setDepth(10)
      .setAlpha(0.66);
    this.repaint();

    const keydown = (event: KeyboardEvent): void => this.handleKey(event);
    scene.input.keyboard?.on('keydown', keydown);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.keyboard?.off('keydown', keydown);
    });
  }

  /** Open state, restored from earlier in the session; `fallback` decides first use. */
  applySessionDefault(fallback: boolean): void {
    this.setVisible(padOpenThisSession ?? fallback);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    padOpenThisSession = visible;
    this.onOpenChange?.(visible);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  private handleKey(event: KeyboardEvent): void {
    // One physical press must be one cursor step or one keystroke.
    if (!this.fresh(event)) return;
    if (event.code === 'Tab') {
      this.setVisible(!this.visible);
      return;
    }
    if (!this.visible) return;
    const dir = NAV_CODES[event.code];
    if (dir !== undefined) {
      this.cursor = stepPad(this.cursor, dir);
      this.repaint();
      return;
    }
    if (event.code === 'Enter' || event.code === 'NumpadEnter') this.press();
  }

  /** Type the lit cell, with the same flash the pointer path gets. */
  private press(): void {
    const cell = this.cells.find((c) => c.index === this.cursor);
    if (!cell) return;
    this.repaint();
    this.paintCell(cell, true, true);
    this.scene.time.delayedCall(90, () => {
      if (cell.panel.active) this.paintCell(cell, this.cursor === cell.index);
    });
    if (cell.label === '⌫') this.onClear();
    else this.onDigit(cell.label);
  }

  private repaint(): void {
    for (const cell of this.cells) this.paintCell(cell, cell.index === this.cursor);
  }

  private paintCell(cell: Cell, lit: boolean, flash = false): void {
    const erase = cell.label === '⌫';
    paintPanel(cell.panel, {
      width: CELL - 4,
      height: CELL - 4,
      accent: lit ? PALETTE.yellow : erase ? PALETTE.magenta : PALETTE.cyanDim,
      chamfer: 8,
      fillAlpha: flash ? 0.95 : lit ? 0.75 : 0.45,
      borderWidth: lit ? 3 : 2,
      headerRule: false,
    });
    cell.text.setColor(lit ? CSS.yellow : erase ? CSS.magentaHot : CSS.cyan);
  }
}

/** Coarse-pointer heuristic: default the pad on for touch-first devices. */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}
