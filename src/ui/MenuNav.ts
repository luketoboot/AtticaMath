import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import { CSS, FONT, PALETTE } from '../fx/palette';

/** Anything the cursor can frame — Text and Rectangle both qualify. */
type Focusable = Phaser.GameObjects.GameObject & { getBounds(): Phaser.Geom.Rectangle };

export interface MenuItem {
  target: Focusable;
  /** ENTER / SPACE on this item. */
  onSelect?: () => void;
  /**
   * The cursor landed here. For a tab strip, where arriving *is* the choice —
   * anything that would make the player press ENTER to see what they are
   * already pointing at.
   */
  onFocus?: () => void;
  /**
   * Left/right while this item is focused. Providing it means the item swallows
   * left/right instead of walking the row — that is how steppers work.
   */
  onAdjust?: (dir: -1 | 1) => void;
}

const UP = new Set(['ArrowUp', 'w', 'W']);
const DOWN = new Set(['ArrowDown', 's', 'S']);
const LEFT = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT = new Set(['ArrowRight', 'd', 'D']);
const SELECT = new Set(['Enter', ' ']);

const PAD_X = 16;
const PAD_Y = 8;

/**
 * Keyboard navigation for menu screens: WASD or the arrow keys move, ENTER or
 * SPACE activates. A row may hold several items, and left/right walks it unless
 * the focused item handles adjustment itself.
 *
 * The cursor is an outline rather than a recolour because several screens
 * already use colour to carry state — the chosen sector filter, owned gear —
 * and a highlight that fought those would be ambiguous. Outline means "where
 * you are", colour keeps meaning "what is chosen".
 */
export class MenuNav {
  private readonly scene: Phaser.Scene;
  private readonly rows: readonly (readonly MenuItem[])[];
  private readonly cursor: Phaser.GameObjects.Rectangle;
  /** Last column visited per row, so leaving and returning lands where you were. */
  private readonly cols: number[];
  private row = 0;
  private enabled = true;

  constructor(scene: Phaser.Scene, rows: readonly (readonly MenuItem[])[]) {
    this.scene = scene;
    this.rows = rows.filter((r) => r.length > 0);
    this.cols = this.rows.map(() => 0);

    this.cursor = scene.add
      .rectangle(0, 0, 10, 10)
      .setStrokeStyle(2, PALETTE.yellow, 0.9)
      .setFillStyle(0, 0)
      .setDepth(50);

    // Mouse and keyboard must never disagree about what is focused.
    this.rows.forEach((items, r) => {
      items.forEach((item, c) => {
        item.target.on('pointerover', () => this.focus(r, c, false));
      });
    });

    scene.input.keyboard?.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    const handler = (event: KeyboardEvent): void => this.handleKey(event);
    scene.input.keyboard?.on('keydown', handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.keyboard?.off('keydown', handler);
    });

    this.render();
  }

  /** Move the cursor. Omitting `col` keeps that row's remembered column. */
  focus(row: number, col?: number, sound = true): void {
    const nextRow = Phaser.Math.Clamp(row, 0, this.rows.length - 1);
    const items = this.rows[nextRow];
    if (!items) return;
    const nextCol = Phaser.Math.Clamp(col ?? this.cols[nextRow]!, 0, items.length - 1);
    const changed = nextRow !== this.row || nextCol !== this.cols[nextRow];

    this.row = nextRow;
    this.cols[nextRow] = nextCol;
    this.render();
    if (!changed) return;
    if (sound) getAudio(this.scene)?.play('ui');
    this.current()?.onFocus?.();
  }

  /** Pre-seed a row's column, e.g. to open on the option that is already chosen. */
  setColumn(row: number, col: number): void {
    if (this.cols[row] === undefined) return;
    this.cols[row] = Phaser.Math.Clamp(col, 0, this.rows[row]!.length - 1);
    this.render();
  }

  /** Re-fit the cursor after a label changed width outside of a select. */
  refresh(): void {
    this.render();
  }

  /**
   * Suspend navigation without tearing it down. Used while a screen grabs the
   * next raw keypress (key rebinding) so nav keys don't double as movement.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.cursor.setVisible(enabled && this.current() !== undefined);
  }

  // --- internals ---

  private handleKey(event: KeyboardEvent): void {
    if (!this.enabled) return;
    // Auto-repeat is discarded: a held ENTER from the previous screen would
    // otherwise land on whatever this screen opened focused on.
    if (event.repeat) return;
    const key = event.key;
    if (UP.has(key)) this.moveRow(-1);
    else if (DOWN.has(key)) this.moveRow(1);
    else if (LEFT.has(key)) this.moveCol(-1);
    else if (RIGHT.has(key)) this.moveCol(1);
    else if (SELECT.has(key)) this.activate();
  }

  private moveRow(delta: number): void {
    if (this.rows.length < 2) return;
    this.focus(Phaser.Math.Wrap(this.row + delta, 0, this.rows.length));
  }

  private moveCol(delta: -1 | 1): void {
    const item = this.current();
    if (item?.onAdjust) {
      item.onAdjust(delta);
      getAudio(this.scene)?.play('ui');
      this.render();
      return;
    }
    const items = this.rows[this.row];
    if (!items || items.length < 2) return;
    this.focus(this.row, Phaser.Math.Wrap(this.cols[this.row]! + delta, 0, items.length));
  }

  private activate(): void {
    const item = this.current();
    if (!item?.onSelect) return;
    item.onSelect();
    this.render(); // selecting often rewrites the label under the cursor
  }

  private current(): MenuItem | undefined {
    return this.rows[this.row]?.[this.cols[this.row] ?? 0];
  }

  private render(): void {
    const item = this.current();
    if (!item || !item.target.active) {
      this.cursor.setVisible(false);
      return;
    }
    const b = item.target.getBounds();
    this.cursor
      .setPosition(b.centerX, b.centerY)
      .setSize(b.width + PAD_X, b.height + PAD_Y)
      .setVisible(true);
  }
}

/** Standard one-line control hint for menu screens. */
export function navHint(scene: Phaser.Scene, y?: number): Phaser.GameObjects.Text {
  const { width, height } = scene.scale;
  return scene.add
    .text(width / 2, y ?? height - 16, 'WASD / ARROWS MOVE  ·  ENTER SELECT', {
      fontFamily: FONT,
      fontSize: '13px',
      color: CSS.cyanDim,
    })
    .setOrigin(0.5)
    .setAlpha(0.8);
}
