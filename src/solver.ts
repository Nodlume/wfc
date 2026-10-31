import { createRng, weightedPick, type Rng } from './rng.js';
import type {
  Adjacency,
  Heuristic,
  RunOptions,
  StepResult,
  Topology,
  WfcLike,
  WfcOptions,
  WfcStatus,
} from './types.js';

interface Snapshot {
  wave: Uint8Array;
  compatible: Int32Array;
  sumsOfOnes: Int32Array;
  sumsOfWeights: Float64Array;
  sumsOfWeightLogWeights: Float64Array;
  entropies: Float64Array;
  cell: number;
  pattern: number;
}

type Constraint = readonly [kind: 'set' | 'ban', cell: number, pattern: number];

/**
 * Wave Function Collapse solver over an arbitrary topology.
 *
 * Each cell holds a superposition of patterns. Repeatedly the cell with the
 * lowest entropy is *observed* (collapsed to one pattern chosen by weight), and
 * the consequences are *propagated* through the adjacency constraints using
 * AC-4 style support counting. The run ends when every cell holds exactly one
 * pattern (`done`) or some cell holds none (`contradiction`).
 */
export class Wfc implements WfcLike {
  readonly topology: Topology;
  readonly adjacency: Adjacency;
  readonly cellCount: number;
  readonly patternCount: number;
  readonly directionCount: number;
  readonly heuristic: Heuristic;
  readonly backtrackDepth: number;
  readonly noise: number;

  private readonly weights: Float64Array;
  private readonly weightLogWeights: Float64Array;
  private readonly sumOfWeights: number;
  private readonly sumOfWeightLogWeights: number;
  private readonly startingEntropy: number;
  /** propagator[d][t] = patterns allowed in direction d from t. */
  private readonly propagator: number[][][];
  /** initialCompatible[t * D + d] = number of patterns that allow t when placed in direction opposite(d) from them. */
  private readonly initialCompatible: Int32Array;

  private wave: Uint8Array;
  private compatible: Int32Array;
  private sumsOfOnes: Int32Array;
  private sumsOfWeights: Float64Array;
  private sumsOfWeightLogWeights: Float64Array;
  private entropies: Float64Array;

  private readonly stack: Int32Array;
  private stackSize = 0;
  private history: Snapshot[] = [];
  private constraints: Constraint[] = [];
  private rng: Rng;
  private currentSeed: number | string;
  private _status: WfcStatus = 'ready';
  private _steps = 0;
  private _backtracks = 0;

  constructor(options: WfcOptions) {
    const { topology, adjacency } = options;
    if (adjacency.directionCount !== topology.directionCount) {
      throw new Error(
        `Wfc: adjacency has ${adjacency.directionCount} directions but topology has ${topology.directionCount}`,
      );
    }
    this.topology = topology;
    this.adjacency = adjacency;
    this.cellCount = topology.size;
    this.patternCount = adjacency.patternCount;
    this.directionCount = topology.directionCount;
    this.heuristic = options.heuristic ?? 'entropy';
    this.backtrackDepth = Math.max(0, options.backtrackDepth ?? 0);
    this.noise = options.noise ?? 1e-6;
    this.currentSeed = options.seed ?? Date.now();
    this.rng = createRng(this.currentSeed);

    const T = this.patternCount;
    const D = this.directionCount;
    const C = this.cellCount;

    this.weights = new Float64Array(T);
    this.weightLogWeights = new Float64Array(T);
    let sw = 0;
    let swlw = 0;
    for (let t = 0; t < T; t++) {
      const w = options.weights ? options.weights[t] : 1;
      if (!(w > 0) || !Number.isFinite(w)) throw new Error(`Wfc: weight of pattern ${t} must be a positive finite number`);
      this.weights[t] = w;
      this.weightLogWeights[t] = w * Math.log(w);
      sw += w;
      swlw += this.weightLogWeights[t];
    }
    this.sumOfWeights = sw;
    this.sumOfWeightLogWeights = swlw;
    this.startingEntropy = Math.log(sw) - swlw / sw;

    this.propagator = [];
    for (let d = 0; d < D; d++) {
      const row: number[][] = [];
      for (let t = 0; t < T; t++) row.push(Array.from(adjacency.allowed(d, t)));
      this.propagator.push(row);
    }
    this.initialCompatible = new Int32Array(T * D);
    for (let d = 0; d < D; d++) {
      const o = topology.opposite(d);
      for (let t2 = 0; t2 < T; t2++) for (const t of this.propagator[o][t2]) this.initialCompatible[t * D + d]++;
    }

    this.wave = new Uint8Array(C * T);
    this.compatible = new Int32Array(C * T * D);
    this.sumsOfOnes = new Int32Array(C);
    this.sumsOfWeights = new Float64Array(C);
    this.sumsOfWeightLogWeights = new Float64Array(C);
    this.entropies = new Float64Array(C);
    this.stack = new Int32Array(C * T * 2);
    this.clear();
  }

