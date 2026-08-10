import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  absorb,
  breakChain,
  committedTo,
  linkProgress,
  newChain,
  payoutFor,
  type ChainState,
  type Colour,
} from '../src/core/polarity/chain';

const cfg = CONFIG.polarity.chain;

/** Run a sequence of absorptions and report what happened along the way. */
function run(sequence: readonly Colour[]) {
  let state: ChainState = newChain();
  const links: number[] = [];
  let broke = false;
  let scored = 0;
  for (const colour of sequence) {
    const step = absorb(state, colour, cfg);
    state = step.state;
    if (step.linked) links.push(state.links);
    if (step.broke) broke = true;
    scored += step.payout;
  }
  return { state, links, broke, scored };
}

describe('links', () => {
  it('three of a colour makes one', () => {
    const { state, links } = run(['a', 'a', 'a']);
    expect(links).toEqual([1]);
    expect(state.links).toBe(1);
    expect(state.window).toEqual([]);
  });

  it('the fourth starts the next one rather than extending the first', () => {
    const { state, links } = run(['a', 'a', 'a', 'a']);
    expect(links).toEqual([1]);
    expect(state.window).toEqual(['a']);
  });

  it('lets the run change colour once a link is banked', () => {
    const { state, links, broke } = run(['a', 'a', 'a', 'b', 'b', 'b']);
    expect(links).toEqual([1, 2]);
    expect(broke).toBe(false);
    expect(state.links).toBe(2);
  });

  it('breaks on a colour mixed into an open link', () => {
    const { state, broke } = run(['a', 'a', 'b']);
    expect(broke).toBe(true);
    expect(state.links).toBe(0);
    expect(state.window).toEqual([]);
  });

  it('breaks the moment the second colour lands, not a mote later', () => {
    // The player has already seen themselves take the wrong one. A game that
    // waits for confirmation reads as deciding rather than reacting.
    const step = absorb({ window: ['a'], links: 3 }, 'b', cfg);
    expect(step.broke).toBe(true);
    expect(step.state.links).toBe(0);
  });

  it('loses banked links when it breaks mid-link', () => {
    const { state } = run(['a', 'a', 'a', 'a', 'a', 'b']);
    expect(state.links).toBe(0);
  });

  it('but a colour landing on a closed link is free, not a break', () => {
    // Six of a colour is two links and an empty window, and an empty window
    // takes anything. This is the rule that makes flipping between links the
    // safe moment to do it.
    const { state, broke } = run(['a', 'a', 'a', 'a', 'a', 'a', 'b']);
    expect(broke).toBe(false);
    expect(state.links).toBe(2);
    expect(state.window).toEqual(['b']);
  });
});

describe('bridges are jokers', () => {
  it('completes a link from either side', () => {
    expect(run(['joker', 'a', 'a']).links).toEqual([1]);
    expect(run(['a', 'joker', 'a']).links).toEqual([1]);
    expect(run(['a', 'a', 'joker']).links).toEqual([1]);
    expect(run(['joker', 'b', 'b']).links).toEqual([1]);
  });

  it('makes a link out of nothing but common multiples', () => {
    const { links, broke } = run(['joker', 'joker', 'joker']);
    expect(links).toEqual([1]);
    expect(broke).toBe(false);
  });

  it('does not paper over a real mix', () => {
    expect(run(['a', 'joker', 'b']).broke).toBe(true);
  });

  it('leaves a run uncommitted, which is what makes them worth hunting', () => {
    const { state } = run(['joker', 'joker']);
    expect(committedTo(state)).toBeUndefined();
    // Still open in both directions.
    expect(absorb(state, 'a', cfg).linked).toBe(true);
    expect(absorb(state, 'b', cfg).linked).toBe(true);
  });

  it('commits as soon as a real colour lands', () => {
    expect(committedTo(run(['joker', 'a']).state)).toBe('a');
  });
});

describe('payout', () => {
  it('doubles with each link', () => {
    expect(payoutFor(1, cfg)).toBe(cfg.basePayout);
    expect(payoutFor(2, cfg)).toBe(cfg.basePayout * 2);
    expect(payoutFor(3, cfg)).toBe(cfg.basePayout * 4);
    expect(payoutFor(4, cfg)).toBe(cfg.basePayout * 8);
  });

  it('caps, so a long run cannot run away with the board', () => {
    expect(payoutFor(40, cfg)).toBe(cfg.maxPayout);
    expect(payoutFor(400, cfg)).toBe(cfg.maxPayout);
    expect(Number.isFinite(payoutFor(4000, cfg))).toBe(true);
  });

  it('pays nothing for an absorption that did not complete a link', () => {
    expect(absorb(newChain(), 'a', cfg).payout).toBe(0);
  });

  it('makes the order worth more than the count', () => {
    // Nine absorptions taken in clean triples against the same nine taken so
    // they keep breaking. Same motes, an order of magnitude apart.
    const ordered = run(['a', 'a', 'a', 'b', 'b', 'b', 'a', 'a', 'a']).scored;
    const scattered = run(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a']).scored;
    expect(scattered).toBe(0);
    expect(ordered).toBeGreaterThan(600);
  });
});

describe('bookkeeping', () => {
  it('reports progress into the open link', () => {
    expect(linkProgress(newChain(), cfg)).toBe(0);
    expect(linkProgress({ window: ['a'], links: 0 }, cfg)).toBeCloseTo(1 / 3);
    expect(linkProgress({ window: ['a', 'a'], links: 0 }, cfg)).toBeCloseTo(2 / 3);
  });

  it('drops everything when the run is ended from outside', () => {
    expect(breakChain()).toEqual(newChain());
  });
});
