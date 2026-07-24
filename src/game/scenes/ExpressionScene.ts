import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import type { Token } from '../../core/expression/expression';
import type { ExpressionProblem } from '../../core/expression/generate';
import { ExpressionSession } from '../../core/expression/session';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { ExpressionComposer } from '../../ui/ExpressionComposer';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

type Phase = 'wave' | 'breather' | 'over';

export class ExpressionScene extends Phaser.Scene {
  private session!: ExpressionSession;
  private saves!: SaveManager;
  private composer!: ExpressionComposer;

  private phase: Phase = 'wave';
  private queue: ExpressionProblem[] = [];
  private current: ExpressionProblem | null = null;
  private target: Phaser.GameObjects.Container | null = null;
  private targetSpawnedAt = 0;
  private targetSpeed = 0;
  private groundY = 0;
  private wave = 0;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;

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
    this.composer = new ExpressionComposer(this, {
      exprY: height - 160,
      chipsY: height - 105,
      opsY: height - 46,
      onFire: (tokens) => this.fire(tokens),
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Expression' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.phase !== 'wave' || event.key === 'Escape') return;
      this.composer.handleKey(event);
    });

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
    this.composer.dealHand(problem.hand);
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

  // --- firing ---

  private fire(tokens: readonly Token[]): void {
    if (this.phase !== 'wave' || !this.current || !this.target) return;
    const outcome = this.session.fire(this.current, tokens, this.time.now - this.targetSpawnedAt);

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
    } else if (outcome.result === 'wrong') {
      getAudio(this)?.play('error');
      this.composer.flashWrong(outcome.value);
      this.cameras.main.shake(60, 0.003);
    } else {
      this.composer.errorCue();
    }
  }

  // --- fx ---

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
