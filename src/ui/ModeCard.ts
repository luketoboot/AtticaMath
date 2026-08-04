/**
 * Illustrated mode cards for the main menu.
 *
 * A menu of identical text rows tells you nothing about what the modes are. A
 * card gives each one a colour, a piece of art and a line of copy, so the shape
 * of the game is legible before you have played any of it — and so the modes
 * stop feeling interchangeable.
 *
 * Focus lives in the deck rather than the card because only one card may be lit
 * at a time and a card cannot know when another has taken over. MenuNav drives
 * it through `onFocus`, which means keyboard and mouse can never disagree.
 */
import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import { CSS, FONT, PALETTE } from '../fx/palette';
import { makeIcon, type IconName } from './icons';
import type { MenuItem } from './MenuNav';
import { boundsRect, paintPanel } from './panels';

export interface ModeCardSpec {
  label: string;
  /** One line of copy. What you actually do in there. */
  tagline: string;
  icon: IconName;
  accent: number;
  onSelect: () => void;
  /** Corner flag, e.g. PROTO. */
  badge?: string;
}

export interface CardLayout {
  width: number;
  height: number;
}

class ModeCard {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly layout: CardLayout;
  private readonly accent: number;
  private readonly baseY: number;
  private idle: Phaser.Tweens.Tween | undefined;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    index: number,
    spec: ModeCardSpec,
    layout: CardLayout,
  ) {
    this.scene = scene;
    this.layout = layout;
    this.accent = spec.accent;
    this.baseY = y;

    // Behind the card, outside it: a child would be counted by getBounds and
    // the cursor would frame the halo instead of the card.
    this.glow = scene.add.graphics({ x, y }).setAlpha(0);

    this.container = scene.add.container(x, y);
    this.container.add(boundsRect(scene, layout.width, layout.height));

    this.panel = scene.add.graphics();
    this.container.add(this.panel);
    this.paint(false);

    const half = layout.height / 2;
    this.icon = makeIcon(scene, 0, -half + 74, spec.icon, {
      size: 68,
      color: spec.accent,
      dim: PALETTE.cyanDim,
    });
    this.container.add(this.icon);

    // Text flows from a single top anchor rather than sitting at two fixed
    // heights. Both blocks change height with their copy — a two-line label,
    // a tagline that wraps to three — and pinned centres meant the label grew
    // downwards into the tagline and printed straight through it.
    const textTop = -half + 118;
    this.title = scene.add
      .text(0, textTop, spec.label, {
        fontFamily: FONT,
        fontSize: '19px',
        fontStyle: 'bold',
        color: CSS.white,
        align: 'center',
        wordWrap: { width: layout.width - 24 },
      })
      .setOrigin(0.5, 0);
    this.container.add(this.title);

    const tagTop = textTop + this.title.height + 8;
    const room = half - 12 - tagTop;
    const tagline = scene.add
      .text(0, tagTop, spec.tagline, {
        fontFamily: FONT,
        fontSize: '11px',
        color: CSS.cyanDim,
        align: 'center',
        wordWrap: { width: layout.width - 26 },
      })
      .setOrigin(0.5, 0);
    // Last resort, and it should stay unused: copy is written to fit. But a
    // card is a fixed box and a tagline is a sentence somebody will edit one
    // day, so the card gets the final say on how small it has to be printed
    // rather than letting it run off the bottom edge.
    for (let size = 11; size > 8 && tagline.height > room; size--) {
      tagline.setFontSize(size - 1);
    }
    this.container.add(tagline);

    // Arcade cabinet numbering. Cheap, and it makes a row of cards read as a
    // set rather than as five unrelated boxes.
    this.container.add(
      scene.add
        .text(-layout.width / 2 + 12, -half + 12, String(index + 1).padStart(2, '0'), {
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: `#${spec.accent.toString(16).padStart(6, '0')}`,
        })
        .setAlpha(0.75),
    );

    if (spec.badge !== undefined) {
      this.container.add(
        scene.add
          .text(layout.width / 2 - 12, -half + 12, spec.badge, {
            fontFamily: FONT,
            fontSize: '11px',
            fontStyle: 'bold',
            color: CSS.yellow,
          })
          .setOrigin(1, 0),
      );
    }

    this.container.setSize(layout.width, layout.height);
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-layout.width / 2, -layout.height / 2, layout.width, layout.height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.container.input!.cursor = 'pointer';
    this.container.on('pointerdown', () => {
      // Mouse path only — the keyboard path gets its confirm from MenuNav.
      getAudio(scene)?.play('confirm');
      this.select(spec);
    });
  }

  item(spec: ModeCardSpec, setFocused: (on: boolean) => void): MenuItem {
    return { target: this.container, onSelect: () => this.select(spec), setFocused };
  }

  setFocused(on: boolean): void {
    this.paint(on);
    this.title.setColor(on ? CSS.yellow : CSS.white);

    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      scale: on ? 1.06 : 1,
      y: on ? this.baseY - 8 : this.baseY,
      duration: 140,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({ targets: this.glow, alpha: on ? 0.5 : 0, duration: 180 });

    // The art only moves on the card you are looking at — nine idling icons at
    // once would turn the menu into noise.
    this.idle?.stop();
    this.idle = undefined;
    this.icon.setScale(1).setAngle(0);
    if (on) {
      this.idle = this.scene.tweens.add({
        targets: this.icon,
        scale: { from: 1, to: 1.1 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private select(spec: ModeCardSpec): void {
    // A quick punch on the card so a launch reads as a press, not a cut.
    this.scene.tweens.add({
      targets: this.container,
      scale: 0.97,
      duration: 70,
      yoyo: true,
      onComplete: () => spec.onSelect(),
    });
  }

  private paint(hot: boolean): void {
    const { width, height } = this.layout;
    paintPanel(this.panel, {
      width,
      height,
      accent: this.accent,
      chamfer: 16,
      fillAlpha: hot ? 0.85 : 0.5,
      borderWidth: hot ? 3 : 2,
    });
    this.glow.clear();
    this.glow.fillStyle(this.accent, 0.22);
    this.glow.fillRoundedRect(-width / 2 - 10, -height / 2 - 10, width + 20, height + 20, 18);
  }
}

/**
 * A row of cards that keeps exactly one lit. Hand the returned items to MenuNav
 * as a row — it lights the card it opens on and blurs the deck when the cursor
 * leaves the row, so the caller has nothing to wire up.
 */
export class CardDeck {
  private readonly cards: ModeCard[] = [];
  readonly items: MenuItem[] = [];
  private focused = -1;

  constructor(
    scene: Phaser.Scene,
    specs: readonly ModeCardSpec[],
    layout: CardLayout,
    position: (index: number, count: number) => { x: number; y: number },
  ) {
    specs.forEach((spec, i) => {
      const { x, y } = position(i, specs.length);
      const card = new ModeCard(scene, x, y, i, spec, layout);
      this.cards.push(card);
      this.items.push(card.item(spec, (on) => (on ? this.focus(i) : this.blur())));
    });
  }

  /** The card containers, in deck order — for entry animation. */
  get containers(): Phaser.GameObjects.Container[] {
    return this.cards.map((card) => card.container);
  }

  focus(index: number): void {
    if (this.focused === index) return;
    this.cards[this.focused]?.setFocused(false);
    this.cards[index]?.setFocused(true);
    this.focused = index;
  }

  /** Nothing in this deck is selected — the cursor moved to another row. */
  blur(): void {
    this.cards[this.focused]?.setFocused(false);
    this.focused = -1;
  }
}

/** Evenly spread `count` items across a span, centred on `centerX`. */
export function spread(centerX: number, span: number, index: number, count: number): number {
  return centerX + span * ((index + 0.5) / count - 0.5);
}
