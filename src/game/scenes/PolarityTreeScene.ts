import Phaser from 'phaser';
import { CONFIG } from '../../core/config';
import type { PolaritySession } from '../../core/polarity/session';
import {
  ROOT_ID,
  TREE,
  costOf,
  neighbourIn,
  nodeById,
  ownedCount,
  search,
  type Branch,
} from '../../core/polarity/tree';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';

export interface PolarityTreeData {
  session: PolaritySession;
}

const BRANCH_COLOR: Record<Branch, number> = {
  thrust: PALETTE.cyan,
  ordnance: PALETTE.magentaHot,
  resonance: PALETTE.yellow,
  salvage: PALETTE.purple,
};

const RADIUS: Record<number, number> = { 1: 9, 2: 15, 3: 21 };
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;

/**
 * The skill tree, opened mid-run over a paused field.
 *
 * Everything the tree is and why it resets lives in `core/polarity/tree.ts`.
 * This is only the window onto it, and it has two jobs the source it is
 * modelled on did badly.
 *
 * **It can be searched.** The most repeated complaint about BYTEPATH's tree —
 * from people who loved it — is that there is no way to find a node, so a build
 * you can picture is a build you cannot locate. Typing here filters instantly
 * and rings every match.
 *
 * **It can be driven by keyboard.** This game is played with two hands on a
 * keyboard and no pointer, so the selection walks the graph by compass
 * direction rather than by mouse. The lookup is precomputed in core.
 *
 * The whole tree lives in one container that is panned and scaled, rather than
 * a second camera: the CRT pipeline is attached to the main camera and the HUD
 * has to stay unscaled on top of it, and moving one container is the cheaper
 * of the two answers. There is no viewport culling. BYTEPATH needed it at 833
 * nodes; at a hundred and forty it would be work spent on nothing.
 */
export class PolarityTreeScene extends Phaser.Scene {
  private session!: PolaritySession;
  private world!: Phaser.GameObjects.Container;
  private edges!: Phaser.GameObjects.Graphics;
  private nodes = new Map<number, Phaser.GameObjects.Graphics>();
  private labels = new Map<number, Phaser.GameObjects.Text>();

  private selected = ROOT_ID;
  private zoom = 0.62;
  private query = '';
  private matches = new Set<number>();

  private headline!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private budget!: Phaser.GameObjects.Text;
  private queryText!: Phaser.GameObjects.Text;

  constructor() {
    super('PolarityTree');
  }

  create(data: PolarityTreeData): void {
    const { width, height } = this.scale;
    this.session = data.session;
    this.selected = ROOT_ID;
    this.zoom = 0.62;
    this.query = '';
    this.matches = new Set();
    this.nodes = new Map();
    this.labels = new Map();

    this.add.rectangle(0, 0, width, height, PALETTE.black, 0.93).setOrigin(0);
    applyCrt(this);

    this.world = this.add.container(width / 2, height / 2);
    this.edges = this.add.graphics();
    this.world.add(this.edges);
    this.buildNodes();

    this.world.setScale(this.zoom);
    this.createChrome();
    this.bindKeys();
    this.centreOnSelected();
    this.refresh();
  }

  // --- building ---

  private buildNodes(): void {
    for (const node of TREE) {
      const gfx = this.add.graphics().setPosition(node.x, node.y);
      this.world.add(gfx);
      this.nodes.set(node.id, gfx);

      // Only the big nodes carry a permanent label. A hundred and forty
      // captions at once is a wall of text, not a map — the small ones are
      // read by selecting them.
      if (node.size >= 2) {
        const text = this.add
          .text(node.x, node.y + RADIUS[node.size]! + 11, node.label.split('\n')[0]!, {
            fontFamily: FONT,
            fontSize: '10px',
            color: CSS.cyanDim,
            align: 'center',
          })
          .setOrigin(0.5, 0);
        this.world.add(text);
        this.labels.set(node.id, text);
      }
    }
  }

  private createChrome(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 18, 'SKILL TREE', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: CSS.magentaHot,
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.headline = this.add
      .text(28, 20, '', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: CSS.yellow })
      .setDepth(20);
    this.budget = this.add
      .text(28, 54, '', { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim })
      .setDepth(20);

