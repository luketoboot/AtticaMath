import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton, neonChip, type NeonChip } from '../../ui/panels';

/** Registry key for the size last played, so a relaunch keeps it. */
export const EXPRESSION_LEVEL_KEY = 'expressionLevel';

const ACCENTS = [PALETTE.cyan, PALETTE.yellow, PALETTE.magentaHot] as const;

/**
 * How big a puzzle.
 *
 * This mode used to have no chooser at all: par came from the player's rating,
 * which is an average across every mode, so getting good at Meteor Defense
 * silently promoted Expression Builder to four-chip Countdown puzzles nobody
 * asked for. Rating still moves the puzzle inside a level; the level decides
 * how far it is allowed to go.
 */
export class ExpressionSelectScene extends Phaser.Scene {
  private levelId = CONFIG.expression.levels[0]!.id;
  private chips: NeonChip[] = [];
  private blurb!: Phaser.GameObjects.Text;

  constructor() {
    super('ExpressionSelect');
  }

  create(): void {
    const { width, height } = this.scale;
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.94 });
    getAudio(this)?.playMusic('menu');

    const levels = CONFIG.expression.levels;
    this.levelId = (this.registry.get(EXPRESSION_LEVEL_KEY) as string | undefined) ?? levels[0]!.id;
    if (!levels.some((l) => l.id === this.levelId)) this.levelId = levels[0]!.id;

    makeIcon(this, width / 2 - 196, 78, 'expression', {
      size: 34,
      color: PALETTE.cyan,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 10, 78, 'EXPRESSION BUILDER', {
        fontFamily: FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 118, 'HOW BIG SHOULD THE PUZZLES BE', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.chips = levels.map((level, i) =>
      neonChip(
        this,
        width / 2 + (i - (levels.length - 1) / 2) * 320,
        250,
        level.label,
        () => this.choose(level.id),
        { size: 92, width: 290, fontSize: 30, accent: ACCENTS[i] ?? PALETTE.cyan },
      ),
    );

    this.blurb = this.add
      .text(width / 2, 356, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CSS.white,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    const launch = neonButton(this, width / 2, 470, 'LAUNCH', () => this.launch(), {
      width: 320,
      height: 62,
      fontSize: 26,
      accent: PALETTE.yellow,
    });
    const back = neonButton(this, width / 2, 552, 'BACK', () => this.scene.start('Menu'), {
      width: 220,
      height: 50,
      fontSize: 19,
    });

    const nav = new MenuNav(this, [this.chips, [launch], [back]]);
    nav.setColumn(0, levels.findIndex((l) => l.id === this.levelId));
    navHint(this, height - 26);

    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));
    this.refresh();
  }

  private choose(id: string): void {
    this.levelId = id;
    getAudio(this)?.play('ui');
    this.refresh();
  }

  private refresh(): void {
    const levels = CONFIG.expression.levels;
    this.chips.forEach((chip, i) => chip.setChosen(levels[i]!.id === this.levelId));
    this.blurb.setText(levels.find((l) => l.id === this.levelId)!.blurb);
  }

  private launch(): void {
    this.registry.set(EXPRESSION_LEVEL_KEY, this.levelId);
    this.scene.start('Expression', { levelId: this.levelId });
  }
}
