import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import type { RunStats } from '../../core/economy/economy';
import {
  DEFAULT_INITIALS,
  insertScore,
  modeFromSceneKey,
  ordinal,
  qualifies,
  type LeaderboardMode,
} from '../../core/leaderboard/leaderboard';
import type { LeaderboardStore } from '../../core/leaderboard/store';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { InitialsEntry } from '../../ui/InitialsEntry';
import { MenuNav, type MenuItem } from '../../ui/MenuNav';
import { LEADERBOARD_REGISTRY_KEY } from '../leaderboardStore';

interface DebriefData {
  stats: RunStats;
  credits: number;
  /** Scene key to relaunch into; defaults to meteor defense. */
  mode?: string;
  /** Newly earned mastery labels to surface as unlocks. */
  milestones?: string[];
}

export class DebriefScene extends Phaser.Scene {
  constructor() {
    super('Debrief');
  }

  create(data: DebriefData): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);

    this.add
      .text(width / 2, height * 0.18, 'BASE DESTROYED', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: CSS.red,
      })
      .setOrigin(0.5);

    const s = data.stats;
    const rows = [
      ['SCORE', String(s.score)],
      ['WAVES CLEARED', String(s.wavesCleared)],
      ['KILLS', String(s.kills)],
      ['BEST STREAK', `x${s.bestStreak}`],
      ['CREDITS EARNED', `+${data.credits}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = height * 0.3 + i * 36;
      this.add.text(width * 0.32, y, label!, { fontFamily: FONT, fontSize: '22px', color: CSS.cyanDim });
      this.add
        .text(width * 0.68, y, value!, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: i === rows.length - 1 ? CSS.yellow : CSS.white,
        })
        .setOrigin(1, 0);
    });

    const unlocked = data.milestones ?? [];
    unlocked.slice(0, 3).forEach((label, i) => {
      const y = height * 0.3 + rows.length * 36 + 14 + i * 30;
      const text = this.add
        .text(width / 2, y, `UNLOCKED // ${label}`, {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: 'bold',
          color: CSS.yellow,
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({ targets: text, alpha: 1, duration: 300, delay: 400 + i * 250 });
    });

    const quote =
      unlocked.length > 0
        ? 'OPERATOR // New hardware in the brain. Logged. Go break it in.'
        : 'OPERATOR // Debrief logged. The rocks don’t care. Neither do I. Go again.';
    this.add
      .text(width / 2, height * 0.66, quote, {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.magentaHot,
        wordWrap: { width: width * 0.7 },
        align: 'center',
      })
      .setOrigin(0.5);

    // A qualifying score gets the initials prompt first; the buttons appear
    // once it is answered, so ENTER cannot relaunch out from under the entry.
    void this.offerHighScore(data);
  }

  /**
   * Ask the board whether this run made it, and if so take three initials.
   *
   * The board may be remote one day, so a failure here drops the player
   * straight to the buttons — a run must never be held hostage by a score
   * service being down.
   */
  private async offerHighScore(data: DebriefData): Promise<void> {
    const { width, height } = this.scale;
    const store = this.registry.get(LEADERBOARD_REGISTRY_KEY) as LeaderboardStore | undefined;
    const mode = modeFromSceneKey(data.mode);
    const score = data.stats.score;

    if (!store) {
      this.showButtons(data, mode);
      return;
    }

    let board;
    let initial = DEFAULT_INITIALS;
    try {
      [board, initial] = await Promise.all([store.load(mode), store.lastInitials()]);
    } catch {
      this.showButtons(data, mode);
      return;
    }
    if (!this.scene.isActive()) return;

    if (!qualifies(board, score)) {
      this.showButtons(data, mode);
      return;
    }

    const rank = insertScore(board, {
      initials: initial,
      score,
      wave: data.stats.wavesCleared,
      at: 0,
    }).rank;

    const header = this.add
      .text(width / 2, height * 0.7, `NEW HIGH SCORE — ${ordinal(rank + 1)}`, {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height * 0.93, 'TYPE YOUR INITIALS  ·  ARROWS ADJUST  ·  ENTER CONFIRMS', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);
    getAudio(this)?.play('tip');

    const entry = new InitialsEntry(this, width / 2, height * 0.82, initial, (initials) => {
      this.input.keyboard?.off('keydown', route);
      entry.destroy();
      header.destroy();
      hint.destroy();
      void this.submitScore(store, mode, initials, data, header);
    });
    const route = (event: KeyboardEvent): void => {
      entry.handleKey(event);
    };
    this.input.keyboard?.on('keydown', route);
  }

  private async submitScore(
    store: LeaderboardStore,
    mode: LeaderboardMode,
    initials: string,
    data: DebriefData,
    _header: Phaser.GameObjects.Text,
  ): Promise<void> {
    const { width, height } = this.scale;
    const at = Date.now();
    let rank = -1;
    try {
      await store.rememberInitials(initials);
      rank = (
        await store.submit(mode, {
          initials,
          score: data.stats.score,
          wave: data.stats.wavesCleared,
          at,
        })
      ).rank;
    } catch {
      // Keep going: the run is over either way and the player gets the buttons.
    }
    if (!this.scene.isActive()) return;

    this.add
      .text(
        width / 2,
        height * 0.7,
        rank >= 0 ? `${initials} — ${ordinal(rank + 1)} ON THE BOARD` : `${initials} — LOGGED`,
        { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: CSS.yellow },
      )
      .setOrigin(0.5);
    this.showButtons(data, mode, at);
  }

  private showButtons(data: DebriefData, mode: LeaderboardMode, highlightAt?: number): void {
    const { width, height } = this.scale;
    const relaunchScene = data.mode ?? 'Game';
    const relaunch = this.makeButton(width / 2, height * 0.77, 'RELAUNCH', () =>
      this.scene.start(relaunchScene),
    );
    const board = this.makeButton(width / 2, height * 0.835, 'LEADERBOARD', () =>
      this.scene.start('Leaderboard', highlightAt === undefined ? { mode } : { mode, highlightAt }),
    );
    const armory = this.makeButton(width / 2, height * 0.9, 'ARMORY', () => this.scene.start('Shop'));
    const menu = this.makeButton(width / 2, height * 0.955, 'MENU', () => this.scene.start('Menu'));

    // Opens on RELAUNCH, so ENTER still means "go again" as it always has.
    new MenuNav(this, [[relaunch], [board], [armory], [menu]]);
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): MenuItem {
    const text = this.add
      .text(x, y, `[ ${label} ]`, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor(CSS.magentaHot));
    text.on('pointerout', () => text.setColor(CSS.cyan));
    text.on('pointerdown', onClick);
    return { target: text, onSelect: onClick };
  }
}
