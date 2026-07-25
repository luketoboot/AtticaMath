/**
 * FactorSession: pure simulation for one Factor Storm run.
 *
 * The session owns the rocks as *numbers* — their identity, value and how they
 * split. Where they are and how they drift is the scene's business, which keeps
 * the arithmetic testable without any notion of a screen.
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
  tickCombo,
  type ComboState,
} from '../combo';
import { CONFIG, type GameConfig } from '../config';
import { selectTip, type CoachPick } from '../coach/select';
import { creditsForRun, type RunStats } from '../economy/economy';
import { createRng, type Rng } from '../rng';
import { applyAttempt, targetLatencyMs, type SkillTable } from '../skills/rating';
import { getSkill, SKILLS, type SkillId } from '../skills/taxonomy';
import { composeRockValue, isPrime, resolveShot, shotScore, type ShotKind } from './factor';

export interface FactorSessionInit {
  seed: number;
  skills: SkillTable;
  totalWavesBefore: number;
  config?: GameConfig;
}

/** A rock as the simulation knows it. */
export interface Rock {
  id: number;
  value: number;
}

export type ShotOutcome =
  | { result: 'split'; parent: Rock; pieces: [Rock, Rock]; points: number; balanced: boolean }
  | { result: 'destroyed'; parent: Rock; points: number; prime: boolean }
  | { result: 'illegal' };

const COACH_RECENCY_WAVES = 3;
/** Times-table families are the vocabulary rocks are built from. */
const FAMILY_RANGE = { min: 2, max: 12 };

