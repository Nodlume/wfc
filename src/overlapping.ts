/**
 * Builds overlapping WFC models from sample grids, with pattern frequencies,
 * overlap-based adjacency, and helpers for decoding patterns into sample values.
 */
import { AdjacencyTable } from './adjacency.js';
import { Wfc } from './solver.js';
import { DIR4, grid2d, type Grid2D } from './topology.js';
import type { WfcOptions } from './types.js';

/** A rectangular source grid whose values are read in row-major order. */
export interface Sample<T> {
  /** Number of values in each row. */
  width: number;
  /** Number of rows. */
  height: number;
  /** Row-major, `width * height` values. */
  data: ArrayLike<T>;
}

/** Controls sample pattern extraction and the dimensions and wrapping of the output grid. */
export interface OverlappingOptions<T> {
  /** Source values from which patterns and their occurrence weights are learned. */
  sample: Sample<T>;
  /** Pattern size (N×N). Default 3. */
  n?: number;
  /** Treat the sample as wrapping. Default true. */
  periodicInput?: boolean;
  /** Number of variants to include, ordered as original, mirror, 90° rotation, its mirror, 180° rotation, its mirror, 270° rotation, its mirror. Default 8. */
  symmetry?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Number of output cells in each row; each cell represents a pattern's top-left pixel. */
  width: number;
  /** Number of output cell rows. */
  height: number;
  /** Output wraps. Default false. */
  periodicOutput?: boolean;
  /** Identity key for sample values. Default: the value itself (fine for primitives). */
  key?: (value: T) => string | number;
}

/** Extracted patterns and solver inputs, with helpers that interpret each cell by its top-left pixel. */
export interface OverlappingModel<T> {
  /** Side length shared by all square patterns. */
  readonly n: number;
  /** Distinct sample values; pattern pixels index into this. */
  readonly colors: T[];
  /** Each pattern is `n*n` color indices, row-major. */
  readonly patterns: number[][];
  /** Occurrence counts across sampled windows and the selected symmetry variants, including duplicate variants. */
  readonly weights: number[];
  /** Allowed neighbors in the four cardinal directions, determined by matching overlapping pixels. */
  readonly adjacency: AdjacencyTable;
  /** Output grid used by every solver created from this model. */
  readonly topology: Grid2D;
  /** Build a solver for this model. Extra options are passed to `Wfc`. */
  createSolver(options?: Omit<WfcOptions, 'topology' | 'adjacency' | 'weights'>): Wfc;
  /** Map a solver result (pattern per cell) to the output value of each cell. Uncollapsed cells become `undefined`. */
  decode(result: ArrayLike<number>): (T | undefined)[];
  /** Probability of each color at `cell` given the solver's current superposition. */
  colorDistribution(wfc: Wfc, cell: number): Float64Array;
  /** Pattern indices whose top-left pixel equals a given color index — handy for `wfc.set()` constraints. */
  patternsWithColor(colorIndex: number): number[];
}

/**
 * Build the classic "overlapping" model: every N×N window of the sample becomes
 * a pattern, and two patterns may be neighbors when their overlapping region agrees.
 * Each output cell corresponds to the top-left pixel of the pattern placed there.
 * Values with the same identity key share a color index; the first value is kept
 * for decoding. Repeated windows and symmetry variants contribute to weights.
 * Throws if N is less than 1, the sample data length differs from its area, or
 * a nonwrapping sample is smaller than a pattern in either dimension.
 */
