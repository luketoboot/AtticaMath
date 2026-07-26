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
import { glowPulse, shake } from '../../fx/juice';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { paintBadge } from '../../ui/badges';
import { drawBackdrop } from '../../ui/backdrop';
import { makeIcon } from '../../ui/icons';
import { MenuNav, navHint, type MenuItem } from '../../ui/MenuNav';
import { neonButton, neonChip, paintPanel } from '../../ui/panels';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';
import { drawCannonShape, drawFlame, drawHull } from '../ShipGfx';

/** Tiles per row. Ten items fit two rows without the shelf leaving the screen. */
const GRID_COLS = 5;

interface ShopSceneData {
  /** Shelf to open on. Survives the restart a tab change performs. */
  kind?: CosmeticKind;
}

interface Tile {
  def: CosmeticDef;
  container: Phaser.GameObjects.Container;
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
  /** Tweens animating the current diorama's proxies, killed on every rebuild. */
  private previewFx: Phaser.Tweens.Tween[] = [];
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
    this.previewFx = [];
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
    // Collection meter, mirroring CREDITS on the other shoulder: what you have
    // spent against what there is to have. Completionists need a denominator.
    const allDefs = COSMETIC_KINDS.flatMap((k) => [...cosmeticsOfKind(k.kind)]);
    const ownedTotal = allDefs.filter((d) => isOwned(d.id, this.saves.save.ownedCosmetics)).length;
    this.add
      .text(40, 46, `${ownedTotal}/${allDefs.length} COLLECTED`, {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: ownedTotal === allDefs.length ? CSS.yellow : CSS.cyan,
      })
      .setOrigin(0, 0.5);
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
      // Owned-of-total under each shelf, so a finished shelf can be seen from
      // here rather than discovered by walking into it.
      const shelf = cosmeticsOfKind(entry.kind);
      const shelfOwned = shelf.filter((d) => isOwned(d.id, this.saves.save.ownedCosmetics)).length;
      this.add
        .text(x, 152, `${shelfOwned}/${shelf.length}`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: shelfOwned === shelf.length ? CSS.yellow : CSS.cyanDim,
        })
        .setOrigin(0.5, 0);
      return chip;
    });
    // Sits between the tab counts (152) and the first tile row's top edge (184).
    this.add
      .text(width / 2, 168, COSMETIC_KINDS.find((k) => k.kind === this.kind)?.blurb ?? '', {
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

    // Motion belongs to each diorama, not the bay: a ship yaws, a leaderboard
    // row does not. renderPreview installs whatever the current shelf earns.
    this.preview = this.add.container(x, y - 8);

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

  /**
   * Repaint the bay with one item, shown where it actually appears in play.
   *
   * Not the item floating alone: hulls and engines preview on the flying ship
   * from the free-flight modes, cannons as the Meteor Defense turret, bursts as
   * the kill they decorate, badges on the hall-of-fame row they mark. Each
   * diorama is drawn by the same functions the modes use, so the bay can never
   * sell a look the game does not deliver — and the slots the item joins are
   * the player's own equipped gear, so browsing doubles as outfit planning.
   */
  private renderPreview(def: CosmeticDef): void {
    for (const fx of this.previewFx) fx.remove();
    this.previewFx = [];
    this.tweens.killTweensOf(this.preview);
    this.preview.removeAll(true);
    this.preview.setAngle(0).setScale(1);

    const worn = { ...this.saves.save.equipped, [SLOT_FOR_KIND[def.kind]]: def.id };
    const r = CONFIG.flight.shipRadius * 2.4;

    switch (def.kind) {
      case 'hull':
      case 'trail': {
        this.preview.add(this.shipParts(worn.hull, worn.trail, -22, r, def.kind === 'trail'));
        // A slow yaw rather than a spin: enough to show a silhouette from more
        // than one angle without turning the shop into a screensaver.
        this.previewFx.push(
          this.tweens.add({
            targets: this.preview,
            angle: { from: -10, to: 10 },
            duration: 3400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          }),
        );
        break;
      }
      case 'cannon':
        this.preview.add(this.turretParts(def.id));
        break;
      case 'burst':
        this.preview.add(this.killParts(worn, def.id, r));
        break;
      case 'badge':
        this.preview.add(this.podiumParts(def.id));
        break;
    }
  }

  /** The free-flight ship: equipped-or-browsed hull over a breathing exhaust. */
  private shipParts(
    hullId: string,
    trailId: string,
    y: number,
    r: number,
    engineFocus: boolean,
  ): Phaser.GameObjects.GameObject[] {
    const trail = trailFor(trailId);
    const base = engineFocus ? r * 1.15 : r * 0.9;
    // Tucked up so the exhaust roots under the hull. drawFlame starts the cone
    // a full radius below centre, which at flight scale is a couple of pixels
    // of gap but at bay scale reads as two separate objects.
    const flame = this.add.graphics({ y: y - (base - r * 0.7) });
    drawFlame(flame, trail, base);
    const hull = this.add.graphics({ y });
    drawHull(hull, hullFor(hullId), PALETTE.cyan, r);

    // The exhaust breathes — the one thing about an engine a static tile can
    // never show. Browsing the engine shelf breathes harder, since the flame
    // is the product there rather than the backdrop.
    const breath = { t: 0 };
    this.previewFx.push(
      this.tweens.add({
        targets: breath,
        t: 1,
        duration: engineFocus ? 240 : 340,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (flame.active) drawFlame(flame, trail, base * (1 + (engineFocus ? 0.24 : 0.12) * breath.t));
        },
      }),
    );
    return [flame, hull];
  }

  /** The Meteor Defense turret, charge glow pulsing under it. */
  private turretParts(cannonId: string): Phaser.GameObjects.GameObject[] {
    const glow = this.add.image(0, 26, 'glowdot').setScale(5).setTint(PALETTE.cyan).setAlpha(0.2);
    const g = this.add.graphics();
    drawCannonShape(g, cannonFor(cannonId), PALETTE.cyan, 2.4);
    // Cannons are drawn sitting on y=0, so lift them to sit centred.
    g.y = 46;
    const ground = this.add.graphics();
    ground.lineStyle(3, PALETTE.magenta, 0.7);
    ground.lineBetween(-96, 98, 96, 98);

    const charge = { t: 0 };
    this.previewFx.push(
      this.tweens.add({
        targets: charge,
        t: 1,
        duration: 720,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (glow.active) glow.setAlpha(0.18 + 0.2 * charge.t).setScale(4.6 + 1.4 * charge.t);
        },
      }),
    );
    return [glow, g, ground];
  }

  /** A kill in progress: your ship, a rock, and the browsed burst taking it. */
  private killParts(
    worn: Readonly<Record<keyof typeof SLOT_FOR_KIND, string>>,
    burstId: string,
    r: number,
  ): Phaser.GameObjects.GameObject[] {
    const ship = this.add.container(-52, 52, this.shipParts(worn.hull, worn.trail, 0, r * 0.62, false));
    ship.setAngle(38); // nose toward the rock

    const b = burstFor(burstId);
    const rock = this.add.image(56, -52, 'meteor');
    const burst = this.add.graphics({ x: 56, y: -52 });
    const drawPhase = (p: number): void => {
      const radius = 26 + 62 * p;
      const fade = 1 - p;
      burst.clear();
      burst.fillStyle(b.spark, 0.3 * fade);
      burst.fillCircle(0, 0, radius * 0.8);
      burst.fillStyle(b.core, fade);
      burst.fillCircle(0, 0, radius * 0.34);
      burst.lineStyle(4, b.core, 0.9 * fade);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        burst.lineBetween(
          Math.cos(a) * radius * 0.5,
          Math.sin(a) * radius * 0.5,
          Math.cos(a) * radius * 1.1,
          Math.sin(a) * radius * 1.1,
        );
      }
      rock.setAlpha(0.9 * fade);
    };
    // Starts mid-detonation so the bay never shows an intact rock with nothing
    // happening; the loop snapping back to this phase reads as the next kill.
    drawPhase(0.45);
    const boom = { p: 0.45 };
    this.previewFx.push(
      this.tweens.add({
        targets: boom,
        p: 1,
        duration: 820,
        repeat: -1,
        repeatDelay: 420,
        ease: 'Quad.easeOut',
        onUpdate: () => {
          if (burst.active) drawPhase(boom.p);
        },
      }),
    );
    return [ship, rock, burst];
  }

  /** The hall-of-fame row a badge actually marks, under the emblem itself. */
  private podiumParts(badgeId: string): Phaser.GameObjects.GameObject[] {
    const b = badgeFor(badgeId);
    const big = this.add.graphics({ y: -34 });
    paintBadge(big, b.shape, b.color, 108);

    const row = this.add.graphics();
    row.fillStyle(PALETTE.deepPurple, 0.85);
    row.fillRect(-122, 58, 244, 36);
    row.lineStyle(2, PALETTE.cyan, 0.5);
    row.strokeRect(-122, 58, 244, 36);
    const mini = this.add.graphics({ x: -78, y: 76 });
    paintBadge(mini, b.shape, b.color, 20);
    const style = { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold' };
    const rank = this.add.text(-110, 76, '#1', { ...style, color: CSS.yellow }).setOrigin(0.5);
    const name = this.add.text(-58, 76, 'YOU', { ...style, color: CSS.white }).setOrigin(0, 0.5);
    const score = this.add
      .text(112, 76, this.saves.save.bestScore.toLocaleString('en-US'), {
        ...style,
        color: CSS.cyan,
      })
      .setOrigin(1, 0.5);
    return [big, row, mini, rank, name, score];
  }

  /**
   * Shelf-tile art: the item alone, small and flat. The bay shows it in
   * context; the tile only has to be recognisable at a glance.
   */
  private itemArt(def: CosmeticDef): Phaser.GameObjects.GameObject[] {
    switch (def.kind) {
      case 'hull': {
        const g = this.add.graphics();
        drawHull(g, hullFor(def.id), PALETTE.cyan, 21);
        return [g];
      }
      case 'trail': {
        const t = trailFor(def.id);
        const g = this.add.graphics();
        g.fillStyle(t.flame, 1);
        g.fillTriangle(-11, -16, 11, -16, 0, 22);
        g.fillStyle(t.spark, 0.85);
        g.fillCircle(0, -22, 6);
        return [g];
      }
      case 'cannon': {
        const g = this.add.graphics();
        drawCannonShape(g, cannonFor(def.id), PALETTE.cyan, 0.62);
        // Cannons are drawn sitting on y=0, so lift them to sit centred.
        g.y = 14;
        return [g];
      }
      case 'burst': {
        const b = burstFor(def.id);
        const g = this.add.graphics();
        const r = 17;
        g.fillStyle(b.spark, 0.35);
        g.fillCircle(0, 0, r);
        g.fillStyle(b.core, 1);
        g.fillCircle(0, 0, r * 0.5);
        // Shards, so a burst reads as an explosion rather than a dot.
        g.lineStyle(2, b.core, 0.95);
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
        paintBadge(g, b.shape, b.color, 34);
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
      // Starts below the shelf blurb rather than on top of it: a 132-tall tile
      // centred at 232 has its top edge at 166, and the blurb sits at 164, so
      // the grid — drawn afterwards — used to paint straight over it. The
      // twelve-item shelf runs to three rows, which still clears BACK.
      const y = 250 + row * 150;

      const container = this.add.container(x, y);
      const panel = this.add.graphics();
      container.add([this.add.rectangle(0, 0, 116, 132, 0x000000, 0), panel]);

      const art = this.add.container(0, -14, this.itemArt(def));
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
      // No word wrap: a second line falls out of the tile's bottom border.
      // Long requirements shrink to fit one line instead (see refresh).
      const price = this.add
        .text(0, 54, '', {
          fontFamily: FONT,
          fontSize: '11px',
          color: CSS.yellow,
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

      this.tiles.push({ def, container, panel, price, art });
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
      this.celebrate(def);
    } else {
      audio?.play('ui');
    }

    save.equipped[SLOT_FOR_KIND[def.kind]] = def.id;
    this.saves.persist();
    this.showDetail(def);
    this.refresh();
    // Wearing something new lands a small beat in the bay — after showDetail,
    // which rebuilds the diorama and would wipe a tween added before it.
    this.tweens.add({
      targets: this.preview,
      scale: { from: 1.06, to: 1 },
      duration: 220,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * Buying fires the same two-sheet blast a kill gets. House rule is that every
   * correct answer feels like a kill; parting with 2000 credits should not land
   * softer than one correct answer.
   */
  private celebrate(def: CosmeticDef): void {
    const tile = this.tiles.find((t) => t.def.id === def.id);
    if (!tile) return;
    const { x, y } = tile.container;
    const burst = this.add
      .particles(x, y, 'particle', {
        speed: { min: 80, max: 420 },
        angle: { min: 0, max: 360 },
        lifespan: { min: 250, max: 700 },
        scale: { start: 2, end: 0 },
        tint: PALETTE.yellow,
        quantity: 26,
        emitting: false,
      })
      .setDepth(60);
    burst.explode(26);
    const core = this.add
      .particles(x, y, 'particle', {
        speed: { min: 200, max: 650 },
        angle: { min: 0, max: 360 },
        lifespan: { min: 120, max: 260 },
        scale: { start: 1.1, end: 0 },
        tint: 0xffffff,
        quantity: 14,
        emitting: false,
      })
      .setDepth(60);
    core.explode(14);
    this.time.delayedCall(900, () => {
      burst.destroy();
      core.destroy();
    });

    const flash = this.add.rectangle(x, y, 116, 132, 0xffffff, 0.7).setDepth(59);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    shake(this, 180, 0.007);
    glowPulse(this, 0.5);
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
      // A countdown, not a wall: 6/8 for small gates, a percentage for the big
      // score gates where the raw pair would not fit on the line. Capped at 99
      // so a rounding-up can never claim done on something still locked.
      const tag =
        lock.current === undefined || lock.target === undefined
          ? ''
          : lock.target <= 100
            ? ` · ${lock.current}/${lock.target}`
            : ` · ${Math.min(99, Math.floor((lock.current / lock.target) * 100))}%`;
      this.statusText.setText(`LOCKED — ${lock.requirement ?? ''}${tag}`).setColor(CSS.red);
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
      // Progress toward an accumulating unlock, as a sliver along the tile's
      // bottom edge. Painted into the same Graphics as the panel so it repaints
      // and dies with it.
      if (!lock.unlocked && lock.current !== undefined && lock.target !== undefined) {
        const frac = Math.min(1, lock.current / lock.target);
        tile.panel.lineStyle(2, PALETTE.deepPurple, 1);
        tile.panel.lineBetween(-46, 63, 46, 63);
        if (frac > 0) {
          tile.panel.lineStyle(2, PALETTE.red, 1);
          tile.panel.lineBetween(-46, 63, -46 + 92 * frac, 63);
        }
      }
      // A locked item shows its requirement, never its price: quoting a number
      // for something that is not for sale sends the player to grind credits
      // when what they actually need is to go and get better.
      if (worn) tile.price.setText('EQUIPPED').setColor(CSS.yellow);
      else if (owned) tile.price.setText('OWNED').setColor(CSS.cyanDim);
      else if (!lock.unlocked) tile.price.setText(lock.requirement ?? 'LOCKED').setColor(CSS.red);
      else tile.price.setText(`${tile.def.price}`).setColor(affordable ? CSS.yellow : CSS.red);
      // "MASTER 12S TIMES TABLE" is wider than a tile; shrink to one line.
      tile.price.setScale(Math.min(1, 108 / tile.price.width));

      // Locked art is dimmed to a silhouette — visible enough to want.
      tile.art.setAlpha(!owned && !lock.unlocked ? 0.25 : owned || affordable ? 1 : 0.55);
    }

    if (this.shown) this.showDetail(this.shown);
  }
}
