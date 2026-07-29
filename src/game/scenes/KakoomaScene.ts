import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { creditsForRun } from '../../core/economy/economy';
import { answerValue, type KakoomaOp } from '../../core/kakooma/kakooma';
import { KakoomaSession } from '../../core/kakooma/session';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { impact, shake, shockwave } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav } from '../../ui/MenuNav';
import { neonButton, paintPanel } from '../../ui/panels';
import { keyEventGate } from '../input/freshKey';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/**
 * KAKOOMA — find the number that is the sum of two others.
 *
 * The board is nine cells of nine numbers. Solve a cell and it collapses to the
 * one number it was hiding, so the board thins as it is worked — and when the
 * ninth falls, what is left standing is nine numbers in a three-by-three, which
 * is a cell. That is the puzzle-in-a-puzzle, and it needs no second screen to
 * explain it: the final cell is literally what the grid became.
 *
 * Controls are the numpad twice. A three-by-three of cells has exactly the
 * shape of a numpad, and so does the three-by-three inside each one, so 7 then
 * 7 is "top-left cell, top-left number". Pointer works too — this is a search
 * game and pointing at what you found is the natural gesture — but the keys are
 * the fast path and this is a keyboard game.
 */

const CELL_W = 190;
const CELL_H = 150;
const GAP = 14;
const BOARD_CX = 640;
const BOARD_CY = 388;

/** Numpad order, so key 7 is the top-left of a three-by-three. */
const PAD_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3] as const;

interface CellView {
  index: number;
  container: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Graphics;
  /** The nine numbers while unsolved. */
  numbers: Phaser.GameObjects.Text[];
  /** The single number left standing once it is. */
  answer: Phaser.GameObjects.Text;
  x: number;
  y: number;
}

interface KakoomaSceneData {
  op?: KakoomaOp;
}

export class KakoomaScene extends Phaser.Scene {
  private saves!: SaveManager;
  private session!: KakoomaSession;
  private cells: CellView[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private rangeText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private clockBar!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  /** Which cell the first keypress picked, or undefined when none is held. */
  private picked: number | undefined;
  private ended = false;
  private readonly fresh = keyEventGate();

  constructor() {
    super('Kakooma');
  }

  create(data: KakoomaSceneData): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('game');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.cells = [];
    this.picked = undefined;
    this.ended = false;

    this.session = new KakoomaSession({
      seed: (Math.random() * 0xffffffff) >>> 0,
      skills: this.saves.save.skills,
      totalWavesBefore: this.saves.save.totalWaves,
      ...(data.op ? { op: data.op } : {}),
    });

    this.buildHud();
    this.buildBoard();

    const quit = neonButton(this, width - 120, height * 0.945, 'LEAVE', () => this.finish(), {
      width: 160,
      height: 46,
      fontSize: 17,
    });
    new MenuNav(this, [[quit]]);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.keyboard?.once('keydown-ESC', () => this.finish());
    this.refresh();
  }

  // --- layout ---