    this.detail = this.add
      .text(width / 2, height - 76, '', {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: CSS.white,
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.queryText = this.add
      .text(width - 28, 22, '', { fontFamily: FONT, fontSize: '14px', color: CSS.cyan })
      .setOrigin(1, 0)
      .setDepth(20);

    this.add
      .text(
        width / 2,
        height - 22,
        'ARROWS WALK  ·  ENTER TAKES  ·  TYPE TO SEARCH  ·  +/− ZOOM  ·  T OR ESC CLOSES',
        { fontFamily: FONT, fontSize: '12px', color: CSS.cyanDim },
      )
      .setOrigin(0.5)
      .setDepth(20);
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;

    kb.on('keydown', (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowUp':
          return this.walk('up');
        case 'ArrowDown':
          return this.walk('down');
        case 'ArrowLeft':
          return this.walk('left');
        case 'ArrowRight':
          return this.walk('right');
        case 'Enter':
        case 'Space':
          return this.take();
        case 'Escape':
        case 'KeyT':
          return this.close();
        case 'Equal':
        case 'NumpadAdd':
          return this.setZoom(this.zoom * 1.2);
        case 'Minus':
        case 'NumpadSubtract':
          return this.setZoom(this.zoom / 1.2);
        case 'Backspace':
          this.query = this.query.slice(0, -1);
          return this.runSearch();
        default:
          break;
      }
      // Letters and digits build the search. The tree is the only screen in the
      // game where typing means "find" rather than "answer", which is why the
      // query is echoed in the corner rather than left implicit.
      if (/^(Key[A-Z]|Digit[0-9])$/.test(e.code)) {
        this.query += e.key.toUpperCase();
        this.runSearch();
      }
    });

    // Dragging is a convenience, not the interface — the keyboard is.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.world.x += p.x - p.prevPosition.x;
      this.world.y += p.y - p.prevPosition.y;
    });
  }

  // --- interaction ---

  private walk(dir: 'up' | 'down' | 'left' | 'right'): void {
    const next = neighbourIn(this.selected, dir);
    if (next === undefined) return;
    this.selected = next;
    this.centreOnSelected();
    this.refresh();
  }

  private take(): void {
    if (!this.session.buyNode(this.selected)) {
      this.cameras.main.shake(90, 0.004);
      return;
    }
    this.cameras.main.flash(120, 0, 240, 255);
    this.refresh();
  }

  private runSearch(): void {
    this.matches = new Set(search(this.query).map((n) => n.id));
    // Jump to the nearest match so a search is a move, not just a highlight.
    const first = [...this.matches][0];
    if (first !== undefined) {
      this.selected = first;
      this.centreOnSelected();
    }
    this.refresh();
  }

  private setZoom(next: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    this.world.setScale(this.zoom);
    this.centreOnSelected();
  }

  private centreOnSelected(): void {
    const node = nodeById(this.selected);
    if (!node) return;
    const { width, height } = this.scale;
    this.world.x = width / 2 - node.x * this.zoom;
    this.world.y = height / 2 - node.y * this.zoom;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('Polarity');
  }

  // --- painting ---

  private refresh(): void {
    const state = this.session.treeState;
    const owned = new Set(state.bought);
    const cfg = CONFIG.polarity.tree;

    this.edges.clear();
    for (const node of TREE) {
      for (const other of node.links) {
        if (other < node.id) continue;
        const to = nodeById(other)!;
        const both = owned.has(node.id) && owned.has(other);
        this.edges.lineStyle(both ? 2.4 : 1.2, both ? PALETTE.white : PALETTE.deepPurple, both ? 0.8 : 0.7);
        this.edges.lineBetween(node.x, node.y, to.x, to.y);
      }
    }

    for (const node of TREE) {
      const gfx = this.nodes.get(node.id)!;
      const colour = BRANCH_COLOR[node.branch];
      const isOwned = owned.has(node.id);
      // Adjacency, not affordability. Whether you can pay for it today belongs
      // in the detail line; whether it is on your frontier is what the map is
      // for, and a player with no points still needs to see where to go.
      const connected = !isOwned && node.links.some((l) => owned.has(l));
      const affordable = this.session.canBuyNode(node.id);
      const r = RADIUS[node.size]!;
      gfx.clear();

      if (this.matches.has(node.id)) {
        gfx.lineStyle(2, PALETTE.white, 0.9);
        gfx.strokeCircle(0, 0, r + 8);
      }
      if (node.id === this.selected) {
        gfx.lineStyle(2.5, PALETTE.yellow, 1);
        gfx.strokeCircle(0, 0, r + 5);
      }

      // Owned is solid, reachable is outlined, the rest is a ghost. Three
      // states is all a map at this size can carry without becoming noise.
      gfx.fillStyle(colour, isOwned ? 0.9 : connected ? 0.22 : 0.07);
      gfx.lineStyle(affordable ? 2.6 : 2, colour, isOwned ? 1 : connected ? 0.9 : 0.22);
      if (node.size === 1) {
        gfx.fillCircle(0, 0, r);
        gfx.strokeCircle(0, 0, r);
      } else {
        gfx.fillRect(-r, -r, r * 2, r * 2);
        gfx.strokeRect(-r, -r, r * 2, r * 2);
      }
      const label = this.labels.get(node.id);
      if (label) label.setColor(isOwned ? CSS.white : CSS.cyanDim);
    }

    const node = nodeById(this.selected)!;
    const cost = costOf(node.id);
    this.headline.setText(`${state.points} SP`);
    this.budget.setText(`${ownedCount(state)} / ${cfg.nodeBudget} NODES TAKEN`);
    this.queryText.setText(this.query ? `FIND: ${this.query}  (${this.matches.size})` : '');

    const status = owned.has(node.id)
      ? 'TAKEN'
      : this.session.canBuyNode(node.id)
        ? `ENTER TO TAKE — ${cost} SP`
        : ownedCount(state) >= cfg.nodeBudget
          ? 'NO ROOM LEFT'
          : state.points < cost
            ? `NEEDS ${cost} SP`
            : 'NOT CONNECTED YET';
    this.detail.setText(`${node.label}\n${status}`);
  }
}
