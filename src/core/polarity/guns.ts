/**
 * The gun roster.
 *
 * A weapon pickup in a shmup is a promise about how the next thirty seconds
 * will feel, and the temptation is to make that promise purely about damage.
 * These are built the other way round: each one changes *which numbers you can
 * reach*, so picking one up changes the arithmetic you are doing and not just
 * how fast the field empties.
 *
 *   BOLT    — one shot at what is in front of you. The baseline: you pick a
 *             carrier, you check it, you fire.
 *   GATLING — shreds whatever you are standing under, sprays at anything you
 *             are not, and is gone in eight seconds. Close range, no thinking.
 *   SPREAD  — three at once, so you are checking a fan of numbers rather than a
 *             column. Coverage, at the cost of aiming at nothing in particular.
 *   LANCE   — pierces the whole column and bites every carrier in it the worn
 *             divisor divides. Line up a stack of sevens and take them together.
 *   SEEKER  — bolts that find a valid target for you. The one assist in the set:
 *             it shows you which carriers your divisor divides by going for them,
 *             which is a demonstration rather than an answer.
 *
 * There is no screen-clear. One existed and it was the best gun in the game by
 * a distance — a button that deleted the wave's whole arithmetic at once, which
 * is the opposite of what a mode about reading numbers should reward. Every gun
 * here has to be aimed at something.
 *
 * The prices: only GATLING beats BOLT on raw output, and it pays in accuracy
 * and in a magazine that empties while you are still enjoying it. Everything
 * else buys reach, coverage or certainty and gives up rate to get it.
 *
 * Data only. Ammo lives on the session, geometry and rendering on the scene.
 */

export type GunKind = 'bolt' | 'gatling' | 'spread' | 'lance' | 'seeker';

export interface GunDef {
  kind: GunKind;
  /** Shown on the pod and in the HUD. */
  label: string;
  /** One line, in the mode's voice, for the pickup flash. */
  blurb: string;
  /** Seconds between trigger pulls. */
  cooldown: number;
  /** Bolts per pull, and how wide they fan, in degrees either side of straight. */
  bolts: number;
  spreadDegrees: number;
  /** Trigger pulls before it reverts to BOLT. Null is unlimited. */
  ammo: number | null;
  /** Bolts pass through what they hit rather than stopping. */
  pierces: boolean;
  /** Bolts steer toward a carrier the worn divisor divides. */
  homes: boolean;
  /** How fast this gun's bolts travel, against the base shot speed. */
  speedScale: number;
  /** Radians per second a homing bolt may turn. */
  turnRate: number;
  /** Random wobble either side of each bolt's heading, in degrees. */
  jitterDegrees: number;
  /** Damage per bite, in hull pips. */
  damage: number;
}

export const GUNS: Readonly<Record<GunKind, GunDef>> = {
  bolt: {
    kind: 'bolt',
    label: 'BOLT',
    blurb: 'ONE AT A TIME',
    // The baseline everything else is priced against: accurate, endless, and
    // beaten by every pod at the thing that pod is for.
    cooldown: 0.13,
    bolts: 1,
    spreadDegrees: 0,
    ammo: null,
    pierces: false,
    homes: false,
    speedScale: 1,
    turnRate: 0,
    jitterDegrees: 0,
    damage: 1,
  },
  gatling: {
    kind: 'gatling',
    label: 'GATLING',
    blurb: 'GET CLOSE AND HOLD IT DOWN',
    // The only gun that outguns BOLT, and it is allowed to because it cannot
    // be trusted at range and does not last. Eight seconds of held fire, a
    // wobble on every bolt, and the magazine is done.
    cooldown: 0.055,
    bolts: 1,
    spreadDegrees: 0,
    ammo: 150,
    pierces: false,
    homes: false,
    speedScale: 1.15,
    turnRate: 0,
    jitterDegrees: 8,
    damage: 1,
  },
  spread: {
    kind: 'spread',
    label: 'SPREAD',
    blurb: 'THREE NUMBERS AT ONCE',
    // Slow enough that three bolts landing on one carrier at point blank is a
    // fair reward for being that close rather than the whole gun.
    cooldown: 0.22,
    bolts: 3,
    spreadDegrees: 28,
    ammo: 40,
    pierces: false,
    homes: false,
    speedScale: 0.95,
    turnRate: 0,
    jitterDegrees: 0,
    damage: 1,
  },
  lance: {
    kind: 'lance',
    label: 'LANCE',
    blurb: 'EVERY MULTIPLE IN THE COLUMN',
    // Slow and expensive per pull, but it bites twice and keeps going. Its
    // niche is a stacked column, and it needs to be worth lining one up.
    cooldown: 0.36,
    bolts: 1,
    spreadDegrees: 0,
    ammo: 20,
    pierces: true,
    homes: false,
    speedScale: 1.3,
    turnRate: 0,
    jitterDegrees: 0,
    damage: 2,
  },
  seeker: {
    kind: 'seeker',
    label: 'SEEKER',
    blurb: 'IT FINDS THE MULTIPLES',
    // Guaranteed hits have to be paid for or nothing else is ever worth
    // holding. It pays in tempo: slow bolts, a lazy turn, and a long cooldown,
    // so it cleans up and demonstrates rather than out-damaging the roster.
    cooldown: 0.32,
    bolts: 2,
    spreadDegrees: 40,
    ammo: 30,
    pierces: false,
    homes: true,
    speedScale: 0.62,
    turnRate: 3.4,
    jitterDegrees: 0,
    damage: 1,
  },
};

/** The guns a pod can carry — everything but the one you always have. */
export const POD_GUNS: readonly GunKind[] = ['gatling', 'spread', 'lance', 'seeker'];

/**
 * Bolt headings for one pull, in degrees from straight up.
 *
 * Symmetric about zero, so an odd count always keeps one bolt dead ahead. A
 * spread whose middle drifts off centre makes precise shots impossible, and
 * precise shots are how a player takes the one carrier they meant to.
 */
export function boltAngles(def: GunDef): number[] {
  if (def.bolts <= 0) return [];
  if (def.bolts === 1) return [0];
  const step = (def.spreadDegrees * 2) / (def.bolts - 1);
  return Array.from({ length: def.bolts }, (_, i) => -def.spreadDegrees + i * step);
}

/** What the kill readout says: the division the shot just performed. */
export function killLine(value: number, divisor: number): string {
  return `${value} ÷ ${divisor} = ${value / divisor}`;
}

/**
 * What a bounce says.
 *
 * The remainder, spelled out. "Not a multiple" tells the player they were
 * wrong; "85 ÷ 7 LEAVES 1" tells them by how much, which is the difference
 * between being corrected and being taught — and one step off a multiple is
 * exactly the item they will meet again.
 */
export function bounceLine(value: number, divisor: number): string {
  return `${value} ÷ ${divisor} LEAVES ${value % divisor}`;
}
