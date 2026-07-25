import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  formatFraction,
  formatPercent,
  generateWave,
  poolSize,
  reduce,
  toPercent,
  type Fraction,
} from '../../core/collapse/equiv';
import {
  advance,
  breakChain,
  multiplierOf,
  newChain,
  remainingFraction,
  tierOf,
  isLive,
  type ChainState,
} from '../../core/collapse/chain';
import { opposite, resolveShot, type GunKind, type TokenRef } from '../../core/collapse/targeting';
import { CONFIG } from '../../core/config';
import {
  hullFor,
  trailFor,
  DEFAULT_HULL,
  DEFAULT_TRAIL,
} from '../../core/cosmetics/cosmetics';
import { DropTracker, DROP_LABEL, type DropKind } from '../../core/drops';
import { creditsForRun, type RunStats } from '../../core/economy/economy';
import {
  newFlightState,
  stepFlight,
  withVelocity,
  type FlightState,
} from '../../core/flight/newtonian';
import { createRng } from '../../core/rng';
import { generateAsteroid, hitsCircle, maxRadius, type AsteroidShape } from '../../core/shapes/asteroid';
import { applyCrt } from '../../fx/applyCrt';
import { cameraPunch, clearHitStop, glowPulse, impact, shake, shockwave, timeScale } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { paintAsteroid } from '../AsteroidGfx';
import { announceDrop, carrierRing, effectsLine, pickupPod, DROP_CSS } from '../DropGfx';
import { drawFlame, drawHull } from '../ShipGfx';
import { KeyState, onActionKey, sceneBindings } from '../input/KeyState';
import type { KeyBindings } from '../../core/input/bindings';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** A drifting target. Kind decides which gun bites and which colour it wears. */
interface LiveToken {
  id: number;
  kind: GunKind;
  /** Shared currency between the two types: a fraction's percentage, or the percent. */
  percent: number;
  /** Present on fraction tokens only. */
  fraction: Fraction | null;
  unreduced: boolean;
  tier: number;
  container: Phaser.GameObjects.Container;
  /** The drawn silhouette; also the hitbox, via core/shapes/asteroid. */
  gfx: Phaser.GameObjects.Graphics;
  shape: AsteroidShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Widest point — broad-phase spacing at spawn. */
  reach: number;
  rotation: number;
  spinRate: number;
  /** Collapsing a pair with a payload leaves a pickup at the implosion point. */
  payload: DropKind | null;
  armedGlow: Phaser.Tweens.Tween | null;
  /** Idle throb that marks a token as solid; paused while it is phased. */
  dangerPulse: Phaser.Tweens.Tween | null;
}

interface Bolt {
  gfx: Phaser.GameObjects.Container;
  gun: GunKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  diesAt: number;
  /** Ghost segments dropped behind the bolt, oldest first. */
  trail: Phaser.GameObjects.Arc[];
  trailAt: number;
}

/** A pickup drifting in the field, taken by flying through it. */
interface CollapsePickup {
  container: Phaser.GameObjects.Container;
  kind: DropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  diesAt: number;
}

/** One depth plane of the parallax field. */
interface StarLayer {
  gfx: Phaser.GameObjects.Graphics;
  factor: number;
  offsetX: number;
  offsetY: number;
}

type Phase = 'wave' | 'over';

const GUN_COLOR: Record<GunKind, number> = {
  fraction: PALETTE.cyan,
  percent: PALETTE.magentaHot,
};
const GUN_CSS: Record<GunKind, string> = {
  fraction: CSS.cyan,
  percent: CSS.magentaHot,
};
const GUN_LABEL: Record<GunKind, string> = {
  fraction: 'FRACTION GUN',
  percent: 'PERCENT GUN',
};

/**
 * COLLAPSE — prototype.
 *
 * Two guns, two kinds of target. Shoot a token with its own gun to arm it,
 * then find its equivalent and shoot that with the other gun; the pair
 * annihilates.
 *
 * The loaded gun also decides what is solid: the ship phases through tokens of
 * its own colour and is killed by everything else. So a swap flips both halves
 * of the game at once — what you can shoot, and what can shoot back. Committing
 * to a colour means committing to a route through the field.
 *
 * Arming works from either side, so the mode drills the conversion in both
 * directions rather than only fraction→percent. The gun swap carries a fire
 * lockout: committing to a half of the field is the decision the mode is
 * actually about.
 *
 * Prototype scope: no skill model yet, so no ratings move and no milestones
 * unlock. It does earn credits and post to its own high score board, through
 * the same debrief every other mode uses.
 */
export class CollapseScene extends Phaser.Scene {
  private tokens: LiveToken[] = [];
  private bolts: Bolt[] = [];
  private phase: Phase = 'wave';
  private wave = 0;
  private hp = 0;
  private score = 0;
  private matched = 0;
  private misread = 0;
  private nextId = 1;
  /** Collapses still animating; a wave may not advance while any are in flight. */
  private resolving = 0;

  private gun: GunKind = 'fraction';
  private armedId: number | null = null;
  private armedUntil = 0;
  private fireReadyAt = 0;
  private lockedUntil = 0;

  private chain: ChainState = newChain();
  /** Highest chain reached this run — the debrief's "best streak" row. */
  private bestChain = 0;
  /**
   * Collapse has no session object yet, so the scene holds the drop clocks
   * directly. The tracker is core and pure, so this is still the same
   * implementation the other four modes run.
   */
  private drops = new DropTracker(1, CONFIG.drops, CONFIG.drops.pools.collapse);
  private pickups: CollapsePickup[] = [];
  /** Pairs still owed a carrier this wave. */
  private carriersLeft = 0;
  private nearMissed = new Set<number>();
  private saves!: SaveManager;

