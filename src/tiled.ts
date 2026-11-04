/** Expands socket-based tiles into rotated solver patterns with adjacency for a 4-connected grid. */
import { adjacencyFromSockets, exactMatch, type AdjacencyTable, type SocketMatch } from './adjacency.js';
import { DIR4 } from './topology.js';

/** Base tile whose sockets, weight, and payload are used to generate rotated variants. */
export interface TileDef {
  name: string;
  /** Socket labels on [up, right, down, left] edges. */
  sockets: readonly [string, string, string, string];
  /** Relative frequency. Default 1. */
  weight?: number;
  /**
   * Which clockwise quarter-turn rotations to generate.
   * `true` = all four (deduplicated), `false` or omitted = only the tile as given,
   * or an explicit list such as `[0, 1]`.
   */
  rotations?: boolean | readonly number[];
  /** Arbitrary payload carried through to the variants (sprite id, mesh name, …). */
  data?: unknown;
}

/** Generated solver pattern with rotated sockets and a reference to its base tile. */
export interface TileVariant {
  /** Pattern index used by the solver. */
  index: number;
  name: string;
  /** Index into the `TileDef[]` this variant came from. */
  base: number;
  /** Clockwise quarter turns applied to the base tile (0–3). */
  rotation: number;
  sockets: readonly [string, string, string, string];
  weight: number;
  data?: unknown;
}

/** Solver patterns, adjacency, and weights sharing the same pattern indices, with lookup by base tile. */
export interface Tileset {
  tiles: TileVariant[];
  adjacency: AdjacencyTable;
  weights: number[];
  /** Variants grouped by base tile index. */
  variantsOf(base: number): TileVariant[];
}

/** Controls socket compatibility, rotation deduplication, and weight allocation across retained variants. */
export interface TilesetOptions {
  /** Socket matching rule. Default `exactMatch`. */
  match?: SocketMatch;
  /** Drop rotated variants whose sockets equal an earlier variant of the same tile. Default true. */
  dedupe?: boolean;
  /** Divide a tile's weight evenly among its variants instead of giving each the full weight. Default false. */
  splitWeight?: boolean;
}

/** Rotate a 4-socket tuple clockwise by `k` quarter turns. */
export function rotateSockets(
  s: readonly [string, string, string, string],
  k: number,
): [string, string, string, string] {
  const r = ((k % 4) + 4) % 4;
  return [s[(0 - r + 4) % 4], s[(1 - r + 4) % 4], s[(2 - r + 4) % 4], s[(3 - r + 4) % 4]];
}

/**
 * Expand tile definitions into rotated variants and build their socket adjacency
 * for a 4-connected grid (`grid2d`). Pattern indices are positions in `tiles`.
 */
export function tileset(defs: readonly TileDef[], opts: TilesetOptions = {}): Tileset {
  const match = opts.match ?? exactMatch;
  const dedupe = opts.dedupe ?? true;
  const tiles: TileVariant[] = [];
  const byBase: TileVariant[][] = [];

  defs.forEach((def, base) => {
    const rots: readonly number[] =
      def.rotations === true ? [0, 1, 2, 3] : def.rotations === false || def.rotations === undefined ? [0] : def.rotations;
    const seen = new Set<string>();
    const variants: TileVariant[] = [];
    for (const k of rots) {
      const sockets = rotateSockets(def.sockets, k);
      const sig = sockets.join('\u0000');
      if (dedupe && seen.has(sig)) continue;
      seen.add(sig);
      variants.push({
        index: -1,
        name: k === 0 ? def.name : `${def.name}@${k * 90}`,
        base,
        rotation: ((k % 4) + 4) % 4,
        sockets,
        weight: def.weight ?? 1,
        data: def.data,
      });
    }
    if (opts.splitWeight) for (const v of variants) v.weight /= variants.length;
    for (const v of variants) {
      v.index = tiles.length;
      tiles.push(v);
    }
    byBase.push(variants);
  });

  const adjacency = adjacencyFromSockets({
    sockets: tiles.map((t) => t.sockets),
    directionCount: 4,
    opposite: DIR4.opposite,
    match,
  });

  return {
    tiles,
    adjacency,
    weights: tiles.map((t) => t.weight),
    variantsOf: (base) => byBase[base] ?? [],
  };
}
