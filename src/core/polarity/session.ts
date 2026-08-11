/**
 * PolaritySession: pure simulation for one POLARITY run.
 *
 * The mode is Ikaruga's two-channel structure, with a divisor pair standing in
 * for black and white.
 *
 *   - **Carriers** are the enemies. A carrier wears a number and can only be
 *     broken by a ship wearing a divisor of it; shots from the wrong polarity
 *     ring off it. Three kills of one colour make a chain link.
 *   - **Bullets** are what carriers throw back. A bullet wears a number too,
 *     and is absorbed harmlessly if the worn divisor divides it. Otherwise it
 *     costs a hull point.
 *
 * The tension is the whole design, and it is Ikaruga's: **a carrier fires the
 * colour it is not**. Wearing ×3 lets you break the ×3 carriers, and the ×3
 * carriers are spraying ×4 bullets that will kill you while you wear it. So the
 * colour that lets you attack is the colour that leaves you exposed, and the
 * safe answer — flipping to eat the fire and recharge — is the one that stops
 * you killing anything. Neither state is ever simply correct.
 *
 * Two rules worth stating up front, because everything else follows.
 *
 * A contact is graded on the state the ship was in at the *start of the tick*,
 * never on the state it is in when the collision resolves. Flipping and being
 * hit on the same frame would otherwise be ambiguous, and an ambiguous frame is
 * a corrupted ledger.
 *
 * And only bullets are graded. Shooting is an assertion too — firing while
 * wearing ×7 says "that number is a seven" — but it is one where only half the
 * mistakes are observable: a bounce is a visible false alarm, while a carrier
 * the player quietly declined to shoot leaves no record at all. A channel that
 * can see one error type and not the other biases every estimate drawn from it.
 * Bullets arrive by the dozen and resolve into all four cells, so they carry
 * the measurement, and the gun is left to be a gun.
 */
import { selectTip, type CoachPick } from '../coach/select';
import { recordTrouble, type TroubleLog } from '../coach/trouble';
import { CONFIG, type GameConfig } from '../config';
import { creditsForRun, type RunStats } from '../economy/economy';
import { createRng, type Rng } from '../rng';
import { applyAttempt, type SkillTable } from '../skills/rating';
import { getSkill, type SkillId } from '../skills/taxonomy';
import { absorb, newChain, type ChainState, type Colour } from './chain';
import { UNRATED_DIVISORS, classOf, difficultyFor, legalPairs, skillIdsFor } from './divisors';
import { wasReachable } from './drive';
import {
  FORMATIONS,
  classesOf,
  hasSafePath,
  isChainable,
  type CarrierClass,
  type Formation,
  type Slot,
} from './formations';
import { GUNS, POD_GUNS, type GunDef, type GunKind } from './guns';
import { heatFor, type WaveHeat } from './heat';
import { fillSlots, isFillable } from './motes';
import { SignalLedger, dPrime, partialFor, type MoteClass, type Resolution } from './signal';
import { addPoints, buy, canBuy, modsFor, newTree, type Mods, type TreeState } from './tree';

export type Polarity = 'a' | 'b';

export interface PolaritySessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  config?: GameConfig;
  trouble?: TroubleLog;
}

/** An enemy. Broken only by a ship wearing a divisor of its number. */
export interface LiveCarrier {
  id: number;
  value: number;
  cls: CarrierClass;
  hp: number;
  maxHp: number;
  slot: Slot;
  /** Seconds until it fires again. */
  cooldown: number;
}

/** Incoming fire. Absorbed when the worn divisor divides it. */
export interface LiveBullet {
  id: number;
  value: number;
  cls: MoteClass;
  /** The carrier that threw it. */
  fromId: number;
  /**
   * Heading in degrees. Absolute compass when `radial`; otherwise an offset
   * from the line to wherever the ship was standing.
   */
  angle: number;
  radial: boolean;
}

/**
 * How a volley is shaped.
 *
 * Single aimed shots are what a shmup does before it has any confidence. The
 * genre's whole visual language is *geometry* — fans that open around you,
 * rings that expand through you — and a pattern you can read the shape of is a
 * pattern you can find the gap in, which is why dense bullet hells are fairer
 * than sparse random ones.
 */
