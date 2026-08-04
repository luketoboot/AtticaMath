import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { badgeFor, DEFAULT_BADGE } from '../../core/cosmetics/cosmetics';
import {
  dailyAvailable,
  dailyDateKey,
  dailyNeedsUpload,
  displayDate,
  formatCountdown,
  msUntilNextDaily,
} from '../../core/daily/daily';
import { ordinal, type ScoreEntry } from '../../core/leaderboard/leaderboard';
import {
  DAILY_REGISTRY_KEY,
  type DailyLeaderboardStore,
} from '../../core/leaderboard/dailyStore';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { paintBadge } from '../../ui/badges';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton, paintPanel } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** Registry flag read by GameScene: this launch is the daily, not a free run. */
export const DAILY_RUN_KEY = 'dailyRun';

/**
 * The daily challenge lobby: what today's run is, whether you still have it,
 * and who else has already played it.
 */
export class DailyScene extends Phaser.Scene {
  private store!: DailyLeaderboardStore;
  private saves!: SaveManager;
  private dateKey = '';
  private rows: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;

  constructor() {
    super('Daily');
  }

  create(): void {
    const { width, height } = this.scale;
    this.store = this.registry.get(DAILY_REGISTRY_KEY) as DailyLeaderboardStore;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    this.dateKey = dailyDateKey(Date.now());
    this.rows = [];

    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.95 });

    makeIcon(this, width / 2 - 210, 50, 'meteor', {
      size: 46,
      color: PALETTE.yellow,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 22, 46, 'DAILY CHALLENGE', {
        fontFamily: FONT,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 88, displayDate(this.dateKey), {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);
    // The pitch for the mode in one line: it is the sameness that is the point.
    this.add
      .text(width / 2, 114, 'ONE RUN · THE SAME ROCKS FOR EVERYONE · RESETS AT 00:00 UTC', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(width / 2, 146, '', {
        fontFamily: FONT,
        fontSize: '16px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);

    const record = this.saves.save.daily;
    const available = dailyAvailable(record, this.dateKey);

    const launch = neonButton(
      this,
      width / 2,
      height - 158,
      available ? 'LAUNCH' : 'SPENT',
      () => this.launch(available),
      {
        width: 300,
        height: 54,
        fontSize: 26,
        accent: available ? PALETTE.yellow : PALETTE.deepPurple,
      },
    );
    if (!available) launch.container.setAlpha(0.45);

    this.countdownText = this.add
      .text(width / 2, height - 114, '', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
    this.refreshCountdown(record !== undefined && !available ? record.score : undefined);
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () =>
        this.refreshCountdown(record !== undefined && !available ? record.score : undefined),
    });

    const goBack = (): void => {
      goTo(this, 'Menu');
    };
    const back = neonButton(this, width / 2, height - 74, 'BACK', goBack, {
      width: 200,
      height: 42,
      fontSize: 18,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goBack();
    });

    new MenuNav(this, [[launch], [back]]);
    navHint(this, height - 18);

    void this.showBoard();
    // A score that never made it up — the run is still spent, but the result
    // is not lost. Retried quietly on every visit until it lands.
    //
    // Only against a shared board. A local store has nothing to reach and
    // never reports success, so retrying it would re-insert the same score on
    // every visit to this screen and stack the board with copies of one run.
    if (this.store.shared && dailyNeedsUpload(record, this.dateKey)) void this.retryUpload();
  }

  private refreshCountdown(spentScore: number | undefined): void {
    // No isActive() guard: a scene is not yet "active" during create(), so one
    // here would silently skip the first paint and leave the line blank until
    // the timer's first tick a second later. The timer dies with the scene, so
    // there is nothing to guard against anyway.
    const left = formatCountdown(msUntilNextDaily(Date.now()));
    this.countdownText.setText(
      spentScore === undefined
        ? `NEXT RUN IN ${left}`
        : `TODAY'S RUN SCORED ${spentScore} · NEXT RUN IN ${left}`,
    );
  }

  private launch(available: boolean): void {
    if (!available) {
      // Never a silent refusal: the button is dimmed, and pressing it says why.
      getAudio(this)?.play('error');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    getAudio(this)?.play('ui');
    this.registry.set(DAILY_RUN_KEY, true);
    goTo(this, 'Game');
  }

  private async retryUpload(): Promise<void> {
    const record = this.saves.save.daily;
    if (record === undefined) return;
    const result = await this.store.submit(
      record.date,
      {
        initials: await this.lastInitials(),
        score: record.score,
        wave: record.wave,
        at: Date.now(),
        ...(this.equippedBadge() !== undefined ? { badge: this.equippedBadge()! } : {}),
      },
      CONFIG.daily.boardSize,
    );
    if (!result.submitted || !this.scene.isActive()) return;
    this.saves.save.daily = { ...record, submitted: true };
    this.saves.persist();
    this.renderBoard(result.board);
  }

  private equippedBadge(): string | undefined {
    const badge = this.saves.save.equipped.badge;
    return badge === DEFAULT_BADGE ? undefined : badge;
  }

  private async lastInitials(): Promise<string> {
    // Reuses whatever the arcade boards remember, so a retried upload carries
    // the same name the player already typed rather than inventing one.
    const store = this.registry.get('leaderboardStore') as
      | { lastInitials(): Promise<string> }
      | undefined;
    return (await store?.lastInitials()) ?? 'AAA';
  }

  private async showBoard(): Promise<void> {
    this.statusText.setText('LOADING BOARD...');
    const board = await this.store.load(this.dateKey, CONFIG.daily.boardSize);
    if (!this.scene.isActive()) return;
    const where = this.store.shared ? 'GLOBAL' : 'THIS DEVICE ONLY — NO SERVER CONFIGURED';
    this.statusText.setText(
      board.length > 0 ? `TODAY'S BOARD · ${where}` : `NO SCORES YET · ${where}`,
    );
    this.renderBoard(board);
  }

  private renderBoard(board: readonly ScoreEntry[]): void {
    const { width } = this.scale;
    for (const row of this.rows) row.destroy();
    this.rows = [];

    const rowW = width * 0.62;
    // Tighter than the hall of fame's ladder: this screen carries a launch
    // button and a countdown under the board, which that one does not.
    const top = 168;
    const size = CONFIG.daily.boardSize;
    const medal = [PALETTE.yellow, PALETTE.cyan, PALETTE.magentaHot];

    for (let i = 0; i < size; i++) {
      const y = top + i * 37;
      const entry = board[i];
      const accent = entry === undefined ? PALETTE.deepPurple : (medal[i] ?? PALETTE.cyanDim);

      const strip = this.add.graphics({ x: width / 2, y: y + 11 });
      paintPanel(strip, {
        width: rowW,
        height: 34,
        accent,
        chamfer: 8,
        fillAlpha: entry === undefined ? 0.16 : i < 3 ? 0.5 : 0.28,
        borderWidth: entry !== undefined && i < 3 ? 2 : 1,
        headerRule: false,
      });
      this.rows.push(strip);

      const left = width / 2 - rowW / 2;
      this.rows.push(
        this.add
          .text(left + 46, y + 11, ordinal(i + 1), {
            fontFamily: FONT,
            fontSize: '18px',
            fontStyle: 'bold',
            color: `#${accent.toString(16).padStart(6, '0')}`,
          })
          .setOrigin(0.5)
          .setAlpha(entry === undefined ? 0.7 : 1),
      );

      if (entry === undefined) {
        // An unclaimed rung, drawn rather than omitted — the same rule the
        // hall of fame follows: a board is a ladder, not a short list.
        this.rows.push(
          this.add
            .text(left + 122, y + 11, '- - -', {
              fontFamily: FONT,
              fontSize: '23px',
              fontStyle: 'bold',
              color: CSS.purple,
            })
            .setOrigin(0, 0.5)
            .setAlpha(0.6),
        );
        continue;
      }

      const g = this.add.graphics({ x: left + 96, y: y + 11 });
      if (entry.badge !== undefined && entry.badge !== DEFAULT_BADGE) {
        const def = badgeFor(entry.badge);
        paintBadge(g, def.shape, def.color, 20);
      }
      this.rows.push(
        g,
        this.add
          .text(left + 122, y + 11, entry.initials, {
            fontFamily: FONT,
            fontSize: '23px',
            fontStyle: 'bold',
            color: i < 3 ? CSS.white : CSS.cyan,
          })
          .setOrigin(0, 0.5),
        this.add
          .text(left + rowW - 108, y + 11, String(entry.score), {
            fontFamily: FONT,
            fontSize: '23px',
            fontStyle: 'bold',
            color: i < 3 ? CSS.white : CSS.cyan,
          })
          .setOrigin(1, 0.5),
        this.add
          .text(left + rowW - 90, y + 11, `WAVE ${entry.wave}`, {
            fontFamily: FONT,
            fontSize: '13px',
            color: CSS.cyanDim,
          })
          .setOrigin(0, 0.5),
      );
    }
  }
}
