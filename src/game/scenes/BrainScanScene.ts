import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { earnedMilestones, masteryProgress } from '../../core/skills/milestones';
import { SKILLS, type SkillDef } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/**
 * Grouped by id prefix rather than by `op`, because a skill's operation family
 * stopped partitioning the taxonomy once fractions arrived: adding unlike
 * fractions is an `add`, taking a percentage is a `mul`, and filing either of
 * them under the whole-number columns would tell the player they are worse at
 * addition than they are.
 */
const GROUPS: readonly { title: string; prefixes: readonly string[] }[] = [
  { title: 'ADDITION', prefixes: ['add.'] },
  { title: 'SUBTRACTION', prefixes: ['sub.'] },
  { title: 'MIXED', prefixes: ['ooo.'] },
  { title: 'MULTIPLICATION', prefixes: ['mul.'] },
  { title: 'DIVISION', prefixes: ['div.'] },
  { title: 'FACTORS', prefixes: ['factor.'] },
  { title: 'FRACTIONS & PERCENT', prefixes: ['frac.', 'pct.'] },
];

/** Column split, by group index. Three columns so 44 skills fit one screen. */
const COLUMNS: readonly (readonly number[])[] = [[0, 1, 2], [3], [4, 5, 6]];

/** Row rhythm. Named because they trade against each other for vertical room. */
const ROW_H = 27;
const HEADER_H = 28;
const GROUP_GAP = 10;
/** Share of the column given to the label before the bar starts. */
const LABEL_SHARE = 0.62;
/** Right-hand reserve for the gate hint. */
const HINT_W = 44;

/** Read-only visualization of the adaptive skill table. */
export class BrainScanScene extends Phaser.Scene {
  constructor() {
    super('BrainScan');
  }

