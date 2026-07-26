import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { CONFIG } from '../../core/config';
import {
  badgeFor,
  burstFor,
  buyCosmetic,
  cannonFor,
  COSMETIC_KINDS,
  cosmeticsOfKind,
  hullFor,
  isOwned,
  SLOT_FOR_KIND,
  trailFor,
  unlockState,
  type CosmeticDef,
  type CosmeticKind,
  type CosmeticProgress,
} from '../../core/cosmetics/cosmetics';
import { applyCrt } from '../../fx/applyCrt';
import { shake } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { paintBadge } from '../../ui/badges';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, neonChip, paintPanel } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { drawCannonShape, drawHull } from '../ShipGfx';

/** Tiles per row. Ten items fit two rows without the shelf leaving the screen. */
const GRID_COLS = 5;

interface ShopSceneData {
  /** Shelf to open on. Survives the restart a tab change performs. */
  kind?: CosmeticKind;
}

interface Tile {
  def: CosmeticDef;
  panel: Phaser.GameObjects.Graphics;
  price: Phaser.GameObjects.Text;
  art: Phaser.GameObjects.Container;
}

/**
 * THE HANGAR — the only place credits go.
 *
 * Nothing sold here changes a run. That is deliberate: the leaderboard is the
 * reason to come back, and a board is only worth chasing if every entry was set
 * under the same rules. So credits buy a silhouette and an engine colour, and
 * the ship still turns at exactly the same rate.
 *
 * Five shelves, one per surface the player looks at, and a preview that is the
 * whole left column — a list of names would not sell a ship. Items with an
 * unlock show what they are waiting for instead of a price, because a locked
 * item quoting a number would send the player off to grind the wrong thing.
 */
export class ShopScene extends Phaser.Scene {
  private saves!: SaveManager;
  private creditsText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private preview!: Phaser.GameObjects.Container;
  private previewArt: Phaser.GameObjects.GameObject[] = [];
  private tiles: Tile[] = [];
  private kind: CosmeticKind = 'hull';
  private shown: CosmeticDef | null = null;

  constructor() {
    super('Shop');
  }

  create(data: ShopSceneData): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    this.tiles = [];
    this.previewArt = [];
    this.shown = null;
    this.kind = data.kind ?? 'hull';
    getAudio(this)?.playMusic('menu');
    applyCrt(this);
    drawBackdrop(this, { sun: false, horizon: 0.97 });

