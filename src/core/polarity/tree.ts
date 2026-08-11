/**
 * The POLARITY skill tree.
 *
 * Modelled on BYTEPATH's, with three deliberate departures.
 *
 * **It resets every run.** BYTEPATH's tree is permanent meta-progression, and
 * a permanent one here would break every board in the game — this codebase
 * argues in three separate places that nothing purchasable may change a run,
 * and a previous stat-upgrade system was deleted and refunded for exactly that
 * reason. So skill points drop *during* a run, are spent *during* that run, and
 * the whole thing is wiped on death. Every run starts from the same empty tree,
 * which keeps runs comparable and makes the route you took the story of the run
 * rather than the story of your account. It is also what `core/drops.ts`
 * already says this game does: everything that helps is earned inside the run.
 *
 * **The nodes are typed, not stringly.** BYTEPATH stores effects as
 * `{display, attribute_name, value}` triples and needs a hand-maintained
 * approved-list plus a runtime `error()` to catch a mistyped attribute across
 * 900 nodes. Here a node carries a `Partial<Mods>` and the compiler does that
 * job for nothing.
 *
 * **The filler is generated, not typed out.** BYTEPATH's tree is a 146KB
 * hand-written coordinate table; 87% of it is small percentage nodes, the most
 * duplicated appearing thirty-two times. That repetition is not waste — with a
 * hard cap on how many nodes you may own, cheap nodes are the *pathing cost*
 * that makes reaching a keystone a real commitment. But it does not need to be
 * typed by hand. The interesting nodes are authored; the connective tissue
 * between them is generated along each branch, so the shape stays fixed and
 * learnable while the file stays readable.
 *
 * **The one rule the tree may not break:** no node may make the arithmetic
 * easier to *read*. Nothing here highlights which carriers are multiples,
 * auto-flips, or answers a division for you. Nodes change how strong you are,
 * never what you know — otherwise the mode stops measuring recognition and
 * starts measuring how far down a branch you got. The `Mods` shape below is the
 * enforcement: there is simply no field that could reveal anything.
 */

export type Branch = 'thrust' | 'ordnance' | 'resonance' | 'salvage';

/**
 * Everything the tree is allowed to change, and nothing else.
 *
 * Multipliers default to 1, flats and chances to 0, flags to false. Effects
 * accumulate additively across bought nodes and are resolved once — the same
 * discipline BYTEPATH uses, and the reason node order never matters.
 */
export interface Mods {
  // --- the ship ---
  /** Traverse speed. */
  speed: number;
  /** Hull points added at the start of the run. */
  bonusHull: number;
  /** Seconds shaved off the flip lockout. */
  flipRecovery: number;
  /** Movement multiplier while focus is held — higher is less of a penalty. */
  focusMobility: number;

  // --- the gun ---
  /** Rate of fire. */
  fireRate: number;
  /** Bolt travel speed. */
  shotSpeed: number;
  /** Extra hull pips per bite. */
  bonusDamage: number;
  /** Every gun's magazine. */
  ammo: number;

  // --- taking fire ---
  /** Points for an absorbed bullet. */
  absorbPoints: number;
  /** Bullets needed to charge RECOMPOSE — lower is faster. */
  meterRate: number;
  /** Radius a kill cancels fire within. */
  cancelRadius: number;
  /** Points per cancelled shot. */
  cancelPoints: number;

  // --- scoring ---
  /** Points for breaking a carrier. */
  killPoints: number;
  /** What a chain link pays. */
  chainPayout: number;

  // --- the run ---
  /** Odds a kill leaves a weapon pod. */
  podChance: number;
  /** Odds a kill leaves a skill point. */
  spChance: number;

  // --- rule changes, the ones worth pathing for ---
  /** Bolts pass through whatever they break. */
  pierce: boolean;
  /** A bridge counts as two absorptions toward the chain. */
  bridgesCountDouble: boolean;
  /** Taking a hull hit no longer breaks the chain. */
  chainSurvivesDamage: boolean;
  /** While focus is held, wilds are absorbed instead of hurting. */
  focusEatsWilds: boolean;
  /** A completed link repairs a hull point. */
  linksRepair: boolean;
  /** Absorbing pulls nearby safe bullets toward the ship. */
  magnet: number;
}

export function baseMods(): Mods {
  return {
    speed: 1,
    bonusHull: 0,
    flipRecovery: 0,
    focusMobility: 1,
    fireRate: 1,
    shotSpeed: 1,
    bonusDamage: 0,
    ammo: 1,
    absorbPoints: 1,
    meterRate: 1,
    cancelRadius: 1,
    cancelPoints: 1,
    killPoints: 1,
    chainPayout: 1,
    podChance: 1,
    spChance: 0,
    pierce: false,
    bridgesCountDouble: false,
    chainSurvivesDamage: false,
    focusEatsWilds: false,
    linksRepair: false,
    magnet: 0,
  };
}

