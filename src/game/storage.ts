import { loadSave, writeSave, type Save, type StorageAdapter } from '../core/save/save';

export function localStorageAdapter(): StorageAdapter {
  return {
    read: (k) => window.localStorage.getItem(k),
    write: (k, v) => window.localStorage.setItem(k, v),
    remove: (k) => window.localStorage.removeItem(k),
  };
}

/** Single mutable save handle shared across scenes via the Phaser registry. */
export class SaveManager {
  private readonly storage: StorageAdapter;
  save: Save;

  constructor(storage: StorageAdapter = localStorageAdapter()) {
    this.storage = storage;
    this.save = loadSave(this.storage);
  }

  persist(): void {
    writeSave(this.storage, this.save);
  }
}

export const SAVE_REGISTRY_KEY = 'saveManager';
