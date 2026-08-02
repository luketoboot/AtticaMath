import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { earnedMilestones } from '../src/core/skills/milestones';
import {
  CURRENT_SAVE_VERSION,
  defaultSave,
  loadSave,
  memoryAdapter,
  migrate,
  SAVE_KEY,
  writeSave,
  type Save,
} from '../src/core/save/save';
import {
  defaultEquipped,
  DEFAULT_BADGE,
  DEFAULT_BURST,
  DEFAULT_CANNON,
} from '../src/core/cosmetics/cosmetics';
import { defaultVideoSettings } from '../src/core/settings/video';

describe('save round trip', () => {
  it('writes and reads back identical state', () => {
    const storage = memoryAdapter();
    const save = defaultSave();
    save.credits = 420;
    save.ownedCosmetics = ['hull.wedge', 'trail.ember'];
    save.equipped = { ...defaultEquipped(), hull: 'hull.wedge', trail: 'trail.ember' };
    save.skills['add.single'] = { rating: 777, attempts: 12, correct: 12, fluency: 1, lastAttemptWave: 4 };
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('backfills cosmetic slots a stored save predates', () => {
    // Exactly the equipped shape written before cannons, bursts and badges —
    // the catalogue grows a shelf without a schema version because of this.
    const storage = memoryAdapter();
    const save = defaultSave();
    save.ownedCosmetics = ['hull.wedge'];
    (save as { equipped: unknown }).equipped = { hull: 'hull.wedge', trail: 'trail.ion' };
    writeSave(storage, save);

    const loaded = loadSave(storage);
    expect(loaded.equipped.hull).toBe('hull.wedge');
    expect(loaded.equipped.cannon).toBe(DEFAULT_CANNON);
    expect(loaded.equipped.burst).toBe(DEFAULT_BURST);
    expect(loaded.equipped.badge).toBe(DEFAULT_BADGE);
  });

  it('strips equipment the player does not own', () => {
    const storage = memoryAdapter();
    const save = defaultSave();
    save.ownedCosmetics = [];
    save.equipped = { ...defaultEquipped(), hull: 'hull.sable', badge: 'badge.star' };
    writeSave(storage, save);
    expect(loadSave(storage).equipped).toEqual(defaultEquipped());
  });

  it('returns defaults when empty', () => {
    expect(loadSave(memoryAdapter())).toEqual(defaultSave());
  });

  it('survives corrupted json', () => {
    const storage = memoryAdapter();
    storage.write(SAVE_KEY, '{not json!!');
    expect(loadSave(storage)).toEqual(defaultSave());
  });
});

describe('migrate', () => {
  it('passes current version through', () => {
    const save = defaultSave();
    expect(migrate(save)).toEqual(save);
  });

  it('migrates v1 all the way to current, refunding the retired upgrades', () => {
    const v1 = {
      version: 1,
      skills: { 'add.single': { rating: 700, attempts: 9, lastAttemptWave: 3 } },
      totalWaves: 12,
      placementDone: true,
      credits: 300,
      ownedUpgrades: ['upgrade.hp', 'upgrade.shield'],
      loadout: [],
      settings: { crtEnabled: false, musicVolume: 0.5, sfxVolume: 0.7 },
      bestScore: 9000,
    };
    const migrated = migrate(v1);
    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.milestones).toEqual([]);
    // upgrade.hp (200) + upgrade.shield (400) come back as credits, since the
    // gear itself no longer exists to be carried forward.
    expect(migrated.credits).toBe(300 + 200 + 400);
    expect(migrated.ownedCosmetics).toEqual([]);
    expect(migrated.equipped).toEqual(defaultSave().equipped);
    // The rating survives untouched; the mastery fields v1 never recorded are
    // filled in by the v5 → v6 step.
    expect(migrated.skills['add.single']).toEqual({
      rating: 700,
      attempts: 9,
      correct: 9,
      fluency: 0,
      lastAttemptWave: 3,
    });
    expect(migrated.bestScore).toBe(9000);
    expect(migrated.keybindings).toEqual(defaultSave().keybindings);
  });

  it('migrates v2 to current by adding default keybindings', () => {
    const v2 = {
      version: 2,
      skills: {},
      totalWaves: 3,
      placementDone: true,
      credits: 50,
      ownedUpgrades: [],
      loadout: [],
      settings: { crtEnabled: true, musicVolume: 0.8, sfxVolume: 0.9 },
      bestScore: 1200,
      milestones: ['times.12'],
    };
    const migrated = migrate(v2);
    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.milestones).toEqual(['times.12']);
    expect(migrated.bestScore).toBe(1200);
    expect(migrated.keybindings).toEqual(defaultSave().keybindings);
  });

  it('migrates v4 to current by adding default video settings', () => {
    const v4 = {
      version: 4,
      skills: {},
      totalWaves: 7,
      placementDone: true,
      credits: 120,
      ownedCosmetics: ['hull.wedge'],
      equipped: { hull: 'hull.wedge', trail: 'trail.ember' },
      settings: { crtEnabled: false, musicVolume: 0.4, sfxVolume: 0.6 },
      bestScore: 4200,
      milestones: [],
      keybindings: defaultSave().keybindings,
    };
    const migrated = migrate(v4);
    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.settings.video).toEqual(defaultVideoSettings());
    // Everything already chosen survives the new block landing beside it.
    expect(migrated.settings.crtEnabled).toBe(false);
    expect(migrated.settings.musicVolume).toBe(0.4);
    expect(migrated.equipped).toEqual(v4.equipped);
    expect(migrated.bestScore).toBe(4200);
  });

  it('repairs a current-version save whose video block is junk', () => {
    const broken = {
      ...defaultSave(),
      settings: {
        crtEnabled: true,
        musicVolume: 0.8,
        sfxVolume: 0.9,
        video: { scanlines: 99, bloom: 'loud', shake: 0.5 },
      },
    };
    const repaired = migrate(broken);
    expect(repaired.settings.video.scanlines).toBe(2); // clamped to range
    expect(repaired.settings.video.bloom).toBe(1); // non-numeric falls back
    expect(repaired.settings.video.shake).toBe(0.5); // valid value kept
  });

  it('resets unknown future versions', () => {
    expect(migrate({ version: 999, junk: true })).toEqual(defaultSave());
  });

  it('resets non-object garbage', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('hello')).toEqual(defaultSave());
    expect(migrate(42)).toEqual(defaultSave());
  });

  it('current version constant matches defaultSave', () => {
    expect(defaultSave().version).toBe(CURRENT_SAVE_VERSION);
  });
});

