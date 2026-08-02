import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { cageEdges, cageHead, cageLabel, colOf, rowOf } from '../../core/cages/cages';
import { EXAMPLE_PUZZLE, EXAMPLE_STEPS } from '../../core/cages/example';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { neonButton } from '../../ui/panels';
import { paintPanel } from '../../ui/panels';
import { keyEventGate } from '../input/freshKey';

/**
 * One CAGES puzzle, solved in front of the player.
 *
 * Every other mode teaches itself by being played: a meteor falls, you type the
 * answer, and the rule is now known. CAGES cannot, because knowing both rules
 * still leaves you staring at a grid with no idea what the first move even
 * looks like — the move is a deduction, and a rulebook cannot demonstrate one.
 * The briefing page said what a cage is and players still asked how to play.
 *
 * So this shows the working. It runs itself once, the first time the mode is
 * opened, and is on a key after that; both routes are an overlay over the
 * paused board, so a player who gets lost mid-puzzle can watch it and come
 * straight back to their own grid.
 *
 * The example and its reasoning are data in `core/cages/example.ts`, where the
 * tests prove every digit it writes was forced. This file only draws.
 */

interface LearnData {
  /** Scene to resume on the way out. */
  target?: string;
}

const CELL = 78;
const ORIGIN_X = 120;
const ORIGIN_Y = 130;
const PANEL_X = 852;
const PANEL_Y = 268;

export class CagesLearnScene extends Phaser.Scene {
  private step = 0;
  private target = 'Cages';
  private cellText: Phaser.GameObjects.Text[] = [];
  private cellBg!: Phaser.GameObjects.Graphics;
  private borders!: Phaser.GameObjects.Graphics;
  private sayText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private nextLabel!: Phaser.GameObjects.Text;
  private back!: ReturnType<typeof neonButton>;
  private readonly fresh = keyEventGate();

  constructor() {
    super('CagesLearn');
  }

