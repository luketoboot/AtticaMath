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
 * So what is left to spend on is personality — and, since a catalogue you can
 * buy front-to-back with enough grinding is just a long receipt, standing.
 * Most of the shelf takes credits alone; the rest will not sell at any price
 * until the skill table says you earned it. That is what makes the hangar a
 * trophy case rather than a wardrobe, and it costs the leaderboard nothing,
 * because a locked item is still only a shape and a colour.
 *
 * Five slots, one per surface the player looks at:
 *   hull, trail   — the ship, in the free-flight modes
 *   cannon, burst — the turret and its kills, in Meteor Defense
 *   badge         — the emblem beside your initials on the board
 *
 * Pure data and pure functions. Colours live here as numbers because the shapes
 * and the palette are one design decision, and splitting them would mean
 * editing two files to add a ship.
 */
import { findSkill, type SkillId } from '../skills/taxonomy';

export type CosmeticKind = 'hull' | 'trail' | 'cannon' | 'burst' | 'badge';

/**
 * What a player must have done before an item will sell. `open` is the plain
 * case — money is the only gate. The rest read the save's own record, so no
 * unlock can be bought, and none of them touch how a run plays.
 */
export type Unlock =
  | { kind: 'open' }
  /** Best score across every mode. */
  | { kind: 'score'; value: number }
  /** Lifetime waves cleared. */
  | { kind: 'waves'; value: number }
  /** This many skills mastered, whichever ones. */
  | { kind: 'mastery'; count: number }
  /** One named skill mastered. */
  | { kind: 'skill'; skillId: SkillId };

/** The slice of a save an unlock check is allowed to see. */
export interface CosmeticProgress {
  bestScore: number;
  totalWaves: number;
  /** Milestone ids already earned, e.g. `mastery.mul.table.9`. */
  milestones: readonly string[];
}

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  /** One line of flavour. Never a stat. */
  description: string;
  /** Credits. Zero means it is owned from the start. */
  price: number;
  /** What must be true before it will sell at all. Absent means `open`. */
  unlock?: Unlock;
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

/**
 * A Meteor Defense turret. Coordinates are pixels with the ground line at y=0
 * and the muzzle at -y, matching the silhouette the cannon has always had —
 * every barrel is decoration over the same point, since the shot leaves from
 * the cannon's x and nothing here moves it.
 */
export interface CannonDef extends CosmeticDef {
  kind: 'cannon';
  outline: readonly (readonly [number, number])[];
  /** Half-width of the tread bar under it. */
  treadHalf: number;
}

/** Colours for the kill burst in Meteor Defense. */
export interface BurstDef extends CosmeticDef {
  kind: 'burst';
  core: number;
  spark: number;
}

export type BadgeShape =
  | 'star'
  | 'diamond'
  | 'triangle'
  | 'circle'
  | 'square'
  | 'cross'
  | 'ring'
  | 'bolt'
  | 'hex'
  | 'chevron';

/** An emblem drawn beside your initials wherever the game names you. */
export interface BadgeDef extends CosmeticDef {
  kind: 'badge';
  shape: BadgeShape;
  color: number;
}

