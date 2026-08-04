import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import {
  PLAYBOOK_GROUPS,
  techniqueForSkill,
  weakestAttempted,
} from '../../core/coach/techniques';
import { CONFIG } from '../../core/config';
import { benchKindFor } from '../../core/exercise/session';
import { earnedMilestones } from '../../core/skills/milestones';
import { SKILLS, type SkillDef } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { goTo } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, neonChip, type NeonButton } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { EXERCISE_SKILL_KEY } from './ExerciseScene';

/**
 * Registry key for a Playbook drill: the skill id a launched run should
 * overweight. Set here, read by GameScene, cleared by ModeSelect so an
 * ordinary launch never inherits a stale drill.
 */
export const METEOR_DRILL_KEY = 'meteorDrill';

interface PlaybookSceneData {
  /** Group tab to open on; defaults to wherever the recommendation lives. */
  group?: number;
}

/**
 * THE PLAYBOOK — the Operator's technique archive.
 *
 * Every skill's mental-math move, browsable: pick a family, read the method
 * and a worked example, see your own rating against it, and drill it — a
 * Meteor Defense run with that skill overweighted in every wave. The weakest
 * skill the player has actually met is flagged and opens preselected, so the
 * screen answers "what should I learn?" before it is asked.
 */
export class PlaybookScene extends Phaser.Scene {
  private detail: Phaser.GameObjects.GameObject[] = [];
  private shown: SkillDef | null = null;
  private saves!: SaveManager;
  private workBtn!: NeonButton;
  private workHint!: Phaser.GameObjects.Text;

  constructor() {
    super('Playbook');
  }

