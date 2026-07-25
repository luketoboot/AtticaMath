/**
 * RunSession: the pure simulation for one run of Meteor Defense.
 * The Phaser scene is a dumb renderer/driver around this object.
 */
import {
  comboBreak,
  comboDamaged,
  comboFraction,
  comboHit,
  comboMultiplier,
  comboTier,
  comboWrongDigit,
  createCombo,
  overdriveActive,
  paceExtraConcurrent,
  paceFallMultiplier,
  paceSpawnGapMultiplier,
  tickCombo,
  type ComboState,
} from './combo';
import { CONFIG, type GameConfig } from './config';
import { selectTip, type CoachPick } from './coach/select';
import {
  applyDrop,
  chainReady,
  consumeChain,
  createDrops,
  descentFrozen,
  dropMultiplier,
  rollDrop,
  shieldActive,
  tickDrops,
  type DropKind,
  type DropState,
} from './drops';
import { creditsForRun, killScore, type RunStats } from './economy/economy';
import type { Problem } from './generator/problem';
import {
  bulletSpeed as bulletSpeedForWave,
  fireChancePerSecond,
  meteorsArmed as armedAtWave,
  rollFire,
} from './hazard/gunfire';
import { createRng, type Rng } from './rng';
import { seedFromPlacement, type PlacementAttempt } from './skills/placement';
import { applyAttempt, targetLatencyMs, type SkillTable } from './skills/rating';
import type { SkillFilter, SkillId } from './skills/taxonomy';
import { composePlacementWave, composeWave, OPEN_FILTER, type WavePlan } from './waves/compose';

export interface RunSessionInit {
  seed: number;
  skills: SkillTable;
  /** Lifetime wave counter from the save (recency/decay baseline). */
  totalWavesBefore: number;
  placementDone: boolean;
  config?: GameConfig;
  /** Practice-mode restriction; omitted = full adaptive mix. */
  filter?: SkillFilter;
}

const COACH_RECENCY_WAVES = 3;

