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

describe('combo in a run', () => {
  const combo = CONFIG.combo;

  function hitAll(s: RunSession, n: number): void {
    const plan = s.nextWave();
    for (let i = 0; i < n; i++) s.recordHit(plan.problems[i % plan.problems.length]!, 1200);
  }

  it('kills raise the multiplier and the multiplier raises the score', () => {
    const s = freshSession({ placementDone: true });
    const plan = s.nextWave();
    const first = s.recordHit(plan.problems[0]!, 1200);
    expect(s.comboMultiplier).toBe(1);

    // Climb past the first tier, then score the same problem again.
    for (let i = 0; i < combo.tierThresholds[0]!; i++) s.recordHit(plan.problems[0]!, 1200);
    expect(s.comboMultiplier).toBeGreaterThan(1);
    expect(s.recordHit(plan.problems[0]!, 1200)).toBeGreaterThan(first);
  });

  it('cools off when the window empties', () => {
    const s = freshSession({ placementDone: true });
    hitAll(s, 5);
    expect(s.streak).toBe(5);
    s.tick(combo.baseWindowSeconds + 1);
    expect(s.streak).toBe(0);
    expect(s.comboMultiplier).toBe(1);
  });

  it('wrong digits cost clock but not the combo', () => {
    const s = freshSession({ placementDone: true });
    hitAll(s, 3);
    const before = s.comboFraction;
    s.recordWrongDigit();
    expect(s.streak).toBe(3);
    expect(s.comboFraction).toBeLessThan(before);
  });

  it('carries the combo through a clean wave and drops it after a landing', () => {
    const clean = freshSession({ placementDone: true });
    hitAll(clean, 4);
    clean.endWave();
    expect(clean.streak).toBe(4);

    const messy = freshSession({ placementDone: true });
    const plan = messy.nextWave();
    for (let i = 0; i < 4; i++) messy.recordHit(plan.problems[i]!, 1200);
    messy.recordMiss(plan.problems[5]!, 9000);
    messy.recordHit(plan.problems[6]!, 1200);
    messy.endWave();
    expect(messy.streak).toBe(0);
  });

  it('a hot combo speeds the board up', () => {
    const s = freshSession({ placementDone: true });
    s.nextWave();
    const calmFall = s.fallSeconds(500);
    const calmGap = s.spawnGapSeconds();
    const calmBoard = s.maxConcurrentMeteors();

    hitAll(s, combo.tierThresholds[combo.tierThresholds.length - 1]!);
    expect(s.fallSeconds(500)).toBeLessThan(calmFall);
    expect(s.spawnGapSeconds()).toBeLessThan(calmGap);
    expect(s.maxConcurrentMeteors()).toBeGreaterThan(calmBoard);
  });

  it('reports the best combo in the run stats', () => {
    const s = freshSession({ placementDone: true });
    hitAll(s, 7);
    s.tick(combo.baseWindowSeconds + 1);
    expect(s.streak).toBe(0);
    expect(s.stats().bestStreak).toBe(7);
  });
});

describe('hot meteors and drops in a run', () => {
  it('a hot kill pays a multiple and jumps the combo further', () => {
    const plain = freshSession({ placementDone: true });
    const hot = freshSession({ placementDone: true });
    const p = plain.nextWave().problems[0]!;
    hot.nextWave();

    const plainPoints = plain.recordHit(p, 1200);
    const hotPoints = hot.recordHit(p, 1200, true);
    expect(hotPoints).toBe(plainPoints * CONFIG.meteors.hotScoreMultiplier);
    expect(hot.streak).toBe(CONFIG.meteors.hotComboGain);
    expect(plain.streak).toBe(1);
  });

  it('an x2 pickup stacks on top of the combo multiplier', () => {
    const s = freshSession({ placementDone: true });
    const p = s.nextWave().problems[0]!;
    const before = s.scoreMultiplier;
    s.collectDrop('double');
    expect(s.scoreMultiplier).toBe(before * CONFIG.drops.doubleMultiplier);

    s.tick(CONFIG.drops.doubleSeconds + 0.1);
    expect(s.scoreMultiplier).toBe(before);
    expect(p).toBeDefined();
  });

  it('repair tops up but never past where the run started', () => {
    const s = freshSession({ placementDone: true });
    const full = s.hp;
    s.collectDrop('repair');
    expect(s.hp).toBe(full);

    s.takeDamage();
    s.collectDrop('repair');
    expect(s.hp).toBe(full);
  });

  it('freeze and chain expose themselves to the scene', () => {
    const s = freshSession({ placementDone: true });
    s.collectDrop('freeze');
    expect(s.descentFrozen).toBe(true);
    s.tick(CONFIG.drops.freezeSeconds + 0.1);
    expect(s.descentFrozen).toBe(false);

    s.collectDrop('chain');
    expect(s.chainReady).toBe(true);
    for (let i = 0; i < CONFIG.drops.chainKills; i++) s.useChain();
    expect(s.chainReady).toBe(false);
  });

  it('a nuked meteor scores but never touches the skill table or the combo', () => {
    const s = freshSession({ placementDone: true });
    const problem = s.nextWave().problems[0]!;
    const skillId = problem.skillIds[0]!;
    const before = s.skillTable[skillId]!;

    const points = s.recordNuke(problem);
    expect(points).toBeGreaterThan(0);
    expect(s.streak).toBe(0);
    expect(s.skillTable[skillId]).toEqual(before);
  });
});
