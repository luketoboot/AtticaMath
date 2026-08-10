/**
 * The POLARITY chain.
 *
 * Ikaruga's, not Collapse's: three absorptions of one colour make a link, and
 * links pay double the one before. Collapse chains on a clock — keep collapsing
 * inside a shrinking window — which is a test of pace. This one has no clock at
 * all. It is a test of *order*, and that is the whole difference: a field you
 * could clear comfortably still has to be taken in the right sequence, so the
 * question stops being "can you read these" and becomes "in what order".
 *
 * Common multiples are jokers. A mote divisible by both is safe in either
 * state, so it belongs to whichever run it lands in — which makes the bridges
 * worth hunting rather than merely worth standing on, and puts the mode's one
 * real idea in the scoring as well as the survival.
 *
 * Stated once, so it can be tested once: a link is any three consecutive
 * absorptions whose non-joker colours number one or fewer.
 *
 * Pure. No time, no randomness.
 */

/** Which polarity took a mote, or that it belonged to both. */
export type Colour = 'a' | 'b' | 'joker';

export interface PolarityChainConfig {
  /** Absorptions per link. Three, as in the game this is from. */
  linkLength: number;
  /** Points for the first link. */
  basePayout: number;
  /** Each further link multiplies by this. */
  payoutGrowth: number;
  /** Ceiling on a single link's payout, so a long run cannot run away. */
  maxPayout: number;
}

export interface ChainState {
  /** Absorptions since the last completed link. */
  window: readonly Colour[];
  /** Links completed without breaking. */
  links: number;
}

export function newChain(): ChainState {
  return { window: [], links: 0 };
}

/** The distinct real colours in a run — jokers belong to whatever they join. */
function committedColours(window: readonly Colour[]): Colour[] {
  return [...new Set(window.filter((c) => c !== 'joker'))];
}

/** Payout for completing the nth link (1-based). */
export function payoutFor(link: number, cfg: PolarityChainConfig): number {
  const raw = cfg.basePayout * Math.pow(cfg.payoutGrowth, Math.max(0, link - 1));
  return Math.min(cfg.maxPayout, Math.round(raw));
}

export interface ChainAdvance {
  state: ChainState;
  /** This absorption completed a link. */
  linked: boolean;
  /** This absorption ended the run by mixing colours. */
  broke: boolean;
  /** Points earned, zero unless a link completed. */
  payout: number;
}

/**
 * Register one absorption.
 *
 * A run breaks the moment it holds two real colours, rather than waiting for
 * the third mote to confirm it. The player already knows — they watched
 * themselves take the wrong one — and a game that sits on the news for another
 * absorption is a game that feels like it is deciding rather than reacting.
 */
export function absorb(state: ChainState, colour: Colour, cfg: PolarityChainConfig): ChainAdvance {
  const window = [...state.window, colour];

  if (committedColours(window).length > 1) {
    return { state: newChain(), linked: false, broke: true, payout: 0 };
  }

  if (window.length >= cfg.linkLength) {
    const links = state.links + 1;
    return {
      state: { window: [], links },
      linked: true,
      broke: false,
      payout: payoutFor(links, cfg),
    };
  }

  return { state: { window, links: state.links }, linked: false, broke: false, payout: 0 };
}

/** Drop the run outright — taking a hit, or the wave ending. */
export function breakChain(): ChainState {
  return newChain();
}

/** How far into the current link the player is, 0..1, for the meter. */
export function linkProgress(state: ChainState, cfg: PolarityChainConfig): number {
  return Math.min(1, state.window.length / cfg.linkLength);
}

/**
 * The colour a run is committed to, if any. Undefined means the run is still
 * open — empty, or nothing but jokers so far, which is the position a player
 * angles for because it can still become either.
 */
export function committedTo(state: ChainState): Colour | undefined {
  return committedColours(state.window)[0];
}
