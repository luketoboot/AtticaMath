import Phaser from 'phaser';
import { CSS, FONT, PALETTE } from '../fx/palette';

/**
 * On-screen numpad for touch play (Meteor Defense). Compact 3x4 grid in the
 * bottom-right corner; semi-transparent so the field stays visible behind it.
 */
export class Numpad {
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    onDigit: (digit: string) => void,
    onClear: () => void,
  ) {
    const { width, height } = scene.scale;
    const cell = 62;
    const gap = 6;
    const cols = 3;
    const layout = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', ''];

    const gridW = cols * cell + (cols - 1) * gap;
    const originX = width - gridW - 18;
    const originY = height - 4 * cell - 3 * gap - 110;

    const children: Phaser.GameObjects.GameObject[] = [];
    layout.forEach((label, i) => {
      if (label === '') return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cell + cell / 2;
      const y = row * cell + cell / 2;
      const bg = scene.add
        .rectangle(x, y, cell - 4, cell - 4, PALETTE.deepPurple, 0.55)
        .setStrokeStyle(2, label === '⌫' ? PALETTE.magenta : PALETTE.cyanDim, 0.9);
      const text = scene.add
        .text(x, y, label, {
          fontFamily: FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: label === '⌫' ? CSS.magentaHot : CSS.cyan,
        })
        .setOrigin(0.5)
        .setAlpha(0.9);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        bg.setFillStyle(PALETTE.purple, 0.8);
        scene.time.delayedCall(90, () => bg.setFillStyle(PALETTE.deepPurple, 0.55));
        if (label === '⌫') onClear();
        else onDigit(label);
      });
      children.push(bg, text);
    });

    this.container = scene.add.container(originX, originY, children).setDepth(10);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  get visible(): boolean {
    return this.container.visible;
  }
}

/** Coarse-pointer heuristic: default the pad on for touch-first devices. */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}
