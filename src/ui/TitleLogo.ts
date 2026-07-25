/**
 * The title treatment.
 *
 * Three copies of the same word: a cyan ghost, a magenta ghost, and a white
 * core on top. The ghosts drift a couple of pixels out of alignment and back,
 * which reads as a tube that never quite converges — the same defect the CRT
 * pipeline fakes, done large enough to be a design choice rather than an
 * artefact.
 *
 * Everything is text and lines. No image, no font file, nothing to load.
 */
import Phaser from 'phaser';
import { CSS, FONT, PALETTE } from '../fx/palette';

export interface LogoOptions {
  fontSize?: number;
  /** Line under the rule. */
  subtitle?: string;
}

export interface TitleLogo {
  container: Phaser.GameObjects.Container;
  width: number;
}

export function titleLogo(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: LogoOptions = {},
): TitleLogo {
  const size = opts.fontSize ?? 68;
  const container = scene.add.container(x, y);

  const layer = (color: string, strokeColor?: string): Phaser.GameObjects.Text =>
    scene.add
      .text(0, 0, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        ...(strokeColor === undefined ? {} : { stroke: strokeColor, strokeThickness: 7 }),
      })
      .setOrigin(0.5);

  const cyanGhost = layer(CSS.cyan).setAlpha(0.65).setBlendMode(Phaser.BlendModes.ADD);
  const magentaGhost = layer(CSS.magenta).setAlpha(0.65).setBlendMode(Phaser.BlendModes.ADD);
  const core = layer(CSS.white, CSS.magenta);
  container.add([cyanGhost, magentaGhost, core]);

  const w = core.width;
  const half = core.height / 2;

  // Convergence drift, the two channels pulling opposite ways.
  scene.tweens.add({
    targets: cyanGhost,
    x: { from: -5, to: -2 },
    y: { from: -3, to: -1 },
    duration: 2300,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: magentaGhost,
    x: { from: 5, to: 2 },
    y: { from: 3, to: 1 },
    duration: 2300,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // A rule with diamond caps, so the logo sits on something.
  const rule = scene.add.graphics({ y: half + 6 });
  rule.lineStyle(3, PALETTE.magenta, 1);
  rule.lineBetween(-w / 2, 0, w / 2, 0);
  rule.lineStyle(1, PALETTE.cyan, 0.7);
  rule.lineBetween(-w / 2 + 10, 7, w / 2 - 10, 7);
  rule.fillStyle(PALETTE.cyan, 1);
  for (const dx of [-w / 2 - 12, w / 2 + 12]) {
    rule.fillPoints(
      [
        new Phaser.Math.Vector2(dx, -6),
        new Phaser.Math.Vector2(dx + 7, 0),
        new Phaser.Math.Vector2(dx, 6),
        new Phaser.Math.Vector2(dx - 7, 0),
      ],
      true,
    );
  }
  container.add(rule);

  if (opts.subtitle !== undefined) {
    container.add(
      scene.add
        .text(0, half + 32, opts.subtitle, {
          fontFamily: FONT,
          fontSize: '15px',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5),
    );
  }

  // A bright band crossing the letters, on a long delay so it stays a glint
  // rather than a strobe.
  const sweep = scene.add
    .rectangle(0, -half, w + 20, 4, PALETTE.white, 0.22)
    .setBlendMode(Phaser.BlendModes.ADD);
  container.add(sweep);
  scene.tweens.add({
    targets: sweep,
    y: { from: -half, to: half },
    duration: 700,
    repeat: -1,
    repeatDelay: 3600,
    ease: 'Sine.easeIn',
  });

  // Neon sign flicker: rare, short, never on a schedule you can feel.
  const flicker = scene.time.addEvent({
    delay: 2400,
    loop: true,
    callback: () => {
      if (Phaser.Math.Between(0, 2) !== 0) return;
      scene.tweens.add({
        targets: core,
        alpha: { from: 1, to: 0.35 },
        duration: 45,
        yoyo: true,
        repeat: 1,
      });
    },
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => flicker.remove());

  return { container, width: w };
}
