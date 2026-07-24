/**
 * RunSession: the pure simulation for one run of Meteor Defense.
 * The Phaser scene is a dumb renderer/driver around this object.
 */
import { CONFIG, type GameConfig } from './config';
import { selectTip, type CoachPick } from './coach/select';
import { creditsForRun, killScore, type RunStats } from './economy/economy';
import type { Problem } from './generator/problem';
import { createRng, type Rng } from './rng';
import { seedFromPlacement, type PlacementAttempt } from './skills/placement';
import { applyAttempt, targetLatencyMs, type SkillTable } from './skills/rating';
import type { SkillId } from './skills/taxonomy';
import { composePlacementWave, composeWave, type WavePlan } from './waves/compose';

export interface RunSessionInit {
  seed: number;
  skills: SkillTable;
  /** Lifetime wave counter from the save (recency/decay baseline). */
  totalWavesBefore: number;
  placementDone: boolean;
  ownedUpgrades: readonly string[];
  loadout: readonly string[];
  config?: GameConfig;
}

const COACH_RECENCY_WAVES = 3;

export class RunSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private waveInRun = 0;
  private placementDone: boolean;
  private readonly placementLog: PlacementAttempt[] = [];
  private coached: SkillId | undefined;
  private lastTipSkill: SkillId | undefined;

  score = 0;
  streak = 0;
  bestStreak = 0;
  kills = 0;
  misses = 0;
  hp: number;
  readonly loadout: readonly string[];
  private shieldUsed = false;

  constructor(init: RunSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.placementDone = init.placementDone;
    this.loadout = init.loadout.filter((u) => init.ownedUpgrades.includes(u));
    this.hp = this.cfg.meteors.baseHp + (this.loadout.includes('upgrade.hp') ? 2 : 0);
  }

  /** Global wave counter (lifetime), used for recency in the skill table. */
  get globalWave(): number {
    return this.startWave + this.waveInRun;
  }

  get currentWaveNumber(): number {
    return this.waveInRun;
  }

  get inPlacement(): boolean {
    return !this.placementDone;
  }

  get skillTable(): SkillTable {
    return this.skills;
  }

  get gameOver(): boolean {
    return this.hp <= 0;
  }

  /** Advance to the next wave and get its problem list. */
  nextWave(): WavePlan {
    this.waveInRun += 1;
    if (!this.placementDone) {
      const plan = composePlacementWave(this.waveInRun, this.cfg, this.rng);
      return { ...plan, wave: this.waveInRun };
    }
    const plan = composeWave(this.skills, this.globalWave, this.cfg, this.rng, this.coached);
    this.coached = undefined;
    return { ...plan, wave: this.waveInRun };
  }

  /** Call when a placement wave finishes; flips to normal play after the last one. */
  private maybeFinishPlacement(): void {
    if (!this.placementDone && this.waveInRun >= this.cfg.waves.placementWaves) {
      this.skills = seedFromPlacement(this.skills, this.placementLog, this.cfg);
      this.placementDone = true;
    }
  }

  /** Player killed a meteor (typed the right answer). */
  recordHit(problem: Problem, responseMs: number): number {
    const attempt = { correct: true, responseMs, difficulty: problem.difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, problem.skillIds, attempt, this.cfg.rating);
    if (!this.placementDone) {
      for (const id of problem.skillIds) {
        this.placementLog.push({ skillId: id, difficulty: problem.difficulty, correct: true, responseMs });
      }
    }
    this.kills += 1;
    const fast = responseMs <= targetLatencyMs(problem.difficulty, this.cfg.rating);
    const points = killScore(problem.difficulty, this.streak, fast, this.cfg.score);
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += points;
    return points;
  }

  /** A meteor landed (problem unanswered). */
  recordMiss(problem: Problem, responseMs: number): void {
    const attempt = { correct: false, responseMs, difficulty: problem.difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, problem.skillIds, attempt, this.cfg.rating);
    if (!this.placementDone) {
      for (const id of problem.skillIds) {
        this.placementLog.push({ skillId: id, difficulty: problem.difficulty, correct: false, responseMs });
      }
    }
    this.misses += 1;
    this.streak = 0;
    if (this.loadout.includes('upgrade.shield') && !this.shieldUsed) {
      this.shieldUsed = true;
      return;
    }
    this.hp -= 1;
  }

  /**
   * Call when a wave's meteors are all resolved. Returns the Operator's tip
   * for the breather (if any), and quietly overweights that skill next wave.
   */
  endWave(): CoachPick | undefined {
    this.maybeFinishPlacement();
    if (!this.placementDone) return undefined;
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

  /** Meteor fall time in seconds for the current wave and a problem's difficulty. */
  fallSeconds(difficulty: number): number {
    const m = this.cfg.meteors;
    let secs = m.baseFallSeconds * Math.pow(m.fallSpeedupPerWave, this.waveInRun - 1);
    secs += (difficulty * m.difficultySlowdownMs) / 1000;
    if (this.loadout.includes('upgrade.slowfield')) secs *= 1.15;
    return Math.max(m.minFallSeconds, secs);
  }

  /** Spawn gap in seconds for the current wave. */
  spawnGapSeconds(): number {
    const m = this.cfg.meteors;
    const gap = m.baseSpawnGapSeconds * Math.pow(m.spawnGapShrinkPerWave, this.waveInRun - 1);
    return Math.max(m.minSpawnGapSeconds, gap);
  }
}