export type FirePattern = 'aimed' | 'fan' | 'ring';

export interface ShotOutcome {
  /** The shot found a carrier at all. */
  connected: boolean;
  /** The worn divisor divides it, so the shot bit. */
  bit: boolean;
  killed: boolean;
  points: number;
  linked: boolean;
  broke: boolean;
  links: number;
  /** The number and divisor involved, for the arithmetic the scene prints. */
  value: number;
  divisor: number;
  /** A weapon pod the kill left behind. */
  pod?: GunKind;
  /** A skill point the kill left behind. */
  point?: boolean;
}

export interface HitOutcome {
  absorbed: boolean;
  damaged: boolean;
  points: number;
}

export interface WavePlan {
  formation: Formation;
  pair: readonly [number, number];
  carriers: readonly LiveCarrier[];
}

/** The headings a pattern throws, in degrees. */
export function anglesFor(pattern: FirePattern, ringBullets = 8): number[] {
  if (pattern === 'aimed') return [0];
  if (pattern === 'fan') return [-20, 0, 20];
  const n = Math.max(3, ringBullets);
  return Array.from({ length: n }, (_, i) => (i * 360) / n);
}

const COACH_RECENCY_WAVES = 3;
const FALLBACK_PAIR: readonly [number, number] = [3, 4];

interface Ledger {
  signal: SignalLedger;
  difficulties: number[];
}

