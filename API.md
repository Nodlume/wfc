# @quokkaquery/wfc — API

Compact signatures. Import everything from `@quokkaquery/wfc`.

## Core types

```ts
type Direction = number;
interface Topology { size: number; directionCount: number; opposite(d): Direction; neighbor(cell, d): number /* -1 = none */ }
interface Adjacency { patternCount: number; directionCount: number; allowed(d, pattern): readonly number[] /* patterns allowed in direction d from pattern */ }
type Heuristic = 'entropy' | 'mrv' | 'scanline';
type WfcStatus = 'ready' | 'running' | 'done' | 'contradiction';
interface WfcOptions { topology; adjacency; weights?: ArrayLike<number>; seed?: number | string; heuristic?; backtrackDepth?: number /* 0 */; noise?: number /* 1e-6 */ }
interface StepResult { status: WfcStatus; cell?: number; pattern?: number; backtracked?: boolean }
interface RunOptions { maxSteps?: number; retries?: number; onStep?(r: StepResult, wfc: WfcLike): void; onRetry?(attempt: number): void }
```

## Solver

```ts
class Wfc {
  constructor(options: WfcOptions)                 // throws on direction mismatch / non-positive weight
  readonly topology; adjacency; cellCount; patternCount; directionCount; heuristic; backtrackDepth; noise
  get status(): WfcStatus; get steps(): number; get backtracks(): number; get seed(): number | string
  possibilities(cell): number[]; remaining(cell): number; isCollapsed(cell): boolean; collapsed(cell): number /* -1 */
  entropy(cell): number; probabilities(cell): Float64Array /* per pattern, sums to 1 */; result(): Int32Array /* -1 uncollapsed */
  set(cell, pattern): this; ban(cell, pattern): this; clearConstraints(): this   // persistent across reset()
  reset(seed?): this; step(): StepResult; run(options?: RunOptions): WfcStatus
}
function solve(options: WfcOptions & RunOptions): Int32Array   // throws unless status === 'done'
```

## Topologies

```ts
const DIR4: { count: 4; names; deltas: [dx, dy][]; opposite(d); UP: 0; RIGHT: 1; DOWN: 2; LEFT: 3 }
const DIR6: { count: 6; names; deltas: [dx, dy, dz][]; opposite(d); UP; RIGHT; DOWN; LEFT; ABOVE: 4; BELOW: 5 }
interface Grid2D extends Topology { width; height; periodic; index(x, y): number; coords(cell): [x, y] }
interface Grid3D extends Topology { width; height; depth; periodic; index(x, y, z); coords(cell): [x, y, z] }
function grid2d(width, height, opts?: { periodic?: boolean }): Grid2D      // index = y*width + x
function grid3d(width, height, depth, opts?: { periodic?: boolean }): Grid3D
function graphTopology(opts: { size; directionCount; opposite(d); edges: number[][] /* [cell][d] → neighbor | -1 */ }): Topology  // validates reverse edges
```

## Adjacency

```ts
type AdjacencyRule = readonly [a: number, direction: number, b: number];
class AdjacencyTable implements Adjacency {
  constructor(patternCount, directionCount, opposite(d))
  allow(a, d, b, symmetric = true): this; disallow(a, d, b, symmetric = true): this; allowAll(): this
  isAllowed(d, a, b): boolean; allowed(d, a): readonly number[]; toRules(): AdjacencyRule[]; isSymmetric(): boolean
}
function adjacencyFromRules(opts: { patternCount; directionCount; opposite; rules: Iterable<AdjacencyRule>; symmetric?: boolean }): AdjacencyTable
type SocketMatch = (a: string, b: string) => boolean
const exactMatch: SocketMatch        // a === b
const flipMatch: SocketMatch         // 'Xs' ↔ 'Xs'; 'X' ↔ 'Xf'
function adjacencyFromSockets(opts: { sockets: string[][] /* [pattern][d] */; directionCount; opposite; match?: SocketMatch }): AdjacencyTable
function learnAdjacency<T>(opts: { sample: ArrayLike<T>; topology: Topology; key?(v: T): string | number }):
  { adjacency: AdjacencyTable; patterns: T[]; weights: number[]; indices: Int32Array }
```

## Overlapping model

```ts
interface Sample<T> { width; height; data: ArrayLike<T> /* row-major */ }
function sampleFromText(text: string): Sample<string>     // dedents, drops blank lines, pads with ' '
function overlappingModel<T>(opts: { sample: Sample<T>; n?: number /* 3 */; periodicInput?: boolean /* true */; symmetry?: 1..8 /* 8 */;
  width; height; periodicOutput?: boolean /* false */; key?(v: T) }): OverlappingModel<T>
interface OverlappingModel<T> {
  n; colors: T[]; patterns: number[][] /* n*n color indices */; weights: number[]; adjacency: AdjacencyTable; topology: Grid2D
  createSolver(options?: Omit<WfcOptions, 'topology' | 'adjacency' | 'weights'>): Wfc
  decode(result: ArrayLike<number>): (T | undefined)[]   // top-left pixel of each cell's pattern
  colorDistribution(wfc: Wfc, cell): Float64Array        // per color, sums to 1
  patternsWithColor(colorIndex): number[]
}
```

## Tiled model

```ts
interface TileDef { name; sockets: [up, right, down, left]; weight?: number /* 1 */; rotations?: boolean | number[]; data?: unknown }
interface TileVariant { index; name /* 'corner@90' */; base; rotation: 0..3; sockets; weight; data? }
interface Tileset { tiles: TileVariant[]; adjacency: AdjacencyTable; weights: number[]; variantsOf(base): TileVariant[] }
function tileset(defs: TileDef[], opts?: { match?: SocketMatch; dedupe?: boolean /* true */; splitWeight?: boolean /* false */ }): Tileset
function rotateSockets(s: [string, string, string, string], k: number): [string, string, string, string]  // clockwise quarter turns
```

## RNG

```ts
interface Rng { next(): number; int(n): number; seed(v): void; state(): number }
function createRng(seed?: number | string): Rng          // mulberry32
function hashSeed(seed: number | string): number         // FNV-1a for strings
function weightedPick(weights: ArrayLike<number>, mask(i): boolean, r: number): number
```
