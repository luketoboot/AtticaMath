import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { newMilestones } from '../../core/skills/milestones';
import { formatTokens, num, op, type Op, type Token } from '../../core/expression/expression';
import type { ExpressionProblem } from '../../core/expression/generate';
import { ExpressionSession } from '../../core/expression/session';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

type Phase = 'wave' | 'breather' | 'over';

interface Chip {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  value: number;
  used: boolean;
}

const OP_KEYS: Record<string, Op> = { '+': '+', '-': '-', '*': '×', x: '×', X: '×', '/': '÷' };

export class ExpressionScene extends Phaser.Scene {
  private session!: ExpressionSession;
  private saves!: SaveManager;

  private phase: Phase = 'wave';
  private queue: ExpressionProblem[] = [];
  private current: ExpressionProblem | null = null;
  private target: Phaser.GameObjects.Container | null = null;
  private targetSpawnedAt = 0;
  private targetSpeed = 0;
  private groundY = 0;

  private tokens: Token[] = [];
  /** Chip index consumed by each num token, for undo. */
  private tokenChipIndices: number[] = [];
  private chips: Chip[] = [];
  private wave = 0;
  /** Digits typed so far toward the next chip (players type real values). */
  private pending = '';
  /** Arrow-key selection: row 0 = chips, row 1 = operators. Hidden until first arrow press. */
  private selVisible = false;
  private selRow = 0;
  private selCol = 0;
  private selHighlight!: Phaser.GameObjects.Rectangle;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private exprText!: Phaser.GameObjects.Text;
  private opButtons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Expression');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    applyCrt(this);

    this.phase = 'wave';
    this.queue = [];
    this.current = null;
    this.target = null;
    this.tokens = [];
    this.tokenChipIndices = [];
    this.chips = [];
    this.wave = 0;
    this.groundY = height - 200;

