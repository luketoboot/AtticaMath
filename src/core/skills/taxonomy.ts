/**
 * Atomic skill taxonomy. Data, not code: adding a skill means adding an entry
 * here plus a generator recipe keyed by the same id.
 */

export type SkillId = string;

/** Operation family, used by practice-mode filtering. */
export type SkillOp = 'add' | 'sub' | 'mul' | 'div' | 'mixed';

export interface SkillDef {
  id: SkillId;
  label: string;
  /** Rough intrinsic difficulty anchor for problems of this skill (rating scale). */
  baseDifficulty: number;
  /** Placement sweep order: lower tiers are probed first at cold start. */
  tier: number;
  /** Operation family for mode filtering. */
  op: SkillOp;
  /** Largest operand place count this skill uses (1 = single digit ... 4). */
  digits: 1 | 2 | 3 | 4;
}

export const SKILLS: readonly SkillDef[] = [
  // Addition. The complements are their own skills because they are the
  // prerequisite the strategy tips keep spending: bridging ten, subtracting by
  // overshooting and building a percentage all assume the bond is instant.
  { id: 'add.single', label: 'Single digit addition', baseDifficulty: 150, tier: 0, op: 'add', digits: 1 },
  { id: 'add.complement10', label: 'Complements to ten', baseDifficulty: 240, tier: 1, op: 'add', digits: 1 },
  { id: 'add.bridge', label: 'Addition bridging ten', baseDifficulty: 320, tier: 1, op: 'add', digits: 1 },
  { id: 'add.double', label: 'Two digit addition', baseDifficulty: 500, tier: 2, op: 'add', digits: 2 },
  { id: 'add.complement100', label: 'Complements to a hundred', baseDifficulty: 520, tier: 2, op: 'add', digits: 2 },
  { id: 'add.triple', label: 'Three digit addition', baseDifficulty: 800, tier: 4, op: 'add', digits: 3 },
  { id: 'add.quad', label: 'Four digit addition', baseDifficulty: 1050, tier: 6, op: 'add', digits: 4 },

  // Subtraction
  { id: 'sub.single', label: 'Single digit subtraction', baseDifficulty: 200, tier: 0, op: 'sub', digits: 1 },
  { id: 'sub.double', label: 'Two digit subtraction', baseDifficulty: 480, tier: 2, op: 'sub', digits: 2 },
  { id: 'sub.borrow', label: 'Subtraction with borrowing', baseDifficulty: 550, tier: 2, op: 'sub', digits: 2 },
  { id: 'sub.zeros', label: 'Subtracting across zeros', baseDifficulty: 700, tier: 3, op: 'sub', digits: 3 },
  { id: 'sub.triple', label: 'Three digit subtraction', baseDifficulty: 850, tier: 5, op: 'sub', digits: 3 },
  { id: 'sub.quad', label: 'Four digit subtraction', baseDifficulty: 1100, tier: 6, op: 'sub', digits: 4 },

  // Times tables, tracked per family
  { id: 'mul.table.2', label: '2s times table', baseDifficulty: 300, tier: 1, op: 'mul', digits: 1 },
  { id: 'mul.table.3', label: '3s times table', baseDifficulty: 380, tier: 1, op: 'mul', digits: 1 },
  { id: 'mul.table.4', label: '4s times table', baseDifficulty: 420, tier: 2, op: 'mul', digits: 1 },
  { id: 'mul.table.5', label: '5s times table', baseDifficulty: 340, tier: 1, op: 'mul', digits: 1 },
  { id: 'mul.table.6', label: '6s times table', baseDifficulty: 520, tier: 2, op: 'mul', digits: 1 },
  { id: 'mul.table.7', label: '7s times table', baseDifficulty: 580, tier: 3, op: 'mul', digits: 1 },
  { id: 'mul.table.8', label: '8s times table', baseDifficulty: 560, tier: 3, op: 'mul', digits: 1 },
  { id: 'mul.table.9', label: '9s times table', baseDifficulty: 540, tier: 3, op: 'mul', digits: 1 },
  { id: 'mul.table.10', label: '10s times table', baseDifficulty: 280, tier: 1, op: 'mul', digits: 2 },
  { id: 'mul.table.11', label: '11s times table', baseDifficulty: 460, tier: 2, op: 'mul', digits: 2 },
  { id: 'mul.table.12', label: '12s times table', baseDifficulty: 620, tier: 3, op: 'mul', digits: 2 },

  // Multi-digit multiplication
  { id: 'mul.2x1', label: 'Two digit x one digit', baseDifficulty: 750, tier: 4, op: 'mul', digits: 2 },
  { id: 'mul.2x2', label: 'Two digit x two digit', baseDifficulty: 1050, tier: 5, op: 'mul', digits: 2 },
  { id: 'mul.3x2', label: 'Three digit x two digit', baseDifficulty: 1350, tier: 6, op: 'mul', digits: 3 },
  { id: 'mul.4x1', label: 'Four digit x one digit', baseDifficulty: 1150, tier: 5, op: 'mul', digits: 4 },

  // Division
  { id: 'div.exact', label: 'Exact division', baseDifficulty: 650, tier: 3, op: 'div', digits: 1 },
  { id: 'div.remainder', label: 'Division with remainder', baseDifficulty: 900, tier: 4, op: 'div', digits: 2 },
  { id: 'div.long', label: 'Three digit division', baseDifficulty: 1200, tier: 5, op: 'div', digits: 3 },
  { id: 'div.big', label: 'Four digit division', baseDifficulty: 1400, tier: 6, op: 'div', digits: 4 },

  // Order of operations
  { id: 'ooo.basic', label: 'Order of operations', baseDifficulty: 950, tier: 5, op: 'mixed', digits: 1 },

  // Factorisation. Factor Storm drills these directly; the recipes ask for the
  // one factor a number has that is hard to see, since a meteor can only carry
  // a single answer and "name any factor" has many.
  { id: 'factor.smallest', label: 'Smallest factor', baseDifficulty: 620, tier: 3, op: 'div', digits: 2 },
  { id: 'factor.prime', label: 'Prime recognition', baseDifficulty: 780, tier: 4, op: 'div', digits: 2 },
  { id: 'factor.deep', label: 'Factoring three digits', baseDifficulty: 1010, tier: 5, op: 'div', digits: 3 },

  // Fractions and percent. Every answer here is a whole number by construction
  // — the input buffer takes digits only — so the prompts ask for a numerator
  // over a printed denominator, a missing term, or a quantity.
  { id: 'frac.percent', label: 'Fraction to percent', baseDifficulty: 430, tier: 2, op: 'mixed', digits: 2 },
  { id: 'frac.reduce', label: 'Equivalent fractions', baseDifficulty: 560, tier: 3, op: 'mixed', digits: 2 },
  { id: 'frac.of', label: 'Fraction of a quantity', baseDifficulty: 640, tier: 3, op: 'mul', digits: 2 },
  { id: 'frac.add.same', label: 'Adding like fractions', baseDifficulty: 680, tier: 3, op: 'add', digits: 2 },
  { id: 'frac.lcd', label: 'Common denominator', baseDifficulty: 820, tier: 4, op: 'mixed', digits: 2 },
  { id: 'pct.of', label: 'Percent of a quantity', baseDifficulty: 880, tier: 4, op: 'mul', digits: 3 },
  // The inverse of pct.of, and the form most percentages arrive in outside a
  // classroom: two numbers, and the question of what one is of the other.
  { id: 'pct.what', label: 'One number as a percent of another', baseDifficulty: 980, tier: 5, op: 'div', digits: 3 },
  { id: 'frac.add.unlike', label: 'Adding unlike fractions', baseDifficulty: 1020, tier: 5, op: 'add', digits: 2 },
] as const;

