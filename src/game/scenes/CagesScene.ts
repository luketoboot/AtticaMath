import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { colOf, OP_SIGN, rowOf } from '../../core/cages/cages';
import { CageSession } from '../../core/cages/session';
import { CONFIG } from '../../core/config';
import { creditsForRun } from '../../core/economy/economy';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { impact, shake, shockwave } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { neonButton } from '../../ui/panels';
import { keyEventGate } from '../input/freshKey';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/**
 * CAGES — a grid you can only fill by computing.
 *
 * Every row and column holds each digit once, and the grid is carved into
 * regions carrying a target: "these three multiply to 24". Nothing is offered
 * as a choice, so there is nothing to pick by eye — to place one digit you have
 * to find which factorisations fit the cage and which of those survive the
 * digits already committed in that row.
 *
 * Untimed. The claim is that it cannot be played without arithmetic, and a
 * clock would push a stuck player into guessing digits, which is the one way to
 * play it that teaches nothing.
 */

const CELL = 92;

interface CellView {
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}

export class CagesScene extends Phaser.Scene {
  private saves!: SaveManager;
  private session!: CageSession;
  private cells: CellView[] = [];
  private cageLines!: Phaser.GameObjects.Graphics;
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  private originX = 0;
  private originY = 0;
  private progressText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private busy = false;
  private readonly fresh = keyEventGate();

