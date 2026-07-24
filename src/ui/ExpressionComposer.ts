import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import { formatTokens, num, op, type Op, type Token } from '../core/expression/expression';
import { CSS, FONT, PALETTE } from '../fx/palette';

interface Chip {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  value: number;
  used: boolean;
}

const OP_KEYS: Record<string, Op> = { '+': '+', '-': '-', '*': '×', x: '×', X: '×', '/': '÷' };
const OPS: readonly Op[] = ['+', '-', '×', '÷'];

export interface ComposerOptions {
  /** Y of the expression readout line. */
  exprY: number;
  /** Y of the chip row. */
  chipsY: number;
  /** Y of the operator/fire/undo row. */
  opsY: number;
  /** Called when the player fires (Enter/=/FIRE) with a non-empty expression. */
  onFire: (tokens: readonly Token[]) => void;
  /** Show the control hint line under the ops row. */
  showHint?: boolean;
}

/**
 * The shared expression-building UI: chip hand, operator buttons, typed-value
 * input with pending buffer, error buzz, and arrow-key selection. Scenes own
 * the keyboard listener and delegate events via handleKey().
 */
export class ExpressionComposer {
  private readonly scene: Phaser.Scene;
  private readonly opts: ComposerOptions;

  private tokens: Token[] = [];
  private tokenChipIndices: number[] = [];
  private chips: Chip[] = [];
  private pending = '';
  private selVisible = false;
  private selRow = 0;
  private selCol = 0;

