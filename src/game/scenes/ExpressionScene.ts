import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { evaluateTokens, type Token } from '../../core/expression/expression';
import type { ExpressionProblem } from '../../core/expression/generate';
import { ExpressionSession, type Recalibration } from '../../core/expression/session';
import { newMilestones } from '../../core/skills/milestones';
import { runDeltas } from '../../core/skills/report';
import { DROP_LABEL, type DropKind } from '../../core/drops';
import { applyCrt } from '../../fx/applyCrt';
import {
  clearHitStop,
  glowPulse,
  goTo,
  impact,
  shake,
  shockwave,
  slowMo,
  streakPitch,
  timeScale,
} from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { ExpressionComposer } from '../../ui/ExpressionComposer';
import { onActionKey, sceneBindings } from '../input/KeyState';
import { announceDrop, carrierRing, effectsLine, DROP_CSS } from '../DropGfx';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { codeMatches } from '../../core/input/bindings';

type Phase = 'wave' | 'breather' | 'over';

/** A number falling at the player, with the par for the hand it was born from. */
interface LiveTarget {
  container: Phaser.GameObjects.Container;
  valueLabel: Phaser.GameObjects.Text;
  parLabel: Phaser.GameObjects.Text;
  problem: ExpressionProblem;
  spawnedAt: number;
  speed: number;
  /** Solving this one hands over a pickup. Null for an ordinary target. */
  payload: DropKind | null;
}

/** Why an expression was refused, in the player's words. */
const INVALID_REASON: Readonly<Record<string, string>> = {
  negative: 'NO NEGATIVES',
  fractional: 'MUST DIVIDE EVENLY',
  malformed: 'INCOMPLETE',
  'not-in-hand': 'NOT IN HAND',
};

const COMBO_BAR_WIDTH = 150;

export class ExpressionScene extends Phaser.Scene {
  private session!: ExpressionSession;
  private saves!: SaveManager;
  private composer!: ExpressionComposer;

  private phase: Phase = 'wave';
  private targets: LiveTarget[] = [];
  /** Carriers still owed this wave. */
  private carriersLeft = 0;
  private groundY = 0;
  private wave = 0;
  /** Scene-clock time the misfire lockout ends. */
  private lockedUntil = 0;

  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private comboBar!: Phaser.GameObjects.Rectangle;
  private waveText!: Phaser.GameObjects.Text;
  private effectsText!: Phaser.GameObjects.Text;

  constructor() {
    super('Expression');
  }

  create(data: { levelId?: string } = {}): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('game');
    applyCrt(this);
    clearHitStop(this);
    this.events.once('shutdown', () => clearHitStop(this));

    this.phase = 'wave';
    this.targets = [];
    this.wave = 0;
    this.lockedUntil = 0;
    this.groundY = height - 200;

    const save = this.saves.save;
    this.session = new ExpressionSession({
      seed: Date.now() >>> 0,
      skills: save.skills,
      totalWavesBefore: save.totalWaves,
      ...(data.levelId ? { levelId: data.levelId } : {}),
    });

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    const g = this.add.graphics();
    g.lineStyle(3, PALETTE.magenta, 1);
    g.lineBetween(0, this.groundY, width, this.groundY);

    this.createHud();
    this.composer = new ExpressionComposer(this, {
      exprY: height - 160,
      chipsY: height - 105,
      opsY: height - 46,
      onFire: (tokens) => this.fire(tokens),
      onScrap: (index) => this.scrap(index),
    });

    const bindings = sceneBindings(this);
    // One key, same everywhere: the rules over a paused game. A player who
    // wants these is stuck mid-run, and quitting to find out how a mode works
    // is how a mode gets abandoned rather than learned.
    this.input.keyboard?.on('keydown-H', () => {
      if (this.scene.isActive('Help')) return;
      this.scene.launch('Help', { target: 'Expression' });
      this.scene.pause();
    });
    onActionKey(this, bindings.pause, () => {
      if (this.phase === 'over') return;
      this.scene.launch('Pause', { target: 'Expression' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.phase !== 'wave' || codeMatches(bindings.pause, event.code)) return;
      this.composer.handleKey(event);
    });

    this.startWave();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.phase !== 'wave') return;
    const dt = (deltaMs / 1000) * timeScale(this);
    this.session.tick(dt);
    this.syncCombo();

