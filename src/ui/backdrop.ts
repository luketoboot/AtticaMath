/**
 * The shared menu backdrop: striped sun, horizon, perspective grid, stars.
 *
 * Every non-play screen draws this so the game has one place rather than eight
 * that happen to be black. It is all Graphics — no gradients, no textures — and
 * the striping that makes the sun read as synthwave is also what keeps it from
 * competing with the text laid over it.
 */
import Phaser from 'phaser';
import { PALETTE } from '../fx/palette';

export interface BackdropOptions {
  /** Fraction of the screen height where the grid starts. */
  horizon?: number;
  /**
   * Fraction of the screen height the sun's *base* rests on. Defaults to
   * `horizon`, which is what it should almost always be: the line is the
   * ground, and a sun floating above it or sunk halfway through it reads as a
   * mistake rather than as a sunset.
   */
  sunHorizon?: number;
  /** Sun radius in pixels. Defaults to a size that suits a full screen. */
  sunRadius?: number;
  /** Draw the sun. Off for screens with content low on the glass. */
  sun?: boolean;
  /**
   * How present the sun is, 0 to 1. Screens that put content over the sun's
   * upper half dial this down so it reads as atmosphere rather than a second
   * subject. VIDEO leaves it at 1, where it doubles as a CRT test pattern.
   */
  sunAlpha?: number;
  /** Twinkling points above the horizon. */
  stars?: boolean;
}

export function drawBackdrop(scene: Phaser.Scene, opts: BackdropOptions = {}): void {
  const { width, height } = scene.scale;
  const horizon = height * (opts.horizon ?? 0.82);
  const sunHorizon = height * (opts.sunHorizon ?? opts.horizon ?? 0.82);

  scene.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0).setDepth(-100);

  if (opts.stars !== false) drawStars(scene, horizon);
  if (opts.sun !== false) {
    // Sitting *on* the line, not through it: the disc's centre is one radius
    // above its base. It used to be dropped 30px below the line instead, which
    // put the horizon across the sun's face — and then the menu shoved the
    // whole thing a further 130px down to get it out of the way, which left a
    // sliver of a much bigger sun poking up and a bright line ruled across it.
    const radius = opts.sunRadius ?? Math.min(210, height * 0.3);
    drawSun(scene, width / 2, sunHorizon - radius, radius, opts.sunAlpha ?? 1);
  }
  drawGrid(scene, horizon);
}

/**
 * A disc cut by widening horizontal gaps. Drawn as one scanline row per pixel
 * pair, with the colour walking yellow → magenta down the face.
 */
function drawSun(scene: Phaser.Scene, cx: number, cy: number, r: number, intensity: number): void {
  const g = scene.add.graphics().setDepth(-90).setAlpha(0.75 * intensity);
  // Dialling the sun back also starts the striping higher up its face, so what
  // dims is a stack of bands rather than a solid plate gone grey.
  const gapStart = 0.45 * intensity;
  for (let dy = -r; dy < r; dy += 2) {
    const t = (dy + r) / (2 * r);
    // Gaps start below the equator and grow, so the sun appears to sink.
    if (t > gapStart) {
      const band = (t - gapStart) * 26;
      if ((dy + r) % Math.max(4, Math.round(14 - band)) < Math.min(6, 1 + band * 0.5)) continue;
    }
    const halfW = Math.sqrt(Math.max(0, r * r - dy * dy));
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(255, 230, 77),
      new Phaser.Display.Color(255, 45, 149),
      100,
      Math.round(t * 100),
    );
    g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
    g.fillRect(cx - halfW, cy + dy, halfW * 2, 2);
  }
}

function drawGrid(scene: Phaser.Scene, horizon: number): void {
  const { width, height } = scene.scale;
  const g = scene.add.graphics().setDepth(-80);
  g.lineStyle(1, PALETTE.deepPurple, 0.85);
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * width;
    g.lineBetween(width / 2 + (x - width / 2) * 0.18, horizon, x, height);
  }
  for (let i = 0; i < 9; i++) {
    const y = horizon + (height - horizon) * Math.pow(i / 9, 1.8);
    g.lineBetween(0, y, width, y);
  }
  // The horizon itself, doubled: a hard magenta line over a soft cyan wash.
  g.lineStyle(6, PALETTE.cyan, 0.18);
  g.lineBetween(0, horizon, width, horizon);
  g.lineStyle(2, PALETTE.magenta, 0.9);
  g.lineBetween(0, horizon, width, horizon);
}

function drawStars(scene: Phaser.Scene, horizon: number): void {
  const { width } = scene.scale;
  for (let i = 0; i < 70; i++) {
    const star = scene.add
      .rectangle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, horizon - 10),
        2,
        2,
        i % 5 === 0 ? PALETTE.magentaHot : PALETTE.cyan,
      )
      .setAlpha(Phaser.Math.FloatBetween(0.15, 0.6))
      .setDepth(-95);
    if (i % 4 !== 0) continue;
    scene.tweens.add({
      targets: star,
      alpha: 0.05,
      duration: Phaser.Math.Between(1200, 2600),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 2000),
    });
  }
}
