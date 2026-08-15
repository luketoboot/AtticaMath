import { describe, expect, it } from 'vitest';
import {
  CHANNEL_PALETTE_LABEL,
  otherChannelPalette,
  sanitizeChannelPalette,
  type ChannelPalette,
} from '../src/core/settings/channels';
import { channelColors } from '../src/fx/channels';
import { PALETTE } from '../src/fx/palette';

const ALL: readonly ChannelPalette[] = ['neon', 'ember'];

describe('channel palettes', () => {
  it('neon is the shipped look, exactly', () => {
    const neon = channelColors('neon');
    expect(neon.a).toBe(PALETTE.cyan);
    expect(neon.b).toBe(PALETTE.magentaHot);
    expect(neon.bDeep).toBe(PALETTE.magenta);
  });

  it('keeps the two channels apart from bridge and wild in every palette', () => {
    // Bridge stays yellow and wild stays red whatever the pair, so a pair
    // that drifted onto either hue would silently merge two meanings.
    for (const palette of ALL) {
      const chan = channelColors(palette);
      const taken = new Set<number>([PALETTE.yellow, PALETTE.red]);
      for (const hue of [chan.a, chan.b, chan.bDeep]) {
        expect(taken.has(hue), `${palette} reuses a reserved hue`).toBe(false);
      }
      expect(chan.a).not.toBe(chan.b);
    }
  });

  it('css strings agree with the hex numbers', () => {
    for (const palette of ALL) {
      const chan = channelColors(palette);
      const pairs: Array<[number, string]> = [
        [chan.a, chan.aCss],
        [chan.b, chan.bCss],
        [chan.bDeep, chan.bDeepCss],
      ];
      for (const [hex, css] of pairs) {
        expect(css).toBe(`#${hex.toString(16).padStart(6, '0')}`);
      }
    }
  });

  it('every palette has a label and a partner', () => {
    for (const palette of ALL) {
      expect(CHANNEL_PALETTE_LABEL[palette].length).toBeGreaterThan(0);
      expect(otherChannelPalette(palette)).not.toBe(palette);
      expect(otherChannelPalette(otherChannelPalette(palette))).toBe(palette);
    }
  });

  it('sanitize accepts the legal values and defaults everything else', () => {
    expect(sanitizeChannelPalette('ember')).toBe('ember');
    expect(sanitizeChannelPalette('neon')).toBe('neon');
    expect(sanitizeChannelPalette('octarine')).toBe('neon');
    expect(sanitizeChannelPalette(undefined)).toBe('neon');
    expect(sanitizeChannelPalette(3)).toBe('neon');
  });
});
