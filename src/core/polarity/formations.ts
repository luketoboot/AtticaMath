/**
 * Authored enemy waves, and the checks that keep a filled one fair.
 *
 * This is the mode's answer to a real tension. A chain is a puzzle because the
 * wave is a fixed object you can learn — you meet it, you fail it, you work out
 * the order, and next time you take it apart. Compose the field freshly from
 * the player's skill table every run and that disappears: there is nothing to
 * learn, and the chain collapses into shooting whatever of the right colour is
 * nearest.
 *
 * So the shape is authored and the numbers are not. A formation is the same
 * every time you meet it: the same carriers, arriving at the same moments in
 * the same places, wearing the same *classes*. What the adaptive half chooses
 * is the divisor pair it is declared with and which numbers fill it — so the
 * route through GAUNTLET is a thing you own, while the arithmetic along it is
 * still pitched at you.
 *
 * The cost of generating into an authored shape is that a fill can be
 * unplayable, and a player cannot tell an unplayable wave from a wave they
 * failed. Hence the predicates below: generation retries until the fill is
 * chainable, flyable and fillable, the same bargain Cages makes with its solver.
 *
 * Pure.
 */
import type { PolarityChainConfig } from './chain';
import type { MoteClass } from './signal';

/** What a carrier can be. Nothing divisible by neither divisor could be killed. */
export type CarrierClass = Extract<MoteClass, 'aOnly' | 'bOnly' | 'bridge'>;

export interface Slot {
  /** When this carrier reaches the ship's row, in seconds from the wave start. */
  atSeconds: number;
  cls: CarrierClass;
  /** Where it crosses that row, as a fraction of the arena width. */
  x: number;
  /** Sideways drift on the way down, fractions of width per second. */
  driftX: number;
  /** Descent rate, as a multiple of the wave's base. */
  speed: number;
  /** Shots it takes to break, before the polarity multiplier. */
  hp: number;
  /** Seconds between its shots. Zero means it never fires. */
  fireEvery: number;
}

export interface Formation {
  id: string;
  /** Shown on entry, so a shape the player is learning has a name to learn. */
  name: string;
  slots: readonly Slot[];
}

export interface PathConfig {
  /** Ship traverse speed, as a fraction of arena width per second. */
  shipSpeedFraction: number;
  /** Half-width of a carrier's hull, as a fraction of arena width. */
  killHalfWidth: number;
  /** Links a formation must be able to yield before it is worth shipping. */
  minLinks: number;
}

export function classesOf(formation: Formation): readonly CarrierClass[] {
  return formation.slots.map((s) => s.cls);
}

/** The colour a destroyed carrier counts as for the chain. */
function colourOf(cls: CarrierClass): 'a' | 'b' | 'joker' {
  if (cls === 'aOnly') return 'a';
  if (cls === 'bOnly') return 'b';
  return 'joker';
}

type Commit = 'none' | 'a' | 'b';
const stateKey = (count: number, commit: Commit): string => `${count}:${commit}`;

/**
 * The most links a perfect player could take out of this order of carriers.
 *
 * Carriers can be left alive, so this is not simply a count of colours: the
 * question is whether the *sequence* admits a subsequence that groups into
 * clean triples. A wave with plenty of both colours can still be unchainable if
 * they alternate and the bridges are all at the wrong end.
 *
 * Small enough to solve exactly — nine states, one pass — so there is no reason
 * to approximate it.
 */
export function maxLinks(classes: readonly CarrierClass[], cfg: PolarityChainConfig): number {
  let best = new Map<string, number>([[stateKey(0, 'none'), 0]]);

  for (const cls of classes) {
    const colour = colourOf(cls);
    const next = new Map(best); // leaving one alive is always allowed

    for (const [key, links] of best) {
      const [countRaw, commitRaw] = key.split(':');
      const count = Number(countRaw);
      const commit = commitRaw as Commit;

      // Killing a colour the run is already committed against would break it,
      // and a player chasing links simply would not.
      if (colour !== 'joker' && commit !== 'none' && commit !== colour) continue;

      const grown = count + 1;
      const commitNow: Commit = colour === 'joker' ? commit : colour;
      const [k, v] =
        grown >= cfg.linkLength ? [stateKey(0, 'none'), links + 1] : [stateKey(grown, commitNow), links];
      if ((next.get(k) ?? -1) < v) next.set(k, v);
    }
    best = next;
  }

  return Math.max(...best.values());
}

export function isChainable(
  classes: readonly CarrierClass[],
  chain: PolarityChainConfig,
  cfg: PathConfig,
): boolean {
  return maxLinks(classes, chain) >= cfg.minLinks;
}

const LANES = 41;

/**
 * Whether the ship can get out of the way of the carriers themselves.
 *
 * Carriers are solid to both polarities — ramming one costs a hull point
 * whatever you are wearing — so avoiding them is the one demand a formation
 * makes that no amount of reading can answer, and the only part of the threat
 * that is fixed at authoring time. Their fire is generated as the wave runs and
 * is kept dodgeable by bounding its density instead.
 *
 * Discretised reachability over the ship's row: lanes across, dilated by how
 * far the ship can travel between one carrier's arrival and the next, with the
 * lanes under each carrier struck out as it lands. If any lane survives the
 * whole sequence, a route exists.
 */