    makeIcon(this, width / 2 - 128, 46, 'hangar', {
      size: 40,
      color: PALETTE.cyan,
      dim: PALETTE.magenta,
    });
    this.add
      .text(width / 2 + 16, 46, 'HANGAR', {
        fontFamily: FONT,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);
    this.creditsText = this.add
      .text(width - 40, 46, '', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(1, 0.5);
    this.add
      .text(width / 2, 82, 'PAINT AND PANELS ONLY — NOTHING HERE CHANGES A RUN', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    // Shelf tabs. Switching restarts the scene into the new shelf, so the
    // grid, the preview and the nav are all rebuilt in one stroke.
    const tabs = COSMETIC_KINDS.map((entry, i) => {
      const x = width / 2 + (i - (COSMETIC_KINDS.length - 1) / 2) * 176;
      const chip = neonChip(
        this,
        x,
        128,
        entry.label,
        () => {
          if (entry.kind !== this.kind) this.scene.restart({ kind: entry.kind });
        },
        { size: 44, width: 160, fontSize: 17, accent: PALETTE.magenta },
      );
      chip.setChosen(entry.kind === this.kind);
      return chip;
    });
    this.add
      .text(width / 2, 164, COSMETIC_KINDS.find((k) => k.kind === this.kind)?.blurb ?? '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5);

    this.buildPreview(width * 0.2, height * 0.55);

    const defs = cosmeticsOfKind(this.kind);
    const grid = this.buildGrid(defs);

    const goBack = (): void => {
      this.scene.start('Menu');
    };
    const back = neonButton(this, width / 2, height - 62, 'BACK', goBack, {
      width: 220,
      height: 46,
      fontSize: 20,
    });
    this.input.keyboard?.once('keydown-ESC', goBack);

    const nav = new MenuNav(this, [tabs, ...grid, [back]]);
    nav.setColumn(0, Math.max(0, COSMETIC_KINDS.findIndex((k) => k.kind === this.kind)));
    // Open on whatever is worn, so the shelf lands on the player's own taste.
    const wornId = this.saves.save.equipped[SLOT_FOR_KIND[this.kind]];
    const wornAt = Math.max(0, defs.findIndex((d) => d.id === wornId));
    nav.focus(1 + Math.floor(wornAt / GRID_COLS), wornAt % GRID_COLS, false);
    const opening = defs[wornAt];
    if (opening) this.showDetail(opening);

    navHint(this, height - 20);
    this.refresh();
  }

  /** Credits, best run and lifetime waves — everything an unlock can read. */
  private progress(): CosmeticProgress {
    const save = this.saves.save;
    return {
      bestScore: save.bestScore,
      totalWaves: save.totalWaves,
      milestones: save.milestones,
    };
  }

  /** The item on show, big, in a lit bay. */
  private buildPreview(x: number, y: number): void {
    const panel = this.add.graphics({ x, y });
    paintPanel(panel, {
      width: 300,
      height: 290,
      accent: PALETTE.cyan,
      chamfer: 20,
      fillAlpha: 0.35,
      headerRule: false,
    });

    this.preview = this.add.container(x, y - 8);
    // A slow yaw rather than a spin: enough to show a silhouette from more
    // than one angle without turning the shop into a screensaver.
    this.tweens.add({
      targets: this.preview,
      angle: { from: -12, to: 12 },
      duration: 3400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.nameText = this.add
      .text(x, y + 172, '', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.white,
      })
      .setOrigin(0.5);
    this.descText = this.add
      .text(x, y + 200, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
        align: 'center',
        wordWrap: { width: 280 },
      })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(x, y + 244, '', {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: CSS.yellow,
      })
      .setOrigin(0.5);
  }

  /** Repaint the preview bay with one item, at display scale. */
  private renderPreview(def: CosmeticDef): void {
    for (const obj of this.previewArt) obj.destroy();
    this.previewArt = this.itemArt(def, 'preview');
    this.preview.removeAll(false);
    this.preview.add(this.previewArt);
  }

  /**
   * The art for one item, at tile or preview size. One builder for both so a
   * thing can never look like one item on the shelf and another in the bay.
   */
  private itemArt(def: CosmeticDef, size: 'tile' | 'preview'): Phaser.GameObjects.GameObject[] {
    const big = size === 'preview';
    switch (def.kind) {
      case 'hull': {
        const g = this.add.graphics();
        drawHull(g, hullFor(def.id), PALETTE.cyan, big ? CONFIG.flight.shipRadius * 2.4 : 21);
        return [g];
      }
      case 'trail': {
        const t = trailFor(def.id);
        const g = this.add.graphics();
        const s = big ? 3.4 : 1;
        g.fillStyle(t.flame, 1);
        g.fillTriangle(-11 * s, -16 * s, 11 * s, -16 * s, 0, 22 * s);
        g.fillStyle(t.spark, 0.85);
        g.fillCircle(0, -22 * s, 6 * s);
        return [g];
      }
      case 'cannon': {
        const g = this.add.graphics();
        drawCannonShape(g, cannonFor(def.id), PALETTE.cyan, big ? 2.4 : 0.62);
        // Cannons are drawn sitting on y=0, so lift them to sit centred.
        g.y = big ? 46 : 14;
        return [g];
      }
      case 'burst': {
        const b = burstFor(def.id);
        const g = this.add.graphics();
        const r = big ? 60 : 17;
        g.fillStyle(b.spark, 0.35);
        g.fillCircle(0, 0, r);
        g.fillStyle(b.core, 1);
        g.fillCircle(0, 0, r * 0.5);
        // Shards, so a burst reads as an explosion rather than a dot.
        g.lineStyle(big ? 5 : 2, b.core, 0.95);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.lineBetween(
            Math.cos(a) * r * 0.7,
            Math.sin(a) * r * 0.7,
            Math.cos(a) * r * 1.35,
            Math.sin(a) * r * 1.35,
          );
        }
        return [g];
      }
      case 'badge': {
        const b = badgeFor(def.id);
        const g = this.add.graphics();
        paintBadge(g, b.shape, b.color, big ? 130 : 34);
        return [g];
      }
    }
  }

  /** The shelf: a grid of tiles. Landing previews, ENTER buys or wears. */
  private buildGrid(defs: readonly CosmeticDef[]): MenuItem[][] {
    const { width } = this.scale;
    const left = width * 0.42;
    const shelf = width * 0.54;
    const rows: MenuItem[][] = [];

    defs.forEach((def, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = left + shelf * ((col + 0.5) / GRID_COLS);
      const y = 232 + row * 150;

      const container = this.add.container(x, y);
      const panel = this.add.graphics();
      container.add([this.add.rectangle(0, 0, 116, 132, 0x000000, 0), panel]);

      const art = this.add.container(0, -14, this.itemArt(def, 'tile'));
      container.add(art);
      container.add(
        this.add
          .text(0, 36, def.name, {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: CSS.white,
          })
          .setOrigin(0.5),
      );
      const price = this.add
        .text(0, 54, '', {
          fontFamily: FONT,
          fontSize: '11px',
          color: CSS.yellow,
          align: 'center',
          wordWrap: { width: 112 },
        })
        .setOrigin(0.5, 0);
      container.add(price);

      container.setSize(116, 132);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-58, -66, 116, 132),
        Phaser.Geom.Rectangle.Contains,
      );
      container.input!.cursor = 'pointer';
      container.on('pointerdown', () => this.act(def));

      this.tiles.push({ def, panel, price, art });
      if (!rows[row]) rows[row] = [];
      rows[row]!.push({
        target: container,
        onFocus: () => this.showDetail(def),
        onSelect: () => this.act(def),
      });
    });

    return rows;
  }