/** 1 is a small stat, 2 a notable, 3 a keystone. Cost follows size. */
export type NodeSize = 1 | 2 | 3;
export const NODE_COST: Readonly<Record<NodeSize, number>> = { 1: 1, 2: 3, 3: 6 };

export interface TreeNode {
  id: number;
  branch: Branch;
  x: number;
  y: number;
  size: NodeSize;
  label: string;
  mods: Partial<Mods>;
  links: number[];
}

/** What a run has bought so far. Reset every run — see the file header. */
export interface TreeState {
  bought: readonly number[];
  /** Unspent points in hand. */
  points: number;
}

export const ROOT_ID = 0;

export function newTree(): TreeState {
  return { bought: [ROOT_ID], points: 0 };
}

// --- authoring ---------------------------------------------------------

/** A rung on a branch: the interesting ones are written out, the rest repeat. */
interface Rung {
  label: string;
  mods: Partial<Mods>;
  size?: NodeSize;
  /** Repeat this rung n times along the spine. The filler, and the cost. */
  times?: number;
}

const BRANCHES: Readonly<Record<Branch, { heading: number; rungs: readonly Rung[] }>> = {
  // Up-left: getting out of the way, and the flip.
  thrust: {
    heading: -140,
    rungs: [
      { label: '+6% THRUST', mods: { speed: 0.06 }, times: 3 },
      { label: '+1 HULL', mods: { bonusHull: 1 }, size: 2 },
      { label: '+6% THRUST', mods: { speed: 0.06 }, times: 3 },
      { label: 'FLIP RECOVERS 25% FASTER', mods: { flipRecovery: 0.25 }, size: 2 },
      { label: '+6% THRUST', mods: { speed: 0.06 }, times: 2 },
      { label: 'FOCUS COSTS LESS SPEED', mods: { focusMobility: 0.35 }, size: 2 },
      { label: '+6% THRUST', mods: { speed: 0.06 }, times: 3 },
      { label: '+1 HULL', mods: { bonusHull: 1 }, size: 2 },
      { label: '+6% THRUST', mods: { speed: 0.06 }, times: 2 },
      {
        label: 'FOCUS EATS WILDS\n−25% THRUST',
        mods: { focusEatsWilds: true, speed: -0.25 },
        size: 3,
      },
    ],
  },
  // Up-right: the gun.
  ordnance: {
    heading: -40,
    rungs: [
      { label: '+7% FIRE RATE', mods: { fireRate: 0.07 }, times: 3 },
      { label: '+15% BOLT SPEED', mods: { shotSpeed: 0.15 }, size: 2 },
      { label: '+7% FIRE RATE', mods: { fireRate: 0.07 }, times: 3 },
      { label: '+25% MAGAZINE', mods: { ammo: 0.25 }, size: 2 },
      { label: '+7% FIRE RATE', mods: { fireRate: 0.07 }, times: 2 },
      { label: 'PODS 40% MORE OFTEN', mods: { podChance: 0.4 }, size: 2 },
      { label: '+7% FIRE RATE', mods: { fireRate: 0.07 }, times: 3 },
      { label: '+1 DAMAGE\n−30% FIRE RATE', mods: { bonusDamage: 1, fireRate: -0.3 }, size: 2 },
      { label: '+7% FIRE RATE', mods: { fireRate: 0.07 }, times: 2 },
      { label: 'BOLTS PIERCE\n−20% FIRE RATE', mods: { pierce: true, fireRate: -0.2 }, size: 3 },
    ],
  },
  // Down-left: the chain, and what a link is worth.
  resonance: {
    heading: 140,
    rungs: [
      { label: '+8% LINK PAYOUT', mods: { chainPayout: 0.08 }, times: 3 },
      { label: '+20% KILL POINTS', mods: { killPoints: 0.2 }, size: 2 },
      { label: '+8% LINK PAYOUT', mods: { chainPayout: 0.08 }, times: 3 },
      { label: 'A LINK REPAIRS A HULL POINT', mods: { linksRepair: true }, size: 2 },
      { label: '+8% LINK PAYOUT', mods: { chainPayout: 0.08 }, times: 2 },
      { label: 'RECOMPOSE CHARGES 25% FASTER', mods: { meterRate: -0.25 }, size: 2 },
      { label: '+8% LINK PAYOUT', mods: { chainPayout: 0.08 }, times: 3 },
      { label: 'BRIDGES COUNT DOUBLE', mods: { bridgesCountDouble: true }, size: 2 },
      { label: '+8% LINK PAYOUT', mods: { chainPayout: 0.08 }, times: 2 },
      {
        label: 'A HIT NO LONGER BREAKS THE CHAIN\n−1 HULL',
        mods: { chainSurvivesDamage: true, bonusHull: -1 },
        size: 3,
      },
    ],
  },
  // Down-right: eating fire, and turning it into points.
  salvage: {
    heading: 40,
    rungs: [
      { label: '+12% ABSORB POINTS', mods: { absorbPoints: 0.12 }, times: 3 },
      { label: '+20% CANCEL RADIUS', mods: { cancelRadius: 0.2 }, size: 2 },
      { label: '+12% ABSORB POINTS', mods: { absorbPoints: 0.12 }, times: 3 },
      { label: '+25% CANCEL VALUE', mods: { cancelPoints: 0.25 }, size: 2 },
      { label: '+12% ABSORB POINTS', mods: { absorbPoints: 0.12 }, times: 2 },
      { label: 'SAFE BULLETS DRIFT TOWARD YOU', mods: { magnet: 70 }, size: 2 },
      { label: '+12% ABSORB POINTS', mods: { absorbPoints: 0.12 }, times: 3 },
      { label: 'KILLS DROP SKILL POINTS MORE OFTEN', mods: { spChance: 0.1 }, size: 2 },
      { label: '+12% ABSORB POINTS', mods: { absorbPoints: 0.12 }, times: 2 },
      {
        label: 'CANCEL REACHES TWICE AS FAR\n−25% KILL POINTS',
        mods: { cancelRadius: 1, killPoints: -0.25 },
        size: 3,
      },
    ],
  },
};

