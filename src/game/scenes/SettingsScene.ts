import Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, type AudioManager } from '../../audio/AudioManager';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { defaultSave } from '../../core/save/save';
import { CSS, FONT, PALETTE } from '../../fx/palette';
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

    this.makeStepper(
      height * 0.3,
      'SFX VOLUME',
      () => saves.save.settings.sfxVolume,
      (v) => {
        saves.save.settings.sfxVolume = v;
        persistVolumes();
        getAudio(this)?.play('explosion'); // preview at the new level
      },
    );

    this.makeStepper(
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
    crt.on('pointerdown', () => {
      getAudio(this)?.play('ui');
      saves.save.settings.crtEnabled = !saves.save.settings.crtEnabled;
      saves.persist();
      renderCrt();
      applyCrt(this);
    });

    const reset = this.add
      .text(width / 2, height * 0.72, '[ RESET SAVE ]', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.red,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    reset.on('pointerdown', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        getAudio(this)?.play('error');
        reset.setText('[ CLICK AGAIN TO WIPE EVERYTHING ]');
        return;
      }
      saves.save = defaultSave();
      saves.persist();
      getAudio(this)?.play('land');
      this.scene.start('Menu');
    });

    const back = this.add
      .text(width / 2, height * 0.88, '[ BACK ]', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(CSS.magentaHot));
    back.on('pointerout', () => back.setColor(CSS.cyan));
    back.on('pointerdown', () => {
      getAudio(this)?.play('ui');
      this.scene.start('Menu');
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));
  }

  /** [ - ] ████████░░ 80% [ + ] volume row. */
  private makeStepper(
    y: number,
    label: string,
    get: () => number,
    set: (v: number) => void,
  ): void {
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

    const minus = this.add
      .text(width * 0.44, y, '[ − ]', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.magentaHot })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    minus.on('pointerdown', () => {
      set(Math.max(0, Math.round((get() - 0.1) * 10) / 10));
      render();
    });

    const plus = this.add
      .text(width * 0.8, y, '[ + ]', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.magentaHot })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    plus.on('pointerdown', () => {
      set(Math.min(1, Math.round((get() + 0.1) * 10) / 10));
      render();
    });
  }
}
