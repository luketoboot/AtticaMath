import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { GUNS, POD_GUNS, boltAngles, bounceLine, killLine } from '../src/core/polarity/guns';
import { PolaritySession, anglesFor } from '../src/core/polarity/session';
import { createSkillTable } from '../src/core/skills/rating';
import { allSkillIds } from '../src/core/skills/taxonomy';

const p = CONFIG.polarity;
const newSession = (seed = 1) =>
  new PolaritySession({
    seed,
    skills: createSkillTable(allSkillIds(), CONFIG.rating),
    totalWavesBefore: 40,
  });

describe('the roster', () => {
  it('gives every gun a label, a blurb and a cooldown', () => {
    for (const def of Object.values(GUNS)) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.blurb.length).toBeGreaterThan(0);
      expect(def.cooldown).toBeGreaterThan(0);
      expect(def.damage).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps BOLT the one you never run out of', () => {
    expect(GUNS.bolt.ammo).toBeNull();
    for (const kind of POD_GUNS) expect(GUNS[kind].ammo).toBeGreaterThan(0);
  });

  it('never drops the gun you already always have', () => {
    expect(POD_GUNS).not.toContain('bolt');
  });
});

describe('bolt angles', () => {
  it('keeps a shot dead ahead when the count is odd', () => {
    expect(boltAngles(GUNS.bolt)).toEqual([0]);
    expect(boltAngles(GUNS.spread)).toContain(0);
  });

  it('is symmetric about straight up', () => {
    // A spread whose middle drifts off centre makes precise shots impossible,
    // and precise shots are how a player takes the one carrier they meant to.
    for (const def of Object.values(GUNS)) {
      const angles = boltAngles(def);
      const sum = angles.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(0, 9);
    }
  });

  it('always fires something, since nothing here clears the screen for you', () => {
    for (const def of Object.values(GUNS)) expect(boltAngles(def).length).toBeGreaterThan(0);
  });
});

describe('the arithmetic the game says out loud', () => {
  it('states the division on a kill', () => {
    expect(killLine(84, 7)).toBe('84 ÷ 7 = 12');
    expect(killLine(360, 12)).toBe('360 ÷ 12 = 30');
  });

  it('states the remainder on a bounce', () => {
    // "Not a multiple" corrects the player; the remainder teaches them, and one
    // step off a multiple is exactly the item they will meet again.
    expect(bounceLine(85, 7)).toBe('85 ÷ 7 LEAVES 1');
    expect(bounceLine(82, 7)).toBe('82 ÷ 7 LEAVES 5');
  });

  it('only ever claims a whole quotient when the division is exact', () => {
    for (let v = 12; v <= 480; v++) {
      for (const d of [3, 4, 7, 11]) {
        if (v % d !== 0) continue;
        expect(killLine(v, d).endsWith(`= ${v / d}`)).toBe(true);
      }
    }
  });
});

describe('fire patterns', () => {
  it('throws a single aimed shot, a fan, or a full ring', () => {
    expect(anglesFor('aimed')).toEqual([0]);
    expect(anglesFor('fan').length).toBe(3);
    expect(anglesFor('ring').length).toBeGreaterThan(6);
  });

  it('spaces a ring evenly all the way round', () => {
    const ring = anglesFor('ring');
    const step = 360 / ring.length;
    ring.forEach((a, i) => expect(a).toBeCloseTo(i * step, 6));
  });

  it('keeps a fan centred on the aim', () => {
    expect(anglesFor('fan').reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
  });
});

describe('equipping', () => {
  it('starts on BOLT with no ammo counter', () => {
    const s = newSession();
    expect(s.equippedGun.kind).toBe('bolt');
    expect(s.gunRounds).toBeNull();
  });

  it('refills on pickup, so a pod is never a downgrade', () => {
    const s = newSession();
    s.equip('spread');
    for (let i = 0; i < 10; i++) s.spendRound();
    expect(s.gunRounds).toBe(GUNS.spread.ammo! - 10);
    s.equip('spread');
    expect(s.gunRounds).toBe(GUNS.spread.ammo);
  });

  it('drops back to BOLT when it runs dry rather than going dead', () => {
    const s = newSession();
    s.equip('lance');
    for (let i = 0; i < GUNS.lance.ammo!; i++) s.spendRound();
    expect(s.equippedGun.kind).toBe('bolt');
    expect(s.gunRounds).toBeNull();
    // And keeps working forever after.
    for (let i = 0; i < 50; i++) s.spendRound();
    expect(s.equippedGun.kind).toBe('bolt');
  });
});

describe('the bullet cancel', () => {
  it('wipes fire and pays for it', () => {
    const s = newSession(5);
    s.nextWave();
    s.tick(0.5);
    const fired = s.fireGuns(9);
    expect(fired.length).toBeGreaterThan(0);
    const score = s.score;
    const value = s.cancelBullet(fired[0]!.id);
    expect(value).toBe(fired[0]!.value);
    expect(s.score).toBe(score + p.cancelPoints);
    expect(s.liveBullets.some((b) => b.id === fired[0]!.id)).toBe(false);
  });

  it('leaves the skill table completely alone', () => {
    // Cancelled fire is not evidence: the player never chose to take it or
    // leave it, so scoring it either way would be inventing a decision.
    const s = newSession(5);
    const before = { ...s.skillTable };
    for (let w = 0; w < 10; w++) {
      s.nextWave();
      for (let i = 0; i < 40; i++) {
        s.tick(0.25);
        for (const b of s.fireGuns(0.25)) s.cancelBullet(b.id);
      }
    }
    s.finish();
    const ids = ['div.by.3', 'div.by.4', 'div.by.7', 'div.by.11'];
    for (const id of ids) expect(s.skillTable[id]!.rating, id).toBe(before[id]!.rating);
  });

  it('cannot be cancelled twice', () => {
    const s = newSession(5);
    s.nextWave();
    s.tick(0.5);
    const fired = s.fireGuns(9);
    s.cancelBullet(fired[0]!.id);
    expect(s.cancelBullet(fired[0]!.id)).toBeUndefined();
  });
});

describe('pods', () => {
  it('fall often enough to matter and rarely enough to stay a treat', () => {
    const s = newSession(3);
    let kills = 0;
    let pods = 0;
    for (let w = 0; w < 30 && !s.gameOver; w++) {
      s.nextWave();
      for (const c of [...s.liveCarriers]) {
        const out = s.shoot(c.id, 9);
        if (out.killed) {
          kills += 1;
          if (out.pod) pods += 1;
        }
      }
    }
    expect(kills).toBeGreaterThan(50);
    const rate = pods / kills;
    expect(rate).toBeGreaterThan(p.podChance / 2);
    expect(rate).toBeLessThan(p.podChance * 2);
  });

  it('only ever carries a gun a pod is allowed to carry', () => {
    const s = newSession(9);
    for (let w = 0; w < 20 && !s.gameOver; w++) {
      s.nextWave();
      for (const c of [...s.liveCarriers]) {
        const out = s.shoot(c.id, 9);
        if (out.pod) expect(POD_GUNS).toContain(out.pod);
      }
    }
  });
});
