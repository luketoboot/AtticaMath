import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { isCompleteShot, isViablePrefix } from '../../core/factor/factor';
import { FactorSession, type Rock } from '../../core/factor/session';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { clearHitStop, glowPulse, impact, shockwave, streakPitch, timeScale } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { InputBuffer } from '../InputBuffer';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** A rock on screen. The value and its arithmetic belong to the session. */
interface LiveRock {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  rock: Rock;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  spawnedAt: number;
  spin: Phaser.Tweens.Tween;
}

type Phase = 'wave' | 'breather' | 'over';

const COMBO_BAR_WIDTH = 150;

/**
 * Factor Storm: fly with the left hand, factor with the right.
 *
 * Type a factor of the locked rock and it splits into that factor and the
 * quotient, so the board multiplies before it clears. Rotation-and-thrust is
 * deliberately not the control scheme here: the right hand is on the number
 * row, so flying has to work with the left hand alone.
 */
export class FactorScene extends Phaser.Scene {
  private session!: FactorSession;
  private saves!: SaveManager;
  private buffer!: InputBuffer;

  private rocks: LiveRock[] = [];
  private phase: Phase = 'wave';
  private wave = 0;

  private ship!: Phaser.GameObjects.Container;
  private shipX = 0;
  private shipY = 0;
  private shipVx = 0;
  private shipVy = 0;
  private invulnUntil = 0;
  private moveKeys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]> = {
    up: [],
    down: [],
    left: [],
    right: [],
  };

  /** Rock the typing applies to. Held while the buffer is non-empty. */
  private lockedId: number | null = null;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private comboBar!: Phaser.GameObjects.Rectangle;
  private waveText!: Phaser.GameObjects.Text;
  private bufferText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super('Factor');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('game');
    applyCrt(this);
    clearHitStop(this);
    this.events.once('shutdown', () => clearHitStop(this));

    this.rocks = [];
    this.phase = 'wave';
    this.wave = 0;
    this.lockedId = null;
    this.invulnUntil = 0;
    this.shipX = width / 2;
    this.shipY = height / 2;
    this.shipVx = 0;
    this.shipVy = 0;

    const save = this.saves.save;
    this.session = new FactorSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
      ownedUpgrades: save.ownedUpgrades,
      loadout: save.loadout,
    });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawStarfield();
    this.drawShip();
    this.createHud();

    this.buffer = new InputBuffer(this, (value) => {
      this.bufferText.setText(value.length > 0 ? value : '_');
      this.onBufferChanged(value);
    });

    const kb = this.input.keyboard;
    this.moveKeys = {
      up: kb ? [kb.addKey('W'), kb.addKey('UP')] : [],
      down: kb ? [kb.addKey('S'), kb.addKey('DOWN')] : [],
      left: kb ? [kb.addKey('A'), kb.addKey('LEFT')] : [],
      right: kb ? [kb.addKey('D'), kb.addKey('RIGHT')] : [],
    };
    kb?.addCapture('UP,DOWN,LEFT,RIGHT');

    kb?.on('keydown-ESC', () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Factor' });
      this.scene.pause();
    });

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase === 'over') return;
    const dt = (deltaMs / 1000) * timeScale(this);

    this.flyShip(dt);
    if (this.phase !== 'wave') return;

    this.session.tick(dt);
    this.driftRocks(dt);
    this.refreshLock();
    this.syncCombo();
    this.checkCollisions();
    if (this.phase !== 'wave') return; // a collision ended the run

    if (this.rocks.length === 0) this.waveComplete();
  }

  // --- flight ---

  private flyShip(dt: number): void {
    const f = CONFIG.factor;
    let ax = 0;
    let ay = 0;
    if (this.moveKeys.left.some((k) => k.isDown)) ax -= 1;
    if (this.moveKeys.right.some((k) => k.isDown)) ax += 1;
    if (this.moveKeys.up.some((k) => k.isDown)) ay -= 1;
    if (this.moveKeys.down.some((k) => k.isDown)) ay += 1;

    // Normalised so diagonals are not faster than the cardinals.
    const mag = Math.hypot(ax, ay);
    if (mag > 0) {
      this.shipVx += (ax / mag) * f.shipAccel * dt;
      this.shipVy += (ay / mag) * f.shipAccel * dt;
    }

    // Drag rather than a hard stop: the ship has weight, but it answers at once.
    const drag = Math.max(0, 1 - f.shipDrag * dt);
    this.shipVx *= drag;
    this.shipVy *= drag;

    const speed = Math.hypot(this.shipVx, this.shipVy);
    if (speed > f.shipMaxSpeed) {
      this.shipVx = (this.shipVx / speed) * f.shipMaxSpeed;
      this.shipVy = (this.shipVy / speed) * f.shipMaxSpeed;
    }

    this.shipX = this.wrapX(this.shipX + this.shipVx * dt);
    this.shipY = this.wrapY(this.shipY + this.shipVy * dt);
    this.ship.setPosition(this.shipX, this.shipY);
    if (speed > 20) this.ship.setRotation(Math.atan2(this.shipVy, this.shipVx) + Math.PI / 2);
    this.ship.setAlpha(this.time.now < this.invulnUntil ? 0.45 : 1);
  }

  private wrapX(x: number): number {
    const { width } = this.scale;
    return Phaser.Math.Wrap(x, 0, width);
  }

  private wrapY(y: number): number {
    const { height } = this.scale;
    return Phaser.Math.Wrap(y, 0, height);
  }

  private driftRocks(dt: number): void {
    for (const r of this.rocks) {
      r.x = this.wrapX(r.x + r.vx * dt);
      r.y = this.wrapY(r.y + r.vy * dt);
      r.container.setPosition(r.x, r.y);
    }
  }

  // --- targeting ---

  /**
   * The rock the typing applies to: the nearest one, except while a buffer is
   * being typed, when the lock is held so drifting cannot steal the shot
   * halfway through a number.
   */
  private refreshLock(): void {
    if (this.buffer.value !== '' && this.rocks.some((r) => r.rock.id === this.lockedId)) {
      this.paintLocks();
      return;
    }
    let best: LiveRock | null = null;
    let bestDist = Infinity;
    for (const r of this.rocks) {
      const d = Phaser.Math.Distance.Between(this.shipX, this.shipY, r.x, r.y);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    this.lockedId = best ? best.rock.id : null;
    this.paintLocks();
  }

  private paintLocks(): void {
    for (const r of this.rocks) {
      const locked = r.rock.id === this.lockedId;
      r.ring.setStrokeStyle(locked ? 4 : 2, locked ? PALETTE.yellow : PALETTE.cyan, locked ? 1 : 0.55);
      r.label.setColor(locked ? CSS.yellow : CSS.white);
    }
    const target = this.rocks.find((r) => r.rock.id === this.lockedId);
    this.hintText.setText(target ? `TARGET ${target.rock.value}` : '');
  }

  // --- typing ---

  private onBufferChanged(value: string): void {
    if (this.phase !== 'wave' || value === '') return;
    const target = this.rocks.find((r) => r.rock.id === this.lockedId);
    if (!target) return;

    if (isCompleteShot(target.rock.value, value)) {
      this.shoot(target, Number(value));
      return;
    }
    if (!isViablePrefix(target.rock.value, value)) {
      // Nothing this rock accepts starts with what has been typed. Clear it for
      // the player and take the time out of the combo clock, never the combo.
      this.session.recordWrongDigit();
      this.buffer.clear();
      getAudio(this)?.play('error');
      this.bufferText.setColor(CSS.red);
      this.tweens.add({
        targets: this.bufferText,
        alpha: 0.2,
        duration: 90,
        yoyo: true,
        onComplete: () => this.bufferText.setColor(CSS.cyan),
      });
      this.syncCombo();
    }
  }

  private shoot(target: LiveRock, shot: number): void {
    const { juice } = CONFIG;
    const audio = getAudio(this);
    const outcome = this.session.shoot(target.rock.id, shot, this.time.now - target.spawnedAt);
    this.buffer.clear();
    if (outcome.result === 'illegal') {
      audio?.play('error');
      return;
    }

    const pitch = streakPitch(this.session.streak);
    this.beam(target.x, target.y);
    this.removeRock(target);

    if (outcome.result === 'destroyed') {
      const tint = outcome.prime ? PALETTE.magenta : PALETTE.cyan;
      audio?.play(outcome.prime ? 'fast' : 'explosion', { pitch });
      this.explode(target.x, target.y, tint, outcome.prime ? juice.fastKillParticles : juice.killParticles);
      shockwave(this, target.x, target.y, tint);
      this.popup(target.x, target.y, outcome.prime ? `+${outcome.points}  PRIME` : `+${outcome.points}`);
      impact(this, {
        shakeMs: juice.killShakeMs,
        shakeIntensity: outcome.prime ? juice.killShakeIntensity * 1.6 : juice.killShakeIntensity,
        glow: outcome.prime ? juice.glowPulseHeavy : juice.glowPulseKill,
        hitStopMs: juice.hitStopMs,
      });
    } else {
      audio?.play('laserSpread', { pitch });
      this.explode(target.x, target.y, PALETTE.yellow, juice.killParticles);
      this.popup(
        target.x,
        target.y,
        outcome.balanced ? `+${outcome.points}  CLEAN` : `+${outcome.points}`,
      );
      // The halves fly apart along a random axis, so the board opens up rather
      // than leaving two rocks sitting on top of each other.
      const angle = Math.random() * Math.PI * 2;
      const speed = CONFIG.factor.splitSpeed;
      outcome.pieces.forEach((piece, i) => {
        const dir = i === 0 ? 1 : -1;
        this.spawnRock(
          piece,
          target.x + Math.cos(angle) * dir * target.radius,
          target.y + Math.sin(angle) * dir * target.radius,
          target.vx + Math.cos(angle) * dir * speed,
          target.vy + Math.sin(angle) * dir * speed,
        );
      });
      impact(this, {
        shakeMs: juice.killShakeMs,
        shakeIntensity: juice.killShakeIntensity,
        glow: juice.glowPulseKill,
        hitStopMs: juice.hitStopMs,
      });
    }

    this.updateHud();
    this.refreshLock();
  }

  // --- rocks ---

  private startWave(): void {
    this.wave += 1;
    this.phase = 'wave';
    const { width, height } = this.scale;
    for (const rock of this.session.nextWave()) {
      // Rocks enter around the edges so the player is never spawned on top of one.
      const edge = Phaser.Math.Between(0, 3);
      const x = edge === 0 ? 40 : edge === 1 ? width - 40 : Phaser.Math.Between(40, width - 40);
      const y = edge === 2 ? 40 : edge === 3 ? height - 40 : Phaser.Math.Between(40, height - 40);
      const speed = this.session.driftSpeed(rock.value);
      const angle = Math.random() * Math.PI * 2;
      this.spawnRock(rock, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
    this.waveText.setText(`WAVE ${this.wave}`);
    this.banner(`WAVE ${this.wave}`, CSS.magenta);
    getAudio(this)?.play('wave');
    this.refreshLock();
  }

  private spawnRock(rock: Rock, x: number, y: number, vx: number, vy: number): void {
    const radius = this.session.radius(rock.value);
    const ring = this.add.circle(0, 0, radius).setStrokeStyle(2, PALETTE.cyan, 0.55);
    const shell = this.add.circle(0, 0, radius - 5, PALETTE.deepPurple, 0.55);
    const label = this.add
      .text(0, 0, String(rock.value), {
        fontFamily: FONT,
        fontSize: `${Math.round(radius * 0.85)}px`,
        fontStyle: 'bold',
        color: CSS.white,
        stroke: CSS.black,
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [ring, shell, label]);
    const spin = this.tweens.add({
      targets: ring,
      angle: 360,
      duration: 6000 + radius * 90,
      repeat: -1,
    });

    this.rocks.push({
      container,
      label,
      ring,
      rock,
      x,
      y,
      vx,
      vy,
      radius,
      spawnedAt: this.time.now,
      spin,
    });
  }

  private removeRock(r: LiveRock): void {
    this.rocks = this.rocks.filter((x) => x !== r);
    r.spin.stop();
    r.container.destroy();
  }

  private checkCollisions(): void {
    if (this.time.now < this.invulnUntil) return;
    const f = CONFIG.factor;
    for (const r of this.rocks) {
      const dist = Phaser.Math.Distance.Between(this.shipX, this.shipY, r.x, r.y);
      if (dist > r.radius + f.shipRadius) continue;

      this.session.takeDamage();
      this.invulnUntil = this.time.now + f.invulnSeconds * 1000;
      getAudio(this)?.play('playerHit');
      this.cameras.main.flash(200, 255, 40, 40);
      impact(this, {
        shakeMs: CONFIG.juice.landShakeMs,
        shakeIntensity: CONFIG.juice.landShakeIntensity,
        glow: CONFIG.juice.glowPulseHeavy,
        hitStopMs: CONFIG.juice.heavyHitStopMs,
      });

      // Shove both apart so the ship cannot be pinned inside a rock.
      const angle = Math.atan2(this.shipY - r.y, this.shipX - r.x);
      this.shipVx = Math.cos(angle) * f.collisionKnockback;
      this.shipVy = Math.sin(angle) * f.collisionKnockback;
      r.vx -= Math.cos(angle) * f.collisionKnockback * 0.3;
      r.vy -= Math.sin(angle) * f.collisionKnockback * 0.3;

      this.updateHud();
      if (this.session.gameOver) this.endRun();
      return;
    }
  }

  private waveComplete(): void {
    this.phase = 'breather';
    const pick = this.session.endWave();
    const { width, height } = this.scale;
    const lines: Phaser.GameObjects.GameObject[] = [
      this.add
        .text(width / 2, height * 0.3, 'ARENA CLEAR', {
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
          .text(width / 2, height * 0.4, 'OPERATOR //', {
            fontFamily: FONT,
            fontSize: '18px',
            color: CSS.magentaHot,
          })
          .setOrigin(0.5),
        this.add
          .text(width / 2, height * 0.46, pick.tip.text, {
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

  // --- fx ---

  private beam(tx: number, ty: number): void {
    const g = this.add.graphics();
    g.lineStyle(6, PALETTE.cyan, 0.35);
    g.lineBetween(this.shipX, this.shipY, tx, ty);
    g.lineStyle(2, PALETTE.white, 1);
    g.lineBetween(this.shipX, this.shipY, tx, ty);
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  private explode(x: number, y: number, tint: number, count: number): void {
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 60, max: 320 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 650 },
      scale: { start: 1.6, end: 0 },
      tint,
      quantity: count,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(750, () => emitter.destroy());
  }

  private popup(x: number, y: number, message: string): void {
    const text = this.add
      .text(x, y - 20, message, {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.yellow,
        stroke: CSS.black,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({
      targets: text,
      y: y - 80,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private banner(message: string, color: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height * 0.22, message, {
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
      hold: 800,
      yoyo: true,
      onComplete: () => text.destroy(),
    });
  }

  // --- scenery & HUD ---

  private drawStarfield(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      g.fillStyle(i % 7 === 0 ? PALETTE.magenta : PALETTE.deepPurple, i % 3 === 0 ? 0.9 : 0.5);
      g.fillRect(x, y, 2, 2);
    }
  }

  private drawShip(): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.cyan, 1);
    g.fillTriangle(0, -20, -14, 16, 14, 16);
    g.fillStyle(PALETTE.black, 1);
    g.fillTriangle(0, -8, -7, 10, 7, 10);
    g.fillStyle(PALETTE.magenta, 1);
    g.fillRect(-14, 14, 28, 4);
    this.ship = this.add.container(this.shipX, this.shipY, [g]).setDepth(5);
  }

  private createHud(): void {
    const { width, height } = this.scale;
    const style = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' };
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
    this.comboBar = this.add
      .rectangle(width - 24, 80, COMBO_BAR_WIDTH, 6, PALETTE.yellow)
      .setOrigin(1, 0)
      .setDepth(hud)
      .setVisible(false);
    this.waveText = this.add
      .text(width / 2, 20, '', { ...style, color: CSS.cyanDim })
      .setOrigin(0.5, 0)
      .setDepth(hud);

    this.hintText = this.add
      .text(width / 2, height - 74, '', { fontFamily: FONT, fontSize: '18px', color: CSS.cyanDim })
      .setOrigin(0.5)
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
      .text(24, height - 40, 'WASD FLY  ·  TYPE A FACTOR TO SPLIT  ·  TYPE THE NUMBER TO DESTROY', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setAlpha(0.75)
      .setDepth(hud);

    this.updateHud();
  }

  private updateHud(): void {
    this.hpText.setText(`HP ${'█'.repeat(Math.max(0, this.session.hp))}`);
    this.scoreText.setText(`${this.session.score}`);
    this.syncCombo();
  }

  private syncCombo(): void {
    const { session } = this;
    this.streakText.setText(session.streak > 0 ? `x${session.comboMultiplier}  ${session.streak}` : '');
    this.streakText.setColor(session.overdriveActive ? CSS.magentaHot : CSS.yellow);
    this.comboBar
      .setVisible(session.streak > 0)
      .setFillStyle(session.overdriveActive ? PALETTE.magenta : PALETTE.yellow)
      .setSize(Math.max(1, COMBO_BAR_WIDTH * session.comboFraction), 6);
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    clearHitStop(this);
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
    this.cameras.main.flash(400, 255, 45, 149);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
    this.time.delayedCall(900, () => {
      this.scene.start('Debrief', {
        stats: this.session.stats(),
        credits,
        mode: 'Factor',
        milestones: unlocked.map((m) => m.label),
      });
    });
  }
}
