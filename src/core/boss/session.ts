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
import { creditsForRun, type RunStats } from '../economy/economy';
import { evaluateTokens, type Op, type Token } from '../expression/expression';
import { skillForOp } from '../expression/generate';
import type { Problem } from '../generator/problem';
import { createRng, type Rng } from '../rng';
import { applyAttempt, targetLatencyMs, type SkillTable } from '../skills/rating';
import type { SkillId } from '../skills/taxonomy';
import { composeWave } from '../waves/compose';

export interface BossSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  ownedUpgrades: readonly string[];
  loadout: readonly string[];
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
  readonly loadout: readonly string[];
  private shieldUsed = false;

  constructor(init: BossSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.loadout = init.loadout.filter((u) => init.ownedUpgrades.includes(u));
    this.hp = this.cfg.meteors.baseHp + (this.loadout.includes('upgrade.hp') ? 2 : 0);
    this.bossMaxHp = this.cfg.boss.baseHp;
    this.bossHp = this.bossMaxHp;
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

  /** Skills exercised by a fired expression's surface operations. */
  private tagTokens(tokens: readonly Token[]): SkillId[] {
    const ids: SkillId[] = [];
    for (let i = 1; i < tokens.length; i += 2) {
      const o = (tokens[i] as { kind: 'op'; op: Op }).op;
      const a = (tokens[i - 1] as { kind: 'num'; value: number }).value;
      const b = (tokens[i + 1] as { kind: 'num'; value: number }).value;
      const id = skillForOp(o, a, b);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  /** Fire an expression at the boss. Any valid expression lands; value = damage. */
  fireExpression(tokens: readonly Token[], responseMs: number): DamageOutcome {
    const result = evaluateTokens(tokens);
    if (!result.ok) {
      this.misfires += 1;
      return { result: 'invalid', reason: result.reason };
    }

    const skillIds = this.tagTokens(tokens);
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
    const points = damage * this.cfg.boss.scorePerDamage;
    this.score += points;

    const defeated = this.bossHp <= 0;
    if (defeated) {
      this.score += this.cfg.boss.defeatBonus;
      this.bossNumber += 1;
      this.bossMaxHp = Math.round(this.cfg.boss.baseHp * Math.pow(this.cfg.boss.hpGrowthPerBoss, this.bossNumber - 1));
      this.bossHp = this.bossMaxHp;
    }
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
    const points = this.cfg.boss.blockScore * (fast ? 2 : 1);
    this.score += points;
    return points;
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
    if (this.loadout.includes('upgrade.shield') && !this.shieldUsed) {
      this.shieldUsed = true;
      return;
    }
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
    let secs = b.attackTravelSeconds * Math.pow(b.attackTravelShrinkPerBoss, this.bossNumber - 1);
    if (this.loadout.includes('upgrade.slowfield')) secs *= 1.15;
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
