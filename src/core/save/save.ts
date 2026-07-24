/**
 * Versioned save schema behind a storage adapter interface.
 * localStorage is one adapter; a server-sync adapter can slot in later
 * without touching game code.
 */
import type { SkillTable } from '../skills/rating';

export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_KEY = 'mathgame.save';
export const CURRENT_SAVE_VERSION = 2;

export interface SaveV1 {
  version: 1;
  skills: SkillTable;
  /** Monotonic wave counter across the profile's lifetime (drives decay/recency). */
  totalWaves: number;
  placementDone: boolean;
  credits: number;
  ownedUpgrades: string[];
  /** Loadout chosen for the next run (subset of ownedUpgrades). */
  loadout: string[];
  settings: {
    crtEnabled: boolean;
    musicVolume: number;
    sfxVolume: number;
  };
  bestScore: number;
}

export interface SaveV2 extends Omit<SaveV1, 'version'> {
  version: 2;
  /** Milestone ids already surfaced in a debrief, so each fires once. */
  milestones: string[];
}

export type Save = SaveV2;

export function defaultSave(): Save {
  return {
    version: CURRENT_SAVE_VERSION,
    skills: {},
    totalWaves: 0,
    placementDone: false,
    credits: 0,
    ownedUpgrades: [],
    loadout: [],
    settings: { crtEnabled: true, musicVolume: 0.8, sfxVolume: 0.9 },
    bestScore: 0,
    milestones: [],
  };
}

/** Migrate any historical save shape to the current version. */
export function migrate(raw: unknown): Save {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) {
    return defaultSave();
  }
  const versioned = raw as { version: number };
  switch (versioned.version) {
    case 1: {
      const v1 = raw as SaveV1;
      // v1 auto-equipped everything owned; carry that into the explicit loadout.
      return { ...v1, version: 2, loadout: [...v1.ownedUpgrades], milestones: [] };
    }
    case 2:
      return raw as SaveV2;
    default:
      // Unknown/newer version: refuse to guess, start fresh.
      return defaultSave();
  }
}

export function loadSave(storage: StorageAdapter): Save {
  const raw = storage.read(SAVE_KEY);
  if (raw === null) return defaultSave();
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage: StorageAdapter, save: Save): void {
  storage.write(SAVE_KEY, JSON.stringify(save));
}

/** In-memory adapter for tests. */
export function memoryAdapter(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    read: (k) => map.get(k) ?? null,
    write: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}
