import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  formatFraction,
  formatPercent,
  generateWave,
  matchesPercent,
  poolSize,
  reduce,
  type Fraction,
} from '../../core/collapse/equiv';
import { CONFIG } from '../../core/config';
import { createRng } from '../../core/rng';
import { applyCrt } from '../../fx/applyCrt';
import { clearHitStop, glowPulse, impact, shockwave, timeScale } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { KeyState, onActionKey, sceneBindings } from '../input/KeyState';
import type { KeyBindings } from '../../core/input/bindings';

/** A drifting token. Fractions are pushable and safe; percentages are neither. */
interface Token {
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface FractionToken extends Token {
  fraction: Fraction;
  /** Percent value this one belongs to — cached for scoring, never shown. */
  percent: number;
  unreduced: boolean;
  lockedUntil: number;
}

interface PercentToken extends Token {
  percent: number;
  tier: number;
}

type Phase = 'wave' | 'over';

/**
 * COLLAPSE — prototype.
 *
 * Fractions are inert and pushable. Percentages are lethal on contact. Shove a
 * fraction into the percentage it equals and the pair implodes.
 *
 * The verb under test is the repulsor: a radial shove that only moves
 * fractions. Radial rather than aimed because it makes *positioning* the skill
 * — you have to get on the far side of a fraction from its target — and it
 * guarantees standoff, so you never ride your own projectile into a hazard.
 *
 * Prototype scope: no skill-model wiring, no economy, no debrief. Local score
 * and HP only, with instant retry, because the question this build answers is
 * whether the push feels good.
 */
export class CollapseScene extends Phaser.Scene {
  private fractions: FractionToken[] = [];
  private percents: PercentToken[] = [];
  private phase: Phase = 'wave';
  private wave = 0;
  private hp = 0;
  private score = 0;
  private matched = 0;
  private missed = 0;

  private ship!: Phaser.GameObjects.Container;
  private shipX = 0;
  private shipY = 0;
  private shipVx = 0;
  private shipVy = 0;
  private invulnUntil = 0;
  private pulseReadyAt = 0;

  private keys!: KeyState;
  private bindings!: KeyBindings;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private pulseBar!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Collapse');
  }

  create(): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic('game');
    applyCrt(this);
    clearHitStop(this);
    this.events.once('shutdown', () => clearHitStop(this));

    this.fractions = [];
    this.percents = [];
    this.phase = 'wave';
    this.wave = 0;
    this.hp = CONFIG.collapse.startingHp;
    this.score = 0;
    this.matched = 0;
    this.missed = 0;
    this.invulnUntil = 0;
    this.pulseReadyAt = 0;
    this.shipX = width / 2;
    this.shipY = height / 2;
    this.shipVx = 0;
    this.shipVy = 0;

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawStarfield();
    this.drawShip();
    this.createHud();

