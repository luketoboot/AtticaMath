/**
 * The trouble table: which individual problems keep going wrong.
 *
 * The skill table knows that "subtraction with borrowing" is weak. It cannot
 * know that the player is fine with 62−38 and loses every time on 71−49,
 * because ratings aggregate — that is what they are for. This does the other
 * job: it remembers problems, not skills, so the coach can name the actual
 * thing to practise.
 *
 * Stored as a table keyed by problem rather than a log of events. A run answers
 * a few hundred problems and a profile lives for months; keeping every attempt
 * would grow without bound in localStorage and answer no question that the
 * counts do not. Each entry carries enough to rank it — how often it was met,
 * how often it was missed, and how long the right answer took.
 *
 * Modes want different rankings, because they fail differently. Meteor Defense
 * fails by getting the arithmetic wrong, so it ranks by misses. Factor Storm
 * rarely misses outright — a rock you cannot factor just sits there — so it
 * ranks by the ones that were never broken, then by the ones that took longest.
 * Collapse is a matching game where the interesting number is simply how often
 * the pairing was right, so it is not ranked per problem at all.
 *
 * Pure and deterministic.
 */
import type { CoachConfig } from '../config';
import type { SkillId } from '../skills/taxonomy';

/** Modes that keep a trouble record. */
export type TroubleMode = 'meteor' | 'factor' | 'collapse' | 'expression';

export interface TroubleEntry {
  /** The problem as the player saw it: "8 + 6", "FACTOR 91", "3/4". */
  prompt: string;
  /** What it wanted, for showing the answer next to the problem. */
  answer: string;
  skillId: SkillId;
  mode: TroubleMode;
  attempts: number;
  misses: number;
  /** Total ms over answers that were both correct and timed. */
  totalMs: number;
  /** How many answers contributed to `totalMs`. */
  timed: number;
  /** Global wave counter when last met, for recency. */
  lastWave: number;
}

/** Keyed by mode and prompt: the same sum in two modes is two problems. */
export type TroubleLog = Record<string, TroubleEntry>;

export interface TroubleOutcome {
  mode: TroubleMode;
  prompt: string;
  answer: string;
  skillId: SkillId;
  correct: boolean;
  /** Time to the answer. Ignored when the attempt was a miss. */
  responseMs: number;
  wave: number;
}

export function troubleKey(mode: TroubleMode, prompt: string): string {
  return `${mode}|${prompt}`;
}

/** Fold one outcome into the table. */
export function recordTrouble(
  log: TroubleLog,
  outcome: TroubleOutcome,
  cfg: CoachConfig,
): TroubleLog {
  const key = troubleKey(outcome.mode, outcome.prompt);
  const prev = log[key];
  const entry: TroubleEntry = {
    prompt: outcome.prompt,
    answer: outcome.answer,
    skillId: outcome.skillId,
    mode: outcome.mode,
    attempts: (prev?.attempts ?? 0) + 1,
    misses: (prev?.misses ?? 0) + (outcome.correct ? 0 : 1),
    // Only correct answers carry time. The clock on a miss measures how long
    // the player stared at it, which says nothing about how hard it is to do.
    totalMs: (prev?.totalMs ?? 0) + (outcome.correct ? Math.max(0, outcome.responseMs) : 0),
    timed: (prev?.timed ?? 0) + (outcome.correct ? 1 : 0),
    lastWave: Math.max(prev?.lastWave ?? 0, outcome.wave),
  };
  return prune({ ...log, [key]: entry }, cfg);
}

/** Share of attempts that went wrong, 0..1. */
export function missRate(entry: TroubleEntry): number {
  return entry.attempts === 0 ? 0 : entry.misses / entry.attempts;
}

/**
 * Mean time to a right answer, or Infinity when there has never been one —
 * which sorts a never-solved problem above every slow one, as it should.
 */
export function meanMs(entry: TroubleEntry): number {
  return entry.timed === 0 ? Number.POSITIVE_INFINITY : entry.totalMs / entry.timed;
}

/** Worst first: most misses, then most recently met. */
function byMisses(a: TroubleEntry, b: TroubleEntry): number {
  return b.misses - a.misses || b.lastWave - a.lastWave;
}

/** Worst first: never solved, then slowest, then most recently met. */
function bySlowest(a: TroubleEntry, b: TroubleEntry): number {
  const ma = meanMs(a);
  const mb = meanMs(b);
  if (ma !== mb) return mb - ma;
  return b.lastWave - a.lastWave;
}

/**
 * How each mode decides what "trouble" means. Data rather than branching, so a
 * mode's ranking is one line to change and a new mode cannot forget to have one.
 */
const RANKERS: Readonly<Record<TroubleMode, (a: TroubleEntry, b: TroubleEntry) => number>> = {
  meteor: byMisses,
  expression: byMisses,
  collapse: byMisses,
  factor: bySlowest,
};

/** Whether an entry is worth showing at all under its mode's ranking. */
function isTrouble(entry: TroubleEntry): boolean {
  return entry.mode === 'factor' ? entry.attempts > 0 : entry.misses > 0;
}

/** The problems a mode should offer to practise, worst first. */
export function troubleSpots(
  log: TroubleLog,
  mode: TroubleMode,
  limit: number,
): TroubleEntry[] {
  return Object.values(log)
    .filter((e) => e.mode === mode && isTrouble(e))
    .sort(RANKERS[mode])
    .slice(0, limit);
}

export interface ModeAccuracy {
  attempts: number;
  correct: number;
  /** 0..1, or NaN when the mode has never been played. */
  rate: number;
}

/** The whole-mode number, which is all Collapse needs. */
export function accuracyFor(log: TroubleLog, mode: TroubleMode): ModeAccuracy {
  let attempts = 0;
  let misses = 0;
  for (const entry of Object.values(log)) {
    if (entry.mode !== mode) continue;
    attempts += entry.attempts;
    misses += entry.misses;
  }
  const correct = attempts - misses;
  return { attempts, correct, rate: attempts === 0 ? Number.NaN : correct / attempts };
}

/** Every mode that has anything recorded. */
export function modesSeen(log: TroubleLog): TroubleMode[] {
  const seen = new Set<TroubleMode>();
  for (const entry of Object.values(log)) seen.add(entry.mode);
  return [...seen];
}

/**
 * Hold the table to its cap, dropping the least instructive first.
 *
 * Problems that were always answered correctly are the ones to lose: they are
 * the bulk of the table and they teach nothing. Among equals, the ones not seen
 * for longest go, so a profile's record follows what it is currently playing.
 */
function prune(log: TroubleLog, cfg: CoachConfig): TroubleLog {
  const entries = Object.values(log);
  if (entries.length <= cfg.troubleCap) return log;
  const kept = entries
    .sort((a, b) => b.misses - a.misses || b.lastWave - a.lastWave || b.attempts - a.attempts)
    .slice(0, cfg.troubleCap);
  const next: TroubleLog = {};
  for (const entry of kept) next[troubleKey(entry.mode, entry.prompt)] = entry;
  return next;
}