  create(data: PlaybookSceneData): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });
    this.detail = [];
    this.shown = null;

    const recommended = weakestAttempted(this.saves.save.skills);
    const recommendedGroup = recommended
      ? PLAYBOOK_GROUPS.findIndex((g) => g.prefixes.some((p) => recommended.startsWith(p)))
      : -1;
    const group = data.group ?? Math.max(0, recommendedGroup);

    makeIcon(this, width / 2 - 168, 52, 'playbook', {
      size: 44,
      color: PALETTE.magenta,
      dim: PALETTE.cyanDim,
    });
    this.add
      .text(width / 2 + 14, 52, 'PLAYBOOK', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 92, 'OPERATOR //  EVERY TRICK IN THE DECK. LEARN ONE. DRILL IT.', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    // Group tabs. ENTER (or click) switches; the scene restarts into the new
    // group so the list, detail and nav are rebuilt in one stroke.
    const tabs = PLAYBOOK_GROUPS.map((g, i) => {
      const x = width / 2 + (i - (PLAYBOOK_GROUPS.length - 1) / 2) * 164;
      const chip = neonChip(
        this,
        x,
        138,
        g.title,
        () => {
          if (i !== group) this.scene.restart({ group: i });
        },
        { size: 42, width: 150, fontSize: 15, accent: PALETTE.magenta },
      );
      chip.setChosen(i === group);
      return chip;
    });

    const defs = SKILLS.filter((s) =>
      PLAYBOOK_GROUPS[group]!.prefixes.some((p) => s.id.startsWith(p)),
    );
    const mastered = new Set(
      earnedMilestones(this.saves.save.skills, CONFIG).map((m) => m.id),
    );

    // The list. Focus previews (arriving is choosing what to read); ENTER or
    // click launches the drill.
    const items: MenuItem[] = defs.map((def, i) => {
      const isRec = def.id === recommended;
      const star = mastered.has(`mastery.${def.id}`) ? ' ★' : '';
      const text = this.add
        .text(84, 182 + i * 26, `${def.label.toUpperCase()}${star}${isRec ? '  ◄' : ''}`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: isRec ? CSS.yellow : CSS.cyanDim,
        })
        .setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.drill(def));
      return {
        target: text,
        onFocus: () => this.renderDetail(def, recommended),
        onSelect: () => this.drill(def),
        setFocused: (on: boolean) =>
          text.setColor(on ? CSS.white : isRec ? CSS.yellow : CSS.cyanDim),
      };
    });

    // Two ways to take a move off the page. Exercise is the slow one — perform
    // the method on the dial, untimed — and the drill is the fast one. Read it,
    // work it, then meet it at speed.
    this.workBtn = neonButton(
      this,
      width * 0.52,
      height - 84,
      'WORK IT',
      () => {
        if (this.shown) this.work(this.shown);
      },
      { width: 250, height: 54, fontSize: 22, accent: PALETTE.cyan },
    );
    this.workHint = this.add
      .text(width * 0.52, height - 50, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const drillBtn = neonButton(
      this,
      width * 0.81,
      height - 84,
      'DRILL THIS',
      () => {
        if (this.shown) this.drill(this.shown);
      },
      { width: 250, height: 54, fontSize: 22, accent: PALETTE.yellow },
    );
    this.add
      .text(width * 0.81, height - 50, 'METEOR DEFENSE, WEIGHTED AT THE MOVE', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const goBack = (): void => {
      goTo(this, 'Menu');
    };
    const back = neonButton(this, width * 0.2, height - 84, 'BACK', goBack, {
      width: 180,
      height: 54,
      fontSize: 20,
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      getAudio(this)?.play('back');
      goBack();
    });

    const nav = new MenuNav(this, [
      tabs,
      ...items.map((item) => [item]),
      [this.workBtn, drillBtn],
      [back],
    ]);
    nav.setColumn(0, group);
    // Open on the recommended technique if it lives in this group, else the top.
    const openAt = Math.max(0, defs.findIndex((d) => d.id === recommended));
    nav.focus(1 + openAt, 0, false);
    const first = defs[openAt];
    if (first) this.renderDetail(first, recommended);

    navHint(this, height - 16);
  }

  /** The right-hand pane: the move itself, and where the player stands on it. */
  private renderDetail(def: SkillDef, recommended: string | undefined): void {
    this.shown = def;
    // Only the multi-digit add/sub moves have places to drop; the rest say so
    // rather than offering a button that buzzes.
    const workable = benchKindFor(def.id) !== undefined;
    this.workBtn?.setAccent(workable ? PALETTE.cyan : PALETTE.purple);
    this.workHint?.setText(
      workable ? 'EXERCISE — PERFORM IT, PLACE BY PLACE, NO CLOCK' : 'NO DIAL FOR THIS MOVE YET',
    );
    for (const obj of this.detail) obj.destroy();
    this.detail = [];
    const { width } = this.scale;
    const x = width * 0.44;
    const wrap = width * 0.52;
    const tech = techniqueForSkill(def.id);
    if (!tech) return;

    const push = (obj: Phaser.GameObjects.GameObject): void => {
      this.detail.push(obj);
    };

    push(
      this.add.text(x, 182, def.label.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      }),
    );
    push(
      this.add.text(x, 204, tech.title, {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: CSS.cyan,
      }),
    );
    push(
      this.add.text(x, 262, tech.method.join('\n\n'), {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.white,
        wordWrap: { width: wrap },
        lineSpacing: 5,
      }),
    );
    push(
      this.add.text(x, 408, 'ON THE GLASS', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.magentaHot,
      }),
    );
    // Every example is a gaze path — problem → what you see → answer — so
    // they render one per line, the way the eye is meant to run them.
    push(
      this.add.text(x, 430, tech.examples.join('\n'), {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: CSS.yellow,
        wordWrap: { width: wrap },
        lineSpacing: 9,
      }),
    );

    // Where the player stands on it, straight from the skill table.
    const state = this.saves.save.skills[def.id];
    const fluentAt = def.baseDifficulty + CONFIG.waves.fluentMargin;
    let standing: string;
    let color: string;
    if (!state || state.attempts === 0) {
      standing = 'NO SIGNAL — NEVER MET IN COMBAT';
      color = CSS.cyanDim;
    } else if (state.rating >= fluentAt) {
      standing = `YOUR RATING ${Math.round(state.rating)} — FLUENT`;
      color = CSS.cyan;
    } else {
      standing = `YOUR RATING ${Math.round(state.rating)} — FLUENT AT ${fluentAt}`;
      color = def.id === recommended ? CSS.yellow : CSS.white;
    }
    push(
      this.add.text(x, 542, def.id === recommended ? `${standing}  ·  WEAKEST ON RECORD` : standing, {
        fontFamily: FONT,
        fontSize: '14px',
        color,
      }),
    );
  }

  private drill(def: SkillDef): void {
    getAudio(this)?.play('ui');
    this.registry.set(METEOR_DRILL_KEY, def.id);
    goTo(this, 'Game');
  }

  /** Open Exercise on this skill, if the focus dial can take it apart. */
  private work(def: SkillDef): void {
    if (!benchKindFor(def.id) !== undefined) {
      getAudio(this)?.play('error');
      this.cameras.main.shake(90, 0.004);
      return;
    }
    getAudio(this)?.play('ui');
    this.registry.set(EXERCISE_SKILL_KEY, def.id);
    goTo(this, 'Exercise');
  }
}
