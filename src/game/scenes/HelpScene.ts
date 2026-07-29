import Phaser from 'phaser';
import { helpFor } from '../../core/help/help';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { neonButton } from '../../ui/panels';
import { paintPanel } from '../../ui/panels';

interface HelpData {
  /** Scene key to resume, and the page to show. */
  target: string;
}

/**
 * The rules, on demand, over a paused game.
 *
 * Launched as an overlay rather than reached from a menu, because the moment a
 * player wants this is the moment they are stuck mid-run — and making them quit
 * to find out how the mode works is how a mode gets abandoned instead of
 * learned. The game underneath pauses, so reading costs nothing in a mode that
 * charges for time.
 */
export class HelpScene extends Phaser.Scene {
  constructor() {
    super('Help');
  }

  create(data: HelpData): void {
    const { width, height } = this.scale;
    const page = helpFor(data.target);
    this.add.rectangle(0, 0, width, height, PALETTE.black, 0.86).setOrigin(0);

    if (!page) {
      this.add
        .text(width / 2, height / 2, 'NO BRIEFING FOR THIS SCREEN', {
          fontFamily: FONT,
          fontSize: '20px',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5);
      this.closeOn(data.target, height);
      return;
    }

    const panel = this.add.graphics();
    const panelW = 900;
    const panelH = 470;
    panel.setPosition(width / 2, 322);
    paintPanel(panel, {
      width: panelW,
      height: panelH,
      accent: PALETTE.cyan,
      chamfer: 16,
      fillAlpha: 0.9,
      borderWidth: 3,
      headerRule: false,
    });

    this.add
      .text(width / 2, 128, page.title, {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

    // The goal first and alone. A player who reads only one line should still
    // know what they are trying to do.
    this.add
      .text(width / 2, 176, page.goal.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '16px',
        color: CSS.yellow,
        align: 'center',
        wordWrap: { width: panelW - 90 },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0);

    const left = width / 2 - panelW / 2 + 54;
    let y = 246;
    for (const line of page.lines) {
      this.add
        .text(left, y, line.key ?? '', {
          fontFamily: FONT,
          fontSize: '14px',
          fontStyle: 'bold',
          color: CSS.magentaHot,
        })
        .setOrigin(0, 0);
      this.add
        .text(left + 132, y, line.text, {
          fontFamily: FONT,
          fontSize: '14px',
          color: CSS.white,
          wordWrap: { width: panelW - 240 },
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      y += 34;
    }

    if (page.gotcha !== undefined) {
      this.add
        .text(width / 2, y + 16, page.gotcha, {
          fontFamily: FONT,
          fontSize: '13px',
          color: CSS.cyanDim,
          align: 'center',
          wordWrap: { width: panelW - 110 },
          lineSpacing: 5,
        })
        .setOrigin(0.5, 0);
    }

    this.closeOn(data.target, height);
  }

  private closeOn(target: string, height: number): void {
    const close = (): void => {
      this.scene.stop();
      this.scene.resume(target);
    };
    neonButton(this, this.scale.width / 2, height - 74, 'BACK TO IT', close, {
      width: 260,
      height: 50,
      fontSize: 20,
      accent: PALETTE.yellow,
    });
    // Any of the ways a player reaches for "make this go away".
    this.input.keyboard?.once('keydown-H', close);
    this.input.keyboard?.once('keydown-ESC', close);
    this.input.keyboard?.once('keydown-ENTER', close);
  }
}
