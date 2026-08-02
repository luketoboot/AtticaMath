/**
 * Versioned save schema behind a storage adapter interface.
 * localStorage is one adapter; a server-sync adapter can slot in later
 * without touching game code.
 */
import { CONFIG, type GameConfig } from '../config';
import { defaultEquipped, resolveEquipped, type Equipped } from '../cosmetics/cosmetics';
import { defaultBindings, type KeyBindings } from '../input/bindings';
import {
  defaultVideoSettings,
  sanitizeVideoSettings,
  type VideoSettings,
} from '../settings/video';
import type { TroubleLog } from '../coach/trouble';
import type { DailyRecord } from '../daily/daily';
import { reconcileTable } from '../skills/placement';
import type { SkillTable } from '../skills/rating';

export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_KEY = 'mathgame.save';
export const CURRENT_SAVE_VERSION = 9;

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

/**
 * Mastery stopped being a rating check. Skills now carry how many answers were
 * actually right and how fast they came, because rating alone declared the easy
 * half of the taxonomy mastered before the player had answered anything.
 */
export interface SaveV6 extends Omit<SaveV5, 'version'> {
  version: 6;
}

/**
 * The coach needs to name actual problems, and ratings cannot: they aggregate,
 * which is their job. This remembers individual problems per mode so the
 * breakdown can say "8 + 6" rather than "addition bridging ten".
 */
export interface SaveV7 extends Omit<SaveV6, 'version'> {
  version: 7;
  trouble: TroubleLog;
}

/**
 * The daily challenge needs to remember one attempt, so the run cannot be
 * retried until the date rolls over. Absent on a profile that has never played
 * one, which is also the "available" state — `undefined` and "a record from an
 * older date" mean the same thing to every reader, so neither needs a flag.
 */
export interface SaveV8 extends Omit<SaveV7, 'version'> {
  version: 8;
  daily?: DailyRecord;
}

/**
 * Which modes have already shown their worked example.
 *
 * A mode whose rules are discoverable by playing it needs no entry here. CAGES
 * is the one that is not: a player can know both rules and still not know what
 * a move looks like, so its walkthrough runs itself the first time and then
 * gets out of the way — which needs exactly one bit of memory per mode.
 */
export interface SaveV9 extends Omit<SaveV8, 'version'> {
  version: 9;
  taught: string[];
}

export type Save = SaveV9;

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
    trouble: {},
    taught: [],
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
  if (save.version === 5) {
    const v5 = save as unknown as SaveV5;
    // Existing profiles have no record of how fast anything was answered, and
    // that cannot be reconstructed. Credit every past attempt as correct — the
    // kinder reading, and the rating already reflects the misses — but seed
    // fluency at zero: the speed requirement is new, so it has to be earned
    // rather than assumed. A profile that was quick all along re-proves it
    // within a few dozen answers.
    const skills: SkillTable = {};
    for (const [id, state] of Object.entries(v5.skills)) {
      skills[id] = { ...state, correct: state.attempts ?? 0, fluency: 0 };
    }
    save = { ...v5, version: 6, skills };
  }
  if (save.version === 6) {
    // Nothing to reconstruct: which individual problems went wrong was never
    // recorded, and the ratings cannot be unmixed back into them. The coach
    // starts empty and fills from the next run.
    save = { ...save, version: 7, trouble: {} };
  }
  if (save.version === 7) {
    // No daily record means today's run is available, which is the right thing
    // to give an existing profile: nobody has spent an attempt they never had.
    save = { ...save, version: 8 };
  }
  if (save.version === 8) {
    // Nobody has been taught anything yet, and an existing profile is if
    // anything more likely to have bounced off CAGES than a new one. Empty is
    // the honest state as well as the useful one.
    save = { ...save, version: 9, taught: [] };
  }
  if (save.version === CURRENT_SAVE_VERSION) {
    const current = save as unknown as Save;
    // A hand-edited or half-written settings block must not reach the shader.
    return {
      ...current,
      settings: { ...current.settings, video: sanitizeVideoSettings(current.settings?.video) },
      // A hand-edited or truncated save must not hand the coach a non-object.
      trouble: typeof current.trouble === 'object' && current.trouble !== null ? current.trouble : {},
      taught: Array.isArray(current.taught) ? current.taught : [],
    };
  }
  // Anything unrecognised below the current version: start fresh.
  return defaultSave();
}

export function loadSave(storage: StorageAdapter, cfg: GameConfig = CONFIG): Save {
  const raw = storage.read(SAVE_KEY);
  if (raw === null) return defaultSave();
  let save: Save;
  try {
    save = migrate(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
  // Cosmetic slots added after this profile was written arrive as defaults,
  // and anything named but not owned falls back — so the catalogue can grow a
  // whole new slot without a schema version.
  save = { ...save, equipped: resolveEquipped(save.equipped, save.ownedCosmetics) };
  // Skills added to the taxonomy after this profile placed would otherwise be
  // unreachable forever (composeWave only buckets what the table contains).
  // Before placement there is nothing to patch: the sweep seeds every skill.
  if (save.placementDone) {
    return { ...save, skills: reconcileTable(save.skills, cfg) };
  }
  return save;
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
