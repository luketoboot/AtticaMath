import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
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
      .text(width / 2, height * 0.09, 'ARMORY', {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.creditsText = this.add
      .text(width / 2, height * 0.17, '', { fontFamily: FONT, fontSize: '22px', color: CSS.yellow })
      .setOrigin(0.5);
    this.refreshCredits(saves);

    this.add
      .text(width / 2, height * 0.22, 'OWNED GEAR MOUNTS FOR THE NEXT RUN — CLICK TO EQUIP OR STOW', {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    UPGRADES.forEach((u, i) => {
      const y = height * 0.29 + i * 88;
      const price = CONFIG.economy.prices[u.id] ?? 0;

      const name = this.add.text(width * 0.16, y, u.name, {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: CSS.cyan,
      });
      this.add.text(width * 0.16, y + 32, u.description, {
        fontFamily: FONT,
        fontSize: '16px',
        color: CSS.white,
      });

      const action = this.add
        .text(width * 0.84, y, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.magentaHot })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });

      const render = (): void => {
        const owned = saves.save.ownedUpgrades.includes(u.id);
        const equipped = saves.save.loadout.includes(u.id);
        if (!owned) {
          action.setText(`[ BUY ${price} ]`).setColor(CSS.magentaHot);
          name.setColor(CSS.cyan);
        } else if (equipped) {
          action.setText('[ EQUIPPED ]').setColor(CSS.yellow);
          name.setColor(CSS.yellow);
        } else {
          action.setText('[ STOWED ]').setColor(CSS.cyanDim);
          name.setColor(CSS.cyanDim);
        }
      };
      render();

      action.on('pointerdown', () => {
        const audio = getAudio(this);
        const owned = saves.save.ownedUpgrades.includes(u.id);
        if (!owned) {
          const res = purchase(u.id, saves.save.credits, saves.save.ownedUpgrades, CONFIG.economy);
          if (res.ok) {
            saves.save.credits = res.credits;
            saves.save.ownedUpgrades = res.owned;
            saves.save.loadout = [...saves.save.loadout, u.id];
            saves.persist();
            audio?.play('purchase');
            this.refreshCredits(saves);
          } else {
            audio?.play('error');
            this.cameras.main.shake(120, 0.005);
          }
        } else if (saves.save.loadout.includes(u.id)) {
          saves.save.loadout = saves.save.loadout.filter((id) => id !== u.id);
          saves.persist();
          audio?.play('ui');
        } else {
          saves.save.loadout = [...saves.save.loadout, u.id];
          saves.persist();
          audio?.play('ui');
        }
        render();
      });
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
    back.on('pointerdown', () => {
      getAudio(this)?.play('ui');
      this.scene.start('Menu');
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));
  }

  private refreshCredits(saves: SaveManager): void {
    this.creditsText.setText(`CREDITS ${saves.save.credits}`);
  }
}
