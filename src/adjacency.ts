import type { Adjacency, Direction, Topology } from './types.js';

/** A rule saying pattern `b` may be placed in `direction` from pattern `a`. */
export type AdjacencyRule = readonly [a: number, direction: Direction, b: number];

/**
 * Mutable adjacency table. Build it with `allow()` / `disallow()`, or use one of
 * the `adjacencyFrom*` helpers. Lists returned by `allowed()` are cached and
 * invalidated on mutation.
 */
export class AdjacencyTable implements Adjacency {
  private readonly sets: Set<number>[][];
  private cache: (number[] | undefined)[][];

  constructor(
    readonly patternCount: number,
    readonly directionCount: number,
    readonly opposite: (d: Direction) => Direction,
  ) {
    if (patternCount <= 0) throw new Error('AdjacencyTable: patternCount must be positive');
    this.sets = Array.from({ length: directionCount }, () =>
      Array.from({ length: patternCount }, () => new Set<number>()),
    );
    this.cache = Array.from({ length: directionCount }, () => new Array(patternCount));
  }

  /** Allow `b` in `direction` from `a`. With `symmetric` (default) also allows `a` in opposite(direction) from `b`. */
  allow(a: number, direction: Direction, b: number, symmetric = true): this {
    this.check(a, direction, b);
    this.sets[direction][a].add(b);
    this.cache[direction][a] = undefined;
    if (symmetric) {
      const o = this.opposite(direction);
      this.sets[o][b].add(a);
      this.cache[o][b] = undefined;
    }
    return this;
  }

  disallow(a: number, direction: Direction, b: number, symmetric = true): this {
    this.check(a, direction, b);
    this.sets[direction][a].delete(b);
    this.cache[direction][a] = undefined;
    if (symmetric) {
      const o = this.opposite(direction);
      this.sets[o][b].delete(a);
      this.cache[o][b] = undefined;
    }
    return this;
  }

  isAllowed(direction: Direction, a: number, b: number): boolean {
    return this.sets[direction][a].has(b);
  }

  allowed(direction: Direction, pattern: number): readonly number[] {
    let list = this.cache[direction][pattern];
    if (!list) {
      list = [...this.sets[direction][pattern]].sort((x, y) => x - y);
      this.cache[direction][pattern] = list;
    }
    return list;
  }

  /** Allow every pattern next to every other pattern in every direction. */
  allowAll(): this {
    for (let d = 0; d < this.directionCount; d++) {
      for (let a = 0; a < this.patternCount; a++) {
        for (let b = 0; b < this.patternCount; b++) this.sets[d][a].add(b);
        this.cache[d][a] = undefined;
      }
    }
    return this;
  }

  /** Flatten to a rule list (one entry per allowed (a, d, b) triple). */
  toRules(): AdjacencyRule[] {
    const out: AdjacencyRule[] = [];
    for (let d = 0; d < this.directionCount; d++)
      for (let a = 0; a < this.patternCount; a++) for (const b of this.allowed(d, a)) out.push([a, d, b]);
    return out;
  }

  /** True if for every allowed (a, d, b), (b, opposite(d), a) is also allowed. */
  isSymmetric(): boolean {
    for (let d = 0; d < this.directionCount; d++) {
      const o = this.opposite(d);
      for (let a = 0; a < this.patternCount; a++)
        for (const b of this.sets[d][a]) if (!this.sets[o][b].has(a)) return false;
    }
    return true;
  }

  private check(a: number, d: Direction, b: number): void {
    if (d < 0 || d >= this.directionCount) throw new RangeError(`direction ${d} out of range`);
    if (a < 0 || a >= this.patternCount || b < 0 || b >= this.patternCount)
      throw new RangeError(`pattern index out of range: ${a}, ${b}`);
  }
}

export interface RulesOptions {
  patternCount: number;
  directionCount: number;
  opposite: (d: Direction) => Direction;
  rules: Iterable<AdjacencyRule>;
  /** Mirror each rule into the opposite direction. Default true. */
  symmetric?: boolean;
}

/** Build an adjacency from explicit `[a, direction, b]` rules. */
export function adjacencyFromRules(opts: RulesOptions): AdjacencyTable {
  const table = new AdjacencyTable(opts.patternCount, opts.directionCount, opts.opposite);
  const symmetric = opts.symmetric ?? true;
  for (const [a, d, b] of opts.rules) table.allow(a, d, b, symmetric);
  return table;
}