  private buildHud(): void {
    const { width } = this.scale;
    makeIcon(this, width / 2 - 118, 40, 'factor', { size: 30, color: PALETTE.yellow, dim: PALETTE.magenta });
    this.add
      .text(width / 2 + 6, 40, this.session.operation === 'mul' ? 'KAKOOMA TIMES' : 'KAKOOMA PLUS', {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);

    this.scoreText = this.add
      .text(width - 26, 18, '0', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(1, 0);
    this.comboText = this.add
      .text(width - 26, 50, '', { fontFamily: FONT, fontSize: '15px', color: CSS.yellow })
      .setOrigin(1, 0);
    this.rangeText = this.add
      .text(26, 74, '', { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim })
      .setOrigin(0, 0);

    this.clockBar = this.add.graphics();
    this.clockText = this.add
      .text(26, 18, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0, 0);

    this.promptText = this.add
      .text(this.scale.width / 2, 660, '', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
  }

  private buildBoard(): void {
    const left = BOARD_CX - (3 * CELL_W + 2 * GAP) / 2;
    const top = BOARD_CY - (3 * CELL_H + 2 * GAP) / 2;

    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = left + col * (CELL_W + GAP) + CELL_W / 2;
      const y = top + row * (CELL_H + GAP) + CELL_H / 2;
      const container = this.add.container(x, y);
      const panel = this.add.graphics();
      container.add(panel);

      const numbers: Phaser.GameObjects.Text[] = [];
      for (let n = 0; n < 9; n++) {
        const nx = (n % 3 - 1) * 58;
        const ny = (Math.floor(n / 3) - 1) * 42;
        const text = this.add
          .text(nx, ny, '', {
            fontFamily: FONT,
            fontSize: '25px',
            fontStyle: 'bold',
            color: CSS.white,
          })
          .setOrigin(0.5);
        // Pointing at what you found is the natural gesture in a search game.
        text
          .setInteractive(
            new Phaser.Geom.Rectangle(-27, -20, 54, 40),
            Phaser.Geom.Rectangle.Contains,
          )
          .on('pointerdown', () => this.callNumber(i, n));
        text.input!.cursor = 'pointer';
        numbers.push(text);
        container.add(text);
      }

      const answer = this.add
        .text(0, 0, '', {
          fontFamily: FONT,
          fontSize: '46px',
          fontStyle: 'bold',
          color: CSS.cyan,
        })
        .setOrigin(0.5)
        .setVisible(false);
      answer
        .setInteractive(new Phaser.Geom.Rectangle(-50, -32, 100, 64), Phaser.Geom.Rectangle.Contains)
        .on('pointerdown', () => this.callFinal(i));
      answer.input!.cursor = 'pointer';
      container.add(answer);

      this.cells.push({ index: i, container, panel, numbers, answer, x, y });
    }
  }

  // --- input ---

  private onKey(event: KeyboardEvent): void {
    if (this.ended || !this.fresh(event)) return;
    if (event.key === 'Backspace' || event.key === 'Escape') {
      this.picked = undefined;
      this.refresh();
      return;
    }
    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;
    const slot = PAD_ORDER.indexOf(digit as (typeof PAD_ORDER)[number]);
    if (slot < 0) return;

    // Once the grid has collapsed there is only one cell left — the board
    // itself — so a single press calls it rather than picking into anything.
    if (this.session.finalUnlocked) {
      this.callFinal(slot);
      return;
    }
    if (this.picked === undefined) {
      if (this.session.solvedCells[slot]) return this.buzz();
      this.picked = slot;
      this.refresh();
      return;
    }
    this.callNumber(this.picked, slot);
  }

  private callNumber(cell: number, index: number): void {
    if (this.ended || this.session.finalUnlocked) return;
    const out = this.session.call(cell, index);
    this.picked = undefined;
    this.after(out, this.cells[cell]!);
  }

  private callFinal(index: number): void {
    if (this.ended || !this.session.finalUnlocked) return;
    const out = this.session.call(-1, index);
    this.after(out, this.cells[index]!);
  }

  private after(out: ReturnType<KakoomaSession['call']>, view: CellView): void {
    if (out.kind === 'refused') return this.buzz();
    if (out.kind === 'wrong') {
      getAudio(this)?.play('error');
      shake(this, 150, 0.008);
      this.flash(view, PALETTE.red);
      this.refresh();
      return;
    }
    if (out.kind === 'grid') {
      getAudio(this)?.play('explosion');
      impact(this, {
        shakeMs: CONFIG.juice.killShakeMs,
        shakeIntensity: CONFIG.juice.killShakeIntensity,
        glow: CONFIG.juice.glowPulseKill,
      });
      shockwave(this, BOARD_CX, BOARD_CY, PALETTE.yellow);
      this.refresh();
      return;
    }
    getAudio(this)?.play('prime');
    shockwave(this, view.x, view.y, PALETTE.cyan);
    // The cell collapsing to its answer is the mode's whole gesture, so it is
    // the one thing that gets a tween rather than a repaint.
    this.tweens.add({
      targets: view.container,
      scale: { from: 1.14, to: 1 },
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.refresh();
  }

  private buzz(): void {
    getAudio(this)?.play('error');
    shake(this, 80, 0.004);
  }

  private flash(view: CellView, colour: number): void {
    this.paintCell(view, colour, 0.5);
    this.time.delayedCall(200, () => this.refresh());
  }

  // --- painting ---

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    this.session.tick(delta / 1000);
    this.paintClock();
    if (this.session.over) this.finish();
  }

  private refresh(): void {
    const solved = this.session.solvedCells;
    const unlocked = this.session.finalUnlocked;

    this.cells.forEach((view, i) => {
      const isSolved = solved[i] === true;
      const cell = this.session.grid[i]!;
      view.numbers.forEach((text, n) => {
        const value = cell.values[n];
        text.setVisible(!isSolved && value !== undefined);
        if (value !== undefined) text.setText(String(value)).setColor(CSS.white);
      });
      view.answer.setVisible(isSolved).setText(String(answerValue(cell)));
      // Once the board is the final cell, its nine answers are candidates again
      // and none of them is "done" any more.
      view.answer.setColor(unlocked ? CSS.yellow : CSS.cyan);

      const focused = this.picked === i;
      const accent = unlocked ? PALETTE.yellow : isSolved ? PALETTE.cyanDim : focused ? PALETTE.yellow : PALETTE.purple;
      this.paintCell(view, accent, focused || unlocked ? 0.34 : 0.2);
    });

    this.scoreText.setText(String(this.session.score));
    const combo = this.session.combo;
    this.comboText.setText(combo > 1 ? `x${combo}` : '');
    this.rangeText.setText(`NUMBERS TO ${this.session.range}  ·  GRIDS ${this.session.gridsCleared}`);
    this.promptText.setText(this.hint());
  }

  private paintCell(view: CellView, accent: number, fillAlpha: number): void {
    paintPanel(view.panel, {
      width: CELL_W,
      height: CELL_H,
      accent,
      chamfer: 10,
      fillAlpha,
      borderWidth: 2,
      headerRule: false,
    });
  }

  private paintClock(): void {
    const left = this.session.timeLeft;
    const frac = Phaser.Math.Clamp(left / CONFIG.kakooma.startSeconds, 0, 1);
    this.clockText.setText(`${Math.ceil(left)}`).setColor(left <= 10 ? CSS.red : CSS.cyan);
    const g = this.clockBar;
    g.clear();
    g.fillStyle(PALETTE.deepPurple, 0.8);
    g.fillRect(26, 56, 210, 7);
    g.fillStyle(left <= 10 ? PALETTE.red : PALETTE.cyan, 1);
    g.fillRect(26, 56, 210 * frac, 7);
  }

  private hint(): string {
    const made = this.session.operation === 'mul' ? 'PRODUCT' : 'SUM';
    if (this.session.finalUnlocked) {
      return `THE NINE ANSWERS ARE A CELL — FIND THE ${made} ONE LAST TIME`;
    }
    if (this.picked !== undefined) return 'NOW THE NUMBER — NUMPAD, OR CLICK IT';
    return `IN EACH CELL, ONE NUMBER IS THE ${made} OF TWO OTHERS  ·  NUMPAD PICKS THE CELL, THEN THE NUMBER`;
  }

  // --- leaving ---

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const summary = this.session.summary();
    const save = this.saves.save;
    const credits = creditsForRun(
      {
        score: summary.score,
        wavesCleared: summary.gridsCleared,
        kills: summary.cellsSolved,
        misses: summary.misses,
        bestStreak: summary.bestCombo,
      },
      CONFIG.economy,
    );
    save.skills = this.session.skillTable;
    save.credits += credits;
    save.totalWaves += summary.gridsCleared;
    const unlocked = newMilestones(this.session.skillTable, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    this.scene.start('Debrief', {
      stats: {
        score: summary.score,
        wavesCleared: summary.gridsCleared,
        kills: summary.cellsSolved,
        misses: summary.misses,
        bestStreak: summary.bestCombo,
      },
      credits,
      mode: 'Kakooma',
      title: summary.gridsCleared > 0 ? 'TIME' : 'NO GRIDS CLEARED',
      titleColor: summary.gridsCleared > 0 ? CSS.yellow : CSS.red,
      wavesLabel: 'GRIDS CLEARED',
      killsLabel: 'CELLS FOUND',
      operatorLine:
        summary.cellsSolved > 0
          ? `OPERATOR // ${summary.cellsSolved} found. You did the arithmetic sideways and barely noticed.`
          : 'OPERATOR // Nothing found. Read the pairs, not the numbers.',
      milestones: unlocked.map((m) => m.label),
    });
  }
}
