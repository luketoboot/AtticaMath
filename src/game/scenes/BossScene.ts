import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { BossSession } from '../../core/boss/session';
import { CONFIG } from '../../core/config';
import type { Token } from '../../core/expression/expression';
import type { Problem } from '../../core/generator/problem';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { clearHitStop, impact, shockwave, timeScale } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { ExpressionComposer } from '../../ui/ExpressionComposer';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

type Phase = 'fight' | 'breather' | 'over';

interface ActiveAttack {
  container: Phaser.GameObjects.Container;
  bufferText: Phaser.GameObjects.Text;
  problem: Problem;
  spawnedAt: number;
  speed: number;
}

export class BossScene extends Phaser.Scene {
  private session!: BossSession;
  private saves!: SaveManager;
  private composer!: ExpressionComposer;

  private phase: Phase = 'fight';
  private boss!: Phaser.GameObjects.Container;
  private bossRock!: Phaser.GameObjects.Image;
  private bossHpText!: Phaser.GameObjects.Text;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private bossBarWidth = 0;

  private attack: ActiveAttack | null = null;
  private attackBuffer = '';
  private sinceAttack = 0;
  private handDealtAt = 0;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private bossLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Boss');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('boss');
    applyCrt(this);
    clearHitStop(this);
    this.events.once('shutdown', () => clearHitStop(this));

    this.phase = 'fight';
    this.attack = null;
    this.attackBuffer = '';
    this.sinceAttack = 0;

