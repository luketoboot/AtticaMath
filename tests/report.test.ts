import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import type { SkillTable } from '../src/core/skills/rating';
import { crossedFluent, runDeltas, topMovers } from '../src/core/skills/report';
import { getSkill } from '../src/core/skills/taxonomy';

function state(rating: number, attempts: number): SkillTable[string] {
  return { rating, attempts, lastAttemptWave: 1 };
}

describe('runDeltas', () => {
  it('reports only skills attempted in the interval', () => {
    const before: SkillTable = {
      'add.single': state(500, 3),
      'sub.single': state(400, 2),
    };
    const after: SkillTable = {
      'add.single': state(560, 7), // played
      'sub.single': state(400, 2), // untouched
    };
    const deltas = runDeltas(before, after, CONFIG);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ skillId: 'add.single', delta: 60, attempts: 4 });
    expect(deltas[0]!.label).toBe(getSkill('add.single').label);
  });

  it('measures a first-ever attempt from the initial rating', () => {
    const after: SkillTable = {
      'mul.table.7': state(CONFIG.rating.initialRating + 45, 3),
    };
    const deltas = runDeltas({}, after, CONFIG);
    expect(deltas[0]!.delta).toBe(45);
  });

  it('sorts gains first and keeps drops signed', () => {
    const before: SkillTable = {
      'add.single': state(500, 1),
      'sub.borrow': state(600, 1),
      'div.exact': state(700, 1),
    };
    const after: SkillTable = {
      'add.single': state(530, 4),
      'sub.borrow': state(540, 4),
      'div.exact': state(710, 4),
    };
    const deltas = runDeltas(before, after, CONFIG);
    expect(deltas.map((d) => d.delta)).toEqual([30, 10, -60]);
  });

  it('skips flat rows and ids the taxonomy no longer knows', () => {
    const before: SkillTable = { 'add.single': state(500, 1) };
    const after: SkillTable = {
      'add.single': state(500.2, 5), // rounds to zero movement
      'mul.table.13': state(900, 9), // retired id riding in an old save
    };
    expect(runDeltas(before, after, CONFIG)).toHaveLength(0);
  });
});

describe('topMovers', () => {
  it('picks by magnitude but presents gains first', () => {
    const before: SkillTable = {
      'add.single': state(500, 1),
      'sub.single': state(500, 1),
      'div.exact': state(700, 1),
    };
    const after: SkillTable = {
      'add.single': state(520, 3),
      'sub.single': state(415, 3), // biggest mover, but a drop
      'div.exact': state(745, 3),
    };
    const two = topMovers(runDeltas(before, after, CONFIG), 2);
    // The 20-point gain is the one cut; both larger movers stay, gain leading.
    expect(two.map((d) => d.delta)).toEqual([45, -85]);
  });
});

describe('crossedFluent', () => {
  const def = getSkill('mul.table.9');
  const line = def.baseDifficulty + CONFIG.waves.fluentMargin;

  it('announces an earned crossing', () => {
    const before: SkillTable = { 'mul.table.9': state(line - 20, 4) };
    const after: SkillTable = { 'mul.table.9': state(line + 10, 7) };
    expect(crossedFluent(before, after, CONFIG).map((d) => d.id)).toEqual(['mul.table.9']);
  });

  it('stays quiet for skills already over the line', () => {
    const before: SkillTable = { 'mul.table.9': state(line + 5, 4) };
    const after: SkillTable = { 'mul.table.9': state(line + 40, 8) };
    expect(crossedFluent(before, after, CONFIG)).toHaveLength(0);
  });

  it('never applauds seeding: no attempts, no fanfare', () => {
    // Reconcile and placement park ratings over the line with zero attempts.
    const after: SkillTable = { 'mul.table.9': state(line + 30, 0) };
    expect(crossedFluent({}, after, CONFIG)).toHaveLength(0);
  });

  it('a crossing needs to end over the line, not just move', () => {
    const before: SkillTable = { 'mul.table.9': state(line - 60, 2) };
    const after: SkillTable = { 'mul.table.9': state(line - 5, 6) };
    expect(crossedFluent(before, after, CONFIG)).toHaveLength(0);
  });
});