export function overlappingModel<T>(opts: OverlappingOptions<T>): OverlappingModel<T> {
  const n = opts.n ?? 3;
  const periodicInput = opts.periodicInput ?? true;
  const symmetry = opts.symmetry ?? 8;
  const key = opts.key ?? ((v: T) => v as unknown as string | number);
  const { width: SW, height: SH, data } = opts.sample;
  if (n < 1) throw new Error('overlappingModel: n must be >= 1');
  if (data.length !== SW * SH) throw new Error('overlappingModel: sample data length does not match width*height');
  if (!periodicInput && (SW < n || SH < n)) throw new Error('overlappingModel: sample smaller than pattern size');

  // Index colors.
  const colorIndex = new Map<string | number, number>();
  const colors: T[] = [];
  const sample = new Int32Array(SW * SH);
  for (let i = 0; i < data.length; i++) {
    const k = key(data[i]);
    let idx = colorIndex.get(k);
    if (idx === undefined) {
      idx = colors.length;
      colorIndex.set(k, idx);
      colors.push(data[i]);
    }
    sample[i] = idx;
  }

  const pattern = (f: (x: number, y: number) => number): number[] => {
    const out = new Array<number>(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x + y * n] = f(x, y);
    return out;
  };
  const rotate = (p: number[]) => pattern((x, y) => p[n - 1 - y + x * n]);
  const reflect = (p: number[]) => pattern((x, y) => p[n - 1 - x + y * n]);

  const patternIndex = new Map<string, number>();
  const patterns: number[][] = [];
  const weights: number[] = [];
  const xMax = periodicInput ? SW : SW - n + 1;
  const yMax = periodicInput ? SH : SH - n + 1;
  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < xMax; x++) {
      const ps: number[][] = new Array(8);
      ps[0] = pattern((dx, dy) => sample[((x + dx) % SW) + ((y + dy) % SH) * SW]);
      ps[1] = reflect(ps[0]);
      ps[2] = rotate(ps[0]);
      ps[3] = reflect(ps[2]);
      ps[4] = rotate(ps[2]);
      ps[5] = reflect(ps[4]);
      ps[6] = rotate(ps[4]);
      ps[7] = reflect(ps[6]);
      for (let k = 0; k < symmetry; k++) {
        const p = ps[k];
        const h = p.join(',');
        const idx = patternIndex.get(h);
        if (idx === undefined) {
          patternIndex.set(h, patterns.length);
          patterns.push(p);
          weights.push(1);
        } else {
          weights[idx]++;
        }
      }
    }
  }

  const T = patterns.length;
  const agrees = (p1: number[], p2: number[], dx: number, dy: number): boolean => {
    const xmin = dx < 0 ? 0 : dx;
    const xmax = dx < 0 ? dx + n : n;
    const ymin = dy < 0 ? 0 : dy;
    const ymax = dy < 0 ? dy + n : n;
    for (let y = ymin; y < ymax; y++)
      for (let x = xmin; x < xmax; x++) if (p1[x + n * y] !== p2[x - dx + n * (y - dy)]) return false;
    return true;
  };
  const adjacency = new AdjacencyTable(T, 4, DIR4.opposite);
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = DIR4.deltas[d];
    for (let a = 0; a < T; a++) for (let b = 0; b < T; b++) if (agrees(patterns[a], patterns[b], dx, dy)) adjacency.allow(a, d, b, false);
  }

  const topology = grid2d(opts.width, opts.height, { periodic: opts.periodicOutput ?? false });

  return {
    n,
    colors,
    patterns,
    weights,
    adjacency,
    topology,
    createSolver(options = {}) {
      return new Wfc({ ...options, topology, adjacency, weights });
    },
    decode(result) {
      const out = new Array<T | undefined>(result.length);
      for (let i = 0; i < result.length; i++) {
        const p = result[i];
        out[i] = p >= 0 ? colors[patterns[p][0]] : undefined;
      }
      return out;
    },
    colorDistribution(wfc, cell) {
      const dist = new Float64Array(colors.length);
      const probs = wfc.probabilities(cell);
      for (let t = 0; t < T; t++) if (probs[t] > 0) dist[patterns[t][0]] += probs[t];
      return dist;
    },
    patternsWithColor(colorIdx) {
      const out: number[] = [];
      for (let t = 0; t < T; t++) if (patterns[t][0] === colorIdx) out.push(t);
      return out;
    },
  };
}

/**
 * Parse a multi-line string into a `Sample<string>` of single characters.
 * Blank lines are ignored and common leading indentation is stripped, so
 * indented template literals work. Short rows are padded with spaces.
 * Trailing whitespace is removed before measuring rows; characters are read as
 * UTF-16 code units. Throws when no nonblank rows remain.
 */
export function sampleFromText(text: string): Sample<string> {
  let rows = text
    .split(/\r?\n/)
    .map((r) => r.trimEnd())
    .filter((r) => r.length > 0);
  if (rows.length === 0) throw new Error('sampleFromText: empty sample');
  const indent = Math.min(...rows.map((r) => r.length - r.trimStart().length));
  rows = rows.map((r) => r.slice(indent));
  const width = Math.max(...rows.map((r) => r.length));
  const data: string[] = [];
  for (const row of rows) for (let x = 0; x < width; x++) data.push(row[x] ?? ' ');
  return { width, height: rows.length, data };
}
