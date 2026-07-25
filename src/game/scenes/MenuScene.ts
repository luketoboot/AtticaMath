import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const { width, height } = this.scale;
    const saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);

    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.drawGrid();

    const title = this.add
      .text(width / 2, height * 0.24, 'METEOR MATH', {
        fontFamily: FONT,
        fontSize: '72px',
        fontStyle: 'bold',
        color: CSS.magenta,
        stroke: CSS.cyan,
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.85 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(width / 2, height * 0.24 + 58, 'TYPE THE ANSWER. SAVE THE BASE.', {
        fontFamily: FONT,
        fontSize: '18px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    const stats = saves.save;
    this.add
      .text(width / 2, height * 0.38, `CREDITS ${stats.credits}    BEST ${stats.bestScore}`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: CSS.yellow,
      })
      .setOrigin(0.5);

    const entries: readonly [string, string][] = [
      ['METEOR DEFENSE', 'ModeSelect'],
      ['EXPRESSION BUILDER', 'Expression'],
      ['BOSS RUSH', 'Boss'],
      ['ARMORY', 'Shop'],
      ['BRAIN SCAN', 'BrainScan'],
      ['SETTINGS', 'Settings'],
    ];
    const rows = entries.map(([label, target], i) => [
      this.makeButton(width / 2, height * (0.46 + i * 0.07), label, () => this.scene.start(target)),
    ]);

    new MenuNav(this, rows);
    navHint(this, height - 12);
  }

  private drawGrid(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.lineStyle(1, PALETTE.deepPurple, 0.7);
    const horizon = height * 0.82;
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * width;
      g.lineBetween(width / 2 + (x - width / 2) * 0.2, horizon, x, height);
    }
    for (let i = 0; i < 8; i++) {
      const y = horizon + (height - horizon) * Math.pow(i / 8, 1.8);
      g.lineBetween(0, y, width, y);
    }
    g.lineStyle(2, PALETTE.magenta, 0.5);
    g.lineBetween(0, horizon, width, horizon);
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): MenuItem {
    const text = this.add
      .text(x, y, `[ ${label} ]`, {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor(CSS.magentaHot));
    text.on('pointerout', () => text.setColor(CSS.cyan));
    const select = (): void => {
      getAudio(this)?.play('ui');
      onClick();
    };
    text.on('pointerdown', select);
    return { target: text, onSelect: select };
  }
}
