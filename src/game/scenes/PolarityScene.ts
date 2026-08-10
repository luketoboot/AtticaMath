import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { linkProgress } from '../../core/polarity/chain';
import { newDriveState, stepDrive, type DriveState } from '../../core/polarity/drive';
import {
  PolaritySession,
  type LiveBullet,
  type LiveCarrier,
  type Polarity,
  type ShotOutcome,
} from '../../core/polarity/session';
import { CLASS_COLOR, drawBullet, drawCarrier } from '../PolarityEnemyGfx';
import { GUNS, boltAngles, bounceLine, killLine, type GunKind } from '../../core/polarity/guns';
import type { RunStats } from '../../core/economy/economy';
import { newMilestones } from '../../core/skills/milestones';
import { runDeltas } from '../../core/skills/report';
import type { SkillTable } from '../../core/skills/rating';
import { applyCrt } from '../../fx/applyCrt';
import { cameraPunch, clearHitStop, glowPulse, goTo, impact, shake } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import {
  drawGunGlyph,
  drawHitCore,
  drawMuzzle,
  drawPolarityEngine,
  drawPolarityHull,
  drawPolarityRing,
} from '../PolarityShipGfx';
import { KeyState, onActionKey, sceneBindings } from '../input/KeyState';
import { FlightPad } from '../../ui/FlightPad';
import { isTouchDevice } from '../../ui/Numpad';
import type { KeyBindings } from '../../core/input/bindings';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** Anything on screen wearing a number. The session owns what it is. */
interface Drawn {
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  dead: boolean;
}

interface DrawnCarrier extends Drawn {
  carrier: LiveCarrier;
  pips: Phaser.GameObjects.Graphics;
  /** When this carrier last said its remainder aloud, so it says it once. */
  scoldedAt: number;
}

interface DrawnBullet extends Drawn {
  bullet: LiveBullet;
  vx: number;
  vy: number;
  closest: number;
  age: number;
}

interface Shot {
  gfx: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierces: boolean;
  homes: boolean;
  /** Carriers already bitten, so a piercing bolt does not chew one twice. */
  hit: Set<number>;
  dead: boolean;
}

/** A weapon pod, dropped by a broken carrier. */
interface DrawnPod {
  gun: GunKind;
  container: Phaser.GameObjects.Container;
  x: number;
  y: number;
  life: number;
  dead: boolean;
}

interface StarLayer {
  gfx: Phaser.GameObjects.Graphics;
  factor: number;
  offset: number;
}

const POLARITY_COLOR: Record<Polarity, number> = { a: PALETTE.cyan, b: PALETTE.magentaHot };
const POLARITY_CSS: Record<Polarity, string> = { a: CSS.cyan, b: CSS.magentaHot };

type Phase = 'wave' | 'breather' | 'over';

/**
 * POLARITY.
 *
 * Ikaruga's two channels, with a divisor pair standing in for black and white.
 *
 * Carriers come down wearing numbers and you can only break one by wearing a
 * divisor of it — the wrong polarity rings off. They shoot back, and a bullet
 * wearing a number your divisor divides is *absorbed*, charging the meter,
 * while anything else takes a hull point. Three kills of one colour make a
 * chain link and each link pays double the last.
 *
 * The tension is the whole design: **a carrier fires the colour it is not**.
 * Wearing ×3 lets you break the ×3 carriers, and those carriers are throwing ×4
 * bullets that will kill you while you wear it. The colour that lets you attack
 * is the colour that leaves you exposed, and flipping to eat the fire is the
 * thing that stops you killing anything.
 *
 * Numbers divisible by *both* are the mode's one idea. A bridge carrier can be
 * broken in either state and finishes a link of either colour; a bridge bullet
 * is safe whichever way you are facing. Common multiples become the lane
 * through the field, and the player flies through an LCM rather than computing
 * one. Wilds — divisible by neither — are safe in no state at all and exist to
 * keep a hand on the movement keys.
 *
 * Class is carried by shape as well as by colour. About one man in twelve
 * cannot separate these hues at speed, and a mode whose whole content is "which
 * kind is this" cannot put that on hue alone.
 */
export class PolarityScene extends Phaser.Scene {
  private session!: PolaritySession;
  private saves!: SaveManager;
  private skillsAtLaunch: SkillTable = {};

  private carriers: DrawnCarrier[] = [];
  private bullets: DrawnBullet[] = [];
  private shots: Shot[] = [];
  private pods: DrawnPod[] = [];
  private phase: Phase = 'wave';
  private waveTime = 0;
  private nextShotAt = 0;

  private ship!: Phaser.GameObjects.Container;
  private hull!: Phaser.GameObjects.Graphics;
  private aura!: Phaser.GameObjects.Graphics;
  private engine!: Phaser.GameObjects.Graphics;
  private core!: Phaser.GameObjects.Graphics;
  private muzzle!: Phaser.GameObjects.Graphics;
  private wornText!: Phaser.GameObjects.Text;
  /** Seconds since the last shot, for the muzzle flash. */
  private sinceShot = 99;
  /** Fading copies of the hull, dropped while moving. */
  private trail: { gfx: Phaser.GameObjects.Graphics; life: number }[] = [];
  private trailAt = 0;
  /** Smoothed roll, −1..1, eased toward the horizontal input. */
  private bank = 0;
  private drive: DriveState = { x: 0, y: 0, vx: 0, vy: 0 };
  private starLayers: StarLayer[] = [];
  private invulnUntil = 0;
  /** Holding focus: slow, precise, and the hitbox shown large. */
  private focused = false;

