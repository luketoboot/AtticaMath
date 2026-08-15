/**
 * The hue pairs behind the channel-palette setting (core/settings/channels).
 *
 * Only the two channels move. Bridge stays yellow and wild stays red in both
 * palettes: those already sit apart from either channel for every common kind
 * of colour vision, and moving them would re-teach meanings that were never
 * the problem. Ember's amber is pulled toward orange so it reads apart from
 * bridge-yellow above it and wild-red below it by luminance as well as hue.
 */
import type { ChannelPalette } from '../core/settings/channels';
import { CSS, PALETTE } from './palette';

export interface ChannelColors {
  /** Channel A — cyan in neon, ice blue in ember. */
  a: number;
  aCss: string;
  /** Channel B, bright form — hot magenta in neon, amber in ember. */
  b: number;
  bCss: string;
  /** Channel B, deep form — plain magenta's slot, for strokes and dimmer marks. */
  bDeep: number;
  bDeepCss: string;
}

const PAIRS: Readonly<Record<ChannelPalette, ChannelColors>> = {
  neon: {
    a: PALETTE.cyan,
    aCss: CSS.cyan,
    b: PALETTE.magentaHot,
    bCss: CSS.magentaHot,
    bDeep: PALETTE.magenta,
    bDeepCss: CSS.magenta,
  },
  ember: {
    a: 0x4da6ff,
    aCss: '#4da6ff',
    b: 0xffa028,
    bCss: '#ffa028',
    bDeep: 0xe87f00,
    bDeepCss: '#e87f00',
  },
};

export function channelColors(palette: ChannelPalette): ChannelColors {
  return PAIRS[palette];
}
