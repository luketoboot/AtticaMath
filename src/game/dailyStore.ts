/**
 * Daily board implementations: one shared, one local.
 *
 * The remote store talks to Supabase over plain REST rather than through
 * `supabase-js`. The client SDK is ~100KB gzipped and everything this feature
 * needs is two queries and an insert, so the whole backend costs the bundle
 * nothing — which is the rule the project has followed everywhere else.
 *
 * Ranking rules are not reimplemented here. `core/leaderboard` owns them, and
 * both stores route through it so a remote board and a local one sort, trim and
 * sanitise identically.
 */
import {
  normalizeBoard,
  normalizeInitials,
  insertScore,
  type ScoreEntry,
} from '../core/leaderboard/leaderboard';
import type { DailyLeaderboardStore, DailyResult } from '../core/leaderboard/dailyStore';
import type { StorageAdapter } from '../core/save/save';
import { localStorageAdapter } from './storage';

const LOCAL_PREFIX = 'mathgame.daily.';
const PLAYER_KEY = 'mathgame.playerId';
/** A dead network must not hold the debrief hostage. */
const TIMEOUT_MS = 6000;

/**
 * A stable per-device id, so one browser cannot fill the board by replaying the
 * same run. It is not an identity and not anti-cheat — clearing storage mints a
 * new one — it only makes the honest path correct and stops an accidental
 * double-submit from appearing twice.
 */
export function playerId(storage: StorageAdapter = localStorageAdapter()): string {
  const existing = storage.read(PLAYER_KEY);
  if (existing !== null && existing.length > 0) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  storage.write(PLAYER_KEY, id);
  return id;
}

/** Device-local daily board: the fallback when there is no server configured. */
export class LocalDailyStore implements DailyLeaderboardStore {
  readonly shared = false;
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter = localStorageAdapter()) {
    this.storage = storage;
  }

  private read(dateKey: string): ScoreEntry[] {
    const raw = this.storage.read(LOCAL_PREFIX + dateKey);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? normalizeBoard(parsed as ScoreEntry[], 50) : [];
    } catch {
      return [];
    }
  }

  load(dateKey: string, size: number): Promise<ScoreEntry[]> {
    return Promise.resolve(this.read(dateKey).slice(0, size));
  }

  submit(dateKey: string, entry: ScoreEntry, size: number): Promise<DailyResult> {
    const result = insertScore(this.read(dateKey), entry, 50);
    this.storage.write(LOCAL_PREFIX + dateKey, JSON.stringify(result.board));
    return Promise.resolve({
      board: result.board.slice(0, size),
      rank: result.rank,
      total: result.board.length,
      // Not shared, so nothing was submitted anywhere the world can see. Saying
      // otherwise would let the save mark a score uploaded and never retry it.
      submitted: false,
    });
  }
}

/** One row of `public.daily_scores` as PostgREST returns it. */
interface RemoteRow {
  initials?: unknown;
  score?: unknown;
  wave?: unknown;
  badge?: unknown;
  at?: unknown;
}

function rowToEntry(row: RemoteRow): ScoreEntry | undefined {
  const score = Number(row.score);
  if (!Number.isFinite(score)) return undefined;
  const at = typeof row.at === 'string' ? Date.parse(row.at) : Number(row.at);
  return {
    initials: normalizeInitials(String(row.initials ?? '')),
    score,
    wave: Number(row.wave) || 0,
    at: Number.isFinite(at) ? at : 0,
    ...(typeof row.badge === 'string' && row.badge.length > 0 ? { badge: row.badge } : {}),
  };
}

export class SupabaseDailyStore implements DailyLeaderboardStore {
  readonly shared = true;
  private readonly rest: string;

  constructor(
    url: string,
    private readonly key: string,
    private readonly player: string,
  ) {
    this.rest = `${url.replace(/\/+$/, '')}/rest/v1/daily_scores`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      ...extra,
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(this.rest + path, { ...init, signal: controller.signal });
    } catch {
      // Offline, blocked, timed out — all the same to the caller, which has a
      // playable game either way. The score survives in the save.
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  async load(dateKey: string, size: number): Promise<ScoreEntry[]> {
    const res = await this.request(
      `?date=eq.${dateKey}&select=initials,score,wave,badge,at` +
        `&order=score.desc,at.asc&limit=${size}`,
      { headers: this.headers() },
    );
    if (!res?.ok) return [];
    try {
      const rows: unknown = await res.json();
      if (!Array.isArray(rows)) return [];
      const entries = (rows as RemoteRow[])
        .map(rowToEntry)
        .filter((e): e is ScoreEntry => e !== undefined);
      // Re-sorted locally as well as by the server: the board's ordering rules
      // live in core, and a row that arrived out of order or malformed should
      // be repaired the same way a corrupt local board is.
      return normalizeBoard(entries, size);
    } catch {
      return [];
    }
  }

  /** Rows matching a filter, via PostgREST's exact-count header. -1 if unknown. */
  private async count(filter: string): Promise<number> {
    const res = await this.request(`?${filter}&select=id&limit=1`, {
      headers: this.headers({ Prefer: 'count=exact' }),
    });
    if (!res?.ok) return -1;
    // `Content-Range: 0-0/1234` — the part after the slash is the total.
    const total = res.headers.get('content-range')?.split('/')[1];
    const n = Number(total);
    return Number.isFinite(n) ? n : -1;
  }

  async submit(dateKey: string, entry: ScoreEntry, size: number): Promise<DailyResult> {
    const res = await this.request('', {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/json',
        // The unique index on (date, player) is what enforces one row per
        // device per day; ignoring the duplicate turns a retried upload into a
        // no-op rather than an error the player has to see.
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      }),
      body: JSON.stringify({
        date: dateKey,
        player: this.player,
        initials: normalizeInitials(entry.initials),
        score: Math.floor(entry.score),
        wave: Math.max(0, Math.floor(entry.wave)),
        badge: entry.badge ?? null,
      }),
    });
    const submitted = res?.ok === true;

    const [board, ahead, total] = await Promise.all([
      this.load(dateKey, size),
      this.count(`date=eq.${dateKey}&score=gt.${Math.floor(entry.score)}`),
      this.count(`date=eq.${dateKey}`),
    ]);
    return { board, rank: ahead, total, submitted };
  }
}

/**
 * The shared board when the project is configured, a local one when it is not.
 *
 * Falling back rather than failing is deliberate: a clone with no `.env` should
 * still be a complete game, and the daily is more interesting than most modes
 * even when the only name on the board is yours.
 */
export function createDailyStore(): DailyLeaderboardStore {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined || url === '' || key === '') {
    return new LocalDailyStore();
  }
  return new SupabaseDailyStore(url, key, playerId());
}
