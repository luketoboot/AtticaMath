import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  BOARD_SIZE,
  LEADERBOARD_MODES,
  MODE_LABEL,
  MODE_TAB_LABEL,
  ordinal,
  type LeaderboardMode,
  type ScoreEntry,
} from '../../core/leaderboard/leaderboard';
import { badgeFor, DEFAULT_BADGE } from '../../core/cosmetics/cosmetics';
import type { LeaderboardStore } from '../../core/leaderboard/store';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { paintBadge } from '../../ui/badges';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton, neonChip, paintPanel, type NeonChip } from '../../ui/panels';
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
  private tabs: NeonChip[] = [];

  constructor() {
    super('Leaderboard');
  }

  create(data: LeaderboardData): void {
    const { width, height } = this.scale;
    this.store = this.registry.get(LEADERBOARD_REGISTRY_KEY) as LeaderboardStore;
    this.mode = data.mode ?? 'meteor';
    this.highlightAt = data.highlightAt;
    this.rows = [];
    this.tabs = [];

    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.95 });

    makeIcon(this, width / 2 - 190, 50, 'leaderboard', {
      size: 46,
      color: PALETTE.yellow,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 22, 48, 'HALL OF FAME', {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    // Mode tabs: left/right walks them, which is what the cursor row does.
    // Positions derive from the count so adding a mode re-spaces the row
    // instead of pushing the last tab off the glass. The 0.84 inset keeps the
    // outer two clear of the edge, where the tube darkening would grey them out.
    const span = width * 0.84;
    LEADERBOARD_MODES.forEach((mode, i) => {
      const label = MODE_TAB_LABEL[mode];
      const x = width / 2 + span * ((i + 0.5) / LEADERBOARD_MODES.length - 0.5);
      this.tabs.push(
        neonChip(this, x, 110, label, () => void this.showMode(mode), {
          size: 40,
          width: label.length * 11 + 26,
          fontSize: 15,
        }),
      );
    });

    this.titleText = this.add
      .text(width / 2, 142, '', { fontFamily: FONT, fontSize: '15px', color: CSS.cyanDim })
      .setOrigin(0.5);

    const goBack = (): void => {
      this.scene.start('Menu');
    };
    const back = neonButton(this, width / 2, height - 58, 'BACK', goBack, {
      width: 200,
      height: 46,
      fontSize: 20,
    });
    this.input.keyboard?.once('keydown-ESC', goBack);

    const nav = new MenuNav(this, [
      this.tabs.map((tab, i) => ({
        ...tab,
        // Landing on a tab shows it: pressing ENTER to see what the cursor is
        // already sitting on would be a step for nothing.
        onFocus: () => void this.showMode(LEADERBOARD_MODES[i]!),
      })),
      [back],
    ]);
    nav.setColumn(0, LEADERBOARD_MODES.indexOf(this.mode));
    navHint(this, height - 18);

    void this.showMode(this.mode);
  }

  private async showMode(mode: LeaderboardMode): Promise<void> {
    this.mode = mode;
    for (const row of this.rows) row.destroy();
    this.rows = [];

    this.tabs.forEach((tab, i) => tab.setChosen(LEADERBOARD_MODES[i] === mode));
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

    // The tab is abbreviated, so the full mode name lands here.
    this.titleText.setText(
      board.length > 0
        ? `${MODE_LABEL[mode]} — TOP ${BOARD_SIZE}`
        : `${MODE_LABEL[mode]} — NO SCORES YET, GO SET ONE`,
    );
    this.renderBoard(board);
  }

  /** Podium colours for the top three, so a board reads at a glance. */
  private static readonly MEDAL: readonly number[] = [
    PALETTE.yellow,
    PALETTE.cyan,
    PALETTE.magentaHot,
  ];

  /**
   * The emblem worn when the score was set. Entries from before badges — and
   * anyone wearing the default — get an empty Graphics rather than a special
   * case, so every row is built the same way.
   */
  private badgeMark(x: number, y: number, id: string | undefined): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y });
    if (id !== undefined && id !== DEFAULT_BADGE) {
      const def = badgeFor(id);
      paintBadge(g, def.shape, def.color, 20);
    }
    return g;
  }

  private renderBoard(board: readonly ScoreEntry[]): void {
    const { width } = this.scale;
    const rowW = width * 0.62;
    board.forEach((entry, i) => {
      const y = 192 + i * 42;
      const mine = this.highlightAt !== undefined && entry.at === this.highlightAt;
      const accent = LeaderboardScene.MEDAL[i] ?? PALETTE.cyanDim;
      const color = mine ? CSS.yellow : i < 3 ? CSS.white : CSS.cyan;

      // Every row gets a strip, not just the player's — an unbroken ladder is
      // what makes a board look like a board rather than a list.
      const strip = this.add.graphics({ x: width / 2, y: y + 11 });
      paintPanel(strip, {
        width: rowW,
        height: 36,
        accent: mine ? PALETTE.yellow : accent,
        chamfer: 8,
        fillAlpha: mine ? 0.85 : i < 3 ? 0.5 : 0.28,
        borderWidth: mine ? 2 : i < 3 ? 2 : 1,
        headerRule: false,
      });
      this.rows.push(strip);

      const left = width / 2 - rowW / 2;
      this.rows.push(
        this.add
          .text(left + 46, y + 11, ordinal(i + 1), {
            fontFamily: FONT,
            fontSize: '19px',
            fontStyle: 'bold',
            color: `#${accent.toString(16).padStart(6, '0')}`,
          })
          .setOrigin(0.5),
        this.badgeMark(left + 96, y + 11, entry.badge),
        this.add
          .text(left + 122, y + 11, entry.initials, {
            fontFamily: FONT,
            fontSize: '25px',
            fontStyle: 'bold',
            color,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(left + rowW - 108, y + 11, String(entry.score), {
            fontFamily: FONT,
            fontSize: '25px',
            fontStyle: 'bold',
            color,
          })
          .setOrigin(1, 0.5),
        this.add
          .text(left + rowW - 90, y + 11, `WAVE ${entry.wave}`, {
            fontFamily: FONT,
            fontSize: '14px',
            color: CSS.cyanDim,
          })
          .setOrigin(0, 0.5),
      );
    });
  }
}
