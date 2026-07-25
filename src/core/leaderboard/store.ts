/**
 * The seam a server slots into.
 *
 * Every method is async even though the local implementation answers
 * immediately. That is the entire point: a Firebase-backed board cannot be
 * synchronous, and if the call sites were written against a synchronous
 * interface today, swapping the backend would mean rewriting every scene that
 * touches a score. Awaiting a resolved promise costs nothing now and costs
 * nothing later.
 *
 * An implementation may be remote, slow, or offline. Callers must assume every
 * call can fail — the game is playable without a board, so a failed read is a
 * missing list, never a broken run.
 */
import type { LeaderboardMode, ScoreEntry } from './leaderboard';

export interface SubmitResult {
  /** The board as it stands after the submission. */
  board: ScoreEntry[];
  /** 0-based position of the submitted entry, or -1 if it missed the cut. */
  rank: number;
}

export interface LeaderboardStore {
  /** Highest first, already trimmed to the board size. */
  load(mode: LeaderboardMode): Promise<ScoreEntry[]>;

  /** Place a score and report where it landed. */
  submit(mode: LeaderboardMode, entry: ScoreEntry): Promise<SubmitResult>;

  /**
   * Initials this player used last, so a regular does not retype them every
   * run. Local to the device even once boards are remote.
   */
  lastInitials(): Promise<string>;
  rememberInitials(initials: string): Promise<void>;
}
