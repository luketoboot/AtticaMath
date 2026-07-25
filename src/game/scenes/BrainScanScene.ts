import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import { earnedMilestones } from '../../core/skills/milestones';
import { SKILLS, type SkillDef } from '../../core/skills/taxonomy';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { neonButton } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

const GROUPS: readonly { title: string; ops: readonly string[] }[] = [
  { title: 'ADDITION', ops: ['add'] },
  { title: 'SUBTRACTION', ops: ['sub'] },
  { title: 'DIVISION', ops: ['div'] },
  { title: 'MIXED', ops: ['mixed'] },
  { title: 'MULTIPLICATION', ops: ['mul'] },
];

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
    this.add
      .text(width / 2, 78, 'WHAT THE MACHINE THINKS YOU KNOW', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const mastered = new Set(earnedMilestones(saves.save.skills, CONFIG).map((m) => m.id));

    // Left column: add/sub/div/mixed. Right column: multiplication.
    const leftGroups = GROUPS.slice(0, 4);
    const rightGroups = GROUPS.slice(4);
    this.renderColumn(leftGroups, width * 0.06, width * 0.44, saves, mastered);
    this.renderColumn(rightGroups, width * 0.56, width * 0.94, saves, mastered);

    const goBack = (): void => {
      this.scene.start('Menu');
    };
    // Sits a line higher than the other screens' BACK to leave room for the
    // hint below it; the skill columns bottom out around y=640.
    const back = neonButton(this, width / 2, height - 52, 'BACK', goBack, {
      width: 200,
      height: 44,
      fontSize: 19,
    });
    this.input.keyboard?.once('keydown-ESC', goBack);

    new MenuNav(this, [[back]]);
    navHint(this);
  }

  private renderColumn(
    groups: readonly { title: string; ops: readonly string[] }[],
    x0: number,
    x1: number,
    saves: SaveManager,
    mastered: ReadonlySet<string>,
  ): void {
    let y = 116;
    for (const group of groups) {
      this.add.text(x0, y, group.title, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: CSS.magentaHot });
      y += 24;
      for (const skill of SKILLS.filter((s) => group.ops.includes(s.op))) {
        this.renderRow(skill, y, x0, x1, saves, mastered);
        y += 27;
      }
      y += 10;
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
    const barX = x0 + 220;
    const barW = x1 - barX - 60;

    this.add.text(x0, y, skill.label.toUpperCase(), {
      fontFamily: FONT,
      fontSize: '13px',
      color: state ? CSS.white : CSS.cyanDim,
    });

    if (!state || state.attempts === 0) {
      this.add.text(barX, y, 'NO SIGNAL', { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim });
      return;
    }

    // Bar spans from "struggling" (base - 300) to mastery (base + masteryMargin).
    const floor = skill.baseDifficulty - 300;
    const ceiling = skill.baseDifficulty + CONFIG.rating.masteryMargin;
    const progress = Phaser.Math.Clamp((state.rating - floor) / (ceiling - floor), 0.02, 1);

    this.add.rectangle(barX, y + 7, barW, 10, PALETTE.deepPurple).setOrigin(0, 0.5);
    this.add
      .rectangle(barX, y + 7, barW * progress, 10, isMastered ? PALETTE.yellow : PALETTE.cyan)
      .setOrigin(0, 0.5);
    this.add
      .text(x1, y, isMastered ? '★' : String(Math.round(state.rating)), {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: isMastered ? CSS.yellow : CSS.cyanDim,
      })
      .setOrigin(1, 0);
  }
}