  // ---------------------------------------------------------------- state

  get status(): WfcStatus {
    return this._status;
  }
  /** Observations performed since the last reset (including those later undone). */
  get steps(): number {
    return this._steps;
  }
  get backtracks(): number {
    return this._backtracks;
  }
  get seed(): number | string {
    return this.currentSeed;
  }

  /** Patterns still possible in `cell`. */
  possibilities(cell: number): number[] {
    const out: number[] = [];
    const base = cell * this.patternCount;
    for (let t = 0; t < this.patternCount; t++) if (this.wave[base + t]) out.push(t);
    return out;
  }
  /** Number of patterns still possible in `cell`. */
  remaining(cell: number): number {
    return this.sumsOfOnes[cell];
  }
  isCollapsed(cell: number): boolean {
    return this.sumsOfOnes[cell] === 1;
  }
  /** The single remaining pattern in `cell`, or -1 if it is not collapsed. */
  collapsed(cell: number): number {
    if (this.sumsOfOnes[cell] !== 1) return -1;
    const base = cell * this.patternCount;
    for (let t = 0; t < this.patternCount; t++) if (this.wave[base + t]) return t;
    return -1;
  }
  entropy(cell: number): number {
    return this.entropies[cell];
  }
  /** Normalised weight of each pattern in `cell` (0 for banned patterns). Useful for blended rendering. */
  probabilities(cell: number): Float64Array {
    const out = new Float64Array(this.patternCount);
    const base = cell * this.patternCount;
    const sum = this.sumsOfWeights[cell];
    if (sum <= 0) return out;
    for (let t = 0; t < this.patternCount; t++) if (this.wave[base + t]) out[t] = this.weights[t] / sum;
    return out;
  }
  /** Pattern index per cell, -1 where not yet collapsed. */
  result(): Int32Array {
    const out = new Int32Array(this.cellCount);
    for (let c = 0; c < this.cellCount; c++) out[c] = this.collapsed(c);
    return out;
  }

  // ---------------------------------------------------------------- constraints

  /**
   * Force `cell` to `pattern` and propagate. Recorded as a persistent constraint
   * that is re-applied after every `reset()` (and therefore every retry).
   */
  set(cell: number, pattern: number): this {
    this.constraints.push(['set', cell, pattern]);
    this.applySet(cell, pattern);
    return this;
  }

  /** Forbid `pattern` in `cell` and propagate. Persistent like `set()`. */
  ban(cell: number, pattern: number): this {
    this.constraints.push(['ban', cell, pattern]);
    this.applyBan(cell, pattern);
    return this;
  }

  /** Forget all constraints recorded via `set()` / `ban()`. Takes effect on the next `reset()`. */
  clearConstraints(): this {
    this.constraints = [];
    return this;
  }

  // ---------------------------------------------------------------- control

  /** Return to the initial superposition, optionally with a new seed. Constraints are re-applied. */
  reset(seed?: number | string): this {
    if (seed !== undefined) {
      this.currentSeed = seed;
      this.rng.seed(seed);
    }
    this.clear();
    for (const [kind, cell, pattern] of this.constraints) {
      if (this._status === 'contradiction') break;
      if (kind === 'set') this.applySet(cell, pattern);
      else this.applyBan(cell, pattern);
    }
    return this;
  }

  /** Observe one cell and propagate. */
  step(): StepResult {
    if (this._status === 'done' || this._status === 'contradiction') return { status: this._status };
    this._status = 'running';

    const cell = this.nextCell();
    if (cell === -1) {
      this._status = 'done';
      return { status: 'done' };
    }
    if (cell === -2) {
      this._status = 'contradiction';
      return { status: 'contradiction' };
    }

    const T = this.patternCount;
    const base = cell * T;
    const wave = this.wave;
    const pattern = weightedPick(this.weights, (t) => wave[base + t] === 1, this.rng.next());

    if (this.backtrackDepth > 0) this.pushSnapshot(cell, pattern);

    for (let t = 0; t < T; t++) if (t !== pattern && wave[base + t]) this.banInternal(cell, t);
    this._steps++;

    if (!this.propagate()) {
      if (this.backtrackDepth > 0 && this.history.length > 0) return this.backtrack();
      this._status = 'contradiction';
      return { status: 'contradiction', cell, pattern };
    }
    if (!this.hasUndecided()) this._status = 'done';
    return { status: this._status, cell, pattern };
  }

