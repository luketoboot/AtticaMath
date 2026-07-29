/**
 * ExpressionSession: pure simulation for one Expression Builder run.
 *
 * The hand is the wave's resource, not the target's. Chips are spent when a
 * shot lands and replaced with fresh ones, so what changes is *which* chips you
 * hold — spend a 12 on a target a 3 would have cleared and the 12 is gone.
 * Targets are generated from the hand you are actually holding, which is the
 * only way to promise every falling number is solvable.
 *
 * Shares the skill table, rating rules, coach, combo meter and economy with
 * meteor mode.
 */
import {
  comboBreak,
  comboFraction,
  comboHit,
  comboMultiplier,
  comboTier,
  comboWrongDigit,
  createCombo,
  overdriveActive,
  tickCombo,
  type ComboState,
} from '../combo';
import { CONFIG, type ExpressionLevel, type GameConfig } from '../config';
import { selectTip, type CoachPick } from '../coach/select';
import { DropTracker, type DropKind, type DropState } from '../drops';
import { creditsForRun, killScore, type RunStats } from '../economy/economy';
import { createRng, type Rng } from '../rng';
import { applyAttempt, targetLatencyMs, type SkillTable } from '../skills/rating';
import type { SkillId } from '../skills/taxonomy';
import { chipsUsed, distinctOps, evaluateTokens, OPS, type Op, type Token } from './expression';
import {
  generateTargetFromHand,
  opWeightsFromUsage,
  skillsForTokens,
  type ExpressionProblem,
} from './generate';
import { reachableTargets, type TargetInfo } from './solve';

export interface ExpressionSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  config?: GameConfig;
  /** Chosen puzzle size. Falls back to the first level when unset. */
  levelId?: string;
}

/** A live target that had to be re-rolled because the hand can no longer make it. */
export interface Recalibration {
  /** Problem id being replaced, so the scene can find its sprite. */
  fromId: number;
  problem: ExpressionProblem;
}

export type FireOutcome =
  | {
      result: 'hit';
      problem: ExpressionProblem;
      points: number;
      parBonus: number;
      varietyBonus: number;
      /** Targets still falling that the spent chips put out of reach. */
      recalibrated: Recalibration[];
    }
  | { result: 'wrong'; value: number }
  | { result: 'invalid'; reason: 'malformed' | 'negative' | 'fractional' | 'not-in-hand' };

const COACH_RECENCY_WAVES = 3;
/** Redeals allowed before giving up on a hand that cannot form anything. */
const MAX_REDEALS = 12;

