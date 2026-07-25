import Phaser from 'phaser';
import { getAudio } from '../../audio/getAudio';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { drawBackdrop } from '../../ui/backdrop';
import { MenuNav, navHint } from '../../ui/MenuNav';
import { CardDeck, spread, type ModeCardSpec } from '../../ui/ModeCard';
import { neonButton } from '../../ui/panels';
import { titleLogo } from '../../ui/TitleLogo';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** Cards, left to right. Order here is the order on screen. */
const MODES: readonly (ModeCardSpec & { scene: string })[] = [
  {
    label: 'METEOR\nDEFENSE',
    tagline: 'TYPE THE ANSWER. KILL THE ROCK BEFORE IT LANDS.',
    icon: 'meteor',
    accent: PALETTE.magenta,
    scene: 'ModeSelect',
    onSelect: () => {},
  },
  {
    label: 'EXPRESSION\nBUILDER',
    tagline: 'BUILD THE TARGET OUT OF THE HAND YOU ARE DEALT.',
    icon: 'expression',
    accent: PALETTE.cyan,
    scene: 'Expression',
    onSelect: () => {},
  },
  {
    label: 'FACTOR\nSTORM',
    tagline: 'SHOOT ROCKS WITH THEIR FACTORS. SPLIT THEM TO PRIMES.',
    icon: 'factor',
    accent: PALETTE.yellow,
    scene: 'Factor',
    onSelect: () => {},
  },
  {
    label: 'COLLAPSE',
    tagline: 'PAIR EVERY FRACTION TO ITS PERCENT. ANNIHILATE BOTH.',
    icon: 'collapse',
    accent: PALETTE.magentaHot,
    scene: 'Collapse',
    badge: 'PROTO',
    onSelect: () => {},
  },
  {
    label: 'BOSS\nRUSH',
    tagline: 'CHIP THE HP. BLOCK WHAT IT THROWS BACK.',
    icon: 'boss',
    accent: PALETTE.red,
    scene: 'Boss',
    onSelect: () => {},
  },
];

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const { width, height } = this.scale;
    const saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    getAudio(this)?.playMusic('menu');
    applyCrt(this);

    drawBackdrop(this);

    titleLogo(this, width / 2, 86, 'METEOR MATH', {
      fontSize: 66,
      subtitle: 'ARITHMETIC AT SPEED  ·  NO CALCULATOR, NO MERCY',
    });

    this.drawStatusStrip(saves, 176);

    // Modes across one row, so no mode reads as buried under another.
    const cardLayout = { width: 208, height: 214 };
    const deck = new CardDeck(this, this.modeSpecs(), cardLayout, (i, n) => ({
      x: spread(width / 2, 1120, i, n),
      y: 322,
    }));

    const utility = [
      neonButton(this, spread(width / 2, 980, 0, 4), 470, 'HANGAR', () => this.scene.start('Shop'), {
        width: 230,
        height: 54,
        fontSize: 19,
        icon: 'hangar',
        sub: 'SHIPS & COLOURS',
      }),
      neonButton(
        this,
        spread(width / 2, 980, 1, 4),
        470,
        'SCORES',
        () => this.scene.start('Leaderboard'),
        { width: 230, height: 54, fontSize: 19, icon: 'leaderboard', sub: 'HALL OF FAME' },
      ),
      neonButton(
        this,
        spread(width / 2, 980, 2, 4),
        470,
        'BRAIN SCAN',
        () => this.scene.start('BrainScan'),
        { width: 230, height: 54, fontSize: 19, icon: 'brainscan', sub: 'YOUR SKILL MAP' },
      ),
      neonButton(
        this,
        spread(width / 2, 980, 3, 4),
        470,
        'SETTINGS',
        () => this.scene.start('Settings'),
        { width: 230, height: 54, fontSize: 19, icon: 'settings', sub: 'CRT · AUDIO · KEYS' },
      ),
    ];

    // Dropping to the utility row puts the card light out behind you.
    for (const button of utility) button.onFocus = () => deck.blur();

    new MenuNav(this, [deck.items, utility]);
    // MenuNav does not fire onFocus for the item it opens on, and the first
    // card has to arrive already lit.
    deck.focus(0);

    navHint(this, height - 20);
  }

  /** Card specs with their scene launches bound. */
  private modeSpecs(): ModeCardSpec[] {
    return MODES.map((mode) => {
      const { scene, ...spec } = mode;
      return { ...spec, onSelect: () => this.scene.start(scene) };
    });
  }

  /** Credits and personal best, as a readout rather than a sentence. */
  private drawStatusStrip(saves: SaveManager, y: number): void {
    const { width } = this.scale;
    const g = this.add.graphics();
    g.lineStyle(1, PALETTE.cyan, 0.5);
    g.lineBetween(width / 2 - 240, y, width / 2 - 130, y);
    g.lineBetween(width / 2 + 130, y, width / 2 + 240, y);

    const cell = (x: number, label: string, value: string, color: string): void => {
      this.add
        .text(x, y - 9, label, { fontFamily: FONT, fontSize: '11px', color: CSS.cyanDim })
        .setOrigin(0.5);
      this.add
        .text(x, y + 9, value, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color })
        .setOrigin(0.5);
    };
    cell(width / 2 - 70, 'CREDITS', String(saves.save.credits), CSS.yellow);
    cell(width / 2 + 70, 'BEST RUN', String(saves.save.bestScore), CSS.white);
  }
}