const byId = new Map<SkillId, SkillDef>(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: SkillId): SkillDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown skill id: ${id}`);
  return def;
}

/** Tolerant lookup for walking saves, which may hold ids the taxonomy retired. */
export function findSkill(id: SkillId): SkillDef | undefined {
  return byId.get(id);
}

export function allSkillIds(): SkillId[] {
  return SKILLS.map((s) => s.id);
}

export function maxTier(): number {
  return SKILLS.reduce((m, s) => Math.max(m, s.tier), 0);
}

export function skillsInTier(tier: number): SkillDef[] {
  return SKILLS.filter((s) => s.tier === tier);
}

/** Practice-mode filter: operation family, a digit ceiling, and a fraction gate. */
export interface SkillFilter {
  /** 'all' admits every family (including mixed order-of-operations). */
  op: SkillOp | 'all';
  /** Integer problems range from 1 digit up to this cap. */
  maxDigits: 1 | 2 | 3 | 4;
  /**
   * Admit the fraction/percent family. Its own switch, not a digit tier:
   * "two digits" describing 3/4 = ?% surprised everyone who asked for
   * two-digit arithmetic, so digits now speak only for integers and this
   * speaks for fractions.
   */
  fractions: boolean;
}

/** The fraction/percent family, which the digit cap deliberately ignores. */
export function isFractionSkill(id: SkillId): boolean {
  return id.startsWith('frac.') || id.startsWith('pct.');
}

export function skillMatchesFilter(def: SkillDef, filter: SkillFilter): boolean {
  const opOk = filter.op === 'all' || def.op === filter.op;
  if (isFractionSkill(def.id)) return filter.fractions && opOk;
  return opOk && def.digits <= filter.maxDigits;
}

export function filteredSkillIds(filter: SkillFilter): SkillId[] {
  return SKILLS.filter((s) => skillMatchesFilter(s, filter)).map((s) => s.id);
}