export class ExpressionSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private waveInRun = 0;
  private coached: SkillId | undefined;
  private lastTipSkill: SkillId | undefined;
  private opUsage: Record<Op, number> = { '+': 0, '-': 0, '×': 0, '÷': 0 };

  private hand: number[] = [];
  /**
   * Everything the current hand can reach. The solver walk is the expensive
   * part of this mode and its answer only changes when the hand does, so it is
   * computed once per hand change rather than per target and per check.
   */
  private reach: ReadonlyMap<number, TargetInfo> = new Map();
  private live: ExpressionProblem[] = [];
  private queued = 0;
  private combo: ComboState = createCombo();
  private readonly drops: DropTracker;
  private missesThisWave = 0;

  score = 0;
  kills = 0;
  misses = 0;
  misfires = 0;
  hp: number;
  private readonly maxHp: number;

  /** The chosen level, resolved once. */
  private readonly level: ExpressionLevel;

  constructor(init: ExpressionSessionInit) {
    const base = init.config ?? CONFIG;
    this.level =
      base.expression.levels.find((l) => l.id === init.levelId) ?? base.expression.levels[0]!;
    // The level is folded into the config the whole session reads, so nothing
    // downstream has to know a level exists — generation, fall time and the
    // solver all just see a narrower game.
    this.cfg = {
      ...base,
      expression: {
        ...base.expression,
        maxChips: this.level.maxPar,
        chipMax: this.level.chipMax,
        bigChipChance: this.level.bigChipChance,
        maxTarget: this.level.maxTarget,
        baseFallSeconds: this.level.baseFallSeconds,
      },
    };
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.hp = this.cfg.meteors.baseHp;
    this.maxHp = this.hp;
    this.drops = new DropTracker(
      (init.seed ^ 0x85ebca6b) >>> 0,
      this.cfg.drops,
      this.cfg.drops.pools.expression,
    );
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

  /** The chips in hand, in deal order. */
  get handChips(): readonly number[] {
    return this.hand;
  }

  get liveTargets(): readonly ExpressionProblem[] {
    return this.live;
  }

  /** Targets not yet spawned this wave. */
  get targetsRemaining(): number {
    return this.queued;
  }

  // --- combo (shared with meteor mode) ---

  get streak(): number {
    return this.combo.count;
  }

  get comboTier(): number {
    return comboTier(this.combo, this.cfg.combo);
  }

  get comboMultiplier(): number {
    return comboMultiplier(this.combo, this.cfg.combo);
  }

  /** Combo tier and any active x2 pickup, together. */
  get scoreMultiplier(): number {
    return this.comboMultiplier * this.drops.multiplier;
  }

  get comboFraction(): number {
    return comboFraction(this.combo, this.cfg.combo);
  }

  get overdriveActive(): boolean {
    return overdriveActive(this.combo);
  }

  tick(dtSeconds: number): void {
    this.combo = tickCombo(this.combo, dtSeconds, this.cfg.combo);
    this.drops.tick(dtSeconds);
  }

  // --- drops ---

  get dropState(): Readonly<DropState> {
    return this.drops.snapshot;
  }

  /** Targets hang in the air while a freeze runs. */
  get descentFrozen(): boolean {
    return this.drops.frozen;
  }

  /** What the carrier target that was just solved was holding. */
  rollDrop(): DropKind {
    return this.drops.roll(this.hp);
  }

  collectDrop(kind: DropKind): void {
    if (kind === 'repair') {
      this.hp = Math.min(this.maxHp, this.hp + 1);
      return;
    }
    this.drops.apply(kind);
  }

  /**
   * Score for a target the nuke cleared, and drop it from the live list. No
   * rating moves: the player solved none of these.
   */
  recordNuke(problem: ExpressionProblem): number {
    const points = Math.round(this.cfg.score.killBase * this.scoreMultiplier);
    this.kills += 1;
    this.score += points;
    this.live = this.live.filter((t) => t.id !== problem.id);
    return points;
  }

  // --- hand ---

  private drawChip(): number {
    const e = this.cfg.expression;
    if (e.bigChips.length > 0 && this.rng.chance(e.bigChipChance)) {
      return this.rng.pick([...e.bigChips]);
    }
    return this.rng.int(e.chipMin, e.chipMax);
  }

  /** Top the hand back up to size and re-solve what it can reach. */
  private refill(): void {
    const e = this.cfg.expression;
    while (this.hand.length < e.handSize) this.hand.push(this.drawChip());
    this.reach = reachableTargets(this.hand, e.maxChips);
  }

  /**
   * Deal a hand that can actually build something. A hand that reaches
   * nothing in range is vanishingly rare, but "vanishingly rare" is still a
   * locked game, so it is redealt rather than hoped about.
   */
  private dealHand(): void {
    const e = this.cfg.expression;
    for (let attempt = 0; attempt < MAX_REDEALS; attempt++) {
      this.hand = [];
      this.refill();
      if (this.handCanBuild()) return;
    }
    // Last resort: a hand that is guaranteed to reach something small.
    this.hand = [2, 3, 4, 5, 6, 7].slice(0, e.handSize);
  }

  private handCanBuild(): boolean {
    const e = this.cfg.expression;
    for (const [value, info] of this.reach) {
      if (value >= e.minTarget && value <= e.maxTarget && !this.hand.includes(value)) {
        if (info.par >= 2) return true;
      }
    }
    return false;
  }

  /**
   * Discard one chip for a fresh one. Free in resources, paid for in combo
   * clock — the targets are still falling while you fish for a better chip.
   *
   * Returns the re-rolls the swap forced (a scrapped chip may have been a
   * live target's only route), or null if the index was not scrappable.
   * Scrap changes the hand exactly like firing does, so it owes the same
   * recalibration promise.
   */
  scrapChip(index: number): Recalibration[] | null {
    if (index < 0 || index >= this.hand.length) return null;
    this.hand.splice(index, 1);
    this.refill();
    this.combo = comboWrongDigit(this.combo, {
      ...this.cfg.combo,
      wrongDigitPenaltySeconds: this.cfg.expression.scrapPenaltySeconds,
    });
    return this.recalibrate();
  }

  /** Average rating over attempted skills; drives how many chips targets want. */
  private overallRating(): number {
    const attempted = Object.values(this.skills).filter((s) => s.attempts > 0);
    if (attempted.length === 0) return this.cfg.rating.initialRating;
    return attempted.reduce((sum, s) => sum + s.rating, 0) / attempted.length;
  }

  /**
   * How many chips the next target should want.
   *
   * Rating still moves this, but only inside the level. Difficulty used to come
   * from rating alone — an average across every mode — so getting good at
   * Meteor Defense silently promoted this one to four-chip Countdown puzzles
   * the player never asked for.
   */
  private desiredPar(): number {
    const e = this.cfg.expression;
    const rating = this.overallRating();
    const wanted = rating >= e.fourChipRating ? 4 : rating >= e.threeChipRating ? 3 : 2;
    return Math.min(wanted, this.level.maxPar);
  }

  get levelLabel(): string {
    return this.level.label;
  }

  // --- wave flow ---

  /** Start the next wave: fresh hand, fresh queue of targets. */
  nextWave(): void {
    this.waveInRun += 1;
    const e = this.cfg.expression;
    this.queued = Math.min(
      e.maxTargetsPerWave,
      e.baseTargetsPerWave + (this.waveInRun - 1) * e.targetsPerWaveGrowth,
    );
    this.live = [];
    this.dealHand();
    this.coached = undefined;
  }

  /** Take the next target off the queue, generated against the current hand. */
  spawnTarget(): ExpressionProblem | null {
    if (this.queued <= 0) return null;
    const problem = this.makeTarget();
    if (!problem) return null;
    this.queued -= 1;
    this.live.push(problem);
    return problem;
  }

  private makeTarget(): ExpressionProblem | null {
    const e = this.cfg.expression;
    const opts = {
      desiredPar: this.desiredPar(),
      maxChips: e.maxChips,
      weights: opWeightsFromUsage(this.opUsage, e),
    };
    for (let attempt = 0; attempt < MAX_REDEALS; attempt++) {
      const problem = generateTargetFromHand(this.hand, opts, e, this.rng, this.reach);
      // Two live targets sharing a value would make "fire at the lowest" a
      // coin toss the player cannot see.
      if (problem && !this.live.some((t) => t.target === problem.target)) return problem;
      if (!problem) this.dealHand();
    }
    return null;
  }

  // --- firing ---

  fire(tokens: readonly Token[], responseMs: number): FireOutcome {
    const result = evaluateTokens(tokens);
    if (!result.ok) {
      this.misfires += 1;
      return { result: 'invalid', reason: result.reason };
    }
    if (!this.handHasChips(chipsUsed(tokens))) {
      this.misfires += 1;
      return { result: 'invalid', reason: 'not-in-hand' };
    }

    // Lowest target wins, same rule as the meteor cannon: the thing about to
    // land is the thing you meant.
    const hit = this.live.find((t) => t.target === result.value);
    if (!hit) {
      this.misfires += 1;
      this.combo = comboBreak(this.combo);
      return { result: 'wrong', value: result.value };
    }

    const e = this.cfg.expression;
    const used = chipsUsed(tokens);

    // Rating goes to the operations the player actually performed, not to the
    // route the generator happened to find.
    const skills = skillsForTokens(tokens);
    const attempt = { correct: true, responseMs, difficulty: hit.difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, skills, attempt, this.cfg.rating);
    for (const o of distinctOps(tokens)) this.opUsage[o] += 1;

    const fast = responseMs <= targetLatencyMs(hit.difficulty, this.cfg.rating);
    const base = killScore(hit.difficulty, this.scoreMultiplier, fast, this.cfg.score);
    const parBonus = used.length <= hit.par ? e.parBonus : 0;
    const ops = distinctOps(tokens);
    const varietyBonus = ops.length > 1 ? ops.length * e.varietyBonusPerOperator : 0;
    const points = base + parBonus + varietyBonus;

    this.spendChips(used);
    this.live = this.live.filter((t) => t !== hit);
    this.combo = comboHit(this.combo, this.cfg.combo);
    this.kills += 1;
    this.score += points;

    return {
      result: 'hit',
      problem: hit,
      points,
      parBonus,
      varietyBonus,
      recalibrated: this.recalibrate(),
    };
  }

  private handHasChips(values: readonly number[]): boolean {
    const pool = [...this.hand];
    for (const v of values) {
      const at = pool.indexOf(v);
      if (at === -1) return false;
      pool.splice(at, 1);
    }
    return true;
  }

  private spendChips(values: readonly number[]): void {
    for (const v of values) {
      const at = this.hand.indexOf(v);
      if (at !== -1) this.hand.splice(at, 1);
    }
    this.refill();
  }

  /**
   * Re-roll any target the current hand can no longer reach. The promise is
   * that every number falling at you is solvable with what you hold; when a
   * hand change breaks that, the target changes rather than the player being
   * asked to do the impossible.
   *
   * Runs to a fixed point: replacing one target can force a full redeal
   * (makeTarget's last resort), which can strand a target vetted moments
   * earlier in the same pass. Chained changes share the pass's order, so a
   * scene applying them by fromId lands on the final problem.
   */
  private recalibrate(): Recalibration[] {
    const changes: Recalibration[] = [];
    for (let pass = 0; pass < MAX_REDEALS; pass++) {
      let changed = false;
      this.live = this.live.map((target) => {
        if (this.reach.has(target.target)) return target;
        const replacement = this.makeTarget();
        if (!replacement) return target;
        changed = true;
        changes.push({ fromId: target.id, problem: replacement });
        return replacement;
      });
      if (!changed) break;
    }
    return changes;
  }

  /** A target reached the ground unanswered. */
  recordMiss(problem: ExpressionProblem, responseMs: number): void {
    const attempt = {
      correct: false,
      responseMs,
      difficulty: problem.difficulty,
      wave: this.globalWave,
    };
    // No fired expression to read, so the miss lands on the par route's skills:
    // the thing the player failed to see.
    this.skills = applyAttempt(this.skills, problem.skillIds, attempt, this.cfg.rating);
    this.misses += 1;
    this.missesThisWave += 1;
    this.combo = comboBreak(this.combo);
    this.live = this.live.filter((t) => t.id !== problem.id);
    if (this.drops.shielded) return;
    this.hp -= 1;
  }

  endWave(): CoachPick | undefined {
    if (this.missesThisWave > 0) this.combo = comboBreak(this.combo);
    this.missesThisWave = 0;
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
      bestStreak: this.combo.best,
    };
  }

  creditsEarned(): number {
    return creditsForRun(this.stats(), this.cfg.economy);
  }

  fallSeconds(problem: ExpressionProblem): number {
    const e = this.cfg.expression;
    let secs = e.baseFallSeconds * Math.pow(e.fallSpeedupPerWave, this.waveInRun - 1);
    secs += e.extraSecondsPerChip * (problem.par - 2);
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
