/**
 * Which hue pair the two-channel modes wear.
 *
 * POLARITY and COLLAPSE make colour load-bearing: which channel a thing
 * belongs to decides whether it can be broken, absorbed, or flown through.
 * The shapes already carry that meaning on their own — every class has its
 * own silhouette — but about one player in twelve cannot separate magenta
 * from cyan at speed, and a mode whose whole content is "which kind is this"
 * should not make them do it on hue plus shape when hue alone can be fixed.
 *
 * This is the setting; the actual hex values live in fx/channels.ts with the
 * rest of the rendering, so core stays free of presentation.
 */

export type ChannelPalette = 'neon' | 'ember';

export const CHANNEL_PALETTE_LABEL: Readonly<Record<ChannelPalette, string>> = {
  neon: 'MAGENTA / CYAN',
  ember: 'AMBER / BLUE',
};

export function otherChannelPalette(palette: ChannelPalette): ChannelPalette {
  return palette === 'neon' ? 'ember' : 'neon';
}

/** Read whatever a save holds into a legal value; anything unknown ships default. */
export function sanitizeChannelPalette(raw: unknown): ChannelPalette {
  return raw === 'ember' ? 'ember' : 'neon';
}