// --- hulls -----------------------------------------------------------------

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
    id: 'hull.needle',
    kind: 'hull',
    name: 'NEEDLE',
    description: 'Almost no ship at all. Mostly nose.',
    price: 550,
    outline: [
      [0, -1.5],
      [0.28, -0.1],
      [0.55, 0.95],
      [0, 0.62],
      [-0.55, 0.95],
      [-0.28, -0.1],
    ],
    detail: [
      [0, -1.1],
      [0, 0.4],
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
  {
    id: 'hull.mantis',
    kind: 'hull',
    name: 'MANTIS',
    description: 'Folded arms out front. Waiting for something to hold.',
    price: 1200,
    unlock: { kind: 'waves', value: 60 },
    outline: [
      [0, -1.3],
      [0.62, -0.95],
      [0.5, -0.15],
      [1.05, 0.85],
      [0.4, 0.62],
      [0, 0.95],
      [-0.4, 0.62],
      [-1.05, 0.85],
      [-0.5, -0.15],
      [-0.62, -0.95],
    ],
  },
  {
    id: 'hull.anvil',
    kind: 'hull',
    name: 'ANVIL',
    description: 'Blunt on purpose. Looks like it lands on things.',
    price: 1400,
    unlock: { kind: 'mastery', count: 8 },
    outline: [
      [-0.55, -1.0],
      [0.55, -1.0],
      [0.78, -0.35],
      [1.12, 0.7],
      [0.42, 0.5],
      [0, 0.92],
      [-0.42, 0.5],
      [-1.12, 0.7],
      [-0.78, -0.35],
    ],
    detail: [
      [-0.4, -0.62],
      [0.4, -0.62],
    ],
  },
  {
    id: 'hull.sable',
    kind: 'hull',
    name: 'SABLE',
    description: 'Long, curved and quiet. The one they talk about.',
    price: 2000,
    unlock: { kind: 'score', value: 25000 },
    outline: [
      [0, -1.45],
      [0.34, -0.72],
      [0.92, 0.15],
      [1.02, 0.98],
      [0.46, 0.72],
      [0, 1.08],
      [-0.46, 0.72],
      [-1.02, 0.98],
      [-0.92, 0.15],
      [-0.34, -0.72],
    ],
    detail: [
      [0, -1.05],
      [0.3, 0.1],
      [0, 0.66],
      [-0.3, 0.1],
    ],
  },
];

// --- engine trails ---------------------------------------------------------

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
    id: 'trail.rose',
    kind: 'trail',
    name: 'ROSE',
    description: 'Soft pink exhaust on a very unsoft ship.',
    price: 350,
    flame: 0xff8fc7,
    spark: 0xff2d95,
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
  {
    id: 'trail.crimson',
    kind: 'trail',
    name: 'CRIMSON',
    description: 'Dark red, barely burning. Menace on a budget.',
    price: 750,
    flame: 0xff2d2d,
    spark: 0x7a0b2e,
  },
  {
    id: 'trail.frost',
    kind: 'trail',
    name: 'FROST',
    description: 'Pale blue. Somehow reads as cold at speed.',
    price: 900,
    unlock: { kind: 'waves', value: 30 },
    flame: 0xd6f4ff,
    spark: 0x4fb8ff,
  },
  {
    id: 'trail.solar',
    kind: 'trail',
    name: 'SOLAR',
    description: 'Gold, and not subtle about it.',
    price: 1300,
    unlock: { kind: 'score', value: 12000 },
    flame: 0xffd23f,
    spark: 0xff7a00,
  },
  {
    id: 'trail.void',
    kind: 'trail',
    name: 'VOID',
    description: 'The burn goes out and the ship keeps moving.',
    price: 1800,
    unlock: { kind: 'mastery', count: 12 },
    flame: 0x2a0a3a,
    spark: 0xff2d95,
  },
];

// --- cannons ---------------------------------------------------------------

