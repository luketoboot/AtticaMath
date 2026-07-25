import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';

interface PauseData {
  /** Scene key to resume when unpausing. */
  target: string;
}

/** Translucent overlay launched on top of a paused gameplay scene. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(data: PauseData): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.black, 0.78).setOrigin(0);

    this.add
      .text(width / 2, height * 0.32, 'PAUSED', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

    const resume = this.makeButton(width / 2, height * 0.5, 'RESUME', () =>
      this.resumeTarget(data.target),
    );
    const quit = this.makeButton(width / 2, height * 0.6, 'QUIT TO MENU', () => {
      this.scene.stop(data.target);
      this.scene.start('Menu');
    });

    new MenuNav(this, [[resume], [quit]]);
    navHint(this, height * 0.72);

    this.input.keyboard?.on('keydown-ESC', () => this.resumeTarget(data.target));
  }

  private resumeTarget(target: string): void {
    getAudio(this)?.play('ui');
    this.scene.resume(target);
    this.scene.stop();
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): MenuItem {
    const text = this.add
      .text(x, y, `[ ${label} ]`, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor(CSS.magentaHot));
    text.on('pointerout', () => text.setColor(CSS.cyan));
    const select = (): void => {
      getAudio(this)?.play('ui');
      onClick();
    };
    text.on('pointerdown', select);
    return { target: text, onSelect: select };
  }
}