  private ship!: Phaser.GameObjects.Container;
  private flight!: FlightState;
  private hull!: Phaser.GameObjects.Graphics;
  private flame!: Phaser.GameObjects.Graphics;
  private engineTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private starLayers: StarLayer[] = [];
  private vignette!: Phaser.GameObjects.Rectangle;
  private invulnUntil = 0;

  private keys!: KeyState;
  private bindings!: KeyBindings;
  private hullDef = hullFor(DEFAULT_HULL);
  private trail = trailFor(DEFAULT_TRAIL);
  private shapeRng = createRng(1);

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private effectsText!: Phaser.GameObjects.Text;
  private gunText!: Phaser.GameObjects.Text;
  private gunIcon!: Phaser.GameObjects.Container;
  private heldText!: Phaser.GameObjects.Text;
  private armedBar!: Phaser.GameObjects.Rectangle;
  private chainText!: Phaser.GameObjects.Text;
  private chainBar!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Collapse');
  }

  create(): void {
    const { width, height } = this.scale;
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

    this.tokens = [];
    this.bolts = [];
    this.phase = 'wave';
    this.wave = 0;
    this.hp = CONFIG.collapse.startingHp;
    this.score = 0;
    this.matched = 0;
    this.misread = 0;
    this.nextId = 1;
    this.resolving = 0;
    this.gun = 'fraction';
    this.armedId = null;
    this.armedUntil = 0;
    this.fireReadyAt = 0;
    this.lockedUntil = 0;
    this.invulnUntil = 0;
    this.chain = newChain();
    this.bestChain = 0;
    this.drops = new DropTracker(Date.now() >>> 0, CONFIG.drops, CONFIG.drops.pools.collapse);
    this.pickups = [];
    this.nearMissed.clear();
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    this.hullDef = hullFor(this.saves.save.equipped.hull);
    this.trail = trailFor(this.saves.save.equipped.trail);
    this.starLayers = [];
    this.shapeRng = createRng(Date.now() >>> 0);
    this.flight = newFlightState(width / 2, height / 2);

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawStarfield();
    this.drawShip();
    this.createHud();

    this.bindings = sceneBindings(this);
    this.keys = new KeyState(this);
    this.input.keyboard?.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    onActionKey(this, this.bindings.launch, () => this.fire());
    onActionKey(this, this.bindings.switchWeapon, () => this.swapGun());
    onActionKey(this, this.bindings.pause, () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Collapse' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    const dt = (deltaMs / 1000) * timeScale(this);
    this.flyShip(dt);
    if (this.phase !== 'wave') return;

    this.drops.tick(dt);
    this.driftTokens(dt);
    this.driftPickups(dt);
    this.moveBolts(dt);
    this.expireArmed();
    this.checkNearMisses();
    this.checkShipHazards();
    if (this.phase !== 'wave') return;

    this.syncParallax();
    this.syncHud();
    if (this.tokens.length === 0 && this.resolving === 0) this.startWave();
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
    if (this.engineTrail) {
      // Emit from behind the hull, not from its centre.
      this.engineTrail.setPosition(
        this.flight.x - Math.cos(this.flight.facing) * 20,
        this.flight.y - Math.sin(this.flight.facing) * 20,
      );
      this.engineTrail.emitting = burning;
    }
  }

  private get shipX(): number {
    return this.flight.x;
  }

  private get shipY(): number {
    return this.flight.y;
  }

  private wrapX(x: number): number {
    return Phaser.Math.Wrap(x, 0, this.scale.width);
  }

  private wrapY(y: number): number {
    return Phaser.Math.Wrap(y, 0, this.scale.height);
  }

  private driftTokens(dt: number): void {
    // Freeze pins the field but leaves the spin running, so it reads as held
    // rather than as a dropped frame.
    const drift = this.drops.frozen ? 0 : dt;
    for (const t of this.tokens) {
      t.x = this.wrapX(t.x + t.vx * drift);
      t.y = this.wrapY(t.y + t.vy * drift);
      t.container.setPosition(t.x, t.y);
      // Only the rock turns; the fraction or percentage stays upright.
      t.rotation += t.spinRate * dt;
      t.gfx.setRotation(t.rotation);
    }
  }

  // --- drops ---

  private spawnPickup(x: number, y: number, kind: DropKind): void {
    const c = CONFIG.factor;
    const angle = Math.random() * Math.PI * 2;
    this.pickups.push({
      container: pickupPod(this, x, y, kind),
      kind,
      x,
      y,
      vx: Math.cos(angle) * c.pickupDrift,
      vy: Math.sin(angle) * c.pickupDrift,
      diesAt: this.time.now + c.pickupLifeSeconds * 1000,
    });
  }

  /** Pods are taken by flying through them — the same verb as everything else. */
  private driftPickups(dt: number): void {
    const reach = CONFIG.flight.shipRadius + CONFIG.factor.pickupRadius;
    for (const p of [...this.pickups]) {
      p.x = this.wrapX(p.x + p.vx * dt);
      p.y = this.wrapY(p.y + p.vy * dt);
      p.container.setPosition(p.x, p.y);

      if (Phaser.Math.Distance.Between(p.x, p.y, this.shipX, this.shipY) <= reach) {
        this.collectPickup(p);
      } else if (this.time.now >= p.diesAt) {
        this.removePickup(p);
      }
    }
  }

  private removePickup(p: CollapsePickup): void {
    this.pickups = this.pickups.filter((x) => x !== p);
    p.container.destroy();
  }

  private collectPickup(p: CollapsePickup): void {
    const { kind, x, y } = p;
    this.removePickup(p);
    if (kind === 'repair') this.hp = Math.min(CONFIG.collapse.startingHp, this.hp + 1);
    else this.drops.apply(kind);
    announceDrop(this, kind);
    if (kind === 'nuke') this.detonateNuke();
    this.popup(x, y, DROP_LABEL[kind], DROP_CSS[kind]);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
    this.updateHud();
  }

  /**
   * Blows every token off the board for score. No pair was read, so this pays
   * a flat rate and does not touch the chain — the ladder is for conversions.
   */
  private detonateNuke(): void {
    const c = CONFIG.collapse;
    for (const t of [...this.tokens]) {
      this.score += Math.round(c.matchBase * 0.35 * this.drops.multiplier);
      this.detonate(t.x, t.y, 1);
      t.armedGlow?.stop();
      t.dangerPulse?.stop();
      t.container.destroy();
    }
    this.tokens = [];
    this.armedId = null;
    shake(this, 360, 0.016);
    this.cameras.main.flash(320, 255, 59, 59);
  }

  // --- gunnery ---

  private swapGun(): void {
    if (this.phase !== 'wave') return;
    const c = CONFIG.collapse;
    // No spam-swapping: the lockout is already running from the last swap.
    if (this.time.now < this.lockedUntil) return;

    this.gun = opposite(this.gun);
    this.lockedUntil = this.time.now + c.swapLockoutSeconds * 1000;
    this.fireReadyAt = Math.max(this.fireReadyAt, this.lockedUntil);
    getAudio(this)?.play('reload');
    this.time.delayedCall(55, () => getAudio(this)?.play('phase'));
    this.paintGun(true);
    this.paintShip();
    this.repaintTokens();

    // A ring in the new colour snaps off the hull, so the swap is legible even
    // when the ship is a few pixels across in the corner of your eye.
    const ping = this.add
      .circle(this.shipX, this.shipY, 16)
      .setStrokeStyle(3, GUN_COLOR[this.gun], 1)
      .setDepth(6);
    this.tweens.add({
      targets: ping,
      radius: 46,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => ping.destroy(),
    });
  }

  private fire(): void {
    if (this.phase !== 'wave') return;
    const c = CONFIG.collapse;
    if (this.time.now < this.fireReadyAt || this.time.now < this.lockedUntil) return;
    this.fireReadyAt = this.time.now + c.fireCooldownSeconds * 1000;

    const angle = this.flight.facing;
    const nose = 22;
    const x = this.shipX + Math.cos(angle) * nose;
    const y = this.shipY + Math.sin(angle) * nose;
    // Inherit ship velocity so shots stay honest under Newtonian drift.
    const vx = Math.cos(angle) * c.projectileSpeed + this.flight.vx;
    const vy = Math.sin(angle) * c.projectileSpeed + this.flight.vy;

    this.bolts.push({
      gfx: this.makeBolt(this.gun, x, y, angle),
      gun: this.gun,
      x,
      y,
      vx,
      vy,
      diesAt: this.time.now + c.projectileLifeSeconds * 1000,
      trail: [],
      trailAt: 0,
    });
    getAudio(this)?.play(this.gun === 'fraction' ? 'gunFraction' : 'gunPercent');
    this.muzzleFlash(x, y, angle, GUN_COLOR[this.gun]);

    // Recoil. Small, but it couples the gun to the flight model — sustained
    // fire actually pushes you off your line, which is the whole reason a
    // Newtonian shooter feels different from a twin-stick one.
    this.flight = withVelocity(
      this.flight,
      this.flight.vx - Math.cos(angle) * c.recoilImpulse,
      this.flight.vy - Math.sin(angle) * c.recoilImpulse,
    );
    this.ship.setScale(1.14, 0.88);
    this.tweens.add({ targets: this.ship, scaleX: 1, scaleY: 1, duration: 110, ease: 'Quad.easeOut' });
  }

  /**
   * The two bolts must be tellable apart at a glance and mid-panic. The
   * fraction bolt is a cyan slash — a division bar in flight. The percent bolt
   * is a magenta ring, the ∘ of the % sign.
   */
  private makeBolt(gun: GunKind, x: number, y: number, angle: number): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (gun === 'fraction') {
      parts.push(
        this.add.rectangle(0, 0, 26, 4, PALETTE.cyan),
        this.add.rectangle(11, 0, 8, 8, PALETTE.white),
        this.add.rectangle(-13, 0, 10, 2, PALETTE.cyan, 0.5),
      );
    } else {
      parts.push(
        this.add.circle(0, 0, 8).setStrokeStyle(3, PALETTE.magentaHot, 1),
        this.add.circle(0, 0, 2.5, PALETTE.white, 1),
        this.add.circle(-13, 0, 3, PALETTE.magenta, 0.5),
      );
    }
    return this.add.container(x, y, parts).setRotation(angle).setDepth(4);
  }

  private moveBolts(dt: number): void {
    for (const b of [...this.bolts]) {
      const prevX = b.x;
      const prevY = b.y;
      b.x = this.wrapX(b.x + b.vx * dt);
      b.y = this.wrapY(b.y + b.vy * dt);
      b.gfx.setPosition(b.x, b.y);
      this.dropTrail(b, prevX, prevY);

      if (this.time.now > b.diesAt) {
        this.killBolt(b);
        continue;
      }
      const hit = this.tokens.find((t) =>
        hitsCircle(t.shape, t.x, t.y, t.rotation, b.x, b.y, CONFIG.collapse.projectileRadius),
      );
      if (hit) {
        const normal = Math.atan2(b.y - hit.y, b.x - hit.x);
        this.impactSparks(b.x, b.y, normal, GUN_COLOR[b.gun]);
        getAudio(this)?.play('boltHit');
        this.killBolt(b);
        this.resolveHit(hit, b.gun);
      }
    }
  }

  /**
   * Fading ghosts behind a bolt. Cheap motion blur — at these speeds a single
   * sprite reads as a teleporting dot, and the streak is what makes it a shot.
   */
  private dropTrail(b: Bolt, x: number, y: number): void {
    if (this.time.now - b.trailAt < 16) return;
    b.trailAt = this.time.now;
    const ghost = this.add
      .circle(x, y, this.time.now % 2 === 0 ? 4 : 3, GUN_COLOR[b.gun], 0.5)
      .setDepth(3);
    b.trail.push(ghost);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: 0.2,
      duration: 220,
      onComplete: () => {
        ghost.destroy();
        b.trail = b.trail.filter((g) => g !== ghost);
      },
    });
  }

  private killBolt(b: Bolt): void {
    this.bolts = this.bolts.filter((x) => x !== b);
    b.gfx.destroy();
    // Trail ghosts own their own tweens and fade out on their own.
  }

  // --- hit resolution ---

  private resolveHit(target: LiveToken, gun: GunKind): void {
    const held = this.armedToken();
    const outcome = resolveShot(held ? this.refOf(held) : null, this.refOf(target), gun);

    switch (outcome.result) {
      case 'wrongGun':
        this.wrongGunFeedback(target, gun);
        break;
      case 'armed':
      case 'rearmed':
        if (held && held.id !== target.id) this.setArmedVisual(held, false);
        this.armedId = target.id;
        this.armedUntil = this.time.now + CONFIG.collapse.armedSeconds * 1000;
        this.setArmedVisual(target, true);
        getAudio(this)?.play('prime');
        break;
      case 'collapse':
        if (held) this.collapsePair(held, target);
        break;
      case 'mismatch':
        this.mismatchFeedback(target, held);
        break;
    }
    this.syncHud();
  }

  private refOf(t: LiveToken): TokenRef {
    return { id: t.id, kind: t.kind, percent: t.percent };
  }

  private armedToken(): LiveToken | null {
    return this.tokens.find((t) => t.id === this.armedId) ?? null;
  }

  /** Wrong tool, not wrong maths — a dull thud and a nudge, no penalty. */
  private wrongGunFeedback(target: LiveToken, gun: GunKind): void {
    this.popup(target.x, target.y - target.radius, `${GUN_LABEL[opposite(gun)]}`, CSS.cyanDim);
    this.tweens.add({
      targets: target.container,
      scale: 0.92,
      duration: 70,
      yoyo: true,
    });
    getAudio(this)?.play('block');
  }

  /** Right gun, wrong value: the actual maths error. Costs the charge. */
  private mismatchFeedback(target: LiveToken, held: LiveToken | null): void {
    const c = CONFIG.collapse;
    this.misread += 1;
    this.chain = breakChain();
    this.lockedUntil = this.time.now + c.mismatchLockoutSeconds * 1000;
    if (held) this.setArmedVisual(held, false);
    this.armedId = null;

    paintAsteroid(target.gfx, target.shape, {
      stroke: PALETTE.red,
      strokeWidth: 5,
      strokeAlpha: 1,
      fill: PALETTE.red,
      fillAlpha: 0.3,
      facets: true,
    });
    this.tweens.add({
      targets: target.container,
      alpha: 0.35,
      duration: 80,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.paintToken(target),
    });
    this.popup(target.x, target.y, 'NOT EQUAL', CSS.red);
    shake(this, 120, 0.006);
    getAudio(this)?.play('error');
  }

  /**
   * The payoff. Both halves are yanked off their drift into the midpoint,
   * wound up as they go, and annihilate — a beat of inrush, then detonation.
   */
  private collapsePair(a: LiveToken, b: LiveToken): void {
    const c = CONFIG.collapse;
    const { juice } = CONFIG;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const fractionHalf = a.kind === 'fraction' ? a : b;

    const step = advance(this.chain, this.time.now, c.chain);
    this.chain = step.state;
    this.bestChain = Math.max(this.bestChain, step.state.count);
    const base = c.matchBase + (a.tier - 1) * c.tierBonus + (fractionHalf.unreduced ? c.unreducedBonus : 0);
    const points = Math.round(base * step.multiplier * this.drops.multiplier);
    this.score += points;
    this.matched += 1;
    this.armedId = null;
    this.resolving += 1;

    // Off the board immediately: no shooting them again, no flying into them.
    this.tokens = this.tokens.filter((t) => t !== a && t !== b);
    a.armedGlow?.stop();
    b.armedGlow?.stop();

    // The tether makes the pair read as one object before it becomes none.
    const link = this.add.graphics().setDepth(6);
    link.lineStyle(3, PALETTE.yellow, 0.9);
    link.lineBetween(a.x, a.y, b.x, b.y);
    this.tweens.add({ targets: link, alpha: 0, duration: 260, onComplete: () => link.destroy() });

    getAudio(this)?.play('implode');
    for (const half of [a, b]) {
      this.tweens.add({
        targets: half.container,
        x,
        y,
        scale: 0.35,
        angle: half === a ? 220 : -220,
        duration: 260,
        ease: 'Back.easeIn',
        onComplete: () => half.container.destroy(),
      });
    }

    const payload = a.payload ?? b.payload;
    this.time.delayedCall(265, () => {
      this.detonate(x, y, step.tier);
      // The pod arrives out of the implosion, so the reward is visibly the
      // conversion's and not a separate event.
      if (payload) this.spawnPickup(x, y, payload);
      const suffix =
        fractionHalf.unreduced && fractionHalf.fraction
          ? `   ${formatFraction(fractionHalf.fraction)} = ${formatFraction(reduce(fractionHalf.fraction))}`
          : '';
      this.popup(x, y, `+${points}${step.multiplier > 1 ? `  x${step.multiplier}` : ''}${suffix}`, CSS.yellow);

      // Feedback scales with the chain: a first collapse should not feel the
      // same as a fifth, or the ladder means nothing.
      const heat = Math.min(1, step.tier / 4);
      impact(this, {
        shakeMs: juice.bossDownShakeMs,
        shakeIntensity: juice.bossDownShakeIntensity * (1 + heat * 0.6),
        glow: juice.glowPulseHeavy * (1 + heat * 0.5),
        hitStopMs: juice.heavyHitStopMs * (1 + heat * 0.4),
      });
      cameraPunch(this, 0.035 + heat * 0.05, 420);
      if (step.tierUp) {
        getAudio(this)?.play('comboUp', { pitch: 1 + step.tier * 0.14 });
        this.banner(`CHAIN x${step.multiplier}`, CSS.yellow);
      }
      this.resolving -= 1;
      this.updateHud();
    });
  }

  // --- near misses ---

  /**
   * Threading a solid token pays a small bonus. It rewards flying close instead
   * of orbiting the edges, which is the difference between a field you navigate
   * and a field you avoid.
   */
  private checkNearMisses(): void {
    const c = CONFIG.collapse;
    const grazeAt = CONFIG.flight.shipRadius + c.nearMissRadius;
    for (const t of this.tokens) {
      if (this.isPhased(t)) continue;
      const grazing = hitsCircle(t.shape, t.x, t.y, t.rotation, this.shipX, this.shipY, grazeAt);
      if (!grazing) {
        this.nearMissed.delete(t.id);
        continue;
      }
      if (this.nearMissed.has(t.id)) continue;
      this.nearMissed.add(t.id);
      // Contact is handled elsewhere; this only fires for a genuine graze.
      if (hitsCircle(t.shape, t.x, t.y, t.rotation, this.shipX, this.shipY, CONFIG.flight.shipRadius))
        continue;
      this.score += c.nearMissBonus;
      this.popup(this.shipX, this.shipY - 26, `+${c.nearMissBonus} CLOSE`, CSS.cyanDim);
      getAudio(this)?.play('nearMiss');
      this.updateHud();
    }
  }

  // --- hazards ---

  private expireArmed(): void {
    if (this.armedId === null || this.time.now < this.armedUntil) return;
    const held = this.armedToken();
    if (held) this.setArmedVisual(held, false);
    this.armedId = null;
    getAudio(this)?.play('ui', { pitch: 0.6 });
  }

  private checkShipHazards(): void {
    if (this.time.now < this.invulnUntil) return;
    const c = CONFIG.collapse;
    for (const t of this.tokens) {
      // The loaded gun decides what is solid: you slip through your own colour
      // and everything else is a wall. Swapping to shoot therefore also swaps
      // which half of the board can kill you.
      if (this.isPhased(t)) continue;
      if (!hitsCircle(t.shape, t.x, t.y, t.rotation, this.shipX, this.shipY, CONFIG.flight.shipRadius))
        continue;

      if (!this.drops.shielded) this.hp -= 1;
      this.invulnUntil = this.time.now + c.invulnSeconds * 1000;
      this.chain = breakChain();
      getAudio(this)?.play('playerHit');
      this.cameras.main.flash(200, 255, 40, 40);
      this.vignette.setAlpha(0.5);
      this.tweens.add({ targets: this.vignette, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
      impact(this, {
        shakeMs: CONFIG.juice.landShakeMs,
        shakeIntensity: CONFIG.juice.landShakeIntensity,
        glow: CONFIG.juice.glowPulseHeavy,
        hitStopMs: CONFIG.juice.heavyHitStopMs,
      });

      const angle = Math.atan2(this.shipY - t.y, this.shipX - t.x);
      this.flight = withVelocity(
        this.flight,
        Math.cos(angle) * c.collisionKnockback,
        Math.sin(angle) * c.collisionKnockback,
      );

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

    this.carriersLeft = CONFIG.drops.carriersPerWave;
    for (const pair of plan) {
      this.spawnToken('percent', pair.percent, null, maxTier);
      this.spawnToken('fraction', toPercent(pair.fraction), pair.fraction, maxTier);
    }

    this.waveText.setText(`WAVE ${this.wave}`);
    if (this.wave > 1) getAudio(this)?.play('waveClear');
    this.banner(`WAVE ${this.wave}`, CSS.magenta);
    getAudio(this)?.play('wave');
    this.updateHud();
  }

  private safeSpawn(radius: number): { x: number; y: number } {
    const { width, height } = this.scale;
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(radius + 20, width - radius - 20);
      const y = Phaser.Math.Between(radius + 70, height - radius - 80);
      if (Phaser.Math.Distance.Between(x, y, this.shipX, this.shipY) < 190) continue;
      const clear = this.tokens.every(
        (t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) > radius * 1.3 + t.reach + 34,
      );
      if (clear) return { x, y };
    }
    return { x: radius + 30, y: radius + 80 };
  }

  private spawnToken(kind: GunKind, percent: number, fraction: Fraction | null, tier: number): void {
    const c = CONFIG.collapse;
    const radius = kind === 'fraction' ? c.fractionRadius : c.percentRadius;
    const { x, y } = this.safeSpawn(radius);
    const speed = Phaser.Math.Between(c.slowestDrift, c.fastestDrift);
    const angle = Math.random() * Math.PI * 2;

    const isFraction = kind === 'fraction';
    const a = CONFIG.asteroid;
    // Both kinds are equally solid and equally lethal, so both are drawn with
    // the same weight. Type is carried by hue and content, never by how
    // dangerous a token looks.
    const shape = generateAsteroid(this.shapeRng, radius, a);
    const gfx = this.add.graphics();
    paintAsteroid(gfx, shape, {
      stroke: isFraction ? PALETTE.cyan : PALETTE.magenta,
      strokeWidth: 3,
      strokeAlpha: 0.95,
      fill: PALETTE.black,
      fillAlpha: 0.85,
      facets: true,
    });
    const label = this.add
      .text(0, 0, isFraction && fraction ? formatFraction(fraction) : formatPercent(percent), {
        fontFamily: FONT,
        fontSize: isFraction ? '26px' : '24px',
        fontStyle: 'bold',
        color: isFraction ? CSS.cyan : CSS.magentaHot,
        stroke: CSS.black,
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    // Only the fraction half of a pair is ever marked, so the ring never
    // double-advertises the same reward.
    const payload =
      kind === 'fraction' && this.carriersLeft > 0 ? this.drops.roll(this.hp) : null;
    const parts: Phaser.GameObjects.GameObject[] = payload
      ? [carrierRing(this, radius + 12), gfx, label]
      : [gfx, label];
    if (payload) this.carriersLeft -= 1;
    const container = this.add.container(x, y, parts).setDepth(2);

    const dangerPulse = this.tweens.add({
      targets: gfx,
      scale: 1.08,
      duration: isFraction ? 820 : 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const spinDeg =
      Phaser.Math.Between(a.minSpinDeg, a.maxSpinDeg) * (this.shapeRng.chance(0.5) ? 1 : -1);

    const reduced = fraction ? reduce(fraction) : null;
    this.tokens.push({
      id: this.nextId++,
      kind,
      percent,
      fraction,
      unreduced: !!(fraction && reduced && reduced.num !== fraction.num),
      tier,
      container,
      gfx,
      shape,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      reach: maxRadius(shape),
      rotation: this.shapeRng.next() * Math.PI * 2,
      spinRate: Phaser.Math.DegToRad(spinDeg),
      payload,
      armedGlow: null,
      dangerPulse,
    });
    this.paintToken(this.tokens[this.tokens.length - 1]!);
  }

  /** A token passes through the ship when it shares the loaded gun's kind. */
  private isPhased(t: LiveToken): boolean {
    return t.kind === this.gun;
  }

  /**
   * Repaint one token for the current loadout. Solid tokens throb at full
   * strength; phased ones go still and translucent. Stillness is the tell —
   * "it is moving at me" and "it will hurt me" should be the same signal.
   */
  private paintToken(t: LiveToken, armed = t.id === this.armedId): void {
    const phased = this.isPhased(t);
    const hue = t.kind === 'fraction' ? PALETTE.cyan : PALETTE.magenta;

    paintAsteroid(t.gfx, t.shape, {
      stroke: armed ? PALETTE.yellow : hue,
      strokeWidth: armed ? 5 : 3,
      strokeAlpha: armed ? 1 : 0.95,
      fill: PALETTE.black,
      fillAlpha: 0.85,
      facets: true,
    });

    // Tokens stay fully opaque whatever is loaded — the board should read the
    // same at all times. Which half is solid is carried by the throb below and
    // by the hull colour, not by fading half the field out.
    t.container.setAlpha(1);

    // Solid tokens throb; phased ones hold still. An armed token has its own
    // pulse, so the danger throb would only fight it.
    if (phased || armed) {
      t.dangerPulse?.pause();
      t.gfx.setScale(1);
    } else {
      t.dangerPulse?.resume();
    }
  }

  private repaintTokens(): void {
    for (const t of this.tokens) this.paintToken(t);
  }

  /**
   * `armed` is passed explicitly rather than read from `armedId`, because
   * disarming happens before the id moves — inferring it here would repaint the
   * outgoing token as though it were still held.
   */
  private setArmedVisual(t: LiveToken, armed: boolean): void {
    t.armedGlow?.stop();
    t.armedGlow = null;
    t.container.setScale(1);
    this.paintToken(t, armed);
    if (!armed) return;
    t.armedGlow = this.tweens.add({
      targets: t.container,
      scale: 1.12,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // --- fx ---

  private muzzleFlash(x: number, y: number, angle: number, tint: number): void {
    // Core bloom.
    const flash = this.add.circle(x, y, 14, tint, 0.85).setDepth(6);
    this.tweens.add({
      targets: flash,
      scale: 0.1,
      alpha: 0,
      duration: 130,
      onComplete: () => flash.destroy(),
    });
    // White-hot centre, gone almost instantly — this is the bit the eye reads
    // as brightness rather than as a coloured shape.
    const hot = this.add.circle(x, y, 6, PALETTE.white, 1).setDepth(7);
    this.tweens.add({
      targets: hot,
      scale: 0.2,
      alpha: 0,
      duration: 70,
      onComplete: () => hot.destroy(),
    });
    // Directional spit of sparks along the barrel line.
    const sparks = this.add.particles(x, y, 'particle', {
      speed: { min: 120, max: 340 },
      angle: { min: Phaser.Math.RadToDeg(angle) - 16, max: Phaser.Math.RadToDeg(angle) + 16 },
      lifespan: { min: 90, max: 210 },
      scale: { start: 0.9, end: 0 },
      tint,
      quantity: 6,
      emitting: false,
    });
    sparks.explode(6);
    this.time.delayedCall(300, () => sparks.destroy());
  }

  /** Spark spray back along the impact normal when a bolt bites. */
  private impactSparks(x: number, y: number, angle: number, tint: number): void {
    const sparks = this.add.particles(x, y, 'particle', {
      speed: { min: 90, max: 300 },
      angle: { min: Phaser.Math.RadToDeg(angle) - 55, max: Phaser.Math.RadToDeg(angle) + 55 },
      lifespan: { min: 120, max: 320 },
      scale: { start: 1.1, end: 0 },
      tint: [tint, PALETTE.white],
      quantity: 10,
      emitting: false,
    });
    sparks.explode(10);
    this.time.delayedCall(420, () => sparks.destroy());
    const pop = this.add.circle(x, y, 9, PALETTE.white, 0.9).setDepth(7);
    this.tweens.add({
      targets: pop,
      scale: 2.2,
      alpha: 0,
      duration: 160,
      onComplete: () => pop.destroy(),
    });
  }

  /** Inrush, white core, then a double shockwave and debris. */
  private detonate(x: number, y: number, tier = 0): void {
    const heat = Math.min(1, tier / 4);
    const core = this.add.circle(x, y, 10, PALETTE.white, 1).setDepth(9);
    this.tweens.add({
      targets: core,
      scale: 9 + heat * 5,
      alpha: 0,
      duration: 380,
      ease: 'Expo.easeOut',
      onComplete: () => core.destroy(),
    });

    shockwave(this, x, y, PALETTE.yellow);
    this.time.delayedCall(90, () => shockwave(this, x, y, PALETTE.magenta));
    if (tier >= 2) this.time.delayedCall(180, () => shockwave(this, x, y, PALETTE.cyan));

    const burst = this.add.particles(x, y, 'particle', {
      speed: { min: 140, max: 520 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 760 },
      scale: { start: 2, end: 0 },
      tint: [PALETTE.white, PALETTE.yellow, PALETTE.magentaHot, PALETTE.cyan],
      quantity: 60,
      emitting: false,
    });
    const count = Math.round(60 + heat * 50);
    burst.explode(count);
    this.time.delayedCall(1100, () => burst.destroy());

    // Slow, heavy embers under the fast burst — two speeds read as debris
    // rather than as one uniform puff.
    const embers = this.add.particles(x, y, 'particle', {
      speed: { min: 20, max: 110 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 700, max: 1500 },
      scale: { start: 1.1, end: 0 },
      tint: [PALETTE.magenta, PALETTE.yellow],
      alpha: { start: 0.9, end: 0 },
      quantity: 18,
      emitting: false,
    });
    embers.explode(18);
    this.time.delayedCall(1700, () => embers.destroy());

    this.cameras.main.flash(160, 255, 230, 120);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
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

  /**
   * Three depth planes that slide against the ship's motion. Without parallax
   * a wrapping field gives no sense of travel at all — you look stationary
   * while the world teleports around you.
   */
  private drawStarfield(): void {
    const { width, height } = this.scale;
    const planes: { count: number; factor: number; size: number; tint: number; alpha: number }[] = [
      { count: 70, factor: 0.06, size: 1, tint: PALETTE.deepPurple, alpha: 0.5 },
      { count: 45, factor: 0.14, size: 2, tint: PALETTE.purple, alpha: 0.7 },
      { count: 22, factor: 0.26, size: 2, tint: PALETTE.magenta, alpha: 0.9 },
    ];
    for (const plane of planes) {
      const gfx = this.add.graphics().setDepth(0);
      gfx.fillStyle(plane.tint, plane.alpha);
      for (let i = 0; i < plane.count; i++) {
        gfx.fillRect(
          Phaser.Math.Between(0, width),
          Phaser.Math.Between(0, height),
          plane.size,
          plane.size,
        );
      }
      this.starLayers.push({ gfx, factor: plane.factor, offsetX: 0, offsetY: 0 });
    }
  }

  /** Drift each plane opposite the ship, wrapping so it never runs out. */
  private syncParallax(): void {
    const { width, height } = this.scale;
    for (const layer of this.starLayers) {
      layer.offsetX = Phaser.Math.Wrap(layer.offsetX - this.flight.vx * layer.factor * 0.016, 0, width);
      layer.offsetY = Phaser.Math.Wrap(layer.offsetY - this.flight.vy * layer.factor * 0.016, 0, height);
      layer.gfx.setPosition(layer.offsetX - width, layer.offsetY - height);
    }
  }

  private drawShip(): void {
    this.hull = this.add.graphics();

    // Exhaust behind the hull. With rotate-and-thrust the nose no longer
    // follows the velocity, so the player needs to see where thrust is going.
    // The burn wears the equipped trail colour; the hull cannot, because it is
    // already saying which gun is loaded.
    this.flame = this.add.graphics();
    drawFlame(this.flame, this.trail, CONFIG.flight.shipRadius);
    this.flame.setVisible(false);

    this.ship = this.add.container(this.shipX, this.shipY, [this.flame, this.hull]).setDepth(5);
    this.paintShip();

    // Exhaust particles, emitted only while thrusting (toggled in flyShip).
    this.engineTrail = this.add.particles(0, 0, 'particle', {
      speed: { min: 20, max: 90 },
      lifespan: { min: 180, max: 420 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.75, end: 0 },
      tint: [this.trail.flame, this.trail.spark],
      frequency: 22,
      quantity: 1,
      emitting: false,
    });
    this.engineTrail.setDepth(4);

    // Full-screen red wash for damage. Kept at zero alpha and flashed, rather
    // than created per hit, so a chain of hits cannot stack overlays.
    const { width, height } = this.scale;
    this.vignette = this.add
      .rectangle(0, 0, width, height, PALETTE.red, 0)
      .setOrigin(0)
      .setDepth(15);
  }

  /**
   * The hull wears the loaded gun's colour. The weapon readout is in the
   * corner, but the ship is where the eye already is — carrying the state on
   * the thing you are looking at beats making you glance away mid-fight.
   */
  private paintShip(): void {
    drawHull(this.hull, this.hullDef, GUN_COLOR[this.gun], CONFIG.flight.shipRadius);
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
    this.effectsText = this.add
      .text(width / 2, 50, '', { fontFamily: FONT, fontSize: '15px', color: CSS.cyan })
      .setOrigin(0.5, 0)
      .setDepth(hud);

    // Armed weapon, bottom-left, with a sample of its own round beside it —
    // the bolt in the air and the icon in the HUD must be the same object.
    this.gunIcon = this.add.container(38, height - 62).setDepth(hud);
    this.gunText = this.add
      .text(64, height - 62, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0, 0.5)
      .setDepth(hud);

    this.heldText = this.add
      .text(width / 2, height - 78, '', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5)
      .setDepth(hud);
    this.armedBar = this.add
      .rectangle(width / 2, height - 60, 180, 5, PALETTE.yellow)
      .setOrigin(0.5, 0)
      .setDepth(hud)
      .setVisible(false);

    this.chainText = this.add
      .text(width - 24, 50, '', { ...style, color: CSS.yellow })
      .setOrigin(1, 0)
      .setDepth(hud);
    this.chainBar = this.add
      .rectangle(width - 24, 80, 150, 6, PALETTE.yellow)
      .setOrigin(1, 0)
      .setDepth(hud)
      .setVisible(false);

    this.add
      .text(
        width / 2,
        height - 26,
        'W THRUST · A/D TURN  ·  SPACE FIRE  ·  SHIFT SWAP GUN  ·  YOU PHASE THROUGH YOUR OWN COLOUR  ·  R RETRY',
        { fontFamily: FONT, fontSize: '14px', color: CSS.cyanDim },
      )
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setDepth(hud);

    this.paintGun(false);
    this.updateHud();
  }

  /** Redraw the weapon readout; `swapped` plays the rack animation with it. */
  private paintGun(swapped: boolean): void {
    this.gunIcon.removeAll(true);
    const tint = GUN_COLOR[this.gun];
    if (this.gun === 'fraction') {
      this.gunIcon.add(this.add.rectangle(0, 0, 26, 4, tint));
      this.gunIcon.add(this.add.rectangle(11, 0, 8, 8, PALETTE.white));
    } else {
      this.gunIcon.add(this.add.circle(0, 0, 8).setStrokeStyle(3, tint, 1));
      this.gunIcon.add(this.add.circle(0, 0, 2.5, PALETTE.white, 1));
    }
    this.gunText.setText(GUN_LABEL[this.gun]).setColor(GUN_CSS[this.gun]);

    if (!swapped) return;
    this.gunText.setScale(1.18);
    this.tweens.add({ targets: this.gunText, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.gunIcon.setAlpha(0.2);
    this.tweens.add({ targets: this.gunIcon, alpha: 1, duration: 260 });
  }

  private updateHud(): void {
    this.hpText.setText(`HP ${'█'.repeat(Math.max(0, this.hp))}`);
    this.scoreText.setText(`${this.score}`);
  }

  private syncHud(): void {
    this.syncChain();
    this.effectsText.setText(effectsLine(this.drops.snapshot));
    const held = this.armedToken();
    if (!held) {
      this.heldText.setText('');
      this.armedBar.setVisible(false);
      return;
    }
    const label = held.fraction ? formatFraction(held.fraction) : formatPercent(held.percent);
    this.heldText.setText(`HOLDING  ${label}  —  FIND ITS MATCH`);
    const left = Phaser.Math.Clamp(
      (this.armedUntil - this.time.now) / (CONFIG.collapse.armedSeconds * 1000),
      0,
      1,
    );
    this.armedBar.setVisible(true).setSize(Math.max(1, 180 * left), 5);
  }

  /** Chain count, multiplier, and the window draining underneath them. */
  private syncChain(): void {
    const cfg = CONFIG.collapse.chain;
    const live = isLive(this.chain, this.time.now);
    if (!live) {
      this.chainText.setText('');
      this.chainBar.setVisible(false);
      return;
    }
    const mult = multiplierOf(this.chain.count, cfg);
    const tier = tierOf(this.chain.count, cfg);
    this.chainText.setText(`x${mult}   ${this.chain.count}`);
    this.chainText.setColor(tier >= 3 ? CSS.magentaHot : CSS.yellow);
    this.chainBar
      .setVisible(true)
      .setFillStyle(tier >= 3 ? PALETTE.magentaHot : PALETTE.yellow)
      .setSize(Math.max(1, 150 * remainingFraction(this.chain, this.time.now, cfg)), 6);
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    clearHitStop(this);
    // The update loop stops driving the thruster from here, so cut it by hand.
    getAudio(this)?.stopAllLoops();

    // Collapse has no skill model of its own yet, but it earns and it ranks:
    // the run goes through the shared debrief so it reaches the board like
    // every other mode.
    const stats: RunStats = {
      score: this.score,
      wavesCleared: Math.max(0, this.wave - 1),
      kills: this.matched,
      misses: this.misread,
      bestStreak: this.bestChain,
    };
    const credits = creditsForRun(stats, CONFIG.economy);
    const save = this.saves.save;
    save.totalWaves += this.wave;
    save.credits += credits;
    save.bestScore = Math.max(save.bestScore, this.score);
    this.saves.persist();

    getAudio(this)?.play('gameover');
    this.cameras.main.flash(400, 255, 45, 149);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
    this.time.delayedCall(900, () => {
      this.scene.start('Debrief', {
        stats,
        credits,
        mode: 'Collapse',
        title: 'COLLAPSE FAILED',
        killsLabel: 'PAIRED',
        streakLabel: 'BEST CHAIN',
      });
    });
  }
}
