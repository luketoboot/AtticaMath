import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { goTo } from '../../fx/juice';
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
  /** Set once a leave animation is running, so a second key cannot re-leave. */
  private closing = false;

  constructor() {
    super('Pause');
  }

  create(data: PauseData): void {
    const { width, height } = this.scale;
    this.closing = false;
    // The plate eases over the game instead of appearing between two frames.
    // Camera alpha, not a rectangle tween, so the whole overlay rides it.
    this.cameras.main.alpha = 0;
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 120 });
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
        // The run is abandoned before the fade, so the frozen game vanishes
        // behind the plate rather than reappearing for a frame on the way out.
        this.scene.stop(data.target);
        goTo(this, 'Menu');
      },
      { ...opts, accent: PALETTE.magenta },
    );

    new MenuNav(this, [[resume], [quit]]);
    navHint(this, height * 0.72);

    // Resume on the same key that paused, whatever it is bound to.
    onActionKey(this, sceneBindings(this).pause, () => this.resumeTarget(data.target, true));
  }

  // The pause key carries the back tone; the RESUME button voices itself.
  private resumeTarget(target: string, sound = false): void {
    if (this.closing) return;
    this.closing = true;
    if (sound) getAudio(this)?.play('back');
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        this.scene.resume(target);
        this.scene.stop();
      },
    });
  }

}
