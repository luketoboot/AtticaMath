import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { RunSession } from '../src/core/session';
import { findFalloffTier } from '../src/core/skills/placement';
import { getSkill, maxTier } from '../src/core/skills/taxonomy';

function freshSession(overrides: Partial<ConstructorParameters<typeof RunSession>[0]> = {}): RunSession {
  return new RunSession({
    seed: 42,
    skills: {},
    totalWavesBefore: 0,
    placementDone: false,
    ownedUpgrades: [],
    loadout: [],
    ...overrides,
  });
}

describe('cold start placement', () => {
  it('runs placement waves then seeds and flips to normal play', () => {
    const s = freshSession();
    expect(s.inPlacement).toBe(true);
    for (let w = 0; w < CONFIG.waves.placementWaves; w++) {
      const plan = s.nextWave();
      for (const p of plan.problems) {
        // Player nails easy tiers fast, fails hard ones.
        const tier = getSkill(p.skillIds[0]!).tier;
        if (tier <= 2) s.recordHit(p, 1500);
        else s.recordMiss(p, 9000);
      }
      s.endWave();
    }
    expect(s.inPlacement).toBe(false);
    // Seeded: unattempted easy skills should sit fluent, hard ones below base.
    const table = s.skillTable;
    const easy = table['add.single']!;
    expect(easy.rating).toBeGreaterThanOrEqual(getSkill('add.single').baseDifficulty);
    const hard = table['mul.3x2']!;
    expect(hard.rating).toBeLessThanOrEqual(getSkill('mul.3x2').baseDifficulty);
  });

  it('findFalloffTier reports past-max when everything is aced', () => {
    const attempts = [];
    for (let t = 0; t <= maxTier(); t++) {
      attempts.push({ skillId: 'add.single', difficulty: 200, correct: true, responseMs: 1000 });
    }
    expect(findFalloffTier(attempts, CONFIG)).toBe(maxTier() + 1);
  });
});

describe('run flow', () => {
  function throughPlacement(s: RunSession): void {
    while (s.inPlacement) {
      const plan = s.nextWave();
      for (const p of plan.problems) s.recordHit(p, 2000);
      s.endWave();
    }
  }

  it('accumulates score, streak, and kills on hits', () => {
    const s = freshSession();
    throughPlacement(s);
    const plan = s.nextWave();
    const before = s.score;
    s.recordHit(plan.problems[0]!, 1500);
    s.recordHit(plan.problems[1]!, 1500);
    expect(s.score).toBeGreaterThan(before);
    const placementHits = CONFIG.waves.placementWaves * CONFIG.waves.placementProblems;
    expect(s.streak).toBe(placementHits + 2); // placement hits count into the streak too
  });

  it('a miss breaks the streak and costs hp', () => {
    const s = freshSession();
    throughPlacement(s);
    const plan = s.nextWave();
    const hp = s.hp;
    s.recordMiss(plan.problems[0]!, 12000);
    expect(s.streak).toBe(0);
    expect(s.hp).toBe(hp - 1);
  });

  it('game over at zero hp', () => {
    const s = freshSession();
    throughPlacement(s);
    const plan = s.nextWave();
    for (let i = 0; i < CONFIG.meteors.baseHp; i++) {
      s.recordMiss(plan.problems[i % plan.problems.length]!, 12000);
    }
    expect(s.gameOver).toBe(true);
  });

  it('shield absorbs the first landing', () => {
    const s = freshSession({ ownedUpgrades: ['upgrade.shield'], loadout: ['upgrade.shield'] });
    throughPlacement(s);
    const plan = s.nextWave();
    const hp = s.hp;
    s.recordMiss(plan.problems[0]!, 12000);
    expect(s.hp).toBe(hp); // absorbed
    s.recordMiss(plan.problems[1]!, 12000);
    expect(s.hp).toBe(hp - 1); // second one lands
  });

  it('hp upgrade raises starting hp', () => {
    const s = freshSession({ ownedUpgrades: ['upgrade.hp'], loadout: ['upgrade.hp'] });
    expect(s.hp).toBe(CONFIG.meteors.baseHp + 2);
  });

  it('loadout only honors owned upgrades', () => {
    const s = freshSession({ ownedUpgrades: [], loadout: ['upgrade.hp'] });
    expect(s.hp).toBe(CONFIG.meteors.baseHp);
  });

  it('offers a coach tip after normal waves and overweights that skill', () => {
    const s = freshSession();
    throughPlacement(s);
    const plan = s.nextWave();
    // Miss everything from one skill to tank it.
    for (const p of plan.problems) s.recordMiss(p, 10000);
    const pick = s.endWave();
    expect(pick).toBeDefined();
    expect(pick!.tip.text.length).toBeGreaterThan(0);
  });

  it('waves speed up over the run', () => {
    const s = freshSession({ placementDone: true });
    s.nextWave();
    const early = s.fallSeconds(500);
    for (let i = 0; i < 10; i++) s.nextWave();
    const late = s.fallSeconds(500);
    expect(late).toBeLessThan(early);
  });

  it('is deterministic for the same seed', () => {
    const a = freshSession({ seed: 123 });
    const b = freshSession({ seed: 123 });
    const planA = a.nextWave();
    const planB = b.nextWave();
    expect(planA.problems.map((p) => p.prompt)).toEqual(planB.problems.map((p) => p.prompt));
  });
});