export class RunSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  /**
   * Gunfire draws on its own stream. Rolling it from `rng` would make wave
   * composition depend on how many frames elapsed, killing reproducibility.
   */
  private readonly hazardRng: Rng;
  /** Drop rolls get their own stream for the same reason gunfire does. */
  private readonly dropRng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private waveInRun = 0;
  private placementDone: boolean;
  private readonly placementLog: PlacementAttempt[] = [];
  private coached: SkillId | undefined;
  private lastTipSkill: SkillId | undefined;
  private readonly filter: SkillFilter;

  score = 0;
  kills = 0;
  misses = 0;
  /** Meteor shots that connected — HP lost to dodging, not to math. */
  shotsTaken = 0;
  hp: number;
  private combo: ComboState = createCombo();
  /** Landings this wave; a clean wave carries the combo through the breather. */
  private missesThisWave = 0;
  private drops: DropState = createDrops();
  private readonly maxHp: number;

  constructor(init: RunSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.hazardRng = createRng((init.seed ^ 0x9e3779b9) >>> 0);
    this.dropRng = createRng((init.seed ^ 0x85ebca6b) >>> 0);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.placementDone = init.placementDone;
    this.hp = this.cfg.meteors.baseHp;
    this.maxHp = this.hp; // repair tops up to where the run started, never past it
    this.filter = init.filter ?? OPEN_FILTER;
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

  // --- combo ---

  /** Consecutive answers. Named `streak` because that is what the HUD calls it. */
  get streak(): number {
    return this.combo.count;
  }

  get comboState(): Readonly<ComboState> {
    return this.combo;
  }

  get comboTier(): number {
    return comboTier(this.combo, this.cfg.combo);
  }

  get comboMultiplier(): number {
    return comboMultiplier(this.combo, this.cfg.combo);
  }

  /** 0..1 of the combo window remaining, for the drain bar. */
  get comboFraction(): number {
    return comboFraction(this.combo, this.cfg.combo);
  }

  get overdriveActive(): boolean {
    return overdriveActive(this.combo);
  }

  /** Bleed the combo and drop clocks. Called once per frame while a wave runs. */
  tick(dtSeconds: number): void {
    this.combo = tickCombo(this.combo, dtSeconds, this.cfg.combo);
    this.drops = tickDrops(this.drops, dtSeconds);
  }

  /**
   * A typed digit that no live problem can lead to. Costs combo clock, never
   * the combo itself.
   */
  recordWrongDigit(): void {
    this.combo = comboWrongDigit(this.combo, this.cfg.combo);
  }

  // --- drops ---

  get dropState(): Readonly<DropState> {
    return this.drops;
  }

  /** Descent is halted by a freeze pickup. */
  get descentFrozen(): boolean {
    return descentFrozen(this.drops);
  }

  /** The next kill hits every meteor sharing its answer. */
  get chainReady(): boolean {
    return chainReady(this.drops);
  }

  /** What the carrier meteor that just died was holding. */
  rollDrop(): DropKind {
    return rollDrop(this.dropRng, this.hp, this.cfg.drops);
  }

  /** The player caught a pickup. */
  collectDrop(kind: DropKind): void {
    if (kind === 'repair') {
      this.hp = Math.min(this.maxHp, this.hp + 1);
      return;
    }
    this.drops = applyDrop(this.drops, kind, this.cfg.drops);
  }

  /** Spend one kill of the chain shot. */
  useChain(): void {
    this.drops = consumeChain(this.drops);
  }

  /**
   * Score a meteor the nuke cleared. Deliberately no rating update and no combo
   * gain: the player did not answer these, and telling the skill model
   * otherwise would poison the very table the game schedules from.
   */
  recordNuke(problem: Problem): number {
    const points = killScore(problem.difficulty, this.scoreMultiplier, false, this.cfg.score);
    this.kills += 1;
    this.score += points;
    return points;
  }

  /** Combo tier and any active x2 pickup, together. */
  get scoreMultiplier(): number {
    return this.comboMultiplier * dropMultiplier(this.drops, this.cfg.drops);
  }

  /** Advance to the next wave and get its problem list. */
  nextWave(): WavePlan {
    this.waveInRun += 1;
    if (!this.placementDone) {
      const plan = composePlacementWave(this.waveInRun, this.cfg, this.rng, this.filter);
      return { ...plan, wave: this.waveInRun };
    }
    const plan = composeWave(this.skills, this.globalWave, this.cfg, this.rng, this.coached, this.filter);
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

  /**
   * Player killed a meteor (typed the right answer). Scores at the multiplier
   * as it stands *before* this kill, so crossing a tier pays out from the next
   * kill on.
   *
   * `hotBonus` is set by the scene when a hot meteor was taken while it was
   * still high — the bonus is for the risk of leaving it up there, so the scene
   * (which owns the geometry) decides whether it was earned.
   */
  recordHit(problem: Problem, responseMs: number, hotBonus = false): number {
    const attempt = { correct: true, responseMs, difficulty: problem.difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, problem.skillIds, attempt, this.cfg.rating);
    if (!this.placementDone) {
      for (const id of problem.skillIds) {
        this.placementLog.push({ skillId: id, difficulty: problem.difficulty, correct: true, responseMs });
      }
    }
    this.kills += 1;
    const m = this.cfg.meteors;
    const fast = responseMs <= targetLatencyMs(problem.difficulty, this.cfg.rating);
    const multiplier = this.scoreMultiplier * (hotBonus ? m.hotScoreMultiplier : 1);
    const points = killScore(problem.difficulty, multiplier, fast, this.cfg.score);
    this.combo = comboHit(this.combo, this.cfg.combo, hotBonus ? m.hotComboGain : 1);
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
    this.missesThisWave += 1;
    this.combo = comboBreak(this.combo);
    // A shield pickup eats the damage; the landing still breaks the combo.
    if (shieldActive(this.drops)) return;
    this.hp -= 1;
  }

  /**
   * Call when a wave's meteors are all resolved. Returns the Operator's tip
   * for the breather (if any), and quietly overweights that skill next wave.
   */
  endWave(): CoachPick | undefined {
    // Clean wave, keep the combo through the breather; anything landed and it
    // cools off with the wave. The carry is the reward for a perfect clear.
    if (this.missesThisWave > 0) this.combo = comboBreak(this.combo);
    this.missesThisWave = 0;
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
      bestStreak: this.combo.best,
    };
  }

  creditsEarned(): number {
    return creditsForRun(this.stats(), this.cfg.economy);
  }

  /**
   * Meteor fall time in seconds for the current wave and a problem's
   * difficulty. Read at spawn time, so a meteor keeps the pace it was born
   * with — the combo speeds up what comes next, it does not yank what is
   * already falling out from under the player.
   */
  fallSeconds(difficulty: number): number {
    const m = this.cfg.meteors;
    let secs = m.baseFallSeconds * Math.pow(m.fallSpeedupPerWave, this.waveInRun - 1);
    secs += (difficulty * m.difficultySlowdownMs) / 1000;
    secs /= paceFallMultiplier(this.combo, this.cfg.combo);
    return Math.max(m.minFallSeconds, secs);
  }

  /** Simultaneous meteors allowed right now — the board widens with the combo. */
  maxConcurrentMeteors(): number {
    return (
      this.cfg.meteors.maxConcurrentMeteors + paceExtraConcurrent(this.combo, this.cfg.combo)
    );
  }

  // --- meteor gunfire ---

  /** True once meteors in the current wave shoot back. */
  get meteorsArmed(): boolean {
    return armedAtWave(this.waveInRun, this.inPlacement, this.cfg);
  }

  /** Roll whether one live meteor opens fire during a frame of `dtSeconds`. */
  rollMeteorFire(dtSeconds: number): boolean {
    if (!this.meteorsArmed) return false;
    return rollFire(this.hazardRng, fireChancePerSecond(this.waveInRun, this.cfg), dtSeconds);
  }

  /** Shot travel speed (px/sec) for the current wave. */
  bulletSpeed(): number {
    return bulletSpeedForWave(this.waveInRun, this.cfg);
  }

  /**
   * A meteor's shot connected. Costs HP and halves the combo, but leaves the
   * skill ratings alone — dodging is a reflex test, not a math attempt — and
   * the miss shield stays reserved for problems the player failed to answer.
   */
  takeDamage(): void {
    this.shotsTaken += 1;
    this.combo = comboDamaged(this.combo, this.cfg.combo);
    // The shield covers everything that hurts, not just landings. A player who
    // just caught one should not still be losing HP to something on screen.
    if (shieldActive(this.drops)) return;
    this.hp -= 1;
  }

  /** Spawn gap in seconds for the current wave. */
  spawnGapSeconds(): number {
    const m = this.cfg.meteors;
    let gap = m.baseSpawnGapSeconds * Math.pow(m.spawnGapShrinkPerWave, this.waveInRun - 1);
    gap *= paceSpawnGapMultiplier(this.combo, this.cfg.combo);
    return Math.max(m.minSpawnGapSeconds, gap);
  }
}