export class FactorSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly startWave: number;
  private waveInRun = 0;
  private nextRockId = 1;
  private rocks: Rock[] = [];
  private lastTipSkill: SkillId | undefined;
  private combo: ComboState = createCombo();
  private hitsThisWave = 0;
  private damageThisWave = 0;

  score = 0;
  splits = 0;
  destroyed = 0;
  misfires = 0;
  hp: number;

  constructor(init: FactorSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.startWave = init.totalWavesBefore;
    this.hp = this.cfg.meteors.baseHp;
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

  get liveRocks(): readonly Rock[] {
    return this.rocks;
  }

  // --- combo ---

  get streak(): number {
    return this.combo.count;
  }

  get comboTier(): number {
    return comboTier(this.combo, this.cfg.combo);
  }

  get comboMultiplier(): number {
    return comboMultiplier(this.combo, this.cfg.combo);
  }

  get comboFraction(): number {
    return comboFraction(this.combo, this.cfg.combo);
  }

  get overdriveActive(): boolean {
    return overdriveActive(this.combo);
  }

  tick(dtSeconds: number): void {
    this.combo = tickCombo(this.combo, dtSeconds, this.cfg.combo);
  }

  /** A typed digit that cannot lead to a legal shot. Costs clock, not combo. */
  recordWrongDigit(): void {
    this.combo = comboWrongDigit(this.combo, this.cfg.combo);
  }

  // --- waves ---

  /**
   * The pool rock values are built from: times-table families, weighted so the
   * ones the player is weakest on appear several times over. A flat list of the
   * five worst families barely bends the board — the weighting is what makes a
   * player shaky on 7s actually meet 7-heavy composites.
   *
   * A couple of easy families are always mixed in, so a wave is never a wall of
   * the player's worst table.
   */
  private familyPool(): number[] {
    const scored: { family: number; gap: number }[] = [];
    for (let n = FAMILY_RANGE.min; n <= FAMILY_RANGE.max; n++) {
      const def = SKILLS.find((s) => s.id === `mul.table.${n}`);
      if (!def) continue;
      const state = this.skills[def.id];
      // Unattempted families count as neutral rather than urgent: the placement
      // sweep, not this mode, is what discovers a cold profile.
      const gap = state ? state.rating - def.baseDifficulty : 0;
      scored.push({ family: n, gap });
    }
    scored.sort((a, b) => a.gap - b.gap);

    const pool: number[] = [];
    scored.slice(0, 5).forEach(({ family }, rank) => {
      const copies = Math.max(1, 4 - rank);
      for (let i = 0; i < copies; i++) pool.push(family);
    });
    pool.push(2, 5);
    return pool;
  }

  private rockCount(): number {
    const f = this.cfg.factor;
    return Math.min(f.maxRocks, f.baseRocks + (this.waveInRun - 1) * f.rocksPerWave);
  }

  private factorParts(): number {
    const f = this.cfg.factor;
    return Math.min(f.maxFactorParts, f.baseFactorParts + Math.floor((this.waveInRun - 1) / 3));
  }

  /** Start the next wave and return the rocks it opens with. */
  nextWave(): Rock[] {
    this.waveInRun += 1;
    this.hitsThisWave = 0;
    this.damageThisWave = 0;
    const families = this.familyPool();
    const parts = this.factorParts();
    this.rocks = [];
    for (let i = 0; i < this.rockCount(); i++) {
      const value = composeRockValue(families, parts, this.cfg.factor, this.rng);
      this.rocks.push({ id: this.nextRockId++, value });
    }
    return [...this.rocks];
  }

  get waveCleared(): boolean {
    return this.rocks.length === 0;
  }

  // --- shooting ---

  /**
   * Skills a shot exercises: naming a factor is exact division, and seeing the
   * pair behind it is that pair's times table.
   */
  private skillsForShot(value: number, shot: number): SkillId[] {
    const ids: SkillId[] = ['div.exact'];
    const other = value / shot;
    const family = Math.max(shot, other);
    if (shot !== value && family >= 2 && family <= 12 && Number.isInteger(other)) {
      ids.push(`mul.table.${family}`);
    }
    return ids.filter((id) => SKILLS.some((s) => s.id === id));
  }

  /** Rough difficulty of breaking this rock, on the rating scale. */
  private difficultyOf(value: number, shot: number): number {
    const ids = this.skillsForShot(value, shot);
    const base = Math.max(...ids.map((id) => getSkill(id).baseDifficulty));
    // Bigger numbers and prime endings are harder to see than small composites.
    const size = Math.min(300, Math.floor(value / 2));
    return base + size + (isPrime(value) ? 120 : 0);
  }

  /** Type `shot` at a rock. */
  shoot(rockId: number, shot: number, responseMs: number): ShotOutcome {
    const rock = this.rocks.find((r) => r.id === rockId);
    if (!rock) return { result: 'illegal' };
    const outcome: ShotKind = resolveShot(rock.value, shot);
    if (outcome.kind === 'illegal') {
      this.misfires += 1;
      return { result: 'illegal' };
    }

    const difficulty = this.difficultyOf(rock.value, shot);
    const attempt = { correct: true, responseMs, difficulty, wave: this.globalWave };
    this.skills = applyAttempt(this.skills, this.skillsForShot(rock.value, shot), attempt, this.cfg.rating);

    const fast = responseMs <= targetLatencyMs(difficulty, this.cfg.rating);
    const raw = shotScore(rock.value, outcome, this.cfg.factor);
    const points = Math.round(raw * this.comboMultiplier * (fast ? this.cfg.score.speedBonusMultiplier : 1));
    this.score += points;
    this.combo = comboHit(this.combo, this.cfg.combo);
    this.hitsThisWave += 1;
    this.rocks = this.rocks.filter((r) => r.id !== rockId);

    if (outcome.kind === 'destroy') {
      this.destroyed += 1;
      return { result: 'destroyed', parent: rock, points, prime: outcome.prime };
    }

    this.splits += 1;
    const pieces: [Rock, Rock] = [
      { id: this.nextRockId++, value: outcome.pieces[0] },
      { id: this.nextRockId++, value: outcome.pieces[1] },
    ];
    this.rocks.push(...pieces);
    return { result: 'split', parent: rock, pieces, points, balanced: outcome.balanced };
  }

  /** A rock hit the ship. Costs HP and half the combo, like meteor gunfire. */
  takeDamage(): void {
    this.hp -= 1;
    this.damageThisWave += 1;
    this.combo = comboDamaged(this.combo, this.cfg.combo);
  }

  endWave(): CoachPick | undefined {
    // Flying clean holds the combo through the breather, same as a clean wave
    // of meteors.
    if (this.damageThisWave > 0) this.combo = comboBreak(this.combo);
    const pick = selectTip(this.skills, this.globalWave, COACH_RECENCY_WAVES, this.lastTipSkill);
    if (pick) this.lastTipSkill = pick.skillId;
    return pick;
  }

  stats(): RunStats {
    return {
      score: this.score,
      wavesCleared: Math.max(0, this.waveInRun - (this.gameOver ? 1 : 0)),
      kills: this.splits + this.destroyed,
      misses: this.misfires,
      bestStreak: this.combo.best,
    };
  }

  creditsEarned(): number {
    return creditsForRun(this.stats(), this.cfg.economy);
  }

  /** Drift speed for a rock: the big ones lumber, the fragments are quick. */
  driftSpeed(value: number): number {
    const f = this.cfg.factor;
    const span = Math.max(1, f.maxRockValue - f.minRockValue);
    const t = Math.min(1, Math.max(0, (value - f.minRockValue) / span));
    return f.fastestDrift + (f.slowestDrift - f.fastestDrift) * t;
  }

  /** Radius for a rock, on the same scale as its drift. */
  radius(value: number): number {
    const f = this.cfg.factor;
    const span = Math.max(1, f.maxRockValue - f.minRockValue);
    const t = Math.min(1, Math.max(0, (value - f.minRockValue) / span));
    return f.minRadius + (f.maxRadius - f.minRadius) * t;
  }
}
