import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { creditsForRun } from '../../core/economy/economy';
import { bondHint, frameCells } from '../../core/exercise/bonds';
import {
  currentLayer,
  ladderFor,
  layerAt,
  resultWidth,
  slotWidth,
  slotsFor,
} from '../../core/exercise/layers';
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

/** One rendered rung: a column sum of its own. */
interface Rung {
  depth: number;
  container: Phaser.GameObjects.Container;
  /** Result digits, right-aligned into the same columns as the operands. */
  resultSlots: Phaser.GameObjects.Text[];
  y: number;
}

/** Vertical band the ladder is laid out in. */
const BAND_TOP = 116;
const BAND_BOTTOM = 574;
/** A rung never grows past this, however few of them there are. */
const MAX_BLOCK = 152;
/** Cell and glyph sizes at full block height; both scale down together. */
const BASE_CELL = 34;
const BASE_FONT = 34;

/**
 * EXERCISE — the focus dial.
 *
 * The one mode that is not a race. A problem opens upward into coarser and
 * coarser versions of itself; the player answers the simplest one, then builds
 * each place back and answers again, and the full answer arrives in focus.
 *
 * Every rung is a column sum, written the way it is written on paper, and the
 * rungs share their columns — so the hundreds of `600 + 800` sit directly above
 * the hundreds of `679 + 834`. That vertical alignment is the whole lesson: it
 * is what makes a place a place rather than a position in a sentence.
 *
 * Coarsest at the top, so reading order and solving order are the same. Solved
 * rungs stay lit, because the method depends on it — `670 + 830` is only easy
 * while `1400` is still in front of you.
 */
export class ExerciseScene extends Phaser.Scene {
  private saves!: SaveManager;
  private session!: ExerciseSession;
  private buffer!: InputBuffer;
  private numpad!: Numpad;

  private rungs: Rung[] = [];
  private focusPanel!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private breakBtn!: ReturnType<typeof neonButton>;
  private buildBtn!: ReturnType<typeof neonButton>;
  private bondsBtn!: ReturnType<typeof neonButton>;
  /** The five/ten frame, drawn only while summoned. */
  private bondsPanel!: Phaser.GameObjects.Container;
  private bondsOpen = false;
  /** Block height of the current problem's rungs, for sizing the focus frame. */
  private blockH = MAX_BLOCK;
  /** Content bounds of a rung, relative to screen centre, so the frame can hug it. */
  private frameDx = 0;
  private frameW = 420;
  /** Blocks input between banking a problem and dealing the next one. */
  private busy = false;

  constructor() {
    super('Exercise');
  }

  create(data: ExerciseSceneData): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.rungs = [];
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

