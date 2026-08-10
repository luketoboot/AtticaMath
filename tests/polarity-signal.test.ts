import { describe, expect, it } from 'vitest';
import {
  SignalLedger,
  cellFor,
  dPrime,
  emptyCounts,
  noiseTrials,
  partialFor,
  phi,
  record,
  signalTrials,
  z,
  type Cell,
  type DivisorRole,
  type MoteClass,
  type Resolution,
} from '../src/core/polarity/signal';

const CLASSES: readonly MoteClass[] = ['aOnly', 'bOnly', 'bridge', 'neither'];
const RESOLUTIONS: readonly Resolution[] = ['absorbedA', 'absorbedB', 'passed'];
const cfg = { minSignalTrials: 8, minNoiseTrials: 8, minResponsesEachWay: 3 };

describe('the truth table', () => {
  // Written out longhand rather than derived, so the test disagrees with the
  // implementation when the implementation is wrong.
  const expected: Record<MoteClass, Record<Resolution, [Cell, Cell]>> = {
    //                 absorbed in A               absorbed in B                passed
    aOnly: {
      absorbedA: ['hits', 'correctRejections'],
      absorbedB: ['misses', 'falseAlarms'],
      passed: ['misses', 'correctRejections'],
    },
    bOnly: {
      absorbedA: ['falseAlarms', 'misses'],
      absorbedB: ['correctRejections', 'hits'],
      passed: ['correctRejections', 'misses'],
    },
    bridge: {
      absorbedA: ['hits', 'excluded'],
      absorbedB: ['excluded', 'hits'],
      passed: ['misses', 'misses'],
    },
    neither: {
      absorbedA: ['falseAlarms', 'correctRejections'],
      absorbedB: ['correctRejections', 'falseAlarms'],
      passed: ['correctRejections', 'correctRejections'],
    },
  };

  for (const cls of CLASSES) {
    for (const res of RESOLUTIONS) {
      it(`${cls} + ${res}`, () => {
        const [forA, forB] = expected[cls][res];
        expect(cellFor(cls, res, 'a')).toBe(forA);
        expect(cellFor(cls, res, 'b')).toBe(forB);
      });
    }
  }

  it('covers every combination — 24 rulings, none by default', () => {
    let n = 0;
    for (const cls of CLASSES) {
      for (const res of RESOLUTIONS) {
        for (const role of ['a', 'b'] as const) {
          expect(cellFor(cls, res, role)).toBeDefined();
          n += 1;
        }
      }
    }
    expect(n).toBe(24);
  });

  it('gives a bridge taken under one divisor to that divisor alone', () => {
    // The easiest way to reintroduce the inflation the mode is built to avoid:
    // a player who only ever eats common multiples never made either call.
    const a = record(emptyCounts(), 'bridge', 'absorbedA', 'a');
    const b = record(emptyCounts(), 'bridge', 'absorbedA', 'b');
    expect(a.hits).toBe(1);
    expect(b).toEqual(emptyCounts());
  });
});

/** Play out a field of motes under a fixed strategy and score one divisor. */
function runStrategy(field: readonly MoteClass[], strategy: (cls: MoteClass) => Resolution, role: DivisorRole) {
  let counts = emptyCounts();
  for (const cls of field) counts = record(counts, cls, strategy(cls), role);
  return counts;
}