  private exprText: Phaser.GameObjects.Text;
  private opButtons: Phaser.GameObjects.Text[] = [];
  private selHighlight: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, opts: ComposerOptions) {
    this.scene = scene;
    this.opts = opts;
    const { width } = scene.scale;

    this.exprText = scene.add
      .text(width / 2, opts.exprY, '. . .', {
        fontFamily: FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

    OPS.forEach((o, i) => {
      const x = width / 2 + (i - 1.5) * 90;
      const btn = scene.add
        .text(x, opts.opsY, ` ${o === '-' ? '−' : o} `, {
          fontFamily: FONT,
          fontSize: '34px',
          fontStyle: 'bold',
          color: CSS.magentaHot,
          backgroundColor: '#1a0930',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.typeOp(o));
      this.opButtons.push(btn);
    });

    const fire = scene.add
      .text(width - 90, opts.opsY, '[ FIRE ]', {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    fire.on('pointerdown', () => this.fire());

    const undo = scene.add
      .text(90, opts.opsY, '[ UNDO ]', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    undo.on('pointerdown', () => this.backspace());

    this.selHighlight = scene.add
      .rectangle(0, 0, 88, 64)
      .setStrokeStyle(3, PALETTE.yellow)
      .setFillStyle(0, 0)
      .setVisible(false);

    if (opts.showHint !== false) {
      scene.add
        .text(
          width / 2,
          scene.scale.height - 14,
          'TYPE THE NUMBERS  ·  + − × ÷  ·  ENTER FIRE  ·  BACKSPACE UNDO  ·  ARROWS + SPACE',
          { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim },
        )
        .setOrigin(0.5);
    }

    scene.input.keyboard?.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
  }

  get currentTokens(): readonly Token[] {
    return this.tokens;
  }

  /** Route a keydown event into the composer. Returns true if consumed. */
  handleKey(event: KeyboardEvent): boolean {
    const key = event.key;
    if (key === 'Enter' || key === '=') {
      this.fire();
      return true;
    }
    if (key === 'Backspace' || key === 'Delete') {
      this.backspace();
      return true;
    }
    if (key >= '0' && key <= '9') {
      this.typeDigit(key);
      return true;
    }
    if (OP_KEYS[key]) {
      this.typeOp(OP_KEYS[key]!);
      return true;
    }
    if (key.startsWith('Arrow')) {
      this.moveSelection(key);
      return true;
    }
    if (key === ' ') {
      this.activateSelection();
      return true;
    }
    return false;
  }

  dealHand(values: readonly number[]): void {
    for (const c of this.chips) c.container.destroy();
    this.chips = [];
    const { width } = this.scene.scale;
    const n = values.length;
    values.forEach((value, i) => {
      const x = width / 2 + (i - (n - 1) / 2) * 96;
      const bg = this.scene.add.rectangle(0, 0, 78, 54, PALETTE.deepPurple).setStrokeStyle(2, PALETTE.cyan);
      const label = this.scene.add
        .text(0, 0, String(value), { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: CSS.white })
        .setOrigin(0.5);
      const container = this.scene.add.container(x, this.opts.chipsY, [bg, label]);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (!this.pushChip(i)) this.errorCue();
      });
      this.chips.push({ container, bg, value, used: false });
    });
    this.selCol = 0;
    this.updateSelectionHighlight();
    this.reset();
  }

  /** Clear tokens and pending, restore every chip. */
  reset(): void {
    this.tokens = [];
    this.tokenChipIndices = [];
    this.pending = '';
    for (const chip of this.chips) {
      chip.used = false;
      chip.bg.setFillStyle(PALETTE.deepPurple).setStrokeStyle(2, PALETTE.cyan);
      chip.container.setAlpha(1);
    }
    this.renderExpression();
  }

  /** Red flash showing what a wrong expression actually evaluated to. */
  flashWrong(value: number): void {
    this.exprText.setColor(CSS.red);
    this.exprText.setText(`${formatTokens(this.tokens)} = ${value}`);
    this.scene.time.delayedCall(450, () => this.renderExpression());
  }

  errorCue(): void {
    getAudio(this.scene)?.play('error');
    this.exprText.setColor(CSS.red);
    this.scene.tweens.killTweensOf(this.exprText);
    this.exprText.setX(this.scene.scale.width / 2);
    this.scene.tweens.add({
      targets: this.exprText,
      x: { from: this.scene.scale.width / 2 - 7, to: this.scene.scale.width / 2 },
      duration: 60,
      repeat: 2,
      onComplete: () => this.renderExpression(),
    });
  }

  // --- internals ---

  private fire(): void {
    if (this.pending !== '' && !this.commitPending()) {
      this.errorCue();
      return;
    }
    if (this.tokens.length === 0) return;
    this.opts.onFire(this.tokens);
  }

  private backspace(): void {
    if (this.pending !== '') {
      this.pending = this.pending.slice(0, -1);
      this.renderExpression();
      return;
    }
    const last = this.tokens.pop();
    if (!last) return;
    if (last.kind === 'num') {
      const chipIndex = this.tokenChipIndices.pop();
      if (chipIndex !== undefined) {
        const chip = this.chips[chipIndex];
        if (chip) {
          chip.used = false;
          chip.bg.setFillStyle(PALETTE.deepPurple).setStrokeStyle(2, PALETTE.cyan);
          chip.container.setAlpha(1);
        }
      }
    }
    this.renderExpression();
  }

  private matchableChips(prefix: string): { exact: number[]; longer: number[] } {
    const exact: number[] = [];
    const longer: number[] = [];
    this.chips.forEach((chip, i) => {
      if (chip.used) return;
      const s = String(chip.value);
      if (s === prefix) exact.push(i);
      else if (s.startsWith(prefix)) longer.push(i);
    });
    return { exact, longer };
  }

  private typeDigit(digit: string): void {
    if (!this.expectingNumber()) {
      this.errorCue();
      return;
    }
    const proposed = this.pending + digit;
    const { exact, longer } = this.matchableChips(proposed);
    if (exact.length === 0 && longer.length === 0) {
      this.errorCue();
      return;
    }
    this.pending = proposed;
    if (exact.length > 0 && longer.length === 0) this.commitPending();
    this.renderExpression();
  }

  private typeOp(o: Op): void {
    if (this.pending !== '' && !this.commitPending()) {
      this.errorCue();
      return;
    }
    if (!this.pushOp(o)) this.errorCue();
  }

  private commitPending(): boolean {
    const { exact } = this.matchableChips(this.pending);
    const index = exact[0];
    if (index === undefined) return false;
    this.pending = '';
    return this.pushChip(index);
  }

  private expectingNumber(): boolean {
    return this.tokens.length === 0 || this.tokens[this.tokens.length - 1]!.kind === 'op';
  }

  private pushChip(index: number): boolean {
    const chip = this.chips[index];
    if (!chip || chip.used || !this.expectingNumber()) return false;
    chip.used = true;
    chip.bg.setFillStyle(PALETTE.black).setStrokeStyle(2, PALETTE.purple);
    chip.container.setAlpha(0.35);
    this.tokens.push(num(chip.value));
    this.tokenChipIndices.push(index);
    this.renderExpression();
    return true;
  }

  private pushOp(o: Op): boolean {
    if (this.expectingNumber()) return false;
    this.tokens.push(op(o));
    this.renderExpression();
    return true;
  }

  private moveSelection(key: string): void {
    if (!this.selVisible) {
      this.selVisible = true;
    } else if (key === 'ArrowLeft') {
      this.selCol -= 1;
    } else if (key === 'ArrowRight') {
      this.selCol += 1;
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.selRow = this.selRow === 0 ? 1 : 0;
    }
    const rowLen = this.selRow === 0 ? this.chips.length : this.opButtons.length;
    this.selCol = Phaser.Math.Wrap(this.selCol, 0, Math.max(1, rowLen));
    this.updateSelectionHighlight();
  }

  private activateSelection(): void {
    if (!this.selVisible) return;
    if (this.pending !== '' && !this.commitPending()) {
      this.errorCue();
      return;
    }
    const ok = this.selRow === 0 ? this.pushChip(this.selCol) : this.pushOp(OPS[this.selCol]!);
    if (!ok) this.errorCue();
  }

  private updateSelectionHighlight(): void {
    if (!this.selVisible) {
      this.selHighlight.setVisible(false);
      return;
    }
    if (this.selRow === 0) {
      const chip = this.chips[this.selCol];
      if (!chip) return;
      this.selHighlight.setPosition(chip.container.x, chip.container.y).setDisplaySize(88, 64).setVisible(true);
    } else {
      const btn = this.opButtons[this.selCol];
      if (!btn) return;
      this.selHighlight.setPosition(btn.x, btn.y).setDisplaySize(76, 54).setVisible(true);
    }
  }

  private renderExpression(): void {
    this.exprText.setColor(CSS.cyan);
    const parts = [];
    if (this.tokens.length > 0) parts.push(formatTokens(this.tokens));
    if (this.pending !== '') parts.push(`${this.pending}▌`);
    this.exprText.setText(parts.length > 0 ? parts.join(' ') : '. . .');
  }
}
