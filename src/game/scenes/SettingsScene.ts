import Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, type AudioManager } from '../../audio/AudioManager';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { defaultSave } from '../../core/save/save';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, neonChip } from '../../ui/panels';
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

    const crtLabel = (): string =>
      `CRT SHADER  ${saves.save.settings.crtEnabled ? 'ON' : 'OFF'}`;
    const toggleCrt = (): void => {
      saves.save.settings.crtEnabled = !saves.save.settings.crtEnabled;
      saves.persist();
      crt.setText(crtLabel());
      crt.setAccent(saves.save.settings.crtEnabled ? PALETTE.cyan : PALETTE.cyanDim);
      applyCrt(this);
    };
    const crt = neonButton(this, width / 2, height * 0.56, crtLabel(), toggleCrt, {
      width: 340,
      height: 54,
      fontSize: 22,
    });

    const controls = neonButton(
      this,
      width / 2,
      height * 0.66,
      'CONTROLS',
      () => this.scene.start('Controls'),
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
      this.scene.start('Menu');
    };
    const reset = neonButton(this, width / 2, height * 0.78, 'RESET SAVE', resetSave, {
      width: 340,
      height: 46,
      fontSize: 18,
      accent: PALETTE.red,
    });

    const goBack = (): void => {
      this.scene.start('Menu');
    };
    const back = neonButton(this, width / 2, height * 0.88, 'BACK', goBack, {
      width: 200,
      height: 46,
      fontSize: 20,
    });
    this.input.keyboard?.once('keydown-ESC', goBack);

    new MenuNav(this, [
      [sfx],
      [music],
      [{ ...crt, onAdjust: toggleCrt }],
      [controls],
      [reset],
      [back],
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

    neonChip(this, width * 0.44, y, '−', () => step(-1), {
      size: 38,
      fontSize: 24,
      accent: PALETTE.magentaHot,
    });
    neonChip(this, width * 0.8, y, '+', () => step(1), {
      size: 38,
      fontSize: 24,
      accent: PALETTE.magentaHot,
    });

    // Unfilled rect spanning label→[+], so the cursor frames the whole row
    // rather than one of the two buttons. Purely a bounds source, never drawn.
    const bounds = this.add.rectangle(width * 0.535, y, width * 0.62, 46);
    return { target: bounds, onAdjust: step };
  }
}
