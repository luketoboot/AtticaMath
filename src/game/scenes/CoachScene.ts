import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  accuracyFor,
  meanMs,
  missRate,
  troubleSpots,
  type TroubleEntry,
  type TroubleMode,
} from '../../core/coach/trouble';
import { CONFIG } from '../../core/config';
import { benchKindFor } from '../../core/exercise/session';
import { findSkill } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, neonChip } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { EXERCISE_SKILL_KEY } from './ExerciseScene';
import { METEOR_DRILL_KEY } from './PlaybookScene';

interface CoachSceneData {
  /** Mode tab to open on. */
  mode?: TroubleMode;
}

/**
 * How each mode's trouble is worth reading.
 *
 *  - Meteor Defense fails by getting the arithmetic wrong, so it lists the
 *    problems that were missed, by name: "8 + 6", not "addition bridging ten".
 *  - Factor Storm rarely misses outright — a rock you cannot crack just drifts
 *    — so it lists the rocks that took longest, and the ones never broken.
 *  - Collapse is a matching game. "You got 3/4 wrong once" is not a drill
 *    anyone would run, so it shows accuracy and nothing else.
 */
const TABS: readonly {
  mode: TroubleMode;
  title: string;
  blurb: string;
  column: string;
  /** Accuracy-only modes have no list worth showing. */
  listed: boolean;
}[] = [
  {
    mode: 'meteor',
    title: 'METEOR',
    blurb: 'PROBLEMS THAT GOT PAST YOU',
    column: 'MISSED',
    listed: true,
  },
  {
    mode: 'factor',
    title: 'FACTOR',
    blurb: 'ROCKS THAT TOOK LONGEST TO CRACK',
    column: 'AVG',
    listed: true,
  },
  {
    mode: 'collapse',
    title: 'COLLAPSE',
    blurb: 'HOW OFTEN THE PAIRING WAS RIGHT',
    column: '',
    listed: false,
  },
];

/**
 * THE COACH — the per-problem breakdown behind the Brain Scan.
 *
 * The skill table knows that borrowing is weak. It cannot know the player is
 * fine with 62−38 and loses every time on 71−49, because ratings aggregate.
 * This is the other half: the actual problems, named, so there is something
 * concrete to go and practise — and a button that goes and practises it.
 */
export class CoachScene extends Phaser.Scene {
  private saves!: SaveManager;

  constructor() {
    super('Coach');
  }

