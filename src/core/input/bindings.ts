/**
 * Rebindable control scheme. Bindings are stored as physical KeyboardEvent.code
 * values ('KeyW', 'ArrowUp', 'Space'), NOT Phaser key codes or event.key, so a
 * binding means the same physical key regardless of the OS keyboard layout.
 * This is what lets a player on an AZERTY/DVORAK/non-US board fix movement that
 * would otherwise land on the wrong physical keys.
 *
 * Pure data + helpers, no Phaser. The game layer (KeyState) reads these.
 */

export type BindableAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'launch'
  | 'switchWeapon'
  | 'pause';

export const BINDABLE_ACTIONS: readonly BindableAction[] = [
  'up',
  'down',
  'left',
  'right',
  'launch',
  'switchWeapon',
  'pause',
];

/** Two slots per action (primary, secondary); either may be null. */
export type KeyBindings = Record<BindableAction, [string | null, string | null]>;

export const DEFAULT_BINDINGS: KeyBindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  launch: ['Space', null],
  switchWeapon: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', null],
};

/**
 * One binding drives different verbs per mode — in free flight `up` is thrust
 * and `left`/`right` swing the nose, while Meteor Defense still strafes the
 * cannon. Labels name both so neither reading is a surprise.
 */
export const ACTION_LABELS: Record<BindableAction, string> = {
  up: 'THRUST / UP',
  down: 'REVERSE / DOWN',
  left: 'TURN LEFT / LEFT',
  right: 'TURN RIGHT / RIGHT',
  launch: 'FIRE / LAUNCH',
  switchWeapon: 'SWAP WEAPON',
  pause: 'PAUSE',
};

/** Fresh deep copy of the defaults (never hand out the shared literal). */
export function defaultBindings(): KeyBindings {
  return BINDABLE_ACTIONS.reduce((acc, action) => {
    acc[action] = [...DEFAULT_BINDINGS[action]];
    return acc;
  }, {} as KeyBindings);
}

/**
 * Merge a possibly-partial/legacy saved value over the defaults so every action
 * always resolves to a valid two-slot pair, even if the save predates an action.
 */
export function resolveBindings(saved: unknown): KeyBindings {
  const out = defaultBindings();
  if (typeof saved !== 'object' || saved === null) return out;
  const record = saved as Partial<Record<BindableAction, unknown>>;
  for (const action of BINDABLE_ACTIONS) {
    const slots = record[action];
    if (Array.isArray(slots)) {
      out[action] = [normalizeSlot(slots[0]), normalizeSlot(slots[1])];
    }
  }
  return out;
}

function normalizeSlot(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** True if a pressed KeyboardEvent.code satisfies any slot of the action. */
export function codeMatches(slots: readonly (string | null)[], code: string): boolean {
  return slots.some((slot) => slot !== null && slot === code);
}

/** Short human label for a KeyboardEvent.code, for the bindings UI. */
export function keyLabel(code: string | null): string {
  if (code === null) return '—';
  const named: Record<string, string> = {
    Space: 'SPACE',
    Escape: 'ESC',
    Enter: 'ENTER',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backspace: 'BKSP',
    Tab: 'TAB',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT',
    AltRight: 'R-ALT',
  };
  if (named[code]) return named[code];
  // KeyW -> W, Digit3 -> 3, Numpad5 -> NUM5, Comma -> COMMA
  const key = code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'NUM');
  return key.toUpperCase();
}
