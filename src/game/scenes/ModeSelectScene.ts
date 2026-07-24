import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import type { SkillFilter } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';

/** Registry key for the meteor-defense practice filter (persists across runs). */
export const METEOR_FILTER_KEY = 'meteorFilter';

interface OpChoice {
  label: string;
  value: SkillFilter['op'];
}

const OP_CHOICES: readonly OpChoice[] = [
  { label: '+', value: 'add' },
  { label: '−', value: 'sub' },
  { label: '×', value: 'mul' },
  { label: '÷', value: 'div' },
  { label: 'ALL', value: 'all' },
];

const DIGIT_CHOICES: readonly SkillFilter['maxDigits'][] = [1, 2, 3, 4];

export class ModeSelectScene extends Phaser.Scene {
  private filter: SkillFilter = { op: 'all', maxDigits: 4 };
  private opButtons: Phaser.GameObjects.Text[] = [];
  private digitButtons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('ModeSelect');
  }

  create(): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.opButtons = [];
    this.digitButtons = [];

    const remembered = this.registry.get(METEOR_FILTER_KEY) as SkillFilter | undefined;
    this.filter = remembered ? { ...remembered } : { op: 'all', maxDigits: 4 };

    this.add
      .text(width / 2, height * 0.14, 'SECTOR SELECT', {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.28, 'OPERATION', { fontFamily: FONT, fontSize: '18px', color: CSS.cyanDim })
      .setOrigin(0.5);
    OP_CHOICES.forEach((choice, i) => {
      const x = width / 2 + (i - (OP_CHOICES.length - 1) / 2) * 130;
      const btn = this.add
        .text(x, height * 0.37, `[ ${choice.label} ]`, {
          fontFamily: FONT,
          fontSize: '34px',
          fontStyle: 'bold',
          color: CSS.cyan,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        getAudio(this)?.play('ui');
        this.filter.op = choice.value;
        this.refresh();
      });
      this.opButtons.push(btn);
    });

    this.add
      .text(width / 2, height * 0.5, 'MAX DIGITS', { fontFamily: FONT, fontSize: '18px', color: CSS.cyanDim })
      .setOrigin(0.5);
    DIGIT_CHOICES.forEach((digits, i) => {
      const x = width / 2 + (i - (DIGIT_CHOICES.length - 1) / 2) * 110;
      const btn = this.add
        .text(x, height * 0.59, `[ ${digits} ]`, {
          fontFamily: FONT,
          fontSize: '34px',
          fontStyle: 'bold',
          color: CSS.cyan,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        getAudio(this)?.play('ui');
        this.filter.maxDigits = digits;
        this.refresh();
      });
      this.digitButtons.push(btn);
    });

    this.add
      .text(width / 2, height * 0.67, 'PROBLEMS RANGE FROM 1 DIGIT UP TO YOUR CAP', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const launch = this.add
      .text(width / 2, height * 0.8, '[ LAUNCH ]', {
        fontFamily: FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    launch.on('pointerdown', () => this.launch());
    this.input.keyboard?.once('keydown-ENTER', () => this.launch());

    const back = this.add
      .text(width / 2, height * 0.9, '[ BACK ]', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.cyanDim })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Menu'));
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));

    this.refresh();
  }

  private refresh(): void {
    OP_CHOICES.forEach((choice, i) => {
      this.opButtons[i]?.setColor(choice.value === this.filter.op ? CSS.yellow : CSS.cyan);
    });
    DIGIT_CHOICES.forEach((digits, i) => {
      this.digitButtons[i]?.setColor(digits === this.filter.maxDigits ? CSS.yellow : CSS.cyan);
    });
  }

  private launch(): void {
    getAudio(this)?.play('ui');
    this.registry.set(METEOR_FILTER_KEY, { ...this.filter });
    this.scene.start('Game');
  }
}