const SPINE_STEP = 52;
const TWIG_STEP = 44;
/** Each rung bends the branch slightly, so nothing reads as a straight ruler. */
const CURVE_PER_RUNG = 3.5;

/**
 * Lay the tree out.
 *
 * Deterministic and parameterless, so the shape is identical every run and a
 * player can learn a route the way they learn a formation. Positions come from
 * walking each branch outward and hanging short twigs off the notables, which
 * is what gives the graph its low mean degree — mostly chains, occasionally a
 * fork, exactly the shape that makes a node budget bite.
 */
export function buildTree(): readonly TreeNode[] {
  const nodes: TreeNode[] = [
    {
      id: ROOT_ID,
      branch: 'thrust',
      x: 0,
      y: 0,
      size: 2,
      label: 'CORE',
      mods: {},
      links: [],
    },
  ];
  let nextId = 1;

  for (const [name, spec] of Object.entries(BRANCHES) as [Branch, (typeof BRANCHES)[Branch]][]) {
    let heading = spec.heading;
    let x = 0;
    let y = 0;
    let previous = ROOT_ID;
    let rungIndex = 0;

    for (const rung of spec.rungs) {
      for (let repeat = 0; repeat < (rung.times ?? 1); repeat++) {
        heading += CURVE_PER_RUNG;
        const rad = (heading * Math.PI) / 180;
        x += Math.cos(rad) * SPINE_STEP;
        y += Math.sin(rad) * SPINE_STEP;

        const id = nextId++;
        const size = rung.size ?? 1;
        nodes.push({ id, branch: name, x, y, size, label: rung.label, mods: rung.mods, links: [] });
        link(nodes, previous, id);
        previous = id;

        // Notables sprout a pair of small nodes to the side: a cheap detour
        // that is sometimes worth taking and mostly is not, which is the whole
        // point of having a budget.
        if (size >= 2) {
          const side = rungIndex % 2 === 0 ? 90 : -90;
          const twigRad = ((heading + side) * Math.PI) / 180;
          let tx = x;
          let ty = y;
          let from = id;
          for (let t = 0; t < 2; t++) {
            tx += Math.cos(twigRad) * TWIG_STEP;
            ty += Math.sin(twigRad) * TWIG_STEP;
            const twigId = nextId++;
            nodes.push({
              id: twigId,
              branch: name,
              x: tx,
              y: ty,
              size: 1,
              label: twigLabel(name),
              mods: twigMods(name),
              links: [],
            });
            link(nodes, from, twigId);
            from = twigId;
          }
        }
        rungIndex += 1;
      }
    }
  }

  return nodes;
}

function link(nodes: TreeNode[], a: number, b: number): void {
  const from = nodes.find((n) => n.id === a);
  const to = nodes.find((n) => n.id === b);
  if (!from || !to) return;
  if (!from.links.includes(b)) from.links.push(b);
  if (!to.links.includes(a)) to.links.push(a);
}

