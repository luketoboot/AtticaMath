import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  BOARD_SIZE,
  LEADERBOARD_MODES,
  MODE_LABEL,
  ordinal,
  type LeaderboardMode,
  type ScoreEntry,
} from '../../core/leaderboard/leaderboard';
import type { LeaderboardStore } from '../../core/leaderboard/store';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { LEADERBOARD_REGISTRY_KEY } from '../leaderboardStore';

interface LeaderboardData {
  /** Board to open on, and a row to call out as the run just played. */
  mode?: LeaderboardMode;
  highlightAt?: number;
}

/** Read-only view of the high score boards, one mode at a time. */
export class LeaderboardScene extends Phaser.Scene {
  private store!: LeaderboardStore;
  private mode: LeaderboardMode = 'meteor';
  private highlightAt: number | undefined;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private tabTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Leaderboard');
  }

  create(data: LeaderboardData): void {
    const { width, height } = this.scale;
    this.store = this.registry.get(LEADERBOARD_REGISTRY_KEY) as LeaderboardStore;
    this.mode = data.mode ?? 'meteor';
    this.highlightAt = data.highlightAt;
    this.rows = [];
    this.tabTexts = [];

    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);

    this.add
      .text(width / 2, 46, 'HALL OF FAME', {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    // Mode tabs: left/right walks them, which is what the cursor row does.
    LEADERBOARD_MODES.forEach((mode, i) => {
      // Kept clear of the glass edge, where the tube darkening would grey them out.
      const x = width * (0.2 + i * 0.2);
      const text = this.add
        .text(x, 104, MODE_LABEL[mode], {
          fontFamily: FONT,
          fontSize: '16px',
          fontStyle: 'bold',
          color: CSS.cyan,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.showMode(mode));
      this.tabTexts.push(text);
    });

    this.titleText = this.add
      .text(width / 2, 142, '', { fontFamily: FONT, fontSize: '15px', color: CSS.cyanDim })
      .setOrigin(0.5);

    const back = this.add
      .text(width / 2, height - 58, '[ BACK ]', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(CSS.magentaHot));
    back.on('pointerout', () => back.setColor(CSS.cyan));
    const goBack = (): void => {
      getAudio(this)?.play('ui');
      this.scene.start('Menu');
    };
    back.on('pointerdown', goBack);
    this.input.keyboard?.once('keydown-ESC', goBack);

    const nav = new MenuNav(this, [
      this.tabTexts.map((text, i) => ({
        target: text,
        // Landing on a tab shows it: pressing ENTER to see what the cursor is
        // already sitting on would be a step for nothing.
        onFocus: () => void this.showMode(LEADERBOARD_MODES[i]!),
        onSelect: () => void this.showMode(LEADERBOARD_MODES[i]!),
      })),
      [{ target: back, onSelect: goBack }],
    ]);
    nav.setColumn(0, LEADERBOARD_MODES.indexOf(this.mode));
    navHint(this, height - 18);

    void this.showMode(this.mode);
  }

  private async showMode(mode: LeaderboardMode): Promise<void> {
    this.mode = mode;
    for (const row of this.rows) row.destroy();
    this.rows = [];

    this.tabTexts.forEach((text, i) => {
      text.setColor(LEADERBOARD_MODES[i] === mode ? CSS.yellow : CSS.cyan);
    });
    this.titleText.setText('LOADING...');

    // The board may be remote one day, so this is written as a real await and
    // a failure is an empty board rather than a broken screen.
    let board: ScoreEntry[] = [];
    try {
      board = await this.store.load(mode);
    } catch {
      this.titleText.setText('BOARD UNAVAILABLE');
      return;
    }
    // The player may have switched tabs while that was in flight.
    if (this.mode !== mode || !this.scene.isActive()) return;

    this.titleText.setText(board.length > 0 ? `TOP ${BOARD_SIZE}` : 'NO SCORES YET — GO SET ONE');
    this.renderBoard(board);
  }

  private renderBoard(board: readonly ScoreEntry[]): void {
    const { width } = this.scale;
    board.forEach((entry, i) => {
      const y = 190 + i * 44;
      const mine = this.highlightAt !== undefined && entry.at === this.highlightAt;
      const color = mine ? CSS.yellow : i === 0 ? CSS.white : CSS.cyan;

      if (mine) {
        this.rows.push(
          this.add.rectangle(width / 2, y + 10, width * 0.62, 38, PALETTE.deepPurple, 0.85),
        );
      }
      this.rows.push(
        this.add.text(width * 0.28, y, ordinal(i + 1), {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: CSS.cyanDim,
        }),
        this.add.text(width * 0.4, y, entry.initials, {
          fontFamily: FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color,
        }),
        this.add
          .text(width * 0.62, y, String(entry.score), {
            fontFamily: FONT,
            fontSize: '26px',
            fontStyle: 'bold',
            color,
          })
          .setOrigin(1, 0),
        this.add.text(width * 0.66, y + 4, `WAVE ${entry.wave}`, {
          fontFamily: FONT,
          fontSize: '16px',
          color: CSS.cyanDim,
        }),
      );
    });
  }
}
