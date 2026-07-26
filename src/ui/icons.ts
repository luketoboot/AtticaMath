/**
 * Procedural mode artwork.
 *
 * Every icon is drawn from primitives at runtime rather than shipped as a
 * sprite. That is a bundle decision as much as an aesthetic one — nine icons as
 * PNGs at a size that survives the CRT barrel would cost more than the whole
 * rest of the art budget, and vector strokes stay crisp when a card scales
 * under the cursor.
 *
 * Each painter returns a Container centred on its own origin, so a caller
 * positions, scales and tweens the icon as one object without knowing what is
 * inside it.
 */
import Phaser from 'phaser';
import { FONT } from '../fx/palette';

export type IconName =
  | 'meteor'
  | 'expression'
  | 'factor'
  | 'collapse'
  | 'boss'
  | 'hangar'
  | 'leaderboard'
  | 'brainscan'
  | 'settings'
  | 'playbook'
  | 'exercise';

type Pt = readonly [number, number];

/** Coordinates below are in a -1..1 box, so one number sets an icon's size. */
export interface IconStyle {
  /** Width and height of that box in pixels. */
  size: number;
  /** Line and fill colour for the primary shapes. */
  color: number;
  /** Secondary colour for supporting detail. */
  dim: number;
}

function path(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], s: number, close = true): void {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) g.moveTo(x * s, y * s);
    else g.lineTo(x * s, y * s);
  });
  if (close) g.closePath();
}

function stroked(
  g: Phaser.GameObjects.Graphics,
  pts: readonly Pt[],
  s: number,
  color: number,
  width: number,
  close = true,
  fill?: { color: number; alpha: number },
): void {
  path(g, pts, s, close);
  if (fill) {
    g.fillStyle(fill.color, fill.alpha);
    g.fillPath();
  }
  g.lineStyle(width, color, 1);
  g.strokePath();
}

/** A text glyph used as line art — operators and numerals read better drawn as type. */
function glyph(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${Math.round(size)}px`,
      fontStyle: 'bold',
      color: `#${color.toString(16).padStart(6, '0')}`,
    })
    .setOrigin(0.5);
}

/** An irregular rock silhouette, reused wherever a mode is about asteroids. */
const ROCK: readonly Pt[] = [
  [0, -1],
  [0.62, -0.72],
  [0.95, -0.1],
  [0.72, 0.62],
  [0.1, 1],
  [-0.55, 0.78],
  [-0.96, 0.18],
  [-0.72, -0.6],
];

// --- painters -------------------------------------------------------------

function meteor(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // Trail first, so the rock sits on top of it.
  g.lineStyle(3, st.dim, 0.75);
  for (const [i, off] of [-0.34, 0, 0.34].entries()) {
    const len = i === 1 ? 1.15 : 0.8;
    g.lineBetween((off - 0.15) * s, -0.62 * s, (off - 0.15 - len * 0.42) * s, (-0.62 - len * 0.5) * s);
  }
  stroked(g, ROCK.map(([x, y]) => [x * 0.5 - 0.06, y * 0.5 - 0.1] as Pt), s, st.color, 3, true, {
    color: st.color,
    alpha: 0.18,
  });
  // The base it is falling towards: a bracket, not a building.
  g.lineStyle(3, st.color, 1);
  g.lineBetween(-0.8 * s, 0.82 * s, 0.8 * s, 0.82 * s);
  g.lineStyle(2, st.dim, 1);
  g.lineBetween(-0.5 * s, 0.82 * s, -0.5 * s, 0.55 * s);
  g.lineBetween(0.5 * s, 0.82 * s, 0.5 * s, 0.55 * s);
  return [g];
}

function expression(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // Three ammo chips feeding a result bar: the shape of the mode's loop.
  g.lineStyle(2.5, st.color, 1);
  g.fillStyle(st.color, 0.16);
  for (const x of [-0.62, 0, 0.62]) {
    g.fillRoundedRect((x - 0.24) * s, -0.78 * s, 0.48 * s, 0.48 * s, 4);
    g.strokeRoundedRect((x - 0.24) * s, -0.78 * s, 0.48 * s, 0.48 * s, 4);
  }
  g.lineStyle(2, st.dim, 1);
  g.lineBetween(-0.62 * s, -0.18 * s, 0, 0.18 * s);
  g.lineBetween(0, -0.18 * s, 0, 0.18 * s);
  g.lineBetween(0.62 * s, -0.18 * s, 0, 0.18 * s);
  g.lineStyle(3, st.color, 1);
  g.lineBetween(-0.5 * s, 0.34 * s, 0.5 * s, 0.34 * s);
  g.lineBetween(-0.5 * s, 0.52 * s, 0.5 * s, 0.52 * s);
  return [
    g,
    glyph(scene, -0.62 * s, -0.54 * s, '7', s * 0.42, st.color),
    glyph(scene, 0, -0.54 * s, '×', s * 0.42, st.color),
    glyph(scene, 0.62 * s, -0.54 * s, '8', s * 0.42, st.color),
    glyph(scene, 0, 0.82 * s, '56', s * 0.46, st.dim),
  ];
}

