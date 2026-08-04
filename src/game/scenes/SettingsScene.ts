import Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, type AudioManager } from '../../audio/AudioManager';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { defaultSave } from '../../core/save/save';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton } from '../../ui/panels';
import { stepperRow } from '../../ui/Stepper';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

export class SettingsScene extends Phaser.Scene {
  private resetArmed = false;

  constructor() {
    super('Settings');
  }

  create(): void {
    const { width, height } = this.scale;
    const saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    const audio = this.registry.get(AUDIO_REGISTRY_KEY) as AudioManager | undefined;
    audio?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.95 });
    this.resetArmed = false;

    makeIcon(this, width / 2 - 130, height * 0.12, 'settings', {
      size: 46,
      color: PALETTE.cyan,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 24, height * 0.12, 'SETTINGS', {
        fontFamily: FONT,
        fontSize: '46px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    const persistVolumes = (): void => {
      audio?.setVolumes(saves.save.settings.sfxVolume, saves.save.settings.musicVolume);
      saves.persist();
    };

    const sfx = stepperRow(this, {
      y: height * 0.3,
      label: 'SFX VOLUME',
      get: () => saves.save.settings.sfxVolume,
      set: (v) => {
        saves.save.settings.sfxVolume = v;
        persistVolumes();
        getAudio(this)?.play('explosion'); // preview at the new level
      },
    });

    const music = stepperRow(this, {
      y: height * 0.42,
      label: 'MUSIC VOLUME',
      get: () => saves.save.settings.musicVolume,
      set: (v) => {
        saves.save.settings.musicVolume = v;
        persistVolumes();
      },
    });

    // The CRT switch moved in with the dials that modify it — a master switch
    // one screen away from everything it governs is just a thing to hunt for.
    const video = neonButton(
      this,
      width / 2,
      height * 0.56,
      'VIDEO',
      () => goTo(this, 'Video'),
      {
        width: 340,
        height: 54,
        fontSize: 22,
        sub: `CRT ${saves.save.settings.crtEnabled ? 'ON' : 'OFF'}  ·  SCANLINES · BLOOM · SHAKE`,
      },
    );

    const controls = neonButton(
      this,
      width / 2,
      height * 0.66,
      'CONTROLS',
      () => goTo(this, 'Controls'),
      { width: 340, height: 54, fontSize: 22, sub: 'REBIND EVERY KEY' },
    );

    const resetSave = (): void => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        getAudio(this)?.play('error');
        reset.setText('CONFIRM AGAIN TO WIPE EVERYTHING');
        reset.label.setFontSize(15);
        return;
      }
      saves.save = defaultSave();
      saves.persist();
      getAudio(this)?.play('land');
      goTo(this, 'Menu');
    };
    const reset = neonButton(this, width / 2, height * 0.78, 'RESET SAVE', resetSave, {
      width: 340,
      height: 46,
      fontSize: 18,
      accent: PALETTE.red,
    });

    const goBack = (): void => {
      goTo(this, 'Menu');
    };
    const back = neonButton(this, width / 2, height * 0.88, 'BACK', goBack, {
      width: 200,
      height: 46,
      fontSize: 20,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goBack();
    });

    new MenuNav(this, [[sfx], [music], [video], [controls], [reset], [back]]);
    navHint(this, height * 0.96);
  }
}
