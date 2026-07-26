import Phaser from 'phaser';
import { keyEventGate } from './input/freshKey';

/**
 * Continuous digit buffer. Numpad and top-row digits both append; backspace
 * clears. The owning scene checks the buffer against live answers after every
 * change and fires the moment it matches — no enter key.
 */
export class InputBuffer {
  private buffer = '';
  private readonly maxLen = 8;
  /** Drops Phaser's queue-replay duplicates; see input/freshKey. */
  private readonly fresh = keyEventGate();
  private readonly onChange: (value: string) => void;
  private readonly keydownHandler: (event: KeyboardEvent) => void;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, onChange: (value: string) => void) {
    this.scene = scene;
    this.onChange = onChange;
    this.keydownHandler = (event: KeyboardEvent) => this.handleKey(event);
    scene.input.keyboard?.on('keydown', this.keydownHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get value(): string {
    return this.buffer;
  }

  clear(): void {
    if (this.buffer === '') return;
    this.buffer = '';
    this.onChange(this.buffer);
  }

  private handleKey(event: KeyboardEvent): void {
    // One physical press must append exactly one digit.
    if (!this.fresh(event)) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      this.clear();
      return;
    }
    // event.key is '0'..'9' for both the top row and the numpad.
    if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
      if (this.buffer.length >= this.maxLen) return;
      this.buffer += event.key;
      this.onChange(this.buffer);
    }
  }

  /** Append a digit from a non-keyboard source (future on-screen numpad). */
  push(digit: string): void {
    if (!/^\d$/.test(digit) || this.buffer.length >= this.maxLen) return;
    this.buffer += digit;
    this.onChange(this.buffer);
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.keydownHandler);
  }
}
