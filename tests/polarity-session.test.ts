import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { skillIdsFor } from '../src/core/polarity/divisors';
import { PolaritySession, type LiveBullet } from '../src/core/polarity/session';
import { createSkillTable } from '../src/core/skills/rating';
import { allSkillIds } from '../src/core/skills/taxonomy';

const cfg = CONFIG.rating;
const p = CONFIG.polarity;
const RECOGNITION = ['div.by.3', 'div.by.4', 'div.by.7', 'div.by.11'];

function newSession(seed = 1) {
  return new PolaritySession({
    seed,
    skills: createSkillTable(allSkillIds(), cfg),
    totalWavesBefore: 40, // past placement, so waves compose normally
  });
}

/** Would this bullet be safe against the polarity the ship is wearing? */
function bulletSafe(bullet: LiveBullet, state: 'a' | 'b'): boolean {
  return bullet.cls === 'bridge' || bullet.cls === (state === 'a' ? 'aOnly' : 'bOnly');
}

/** Net movement across every divisibility-recognition skill. */
function drift(before: Record<string, { rating: number }>, after: Record<string, { rating: number }>) {
  return RECOGNITION.reduce((sum, id) => sum + (after[id]!.rating - before[id]!.rating), 0);
}

/**
 * Play a run under one bullet policy, letting the guns fire and the shots land.
 * Carriers are always shot correctly, so the only thing under test is how the
 * player answers incoming fire — which is the only channel that is graded.
 */
function playRun(policy: (b: LiveBullet, s: PolaritySession) => 'take' | 'dodge', seed = 3, waves = 16) {
  const session = newSession(seed);
  const before = { ...session.skillTable };
  for (let w = 0; w < waves && !session.gameOver; w++) {
    session.nextWave();
    for (let step = 0; step < 60 && !session.gameOver; step++) {
      session.tick(0.2);
      for (const bullet of session.fireGuns(0.2)) {
        if (policy(bullet, session) === 'take') session.bulletHit(bullet.id);
        else session.bulletExpired(bullet.id, 20, 3);
      }
    }
    session.endWave();
  }
  session.finish();
  return { session, before, after: session.skillTable };
}

describe('waves', () => {
  it('opens a wave of carriers, each one breakable by something', () => {
    const session = newSession();
    const plan = session.nextWave();
    expect(plan.carriers.length).toBe(plan.formation.slots.length);
    for (const c of plan.carriers) {
      expect(c.value).toBeGreaterThanOrEqual(p.valueLo);
      expect(c.value).toBeLessThanOrEqual(p.valueHi);
      // Immortal carriers are the one thing the fill must never produce.
      expect(c.value % plan.pair[0] === 0 || c.value % plan.pair[1] === 0).toBe(true);
      expect(c.hp).toBeGreaterThan(0);
    }
  });

  it('never deals a pair where one divisor swallows the other', () => {
    for (let seed = 0; seed < 50; seed++) {
      const session = newSession(seed);
      for (let w = 0; w < 5; w++) {
        const [a, b] = session.nextWave().pair;
        expect(a % b === 0 || b % a === 0, `seed ${seed}: ${a}/${b}`).toBe(false);
      }
    }
  });

  it('opens gently — the first wave always has a free half', () => {
    for (let seed = 0; seed < 40; seed++) {
      const [a, b] = newSession(seed).nextWave().pair;
      expect([a, b].filter((d) => skillIdsFor(d).length === 0).length, `${a}/${b}`).toBe(1);
    }
  });

  it('is deterministic under a seed', () => {
    const one = newSession(19).nextWave();
    const two = newSession(19).nextWave();
    expect(one.pair).toEqual(two.pair);
    expect(one.carriers.map((c) => c.value)).toEqual(two.carriers.map((c) => c.value));
  });
});

