/**
 * Milestones: skills the player has mastered, surfaced as unlocks in the
 * operator debrief. Detection is pure; the save tracks which ones have
 * already been shown so each fires exactly once.
 */
import type { GameConfig } from '../config';
import type { SkillState, SkillTable } from './rating';
import { SKILLS } from './taxonomy';

export interface Milestone {
  id: string;
  label: string;
}

const MASTERY_LABELS: Readonly<Record<string, string>> = {
  'add.single': 'QUICK SUMS MASTERED',
  'add.complement10': 'NUMBER BONDS MASTERED',
  'add.bridge': 'TEN-BRIDGING MASTERED',
  'add.double': 'BIG ADDITION MASTERED',
  'add.complement100': 'MAKING CHANGE MASTERED',
  'add.triple': 'TRIPLE-DIGIT ADDITION MASTERED',
  'sub.single': 'QUICK GAPS MASTERED',
  'sub.double': 'BIG SUBTRACTION MASTERED',
  'sub.borrow': 'BORROWING MASTERED',
  'sub.zeros': 'BORROWING ACROSS ZEROS MASTERED',
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
  'div.by.3': 'THREES SPOTTED ON SIGHT',
  'div.by.4': 'FOURS SPOTTED ON SIGHT',
  'div.by.7': 'SEVENS SPOTTED ON SIGHT',
  'div.by.11': 'ELEVENS SPOTTED ON SIGHT',
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
  'pct.what': 'REVERSE PERCENTAGES MASTERED',
};

/** Which gate is furthest from being met — what the player still has to do. */
export type MasteryGate = 'volume' | 'rating' | 'speed';

export interface MasteryProgress {
  /** Each gate, 0 to 1. */
  volume: number;
  rating: number;
  speed: number;
  /** The composite: the weakest gate, because mastery needs all three. */
  overall: number;
  /** What is holding it back, for a display that explains itself. */
  limiting: MasteryGate;
  mastered: boolean;
}

/**
 * How close one skill is to mastery, as three independent gates.
 *
 * Rating on its own cannot express this. Every skill seeds at `initialRating`,
 * and roughly a third of the taxonomy has a base difficulty low enough that the
 * seed already clears `base + masteryMargin` — so those skills read as fully
 * mastered before the player has answered a single problem. The rating gate is
 * therefore measured *from the seed*, and where the seed already clears the
 * line it stops discriminating and the other two gates decide.
 *
 * Volume and speed are what actually separate "can work it out" from "knows
 * it": enough correct answers to rule out luck, delivered fast enough to rule
 * out counting. The composite is the weakest of the three rather than an
 * average, so a player cannot bank a huge rating and coast past the clock.
 */
export function masteryProgress(
  state: SkillState | undefined,
  skill: { baseDifficulty: number },
  cfg: GameConfig,
): MasteryProgress {
  const r = cfg.rating;
  const clamp = (n: number): number => Math.min(1, Math.max(0, n));
  if (!state) {
    return { volume: 0, rating: 0, speed: 0, overall: 0, limiting: 'volume', mastered: false };
  }

  const volume = clamp(state.correct / r.masteryMinCorrect);

  const line = skill.baseDifficulty + r.masteryMargin;
  // A line at or below the seed proves nothing, so it is not allowed to award
  // progress the player did not earn.
  const rating = line <= r.initialRating ? 1 : clamp((state.rating - r.initialRating) / (line - r.initialRating));

  const speed = clamp(state.fluency / r.masteryFluency);

  const overall = Math.min(volume, rating, speed);
  const limiting: MasteryGate = overall === volume ? 'volume' : overall === rating ? 'rating' : 'speed';
  return { volume, rating, speed, overall, limiting, mastered: overall >= 1 };
}

export function earnedMilestones(table: SkillTable, cfg: GameConfig): Milestone[] {
  const out: Milestone[] = [];
  for (const skill of SKILLS) {
    const state = table[skill.id];
    if (!state) continue;
    if (!masteryProgress(state, skill, cfg).mastered) continue;
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
