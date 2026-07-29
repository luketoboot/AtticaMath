import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { creditsForRun } from '../../core/economy/economy';
import { cellAt, currentRect, hasRectangle, type Piece } from '../../core/packing/packing';
import { PackingSession } from '../../core/packing/session';
import { newMilestones } from '../../core/skills/milestones';
import { applyCrt } from '../../fx/applyCrt';
import { impact, shake, shockwave } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { neonButton } from '../../ui/panels';
import { onActionKey, sceneBindings } from '../input/KeyState';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/**
 * GNOMON — numbers packed as the rectangles they can make.
 *
 * Rotating does not turn the piece, it refactors it: a 12 comes down as 2 by 6,
 * 3 by 4, 4 by 3 or 6 by 2, and the skill is knowing which pair fits the hole
 * you have. A prime has no proper rectangle, so it can only fall as a bar —
 * which makes primes the awkward piece, and teaches primality by wrecking your
 * board rather than by definition.
 *
 * The cells are the same counters Factor Storm draws on its rocks. Area is
 * conserved everywhere: a piece covers exactly its own value however it is
 * turned, and a cleared row is the board's width decomposed into parts.
 */

const CELL = 38;
const BOARD_X = 470;
const BOARD_Y = 88;

export class PackingScene extends Phaser.Scene {
  private saves!: SaveManager;
  private session!: PackingSession;
  private grid!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private rowsText!: Phaser.GameObjects.Text;
  private nextText!: Phaser.GameObjects.Text;
  private nextGfx!: Phaser.GameObjects.Graphics;
  private shapeText!: Phaser.GameObjects.Text;
  private sinceStep = 0;
  private ended = false;

  constructor() {
    super('Packing');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('game');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.labels = [];
    this.ended = false;
    this.sinceStep = 0;

    this.session = new PackingSession({
      seed: (Math.random() * 0xffffffff) >>> 0,
      skills: this.saves.save.skills,
      totalWavesBefore: this.saves.save.totalWaves,
    });

    this.grid = this.add.graphics();
    this.ghost = this.add.graphics();
    this.nextGfx = this.add.graphics();
    this.buildHud();

    const bindings = sceneBindings(this);
    onActionKey(this, bindings.left, () => this.nudge(-1));
    onActionKey(this, bindings.right, () => this.nudge(1));
    onActionKey(this, bindings.up, () => this.refactor());
    onActionKey(this, bindings.down, () => this.step());
    onActionKey(this, bindings.launch, () => this.slam());
    this.input.keyboard?.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    // One key, same everywhere: the rules over a paused game.
    this.input.keyboard?.on('keydown-H', () => {
      if (this.scene.isActive('Help')) return;
      this.scene.launch('Help', { target: 'Packing' });
      this.scene.pause();
    });
    onActionKey(this, bindings.pause, () => {
      if (this.ended) return;
      this.scene.launch('Pause', { target: 'Packing' });
      this.scene.pause();
    });

    neonButton(this, width - 120, height * 0.94, 'LEAVE', () => this.finish(), {
      width: 160,
      height: 46,
      fontSize: 17,
    });
    // No MenuNav on the quit button here. MenuNav activates on ENTER *or*
    // SPACE, and both of those are load-bearing in this mode — binding them to
    // a button as well means the key that plays the game also leaves it. The
    // button still answers the pointer, and ESC is the keyboard way out.
    this.redraw();
  }

