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
  /** Scene-clock time before which this meteor will not fire again. */
  nextFireAt: number;
}

/** An aimed shot from a meteor, travelling on a fixed heading. */
interface LiveBullet {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
}

type Phase = 'wave' | 'breather' | 'over';

/** Every meteor enters from here; gunfire arms relative to this line. */
const METEOR_START_Y = -50;
/** glowdot is 32px wide, so this renders a shot roughly 24px across. */
const BULLET_SCALE = 0.75;

export class GameScene extends Phaser.Scene {
  private session!: RunSession;
  private saves!: SaveManager;
  private buffer!: InputBuffer;

  private meteors: LiveMeteor[] = [];
  private bullets: LiveBullet[] = [];
  private spawnQueue: Problem[] = [];
  private phase: Phase = 'wave';
  private sinceSpawn = 0;
  private groundY = 0;
  private cannonX = 0;

  private cannon!: Phaser.GameObjects.Container;
  private moveKeys: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] } = {
    left: [],
    right: [],
  };
  /** Drag target for touch/mouse dodging; null when no drag is active. */
  private pointerTargetX: number | null = null;
  private invulnUntil = 0;
  private warnedArmed = false;

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
    this.bullets = [];
    this.spawnQueue = [];
    this.phase = 'wave';
    this.pointerTargetX = null;
    this.invulnUntil = 0;
    this.warnedArmed = false;
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

    this.setupDodgeInput();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Game' });
      this.scene.pause();
    });

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase === 'over') return;
    // Scaled so hit-stop freezes falling meteors along with tweens and timers.
    const dt = (deltaMs / 1000) * timeScale(this);

    // Repositioning stays live through the breather — no dead air between waves.
    this.movePlayer(dt);
    if (this.phase !== 'wave') return;

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
    if (this.phase !== 'wave') return; // a landing ended the run

    this.updateGunfire(dt);
    this.updateBullets(dt);
    if (this.phase !== 'wave') return; // a shot ended the run

    if (this.spawnQueue.length === 0 && this.meteors.length === 0 && this.bullets.length === 0) {
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

    // The wave meteors start shooting is the one the player has to be told about.
    if (this.session.meteorsArmed && !this.warnedArmed) {
      this.warnedArmed = true;
      this.time.delayedCall(1500, () => {
        if (this.phase === 'wave') this.banner('THEY SHOOT BACK', CSS.red);
      });
    }
  }

  private waveComplete(): void {
    this.phase = 'breather';
    this.clearBullets();
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
    const startY = METEOR_START_Y;

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
    this.meteors.push({
      container,
      problem,
      spawnedAt: this.time.now,
      speed,
      nextFireAt: this.time.now + CONFIG.hazard.fireCooldownSeconds * 1000,
    });
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

  // --- dodging & meteor gunfire ---

  private setupDodgeInput(): void {
    const kb = this.input.keyboard;
    // A/D is the primary scheme; arrows are the secondary. Neither collides with
    // the digit buffer, so typing an answer and dodging can happen at once.
    this.moveKeys = {
      left: kb ? [kb.addKey('A'), kb.addKey('LEFT')] : [],
      right: kb ? [kb.addKey('D'), kb.addKey('RIGHT')] : [],
    };

    // Touch/mouse: drag anywhere in the field and the cannon tracks your finger.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // numpad and PAD toggle taps aren't dodges
      this.pointerTargetX = p.x;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.pointerTargetX !== null) this.pointerTargetX = p.x;
    });
    this.input.on('pointerup', () => {
      this.pointerTargetX = null;
    });
  }

  private movePlayer(dt: number): void {
    const h = CONFIG.hazard;
    const { width } = this.scale;

    let dir = 0;
    if (this.moveKeys.left.some((k) => k.isDown)) dir -= 1;
    if (this.moveKeys.right.some((k) => k.isDown)) dir += 1;

    let x = this.cannonX;
    if (dir !== 0) {
      this.pointerTargetX = null; // keys take over from a drag mid-motion
      x += dir * h.playerSpeed * dt;
    } else if (this.pointerTargetX !== null) {
      // Chase the finger at the key traverse speed so touch gets no free teleport.
      const step = h.playerSpeed * dt;
      x += Phaser.Math.Clamp(this.pointerTargetX - x, -step, step);
    }

    this.cannonX = Phaser.Math.Clamp(x, h.playerEdgeMargin, width - h.playerEdgeMargin);
    this.cannon.x = this.cannonX;
  }

  private updateGunfire(dt: number): void {
    if (!this.session.meteorsArmed) return;
    const h = CONFIG.hazard;
    for (const m of this.meteors) {
      if (this.time.now < m.nextFireAt) continue;
      if (m.container.y - METEOR_START_Y < h.armingFallPixels) continue;
      if (!this.session.rollMeteorFire(dt)) continue;
      m.nextFireAt = this.time.now + h.fireCooldownSeconds * 1000;
      this.fireBullet(m);
    }
  }

  /** An aimed shot: it leads at where the cannon stands *now*, so standing still is fatal. */
  private fireBullet(m: LiveMeteor): void {
    const sx = m.container.x;
    const sy = m.container.y;
    const angle = Math.atan2(this.groundY - sy, this.cannonX - sx);
    const speed = this.session.bulletSpeed();

    const sprite = this.add
      .image(sx, sy, 'glowdot')
      .setTint(PALETTE.red)
      .setScale(BULLET_SCALE)
      .setDepth(4);
    this.tweens.add({ targets: sprite, scale: BULLET_SCALE * 1.35, duration: 220, yoyo: true, repeat: -1 });
    this.bullets.push({ sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });

    // Muzzle flash on the rock itself, so the player can see which one shot.
    const flash = this.add.image(sx, sy, 'glowdot').setTint(PALETTE.magentaHot).setScale(2.5).setDepth(4);
    this.tweens.add({
      targets: flash,
      scale: 6,
      alpha: 0,
      duration: 220,
      onComplete: () => flash.destroy(),
    });
    getAudio(this)?.play('enemyFire');
  }

  private updateBullets(dt: number): void {
    const { width, height } = this.scale;
    for (const b of [...this.bullets]) {
      b.sprite.x += b.vx * dt;
      b.sprite.y += b.vy * dt;

      const offscreen = b.sprite.x < -40 || b.sprite.x > width + 40 || b.sprite.y > height + 40;
      if (b.sprite.y < this.groundY && !offscreen) continue;

      const x = b.sprite.x;
      const connects = !offscreen && Math.abs(x - this.cannonX) <= CONFIG.hazard.bulletHitRadius;
      this.removeBullet(b);
      if (connects) {
        this.playerHit();
        if (this.phase !== 'wave') return;
      } else if (!offscreen) {
        this.dirtPuff(x);
      }
    }
  }

  private removeBullet(b: LiveBullet): void {
    this.bullets = this.bullets.filter((x) => x !== b);
    this.tweens.killTweensOf(b.sprite);
    b.sprite.destroy();
  }

  private clearBullets(): void {
    for (const b of [...this.bullets]) this.removeBullet(b);
  }

  /** Sparks where a dodged shot buries into the ground — a near miss should read. */
  private dirtPuff(x: number): void {
    const emitter = this.add.particles(x, this.groundY, 'particle', {
      speed: { min: 40, max: 200 },
      angle: { min: 200, max: 340 },
      lifespan: { min: 150, max: 380 },
      scale: { start: 1.4, end: 0 },
      tint: PALETTE.red,
      quantity: 8,
      emitting: false,
    });
    emitter.explode(8);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private playerHit(): void {
    if (this.time.now < this.invulnUntil) return; // shot passed through the i-frames
    const h = CONFIG.hazard;
    const { juice } = CONFIG;
    this.invulnUntil = this.time.now + h.invulnSeconds * 1000;

    this.session.takeDamage();
    getAudio(this)?.play('playerHit');
    this.explode(this.cannonX, this.groundY - 12, PALETTE.red, juice.landParticles);
    shockwave(this, this.cannonX, this.groundY - 12, PALETTE.red);
    this.cameras.main.flash(200, 255, 40, 40);
    impact(this, {
      shakeMs: juice.landShakeMs,
      shakeIntensity: juice.landShakeIntensity,
      glow: juice.glowPulseHeavy,
      hitStopMs: juice.heavyHitStopMs,
    });

    // Blink through the i-frames so the player can see they're briefly safe.
    this.tweens.killTweensOf(this.cannon);
    this.cannon.setAlpha(1);
    this.tweens.add({
      targets: this.cannon,
      alpha: 0.25,
      duration: 90,
      yoyo: true,
      repeat: Math.max(0, Math.round((h.invulnSeconds * 1000) / 180) - 1),
      onComplete: () => this.cannon.setAlpha(1),
    });

    this.updateHud();
    if (this.session.gameOver) this.endRun();
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

  /** Drawn in local space inside a container, because the cannon now slides. */
  private drawCannon(): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.cyan, 1);
    g.fillTriangle(-22, 0, 22, 0, 0, -34);
    g.fillStyle(PALETTE.black, 1);
    g.fillTriangle(-12, 0, 12, 0, 0, -20);
    // Tread bar: gives the eye something to track against the ground line.
    g.fillStyle(PALETTE.magenta, 1);
    g.fillRect(-26, 0, 52, 4);
    this.cannon = this.add.container(this.cannonX, this.groundY, [g]).setDepth(4);
  }

  private createHud(): void {
    const { width, height } = this.scale;
    const style = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' };

    // Above bullets and particles — readouts must never be buried by the fireworks.
    const hud = 12;
    this.hpText = this.add.text(24, 20, '', { ...style, color: CSS.magenta }).setDepth(hud);
    this.scoreText = this.add
      .text(width - 24, 20, '', { ...style, color: CSS.white })
      .setOrigin(1, 0)
      .setDepth(hud);
    this.streakText = this.add
      .text(width - 24, 50, '', { ...style, color: CSS.yellow })
      .setOrigin(1, 0)
      .setDepth(hud);
    this.waveText = this.add
      .text(width / 2, 20, '', { ...style, color: CSS.cyanDim })
      .setOrigin(0.5, 0)
      .setDepth(hud);

    this.bufferText = this.add
      .text(width / 2, height - 40, '_', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setDepth(hud);

    this.add
      .text(24, height - 44, 'A / D  DODGE', { fontFamily: FONT, fontSize: '14px', color: CSS.cyanDim })
      .setAlpha(0.7)
      .setDepth(hud);

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
    this.clearBullets();
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
