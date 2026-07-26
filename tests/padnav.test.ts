import { describe, expect, it } from 'vitest';
import { PAD_LAYOUT, stepPad, type PadDir } from '../src/core/input/padnav';

const at = (label: string): number => PAD_LAYOUT.indexOf(label as never);

describe('stepPad', () => {
  it('moves plainly inside the grid', () => {
    expect(stepPad(at('5'), 'up')).toBe(at('8'));
    expect(stepPad(at('5'), 'down')).toBe(at('2'));
    expect(stepPad(at('5'), 'left')).toBe(at('4'));
    expect(stepPad(at('5'), 'right')).toBe(at('6'));
  });

  it('wraps at every edge', () => {
    expect(stepPad(at('7'), 'up')).toBe(at('⌫'));
    expect(stepPad(at('8'), 'up')).toBe(at('0'));
    expect(stepPad(at('4'), 'left')).toBe(at('6'));
    expect(stepPad(at('9'), 'right')).toBe(at('7'));
  });

  it('never lands on the dead cell', () => {
    // Down from 3 would land on the gap; it keeps going and wraps to 9.
    expect(stepPad(at('3'), 'down')).toBe(at('9'));
    // Up from 9 into the gap likewise continues to 3.
    expect(stepPad(at('9'), 'up')).toBe(at('3'));
    // Right from 0 wraps past the gap to the backspace key.
    expect(stepPad(at('0'), 'right')).toBe(at('⌫'));
    // Left from backspace wraps past the gap to 0.
    expect(stepPad(at('⌫'), 'left')).toBe(at('0'));
  });

  it('reaches every live cell and only live cells, from anywhere', () => {
    const dirs: PadDir[] = ['up', 'down', 'left', 'right'];
    for (let i = 0; i < PAD_LAYOUT.length; i++) {
      if (PAD_LAYOUT[i] === '') continue;
      for (const dir of dirs) {
        const next = stepPad(i, dir);
        expect(PAD_LAYOUT[next], `from ${PAD_LAYOUT[i]} ${dir}`).not.toBe('');
        expect(next).not.toBe(i);
      }
    }
  });
});
