import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  balancedFactor,
  composeRockValue,
  isCompleteShot,
  isPrime,
  isViablePrefix,
  legalShots,
  properFactors,
  resolveShot,
  shotScore,
} from '../src/core/factor/factor';
import { FactorSession } from '../src/core/factor/session';
import { createRng } from '../src/core/rng';

const f = CONFIG.factor;

describe('factorisation', () => {
  it('lists proper factors in order, excluding 1 and the number itself', () => {
    expect(properFactors(84)).toEqual([2, 3, 4, 6, 7, 12, 14, 21, 28, 42]);
    expect(properFactors(12)).toEqual([2, 3, 4, 6]);
    expect(properFactors(16)).toEqual([2, 4, 8]);
  });

  it('gives primes no proper factors', () => {
    for (const p of [2, 3, 5, 7, 11, 13, 97]) {
      expect(properFactors(p), `${p}`).toEqual([]);
      expect(isPrime(p)).toBe(true);
    }
    expect(isPrime(1)).toBe(false);
    expect(isPrime(91)).toBe(false); // 7 x 13 — the classic "looks prime"
  });

  it('picks the split closest to square', () => {
    expect(balancedFactor(84)).toBe(7); // 7 x 12 beats 2 x 42
    expect(balancedFactor(36)).toBe(6);
    expect(balancedFactor(30)).toBe(5);
    expect(balancedFactor(7)).toBeNull();
  });
});

describe('shots', () => {
  it('splits into the factor and its quotient', () => {
    expect(resolveShot(84, 12)).toEqual({ kind: 'split', pieces: [12, 7], balanced: false });
    expect(resolveShot(84, 7)).toEqual({ kind: 'split', pieces: [7, 12], balanced: true });
  });

  it('destroys a prime named in full', () => {
    expect(resolveShot(13, 13)).toEqual({ kind: 'destroy', prime: true });
    expect(resolveShot(2, 2)).toEqual({ kind: 'destroy', prime: true });
  });

  it('refuses to let a composite be named instead of broken', () => {
    // The whole mode rests on this: if typing what the rock says worked, the
    // best play would be to copy the digits and never factor anything.
    expect(resolveShot(12, 12).kind).toBe('illegal');
    expect(resolveShot(84, 84).kind).toBe('illegal');
    expect(resolveShot(4, 4).kind).toBe('illegal');
  });

  it('rejects non-factors, 1, and nonsense', () => {
    expect(resolveShot(84, 5).kind).toBe('illegal');
    expect(resolveShot(84, 1).kind).toBe('illegal');
    expect(resolveShot(84, 0).kind).toBe('illegal');
    expect(resolveShot(84, -2).kind).toBe('illegal');
    expect(resolveShot(84, 2.5).kind).toBe('illegal');
  });

  it('never produces a fragment of 1', () => {
    for (let n = 2; n <= 200; n++) {
      for (const shot of legalShots(n)) {
        const outcome = resolveShot(n, shot);
        if (outcome.kind === 'split') {
          expect(outcome.pieces[0], `${n} / ${shot}`).toBeGreaterThan(1);
          expect(outcome.pieces[1], `${n} / ${shot}`).toBeGreaterThan(1);
          expect(outcome.pieces[0] * outcome.pieces[1]).toBe(n);
        }
      }
    }
  });

  it('gives a prime one legal shot and a composite only its factors', () => {
    expect(legalShots(13)).toEqual([13]);
    expect(legalShots(12)).toEqual([2, 3, 4, 6]);
    expect(legalShots(12)).not.toContain(12);
  });
});

