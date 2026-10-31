export type {
  Adjacency,
  Direction,
  Heuristic,
  RunOptions,
  StepResult,
  Topology,
  WfcLike,
  WfcOptions,
  WfcStatus,
} from './types.js';

export { Wfc, solve } from './solver.js';

export {
  DIR4,
  DIR6,
  grid2d,
  grid3d,
  graphTopology,
  type Grid2D,
  type Grid3D,
  type GridOptions,
  type GraphTopologyOptions,
} from './topology.js';

export {
  AdjacencyTable,
  adjacencyFromRules,
  adjacencyFromSockets,
  learnAdjacency,
  exactMatch,
  flipMatch,
  type AdjacencyRule,
  type RulesOptions,
  type SocketsOptions,
  type SocketMatch,
  type LearnOptions,
  type LearnedAdjacency,
} from './adjacency.js';

export {
  overlappingModel,
  sampleFromText,
  type OverlappingModel,
  type OverlappingOptions,
  type Sample,
} from './overlapping.js';

export { tileset, rotateSockets, type TileDef, type TileVariant, type Tileset, type TilesetOptions } from './tiled.js';

export { createRng, hashSeed, weightedPick, type Rng } from './rng.js';
