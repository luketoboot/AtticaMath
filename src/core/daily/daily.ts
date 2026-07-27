/**
 * The daily challenge: one date, one seed, one run, one board.
 *
 * Every function here is a pure function of a timestamp the caller supplies.
 * The module never reads the clock itself — a feature whose entire contract is
 * "the same puzzle for everyone today" has to be testable at an arbitrary
 * today, including the ones either side of a rollover.
 */
import { seedFromString } from '../rng';

const DAY_MS = 86_400_000;

/**
 * The day is UTC, never local.
 *
 * A local-day boundary would put two players on different puzzles at the same
 * instant and then file both scores under the same board: Auckland would be
 * playing tomorrow's roster while Los Angeles was still on today's, and the
 * board would be comparing two different games. One clock for everybody is the
 * only rule that keeps a shared board coherent. The cost is a rollover at an
 * awkward local hour somewhere, which is what every daily puzzle already does.
 */
export function dailyDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Milliseconds until the next puzzle opens. */
export function msUntilNextDaily(nowMs: number): number {
  const intoDay = ((nowMs % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - intoDay;
}

/** `HH:MM:SS` for the countdown shown once today's run is spent. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** `27 JUL 2026` — the date as the HUD says it, not as the database stores it. */
export function displayDate(dateKey: string): string {
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [y, m, d] = dateKey.split('-');
  const month = MONTHS[Number(m) - 1];
  if (y === undefined || month === undefined || d === undefined) return dateKey;
  return `${d} ${month} ${y}`;
}

/**
 * The seed for a date.
 *
 * Namespaced so the daily can never collide with another seeded system that
 * happens to hash the same string, and so the roster for a date is stable
 * forever — replaying an old date must reproduce it exactly, or the board it
 * belongs to stops being evidence of anything.
 */
export function seedForDate(dateKey: string): number {
  return seedFromString(`daily:${dateKey}`);
}

/** What the save remembers about the player's one attempt at one day's run. */
export interface DailyRecord {
  /** The UTC date key the attempt belongs to. */
  date: string;
  score: number;
  wave: number;
  /**
   * Whether the score reached the shared board. False when the run happened
   * offline or the submission failed, which is what lets a later visit retry
   * the upload without granting a second attempt at the run itself.
   */
  submitted: boolean;
}

/** True when today's run has not been spent yet. */
export function dailyAvailable(record: DailyRecord | undefined, dateKey: string): boolean {
  return record === undefined || record.date !== dateKey;
}

/**
 * True when there is a played-but-unsent score worth retrying.
 *
 * Deliberately separate from `dailyAvailable`: a spent run and an unsent score
 * are different states, and collapsing them would either re-offer the run or
 * silently drop a score the player earned.
 */
export function dailyNeedsUpload(record: DailyRecord | undefined, dateKey: string): boolean {
  return record !== undefined && record.date === dateKey && !record.submitted && record.score > 0;
}
