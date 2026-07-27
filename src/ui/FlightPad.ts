import Phaser from 'phaser';
import {
  isHeld,
  NO_HOLDS,
  press,
  release,
  releaseAll,
  releasePointer,
  type HoldMap,
} from '../core/input/holds';
import { CSS, FONT, PALETTE } from '../fx/palette';
import { paintPanel } from './panels';

/**
 * On-screen controls for the flight modes.
 *
 * The ship rotates and thrusts — it does not steer toward a point — so the
 * honest touch control is the same four holds the keyboard sends, not a stick
 * that would quietly turn this into a different game. `stepFlight` never learns
 * where its booleans came from, which keeps a run flown by thumb comparable
 * with one flown by keyboard. That matters here: these modes have a
 * leaderboard.
 *
 * Laid out for two thumbs in landscape. Turning and thrust sit bottom-left as
 * a diamond, the trigger actions bottom-right, and both stay faint enough to
 * see the field through — in these modes rocks drift straight through the
 * corners, and a solid control would hide one.
 */

/** The four holds a flight scene polls each frame. */
export type FlightHold = 'up' | 'down' | 'left' | 'right';

/** A button that fires once per tap rather than being held. */
export interface FlightPadAction {
  id: string;
  label: string;
  onPress: () => void;
  accent?: number;
  size?: number;
}

export interface FlightPadOptions {
  /** Trigger buttons for the right thumb. Collapse has two; Factor Storm none. */
  actions?: readonly FlightPadAction[];
  /** Fired when the pad is shown or hidden, so a scene can swap its key hints. */
  onVisibleChange?: (visible: boolean) => void;
}

const BTN = 74;
/** Centre of the left thumb's diamond, and how far the arms reach. */
const HUB_X = 162;
const HUB_Y = 556;
const ARM = 82;

/**
 * Whether the pad was up when the player last left a run. Session-scoped for
 * the same reason the numpad's is: carrying it between modes is helpful,
 * haunting a desktop profile forever is not.
 */
let padOpenThisSession: boolean | null = null;

interface Button {
  id: string;
  label: string;
  gfx: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  accent: number;
  size: number;
  /** Held controls stay lit while down; triggers only flash. */
  holdable: boolean;
}

export class FlightPad {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];
  private readonly actions = new Map<string, () => void>();
  private readonly onVisibleChange: ((visible: boolean) => void) | undefined;
  private holds: HoldMap = NO_HOLDS;

  constructor(scene: Phaser.Scene, opts: FlightPadOptions = {}) {
    this.scene = scene;
    this.onVisibleChange = opts.onVisibleChange;

    // Phaser tracks one touch point by default, which would make thrusting
    // while turning impossible — the second finger would simply not exist.
    scene.input.addPointer(3);

    const children: Phaser.GameObjects.GameObject[] = [];
    const place = (b: Button, x: number, y: number): void => {
      b.gfx.setPosition(x, y);
      b.text.setPosition(x, y);
      children.push(b.gfx, b.text);
    };

    const thrust = this.make('up', '▲', PALETTE.cyan, BTN, true);
    const reverse = this.make('down', '▼', PALETTE.purple, BTN * 0.8, true);
    const left = this.make('left', '◀', PALETTE.cyan, BTN, true);
    const right = this.make('right', '▶', PALETTE.cyan, BTN, true);
    place(thrust, HUB_X, HUB_Y - ARM);
    place(reverse, HUB_X, HUB_Y + ARM);
    place(left, HUB_X - ARM, HUB_Y);
    place(right, HUB_X + ARM, HUB_Y);

    const { width } = scene.scale;
    (opts.actions ?? []).forEach((action, i) => {
      const size = action.size ?? BTN;
      const button = this.make(action.id, action.label, action.accent ?? PALETTE.magenta, size, false);
      this.actions.set(action.id, action.onPress);
      // Stacked upward from the corner, biggest first: the thumb rests on the
      // one it presses most.
      place(button, width - 132, HUB_Y + ARM - 40 - i * 98);
    });

    this.container = scene.add.container(0, 0, children).setDepth(9).setAlpha(0.62);

    // A finger that lifts anywhere releases whatever it was holding, including
    // when it slid off the control first. Without this the ship thrusts on.
    const up = (pointer: Phaser.Input.Pointer): void => {
      this.holds = releasePointer(this.holds, pointer.id);
      this.repaint();
    };
    scene.input.on(Phaser.Input.Events.POINTER_UP, up);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    const blur = (): void => {
      this.holds = releaseAll();
      this.repaint();
    };
    window.addEventListener('blur', blur);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_UP, up);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
      window.removeEventListener('blur', blur);
    });

    this.repaint();
  }

  /** Open state, restored from earlier in the session; `fallback` decides first use. */
  applySessionDefault(fallback: boolean): void {
    this.setVisible(padOpenThisSession ?? fallback);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    padOpenThisSession = visible;
    if (!visible) this.holds = releaseAll();
    this.onVisibleChange?.(visible);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  /**
   * Whether a flight control is down. A hidden pad holds nothing, so a scene
   * can poll this unconditionally and let the keyboard speak for itself.
   */
  isDown(hold: FlightHold): boolean {
    return this.container.visible && isHeld(this.holds, hold);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  // --- buttons ---

  private make(id: string, label: string, accent: number, size: number, holdable: boolean): Button {
    const gfx = this.scene.add.graphics();
    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${Math.round(size * (label.length > 2 ? 0.24 : 0.4))}px`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const button: Button = { id, label, gfx, text, accent, size, holdable };

    gfx.setInteractive(
      new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size),
      Phaser.Geom.Rectangle.Contains,
    );
    gfx.input!.cursor = 'pointer';
    gfx.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (holdable) {
        this.holds = press(this.holds, id, pointer.id);
        this.repaint();
        return;
      }
      this.actions.get(id)?.();
      this.flash(button);
    });
    // Sliding a thumb off a control has to let go of it, or the only way to
    // stop thrusting would be to find the button again.
    gfx.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      if (!holdable) return;
      this.holds = release(this.holds, id, pointer.id);
      this.repaint();
    });

    this.buttons.push(button);
    return button;
  }

  private flash(button: Button): void {
    this.paint(button, true);
    this.scene.time.delayedCall(90, () => {
      if (button.gfx.active) this.paint(button, false);
    });
  }

  /**
   * Repaint everything, not only what can be held — a trigger button is never
   * "down", so painting just the holdable ones left FIRE and SWAP as floating
   * labels with no button under them until the first tap.
   */
  private repaint(): void {
    for (const button of this.buttons) {
      this.paint(button, button.holdable && isHeld(this.holds, button.id));
    }
  }

  private paint(button: Button, lit: boolean): void {
    paintPanel(button.gfx, {
      width: button.size,
      height: button.size,
      accent: lit ? PALETTE.yellow : button.accent,
      chamfer: 12,
      fillAlpha: lit ? 0.9 : 0.4,
      borderWidth: lit ? 3 : 2,
      headerRule: false,
    });
    button.text.setColor(lit ? CSS.yellow : CSS.cyan);
  }
}
