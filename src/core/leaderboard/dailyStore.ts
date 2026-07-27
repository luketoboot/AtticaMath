/**
 * The daily board's seam.
 *
 * Separate from `LeaderboardStore` rather than another `LeaderboardMode`,
 * because the two are keyed differently and mean different things: a mode board
 * is one all-time list per mode, a daily board is a new list every date. Folding
 * dates into the mode enum would have every caller carrying a key that is only
 * sometimes meaningful.
 *
 * This is also the first store in the game that can be genuinely remote, so
 * every method must be assumed to fail. A daily run is still a run when the
 * network is down — the score is kept locally and offered again later.
 */
import type { ScoreEntry } from './leaderboard';

export interface DailyResult {
  /** The top of the board after the submission, highest first. */
  board: ScoreEntry[];
  /**
   * 0-based rank among everyone who played this date, not just among the rows
   * on screen. Placing 400th out of 5000 is a real result and the board should
   * be able to say so. -1 when the rank is unknown.
   */
  rank: number;
  /** How many scores exist for this date, or -1 when unknown. */
  total: number;
  /** Whether the score actually reached the shared board. */
  submitted: boolean;
}

export interface DailyLeaderboardStore {
  /** True when this store talks to a server the rest of the world can see. */
  readonly shared: boolean;

  /** The top `size` scores for a date. Resolves to [] rather than throwing. */
  load(dateKey: string, size: number): Promise<ScoreEntry[]>;

  /** Post a score and report where it landed. Never throws. */
  submit(dateKey: string, entry: ScoreEntry, size: number): Promise<DailyResult>;
}

export const DAILY_REGISTRY_KEY = 'dailyStore';