describe('shooting a carrier', () => {
  it('breaks it only while wearing a divisor of its number', () => {
    const session = newSession(5);
    const plan = session.nextWave();
    const wrong = plan.carriers.find((c) => c.value % session.activeDivisor !== 0)!;
    const before = session.score;

    const bounced = session.shoot(wrong.id);
    expect(bounced.connected).toBe(true);
    expect(bounced.bit).toBe(false);
    expect(bounced.killed).toBe(false);
    expect(session.score).toBe(before);
    // And it is still there to be shot again once the ship is the right colour.
    expect(session.liveCarriers.some((c) => c.id === wrong.id)).toBe(true);
  });

  it('takes as many hits as the carrier has hull', () => {
    const session = newSession(5);
    const plan = session.nextWave();
    const target = plan.carriers.find((c) => c.value % session.activeDivisor === 0)!;
    for (let i = 1; i < target.hp; i++) {
      const step = session.shoot(target.id);
      expect(step.bit).toBe(true);
      expect(step.killed).toBe(false);
    }
    expect(session.shoot(target.id).killed).toBe(true);
    expect(session.liveCarriers.some((c) => c.id === target.id)).toBe(false);
  });

  it('a bridge can be broken from either side', () => {
    const session = newSession(5);
    const plan = session.nextWave();
    const bridge = plan.carriers.find((c) => c.cls === 'bridge');
    if (!bridge) return; // not every seeded wave leads with one
    session.tick(1);
    session.swap();
    for (let i = 0; i < bridge.hp; i++) expect(session.shoot(bridge.id).bit).toBe(true);
  });

  it('scores nothing and grades nothing for a bounce', () => {
    const session = newSession(5);
    const plan = session.nextWave();
    const before = { ...session.skillTable };
    for (const c of plan.carriers) {
      if (c.value % session.activeDivisor !== 0) session.shoot(c.id);
    }
    session.finish();
    // Shooting is deliberately not a graded channel: a bounce is a visible
    // false alarm, but a carrier quietly left alone leaves no record at all,
    // and half an error table biases everything drawn from it.
    expect(drift(before, session.skillTable)).toBe(0);
    expect(session.bounces).toBeGreaterThan(0);
  });
});

describe('carriers shooting back', () => {
  it('fires the colour it is not, which is the whole tension', () => {
    const session = newSession(7);
    session.nextWave();
    let wrongColour = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      session.tick(0.4);
      for (const b of session.fireGuns(0.4)) {
        const from = session.liveCarriers.find((c) => c.id === b.fromId);
        if (!from || from.cls === 'bridge' || b.cls === 'neither') continue;
        total += 1;
        if (b.cls !== from.cls) wrongColour += 1;
      }
    }
    expect(total).toBeGreaterThan(5);
    expect(wrongColour).toBe(total);
  });

  it('mixes in wilds that no polarity makes safe', () => {
    const session = newSession(11);
    session.nextWave();
    let wilds = 0;
    for (let i = 0; i < 60; i++) {
      session.tick(0.4);
      for (const b of session.fireGuns(0.4)) if (b.cls === 'neither') wilds += 1;
    }
    expect(wilds).toBeGreaterThan(0);
  });

  it('bounds how much is in the air at once', () => {
    const session = newSession(13);
    session.nextWave();
    for (let i = 0; i < 200; i++) {
      session.tick(0.3);
      session.fireGuns(0.3);
      expect(session.liveBullets.length).toBeLessThanOrEqual(p.maxLiveBullets + 12);
    }
  });

  it('absorbs the ones the worn divisor divides, and charges the meter', () => {
    const session = newSession(5);
    session.nextWave();
    session.tick(0.5);
    const fired = session.fireGuns(9);
    const safe = fired.find((b) => bulletSafe(b, session.state));
    if (!safe) return;
    const meter = session.meterCharge;
    const hp = session.hp;
    const out = session.bulletHit(safe.id);
    expect(out.absorbed).toBe(true);
    expect(session.meterCharge).toBe(meter + 1);
    expect(session.hp).toBe(hp);
  });

  it('costs a hull point for the ones it does not', () => {
    const session = newSession(5);
    session.nextWave();
    session.tick(0.5);
    const fired = session.fireGuns(9);
    const lethal = fired.find((b) => !bulletSafe(b, session.state));
    if (!lethal) return;
    const hp = session.hp;
    expect(session.bulletHit(lethal.id).damaged).toBe(true);
    expect(session.hp).toBe(hp - 1);
  });
});

