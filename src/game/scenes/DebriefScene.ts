import Phaser from 'phaser';
import type { RunStats } from '../../core/economy/economy';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';

interface DebriefData {
  stats: RunStats;
  credits: number;
}

export class DebriefScene extends Phaser.Scene {
  constructor() {
    super('Debrief');
  }

  create(data: DebriefData): void {
    const { width, height } = this.scale;
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
      const y = height * 0.34 + i * 40;
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

    this.add
      .text(width / 2, height * 0.62, 'OPERATOR // Debrief logged. The rocks don’t care. Neither do I. Go again.', {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.magentaHot,
        wordWrap: { width: width * 0.7 },
        align: 'center',
      })
      .setOrigin(0.5);

    this.makeButton(width / 2, height * 0.74, 'RELAUNCH', () => this.scene.start('Game'));
    this.makeButton(width / 2, height * 0.82, 'ARMORY', () => this.scene.start('Shop'));
    this.makeButton(width / 2, height * 0.9, 'MENU', () => this.scene.start('Menu'));

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Game'));
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
    const text = this.add
      .text(x, y, `[ ${label} ]`, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: CSS.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor(CSS.magentaHot));
    text.on('pointerout', () => text.setColor(CSS.cyan));
    text.on('pointerdown', onClick);
  }
}
