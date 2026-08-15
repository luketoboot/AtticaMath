/**
 * The title treatment.
 *
 * A wordmark, not a line of text. The letters are chunky pixel glyphs drawn
 * from a 5x7 grid — the arcade cabinet face Consolas never was — leaned into
 * an italic and filled row by row through a chrome gradient: hot white at the
 * crown falling through yellow and magenta to a cyan rim at the baseline,
 * which is the eighties album-cover chrome the whole aesthetic descends from.
 * A one-pixel gap between rows does the phosphor banding for free.
 *
 * Underneath, two flat ghosts in the channel colours drift a few pixels out of
 * alignment and back — the same convergence defect the CRT pipeline fakes,
 * done large enough to be a design choice rather than an artefact. The sweep,
 * the rule with diamond caps and the neon-sign flicker all survive from the
 * first version.
 *
 * Everything is rectangles. No image, no font file, nothing to load.
 */
import Phaser from 'phaser';
import { CSS, FONT, PALETTE } from '../fx/palette';

export interface LogoOptions {
  /** Overall glyph height in px (the old fontSize, kept for the caller). */
  fontSize?: number;
  /** Line under the rule. */
  subtitle?: string;
}

export interface TitleLogo {
  container: Phaser.GameObjects.Container;
  width: number;
}

const COLS = 5;
const ROWS = 7;

/**
 * Only the letters the game actually sets in lights. Adding one means adding
 * its grid here; asking for one that is missing throws rather than rendering
 * a gap, because a silent hole in a logo is the worst possible place for one.
 */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * The chrome, top row to bottom. White crown, yellow glare, the magenta body,
 * a purple shadow row, and a cyan rim where the baseline catches the grid.
 */
const CHROME: readonly number[] = [
  PALETTE.white,
  PALETTE.yellow,
  PALETTE.magentaHot,
  PALETTE.magenta,
  PALETTE.magenta,
  PALETTE.purple,
  PALETTE.cyan,
];

interface WordMetrics {
  cell: number;
  gap: number;
  advance: number;
  italic: number;
  width: number;
  height: number;
}

function metricsFor(text: string, glyphHeight: number): WordMetrics {
  const cell = glyphHeight / ROWS;
  const gap = Math.max(1, Math.round(cell * 0.14));
  const advance = cell * (COLS + 1.4);
  const italic = cell * 0.16;
  // Last letter has no trailing gap; the skew adds the top row's lean.
  const width = text.length * advance - cell * 1.4 + italic * (ROWS - 1);
  return { cell, gap, advance, italic, width, height: cell * ROWS };
}

/** One full pass over the word: every lit cell, one colour policy. */
function drawWord(
  g: Phaser.GameObjects.Graphics,
  text: string,
  m: WordMetrics,
  fill: (row: number) => number,
  inflate = 0,
): void {
  const x0 = -m.width / 2;
  const y0 = -m.height / 2;
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i]!];
    if (!glyph) throw new Error(`TitleLogo has no glyph for "${text[i]}"`);
    for (let row = 0; row < ROWS; row++) {
      const lean = (ROWS - 1 - row) * m.italic;
      for (let col = 0; col < COLS; col++) {
        if (glyph[row]![col] !== '1') continue;
        g.fillStyle(fill(row), 1);
        g.fillRect(
          x0 + i * m.advance + col * m.cell + lean - inflate,
          y0 + row * m.cell - inflate,
          m.cell + inflate * 2,
          m.cell - m.gap + inflate * 2,
        );
      }
    }
  }
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
  const m = metricsFor(text, size);

  // The two channels, pulling opposite ways under the body.
  const cyanGhost = scene.add.graphics().setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
  drawWord(cyanGhost, text, m, () => PALETTE.cyan);
  const magentaGhost = scene.add.graphics().setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
  drawWord(magentaGhost, text, m, () => PALETTE.magenta);

  // A dark body behind the chrome, so the gradient rows read as one object
  // and the row gaps read as banding rather than holes.
  const body = scene.add.graphics();
  drawWord(body, text, m, () => PALETTE.deepPurple, Math.max(2, m.cell * 0.24));

  const chrome = scene.add.graphics();
  drawWord(chrome, text, m, (row) => CHROME[row] ?? PALETTE.magenta);

  container.add([cyanGhost, magentaGhost, body, chrome]);

  const w = m.width;
  const half = m.height / 2;

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
  const rule = scene.add.graphics({ y: half + 10 });
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
        .text(0, half + 36, opts.subtitle, {
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
        targets: chrome,
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
