# @quokkaquery/wfc

> Built and maintained by [QuokkaQuery](https://quokkaquery.com). Source on [GitHub](https://github.com/Nodlume/wfc).

Generic **Wave Function Collapse** solver in TypeScript. The solver only knows about
*cells*, *directions* and *which patterns may neighbor which*, so it works on 2D grids,
3D volumes, hex grids or arbitrary graphs. Helpers cover the two classic flavours:

- **Overlapping model** – learn N×N patterns from a sample image and synthesise more of it.
- **Tiled model** – describe tiles by edge sockets (with automatic rotations) and tile a grid.

Features: seeded deterministic RNG, Shannon-entropy / MRV / scanline heuristics,
AC-4 support-count propagation, optional snapshot backtracking, retries with fresh seeds,
persistent `set()` / `ban()` constraints, per-cell probabilities for rendering superpositions.

## Install

```bash
npm install @quokkaquery/wfc
```

ESM and CommonJS builds with type declarations. No runtime dependencies.

## Quick start — tiles from sockets

```ts
import { tileset, grid2d, solve } from '@quokkaquery/wfc';

const ts = tileset([
  { name: 'grass',    sockets: ['0', '0', '0', '0'], weight: 4 },
  { name: 'straight', sockets: ['1', '0', '1', '0'], rotations: true },
  { name: 'corner',   sockets: ['1', '1', '0', '0'], rotations: true },
  { name: 'cross',    sockets: ['1', '1', '1', '1'], weight: 0.3 },
]);

const topology = grid2d(20, 12);
const result = solve({ topology, adjacency: ts.adjacency, weights: ts.weights, seed: 7, retries: 10 });

for (let y = 0; y < topology.height; y++) {
  let row = '';
  for (let x = 0; x < topology.width; x++) row += ts.tiles[result[topology.index(x, y)]].name[0];
  console.log(row);
}
```

Sockets are `[up, right, down, left]`. Two tiles may touch when the socket on the shared
edge matches (`exactMatch` by default; `flipMatch` implements the `1s` / `2` / `2f` convention
for oriented edges). `rotations: true` generates the four clockwise rotations and drops duplicates.

## Quick start — overlapping model

```ts
import { overlappingModel, sampleFromText } from '@quokkaquery/wfc';

const model = overlappingModel({
  sample: sampleFromText(`
    #########
    #.......#
    #.#####.#
    #.#...#.#
    #.#####.#
    #.......#
    #########
  `),
  n: 3, symmetry: 8, periodicInput: true,
  width: 48, height: 24,
});

const wfc = model.createSolver({ seed: 'maze', backtrackDepth: 20 });
wfc.run({ retries: 20 });
const chars = model.decode(wfc.result()); // string | undefined per cell
```

## Step-by-step control

```ts
const wfc = new Wfc({ topology, adjacency, weights, seed: 1, heuristic: 'entropy' });
wfc.set(topology.index(0, 0), 3);     // force a pattern (kept across reset/retry)
wfc.ban(topology.index(5, 5), 0);     // forbid a pattern

while (wfc.status !== 'done' && wfc.status !== 'contradiction') {
  const { cell, pattern } = wfc.step();
  // render: wfc.collapsed(c), wfc.remaining(c), wfc.probabilities(c), wfc.entropy(c)
}
```

`Wfc.run({ retries, maxSteps, onStep, onRetry })` loops `step()` for you.

## Your own topology / adjacency

```ts
import { graphTopology, adjacencyFromRules, learnAdjacency, AdjacencyTable } from '@quokkaquery/wfc';

// Any graph: edges[cell][direction] = neighbor or -1; must be consistent with `opposite`.
const ring = graphTopology({ size: 6, directionCount: 2, opposite: d => 1 - d,
  edges: [...Array(6)].map((_, i) => [(i + 1) % 6, (i + 5) % 6]) });

// Explicit rules [a, direction, b] (mirrored into the opposite direction by default).
const adj = adjacencyFromRules({ patternCount: 2, directionCount: 2, opposite: d => 1 - d,
  rules: [[0, 0, 1], [0, 1, 1]] });

// Or learn allowed neighbours + weights from an example laid out on a topology.
const learned = learnAdjacency({ sample: ['a','b','a','b'], topology: grid2d(4, 1, { periodic: true }) });
```

Built-in topologies: `grid2d(w, h, { periodic })` (4 directions, `DIR4`),
`grid3d(w, h, d, { periodic })` (6 directions, `DIR6`), `graphTopology(...)`.
For a hex grid, build `edges[cell][0..5]` from axial coordinates and pass `opposite: d => (d + 3) % 6`.

## Behaviour and gotchas

- **Every direction needs rules.** `adjacencyFromRules` mirrors `[a, d, b]` to `[b, opposite(d), a]`,
  but a pattern with *no* allowed neighbor in some direction is banned at init. A fully empty
  adjacency yields `status === 'contradiction'` before any step. Check `wfc.possibilities(c)` after construction.
- **A missing neighbor** (grid edge, non-periodic) imposes no constraint.
- **Sockets match against the opposite edge** of the neighbor. The default matcher is string equality;
  `'0'` is just another label. Use `flipMatch` for oriented edges (`'2'` fits `'2f'`, `'1s'` fits `'1s'`).
- **Rotated variants multiply weight.** A corner with `rotations: true` yields 4 variants, each with the
  tile's full weight. Pass `{ splitWeight: true }` to `tileset()` to divide instead.
- **Overlapping output is the top-left pixel** of each cell's pattern. Cells near the right/bottom edge of
  a non-periodic grid are still fully constrained; no cropping needed.
- **Backtracking snapshots are big**: `cells × patterns × (4·directions + 1)` bytes each. Keep
  `backtrackDepth` around 5–50 and combine with `run({ retries })` for hard inputs.
- **`sampleFromText` dedents** and pads short rows with spaces, so a space becomes a color if rows are ragged.
- **Weights must be positive and finite.** Use a tiny weight rather than 0 to make a pattern rare.
- **Determinism:** same seed and inputs give the same output. `run({ retries })` draws new seeds from
  the solver's RNG, so retried runs are reproducible too.

## API

See [API.md](./API.md) for the full type surface.

## License

MIT © [QuokkaQuery](https://quokkaquery.com)

---

Part of the open-source tooling behind [QuokkaQuery](https://quokkaquery.com).
