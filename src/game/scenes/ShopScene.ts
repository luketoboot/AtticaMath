import Phaser from 'phaser';
import { CONFIG } from '../../core/config';
import { purchase, UPGRADES } from '../../core/economy/economy';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

export class ShopScene extends Phaser.Scene {
  private creditsText!: Phaser.GameObjects.Text;

  constructor() {
    super('Shop');
  }

  create(): void {
    const { width, height } = this.scale;
    const saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    applyCrt(this);
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);

    this.add
      .text(width / 2, height * 0.1, 'ARMORY', {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.creditsText = this.add
      .text(width / 2, height * 0.18, '', { fontFamily: FONT, fontSize: '22px', color: CSS.yellow })
      .setOrigin(0.5);
    this.refreshCredits(saves);

    UPGRADES.forEach((u, i) => {
      const y = height * 0.3 + i * 90;
      const price = CONFIG.economy.prices[u.id] ?? 0;
      const owned = saves.save.ownedUpgrades.includes(u.id);

      const name = this.add.text(width * 0.2, y, u.name, {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: owned ? CSS.cyanDim : CSS.cyan,
      });
      this.add.text(width * 0.2, y + 32, u.description, {
        fontFamily: FONT,
        fontSize: '16px',
        color: CSS.white,
      });

      const buyLabel = owned ? 'OWNED' : `BUY ${price}`;
      const buy = this.add
        .text(width * 0.8, y, `[ ${buyLabel} ]`, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: owned ? CSS.cyanDim : CSS.magentaHot,
        })
        .setOrigin(1, 0);

      if (!owned) {
        buy.setInteractive({ useHandCursor: true });
        buy.on('pointerdown', () => {
          const res = purchase(u.id, saves.save.credits, saves.save.ownedUpgrades, CONFIG.economy);
          if (res.ok) {
            saves.save.credits = res.credits;
            saves.save.ownedUpgrades = res.owned;
            saves.persist();
            buy.disableInteractive();
            buy.setText('[ OWNED ]').setColor(CSS.cyanDim);
            name.setColor(CSS.cyanDim);
            this.refreshCredits(saves);
          } else {
            this.cameras.main.shake(120, 0.005);
          }
        });
      }
    });

    const back = this.add
      .text(width / 2, height * 0.92, '[ BACK ]', {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(CSS.magentaHot));
    back.on('pointerout', () => back.setColor(CSS.cyan));
    back.on('pointerdown', () => this.scene.start('Menu'));
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));
  }

  private refreshCredits(saves: SaveManager): void {
    this.creditsText.setText(`CREDITS ${saves.save.credits}`);
  }
}
