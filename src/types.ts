/** Shared contracts for WFC topology, pattern adjacency, solver options and callback views. */

/** A direction is an integer index into a topology's direction set. */
export type Direction = number;

/**
 * Describes the cells to be solved and how they connect.
 * WFC does not care whether cells form a square grid, a hex grid, a 3D volume
 * or an arbitrary graph — it only needs neighbor lookups and opposite directions.
 */
export interface Topology {
  /** Number of cells. */
  readonly size: number;
  /** Number of distinct directions a cell can look in. */
  readonly directionCount: number;
  /** The direction pointing back: if B is in direction d from A, A is in opposite(d) from B. */
  opposite(direction: Direction): Direction;
  /** Index of the neighbor of `cell` in `direction`, or -1 if there is none. */
  neighbor(cell: number, direction: Direction): number;
}

/**
 * Which patterns may sit next to which, per direction.
 * `allowed(d, a)` returns every pattern b that may occupy the neighbor in direction d
 * of a cell containing pattern a.
 */
export interface Adjacency {
  readonly patternCount: number;
  readonly directionCount: number;
  allowed(direction: Direction, pattern: number): readonly number[];
}

/** Cell selection strategy used when choosing which cell to observe next. */
export type Heuristic = 'entropy' | 'mrv' | 'scanline';

/** Solver lifecycle state, including successful completion and contradictory constraints. */
export type WfcStatus = 'ready' | 'running' | 'done' | 'contradiction';

/** Required cell and pattern constraints, with optional controls for observation and backtracking. */
export interface WfcOptions {
  topology: Topology;
  adjacency: Adjacency;
  /** Relative frequency of each pattern. Positive finite values with finite weight/weight-log-weight sums. Defaults to uniform. */
  weights?: ArrayLike<number>;
  /** Seed for the deterministic RNG. Same seed + same inputs = same output. */
  seed?: number | string;
  /** Cell selection heuristic. Default 'entropy'. */
  heuristic?: Heuristic;
  /**
   * Maximum number of observation snapshots kept for backtracking.
   * 0 (default) disables backtracking — a contradiction ends the run.
   */
  backtrackDepth?: number;
  /** Non-negative finite random noise added to entropies to break ties. Default 1e-6. */
  noise?: number;
}

/** Outcome of a solver step, with optional details about its observation or backtracking. */
export interface StepResult {
  status: WfcStatus;
  /** Cell observed in this step, if any. */
  cell?: number;
  /** Pattern chosen for that cell, if any. */
  pattern?: number;
  /** True if this step undid an earlier decision. */
  backtracked?: boolean;
}

/** Controls step limits, retries after contradiction and callbacks during a run. */
export interface RunOptions {
  /** Abort after this many observation steps. Default: unlimited. */
  maxSteps?: number;
  /**
   * On contradiction (after backtracking is exhausted), reset with a fresh
   * seed and try again this many times. Default 0.
   */
  retries?: number;
  /** Called after each step. */
  onStep?: (result: StepResult, wfc: WfcLike) => void;
  /** Called before each retry. */
  onRetry?: (attempt: number) => void;
}

/** Minimal read-only view of a solver passed to callbacks. */
export interface WfcLike {
  readonly status: WfcStatus;
  readonly cellCount: number;
  readonly patternCount: number;
  possibilities(cell: number): number[];
  isCollapsed(cell: number): boolean;
  collapsed(cell: number): number;
  entropy(cell: number): number;
  result(): Int32Array;
}