  private keys!: KeyState;
  private bindings!: KeyBindings;
  private pad?: FlightPad;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private pairPanel!: Phaser.GameObjects.Graphics;
  private wornBig!: Phaser.GameObjects.Text;
  private otherBig!: Phaser.GameObjects.Text;
  private chainText!: Phaser.GameObjects.Text;
  private chainBar!: Phaser.GameObjects.Rectangle;
  private meterBar!: Phaser.GameObjects.Rectangle;
  private meterText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private gunText!: Phaser.GameObjects.Text;
  private gunGlyph!: Phaser.GameObjects.Graphics;
  private hitText!: Phaser.GameObjects.Text;

  constructor() {
    super('Polarity');
  }

  create(): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic(['pulse', 'drift']);
    applyCrt(this);
    clearHitStop(this);
    this.events.once('shutdown', () => {
      clearHitStop(this);
      getAudio(this)?.stopAllLoops();
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, () => getAudio(this)?.stopAllLoops());

    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    this.skillsAtLaunch = this.saves.save.skills;

    this.session = new PolaritySession({
      seed: Date.now() >>> 0,
      skills: this.saves.save.skills,
      totalWavesBefore: this.saves.save.totalWaves,
      trouble: this.saves.save.trouble,
    });

    this.carriers = [];
    this.bullets = [];
    this.shots = [];
    this.pods = [];
    this.phase = 'wave';
    this.invulnUntil = 0;
    this.nextShotAt = 0;
    this.sinceShot = 99;
    this.trail = [];
    this.trailAt = 0;
    this.bank = 0;
    this.starLayers = [];
    this.drive = newDriveState({ width, height });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawStarfield();
    this.drawShip();
    this.createHud();

    this.bindings = sceneBindings(this);
    this.keys = new KeyState(this);
    this.input.keyboard?.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    onActionKey(this, this.bindings.switchWeapon, () => this.flip());
    // E rather than a bound action: the two bound ones are spoken for, and
    // Cages already teaches E as "the extra thing this mode does".
    this.input.keyboard?.on('keydown-E', () => this.tryRecompose());

    this.pad = new FlightPad(this, {
      actions: [
        { id: 'flip', label: 'FLIP', onPress: () => this.flip(), accent: PALETTE.magenta, size: 96 },
        {
          id: 'recompose',
          label: 'RECOMP',
          onPress: () => this.tryRecompose(),
          accent: PALETTE.yellow,
          size: 74,
        },
      ],
    });
    this.pad.applySessionDefault(isTouchDevice());

    this.input.keyboard?.on('keydown-H', () => {
      if (this.scene.isActive('Help')) return;
      this.scene.launch('Help', { target: 'Polarity' });
      this.scene.pause();
    });
    onActionKey(this, this.bindings.pause, () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Polarity' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());
    this.input.keyboard?.addCapture('F');

    this.startWave();
  }

  // --- setup ---

  private drawStarfield(): void {
    const { width, height } = this.scale;
    for (const factor of [0.25, 0.55, 1]) {
      const gfx = this.add.graphics();
      gfx.fillStyle(PALETTE.cyan, 0.1 + factor * 0.2);
      for (let i = 0; i < 40; i++) {
        gfx.fillCircle(Math.random() * width, Math.random() * height, factor * 1.6);
      }
      this.starLayers.push({ gfx, factor, offset: 0 });
    }
  }

  private drawShip(): void {
    this.aura = this.add.graphics();
    this.engine = this.add.graphics();
    this.hull = this.add.graphics();
    this.muzzle = this.add.graphics();
    this.core = this.add.graphics();
    // The divisor, worn on the hull. Reading it off the HUD means looking away
    // from the one thing you cannot look away from, so the ship says what it is.
    this.wornText = this.add
      .text(0, CONFIG.polarity.shipRadius * 1.5, '', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: CSS.white,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    // Engine under the hull so the wash comes from beneath the nacelles; the
    // core over everything, because it is the one thing that must never be
    // ambiguous.
    this.ship = this.add.container(this.drive.x, this.drive.y, [
      this.aura,
      this.engine,
      this.hull,
      this.muzzle,
      this.core,
      this.wornText,
    ]);
    this.ship.setDepth(10);
    this.paintShip();
  }

  /** The hull only changes when the polarity does, so it is not redrawn hot. */
  private paintShip(): void {
    const worn = this.session.state;
    this.wornText.setText(`×${this.session.activeDivisor}`);
    this.wornText.setColor(POLARITY_CSS[worn]);
    drawPolarityHull(this.hull, {
      colour: POLARITY_COLOR[worn],
      other: POLARITY_COLOR[worn === 'a' ? 'b' : 'a'],
      radius: CONFIG.polarity.shipRadius,
    });
  }

  private createHud(): void {
    const { width, height } = this.scale;
    const small = { fontFamily: FONT, fontSize: '16px' };

    this.hpText = this.add.text(28, 22, '', { ...small, color: CSS.yellow }).setDepth(20);
    this.scoreText = this.add.text(28, 46, '', { ...small, color: CSS.cyan }).setDepth(20);
    // The pair, big. This is the question the whole mode is asking and it was
    // set in the same size as the ammo counter.
    this.pairPanel = this.add.graphics().setDepth(19);
    this.wornBig = this.add
      .text(width / 2 - 74, 34, '', { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(20);
    this.otherBig = this.add
      .text(width / 2 + 74, 34, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(20);
    this.add
      .text(width / 2, 66, 'BREAK & EAT      DODGE', {
        fontFamily: FONT,
        fontSize: '11px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.chainText = this.add
      .text(width - 28, 22, '', { ...small, color: CSS.yellow })
      .setOrigin(1, 0)
      .setDepth(20);
    this.chainBar = this.add
      .rectangle(width - 28, 48, 1, 6, PALETTE.yellow)
      .setOrigin(1, 0.5)
      .setDepth(20);

    this.meterText = this.add
      .text(width - 28, 62, '', { ...small, color: CSS.cyanDim })
      .setOrigin(1, 0)
      .setDepth(20);
    this.meterBar = this.add
      .rectangle(width - 28, 88, 1, 6, PALETTE.cyan)
      .setOrigin(1, 0.5)
      .setDepth(20);

    this.gunGlyph = this.add.graphics().setPosition(36, 78).setDepth(20);
    this.gunText = this.add
      .text(52, 70, '', { ...small, color: CSS.yellow })
      .setDepth(20);
    // The hit counter, large and centred low, the way an arcade board wears it.
    this.hitText = this.add
      .text(width / 2, height - 66, '', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.bannerText = this.add
      .text(width / 2, height * 0.3, '', {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: CSS.magentaHot,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.add
      .text(width / 2, height - 22, 'WASD MOVE · SPACE FIRE · F FOCUS · SHIFT FLIP · E RECOMPOSE · H RULES', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  // --- drawing the field ---

  private spawnCarrier(carrier: LiveCarrier): DrawnCarrier {
    const r = CONFIG.polarity.carrierRadius;
    const gfx = this.add.graphics();
    const pips = this.add.graphics();
    const label = this.add
      .text(0, 0, String(carrier.value), {
        fontFamily: FONT,
        fontSize: '21px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0.5);
    const container = this.add.container(-999, -999, [gfx, pips, label]).setDepth(5);
    const drawn: DrawnCarrier = {
      carrier,
      container,
      gfx,
      pips,
      label,
      x: 0,
      y: -999,
      scoldedAt: -999,
      dead: false,
    };
    drawCarrier(gfx, carrier.cls, r, false);
    this.paintPips(drawn);
    return drawn;
  }

  /** Hull pips under the number, so a carrier's remaining life is countable. */
  private paintPips(drawn: DrawnCarrier): void {
    const r = CONFIG.polarity.carrierRadius;
    const { hp, maxHp, cls } = drawn.carrier;
    const g = drawn.pips;
    g.clear();
    const w = 7;
    const total = maxHp * w + (maxHp - 1) * 3;
    for (let i = 0; i < maxHp; i++) {
      const x = -total / 2 + i * (w + 3);
      g.fillStyle(CLASS_COLOR[cls], i < hp ? 0.95 : 0.2);
      g.fillRect(x, r * 0.52, w, 3);
    }
  }

  private spawnBullet(bullet: LiveBullet, from: DrawnCarrier): DrawnBullet {
    const p = CONFIG.polarity;
    const gfx = this.add.graphics();
    const label = this.add
      .text(0, 0, String(bullet.value), {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0.5);
    const container = this.add.container(from.x, from.y, [gfx, label]).setDepth(4);
    drawBullet(gfx, bullet.cls, p.bulletRadius);

    // Aimed at where the ship is standing, then rotated by the pattern's own
    // offset — or thrown on an absolute compass heading, for a ring.
    const dx = this.drive.x - from.x;
    const dy = Math.max(40, this.drive.y - from.y);
    const base = bullet.radial ? -Math.PI / 2 : Math.atan2(dy, dx);
    const heading = base + Phaser.Math.DegToRad(bullet.angle);
    return {
      bullet,
      container,
      gfx,
      label,
      x: from.x,
      y: from.y,
      vx: Math.cos(heading) * this.session.waveHeat.bulletSpeed,
      vy: Math.sin(heading) * this.session.waveHeat.bulletSpeed,
      closest: Number.POSITIVE_INFINITY,
      age: 0,
      dead: false,
    };
  }

  // --- waves ---

  private startWave(): void {
    const plan = this.session.nextWave();
    this.waveTime = 0;
    this.phase = 'wave';
    for (const d of [...this.carriers, ...this.bullets]) d.container.destroy();
    for (const s of this.shots) s.gfx.destroy();
    for (const p of this.pods) p.container.destroy();
    this.carriers = plan.carriers.map((c) => this.spawnCarrier(c));
    this.bullets = [];
    this.shots = [];
    this.pods = [];
    this.paintShip();
    this.flashBanner(`${plan.formation.name}\n×${plan.pair[0]}  /  ×${plan.pair[1]}`, 1500);
  }

  private endWave(): void {
    this.phase = 'breather';
    const pick = this.session.endWave();
    for (const b of this.bullets) b.container.destroy();
    this.bullets = [];
    this.flashBanner(pick ? pick.tip.text : 'WAVE CLEAR', 1900);
    getAudio(this)?.play('waveClear');
    this.time.delayedCall(2000, () => {
      if (this.phase === 'over') return;
      this.startWave();
    });
  }

  // --- input ---

  private flip(): void {
    if (this.phase !== 'wave') return;
    if (!this.session.swap()) {
      getAudio(this)?.play('error');
      return;
    }
    getAudio(this)?.play('phase');
    this.paintShip();
  }

  private tryRecompose(): void {
    if (this.phase !== 'wave' || !this.session.recomposeReady) {
      getAudio(this)?.play('error');
      return;
    }
    const best = this.session.recomposeOptions()[0];
    if (best === undefined || !this.session.recompose(best)) return;

    for (const d of this.carriers) {
      drawCarrier(d.gfx, d.carrier.cls, CONFIG.polarity.carrierRadius, d.carrier.hp < d.carrier.maxHp);
      this.paintPips(d);
    }
    for (const d of this.bullets) drawBullet(d.gfx, d.bullet.cls, CONFIG.polarity.bulletRadius);
    this.paintShip();

    getAudio(this)?.play('shield');
    impact(this, {
      shakeMs: CONFIG.juice.bossHitShakeMs,
      shakeIntensity: CONFIG.juice.bossHitShakeIntensity,
      glow: CONFIG.juice.glowPulseHeavy,
      hitStopMs: CONFIG.juice.heavyHitStopMs,
    });
    this.flashBanner(`RECOMPOSED  ×${this.session.currentPair[0]} / ×${this.session.currentPair[1]}`, 1200);
  }

  private tryFire(): void {
    if (this.phase !== 'wave' || this.time.now < this.nextShotAt) return;
    const gun = this.session.equippedGun;
    this.nextShotAt = this.time.now + gun.cooldown * 1000;
    this.sinceShot = 0;

    for (const angle of boltAngles(gun)) {
      // Jitter is what stops the fast gun being the accurate gun as well.
      const wobble = gun.jitterDegrees === 0 ? 0 : (Math.random() * 2 - 1) * gun.jitterDegrees;
      this.spawnBolt(angle + wobble);
    }

    // Spent after the shot is away, so the pull that empties the gun is a pull
    // that still fired.
    this.session.spendRound();
  }

  private spawnBolt(angleDeg: number): void {
    const p = CONFIG.polarity;
    const gun = this.session.equippedGun;
    const colour = POLARITY_COLOR[this.session.state];
    const long = gun.pierces;

    const gfx = this.add.graphics().setDepth(6);
    gfx.fillStyle(colour, long ? 0.85 : 1);
    gfx.fillRect(-(long ? 4 : 2), long ? -34 : -11, long ? 8 : 4, long ? 68 : 22);
    gfx.fillStyle(PALETTE.white, 0.9);
    gfx.fillRect(-(long ? 2 : 1), long ? -26 : -7, long ? 4 : 2, long ? 52 : 14);

    const rad = Phaser.Math.DegToRad(angleDeg);
    const shot: Shot = {
      gfx,
      x: this.drive.x,
      y: this.drive.y - p.shipRadius * 1.15,
      vx: Math.sin(rad) * p.shotSpeed * gun.speedScale,
      vy: -Math.cos(rad) * p.shotSpeed * gun.speedScale,
      damage: gun.damage,
      pierces: gun.pierces,
      homes: gun.homes,
      hit: new Set<number>(),
      dead: false,
    };
    gfx.setPosition(shot.x, shot.y).setRotation(rad);
    this.shots.push(shot);
    getAudio(this)?.play('laser', { gain: gun.pierces ? 0.5 : 0.32 });
  }

  // --- the loop ---

  override update(_time: number, deltaMs: number): void {
    if (this.phase === 'over') return;
    const dt = Math.min(0.05, deltaMs / 1000);
    const { width, height } = this.scale;

    this.session.tick(dt);
    this.waveTime += dt;

    for (const layer of this.starLayers) {
      layer.offset = (layer.offset + layer.factor * 55 * dt) % height;
      layer.gfx.setY(layer.offset);
    }

    const input = {
      up: this.keys.isDown(this.bindings.up) || this.pad?.isDown('up') === true,
      down: this.keys.isDown(this.bindings.down) || this.pad?.isDown('down') === true,
      left: this.keys.isDown(this.bindings.left) || this.pad?.isDown('left') === true,
      right: this.keys.isDown(this.bindings.right) || this.pad?.isDown('right') === true,
    };
    // Focus, the other half of the CAVE bargain: hold it and the ship crawls,
    // which is the only way anyone threads a dense pattern. It costs mobility
    // rather than firepower, so it is a real decision every time.
    this.focused = this.keys.isDown(['KeyF', null]);
    this.drive = stepDrive(
      this.drive,
      input,
      {
        speed: CONFIG.polarity.shipSpeed * (this.focused ? CONFIG.polarity.focusSpeedFactor : 1),
        radius: CONFIG.polarity.shipRadius,
        smoothing: CONFIG.polarity.moveSmoothing,
      },
      dt,
      { width, height },
    );
    this.ship.setPosition(this.drive.x, this.drive.y);
    this.animateShip(dt, input);

    // Held fire. A shmup that wants a keypress per shot is a shmup nobody
    // finishes, and the decision here is which polarity to be, not when to pull.
    if (this.keys.isDown(this.bindings.launch)) this.tryFire();

    if (this.phase === 'wave') this.spawnDueBullets(dt);
    this.moveCarriers(width, height);
    this.moveBullets(dt, width, height);
    this.moveShots(dt, width);
    this.movePods(dt);
    this.refreshHud();

    if (this.session.gameOver) {
      this.endRun();
      return;
    }
    if (this.phase === 'wave' && this.carriers.every((c) => c.dead)) this.endWave();
  }

  private spawnDueBullets(dt: number): void {
    for (const bullet of this.session.fireGuns(dt)) {
      const from = this.carriers.find((c) => c.carrier.id === bullet.fromId && !c.dead);
      if (!from) continue;
      this.bullets.push(this.spawnBullet(bullet, from));
      getAudio(this)?.play('enemyFire', { gain: 0.25 });
    }
  }

  /**
   * Carriers are placed from the clock rather than integrated frame by frame.
   *
   * A formation says a carrier enters at a given moment in a given place, and
   * that promise is the thing a player learns; accumulating a position from
   * deltas would let a stutter quietly move it. Solving for the position at the
   * current time means a dropped frame costs a glance and never changes where
   * the pattern is.
   */
  private moveCarriers(width: number, height: number): void {
    const p = CONFIG.polarity;

    for (const d of this.carriers) {
      if (d.dead) continue;
      const slot = d.carrier.slot;
      const v = this.session.waveHeat.carrierSpeed * slot.speed;
      const alive = this.waveTime - slot.atSeconds;
      d.y = -p.carrierRadius + v * alive;
      d.x = width * (slot.x + slot.driftX * Math.max(0, alive));
      d.container.setPosition(d.x, d.y);
      d.container.setVisible(alive >= 0);
      if (alive < 0) continue;

      const gap = Math.hypot(d.x - this.drive.x, d.y - this.drive.y);
      if (gap < p.shipHitRadius + p.carrierRadius * 0.8 && this.time.now >= this.invulnUntil) {
        if (this.session.ramCarrier(d.carrier.id)) this.takeHit(`RAMMED ${d.carrier.value}`);
        this.killCarrier(d, false);
        continue;
      }
      if (d.y > height + p.carrierRadius * 2) {
        this.session.carrierEscaped(d.carrier.id);
        this.killCarrier(d, false);
      }
    }
  }

  private moveBullets(dt: number, width: number, height: number): void {
    const p = CONFIG.polarity;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;
      b.container.setPosition(b.x, b.y);

      const gap = Math.hypot(b.x - this.drive.x, b.y - this.drive.y);
      b.closest = Math.min(b.closest, gap);

      if (gap < p.shipHitRadius + p.bulletRadius * 0.75) {
        const outcome = this.session.bulletHit(b.bullet.id);
        this.despawn(b, outcome.absorbed);
        if (outcome.absorbed) {
          getAudio(this)?.play('block', { gain: 0.5 });
        } else if (outcome.damaged && this.time.now >= this.invulnUntil) {
          this.takeHit(bounceLine(b.bullet.value, this.session.activeDivisor));
        }
        continue;
      }
      if (b.y > height + 40 || b.y < -40 || b.x < -40 || b.x > width + 40) {
        this.session.bulletExpired(b.bullet.id, b.closest, b.age);
        this.despawn(b, false);
      }
    }
    // Resolved bullets keep their tween but leave the update list.
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private moveShots(dt: number, width: number): void {
    const p = CONFIG.polarity;
    for (const s of this.shots) {
      if (s.dead) continue;
      if (s.homes) this.steerSeeker(s, dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.gfx.setPosition(s.x, s.y).setRotation(Math.atan2(s.vx, -s.vy));
      if (s.y < -60 || s.x < -60 || s.x > width + 60) {
        s.dead = true;
        s.gfx.destroy();
        continue;
      }
      for (const d of this.carriers) {
        if (d.dead || !d.container.visible || s.hit.has(d.carrier.id)) continue;
        if (Math.hypot(d.x - s.x, d.y - s.y) > p.carrierRadius) continue;
        s.hit.add(d.carrier.id);
        this.resolveShot(s, d);
        if (!s.pierces) break;
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  /**
   * SEEKER steering: turn toward the nearest carrier the worn divisor divides.
   *
   * It only ever chases a valid target, which makes it the one gun that shows
   * its working — watching a bolt swerve past a 46 to reach a 42 is the answer
   * being demonstrated rather than handed over.
   */
  private steerSeeker(s: Shot, dt: number): void {
    let best: DrawnCarrier | undefined;
    let bestGap = Infinity;
    for (const d of this.carriers) {
      if (d.dead || !d.container.visible) continue;
      if (!this.session.canBreak(d.carrier)) continue;
      const gap = Math.hypot(d.x - s.x, d.y - s.y);
      if (gap < bestGap) {
        bestGap = gap;
        best = d;
      }
    }
    if (!best) return;

    const rate = this.session.equippedGun.turnRate || 3.4;
    const speed = Math.hypot(s.vx, s.vy) || CONFIG.polarity.shotSpeed;
    const want = Math.atan2(best.x - s.x, -(best.y - s.y));
    const have = Math.atan2(s.vx, -s.vy);
    const turn = Phaser.Math.Angle.Wrap(want - have);
    const step = Math.max(-rate * dt, Math.min(rate * dt, turn));
    const now = have + step;
    s.vx = Math.sin(now) * speed;
    s.vy = -Math.cos(now) * speed;
  }

  private resolveShot(shot: Shot, d: DrawnCarrier): void {
    if (!shot.pierces) {
      shot.dead = true;
      shot.gfx.destroy();
    }
    const outcome = this.session.shoot(d.carrier.id, shot.damage);

    if (!outcome.bit) {
      // The bounce is the teaching moment, so it is loud, and it says *why*:
      // not "wrong", but how far off a multiple the number actually sits.
      // The ring and the clang fire on every shot, because that is the feel of
      // hitting something that will not break. The *sentence* is throttled:
      // held fire is eight shots a second, and eight copies of the same
      // remainder stacked on one carrier is noise, not teaching.
      getAudio(this)?.play('error', { gain: 0.25 });
      const ring = this.add.circle(d.x, d.y, CONFIG.polarity.carrierRadius, 0xffffff, 0).setDepth(7);
      ring.setStrokeStyle(3, PALETTE.white, 0.9);
      this.tweens.add({
        targets: ring,
        scale: 1.5,
        alpha: 0,
        duration: 260,
        onComplete: () => ring.destroy(),
      });
      this.tweens.add({ targets: d.container, angle: { from: -7, to: 0 }, duration: 180 });
      if (this.time.now - d.scoldedAt > 900) {
        d.scoldedAt = this.time.now;
        this.floatText(d.x, d.y - 34, bounceLine(outcome.value, outcome.divisor), CSS.white, 18);
      }
      return;
    }

    this.paintPips(d);
    drawCarrier(d.gfx, d.carrier.cls, CONFIG.polarity.carrierRadius, true);
    if (!outcome.killed) {
      getAudio(this)?.play('boltHit', { gain: 0.4 });
      this.tweens.add({ targets: d.container, scale: { from: 1.16, to: 1 }, duration: 120 });
      return;
    }
    this.applyKill(d, outcome);
  }

  /**
   * A carrier coming apart, and the division that did it.
   *
   * The quotient is the whole point of printing this. The mode asks a yes/no
   * question all run — is this a multiple — and the answer to the *other* half,
   * how many times it goes, never appears anywhere unless the kill says it.
   */
  private applyKill(d: DrawnCarrier, outcome: ShotOutcome): void {
    if (d.dead) return;
    getAudio(this)?.play('explosion');
    this.floatText(d.x, d.y, killLine(outcome.value, outcome.divisor), CSS.yellow, 22);
    this.killCarrier(d, true);
    cameraPunch(this, 0.008, 160);

    this.cancelAround(d.x, d.y, CONFIG.polarity.cancelRadius);
    if (outcome.pod) this.spawnPod(outcome.pod, d.x, d.y);
    if (outcome.linked) {
      getAudio(this)?.play('comboUp');
      cameraPunch(this, 0.02, 260);
      glowPulse(this, CONFIG.juice.glowPulseKill);
      this.flashBanner(`LINK ×${outcome.links}   +${outcome.points}`, 800);
    }
  }

  /**
   * The bullet cancel — the best thing CAVE ever put in a shmup.
   *
   * Break a carrier and its fire stops being a threat and starts being points,
   * streaming into the ship as the numbers it was carrying. It rewards the
   * exact play the mode wants: dive into a thicket, break the thing making it,
   * and the thicket pays you.
   *
   * Cancelled shots are wiped without being judged. The player never chose to
   * take or leave them — they simply stopped existing — so grading them would
   * be inventing a decision, and the ledger stays out of it.
   */
  private cancelAround(x: number, y: number, radius: number): void {
    let n = 0;
    for (const b of this.bullets) {
      if (b.dead || Math.hypot(b.x - x, b.y - y) > radius) continue;
      const value = this.session.cancelBullet(b.bullet.id);
      if (value === undefined) continue;
      b.dead = true;
      n += 1;
      this.streamStar(b, n);
    }
    if (n > 0) getAudio(this)?.play('nearMiss', { gain: 0.4 });
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  /** A cancelled shot, flying home as score. */
  private streamStar(b: DrawnBullet, index: number): void {
    b.container.setDepth(8);
    this.tweens.killTweensOf(b.container);
    this.tweens.add({
      targets: b.container,
      x: this.drive.x,
      y: this.drive.y,
      scale: 0.35,
      alpha: 0.15,
      delay: index * 18,
      duration: 420,
      ease: 'Cubic.easeIn',
      onComplete: () => b.container.destroy(),
    });
  }

  private spawnPod(gun: GunKind, x: number, y: number): void {
    const p = CONFIG.polarity;
    const def = GUNS[gun];
    const shell = this.add.graphics();
    shell.fillStyle(PALETTE.yellow, 0.1);
    shell.fillCircle(0, 0, p.podRadius * 1.35);
    shell.lineStyle(2.5, PALETTE.yellow, 1);
    shell.fillStyle(PALETTE.black, 0.7);
    shell.fillRoundedRect(-p.podRadius, -p.podRadius, p.podRadius * 2, p.podRadius * 2, 6);
    shell.strokeRoundedRect(-p.podRadius, -p.podRadius, p.podRadius * 2, p.podRadius * 2, 6);

    // A diagram of what it does, not the first letter of what it is called.
    const glyph = this.add.graphics();
    drawGunGlyph(glyph, gun, p.podRadius * 0.72, PALETTE.yellow);

    const label = this.add
      .text(0, p.podRadius + 11, def.label, {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [shell, glyph, label]).setDepth(7);
    this.tweens.add({ targets: container, scale: { from: 0.3, to: 1 }, duration: 200 });
    this.pods.push({ gun, container, x, y, life: p.podLifeSeconds, dead: false });
  }

  private movePods(dt: number): void {
    const p = CONFIG.polarity;
    for (const pod of this.pods) {
      if (pod.dead) continue;
      pod.y += p.podFallSpeed * dt;
      pod.life -= dt;
      pod.container.setPosition(pod.x, pod.y);
      // Blink out its last second, so a pod is never lost without warning.
      pod.container.setAlpha(pod.life < 1 ? 0.35 + 0.65 * Math.abs(Math.sin(pod.life * 14)) : 1);

      if (Math.hypot(pod.x - this.drive.x, pod.y - this.drive.y) < p.shipRadius + p.podRadius) {
        const def = GUNS[pod.gun];
        this.session.equip(pod.gun);
        this.flashBanner(`${def.label}\n${def.blurb}`, 1300);
        getAudio(this)?.play('purchase');
        glowPulse(this, CONFIG.juice.glowPulseKill);
        pod.dead = true;
        pod.container.destroy();
        continue;
      }
      if (pod.life <= 0) {
        pod.dead = true;
        pod.container.destroy();
      }
    }
    this.pods = this.pods.filter((pod) => !pod.dead);
  }

  /** A number that rises off the field and fades — the arithmetic, said aloud. */
  private floatText(x: number, y: number, text: string, colour: string, size: number): void {
    const label = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color: colour })
      .setOrigin(0.5)
      .setDepth(25);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      duration: 1000,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private takeHit(message: string): void {
    this.invulnUntil = this.time.now + 1200;
    getAudio(this)?.play('playerHit');
    shake(this, CONFIG.juice.landShakeMs, CONFIG.juice.landShakeIntensity);
    this.cameras.main.flash(180, 255, 45, 149);
    this.flashBanner(message, 950);
  }

  private killCarrier(d: DrawnCarrier, exploded: boolean): void {
    d.dead = true;
    this.tweens.add({
      targets: d.container,
      alpha: 0,
      scale: exploded ? 1.7 : 0.7,
      duration: exploded ? 220 : 160,
      onComplete: () => d.container.destroy(),
    });
  }

  private despawn(b: DrawnBullet, absorbed: boolean): void {
    b.dead = true;
    this.tweens.add({
      targets: b.container,
      alpha: 0,
      scale: absorbed ? 0.2 : 1.5,
      x: absorbed ? this.drive.x : b.x,
      y: absorbed ? this.drive.y : b.y,
      duration: absorbed ? 160 : 200,
      onComplete: () => b.container.destroy(),
    });
  }

  /**
   * Everything about the ship that moves: the wash, the ring, and the bank.
   *
   * The bank is the cheapest polish in the mode and does the most work. Sliding
   * a sprite sideways at speed looks like a sprite being slid; rolling into the
   * direction of travel and easing back out looks like a ship. It is also the
   * fastest confirmation a player gets that a key registered.
   */
  private animateShip(dt: number, input: { up: boolean; down: boolean; left: boolean; right: boolean }): void {
    const p = CONFIG.polarity;
    const worn = this.session.state;
    const colour = POLARITY_COLOR[worn];
    const t = this.time.now / 1000;

    // Lean on the velocity rather than the key, so the roll eases out with the
    // glide instead of snapping upright the moment the finger lifts.
    const strafe = Math.max(-1, Math.min(1, this.drive.vx / p.shipSpeed));
    this.bank += (strafe - this.bank) * Math.min(1, dt * 12);
    this.ship.setRotation(this.bank * 0.34);
    this.ship.setScale(1 - Math.abs(this.bank) * 0.1, 1);
    // The badge stays level while the hull rolls — a number that tips with the
    // ship is a number you have to decode instead of read.
    this.wornText.setRotation(-this.bank * 0.34);
    this.sinceShot += dt;
    this.dropTrail(dt);
    // Blink while the hit invulnerability runs, so a lost hull point is not a
    // thing the player has to infer from the HUD.
    this.ship.setAlpha(this.time.now < this.invulnUntil && Math.floor(t * 14) % 2 === 0 ? 0.35 : 1);

    drawPolarityEngine(this.engine, {
      colour,
      radius: p.shipRadius,
      thrust: input.up ? 1 : 0,
      strafe: this.bank,
      time: t,
    });
    drawPolarityRing(this.aura, colour, p.shipRadius, this.session.locked, t);
    drawMuzzle(this.muzzle, colour, p.shipRadius, this.sinceShot, 0.09);
    drawHitCore(this.core, colour, p.shipHitRadius * (this.focused ? 1.9 : 1), t);
  }

  /**
   * Ghosts of the hull, dropped while the ship is moving and fading out where
   * they were left.
   *
   * The ship has no momentum by design, which makes it precise and also makes
   * a fast slide look like a teleport. The trail is where the speed goes: it
   * gives the eye something continuous to follow between two positions that
   * were never actually joined up.
   */
  private dropTrail(dt: number): void {
    const p = CONFIG.polarity;
    const moving = Math.hypot(this.drive.vx, this.drive.vy) > p.shipSpeed * 0.25;
    this.trailAt -= dt;

    if (moving && this.trailAt <= 0) {
      this.trailAt = 0.03;
      const gfx = this.add.graphics().setDepth(9);
      gfx.lineStyle(2, POLARITY_COLOR[this.session.state], 0.4);
      gfx.strokeCircle(0, 0, p.shipRadius * 0.62);
      gfx.setPosition(this.drive.x, this.drive.y);
      gfx.setRotation(this.ship.rotation);
      this.trail.push({ gfx, life: 0.26 });
    }

    for (const ghost of this.trail) {
      ghost.life -= dt;
      ghost.gfx.setAlpha(Math.max(0, ghost.life / 0.26));
      ghost.gfx.setScale(0.6 + (1 - ghost.life / 0.26) * 0.5);
      if (ghost.life <= 0) ghost.gfx.destroy();
    }
    this.trail = this.trail.filter((g) => g.life > 0);
  }

  private flashBanner(text: string, ms: number): void {
    this.bannerText.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({ targets: this.bannerText, alpha: 0, duration: ms, ease: 'Quad.easeIn' });
  }

  private refreshHud(): void {
    const p = CONFIG.polarity;
    const [a, b] = this.session.currentPair;
    const worn = this.session.state;

    this.hpText.setText(`HULL ${'█'.repeat(Math.max(0, this.session.hp))}`);
    this.scoreText.setText(`${this.session.score}`);

    // The worn divisor is the loud one, boxed and twice the size of the other,
    // so a glance answers "what am I" without any comparison.
    const wornDiv = worn === 'a' ? a : b;
    const otherDiv = worn === 'a' ? b : a;
    this.wornBig.setText(`×${wornDiv}`).setColor(POLARITY_CSS[worn]);
    this.otherBig.setText(`×${otherDiv}`).setColor(CSS.cyanDim);

    const width = this.scale.width;
    this.pairPanel.clear();
    this.pairPanel.fillStyle(POLARITY_COLOR[worn], 0.14);
    this.pairPanel.fillRoundedRect(width / 2 - 128, 10, 108, 48, 6);
    this.pairPanel.lineStyle(2.5, POLARITY_COLOR[worn], 1);
    this.pairPanel.strokeRoundedRect(width / 2 - 128, 10, 108, 48, 6);

    const chain = this.session.chain;
    this.chainText.setText(chain.links > 0 ? `LINK ×${chain.links}` : 'NO LINK');
    this.chainBar.setSize(Math.max(1, 150 * linkProgress(chain, p.chain)), 6);

    const gun = this.session.equippedGun;
    const rounds = this.session.gunRounds;
    this.gunText.setText(rounds === null ? gun.label : `${gun.label}  ${rounds}`);
    const low = rounds !== null && rounds <= 8;
    this.gunText.setColor(low ? CSS.magentaHot : CSS.yellow);
    drawGunGlyph(this.gunGlyph, gun.kind, 9, low ? PALETTE.magentaHot : PALETTE.yellow);

    const hits = this.session.kills + this.session.cancelled;
    this.hitText.setText(hits > 0 ? `${hits} HIT` : '');
    this.hitText.setAlpha(Math.min(1, 0.35 + hits / 40));

    const charge = this.session.meterCharge / p.meterCapacity;
    this.meterText.setText(this.session.recomposeReady ? 'RECOMPOSE READY — E' : 'METER');
    this.meterText.setColor(this.session.recomposeReady ? CSS.yellow : CSS.cyanDim);
    this.meterBar
      .setFillStyle(this.session.recomposeReady ? PALETTE.yellow : PALETTE.cyan)
      .setSize(Math.max(1, 150 * charge), 6);
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    clearHitStop(this);
    getAudio(this)?.stopAllLoops();
    // Cash whatever evidence cleared the bar; the rest is discarded rather than
    // rounded up, which is the whole point of gating it.
    this.session.finish();

    const stats: RunStats = this.session.stats();
    const credits = this.session.creditsEarned();
    const save = this.saves.save;
    // Deltas before the table is overwritten, or the report has nothing to
    // compare against.
    const deltas = runDeltas(this.skillsAtLaunch, this.session.skillTable, CONFIG);
    save.skills = this.session.skillTable;
    save.trouble = this.session.troubleLog;
    save.totalWaves += this.session.currentWaveNumber;
    save.credits += credits;
    save.bestScore = Math.max(save.bestScore, stats.score);
    const unlocked = newMilestones(save.skills, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    getAudio(this)?.play('gameover');
    this.cameras.main.flash(400, 255, 45, 149);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
    this.time.delayedCall(900, () => {
      goTo(this, 'Debrief', {
        stats,
        credits,
        mode: 'Polarity',
        title: 'HULL BREACHED',
        killsLabel: 'BROKEN',
        streakLabel: 'BEST CHAIN',
        milestones: unlocked.map((m) => m.label),
        deltas,
      });
    });
  }
}
