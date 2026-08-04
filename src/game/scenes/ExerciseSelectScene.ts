import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { benchKindFor, EXERCISE_GROUPS, suggestedSkill } from '../../core/exercise/session';
import { getSkill, type SkillId } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, neonChip } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { EXERCISE_SKILL_KEY } from './ExerciseScene';

/** Registry key for the drill last chosen, so the screen reopens where you left it. */
const LAST_PICK_KEY = 'exerciseLastPick';

/**
 * DRILL SELECT — which exercise to work.
 *
 * Exercise used to open on whatever the skill table said was weakest, which is
 * a good default and a bad only-option: a player who wants to practise long
 * division should not have to be bad at it first. Every exercise is on this
 * screen, laid out by family, and the Operator's suggestion is one button among
 * them rather than the whole menu.
 */
export class ExerciseSelectScene extends Phaser.Scene {
  private saves!: SaveManager;
  private detail!: Phaser.GameObjects.Text;
  private standing!: Phaser.GameObjects.Text;

  constructor() {
    super('ExerciseSelect');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });

    const suggested = suggestedSkill(this.saves.save.skills);
    const remembered = this.registry.get(LAST_PICK_KEY) as SkillId | undefined;
    const opening = remembered && benchKindFor(remembered) ? remembered : suggested;

    makeIcon(this, width / 2 - 176, 52, 'exercise', {
      size: 40,
      color: PALETTE.cyan,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 10, 52, 'DRILL SELECT', {
        fontFamily: FONT,
        fontSize: '38px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 88, 'OPERATOR //  PICK A MOVE. NO CLOCK, NO DAMAGE. JUST THE METHOD.', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    // One row per family: left/right walks a family, up/down changes family.
    const rows: MenuItem[][] = [];
    let focusRow = 0;
    let focusCol = 0;

    EXERCISE_GROUPS.forEach((group, r) => {
      const y = 156 + r * 78;
      this.add
        .text(96, y, group.title, {
          fontFamily: FONT,
          fontSize: '15px',
          fontStyle: 'bold',
          color: CSS.magentaHot,
        })
        .setOrigin(0, 0.5);

      const chips = group.skills.map((skill, c) => {
        if (skill.id === opening) {
          focusRow = r;
          focusCol = c;
        }
        const chip = neonChip(this, 300 + c * 168, y, skill.short, () => this.launch(skill.id), {
          size: 52,
          width: 156,
          fontSize: 17,
          accent: skill.id === suggested ? PALETTE.yellow : PALETTE.cyan,
        });
        return {
          ...chip,
          onFocus: () => this.describe(skill.id, suggested),
        };
      });
      rows.push(chips);
    });

    this.detail = this.add
      .text(width / 2, height - 132, '', {
        fontFamily: FONT,
        fontSize: '19px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0.5);
    this.standing = this.add
      .text(width / 2, height - 106, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const pick = neonButton(
      this,
      width / 2 - 180,
      height - 74,
      "OPERATOR'S PICK",
      () => this.launch(suggested),
      { width: 320, height: 50, fontSize: 19, accent: PALETTE.yellow },
    );
    const back = neonButton(this, width / 2 + 180, height - 74, 'BACK', () => goTo(this, 'Menu'), {
      width: 220,
      height: 50,
      fontSize: 19,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goTo(this, 'Menu');
    });

    rows.push([pick, back]);
    const nav = new MenuNav(this, rows);
    nav.setColumn(focusRow, focusCol);
    nav.focus(focusRow, focusCol, false);
    this.describe(opening, suggested);

    navHint(this, height - 20);
  }

  /** What this drill is, and where the player stands on it. */
  private describe(id: SkillId, suggested: SkillId): void {
    const def = getSkill(id);
    const kind = benchKindFor(id) === 'bars' ? 'BARS' : 'THE DIAL';
    this.detail.setText(`${def.label.toUpperCase()}  ·  ${kind}`);

    const state = this.saves.save.skills[id];
    const fluentAt = def.baseDifficulty + CONFIG.waves.fluentMargin;
    const met = state !== undefined && state.attempts > 0;
    let line: string;
    if (!met) {
      line = 'NO SIGNAL — NEVER MET IN COMBAT';
    } else if (state.rating >= fluentAt) {
      line = `YOUR RATING ${Math.round(state.rating)} — FLUENT`;
    } else {
      line = `YOUR RATING ${Math.round(state.rating)} — FLUENT AT ${fluentAt}`;
    }
    // Only a skill with attempts behind it can be the weakest on record; on a
    // cold profile the suggestion is just where to start, and saying otherwise
    // would be the game claiming to know something it does not.
    const flagged = met && id === suggested;
    this.standing.setText(flagged ? `${line}  ·  WEAKEST ON RECORD` : line);
    this.standing.setColor(flagged ? CSS.yellow : CSS.cyanDim);
  }

  private launch(id: SkillId): void {
    getAudio(this)?.play('ui');
    this.registry.set(LAST_PICK_KEY, id);
    this.registry.set(EXERCISE_SKILL_KEY, id);
    goTo(this, 'Exercise');
  }
}