    const save = this.saves.save;
    this.session = new ExpressionSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
      ownedUpgrades: save.ownedUpgrades,
      loadout: save.loadout,
    });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    const g = this.add.graphics();
    g.lineStyle(3, PALETTE.magenta, 1);
    g.lineBetween(0, this.groundY, width, this.groundY);

    this.createHud();
    this.createExpressionUi();
    this.bindKeys();
    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase !== 'wave' || !this.target || !this.current) return;
    this.target.y += this.targetSpeed * (deltaMs / 1000);
    if (this.target.y >= this.groundY - 30) {
      const m = this.current;
      const landX = this.target.x;
      this.clearTarget();
      this.session.recordMiss(m, this.time.now - this.targetSpawnedAt);
      getAudio(this)?.play('land');
      this.explode(landX, this.groundY - 30, PALETTE.red, 30);
      this.cameras.main.shake(220, 0.012);
      this.cameras.main.flash(120, 255, 40, 40);
      this.resetTokens();
      this.updateHud();
      if (this.session.gameOver) {
        this.endRun();
      } else {
        this.nextTarget();
      }
    }
  }

  // --- wave flow ---

  private startWave(): void {
    this.wave += 1;
    this.queue = this.session.nextWave();
    this.phase = 'wave';
    this.waveText.setText(`WAVE ${this.wave}`);
    this.banner(`WAVE ${this.wave}`, CSS.magenta);
    getAudio(this)?.play('wave');
    this.nextTarget();
  }

  private nextTarget(): void {
    this.clearTarget();
    const problem = this.queue.shift();
    if (!problem) {
      this.waveComplete();
      return;
    }
    this.current = problem;
    this.spawnTarget(problem);
    this.dealHand(problem);
    this.resetTokens();
  }

  private waveComplete(): void {
    this.phase = 'breather';
    const pick = this.session.endWave();
    const { width, height } = this.scale;
    const lines: Phaser.GameObjects.GameObject[] = [
      this.add
        .text(width / 2, height * 0.28, 'WAVE CLEARED', {
          fontFamily: FONT,
          fontSize: '48px',
          fontStyle: 'bold',
          color: CSS.cyan,
        })
        .setOrigin(0.5),
    ];
    if (pick) {
      getAudio(this)?.play('tip');
      lines.push(
        this.add
          .text(width / 2, height * 0.38, 'OPERATOR //', { fontFamily: FONT, fontSize: '18px', color: CSS.magentaHot })
          .setOrigin(0.5),
        this.add
          .text(width / 2, height * 0.44, pick.tip.text, {
            fontFamily: FONT,
            fontSize: '20px',
            color: CSS.white,
            wordWrap: { width: width * 0.7 },
            align: 'center',
          })
          .setOrigin(0.5),
      );
    }
    this.time.delayedCall(CONFIG.meteors.breatherSeconds * 1000, () => {
      for (const l of lines) l.destroy();
      if (this.phase !== 'over') this.startWave();
    });
  }

  // --- target ---

  private spawnTarget(problem: ExpressionProblem): void {
    const { width } = this.scale;
    const x = Phaser.Math.Between(200, width - 200);
    const rock = this.add.image(0, 0, 'meteor').setScale(1.6).setTint(PALETTE.cyan);
    const label = this.add
      .text(0, 0, String(problem.target), {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: CSS.yellow,
        stroke: CSS.black,
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.target = this.add.container(x, -70, [rock, label]);
    this.tweens.add({ targets: rock, angle: -360, duration: 14000, repeat: -1 });
    this.targetSpawnedAt = this.time.now;
    this.targetSpeed = (this.groundY + 70) / this.session.fallSeconds(problem);
  }

  private clearTarget(): void {
    this.target?.destroy();
    this.target = null;
    this.current = null;
  }

  // --- hand / expression UI ---

  private createExpressionUi(): void {
    const { width, height } = this.scale;
    this.exprText = this.add
      .text(width / 2, height - 160, '. . .', {
        fontFamily: FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

    const ops: Op[] = ['+', '-', '×', '÷'];
    const opY = height - 46;
    ops.forEach((o, i) => {
      const x = width / 2 + (i - 1.5) * 90;
      const btn = this.add
        .text(x, opY, ` ${o === '-' ? '−' : o} `, {
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

    const fire = this.add
      .text(width - 90, opY, '[ FIRE ]', {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    fire.on('pointerdown', () => {
      if (this.pending !== '' && !this.commitPending()) {
        this.errorCue();
        return;
      }
      this.fire();
    });

    const undo = this.add
      .text(90, opY, '[ UNDO ]', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    undo.on('pointerdown', () => this.undo());

    this.selHighlight = this.add
      .rectangle(0, 0, 88, 64)
      .setStrokeStyle(3, PALETTE.yellow)
      .setFillStyle(0, 0)
      .setVisible(false);

    this.add
      .text(width / 2, height - 14, 'TYPE THE NUMBERS  ·  + − × ÷  ·  ENTER FIRE  ·  BACKSPACE UNDO  ·  ARROWS + SPACE', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
  }

  private dealHand(problem: ExpressionProblem): void {
    for (const c of this.chips) c.container.destroy();
    this.chips = [];
    const { width, height } = this.scale;
    const y = height - 105;
    const n = problem.hand.length;
    problem.hand.forEach((value, i) => {
      const x = width / 2 + (i - (n - 1) / 2) * 96;
      const bg = this.add.rectangle(0, 0, 78, 54, PALETTE.deepPurple).setStrokeStyle(2, PALETTE.cyan);
      const label = this.add
        .text(0, 0, String(value), { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: CSS.white })
        .setOrigin(0.5);
      const container = this.add.container(x, y, [bg, label]);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (!this.pushChip(i)) this.errorCue();
      });
      this.chips.push({ container, bg, value, used: false });
    });
    this.selCol = 0;
    this.updateSelectionHighlight();
  }

  private bindKeys(): void {
    // Stop the browser from scrolling on Space/arrows while playing.
    this.input.keyboard?.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Expression' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.phase !== 'wave') return;
      const key = event.key;
      if (key === 'Enter' || key === '=') {
        if (this.pending !== '' && !this.commitPending()) {
          this.errorCue();
          return;
        }
        this.fire();
      } else if (key === 'Backspace' || key === 'Delete') {
        if (this.pending !== '') {
          this.pending = this.pending.slice(0, -1);
          this.renderExpression();
        } else {
          this.undo();
        }
      } else if (key >= '0' && key <= '9') {
        this.typeDigit(key);
      } else if (OP_KEYS[key]) {
        this.typeOp(OP_KEYS[key]!);
      } else if (key.startsWith('Arrow')) {
        this.moveSelection(key);
      } else if (key === ' ') {
        this.activateSelection();
      }
    });
  }

  /** Chips (by index) still available for the pending buffer to match. */
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

  /**
   * Typing real chip values: digits accumulate, and commit to a chip as soon
   * as the buffer matches exactly and no other chip continues the digits
   * (so "5" waits when the hand also has "55"). A digit that matches nothing
   * in the hand is refused with a visual buzz.
   */
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

  /** Operators commit any pending digits first, then extend the expression. */
  private typeOp(o: Op): void {
    if (this.pending !== '' && !this.commitPending()) {
      this.errorCue();
      return;
    }
    if (!this.pushOp(o)) this.errorCue();
  }

  /** Consume the chip matching the pending buffer exactly. */
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

  // --- arrow-key selection ---

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
    // A pending buffer takes priority so Space can't split a half-typed number.
    if (this.pending !== '' && !this.commitPending()) {
      this.errorCue();
      return;
    }
    const ok =
      this.selRow === 0
        ? this.pushChip(this.selCol)
        : this.pushOp((['+', '-', '×', '÷'] as Op[])[this.selCol]!);
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

  /** Red buzz on the expression line for a keypress that makes no sense here. */
  private errorCue(): void {
    getAudio(this)?.play('error');
    this.exprText.setColor(CSS.red);
    this.tweens.killTweensOf(this.exprText);
    this.exprText.setX(this.scale.width / 2);
    this.tweens.add({
      targets: this.exprText,
      x: { from: this.scale.width / 2 - 7, to: this.scale.width / 2 },
      duration: 60,
      repeat: 2,
      onComplete: () => {
        if (this.phase === 'wave') this.renderExpression();
      },
    });
  }

  private undo(): void {
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

  private resetTokens(): void {
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

  private renderExpression(): void {
    this.exprText.setColor(CSS.cyan);
    const parts = [];
    if (this.tokens.length > 0) parts.push(formatTokens(this.tokens));
    if (this.pending !== '') parts.push(`${this.pending}▌`);
    this.exprText.setText(parts.length > 0 ? parts.join(' ') : '. . .');
  }

  // --- firing ---

  private fire(): void {
    if (this.phase !== 'wave' || !this.current || !this.target || this.tokens.length === 0) return;
    const problem = this.current;
    const outcome = this.session.fire(problem, this.tokens, this.time.now - this.targetSpawnedAt);

    if (outcome.result === 'hit') {
      const audio = getAudio(this);
      audio?.play('laser');
      audio?.play('explosion');
      const { x, y } = this.target;
      this.laser(x, y);
      this.explode(x, y, PALETTE.cyan, 24);
      let popup = `+${outcome.points}`;
      if (outcome.efficiencyBonus > 0) popup += '  LEAN';
      if (outcome.varietyBonus > 0) popup += '  COMBO';
      this.scorePopup(x, y, popup);
      this.cameras.main.shake(90, 0.005);
      this.clearTarget();
      this.updateHud();
      this.time.delayedCall(700, () => {
        if (this.phase === 'wave') this.nextTarget();
      });
    } else {
      // Wrong value or invalid: expression flashes red, time keeps burning.
      this.exprText.setColor(CSS.red);
      if (outcome.result === 'wrong') {
        this.exprText.setText(`${formatTokens(this.tokens)} = ${outcome.value}`);
      }
      this.cameras.main.shake(60, 0.003);
      this.time.delayedCall(450, () => {
        if (this.phase === 'wave') this.renderExpression();
      });
    }
  }

  // --- fx (shared style with meteor mode) ---

  private laser(tx: number, ty: number): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.lineStyle(4, PALETTE.cyan, 1);
    g.lineBetween(width / 2, height - 160, tx, ty);
    g.lineStyle(2, PALETTE.white, 1);
    g.lineBetween(width / 2, height - 160, tx, ty);
    this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  private explode(x: number, y: number, tint: number, count: number): void {
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 60, max: 340 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 650 },
      scale: { start: 1.8, end: 0 },
      tint,
      quantity: count,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(750, () => emitter.destroy());
    const flash = this.add.image(x, y, 'glowdot').setTint(tint).setScale(3.4).setAlpha(0.9);
    this.tweens.add({ targets: flash, scale: 7, alpha: 0, duration: 240, onComplete: () => flash.destroy() });
  }

  private scorePopup(x: number, y: number, message: string): void {
    const text = this.add
      .text(x, y - 24, message, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.yellow })
      .setOrigin(0.5);
    this.tweens.add({ targets: text, y: y - 90, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
  }

  private banner(message: string, color: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height * 0.26, message, { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: text, alpha: 1, duration: 200, hold: 900, yoyo: true, onComplete: () => text.destroy() });
  }

  // --- HUD ---

  private createHud(): void {
    const { width } = this.scale;
    const style = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' };
    this.hpText = this.add.text(24, 20, '', { ...style, color: CSS.magenta });
    this.scoreText = this.add.text(width - 24, 20, '', { ...style, color: CSS.white }).setOrigin(1, 0);
    this.streakText = this.add.text(width - 24, 50, '', { ...style, color: CSS.yellow }).setOrigin(1, 0);
    this.waveText = this.add.text(width / 2, 20, '', { ...style, color: CSS.cyanDim }).setOrigin(0.5, 0);
    this.updateHud();
  }

  private updateHud(): void {
    this.hpText.setText(`HP ${'█'.repeat(Math.max(0, this.session.hp))}`);
    this.scoreText.setText(`${this.session.score}`);
    this.streakText.setText(this.session.streak > 1 ? `STREAK x${this.session.streak}` : '');
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    const save = this.saves.save;
    const credits = this.session.creditsEarned();
    save.skills = this.session.skillTable;
    save.totalWaves += this.session.currentWaveNumber;
    save.credits += credits;
    save.bestScore = Math.max(save.bestScore, this.session.score);
    const unlocked = newMilestones(this.session.skillTable, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    getAudio(this)?.play('gameover');
    this.cameras.main.shake(500, 0.02);
    this.time.delayedCall(900, () => {
      this.scene.start('Debrief', {
        stats: this.session.stats(),
        credits,
        mode: 'Expression',
        milestones: unlocked.map((m) => m.label),
      });
    });
  }
}
