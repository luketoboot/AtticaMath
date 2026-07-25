import Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, type AudioManager } from '../../audio/AudioManager';
import { getAudio } from '../../audio/getAudio';
import {
  ACTION_LABELS,
  BINDABLE_ACTIONS,
  defaultBindings,
  keyLabel,
  resolveBindings,
  type BindableAction,
  type KeyBindings,
} from '../../core/input/bindings';
import { applyCrt } from '../../fx/applyCrt';
import { CSS, FONT, PALETTE } from '../../fx/palette';
import { MenuNav, type MenuItem } from '../../ui/MenuNav';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/**
 * Rebind movement / launch / pause. Bindings are physical-key (event.code)
 * based, so a player on a non-US keyboard whose WASD lands on the wrong keys
 * can remap to whatever physical keys actually work for them.
 *
 * Digit entry (typing answers) is deliberately not rebindable — the whole game
 * is typing numbers, and the number keys already work on every layout.
 */
export class ControlsScene extends Phaser.Scene {
  private saves!: SaveManager;
  private bindings!: KeyBindings;
  private nav!: MenuNav;
  private prompt!: Phaser.GameObjects.Text;
  private readonly slots = new Map<string, Phaser.GameObjects.Text>();
  private capturing: { action: BindableAction; slot: 0 | 1 } | null = null;

  constructor() {
    super('Controls');
  }

  create(): void {
    const { width, height } = this.scale;
    this.saves = this.registry.get(SAVE_REGISTRY_KEY) as SaveManager;
    const audio = this.registry.get(AUDIO_REGISTRY_KEY) as AudioManager | undefined;
    audio?.playMusic('menu');
    applyCrt(this);
    this.add.rectangle(0, 0, width, height, PALETTE.black).setOrigin(0);
    this.capturing = null;
    this.slots.clear();

    // Normalise the saved shape once so every action resolves to two slots.
    this.bindings = resolveBindings(this.saves.save.keybindings);
    this.saves.save.keybindings = this.bindings;

    this.add
      .text(width / 2, height * 0.09, 'CONTROLS', {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: CSS.magenta,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.16, 'NUMBER KEYS TYPE ANSWERS — NOT REBINDABLE', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5)
      .setAlpha(0.85);

    // Column headers.
    this.add
      .text(width * 0.62, height * 0.235, 'PRIMARY', { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim })
      .setOrigin(0.5);
    this.add
      .text(width * 0.78, height * 0.235, 'ALT', { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim })
      .setOrigin(0.5);

    const rows: MenuItem[][] = [];
    BINDABLE_ACTIONS.forEach((action, i) => {
      const y = height * (0.3 + i * 0.072);
      this.add
        .text(width * 0.24, y, ACTION_LABELS[action], { fontFamily: FONT, fontSize: '20px', color: CSS.cyan })
        .setOrigin(0, 0.5);
      const primary = this.makeSlot(width * 0.62, y, action, 0);
      const alt = this.makeSlot(width * 0.78, y, action, 1);
      rows.push([primary, alt]);
    });

    const reset = this.add
      .text(width / 2, height * 0.82, '[ RESET TO DEFAULTS ]', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: CSS.red,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    reset.on('pointerover', () => reset.setColor(CSS.magentaHot));
    reset.on('pointerout', () => reset.setColor(CSS.red));
    const resetAll = (): void => {
      getAudio(this)?.play('ui');
      this.bindings = defaultBindings();
      this.saves.save.keybindings = this.bindings;
      this.saves.persist();
      this.renderSlots();
    };
    reset.on('pointerdown', resetAll);

    const back = this.add
      .text(width / 2, height * 0.9, '[ BACK ]', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: CSS.cyan,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(CSS.magentaHot));
    back.on('pointerout', () => back.setColor(CSS.cyan));
    const goBack = (): void => {
      getAudio(this)?.play('ui');
      this.scene.start('Settings');
    };
    back.on('pointerdown', goBack);

    rows.push([{ target: reset, onSelect: resetAll }]);
    rows.push([{ target: back, onSelect: goBack }]);

    this.nav = new MenuNav(this, rows);

    this.prompt = this.add
      .text(width / 2, height * 0.965, 'WASD / ARROWS MOVE  ·  ENTER REBIND  ·  ESC BACK', {
        fontFamily: FONT,
        fontSize: '13px',
        color: CSS.cyanDim,
      })
      .setOrigin(0.5)
      .setAlpha(0.8);

    // ESC leaves the screen — unless we are mid-capture, where the deferred
    // capture listener consumes it as "cancel" instead.
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!this.capturing && e.code === 'Escape') goBack();
    });

    this.renderSlots();
  }

  private makeSlot(x: number, y: number, action: BindableAction, slot: 0 | 1): MenuItem {
    const text = this.add
      .text(x, y, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: CSS.white })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.slots.set(this.slotKey(action, slot), text);
    const begin = (): void => this.beginCapture(action, slot);
    text.on('pointerdown', begin);
    return { target: text, onSelect: begin };
  }

  private beginCapture(action: BindableAction, slot: 0 | 1): void {
    if (this.capturing) return;
    this.capturing = { action, slot };
    this.nav.setEnabled(false);
    getAudio(this)?.play('ui');
    this.prompt.setText('PRESS A KEY  ·  ESC CANCELS').setColor(CSS.yellow);
    this.renderSlots();

    // Deferred so the ENTER/click that opened capture isn't itself captured.
    this.time.delayedCall(0, () => {
      this.input.keyboard?.once('keydown', (e: KeyboardEvent) => this.onCapture(e));
    });
  }

  private onCapture(event: KeyboardEvent): void {
    const target = this.capturing;
    if (!target) return;
    event.preventDefault();
    if (event.code !== 'Escape') {
      const pair = this.bindings[target.action];
      // Don't let one physical key occupy both slots of the same action.
      const other: 0 | 1 = target.slot === 0 ? 1 : 0;
      if (pair[other] === event.code) pair[other] = null;
      pair[target.slot] = event.code;
      this.saves.save.keybindings = this.bindings;
      this.saves.persist();
      getAudio(this)?.play('land');
    }
    this.capturing = null;
    this.nav.setEnabled(true);
    this.prompt.setText('WASD / ARROWS MOVE  ·  ENTER REBIND  ·  ESC BACK').setColor(CSS.cyanDim);
    this.renderSlots();
  }

  private renderSlots(): void {
    for (const action of BINDABLE_ACTIONS) {
      for (const slot of [0, 1] as const) {
        const text = this.slots.get(this.slotKey(action, slot));
        if (!text) continue;
        const active = this.capturing?.action === action && this.capturing.slot === slot;
        if (active) {
          text.setText('[ … ]').setColor(CSS.yellow);
        } else {
          const code = this.bindings[action][slot];
          text.setText(`[ ${keyLabel(code)} ]`).setColor(code ? CSS.white : CSS.cyanDim);
        }
      }
    }
  }

  private slotKey(action: BindableAction, slot: 0 | 1): string {
    return `${action}:${slot}`;
  }
}
