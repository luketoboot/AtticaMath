/**
 * Power-up drops — the only way the game hands out an advantage.
 *
 * Nothing is bought; everything that helps is earned inside the run. Effects
 * are timers rather than permanent state, so a run's texture comes from what is
 * active right now instead of from what the player owns.
 *
 * Carriers exist in every mode, but how you take the payload matches what that
 * mode already asks you to do: Meteor Defense drops a pod you slide the cannon
 * under, the flight modes leave one floating for you to fly through, and the
 * keyboard-only modes hand it over the moment you solve the carrier. Inventing
 * a catch minigame for a mode with no avatar would be a worse pickup than none.
 *
 * Pure and immutable, like the combo meter. The scene ticks it.
 */
import type { DropConfig } from './config';
import { createRng, type Rng } from './rng';

export type DropKind = 'freeze' | 'nuke' | 'repair' | 'double' | 'chain' | 'shield';

export const DROP_KINDS: readonly DropKind[] = [
  'freeze',
  'nuke',
  'repair',
  'double',
  'chain',
  'shield',
];

/** Short label printed on the falling pickup. */
export const DROP_LABEL: Readonly<Record<DropKind, string>> = {
  freeze: 'FREEZE',
  nuke: 'NUKE',
  repair: 'REPAIR',
  double: 'x2',
  chain: 'CHAIN',
  shield: 'SHIELD',
};

export interface DropState {
  /** Seconds of halted descent remaining. */
  freezeLeft: number;
  /** Seconds of doubled score remaining. */
  doubleLeft: number;
  /** Kills still covered by the chain shot. */
  chainLeft: number;
  /** Seconds of damage immunity remaining. */
  shieldLeft: number;
}

export function createDrops(): DropState {
  return { freezeLeft: 0, doubleLeft: 0, chainLeft: 0, shieldLeft: 0 };
}

export function tickDrops(state: DropState, dtSeconds: number): DropState {
  if (state.freezeLeft <= 0 && state.doubleLeft <= 0 && state.shieldLeft <= 0) return state;
  return {
    freezeLeft: Math.max(0, state.freezeLeft - dtSeconds),
    doubleLeft: Math.max(0, state.doubleLeft - dtSeconds),
    chainLeft: state.chainLeft,
    shieldLeft: Math.max(0, state.shieldLeft - dtSeconds),
  };
}

/**
 * Start a timed effect. `nuke` and `repair` are instant and change state the
 * caller owns (the board, the HP bar), so they pass through untouched.
 */
export function applyDrop(state: DropState, kind: DropKind, cfg: DropConfig): DropState {
  switch (kind) {
    case 'freeze':
      return { ...state, freezeLeft: Math.max(state.freezeLeft, cfg.freezeSeconds) };
    case 'double':
      // Refresh rather than stack: two pickups in a row extend the window, they
      // do not quietly quadruple the score.
      return { ...state, doubleLeft: Math.max(state.doubleLeft, cfg.doubleSeconds) };
    case 'chain':
      return { ...state, chainLeft: state.chainLeft + cfg.chainKills };
    case 'shield':
      return { ...state, shieldLeft: Math.max(state.shieldLeft, cfg.shieldSeconds) };
    case 'nuke':
    case 'repair':
      return state;
  }
}

export function descentFrozen(state: DropState): boolean {
  return state.freezeLeft > 0;
}

/** Damage is being absorbed. The hit still happens — it just costs nothing. */
export function shieldActive(state: DropState): boolean {
  return state.shieldLeft > 0;
}

export function dropMultiplier(state: DropState, cfg: DropConfig): number {
  return state.doubleLeft > 0 ? cfg.doubleMultiplier : 1;
}

export function chainReady(state: DropState): boolean {
  return state.chainLeft > 0;
}

export function consumeChain(state: DropState): DropState {
  if (state.chainLeft <= 0) return state;
  return { ...state, chainLeft: state.chainLeft - 1 };
}

/**
 * Pick what a carrier is holding. Repair gets a heavy thumb on the scale when
 * the player is nearly dead — rubber-banding toward the dramatic finish is
 * standard arcade practice, and nobody has ever noticed it in a well-tuned
 * game.
 *
 * `pool` is what this mode can drop at all. Not every effect means something
 * everywhere: `chain` is literally "one typed answer kills every meteor sharing
 * it", which does not exist outside Meteor Defense, and a pickup that did
 * nothing would be worse than no pickup.
 */
export function rollDrop(
  rng: Rng,
  hp: number,
  cfg: DropConfig,
  pool: readonly DropKind[] = DROP_KINDS,
): DropKind {
  const kinds = pool.length > 0 ? pool : DROP_KINDS;
  const weights = kinds.map((kind) =>
    kind === 'repair' && hp <= cfg.lowHpAt ? cfg.lowHpRepairWeight : cfg.weights[kind],
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < kinds.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return kinds[i]!;
  }
  return kinds[kinds.length - 1]!;
}

/**
 * One mode's drop clocks and its own random stream.
 *
 * Every mode wants the same five or six effects and the same bookkeeping, and
 * writing that five times is how the modes quietly drift apart — one forgets to
 * tick the shield, another stacks x2 instead of refreshing it. The state stays
 * immutable underneath; this only owns which copy is current.
 *
 * The stream is seeded and separate from anything else the session rolls, so a
 * run stays reproducible no matter how many frames elapsed before a carrier
 * died.
 */
export class DropTracker {
  private state: DropState = createDrops();
  private readonly rng: Rng;

  constructor(
    seed: number,
    private readonly cfg: DropConfig,
    private readonly pool: readonly DropKind[],
  ) {
    this.rng = createRng(seed);
  }

  get snapshot(): Readonly<DropState> {
    return this.state;
  }

  tick(dtSeconds: number): void {
    this.state = tickDrops(this.state, dtSeconds);
  }

  /** What the carrier that just died was holding. */
  roll(hp: number): DropKind {
    return rollDrop(this.rng, hp, this.cfg, this.pool);
  }

  /**
   * Start a timed effect. `repair` and `nuke` change state this does not own —
   * the HP bar, the board — so they pass through and the caller handles them.
   */
  apply(kind: DropKind): void {
    this.state = applyDrop(this.state, kind, this.cfg);
  }

  get frozen(): boolean {
    return descentFrozen(this.state);
  }

  get shielded(): boolean {
    return shieldActive(this.state);
  }

  get chainReady(): boolean {
    return chainReady(this.state);
  }

  useChain(): void {
    this.state = consumeChain(this.state);
  }

  /** Score multiplier contributed by pickups alone. */
  get multiplier(): number {
    return dropMultiplier(this.state, this.cfg);
  }
}
