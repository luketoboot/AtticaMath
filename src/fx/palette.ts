/** Neon-on-black palette. Hot magenta, cyan, deep purple, white/yellow for critical info. */
export const PALETTE = {
  black: 0x0a0014,
  deepPurple: 0x2a0e4f,
  purple: 0x6320a0,
  magenta: 0xff2d95,
  magentaHot: 0xff5ad1,
  cyan: 0x00f0ff,
  cyanDim: 0x0aa8c0,
  white: 0xffffff,
  yellow: 0xffe64d,
  red: 0xff3b3b,
} as const;

export const CSS = {
  black: '#0a0014',
  deepPurple: '#2a0e4f',
  purple: '#6320a0',
  magenta: '#ff2d95',
  magentaHot: '#ff5ad1',
  cyan: '#00f0ff',
  cyanDim: '#0aa8c0',
  white: '#ffffff',
  yellow: '#ffe64d',
  red: '#ff3b3b',
} as const;

/** Chunky retro-leaning stack that stays legible for multi-digit numbers. */
export const FONT = '"Consolas", "Courier New", monospace';