describe('v8 → v9 walkthrough migration', () => {
  it('has taught an existing profile nothing, which is the truth', () => {
    const { taught: _drop, ...v8 } = { ...defaultSave(), version: 8 as const };
    const out = migrate(v8);
    expect(out.version).toBe(CURRENT_SAVE_VERSION);
    // An existing profile is if anything likelier to have bounced off CAGES
    // than a new one, so it gets the worked example too.
    expect(out.taught).toEqual([]);
  });

  it('keeps a mode that has already been shown', () => {
    const save = { ...defaultSave(), taught: ['Cages'] };
    expect(migrate(save).taught).toEqual(['Cages']);
  });

  it('replaces a hand-edited list that is not one', () => {
    const broken = { ...defaultSave(), taught: 7 as unknown as string[] };
    expect(migrate(broken).taught).toEqual([]);
  });
});

describe('v6 → v7 coach migration', () => {
  it('starts the coach empty, because the past cannot be reconstructed', () => {
    const { trouble: _drop, ...v6 } = { ...defaultSave(), version: 6 as const };
    const out = migrate(v6);
    expect(out.version).toBe(CURRENT_SAVE_VERSION);
    // Which individual problems went wrong was never recorded, and ratings
    // cannot be unmixed back into them. Empty is the honest answer.
    expect(out.trouble).toEqual({});
  });

  it('keeps a coach record that is already there', () => {
    const save = defaultSave();
    save.trouble = {
      'meteor|8 + 6': {
        prompt: '8 + 6',
        answer: '14',
        skillId: 'add.bridge',
        mode: 'meteor',
        attempts: 3,
        misses: 2,
        totalMs: 2000,
        timed: 1,
        lastWave: 9,
      },
    };
    expect(migrate(save).trouble['meteor|8 + 6']?.misses).toBe(2);
  });

  it('replaces a hand-edited coach record that is not an object', () => {
    const broken = { ...defaultSave(), trouble: 'nonsense' as unknown as Save['trouble'] };
    expect(migrate(broken).trouble).toEqual({});
  });
});

describe('v5 → v6 skill migration', () => {
  it('credits past attempts as correct but makes speed be earned', () => {
    const v5 = {
      ...defaultSave(),
      version: 5,
      skills: { 'add.single': { rating: 900, attempts: 42, lastAttemptWave: 7 } },
    };
    const out = migrate(v5);
    // Whatever the newest version is — a migration runs the whole chain, so
    // pinning the number here goes stale every time one is added.
    expect(out.version).toBe(CURRENT_SAVE_VERSION);
    const state = out.skills['add.single']!;
    expect(state.rating).toBe(900);
    expect(state.correct).toBe(42);
    // Fluency cannot be reconstructed from a save that never recorded it, so a
    // migrated profile has to re-prove pace rather than inherit mastery.
    expect(state.fluency).toBe(0);
  });

  it('leaves a migrated profile short of mastery until it is quick again', () => {
    const v5 = {
      ...defaultSave(),
      version: 5,
      skills: { 'mul.table.7': { rating: 3000, attempts: 5000, lastAttemptWave: 7 } },
    };
    expect(earnedMilestones(migrate(v5).skills, CONFIG)).toEqual([]);
  });
});