  /**
   * Buy it if it is not owned, wear it if it is. One key does both, because
   * from the player's side those are the same intention.
   */
  private act(def: CosmeticDef): void {
    const save = this.saves.save;
    const audio = getAudio(this);

    if (!isOwned(def.id, save.ownedCosmetics)) {
      const res = buyCosmetic(def.id, save.credits, save.ownedCosmetics, this.progress());
      if (!res.ok) {
        audio?.play('error');
        shake(this, 120, 0.005);
        this.showDetail(def);
        return;
      }
      save.credits = res.credits;
      save.ownedCosmetics = res.owned;
      audio?.play('purchase');
    } else {
      audio?.play('ui');
    }

    save.equipped[SLOT_FOR_KIND[def.kind]] = def.id;
    this.saves.persist();
    this.showDetail(def);
    this.refresh();
  }

  private showDetail(def: CosmeticDef): void {
    this.shown = def;
    this.nameText.setText(def.name);
    this.descText.setText(def.description);
    this.renderPreview(def);

    const save = this.saves.save;
    const owned = isOwned(def.id, save.ownedCosmetics);
    const worn = save.equipped[SLOT_FOR_KIND[def.kind]] === def.id;
    const lock = unlockState(def, this.progress());

    if (worn) this.statusText.setText('EQUIPPED').setColor(CSS.yellow);
    else if (owned) this.statusText.setText('OWNED — ENTER TO WEAR').setColor(CSS.cyan);
    else if (!lock.unlocked) {
      this.statusText.setText(`LOCKED — ${lock.requirement ?? ''}`).setColor(CSS.red);
    } else if (save.credits < def.price) {
      this.statusText.setText(`${def.price} CREDITS — SHORT`).setColor(CSS.red);
    } else this.statusText.setText(`${def.price} CREDITS — ENTER TO BUY`).setColor(CSS.yellow);
  }

  /** Repaint every tile from the save. */
  private refresh(): void {
    const save = this.saves.save;
    const progress = this.progress();
    this.creditsText.setText(`CREDITS ${save.credits}`);

    for (const tile of this.tiles) {
      const owned = isOwned(tile.def.id, save.ownedCosmetics);
      const worn = save.equipped[SLOT_FOR_KIND[tile.def.kind]] === tile.def.id;
      const lock = unlockState(tile.def, progress);
      const affordable = owned || save.credits >= tile.def.price;

      const accent = worn
        ? PALETTE.yellow
        : owned
          ? PALETTE.cyan
          : !lock.unlocked
            ? PALETTE.deepPurple
            : affordable
              ? PALETTE.purple
              : PALETTE.deepPurple;

      paintPanel(tile.panel, {
        width: 116,
        height: 132,
        accent,
        chamfer: 10,
        fillAlpha: worn ? 0.85 : 0.4,
        borderWidth: worn ? 3 : 2,
        headerRule: false,
      });
      // A locked item shows its requirement, never its price: quoting a number
      // for something that is not for sale sends the player to grind credits
      // when what they actually need is to go and get better.
      if (worn) tile.price.setText('EQUIPPED').setColor(CSS.yellow);
      else if (owned) tile.price.setText('OWNED').setColor(CSS.cyanDim);
      else if (!lock.unlocked) tile.price.setText(lock.requirement ?? 'LOCKED').setColor(CSS.red);
      else tile.price.setText(`${tile.def.price}`).setColor(affordable ? CSS.yellow : CSS.red);

      // Locked art is dimmed to a silhouette — visible enough to want.
      tile.art.setAlpha(!owned && !lock.unlocked ? 0.25 : owned || affordable ? 1 : 0.55);
    }

    if (this.shown) this.showDetail(this.shown);
  }
}