describe('the contact frame', () => {
  it('judges a hit against the polarity the tick opened with', () => {
    // Flipping and being hit on the same frame has to resolve one way or the
    // other, and "the state you were in when the frame began" is the only
    // answer that does not depend on the order the scene happens to run in.
    const session = newSession(5);
    session.nextWave();
    session.tick(0.5);
    const fired = session.fireGuns(9);
    const safeNow = fired.find((b) => bulletSafe(b, session.state));
    if (!safeNow) return;
    session.swap(); // nominally the other colour, but this tick was stamped
    expect(session.bulletHit(safeNow.id).absorbed).toBe(true);
  });
});

describe('the swap lockout', () => {
  it('refuses a second flip inside it', () => {
    const session = newSession();
    expect(session.swap()).toBe(true);
    expect(session.swap()).toBe(false);
    expect(session.locked).toBe(true);
  });

  it('opens again once it has run out', () => {
    const session = newSession();
    session.swap();
    session.tick(p.swapLockoutSeconds + 0.01);
    expect(session.locked).toBe(false);
    expect(session.swap()).toBe(true);
  });

  it('lands the flip immediately — it bars the next one, not this one', () => {
    const session = newSession();
    expect(session.state).toBe('a');
    session.swap();
    expect(session.state).toBe('b');
    expect(session.activeDivisor).toBe(session.currentPair[1]);
  });
});

describe('what a run does to the skill table', () => {
  it('rewards a player who sorts the incoming fire', () => {
    const { before, after, session } = playRun((b, s) => (bulletSafe(b, s.state) ? 'take' : 'dodge'));
    expect(drift(before, after)).toBeGreaterThan(0);
    expect(session.absorbed).toBeGreaterThan(0);
  });

  it('does not reward a player who flies into everything', () => {
    const { before, after } = playRun(() => 'take');
    expect(drift(before, after)).toBeLessThanOrEqual(0);
  });

  it('does not reward a player who dodges everything', () => {
    const { before, after } = playRun(() => 'dodge');
    expect(drift(before, after)).toBeLessThanOrEqual(0);
  });

  it('separates the three of them in the right order', () => {
    const sorter = playRun((b, s) => (bulletSafe(b, s.state) ? 'take' : 'dodge'), 8);
    const masher = playRun(() => 'take', 8);
    const dodger = playRun(() => 'dodge', 8);
    const d = (r: ReturnType<typeof playRun>) => drift(r.before, r.after);
    expect(d(sorter)).toBeGreaterThan(d(masher));
    expect(d(sorter)).toBeGreaterThan(d(dodger));
  });

  it('never banks fluency, so recognition cannot earn a mastery milestone', () => {
    // Knowing that 84 is a seven is not knowing that 7x12 is 84, and the two
    // must not be able to unlock each other.
    const { after } = playRun((b, s) => (bulletSafe(b, s.state) ? 'take' : 'dodge'));
    for (const id of RECOGNITION) expect(after[id]!.fluency, id).toBe(0);
  });

  it('leaves the times tables completely alone', () => {
    const { before, after } = playRun((b, s) => (bulletSafe(b, s.state) ? 'take' : 'dodge'));
    for (let n = 2; n <= 12; n++) {
      const id = `mul.table.${n}`;
      expect(after[id]!.rating, id).toBe(before[id]!.rating);
    }
  });

  it('ignores a bullet that was never within reach', () => {
    const session = newSession(5);
    const before = { ...session.skillTable };
    for (let w = 0; w < 8; w++) {
      session.nextWave();
      for (let i = 0; i < 40; i++) {
        session.tick(0.2);
        for (const b of session.fireGuns(0.2)) session.bulletExpired(b.id, 5000, 0.2);
      }
    }
    session.finish();
    expect(drift(before, session.skillTable)).toBe(0);
  });

  it('refuses to rate a run too short to have proved anything', () => {
    const session = newSession(5);
    const before = { ...session.skillTable };
    session.nextWave();
    session.tick(0.5);
    const fired = session.fireGuns(3);
    if (fired[0]) session.bulletHit(fired[0].id);
    session.finish();
    expect(drift(before, session.skillTable)).toBe(0);
  });
});