  constructor() {
    super('Cages');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.cells = [];
    this.labels = [];
    this.cursor = 0;
    this.busy = false;

    this.session = new CageSession({
      seed: (Math.random() * 0xffffffff) >>> 0,
      skills: this.saves.save.skills,
      totalWavesBefore: this.saves.save.totalWaves,
    });

    const span = this.session.width * CELL;
    this.originX = width / 2 - span / 2;
    this.originY = 128;

    this.buildHud();
    this.cageLines = this.add.graphics().setDepth(3);
    this.cursorGfx = this.add.graphics().setDepth(4);
    this.buildGrid();

    neonButton(this, width - 120, height * 0.93, 'LEAVE', () => this.leave(), {
      width: 160,
      height: 46,
      fontSize: 17,
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.keyboard?.once('keydown-ESC', () => this.leave());
    // One key, same everywhere: the rules over a paused game.
    this.input.keyboard?.on('keydown-H', () => {
      if (this.scene.isActive('Help')) return;
      this.scene.launch('Help', { target: 'Cages' });
      this.scene.pause();
    });

    this.redraw();
  }

  private buildHud(): void {
    const { width } = this.scale;
    makeIcon(this, width / 2 - 96, 44, 'gnomon', {
      size: 30,
      color: PALETTE.yellow,
      dim: PALETTE.cyan,
    });
    this.add
      .text(width / 2 + 8, 44, 'CAGES', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);

    this.progressText = this.add
      .text(64, 44, '', { fontFamily: FONT, fontSize: '15px', color: CSS.white })
      .setOrigin(0, 0.5);
    this.scoreText = this.add
      .text(width - 64, 44, '0', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(1, 0.5);
    this.promptText = this.add
      .text(width / 2, 648, '', { fontFamily: FONT, fontSize: '14px', color: CSS.cyanDim })
      .setOrigin(0.5);
  }

  private buildGrid(): void {
    const size = this.session.width;
    for (let i = 0; i < size * size; i++) {
      const x = this.originX + colOf(i, size) * CELL;
      const y = this.originY + rowOf(i, size) * CELL;
      const bg = this.add.graphics({ x, y });
      bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, CELL, CELL), Phaser.Geom.Rectangle.Contains);
      bg.input!.cursor = 'pointer';
      bg.on('pointerdown', () => {
        this.cursor = i;
        this.redraw();
      });
      const text = this.add
        .text(x + CELL / 2, y + CELL / 2 + 6, '', {
          fontFamily: FONT,
          fontSize: '44px',
          fontStyle: 'bold',
          color: CSS.white,
        })
        .setOrigin(0.5)
        .setDepth(5);
      this.cells.push({ bg, text });
    }
  }

  // --- input ---

  private onKey(event: KeyboardEvent): void {
    if (this.busy || !this.fresh(event)) return;
    const size = this.session.width;
    const moves: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      KeyA: -1,
      ArrowRight: 1,
      KeyD: 1,
      ArrowUp: -size,
      KeyW: -size,
      ArrowDown: size,
      KeyS: size,
    };
    const step = moves[event.code];
    if (step !== undefined) {
      const next = this.cursor + step;
      // Sideways moves must not wrap onto the next row.
      const sameRow = Math.abs(step) === 1 ? rowOf(next, size) === rowOf(this.cursor, size) : true;
      if (next >= 0 && next < size * size && sameRow) this.cursor = next;
      this.redraw();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      this.session.enter(this.cursor, 0);
      getAudio(this)?.play('ui');
      this.redraw();
      return;
    }

    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 1) return;
    if (digit > size) return this.buzz();
    this.place(digit);
  }

  private place(digit: number): void {
    const out = this.session.enter(this.cursor, digit);
    const audio = getAudio(this);
    if (out.kind === 'refused') return;

    if (out.kind === 'solved') {
      audio?.play('explosion');
      impact(this, {
        shakeMs: CONFIG.juice.killShakeMs,
        shakeIntensity: CONFIG.juice.killShakeIntensity,
        glow: CONFIG.juice.glowPulseKill,
      });
      shockwave(this, this.scale.width / 2, this.originY + (this.session.width * CELL) / 2, PALETTE.yellow);
      this.busy = true;
      this.redraw();
      this.time.delayedCall(900, () => {
        this.busy = false;
        this.cursor = 0;
        if (this.session.setComplete) this.finishSet();
        else this.redraw();
      });
      return;
    }

    if (out.kind === 'cage') {
      if (out.correct) audio?.play('prime');
      else {
        audio?.play('error');
        shake(this, 110, 0.005);
      }
    } else {
      audio?.play('ui');
    }
    this.redraw();
  }

  private buzz(): void {
    getAudio(this)?.play('error');
    shake(this, 70, 0.003);
  }

  // --- drawing ---

  private redraw(): void {
    const size = this.session.width;
    const puzzle = this.session.puzzle;
    const state = this.session.check;
    const broken = new Set(state.brokenCages);

    // Which cage each cell belongs to, so borders can be drawn where two
    // different cages meet and nowhere else.
    const cageOf = new Array<number>(size * size).fill(-1);
    puzzle.cages.forEach((cage, i) => {
      for (const cell of cage.cells) cageOf[cell] = i;
    });

    this.cells.forEach((view, i) => {
      const value = this.session.grid[i] ?? 0;
      const id = cageOf[i]!;
      const wrong = broken.has(id);
      view.bg.clear();
      view.bg.fillStyle(wrong ? PALETTE.red : PALETTE.deepPurple, wrong ? 0.3 : 0.4);
      view.bg.fillRect(1, 1, CELL - 2, CELL - 2);
      view.bg.lineStyle(1, PALETTE.purple, 0.7);
      view.bg.strokeRect(1, 1, CELL - 2, CELL - 2);
      view.text.setText(value === 0 ? '' : String(value)).setColor(wrong ? CSS.red : CSS.white);
    });

    // Cage borders: a heavy line wherever a cell's neighbour is in another cage.
    const g = this.cageLines;
    g.clear();
    g.lineStyle(4, PALETTE.cyan, 0.95);
    for (let i = 0; i < size * size; i++) {
      const x = this.originX + colOf(i, size) * CELL;
      const y = this.originY + rowOf(i, size) * CELL;
      const r = rowOf(i, size);
      const c = colOf(i, size);
      if (r === 0 || cageOf[i - size] !== cageOf[i]) g.lineBetween(x, y, x + CELL, y);
      if (r === size - 1 || cageOf[i + size] !== cageOf[i]) {
        g.lineBetween(x, y + CELL, x + CELL, y + CELL);
      }
      if (c === 0 || cageOf[i - 1] !== cageOf[i]) g.lineBetween(x, y, x, y + CELL);
      if (c === size - 1 || cageOf[i + 1] !== cageOf[i]) {
        g.lineBetween(x + CELL, y, x + CELL, y + CELL);
      }
    }

    // The label sits in each cage's top-left cell, the way it is written on paper.
    puzzle.cages.forEach((cage, i) => {
      const head = [...cage.cells].sort((a, b) => a - b)[0]!;
      const x = this.originX + colOf(head, size) * CELL;
      const y = this.originY + rowOf(head, size) * CELL;
      const text = this.label(i);
      // A one-cell cage is simply the digit, so the operator would be noise.
      const shown = cage.cells.length === 1 ? `${cage.target}` : `${cage.target}${OP_SIGN[cage.op]}`;
      text
        .setVisible(true)
        .setPosition(x + 8, y + 5)
        .setText(shown)
        .setColor(broken.has(i) ? CSS.red : CSS.yellow);
    });
    for (let i = puzzle.cages.length; i < this.labels.length; i++) this.labels[i]!.setVisible(false);

    const cx = this.originX + colOf(this.cursor, size) * CELL;
    const cy = this.originY + rowOf(this.cursor, size) * CELL;
    // A tint rather than an outline. Cage borders are heavy boxes, so an
    // outlined cursor reads as one more cage edge — it made a three-cell cage
    // look like a single cell carrying an impossible target.
    this.cursorGfx.clear();
    this.cursorGfx.fillStyle(PALETTE.yellow, 0.22);
    this.cursorGfx.fillRect(cx + 4, cy + 4, CELL - 8, CELL - 8);
    const tick = 14;
    this.cursorGfx.lineStyle(3, PALETTE.yellow, 0.95);
    for (const [ox, oy, dx, dy] of [
      [4, 4, 1, 1],
      [CELL - 4, 4, -1, 1],
      [4, CELL - 4, 1, -1],
      [CELL - 4, CELL - 4, -1, -1],
    ] as const) {
      this.cursorGfx.lineBetween(cx + ox, cy + oy, cx + ox + dx * tick, cy + oy);
      this.cursorGfx.lineBetween(cx + ox, cy + oy, cx + ox, cy + oy + dy * tick);
    }

    this.progressText.setText(
      `PUZZLE ${Math.min(this.session.solved + 1, CONFIG.cages.puzzlesPerSet)} / ${CONFIG.cages.puzzlesPerSet}`,
    );
    this.scoreText.setText(String(this.session.score));
    this.promptText.setText(
      state.brokenLines
        ? 'A DIGIT IS REPEATED IN A ROW OR COLUMN'
        : `EACH ROW AND COLUMN TAKES 1 TO ${size} ONCE  ·  A CAGE MUST MAKE ITS TARGET  ·  H FOR THE RULES`,
    );
  }

  private label(i: number): Phaser.GameObjects.Text {
    while (this.labels.length <= i) {
      this.labels.push(
        this.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: CSS.yellow })
          .setDepth(6),
      );
    }
    return this.labels[i]!;
  }

  // --- leaving ---

  private finishSet(): void {
    const summary = this.session.summary();
    const save = this.saves.save;
    const credits = creditsForRun(
      {
        score: summary.score,
        wavesCleared: summary.solved,
        kills: summary.cleanPuzzles,
        misses: summary.mistakes,
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
        kills: summary.cleanPuzzles,
        misses: summary.mistakes,
        bestStreak: 0,
      },
      credits,
      mode: 'Cages',
      title: summary.mistakes === 0 ? 'NOT ONE WRONG CAGE' : 'SET COMPLETE',
      titleColor: CSS.yellow,
      wavesLabel: 'PUZZLES SOLVED',
      killsLabel: 'SOLVED CLEAN',
      missesLabel: 'WRONG CAGES',
      hideStreak: true,
      leaderboard: false,
      operatorLine:
        summary.mistakes === 0
          ? 'OPERATOR // Every cage right first time. You were reading, not guessing.'
          : 'OPERATOR // Work the small cages first. They pin down the rows the big ones need.',
      milestones: unlocked.map((m) => m.label),
    });
  }

  private leave(): void {
    const save = this.saves.save;
    save.skills = this.session.skillTable;
    this.saves.persist();
    this.scene.start('Menu');
  }
}
