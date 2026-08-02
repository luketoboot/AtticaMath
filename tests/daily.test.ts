import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  dailyAvailable,
  dailyDateKey,
  dailyNeedsUpload,
  displayDate,
  formatCountdown,
  msUntilNextDaily,
  seedForDate,
} from '../src/core/daily/daily';
import { createRng } from '../src/core/rng';
import { CURRENT_SAVE_VERSION, migrate, type SaveV7 } from '../src/core/save/save';
import { RunSession } from '../src/core/session';
import { createSkillTable, type SkillTable } from '../src/core/skills/rating';
import { allSkillIds, getSkill } from '../src/core/skills/taxonomy';
import { composeDailyWave } from '../src/core/waves/compose';

const UTC = (s: string): number => Date.parse(s);

describe('the daily date', () => {
  it('is the UTC day, so nobody is on a different puzzle at the same instant', () => {
    // 23:30 in New York on the 26th is already the 27th in UTC. Both players
    // must be handed the same roster, whatever their wall clock says.
    expect(dailyDateKey(UTC('2026-07-27T03:30:00Z'))).toBe('2026-07-27');
    expect(dailyDateKey(UTC('2026-07-27T23:59:59Z'))).toBe('2026-07-27');
    expect(dailyDateKey(UTC('2026-07-28T00:00:00Z'))).toBe('2026-07-28');
  });

  it('counts down to the next UTC midnight', () => {
    expect(msUntilNextDaily(UTC('2026-07-27T00:00:00Z'))).toBe(86_400_000);
    expect(msUntilNextDaily(UTC('2026-07-27T23:59:59Z'))).toBe(1000);
    expect(formatCountdown(msUntilNextDaily(UTC('2026-07-27T18:30:00Z')))).toBe('05:30:00');
  });

  it('formats a countdown and a date for the glass', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5000)).toBe('00:00:00');
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
    expect(displayDate('2026-07-27')).toBe('27 JUL 2026');
  });

  it('gives every date its own stable seed', () => {
    expect(seedForDate('2026-07-27')).toBe(seedForDate('2026-07-27'));
    expect(seedForDate('2026-07-27')).not.toBe(seedForDate('2026-07-28'));
  });
});

describe('the one-attempt rule', () => {
  const record = { date: '2026-07-27', score: 900, wave: 4, submitted: false };

  it('offers the run to a profile that has never played one', () => {
    expect(dailyAvailable(undefined, '2026-07-27')).toBe(true);
  });

  it('withholds it once today is spent, and returns it when the date rolls', () => {
    expect(dailyAvailable(record, '2026-07-27')).toBe(false);
    expect(dailyAvailable(record, '2026-07-28')).toBe(true);
  });

  it('keeps an unsent score pending without handing back the attempt', () => {
    expect(dailyNeedsUpload(record, '2026-07-27')).toBe(true);
    expect(dailyNeedsUpload({ ...record, submitted: true }, '2026-07-27')).toBe(false);
    // Yesterday's unsent score is not today's business.
    expect(dailyNeedsUpload(record, '2026-07-28')).toBe(false);
    // A zero score has nothing worth a row on the board.
    expect(dailyNeedsUpload({ ...record, score: 0 }, '2026-07-27')).toBe(false);
  });
});

describe('composeDailyWave', () => {
  it('is a pure function of seed and wave', () => {
    const a = composeDailyWave(3, CONFIG, createRng(seedForDate('2026-07-27')));
    const b = composeDailyWave(3, CONFIG, createRng(seedForDate('2026-07-27')));
    expect(a.problems.map((p) => p.prompt)).toEqual(b.problems.map((p) => p.prompt));
    expect(a.problems.map((p) => p.answer)).toEqual(b.problems.map((p) => p.answer));
  });

  it('gives different dates different problems', () => {
    const a = composeDailyWave(1, CONFIG, createRng(seedForDate('2026-07-27')));
    const b = composeDailyWave(1, CONFIG, createRng(seedForDate('2026-07-28')));
    expect(a.problems.map((p) => p.prompt)).not.toEqual(b.problems.map((p) => p.prompt));
  });

  it('climbs: late waves are harder than early ones', () => {
    const mean = (wave: number): number => {
      const rng = createRng(seedForDate('2026-07-27'));
      // Same stream position every time, so the comparison is about the band
      // the wave draws from rather than about where the RNG happened to be.
      const plan = composeDailyWave(wave, CONFIG, rng);
      return plan.problems.reduce((s, p) => s + p.difficulty, 0) / plan.problems.length;
    };
    expect(mean(10)).toBeGreaterThan(mean(1));
  });

  it('keeps easy skills in the mix rather than retiring them', () => {
    const rng = createRng(seedForDate('2026-07-27'));
    const plan = composeDailyWave(8, CONFIG, rng);
    const tiers = plan.problems.flatMap((p) =>
      p.skillIds.map((id) => getSkill(id).tier),
    );
    // The band is bandTiers wide, so a mid-run wave still spans several tiers.
    expect(Math.max(...tiers) - Math.min(...tiers)).toBeGreaterThan(0);
  });

  it('marks the hardest rocks hot, so greed still points at the hard skills', () => {
    // Across a stretch of waves the hot payload must land somewhere, and only
    // ever on a problem the wave itself classed as its frontier.
    let hot = 0;
    for (let wave = 1; wave <= 12; wave++) {
      const plan = composeDailyWave(wave, CONFIG, createRng(seedForDate('2026-07-27') + wave));
      plan.payloads.forEach((payload, i) => {
        if (payload !== 'hot') return;
        hot += 1;
        expect(plan.categories[i]).toBe('frontier');
      });
    }
    expect(hot).toBeGreaterThan(0);
  });

  it('never draws a skill the daily filter excludes', () => {
    for (let wave = 1; wave <= 15; wave++) {
      const plan = composeDailyWave(wave, CONFIG, createRng(seedForDate('2026-07-27') + wave));
      for (const problem of plan.problems) {
        for (const id of problem.skillIds) {
          expect(getSkill(id).digits).toBeLessThanOrEqual(CONFIG.daily.filter.maxDigits);
        }
      }
    }
  });
});

