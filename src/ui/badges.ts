/**
 * Badge emblems, drawn rather than typed.
 *
 * A glyph from the font would have been fewer lines, but the game ships one
 * pixel face and a character it lacks renders as a box — a badge that fails to
 * draw is worse than no badge. These are Graphics primitives, so they land the
 * same everywhere and scale to whatever size the caller needs.
 */
import Phaser from 'phaser';
import type { BadgeShape } from '../core/cosmetics/cosmetics';

/**
 * Paint a badge centred on the origin of `g`. `size` is the full width, so a
 * badge always fits a box of that side. Clears first, like the ship painters.
 */
export function paintBadge(
  g: Phaser.GameObjects.Graphics,
  shape: BadgeShape,
  color: number,
  size: number,
): void {
  g.clear();
  const r = size / 2;
  g.fillStyle(color, 1);
  g.lineStyle(Math.max(1.5, size * 0.09), color, 1);

  switch (shape) {
    case 'circle':
      g.fillCircle(0, 0, r * 0.8);
      break;
    case 'ring':
      g.strokeCircle(0, 0, r * 0.78);
      g.fillCircle(0, 0, r * 0.28);
      break;
    case 'square':
      g.fillRect(-r * 0.68, -r * 0.68, r * 1.36, r * 1.36);
      break;
    case 'diamond':
      g.fillPoints(vec([[0, -1], [0.78, 0], [0, 1], [-0.78, 0]], r), true);
      break;
    case 'triangle':
      g.fillPoints(vec([[0, -0.95], [0.88, 0.72], [-0.88, 0.72]], r), true);
      break;
    case 'chevron':
      g.fillPoints(
        vec([[0, -0.9], [0.9, 0.3], [0.9, 0.85], [0, -0.3], [-0.9, 0.85], [-0.9, 0.3]], r),
        true,
      );
      break;
    case 'hex':
      g.fillPoints(
        vec([[0, -1], [0.87, -0.5], [0.87, 0.5], [0, 1], [-0.87, 0.5], [-0.87, -0.5]], r),
        true,
      );
      break;
    case 'cross': {
      // An × rather than a +: it is the operator, not a plus sign.
      const t = r * 0.26;
      const a = r * 0.72;
      strokeBar(g, -a, -a, a, a, t);
      strokeBar(g, -a, a, a, -a, t);
      break;
    }
    case 'bolt':
      g.fillPoints(
        vec([[0.28, -1], [-0.72, 0.12], [-0.06, 0.12], [-0.28, 1], [0.72, -0.14], [0.06, -0.14]], r),
        true,
      );
      break;
    case 'star': {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.44;
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * rad, Math.sin(a) * rad));
      }
      g.fillPoints(pts, true);
      break;
    }
  }
}

function vec(pts: readonly (readonly [number, number])[], r: number): Phaser.Math.Vector2[] {
  return pts.map(([x, y]) => new Phaser.Math.Vector2(x * r, y * r));
}

/** A thick line as a filled quad, so the × has real weight at small sizes. */
function strokeBar(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  half: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  g.fillPoints(
    [
      new Phaser.Math.Vector2(x1 + nx, y1 + ny),
      new Phaser.Math.Vector2(x2 + nx, y2 + ny),
      new Phaser.Math.Vector2(x2 - nx, y2 - ny),
      new Phaser.Math.Vector2(x1 - nx, y1 - ny),
    ],
    true,
  );
}
