import { SKILLS, type SkillId } from '../skills/taxonomy';
import type { KakoomaOp } from './kakooma';

/**
 * What finding a fact says about the player, in the taxonomy's terms.
 *
 * Kakooma rates the fact the player actually found, not the cell they found it
 * in — spotting `7 + 8 = 15` is evidence about bridging ten whether it turned
 * up in an easy grid or a hard one.
 *
 * It is rated *harder* than being handed the same fact, though, and that is the
 * whole reason this mode is worth having. Meteor Defense asks "what is 7 + 8"
 * and the player retrieves it. Here nothing points at the 7 or the 8; the
 * player has to run pair after pair until one lands, so the same fact is being
 * tested under a search load that grows with the size of the cell. Rating it at
 * the bare fact's difficulty would let a hard mode inflate ratings.
 *
 * Kept here rather than in the scene so it can be tested, and so the mode
 * cannot invent skill ids no other screen knows about.
 */

/** How much harder a fact is to find than to answer, per number in the cell. */
const SEARCH_PREMIUM_PER_NUMBER = 22;

export interface KakoomaAttempt {
  skillIds: SkillId[];
  difficulty: number;
}

function baseDifficulty(id: SkillId): number {
  return SKILLS.find((s) => s.id === id)?.baseDifficulty ?? 400;
}

/** The addition skills a fact exercises, finest reading first. */
function addSkills(a: number, b: number, total: number): SkillId[] {
  if (a >= 10 || b >= 10) return ['add.double'];
  // Making ten exactly is its own skill and the one every technique spends.
  if (total === 10) return ['add.complement10'];
  // Crossing ten is the step that separates counting from strategy.
  if (total > 10) return ['add.bridge'];
  return ['add.single'];
}

function mulSkills(a: number, b: number): SkillId[] {
  const family = Math.max(a, b);
  const other = Math.min(a, b);
  // A times table is a family, and the family is the larger factor — 3 × 7 is
  // evidence about the 7s. Anything outside 2..12 is not a table fact.
  if (family >= 2 && family <= 12 && other >= 2 && other <= 12) {
    return [`mul.table.${family}` as SkillId];
  }
  return ['mul.2x1'];
}

/**
 * @param cellSize how many numbers the fact was hiding among
 */
export function kakoomaAttempt(
  op: KakoomaOp,
  a: number,
  b: number,
  total: number,
  cellSize: number,
): KakoomaAttempt {
  const skillIds = (op === 'add' ? addSkills(a, b, total) : mulSkills(a, b)).filter((id) =>
    SKILLS.some((s) => s.id === id),
  );
  const base = Math.max(...skillIds.map(baseDifficulty), 0);
  return { skillIds, difficulty: base + cellSize * SEARCH_PREMIUM_PER_NUMBER };
}
