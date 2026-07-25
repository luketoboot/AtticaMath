/**
 * BossSession: pure simulation for Boss Rush mode.
 *
 * The boss is an HP number. The player chips it with expressions — the fired
 * expression's VALUE is the damage, so heavy multiplication hits hard. The
 * boss periodically launches attack problems; typing the answer in time
 * blocks them, letting one land costs player HP. Both channels feed the
 * shared skill table.
 */
import { CONFIG, type GameConfig } from '../config';
import { selectTip, type CoachPick } from '../coach/select';
import { DropTracker, type DropKind, type DropState } from '../drops';
import { creditsForRun, type RunStats } from '../economy/economy';
import { evaluateTokens, type Token } from '../expression/expression';
import { skillsForTokens } from '../expression/generate';
import type { Problem } from '../generator/problem';
import { createRng, type Rng } from '../rng';
import { applyAttempt, targetLatencyMs, type SkillTable } from '../skills/rating';
import type { SkillId } from '../skills/taxonomy';
import { composeWave } from '../waves/compose';

export interface BossSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  config?: GameConfig;
}

export type DamageOutcome =
  | { result: 'hit'; damage: number; points: number; defeated: boolean }
  | { result: 'invalid'; reason: 'malformed' | 'negative' | 'fractional' };

export class BossSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private attackQueue: Problem[] = [];
  private lastTipSkill: SkillId | undefined;

  bossNumber = 1;
  bossMaxHp: number;
  bossHp: number;
  score = 0;
  streak = 0;
  bestStreak = 0;
  blocks = 0;
  shots = 0;
  misses = 0;
  misfires = 0;
  hp: number;
  private readonly maxHp: number;
  private readonly drops: DropTracker;

  constructor(init: BossSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.hp = this.cfg.meteors.baseHp;
    this.maxHp = this.hp;
    this.bossMaxHp = this.cfg.boss.baseHp;
    this.bossHp = this.bossMaxHp;
    this.drops = new DropTracker(
      (init.seed ^ 0x85ebca6b) >>> 0,
      this.cfg.drops,
      this.cfg.drops.pools.boss,
    );
  }

  // --- drops ---

  /** Bleed the drop clocks. The boss fight has no combo meter to tick. */
  tick(dtSeconds: number): void {
    this.drops.tick(dtSeconds);
  }

  get dropState(): Readonly<DropState> {
    return this.drops.snapshot;
  }

  /** What the carrier attack that was just blocked was holding. */
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
   * The nuke, in a fight with nothing falling: a flat bite out of the boss.
   * Scored like any other damage, but no rating moves — the player did not
   * compute it.
   */
  nukeBoss(): { damage: number; points: number; defeated: boolean } {
    const damage = Math.max(1, Math.round(this.bossMaxHp * this.cfg.boss.nukeFraction));
    this.bossHp -= damage;
    const points = Math.round(damage * this.cfg.boss.scorePerDamage * this.drops.multiplier);
    this.score += points;
    const defeated = this.bossHp <= 0;
    if (defeated) this.advanceBoss();
    return { damage, points, defeated };
  }

  get globalWave(): number {
    return this.startWave + this.bossNumber;
  }

  get skillTable(): SkillTable {
    return this.skills;
  }

  get gameOver(): boolean {
    return this.hp <= 0;
  }

  /** Deal a fresh hand of number chips for damage expressions. */
  dealHand(): number[] {
    const hand: number[] = [];
    for (let i = 0; i < this.cfg.boss.handSize; i++) {
      hand.push(this.rng.chance(0.7) ? this.rng.int(2, 12) : this.rng.int(13, 25));
    }
    return hand;
  }

  /** Next attack problem, drawn adaptively from the shared skill table. */
  nextAttackProblem(): Problem {
    while (this.attackQueue.length === 0) {
      const plan = composeWave(this.skills, this.globalWave, this.cfg, this.rng);
      this.attackQueue.push(...plan.problems);
    }
    return this.attackQueue.shift()!;
  }

  /** Fire an expression at the boss. Any valid expression lands; value = damage. */
  fireExpression(tokens: readonly Token[], responseMs: number): DamageOutcome {
    const result = evaluateTokens(tokens);
    if (!result.ok) {
      this.misfires += 1;
      return { result: 'invalid', reason: result.reason };
    }

    // The operations as performed, not the adjacent pairs: in 5 + 3 × 4 the
    // player does 3 × 4 and then 5 + 12, and the rating has to hear that.
    const skillIds = skillsForTokens(tokens);
    if (skillIds.length > 0) {
      const difficulty = Math.max(
        ...skillIds.map((id) => {
          const state = this.skills[id];
          return state ? Math.min(state.rating + 100, 2000) : 500;
        }),
      );
      this.skills = applyAttempt(
        this.skills,
        skillIds,
        { correct: true, responseMs, difficulty, wave: this.globalWave },
        this.cfg.rating,
      );
    }

    const damage = result.value;
    this.shots += 1;
    this.bossHp -= damage;
    const points = Math.round(damage * this.cfg.boss.scorePerDamage * this.drops.multiplier);
    this.score += points;

    const defeated = this.bossHp <= 0;
    if (defeated) this.advanceBoss();
    return { result: 'hit', damage, points, defeated };
  }

  /** Player typed the attack's answer in time. */
  blockAttack(problem: Problem, responseMs: number): number {
    this.skills = applyAttempt(
      this.skills,
      problem.skillIds,
      { correct: true, responseMs, difficulty: problem.difficulty, wave: this.globalWave },
      this.cfg.rating,
    );
    this.blocks += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const fast = responseMs <= targetLatencyMs(problem.difficulty, this.cfg.rating);
    const points = Math.round(this.cfg.boss.blockScore * (fast ? 2 : 1) * this.drops.multiplier);
    this.score += points;
    return points;
  }

  /** Next boss: bigger, on the same curve. */
  private advanceBoss(): void {
    this.score += this.cfg.boss.defeatBonus;
    this.bossNumber += 1;
    this.bossMaxHp = Math.round(
      this.cfg.boss.baseHp * Math.pow(this.cfg.boss.hpGrowthPerBoss, this.bossNumber - 1),
    );
    this.bossHp = this.bossMaxHp;
  }

  /** An attack reached the player. */
  attackLands(problem: Problem, responseMs: number): void {
    this.skills = applyAttempt(
      this.skills,
      problem.skillIds,
      { correct: false, responseMs, difficulty: problem.difficulty, wave: this.globalWave },
      this.cfg.rating,
    );
    this.misses += 1;
    this.streak = 0;
    if (this.drops.shielded) return;
    this.hp -= 1;
  }

  /** Operator tip between bosses. */
  bossDownTip(): CoachPick | undefined {
    const pick = selectTip(this.skills, this.globalWave, 3, this.lastTipSkill);
    if (pick) this.lastTipSkill = pick.skillId;
    return pick;
  }

  /** Seconds between attacks for the current boss. */
  attackIntervalSeconds(): number {
    const b = this.cfg.boss;
    const secs = b.attackIntervalSeconds * Math.pow(b.attackIntervalShrinkPerBoss, this.bossNumber - 1);
    return Math.max(b.minAttackIntervalSeconds, secs);
  }

  /** Seconds an attack takes to reach the player for the current boss. */
  attackTravelSeconds(): number {
    const b = this.cfg.boss;
    const secs =
      b.attackTravelSeconds * Math.pow(b.attackTravelShrinkPerBoss, this.bossNumber - 1);
    return Math.max(b.minAttackTravelSeconds, secs);
  }

  stats(): RunStats {
    return {
      score: this.score,
      wavesCleared: this.bossNumber - 1,
      kills: this.blocks + this.shots,
      misses: this.misses,
      bestStreak: this.bestStreak,
    };
  }

  creditsEarned(): number {
    return creditsForRun(this.stats(), this.cfg.economy);
  }
}
