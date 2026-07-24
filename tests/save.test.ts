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