  create(data: CoachSceneData): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });

    const active = TABS.findIndex((t) => t.mode === data.mode);
    const tabIndex = active === -1 ? 0 : active;
    const tab = TABS[tabIndex]!;

    makeIcon(this, width / 2 - 150, 50, 'playbook', {
      size: 38,
      color: PALETTE.magenta,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 12, 50, 'THE COACH', {
        fontFamily: FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 84, 'OPERATOR //  NOT WHICH SKILL. WHICH PROBLEM.', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const tabs = TABS.map((t, i) => {
      const chip = neonChip(
        this,
        width / 2 + (i - (TABS.length - 1) / 2) * 200,
        132,
        t.title,
        () => {
          if (i !== tabIndex) this.scene.restart({ mode: t.mode });
        },
        { size: 46, width: 186, fontSize: 18, accent: PALETTE.magenta },
      );
      chip.setChosen(i === tabIndex);
      return chip;
    });

    this.add
      .text(width / 2, 174, tab.blurb, {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const rows = this.renderMode(tab);

    const back = neonButton(this, width / 2, height - 62, 'BACK', () => this.scene.start('BrainScan'), {
      width: 220,
      height: 48,
      fontSize: 19,
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('BrainScan'));

    new MenuNav(this, [tabs, ...rows, [back]]);
    navHint(this, height - 20);
  }

  /** The body for one tab: a list of problems, or a single accuracy readout. */
  private renderMode(tab: (typeof TABS)[number]): MenuItem[][] {
    const { width } = this.scale;
    const log = this.saves.save.trouble;

    if (!tab.listed) return [this.renderAccuracy(tab.mode)];

    const spots = troubleSpots(log, tab.mode, CONFIG.coach.troubleShown);
    if (spots.length === 0) {
      this.add
        .text(width / 2, 300, this.emptyLine(tab.mode), {
          fontFamily: FONT,
          fontSize: '17px',
          color: CSS.cyanDim,
          align: 'center',
        })
        .setOrigin(0.5);
      return [];
    }

    // Column headers, so the numbers do not need a legend.
    this.add.text(width * 0.2, 214, 'PROBLEM', { fontFamily: FONT, fontSize: '12px', color: CSS.magentaHot });
    this.add.text(width * 0.42, 214, 'ANSWER', { fontFamily: FONT, fontSize: '12px', color: CSS.magentaHot });
    this.add.text(width * 0.56, 214, tab.column, { fontFamily: FONT, fontSize: '12px', color: CSS.magentaHot });
    this.add.text(width * 0.68, 214, 'SEEN', { fontFamily: FONT, fontSize: '12px', color: CSS.magentaHot });

    return spots.map((entry, i) => [this.renderRow(entry, tab, 244 + i * 42)]);
  }

  private renderRow(entry: TroubleEntry, tab: (typeof TABS)[number], y: number): MenuItem {
    const { width } = this.scale;
    const drillable = this.drillTarget(entry) !== undefined;

    this.add
      .text(width * 0.2, y, entry.prompt, {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(width * 0.42, y, entry.answer, { fontFamily: FONT, fontSize: '19px', color: CSS.cyan })
      .setOrigin(0, 0.5);
    this.add
      .text(width * 0.56, y, this.metric(entry, tab.mode), {
        fontFamily: FONT,
        fontSize: '19px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(width * 0.68, y, `${entry.attempts}×`, {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.cyanDim,
      })
      .setOrigin(0, 0.5);

    // The taxonomy's label, whether or not this profile has met the skill —
    // gating it on the skill table just printed raw ids at people.
    const label = findSkill(entry.skillId)?.label ?? entry.skillId;
    this.add
      .text(width * 0.2, y + 15, label.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '10px',
        color: CSS.purple,
      })
      .setOrigin(0, 0.5);

    const button = neonButton(this, width * 0.83, y, drillable ? 'PRACTISE' : 'NO DRILL', () => this.practise(entry), {
      width: 190,
      height: 34,
      fontSize: 15,
      accent: drillable ? PALETTE.yellow : PALETTE.purple,
    });
    return button;
  }

  /** The number this mode ranks by, written the way that mode thinks about it. */
  private metric(entry: TroubleEntry, mode: TroubleMode): string {
    if (mode === 'factor') {
      const ms = meanMs(entry);
      return Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : 'NEVER';
    }
    return `${entry.misses}  (${Math.round(missRate(entry) * 100)}%)`;
  }

  private emptyLine(mode: TroubleMode): string {
    if (mode === 'factor') return 'NO ROCKS ON RECORD.\nPLAY FACTOR STORM AND THE SLOW ONES WILL SHOW UP HERE.';
    return 'NOTHING GOT PAST YOU.\nPLAY A RUN AND ANYTHING YOU MISS LANDS HERE.';
  }

  /** Collapse gets one number, because one number is the whole story. */
  private renderAccuracy(mode: TroubleMode): MenuItem[] {
    const { width } = this.scale;
    const acc = accuracyFor(this.saves.save.trouble, mode);

    if (Number.isNaN(acc.rate)) {
      this.add
        .text(width / 2, 300, 'NEVER PLAYED.', {
          fontFamily: FONT,
          fontSize: '20px',
          color: CSS.cyanDim,
        })
        .setOrigin(0.5);
      return [];
    }

    const pct = Math.round(acc.rate * 100);
    this.add
      .text(width / 2, 300, `${pct}%`, {
        fontFamily: FONT,
        fontSize: '86px',
        fontStyle: 'bold',
        color: pct >= 85 ? CSS.cyan : pct >= 65 ? CSS.yellow : CSS.red,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 360, `${acc.correct} RIGHT OF ${acc.attempts} PAIRINGS`, {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.white,
      })
      .setOrigin(0.5);

    // A bar, because a percentage alone is hard to feel.
    const w = 460;
    this.add.rectangle(width / 2, 398, w, 12, PALETTE.deepPurple, 0.8);
    this.add
      .rectangle(width / 2 - w / 2, 398, Math.max(2, w * acc.rate), 12, pct >= 85 ? PALETTE.cyan : PALETTE.yellow)
      .setOrigin(0, 0.5);

    return [];
  }

  /**
   * Where PRACTISE sends this problem.
   *
   * Exercise if its skill has a bench, since that is the mode built for working
   * one thing slowly. Otherwise a Meteor drill weighted at the skill, which
   * every skill in the taxonomy supports. A problem whose skill the taxonomy no
   * longer has gets nothing, and says so rather than offering a dead button.
   */
  private drillTarget(entry: TroubleEntry): { scene: string; key: string } | undefined {
    if (!findSkill(entry.skillId)) return undefined;
    if (benchKindFor(entry.skillId)) return { scene: 'Exercise', key: EXERCISE_SKILL_KEY };
    return { scene: 'Game', key: METEOR_DRILL_KEY };
  }

  private practise(entry: TroubleEntry): void {
    const target = this.drillTarget(entry);
    if (!target) {
      getAudio(this)?.play('error');
      this.cameras.main.shake(90, 0.004);
      return;
    }
    getAudio(this)?.play('ui');
    this.registry.set(target.key, entry.skillId);
    this.scene.start(target.scene);
  }
}
