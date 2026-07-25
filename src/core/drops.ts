/**
 * Power-up drops.
 *
 * Carrier meteors leave a pickup behind when they die, and the pickup is
 * collected by sliding the cannon under it — the dodge movement already exists
 * and is currently only ever punishing, so this is the cheapest way to make it
 * pay. Effects are timers, not permanent state: a run's texture comes from what
 * is active right now.
 *
 * Pure and immutable, like the combo meter. The scene ticks it.
 */
import type { DropConfig } from './config';
import type { Rng } from './rng';

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
 */
export function rollDrop(rng: Rng, hp: number, cfg: DropConfig): DropKind {
  const weights = DROP_KINDS.map((kind) =>
    kind === 'repair' && hp <= cfg.lowHpAt ? cfg.lowHpRepairWeight : cfg.weights[kind],
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < DROP_KINDS.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return DROP_KINDS[i]!;
  }
  return DROP_KINDS[DROP_KINDS.length - 1]!;
}