    makeIcon(this, width / 2 - 150, 44, 'exercise', {
      size: 34,
      color: PALETTE.cyan,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 4, 44, 'EXERCISE', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 72, this.session.skillLabel.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.progressText = this.add
      .text(64, 44, '', { fontFamily: FONT, fontSize: '15px', color: CSS.white })
      .setOrigin(0, 0.5);
    this.add
      .text(width - 64, 32, 'SCORE', { fontFamily: FONT, fontSize: '11px', color: CSS.cyanDim })
      .setOrigin(1, 0.5);
    this.scoreText = this.add
      .text(width - 64, 53, '0', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(1, 0.5);

    // Behind the rungs, sliding to whichever is live.
    this.focusPanel = neonPanel(this, width / 2, 0, {
      width: 420,
      height: MAX_BLOCK,
      accent: PALETTE.yellow,
      chamfer: 12,
      fillAlpha: 0.28,
      headerRule: false,
    });

    this.promptText = this.add
      .text(width / 2, height * 0.845, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.breakBtn = neonButton(this, width / 2 - 190, height * 0.915, 'BREAK IT', () => this.deconstruct(), {
      width: 290,
      height: 52,
      fontSize: 21,
      accent: PALETTE.magenta,
      sub: 'Q  ·  DROP A PLACE',
    });
    this.buildBtn = neonButton(this, width / 2 + 190, height * 0.915, 'BUILD IT BACK', () => this.reconstruct(), {
      width: 290,
      height: 52,
      fontSize: 21,
      accent: PALETTE.cyan,
      sub: 'E  ·  BRING A PLACE BACK',
    });
    this.bondsBtn = neonButton(this, 150, height * 0.915, 'BONDS', () => this.toggleBonds(), {
      width: 210,
      height: 52,
      fontSize: 19,
      accent: PALETTE.purple,
      sub: 'F  ·  FRIENDS OF 5 & 10',
    });
    const quit = neonButton(this, width - 110, height * 0.915, 'LEAVE', () => this.leave(), {
      width: 150,
      height: 52,
      fontSize: 17,
    });
    new MenuNav(this, [[this.bondsBtn, this.breakBtn, this.buildBtn, quit]]);

    this.bondsPanel = this.add.container(width * 0.845, 300).setVisible(false);

    this.buffer = new InputBuffer(this, (value) => this.onBufferChange(value));
    this.numpad = new Numpad(
      this,
      (digit) => this.buffer.push(digit),
      () => this.buffer.clear(),
    );
    this.numpad.applySessionDefault(isTouchDevice());

    this.input.keyboard?.on('keydown-Q', () => this.deconstruct());
    this.input.keyboard?.on('keydown-E', () => this.reconstruct());
    this.input.keyboard?.on('keydown-F', () => this.toggleBonds());
    this.input.keyboard?.once('keydown-ESC', () => this.leave());

    this.dealProblem();
  }

  // --- layout ---

  /** Ladder stops for the current problem, straight from core. */
  private reachableDepths(): number[] {
    return ladderFor(exerciseFromProblem(this.session.problem)!);
  }

  private deepestReachable(): number {
    return Math.max(...this.reachableDepths());
  }

  /**
   * Build a column sum for every rung. Positions are fixed from the start and
   * unreached rungs are merely hidden, so breaking a place off reveals a block
   * rather than reflowing the ones already on screen.
   *
   * The full problem anchors to the bottom of the band and the ladder grows
   * upward above it: the thing being worked on never moves.
   */
  private buildRungs(): void {
    for (const rung of this.rungs) rung.container.destroy();
    this.rungs = [];
    const { width } = this.scale;
    const problem = exerciseFromProblem(this.session.problem)!;
    const depths = this.reachableDepths();
    const digits = slotWidth(problem);
    // Wide enough for the widest rung's answer, never narrower than the
    // operands. A sum carries into a new place and a product needs several, so
    // the grid is measured rather than guessed.
    const cols = Math.max(digits, resultWidth(problem));

    const block = Math.min(MAX_BLOCK, (BAND_BOTTOM - BAND_TOP) / depths.length);
    this.blockH = block;
    const s = block / MAX_BLOCK;
    const cell = BASE_CELL * s;
    const font = BASE_FONT * s;
    const rowH = block * 0.3;
    const gridW = cols * cell;
    const right = gridW / 2;
    const left = -right;
    const sign = problem.op === 'add' ? '+' : problem.op === 'sub' ? '−' : '×';

    // The operator hangs outside the grid, so the frame has to be measured from
    // it rather than from the digits — otherwise a centred frame reads as
    // shifted right, which is exactly what it looked like.
    const contentLeft = left - cell * 1.2;
    this.frameDx = (contentLeft + right) / 2;
    this.frameW = right - contentLeft + 56;

    depths.forEach((depth, i) => {
      // Coarsest at the top: reading order is solving order.
      const fromBottom = i;
      const y = BAND_BOTTOM - block * (fromBottom + 0.5);
      const container = this.add.container(width / 2, y);

      const layer = layerAt(problem, depth);

      /**
       * Right-align a fixed-width operand into the shared column grid.
       *
       * The dim depth is the operand's own, not the rung's: a product holds its
       * second factor whole, so that factor stays fully lit however far the
       * dial has turned.
       */
      const operandRow = (value: number, ownDepth: number, rowY: number): void => {
        slotsFor(value, ownDepth, digits).forEach((slot, col) => {
          container.add(
            this.add
              .text(left + (cols - digits + col) * cell + cell / 2, rowY, slot.char, {
                fontFamily: FONT,
                fontSize: `${font}px`,
                fontStyle: 'bold',
                color: slot.dimmed ? CSS.purple : CSS.white,
              })
              .setOrigin(0.5),
          );
        });
      };

      operandRow(problem.a, layer.leftDepth, -rowH * 1.45);
      operandRow(problem.b, layer.rightDepth, -rowH * 0.45);
      // The operator sits outside the grid, left of the second operand, exactly
      // where it goes when this is written by hand.
      container.add(
        this.add
          .text(left - cell * 0.55, -rowH * 0.45, sign, {
            fontFamily: FONT,
            fontSize: `${font}px`,
            fontStyle: 'bold',
            color: CSS.magentaHot,
          })
          .setOrigin(0.5),
      );

      const rule = this.add.graphics();
      rule.lineStyle(Math.max(2, 3 * s), PALETTE.cyanDim, 0.9);
      rule.lineBetween(left - cell * 0.95, rowH * 0.12, right, rowH * 0.12);
      container.add(rule);

      const resultSlots = Array.from({ length: cols }, (_, col) =>
        this.add
          .text(left + col * cell + cell / 2, rowH * 1.0, '', {
            fontFamily: FONT,
            fontSize: `${font}px`,
            fontStyle: 'bold',
            color: CSS.yellow,
          })
          .setOrigin(0.5),
      );
      for (const slot of resultSlots) container.add(slot);

      this.rungs.push({ depth, container, resultSlots, y });
    });
  }

  // --- bonds ---

  /**
   * The bond for the column in focus, if this problem has one to give.
   *
   * Number bonds are about a column of a sum. A product's column is not two
   * digits meeting, so the frame has nothing true to say about one — better
   * silent than inventing a reading.
   */
  private currentBond(): ReturnType<typeof bondHint> {
    const problem = exerciseFromProblem(this.session.problem)!;
    if (problem.op === 'mul') return undefined;
    return bondHint(problem.a, problem.b, problem.op, this.session.state.depth);
  }

  private toggleBonds(): void {
    if (!this.currentBond()) return this.buzz(this.bondsBtn);
    this.bondsOpen = !this.bondsOpen;
    getAudio(this)?.play('ui');
    this.drawBonds();
  }

  /**
   * The five/ten frame for the column in focus.
   *
   * Summoned, never pushed: it is a place to look when a pair will not come,
   * and a panel that appeared on its own would be the game deciding the player
   * was struggling. Redrawn on every refresh so it follows the ladder up the
   * number as places come back into focus.
   */
  private drawBonds(): void {
    this.bondsPanel.removeAll(true);
    const state = this.session.state;
    const hint = this.currentBond();
    // Dimmed when there is no bond to show, so the button reads as unavailable
    // before it is pressed rather than only buzzing after.
    this.bondsBtn.setAccent(!hint ? PALETTE.deepPurple : this.bondsOpen ? PALETTE.cyan : PALETTE.purple);
    this.bondsPanel.setVisible(this.bondsOpen && hint !== undefined && !state.done);
    if (!this.bondsOpen || !hint) return;

    // Sit beside the rung being explained, not at a fixed height — the help has
    // to be where the eye already is. Clamped so a low rung cannot push the
    // reading off the bottom of the screen.
    const live = this.rungs.find((r) => r.depth === state.depth);
    const y = Phaser.Math.Clamp(live?.y ?? 300, 220, 430);
    this.bondsPanel.setPosition(this.scale.width * 0.845, y);

    const pip = 30;
    const gap = 4;
    const perRow = 5;
    const rows = hint.anchor / perRow;
    const gridW = perRow * (pip + gap) - gap;
    const cells = frameCells(hint);

    this.bondsPanel.add(
      this.add
        .text(0, -rows * (pip + gap) - 34, hint.anchor === 10 ? 'TEN FRAME' : 'FIVE FRAME', {
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5),
    );

    cells.forEach((cell, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = -gridW / 2 + col * (pip + gap) + pip / 2;
      const y = -rows * (pip + gap) / 2 + row * (pip + gap) + pip / 2;
      const box = this.add.graphics({ x, y });
      // Filled pips are what you already hold; given pips are what the partner
      // hands over. Two colours, because "which of these did I have" is the
      // question the frame exists to answer.
      const accent =
        cell === 'from' ? PALETTE.cyan : cell === 'given' ? PALETTE.magenta : PALETTE.purple;
      box.lineStyle(2, accent, cell === 'empty' ? 0.55 : 1);
      box.strokeRect(-pip / 2, -pip / 2, pip, pip);
      if (cell !== 'empty') {
        box.fillStyle(accent, 0.85);
        box.fillCircle(0, 0, pip * 0.28);
      }
      this.bondsPanel.add(box);
    });

    // Anything past the frame rides outside it — that overflow is the whole
    // point of bridging ten, so it must not be hidden inside the boxes.
    if (hint.leftover > 0) {
      const y = rows * (pip + gap) / 2 + 26;
      for (let i = 0; i < hint.leftover; i++) {
        const x = -((hint.leftover - 1) * 22) / 2 + i * 22;
        const dot = this.add.graphics({ x, y });
        dot.fillStyle(PALETTE.yellow, 0.9);
        dot.fillCircle(0, 0, 7);
        this.bondsPanel.add(dot);
      }
      this.bondsPanel.add(
        this.add
          .text(0, y + 24, `${hint.leftover} OVER`, {
            fontFamily: FONT,
            fontSize: '12px',
            color: CSS.yellow,
          })
          .setOrigin(0.5),
      );
    }

    this.bondsPanel.add(
      this.add
        .text(0, rows * (pip + gap) / 2 + (hint.leftover > 0 ? 66 : 26), hint.reading, {
          fontFamily: FONT,
          fontSize: '14px',
          color: CSS.white,
          align: 'center',
          wordWrap: { width: 250 },
          lineSpacing: 4,
        })
        .setOrigin(0.5, 0),
    );
  }

  /** Right-align a string into a rung's result columns. */
  private setResult(rung: Rung, text: string, color: string): void {
    const cols = rung.resultSlots.length;
    const padded = text.padStart(cols, ' ');
    rung.resultSlots.forEach((slot, i) => {
      const char = padded[i] ?? ' ';
      slot.setText(char === ' ' ? '' : char).setColor(color);
    });
  }

  // --- flow ---

  private dealProblem(): void {
    this.buffer.clear();
    this.buildRungs();
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
    // The revealed rung drops in from above, so breaking a place off reads as
    // the problem opening rather than as a row appearing from nowhere.
    const opened = this.rungs.find((r) => r.depth === this.session.state.depth);
    if (opened) {
      this.tweens.add({
        targets: opened.container,
        y: { from: opened.y - 24, to: opened.y },
        alpha: { from: 0, to: 1 },
        duration: 180,
        ease: 'Quad.easeOut',
      });
    }
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

    const rung = this.rungs.find((r) => r.depth === depth);
    if (rung) {
      shockwave(this, this.scale.width / 2, rung.y, PALETTE.cyan);
      this.tweens.add({
        targets: rung.container,
        scale: { from: 1.1, to: 1 },
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
    const buffer = this.buffer.value;

    for (const rung of this.rungs) {
      const shown = rung.depth <= this.deepestOpened();
      rung.container.setVisible(shown);
      if (!shown) continue;

      const focused = rung.depth === state.depth && !state.done;
      const solved = rung.depth > state.depth || (rung.depth === state.depth && state.layerSolved);
      const layer = layerAt(problem, rung.depth);

      rung.container.setAlpha(focused ? 1 : solved ? 0.75 : 0.42);
      if (solved) this.setResult(rung, String(layer.value), CSS.cyan);
      else if (focused) this.setResult(rung, buffer === '' ? '_' : buffer, CSS.yellow);
      else this.setResult(rung, '?', CSS.purple);
    }

    const live = this.rungs.find((r) => r.depth === state.depth);
    this.focusPanel.setVisible(!this.busy && live !== undefined);
    if (live) {
      this.focusPanel.setPosition(this.scale.width / 2 + this.frameDx, live.y);
      paintPanel(this.focusPanel, {
        width: this.frameW,
        height: this.blockH - 8,
        accent: state.layerSolved ? PALETTE.cyan : PALETTE.yellow,
        chamfer: 12,
        fillAlpha: 0.26,
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

    const canBreak = !state.locked && state.depth < this.deepestReachable();
    this.breakBtn.setAccent(canBreak ? PALETTE.magenta : PALETTE.purple);
    this.buildBtn.setAccent(state.layerSolved && state.depth > 0 ? PALETTE.yellow : PALETTE.purple);
    this.drawBonds();
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

  /** Paint the live rung's answer red for a beat, then let refresh restore it. */
  private flashMiss(): void {
    const rung = this.rungs.find((r) => r.depth === this.session.state.depth);
    if (!rung) return;
    for (const slot of rung.resultSlots) slot.setColor(CSS.red);
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
