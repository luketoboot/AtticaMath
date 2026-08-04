import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG, type DifficultyId } from '../../core/config';
import type { SkillFilter } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton, neonChip, type NeonChip } from '../../ui/panels';
import { METEOR_DRILL_KEY } from './PlaybookScene';

/** Registry key for the meteor-defense practice filter (persists across runs). */
export const METEOR_FILTER_KEY = 'meteorFilter';
/** Registry key for the chosen pacing level. */
export const METEOR_DIFFICULTY_KEY = 'meteorDifficulty';

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

const DEFAULT_FILTER: SkillFilter = { op: 'all', maxDigits: 4, fractions: false };

export class ModeSelectScene extends Phaser.Scene {
  private filter: SkillFilter = { ...DEFAULT_FILTER };
  private difficulty: DifficultyId = CONFIG.difficulty.fallback;
  private opChips: NeonChip[] = [];
  private digitChips: NeonChip[] = [];
  private fractionChip!: NeonChip;
  private difficultyChips: NeonChip[] = [];

  constructor() {
    super('ModeSelect');
  }

  create(): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.opChips = [];
    this.digitChips = [];
    this.difficultyChips = [];

    const remembered = this.registry.get(METEOR_FILTER_KEY) as Partial<SkillFilter> | undefined;
    this.filter = { ...DEFAULT_FILTER, ...remembered };
    const level = this.registry.get(METEOR_DIFFICULTY_KEY) as DifficultyId | undefined;
    this.difficulty =
      CONFIG.difficulty.levels.find((l) => l.id === level)?.id ?? CONFIG.difficulty.fallback;

    makeIcon(this, width / 2 - 190, height * 0.1, 'meteor', {
      size: 50,
      color: PALETTE.magenta,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 20, height * 0.1, 'SECTOR SELECT', {
        fontFamily: FONT,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.sectionLabel(height * 0.185, 'OPERATION');
    OP_CHOICES.forEach((choice, i) => {
      const x = width / 2 + (i - (OP_CHOICES.length - 1) / 2) * 118;
      this.opChips.push(
        neonChip(this, x, height * 0.265, choice.label, () => this.chooseOp(choice.value), {
          size: 64,
          width: choice.label.length > 1 ? 104 : 64,
          fontSize: choice.label.length > 1 ? 24 : 30,
          accent: PALETTE.magenta,
        }),
      );
    });

    this.sectionLabel(height * 0.36, 'MAX DIGITS');
    DIGIT_CHOICES.forEach((digits, i) => {
      // The row leaves room for the fractions toggle on its right flank —
      // digits cap the integers, the toggle owns the fraction family, and
      // putting them side by side is what says the two do not overlap.
      const x = width / 2 - 250 + i * 96;
      this.digitChips.push(
        neonChip(this, x, height * 0.44, String(digits), () => this.chooseDigits(digits), {
          size: 58,
          fontSize: 28,
          accent: PALETTE.cyan,
        }),
      );
    });
    this.fractionChip = neonChip(
      this,
      width / 2 + 200,
      height * 0.44,
      'FRACTIONS',
      () => this.toggleFractions(),
      { size: 58, width: 190, fontSize: 20, accent: PALETTE.yellow },
    );

    this.add
      .text(width / 2, height * 0.505, 'DIGITS CAP THE INTEGERS · FRACTIONS & PERCENTS RIDE THE TOGGLE', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.sectionLabel(height * 0.575, 'PACE');
    CONFIG.difficulty.levels.forEach((lvl, i) => {
      const x = width / 2 + (i - (CONFIG.difficulty.levels.length - 1) / 2) * 220;
      this.difficultyChips.push(
        neonChip(this, x, height * 0.655, lvl.label, () => this.chooseDifficulty(lvl.id), {
          size: 58,
          width: 190,
          fontSize: 22,
          accent: PALETTE.magentaHot,
        }),
      );
      this.add
        .text(x, height * 0.655 + 42, lvl.tagline, {
          fontFamily: FONT,
          fontSize: '12px',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5);
    });

    const launch = neonButton(this, width / 2, height * 0.795, 'LAUNCH', () => this.launch(), {
      width: 300,
      height: 58,
      fontSize: 28,
      accent: PALETTE.yellow,
    });
    const back = neonButton(this, width / 2, height * 0.885, 'BACK', () => goTo(this, 'Menu'), {
      width: 200,
      height: 42,
      fontSize: 18,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goTo(this, 'Menu');
    });

    const nav = new MenuNav(this, [
      this.opChips,
      [...this.digitChips, this.fractionChip],
      this.difficultyChips,
      [launch],
      [back],
    ]);
    // Open on LAUNCH so ENTER still starts a run immediately, and park each
    // option row on whatever is currently chosen rather than on its first cell.
    nav.setColumn(0, Math.max(0, OP_CHOICES.findIndex((c) => c.value === this.filter.op)));
    nav.setColumn(1, Math.max(0, DIGIT_CHOICES.indexOf(this.filter.maxDigits)));
    nav.setColumn(
      2,
      Math.max(0, CONFIG.difficulty.levels.findIndex((l) => l.id === this.difficulty)),
    );
    nav.focus(3, 0, false);
    navHint(this, height * 0.955);

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

  private toggleFractions(): void {
    getAudio(this)?.play('ui');
    this.filter.fractions = !this.filter.fractions;
    this.refresh();
  }

  private chooseDifficulty(id: DifficultyId): void {
    getAudio(this)?.play('ui');
    this.difficulty = id;
    this.refresh();
  }

  private refresh(): void {
    OP_CHOICES.forEach((choice, i) => {
      this.opChips[i]?.setChosen(choice.value === this.filter.op);
    });
    DIGIT_CHOICES.forEach((digits, i) => {
      this.digitChips[i]?.setChosen(digits === this.filter.maxDigits);
    });
    this.fractionChip.setChosen(this.filter.fractions);
    CONFIG.difficulty.levels.forEach((lvl, i) => {
      this.difficultyChips[i]?.setChosen(lvl.id === this.difficulty);
    });
  }

  private launch(): void {
    getAudio(this)?.play('ui');
    this.registry.set(METEOR_FILTER_KEY, { ...this.filter });
    this.registry.set(METEOR_DIFFICULTY_KEY, this.difficulty);
    // An ordinary launch is not a Playbook drill; never inherit a stale one.
    this.registry.remove(METEOR_DRILL_KEY);
    goTo(this, 'Game');
  }
}
