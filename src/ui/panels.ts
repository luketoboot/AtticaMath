/**
 * Chamfered neon panels and the button built on them.
 *
 * `[ LABEL ]` was a placeholder that outlived its welcome — brackets are what
 * you draw when you have no chrome. These are the chrome: a hard-edged panel
 * with two corners cut, a bright rule along the top, and a fill dark enough
 * that white text still reads through the CRT bloom.
 *
 * Nothing here loads an asset. Panels are Graphics paths so they stay sharp at
 * any size and cost nothing in the bundle.
 */
import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import { CSS, FONT, PALETTE } from '../fx/palette';
import { makeIcon, type IconName } from './icons';
import type { MenuItem } from './MenuNav';

export interface PanelStyle {
  width: number;
  height: number;
  /** Border and accent colour. */
  accent: number;
  /** Corner cut, in pixels. Zero gives a plain rectangle. */
  chamfer?: number;
  /** Interior darkness. The panel is a window, not a slab. */
  fillAlpha?: number;
  borderWidth?: number;
  /** Bright rule along the top edge — the panel's "power on" line. */
  headerRule?: boolean;
}

/** Corners cut top-left and bottom-right: asymmetric, so a row reads as moving. */
function panelPath(w: number, h: number, cut: number): Phaser.Math.Vector2[] {
  const x = -w / 2;
  const y = -h / 2;
  return [
    new Phaser.Math.Vector2(x + cut, y),
    new Phaser.Math.Vector2(x + w, y),
    new Phaser.Math.Vector2(x + w, y + h - cut),
    new Phaser.Math.Vector2(x + w - cut, y + h),
    new Phaser.Math.Vector2(x, y + h),
    new Phaser.Math.Vector2(x, y + cut),
  ];
}

/** Draw a panel into an existing Graphics, centred on its origin. */
export function paintPanel(g: Phaser.GameObjects.Graphics, style: PanelStyle): void {
  const cut = style.chamfer ?? 14;
  const pts = panelPath(style.width, style.height, cut);
  g.clear();
  g.fillStyle(PALETTE.deepPurple, style.fillAlpha ?? 0.55);
  g.fillPoints(pts, true);
  g.lineStyle(style.borderWidth ?? 2, style.accent, 1);
  g.strokePoints(pts, true);
  if (style.headerRule !== false) {
    g.lineStyle(3, style.accent, 1);
    g.lineBetween(-style.width / 2 + cut, -style.height / 2 + 5, style.width / 2 - 6, -style.height / 2 + 5);
  }
}

/**
 * An unpainted Rectangle that exists only to be measured. Add it to a Container
 * whose visible parts are all Graphics, or `getBounds()` will report whatever
 * the text children happen to occupy.
 */
export function boundsRect(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(0, 0, width, height, 0x000000, 0);
}

export function neonPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  style: PanelStyle,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  paintPanel(g, style);
  return g;
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  accent?: number;
  /** Small glyph drawn left of the label. */
  icon?: IconName;
  /** Second line under the label, for screens where the label alone is terse. */
  sub?: string;
}

export interface NeonButton extends MenuItem {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  /** Rewrite the label without rebuilding the button. */
  setText(text: string): void;
  setAccent(color: number): void;
}

export interface NeonChip extends MenuItem {
  container: Phaser.GameObjects.Container;
  /** Chosen is not the same as focused: the cursor is where you are, this is what is set. */
  setChosen(on: boolean): void;
}

/**
 * A small square tile for option rows — operators, digit caps, anything where
 * one of a handful is picked. Chosen state is a fill and a colour, so it
 * survives the cursor moving away.
 */
export function neonChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onSelect: () => void,
  opts: { size?: number; width?: number; fontSize?: number; accent?: number } = {},
): NeonChip {
  const height = opts.size ?? 62;
  const width = opts.width ?? height;
  const accent = opts.accent ?? PALETTE.cyan;

  const container = scene.add.container(x, y);
  container.add(boundsRect(scene, width, height));
  const panel = scene.add.graphics();
  container.add(panel);
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT,
      fontSize: `${opts.fontSize ?? 30}px`,
      fontStyle: 'bold',
      color: CSS.cyan,
    })
    .setOrigin(0.5);
  container.add(text);

  const repaint = (chosen: boolean): void => {
    paintPanel(panel, {
      width,
      height,
      accent: chosen ? PALETTE.yellow : accent,
      chamfer: 8,
      fillAlpha: chosen ? 0.9 : 0.4,
      borderWidth: chosen ? 3 : 2,
      headerRule: false,
    });
    text.setColor(chosen ? CSS.yellow : CSS.cyan);
  };
  repaint(false);

  container.setSize(width, height);
  container.setInteractive(
    new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  container.input!.cursor = 'pointer';
  container.on('pointerdown', onSelect);

  return { target: container, onSelect, container, setChosen: repaint };
}

/**
 * A panelled button that answers to both the cursor and the mouse.
 *
 * Returned as a MenuItem so it drops straight into a MenuNav row. Focus is not
 * handled here — MenuNav owns the cursor outline, and the button only reacts to
 * the pointer, so the two can never disagree about what is selected.
 */
export function neonButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onSelect: () => void,
  opts: ButtonOptions = {},
): NeonButton {
  const width = opts.width ?? 260;
  const height = opts.height ?? 52;
  let accent = opts.accent ?? PALETTE.cyan;

  const container = scene.add.container(x, y);
  // Graphics carries no bounds, so a Container of them measures as nothing and
  // MenuNav's cursor would shrink to hug the label. An invisible Rectangle is
  // the cheapest way to give the container the size it looks like it has.
  container.add(boundsRect(scene, width, height));
  const panel = scene.add.graphics();
  const style: PanelStyle = { width, height, accent, chamfer: 10, fillAlpha: 0.5, headerRule: false };
  paintPanel(panel, style);
  container.add(panel);

  const hasIcon = opts.icon !== undefined;
  const textX = hasIcon ? 14 : 0;
  if (opts.icon) {
    container.add(makeIcon(scene, -width / 2 + 30, 0, opts.icon, { size: 28, color: accent, dim: PALETTE.cyanDim }));
  }

  const text = scene.add
    .text(textX, opts.sub === undefined ? 0 : -8, label, {
      fontFamily: FONT,
      fontSize: `${opts.fontSize ?? 22}px`,
      fontStyle: 'bold',
      color: CSS.white,
    })
    .setOrigin(0.5);
  container.add(text);
  if (opts.sub !== undefined) {
    container.add(
      scene.add
        .text(textX, 13, opts.sub, { fontFamily: FONT, fontSize: '11px', color: CSS.cyanDim })
        .setOrigin(0.5),
    );
  }

  container.setSize(width, height);
  container.setInteractive(
    new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  container.input!.cursor = 'pointer';

  const repaint = (hot: boolean): void => {
    paintPanel(panel, { ...style, accent, fillAlpha: hot ? 0.8 : 0.5, borderWidth: hot ? 3 : 2 });
    text.setColor(hot ? CSS.yellow : CSS.white);
  };
  container.on('pointerover', () => repaint(true));
  container.on('pointerout', () => repaint(false));

  const select = (): void => {
    getAudio(scene)?.play('ui');
    onSelect();
  };
  container.on('pointerdown', select);

  return {
    target: container,
    onSelect: select,
    container,
    label: text,
    setText: (next) => text.setText(next),
    setAccent: (color) => {
      accent = color;
      style.accent = color;
      repaint(false);
    },
  };
}
