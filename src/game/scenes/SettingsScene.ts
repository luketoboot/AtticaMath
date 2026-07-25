import Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, type AudioManager } from '../../audio/AudioManager';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { defaultSave } from '../../core/save/save';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
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
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.resetArmed = false;

    this.add
      .text(width / 2, height * 0.12, 'SETTINGS', {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    const persistVolumes = (): void => {
      audio?.setVolumes(saves.save.settings.sfxVolume, saves.save.settings.musicVolume);
      saves.persist();
    };

    const sfx = this.makeStepper(
      height * 0.3,
      'SFX VOLUME',
      () => saves.save.settings.sfxVolume,
      (v) => {
        saves.save.settings.sfxVolume = v;
        persistVolumes();
        getAudio(this)?.play('explosion'); // preview at the new level
      },
    );

    const music = this.makeStepper(
      height * 0.42,
      'MUSIC VOLUME',
      () => saves.save.settings.musicVolume,
      (v) => {
        saves.save.settings.musicVolume = v;
        persistVolumes();
      },
    );

    const crt = this.add
      .text(width / 2, height * 0.56, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const renderCrt = (): void => {
      crt.setText(`[ CRT SHADER ${saves.save.settings.crtEnabled ? 'ON' : 'OFF'} ]`);
    };
    renderCrt();
    const toggleCrt = (): void => {
      getAudio(this)?.play('ui');
      saves.save.settings.crtEnabled = !saves.save.settings.crtEnabled;
      saves.persist();
      renderCrt();
      applyCrt(this);
    };
    crt.on('pointerdown', toggleCrt);

    const controls = this.add
      .text(width / 2, height * 0.66, '[ CONTROLS ]', {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    controls.on('pointerover', () => controls.setColor(CSS.magentaHot));
    controls.on('pointerout', () => controls.setColor(CSS.cyan));
    const openControls = (): void => {
      getAudio(this)?.play('ui');
      this.scene.start('Controls');
    };
    controls.on('pointerdown', openControls);

    const reset = this.add
      .text(width / 2, height * 0.78, '[ RESET SAVE ]', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.red,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const resetSave = (): void => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        getAudio(this)?.play('error');
        reset.setText('[ CONFIRM AGAIN TO WIPE EVERYTHING ]');
        return;
      }
      saves.save = defaultSave();
      saves.persist();
      getAudio(this)?.play('land');
      this.scene.start('Menu');
    };
    reset.on('pointerdown', resetSave);

    const back = this.add
      .text(width / 2, height * 0.88, '[ BACK ]', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(CSS.magentaHot));
    back.on('pointerout', () => back.setColor(CSS.cyan));
    const goBack = (): void => {
      getAudio(this)?.play('ui');
      this.scene.start('Menu');
    };
    back.on('pointerdown', goBack);
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));

    new MenuNav(this, [
      [sfx],
      [music],
      [{ target: crt, onSelect: toggleCrt, onAdjust: toggleCrt }],
      [{ target: controls, onSelect: openControls }],
      [{ target: reset, onSelect: resetSave }],
      [{ target: back, onSelect: goBack }],
    ]);
    navHint(this, height * 0.96);
  }

  /** [ - ] ████████░░ 80% [ + ] volume row. Focused as one item; left/right adjusts. */
  private makeStepper(
    y: number,
    label: string,
    get: () => number,
    set: (v: number) => void,
  ): MenuItem {
    const { width } = this.scale;
    this.add
      .text(width * 0.24, y, label, { fontFamily: FONT, fontSize: '22px', color: CSS.cyanDim })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(width * 0.62, y, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.white })
      .setOrigin(0.5);
    const render = (): void => {
      const v = get();
      const filled = Math.round(v * 10);
      value.setText(`${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.round(v * 100)}%`);
    };
    render();

    const step = (dir: -1 | 1): void => {
      set(Phaser.Math.Clamp(Math.round((get() + dir * 0.1) * 10) / 10, 0, 1));
      render();
    };

    const minus = this.add
      .text(width * 0.44, y, '[ − ]', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.magentaHot })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    minus.on('pointerdown', () => step(-1));

    const plus = this.add
      .text(width * 0.8, y, '[ + ]', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.magentaHot })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    plus.on('pointerdown', () => step(1));

    // Unfilled rect spanning label→[+], so the cursor frames the whole row
    // rather than one of the two buttons. Purely a bounds source, never drawn.
    const bounds = this.add.rectangle(width * 0.535, y, width * 0.62, 46);
    return { target: bounds, onAdjust: step };
  }
}