  create(data: LearnData): void {
    const { width, height } = this.scale;
    this.target = data.target ?? 'Cages';
    this.step = 0;
    this.cellText = [];

    // Opaque, unlike the briefing panel. That one shows the board through it on
    // purpose — you are mid-run and want to see what you were looking at. Here
    // the board underneath is a second grid of numbers behind a lesson about a
    // grid of numbers, and every bit of it that shows through is noise.
    this.add.rectangle(0, 0, width, height, PALETTE.black, 1).setOrigin(0);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.add
      .text(width / 2, 44, 'CAGES // ONE PUZZLE, WORKED OUT', {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

    this.cellBg = this.add.graphics();
    this.borders = this.add.graphics().setDepth(3);
    this.buildGrid();

    // The two rules stay on screen under the grid for the whole walkthrough.
    // Every step is one or the other being applied, and a player should never
    // have to remember which two things they are being shown.
    const gridMid = ORIGIN_X + (EXAMPLE_PUZZLE.size * CELL) / 2;
    this.add
      .text(gridMid, ORIGIN_Y + EXAMPLE_PUZZLE.size * CELL + 34, 'EVERY ROW, EVERY COLUMN:  1 2 3 4', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
    this.add
      .text(gridMid, ORIGIN_Y + EXAMPLE_PUZZLE.size * CELL + 58, 'EVERY CAGE:  MAKE ITS TARGET', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const panel = this.add.graphics().setPosition(PANEL_X, PANEL_Y);
    paintPanel(panel, {
      width: 640,
      height: 250,
      accent: PALETTE.cyan,
      chamfer: 16,
      fillAlpha: 0.9,
      borderWidth: 3,
      headerRule: false,
    });
    // Centred in the panel rather than hung from its top: the steps run from
    // two lines to five and a fixed top leaves the short ones floating.
    this.sayText = this.add
      .text(PANEL_X, PANEL_Y, '', {
        fontFamily: FONT,
        fontSize: '16px',
        color: CSS.white,
        align: 'left',
        wordWrap: { width: 552 },
        lineSpacing: 9,
      })
      .setOrigin(0.5);
    this.countText = this.add
      .text(PANEL_X + 300, PANEL_Y + 148, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(1, 0.5);

    this.back = neonButton(this, PANEL_X - 210, height - 156, 'BACK', () => this.go(-1), {
      width: 170,
      height: 46,
      fontSize: 17,
    });
    const next = neonButton(this, PANEL_X, height - 156, 'NEXT', () => this.go(1), {
      width: 220,
      height: 46,
      fontSize: 19,
      accent: PALETTE.yellow,
    });
    this.nextLabel = next.container.getAll('type', 'Text')[0] as Phaser.GameObjects.Text;
    neonButton(this, PANEL_X + 210, height - 156, 'SKIP', () => this.close(), {
      width: 170,
      height: 46,
      fontSize: 17,
    });
    this.add
      .text(PANEL_X, height - 112, 'SPACE  NEXT   ·   BACKSPACE  BACK   ·   ESC  OUT   ·   YOUR CLOCK IS STOPPED', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.render(false);
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.fresh(event)) return;
    if (event.key === 'Escape' || event.key === 'h' || event.key === 'H') return this.close();
    if (event.key === 'Backspace' || event.key === 'ArrowLeft') return this.go(-1);
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowRight') {
      return this.go(1);
    }
  }

  private go(delta: number): void {
    const next = this.step + delta;
    if (next < 0) return;
    // Past the last step there is nothing left to show, so the forward key
    // becomes the way out rather than a dead press.
    if (next >= EXAMPLE_STEPS.length) return this.close();
    this.step = next;
    this.render(delta > 0);
  }

  private close(): void {
    this.scene.stop();
    if (this.scene.isPaused(this.target)) this.scene.resume(this.target);
    else this.scene.start(this.target);
  }

  // --- drawing ---

  private buildGrid(): void {
    const size = EXAMPLE_PUZZLE.size;
    for (let i = 0; i < size * size; i++) {
      const x = ORIGIN_X + colOf(i, size) * CELL;
      const y = ORIGIN_Y + rowOf(i, size) * CELL;
      this.cellText.push(
        this.add
          .text(x + CELL / 2, y + CELL / 2 + 5, '', {
            fontFamily: FONT,
            fontSize: '38px',
            fontStyle: 'bold',
            color: CSS.white,
          })
          .setOrigin(0.5)
          .setDepth(5),
      );
    }

    // Labels never change, so they are written once and only recoloured.
    EXAMPLE_PUZZLE.cages.forEach((cage, i) => {
      const head = cageHead(cage);
      this.add
        .text(
          ORIGIN_X + colOf(head, size) * CELL + 7,
          ORIGIN_Y + rowOf(head, size) * CELL + 5,
          cageLabel(cage),
          { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: CSS.yellow },
        )
        .setDepth(6)
        .setName(`label${i}`);
    });
  }

  private render(animate: boolean): void {
    const size = EXAMPLE_PUZZLE.size;
    const step = EXAMPLE_STEPS[this.step]!;
    const lit = new Set(step.lit);
    const cageOf = new Array<number>(size * size).fill(-1);
    EXAMPLE_PUZZLE.cages.forEach((cage, i) => {
      for (const cell of cage.cells) cageOf[cell] = i;
    });

    // Everything written up to and including this step.
    const grid = new Array<number>(size * size).fill(0);
    for (const past of EXAMPLE_STEPS.slice(0, this.step + 1)) {
      for (const fill of past.fills) grid[fill.cell] = fill.value;
    }
    const fresh = new Set(step.fills.map((f) => f.cell));

    this.cellBg.clear();
    for (let i = 0; i < size * size; i++) {
      const x = ORIGIN_X + colOf(i, size) * CELL;
      const y = ORIGIN_Y + rowOf(i, size) * CELL;
      const inFocus = lit.size === 0 || lit.has(cageOf[i]!);
      this.cellBg.fillStyle(PALETTE.deepPurple, inFocus ? 0.5 : 0.25);
      this.cellBg.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      this.cellBg.lineStyle(1, PALETTE.purple, inFocus ? 0.7 : 0.3);
      this.cellBg.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

      const view = this.cellText[i]!;
      view.setText(grid[i] === 0 ? '' : String(grid[i]));
      // A digit this step wrote is the point of the sentence beside it; one
      // written earlier is context and steps back out of the way.
      view.setColor(fresh.has(i) ? CSS.yellow : CSS.white).setAlpha(inFocus ? 1 : 0.55);
      view.setScale(1);
      if (animate && fresh.has(i)) {
        view.setScale(1.9);
        this.tweens.add({ targets: view, scale: 1, duration: 180, ease: 'Back.easeOut' });
      }
    }

    // Cage outlines, from the same geometry the board draws.
    this.borders.clear();
    for (const edge of cageEdges(size, EXAMPLE_PUZZLE.cages)) {
      const x = ORIGIN_X + colOf(edge.cell, size) * CELL;
      const y = ORIGIN_Y + rowOf(edge.cell, size) * CELL;
      const hot = lit.has(cageOf[edge.cell]!);
      this.borders.lineStyle(hot ? 5 : 4, hot ? PALETTE.magentaHot : PALETTE.cyan, hot ? 1 : 0.5);
      this.borders.lineBetween(
        x + edge.x1 * CELL,
        y + edge.y1 * CELL,
        x + edge.x2 * CELL,
        y + edge.y2 * CELL,
      );
    }

    EXAMPLE_PUZZLE.cages.forEach((_, i) => {
      const label = this.children.getByName(`label${i}`) as Phaser.GameObjects.Text | null;
      label?.setColor(lit.has(i) ? CSS.magentaHot : CSS.yellow).setAlpha(
        lit.size === 0 || lit.has(i) ? 1 : 0.5,
      );
    });

    this.sayText.setText(step.say);
    this.countText.setText(`${this.step + 1} / ${EXAMPLE_STEPS.length}`);
    const last = this.step === EXAMPLE_STEPS.length - 1;
    this.nextLabel.setText(last ? 'PLAY' : 'NEXT');
    this.back.container.setAlpha(this.step === 0 ? 0.4 : 1);

    if (animate && step.fills.length > 0) getAudio(this)?.play(last ? 'explosion' : 'prime');
  }
}