/** A table where every skill is far above its own difficulty — a veteran. */
function expertTable(): SkillTable {
  const table = createSkillTable(allSkillIds(), CONFIG.rating);
  for (const id of Object.keys(table)) {
    table[id] = {
      rating: getSkill(id).baseDifficulty + 600,
      attempts: 50,
      correct: 50,
      fluency: 2,
      lastAttemptWave: 100,
    };
  }
  return table;
}

describe('a daily run is the same run for everyone', () => {
  /** The prompts a profile actually faces over the opening waves. */
  const roster = (skills: SkillTable, placementDone: boolean, waves = 5): string[] => {
    const session = new RunSession({
      seed: seedForDate('2026-07-27'),
      skills,
      totalWavesBefore: placementDone ? 250 : 0,
      placementDone,
      daily: true,
    });
    const out: string[] = [];
    for (let i = 0; i < waves; i++) {
      out.push(...session.nextWave().problems.map((p) => p.prompt));
    }
    return out;
  };

  it('hands a beginner and a veteran identical problems', () => {
    // This is the guarantee the whole mode rests on. Every other composer in
    // the game reads the skill table on purpose; if this one ever starts to,
    // the shared board silently stops comparing like with like.
    const beginner = roster(createSkillTable(allSkillIds(), CONFIG.rating), true);
    const veteran = roster(expertTable(), true);
    expect(beginner).toEqual(veteran);
    expect(beginner.length).toBeGreaterThan(0);
  });

  it('does not care how many waves the profile has ever played', () => {
    const fresh = new RunSession({
      seed: seedForDate('2026-07-27'),
      skills: expertTable(),
      totalWavesBefore: 0,
      placementDone: true,
      daily: true,
    });
    const seasoned = new RunSession({
      seed: seedForDate('2026-07-27'),
      skills: expertTable(),
      totalWavesBefore: 4000,
      placementDone: true,
      daily: true,
    });
    expect(fresh.nextWave().problems.map((p) => p.prompt)).toEqual(
      seasoned.nextWave().problems.map((p) => p.prompt),
    );
  });

  it('skips the placement sweep, which would be a personalised run by design', () => {
    const unplaced = new RunSession({
      seed: seedForDate('2026-07-27'),
      skills: {},
      totalWavesBefore: 0,
      placementDone: false,
      daily: true,
    });
    expect(unplaced.inPlacement).toBe(false);
    // And a profile that has never placed still gets the same roster as one
    // that has — the state cannot leak into the problems.
    expect(roster({}, false)).toEqual(roster(expertTable(), true));
  });

  it('still teaches the skill model, because attempts are honest signal', () => {
    const session = new RunSession({
      seed: seedForDate('2026-07-27'),
      skills: createSkillTable(allSkillIds(), CONFIG.rating),
      totalWavesBefore: 10,
      placementDone: true,
      daily: true,
    });
    const problem = session.nextWave().problems[0]!;
    const before = session.skillTable[problem.skillIds[0]!]!.rating;
    session.recordHit(problem, 900);
    expect(session.skillTable[problem.skillIds[0]!]!.rating).not.toBe(before);
  });

  it('leaves a normal run adaptive', () => {
    const free = (skills: SkillTable): string[] =>
      new RunSession({
        seed: 12345,
        skills,
        totalWavesBefore: 250,
        placementDone: true,
      })
        .nextWave()
        .problems.map((p) => p.prompt);
    // Same seed, different players, different problems — the opposite of the
    // daily, and the thing the daily had to be built around.
    expect(free(createSkillTable(allSkillIds(), CONFIG.rating))).not.toEqual(free(expertTable()));
  });
});

describe('save migration from v7', () => {
  it('leaves an existing profile with an unspent run and its credits intact', () => {
    const current = migrate({});
    const v7: SaveV7 = { ...current, version: 7, credits: 750 };
    const migrated = migrate(v7);
    // Whatever the newest version is: the chain runs to the end, and what this
    // test is about is what survives it.
    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    // No record means available, which is the right thing to give a profile
    // that never had an attempt to spend.
    expect(migrated.daily).toBeUndefined();
    expect(dailyAvailable(migrated.daily, '2026-07-27')).toBe(true);
    expect(migrated.credits).toBe(750);
  });
});
