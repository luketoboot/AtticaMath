/**
 * High score boards, three initials at a time.
 *
 * Pure ranking rules only — no storage, no clock. `at` timestamps are passed
 * in by the caller so a board is reproducible in tests.
 */

/** One board per mode: scores across modes are not comparable. */
export type LeaderboardMode =
  | 'meteor'
  | 'expression'
  | 'factor'
  | 'collapse'
  | 'kakooma'
  | 'cages'
  | 'boss';

/**
 * Menu order. Every playable mode has a board — adding one here adds its tab.
 * 'boss' stays in the type but not the tab row: the mode is benched, and any
 * scores already sitting on that board keep their shape until it returns.
 */
export const LEADERBOARD_MODES: readonly LeaderboardMode[] = [
  'meteor',
  'expression',
  'factor',
  'collapse',
  'kakooma',
  'cages',
];

export const MODE_LABEL: Readonly<Record<LeaderboardMode, string>> = {
  meteor: 'METEOR DEFENSE',
  expression: 'EXPRESSION BUILDER',
  factor: 'FACTOR STORM',
  collapse: 'COLLAPSE',
  kakooma: 'KAKOOMA',
  cages: 'CAGES',
  boss: 'BOSS RUSH',
};

/**
 * Shorter forms for the tab row, which gets narrower with every mode added.
 * The full label still heads the board itself.
 */
export const MODE_TAB_LABEL: Readonly<Record<LeaderboardMode, string>> = {
  meteor: 'METEOR',
  expression: 'EXPRESSION',
  factor: 'FACTOR',
  collapse: 'COLLAPSE',
  kakooma: 'KAKOOMA',
  cages: 'CAGES',
  boss: 'BOSS RUSH',
};

/**
 * Which way a board reads.
 *
 * Every mode until now scored points, where more is better. CAGES is one puzzle
 * against a clock, so its number is a duration and the smallest one wins — the
 * board is a race result, not a high score. The direction is a property of the
 * mode rather than a flag each caller remembers to pass, because a board sorted
 * the wrong way would look completely normal and be exactly backwards.
 */
export type Ranking = 'high' | 'low';

export const MODE_RANKING: Readonly<Record<LeaderboardMode, Ranking>> = {
  meteor: 'high',
  expression: 'high',
  factor: 'high',
  collapse: 'high',
  kakooma: 'high',
  cages: 'low',
  boss: 'high',
};

export function rankingFor(mode: LeaderboardMode): Ranking {
  return MODE_RANKING[mode];
}

/** Scene keys are what the debrief is handed; boards are keyed by mode. */
export function modeFromSceneKey(key: string | undefined): LeaderboardMode {
  switch (key) {
    case 'Expression':
      return 'expression';
    case 'Factor':
      return 'factor';
    case 'Collapse':
      return 'collapse';
    case 'Kakooma':
      return 'kakooma';
    case 'Cages':
      return 'cages';
    case 'Boss':
      return 'boss';
    default:
      return 'meteor';
  }
}

export interface ScoreEntry {
  /** Exactly INITIALS_LENGTH characters from INITIALS_ALPHABET. */
  initials: string;
  /** Points on a 'high' board, milliseconds on a 'low' one. See MODE_RANKING. */
  score: number;
  /** The run's second number, in whatever the mode counts: waves, grids, wrong cages. */
  wave: number;
  /** Epoch milliseconds. */
  at: number;
  /**
   * Cosmetic badge id worn when the score was set. Optional: entries predate
   * badges, and a board from a server may not carry one. Purely decorative,
   * so an unknown id renders as the default rather than rejecting the entry.
   */
  badge?: string;
}

export const INITIALS_LENGTH = 3;
/** Letters, digits, and a blank — the arcade set. */
export const INITIALS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
export const DEFAULT_INITIALS = 'AAA';
export const BOARD_SIZE = 10;

/** True for a character the initials entry will accept. */
export function isInitialChar(ch: string): boolean {
  return ch.length === 1 && INITIALS_ALPHABET.includes(ch.toUpperCase());
}

/**
 * Force any input into a legal set of initials: uppercase, unknown characters
 * dropped to blanks, padded and trimmed to length. Anything reaching a board
 * goes through here, including whatever a future server hands back.
 */
