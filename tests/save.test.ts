import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  defaultSave,
  loadSave,
  memoryAdapter,
  migrate,
  SAVE_KEY,
  writeSave,
} from '../src/core/save/save';

describe('save round trip', () => {
  it('writes and reads back identical state', () => {
    const storage = memoryAdapter();
    const save = defaultSave();
    save.credits = 420;
    save.ownedUpgrades = ['upgrade.hp'];
    save.skills['add.single'] = { rating: 777, attempts: 12, lastAttemptWave: 4 };
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
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

  it('migrates v1 through to current, equipping upgrades and adding milestones + keybindings', () => {
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
    expect(migrated.loadout).toEqual(['upgrade.hp', 'upgrade.shield']);
    expect(migrated.skills).toEqual(v1.skills);
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
