import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import type { SkillFilter } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton, neonChip, type NeonChip } from '../../ui/panels';

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
  private opChips: NeonChip[] = [];
  private digitChips: NeonChip[] = [];

  constructor() {
    super('ModeSelect');
  }

  create(): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.94 });
    this.opChips = [];
    this.digitChips = [];

    const remembered = this.registry.get(METEOR_FILTER_KEY) as SkillFilter | undefined;
    this.filter = remembered ? { ...remembered } : { op: 'all', maxDigits: 4 };

    makeIcon(this, width / 2 - 190, height * 0.13, 'meteor', {
      size: 54,
      color: PALETTE.magenta,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 20, height * 0.13, 'SECTOR SELECT', {
        fontFamily: FONT,
        fontSize: '46px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.sectionLabel(height * 0.27, 'OPERATION');
    OP_CHOICES.forEach((choice, i) => {
      const x = width / 2 + (i - (OP_CHOICES.length - 1) / 2) * 118;
      this.opChips.push(
        neonChip(this, x, height * 0.37, choice.label, () => this.chooseOp(choice.value), {
          size: 68,
          width: choice.label.length > 1 ? 104 : 68,
          fontSize: choice.label.length > 1 ? 24 : 32,
          accent: PALETTE.magenta,
        }),
      );
    });

    this.sectionLabel(height * 0.5, 'MAX DIGITS');
    DIGIT_CHOICES.forEach((digits, i) => {
      const x = width / 2 + (i - (DIGIT_CHOICES.length - 1) / 2) * 100;
      this.digitChips.push(
        neonChip(this, x, height * 0.6, String(digits), () => this.chooseDigits(digits), {
          size: 62,
          fontSize: 30,
          accent: PALETTE.cyan,
        }),
      );
    });

    this.add
      .text(width / 2, height * 0.69, 'PROBLEMS RANGE FROM 1 DIGIT UP TO YOUR CAP', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const launch = neonButton(this, width / 2, height * 0.81, 'LAUNCH', () => this.launch(), {
      width: 300,
      height: 62,
      fontSize: 28,
      accent: PALETTE.yellow,
    });
    const back = neonButton(this, width / 2, height * 0.905, 'BACK', () => this.scene.start('Menu'), {
      width: 200,
      height: 44,
      fontSize: 18,
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));

    const nav = new MenuNav(this, [this.opChips, this.digitChips, [launch], [back]]);
    // Open on LAUNCH so ENTER still starts a run immediately, and park each
    // option row on whatever is currently chosen rather than on its first cell.
    nav.setColumn(0, Math.max(0, OP_CHOICES.findIndex((c) => c.value === this.filter.op)));
    nav.setColumn(1, Math.max(0, DIGIT_CHOICES.indexOf(this.filter.maxDigits)));
    nav.focus(2, 0, false);
    navHint(this, height * 0.965);

    this.refresh();
  }

  private sectionLabel(y: number, text: string): void {
    const { width } = this.scale;
    this.add
      .text(width / 2, y, text, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
    const g = this.add.graphics();
    g.lineStyle(1, PALETTE.cyan, 0.35);
    g.lineBetween(width / 2 - 320, y, width / 2 - 90, y);
    g.lineBetween(width / 2 + 90, y, width / 2 + 320, y);
  }

  private chooseOp(op: SkillFilter['op']): void {
    getAudio(this)?.play('ui');
    this.filter.op = op;
    this.refresh();
  }

  private chooseDigits(digits: SkillFilter['maxDigits']): void {
    getAudio(this)?.play('ui');
    this.filter.maxDigits = digits;
    this.refresh();
  }

  private refresh(): void {
    OP_CHOICES.forEach((choice, i) => {
      this.opChips[i]?.setChosen(choice.value === this.filter.op);
    });
    DIGIT_CHOICES.forEach((digits, i) => {
      this.digitChips[i]?.setChosen(digits === this.filter.maxDigits);
    });
  }

  private launch(): void {
    getAudio(this)?.play('ui');
    this.registry.set(METEOR_FILTER_KEY, { ...this.filter });
    this.scene.start('Game');
  }
}
