import { describe, expect, it } from 'vitest';
import { matchesPercent, wholePercentPairs } from '../src/core/collapse/equiv';
import { generateProblem } from '../src/core/generator/generate';
import { createRng } from '../src/core/rng';

describe('wholePercentPairs', () => {
  it('excludes anything the digit-only buffer could not type', () => {
    for (const entry of wholePercentPairs()) {
      expect(Number.isInteger(entry.percent), `${entry.percent}% is not typeable`).toBe(true);
      expect(matchesPercent(entry.fraction, entry.percent)).toBe(true);
    }
  });

  it('drops eighths and sixteenths, keeps the benchmarks', () => {
    const dens = wholePercentPairs().map((e) => e.fraction.den);
    expect(dens).not.toContain(8);
    expect(dens).not.toContain(16);
    expect(dens).toContain(2);
    expect(dens).toContain(20);
  });

  it('honours the tier cap', () => {
    expect(wholePercentPairs(1).every((e) => e.tier === 1)).toBe(true);
  });
});

describe('fraction recipes', () => {
  const rng = createRng(11);

  it('frac.percent states a fraction that really is that percentage', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('frac.percent', rng);
      const [num, den] = p.prompt.split(' ')[0]!.split('/').map(Number);
      expect((num! / den!) * 100).toBeCloseTo(Number(p.answer), 9);
    }
  });

  it('frac.reduce asks for the denominator that completes the equivalence', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('frac.reduce', rng);
      // "6/8 = 3/?" — the shown pair and the reduced numerator must agree with
      // the answer, or the problem has more than one right response.
      const [shown, reduced] = p.prompt.split(' = ');
      const [sn, sd] = shown!.split('/').map(Number);
      const rn = Number(reduced!.split('/')[0]);
      expect(sn! / sd!).toBeCloseTo(rn / Number(p.answer), 9);
    }
  });

  it('frac.of and pct.of always land on a whole number', () => {
    for (let i = 0; i < 300; i++) {
      for (const id of ['frac.of', 'pct.of'] as const) {
        const p = generateProblem(id, rng);
        expect(p.answer).toMatch(/^\d+$/);
        expect(Number(p.answer)).toBeGreaterThan(0);
      }
    }
  });

  it('pct.of computes the stated percentage of the stated quantity', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('pct.of', rng);
      const [pct, whole] = p.prompt.replace('% OF', '').split(' ').map(Number);
      expect(Number(p.answer)).toBe((pct! * whole!) / 100);
    }
  });

  it('pct.of asks for quantities that are not all multiples of twenty', () => {
    // The regression this guards: keying the quantity to 20 kept every answer
    // whole, but made "60% of 140" answerable by pattern instead of by method.
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      seen.add(Number(generateProblem('pct.of', rng).prompt.split(' ').pop()));
    }
    const awkward = [...seen].filter((whole) => whole % 20 !== 0);
    expect(awkward.length).toBeGreaterThan(0);
    // Not just a token few, either — most of the range should be reachable.
    expect(awkward.length).toBeGreaterThan(seen.size / 3);
  });

  it('pct.of reaches the percentages between the benchmarks', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      seen.add(Number(generateProblem('pct.of', rng).prompt.split('%')[0]));
    }
    for (const pct of [35, 45, 55, 65, 85, 95]) expect(seen).toContain(pct);
  });

  it('pct.what names the true percentage the part is of the whole', () => {
    for (let i = 0; i < 300; i++) {
      const p = generateProblem('pct.what', rng);
      const [part, whole] = p.prompt.match(/^(\d+) IS \?% OF (\d+)$/)!.slice(1).map(Number);
      expect(p.answer).toMatch(/^\d+$/);
      expect((part! / whole!) * 100).toBeCloseTo(Number(p.answer), 9);
      expect(Number(p.answer)).toBeGreaterThan(0);
      expect(Number(p.answer)).toBeLessThan(100);
    }
  });

  it('frac.add.same keeps the sum a proper fraction', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('frac.add.same', rng);
      const den = Number(p.prompt.split('/').pop());
      expect(Number(p.answer)).toBeLessThan(den);
      expect(Number(p.answer)).toBeGreaterThan(1); // two positive numerators
    }
  });

  it('frac.lcd answers with a real common denominator, never a larger multiple', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('frac.lcd', rng);
      const [d1, d2] = p.prompt.match(/1\/(\d+) \+ 1\/(\d+)/)!.slice(1).map(Number);
      const answer = Number(p.answer);
      expect(answer % d1!).toBe(0);
      expect(answer % d2!).toBe(0);
      // Least common, so no smaller number can do the same job.
      for (let n = Math.max(d1!, d2!); n < answer; n++) {
        expect(n % d1! === 0 && n % d2! === 0).toBe(false);
      }
    }
  });

  it('frac.add.unlike converts both fractions onto the printed denominator', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('frac.add.unlike', rng);
      const [a, d1, b, d2, common] = p.prompt
        .match(/(\d+)\/(\d+) \+ (\d+)\/(\d+) = \?\/(\d+)/)!
        .slice(1)
        .map(Number);
      expect(Number(p.answer) / common!).toBeCloseTo(a! / d1! + b! / d2!, 9);
    }
  });
});

describe('factor recipes', () => {
  const rng = createRng(5);

  it('factor.smallest and factor.deep name a true least factor', () => {
    for (let i = 0; i < 200; i++) {
      for (const id of ['factor.smallest', 'factor.deep'] as const) {
        const p = generateProblem(id, rng);
        const value = Number(p.prompt.split(' ').pop());
        const answer = Number(p.answer);
        expect(value % answer).toBe(0);
        for (let d = 2; d < answer; d++) expect(value % d).not.toBe(0);
      }
    }
  });

  it('factor.smallest never gives the factor away with an even or five ending', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('factor.smallest', rng);
      const value = Number(p.prompt.split(' ').pop());
      expect(value % 2).not.toBe(0);
      expect(value % 5).not.toBe(0);
    }
  });

  it('factor.deep stays in three digits and factor.smallest in two', () => {
    for (let i = 0; i < 100; i++) {
      expect(Number(generateProblem('factor.smallest', rng).prompt.split(' ').pop())).toBeLessThan(100);
      const deep = Number(generateProblem('factor.deep', rng).prompt.split(' ').pop());
      expect(deep).toBeGreaterThanOrEqual(100);
      expect(deep).toBeLessThan(1000);
    }
  });

  it('factor.prime answers with the next prime, and nothing between is prime', () => {
    for (let i = 0; i < 300; i++) {
      const p = generateProblem('factor.prime', rng);
      const n = Number(p.prompt.split(' ').pop());
      const answer = Number(p.answer);
      expect(answer).toBeGreaterThan(n);
      const isPrime = (v: number): boolean => {
        for (let d = 2; d * d <= v; d++) if (v % d === 0) return false;
        return v >= 2;
      };
      expect(isPrime(answer)).toBe(true);
      for (let v = n + 1; v < answer; v++) expect(isPrime(v)).toBe(false);
    }
  });
});