function factor(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // One rock, cracked, its halves already drifting apart.
  const half = (dir: number): Pt[] =>
    ROCK.filter(([, y]) => (dir > 0 ? y >= -0.1 : y <= 0.1)).map(
      ([x, y]) => [x * 0.78 + dir * 0.16, y * 0.62 + dir * 0.2] as Pt,
    );
  stroked(g, half(1), s, st.color, 2.5, true, { color: st.color, alpha: 0.14 });
  stroked(g, half(-1), s, st.color, 2.5, true, { color: st.color, alpha: 0.14 });
  g.lineStyle(3, st.dim, 1);
  g.lineBetween(-0.9 * s, 0.05 * s, -0.2 * s, -0.12 * s);
  g.lineBetween(-0.2 * s, -0.12 * s, 0.25 * s, 0.14 * s);
  g.lineBetween(0.25 * s, 0.14 * s, 0.9 * s, -0.05 * s);
  return [glyph(scene, -0.44 * s, -0.5 * s, '3', s * 0.4, st.dim), g, glyph(scene, 0.46 * s, 0.52 * s, '5', s * 0.4, st.dim)];
}

function collapse(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // Two rings closing on a core, with the arrows that say which way this goes.
  g.lineStyle(2.5, st.color, 1);
  g.strokeCircle(-0.6 * s, -0.34 * s, 0.36 * s);
  g.lineStyle(2.5, st.dim, 1);
  g.strokeCircle(0.6 * s, 0.34 * s, 0.36 * s);
  g.lineStyle(2, st.color, 0.8);
  g.lineBetween(-0.28 * s, -0.14 * s, -0.06 * s, -0.02 * s);
  g.lineBetween(0.28 * s, 0.14 * s, 0.06 * s, 0.02 * s);
  g.fillStyle(st.color, 1);
  g.fillCircle(0, 0, 0.13 * s);
  g.lineStyle(2, st.color, 0.5);
  g.strokeCircle(0, 0, 0.3 * s);
  return [
    g,
    glyph(scene, -0.6 * s, -0.34 * s, '½', s * 0.4, st.color),
    glyph(scene, 0.6 * s, 0.34 * s, '%', s * 0.4, st.dim),
  ];
}

function boss(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // A head-shaped hull with slit eyes: threatening without being a mascot.
  stroked(
    g,
    [
      [0, -0.92],
      [0.78, -0.5],
      [0.62, 0.28],
      [0, 0.6],
      [-0.62, 0.28],
      [-0.78, -0.5],
    ],
    s,
    st.color,
    3,
    true,
    { color: st.color, alpha: 0.14 },
  );
  g.fillStyle(st.color, 1);
  g.fillTriangle(-0.5 * s, -0.34 * s, -0.14 * s, -0.24 * s, -0.5 * s, -0.08 * s);
  g.fillTriangle(0.5 * s, -0.34 * s, 0.14 * s, -0.24 * s, 0.5 * s, -0.08 * s);
  // The HP bar is the whole point of the fight, so it gets its own row.
  g.lineStyle(2, st.dim, 1);
  g.strokeRect(-0.8 * s, 0.74 * s, 1.6 * s, 0.2 * s);
  g.fillStyle(st.color, 0.9);
  g.fillRect(-0.78 * s, 0.76 * s, 1.06 * s, 0.16 * s);
  return [g];
}

function hangar(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // The ship itself, nose up, with its burn — what the screen actually sells.
  stroked(
    g,
    [
      [0, -0.9],
      [0.6, 0.45],
      [0, 0.16],
      [-0.6, 0.45],
    ],
    s,
    st.color,
    2.5,
    true,
    { color: st.color, alpha: 0.2 },
  );
  g.fillStyle(st.dim, 0.9);
  g.fillTriangle(-0.22 * s, 0.3 * s, 0.22 * s, 0.3 * s, 0, 0.95 * s);
  return [g];
}

