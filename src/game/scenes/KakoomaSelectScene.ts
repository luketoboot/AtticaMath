import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import type { KakoomaOp } from '../../core/kakooma/kakooma';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton, neonChip, type NeonChip } from '../../ui/panels';

/** Registry key for the variant last played, so a relaunch keeps it. */
export const KAKOOMA_OP_KEY = 'kakoomaOp';

interface Variant {
  op: KakoomaOp;
  label: string;
  blurb: string;
  accent: number;
}

/**
 * Which Kakooma.
 *
 * Two variants is barely a screen, but the choice changes what the run drills —
 * bridging ten versus the seven times table — and burying that behind a
 * keypress on the board would make it a setting rather than a decision. It also
 * gives each variant a sentence, which the menu card has no room for.
 */
const VARIANTS: readonly Variant[] = [
  {
    op: 'add',
    label: 'PLUS',
    blurb: 'ONE NUMBER IS THE SUM OF TWO OTHERS.\nBRIDGING TEN, OVER AND OVER, WITHOUT BEING ASKED.',
    accent: PALETTE.cyan,
  },
  {
    op: 'mul',
    label: 'TIMES',
    blurb: 'ONE NUMBER IS THE PRODUCT OF TWO OTHERS.\nEVERY TABLE AT ONCE, READ BACKWARDS.',
    accent: PALETTE.magentaHot,
  },
];

export class KakoomaSelectScene extends Phaser.Scene {
  private op: KakoomaOp = 'add';
  private chips: NeonChip[] = [];
  private blurb!: Phaser.GameObjects.Text;

  constructor() {
    super('KakoomaSelect');
  }

  create(): void {
    const { width, height } = this.scale;
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.94 });
    getAudio(this)?.playMusic('menu');

    this.op = (this.registry.get(KAKOOMA_OP_KEY) as KakoomaOp | undefined) ?? 'add';

    makeIcon(this, width / 2 - 132, 78, 'kakooma', {
      size: 34,
      color: PALETTE.yellow,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 10, 78, 'KAKOOMA', {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 118, 'FIND THE ONE THAT THE OTHER TWO MAKE', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.chips = VARIANTS.map((variant, i) =>
      neonChip(
        this,
        width / 2 + (i - (VARIANTS.length - 1) / 2) * 300,
        250,
        variant.label,
        () => this.choose(variant.op),
        { size: 96, width: 260, fontSize: 40, accent: variant.accent },
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
    const back = neonButton(this, width / 2, 552, 'BACK', () => goTo(this, 'Menu'), {
      width: 220,
      height: 50,
      fontSize: 19,
    });

    const nav = new MenuNav(this, [this.chips, [launch], [back]]);
    nav.setColumn(0, VARIANTS.findIndex((v) => v.op === this.op));
    navHint(this, height - 26);

    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goTo(this, 'Menu');
    });
    this.refresh();
  }

  private choose(op: KakoomaOp): void {
    this.op = op;
    getAudio(this)?.play('ui');
    this.refresh();
  }

  private refresh(): void {
    this.chips.forEach((chip, i) => chip.setChosen(VARIANTS[i]!.op === this.op));
    this.blurb.setText(VARIANTS.find((v) => v.op === this.op)!.blurb);
  }

  private launch(): void {
    this.registry.set(KAKOOMA_OP_KEY, this.op);
    goTo(this, 'Kakooma', { op: this.op });
  }
}
