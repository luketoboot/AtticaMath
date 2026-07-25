/**
 * Milestones: skills the player has mastered, surfaced as unlocks in the
 * operator debrief. Detection is pure; the save tracks which ones have
 * already been shown so each fires exactly once.
 */
import type { GameConfig } from '../config';
import type { SkillTable } from './rating';
import { SKILLS } from './taxonomy';

export interface Milestone {
  id: string;
  label: string;
}

const MASTERY_LABELS: Readonly<Record<string, string>> = {
  'add.single': 'QUICK SUMS MASTERED',
  'add.bridge': 'TEN-BRIDGING MASTERED',
  'add.double': 'BIG ADDITION MASTERED',
  'add.triple': 'TRIPLE-DIGIT ADDITION MASTERED',
  'sub.single': 'QUICK GAPS MASTERED',
  'sub.double': 'BIG SUBTRACTION MASTERED',
  'sub.borrow': 'BORROWING MASTERED',
  'mul.table.2': '2s MASTERED',
  'mul.table.3': '3s MASTERED',
  'mul.table.4': '4s MASTERED',
  'mul.table.5': '5s MASTERED',
  'mul.table.6': '6s MASTERED',
  'mul.table.7': '7s MASTERED',
  'mul.table.8': '8s MASTERED',
  'mul.table.9': '9s MASTERED',
  'mul.table.10': '10s MASTERED',
  'mul.table.11': '11s MASTERED',
  'mul.table.12': '12s MASTERED',
  'mul.2x1': 'BIG MULTIPLICATION MASTERED',
  'mul.2x2': 'LONG MULTIPLICATION MASTERED',
  'mul.3x2': 'HEAVY MULTIPLICATION MASTERED',
  'mul.4x1': 'MONSTER MULTIPLICATION MASTERED',
  'div.exact': 'DIVISION MASTERED',
  'div.remainder': 'REMAINDERS MASTERED',
  'ooo.basic': 'OPERATOR PRIORITY MASTERED',
  'factor.smallest': 'HIDDEN FACTORS MASTERED',
  'factor.prime': 'PRIMES MASTERED',
  'factor.deep': 'DEEP FACTORING MASTERED',
  'frac.percent': 'FRACTION TO PERCENT MASTERED',
  'frac.reduce': 'EQUIVALENCE MASTERED',
  'frac.of': 'FRACTIONS OF MASTERED',
  'frac.add.same': 'LIKE FRACTIONS MASTERED',
  'frac.lcd': 'COMMON DENOMINATORS MASTERED',
  'frac.add.unlike': 'UNLIKE FRACTIONS MASTERED',
  'pct.of': 'PERCENTAGES MASTERED',
};

/** All milestones currently earned by the skill table. */
export function earnedMilestones(table: SkillTable, cfg: GameConfig): Milestone[] {
  const out: Milestone[] = [];
  for (const skill of SKILLS) {
    const state = table[skill.id];
    if (!state) continue;
    if (state.attempts < cfg.rating.masteryMinAttempts) continue;
    if (state.rating < skill.baseDifficulty + cfg.rating.masteryMargin) continue;
    const label = MASTERY_LABELS[skill.id] ?? `${skill.label.toUpperCase()} MASTERED`;
    out.push({ id: `mastery.${skill.id}`, label });
  }
  return out;
}

/** Milestones earned but not yet surfaced to the player. */
export function newMilestones(
  table: SkillTable,
  alreadySurfaced: readonly string[],
  cfg: GameConfig,
): Milestone[] {
  return earnedMilestones(table, cfg).filter((m) => !alreadySurfaced.includes(m.id));
}
