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
  // Addition
  { id: 'add.single', label: 'Single digit addition', baseDifficulty: 150, tier: 0, op: 'add', digits: 1 },
  { id: 'add.bridge', label: 'Addition bridging ten', baseDifficulty: 320, tier: 1, op: 'add', digits: 1 },
  { id: 'add.double', label: 'Two digit addition', baseDifficulty: 500, tier: 2, op: 'add', digits: 2 },
  { id: 'add.triple', label: 'Three digit addition', baseDifficulty: 800, tier: 4, op: 'add', digits: 3 },
  { id: 'add.quad', label: 'Four digit addition', baseDifficulty: 1050, tier: 6, op: 'add', digits: 4 },

  // Subtraction
  { id: 'sub.single', label: 'Single digit subtraction', baseDifficulty: 200, tier: 0, op: 'sub', digits: 1 },
  { id: 'sub.double', label: 'Two digit subtraction', baseDifficulty: 480, tier: 2, op: 'sub', digits: 2 },
  { id: 'sub.borrow', label: 'Subtraction with borrowing', baseDifficulty: 550, tier: 2, op: 'sub', digits: 2 },
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
] as const;

const byId = new Map<SkillId, SkillDef>(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: SkillId): SkillDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown skill id: ${id}`);
  return def;
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

/** Practice-mode filter: operation family plus a digit ceiling. */
export interface SkillFilter {
  /** 'all' admits every family (including mixed order-of-operations). */
  op: SkillOp | 'all';
  /** Problems range from 1 digit up to this cap. */
  maxDigits: 1 | 2 | 3 | 4;
}

export function skillMatchesFilter(def: SkillDef, filter: SkillFilter): boolean {
  if (def.digits > filter.maxDigits) return false;
  if (filter.op === 'all') return true;
  return def.op === filter.op;
}

export function filteredSkillIds(filter: SkillFilter): SkillId[] {
  return SKILLS.filter((s) => skillMatchesFilter(s, filter)).map((s) => s.id);
}