function leaderboard(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  const bars: readonly Pt[] = [
    [-0.6, 0.35],
    [0, 0.85],
    [0.6, 0.2],
  ];
  bars.forEach(([x, h]) => {
    g.fillStyle(st.color, 0.2);
    g.fillRect((x - 0.24) * s, (0.85 - h) * s, 0.48 * s, h * s);
    g.lineStyle(2.5, st.color, 1);
    g.strokeRect((x - 0.24) * s, (0.85 - h) * s, 0.48 * s, h * s);
  });
  return [g, glyph(scene, 0, -0.62 * s, '★', s * 0.5, st.dim)];
}

function brainscan(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  g.lineStyle(2.5, st.color, 1);
  g.strokeCircle(0, -0.18 * s, 0.62 * s);
  // Folds, then the trace running out of them.
  g.lineStyle(2, st.dim, 1);
  g.lineBetween(-0.3 * s, -0.55 * s, -0.05 * s, -0.2 * s);
  g.lineBetween(-0.05 * s, -0.2 * s, -0.34 * s, 0.06 * s);
  g.lineBetween(0.28 * s, -0.55 * s, 0.06 * s, -0.18 * s);
  g.lineBetween(0.06 * s, -0.18 * s, 0.36 * s, 0.1 * s);
  g.lineStyle(3, st.color, 1);
  g.beginPath();
  g.moveTo(-0.95 * s, 0.72 * s);
  const trace: readonly Pt[] = [
    [-0.5, 0.72],
    [-0.34, 0.42],
    [-0.18, 0.95],
    [0, 0.72],
    [0.3, 0.72],
    [0.44, 0.5],
    [0.6, 0.85],
    [0.74, 0.72],
    [0.95, 0.72],
  ];
  for (const [x, y] of trace) g.lineTo(x * s, y * s);
  g.strokePath();
  return [g];
}

function settings(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  const teeth = 8;
  const pts: Pt[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.85 : 0.6;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  stroked(g, pts, s, st.color, 2.5, true, { color: st.color, alpha: 0.14 });
  g.lineStyle(2.5, st.dim, 1);
  g.strokeCircle(0, 0, 0.28 * s);
  return [g];
}

function playbook(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // An open book: two winged pages meeting at the spine.
  const left: readonly Pt[] = [
    [-0.9, -0.5],
    [-0.06, -0.68],
    [-0.06, 0.62],
    [-0.9, 0.44],
  ];
  const right: readonly Pt[] = [
    [0.9, -0.5],
    [0.06, -0.68],
    [0.06, 0.62],
    [0.9, 0.44],
  ];
  stroked(g, left, s, st.color, 2.5, true, { color: st.color, alpha: 0.14 });
  stroked(g, right, s, st.color, 2.5, true, { color: st.color, alpha: 0.14 });
  // Rule lines on the left page; the right page carries the mark.
  g.lineStyle(2, st.dim, 1);
  g.lineBetween(-0.7 * s, -0.3 * s, -0.24 * s, -0.4 * s);
  g.lineBetween(-0.7 * s, -0.02 * s, -0.24 * s, -0.12 * s);
  g.lineBetween(-0.7 * s, 0.26 * s, -0.24 * s, 0.16 * s);
  return [g, glyph(scene, 0.46 * s, -0.1 * s, '×', s * 0.56, st.dim)];
}

function exercise(scene: Phaser.Scene, st: IconStyle): Phaser.GameObjects.GameObject[] {
  const s = st.size / 2;
  const g = scene.add.graphics();
  // A stack of bars, each shorter than the one above: the ladder, with the
  // widest rung — the whole problem — on top and the simplest at the bottom.
  const bars: readonly [number, number][] = [
    [-0.86, -0.56],
    [-0.58, -0.06],
    [-0.3, 0.44],
  ];
  bars.forEach(([x0, y], i) => {
    const lit = i === bars.length - 1;
    g.fillStyle(lit ? st.color : st.dim, lit ? 0.32 : 0.16);
    g.fillRect(x0 * s, (y - 0.16) * s, -x0 * 2 * s, 0.32 * s);
    g.lineStyle(2.5, lit ? st.color : st.dim, 1);
    g.strokeRect(x0 * s, (y - 0.16) * s, -x0 * 2 * s, 0.32 * s);
  });
  return [g];
}

const PAINTERS: Readonly<
  Record<IconName, (scene: Phaser.Scene, st: IconStyle) => Phaser.GameObjects.GameObject[]>
> = {
  meteor,
  expression,
  factor,
  collapse,
  boss,
  hangar,
  leaderboard,
  brainscan,
  settings,
  playbook,
  exercise,
};

/**
 * Build an icon as a Container centred on (x, y). The caller owns it — scale,
 * tint by rebuilding, or tween it as a single object.
 */
export function makeIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: IconName,
  style: IconStyle,
): Phaser.GameObjects.Container {
  return scene.add.container(x, y, PAINTERS[name](scene, style));
}
