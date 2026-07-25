/**
 * Versioned save schema behind a storage adapter interface.
 * localStorage is one adapter; a server-sync adapter can slot in later
 * without touching game code.
 */
import { defaultEquipped, type Equipped } from '../cosmetics/cosmetics';
import { defaultBindings, type KeyBindings } from '../input/bindings';
import {
  defaultVideoSettings,
  sanitizeVideoSettings,
  type VideoSettings,
} from '../settings/video';
import type { SkillTable } from '../skills/rating';

export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_KEY = 'mathgame.save';
export const CURRENT_SAVE_VERSION = 5;

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

export interface SaveV3 extends Omit<SaveV2, 'version'> {
  version: 3;
  /** Rebindable controls, keyed by KeyboardEvent.code. */
  keybindings: KeyBindings;
}

/** Stat upgrades are gone; credits buy cosmetics that change nothing. */
export interface SaveV4 extends Omit<SaveV3, 'version' | 'ownedUpgrades' | 'loadout'> {
  version: 4;
  ownedCosmetics: string[];
  equipped: Equipped;
}

/** The CRT stopped being one switch: every effect is now on its own dial. */
export interface SaveV5 extends Omit<SaveV4, 'version' | 'settings'> {
  version: 5;
  settings: SaveV4['settings'] & { video: VideoSettings };
}

export type Save = SaveV5;

export function defaultSave(): Save {
  return {
    version: CURRENT_SAVE_VERSION,
    skills: {},
    totalWaves: 0,
    placementDone: false,
    credits: 0,
    ownedCosmetics: [],
    equipped: defaultEquipped(),
    settings: {
      crtEnabled: true,
      musicVolume: 0.8,
      sfxVolume: 0.9,
      video: defaultVideoSettings(),
    },
    bestScore: 0,
    milestones: [],
    keybindings: defaultBindings(),
  };
}

/**
 * What the retired upgrades cost, kept here so v3 saves can be refunded.
 *
 * A migration is the one place it is right to hard-code a price list that no
 * longer exists anywhere else: the config has moved on, and a player who spent
 * 1450 credits on gear the game no longer sells should get it back rather than
 * discover it silently deleted.
 */
const RETIRED_UPGRADE_PRICES: Readonly<Record<string, number>> = {
  'upgrade.hp': 200,
  'upgrade.slowfield': 350,
  'upgrade.shield': 400,
  'upgrade.spread': 500,
};

/** Migrate any historical save shape to the current version. */
export function migrate(raw: unknown): Save {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) {
    return defaultSave();
  }
  const versioned = raw as { version: number };
  if (versioned.version > CURRENT_SAVE_VERSION) {
    // Newer than we understand: refuse to guess, start fresh.
    return defaultSave();
  }

  let save = raw as { version: number } & Record<string, unknown>;
  if (save.version === 1) {
    const v1 = save as unknown as SaveV1;
    // v1 auto-equipped everything owned; carry that into the explicit loadout.
    save = { ...v1, version: 2, loadout: [...v1.ownedUpgrades], milestones: [] };
  }
  if (save.version === 2) {
    save = { ...save, version: 3, keybindings: defaultBindings() };
  }
  if (save.version === 3) {
    const v3 = save as unknown as SaveV3;
    const refund = v3.ownedUpgrades.reduce(
      (sum, id) => sum + (RETIRED_UPGRADE_PRICES[id] ?? 0),
      0,
    );
    const { ownedUpgrades: _owned, loadout: _loadout, ...rest } = v3;
    save = {
      ...rest,
      version: 4,
      credits: v3.credits + refund,
      ownedCosmetics: [],
      equipped: defaultEquipped(),
    };
  }
  if (save.version === 4) {
    const v4 = save as unknown as SaveV4;
    save = {
      ...v4,
      version: 5,
      settings: { ...v4.settings, video: defaultVideoSettings() },
    };
  }
  if (save.version === CURRENT_SAVE_VERSION) {
    const current = save as unknown as Save;
    // A hand-edited or half-written settings block must not reach the shader.
    return {
      ...current,
      settings: { ...current.settings, video: sanitizeVideoSettings(current.settings?.video) },
    };
  }
  // Anything unrecognised below the current version: start fresh.
  return defaultSave();
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
