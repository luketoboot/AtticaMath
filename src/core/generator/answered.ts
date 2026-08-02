import type { Problem } from './problem';

/**
 * A problem written out with its answer in place.
 *
 * For the moment a meteor lands. A rock that reaches the ground takes HP and
 * leaves nothing behind, which is the one event in the mode where a player was
 * definitely unable to produce a fact and definitely wants it — so the blast
 * says what the answer was. Quietly: it is a memory aid, not a scold, and the
 * problem is already gone.
 *
 * Two shapes of prompt exist and only one of them can take "= answer" on the
 * end. `7 x 8` can. `7 + ? = 10` cannot — it would read "7 + ? = 10 = 3" — and
 * neither can `3/4 = ?%` or `100 ÷ 7 r?`. Those prompts already have a slot
 * with a question mark in it, and the answer belongs *in* the slot, which also
 * reads better than an equation ever would: `7 + 3 = 10`.
 *
 * Pure, so the rule is testable against every prompt the generator can write.
 */
export function answeredPrompt(problem: Pick<Problem, 'prompt' | 'answer'>): string {
  const { prompt, answer } = problem;
  if (prompt.includes('?')) return prompt.replace('?', answer);
  return `${prompt} = ${answer}`;
}
