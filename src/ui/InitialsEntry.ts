import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import {
  INITIALS_ALPHABET,
  INITIALS_LENGTH,
  isInitialChar,
  normalizeInitials,
} from '../core/leaderboard/leaderboard';
import { CSS, FONT, PALETTE } from '../fx/palette';

/**
 * Three-slot arcade initials entry.
 *
 * Two schemes at once, because both are things people reach for: type the
 * letters directly, or wheel them with up/down the way a cabinet with two
 * buttons and a stick works. Typing advances the slot; wheeling does not, so
 * you can settle on a letter before moving on.
 *
 * Every key that does nothing buzzes. Silence would read as a dropped input.
 */
export class InitialsEntry {
  private readonly scene: Phaser.Scene;
  private readonly onConfirm: (initials: string) => void;
  private readonly slots: Phaser.GameObjects.Text[] = [];
  private readonly carets: Phaser.GameObjects.Rectangle[] = [];
  private chars: string[];
  private index = 0;
  private done = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    initial: string,
    onConfirm: (initials: string) => void,
  ) {
    this.scene = scene;
    this.onConfirm = onConfirm;
    this.chars = normalizeInitials(initial).split('');

    const spacing = 78;
    for (let i = 0; i < INITIALS_LENGTH; i++) {
      const slotX = x + (i - (INITIALS_LENGTH - 1) / 2) * spacing;
      this.slots.push(
        scene.add
          .text(slotX, y, this.chars[i]!, {
            fontFamily: FONT,
            fontSize: '64px',
            fontStyle: 'bold',
            color: CSS.yellow,
          })
          .setOrigin(0.5),
      );
      this.carets.push(
        scene.add.rectangle(slotX, y + 44, 54, 5, PALETTE.magenta).setOrigin(0.5),
      );
    }
    this.render();
  }

  /** Route a keydown here. Returns true if the key was consumed. */
  handleKey(event: KeyboardEvent): boolean {
    if (this.done) return false;
    const key = event.key;

    if (key === 'Enter') {
      this.confirm();
      return true;
    }
    if (key === 'Backspace' || key === 'Delete') {
      // Step back and blank, which is what backspace means everywhere else.
      if (this.index > 0) this.index -= 1;
      this.chars[this.index] = ' ';
      this.beep();
      this.render();
      return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.index = Phaser.Math.Wrap(this.index + (key === 'ArrowLeft' ? -1 : 1), 0, INITIALS_LENGTH);
      this.beep();
      this.render();
      return true;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const at = INITIALS_ALPHABET.indexOf(this.chars[this.index]!);
      const step = key === 'ArrowUp' ? 1 : -1;
      const next = Phaser.Math.Wrap(at + step, 0, INITIALS_ALPHABET.length);
      this.chars[this.index] = INITIALS_ALPHABET[next]!;
      this.beep();
      this.render();
      return true;
    }
    if (isInitialChar(key)) {
      this.chars[this.index] = key.toUpperCase();
      this.beep();
      // Typing the last letter arms the entry but does not submit it: losing a
      // run to a stray keystroke on the score screen would be a poor joke.
      if (this.index < INITIALS_LENGTH - 1) this.index += 1;
      this.render();
      return true;
    }

    getAudio(this.scene)?.play('error');
    return false;
  }

  get value(): string {
    return normalizeInitials(this.chars.join(''));
  }

  /** Clear the widget off the screen once its answer has been taken. */
  destroy(): void {
    for (const slot of this.slots) slot.destroy();
    for (const caret of this.carets) caret.destroy();
    this.slots.length = 0;
    this.carets.length = 0;
    this.done = true;
  }

  private confirm(): void {
    if (this.done) return;
    this.done = true;
    for (const caret of this.carets) caret.setVisible(false);
    getAudio(this.scene)?.play('purchase');
    this.onConfirm(this.value);
  }

  private beep(): void {
    getAudio(this.scene)?.play('ui');
  }

  private render(): void {
    this.chars.forEach((ch, i) => {
      const active = i === this.index;
      // A blank slot still needs to occupy space, or the row jumps about.
      this.slots[i]!.setText(ch === ' ' ? '_' : ch);
      this.slots[i]!.setColor(active ? CSS.white : CSS.yellow);
      this.slots[i]!.setScale(active ? 1.12 : 1);
      this.carets[i]!.setFillStyle(active ? PALETTE.magentaHot : PALETTE.deepPurple);
    });
  }
}