describe('the degenerate strategies score exactly nothing', () => {
  // Built from resolutions rather than from hand-written counts, so this is a
  // claim about the mode and not about arithmetic.
  const field: MoteClass[] = [];
  for (let i = 0; i < 7; i++) field.push(...CLASSES);

  it('absorbing everything reads as no discrimination', () => {
    // Scored against the divisor the player is actually wearing: every mote
    // taken, so hits and false alarms rise together and the rates coincide.
    const counts = runStrategy(field, () => 'absorbedA', 'a');
    expect(dPrime(counts)).toBeCloseTo(0, 12);
    expect(partialFor(dPrime(counts))).toBeCloseTo(0.5, 7);
  });

  it('dodging everything reads as no discrimination', () => {
    const counts = runStrategy(field, () => 'passed', 'a');
    expect(dPrime(counts)).toBeCloseTo(0, 12);
    expect(partialFor(dPrime(counts))).toBeCloseTo(0.5, 7);
  });

  it('refuses to score either of them at all', () => {
    // Belt and braces. The arithmetic lands on zero, and the gate never lets
    // the ledger get that far, because one answer given to everything is not a
    // discrimination however it is scored.
    for (const strategy of ['absorbedA', 'passed'] as const) {
      const ledger = new SignalLedger();
      for (let i = 0; i < 25; i++) for (const cls of CLASSES) ledger.add(cls, strategy, 'a');
      expect(ledger.ready(cfg)).toBe(false);
      expect(ledger.flush(cfg)).toBeUndefined();
    }
  });

  it('refuses to credit a divisor the player never wore', () => {
    // A run spent parked in A says nothing about B. Left to the raw arithmetic
    // this posts a small positive d' — zero hits and zero false alarms, but the
    // corrected rates sit over different denominators — so the gate has to
    // catch it, and this is the case that put the gate there.
    const ledger = new SignalLedger();
    for (let i = 0; i < 25; i++) for (const cls of CLASSES) ledger.add(cls, 'absorbedA', 'b');
    expect(dPrime(ledger.peek())).toBeGreaterThan(0);
    expect(ledger.ready(cfg)).toBe(false);
    expect(ledger.flush(cfg)).toBeUndefined();
  });

  it('holds at every field size, so neither is a matter of sample size', () => {
    for (let cycles = 1; cycles <= 40; cycles++) {
      const f: MoteClass[] = [];
      for (let i = 0; i < cycles; i++) f.push(...CLASSES);
      expect(dPrime(runStrategy(f, () => 'absorbedB', 'b'))).toBeCloseTo(0, 12);
      expect(dPrime(runStrategy(f, () => 'passed', 'a'))).toBeCloseTo(0, 12);
    }
  });

  it('needs the field balanced, and never in the masher’s favour', () => {
    // The exact-zero guarantee is a property of the *wave*, not just of the
    // arithmetic: absorbing everything gives H = (S+½)/(S+1) against
    // FA = (N+½)/(N+1), and those are equal only when the divisor sees as many
    // of its own multiples as it does non-multiples. Tilt the field toward
    // signal and mashing starts to pay, which is why composition balances the
    // classes and this test pins the direction of the error either way.
    const lopsided = (signal: number, noise: number): MoteClass[] => [
      ...Array<MoteClass>(signal).fill('aOnly'),
      ...Array<MoteClass>(noise).fill('neither'),
    ];
    const masher = (f: MoteClass[]): number => dPrime(runStrategy(f, () => 'absorbedA', 'a'));

    expect(masher(lopsided(10, 10))).toBeCloseTo(0, 12);
    expect(masher(lopsided(10, 4))).toBeGreaterThan(0); // signal-heavy pays — do not ship this
    expect(masher(lopsided(4, 10))).toBeLessThan(0); // noise-heavy punishes, the safe direction
  });

  it('rewards the player who actually sorts', () => {
    const perfect = (cls: MoteClass): Resolution =>
      cls === 'aOnly' || cls === 'bridge' ? 'absorbedA' : 'passed';
    const counts = runStrategy(field, perfect, 'a');
    expect(dPrime(counts)).toBeGreaterThan(2);
    expect(partialFor(dPrime(counts))).toBeGreaterThan(0.9);
  });

  it('puts a player who is merely good between the two', () => {
    // Right about three quarters of the time, in both directions.
    const field2 = Array.from({ length: 80 }, (_, i) => CLASSES[i % CLASSES.length]!);
    let i = 0;
    const wobbly = (cls: MoteClass): Resolution => {
      const shouldTake = cls === 'aOnly' || cls === 'bridge';
      const slip = i++ % 4 === 0;
      return shouldTake !== slip ? 'absorbedA' : 'passed';
    };
    const perfect = (cls: MoteClass): Resolution =>
      cls === 'aOnly' || cls === 'bridge' ? 'absorbedA' : 'passed';
    const d = dPrime(runStrategy(field2, wobbly, 'a'));
    expect(d).toBeGreaterThan(dPrime(runStrategy(field2, () => 'absorbedA', 'a')));
    expect(d).toBeLessThan(dPrime(runStrategy(field2, perfect, 'a')));
  });
});

