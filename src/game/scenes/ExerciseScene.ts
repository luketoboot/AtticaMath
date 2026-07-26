import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { creditsForRun } from '../../core/economy/economy';
import { currentLayer, ladderFor, layerAt, slotWidth, slotsFor } from '../../core/exercise/layers';
import { EXERCISE_SKILLS, ExerciseSession, exerciseFromProblem } from '../../core/exercise/session';
import { newMilestones } from '../../core/skills/milestones';
import type { SkillId } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { impact, shake, shockwave } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav } from '../../ui/MenuNav';
import { isTouchDevice, Numpad } from '../../ui/Numpad';
import { neonButton, neonPanel, paintPanel } from '../../ui/panels';
import { InputBuffer } from '../InputBuffer';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** Registry key for the skill a Playbook "WORK IT" should open Exercise on. */
export const EXERCISE_SKILL_KEY = 'exerciseSkill';

interface ExerciseSceneData {
  skillId?: SkillId;
}

/** One rendered rung of the ladder. */
interface Row {
  depth: number;
  container: Phaser.GameObjects.Container;
  result: Phaser.GameObjects.Text;
  y: number;
}

const CELL = 32;
const ROW_H = 66;
const OP_W = 46;
const EQ_W = 52;
const ANSWER_CELLS = 5;

/**
 * EXERCISE — the focus dial.
 *
 * The one mode that is not a race. A problem opens downward into coarser and
 * coarser versions of itself; the player answers the simplest one, then builds
 * each place back and answers again, and the full answer arrives in focus.
 *
 * The rungs stay on screen as they are solved, because the method depends on
 * it: 670 + 830 is only easy while 1400 is still in front of you. What the
 * mode teaches is a way of looking, so the looking has to be visible.
 */
export class ExerciseScene extends Phaser.Scene {
  private saves!: SaveManager;
  private session!: ExerciseSession;
  private buffer!: InputBuffer;
  private numpad!: Numpad;

  private rows: Row[] = [];
  private focusPanel!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private breakBtn!: ReturnType<typeof neonButton>;
  private buildBtn!: ReturnType<typeof neonButton>;
  /** Blocks input between banking a problem and dealing the next one. */
  private busy = false;
  private centerY = 0;

  constructor() {
    super('Exercise');
  }

  create(data: ExerciseSceneData): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.rows = [];
    this.busy = false;

    const requested = (data.skillId ?? this.registry.get(EXERCISE_SKILL_KEY)) as SkillId | undefined;
    const skillId = requested && EXERCISE_SKILLS.includes(requested) ? requested : undefined;
    this.registry.remove(EXERCISE_SKILL_KEY);
    this.session = new ExerciseSession({
      // Seeded from Math.random rather than the clock so the screenshot harness,
      // which stubs it, can hold a golden of a mode that is all layout.
      seed: (Math.random() * 0xffffffff) >>> 0,
      skills: this.saves.save.skills,
      totalWavesBefore: this.saves.save.totalWaves,
      ...(skillId ? { skillId } : {}),
    });

