import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton } from '../../ui/panels';
import { onActionKey, sceneBindings } from '../input/KeyState';

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

    const opts = { width: 280, height: 54, fontSize: 22 };
    const resume = neonButton(
      this,
      width / 2,
      height * 0.5,
      'RESUME',
      () => this.resumeTarget(data.target),
      { ...opts, accent: PALETTE.cyan },
    );
    const quit = neonButton(
      this,
      width / 2,
      height * 0.6,
      'QUIT TO MENU',
      () => {
        this.scene.stop(data.target);
        this.scene.start('Menu');
      },
      { ...opts, accent: PALETTE.magenta },
    );

    new MenuNav(this, [[resume], [quit]]);
    navHint(this, height * 0.72);

    // Resume on the same key that paused, whatever it is bound to.
    onActionKey(this, sceneBindings(this).pause, () => this.resumeTarget(data.target));
  }

  private resumeTarget(target: string): void {
    getAudio(this)?.play('ui');
    this.scene.resume(target);
    this.scene.stop();
  }

}