describe('d prime stays finite', () => {
  it('survives a spotless record at any size', () => {
    for (let n = 1; n <= 100; n++) {
      const d = dPrime({ hits: n, misses: 0, falseAlarms: 0, correctRejections: n });
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
  });

  it('survives a spotless failure at any size', () => {
    for (let n = 1; n <= 100; n++) {
      const d = dPrime({ hits: 0, misses: n, falseAlarms: n, correctRejections: 0 });
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeLessThan(0);
    }
  });

  it('survives an empty ledger rather than returning a NaN a save could keep', () => {
    expect(Number.isFinite(dPrime(emptyCounts()))).toBe(true);
    expect(dPrime(emptyCounts())).toBeCloseTo(0, 12);
  });

  it('always yields a partial inside the unit interval', () => {
    for (const d of [-8, -3, -1, 0, 1, 3, 8, 40]) {
      const p = partialFor(d);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('the normal functions', () => {
  it('phi is anchored where it should be', () => {
    // Seven places, which is what the series guarantees. The residue at zero is
    // about 5e-10, nine orders below anything a rating delta could notice.
    expect(phi(0)).toBeCloseTo(0.5, 7);
    expect(phi(1.959964)).toBeCloseTo(0.975, 6);
    expect(phi(-1.959964)).toBeCloseTo(0.025, 6);
    expect(phi(1)).toBeCloseTo(0.8413447, 6);
  });

  it('z is anchored where it should be', () => {
    expect(z(0.5)).toBeCloseTo(0, 9);
    expect(z(0.975)).toBeCloseTo(1.959964, 5);
    expect(z(0.025)).toBeCloseTo(-1.959964, 5);
    expect(z(0.8413447)).toBeCloseTo(1, 5);
  });

  it('round-trips across the range', () => {
    for (let p = 0.001; p < 0.999; p += 0.001) {
      expect(phi(z(p))).toBeCloseTo(p, 5);
    }
  });

  it('clamps rather than returning an infinity at the boundary', () => {
    expect(Number.isFinite(z(0))).toBe(true);
    expect(Number.isFinite(z(1))).toBe(true);
  });

  it('d prime of one half against one half is zero, the identity that matters', () => {
    expect(partialFor(0)).toBeCloseTo(0.5, 7);
  });
});

describe('SignalLedger', () => {
  const fill = (ledger: SignalLedger, cls: MoteClass, res: Resolution, n: number): void => {
    for (let i = 0; i < n; i++) ledger.add(cls, res, 'a');
  };

  it('will not cash until it holds enough of both kinds of trial', () => {
    const ledger = new SignalLedger();
    fill(ledger, 'aOnly', 'absorbedA', 20); // signal only
    expect(ledger.ready(cfg)).toBe(false);
    expect(ledger.flush(cfg)).toBeUndefined();

    fill(ledger, 'neither', 'passed', 8); // now the noise side is covered
    expect(ledger.ready(cfg)).toBe(true);
    expect(ledger.flush(cfg)).toBeDefined();
  });

  it('will not cash a player who answered every mote the same way', () => {
    const ledger = new SignalLedger();
    fill(ledger, 'aOnly', 'absorbedA', 20);
    fill(ledger, 'neither', 'absorbedA', 20); // plenty of both trials, all "yes"
    expect(signalTrials(ledger.peek())).toBeGreaterThanOrEqual(cfg.minSignalTrials);
    expect(noiseTrials(ledger.peek())).toBeGreaterThanOrEqual(cfg.minNoiseTrials);
    expect(ledger.ready(cfg)).toBe(false);

    fill(ledger, 'neither', 'passed', 3); // three refusals and it becomes a reading
    expect(ledger.ready(cfg)).toBe(true);
  });

  it('starts over once cashed, so evidence is never counted twice', () => {
    const ledger = new SignalLedger();
    fill(ledger, 'aOnly', 'absorbedA', 8);
    fill(ledger, 'neither', 'passed', 8);
    expect(ledger.flush(cfg)).toBeDefined();
    expect(ledger.peek()).toEqual(emptyCounts());
    expect(ledger.ready(cfg)).toBe(false);
  });

  it('throws away a short ledger rather than rating a handful of motes', () => {
    const ledger = new SignalLedger();
    fill(ledger, 'aOnly', 'absorbedA', 3);
    fill(ledger, 'neither', 'passed', 3);
    expect(ledger.flush(cfg)).toBeUndefined();
    // And the evidence is still there, in case the run continues.
    expect(signalTrials(ledger.peek())).toBe(3);
    expect(noiseTrials(ledger.peek())).toBe(3);
  });

  it('ignores excluded motes entirely, including for the trial count', () => {
    const ledger = new SignalLedger();
    for (let i = 0; i < 30; i++) ledger.add('bridge', 'absorbedB', 'a');
    expect(ledger.peek()).toEqual(emptyCounts());
    expect(ledger.ready(cfg)).toBe(false);
  });
});