  private buildHud(): void {
    const { width } = this.scale;
    makeIcon(this, width / 2 - 112, 40, 'gnomon', {
      size: 30,
      color: PALETTE.magentaHot,
      dim: PALETTE.cyan,
    });
    this.add
      .text(width / 2 + 6, 40, 'GNOMON', {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: CSS.magentaHot,
      })
      .setOrigin(0.5);

    this.scoreText = this.add
      .text(180, 150, '0', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: CSS.white })
      .setOrigin(0.5, 0);
    this.add
      .text(180, 128, 'SCORE', { fontFamily: FONT, fontSize: '12px', color: CSS.cyanDim })
      .setOrigin(0.5, 0);
    this.rowsText = this.add
      .text(180, 226, '0', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.yellow })
      .setOrigin(0.5, 0);
    this.add
      .text(180, 206, 'ROWS', { fontFamily: FONT, fontSize: '12px', color: CSS.cyanDim })
      .setOrigin(0.5, 0);

    this.add
      .text(180, 300, 'NEXT', { fontFamily: FONT, fontSize: '12px', color: CSS.cyanDim })
      .setOrigin(0.5, 0);
    this.nextText = this.add
      .text(180, 400, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.white })
      .setOrigin(0.5, 0);

    this.shapeText = this.add
      .text(180, 470, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CSS.cyan,
        align: 'center',
        wordWrap: { width: 250 },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0);

    this.add
      .text(this.scale.width / 2, 660, 'A / D MOVE  ·  W REFACTOR  ·  S DROP ONE  ·  SPACE SLAM  ·  H RULES', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
  }

  // --- input ---

  private nudge(by: number): void {
    if (this.ended) return;
    if (this.session.move(by)) getAudio(this)?.play('ui');
    this.redraw();
  }

  /** Rotation is refactoring: same area, different pair of sides. */
  private refactor(): void {
    if (this.ended) return;
    if (this.session.turn()) getAudio(this)?.play('phase');
    else this.buzz();
    this.redraw();
  }

  private step(): void {
    if (this.ended) return;
    this.sinceStep = 0;
    this.land();
  }

  private slam(): void {
    if (this.ended) return;
    this.land();
  }

  private land(): void {
    const out = this.session.drop();
    // A blocked column means move, not game over.
    if (out.kind === 'blocked') return this.buzz();
    const audio = getAudio(this);
    if (out.rowsCleared > 0) {
      audio?.play('explosion');
      shockwave(this, BOARD_X + (CONFIG.packing.width * CELL) / 2, BOARD_Y + 300, PALETTE.yellow);
      impact(this, {
        shakeMs: CONFIG.juice.killShakeMs,
        shakeIntensity: CONFIG.juice.killShakeIntensity,
        glow: CONFIG.juice.glowPulseKill,
      });
    } else {
      audio?.play(out.usedRectangle ? 'prime' : 'ui');
    }
    this.sinceStep = 0;
    this.redraw();
    if (this.session.finished) this.finish();
  }

  private buzz(): void {
    getAudio(this)?.play('error');
    shake(this, 70, 0.003);
  }

  // --- drawing ---

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    this.session.tick(delta / 1000);
    this.sinceStep += delta / 1000;
    // Gravity is a whole piece at a time: the board is a packing problem, not
    // a reflex test, and sliding a rectangle down cell by cell would only add
    // waiting to a decision that has already been made.
    if (this.sinceStep >= this.session.fallSeconds * CONFIG.packing.height * 0.35) {
      this.sinceStep = 0;
      this.land();
    }
  }

  private redraw(): void {
    const { width, height } = CONFIG.packing;
    const g = this.grid;
    g.clear();

    // The well.
    g.lineStyle(2, PALETTE.cyanDim, 0.5);
    g.strokeRect(BOARD_X - 3, BOARD_Y - 3, width * CELL + 6, height * CELL + 6);
    g.lineStyle(1, PALETTE.deepPurple, 0.6);
    for (let c = 0; c <= width; c++) {
      g.lineBetween(BOARD_X + c * CELL, BOARD_Y, BOARD_X + c * CELL, BOARD_Y + height * CELL);
    }
    for (let r = 0; r <= height; r++) {
      g.lineBetween(BOARD_X, BOARD_Y + r * CELL, BOARD_X + width * CELL, BOARD_Y + r * CELL);
    }

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const value = cellAt(this.session.board, c, r);
        if (value === null) continue;
        this.cell(g, BOARD_X + c * CELL, BOARD_Y + r * CELL, PALETTE.cyan, 0.42);
      }
    }

    this.drawLive();
    this.drawNext();

    this.scoreText.setText(String(this.session.score));
    this.rowsText.setText(String(this.session.rowsCleared));
    const rect = this.session.rect;
    const piece = this.session.piece;
    this.shapeText.setText(
      hasRectangle(piece.shapes)
        ? `${piece.value}  =  ${rect.cols} × ${rect.rows}\n${piece.shapes.length} WAYS TO LAY IT`
        : `${piece.value} IS PRIME\nNO RECTANGLE — IT CAN ONLY BE A BAR`,
    );
    this.shapeText.setColor(hasRectangle(piece.shapes) ? CSS.cyan : CSS.magentaHot);
  }

  /** The live piece, plus the shadow of where it will land. */
  private drawLive(): void {
    const g = this.ghost;
    g.clear();
    const rect = this.session.rect;
    const col = this.session.col;
    const row = this.session.landingRow;
    if (row === undefined) return;

    for (let r = 0; r < rect.rows; r++) {
      for (let c = 0; c < rect.cols; c++) {
        this.cell(
          g,
          BOARD_X + (col + c) * CELL,
          BOARD_Y + (row + r) * CELL,
          hasRectangle(this.session.piece.shapes) ? PALETTE.yellow : PALETTE.magentaHot,
          0.85,
        );
      }
    }

    // The value, written across the block it covers.
    this.label(0)
      .setVisible(true)
      .setPosition(
        BOARD_X + (col + rect.cols / 2) * CELL,
        BOARD_Y + (row + rect.rows / 2) * CELL,
      )
      .setText(String(this.session.piece.value))
      .setFontSize(Math.min(34, CELL * Math.min(rect.cols, rect.rows) * 0.7));
  }

  private drawNext(): void {
    const g = this.nextGfx;
    g.clear();
    const piece: Piece = this.session.upcoming;
    const rect = currentRect(piece);
    const size = 20;
    const originX = 180 - (rect.cols * size) / 2;
    const originY = 336;
    for (let r = 0; r < rect.rows; r++) {
      for (let c = 0; c < rect.cols; c++) {
        this.cell(g, originX + c * size, originY + r * size, PALETTE.purple, 0.6, size);
      }
    }
    this.nextText.setText(`${piece.value}`);
  }

  private cell(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    colour: number,
    alpha: number,
    size = CELL,
  ): void {
    const pad = size * 0.1;
    g.fillStyle(colour, alpha * 0.45);
    g.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
    g.lineStyle(2, colour, alpha);
    g.strokeRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
  }

  private label(i: number): Phaser.GameObjects.Text {
    while (this.labels.length <= i) {
      this.labels.push(
        this.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontSize: '30px',
            fontStyle: 'bold',
            color: CSS.black,
            stroke: CSS.white,
            strokeThickness: 4,
          })
          .setOrigin(0.5),
      );
    }
    return this.labels[i]!;
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
        wavesCleared: summary.rowsCleared,
        kills: summary.rectangles,
        misses: summary.bars,
        bestStreak: 0,
      },
      CONFIG.economy,
    );
    save.skills = this.session.skillTable;
    save.credits += credits;
    save.totalWaves += summary.rowsCleared;
    const unlocked = newMilestones(this.session.skillTable, save.milestones, CONFIG);
    save.milestones.push(...unlocked.map((m) => m.id));
    this.saves.persist();

    this.scene.start('Debrief', {
      stats: {
        score: summary.score,
        wavesCleared: summary.rowsCleared,
        kills: summary.rectangles,
        misses: summary.bars,
        bestStreak: 0,
      },
      credits,
      mode: 'Packing',
      title: summary.rowsCleared > 0 ? 'THE WELL IS FULL' : 'BLOCKED',
      titleColor: summary.rowsCleared > 0 ? CSS.yellow : CSS.red,
      wavesLabel: 'ROWS CLEARED',
      killsLabel: 'LAID AS RECTANGLES',
      missesLabel: 'LAID AS BARS',
      hideStreak: true,
      leaderboard: false,
      operatorLine:
        summary.rectangles > summary.bars
          ? 'OPERATOR // You packed by factor, not by luck. That is the whole trick.'
          : 'OPERATOR // Too many bars. Turn the piece — every number has more than one shape unless it is prime.',
      milestones: unlocked.map((m) => m.label),
    });
  }
}
