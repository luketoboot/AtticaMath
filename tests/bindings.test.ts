import { describe, expect, it } from 'vitest';
import {
  BINDABLE_ACTIONS,
  codeMatches,
  defaultBindings,
  DEFAULT_BINDINGS,
  keyLabel,
  resolveBindings,
} from '../src/core/input/bindings';

describe('defaultBindings', () => {
  it('deep-copies the defaults so callers cannot mutate the shared literal', () => {
    const a = defaultBindings();
    a.up[0] = 'KeyK';
    expect(defaultBindings().up[0]).toBe('KeyW');
    expect(DEFAULT_BINDINGS.up[0]).toBe('KeyW');
  });

  it('covers every bindable action with two slots', () => {
    const b = defaultBindings();
    for (const action of BINDABLE_ACTIONS) {
      expect(b[action]).toHaveLength(2);
    }
  });
});

describe('resolveBindings', () => {
  it('falls back to defaults for missing actions', () => {
    expect(resolveBindings(undefined)).toEqual(defaultBindings());
    expect(resolveBindings(null)).toEqual(defaultBindings());
    expect(resolveBindings('garbage')).toEqual(defaultBindings());
  });

  it('keeps saved slots and defaults the rest', () => {
    const resolved = resolveBindings({ left: ['KeyJ', null] });
    expect(resolved.left).toEqual(['KeyJ', null]);
    expect(resolved.right).toEqual(defaultBindings().right);
  });

  it('normalises non-string slots to null', () => {
    const resolved = resolveBindings({ up: [42, ''] });
    expect(resolved.up).toEqual([null, null]);
  });
});

describe('codeMatches', () => {
  it('matches any non-null slot', () => {
    expect(codeMatches(['KeyA', 'ArrowLeft'], 'ArrowLeft')).toBe(true);
    expect(codeMatches(['KeyA', null], 'KeyA')).toBe(true);
    expect(codeMatches(['KeyA', null], 'KeyD')).toBe(false);
    expect(codeMatches([null, null], 'KeyA')).toBe(false);
  });
});

describe('keyLabel', () => {
  it('shortens common codes', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Numpad5')).toBe('NUM5');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('Space')).toBe('SPACE');
    expect(keyLabel('Escape')).toBe('ESC');
    expect(keyLabel(null)).toBe('—');
  });
});