    this.bindings = sceneBindings(this);
    this.keys = new KeyState(this);
    this.input.keyboard?.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    onActionKey(this, this.bindings.launch, () => this.pulse());
    onActionKey(this, this.bindings.pause, () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Collapse' });
      this.scene.pause();
    });
    // Fast retry matters more than a debrief while the feel is being tuned.
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    const dt = (deltaMs / 1000) * timeScale(this);
    this.flyShip(dt);
    if (this.phase !== 'wave') return;

    this.driftTokens(dt);
    this.checkPairings();
    this.checkShipHazards();
    if (this.phase !== 'wave') return;

    this.syncPulseBar();
    if (this.fractions.length === 0) this.startWave();
  }

  // --- flight ---

  private flyShip(dt: number): void {
    const c = CONFIG.collapse;
    let ax = 0;
    let ay = 0;
    if (this.keys.isDown(this.bindings.left)) ax -= 1;
    if (this.keys.isDown(this.bindings.right)) ax += 1;
    if (this.keys.isDown(this.bindings.up)) ay -= 1;
    if (this.keys.isDown(this.bindings.down)) ay += 1;

    const mag = Math.hypot(ax, ay);
    if (mag > 0) {
      this.shipVx += (ax / mag) * c.shipAccel * dt;
      this.shipVy += (ay / mag) * c.shipAccel * dt;
    }

    const drag = Math.max(0, 1 - c.shipDrag * dt);
    this.shipVx *= drag;
    this.shipVy *= drag;

    const speed = Math.hypot(this.shipVx, this.shipVy);
    if (speed > c.shipMaxSpeed) {
      this.shipVx = (this.shipVx / speed) * c.shipMaxSpeed;
      this.shipVy = (this.shipVy / speed) * c.shipMaxSpeed;
    }

    this.shipX = this.wrapX(this.shipX + this.shipVx * dt);
    this.shipY = this.wrapY(this.shipY + this.shipVy * dt);
    this.ship.setPosition(this.shipX, this.shipY);
    if (speed > 20) this.ship.setRotation(Math.atan2(this.shipVy, this.shipVx) + Math.PI / 2);
    this.ship.setAlpha(this.time.now < this.invulnUntil ? 0.45 : 1);
  }

  private wrapX(x: number): number {
    return Phaser.Math.Wrap(x, 0, this.scale.width);
  }

  private wrapY(y: number): number {
    return Phaser.Math.Wrap(y, 0, this.scale.height);
  }

  private driftTokens(dt: number): void {
    const c = CONFIG.collapse;
    for (const f of this.fractions) {
      // Shoved fractions coast and settle; percentages hold their lazy drift.
      const drag = Math.max(0, 1 - c.fractionDrag * dt);
      f.vx *= drag;
      f.vy *= drag;
      f.x = this.wrapX(f.x + f.vx * dt);
      f.y = this.wrapY(f.y + f.vy * dt);
      f.container.setPosition(f.x, f.y);
      const moving = Math.hypot(f.vx, f.vy) > 60;
      f.ring.setStrokeStyle(moving ? 4 : 2, PALETTE.cyan, moving ? 1 : 0.6);
    }
    for (const p of this.percents) {
      p.x = this.wrapX(p.x + p.vx * dt);
      p.y = this.wrapY(p.y + p.vy * dt);
      p.container.setPosition(p.x, p.y);
    }
  }

  // --- the repulsor ---

  private pulse(): void {
    if (this.phase !== 'wave' || this.time.now < this.pulseReadyAt) return;
    const c = CONFIG.collapse;
    this.pulseReadyAt = this.time.now + c.pulseCooldownSeconds * 1000;

    let shoved = 0;
    for (const f of this.fractions) {
      const dist = Phaser.Math.Distance.Between(this.shipX, this.shipY, f.x, f.y);
      if (dist > c.pulseRadius) continue;
      const angle = Math.atan2(f.y - this.shipY, f.x - this.shipX);
      // Falls off with distance so a close shove is a hard shove — that is the
      // difference between a nudge and a commit.
      const falloff = 1 - (dist / c.pulseRadius) * 0.55;
      f.vx += Math.cos(angle) * c.pulseImpulse * falloff;
      f.vy += Math.sin(angle) * c.pulseImpulse * falloff;
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > c.maxFractionSpeed) {
        f.vx = (f.vx / speed) * c.maxFractionSpeed;
        f.vy = (f.vy / speed) * c.maxFractionSpeed;
      }
      shoved += 1;
    }

    this.pulseRing(shoved > 0);
    getAudio(this)?.play(shoved > 0 ? 'laserSpread' : 'ui', { pitch: shoved > 0 ? 1.1 : 0.8 });
  }

  private pulseRing(connected: boolean): void {
    const c = CONFIG.collapse;
    const ring = this.add
      .circle(this.shipX, this.shipY, c.pulseRadius * 0.35)
      .setStrokeStyle(3, connected ? PALETTE.cyan : PALETTE.deepPurple, 0.9)
      .setDepth(3);
    this.tweens.add({
      targets: ring,
      radius: c.pulseRadius,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // --- pairing ---

  private checkPairings(): void {
    for (const f of [...this.fractions]) {
      if (this.time.now < f.lockedUntil) continue;
      for (const p of this.percents) {
        const dist = Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y);
        if (dist > f.radius + p.radius) continue;

        if (matchesPercent(f.fraction, p.percent)) this.collapsePair(f, p);
        else this.rejectPair(f, p);
        break;
      }
    }
  }

  /** The star collapse: both tokens implode into the midpoint and are gone. */
  private collapsePair(f: FractionToken, p: PercentToken): void {
    const { juice } = CONFIG;
    const c = CONFIG.collapse;
    const x = (f.x + p.x) / 2;
    const y = (f.y + p.y) / 2;

    const points = c.matchBase + (p.tier - 1) * c.tierBonus + (f.unreduced ? c.unreducedBonus : 0);
    this.score += points;
    this.matched += 1;

    this.removeFraction(f);
    this.removePercent(p);

    this.implode(x, y);
    shockwave(this, x, y, PALETTE.magenta);
    this.popup(
      x,
      y,
      f.unreduced ? `+${points}  ${formatFraction(reduce(f.fraction))}` : `+${points}`,
      CSS.yellow,
    );
    getAudio(this)?.play('explosion', { pitch: 1.15 });
    impact(this, {
      shakeMs: juice.killShakeMs,
      shakeIntensity: juice.killShakeIntensity * 1.5,
      glow: juice.glowPulseHeavy,
      hitStopMs: juice.hitStopMs,
    });
    this.updateHud();
  }

  /**
   * Wrong pairing: bounce, do not consume. A fraction is a reusable resource,
   * not ammunition — if a bad read cost you the token, players stop taking
   * shots, and taking shots is the whole loop.
   */
  private rejectPair(f: FractionToken, p: PercentToken): void {
    const c = CONFIG.collapse;
    this.missed += 1;
    const angle = Math.atan2(f.y - p.y, f.x - p.x);
    f.vx = Math.cos(angle) * c.wrongBounceSpeed;
    f.vy = Math.sin(angle) * c.wrongBounceSpeed;
    f.x = p.x + Math.cos(angle) * (f.radius + p.radius + 2);
    f.y = p.y + Math.sin(angle) * (f.radius + p.radius + 2);
    f.lockedUntil = this.time.now + c.wrongLockoutSeconds * 1000;

    p.ring.setStrokeStyle(5, PALETTE.red, 1);
    this.tweens.add({
      targets: p.container,
      alpha: 0.4,
      duration: 90,
      yoyo: true,
      onComplete: () => p.ring.setStrokeStyle(3, PALETTE.magenta, 0.85),
    });
    this.popup(p.x, p.y, formatPercent(p.percent), CSS.red);
    getAudio(this)?.play('error');
  }

  // --- hazards ---

  private checkShipHazards(): void {
    if (this.time.now < this.invulnUntil) return;
    const c = CONFIG.collapse;
    for (const p of this.percents) {
      const dist = Phaser.Math.Distance.Between(this.shipX, this.shipY, p.x, p.y);
      if (dist > p.radius + c.shipRadius) continue;

      this.hp -= 1;
      this.invulnUntil = this.time.now + c.invulnSeconds * 1000;
      getAudio(this)?.play('playerHit');
      this.cameras.main.flash(200, 255, 40, 40);
      impact(this, {
        shakeMs: CONFIG.juice.landShakeMs,
        shakeIntensity: CONFIG.juice.landShakeIntensity,
        glow: CONFIG.juice.glowPulseHeavy,
        hitStopMs: CONFIG.juice.heavyHitStopMs,
      });

      const angle = Math.atan2(this.shipY - p.y, this.shipX - p.x);
      this.shipVx = Math.cos(angle) * c.collisionKnockback;
      this.shipVy = Math.sin(angle) * c.collisionKnockback;

      this.updateHud();
      if (this.hp <= 0) this.endRun();
      return;
    }
  }

  // --- waves ---

  private startWave(): void {
    const c = CONFIG.collapse;
    this.wave += 1;
    const maxTier = this.wave >= c.tier3Wave ? 3 : this.wave >= c.tier2Wave ? 2 : 1;
    const pairs = Math.min(
      c.basePairs + (this.wave - 1) * c.pairsPerWave,
      c.maxPairs,
      poolSize(maxTier),
    );

    const rng = createRng((Date.now() ^ (this.wave * 0x9e3779b1)) >>> 0);
    const plan = generateWave(rng, { pairs, maxTier, unreducedChance: c.unreducedChance });

    for (const pair of plan) {
      const tier = maxTier;
      this.spawnPercent(pair.percent, tier);
      this.spawnFraction(pair.fraction, pair.percent);
    }

    this.waveText.setText(`WAVE ${this.wave}`);
    this.banner(`WAVE ${this.wave}`, CSS.magenta);
    getAudio(this)?.play('wave');
    this.updateHud();
  }

  /**
   * Spawn clear of the ship and of every token already placed. Without the
   * second check a fraction can land on its own percentage and collapse for
   * free before the player has moved.
   */
  private safeSpawn(radius: number): { x: number; y: number } {
    const { width, height } = this.scale;
    const placed = [...this.fractions, ...this.percents];
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(radius + 20, width - radius - 20);
      const y = Phaser.Math.Between(radius + 60, height - radius - 60);
      if (Phaser.Math.Distance.Between(x, y, this.shipX, this.shipY) < 190) continue;
      const clear = placed.every(
        (t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) > radius + t.radius + 40,
      );
      if (clear) return { x, y };
    }
    return { x: radius + 30, y: radius + 70 };
  }

  private driftVelocity(): { vx: number; vy: number } {
    const c = CONFIG.collapse;
    const speed = Phaser.Math.Between(c.slowestDrift, c.fastestDrift);
    const angle = Math.random() * Math.PI * 2;
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  private spawnFraction(fraction: Fraction, percent: number): void {
    const c = CONFIG.collapse;
    const { x, y } = this.safeSpawn(c.fractionRadius);
    const { vx, vy } = this.driftVelocity();

    const ring = this.add.circle(0, 0, c.fractionRadius).setStrokeStyle(2, PALETTE.cyan, 0.6);
    const shell = this.add.circle(0, 0, c.fractionRadius - 4, PALETTE.deepPurple, 0.5);
    const label = this.add
      .text(0, 0, formatFraction(fraction), {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: CSS.white,
        stroke: CSS.black,
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [ring, shell, label]).setDepth(2);

    const reduced = reduce(fraction);
    this.fractions.push({
      container,
      ring,
      label,
      x,
      y,
      vx,
      vy,
      radius: c.fractionRadius,
      fraction,
      percent,
      unreduced: reduced.num !== fraction.num,
      lockedUntil: 0,
    });
  }

  private spawnPercent(percent: number, tier: number): void {
    const c = CONFIG.collapse;
    const { x, y } = this.safeSpawn(c.percentRadius);
    const { vx, vy } = this.driftVelocity();

    // Hazards read as jagged and hot: thick magenta ring, warning spokes.
    const ring = this.add.circle(0, 0, c.percentRadius).setStrokeStyle(3, PALETTE.magenta, 0.85);
    const core = this.add.circle(0, 0, c.percentRadius - 6, PALETTE.black, 0.85);
    const label = this.add
      .text(0, 0, formatPercent(percent), {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.magentaHot,
        stroke: CSS.black,
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [ring, core, label]).setDepth(2);
    this.tweens.add({
      targets: ring,
      scale: 1.08,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.percents.push({
      container,
      ring,
      label,
      x,
      y,
      vx,
      vy,
      radius: c.percentRadius,
      percent,
      tier,
    });
  }

  private removeFraction(f: FractionToken): void {
    this.fractions = this.fractions.filter((t) => t !== f);
    f.container.destroy();
  }

  private removePercent(p: PercentToken): void {
    this.percents = this.percents.filter((t) => t !== p);
    p.container.destroy();
  }

  // --- fx ---

  /** Inward rush then a flash out — a collapse, not an explosion. */
  private implode(x: number, y: number): void {
    const inward = this.add.particles(x, y, 'particle', {
      speed: { min: -300, max: -110 },
      angle: { min: 0, max: 360 },
      lifespan: 300,
      scale: { start: 1.4, end: 0.2 },
      tint: PALETTE.cyan,
      quantity: 30,
      emitting: false,
    });
    inward.explode(30);

    const core = this.add.circle(x, y, 6, PALETTE.white, 1).setDepth(9);
    this.tweens.add({
      targets: core,
      scale: 7,
      alpha: 0,
      duration: 320,
      delay: 160,
      ease: 'Expo.easeOut',
      onComplete: () => core.destroy(),
    });

    this.time.delayedCall(170, () => {
      const out = this.add.particles(x, y, 'particle', {
        speed: { min: 120, max: 420 },
        angle: { min: 0, max: 360 },
        lifespan: { min: 260, max: 620 },
        scale: { start: 1.7, end: 0 },
        tint: PALETTE.magenta,
        quantity: 40,
        emitting: false,
      });
      out.explode(40);
      this.time.delayedCall(750, () => out.destroy());
    });
    this.time.delayedCall(700, () => inward.destroy());
  }

  private popup(x: number, y: number, message: string, color: string): void {
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
      .setAlpha(0)
      .setDepth(11);
    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 200,
      hold: 700,
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
    this.waveText = this.add
      .text(width / 2, 20, '', { ...style, color: CSS.cyanDim })
      .setOrigin(0.5, 0)
      .setDepth(hud);
    this.pulseBar = this.add
      .rectangle(24, 52, 150, 6, PALETTE.cyan)
      .setOrigin(0, 0)
      .setDepth(hud);

    this.add
      .text(
        width / 2,
        height - 30,
        'WASD FLY  ·  SPACE PULSE (SHOVES FRACTIONS)  ·  MAGENTA KILLS  ·  R RETRY',
        { fontFamily: FONT, fontSize: '14px', color: CSS.cyanDim },
      )
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setDepth(hud);

    this.updateHud();
  }

  private updateHud(): void {
    this.hpText.setText(`HP ${'█'.repeat(Math.max(0, this.hp))}`);
    this.scoreText.setText(`${this.score}`);
  }

  private syncPulseBar(): void {
    const c = CONFIG.collapse;
    const remaining = Math.max(0, this.pulseReadyAt - this.time.now);
    const fraction = 1 - remaining / (c.pulseCooldownSeconds * 1000);
    this.pulseBar
      .setSize(Math.max(1, 150 * Phaser.Math.Clamp(fraction, 0, 1)), 6)
      .setFillStyle(fraction >= 1 ? PALETTE.cyan : PALETTE.deepPurple);
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    clearHitStop(this);
    const { width, height } = this.scale;
    getAudio(this)?.play('gameover');
    this.cameras.main.flash(400, 255, 45, 149);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);

    this.add.rectangle(0, 0, width, height, PALETTE.black, 0.72).setOrigin(0).setDepth(20);
    this.add
      .text(width / 2, height * 0.36, 'COLLAPSE FAILED', {
        fontFamily: FONT,
        fontSize: '52px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5)
      .setDepth(21);
    const accuracy = this.matched + this.missed > 0
      ? Math.round((this.matched / (this.matched + this.missed)) * 100)
      : 100;
    this.add
      .text(
        width / 2,
        height * 0.5,
        `SCORE ${this.score}\nWAVE ${this.wave}\nPAIRED ${this.matched}   MISREAD ${this.missed}   ${accuracy}%`,
        { fontFamily: FONT, fontSize: '24px', color: CSS.white, align: 'center' },
      )
      .setOrigin(0.5)
      .setDepth(21);
    this.add
      .text(width / 2, height * 0.68, '[ R ] RETRY        [ ESC ] MENU', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));
  }
}
