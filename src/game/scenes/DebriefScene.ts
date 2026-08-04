import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { displayDate } from '../../core/daily/daily';
import type { RunStats } from '../../core/economy/economy';
import {
  DEFAULT_INITIALS,
  insertScore,
  modeFromSceneKey,
  ordinal,
  qualifies,
  rankingFor,
  type LeaderboardMode,
} from '../../core/leaderboard/leaderboard';
import {
  DAILY_REGISTRY_KEY,
  type DailyLeaderboardStore,
} from '../../core/leaderboard/dailyStore';
import type { LeaderboardStore } from '../../core/leaderboard/store';
import { topMovers, type SkillDelta } from '../../core/skills/report';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { InitialsEntry } from '../../ui/InitialsEntry';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { spread } from '../../ui/ModeCard';
import { neonButton } from '../../ui/panels';
import { revealIn } from '../../ui/reveal';
import { keyEventGate } from '../input/freshKey';
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
  /**
   * The whole stat block, for a mode whose result is not a score at all. CAGES
   * ends with a time and a mistake count and has no waves, kills or streak to
   * print — and a row of zeroes reads as failure rather than as "not applicable".
   * The credits row is still appended below whatever is given here.
   */
  statRows?: readonly (readonly [string, string])[];
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
  /**
   * The UTC date key when this run was today's daily challenge. Present means
   * the score belongs to the daily board and to no other: a daily roster is
   * composed without reference to the player's ratings, so its scores are not
   * comparable with the adaptive runs on the all-time meteor board either.
   */
  daily?: string;
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

    // The debrief is the one screen whose whole job is to make the player feel
    // the run they just had, so nothing on it appears instantly: the headline
    // lands, the ledger deals in row by row, and the numbers roll up.
    const title = this.add
      .text(width / 2, height * 0.18, data.title ?? 'BASE DESTROYED', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: data.titleColor ?? CSS.red,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(1.12);
    const titleP = { t: 0 };
    this.tweens.add({
      targets: titleP,
      t: 1,
      duration: 260,
      ease: 'Quad.easeOut',
      onUpdate: () => title.setAlpha(titleP.t).setScale(1.12 - 0.12 * titleP.t),
      onComplete: () => title.setAlpha(1).setScale(1),
    });

    const s = data.stats;
    const rows: string[][] = [
      ...(data.statRows?.map((row) => [...row]) ?? [
        ['SCORE', String(s.score)],
        [data.wavesLabel ?? 'WAVES CLEARED', String(s.wavesCleared)],
        [data.killsLabel ?? 'KILLS', String(s.kills)],
        ...(data.hideStreak ? [] : [[data.streakLabel ?? 'BEST STREAK', `x${s.bestStreak}`]]),
      ]),
      ['CREDITS EARNED', `+${data.credits}`],
    ];
    // Stats keep the left half; the rating movement takes the right, so a run
    // reads as two ledgers side by side — what you scored, what it rewired.
    const movers = topMovers(data.deltas ?? [], rows.length);
    const statsMid = movers.length > 0 ? 0.31 : 0.5;
    rows.forEach(([label, value], i) => {
      const y = height * 0.3 + i * 36;
      const delay = 250 + i * 120;
      const isCredits = i === rows.length - 1;
      const labelText = this.add.text(width * (statsMid - 0.18), y, label!, {
        fontFamily: FONT,
        fontSize: '22px',
        color: CSS.cyanDim,
      });
      revealIn(this, labelText, delay);
      const valueText = this.add
        .text(width * (statsMid + 0.18), y, value!, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: isCredits ? CSS.yellow : CSS.white,
        })
        .setOrigin(1, 0);

      // Numbers roll up; anything that is not a bare number (a clock, a grid
      // size) fades in whole — counting up a "4 x 4" would be gibberish.
      const numeric = /^([+x]?)(\d+)$/.exec(value!);
      if (!numeric) {
        revealIn(this, valueText, delay);
        return;
      }
      const prefix = numeric[1]!;
      const target = Number(numeric[2]!);
      const p = { n: 0 };
      valueText.setAlpha(0);
      this.tweens.add({
        targets: p,
        n: target,
        delay,
        duration: 450,
        ease: 'Cubic.easeOut',
        onStart: () => {
          valueText.setAlpha(1);
          getAudio(this)?.play('ui', { pitch: 1.5, gain: 0.35 });
        },
        onUpdate: () => valueText.setText(`${prefix}${Math.round(p.n)}`),
        onComplete: () => {
          valueText.setText(`${prefix}${target}`);
          // Credits land last and land as money.
          if (isCredits) getAudio(this)?.play('purchase', { gain: 0.7 });
        },
      });
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
      // After the ledger has finished rolling, and no longer silent — a new
      // milestone is the biggest thing a run can produce.
      const p = { t: 0 };
      this.tweens.add({
        targets: p,
        t: 1,
        duration: 300,
        delay: 1000 + i * 250,
        onStart: () => getAudio(this)?.play('comboUp', { gain: 0.8 }),
        onUpdate: () => text.setAlpha(p.t),
        onComplete: () => text.setAlpha(1),
      });
    });

    const quote =
      unlocked.length > 0
        ? 'OPERATOR // New hardware in the brain. Logged. Go break it in.'
        : (data.operatorLine ??
          'OPERATOR // Debrief logged. The rocks don’t care. Neither do I. Go again.');
    const quoteText = this.add
      .text(width / 2, height * 0.66, quote, {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.magentaHot,
        wordWrap: { width: width * 0.7 },
        align: 'center',
      })
      .setOrigin(0.5);
    revealIn(this, quoteText, 800);

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
      // Deals in on the same beat as the stat rows to its left.
      const delay = 250 + i * 120;
      const row = [
        this.add.text(width * 0.56, y + 3, label, {
          fontFamily: FONT,
          fontSize: label.length > 26 ? '13px' : '16px',
          color: CSS.cyanDim,
        }),
        this.add
          .text(width * 0.87, y, `${up ? '+' : '−'}${Math.abs(m.delta)}`, {
            fontFamily: FONT,
            fontSize: '22px',
            fontStyle: 'bold',
            color: up ? CSS.cyan : CSS.red,
          })
          .setOrigin(1, 0),
      ];
      for (const text of row) revealIn(this, text, delay);
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

    if (data.daily !== undefined) {
      await this.offerDaily(data, data.daily, store);
      return;
    }

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

    if (!qualifies(board, score, undefined, rankingFor(mode))) {
      this.showButtons(data, mode);
      return;
    }

    const rank = insertScore(
      board,
      { initials: initial, score, wave: data.stats.wavesCleared, at: 0 },
      undefined,
      rankingFor(mode),
    ).rank;

    // A board that ranks on time has no "high score" to announce, and calling a
    // 1:58 one would be nonsense. It has a best time.
    const headline =
      rankingFor(mode) === 'low'
        ? `BEST TIME — ${ordinal(rank + 1)}`
        : `NEW HIGH SCORE — ${ordinal(rank + 1)}`;
    const header = this.add
      .text(width / 2, height * 0.7, headline, {
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
    // Gated, like every other keydown handler in the game: Phaser can redeliver
    // the same DOM event to a handler more than once in a frame, and here that
    // turns "LTB" into "LLB" — on the one screen whose typing is permanent.
    const fresh = keyEventGate();
    const route = (event: KeyboardEvent): void => {
      if (fresh(event)) entry.handleKey(event);
    };
    this.input.keyboard?.on('keydown', route);
  }

  /**
   * The daily's own submission path.
   *
   * Unlike the mode boards there is no qualifying cut: the board is global and
   * a place on it is a place however far down, so any score above zero gets the
   * initials prompt. Being 4,000th out of 12,000 is a real result and the mode
   * should be willing to print it.
   */
  private async offerDaily(
    data: DebriefData,
    dateKey: string,
    modeStore: LeaderboardStore | undefined,
  ): Promise<void> {
    const { width, height } = this.scale;
    const store = this.registry.get(DAILY_REGISTRY_KEY) as DailyLeaderboardStore | undefined;
    if (!store || data.stats.score <= 0) {
      this.showButtons(data, 'meteor');
      return;
    }

    const initial = (await modeStore?.lastInitials()) ?? DEFAULT_INITIALS;
    if (!this.scene.isActive()) return;

    const header = this.add
      .text(width / 2, height * 0.7, `DAILY // ${displayDate(dateKey)}`, {
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
      void this.submitDaily(store, modeStore, dateKey, initials, data);
    });
    // Gated, like every other keydown handler in the game: Phaser can redeliver
    // the same DOM event to a handler more than once in a frame, and here that
    // turns "LTB" into "LLB" — on the one screen whose typing is permanent.
    const fresh = keyEventGate();
    const route = (event: KeyboardEvent): void => {
      if (fresh(event)) entry.handleKey(event);
    };
    this.input.keyboard?.on('keydown', route);
  }

  private async submitDaily(
    store: DailyLeaderboardStore,
    modeStore: LeaderboardStore | undefined,
    dateKey: string,
    initials: string,
    data: DebriefData,
  ): Promise<void> {
    const { width, height } = this.scale;
    const saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager | undefined;
    const badge = saves?.save.equipped.badge;
    const at = Date.now();

    await modeStore?.rememberInitials(initials);
    const result = await store.submit(
      dateKey,
      {
        initials,
        score: data.stats.score,
        wave: data.stats.wavesCleared,
        at,
        ...(badge !== undefined ? { badge } : {}),
      },
      CONFIG.daily.boardSize,
    );

    // Only the upload flag moves here. The attempt itself was spent when the
    // run ended, so a failed submission leaves the run played and the score
    // pending, to be retried from the daily lobby.
    if (result.submitted && saves?.save.daily?.date === dateKey) {
      saves.save.daily = { ...saves.save.daily, submitted: true };
      saves.persist();
    }
    if (!this.scene.isActive()) return;

    const placing =
      result.rank >= 0 && result.total > 0
        ? `${initials} — ${ordinal(result.rank + 1)} OF ${result.total}`
        : result.submitted
          ? `${initials} — ON THE BOARD`
          : `${initials} — SAVED, BOARD UNREACHABLE`;
    this.add
      .text(width / 2, height * 0.7, placing, {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: result.submitted ? CSS.yellow : CSS.cyanDim,
      })
      .setOrigin(0.5);
    this.showButtons(data, 'meteor', at);
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

    // A spent daily has nothing to relaunch into — going again today is the one
    // thing the mode does not offer — so its row leads with the board instead.
    const specs: { label: string; go: () => void; accent?: number }[] =
      data.daily !== undefined
        ? [
            { label: 'DAILY', go: () => goTo(this, 'Daily'), accent: PALETTE.magenta },
            { label: 'HANGAR', go: () => goTo(this, 'Shop') },
            { label: 'MENU', go: () => goTo(this, 'Menu') },
          ]
        : [
            { label: 'RELAUNCH', go: () => goTo(this, relaunchScene), accent: PALETTE.magenta },
            {
              label: 'SCORES',
              go: () =>
                goTo(
                  this,
                  'Leaderboard',
                  highlightAt === undefined ? { mode } : { mode, highlightAt },
                ),
            },
            { label: 'HANGAR', go: () => goTo(this, 'Shop') },
            { label: 'MENU', go: () => goTo(this, 'Menu') },
          ];

    const buttons = specs.map((spec, i) =>
      neonButton(this, spread(width / 2, 1060, i, specs.length), y, spec.label, spec.go, {
        ...opts,
        ...(spec.accent !== undefined ? { accent: spec.accent } : {}),
      }),
    );

    // One row, opening on the first button, so ENTER still means "go again".
    new MenuNav(this, [buttons]);
    navHint(this, height - 18);
  }
}
