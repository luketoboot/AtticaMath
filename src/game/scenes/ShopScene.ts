import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import {
  buyCosmetic,
  hullFor,
  isOwned,
  trailFor,
  HULLS,
  TRAILS,
  type CosmeticDef,
} from '../../core/cosmetics/cosmetics';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, paintPanel } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { drawHull } from '../ShipGfx';

/**
 * THE HANGAR — the only place credits go.
 *
 * Nothing sold here changes a run. That is deliberate: the leaderboard is the
 * reason to come back, and a board is only worth chasing if every entry was set
 * under the same rules. So credits buy a silhouette and an engine colour, and
 * the ship still turns at exactly the same rate.
 *
 * The preview is the whole screen. A list of names would not sell a ship.
 */
export class ShopScene extends Phaser.Scene {
  private saves!: SaveManager;
  private creditsText!: Phaser.GameObjects.Text;
  private preview!: Phaser.GameObjects.Container;
  private previewHull!: Phaser.GameObjects.Graphics;
  private previewFlame!: Phaser.GameObjects.Graphics;
  private nameText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;
  private tiles: { def: CosmeticDef; panel: Phaser.GameObjects.Graphics; price: Phaser.GameObjects.Text }[] =
    [];

  constructor() {
    super('Shop');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    this.tiles = [];
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.96 });

    makeIcon(this, width / 2 - 128, height * 0.085, 'hangar', {
      size: 44,
      color: PALETTE.cyan,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 20, height * 0.085, 'HANGAR', {
        fontFamily: FONT,
        fontSize: '46px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.creditsText = this.add
      .text(width - 40, height * 0.085, '', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(1, 0.5);

    this.add
      .text(width / 2, height * 0.15, 'PAINT AND PANELS ONLY — NOTHING HERE CHANGES A RUN', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.buildPreview(width * 0.22, height * 0.44);

    const rows: MenuItem[][] = [];
    rows.push(this.buildRow(HULLS, height * 0.3, 'HULL'));
    rows.push(this.buildRow(TRAILS, height * 0.58, 'ENGINE'));

    const goBack = (): void => {
      this.scene.start('Menu');
    };
    rows.push([
      neonButton(this, width / 2, height * 0.87, 'BACK', goBack, {
        width: 220,
        height: 48,
        fontSize: 20,
      }),
    ]);
    this.input.keyboard?.once('keydown-ESC', goBack);

    new MenuNav(this, rows);
    navHint(this, height * 0.95);
    this.refresh();
  }

  /** The ship, turning slowly, wearing whatever is equipped right now. */
  private buildPreview(x: number, y: number): void {
    const panel = this.add.graphics({ x, y });
    paintPanel(panel, {
      width: 300,
      height: 300,
      accent: PALETTE.cyan,
      chamfer: 20,
      fillAlpha: 0.35,
      headerRule: false,
    });

    this.previewFlame = this.add.graphics();
    this.previewHull = this.add.graphics();
    this.preview = this.add.container(x, y - 10, [this.previewFlame, this.previewHull]);
    this.preview.setScale(2.6);
    // A slow yaw rather than a spin: enough to show the silhouette from more
    // than one angle without turning the shop into a screensaver.
    this.tweens.add({
      targets: this.preview,
      angle: { from: -14, to: 14 },
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.nameText = this.add
      .text(x, y + 118, '', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0.5);
    this.descText = this.add
      .text(x, y + 146, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
        align: 'center',
        wordWrap: { width: 270 },
      })
      .setOrigin(0.5);
  }

  /** One shelf of tiles. Landing on a tile previews it; ENTER buys or equips. */
  private buildRow(defs: readonly CosmeticDef[], y: number, label: string): MenuItem[] {
    const { width } = this.scale;
    const left = width * 0.42;
    const shelf = width * 0.52;

    this.add
      .text(left, y - 62, label, {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: CSS.cyanDim,
      })
      .setOrigin(0, 0.5);

    return defs.map((def, i) => {
      const x = left + shelf * ((i + 0.5) / defs.length);
      const container = this.add.container(x, y);
      const panel = this.add.graphics();
      container.add([this.add.rectangle(0, 0, 108, 116, 0x000000, 0), panel]);

      if (def.kind === 'hull') {
        const g = this.add.graphics();
        drawHull(g, hullFor(def.id), PALETTE.cyan, 22);
        container.add(g);
      } else {
        const t = trailFor(def.id);
        const g = this.add.graphics();
        g.fillStyle(t.flame, 1);
        g.fillTriangle(-11, -16, 11, -16, 0, 22);
        g.fillStyle(t.spark, 0.85);
        g.fillCircle(0, -22, 6);
        container.add(g);
      }

      container.add(
        this.add
          .text(0, 34, def.name, {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: CSS.white,
          })
          .setOrigin(0.5),
      );
      const price = this.add
        .text(0, 50, '', { fontFamily: FONT, fontSize: '12px', color: CSS.yellow })
        .setOrigin(0.5);
      container.add(price);

      container.setSize(108, 116);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-54, -58, 108, 116),
        Phaser.Geom.Rectangle.Contains,
      );
      container.input!.cursor = 'pointer';
      container.on('pointerdown', () => this.act(def));

      this.tiles.push({ def, panel, price });
      return {
        target: container,
        onFocus: () => this.showDetail(def),
        onSelect: () => this.act(def),
      };
    });
  }

  /**
   * Buy it if it is not owned, wear it if it is. One key does both, because
   * from the player's side those are the same intention.
   */
  private act(def: CosmeticDef): void {
    const save = this.saves.save;
    const audio = getAudio(this);

    if (!isOwned(def.id, save.ownedCosmetics)) {
      const res = buyCosmetic(def.id, save.credits, save.ownedCosmetics);
      if (!res.ok) {
        audio?.play('error');
        this.cameras.main.shake(120, 0.005);
        return;
      }
      save.credits = res.credits;
      save.ownedCosmetics = res.owned;
      audio?.play('purchase');
    } else {
      audio?.play('ui');
    }

    if (def.kind === 'hull') save.equipped.hull = def.id;
    else save.equipped.trail = def.id;
    this.saves.persist();
    this.showDetail(def);
    this.refresh();
  }

  private showDetail(def: CosmeticDef): void {
    this.nameText.setText(def.name);
    this.descText.setText(def.description);
  }

  /** Repaint every tile and the preview from the save. */
  private refresh(): void {
    const save = this.saves.save;
    this.creditsText.setText(`CREDITS ${save.credits}`);

    for (const tile of this.tiles) {
      const owned = isOwned(tile.def.id, save.ownedCosmetics);
      const worn =
        tile.def.kind === 'hull'
          ? save.equipped.hull === tile.def.id
          : save.equipped.trail === tile.def.id;
      const affordable = owned || save.credits >= tile.def.price;

      paintPanel(tile.panel, {
        width: 108,
        height: 116,
        accent: worn ? PALETTE.yellow : owned ? PALETTE.cyan : affordable ? PALETTE.purple : PALETTE.deepPurple,
        chamfer: 10,
        fillAlpha: worn ? 0.85 : 0.4,
        borderWidth: worn ? 3 : 2,
        headerRule: false,
      });
      tile.price
        .setText(worn ? 'EQUIPPED' : owned ? 'OWNED' : `${tile.def.price}`)
        .setColor(worn ? CSS.yellow : owned ? CSS.cyanDim : affordable ? CSS.yellow : CSS.red);
    }

    const hull = hullFor(save.equipped.hull);
    const trail = trailFor(save.equipped.trail);
    drawHull(this.previewHull, hull, PALETTE.cyan, CONFIG.flight.shipRadius);
    this.previewFlame.clear();
    this.previewFlame.fillStyle(trail.flame, 0.95);
    this.previewFlame.fillTriangle(-7, 12, 7, 12, 0, 34);
    this.previewFlame.fillStyle(trail.spark, 0.7);
    this.previewFlame.fillTriangle(-4, 26, 4, 26, 0, 46);
  }
}
