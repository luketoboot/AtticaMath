/**
 * High score boards, three initials at a time.
 *
 * Pure ranking rules only — no storage, no clock. `at` timestamps are passed
 * in by the caller so a board is reproducible in tests.
 */

/** One board per mode: scores across modes are not comparable. */
export type LeaderboardMode = 'meteor' | 'expression' | 'factor' | 'collapse' | 'boss';

/** Menu order. Every playable mode has a board — adding one here adds its tab. */
export const LEADERBOARD_MODES: readonly LeaderboardMode[] = [
  'meteor',
  'expression',
  'factor',
  'collapse',
  'boss',
];

export const MODE_LABEL: Readonly<Record<LeaderboardMode, string>> = {
  meteor: 'METEOR DEFENSE',
  expression: 'EXPRESSION BUILDER',
  factor: 'FACTOR STORM',
  collapse: 'COLLAPSE',
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
  boss: 'BOSS RUSH',
};

/** Scene keys are what the debrief is handed; boards are keyed by mode. */
export function modeFromSceneKey(key: string | undefined): LeaderboardMode {
  switch (key) {
    case 'Expression':
      return 'expression';
    case 'Factor':
      return 'factor';
    case 'Collapse':
      return 'collapse';
    case 'Boss':
      return 'boss';
    default:
      return 'meteor';
  }
}

export interface ScoreEntry {
  /** Exactly INITIALS_LENGTH characters from INITIALS_ALPHABET. */
  initials: string;
  score: number;
  wave: number;
  /** Epoch milliseconds. */
  at: number;
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

/** Highest first. Ties keep the older entry ahead, as an arcade cabinet does. */
function compare(a: ScoreEntry, b: ScoreEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.at - b.at;
}

/** Sort, trim and sanitise a board — also the repair path for stored data. */
export function normalizeBoard(entries: readonly ScoreEntry[], size = BOARD_SIZE): ScoreEntry[] {
  return entries
    .filter((e) => Number.isFinite(e.score) && e.score > 0)
    .map((e) => ({
      initials: normalizeInitials(e.initials),
      score: Math.floor(e.score),
      wave: Math.max(0, Math.floor(e.wave)),
      at: Number.isFinite(e.at) ? e.at : 0,
    }))
    .sort(compare)
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
): boolean {
  if (score <= 0) return false;
  if (board.length < size) return true;
  const last = board[size - 1];
  return last !== undefined && score > last.score;
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
): InsertResult {
  const clean: ScoreEntry = {
    initials: normalizeInitials(entry.initials),
    score: Math.floor(entry.score),
    wave: Math.max(0, Math.floor(entry.wave)),
    at: entry.at,
  };
  const next = normalizeBoard([...board, clean], size);
  const rank = next.findIndex(
    (e) => e.at === clean.at && e.score === clean.score && e.initials === clean.initials,
  );
  return { board: next, rank };
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
