import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import { CSS, FONT, PALETTE } from '../fx/palette';
import { keyEventGate } from '../game/input/freshKey';

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
  /**
   * The item draws its own focus — cards and buttons grow and light up. Items
   * that provide this get no cursor outline, since two focus indicators on the
   * same thing is one too many.
   */
  setFocused?: (on: boolean) => void;
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
 *
 * Items that light themselves (`setFocused`) are the exception: an outline
 * bolted onto a card that already grows and glows only boxes it in.
 */
export class MenuNav {
  private readonly scene: Phaser.Scene;
  private readonly rows: readonly (readonly MenuItem[])[];
  private readonly cursor: Phaser.GameObjects.Rectangle;
  /** Last column visited per row, so leaving and returning lands where you were. */
  private readonly cols: number[];
  private row = 0;
  private enabled = true;
  /** Whoever was last told it is lit, so it can be told when it is not. */
  private lit: MenuItem | undefined;
  /** The cursor's in-flight glide, so a fast walk retargets instead of stacking. */
  private glide: Phaser.Tweens.Tween | undefined;
  /** Drops Phaser's queue-replay duplicates; see game/input/freshKey. */
  private readonly fresh = keyEventGate();

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
    this.render();
  }

  // --- internals ---

  private handleKey(event: KeyboardEvent): void {
    if (!this.enabled) return;
    // One physical press must be one move or one activation. Phaser can drain
    // its key queue more than once in a frame and redeliver the same event
    // object, which here meant a single ENTER firing a button twice — visible
    // in Exercise as one press cutting a fraction bar in four.
    if (!this.fresh(event)) return;
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
    // The confirm voice lives here, not in each widget, so a row of raw Text
    // items sounds the same as a panelled button. Widgets play it themselves
    // only on their own pointerdown path, which never passes through here.
    getAudio(this.scene)?.play('confirm');
    item.onSelect();
    this.render(); // selecting often rewrites the label under the cursor
  }

  private current(): MenuItem | undefined {
    return this.rows[this.row]?.[this.cols[this.row] ?? 0];
  }

  private render(): void {
    const raw = this.current();
    const item = raw?.target.active === true ? raw : undefined;

    if (this.lit !== item) {
      this.lit?.setFocused?.(false);
      item?.setFocused?.(true);
      this.lit = item;
    }

    // Self-lit items need no outline, and the outline is meaningless while
    // navigation is suspended.
    if (!item || item.setFocused || !this.enabled) {
      this.cursor.setVisible(false);
      return;
    }
    const b = frameOf(item.target);
    const w = b.width + PAD_X;
    const h = b.height + PAD_Y;
    this.glide?.stop();
    if (!this.cursor.visible) {
      // Appearing, not travelling — a glide in from wherever the cursor last
      // sat (often another screen's layout) would read as a glitch.
      this.cursor.setPosition(b.centerX, b.centerY).setSize(w, h).setVisible(true);
      return;
    }
    // The glide runs on a proxy because Rectangle's width/height are plain
    // fields — tweening them directly would skip the geometry update.
    const p = { x: this.cursor.x, y: this.cursor.y, w: this.cursor.width, h: this.cursor.height };
    this.glide = this.scene.tweens.add({
      targets: p,
      x: b.centerX,
      y: b.centerY,
      w,
      h,
      duration: 140,
      ease: 'Quad.easeOut',
      onUpdate: () => this.cursor.setPosition(p.x, p.y).setSize(p.w, p.h),
    });
  }
}

/**
 * The rectangle to frame.
 *
 * `Container.getBounds()` reports the union of its children's bounds, and
 * Graphics carry no bounds at all — they have no GetBounds component. So a
 * container holding nothing but Graphics measures as an *empty* rect stranded at
 * the world origin: getBounds calls `setEmpty()` as soon as it sees it has
 * children, then finds none it can measure, and returns `(0, 0, 0, 0)`. Union
 * that into a parent and the frame stretches from the top-left of the screen out
 * to the item. A shop tile — whose art is a nested container of Graphics — is
 * exactly that shape, and every tile sits somewhere different, so every frame is
 * differently wrong.
 *
 * Containers here set their own size and centre their content on their origin,
 * so measure from that and fall back to getBounds() only for plain Text.
 */
function frameOf(target: Focusable): Phaser.Geom.Rectangle {
  if (target instanceof Phaser.GameObjects.Container && target.width > 0 && target.height > 0) {
    const m = target.getWorldTransformMatrix();
    const w = target.width * m.scaleX;
    const h = target.height * m.scaleY;
    return new Phaser.Geom.Rectangle(m.tx - w / 2, m.ty - h / 2, w, h);
  }
  return target.getBounds();
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