describe('the run', () => {
  it('ends when the hull is gone', () => {
    const session = newSession(5);
    for (let w = 0; w < 12 && !session.gameOver; w++) {
      session.nextWave();
      for (let i = 0; i < 40 && !session.gameOver; i++) {
        session.tick(0.3);
        for (const b of session.fireGuns(0.3)) {
          if (!bulletSafe(b, session.state)) session.bulletHit(b.id);
        }
      }
    }
    expect(session.gameOver).toBe(true);
    expect(session.hp).toBeLessThanOrEqual(0);
  });

  it('ramming a carrier costs a hull point and breaks the chain', () => {
    const session = newSession(5);
    const plan = session.nextWave();
    const hp = session.hp;
    expect(session.ramCarrier(plan.carriers[0]!.id)).toBe(true);
    expect(session.hp).toBe(hp - 1);
    expect(session.chain.links).toBe(0);
  });

  it('reports a well-formed result', () => {
    const { session } = playRun((b, s) => (bulletSafe(b, s.state) ? 'take' : 'dodge'));
    const stats = session.stats();
    expect(stats.kills).toBe(session.kills);
    expect(stats.misses).toBe(session.damageTaken);
    expect(stats.bestStreak).toBe(session.bestLinks);
    expect(Number.isFinite(session.creditsEarned())).toBe(true);
    expect(session.creditsEarned()).toBeGreaterThanOrEqual(0);
  });
});

describe('RECOMPOSE', () => {
  it('will not fire before the meter is full', () => {
    const session = newSession();
    session.nextWave();
    expect(session.recomposeReady).toBe(false);
    expect(session.recompose(session.recomposeOptions()[0]!)).toBe(false);
  });

  it('re-declares the pair and reclassifies the whole field', () => {
    const session = newSession(5);
    session.nextWave();
    let guard = 0;
    while (!session.recomposeReady && guard++ < 400) {
      session.tick(0.3);
      for (const b of session.fireGuns(0.3)) {
        // Absorb what is safe, let the rest fly past — otherwise the unsafe
        // ones sit in the air forever and the guns hit their own ceiling.
        if (bulletSafe(b, session.state)) session.bulletHit(b.id);
        else session.bulletExpired(b.id, 20, 3);
      }
      if (session.waveCleared) session.nextWave();
    }
    expect(session.recomposeReady).toBe(true);

    const keep = session.currentPair[0];
    const option = session.recomposeOptions()[0]!;
    expect(session.recompose(option)).toBe(true);
    expect(session.currentPair).toEqual([keep, option]);
    expect(session.meterCharge).toBe(0);

    for (const c of session.liveCarriers) {
      const inA = c.value % keep === 0;
      const inB = c.value % option === 0;
      expect(c.cls).toBe(inA && inB ? 'bridge' : inA ? 'aOnly' : 'bOnly');
    }
  });

  it('only ever offers a divisor that makes a legal pair', () => {
    for (let seed = 0; seed < 30; seed++) {
      const session = newSession(seed);
      session.nextWave();
      const keep = session.currentPair[0];
      for (const option of session.recomposeOptions()) {
        expect(option % keep === 0 || keep % option === 0, `${keep}/${option}`).toBe(false);
      }
    }
  });
});
