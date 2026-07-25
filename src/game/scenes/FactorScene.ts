import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { hullFor, trailFor } from '../../core/cosmetics/cosmetics';
import { isCompleteShot, isPrime, isViablePrefix } from '../../core/factor/factor';
import { FactorSession, type Rock } from '../../core/factor/session';
import {
  newFlightState,
  stepFlight,
  withVelocity,
  type FlightState,
} from '../../core/flight/newtonian';
import { createRng } from '../../core/rng';
import { generateAsteroid, hitsCircle, type AsteroidShape } from '../../core/shapes/asteroid';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { clearHitStop, glowPulse, impact, shockwave, streakPitch, timeScale } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { paintAsteroid } from '../AsteroidGfx';
import { drawFlame, drawHull } from '../ShipGfx';
import { KeyState, onActionKey, sceneBindings } from '../input/KeyState';
import { InputBuffer } from '../InputBuffer';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import type { KeyBindings } from '../../core/input/bindings';

/** A rock on screen. The value and its arithmetic belong to the session. */
interface LiveRock {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  /** The drawn silhouette; also the hitbox, via core/shapes/asteroid. */
  gfx: Phaser.GameObjects.Graphics;
  shape: AsteroidShape;
  rock: Rock;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Current spin (radians) and its rate, applied to both art and collision. */
  rotation: number;
  spinRate: number;
  spawnedAt: number;
}

type Phase = 'wave' | 'breather' | 'over';

const COMBO_BAR_WIDTH = 150;

/**
 * Factor Storm: fly with the left hand, factor with the right.
 *
 * Type a factor of the locked rock and it splits into that factor and the
 * quotient, so the board multiplies before it clears. Flight is Newtonian
 * rotate-and-thrust (see core/flight): W drives along the nose, S backs off,
 * A/D swing the nose, and momentum is yours to manage.
 */
export class FactorScene extends Phaser.Scene {
  private session!: FactorSession;
  private saves!: SaveManager;
  private buffer!: InputBuffer;

  private rocks: LiveRock[] = [];
  private phase: Phase = 'wave';
  private wave = 0;

