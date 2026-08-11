import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  NODE_COST,
  ROOT_ID,
  TREE,
  addPoints,
  baseMods,
  buy,
  canBuy,
  costOf,
  modsFor,
  neighbourIn,
  newTree,
  nodeById,
  ownedCount,
  search,
  type TreeState,
} from '../src/core/polarity/tree';
import { PolaritySession } from '../src/core/polarity/session';
import { createSkillTable } from '../src/core/skills/rating';
import { allSkillIds } from '../src/core/skills/taxonomy';

const cfg = CONFIG.polarity.tree;
const rich = (points: number): TreeState => addPoints(newTree(), points);

describe('the shape of the tree', () => {
  it('is big enough to get lost in and small enough to hand-check', () => {
    expect(TREE.length).toBeGreaterThan(90);
    expect(TREE.length).toBeLessThan(400);
  });

  it('gives every node a unique id and a label', () => {
    const ids = TREE.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of TREE) expect(n.label.length, `node ${n.id}`).toBeGreaterThan(0);
  });

  it('links both ways, always', () => {
    // A one-way link is invisible in the data and lethal to pathing: a node you
    // can reach but that cannot reach you back breaks adjacency in one direction.
    for (const n of TREE) {
      for (const other of n.links) {
        expect(nodeById(other)?.links, `${n.id} -> ${other}`).toContain(n.id);
      }
    }
  });

  it('never links a node to itself', () => {
    for (const n of TREE) expect(n.links, `node ${n.id}`).not.toContain(n.id);
  });

  it('is one connected graph reachable from the core', () => {
    // An unreachable node is content nobody can ever buy.
    const seen = new Set<number>([ROOT_ID]);
    const queue = [ROOT_ID];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const next of nodeById(id)!.links) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    expect(seen.size).toBe(TREE.length);
  });

  it('keeps the graph mostly chains, which is what makes a budget bite', () => {
    // A mesh lets you reach anything from anywhere and the node cap stops
    // meaning anything. Long thin branches are what make a route a choice.
    const mean = TREE.reduce((sum, n) => sum + n.links.length, 0) / TREE.length;
    expect(mean).toBeGreaterThan(1.5);
    expect(mean).toBeLessThan(3);
  });

  it('spreads the keystones far from the core', () => {
    const depth = new Map<number, number>([[ROOT_ID, 0]]);
    const queue = [ROOT_ID];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const next of nodeById(id)!.links) {
        if (depth.has(next)) continue;
        depth.set(next, depth.get(id)! + 1);
        queue.push(next);
      }
    }
    const keystones = TREE.filter((n) => n.size === 3);
    expect(keystones.length).toBeGreaterThanOrEqual(4);
    for (const k of keystones) {
      expect(depth.get(k.id), k.label).toBeGreaterThan(10);
    }
  });

  it('lays out without stacking two nodes on the same spot', () => {
    const seen = new Set<string>();
    for (const n of TREE) {
      const key = `${Math.round(n.x)},${Math.round(n.y)}`;
      expect(seen.has(key), `${n.label} at ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('is identical every time it is built, so a route can be learned', () => {
    const a = TREE.map((n) => `${n.id}:${Math.round(n.x)}:${Math.round(n.y)}`).join('|');
    const b = TREE.map((n) => `${n.id}:${Math.round(n.x)}:${Math.round(n.y)}`).join('|');
    expect(a).toBe(b);
  });
});

describe('buying', () => {
  it('starts owning only the core, with nothing in hand', () => {
    const t = newTree();
    expect(t.bought).toEqual([ROOT_ID]);
    expect(t.points).toBe(0);
    expect(ownedCount(t)).toBe(0);
  });

  it('refuses a node that touches nothing you own', () => {
    const far = TREE.find((n) => !n.links.includes(ROOT_ID) && n.id !== ROOT_ID)!;
    expect(canBuy(rich(99), far.id, cfg)).toBe(false);
  });

  it('allows a node adjacent to something you own', () => {
    const near = TREE.find((n) => n.links.includes(ROOT_ID))!;
    expect(canBuy(rich(99), near.id, cfg)).toBe(true);
  });

  it('refuses what you cannot afford', () => {
    const near = TREE.find((n) => n.links.includes(ROOT_ID))!;
    expect(canBuy(rich(0), near.id, cfg)).toBe(false);
  });

  it('charges by size', () => {
    for (const n of TREE) expect(costOf(n.id)).toBe(NODE_COST[n.size]);
  });

  it('will not sell the same node twice', () => {
    const near = TREE.find((n) => n.links.includes(ROOT_ID))!;
    const t = buy(rich(99), near.id, cfg);
    expect(canBuy(t, near.id, cfg)).toBe(false);
    expect(buy(t, near.id, cfg)).toBe(t);
  });

  it('stops at the budget however rich you are', () => {
    // The cap, not the currency, is what makes a route cost something.
    let t = rich(9999);
    for (let i = 0; i < 500 && ownedCount(t) < cfg.nodeBudget; i++) {
      const next = TREE.find((n) => canBuy(t, n.id, cfg));
      if (!next) break;
      t = buy(t, next.id, cfg);
    }
    expect(ownedCount(t)).toBe(cfg.nodeBudget);
    expect(TREE.some((n) => canBuy(t, n.id, cfg))).toBe(false);
  });

  it('never leaves an owned node stranded from the core', () => {
    let t = rich(9999);
    for (let i = 0; i < 40; i++) {
      const options = TREE.filter((n) => canBuy(t, n.id, cfg));
      if (options.length === 0) break;
      t = buy(t, options[i % options.length]!.id, cfg);
    }
    for (const id of t.bought) {
      if (id === ROOT_ID) continue;
      expect(nodeById(id)!.links.some((l) => t.bought.includes(l)), `node ${id}`).toBe(true);
    }
  });

  it('is pure — buying returns a new state and leaves the old one alone', () => {
    const before = rich(9);
    const near = TREE.find((n) => n.links.includes(ROOT_ID))!;
    const after = buy(before, near.id, cfg);
    expect(before.bought).toEqual([ROOT_ID]);
    expect(before.points).toBe(9);
    expect(after.bought).toContain(near.id);
  });
});

describe('what the tree adds up to', () => {
  it('does nothing at all when nothing is bought', () => {
    expect(modsFor(newTree())).toEqual(baseMods());
  });

  it('accumulates the same however the route was ordered', () => {
    // Effects are pure addition, resolved once, so no node's value can depend
    // on which order the player happened to take it in.
    const near = TREE.filter((n) => n.links.includes(ROOT_ID)).slice(0, 2);
    if (near.length < 2) return;
    const forward = buy(buy(rich(20), near[0]!.id, cfg), near[1]!.id, cfg);
    const back = buy(buy(rich(20), near[1]!.id, cfg), near[0]!.id, cfg);
    expect(modsFor(forward)).toEqual(modsFor(back));
  });

  it('clamps the trade-off branches so nothing can be reduced to zero', () => {
    // Several keystones pay for themselves with a penalty. Stacked far enough
    // they must slow the ship, never stop it.
    const everything: TreeState = { bought: TREE.map((n) => n.id), points: 0 };
    const m = modsFor(everything);
    expect(m.speed).toBeGreaterThan(0.3);
    expect(m.fireRate).toBeGreaterThan(0.25);
    expect(m.shotSpeed).toBeGreaterThan(0.35);
    expect(m.ammo).toBeGreaterThan(0.25);
    expect(m.meterRate).toBeGreaterThan(0.25);
    expect(Number.isFinite(m.speed)).toBe(true);
  });

  it('offers real trade-offs, not only upside', () => {
    const negatives = TREE.filter((n) =>
      Object.values(n.mods).some((v) => typeof v === 'number' && v < 0),
    );
    expect(negatives.length).toBeGreaterThanOrEqual(4);
  });

  it('offers rule changes, not only percentages', () => {
    const flags = TREE.filter((n) => Object.values(n.mods).some((v) => typeof v === 'boolean'));
    expect(flags.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the rule the tree may not break', () => {
  it('has no node that reads the field for the player', () => {
    // The mode measures whether you can spot a multiple. A node that pointed
    // them out would stop it measuring anything, so the Mods shape simply has
    // no field capable of it — this pins that the shape stays that way.
    const allowed = new Set(Object.keys(baseMods()));
    const banned = /reveal|highlight|show|auto|hint|mark|identify|solve/i;
    for (const key of allowed) {
      expect(banned.test(key), `Mods.${key} looks like it answers the arithmetic`).toBe(false);
    }
    for (const n of TREE) {
      for (const key of Object.keys(n.mods)) {
        expect(allowed.has(key), `${n.label} sets unknown mod "${key}"`).toBe(true);
      }
    }
  });
});

describe('finding things', () => {
  it('searches labels, which BYTEPATH never let you do', () => {
    expect(search('pierce').length).toBeGreaterThan(0);
    expect(search('PIERCE').length).toBe(search('pierce').length);
    expect(search('')).toEqual([]);
    expect(search('zzzz')).toEqual([]);
  });

  it('walks the graph by compass direction for the keyboard', () => {
    const start = TREE.find((n) => n.links.includes(ROOT_ID))!;
    const dirs = (['up', 'down', 'left', 'right'] as const).map((d) => neighbourIn(start.id, d));
    expect(dirs.some((d) => d !== undefined)).toBe(true);
    for (const d of dirs) {
      if (d !== undefined) expect(start.links).toContain(d);
    }
  });

  it('never claims a neighbour in a direction it does not lie', () => {
    for (const n of TREE.slice(0, 60)) {
      const up = neighbourIn(n.id, 'up');
      if (up !== undefined) expect(nodeById(up)!.y).toBeLessThan(n.y);
      const right = neighbourIn(n.id, 'right');
      if (right !== undefined) expect(nodeById(right)!.x).toBeGreaterThan(n.x);
    }
  });
});

describe('a run with a tree in it', () => {
  const session = () =>
    new PolaritySession({
      seed: 4,
      skills: createSkillTable(allSkillIds(), CONFIG.rating),
      totalWavesBefore: 40,
    });

  it('starts every run with an empty tree, so runs stay comparable', () => {
    // The whole reason this is per-run: a permanent tree would mean two players
    // on the same board had different ships.
    for (const seed of [1, 2, 3]) {
      const s = new PolaritySession({
        seed,
        skills: createSkillTable(allSkillIds(), CONFIG.rating),
        totalWavesBefore: 40,
      });
      expect(s.treeState.bought).toEqual([ROOT_ID]);
      expect(s.skillPoints).toBe(0);
      expect(s.treeMods).toEqual(baseMods());
    }
  });

  it('earns points from kills', () => {
    const s = session();
    let earned = 0;
    for (let w = 0; w < 12 && !s.gameOver; w++) {
      s.nextWave();
      for (const c of [...s.liveCarriers]) if (s.shoot(c.id, 9).point) earned += 1;
    }
    expect(earned).toBeGreaterThan(0);
    expect(s.skillPoints).toBe(earned * cfg.pointsPerPickup);
  });

  it('refuses a node it cannot pay for and takes one it can', () => {
    const s = session();
    const near = TREE.find((n) => n.links.includes(ROOT_ID) && n.size === 1)!;
    expect(s.canBuyNode(near.id)).toBe(false);
    while (s.skillPoints < 1) {
      s.nextWave();
      for (const c of [...s.liveCarriers]) s.shoot(c.id, 9);
    }
    expect(s.canBuyNode(near.id)).toBe(true);
    expect(s.buyNode(near.id)).toBe(true);
    expect(s.treeState.bought).toContain(near.id);
  });

  it('grants a hull point the moment the node is taken, once', () => {
    const s = session();
    while (s.skillPoints < 20) {
      s.nextWave();
      for (const c of [...s.liveCarriers]) s.shoot(c.id, 9);
    }
    const hp = s.hp;
    // Walk to the first +1 HULL node along its branch.
    const hull = TREE.find((n) => n.label.includes('+1 HULL'))!;
    let guard = 0;
    while (!s.treeState.bought.includes(hull.id) && guard++ < 60) {
      const step = TREE.find((n) => s.canBuyNode(n.id) && n.branch === hull.branch);
      if (!step) break;
      s.buyNode(step.id);
    }
    if (!s.treeState.bought.includes(hull.id)) return;
    expect(s.hp).toBe(hp + 1);
    expect(s.treeMods.bonusHull).toBe(1);
  });
});

describe('every node actually does something', () => {
  it('touches no mod the session ignores', () => {
    // A node that reads well and changes nothing is worse than no node: it
    // spends a point and a slot in the budget for a lie. This pins the set of
    // mods the tree can grant against the set the run reads.
    const wired = new Set<keyof ReturnType<typeof baseMods>>([
      'speed', 'bonusHull', 'flipRecovery', 'focusMobility',
      'fireRate', 'shotSpeed', 'bonusDamage', 'ammo',
      'absorbPoints', 'meterRate', 'cancelRadius', 'cancelPoints',
      'killPoints', 'chainPayout', 'podChance', 'spChance',
      'pierce', 'bridgesCountDouble', 'chainSurvivesDamage',
      'focusEatsWilds', 'linksRepair', 'magnet',
    ]);
    // Every mod the tree grants is in the wired set...
    for (const n of TREE) {
      for (const key of Object.keys(n.mods)) {
        expect(wired.has(key as never), `${n.label} grants unwired mod "${key}"`).toBe(true);
      }
    }
    // ...and the wired set is exactly the Mods shape, so adding a field to
    // Mods without wiring it fails here rather than shipping as a dead node.
    expect([...wired].sort()).toEqual(Object.keys(baseMods()).sort());
  });

  it('grants every mod somewhere, so none of the shape is dead weight', () => {
    const granted = new Set<string>();
    for (const n of TREE) for (const key of Object.keys(n.mods)) granted.add(key);
    for (const key of Object.keys(baseMods())) {
      expect(granted.has(key), `no node ever grants "${key}"`).toBe(true);
    }
  });
});
