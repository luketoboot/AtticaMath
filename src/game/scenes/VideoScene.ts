/**
 * VIDEO — every CRT effect on its own dial.
 *
 * The screen is its own preview: the pipeline is running on this camera, so a
 * dial moves and the glass in front of you changes on the same frame. That is
 * the whole reason this is a screen and not a submenu of checkboxes — nobody
 * can tell you what 60% aperture mask looks like, they can only show you. The
 * backdrop is drawn with sun and grid for the same reason: bright edges and
 * dark corners give bloom, mask and vignette something to act on while you are
 * looking straight at them.
 */
import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  defaultVideoSettings,
  isDefaultVideo,
  VIDEO_KNOBS,
  VIDEO_MAX,
  VIDEO_MIN,
  VIDEO_STEP,
} from '../../core/settings/video';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { setVideoSettings } from '../../fx/videoSettings';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, type NeonButton } from '../../ui/panels';
import { stepperRow, type Stepper } from '../../ui/Stepper';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

export class VideoScene extends Phaser.Scene {
  private rows: Stepper[] = [];
  private resetButton!: NeonButton;
  private shaderNote!: Phaser.GameObjects.Text;
  private saves!: SaveManager;

  constructor() {
    super('Video');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    const saves = this.saves;
    applyCrt(this);
    drawBackdrop(this, { horizon: 0.86 });

    makeIcon(this, width / 2 - 108, 46, 'settings', {
      size: 34,
      color: PALETTE.cyan,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 16, 46, 'VIDEO', {
        fontFamily: FONT,
        fontSize: '38px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 76, 'THE PICTURE CHANGES AS YOU TURN THE DIALS', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    // --- master switch ---

    const crtLabel = (): string => `CRT SHADER  ${saves.save.settings.crtEnabled ? 'ON' : 'OFF'}`;
    const toggleCrt = (): void => {
      saves.save.settings.crtEnabled = !saves.save.settings.crtEnabled;
      saves.persist();
      crt.setText(crtLabel());
      crt.setAccent(saves.save.settings.crtEnabled ? PALETTE.cyan : PALETTE.cyanDim);
      applyCrt(this);
      this.refreshNote();
    };
    const crt = neonButton(this, width / 2, 122, crtLabel(), toggleCrt, {
      width: 320,
      height: 44,
      fontSize: 19,
    });
    crt.setAccent(saves.save.settings.crtEnabled ? PALETTE.cyan : PALETTE.cyanDim);

    this.shaderNote = this.add
      .text(width / 2, 152, '', { fontFamily: FONT, fontSize: '11px', color: CSS.yellow })
      .setOrigin(0.5);

    // --- dials ---

    const apply = (): void => {
      setVideoSettings(saves.save.settings.video);
      saves.persist();
      this.refreshResetButton();
    };

    const top = 186;
    const gap = 46;
    this.rows = VIDEO_KNOBS.map((knob, i) =>
      stepperRow(this, {
        y: top + i * gap,
        label: knob.label,
        hint: knob.hint,
        min: VIDEO_MIN,
        max: VIDEO_MAX,
        step: VIDEO_STEP,
        shipped: 1,
        cells: 12,
        fontSize: 18,
        labelX: 0.19,
        minusX: 0.47,
        barX: 0.635,
        plusX: 0.8,
        get: () => saves.save.settings.video[knob.id],
        set: (v) => {
          saves.save.settings.video[knob.id] = v;
          apply();
        },
      }),
    );

    // --- footer ---

    const footer = top + VIDEO_KNOBS.length * gap + 12;
    this.resetButton = neonButton(
      this,
      width / 2 - 132,
      footer,
      'RESET TO DEFAULT',
      () => {
        saves.save.settings.video = defaultVideoSettings();
        apply();
        for (const row of this.rows) row.refresh();
      },
      { width: 244, height: 44, fontSize: 17 },
    );

    const goBack = (): void => {
      goTo(this, 'Settings');
    };
    const back = neonButton(this, width / 2 + 132, footer, 'BACK', goBack, {
      width: 200,
      height: 44,
      fontSize: 20,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goBack();
    });

    const rows: MenuItem[][] = [[{ ...crt, onAdjust: toggleCrt }]];
    for (const row of this.rows) rows.push([row]);
    rows.push([this.resetButton, back]);
    new MenuNav(this, rows);

    this.refreshNote();
    this.refreshResetButton();
    navHint(this, height - 16);
  }

  /** Say so when the dials are turning nothing, rather than let it read as broken. */
  private refreshNote(): void {
    const off = !this.saves.save.settings.crtEnabled;
    this.shaderNote.setText(off ? 'SHADER OFF — ONLY SCREEN SHAKE STILL APPLIES' : '');
  }

  /** Dim the reset when there is nothing to reset. */
  private refreshResetButton(): void {
    const untouched = isDefaultVideo(this.saves.save.settings.video);
    this.resetButton.setAccent(untouched ? PALETTE.cyanDim : PALETTE.yellow);
  }
}
