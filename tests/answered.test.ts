import { describe, expect, it } from 'vitest';
import { answeredPrompt } from '../src/core/generator/answered';
import { generateProblem } from '../src/core/generator/generate';
import { createRng } from '../src/core/rng';
import { SKILLS } from '../src/core/skills/taxonomy';

describe('a problem written out with its answer', () => {
  it('completes an expression with an equals', () => {
    expect(answeredPrompt({ prompt: '7 x 8', answer: '56' })).toBe('7 x 8 = 56');
  });

  it('fills the slot when the prompt already has one', () => {
    // "7 + ? = 10 = 3" is not a sentence anyone can learn from.
    expect(answeredPrompt({ prompt: '7 + ? = 10', answer: '3' })).toBe('7 + 3 = 10');
    expect(answeredPrompt({ prompt: '3/4 = ?%', answer: '75' })).toBe('3/4 = 75%');
    expect(answeredPrompt({ prompt: '12/16 = 3/?', answer: '4' })).toBe('12/16 = 3/4');
    expect(answeredPrompt({ prompt: '45 ÷ 6 r?', answer: '3' })).toBe('45 ÷ 6 r3');
    expect(answeredPrompt({ prompt: '15 IS ?% OF 60', answer: '25' })).toBe('15 IS 25% OF 60');
  });

  it('leaves no question mark behind, whatever the generator writes', () => {
    // Every skill in the taxonomy, not a sample: a prompt shape added later
    // that this rule cannot read would print a question mark at the one moment
    // the player is being told the answer.
    const rng = createRng(404);
    for (const skill of SKILLS) {
      for (let i = 0; i < 12; i++) {
        const problem = generateProblem(skill.id, rng);
        const written = answeredPrompt(problem);
        expect(written, `${skill.id}: ${problem.prompt}`).not.toContain('?');
        expect(written.length, `${skill.id}: ${problem.prompt}`).toBeGreaterThan(
          problem.prompt.length - 1,
        );
        // The answer has to actually be in there, or it says nothing.
        expect(written, `${skill.id}: ${problem.prompt}`).toContain(problem.answer);
      }
    }
  });
});
