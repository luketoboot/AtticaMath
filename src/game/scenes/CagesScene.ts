import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { cageEdges, cageHead, cageLabel, colOf, rowOf, shadeCages } from '../../core/cages/cages';
import { CageSession } from '../../core/cages/session';
import { CONFIG } from '../../core/config';
import { creditsForCages } from '../../core/economy/economy';
import { formatClock } from '../../core/leaderboard/leaderboard';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { goTo, impact, shake, shockwave } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { neonButton } from '../../ui/panels';
import { keyEventGate } from '../input/freshKey';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/**
 * CAGES — a grid you can only fill by computing, against a clock.
 *
 * Every row and column holds each digit once, and the grid is carved into
 * regions carrying a target: "these three multiply to 24". Nothing is offered
 * as a choice, so there is nothing to pick by eye — to place one digit you have
 * to find which factorisations fit the cage and which of those survive the
 * digits already committed in that row.
 *
 * A run is one grid and the result is the time on it. The clock is the whole
 * reason to come back: the puzzle stops being "can I do this" after a few runs
 * and becomes "can I do it faster than last time", which is a question the mode
 * can keep asking forever.
 *
 * Reading is free. The clock is the session's and only advances from `update`,
 * so opening the rules or the worked example — both of which pause this scene —
 * stops it. A mode that charged for looking something up would teach players
 * not to look things up.
 */

const CELL = 92;

/**
 * Fill strengths for the cage tones, deepest first.
 *
 * Four, because cage adjacency on a grid is planar and four is always enough —
 * and kept close together on purpose. The tones are there to group cells, not
 * to be noticed: a board of four obviously different colours would read as a
 * decoration fighting the digits, which are the only thing here worth looking
 * at. Spread far enough apart to see, near enough not to look at.
 */
