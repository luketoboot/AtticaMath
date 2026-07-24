import type { SkillId } from '../skills/taxonomy';

export interface Problem {
  /** Unique within a run. */
  id: number;
  /** Component skills; all get rating updates from this problem's outcome. */
  skillIds: readonly SkillId[];
  /** Display string, e.g. "7 + 8" or "45 ÷ 6 r?". */
  prompt: string;
  /** The answer the input buffer must match (always a non-negative integer string). */
  answer: string;
  /** Elo-scale difficulty estimate. */
  difficulty: number;
}
