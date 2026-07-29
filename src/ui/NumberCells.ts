import Phaser from 'phaser';
import { bestRect, groupingFor } from '../core/factor/lattice';
import { PALETTE } from '../fx/palette';

/**
 * Counters on a rock: the quantity, laid out as the rectangle it makes.
 *
 * Drawn into a Graphics the caller owns so it can sit inside an asteroid's
 * container and spin with it. Sized to the rock rather than to a fixed cell,
 * because a rock's radius already tracks its value and the counters should
 * fill what they are given.
 *
 * The gap between piles is the whole point of the drawing. When a factor is
 * named the counters do not scatter — they open into that many groups, and the
 * grouping is what the player has to see before the rock comes apart.
 */

export interface CellPaint {
  /** Radius of the rock the counters have to fit inside. */
  radius: number;
  /** Piles to open the block into, if a factor is being shown. */
  groups?: number;
  /** 0..1 through the grouping animation. */
  spread?: number;
  colour?: number;
}

/** Gap between piles at full spread, as a fraction of a cell. */
const OPEN = 0.9;

export function paintCells(g: Phaser.GameObjects.Graphics, value: number, opts: CellPaint): void {
  g.clear();
  const { cols, rows } = bestRect(value);
  if (cols <= 0) return;

  const spread = Math.max(0, Math.min(1, opts.spread ?? 0));
  const grouping = opts.groups === undefined ? undefined : groupingFor(value, opts.groups);

  // Counters run along the rows, so a grouping cuts the block into bands of
  // whole rows wherever it can. When the piles do not fall on row boundaries
  // the block opens along its length instead.
  const byRow = grouping !== undefined && rows % grouping.groups === 0;
  const bands = grouping?.groups ?? 1;
  const gapCells = grouping === undefined ? 0 : (bands - 1) * OPEN * spread;

  // Fit the block inside the rock, gaps included. The radius is the asteroid's
  // *widest* reach and its silhouette dips well inside that, so the block gets
  // rather less than the full span. It gets the whole rock, though: the numeral
  // sits outside now, because at these radii every counter is worth having.
  const spanCols = cols + (byRow ? 0 : gapCells);
  const spanRows = rows + (byRow ? gapCells : 0);
  const cell = Math.min((opts.radius * 1.5) / spanCols, (opts.radius * 1.32) / spanRows);
  if (cell < 2.5) return;

  const pip = cell * 0.7;
  const colour = opts.colour ?? PALETTE.cyan;
  const totalW = spanCols * cell;
  const totalH = spanRows * cell;

  for (let i = 0; i < value; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Which pile this counter belongs to, and therefore how far it has moved.
    const band = grouping === undefined ? 0 : byRow
      ? Math.floor(row / (rows / grouping.groups))
      : Math.floor(i / grouping.size);
    const shift = band * OPEN * spread * cell;

    const x = -totalW / 2 + (col + 0.5) * cell + (byRow ? 0 : shift);
    const y = -totalH / 2 + (row + 0.5) * cell + (byRow ? shift : 0);

    // Read as contents rather than as a second silhouette: filled enough to
    // count, dim enough that the rock is still the object on screen.
    g.fillStyle(colour, 0.5);
    g.fillRect(x - pip / 2, y - pip / 2, pip, pip);
    g.lineStyle(1, colour, 0.85);
    g.strokeRect(x - pip / 2, y - pip / 2, pip, pip);
  }
}