export function hasSafePath(formation: Formation, cfg: PathConfig): boolean {
  const threats = [...formation.slots].sort((p, q) => p.atSeconds - q.atSeconds);
  if (threats.length === 0) return true;

  const laneX = (i: number): number => i / (LANES - 1);
  let open = Array.from({ length: LANES }, (_, i) => i === Math.floor(LANES / 2));
  let prev = 0;

  for (const threat of threats) {
    const reach = cfg.shipSpeedFraction * Math.max(0, threat.atSeconds - prev);
    const spread = Math.floor(reach * (LANES - 1));
    open = open.map((_, i) => {
      for (let j = Math.max(0, i - spread); j <= Math.min(LANES - 1, i + spread); j++) {
        if (open[j]) return true;
      }
      return false;
    });

    for (let i = 0; i < LANES; i++) {
      if (Math.abs(laneX(i) - threat.x) < cfg.killHalfWidth) open[i] = false;
    }
    if (!open.some(Boolean)) return false;
    prev = threat.atSeconds;
  }

  return true;
}

const A = 'aOnly' as const;
const B = 'bOnly' as const;
const BR = 'bridge' as const;

/**
 * The authored waves.
 *
 * Each is built so its own idea is the thing the player has to solve. LADDER
 * hands over clean triples and teaches that triples are what you are looking
 * for. WEAVE alternates, so the only way to chain is to leave things alive.
 * PINCH withholds the third of a colour until a bridge arrives to stand in for
 * it. GAUNTLET is dense and asks the question under fire.
 */
export const FORMATIONS: readonly Formation[] = [
  {
    id: 'ladder',
    name: 'LADDER',
    slots: [
      { atSeconds: 1.2, cls: A, x: 0.25, driftX: 0, speed: 1, hp: 2, fireEvery: 2.2 },
      { atSeconds: 2.0, cls: A, x: 0.4, driftX: 0, speed: 1, hp: 2, fireEvery: 2.2 },
      { atSeconds: 2.8, cls: A, x: 0.55, driftX: 0, speed: 1, hp: 2, fireEvery: 2.2 },
      { atSeconds: 4.2, cls: B, x: 0.7, driftX: 0, speed: 1, hp: 2, fireEvery: 2.2 },
      { atSeconds: 5.0, cls: B, x: 0.55, driftX: 0, speed: 1, hp: 2, fireEvery: 2.2 },
      { atSeconds: 5.8, cls: B, x: 0.4, driftX: 0, speed: 1, hp: 2, fireEvery: 2.2 },
      { atSeconds: 7.2, cls: BR, x: 0.5, driftX: 0, speed: 0.9, hp: 3, fireEvery: 1.8 },
    ],
  },
  {
    id: 'weave',
    name: 'WEAVE',
    slots: [
      { atSeconds: 1.0, cls: A, x: 0.2, driftX: 0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 1.8, cls: B, x: 0.8, driftX: -0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 2.6, cls: A, x: 0.32, driftX: 0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 3.4, cls: B, x: 0.68, driftX: -0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 4.2, cls: A, x: 0.44, driftX: 0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 5.2, cls: BR, x: 0.5, driftX: 0, speed: 0.85, hp: 3, fireEvery: 1.9 },
      { atSeconds: 6.0, cls: B, x: 0.6, driftX: -0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 6.8, cls: A, x: 0.36, driftX: 0.03, speed: 1, hp: 2, fireEvery: 2.4 },
      { atSeconds: 7.6, cls: B, x: 0.64, driftX: -0.03, speed: 1, hp: 2, fireEvery: 2.4 },
    ],
  },
  {
    id: 'pinch',
    name: 'PINCH',
    slots: [
      { atSeconds: 1.0, cls: A, x: 0.15, driftX: 0, speed: 1, hp: 2, fireEvery: 2.3 },
      { atSeconds: 1.8, cls: A, x: 0.32, driftX: 0, speed: 1, hp: 2, fireEvery: 2.3 },
      { atSeconds: 3.0, cls: BR, x: 0.5, driftX: 0, speed: 0.9, hp: 3, fireEvery: 1.7 },
      { atSeconds: 4.0, cls: B, x: 0.78, driftX: 0, speed: 1, hp: 2, fireEvery: 2.3 },
      { atSeconds: 4.8, cls: B, x: 0.62, driftX: 0, speed: 1, hp: 2, fireEvery: 2.3 },
      { atSeconds: 6.0, cls: BR, x: 0.42, driftX: 0.02, speed: 0.9, hp: 3, fireEvery: 1.7 },
      { atSeconds: 7.0, cls: A, x: 0.3, driftX: 0, speed: 1, hp: 2, fireEvery: 2.3 },
      { atSeconds: 7.9, cls: BR, x: 0.66, driftX: 0, speed: 0.9, hp: 3, fireEvery: 1.7 },
    ],
  },
  {
    id: 'gauntlet',
    name: 'GAUNTLET',
    slots: [
      { atSeconds: 1.0, cls: A, x: 0.6, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 1.7, cls: A, x: 0.42, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 2.5, cls: BR, x: 0.2, driftX: 0.04, speed: 0.95, hp: 3, fireEvery: 1.6 },
      { atSeconds: 3.4, cls: B, x: 0.3, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 4.1, cls: B, x: 0.52, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 5.0, cls: BR, x: 0.74, driftX: -0.03, speed: 0.95, hp: 3, fireEvery: 1.6 },
      { atSeconds: 5.9, cls: A, x: 0.38, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 6.6, cls: A, x: 0.58, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 7.5, cls: B, x: 0.46, driftX: 0, speed: 1.05, hp: 2, fireEvery: 1.9 },
      { atSeconds: 8.3, cls: BR, x: 0.5, driftX: 0, speed: 0.9, hp: 4, fireEvery: 1.4 },
    ],
  },
];

export function formationById(id: string): Formation {
  const found = FORMATIONS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown formation: ${id}`);
  return found;
}

/** How long a formation runs, from its last arrival. */
export function durationOf(formation: Formation): number {
  return Math.max(...formation.slots.map((s) => s.atSeconds));
}
