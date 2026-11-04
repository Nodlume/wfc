/**
 * Public entry point for the solver, topology, adjacency, model, tileset, and
 * random-number APIs. Re-exports keep these APIs available from one module.
 */

/** Solver contracts exposed as type-only exports. */
export type {
  /** Adjacency contract from the shared solver types. */
  Adjacency,
  /** Direction type shared by the public APIs. */
  Direction,
  /** Heuristic contract from the shared solver types. */
  Heuristic,
  /** Options type for solver runs. */
  RunOptions,
  /** Result type for a solver step. */
  StepResult,
  /** Topology contract shared by the public APIs. */
  Topology,
  /** Solver-like contract from the shared types. */
  WfcLike,
  /** Solver configuration type. */
  WfcOptions,
  /** Solver status type. */
  WfcStatus,
} from './types.js';

/** Solver class and solve function exposed from the solver module. */
export {
  /** Solver class from the solver module. */
  Wfc,
  /** Solve function from the solver module. */
  solve,
} from './solver.js';

/** Grid and graph topology APIs, with their associated type-only contracts. */
export {
  /** Four-direction definition from the topology module. */
  DIR4,
  /** Six-direction definition from the topology module. */
  DIR6,
  /** Two-dimensional grid API. */
  grid2d,
  /** Three-dimensional grid API. */
  grid3d,
  /** Graph topology API. */
  graphTopology,
  /** Two-dimensional grid type. */
  type Grid2D,
  /** Three-dimensional grid type. */
  type Grid3D,
  /** Grid configuration type. */
  type GridOptions,
  /** Graph topology configuration type. */
  type GraphTopologyOptions,
} from './topology.js';

/** Adjacency construction and matching APIs, with their supporting types. */
export {
  /** Adjacency table API. */
  AdjacencyTable,
  /** Rule-based adjacency API. */
  adjacencyFromRules,
  /** Socket-based adjacency API. */
  adjacencyFromSockets,
  /** Adjacency learning API. */
  learnAdjacency,
  /** Exact socket-matching API. */
  exactMatch,
  /** Flipped socket-matching API. */
  flipMatch,
  /** Adjacency rule type. */
  type AdjacencyRule,
  /** Rule-based adjacency options type. */
  type RulesOptions,
  /** Socket-based adjacency options type. */
  type SocketsOptions,
  /** Socket-matching contract. */
  type SocketMatch,
  /** Adjacency learning options type. */
  type LearnOptions,
  /** Learned adjacency type. */
  type LearnedAdjacency,
} from './adjacency.js';

/** Overlapping-model and text-sample APIs, with their supporting types. */
export {
  /** Overlapping-model API. */
  overlappingModel,
  /** Text-to-sample API. */
  sampleFromText,
  /** Overlapping-model type. */
  type OverlappingModel,
  /** Overlapping-model options type. */
  type OverlappingOptions,
  /** Sample type from the overlapping-model module. */
  type Sample,
} from './overlapping.js';

/** Tileset and socket-rotation APIs, with tile, variant, and option types. */
export {
  /** Tileset API from the tiled module. */
  tileset,
  /** Socket-rotation API from the tiled module. */
  rotateSockets,
  /** Tile definition type. */
  type TileDef,
  /** Tile variant type. */
  type TileVariant,
  /** Tileset type. */
  type Tileset,
  /** Tileset options type. */
  type TilesetOptions,
} from './tiled.js';

/** Random-number, seed-hashing, and weighted-selection APIs and the RNG type. */
export {
  /** Random-number generator creation API. */
  createRng,
  /** Seed-hashing API. */
  hashSeed,
  /** Weighted-selection API. */
  weightedPick,
  /** Random-number generator contract. */
  type Rng,
} from './rng.js';