  create(): void {
    const { width, height } = this.scale;
    const saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });

    makeIcon(this, width / 2 - 160, 44, 'brainscan', {
      size: 44,
      color: PALETTE.cyan,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 22, 42, 'BRAIN SCAN', { fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: CSS.magenta })
      .setOrigin(0.5);
    const anyReadings = Object.values(saves.save.skills).some((s) => s.attempts > 0);
    this.add
      .text(
        width / 2,
        78,
        anyReadings
          ? 'WHAT THE MACHINE THINKS YOU KNOW'
          : 'NO READINGS YET — PLAY A RUN AND THE TRACES COME UP',
        { fontFamily: FONT, fontSize: '14px', color: anyReadings ? CSS.cyanDim : CSS.yellow },
      )
      .setOrigin(0.5);

    const mastered = new Set(earnedMilestones(saves.save.skills, CONFIG).map((m) => m.id));

    // Whole pixels, so glyphs rasterise crisply rather than across a sub-pixel
    // boundary. Worth having on a screen this dense, though it is not what fixed
    // the headings — see the note on their colour below.
    const margin = Math.round(width * 0.035);
    const span = Math.round((width - margin * 2) / COLUMNS.length);
    COLUMNS.forEach((indices, i) => {
      const x0 = margin + span * i;
      this.renderColumn(
        indices.map((g) => GROUPS[g]!),
        x0,
        x0 + span - 26, // gutter between columns
        saves,
        mastered,
      );
    });

    const goBack = (): void => {
      goTo(this, 'Menu');
    };
    // The scan says which skills are weak; the coach says which problems. One
    // is the map and the other is the itinerary, so the way to the second is
    // from the first.
    const coach = neonButton(
      this,
      width / 2 - 170,
      height - 52,
      'THE COACH',
      () => goTo(this, 'Coach'),
      { width: 280, height: 44, fontSize: 19, accent: PALETTE.magenta, sub: 'PROBLEM BY PROBLEM' },
    );
    // Sits a line higher than the other screens' BACK to leave room for the
    // hint below it; the longest column bottoms out around y=580.
    const back = neonButton(this, width / 2 + 170, height - 52, 'BACK', goBack, {
      width: 200,
      height: 44,
      fontSize: 19,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goBack();
    });

    new MenuNav(this, [[coach, back]]);
    navHint(this);
  }

  private renderColumn(
    groups: readonly { title: string; prefixes: readonly string[] }[],
    x0: number,
    x1: number,
    saves: SaveManager,
    mastered: ReadonlySet<string>,
  ): void {
    let y = 112;
    let band = 0;
    for (const group of groups) {
      // Cyan at 17px, not hot magenta at 15. Two reasons, and they agree.
      //
      // The CRT tore the old headings: magentaHot is the most saturated colour
      // in the palette, it blooms hardest, and the scanline then cut a dark line
      // straight through the caps — every heading read as struck out. Turning it
      // down stops the bloom that the scanline had to bite into.
      //
      // It is also the better hierarchy. Seven headings in the loudest colour on
      // screen competed with the handful of rows that actually carry a reading;
      // the data should be the brightest thing here, and now it is.
      this.add.text(x0, y, group.title, {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: CSS.cyan,
      });
      // A rule under the heading, so a group reads as a block with a lid rather
      // than as one more row that happens to be a different colour.
      this.add
        .rectangle(x0, y + 22, x1 - x0, 1, PALETTE.cyan)
        .setOrigin(0, 0.5)
        .setAlpha(0.35);
      y += HEADER_H;
      for (const skill of SKILLS.filter((s) => group.prefixes.some((p) => s.id.startsWith(p)))) {
        // Banding carries the eye across the gap from a label to its bar. At
        // this density a rule per row would out-shout the data, so it is a
        // fill barely above the backdrop.
        if (band % 2 === 1) {
          this.add
            .rectangle(x0 - 6, y + 8, x1 - x0 + 12, ROW_H - 2, PALETTE.deepPurple)
            .setOrigin(0, 0.5)
            .setAlpha(0.3);
        }
        this.renderRow(skill, y, x0, x1, saves, mastered);
        y += ROW_H;
        band += 1;
      }
      y += GROUP_GAP;
    }
  }

  private renderRow(
    skill: SkillDef,
    y: number,
    x0: number,
    x1: number,
    saves: SaveManager,
    mastered: ReadonlySet<string>,
  ): void {
    const state = saves.save.skills[skill.id];
    const isMastered = mastered.has(`mastery.${skill.id}`);
    const attempted = state !== undefined && state.attempts > 0;
    // Proportional rather than a fixed 220px label gutter: three columns are
    // narrower than two, and a fixed offset left the bars too short to read.
    const barX = x0 + (x1 - x0) * LABEL_SHARE;
    const barW = x1 - barX - HINT_W;

    const label = this.add.text(x0, y, skill.label.toUpperCase(), {
      fontFamily: FONT,
      fontSize: '13px',
      color: attempted ? CSS.white : CSS.cyanDim,
    });
    // Nothing bounds a label to its share of the column, so the long ones —
    // "one number as a percent of another" is 34 characters — ran under the bar
    // and collided with the rating. Shrink to fit rather than wrap: a second
    // line would break the fixed row pitch and misalign the whole column.
    const room = barX - x0 - 8;
    if (label.width > room) label.setScale(room / label.width);

    if (!attempted) {
      // A flatline, not the words NO SIGNAL. Thirty-eight of those rows say
      // nothing at the same weight as the handful that say something, and on a
      // brain scan a flat trace already means no activity — the shape carries
      // it, so the words were only noise.
      this.add
        .rectangle(barX, y + 8, barW, 2, PALETTE.deepPurple)
        .setOrigin(0, 0.5)
        .setAlpha(0.9);
      return;
    }

    // The bar tracks mastery, not rating. Rating saturates almost immediately on
    // the easy half of the taxonomy — the seed already clears their mastery line
    // — so a rating bar read as full before the player had proved anything.
    const progress = masteryProgress(state, skill, CONFIG);
    const filled = Math.max(0.02, progress.overall);

    this.add.rectangle(barX, y + 8, barW, 11, PALETTE.deepPurple).setOrigin(0, 0.5);
    this.add
      .rectangle(barX, y + 8, barW * filled, 11, isMastered ? PALETTE.yellow : PALETTE.cyan)
      .setOrigin(0, 0.5);

    // Naming the gate turns a short bar from a verdict into an instruction:
    // more reps, harder problems, or the same problems faster.
    const HINT: Readonly<Record<string, string>> = { volume: 'REPS', rating: 'RATING', speed: 'SPEED' };
    this.add
      .text(x1, y, isMastered ? '★' : HINT[progress.limiting]!, {
        fontFamily: FONT,
        fontSize: isMastered ? '13px' : '10px',
        fontStyle: 'bold',
        color: isMastered ? CSS.yellow : CSS.cyanDim,
      })
      .setOrigin(1, 0);
  }
}
