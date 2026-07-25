/**
 * localStorage implementation of LeaderboardStore.
 *
 * Deliberately thin: all the ranking rules live in core/leaderboard, so a
 * Firebase implementation only has to move bytes and can reuse the same
 * insert/normalise functions to stay consistent with what shipped locally.
 */
import {
  insertScore,
  normalizeBoard,
  normalizeInitials,
  BOARD_SIZE,
  DEFAULT_INITIALS,
  type LeaderboardMode,
  type ScoreEntry,
} from '../core/leaderboard/leaderboard';
import type { LeaderboardStore, SubmitResult } from '../core/leaderboard/store';
import type { StorageAdapter } from '../core/save/save';
import { localStorageAdapter } from './storage';

const KEY_PREFIX = 'mathgame.board.';
const INITIALS_KEY = 'mathgame.initials';

export class LocalLeaderboardStore implements LeaderboardStore {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter = localStorageAdapter()) {
    this.storage = storage;
  }

  private read(mode: LeaderboardMode): ScoreEntry[] {
    const raw = this.storage.read(KEY_PREFIX + mode);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Anything on disk is suspect — it may predate a schema change or have
      // been edited by hand. Normalising is the repair path.
      return normalizeBoard(parsed as ScoreEntry[], BOARD_SIZE);
    } catch {
      return [];
    }
  }

  load(mode: LeaderboardMode): Promise<ScoreEntry[]> {
    return Promise.resolve(this.read(mode));
  }

  submit(mode: LeaderboardMode, entry: ScoreEntry): Promise<SubmitResult> {
    const result = insertScore(this.read(mode), entry, BOARD_SIZE);
    this.storage.write(KEY_PREFIX + mode, JSON.stringify(result.board));
    return Promise.resolve(result);
  }

  lastInitials(): Promise<string> {
    const raw = this.storage.read(INITIALS_KEY);
    return Promise.resolve(raw === null ? DEFAULT_INITIALS : normalizeInitials(raw));
  }

  rememberInitials(initials: string): Promise<void> {
    this.storage.write(INITIALS_KEY, normalizeInitials(initials));
    return Promise.resolve();
  }
}

export const LEADERBOARD_REGISTRY_KEY = 'leaderboardStore';
