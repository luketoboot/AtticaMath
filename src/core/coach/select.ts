/**
 * Tip selection: lowest rated skill with recent attempts becomes the topic.
 * The chosen skill is then overweighted in the next wave (see waves/compose).
 */
import type { SkillTable } from '../skills/rating';
import type { SkillId } from '../skills/taxonomy';
import { tipForSkill, type Tip } from './tips';

export interface CoachPick {
  skillId: SkillId;
  tip: Tip;
}

/**
 * Pick a tip topic. "Recent" = attempted within recencyWaves of the current wave.
 * Avoids repeating lastTipSkill unless it is the only candidate.
 */
export function selectTip(
  table: SkillTable,
  currentWave: number,
  recencyWaves: number,
  lastTipSkill?: SkillId,
): CoachPick | undefined {
  const candidates = Object.entries(table)
    .filter(([id, s]) => s.attempts > 0 && currentWave - s.lastAttemptWave <= recencyWaves && tipForSkill(id))
    .sort((a, b) => a[1].rating - b[1].rating);

  if (candidates.length === 0) return undefined;

  let chosen = candidates[0];
  if (chosen && chosen[0] === lastTipSkill && candidates.length > 1) {
    chosen = candidates[1];
  }
  if (!chosen) return undefined;
  const tip = tipForSkill(chosen[0]);
  if (!tip) return undefined;
  return { skillId: chosen[0], tip };
}