function twigLabel(branch: Branch): string {
  return {
    thrust: '+4% THRUST',
    ordnance: '+5% FIRE RATE',
    resonance: '+6% LINK PAYOUT',
    salvage: '+8% ABSORB POINTS',
  }[branch];
}

function twigMods(branch: Branch): Partial<Mods> {
  return {
    thrust: { speed: 0.04 },
    ordnance: { fireRate: 0.05 },
    resonance: { chainPayout: 0.06 },
    salvage: { absorbPoints: 0.08 },
  }[branch];
}

// --- rules -------------------------------------------------------------

export const TREE = buildTree();
const BY_ID = new Map(TREE.map((n) => [n.id, n]));

export function nodeById(id: number): TreeNode | undefined {
  return BY_ID.get(id);
}

export function costOf(id: number): number {
  const node = BY_ID.get(id);
  return node ? NODE_COST[node.size] : 0;
}

export interface TreeConfig {
  /** Nodes a single run may ever own, root excluded. The pathing budget. */
  nodeBudget: number;
  /** Points a skill-point pickup is worth. */
  pointsPerPickup: number;
}

export function ownedCount(state: TreeState): number {
  return state.bought.filter((id) => id !== ROOT_ID).length;
}

/**
 * Whether a node can be taken right now.
 *
 * Adjacency to something already owned, enough points, and room in the budget.
 * No prerequisites beyond the graph itself — the shape of the tree is the only
 * gate, which is what makes a route feel like a route.
 */
export function canBuy(state: TreeState, id: number, cfg: TreeConfig): boolean {
  const node = BY_ID.get(id);
  if (!node || state.bought.includes(id)) return false;
  if (state.points < NODE_COST[node.size]) return false;
  if (ownedCount(state) >= cfg.nodeBudget) return false;
  return node.links.some((linked) => state.bought.includes(linked));
}

export function buy(state: TreeState, id: number, cfg: TreeConfig): TreeState {
  if (!canBuy(state, id, cfg)) return state;
  return {
    bought: [...state.bought, id],
    points: state.points - costOf(id),
  };
}

export function addPoints(state: TreeState, n: number): TreeState {
  return { ...state, points: state.points + n };
}

/**
 * Resolve everything bought into one set of numbers.
 *
 * Pure accumulation, applied once — multipliers sum as fractions above 1 and
 * flags OR together, so no node's effect depends on which order it was taken
 * in. Clamped at the end, because a branch of "−30% fire rate" trade-offs
 * should slow you down and must never be able to stop the gun altogether.
 */
export function modsFor(state: TreeState): Mods {
  const out = baseMods();
  for (const id of state.bought) {
    const node = BY_ID.get(id);
    if (!node) continue;
    for (const [key, value] of Object.entries(node.mods)) {
      if (typeof value === 'boolean') {
        (out as unknown as Record<string, boolean>)[key] = true;
      } else if (typeof value === 'number') {
        const acc = out as unknown as Record<string, number>;
        acc[key] = (acc[key] ?? 0) + value;
      }
    }
  }
  out.speed = Math.max(0.35, out.speed);
  out.fireRate = Math.max(0.3, out.fireRate);
  out.shotSpeed = Math.max(0.4, out.shotSpeed);
  out.ammo = Math.max(0.3, out.ammo);
  out.meterRate = Math.max(0.3, out.meterRate);
  out.focusMobility = Math.max(0.2, out.focusMobility);
  return out;
}

/** Nodes whose label matches, for the search BYTEPATH never shipped. */
export function search(term: string): readonly TreeNode[] {
  const needle = term.trim().toUpperCase();
  if (needle.length === 0) return [];
  return TREE.filter((n) => n.label.toUpperCase().includes(needle));
}

/**
 * Eight-way neighbour lookup, precomputed once.
 *
 * A big graph has to be navigable by keyboard in a game that is otherwise
 * entirely keyboard-driven, and the cheap way to do that is to ask, for each
 * node, which of its links lies in each compass direction.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

export function neighbourIn(id: number, dir: Direction): number | undefined {
  const node = BY_ID.get(id);
  if (!node) return undefined;
  let best: number | undefined;
  let bestScore = -Infinity;
  for (const linked of node.links) {
    const other = BY_ID.get(linked);
    if (!other) continue;
    const dx = other.x - node.x;
    const dy = other.y - node.y;
    const score = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    // Must genuinely lie that way, not merely least-wrong.
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (score <= 0 || score < across * 0.6) continue;
    if (score > bestScore) {
      bestScore = score;
      best = linked;
    }
  }
  return best;
}