export function normalizeInitials(raw: string): string {
  const chars: string[] = [];
  for (const ch of raw.toUpperCase()) {
    if (chars.length >= INITIALS_LENGTH) break;
    chars.push(INITIALS_ALPHABET.includes(ch) ? ch : ' ');
  }
  while (chars.length < INITIALS_LENGTH) chars.push(' ');
  return chars.join('');
}

/** Best first. Ties keep the older entry ahead, as an arcade cabinet does. */
function compare(a: ScoreEntry, b: ScoreEntry, ranking: Ranking): number {
  if (b.score !== a.score) return ranking === 'low' ? a.score - b.score : b.score - a.score;
  return a.at - b.at;
}

/** Sort, trim and sanitise a board — also the repair path for stored data. */
export function normalizeBoard(
  entries: readonly ScoreEntry[],
  size = BOARD_SIZE,
  ranking: Ranking = 'high',
): ScoreEntry[] {
  return entries
    .filter((e) => Number.isFinite(e.score) && e.score > 0)
    .map((e) => ({
      initials: normalizeInitials(e.initials),
      score: Math.floor(e.score),
      wave: Math.max(0, Math.floor(e.wave)),
      at: Number.isFinite(e.at) ? e.at : 0,
      // Carried through untouched when present and dropped when not, so the
      // stored shape stays exactly what it was for pre-badge boards.
      ...(typeof e.badge === 'string' ? { badge: e.badge } : {}),
    }))
    .sort((a, b) => compare(a, b, ranking))
    .slice(0, size);
}

/**
 * Would this score make the board? A short board takes anything above zero;
 * a full one has to be beaten, not matched, because ties rank behind.
 */
export function qualifies(
  board: readonly ScoreEntry[],
  score: number,
  size = BOARD_SIZE,
  ranking: Ranking = 'high',
): boolean {
  if (score <= 0) return false;
  if (board.length < size) return true;
  const last = board[size - 1];
  if (last === undefined) return false;
  return ranking === 'low' ? score < last.score : score > last.score;
}

export interface InsertResult {
  board: ScoreEntry[];
  /** 0-based position, or -1 if the score did not make the cut. */
  rank: number;
}

/** Place an entry on a board, returning the new board and where it landed. */
export function insertScore(
  board: readonly ScoreEntry[],
  entry: ScoreEntry,
  size = BOARD_SIZE,
  ranking: Ranking = 'high',
): InsertResult {
  const clean: ScoreEntry = {
    initials: normalizeInitials(entry.initials),
    score: Math.floor(entry.score),
    wave: Math.max(0, Math.floor(entry.wave)),
    at: entry.at,
  };
  const next = normalizeBoard([...board, clean], size, ranking);
  const rank = next.findIndex(
    (e) => e.at === clean.at && e.score === clean.score && e.initials === clean.initials,
  );
  return { board: next, rank };
}

/**
 * A duration as a stopwatch reads it: M:SS.CS.
 *
 * Hundredths rather than tenths because two players who both "did it in about
 * a minute forty" want to know which of them was faster, and rounder than
 * milliseconds because nobody reads four decimal places off a board. Minutes
 * are not capped: a puzzle left open over lunch should say so rather than
 * quietly roll over and claim a good time.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** What a board prints for an entry's number: points, or a time. */
export function formatBoardScore(mode: LeaderboardMode, score: number): string {
  return rankingFor(mode) === 'low' ? formatClock(score) : String(score);
}

/** The small print beside it — the run's second number, in the mode's own words. */
export function formatBoardSecondary(mode: LeaderboardMode, wave: number): string {
  if (mode !== 'cages') return `WAVE ${wave}`;
  // On a timed puzzle the interesting second number is how much of the time was
  // spent being wrong. Nobody solves it clean by accident.
  return wave === 0 ? 'CLEAN' : `${wave} WRONG`;
}

/** Ordinal suffix for the rank readout: 1ST, 2ND, 3RD, 4TH. */
export function ordinal(rank1: number): string {
  const mod100 = rank1 % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank1}TH`;
  switch (rank1 % 10) {
    case 1:
      return `${rank1}ST`;
    case 2:
      return `${rank1}ND`;
    case 3:
      return `${rank1}RD`;
    default:
      return `${rank1}TH`;
  }
}