  /** Step until done or contradiction. Returns the final status. */
  run(options: RunOptions = {}): WfcStatus {
    const maxSteps = options.maxSteps ?? Infinity;
    const retries = options.retries ?? 0;
    let attempt = 0;
    for (;;) {
      let n = 0;
      while (this._status !== 'done' && this._status !== 'contradiction' && n < maxSteps) {
        const r = this.step();
        n++;
        options.onStep?.(r, this);
      }
      if (this._status === 'contradiction' && attempt < retries) {
        attempt++;
        options.onRetry?.(attempt);
        this.reset(this.rng.int(0x7fffffff));
        continue;
      }
      return this._status;
    }
  }

  // ---------------------------------------------------------------- internals

  private clear(): void {
    const T = this.patternCount;
    const D = this.directionCount;
    const C = this.cellCount;
    this.wave.fill(1);
    this.sumsOfOnes.fill(T);
    this.sumsOfWeights.fill(this.sumOfWeights);
    this.sumsOfWeightLogWeights.fill(this.sumOfWeightLogWeights);
    this.entropies.fill(this.startingEntropy);
    this.stackSize = 0;
    this.history = [];
    this._steps = 0;
    this._backtracks = 0;
    this._status = 'ready';

    const hasNeighbor = new Uint8Array(D);
    for (let c = 0; c < C; c++) {
      for (let d = 0; d < D; d++) hasNeighbor[d] = this.topology.neighbor(c, d) >= 0 ? 1 : 0;
      for (let t = 0; t < T; t++) {
        const base = (c * T + t) * D;
        for (let d = 0; d < D; d++) {
          // A missing neighbor imposes no constraint: sentinel support of 1 that is never decremented.
          this.compatible[base + d] = hasNeighbor[d] ? this.initialCompatible[t * D + d] : 1;
        }
      }
    }
    // Patterns with no possible supporter in some direction can never be placed there.
    for (let c = 0; c < C; c++) {
      for (let t = 0; t < T; t++) {
        const base = (c * T + t) * D;
        for (let d = 0; d < D; d++) {
          if (this.compatible[base + d] === 0) {
            this.banInternal(c, t);
            break;
          }
        }
      }
    }
    if (!this.propagate()) this._status = 'contradiction';
  }

  private applySet(cell: number, pattern: number): void {
    this.checkCell(cell, pattern);
    if (this._status === 'contradiction' || this._status === 'done') return;
    const base = cell * this.patternCount;
    if (!this.wave[base + pattern]) {
      this._status = 'contradiction';
      return;
    }
    for (let t = 0; t < this.patternCount; t++) if (t !== pattern && this.wave[base + t]) this.banInternal(cell, t);
    if (!this.propagate()) this._status = 'contradiction';
    else if (!this.hasUndecided()) this._status = 'done';
  }

  private applyBan(cell: number, pattern: number): void {
    this.checkCell(cell, pattern);
    if (this._status === 'contradiction' || this._status === 'done') return;
    if (!this.wave[cell * this.patternCount + pattern]) return;
    const ok = this.banInternal(cell, pattern) && this.propagate();
    if (!ok) this._status = 'contradiction';
    else if (!this.hasUndecided()) this._status = 'done';
  }

  private checkCell(cell: number, pattern: number): void {
    if (cell < 0 || cell >= this.cellCount) throw new RangeError(`cell ${cell} out of range`);
    if (pattern < 0 || pattern >= this.patternCount) throw new RangeError(`pattern ${pattern} out of range`);
  }

