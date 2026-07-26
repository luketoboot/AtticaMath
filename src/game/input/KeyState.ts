import Phaser from 'phaser';
import { codeMatches, resolveBindings, type KeyBindings } from '../../core/input/bindings';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../storage';

/** Resolve the player's control scheme from the shared save. */
export function sceneBindings(scene: Phaser.Scene): KeyBindings {
  const saves = scene.registry.get(SAVE_REGISTRY_KEY) as SaveManager | undefined;
  return resolveBindings(saves?.save.keybindings);
}

/**
 * Tracks which physical keys are held, keyed by KeyboardEvent.code, for
 * per-frame polling in movement loops. Layout-independent: a binding to 'KeyA'
 * follows the physical A key wherever the OS layout puts its label.
 */
export class KeyState {
  private readonly held = new Set<string>();
  /** Codes currently claimed by an overlay (the on-screen pad steals arrows). */
  private readonly masked = new Set<string>();
  private readonly onDown: (e: KeyboardEvent) => void;
  private readonly onUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.onDown = (e) => void this.held.add(e.code);
    this.onUp = (e) => void this.held.delete(e.code);
    // A window blur (alt-tab) swallows the keyup, so clear to avoid stuck keys.
    this.onBlur = () => this.held.clear();
    const kb = scene.input.keyboard;
    kb?.on('keydown', this.onDown);
    kb?.on('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** True while any of the action's bound keys is physically down. */
  isDown(slots: readonly (string | null)[]): boolean {
    return slots.some((code) => code !== null && this.held.has(code) && !this.masked.has(code));
  }

  /**
   * Claim or release codes for an overlay. While claimed they read as not-held,
   * so the on-screen pad can steer by arrows without the ship also strafing —
   * and only the claimed codes go quiet: WASD keeps flying while the pad has
   * the arrows, which is exactly the two-handed split a padless keyboard needs.
   */
  setMask(codes: readonly string[], on: boolean): void {
    for (const code of codes) {
      if (on) this.masked.add(code);
      else this.masked.delete(code);
    }
  }

  destroy(): void {
    const kb = this.scene.input.keyboard;
    kb?.off('keydown', this.onDown);
    kb?.off('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

/**
 * Call `cb` on every keydown whose code matches one of `slots`.
 * Returns an unbinder. Use for discrete actions (launch, pause).
 */
export function onActionKey(
  scene: Phaser.Scene,
  slots: readonly (string | null)[],
  cb: () => void,
): () => void {
  const handler = (event: KeyboardEvent): void => {
    if (codeMatches(slots, event.code)) cb();
  };
  scene.input.keyboard?.on('keydown', handler);
  return () => void scene.input.keyboard?.off('keydown', handler);
}
