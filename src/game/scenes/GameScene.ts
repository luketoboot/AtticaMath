import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import type { Problem } from '../../core/generator/problem';
import { RunSession } from '../../core/session';
import { newMilestones } from '../../core/skills/milestones';
import { targetLatencyMs } from '../../core/skills/rating';
import { applyCrt } from '../../fx/applyCrt';
import { clearHitStop, glowPulse, impact, shockwave, streakPitch, timeScale } from '../../fx/juice';
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
    getAudio(this)?.playMusic('game');
    applyCrt(this);
    // Clock scaling survives a scene restart, so never inherit a stale freeze.
    clearHitStop(this);
    this.events.once('shutdown', () => clearHitStop(this));

    this.meteors = [];
    this.spawnQueue = [];
    this.phase = 'wave';
    this.groundY = height - 90;
    this.cannonX = width / 2;

    const save = this.saves.save;
    const filter = this.registry.get('meteorFilter') as
      | { op: 'add' | 'sub' | 'mul' | 'div' | 'all'; maxDigits: 1 | 2 | 3 | 4 }
      | undefined;
    this.session = new RunSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
      placementDone: save.placementDone,
      ownedUpgrades: save.ownedUpgrades,
      loadout: save.loadout,
      ...(filter ? { filter } : {}),
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

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Game' });
      this.scene.pause();
    });

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase !== 'wave') return;
    // Scaled so hit-stop freezes falling meteors along with tweens and timers.
    const dt = (deltaMs / 1000) * timeScale(this);

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
    const audio = getAudio(this);
    audio?.play('wave');
    // Slow field spins up audibly at the top of every wave.
    if (this.session.loadout.includes('upgrade.slowfield')) {
      this.time.delayedCall(220, () => audio?.play('slowfield'));
    }
    glowPulse(this, CONFIG.juice.glowPulseKill);
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
    const { juice } = CONFIG;
    const hpBefore = this.session.hp;
    this.removeMeteor(m);
    this.session.recordMiss(m.problem, this.time.now - m.spawnedAt);
    // Equal HP means the miss shield ate it — that deserves its own cue.
    const shielded = this.session.hp === hpBefore;

    const x = m.container.x;
    const y = this.groundY - 20;
    if (shielded) {
      getAudio(this)?.play('shield');
      this.explode(x, y, PALETTE.cyan, juice.landParticles / 2);
      shockwave(this, x, y, PALETTE.cyan);
      this.cameras.main.flash(160, 0, 220, 255);
      impact(this, {
        shakeMs: juice.killShakeMs,
        shakeIntensity: juice.killShakeIntensity,
        glow: juice.glowPulseKill,
      });
    } else {
      getAudio(this)?.play('land');
      this.explode(x, y, PALETTE.red, juice.landParticles);
      shockwave(this, x, y, PALETTE.red);
      this.cameras.main.flash(180, 255, 40, 40);
      impact(this, {
        shakeMs: juice.landShakeMs,
        shakeIntensity: juice.landShakeIntensity,
        glow: juice.glowPulseHeavy,
        hitStopMs: juice.heavyHitStopMs,
      });
    }

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

    const { juice } = CONFIG;
    const audio = getAudio(this);
    const spread = targets.length > 1;
    // The spread cannon fires a visibly and audibly different shot.
    audio?.play(spread ? 'laserSpread' : 'laser', { pitch: streakPitch(this.session.streak) });

    let anyFast = false;
    for (const target of targets) {
      const tx = target.container.x;
      const ty = target.container.y;
      this.laser(tx, ty, spread);
      const responseMs = this.time.now - target.spawnedAt;
      // Pitch climbs with the streak as it stands *before* this kill lands.
      const pitch = streakPitch(this.session.streak);
      const points = this.session.recordHit(target.problem, responseMs);
      const fast = responseMs <= targetLatencyMs(target.problem.difficulty, CONFIG.rating);
      anyFast = anyFast || fast;
      this.scorePopup(tx, ty, points, fast);
      this.explode(tx, ty, fast ? PALETTE.yellow : PALETTE.cyan, fast ? juice.fastKillParticles : juice.killParticles);
      shockwave(this, tx, ty, fast ? PALETTE.yellow : PALETTE.cyan);
      this.removeMeteor(target);
      audio?.play(fast ? 'fast' : 'explosion', { pitch });
    }

    impact(this, {
      shakeMs: juice.killShakeMs,
      shakeIntensity:
        juice.killShakeIntensity + (targets.length - 1) * juice.spreadShakePerTarget,
      glow: anyFast ? juice.glowPulseHeavy : juice.glowPulseKill,
      hitStopMs: juice.hitStopMs,
    });
    this.buffer.clear();
    this.updateHud();
  }

  // --- fx ---

  /** Beam from the cannon. The spread cannon draws a thicker magenta bolt. */
  private laser(tx: number, ty: number, spread: boolean): void {
    const outer = spread ? PALETTE.magenta : PALETTE.cyan;
    const g = this.add.graphics();
    g.lineStyle(spread ? 12 : 9, outer, 0.35);
    g.lineBetween(this.cannonX, this.groundY, tx, ty);
    g.lineStyle(spread ? 6 : 4, outer, 1);
    g.lineBetween(this.cannonX, this.groundY, tx, ty);
    g.lineStyle(spread ? 3 : 2, PALETTE.white, 1);
    g.lineBetween(this.cannonX, this.groundY, tx, ty);
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });

    // Muzzle flash at the cannon mouth.
    const muzzle = this.add
      .image(this.cannonX, this.groundY, 'glowdot')
      .setTint(outer)
      .setScale(spread ? 5 : 3.5)
      .setAlpha(0.95);
    this.tweens.add({
      targets: muzzle,
      scale: spread ? 9 : 6,
      alpha: 0,
      duration: 160,
      onComplete: () => muzzle.destroy(),
    });
  }

  private explode(x: number, y: number, tint: number, count: number): void {
    const n = Math.round(count);
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 80, max: 460 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 750 },
      scale: { start: 2.1, end: 0 },
      tint,
      quantity: n,
      emitting: false,
    });
    emitter.explode(n);

    // Second, faster white sheet of sparks reads as the hot core of the blast.
    const core = this.add.particles(x, y, 'particle', {
      speed: { min: 200, max: 700 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 120, max: 280 },
      scale: { start: 1.2, end: 0 },
      tint: PALETTE.white,
      quantity: Math.max(4, Math.round(n / 3)),
      emitting: false,
    });
    core.explode(Math.max(4, Math.round(n / 3)));

    this.time.delayedCall(900, () => {
      emitter.destroy();
      core.destroy();
    });

    const flash = this.add.image(x, y, 'glowdot').setTint(tint).setScale(4).setAlpha(1);
    this.tweens.add({
      targets: flash,
      scale: 9,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
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
    clearHitStop(this); // never hand a frozen clock to the next scene
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
    this.cameras.main.flash(400, 255, 45, 149);
    impact(this, {
      shakeMs: CONFIG.juice.gameOverShakeMs,
      shakeIntensity: CONFIG.juice.gameOverShakeIntensity,
      glow: CONFIG.juice.glowPulseHeavy,
    });
    this.time.delayedCall(900, () => {
      this.scene.start('Debrief', {
        stats: this.session.stats(),
        credits,
        milestones: unlocked.map((m) => m.label),
      });
    });
  }
}