export class PolaritySession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private waveInRun = 0;
  private nextId = 1;

  private carriers = new Map<number, LiveCarrier>();
  private bullets = new Map<number, LiveBullet>();
  private pair: readonly [number, number] = FALLBACK_PAIR;
  private formation: Formation = FORMATIONS[0]!;

  private polarity: Polarity = 'a';
  /** The state a contact this tick is judged against. See the file header. */
  private tickPolarity: Polarity = 'a';
  private lockoutRemaining = 0;

  private chainState: ChainState = newChain();
  private meter = 0;
  private gun: GunKind = 'bolt';
  private heat: WaveHeat;
  private gunAmmo: number | null = null;
  /** The per-run tree. Wiped with the session, never persisted. */
  private tree: TreeState = newTree();
  private mods: Mods = modsFor(newTree());
  private readonly ledgers = new Map<number, Ledger>();
  private trouble: TroubleLog;
  private lastTipSkill: SkillId | undefined;

  score = 0;
  kills = 0;
  absorbed = 0;
  bounces = 0;
  cancelled = 0;
  bestLinks = 0;
  totalLinks = 0;
  damageTaken = 0;
  hp: number;

  constructor(init: PolaritySessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.hp = this.cfg.polarity.startingHp;
    this.trouble = { ...(init.trouble ?? {}) };
    this.heat = heatFor(1, this.cfg.polarity.heat);
  }

  // --- readouts ---

  get globalWave(): number {
    return this.startWave + this.waveInRun;
  }
  get currentWaveNumber(): number {
    return this.waveInRun;
  }
  get skillTable(): SkillTable {
    return this.skills;
  }
  get troubleLog(): TroubleLog {
    return this.trouble;
  }
  get gameOver(): boolean {
    return this.hp <= 0;
  }
  get currentPair(): readonly [number, number] {
    return this.pair;
  }
  get currentFormation(): Formation {
    return this.formation;
  }
  get state(): Polarity {
    return this.polarity;
  }
  /** The divisor the ship is currently wearing. */
  get activeDivisor(): number {
    return this.polarity === 'a' ? this.pair[0] : this.pair[1];
  }
  get chain(): ChainState {
    return this.chainState;
  }
  get locked(): boolean {
    return this.lockoutRemaining > 0;
  }
  get meterCharge(): number {
    return this.meter;
  }
  get recomposeReady(): boolean {
    return this.meter >= this.meterCapacity;
  }
  /** Bullets needed to charge RECOMPOSE, after the tree has had its say. */
  get meterCapacity(): number {
    return Math.max(4, Math.round(this.cfg.polarity.meterCapacity * this.mods.meterRate));
  }
  get liveCarriers(): readonly LiveCarrier[] {
    return [...this.carriers.values()];
  }
  get liveBullets(): readonly LiveBullet[] {
    return [...this.bullets.values()];
  }
  /** The pressure this wave runs at — the scene reads speeds off it too. */
  get waveHeat(): WaveHeat {
    return this.heat;
  }
  get waveCleared(): boolean {
    return this.carriers.size === 0;
  }
  get equippedGun(): GunDef {
    return GUNS[this.gun];
  }
  /** Pulls left, or null on the gun you never run out of. */
  get gunRounds(): number | null {
    return this.gunAmmo;
  }

  /** The per-run tree, and everything it currently adds up to. */
  get treeState(): TreeState {
    return this.tree;
  }
  get treeMods(): Mods {
    return this.mods;
  }
  get skillPoints(): number {
    return this.tree.points;
  }

  /** Take a node, if it is adjacent, affordable and inside the budget. */
  buyNode(id: number): boolean {
    const next = buy(this.tree, id, this.cfg.polarity.tree);
    if (next === this.tree) return false;
    this.tree = next;
    this.mods = modsFor(next);
    // Extra hull arrives the moment it is bought rather than at the next wave,
    // which is the only sane reading of "+1 hull" while something is shooting.
    this.hp += this.modDelta('bonusHull');
    return true;
  }

  canBuyNode(id: number): boolean {
    return canBuy(this.tree, id, this.cfg.polarity.tree);
  }

  /** Hull already granted by the tree, so a new node only pays the difference. */
  private grantedHull = 0;
  private modDelta(_key: 'bonusHull'): number {
    const owed = this.mods.bonusHull;
    const delta = owed - this.grantedHull;
    this.grantedHull = owed;
    return delta;
  }

  /** Whether the ship as it stands could break this carrier. */
  canBreak(carrier: LiveCarrier): boolean {
    return carrier.value % this.activeDivisor === 0;
  }

  // --- the clock ---

  /**
   * Advance the simulation. Call once per frame *before* resolving collisions:
   * it stamps the polarity this tick's contacts are judged against, which is
   * what makes a flip and a hit on the same frame decidable.
   */
  tick(dtSeconds: number): void {
    this.tickPolarity = this.polarity;
    this.lockoutRemaining = Math.max(0, this.lockoutRemaining - dtSeconds);
  }

  /**
   * Flip. Refused while the last flip is still settling — a mash-proof lockout
   * is the difference between committing to a colour and sampling both.
   */
  swap(): boolean {
    if (this.lockoutRemaining > 0) return false;
    this.polarity = this.polarity === 'a' ? 'b' : 'a';
    this.lockoutRemaining = this.cfg.polarity.swapLockoutSeconds * (1 - this.mods.flipRecovery);
    return true;
  }

  /**
   * Roll every carrier's gun forward and return whatever they fired.
   *
   * A carrier fires the colour it is *not*, which is where the mode's tension
   * comes from: the polarity you must wear to break it is the one its own fire
   * will kill you in. Bridges belong to both, so they throw wilds — numbers
   * divisible by neither divisor, which no polarity makes safe and which exist
   * to keep a hand on the movement keys.
   */
  fireGuns(dtSeconds: number): LiveBullet[] {
    const p = this.cfg.polarity;
    const out: LiveBullet[] = [];
    if (this.bullets.size >= p.maxLiveBullets) return out;

    for (const carrier of this.carriers.values()) {
      if (carrier.slot.fireEvery <= 0) continue;
      carrier.cooldown -= dtSeconds;
      if (carrier.cooldown > 0) continue;
      carrier.cooldown = carrier.slot.fireEvery * this.heat.fireStretch;

      const wild = this.rng.chance(this.heat.wildShare);
      const cls: MoteClass = wild
        ? 'neither'
        : carrier.cls === 'aOnly'
          ? 'bOnly'
          : carrier.cls === 'bOnly'
            ? 'aOnly'
            : this.rng.chance(0.5)
              ? 'aOnly'
              : 'bOnly';

      const pattern = this.patternFor(carrier);
      const angles = anglesFor(pattern, this.heat.ringBullets);
      const values = fillSlots(
        this.rng,
        angles.map(() => cls),
        this.pair[0],
        this.pair[1],
        { lo: p.valueLo, hi: p.valueHi },
        p.pool,
      );

      angles.forEach((angle, i) => {
        const bullet: LiveBullet = {
          id: this.nextId++,
          value: values[i]!,
          cls,
          fromId: carrier.id,
          angle,
          radial: pattern === 'ring',
        };
        this.bullets.set(bullet.id, bullet);
        out.push(bullet);
      });
    }
    return out;
  }

  /**
   * Bridges throw rings; everything else aims, and learns to fan out as the run
   * goes on. Giving the common multiples the loudest pattern is deliberate —
   * they are the carriers worth hunting, so they should be the ones that make
   * the screen difficult when you go for them.
   */
  private patternFor(carrier: LiveCarrier): FirePattern {
    if (carrier.cls === 'bridge' && this.heat.ringBullets > 0) return 'ring';
    return this.rng.chance(this.heat.fanChance) ? 'fan' : 'aimed';
  }

  // --- waves ---

  /**
   * Which divisors to build the next wave from.
   *
   * Weakest-first, on the same principle as Factor Storm's family pool: rank
   * the recognition skills by how far the player's rating sits under the
   * skill's own base, and prefer pairs that put the laggards on screen. A skill
   * nobody has attempted counts as neutral rather than urgent — discovering a
   * cold profile is the placement sweep's job, not this mode's.
   *
   * The opening wave is always one rated divisor against a last-digit one, so
   * the first thing a player meets is half free.
   */
  private choosePair(): readonly [number, number] {
    const pairs = legalPairs().filter(([a, b]) =>
      isFillable(
        [...classesOf(this.formation), 'neither'],
        a,
        b,
        { lo: this.cfg.polarity.valueLo, hi: this.cfg.polarity.valueHi },
      ),
    );
    if (pairs.length === 0) return FALLBACK_PAIR;

    if (this.waveInRun <= 1) {
      const gentle = pairs.filter(
        ([a, b]) => UNRATED_DIVISORS.includes(a) !== UNRATED_DIVISORS.includes(b),
      );
      if (gentle.length > 0) return this.rng.pick(gentle);
    }

    const need = (d: number): number => {
      const ids = skillIdsFor(d);
      if (ids.length === 0) return 0;
      const gaps = ids.map((id) => {
        const st = this.skills[id];
        return st && st.attempts > 0 ? st.rating - getSkill(id).baseDifficulty : 0;
      });
      return -Math.min(...gaps);
    };

    // Weight rather than take the single worst, so a wave is never a wall of
    // the player's weakest reading.
    const scored = pairs.map((p) => ({ pair: p, want: need(p[0]) + need(p[1]) }));
    scored.sort((x, y) => y.want - x.want);
    const shortlist = scored.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
    return this.rng.pick(shortlist).pair;
  }

  /**
   * Open the next wave.
   *
   * The formation is authored and the numbers are not, so the only thing that
   * can go wrong is the fill: a pair too sparse to supply a class, or a shape
   * the pair cannot be chained through. Both are checked rather than shipped,
   * because a player cannot tell an impossible wave from one they failed.
   */
  nextWave(): WavePlan {
    this.waveInRun += 1;
    this.heat = heatFor(this.waveInRun, this.cfg.polarity.heat);
    this.bullets.clear();
    const p = this.cfg.polarity;
    const range = { lo: p.valueLo, hi: p.valueHi };

    for (let attempt = 0; attempt < 24; attempt++) {
      const formation = this.rng.pick([...FORMATIONS]);
      this.formation = formation;
      const [a, b] = this.choosePair();
      const classes = classesOf(formation);

      if (!isFillable([...classes, 'neither'], a, b, range)) continue;
      if (!isChainable(classes, p.chain, p.path)) continue;
      if (!hasSafePath(formation, p.path)) continue;

      this.pair = [a, b];
      this.dealCarriers(formation, a, b, range);
      this.chainState = newChain();
      return { formation, pair: this.pair, carriers: this.liveCarriers };
    }

    // Every authored formation is proven chainable, flyable and fillable for
    // every legal pair, so this is unreachable in practice — but a wave that
    // silently came out malformed would be worse than one that came out plain.
    this.formation = FORMATIONS[0]!;
    this.pair = FALLBACK_PAIR;
    this.dealCarriers(this.formation, this.pair[0], this.pair[1], range);
    this.chainState = newChain();
    return { formation: this.formation, pair: this.pair, carriers: this.liveCarriers };
  }

  private dealCarriers(
    formation: Formation,
    a: number,
    b: number,
    range: { lo: number; hi: number },
  ): void {
    const values = fillSlots(this.rng, classesOf(formation), a, b, range, this.cfg.polarity.pool);
    this.carriers = new Map(
      formation.slots.map((slot, i) => {
        const value = values[i]!;
        const carrier: LiveCarrier = {
          id: this.nextId++,
          value,
          cls: classOf(value, a, b) as CarrierClass,
          hp: slot.hp,
          maxHp: slot.hp,
          slot,
          // Staggered, so a formation does not open with one synchronised volley.
          cooldown: slot.fireEvery * (0.4 + this.rng.next() * 0.6),
        };
        return [carrier.id, carrier];
      }),
    );
  }

  // --- guns ---

  /** Take a pod. Swapping guns always refills, so a pod is never a downgrade. */
  equip(kind: GunKind): void {
    this.gun = kind;
    const rounds = GUNS[kind].ammo;
    this.gunAmmo = rounds === null ? null : Math.round(rounds * this.mods.ammo);
  }

  /**
   * Spend one trigger pull, called *after* the shot is away.
   *
   * Running dry drops straight back to BOLT rather than leaving the trigger
   * dead: a player mid-pattern needs to keep shooting, and discovering the gun
   * has stopped working is a worse surprise than discovering it got weaker.
   */
  spendRound(): void {
    if (this.gunAmmo === null) return;
    this.gunAmmo -= 1;
    if (this.gunAmmo <= 0) {
      this.gun = 'bolt';
      this.gunAmmo = null;
    }
  }

  // --- shooting ---

  /**
   * A player shot reaches a carrier.
   *
   * The wrong polarity does not chip it — the shot rings off. A soft version of
   * this, where any shot does some damage, would let a player clear the field
   * by holding fire and never deciding anything, which is the mistake that
   * benched Boss Rush.
   */
  shoot(carrierId: number, damage = 1): ShotOutcome {
    const divisor = this.activeDivisor;
    const carrier = this.carriers.get(carrierId);
    const miss: ShotOutcome = {
      connected: false,
      bit: false,
      killed: false,
      points: 0,
      linked: false,
      broke: false,
      links: this.chainState.links,
      value: carrier?.value ?? 0,
      divisor,
    };
    if (!carrier) return miss;

    if (carrier.value % divisor !== 0) {
      this.bounces += 1;
      return { ...miss, connected: true };
    }

    carrier.hp -= damage;
    if (carrier.hp > 0) {
      return { ...miss, connected: true, bit: true };
    }

    this.carriers.delete(carrierId);
    this.kills += 1;
    this.noteCarrier(carrier, true);

    const colour: Colour = carrier.cls === 'bridge' ? 'joker' : this.polarity;
    let step = absorb(this.chainState, colour, this.cfg.polarity.chain);
    this.chainState = step.state;
    // A bridge counting twice is the tree paying you for the thing the mode
    // already wants you to hunt.
    if (this.mods.bridgesCountDouble && carrier.cls === 'bridge' && !step.broke) {
      const again = absorb(this.chainState, 'joker', this.cfg.polarity.chain);
      this.chainState = again.state;
      if (again.linked) step = { ...again, payout: again.payout + step.payout };
    }
    if (step.linked) {
      this.totalLinks += 1;
      this.bestLinks = Math.max(this.bestLinks, step.state.links);
      // A link that repairs is the only healing in the mode, and it is earned
      // by the hardest thing in it: taking three of a colour in order.
      if (this.mods.linksRepair) this.hp += 1;
    }

    const points = Math.round(
      this.cfg.polarity.killPoints * carrier.maxHp * this.mods.killPoints +
        step.payout * this.mods.chainPayout,
    );
    this.score += points;
    const pod = this.rollPod();
    const point = this.rng.chance(this.cfg.polarity.spChance + this.mods.spChance);
    if (point) this.tree = addPoints(this.tree, this.cfg.polarity.tree.pointsPerPickup);
    return {
      connected: true,
      bit: true,
      killed: true,
      points,
      linked: step.linked,
      broke: step.broke,
      links: step.state.links,
      value: carrier.value,
      divisor,
      ...(pod === undefined ? {} : { pod }),
      ...(point ? { point: true } : {}),
    };
  }

  /**
   * Whether a kill leaves a weapon behind.
   *
   * Bridges are not special-cased and deliberately: a pod that only ever fell
   * from common multiples would turn the mode's one good idea into a chore,
   * and hunting bridges is already its own reward through the chain.
   */
  private rollPod(): GunKind | undefined {
    if (!this.rng.chance(this.cfg.polarity.podChance * this.mods.podChance)) return undefined;
    return this.rng.pick([...POD_GUNS]);
  }

  /** A carrier reached the bottom without being broken. No penalty but the loss. */
  carrierEscaped(carrierId: number): void {
    const carrier = this.carriers.get(carrierId);
    if (!carrier) return;
    this.carriers.delete(carrierId);
    this.noteCarrier(carrier, false);
  }

  /** The ship rammed a carrier. Carriers are solid to both polarities. */
  ramCarrier(carrierId: number): boolean {
    if (!this.carriers.has(carrierId)) return false;
    this.takeDamage();
    if (!this.mods.chainSurvivesDamage) this.chainState = newChain();
    return true;
  }

  // --- taking fire ---

  /**
   * A bullet reached the ship.
   *
   * Being hit *is* the yes answer: putting yourself in a bullet's way while
   * wearing a divisor asserts the bullet's number is a multiple of it. Being
   * wrong costs a hull point and it is still the same assertion, which is why
   * damage and grading are decided separately.
   */
  /** Whether this bullet is one the worn divisor makes safe — for the magnet. */
  isSafeBullet(bullet: LiveBullet): boolean {
    return bullet.cls === 'bridge' || bullet.cls === (this.polarity === 'a' ? 'aOnly' : 'bOnly');
  }

  bulletHit(bulletId: number, focused = false): HitOutcome {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return { absorbed: false, damaged: false, points: 0 };
    this.bullets.delete(bulletId);

    const res: Resolution = this.tickPolarity === 'a' ? 'absorbedA' : 'absorbedB';
    this.grade(bullet.cls, bullet.value, res);

    // Focus eating wilds is the one node that changes what is safe rather than
    // how safe you are. It cannot help with the *reading* — a wild is divisible
    // by neither divisor and there is nothing to work out about it.
    const wildEaten = focused && this.mods.focusEatsWilds && bullet.cls === 'neither';
    const safe =
      wildEaten ||
      bullet.cls === 'bridge' ||
      bullet.cls === (this.tickPolarity === 'a' ? 'aOnly' : 'bOnly');
    if (!safe) {
      this.takeDamage();
      if (!this.mods.chainSurvivesDamage) this.chainState = newChain();
      return { absorbed: false, damaged: true, points: 0 };
    }

    this.absorbed += 1;
    this.meter = Math.min(this.meterCapacity, this.meter + 1);
    const gained = Math.round(this.cfg.polarity.absorbPoints * this.mods.absorbPoints);
    this.score += gained;
    return { absorbed: true, damaged: false, points: gained };
  }

  /**
   * A bullet went past.
   *
   * Graded as a refusal, but only if the ship could plausibly have reached it.
   * Charging a player for declining something that crossed the far side of the
   * screen while they were pinned would be scoring a decision they never had.
   */
  bulletExpired(bulletId: number, closestApproach: number, secondsOnScreen: number): void {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return;
    this.bullets.delete(bulletId);

    const p = this.cfg.polarity;
    if (
      !wasReachable(closestApproach, secondsOnScreen, { speed: p.shipSpeed, radius: p.shipRadius, smoothing: p.moveSmoothing }, p.graceRadius)
    ) {
      return;
    }
    this.grade(bullet.cls, bullet.value, 'passed');
  }

  /**
   * Wipe a bullet off the board without judging it.
   *
   * Cancelled fire is not evidence. The player never chose to take it or leave
   * it — a carrier died nearby and the shot stopped existing — so scoring it
   * either way would be inventing a decision. Same ruling Factor Storm makes
   * about rocks removed by a nuke, and it is what keeps a big cancel from
   * quietly moving a rating.
   */
  cancelBullet(bulletId: number): number | undefined {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return undefined;
    this.bullets.delete(bulletId);
    this.score += Math.round(this.cfg.polarity.cancelPoints * this.mods.cancelPoints);
    this.cancelled += 1;
    return bullet.value;
  }

  private takeDamage(): void {
    this.damageTaken += 1;
    this.hp -= 1;
  }

  // --- rating ---

  private ledgerFor(divisor: number): Ledger | undefined {
    if (skillIdsFor(divisor).length === 0) return undefined;
    let led = this.ledgers.get(divisor);
    if (!led) {
      led = { signal: new SignalLedger(), difficulties: [] };
      this.ledgers.set(divisor, led);
    }
    return led;
  }

  /**
   * File one resolved bullet against both of the wave's divisors, then cash any
   * ledger that has seen enough.
   *
   * Ledgers are keyed on the divisor rather than on the wave, so evidence about
   * the sevens gathered before a RECOMPOSE and after it is the same pile. That
   * is also why a flush is driven by trial count and not by the wave ending:
   * sensitivity measured over eight trials and over twenty are not the same
   * number, and a single K factor is already assuming they would be.
   */
  private grade(cls: MoteClass, value: number, res: Resolution): void {
    ([['a', this.pair[0]], ['b', this.pair[1]]] as const).forEach(([role, divisor]) => {
      const led = this.ledgerFor(divisor);
      if (!led) return;
      const before = led.signal.peek();
      led.signal.add(cls, res, role);
      const after = led.signal.peek();
      // Only count difficulty for a bullet that actually became evidence — a
      // bridge taken under the other divisor is excluded and proves nothing.
      const counted =
        before.hits !== after.hits ||
        before.misses !== after.misses ||
        before.falseAlarms !== after.falseAlarms ||
        before.correctRejections !== after.correctRejections;
      if (counted) led.difficulties.push(difficultyFor(divisor, value));
      this.cash(divisor, led);
    });
  }

  private cash(divisor: number, led: Ledger): void {
    const p = this.cfg.polarity;
    const d = led.signal.flush(p.ledger);
    if (d === undefined) return;

    const difficulty =
      led.difficulties.length > 0
        ? led.difficulties.reduce((a, b) => a + b, 0) / led.difficulties.length
        : difficultyFor(divisor, p.valueLo);
    led.difficulties = [];

    this.skills = applyAttempt(
      this.skills,
      skillIdsFor(divisor),
      {
        correct: d >= p.correctDPrime,
        responseMs: 0,
        difficulty,
        wave: this.globalWave,
        // A batch has no pace. It also means these skills never bank fluency,
        // so a mastery milestone can never be earned on recognition alone —
        // which is the right ruling: knowing 84 is a seven is not knowing 7x12.
        untimed: true,
        partial: partialFor(d),
      },
      this.cfg.rating,
    );
  }

  /** Sensitivity so far on a divisor, for the HUD. Undefined until it has data. */
  sensitivityFor(divisor: number): number | undefined {
    const led = this.ledgers.get(divisor);
    if (!led) return undefined;
    const c = led.signal.peek();
    if (c.hits + c.misses + c.falseAlarms + c.correctRejections === 0) return undefined;
    return dPrime(c);
  }

  // --- RECOMPOSE ---

  /**
   * Divisors the meter could re-declare the wave with, best first.
   *
   * Spending it is not a screen-clear and deliberately not: a bomb would blow a
   * hole in the ledger, since a bullet nobody judged cannot be scored. This
   * asks the player to look at a field under fire and pick the divisor that
   * turns the most of it friendly — the most arithmetic thing the reward could
   * have been — and every bullet on screen stays graded, now against the pair
   * the player chose.
   */
  recomposeOptions(): readonly number[] {
    const keep = this.pair[0];
    const carriers = this.liveCarriers;
    const candidates = legalPairs()
      .filter(([a, b]) => a === keep || b === keep)
      .map(([a, b]) => (a === keep ? b : a))
      .filter((d) => d !== this.pair[1]);

    const live = [...carriers.map((c) => c.value), ...this.liveBullets.map((b) => b.value)];
    const safety = (d: number): number => live.filter((v) => v % d === 0 || v % keep === 0).length;
    return [...candidates].sort((x, y) => safety(y) - safety(x));
  }

  /**
   * Spend the meter and re-declare the pair, reclassifying the live field.
   *
   * Returns the carriers the new pair scattered, or null if the meter was not
   * full. A carrier divisible by neither half of the pair you chose could never
   * be broken by anything — it would fall untouchable, wearing the wild colour,
   * and the player would never learn why. Rather than leave that on the board,
   * those carriers flee: no points, no chain, filed with the coach as ones that
   * got away. That makes the choice of divisor a real cost rather than a free
   * reshuffle, which is what a spent meter should buy.
   */
  recompose(divisor: number): readonly number[] | null {
    if (!this.recomposeReady) return null;
    const keep = this.pair[0];
    if (!legalPairs().some(([a, b]) => (a === keep && b === divisor) || (b === keep && a === divisor))) {
      return null;
    }
    this.meter = 0;
    this.pair = [keep, divisor];

    const scattered: number[] = [];
    for (const c of [...this.carriers.values()]) {
      const cls = classOf(c.value, keep, divisor);
      if (cls === 'neither') {
        scattered.push(c.id);
        this.carrierEscaped(c.id);
        continue;
      }
      c.cls = cls;
    }
    for (const b of this.bullets.values()) b.cls = classOf(b.value, keep, divisor);
    this.polarity = 'a';
    this.lockoutRemaining = this.cfg.polarity.swapLockoutSeconds;
    return scattered;
  }

  // --- the coach ---

  private noteCarrier(carrier: LiveCarrier, killed: boolean): void {
    const divisor = carrier.value % this.pair[0] === 0 ? this.pair[0] : this.pair[1];
    const skillId = skillIdsFor(divisor)[0];
    if (!skillId) return;
    this.trouble = recordTrouble(
      this.trouble,
      {
        mode: 'polarity',
        prompt: `${carrier.value} — MULTIPLE OF ${divisor}?`,
        answer: 'YES',
        skillId,
        correct: killed,
        responseMs: 0,
        wave: this.globalWave,
      },
      this.cfg.coach,
    );
  }

  /** Close the wave and hand back a tip, if the table has one worth giving. */
  endWave(): CoachPick | undefined {
    this.chainState = newChain();
    this.bullets.clear();
    const pick = selectTip(this.skills, this.globalWave, COACH_RECENCY_WAVES, this.lastTipSkill);
    if (pick) this.lastTipSkill = pick.skillId;
    return pick;
  }

  /**
   * Cash whatever is left at the end of a run — only the ledgers that cleared
   * the bar. A handful of bullets is not a reading, and rounding it up to one
   * at the buzzer would undo the point of gating them.
   */
  finish(): void {
    for (const [divisor, led] of this.ledgers) this.cash(divisor, led);
  }

  // --- results ---

  stats(): RunStats {
    return {
      score: this.score,
      wavesCleared: Math.max(0, this.waveInRun - (this.gameOver ? 1 : 0)),
      kills: this.kills,
      misses: this.damageTaken,
      bestStreak: this.bestLinks,
    };
  }

  creditsEarned(): number {
    const p = this.cfg.polarity;
    const stats = this.stats();
    return (
      creditsForRun(stats, this.cfg.economy) +
      stats.wavesCleared * p.waveCredits +
      this.totalLinks * p.linkCredits
    );
  }
}
