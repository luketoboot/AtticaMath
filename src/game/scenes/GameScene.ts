import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import type { Problem } from '../../core/generator/problem';
import { RunSession } from '../../core/session';
import { newMilestones } from '../../core/skills/milestones';
import { targetLatencyMs } from '../../core/skills/rating';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { isTouchDevice, Numpad } from '../../ui/Numpad';
import { InputBuffer } from '../InputBuffer';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

interface LiveMeteor {
  container: Phaser.GameObjects.Container;
  problem: Problem;
  spawnedAt: number;
  speed: number;
}

type Phase = 'wave' | 'breather' | 'over';

export class GameScene extends Phaser.Scene {
  private session!: RunSession;
  private saves!: SaveManager;
  private buffer!: InputBuffer;

  private meteors: LiveMeteor[] = [];
  private spawnQueue: Problem[] = [];
  private phase: Phase = 'wave';
  private sinceSpawn = 0;
  private groundY = 0;
  private cannonX = 0;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private bufferText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    applyCrt(this);

    this.meteors = [];
    this.spawnQueue = [];
    this.phase = 'wave';
    this.groundY = height - 90;
    this.cannonX = width / 2;

    const save = this.saves.save;
    this.session = new RunSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
      placementDone: save.placementDone,
      ownedUpgrades: save.ownedUpgrades,
      loadout: save.loadout,
    });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawGround();
    this.drawCannon();
    this.createHud();

    this.buffer = new InputBuffer(this, (value) => {
      this.bufferText.setText(value.length > 0 ? value : '_');
      this.tryFire(value);
    });

    const numpad = new Numpad(
      this,
      (digit) => this.buffer.push(digit),
      () => this.buffer.clear(),
    );
    numpad.setVisible(isTouchDevice());
    const padToggle = this.add
      .text(24, 54, '[ PAD ]', { fontFamily: FONT, fontSize: '16px', color: CSS.cyanDim })
      .setInteractive({ useHandCursor: true });
    padToggle.on('pointerdown', () => numpad.setVisible(!numpad.visible));

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase !== 'wave') return;
    const dt = deltaMs / 1000;

    this.sinceSpawn += dt;
    if (
      this.spawnQueue.length > 0 &&
      this.meteors.length < CONFIG.meteors.maxConcurrentMeteors &&
      this.sinceSpawn >= this.session.spawnGapSeconds()
    ) {
      this.sinceSpawn = 0;
      this.spawnMeteor(this.spawnQueue.shift()!);
    }

    for (const m of [...this.meteors]) {
      m.container.y += m.speed * dt;
      if (m.container.y >= this.groundY - 10) {
        this.landMeteor(m);
      }
    }

    if (this.phase === 'wave' && this.spawnQueue.length === 0 && this.meteors.length === 0) {
      this.waveComplete();
    }
  }

  // --- wave flow ---

  private startWave(): void {
    const plan = this.session.nextWave();
    this.spawnQueue = [...plan.problems];
    this.sinceSpawn = Number.POSITIVE_INFINITY; // spawn the first meteor immediately
    this.phase = 'wave';
    this.waveText.setText(`WAVE ${plan.wave}`);
    this.banner(`WAVE ${plan.wave}`, CSS.magenta);
    getAudio(this)?.play('wave');
  }

  private waveComplete(): void {
    this.phase = 'breather';
    const pick = this.session.endWave();
    const { width, height } = this.scale;

    const lines: Phaser.GameObjects.GameObject[] = [];
    lines.push(
      this.add
        .text(width / 2, height * 0.32, 'WAVE CLEARED', {
          fontFamily: FONT,
          fontSize: '48px',
          fontStyle: 'bold',
          color: CSS.cyan,
        })
        .setOrigin(0.5),
    );
    if (pick) {
      getAudio(this)?.play('tip');
      lines.push(
        this.add
          .text(width / 2, height * 0.44, 'OPERATOR //', {
            fontFamily: FONT,
            fontSize: '18px',
            color: CSS.magentaHot,
          })
          .setOrigin(0.5),
        this.add
          .text(width / 2, height * 0.5, pick.tip.text, {
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

  // --- meteors ---

  private spawnMeteor(problem: Problem): void {
    const { width } = this.scale;
    const margin = 110;
    const x = Phaser.Math.Between(margin, width - margin);
    const startY = -50;

    const rock = this.add.image(0, 0, 'meteor');
    const label = this.add
      .text(0, 0, problem.prompt, {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: CSS.white,
        stroke: CSS.black,
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const container = this.add.container(x, startY, [rock, label]);
    this.tweens.add({ targets: rock, angle: 360, duration: 9000, repeat: -1 });

    const distance = this.groundY - startY;
    const speed = distance / this.session.fallSeconds(problem.difficulty);
    this.meteors.push({ container, problem, spawnedAt: this.time.now, speed });
  }

  private removeMeteor(m: LiveMeteor): void {
    this.meteors = this.meteors.filter((x) => x !== m);
    m.container.destroy();
  }

  private landMeteor(m: LiveMeteor): void {
    this.removeMeteor(m);
    this.session.recordMiss(m.problem, this.time.now - m.spawnedAt);
    getAudio(this)?.play('land');
    this.explode(m.container.x, this.groundY - 20, PALETTE.red, 26);
    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(120, 255, 40, 40);
    this.updateHud();
    if (this.session.gameOver) this.endRun();
  }

  private tryFire(buffer: string): void {
    if (this.phase !== 'wave' || buffer.length === 0) return;
    const matches = this.meteors.filter((m) => m.problem.answer === buffer);
    if (matches.length === 0) return;

    // Closest to the ground first; spread cannon hits all matches.
    matches.sort((a, b) => b.container.y - a.container.y);
    const targets = this.session.loadout.includes('upgrade.spread') ? matches : [matches[0]!];

    const audio = getAudio(this);
    audio?.play('laser');
    for (const target of targets) {
      this.laser(target.container.x, target.container.y);
      const responseMs = this.time.now - target.spawnedAt;
      const points = this.session.recordHit(target.problem, responseMs);
      const fast = responseMs <= targetLatencyMs(target.problem.difficulty, CONFIG.rating);
      this.scorePopup(target.container.x, target.container.y, points, fast);
      this.explode(target.container.x, target.container.y, PALETTE.cyan, 18);
      this.removeMeteor(target);
      audio?.play(fast ? 'fast' : 'explosion');
    }

    this.cameras.main.shake(90, 0.004);
    this.buffer.clear();
    this.updateHud();
  }

  // --- fx ---

  private laser(tx: number, ty: number): void {
    const g = this.add.graphics();
    g.lineStyle(4, PALETTE.cyan, 1);
    g.lineBetween(this.cannonX, this.groundY, tx, ty);
    g.lineStyle(2, PALETTE.white, 1);
    g.lineBetween(this.cannonX, this.groundY, tx, ty);
    this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
  }

  private explode(x: number, y: number, tint: number, count: number): void {
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 60, max: 320 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 600 },
      scale: { start: 1.6, end: 0 },
      tint,
      quantity: count,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(700, () => emitter.destroy());

    const flash = this.add.image(x, y, 'glowdot').setTint(tint).setScale(3).setAlpha(0.9);
    this.tweens.add({ targets: flash, scale: 6, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
  }

  private scorePopup(x: number, y: number, points: number, fast: boolean): void {
    const text = this.add
      .text(x, y - 20, fast ? `+${points} FAST` : `+${points}`, {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: fast ? CSS.yellow : CSS.white,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: text,
      y: y - 80,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private banner(message: string, color: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height * 0.3, message, {
        fontFamily: FONT,
        fontSize: '54px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 200,
      hold: 900,
      yoyo: true,
      onComplete: () => text.destroy(),
    });
  }

  // --- scenery & HUD ---

  private drawGround(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.lineStyle(3, PALETTE.magenta, 1);
    g.lineBetween(0, this.groundY, width, this.groundY);
    g.lineStyle(1, PALETTE.deepPurple, 0.8);
    for (let i = 0; i < 6; i++) {
      const y = this.groundY + 14 + i * 12;
      if (y < height) g.lineBetween(0, y, width, y);
    }
  }

  private drawCannon(): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.cyan, 1);
    g.fillTriangle(this.cannonX - 22, this.groundY, this.cannonX + 22, this.groundY, this.cannonX, this.groundY - 34);
    g.fillStyle(PALETTE.black, 1);
    g.fillTriangle(this.cannonX - 12, this.groundY, this.cannonX + 12, this.groundY, this.cannonX, this.groundY - 20);
  }

  private createHud(): void {
    const { width, height } = this.scale;
    const style = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' };

    this.hpText = this.add.text(24, 20, '', { ...style, color: CSS.magenta });
    this.scoreText = this.add.text(width - 24, 20, '', { ...style, color: CSS.white }).setOrigin(1, 0);
    this.streakText = this.add.text(width - 24, 50, '', { ...style, color: CSS.yellow }).setOrigin(1, 0);
    this.waveText = this.add.text(width / 2, 20, '', { ...style, color: CSS.cyanDim }).setOrigin(0.5, 0);

    this.bufferText = this.add
      .text(width / 2, height - 40, '_', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

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
    save.placementDone = !this.session.inPlacement;
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
        milestones: unlocked.map((m) => m.label),
      });
    });
  }
}
