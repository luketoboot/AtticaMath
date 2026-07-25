/**
 * Cosmetics. Credits buy looks, never advantage.
 *
 * The shop used to sell stat upgrades — extra HP, a slow field, a free miss.
 * That is a problem for a game whose whole point is a score going up: two runs
 * are only comparable if both players brought the same ship, and a board where
 * the top entries belong to whoever grinded credits first measures patience
 * rather than arithmetic. Everything that changes how a run plays is now earned
 * inside the run, as a drop.
 *
 * So what is left to spend on is personality. A hull silhouette and an engine
 * colour change nothing about how the ship handles, which means they can be
 * bought, shown off, and completely ignored by the leaderboard.
 *
 * Pure data and pure functions. Colours live here as numbers because the shapes
 * and the palette are one design decision, and splitting them would mean
 * editing two files to add a ship.
 */

export type CosmeticKind = 'hull' | 'trail';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  /** One line of flavour. Never a stat. */
  description: string;
  /** Credits. Zero means it is owned from the start. */
  price: number;
}

/**
 * A hull outline in ship-local space: nose at -y, in units of the ship radius.
 * The renderer scales these by `CONFIG.flight.shipRadius`, so every hull has
 * the same hitbox no matter how it looks — which is the point.
 */
export interface HullDef extends CosmeticDef {
  kind: 'hull';
  outline: readonly (readonly [number, number])[];
  /** Optional inner detail line, drawn dimmer. */
  detail?: readonly (readonly [number, number])[];
}

export interface TrailDef extends CosmeticDef {
  kind: 'trail';
  /** Flame core and the particle trail behind it. */
  flame: number;
  spark: number;
}

export const HULLS: readonly HullDef[] = [
  {
    id: 'hull.dart',
    kind: 'hull',
    name: 'DART',
    description: 'Standard issue. Nothing to apologise for.',
    price: 0,
    outline: [
      [0, -1.25],
      [0.85, 0.9],
      [0, 0.45],
      [-0.85, 0.9],
    ],
  },
  {
    id: 'hull.wedge',
    kind: 'hull',
    name: 'WEDGE',
    description: 'Flat, wide and mean. Takes up more of the sky.',
    price: 400,
    outline: [
      [0, -1.1],
      [0.35, -0.5],
      [1.15, 0.75],
      [0.4, 0.55],
      [0, 0.9],
      [-0.4, 0.55],
      [-1.15, 0.75],
      [-0.35, -0.5],
    ],
  },
  {
    id: 'hull.talon',
    kind: 'hull',
    name: 'TALON',
    description: 'Forward-swept and unfriendly. Hooks at the back.',
    price: 700,
    outline: [
      [0, -1.35],
      [0.5, -0.2],
      [1.0, 1.02],
      [0.45, 0.7],
      [0, 1.0],
      [-0.45, 0.7],
      [-1.0, 1.02],
      [-0.5, -0.2],
    ],
    detail: [
      [0, -0.8],
      [0, 0.5],
    ],
  },
  {
    id: 'hull.ring',
    kind: 'hull',
    name: 'HALO',
    description: 'A cockpit inside a ring. Should not fly. Does.',
    price: 1000,
    outline: [
      [0, -1.2],
      [0.7, -0.75],
      [1.0, 0.1],
      [0.62, 0.95],
      [0, 1.15],
      [-0.62, 0.95],
      [-1.0, 0.1],
      [-0.7, -0.75],
    ],
    detail: [
      [0, -0.55],
      [0.42, 0.05],
      [0, 0.6],
      [-0.42, 0.05],
    ],
  },
];

export const TRAILS: readonly TrailDef[] = [
  {
    id: 'trail.ion',
    kind: 'trail',
    name: 'ION BLUE',
    description: 'The burn everyone starts with.',
    price: 0,
    flame: 0x00f0ff,
    spark: 0x6320a0,
  },
  {
    id: 'trail.ember',
    kind: 'trail',
    name: 'EMBER',
    description: 'Runs hot. Leaves orange in the dark.',
    price: 250,
    flame: 0xffa22d,
    spark: 0xff3b3b,
  },
  {
    id: 'trail.viper',
    kind: 'trail',
    name: 'VIPER',
    description: 'Acid green. Nobody asked for this.',
    price: 250,
    flame: 0x7dff4d,
    spark: 0x0aa8c0,
  },
  {
    id: 'trail.violet',
    kind: 'trail',
    name: 'VIOLET',
    description: 'Deep purple exhaust. Very expensive-looking.',
    price: 450,
    flame: 0xc46cff,
    spark: 0xff2d95,
  },
  {
    id: 'trail.bone',
    kind: 'trail',
    name: 'BONE',
    description: 'White-hot. Reads as a hole in the screen.',
    price: 600,
    flame: 0xffffff,
    spark: 0xffe64d,
  },
];

export const COSMETICS: readonly CosmeticDef[] = [...HULLS, ...TRAILS];

export const DEFAULT_HULL = 'hull.dart';
export const DEFAULT_TRAIL = 'trail.ion';

export interface Equipped {
  hull: string;
  trail: string;
}

export function defaultEquipped(): Equipped {
  return { hull: DEFAULT_HULL, trail: DEFAULT_TRAIL };
}

export function findCosmetic(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

/** Free items are owned without ever being bought, so a save starts complete. */
export function isOwned(id: string, owned: readonly string[]): boolean {
  const def = findCosmetic(id);
  if (!def) return false;
  return def.price === 0 || owned.includes(id);
}

export function hullFor(id: string): HullDef {
  return HULLS.find((h) => h.id === id) ?? HULLS[0]!;
}

export function trailFor(id: string): TrailDef {
  return TRAILS.find((t) => t.id === id) ?? TRAILS[0]!;
}

export interface BuyResult {
  ok: boolean;
  credits: number;
  owned: string[];
  reason?: 'insufficient' | 'already-owned' | 'unknown';
}

export function buyCosmetic(id: string, credits: number, owned: readonly string[]): BuyResult {
  const def = findCosmetic(id);
  if (!def) return { ok: false, credits, owned: [...owned], reason: 'unknown' };
  if (isOwned(id, owned)) return { ok: false, credits, owned: [...owned], reason: 'already-owned' };
  if (credits < def.price) {
    return { ok: false, credits, owned: [...owned], reason: 'insufficient' };
  }
  return { ok: true, credits: credits - def.price, owned: [...owned, id] };
}

/**
 * Force an equipment record to something wearable. A save that names a hull the
 * player does not own — edited by hand, or left behind by a catalogue change —
 * falls back to the free one rather than rendering nothing.
 */
export function resolveEquipped(raw: unknown, owned: readonly string[]): Equipped {
  const eq = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Equipped>;
  const hull = typeof eq.hull === 'string' && isOwned(eq.hull, owned) ? eq.hull : DEFAULT_HULL;
  const trail = typeof eq.trail === 'string' && isOwned(eq.trail, owned) ? eq.trail : DEFAULT_TRAIL;
  return { hull, trail };
}
