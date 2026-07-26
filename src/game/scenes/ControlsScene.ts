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
import { drawBackdrop } from '../../ui/backdrop';
import { MenuNav, type MenuItem } from '../../ui/MenuNav';
import { neonButton } from '../../ui/panels';
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
    drawBackdrop(this, { sun: false, horizon: 0.97 });
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
      .text(
        width / 2,
        height * 0.16,
        'FLIGHT MODES THRUST AND TURN  ·  METEOR DEFENSE STRAFES  ·  NUMBER KEYS ARE FIXED',
        { fontFamily: FONT, fontSize: '13px', color: CSS.cyanDim },
      )
      .setOrigin(0.5)
      .setAlpha(0.85);
    // The pad is for keyboards without a numpad, so it cannot be a secret the
    // player has to already own a numpad to avoid needing.
    this.add
      .text(
        width / 2,
        height * 0.16 + 22,
        'NO NUMPAD?  TAB POPS AN ON-SCREEN PAD IN PLAY  ·  ARROWS OR HJKL STEER IT  ·  ENTER TYPES',
        { fontFamily: FONT, fontSize: '13px', color: CSS.yellow },
      )
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
      const y = height * (0.295 + i * 0.063);
      this.add
        .text(width * 0.24, y, ACTION_LABELS[action], { fontFamily: FONT, fontSize: '20px', color: CSS.cyan })
        .setOrigin(0, 0.5);
      const primary = this.makeSlot(width * 0.62, y, action, 0);
      const alt = this.makeSlot(width * 0.78, y, action, 1);
      rows.push([primary, alt]);
    });

    const resetAll = (): void => {
      this.bindings = defaultBindings();
      this.saves.save.keybindings = this.bindings;
      this.saves.persist();
      this.renderSlots();
    };
    const reset = neonButton(this, width / 2, height * 0.82, 'RESET TO DEFAULTS', resetAll, {
      width: 320,
      height: 44,
      fontSize: 17,
      accent: PALETTE.red,
    });

    const goBack = (): void => {
      this.scene.start('Settings');
    };
    const back = neonButton(this, width / 2, height * 0.9, 'BACK', goBack, {
      width: 200,
      height: 44,
      fontSize: 19,
    });

    rows.push([reset]);
    rows.push([back]);

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