describe('typing rules', () => {
  it('waits for a longer factor rather than firing on its prefix', () => {
    // 63's shots are 3, 7, 9, 21, 63. Typing "2" is going somewhere (21).
    expect(isViablePrefix(63, '2')).toBe(true);
    expect(isCompleteShot(63, '2')).toBe(false);
    expect(isCompleteShot(63, '21')).toBe(true);
  });

  it('fires at once when nothing longer starts with the buffer', () => {
    // 12's shots are 2, 3, 4, 6 — nothing else starts with "2".
    expect(isCompleteShot(12, '2')).toBe(true);
    // 96 reaches 12 and 16, so "1" has to wait for its second digit.
    expect(isCompleteShot(96, '1')).toBe(false);
    expect(isViablePrefix(96, '1')).toBe(true);
    expect(isCompleteShot(96, '16')).toBe(true);
  });

  it('treats typing a composite own value as a dead end, not a shot', () => {
    expect(isCompleteShot(12, '12')).toBe(false);
    expect(isViablePrefix(12, '1')).toBe(false);
    expect(isViablePrefix(12, '12')).toBe(false);
  });

  it('lets a prime be named', () => {
    expect(isViablePrefix(13, '1')).toBe(true);
    expect(isCompleteShot(13, '13')).toBe(true);
  });

  it('calls a dead end a dead end', () => {
    expect(isViablePrefix(12, '5')).toBe(false);
    expect(isViablePrefix(12, '8')).toBe(false);
    expect(isViablePrefix(12, '')).toBe(true);
  });
});

describe('scoring', () => {
  it('pays most for a prime', () => {
    const prime = shotScore(13, { kind: 'destroy', prime: true }, f);
    const composite = shotScore(12, { kind: 'destroy', prime: false }, f);
    expect(prime).toBeGreaterThan(composite);
  });

  it('pays a premium for the balanced split', () => {
    const balanced = shotScore(84, { kind: 'split', pieces: [7, 12], balanced: true }, f);
    const lazy = shotScore(84, { kind: 'split', pieces: [2, 42], balanced: false }, f);
    expect(balanced).toBeGreaterThan(lazy);
  });

  it('scales with the size of the rock, and pays nothing for an illegal shot', () => {
    const big = shotScore(200, { kind: 'destroy', prime: false }, f);
    const small = shotScore(20, { kind: 'destroy', prime: false }, f);
    expect(big).toBeGreaterThan(small);
    expect(shotScore(84, { kind: 'illegal' }, f)).toBe(0);
  });
});

describe('rock composition', () => {
  it('builds rocks out of the families it is given', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const value = composeRockValue([7], 2, f, rng);
      expect(value % 7).toBe(0);
    }
  });

  it('stays inside the configured range', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const value = composeRockValue([2, 3, 5, 7, 11], 3, f, rng);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(f.maxRockValue);
    }
  });
});