export const CAGE_SHADES: readonly number[] = [0.18, 0.48, 0.78, 1];

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
  private clockText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private busy = false;
  /** Timestamp of the last frame the clock was charged for. See `update`. */
  private lastAt: number | undefined;
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
    this.lastAt = undefined;
    // Coming back from the rules or the worked example resumes the scene, and
    // the clock has to pick up where it stopped rather than swallow the gap.
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.lastAt = undefined;
    });

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
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      this.leave();
    });
    // One key, same everywhere: the rules over a paused game.
    this.input.keyboard?.on('keydown-H', () => {
      if (this.scene.isActive('Help')) return;
      this.scene.launch('Help', { target: 'Cages' });
      this.scene.pause();
    });
    this.input.keyboard?.on('keydown-E', () => this.walkThrough());

    this.redraw();

    // The rules of this mode are two sentences and knowing them is still not
    // enough to make a move, so the worked example is not something a new
    // player has to go looking for. Once, then never again unless asked.
    if (!this.saves.save.taught.includes('Cages')) {
      this.saves.save.taught.push('Cages');
      this.saves.persist();
      this.walkThrough();
    }
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
    // The clock is the score here, so it is where the score used to be and it
    // is the biggest number on the screen after the digits themselves.
    this.clockText = this.add
      .text(width - 64, 44, formatClock(0), {
        fontFamily: FONT,
        fontSize: '26px',
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

  /**
   * The clock, off the wall rather than off the frame counter.
   *
   * Phaser's `delta` is smoothed and capped, so a machine rendering at fifteen
   * frames a second advances it at a quarter speed — which on a board that
   * ranks by time would hand out records for having a worse computer. The
   * timestamp is real, so the difference between two of them is real.
   *
   * `lastAt` going undefined is how a pause is handled: nothing is charged for
   * the frame the scene comes back on, so the time spent reading the rules or
   * the worked example never lands on the clock.
   */
  update(time: number): void {
    if (this.lastAt !== undefined) this.session.tick((time - this.lastAt) / 1000);
    this.lastAt = time;
    this.clockText.setText(formatClock(this.session.elapsedMs));
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
      // The clear sting rides just behind the blast — solving the grid is this
      // mode's wave clear, and it was the one run end with no voice at all.
      this.time.delayedCall(220, () => audio?.play('waveClear'));
      impact(this, {
        shakeMs: CONFIG.juice.killShakeMs,
        shakeIntensity: CONFIG.juice.killShakeIntensity,
        glow: CONFIG.juice.glowPulseKill,
      });
      shockwave(this, this.scale.width / 2, this.originY + (this.session.width * CELL) / 2, PALETTE.yellow);
      this.busy = true;
      this.redraw();
      // A beat to see the solved grid before the debrief takes it away. The
      // clock stopped inside the session on the digit that finished it, so this
      // pause costs the player nothing.
      this.time.delayedCall(1100, () => this.finishRun());
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

  /** The example, over the paused board, so a player comes back to their own grid. */
  private walkThrough(): void {
    if (this.scene.isActive('CagesLearn') || this.scene.isActive('Help')) return;
    this.scene.launch('CagesLearn', { target: 'Cages' });
    this.scene.pause();
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

    // Each cage gets a tone, and no two touching cages get the same one, so a
    // region reads as one block of colour before any outline is traced.
    const shades = shadeCages(size, puzzle.cages);

    this.cells.forEach((view, i) => {
      const value = this.session.grid[i] ?? 0;
      const id = cageOf[i]!;
      const wrong = broken.has(id);
      view.bg.clear();
      view.bg.fillStyle(wrong ? PALETTE.red : PALETTE.deepPurple, wrong ? 0.3 : CAGE_SHADES[shades[id]! % CAGE_SHADES.length]!);
      view.bg.fillRect(1, 1, CELL - 2, CELL - 2);
      // Faint, and fainter than it was. The cell divider only has to say that
      // two digits are separate; the cage boundary has to be seen across the
      // board, and the two lines were competing at nearly the same weight.
      view.bg.lineStyle(1, PALETTE.purple, 0.28);
      view.bg.strokeRect(1, 1, CELL - 2, CELL - 2);
      view.text.setText(value === 0 ? '' : String(value)).setColor(wrong ? CSS.red : CSS.white);
    });

    // Cage borders: a heavy line wherever a cell's neighbour is in another cage,
    // drawn twice — a wide dim pass under a bright narrow one. The CRT bloom
    // then has something to catch, and the outline reads as lit rather than
    // merely thick.
    const g = this.cageLines;
    g.clear();
    const edges = cageEdges(size, puzzle.cages);
    for (const [thickness, alpha] of [
      [10, 0.16],
      [5, 1],
    ] as const) {
      g.lineStyle(thickness, PALETTE.cyan, alpha);
      for (const edge of edges) {
        const x = this.originX + colOf(edge.cell, size) * CELL;
        const y = this.originY + rowOf(edge.cell, size) * CELL;
        g.lineBetween(x + edge.x1 * CELL, y + edge.y1 * CELL, x + edge.x2 * CELL, y + edge.y2 * CELL);
      }
    }

    // The label sits in each cage's top-left cell, the way it is written on paper.
    puzzle.cages.forEach((cage, i) => {
      const head = cageHead(cage);
      const x = this.originX + colOf(head, size) * CELL;
      const y = this.originY + rowOf(head, size) * CELL;
      const text = this.label(i);
      text
        .setVisible(true)
        .setPosition(x + 8, y + 5)
        .setText(cageLabel(cage))
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

    const wrong = this.session.mistakes;
    this.progressText.setText(wrong === 0 ? 'CLEAN' : `${wrong} WRONG CAGE${wrong === 1 ? '' : 'S'}`);
    this.progressText.setColor(wrong === 0 ? CSS.cyanDim : CSS.red);
    this.clockText.setText(formatClock(this.session.elapsedMs));
    this.promptText.setText(
      state.brokenLines
        ? 'A DIGIT IS REPEATED IN A ROW OR COLUMN'
        : `EACH ROW AND COLUMN TAKES 1 TO ${size} ONCE  ·  A CAGE MUST MAKE ITS TARGET  ·  H RULES  ·  E EXAMPLE`,
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

  private finishRun(): void {
    const summary = this.session.summary();
    const save = this.saves.save;
    const credits = creditsForCages(summary.timeMs, summary.mistakes, CONFIG.cages);
    save.skills = this.session.skillTable;
    save.credits += credits;
    const unlocked = newMilestones(this.session.skillTable, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    goTo(this, 'Debrief', {
      // The board ranks on time, so the time *is* the score — see MODE_RANKING.
      // `wave` carries the mistakes, which is the second number this mode has.
      stats: {
        score: Math.round(summary.timeMs),
        wavesCleared: summary.mistakes,
        kills: 0,
        misses: summary.mistakes,
        bestStreak: 0,
      },
      credits,
      mode: 'Cages',
      title: summary.clean ? 'SOLVED CLEAN' : 'SOLVED',
      titleColor: CSS.yellow,
      statRows: [
        ['TIME', formatClock(summary.timeMs)],
        ['GRID', `${summary.size} x ${summary.size}`],
        ['WRONG CAGES', String(summary.mistakes)],
      ],
      operatorLine: summary.clean
        ? 'OPERATOR // Every cage right first time. You were reading, not guessing.'
        : 'OPERATOR // Work the cage with the fewest ways to be filled. It pins down the rows the others need.',
      milestones: unlocked.map((m) => m.label),
    });
  }

  private leave(): void {
    const save = this.saves.save;
    save.skills = this.session.skillTable;
    this.saves.persist();
    goTo(this, 'Menu');
  }
}
