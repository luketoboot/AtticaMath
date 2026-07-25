/**
 * ExpressionSession: pure simulation for one Expression Builder run.
 * Shares the skill table, rating rules, coach, and economy with meteor mode.
 */
import { CONFIG, type GameConfig } from '../config';
import { selectTip, type CoachPick } from '../coach/select';
import { creditsForRun, killScore, streakMultiplier, type RunStats } from '../economy/economy';
import { createRng, type Rng } from '../rng';
import { applyAttempt, targetLatencyMs, type SkillTable } from '../skills/rating';
import type { SkillId } from '../skills/taxonomy';
import { chipsUsed, distinctOps, evaluateTokens, OPS, type Op, type Token } from './expression';
import { generateExpressionProblem, opWeightsFromUsage, type ExpressionProblem } from './generate';

export interface ExpressionSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  ownedUpgrades: readonly string[];
  loadout: readonly string[];
  config?: GameConfig;
}

export type FireOutcome =
  | { result: 'hit'; points: number; efficiencyBonus: number; varietyBonus: number }
  | { result: 'wrong'; value: number }
  | { result: 'invalid'; reason: 'malformed' | 'negative' | 'fractional' };

const COACH_RECENCY_WAVES = 3;

export class ExpressionSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private waveInRun = 0;
  private coached: SkillId | undefined;
  private lastTipSkill: SkillId | undefined;
  private opUsage: Record<Op, number> = { '+': 0, '-': 0, '×': 0, '÷': 0 };

  score = 0;
  streak = 0;
  bestStreak = 0;
  kills = 0;
  misses = 0;
  misfires = 0;
  hp: number;
  readonly loadout: readonly string[];
  private shieldUsed = false;

  constructor(init: ExpressionSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.loadout = init.loadout.filter((u) => init.ownedUpgrades.includes(u));
    this.hp = this.cfg.meteors.baseHp + (this.loadout.includes('upgrade.hp') ? 2 : 0);
  }

  get globalWave(): number {
    return this.startWave + this.waveInRun;
  }

  get currentWaveNumber(): number {
    return this.waveInRun;
  }

  get skillTable(): SkillTable {
    return this.skills;
  }

  get gameOver(): boolean {
    return this.hp <= 0;
  }

  get operatorUsage(): Readonly<Record<Op, number>> {
    return this.opUsage;
  }

  /** Average rating over attempted skills; drives puzzle size. */
  private overallRating(): number {
    const attempted = Object.values(this.skills).filter((s) => s.attempts > 0);
    if (attempted.length === 0) return this.cfg.rating.initialRating;
    return attempted.reduce((sum, s) => sum + s.rating, 0) / attempted.length;
  }

  private chipCountForRating(): number {
    const e = this.cfg.expression;
    const rating = this.overallRating();
    if (rating >= e.fourChipRating) return 4;
    if (rating >= e.threeChipRating) return 3;
    return 2;
  }

  /** Advance to the next wave and generate its targets. */
  nextWave(): ExpressionProblem[] {
    this.waveInRun += 1;
    const e = this.cfg.expression;
    const count = Math.min(
      e.maxTargetsPerWave,
      e.baseTargetsPerWave + (this.waveInRun - 1) * e.targetsPerWaveGrowth,
    );
    const weights = opWeightsFromUsage(this.opUsage, e);
    const problems: ExpressionProblem[] = [];
    for (let i = 0; i < count; i++) {
      // Vary puzzle size a little: mostly at level, sometimes one chip easier.
      const chips = Math.max(2, this.chipCountForRating() - (this.rng.chance(0.25) ? 1 : 0));
      problems.push(generateExpressionProblem(chips, weights, e, this.rng));
    }
    this.coached = undefined;
    return problems;
  }

  /** Player fires an expression at a live target. */
  fire(problem: ExpressionProblem, tokens: readonly Token[], responseMs: number): FireOutcome {
    const result = evaluateTokens(tokens);
    if (!result.ok) {
      this.misfires += 1;
      return { result: 'invalid', reason: result.reason };
    }
    if (result.value !== problem.target) {
      this.misfires += 1;
      return { result: 'wrong', value: result.value };
    }

    const attempt = { correct: true, responseMs, difficulty: problem.difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, problem.skillIds, attempt, this.cfg.rating);
    for (const o of distinctOps(tokens)) this.opUsage[o] += 1;

    this.kills += 1;
    const e = this.cfg.expression;
    const fast = responseMs <= targetLatencyMs(problem.difficulty, this.cfg.rating);
    const base = killScore(
      problem.difficulty,
      streakMultiplier(this.streak, this.cfg.score),
      fast,
      this.cfg.score,
    );
    const unusedChips = problem.hand.length - chipsUsed(tokens).length;
    const efficiencyBonus = Math.max(0, unusedChips) * e.efficiencyBonusPerChip;
    const varietyBonus = distinctOps(tokens).length > 1 ? distinctOps(tokens).length * e.varietyBonusPerOperator : 0;
    const points = base + efficiencyBonus + varietyBonus;

    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += points;
    return { result: 'hit', points, efficiencyBonus, varietyBonus };
  }

  /** A target reached the ground unanswered. */
  recordMiss(problem: ExpressionProblem, responseMs: number): void {
    const attempt = { correct: false, responseMs, difficulty: problem.difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, problem.skillIds, attempt, this.cfg.rating);
    this.misses += 1;
    this.streak = 0;
    if (this.loadout.includes('upgrade.shield') && !this.shieldUsed) {
      this.shieldUsed = true;
      return;
    }
    this.hp -= 1;
  }

  endWave(): CoachPick | undefined {
    const pick = selectTip(this.skills, this.globalWave, COACH_RECENCY_WAVES, this.lastTipSkill);
    if (pick) {
      this.coached = pick.skillId;
      this.lastTipSkill = pick.skillId;
    }
    return pick;
  }

  stats(): RunStats {
    return {
      score: this.score,
      wavesCleared: Math.max(0, this.waveInRun - (this.gameOver ? 1 : 0)),
      kills: this.kills,
      misses: this.misses,
      bestStreak: this.bestStreak,
    };
  }

  creditsEarned(): number {
    return creditsForRun(this.stats(), this.cfg.economy);
  }

  fallSeconds(problem: ExpressionProblem): number {
    const e = this.cfg.expression;
    let secs = e.baseFallSeconds * Math.pow(e.fallSpeedupPerWave, this.waveInRun - 1);
    secs += e.extraSecondsPerChip * (problem.chipCount - 2);
    if (this.loadout.includes('upgrade.slowfield')) secs *= 1.15;
    return Math.max(e.minFallSeconds, secs);
  }

  /** Exposed for the wave composer to honor a coach pick later; unused in MVP flow. */
  get coachedSkill(): SkillId | undefined {
    return this.coached;
  }

  /** All four operators, for UI convenience. */
  static get operators(): readonly Op[] {
    return OPS;
  }
}