describe('FactorSession', () => {
  function session(skills = {}): FactorSession {
    return new FactorSession({
      seed: 42,
      skills,
      totalWavesBefore: 0,
      ownedUpgrades: [],
      loadout: [],
    });
  }

  it('opens a wave with the configured number of rocks', () => {
    const s = session();
    expect(s.nextWave()).toHaveLength(f.baseRocks);
    expect(s.waveCleared).toBe(false);
  });

  it('a split removes the parent and adds both halves', () => {
    const s = session();
    const rocks = s.nextWave();
    const rock = rocks[0]!;
    const shot = properFactors(rock.value)[0]!;

    const outcome = s.shoot(rock.id, shot, 1200);
    expect(outcome.result).toBe('split');
    if (outcome.result === 'split') {
      expect(s.liveRocks.find((r) => r.id === rock.id)).toBeUndefined();
      expect(s.liveRocks).toContainEqual(outcome.pieces[0]);
      expect(s.liveRocks).toContainEqual(outcome.pieces[1]);
      expect(outcome.pieces[0].value * outcome.pieces[1].value).toBe(rock.value);
    }
  });

  it('the board grows before it clears', () => {
    const s = session();
    const rocks = s.nextWave();
    const before = s.liveRocks.length;
    const rock = rocks[0]!;
    s.shoot(rock.id, properFactors(rock.value)[0]!, 1200);
    expect(s.liveRocks.length).toBe(before + 1);
  });

  it('clears only by factorising all the way down to primes', () => {
    const s = session();
    s.nextWave();
    let splits = 0;
    let primes = 0;
    for (let guard = 0; guard < 500 && !s.waveCleared; guard++) {
      const rock = s.liveRocks[0]!;
      const factors = properFactors(rock.value);
      if (factors.length === 0) {
        // Prime: naming it is the only move, and it ends that branch.
        expect(s.shoot(rock.id, rock.value, 1000).result).toBe('destroyed');
        primes += 1;
      } else {
        expect(s.shoot(rock.id, factors[0]!, 1000).result).toBe('split');
        splits += 1;
      }
    }
    expect(s.waveCleared).toBe(true);
    expect(splits).toBeGreaterThan(0);
    // Every rock ends as primes, so a cleared board has named more primes than
    // it had rocks to begin with.
    expect(primes).toBeGreaterThan(CONFIG.factor.baseRocks);
  });

  it('will not let a composite be shot by name, however tempting', () => {
    const s = session();
    const composite = s.nextWave().find((r) => properFactors(r.value).length > 0)!;
    const before = s.liveRocks.length;
    expect(s.shoot(composite.id, composite.value, 1000).result).toBe('illegal');
    expect(s.liveRocks.length).toBe(before);
    expect(s.score).toBe(0);
    expect(s.misfires).toBe(1);
  });

  it('an illegal shot is a misfire and changes nothing else', () => {
    const s = session();
    const rock = s.nextWave()[0]!;
    const before = s.liveRocks.length;
    // 1 divides everything but is never legal.
    expect(s.shoot(rock.id, 1, 1000).result).toBe('illegal');
    expect(s.misfires).toBe(1);
    expect(s.liveRocks.length).toBe(before);
    expect(s.score).toBe(0);
    expect(s.streak).toBe(0);
  });

  it('shooting an unknown rock is illegal rather than a crash', () => {
    const s = session();
    s.nextWave();
    expect(s.shoot(9999, 2, 1000).result).toBe('illegal');
  });

  it('credits division and the relevant times table', () => {
    const s = session();
    const rock = s.nextWave().find((r) => properFactors(r.value).length > 0)!;
    s.shoot(rock.id, properFactors(rock.value)[0]!, 1200);
    expect(s.skillTable['div.exact']!.attempts).toBeGreaterThan(0);
  });

  it('builds rocks from the families the player is weakest on', () => {
    // Everything strong except the 7s: 7 should show up far more than 3.
    const skills: Record<string, { rating: number; attempts: number; lastAttemptWave: number }> = {};
    for (let n = 2; n <= 12; n++) {
      skills[`mul.table.${n}`] = { rating: 1200, attempts: 20, lastAttemptWave: 1 };
    }
    skills['mul.table.7'] = { rating: 120, attempts: 20, lastAttemptWave: 1 };

    const s = new FactorSession({
      seed: 5,
      skills,
      totalWavesBefore: 0,
      ownedUpgrades: [],
      loadout: [],
    });
    let sevens = 0;
    let elevens = 0;
    for (let wave = 0; wave < 25; wave++) {
      for (const rock of s.nextWave()) {
        // 11 is a strong family here, and prime, so it cannot be reached
        // through any other family's products — a clean control.
        if (rock.value % 7 === 0) sevens += 1;
        if (rock.value % 11 === 0) elevens += 1;
      }
    }
    expect(sevens).toBeGreaterThan(elevens * 3);
  });

  it('damage costs hp and half the combo', () => {
    const s = session();
    const rocks = s.nextWave();
    // Split where possible so the board keeps supplying targets; destroying
    // everything would empty it before the combo is worth halving.
    for (let i = 0; i < 6; i++) {
      const rock = s.liveRocks.find((r) => properFactors(r.value).length > 0) ?? s.liveRocks[0]!;
      const shot = properFactors(rock.value)[0] ?? rock.value;
      s.shoot(rock.id, shot, 1000);
    }
    const streak = s.streak;
    expect(streak).toBeGreaterThan(1);
    s.takeDamage();
    expect(s.hp).toBe(CONFIG.meteors.baseHp - 1);
    expect(s.streak).toBe(Math.floor(streak * CONFIG.combo.damageKeepFraction));
    expect(rocks.length).toBeGreaterThan(0);
  });

  it('big rocks lumber and fragments are quick', () => {
    const s = session();
    expect(s.driftSpeed(f.maxRockValue)).toBeLessThan(s.driftSpeed(f.minRockValue));
    expect(s.radius(f.maxRockValue)).toBeGreaterThan(s.radius(f.minRockValue));
  });

  it('is deterministic for the same seed', () => {
    const values = (): number[] => session().nextWave().map((r) => r.value);
    expect(values()).toEqual(values());
  });
});
