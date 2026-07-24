import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
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

    this.makeButton(width / 2, height * 0.46, 'METEOR DEFENSE', () => this.scene.start('ModeSelect'));
    this.makeButton(width / 2, height * 0.53, 'EXPRESSION BUILDER', () => this.scene.start('Expression'));
    this.makeButton(width / 2, height * 0.6, 'BOSS RUSH', () => this.scene.start('Boss'));
    this.makeButton(width / 2, height * 0.67, 'ARMORY', () => this.scene.start('Shop'));
    this.makeButton(width / 2, height * 0.74, 'BRAIN SCAN', () => this.scene.start('BrainScan'));
    this.makeButton(width / 2, height * 0.81, 'SETTINGS', () => this.scene.start('Settings'));

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('ModeSelect'));
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('ModeSelect'));
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

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
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
    text.on('pointerdown', () => {
      getAudio(this)?.play('ui');
      onClick();
    });
  }
}