    makeIcon(this, width / 2 - 150, 46, 'exercise', {
      size: 38,
      color: PALETTE.cyan,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 8, 46, 'EXERCISE', {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 78, this.session.skillLabel.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.progressText = this.add
      .text(64, 46, '', { fontFamily: FONT, fontSize: '15px', color: CSS.white })
      .setOrigin(0, 0.5);
    this.add
      .text(width - 64, 34, 'SCORE', { fontFamily: FONT, fontSize: '11px', color: CSS.cyanDim })
      .setOrigin(1, 0.5);
    this.scoreText = this.add
      .text(width - 64, 55, '0', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(1, 0.5);

    // The focus frame sits behind the rows and slides to whichever is live.
    this.focusPanel = neonPanel(this, width / 2, 0, {
      width: 720,
      height: ROW_H - 6,
      accent: PALETTE.yellow,
      chamfer: 10,
      fillAlpha: 0.3,
      headerRule: false,
    });

    this.centerY = height * 0.46;
    this.promptText = this.add
      .text(width / 2, height * 0.75, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.breakBtn = neonButton(this, width / 2 - 190, height * 0.845, 'BREAK IT', () => this.deconstruct(), {
      width: 290,
      height: 56,
      fontSize: 22,
      accent: PALETTE.magenta,
      sub: 'Q  ·  DROP A PLACE',
    });
    this.buildBtn = neonButton(this, width / 2 + 190, height * 0.845, 'BUILD IT BACK', () => this.reconstruct(), {
      width: 290,
      height: 56,
      fontSize: 22,
      accent: PALETTE.cyan,
      sub: 'E  ·  BRING A PLACE BACK',
    });
    const quit = neonButton(this, width / 2, height * 0.945, 'LEAVE', () => this.leave(), {
      width: 180,
      height: 40,
      fontSize: 16,
    });
    new MenuNav(this, [[this.breakBtn, this.buildBtn], [quit]]);

    this.buffer = new InputBuffer(this, (value) => this.onBufferChange(value));
    this.numpad = new Numpad(
      this,
      (digit) => this.buffer.push(digit),
      () => this.buffer.clear(),
    );
    this.numpad.applySessionDefault(isTouchDevice());

    this.input.keyboard?.on('keydown-Q', () => this.deconstruct());
    this.input.keyboard?.on('keydown-E', () => this.reconstruct());
    this.input.keyboard?.once('keydown-ESC', () => this.leave());

    this.dealProblem();
  }

  // --- layout ---

  /** Total pixel width of one rung, so rows can be centred as a block. */
  private rowWidth(digits: number): number {
    return digits * CELL + OP_W + digits * CELL + EQ_W + ANSWER_CELLS * CELL;
  }

  /**
   * Build every rung of the current problem. Rows exist from the start but only
   * those at or above the dial's reach are shown, so deconstructing reveals
   * rather than rebuilds — a row that has to be created cannot be tweened in.
   */
  private buildRows(): void {
    for (const row of this.rows) row.container.destroy();
    this.rows = [];
    const { width } = this.scale;
    const problem = exerciseFromProblem(this.session.problem)!;
    const digits = slotWidth(problem);
    const total = this.rowWidth(digits);
    const left = -total / 2;
    const sign = problem.op === 'add' ? '+' : '−';
    const deepest = this.deepestReachable();

    for (const depth of this.reachableDepths()) {
      // Rungs sit in ladder order, not depth order, so a skipped place leaves
      // no gap on screen.
      const rung = this.reachableDepths().indexOf(depth);
      const y = this.centerY + (rung - deepest / 2) * ROW_H;
      const container = this.add.container(width / 2, y);

      const place = (value: number, originX: number): void => {
        slotsFor(value, depth, digits).forEach((slot, i) => {
          const text = this.add
            .text(originX + i * CELL + CELL / 2, 0, slot.char, {
              fontFamily: FONT,
              fontSize: '34px',
              fontStyle: 'bold',
              color: slot.dimmed ? CSS.purple : CSS.white,
            })
            .setOrigin(0.5);
          container.add(text);
        });
      };

      place(problem.a, left);
      const opX = left + digits * CELL;
      container.add(
        this.add
          .text(opX + OP_W / 2, 0, sign, {
            fontFamily: FONT,
            fontSize: '30px',
            fontStyle: 'bold',
            color: CSS.magentaHot,
          })
          .setOrigin(0.5),
      );
      place(problem.b, opX + OP_W);
      const eqX = opX + OP_W + digits * CELL;
      container.add(
        this.add
          .text(eqX + EQ_W / 2, 0, '=', {
            fontFamily: FONT,
            fontSize: '30px',
            fontStyle: 'bold',
            color: CSS.cyanDim,
          })
          .setOrigin(0.5),
      );

      const result = this.add
        .text(eqX + EQ_W + 8, 0, '', {
          fontFamily: FONT,
          fontSize: '34px',
          fontStyle: 'bold',
          color: CSS.yellow,
        })
        .setOrigin(0, 0.5);
      container.add(result);

      this.rows.push({ depth, container, result, y });
    }
  }

  /** Ladder stops for the current problem, straight from core. */
  private reachableDepths(): number[] {
    return ladderFor(exerciseFromProblem(this.session.problem)!);
  }

  private deepestReachable(): number {
    return Math.max(...this.reachableDepths());
  }

  // --- flow ---

  private dealProblem(): void {
    this.buffer.clear();
    this.buildRows();
    this.refresh();
  }

  private deconstruct(): void {
    if (this.busy) return;
    const event = this.session.deconstruct();
    if (event.kind === 'refused') return this.buzz(this.breakBtn);
    getAudio(this)?.play('phase');
    this.buffer.clear();
    shake(this, 90, 0.004);
    this.refresh();
  }

  private reconstruct(): void {
    if (this.busy) return;
    const event = this.session.reconstruct();
    if (event.kind === 'refused') return this.buzz(this.buildBtn);
    getAudio(this)?.play('reload');
    this.buffer.clear();
    this.refresh();
  }

  /**
   * Continuous buffer, same as every other mode: no enter key. A partial answer
   * is left alone, a match fires, and anything that can no longer become the
   * answer is a miss — buzzed, never silently swallowed.
   */
  private onBufferChange(value: string): void {
    if (this.busy || value === '') return this.refresh();
    const answer = String(currentLayer(this.session.state).value);
    if (value === answer) {
      this.solve();
      return;
    }
    if (answer.startsWith(value)) {
      this.refresh();
      return;
    }
    this.session.submit(Number(value));
    getAudio(this)?.play('error');
    shake(this, 140, 0.008);
    this.buffer.clear();
    this.refresh();
    this.flashMiss();
  }

  private solve(): void {
    const depth = this.session.state.depth;
    const event = this.session.submit(currentLayer(this.session.state).value);
    if (event.kind !== 'solved') return;
    this.buffer.clear();

    const row = this.rows.find((r) => r.depth === depth);
    if (row) {
      shockwave(this, this.scale.width / 2, row.y, PALETTE.cyan);
      this.tweens.add({
        targets: row.container,
        scale: { from: 1.12, to: 1 },
        duration: 200,
        ease: 'Quad.easeOut',
      });
    }

    if (event.complete) {
      getAudio(this)?.play('explosion');
      impact(this, {
        shakeMs: CONFIG.juice.killShakeMs,
        shakeIntensity: CONFIG.juice.killShakeIntensity,
        glow: CONFIG.juice.glowPulseKill,
      });
      this.busy = true;
      this.refresh();
      this.time.delayedCall(900, () => this.advance());
      return;
    }

    getAudio(this)?.play('prime');
    impact(this, { shakeMs: 110, shakeIntensity: 0.006, glow: CONFIG.juice.glowPulseKill * 0.6 });
    this.refresh();
  }

  private advance(): void {
    if (this.session.setComplete) {
      this.finishSet();
      return;
    }
    this.session.nextProblem();
    this.busy = false;
    this.dealProblem();
  }

  // --- painting ---

  private refresh(): void {
    const state = this.session.state;
    const problem = exerciseFromProblem(this.session.problem)!;
    const reachable = new Set(this.reachableDepths());
    const buffer = this.buffer.value;

    for (const row of this.rows) {
      const shown = reachable.has(row.depth) && row.depth <= this.deepestOpened();
      row.container.setVisible(shown);
      if (!shown) continue;

      const focused = row.depth === state.depth && !state.done;
      const solved = row.depth > state.depth || (row.depth === state.depth && state.layerSolved);
      const layer = layerAt(problem, row.depth);

      row.container.setAlpha(focused ? 1 : solved ? 0.72 : 0.4);
      if (solved) {
        row.result.setText(String(layer.value)).setColor(CSS.cyan);
      } else if (focused) {
        row.result.setText(buffer === '' ? '_' : buffer).setColor(CSS.yellow);
      } else {
        row.result.setText('?').setColor(CSS.purple);
      }
    }

    const live = this.rows.find((r) => r.depth === state.depth);
    this.focusPanel.setVisible(!this.busy && live !== undefined);
    if (live) {
      this.focusPanel.setPosition(this.scale.width / 2, live.y);
      paintPanel(this.focusPanel, {
        width: this.rowWidth(slotWidth(problem)) + 56,
        height: ROW_H - 6,
        accent: state.layerSolved ? PALETTE.cyan : PALETTE.yellow,
        chamfer: 10,
        fillAlpha: 0.28,
        headerRule: false,
      });
    }

    // While a finished problem is still on screen the counter names it, not the
    // one waiting behind it.
    const nth = state.done ? this.session.solvedCount : this.session.solvedCount + 1;
    this.progressText.setText(
      `PROBLEM ${Math.min(nth, CONFIG.exercise.problemsPerSet)} / ${CONFIG.exercise.problemsPerSet}`,
    );
    this.scoreText.setText(`${this.session.score}`);
    this.promptText.setText(this.hint());

    // The button that is the next legal move wears the accent.
    const canBreak = !state.locked && state.depth < this.deepestReachable();
    this.breakBtn.setAccent(canBreak ? PALETTE.magenta : PALETTE.purple);
    this.buildBtn.setAccent(state.layerSolved && state.depth > 0 ? PALETTE.yellow : PALETTE.purple);
  }

  private hint(): string {
    const state = this.session.state;
    if (state.done) return 'SOLVED';
    if (state.layerSolved) return 'BUILD IT BACK — BRING THE NEXT PLACE INTO FOCUS';
    if (state.locked) return 'ANSWER THIS RUNG';
    return 'TYPE THE ANSWER, OR BREAK IT DOWN UNTIL YOU CAN SEE IT';
  }

  /** The deepest rung the player has actually opened. */
  private deepestOpened(): number {
    return this.session.state.locked ? this.session.state.scaffoldDepth : this.session.state.depth;
  }

  /** Paint the live rung's answer slot red for a beat, then let refresh restore it. */
  private flashMiss(): void {
    const row = this.rows.find((r) => r.depth === this.session.state.depth);
    if (!row) return;
    row.result.setColor(CSS.red);
    this.time.delayedCall(220, () => this.refresh());
  }

  private buzz(button: ReturnType<typeof neonButton>): void {
    getAudio(this)?.play('error');
    shake(this, 90, 0.005);
    button.setAccent(PALETTE.red);
    this.time.delayedCall(160, () => this.refresh());
  }

  // --- leaving ---

  private finishSet(): void {
    const summary = this.session.summary();
    const save = this.saves.save;
    const credits = creditsForRun(
      {
        score: summary.score,
        wavesCleared: 0,
        kills: summary.solved,
        misses: summary.totalMisses,
        bestStreak: 0,
      },
      CONFIG.economy,
    );
    save.skills = this.session.skillTable;
    save.credits += credits;
    const unlocked = newMilestones(this.session.skillTable, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    this.scene.start('Debrief', {
      stats: {
        score: summary.score,
        wavesCleared: summary.solved,
        kills: summary.cleanSolves,
        misses: summary.totalMisses,
        bestStreak: 0,
      },
      credits,
      mode: 'Exercise',
      title: summary.graduated ? 'NO SCAFFOLD NEEDED' : 'SET COMPLETE',
      killsLabel: 'SOLVED WHOLE',
      streakLabel: 'BEST STREAK',
      milestones: unlocked.map((m) => m.label),
    });
  }

  /** Bank whatever the skill table learned, then out. */
  private leave(): void {
    const save = this.saves.save;
    save.skills = this.session.skillTable;
    this.saves.persist();
    this.scene.start('Menu');
  }
}