  /** Remove `t` from `cell`. Returns false if the cell is left empty. */
  private banInternal(cell: number, t: number): boolean {
    const T = this.patternCount;
    const D = this.directionCount;
    const idx = cell * T + t;
    if (!this.wave[idx]) return this.sumsOfOnes[cell] > 0;
    this.wave[idx] = 0;
    const base = idx * D;
    for (let d = 0; d < D; d++) this.compatible[base + d] = 0;
    this.stack[this.stackSize++] = cell;
    this.stack[this.stackSize++] = t;

    this.sumsOfOnes[cell]--;
    this.sumsOfWeights[cell] -= this.weights[t];
    this.sumsOfWeightLogWeights[cell] -= this.weightLogWeights[t];
    const sum = this.sumsOfWeights[cell];
    this.entropies[cell] = sum > 0 ? Math.log(sum) - this.sumsOfWeightLogWeights[cell] / sum : 0;
    return this.sumsOfOnes[cell] > 0;
  }

  /** Drain the ban stack. Returns false on contradiction. */
  private propagate(): boolean {
    const T = this.patternCount;
    const D = this.directionCount;
    const topo = this.topology;
    let ok = true;
    while (this.stackSize > 0) {
      const t1 = this.stack[--this.stackSize];
      const i1 = this.stack[--this.stackSize];
      for (let d = 0; d < D; d++) {
        const i2 = topo.neighbor(i1, d);
        if (i2 < 0) continue;
        const o = topo.opposite(d);
        const list = this.propagator[d][t1];
        for (let k = 0; k < list.length; k++) {
          const t2 = list[k];
          const idx = (i2 * T + t2) * D + o;
          if (--this.compatible[idx] === 0) {
            if (!this.banInternal(i2, t2)) ok = false;
          }
        }
      }
      if (!ok) {
        this.stackSize = 0;
        return false;
      }
    }
    return true;
  }

  /** Index of the cell to observe next, -1 if everything is decided, -2 on contradiction. */
  private nextCell(): number {
    const C = this.cellCount;
    const ones = this.sumsOfOnes;
    let best = -1;
    if (this.heuristic === 'scanline') {
      for (let c = 0; c < C; c++) {
        if (ones[c] === 0) return -2;
        if (ones[c] > 1) return c;
      }
      return -1;
    }
    let min = Infinity;
    for (let c = 0; c < C; c++) {
      const n = ones[c];
      if (n === 0) return -2;
      if (n <= 1) continue;
      const score = (this.heuristic === 'mrv' ? n : this.entropies[c]) + this.noise * this.rng.next();
      if (score < min) {
        min = score;
        best = c;
      }
    }
    return best;
  }

  private hasUndecided(): boolean {
    for (let c = 0; c < this.cellCount; c++) if (this.sumsOfOnes[c] > 1) return true;
    return false;
  }

  private pushSnapshot(cell: number, pattern: number): void {
    this.history.push({
      wave: this.wave.slice(),
      compatible: this.compatible.slice(),
      sumsOfOnes: this.sumsOfOnes.slice(),
      sumsOfWeights: this.sumsOfWeights.slice(),
      sumsOfWeightLogWeights: this.sumsOfWeightLogWeights.slice(),
      entropies: this.entropies.slice(),
      cell,
      pattern,
    });
    if (this.history.length > this.backtrackDepth) this.history.shift();
  }

  private restore(s: Snapshot): void {
    this.wave.set(s.wave);
    this.compatible.set(s.compatible);
    this.sumsOfOnes.set(s.sumsOfOnes);
    this.sumsOfWeights.set(s.sumsOfWeights);
    this.sumsOfWeightLogWeights.set(s.sumsOfWeightLogWeights);
    this.entropies.set(s.entropies);
    this.stackSize = 0;
  }

  /** Undo observations until banning the failed choice leaves a consistent state. */
  private backtrack(): StepResult {
    while (this.history.length > 0) {
      const snap = this.history.pop()!;
      this.restore(snap);
      this._backtracks++;
      if (this.banInternal(snap.cell, snap.pattern) && this.propagate()) {
        this._status = this.hasUndecided() ? 'running' : 'done';
        return { status: this._status, cell: snap.cell, backtracked: true };
      }
    }
    this._status = 'contradiction';
    return { status: 'contradiction', backtracked: true };
  }
}

/**
 * One-shot solve. Returns the pattern index per cell. Throws if the run ends in
 * a contradiction (after any retries) or hits `maxSteps`.
 */
export function solve(options: WfcOptions & RunOptions): Int32Array {
  const wfc = new Wfc(options);
  const status = wfc.run(options);
  if (status !== 'done') throw new Error(`WFC failed: ${status} (seed ${String(wfc.seed)}, ${wfc.steps} steps)`);
  return wfc.result();
}