export const CANNONS: readonly CannonDef[] = [
  {
    id: 'cannon.spike',
    kind: 'cannon',
    name: 'SPIKE',
    description: 'The original. One barrel, pointed up.',
    price: 0,
    treadHalf: 26,
    outline: [
      [-22, 0],
      [22, 0],
      [0, -34],
    ],
  },
  {
    id: 'cannon.fork',
    kind: 'cannon',
    name: 'FORK',
    description: 'Two barrels. Fires exactly as often as one.',
    price: 300,
    treadHalf: 28,
    outline: [
      [-24, 0],
      [-16, -30],
      [-6, -30],
      [-4, -12],
      [4, -12],
      [6, -30],
      [16, -30],
      [24, 0],
    ],
  },
  {
    id: 'cannon.howitzer',
    kind: 'cannon',
    name: 'HOWITZER',
    description: 'Short, thick and unbothered.',
    price: 500,
    treadHalf: 30,
    outline: [
      [-26, 0],
      [-18, -22],
      [-9, -30],
      [9, -30],
      [18, -22],
      [26, 0],
    ],
  },
  {
    id: 'cannon.lance',
    kind: 'cannon',
    name: 'LANCE',
    description: 'A very long needle on a very small base.',
    price: 800,
    treadHalf: 22,
    outline: [
      [-18, 0],
      [-5, -20],
      [-3, -46],
      [3, -46],
      [5, -20],
      [18, 0],
    ],
  },
  {
    id: 'cannon.crown',
    kind: 'cannon',
    name: 'CROWN',
    description: 'Three prongs. Ceremonial, allegedly.',
    price: 1100,
    unlock: { kind: 'waves', value: 45 },
    treadHalf: 30,
    outline: [
      [-26, 0],
      [-22, -24],
      [-13, -14],
      [-6, -38],
      [0, -18],
      [6, -38],
      [13, -14],
      [22, -24],
      [26, 0],
    ],
  },
  {
    id: 'cannon.obelisk',
    kind: 'cannon',
    name: 'OBELISK',
    description: 'A monument that happens to shoot.',
    price: 1500,
    unlock: { kind: 'mastery', count: 10 },
    treadHalf: 24,
    outline: [
      [-16, 0],
      [-13, -30],
      [-7, -42],
      [0, -50],
      [7, -42],
      [13, -30],
      [16, 0],
    ],
  },
  {
    id: 'cannon.wing',
    kind: 'cannon',
    name: 'WING',
    description: 'Swept back like it is already moving.',
    price: 1900,
    unlock: { kind: 'score', value: 20000 },
    treadHalf: 32,
    outline: [
      [-34, 0],
      [-12, -12],
      [-6, -36],
      [0, -44],
      [6, -36],
      [12, -12],
      [34, 0],
    ],
  },
];

// --- kill bursts -----------------------------------------------------------

export const BURSTS: readonly BurstDef[] = [
  {
    id: 'burst.cyan',
    kind: 'burst',
    name: 'STANDARD',
    description: 'Cyan on the kill. What the rocks expect.',
    price: 0,
    core: 0x00f0ff,
    spark: 0x00f0ff,
  },
  {
    id: 'burst.gold',
    kind: 'burst',
    name: 'BULLION',
    description: 'Every rock pays out in gold.',
    price: 400,
    core: 0xffe64d,
    spark: 0xffa22d,
  },
  {
    id: 'burst.magenta',
    kind: 'burst',
    name: 'HOTLINE',
    description: 'Magenta, the house colour.',
    price: 600,
    core: 0xff2d95,
    spark: 0xc46cff,
  },
  {
    id: 'burst.lime',
    kind: 'burst',
    name: 'HAZARD',
    description: 'Chemical green. Reads from across the room.',
    price: 900,
    unlock: { kind: 'waves', value: 25 },
    core: 0x7dff4d,
    spark: 0xd6f4ff,
  },
  {
    id: 'burst.white',
    kind: 'burst',
    name: 'FLASHPOINT',
    description: 'No colour at all. Just a hole where the rock was.',
    price: 1600,
    unlock: { kind: 'score', value: 15000 },
    core: 0xffffff,
    spark: 0xd6f4ff,
  },
];

// --- badges ----------------------------------------------------------------