    if (this.lockedUntil > 0 && this.time.now >= this.lockedUntil) {
      this.lockedUntil = 0;
      this.composer.setLocked(false);
      // Hand back a clean slate rather than the dead expression: the shot has
      // already been paid for in time, and dismantling it by hand is a second
      // charge for the same mistake.
      this.composer.reset();
    }

    const frozen = this.session.descentFrozen;
    for (const t of [...this.targets]) {
      if (!frozen) t.container.y += t.speed * dt;
      if (t.container.y >= this.groundY - 30) this.landTarget(t);
      if (this.phase !== 'wave') return; // the landing ended the run
    }

    // Keep the air full while the wave has targets left to give.
    while (this.targets.length < CONFIG.expression.targetsOnScreen && this.spawnNext()) {
      /* spawnNext does the work */
    }
    if (this.targets.length === 0 && this.session.targetsRemaining === 0) this.waveComplete();
  }

  private landTarget(t: LiveTarget): void {
    const landX = t.container.x;
    this.removeTarget(t);
    this.session.recordMiss(t.problem, this.time.now - t.spawnedAt);
    getAudio(this)?.play('land');
    this.explode(landX, this.groundY - 30, PALETTE.red, CONFIG.juice.landParticles);
    shockwave(this, landX, this.groundY - 30, PALETTE.red);
    this.cameras.main.flash(180, 255, 40, 40);
    impact(this, {
      shakeMs: CONFIG.juice.landShakeMs,
      shakeIntensity: CONFIG.juice.landShakeIntensity,
      glow: CONFIG.juice.glowPulseHeavy,
      hitStopMs: CONFIG.juice.heavyHitStopMs,
    });
    this.updateHud();
    if (this.session.gameOver) this.endRun();
  }

  // --- wave flow ---

  private startWave(): void {
    this.wave += 1;
    this.session.nextWave();
    this.phase = 'wave';
    this.carriersLeft = CONFIG.drops.carriersPerWave;
    this.waveText.setText(`WAVE ${this.wave}`);
    this.banner(`WAVE ${this.wave}`, CSS.magenta);
    getAudio(this)?.play('wave');
    this.composer.dealHand(this.session.handChips);
    this.spawnNext();
  }

  /** Put the next queued target in the air. False when the wave is spent. */
  private spawnNext(): boolean {
    const problem = this.session.spawnTarget();
    if (!problem) return false;
    this.spawnTarget(problem);
    return true;
  }

  private waveComplete(): void {
    this.phase = 'breather';
    const pick = this.session.endWave();
    const { width, height } = this.scale;
    // Same clear payoff as Meteor Defense — one game, one language for "won".
    getAudio(this)?.play('waveClear');
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
    const cleared = this.add
      .text(width / 2, height * 0.28, 'WAVE CLEARED', {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setScale(0.8);
    this.tweens.add({ targets: cleared, scale: 1, duration: 220, ease: 'Back.easeOut' });
    const lines: Phaser.GameObjects.GameObject[] = [cleared];
    if (pick) {
      getAudio(this)?.play('tip');
      lines.push(
        this.add
          .text(width / 2, height * 0.38, 'OPERATOR //', { fontFamily: FONT, fontSize: '18px', color: CSS.magentaHot })
          .setOrigin(0.5),
        this.add
          .text(width / 2, height * 0.44, pick.tip.text, {
            fontFamily: FONT,
            fontSize: '20px',
            color: CSS.white,
            wordWrap: { width: width * 0.7 },
            align: 'center',
          })
          .setOrigin(0.5),
      );
    }
    this.time.delayedCall(CONFIG.meteors.breatherSeconds * 1000, () => {
      for (const l of lines) l.destroy();
      if (this.phase !== 'over') this.startWave();
    });
  }

  // --- target ---

  private spawnTarget(problem: ExpressionProblem): void {
    const { width } = this.scale;
    // Keep the lanes apart so two targets never overlap on the way down.
    const lane = this.targets.length % 2 === 0 ? 0.3 : 0.7;
    const x = Phaser.Math.Between(width * lane - 120, width * lane + 120);
    const rock = this.add.image(0, 0, 'meteor').setScale(1.6).setTint(PALETTE.cyan);
    const valueLabel = this.add
      .text(0, -6, String(problem.target), {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: CSS.yellow,
        stroke: CSS.black,
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    // Par is the score chase: the fewest chips this hand needs to get there.
    const parLabel = this.add
      .text(0, 30, `PAR ${problem.par}`, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: CSS.cyanDim,
        stroke: CSS.black,
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    // Carriers are marked before they are rolled, so the ring is a promise of
    // something rather than a spoiler of what.
    const payload = this.carriersLeft > 0 ? this.session.rollDrop() : null;
    const parts: Phaser.GameObjects.GameObject[] = [rock, valueLabel, parLabel];
    if (payload) {
      this.carriersLeft -= 1;
      parts.unshift(carrierRing(this, 46));
    }
    const container = this.add.container(x, -70, parts);
    this.tweens.add({ targets: rock, angle: -360, duration: 14000, repeat: -1 });
    this.targets.push({
      container,
      valueLabel,
      parLabel,
      problem,
      spawnedAt: this.time.now,
      speed: (this.groundY + 70) / this.session.fallSeconds(problem),
      payload,
    });
  }

  private removeTarget(t: LiveTarget): void {
    this.targets = this.targets.filter((x) => x !== t);
    t.container.destroy();
  }

  /**
   * A target the spent chips put out of reach gets a new number rather than
   * standing there impossible. Signposted, because a number changing on its own
   * is otherwise the game appearing to cheat.
   */
  private applyRecalibrations(changes: readonly Recalibration[]): void {
    for (const change of changes) {
      const live = this.targets.find((t) => t.problem.id === change.fromId);
      if (!live) continue;
      live.problem = change.problem;
      live.valueLabel.setText(String(change.problem.target));
      live.parLabel.setText(`PAR ${change.problem.par}`);
      live.speed = (this.groundY + 70) / this.session.fallSeconds(change.problem);
      this.floatText(live.container.x, live.container.y - 50, 'RECALIBRATED', CSS.magentaHot);
      getAudio(this)?.play('error', { pitch: 1.6 });
      this.tweens.add({
        targets: live.valueLabel,
        alpha: { from: 0.15, to: 1 },
        duration: 140,
        repeat: 2,
      });
    }
  }

  private scrap(index: number): boolean {
    if (this.phase !== 'wave' || this.lockedUntil > 0) return false;
    const recalibrated = this.session.scrapChip(index);
    if (recalibrated === null) return false;
    this.composer.dealHand(this.session.handChips);
    // The swapped chip may have been a falling target's only route; the
    // session already re-rolled those, so re-label their sprites too.
    this.applyRecalibrations(recalibrated);
    this.syncCombo();
    return true;
  }

  // --- firing ---

  private fire(tokens: readonly Token[]): void {
    if (this.phase !== 'wave' || this.lockedUntil > 0) return;

    // Evaluate here purely to find which target the shot is aimed at, so the
    // response time handed to the session belongs to that target. Live targets
    // never share a value, so there is at most one.
    const value = evaluateTokens(tokens);
    const aimed = value.ok ? this.targets.find((t) => t.problem.target === value.value) : undefined;
    const responseMs = aimed ? this.time.now - aimed.spawnedAt : 0;
    const outcome = this.session.fire(tokens, responseMs);

    if (outcome.result === 'hit' && aimed) {
      const { juice } = CONFIG;
      const audio = getAudio(this);
      const bonus = outcome.parBonus > 0 || outcome.varietyBonus > 0;
      const pitch = streakPitch(this.session.streak);
      audio?.play(bonus ? 'laserSpread' : 'laser', { pitch });
      audio?.play(bonus ? 'fast' : 'explosion', { pitch });
      const x = aimed.container.x;
      const y = aimed.container.y;
      this.laser(x, y);
      this.explode(x, y, bonus ? PALETTE.yellow : PALETTE.cyan, bonus ? juice.fastKillParticles : juice.killParticles);
      shockwave(this, x, y, bonus ? PALETTE.yellow : PALETTE.cyan);
      let popup = `+${outcome.points}`;
      if (outcome.parBonus > 0) popup += '  PAR';
      if (outcome.varietyBonus > 0) popup += '  VARIETY';
      this.scorePopup(x, y, popup);
      impact(this, {
        shakeMs: juice.killShakeMs,
        shakeIntensity: juice.killShakeIntensity,
        glow: bonus ? juice.glowPulseHeavy : juice.glowPulseKill,
        hitStopMs: juice.hitStopMs,
      });
      const payload = aimed.payload;
      this.removeTarget(aimed);
      // There is no avatar to catch anything with here, so the target hands its
      // payload over on the way out. Solving it *is* the collection.
      if (payload) this.collectDrop(payload, x, y);
      // The hand changed, so the chips and any target it stranded both follow.
      this.composer.dealHand(this.session.handChips);
      this.applyRecalibrations(outcome.recalibrated);
      this.updateHud();
    } else if (outcome.result === 'wrong') {
      // Fired at nothing: no chips spent, no HP, just the clock and the lock.
      getAudio(this)?.play('error');
      this.composer.flashWrong(outcome.value);
      shake(this, 60, 0.003);
      this.lockOut();
      this.updateHud();
    } else if (outcome.result === 'invalid') {
      this.composer.errorCue();
      this.floatText(
        this.scale.width / 2,
        this.scale.height - 200,
        INVALID_REASON[outcome.reason] ?? 'INVALID',
        CSS.red,
      );
    }
  }

  /** Freeze the composer briefly after a shot at nothing. */
  private lockOut(): void {
    this.lockedUntil = this.time.now + CONFIG.expression.misfireLockSeconds * 1000;
    this.composer.setLocked(true);
  }

  // --- fx ---

  private laser(tx: number, ty: number): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.lineStyle(4, PALETTE.cyan, 1);
    g.lineBetween(width / 2, height - 160, tx, ty);
    g.lineStyle(2, PALETTE.white, 1);
    g.lineBetween(width / 2, height - 160, tx, ty);
    this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  private explode(x: number, y: number, tint: number, count: number): void {
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 60, max: 340 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 650 },
      scale: { start: 1.8, end: 0 },
      tint,
      quantity: count,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(750, () => emitter.destroy());
    const flash = this.add.image(x, y, 'glowdot').setTint(tint).setScale(3.4).setAlpha(0.9);
    this.tweens.add({ targets: flash, scale: 7, alpha: 0, duration: 240, onComplete: () => flash.destroy() });
  }

  private scorePopup(x: number, y: number, message: string): void {
    const text = this.add
      .text(x, y - 24, message, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.yellow })
      .setOrigin(0.5);
    this.tweens.add({ targets: text, y: y - 90, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
  }

  private banner(message: string, color: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height * 0.26, message, { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: text, alpha: 1, duration: 200, hold: 900, yoyo: true, onComplete: () => text.destroy() });
  }

  // --- HUD ---

  private createHud(): void {
    const { width } = this.scale;
    const style = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' };
    this.hpText = this.add.text(24, 20, '', { ...style, color: CSS.magenta });
    this.scoreText = this.add.text(width - 24, 20, '', { ...style, color: CSS.white }).setOrigin(1, 0);
    this.streakText = this.add.text(width - 24, 50, '', { ...style, color: CSS.yellow }).setOrigin(1, 0);
    this.comboBar = this.add
      .rectangle(width - 24, 80, COMBO_BAR_WIDTH, 6, PALETTE.yellow)
      .setOrigin(1, 0)
      .setVisible(false);
    this.waveText = this.add.text(width / 2, 20, '', { ...style, color: CSS.cyanDim }).setOrigin(0.5, 0);
    this.effectsText = this.add
      .text(width / 2, 50, '', { fontFamily: FONT, fontSize: '15px', color: CSS.cyan })
      .setOrigin(0.5, 0);
    this.updateHud();
  }

  private updateHud(): void {
    this.hpText.setText(`HP ${'█'.repeat(Math.max(0, this.session.hp))}`);
    this.scoreText.setText(`${this.session.score}`);
    this.syncCombo();
  }

  // --- drops ---

  /**
   * Take the payload a solved carrier was holding. `nuke` is the one that
   * cannot be a timer — it clears what is in the air right now.
   */
  private collectDrop(kind: DropKind, x: number, y: number): void {
    this.session.collectDrop(kind);
    announceDrop(this, kind);
    if (kind === 'nuke') this.detonateNuke();
    this.floatText(x, y, DROP_LABEL[kind], DROP_CSS[kind]);
    glowPulse(this, CONFIG.juice.glowPulseHeavy);
    this.updateHud();
  }

  /** Clears the air for score. No ratings move — the player solved none of it. */
  private detonateNuke(): void {
    for (const t of [...this.targets]) {
      const points = this.session.recordNuke(t.problem);
      this.explode(t.container.x, t.container.y, PALETTE.red, CONFIG.juice.killParticles);
      this.scorePopup(t.container.x, t.container.y, `+${points}`);
      this.removeTarget(t);
    }
    shake(this, 320, 0.012);
    this.cameras.main.flash(300, 255, 59, 59);
  }

  /** Same combo readout as meteor mode — one meter, one language. */
  private syncCombo(): void {
    const { session } = this;
    // Every frame, not just on a kill: these are clocks, and a countdown that
    // only moves when you score is not a countdown.
    this.effectsText.setText(effectsLine(session.dropState));
    this.streakText.setText(session.streak > 0 ? `x${session.comboMultiplier}  ${session.streak}` : '');
    this.streakText.setColor(session.overdriveActive ? CSS.magentaHot : CSS.yellow);
    this.comboBar
      .setVisible(session.streak > 0)
      .setFillStyle(session.overdriveActive ? PALETTE.magenta : PALETTE.yellow)
      .setSize(Math.max(1, COMBO_BAR_WIDTH * session.comboFraction), 6);
  }

  /** Short label that rises off a point and fades. */
  private floatText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: CSS.black,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({
      targets: text,
      y: y - 44,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  // --- end of run ---

  private endRun(): void {
    this.phase = 'over';
    clearHitStop(this);
    const save = this.saves.save;
    const credits = this.session.creditsEarned();
    const deltas = runDeltas(save.skills, this.session.skillTable, CONFIG);
    save.skills = this.session.skillTable;
    save.totalWaves += this.session.currentWaveNumber;
    save.credits += credits;
    save.bestScore = Math.max(save.bestScore, this.session.score);
    const unlocked = newMilestones(this.session.skillTable, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    // The same death beat as Meteor Defense: flash, shake, and the world
    // sinking into slow motion. This mode used to end on a bare shake.
    getAudio(this)?.play('gameover');
    this.cameras.main.flash(400, 255, 45, 149);
    impact(this, {
      shakeMs: CONFIG.juice.gameOverShakeMs,
      shakeIntensity: CONFIG.juice.gameOverShakeIntensity,
      glow: CONFIG.juice.glowPulseHeavy,
    });
    slowMo(this, 600, 0.3);
    this.time.delayedCall(550, () => {
      goTo(this, 'Debrief', {
        stats: this.session.stats(),
        credits,
        mode: 'Expression',
        milestones: unlocked.map((m) => m.label),
        deltas,
      });
    });
  }
}