  private ship!: Phaser.GameObjects.Container;
  private flight!: FlightState;
  private flame!: Phaser.GameObjects.Graphics;
  private invulnUntil = 0;
  private keys!: KeyState;
  private bindings!: KeyBindings;
  private shapeRng = createRng(1);

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
    getAudio(this)?.playMusic('drift');
    applyCrt(this);
    clearHitStop(this);
    // A loop outlives the scene that started it unless it is cut explicitly —
    // otherwise the engine keeps roaring over the menu.
    this.events.once('shutdown', () => {
      clearHitStop(this);
      getAudio(this)?.stopAllLoops();
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, () => getAudio(this)?.stopAllLoops());

    this.rocks = [];
    this.phase = 'wave';
    this.wave = 0;
    this.lockedId = null;
    this.invulnUntil = 0;
    this.shapeRng = createRng(Date.now() >>> 0);
    this.flight = newFlightState(width / 2, height / 2);

    const save = this.saves.save;
    this.session = new FactorSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
    });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawStarfield();
    this.drawShip();
    this.createHud();

    this.buffer = new InputBuffer(this, (value) => {
      this.bufferText.setText(value.length > 0 ? value : '_');
      this.onBufferChanged(value);
    });

    this.bindings = sceneBindings(this);
    this.keys = new KeyState(this);
    this.input.keyboard?.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    onActionKey(this, this.bindings.pause, () => {
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
    const thrust = this.keys.isDown(this.bindings.up);
    const reverse = this.keys.isDown(this.bindings.down);
    this.flight = stepFlight(
      this.flight,
      {
        thrust,
        reverse,
        turnLeft: this.keys.isDown(this.bindings.left),
        turnRight: this.keys.isDown(this.bindings.right),
      },
      CONFIG.flight,
      dt,
      { width: this.scale.width, height: this.scale.height },
    );

    this.ship.setPosition(this.flight.x, this.flight.y);
    // The hull art points up, so the sprite trails the facing by a quarter turn.
    this.ship.setRotation(this.flight.facing + Math.PI / 2);
    this.ship.setAlpha(this.time.now < this.invulnUntil ? 0.45 : 1);
    const burning = thrust && !reverse;
    // Reverse runs the same engine at a lower throttle rather than a second
    // sound — one source re-pitched reads as one ship.
    getAudio(this)?.setLoop('thruster', thrust || reverse, {
      rate: burning ? 1 : 0.82,
      gain: burning ? 1 : 0.6,
    });
    this.flame.setVisible(burning).setAlpha(Phaser.Math.FloatBetween(0.55, 1));
  }

  private get shipX(): number {
    return this.flight.x;
  }

  private get shipY(): number {
    return this.flight.y;
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
      // Only the silhouette turns; the number stays upright and readable.
      r.rotation += r.spinRate * dt;
      r.gfx.setRotation(r.rotation);
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
      paintAsteroid(r.gfx, r.shape, {
        stroke: locked ? PALETTE.yellow : PALETTE.cyan,
        strokeWidth: locked ? 4 : 2,
        strokeAlpha: locked ? 1 : 0.6,
        fill: PALETTE.deepPurple,
        fillAlpha: locked ? 0.7 : 0.5,
        facets: true,
      });
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
      // Reaching for the number printed on a composite is the mistake everyone
      // makes first. Catch it at the first digit — by the time the whole value
      // is typed the buffer has long since been cleared — and say what the rule
      // is rather than just buzzing.
      if (String(target.rock.value).startsWith(value) && !isPrime(target.rock.value)) {
        this.popup(target.x, target.y, 'NOT PRIME — BREAK IT', CSS.red);
      }
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
    const a = CONFIG.asteroid;
    const shape = generateAsteroid(this.shapeRng, radius, a);

    const gfx = this.add.graphics();
    paintAsteroid(gfx, shape, {
      stroke: PALETTE.cyan,
      strokeWidth: 2,
      strokeAlpha: 0.6,
      fill: PALETTE.deepPurple,
      fillAlpha: 0.5,
      facets: true,
    });

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
    const container = this.add.container(x, y, [gfx, label]);

    const spinDeg = Phaser.Math.Between(a.minSpinDeg, a.maxSpinDeg) * (this.shapeRng.chance(0.5) ? 1 : -1);

    this.rocks.push({
      container,
      label,
      gfx,
      shape,
      rock,
      x,
      y,
      vx,
      vy,
      radius,
      rotation: this.shapeRng.next() * Math.PI * 2,
      spinRate: Phaser.Math.DegToRad(spinDeg),
      spawnedAt: this.time.now,
    });
  }

  private removeRock(r: LiveRock): void {
    this.rocks = this.rocks.filter((x) => x !== r);
    r.container.destroy();
  }

  private checkCollisions(): void {
    if (this.time.now < this.invulnUntil) return;
    const f = CONFIG.factor;
    for (const r of this.rocks) {
      if (!hitsCircle(r.shape, r.x, r.y, r.rotation, this.shipX, this.shipY, CONFIG.flight.shipRadius))
        continue;

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
      this.flight = withVelocity(
        this.flight,
        Math.cos(angle) * f.collisionKnockback,
        Math.sin(angle) * f.collisionKnockback,
      );
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

  private popup(x: number, y: number, message: string, color: string = CSS.yellow): void {
    const text = this.add
      .text(x, y - 20, message, {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color,
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
    const save = this.saves.save;
    const g = this.add.graphics();
    drawHull(g, hullFor(save.equipped.hull), PALETTE.cyan, CONFIG.flight.shipRadius);

    // Exhaust behind the hull. With rotate-and-thrust the nose no longer
    // follows the velocity, so the player needs to see where thrust is going.
    this.flame = this.add.graphics();
    drawFlame(this.flame, trailFor(save.equipped.trail), CONFIG.flight.shipRadius);
    this.flame.setVisible(false);

    this.ship = this.add.container(this.shipX, this.shipY, [this.flame, g]).setDepth(5);
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
      .text(24, height - 40, 'W THRUST · S REVERSE · A/D TURN  ·  TYPE A FACTOR TO SPLIT  ·  A PRIME DIES BY ITS OWN NAME', {
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
    // The update loop stops driving the thruster from here, so cut it by hand.
    getAudio(this)?.stopAllLoops();
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
