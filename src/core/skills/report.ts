/**
 * Run report: what the rating engine did while the player was busy playing.
 *
 * The adaptive model is the best system in the game and completely invisible —
 * ratings move silently and the player only ever meets them as pacing. These
 * helpers read the movement back out of two table snapshots so the debrief can
 * show a run's gains and the breather can announce a skill going fluent.
 *
 * Pure diffs over tables the caller already holds: nothing here touches the
 * rating rules, and a mode that never calls it plays identically.
 */
import type { GameConfig } from '../config';
import type { SkillTable } from './rating';
import { findSkill, type SkillDef, type SkillId } from './taxonomy';

export interface SkillDelta {
  skillId: SkillId;
  label: string;
  /** Rounded rating movement across the run. Never zero — flat rows are noise. */
  delta: number;
  /** Attempts made during the run (not lifetime). */
  attempts: number;
}

/**
 * Rating movement per skill between two snapshots, biggest gain first.
 * Only skills actually attempted in the interval report; a skill absent from
 * `before` is measured from the initial rating, which is where applyAttempt
 * starts a fresh one.
 */
export function runDeltas(before: SkillTable, after: SkillTable, cfg: GameConfig): SkillDelta[] {
  const out: SkillDelta[] = [];
  for (const [id, state] of Object.entries(after)) {
    const def = findSkill(id);
    if (!def) continue; // retired id riding along in an old save
    const prev = before[id];
    if (state.attempts - (prev?.attempts ?? 0) <= 0) continue;
    const delta = Math.round(state.rating - (prev?.rating ?? cfg.rating.initialRating));
    if (delta === 0) continue;
    out.push({
      skillId: id,
      label: def.label,
      delta,
      attempts: state.attempts - (prev?.attempts ?? 0),
    });
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/** The n biggest movers in either direction, still sorted gains first. */
export function topMovers(deltas: readonly SkillDelta[], n: number): SkillDelta[] {
  return [...deltas].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, n)
    .sort((a, b) => b.delta - a.delta);
}

/**
 * Skills that crossed the fluent line between two snapshots — earned it, too:
 * seeding (placement, reconcile) parks ratings above the line with zero
 * attempts, and a crossing nobody played gets no fanfare.
 */
export function crossedFluent(
  before: SkillTable,
  after: SkillTable,
  cfg: GameConfig,
): SkillDef[] {
  const out: SkillDef[] = [];
  for (const [id, state] of Object.entries(after)) {
    const def = findSkill(id);
    if (!def) continue;
    const prev = before[id];
    if (state.attempts - (prev?.attempts ?? 0) <= 0) continue;
    const line = def.baseDifficulty + cfg.waves.fluentMargin;
    if (state.rating < line) continue;
    if (prev !== undefined && prev.rating >= line) continue; // was already over
    out.push(def);
  }
  return out;
}
