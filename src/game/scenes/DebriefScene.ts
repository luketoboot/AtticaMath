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
import { topMovers, type SkillDelta } from '../../core/skills/report';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { InitialsEntry } from '../../ui/InitialsEntry';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { spread } from '../../ui/ModeCard';
import { neonButton } from '../../ui/panels';
import { LEADERBOARD_REGISTRY_KEY } from '../leaderboardStore';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

interface DebriefData {
  stats: RunStats;
  credits: number;
  /** Scene key to relaunch into; defaults to meteor defense. */
  mode?: string;
  /** Newly earned mastery labels to surface as unlocks. */
  milestones?: string[];
  /** Headline, for modes that end in something other than a lost base. */
  title?: string;
  /**
   * Row labels a mode wants in its own vocabulary. The numbers are the same
   * RunStats either way — only what the mode calls a kill or a streak differs.
   */
  killsLabel?: string;
  streakLabel?: string;
  /** Rating movement over the run, for the brain-delta column. */
  deltas?: SkillDelta[];
  /**
   * Headline colour. Red is right for a base that fell; a mode whose ending is
   * an achievement should not announce it in the colour of failure.
   */
  titleColor?: string;
  /** Row labels a mode counts differently, and rows it does not count at all. */
  wavesLabel?: string;
  /** Modes with no streak to speak of drop the row rather than printing x0. */
  hideStreak?: boolean;
  /** Closing line, for modes the Operator would not talk to about rocks. */
  operatorLine?: string;
  /**
   * Whether this run may reach the board. Off for the teaching modes: a run you
   * can take at your own pace is not comparable with one against a clock, and
   * mixing them would make the board meaningless.
   */
  leaderboard?: boolean;
}

export class DebriefScene extends Phaser.Scene {
  constructor() {
    super('Debrief');
  }

  create(data: DebriefData): void {
    const { width, height } = this.scale;
    getAudio(this)?.playMusic('debrief');
    applyCrt(this);
    // Sun off: the button row sits low enough that it would fight for the space.
    drawBackdrop(this, { sun: false, horizon: 0.93 });

    this.add
      .text(width / 2, height * 0.18, data.title ?? 'BASE DESTROYED', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: data.titleColor ?? CSS.red,
      })
      .setOrigin(0.5);

    const s = data.stats;
    const rows = [
      ['SCORE', String(s.score)],
      [data.wavesLabel ?? 'WAVES CLEARED', String(s.wavesCleared)],
      [data.killsLabel ?? 'KILLS', String(s.kills)],
      ...(data.hideStreak ? [] : [[data.streakLabel ?? 'BEST STREAK', `x${s.bestStreak}`]]),
      ['CREDITS EARNED', `+${data.credits}`],
    ];
    // Stats keep the left half; the rating movement takes the right, so a run
    // reads as two ledgers side by side — what you scored, what it rewired.
    const movers = topMovers(data.deltas ?? [], rows.length);
    const statsMid = movers.length > 0 ? 0.31 : 0.5;
    rows.forEach(([label, value], i) => {
      const y = height * 0.3 + i * 36;
      this.add.text(width * (statsMid - 0.18), y, label!, { fontFamily: FONT, fontSize: '22px', color: CSS.cyanDim });
      this.add
        .text(width * (statsMid + 0.18), y, value!, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: i === rows.length - 1 ? CSS.yellow : CSS.white,
        })
        .setOrigin(1, 0);
    });
    this.drawDeltas(movers);

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
        : (data.operatorLine ??
          'OPERATOR // Debrief logged. The rocks don’t care. Neither do I. Go again.');
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

  /** The right-hand ledger: what the run did to the ratings behind the game. */
  private drawDeltas(movers: readonly SkillDelta[]): void {
    if (movers.length === 0) return;
    const { width, height } = this.scale;
    this.add
      .text(width * 0.715, height * 0.265, 'BRAIN DELTA', {
        fontFamily: FONT,
        fontSize: '14px',
        fontStyle: 'bold',
        color: CSS.magentaHot,
      })
      .setOrigin(0.5);
    movers.forEach((m, i) => {
      const y = height * 0.3 + i * 36;
      const up = m.delta > 0;
      const label = m.label.toUpperCase();
      this.add.text(width * 0.56, y + 3, label, {
        fontFamily: FONT,
        fontSize: label.length > 26 ? '13px' : '16px',
        color: CSS.cyanDim,
      });
      this.add
        .text(width * 0.87, y, `${up ? '+' : '−'}${Math.abs(m.delta)}`, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: up ? CSS.cyan : CSS.red,
        })
        .setOrigin(1, 0);
    });
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

    // Teaching modes never reach the board. A set worked at your own pace is
    // not comparable with a run against a clock, and letting the two share a
    // table would make the table say nothing.
    if (data.leaderboard === false) {
      this.showButtons(data, mode);
      return;
    }

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
      // The badge is stamped at submission, so the board remembers what you
      // wore when you set the score rather than what you happen to wear now.
      const badge = (this.registry.get(SAVE_REGISTRY_KEY) as SaveManager | undefined)?.save
        .equipped.badge;
      rank = (
        await store.submit(mode, {
          initials,
          score: data.stats.score,
          wave: data.stats.wavesCleared,
          at,
          ...(badge !== undefined ? { badge } : {}),
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
    const y = height * 0.82;
    const opts = { width: 250, height: 50, fontSize: 20 };
    const relaunch = neonButton(
      this,
      spread(width / 2, 1060, 0, 4),
      y,
      'RELAUNCH',
      () => this.scene.start(relaunchScene),
      { ...opts, accent: PALETTE.magenta },
    );
    const board = neonButton(
      this,
      spread(width / 2, 1060, 1, 4),
      y,
      'SCORES',
      () =>
        this.scene.start(
          'Leaderboard',
          highlightAt === undefined ? { mode } : { mode, highlightAt },
        ),
      opts,
    );
    const hangar = neonButton(
      this,
      spread(width / 2, 1060, 2, 4),
      y,
      'HANGAR',
      () => this.scene.start('Shop'),
      opts,
    );
    const menu = neonButton(
      this,
      spread(width / 2, 1060, 3, 4),
      y,
      'MENU',
      () => this.scene.start('Menu'),
      opts,
    );

    // One row, opening on RELAUNCH, so ENTER still means "go again".
    new MenuNav(this, [[relaunch, board, hangar, menu]]);
    navHint(this, height - 18);
  }
}