    const save = this.saves.save;
    this.session = new BossSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
      ownedUpgrades: save.ownedUpgrades,
      loadout: save.loadout,
    });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    const g = this.add.graphics();
    g.lineStyle(3, PALETTE.magenta, 1);
    g.lineBetween(0, height - 200, width, height - 200);

    this.createBoss();
    this.createHud();
    this.composer = new ExpressionComposer(this, {
      exprY: height - 160,
      chipsY: height - 105,
      opsY: height - 46,
      onFire: (tokens) => this.fireAtBoss(tokens),
      showHint: false,
    });
    this.add
      .text(width / 2, height - 14, 'EXPRESSION VALUE = DAMAGE  ·  A S D F PICK THE LIT ROW  ·  TYPE ATTACK ANSWERS TO BLOCK', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
    this.dealHand();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Boss' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.phase !== 'fight' || event.key === 'Escape') return;
      // Incoming attacks take input priority for digits and backspace.
      if (this.attack) {
        if (event.key >= '0' && event.key <= '9') {
          if (this.attackBuffer.length < 8) {
            this.attackBuffer += event.key;
            this.attack.bufferText.setText(this.attackBuffer);
            this.tryBlock();
          }
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          this.attackBuffer = '';
          this.attack.bufferText.setText('');
          return;
        }
      }
      this.composer.handleKey(event);
    });

    this.banner(`BOSS ${this.session.bossNumber}`, CSS.magenta);
    getAudio(this)?.play('wave');
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase !== 'fight') return;
    const dt = (deltaMs / 1000) * timeScale(this);

    if (!this.attack) {
      this.sinceAttack += dt;
      if (this.sinceAttack >= this.session.attackIntervalSeconds()) {
        this.spawnAttack();
      }
    } else {
      this.attack.container.y += this.attack.speed * dt;
      if (this.attack.container.y >= this.scale.height - 220) {
        this.attackHits();
      }
    }
  }

  // --- boss ---

  private createBoss(): void {
    const { width } = this.scale;
    this.bossRock = this.add.image(0, 0, 'meteor').setScale(3.2).setTint(PALETTE.magenta);
    this.bossHpText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: CSS.white,
        stroke: CSS.black,
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.boss = this.add.container(width / 2, 150, [this.bossRock, this.bossHpText]);
    this.tweens.add({ targets: this.bossRock, angle: 360, duration: 30000, repeat: -1 });
    this.tweens.add({ targets: this.boss, y: 165, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.bossBarWidth = width * 0.4;
    this.add
      .rectangle(width / 2, 262, this.bossBarWidth, 12, PALETTE.deepPurple)
      .setStrokeStyle(2, PALETTE.magenta);
    this.bossBarFill = this.add
      .rectangle(width / 2 - this.bossBarWidth / 2, 262, this.bossBarWidth, 8, PALETTE.magentaHot)
      .setOrigin(0, 0.5);
    this.renderBoss();
  }

  private renderBoss(): void {
    this.bossHpText.setText(String(Math.max(0, this.session.bossHp)));
    const ratio = Phaser.Math.Clamp(this.session.bossHp / this.session.bossMaxHp, 0, 1);
    this.bossBarFill.setDisplaySize(Math.max(1, this.bossBarWidth * ratio), 8);
  }

  private fireAtBoss(tokens: readonly Token[]): void {
    if (this.phase !== 'fight') return;
    const outcome = this.session.fireExpression(tokens, this.time.now - this.handDealtAt);
    if (outcome.result === 'invalid') {
      this.composer.errorCue();
      return;
    }

    const { juice } = CONFIG;
    const audio = getAudio(this);
    // Damage scales the cue: a big expression should hit harder than a chip.
    const heavy = outcome.damage >= 40;
    audio?.play('bossHit', { pitch: heavy ? 0.85 : 1.1, gain: heavy ? 1.2 : 1 });

    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.lineStyle(14, PALETTE.magenta, 0.3);
    g.lineBetween(width / 2, height - 160, this.boss.x, this.boss.y);
    g.lineStyle(5, PALETTE.cyan, 1);
    g.lineBetween(width / 2, height - 160, this.boss.x, this.boss.y);
    g.lineStyle(2, PALETTE.white, 1);
    g.lineBetween(width / 2, height - 160, this.boss.x, this.boss.y);
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });

    this.explode(this.boss.x, this.boss.y + 40, PALETTE.cyan, juice.killParticles);
    shockwave(this, this.boss.x, this.boss.y + 40, PALETTE.cyan);
    this.scorePopup(this.boss.x, this.boss.y + 70, `-${outcome.damage}`);
    impact(this, {
      shakeMs: juice.bossHitShakeMs,
      shakeIntensity: juice.bossHitShakeIntensity * (heavy ? 1.6 : 1),
      glow: heavy ? juice.glowPulseHeavy : juice.glowPulseKill,
      hitStopMs: juice.hitStopMs,
    });
    // The boss is a Container, so it can't tint — punch its scale instead.
    this.tweens.add({
      targets: this.boss,
      scale: 1.12,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.tweens.add({ targets: this.boss, x: this.boss.x + 14, duration: 45, yoyo: true, repeat: 3 });

    this.renderBoss();
    this.updateHud();

    if (outcome.defeated) {
      this.bossDown();
    } else {
      this.dealHand();
    }
  }

  private bossDown(): void {
    this.phase = 'breather';
    this.clearAttack();
    getAudio(this)?.play('bossDown');
    this.explode(this.boss.x, this.boss.y, PALETTE.magentaHot, 90);
    shockwave(this, this.boss.x, this.boss.y, PALETTE.magentaHot);
    this.cameras.main.flash(300, 255, 90, 209);
    impact(this, {
      shakeMs: CONFIG.juice.bossDownShakeMs,
      shakeIntensity: CONFIG.juice.bossDownShakeIntensity,
      glow: CONFIG.juice.glowPulseHeavy,
      hitStopMs: CONFIG.juice.heavyHitStopMs,
    });

    const { width, height } = this.scale;
    const pick = this.session.bossDownTip();
    const lines: Phaser.GameObjects.GameObject[] = [
      this.add
        .text(width / 2, height * 0.38, 'BOSS DOWN', {
          fontFamily: FONT,
          fontSize: '54px',
          fontStyle: 'bold',
          color: CSS.yellow,
        })
        .setOrigin(0.5),
    ];
    if (pick) {
      getAudio(this)?.play('tip');
      lines.push(
        this.add
          .text(width / 2, height * 0.48, 'OPERATOR //', { fontFamily: FONT, fontSize: '18px', color: CSS.magentaHot })
          .setOrigin(0.5),
        this.add
          .text(width / 2, height * 0.54, pick.tip.text, {
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
      if (this.phase === 'over') return;
      this.phase = 'fight';
      this.sinceAttack = 0;
      this.renderBoss();
      this.updateHud();
      this.dealHand();
      this.banner(`BOSS ${this.session.bossNumber}`, CSS.magenta);
      getAudio(this)?.play('wave');
    });
  }

  private dealHand(): void {
    this.composer.dealHand(this.session.dealHand());
    this.handDealtAt = this.time.now;
  }

  // --- attacks ---

  private spawnAttack(): void {
    const problem = this.session.nextAttackProblem();
    const bg = this.add.image(0, 0, 'meteor').setScale(0.9).setTint(PALETTE.red);
    const label = this.add
      .text(0, -6, problem.prompt, {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.white,
        stroke: CSS.black,
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    const bufferText = this.add
      .text(0, 26, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5);
    const container = this.add.container(this.boss.x, this.boss.y + 60, [bg, label, bufferText]);

    const travel = this.scale.height - 220 - container.y;
    this.attack = {
      container,
      bufferText,
      problem,
      spawnedAt: this.time.now,
      speed: travel / this.session.attackTravelSeconds(),
    };
    this.attackBuffer = '';
    getAudio(this)?.play('error'); // menacing spawn buzz
  }

  private tryBlock(): void {
    if (!this.attack) return;
    if (this.attackBuffer !== this.attack.problem.answer) return;
    const { juice } = CONFIG;
    const a = this.attack;
    const points = this.session.blockAttack(a.problem, this.time.now - a.spawnedAt);
    const audio = getAudio(this);
    audio?.play('block');
    audio?.play('fast');
    this.explode(a.container.x, a.container.y, PALETTE.cyan, juice.killParticles);
    shockwave(this, a.container.x, a.container.y, PALETTE.cyan);
    this.scorePopup(a.container.x, a.container.y, `BLOCKED +${points}`);
    impact(this, {
      shakeMs: juice.killShakeMs,
      shakeIntensity: juice.killShakeIntensity,
      glow: juice.glowPulseKill,
      hitStopMs: juice.hitStopMs,
    });
    this.clearAttack();
    this.updateHud();
  }

  private attackHits(): void {
    if (!this.attack) return;
    const { juice } = CONFIG;
    const a = this.attack;
    this.session.attackLands(a.problem, this.time.now - a.spawnedAt);
    getAudio(this)?.play('land');
    this.explode(a.container.x, a.container.y, PALETTE.red, juice.landParticles);
    shockwave(this, a.container.x, a.container.y, PALETTE.red);
    this.cameras.main.flash(180, 255, 40, 40);
    impact(this, {
      shakeMs: juice.landShakeMs,
      shakeIntensity: juice.landShakeIntensity,
      glow: juice.glowPulseHeavy,
      hitStopMs: juice.heavyHitStopMs,
    });
    this.clearAttack();
    this.updateHud();
    if (this.session.gameOver) this.endRun();
  }

  private clearAttack(): void {
    this.attack?.container.destroy();
    this.attack = null;
    this.attackBuffer = '';
    this.sinceAttack = 0;
  }

  // --- fx / hud ---

  private explode(x: number, y: number, tint: number, count: number): void {
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 60, max: 360 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 700 },
      scale: { start: 1.8, end: 0 },
      tint,
      quantity: count,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(800, () => emitter.destroy());
    const flash = this.add.image(x, y, 'glowdot').setTint(tint).setScale(3.4).setAlpha(0.9);
    this.tweens.add({ targets: flash, scale: 7, alpha: 0, duration: 240, onComplete: () => flash.destroy() });
  }

  private scorePopup(x: number, y: number, message: string): void {
    const text = this.add
      .text(x, y, message, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: CSS.yellow })
      .setOrigin(0.5);
    this.tweens.add({ targets: text, y: y - 70, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
  }

  private banner(message: string, color: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height * 0.4, message, { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: text, alpha: 1, duration: 200, hold: 900, yoyo: true, onComplete: () => text.destroy() });
  }

  private createHud(): void {
    const { width } = this.scale;
    const style = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' };
    this.hpText = this.add.text(24, 20, '', { ...style, color: CSS.magenta });
    this.scoreText = this.add.text(width - 24, 20, '', { ...style, color: CSS.white }).setOrigin(1, 0);
    this.streakText = this.add.text(width - 24, 50, '', { ...style, color: CSS.yellow }).setOrigin(1, 0);
    this.bossLabel = this.add.text(width / 2, 20, '', { ...style, color: CSS.cyanDim }).setOrigin(0.5, 0);
    this.updateHud();
  }

  private updateHud(): void {
    this.hpText.setText(`HP ${'█'.repeat(Math.max(0, this.session.hp))}`);
    this.scoreText.setText(`${this.session.score}`);
    this.streakText.setText(this.session.streak > 1 ? `STREAK x${this.session.streak}` : '');
    this.bossLabel.setText(`BOSS ${this.session.bossNumber}`);
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    clearHitStop(this);
    const save = this.saves.save;
    const credits = this.session.creditsEarned();
    save.skills = this.session.skillTable;
    save.totalWaves += this.session.bossNumber;
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
        mode: 'Boss',
        milestones: unlocked.map((m) => m.label),
      });
    });
  }
}