/** Decides whether socket `a` (on one tile's edge) fits socket `b` (on the facing edge of the neighbor). */
export type SocketMatch = (a: string, b: string) => boolean;

/** Sockets fit when their labels are identical. */
export const exactMatch: SocketMatch = (a, b) => a === b;

/**
 * Marian42-style sockets: labels ending in `s` are symmetric and fit themselves;
 * any other label `X` fits only its flipped counterpart `Xf` (and vice versa).
 * Use this when tile edges have a left/right orientation that must line up.
 */
export const flipMatch: SocketMatch = (a, b) => {
  if (a.endsWith('s') || b.endsWith('s')) return a === b;
  const af = a.endsWith('f');
  const bf = b.endsWith('f');
  if (af === bf) return false;
  return (af ? a.slice(0, -1) : a) === (bf ? b.slice(0, -1) : b);
};

export interface SocketsOptions {
  /** sockets[pattern][direction] = socket label on that edge. */
  sockets: ReadonlyArray<ReadonlyArray<string>>;
  directionCount: number;
  opposite: (d: Direction) => Direction;
  /** Default `exactMatch`. Should be symmetric: match(a, b) === match(b, a). */
  match?: SocketMatch;
}

/**
 * Build an adjacency from per-edge socket labels: `b` may be placed in direction `d`
 * from `a` when `a`'s socket on edge `d` matches `b`'s socket on the opposite edge.
 */
export function adjacencyFromSockets(opts: SocketsOptions): AdjacencyTable {
  const { sockets, directionCount, opposite } = opts;
  const match = opts.match ?? exactMatch;
  const n = sockets.length;
  const table = new AdjacencyTable(n, directionCount, opposite);
  for (let a = 0; a < n; a++) {
    if (sockets[a].length !== directionCount)
      throw new Error(`adjacencyFromSockets: pattern ${a} has ${sockets[a].length} sockets, expected ${directionCount}`);
    for (let d = 0; d < directionCount; d++) {
      const o = opposite(d);
      for (let b = 0; b < n; b++) if (match(sockets[a][d], sockets[b][o])) table.allow(a, d, b, false);
    }
  }
  return table;
}

export interface LearnedAdjacency<T> {
  adjacency: AdjacencyTable;
  /** Distinct values in first-seen order; pattern index = position here. */
  patterns: T[];
  /** Occurrence count of each pattern in the sample. */
  weights: number[];
  /** The sample re-expressed as pattern indices. */
  indices: Int32Array;
}

export interface LearnOptions<T> {
  /** One value per cell of `topology`. */
  sample: ArrayLike<T>;
  /** Topology the sample is laid out on (e.g. `grid2d(sampleWidth, sampleHeight, { periodic: true })`). */
  topology: Topology;
  /** Key used to identify equal values. Default: the value itself (fine for primitives). */
  key?: (value: T) => string | number;
}

/**
 * Learn which values appear next to which in an example laid out on a topology.
 * This is the "simple tiled from example" model: each distinct value becomes a
 * pattern, allowed pairs are exactly the pairs observed in the sample, and
 * weights are occurrence counts. The output topology must use the same direction set.
 */
export function learnAdjacency<T>(opts: LearnOptions<T>): LearnedAdjacency<T> {
  const { sample, topology } = opts;
  const key = opts.key ?? ((v: T) => v as unknown as string | number);
  if (sample.length !== topology.size)
    throw new Error(`learnAdjacency: sample has ${sample.length} values, topology has ${topology.size} cells`);
  const indexOf = new Map<string | number, number>();
  const patterns: T[] = [];
  const weights: number[] = [];
  const indices = new Int32Array(sample.length);
  for (let i = 0; i < sample.length; i++) {
    const k = key(sample[i]);
    let idx = indexOf.get(k);
    if (idx === undefined) {
      idx = patterns.length;
      indexOf.set(k, idx);
      patterns.push(sample[i]);
      weights.push(0);
    }
    weights[idx]++;
    indices[i] = idx;
  }
  const adjacency = new AdjacencyTable(patterns.length, topology.directionCount, (d) => topology.opposite(d));
  for (let c = 0; c < topology.size; c++) {
    for (let d = 0; d < topology.directionCount; d++) {
      const n = topology.neighbor(c, d);
      if (n >= 0) adjacency.allow(indices[c], d, indices[n]);
    }
  }
  return { adjacency, patterns, weights, indices };
}