export const BADGES: readonly BadgeDef[] = [
  {
    id: 'badge.none',
    kind: 'badge',
    name: 'NO MARK',
    description: 'Anonymous. Let the number talk.',
    price: 0,
    shape: 'circle',
    color: 0x3ad6ff,
  },
  {
    id: 'badge.triangle',
    kind: 'badge',
    name: 'DELTA',
    description: 'Change, and the sign of it.',
    price: 200,
    shape: 'triangle',
    color: 0x7dff4d,
  },
  {
    id: 'badge.diamond',
    kind: 'badge',
    name: 'FACET',
    description: 'Cut, weighed, and set.',
    price: 350,
    shape: 'diamond',
    color: 0xff8fc7,
  },
  {
    id: 'badge.cross',
    kind: 'badge',
    name: 'TIMES',
    description: 'The operator that does the most damage.',
    price: 500,
    shape: 'cross',
    color: 0xffa22d,
  },
  {
    id: 'badge.hex',
    kind: 'badge',
    name: 'CELL',
    description: 'Six sides. Tiles with everything.',
    price: 700,
    shape: 'hex',
    color: 0xc46cff,
  },
  {
    id: 'badge.bolt',
    kind: 'badge',
    name: 'SURGE',
    description: 'For answers that arrive before the question lands.',
    price: 1000,
    unlock: { kind: 'skill', skillId: 'mul.table.12' },
    shape: 'bolt',
    color: 0xffe64d,
  },
  {
    id: 'badge.ring',
    kind: 'badge',
    name: 'ORBIT',
    description: 'Closed loop. Nothing gets out.',
    price: 1400,
    unlock: { kind: 'waves', value: 80 },
    shape: 'ring',
    color: 0x00f0ff,
  },
  {
    id: 'badge.star',
    kind: 'badge',
    name: 'FIRST CLASS',
    description: 'Worn by people who finished the table.',
    price: 2200,
    unlock: { kind: 'mastery', count: 16 },
    shape: 'star',
    color: 0xffd23f,
  },
];

export const COSMETICS: readonly CosmeticDef[] = [
  ...HULLS,
  ...TRAILS,
  ...CANNONS,
  ...BURSTS,
  ...BADGES,
];

/** Shop shelves, in menu order. */
export const COSMETIC_KINDS: readonly { kind: CosmeticKind; label: string; blurb: string }[] = [
  { kind: 'hull', label: 'HULL', blurb: 'YOUR SHIP IN THE FREE-FLIGHT MODES' },
  { kind: 'trail', label: 'ENGINE', blurb: 'THE BURN BEHIND IT' },
  { kind: 'cannon', label: 'CANNON', blurb: 'THE TURRET IN METEOR DEFENSE' },
  { kind: 'burst', label: 'BURST', blurb: 'WHAT A KILL LOOKS LIKE' },
  { kind: 'badge', label: 'BADGE', blurb: 'YOUR MARK ON THE BOARD' },
];

export function cosmeticsOfKind(kind: CosmeticKind): CosmeticDef[] {
  return COSMETICS.filter((c) => c.kind === kind);
}

export const DEFAULT_HULL = 'hull.dart';
export const DEFAULT_TRAIL = 'trail.ion';
export const DEFAULT_CANNON = 'cannon.spike';
export const DEFAULT_BURST = 'burst.cyan';
export const DEFAULT_BADGE = 'badge.none';

export interface Equipped {
  hull: string;
  trail: string;
  cannon: string;
  burst: string;
  badge: string;
}

export function defaultEquipped(): Equipped {
  return {
    hull: DEFAULT_HULL,
    trail: DEFAULT_TRAIL,
    cannon: DEFAULT_CANNON,
    burst: DEFAULT_BURST,
    badge: DEFAULT_BADGE,
  };
}

/** The equipped slot a kind writes to. */
export const SLOT_FOR_KIND: Readonly<Record<CosmeticKind, keyof Equipped>> = {
  hull: 'hull',
  trail: 'trail',
  cannon: 'cannon',
  burst: 'burst',
  badge: 'badge',
};

