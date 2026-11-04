/**
 * Grid and explicit-graph topologies with indexed cells, directional neighbors,
 * and opposite directions; grids optionally wrap across their boundaries.
 */
import type { Direction, Topology } from './types.js';

/** Named direction set for 4-connected 2D grids: up, right, down, left. */
export const DIR4 = {
  count: 4,
  names: ['up', 'right', 'down', 'left'] as const,
  /** [dx, dy] per direction; y grows downward. */
  deltas: [[0, -1], [1, 0], [0, 1], [-1, 0]] as const,
  opposite: (d: Direction): Direction => (d + 2) % 4,
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
} as const;

/** Named direction set for 6-connected 3D grids: up, right, down, left, above(+z), below(-z). */
export const DIR6 = {
  count: 6,
  names: ['up', 'right', 'down', 'left', 'above', 'below'] as const,
  deltas: [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as const,
  opposite: (d: Direction): Direction => (d < 4 ? (d + 2) % 4 : d === 4 ? 5 : 4),
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
  ABOVE: 4,
  BELOW: 5,
} as const;

/**
 * Rectangular topology with row-major coordinate conversion. Coordinates and
 * cell indices passed to the conversion methods are not bounds-checked.
 */
export interface Grid2D extends Topology {
  readonly width: number;
  readonly height: number;
  readonly periodic: boolean;
  index(x: number, y: number): number;
  coords(cell: number): [x: number, y: number];
}

/** Controls whether grid neighbors wrap at boundaries or return -1 beyond them. */
export interface GridOptions {
  /** Wrap edges (torus). Default false. */
  periodic?: boolean;
}

/** 4-connected rectangular grid. Cells are indexed row-major: index = y * width + x. */
export function grid2d(width: number, height: number, opts: GridOptions = {}): Grid2D {
  const periodic = opts.periodic ?? false;
  if (width <= 0 || height <= 0) throw new Error('grid2d: width and height must be positive');
  return {
    width,
    height,
    periodic,
    size: width * height,
    directionCount: 4,
    opposite: DIR4.opposite,
    index: (x, y) => y * width + x,
    coords: (cell) => [cell % width, Math.floor(cell / width)],
    neighbor(cell, d) {
      let x = (cell % width) + DIR4.deltas[d][0];
      let y = Math.floor(cell / width) + DIR4.deltas[d][1];
      if (periodic) {
        x = (x + width) % width;
        y = (y + height) % height;
      } else if (x < 0 || y < 0 || x >= width || y >= height) {
        return -1;
      }
      return y * width + x;
    },
  };
}

/**
 * Box topology with row-major cells within each z layer. Coordinates and cell
 * indices passed to the conversion methods are not bounds-checked.
 */
export interface Grid3D extends Topology {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly periodic: boolean;
  index(x: number, y: number, z: number): number;
  coords(cell: number): [x: number, y: number, z: number];
}

/** 6-connected box grid. index = z * width * height + y * width + x. */
export function grid3d(width: number, height: number, depth: number, opts: GridOptions = {}): Grid3D {
  const periodic = opts.periodic ?? false;
  if (width <= 0 || height <= 0 || depth <= 0) throw new Error('grid3d: dimensions must be positive');
  const layer = width * height;
  return {
    width,
    height,
    depth,
    periodic,
    size: layer * depth,
    directionCount: 6,
    opposite: DIR6.opposite,
    index: (x, y, z) => z * layer + y * width + x,
    coords: (cell) => [cell % width, Math.floor(cell / width) % height, Math.floor(cell / layer)],
    neighbor(cell, d) {
      let x = (cell % width) + DIR6.deltas[d][0];
      let y = (Math.floor(cell / width) % height) + DIR6.deltas[d][1];
      let z = Math.floor(cell / layer) + DIR6.deltas[d][2];
      if (periodic) {
        x = (x + width) % width;
        y = (y + height) % height;
        z = (z + depth) % depth;
      } else if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) {
        return -1;
      }
      return z * layer + y * width + x;
    },
  };
}

/**
 * Explicit directional adjacency for a graph. Each nonnegative edge must have
 * a reverse edge in its opposite direction; missing entries represent no edge.
 */
export interface GraphTopologyOptions {
  size: number;
  directionCount: number;
  opposite: (d: Direction) => Direction;
  /** edges[cell][direction] = neighbor cell index, or -1 / undefined for none. */
  edges: ReadonlyArray<ReadonlyArray<number>>;
}

/**
 * Arbitrary graph topology from an explicit edge table. Use this for hex grids,
 * irregular meshes, or anything that is not a box. Throws if the table is not
 * consistent with `opposite` (every edge must have a matching reverse edge).
 */
export function graphTopology(opts: GraphTopologyOptions): Topology {
  const { size, directionCount, opposite, edges } = opts;
  for (let c = 0; c < size; c++) {
    for (let d = 0; d < directionCount; d++) {
      const n = edges[c]?.[d] ?? -1;
      if (n >= 0 && (edges[n]?.[opposite(d)] ?? -1) !== c) {
        throw new Error(`graphTopology: edge ${c} -[${d}]-> ${n} has no matching reverse edge`);
      }
    }
  }
  return {
    size,
    directionCount,
    opposite,
    neighbor: (cell, d) => edges[cell]?.[d] ?? -1,
  };
}
