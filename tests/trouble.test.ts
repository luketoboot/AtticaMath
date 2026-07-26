import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  accuracyFor,
  meanMs,
  missRate,
  modesSeen,
  recordTrouble,
  troubleKey,
  troubleSpots,
  type TroubleLog,
  type TroubleOutcome,
} from '../src/core/coach/trouble';

const cfg = CONFIG.coach;

const outcome = (over: Partial<TroubleOutcome> = {}): TroubleOutcome => ({
  mode: 'meteor',
  prompt: '8 + 6',
  answer: '14',
  skillId: 'add.bridge',
  correct: true,
  responseMs: 2000,
  wave: 1,
  ...over,
});

/** Fold a run of outcomes into a fresh table. */
const log = (...outcomes: TroubleOutcome[]): TroubleLog =>
  outcomes.reduce<TroubleLog>((acc, o) => recordTrouble(acc, o, cfg), {});

describe('recording', () => {
  it('counts attempts and misses against one problem', () => {
    const l = log(
      outcome({ correct: false }),
      outcome({ correct: true, responseMs: 3000 }),
      outcome({ correct: false }),
    );
    const entry = l[troubleKey('meteor', '8 + 6')]!;
    expect(entry.attempts).toBe(3);
    expect(entry.misses).toBe(2);
    expect(missRate(entry)).toBeCloseTo(2 / 3, 6);
    expect(entry.answer).toBe('14');
  });

  it('keeps the same sum in two modes apart', () => {
    const l = log(outcome({ mode: 'meteor' }), outcome({ mode: 'expression' }));
    expect(Object.keys(l)).toHaveLength(2);
    expect(modesSeen(l).sort()).toEqual(['expression', 'meteor']);
  });

  it('times only the right answers', () => {
    // The clock on a miss measures staring, not difficulty.
    const l = log(
      outcome({ correct: true, responseMs: 2000 }),
      outcome({ correct: false, responseMs: 30000 }),
      outcome({ correct: true, responseMs: 4000 }),
    );
    const entry = l[troubleKey('meteor', '8 + 6')]!;
    expect(entry.timed).toBe(2);
    expect(meanMs(entry)).toBe(3000);
  });

  it('reports a problem never answered right as infinitely slow', () => {
    const l = log(outcome({ correct: false }));
    expect(meanMs(l[troubleKey('meteor', '8 + 6')]!)).toBe(Number.POSITIVE_INFINITY);
  });

  it('tracks the wave it was last met', () => {
    const l = log(outcome({ wave: 4 }), outcome({ wave: 9 }), outcome({ wave: 7 }));
    expect(l[troubleKey('meteor', '8 + 6')]!.lastWave).toBe(9);
  });
});

describe('what each mode calls trouble', () => {
  it('ranks meteor problems by how often they were missed', () => {
    const l = log(
      outcome({ prompt: '8 + 6', correct: false }),
      outcome({ prompt: '8 + 6', correct: false }),
      outcome({ prompt: '7 + 5', correct: false }),
      outcome({ prompt: '2 + 2', correct: true }),
    );
    const spots = troubleSpots(l, 'meteor', 5);
    expect(spots.map((e) => e.prompt)).toEqual(['8 + 6', '7 + 5']);
    // A problem always answered correctly is not trouble and is never listed.
    expect(spots.some((e) => e.prompt === '2 + 2')).toBe(false);
  });

  it('ranks factor rocks by the ones never broken, then the slowest', () => {
    const rock = (prompt: string, over: Partial<TroubleOutcome>): TroubleOutcome =>
      outcome({ mode: 'factor', prompt, skillId: 'factor.smallest', ...over });
    const l = log(
      rock('FACTOR 91', { correct: true, responseMs: 9000 }),
      rock('FACTOR 51', { correct: true, responseMs: 2000 }),
      rock('FACTOR 77', { correct: false }),
    );
    // Never broken first, then slowest solved. Factor Storm rarely misses
    // outright — a rock you cannot factor just sits there — so speed is the
    // signal, not accuracy.
    expect(troubleSpots(l, 'factor', 5).map((e) => e.prompt)).toEqual([
      'FACTOR 77',
      'FACTOR 91',
      'FACTOR 51',
    ]);
  });

  it('lists a factor rock that was always solved, because slow still counts', () => {
    const l = log(outcome({ mode: 'factor', prompt: 'FACTOR 91', correct: true, responseMs: 9000 }));
    expect(troubleSpots(l, 'factor', 5)).toHaveLength(1);
  });

  it('respects the limit and keeps the worst', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      outcome({ prompt: `p${i}`, correct: false, wave: i }),
    );
    // Give p19 an extra miss so it must lead.
    const l = log(...many, outcome({ prompt: 'p19', correct: false, wave: 20 }));
    const spots = troubleSpots(l, 'meteor', 3);
    expect(spots).toHaveLength(3);
    expect(spots[0]!.prompt).toBe('p19');
  });

  it('returns nothing for a mode never played', () => {
    expect(troubleSpots(log(outcome()), 'collapse', 5)).toEqual([]);
  });
});

describe('whole-mode accuracy', () => {
  it('is all Collapse needs', () => {
    const pair = (correct: boolean, prompt: string): TroubleOutcome =>
      outcome({ mode: 'collapse', prompt, skillId: 'frac.percent', correct });
    const l = log(pair(true, '1/2'), pair(true, '3/4'), pair(false, '2/5'), pair(true, '2/5'));
    const acc = accuracyFor(l, 'collapse');
    expect(acc.attempts).toBe(4);
    expect(acc.correct).toBe(3);
    expect(acc.rate).toBe(0.75);
  });

  it('reports no rate at all for a mode never played', () => {
    expect(accuracyFor({}, 'collapse').rate).toBeNaN();
  });

  it('counts only the mode asked about', () => {
    const l = log(outcome({ mode: 'meteor', correct: false }), outcome({ mode: 'collapse' }));
    expect(accuracyFor(l, 'collapse').rate).toBe(1);
    expect(accuracyFor(l, 'meteor').rate).toBe(0);
  });
});

describe('the table stays small', () => {
  const tight = { troubleCap: 10, troubleShown: 5 };

  it('never grows past the cap', () => {
    let l: TroubleLog = {};
    for (let i = 0; i < 200; i++) {
      l = recordTrouble(l, outcome({ prompt: `p${i}`, correct: i % 3 === 0, wave: i }), tight);
    }
    expect(Object.keys(l).length).toBeLessThanOrEqual(tight.troubleCap);
  });

  it('drops the problems that teach nothing before the ones that do', () => {
    let l: TroubleLog = {};
    // One genuinely troublesome problem, met early and never seen again.
    l = recordTrouble(l, outcome({ prompt: 'HARD', correct: false, wave: 0 }), tight);
    l = recordTrouble(l, outcome({ prompt: 'HARD', correct: false, wave: 0 }), tight);
    // Then a flood of problems that always went fine.
    for (let i = 0; i < 100; i++) {
      l = recordTrouble(l, outcome({ prompt: `easy${i}`, correct: true, wave: i + 1 }), tight);
    }
    expect(l[troubleKey('meteor', 'HARD')], 'the missed one survives the flood').toBeDefined();
    expect(Object.keys(l).length).toBe(tight.troubleCap);
  });

  it('does not prune while under the cap', () => {
    let l: TroubleLog = {};
    for (let i = 0; i < tight.troubleCap; i++) {
      l = recordTrouble(l, outcome({ prompt: `p${i}`, correct: true }), tight);
    }
    expect(Object.keys(l)).toHaveLength(tight.troubleCap);
  });
});