export function findCosmetic(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

// --- unlocks ---------------------------------------------------------------

/** Milestones are stored as `mastery.<skillId>`; count them, ignore the rest. */
function masteredCount(progress: CosmeticProgress): number {
  return progress.milestones.filter((m) => m.startsWith('mastery.')).length;
}

export interface UnlockState {
  /**
   * Numeric progress toward the gate, for gates that accumulate. A locked item
   * quoting only its requirement is a wall; quoting 6/8 is a countdown, and a
   * countdown points the player back at play. Absent for binary gates.
   */
  current?: number;
  target?: number;
  unlocked: boolean;
  /** Short requirement line for the shop, or undefined when money is the only gate. */
  requirement?: string;
}

/**
 * Whether an item will sell, and what it is waiting for if not. Pure over a
 * progress snapshot, so the shop, a test and any future summary all agree.
 */
export function unlockState(def: CosmeticDef, progress: CosmeticProgress): UnlockState {
  const unlock = def.unlock ?? { kind: 'open' };
  switch (unlock.kind) {
    case 'open':
      return { unlocked: true };
    case 'score':
      return {
        unlocked: progress.bestScore >= unlock.value,
        requirement: `BEST RUN ${unlock.value.toLocaleString('en-US')}`,
        current: progress.bestScore,
        target: unlock.value,
      };
    case 'waves':
      return {
        unlocked: progress.totalWaves >= unlock.value,
        requirement: `${unlock.value} WAVES CLEARED`,
        current: progress.totalWaves,
        target: unlock.value,
      };
    case 'mastery':
      return {
        unlocked: masteredCount(progress) >= unlock.count,
        requirement: `MASTER ${unlock.count} SKILLS`,
        current: masteredCount(progress),
        target: unlock.count,
      };
    case 'skill': {
      const def2 = findSkill(unlock.skillId);
      return {
        unlocked: progress.milestones.includes(`mastery.${unlock.skillId}`),
        requirement: `MASTER ${(def2?.label ?? unlock.skillId).toUpperCase()}`,
      };
    }
  }
}

/** Progress that unlocks nothing — the shape a fresh profile has. */
export function emptyProgress(): CosmeticProgress {
  return { bestScore: 0, totalWaves: 0, milestones: [] };
}

// --- ownership -------------------------------------------------------------

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

export function cannonFor(id: string): CannonDef {
  return CANNONS.find((c) => c.id === id) ?? CANNONS[0]!;
}

export function burstFor(id: string): BurstDef {
  return BURSTS.find((b) => b.id === id) ?? BURSTS[0]!;
}

export function badgeFor(id: string): BadgeDef {
  return BADGES.find((b) => b.id === id) ?? BADGES[0]!;
}

export interface BuyResult {
  ok: boolean;
  credits: number;
  owned: string[];
  reason?: 'insufficient' | 'already-owned' | 'unknown' | 'locked';
}

export function buyCosmetic(
  id: string,
  credits: number,
  owned: readonly string[],
  progress: CosmeticProgress = emptyProgress(),
): BuyResult {
  const def = findCosmetic(id);
  if (!def) return { ok: false, credits, owned: [...owned], reason: 'unknown' };
  if (isOwned(id, owned)) return { ok: false, credits, owned: [...owned], reason: 'already-owned' };
  // Locked outranks broke: being told the price when the item is not for sale
  // at any price would send the player off to grind the wrong thing.
  if (!unlockState(def, progress).unlocked) {
    return { ok: false, credits, owned: [...owned], reason: 'locked' };
  }
  if (credits < def.price) {
    return { ok: false, credits, owned: [...owned], reason: 'insufficient' };
  }
  return { ok: true, credits: credits - def.price, owned: [...owned, id] };
}

/**
 * Force an equipment record to something wearable. A save that names a hull the
 * player does not own — edited by hand, or left behind by a catalogue change —
 * falls back to the free one rather than rendering nothing. Slots a save
 * predates simply arrive as their defaults, which is what lets the catalogue
 * grow a new slot without a schema version.
 */
export function resolveEquipped(raw: unknown, owned: readonly string[]): Equipped {
  const eq = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Equipped>;
  const out = defaultEquipped();
  const wear = (slot: keyof Equipped, fallback: string): string => {
    const want = eq[slot];
    return typeof want === 'string' && isOwned(want, owned) ? want : fallback;
  };
  out.hull = wear('hull', DEFAULT_HULL);
  out.trail = wear('trail', DEFAULT_TRAIL);
  out.cannon = wear('cannon', DEFAULT_CANNON);
  out.burst = wear('burst', DEFAULT_BURST);
  out.badge = wear('badge', DEFAULT_BADGE);
  return out;
}
