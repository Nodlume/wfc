import { describe, expect, it } from 'vitest';
import { AdjacencyTable, adjacencyFromRules, learnAdjacency } from './adjacency.js';
import { Wfc, solve } from './solver.js';
import { DIR4, grid2d, grid3d, graphTopology } from './topology.js';
import type { Adjacency, Topology } from './types.js';

/** Assert every adjacent pair in `result` is allowed by `adj`. */
function assertValid(result: ArrayLike<number>, topo: Topology, adj: Adjacency): void {
  for (let c = 0; c < topo.size; c++) {
    expect(result[c]).toBeGreaterThanOrEqual(0);
    for (let d = 0; d < topo.directionCount; d++) {
      const n = topo.neighbor(c, d);
      if (n < 0) continue;
      expect(adj.allowed(d, result[c])).toContain(result[n]);
    }
  }
}

/** Two patterns that must alternate: 0 next to 1 only. */
function checkerboard() {
  return adjacencyFromRules({
    patternCount: 2,
    directionCount: 4,
    opposite: DIR4.opposite,
    rules: [0, 1, 2, 3].map((d) => [0, d, 1] as const),
  });
}

describe('Wfc', () => {
  it('solves a checkerboard on an even periodic grid', () => {
    const topo = grid2d(8, 8, { periodic: true });
    const result = solve({ topology: topo, adjacency: checkerboard(), seed: 1 });
    assertValid(result, topo, checkerboard());
    const [x0, y0] = topo.coords(0);
    for (let c = 0; c < topo.size; c++) {
      const [x, y] = topo.coords(c);
      expect(result[c]).toBe(((x - x0 + y - y0) % 2 + 2) % 2 === 0 ? result[0] : 1 - result[0]);
    }
  });

  it('reports a contradiction for a checkerboard on an odd periodic grid', () => {
    const wfc = new Wfc({ topology: grid2d(5, 5, { periodic: true }), adjacency: checkerboard(), seed: 3 });
    const status = wfc.run();
    expect(status).toBe('contradiction');
  });

  it('is deterministic for a given seed', () => {
    const topo = grid2d(12, 12);
    const adj = new AdjacencyTable(3, 4, DIR4.opposite).allowAll();
    const a = solve({ topology: topo, adjacency: adj, seed: 'hello', weights: [1, 2, 3] });
    const b = solve({ topology: topo, adjacency: adj, seed: 'hello', weights: [1, 2, 3] });
    const c = solve({ topology: topo, adjacency: adj, seed: 'other', weights: [1, 2, 3] });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('respects weights roughly', () => {
    const topo = grid2d(40, 40);
    const adj = new AdjacencyTable(2, 4, DIR4.opposite).allowAll();
    const result = solve({ topology: topo, adjacency: adj, seed: 7, weights: [1, 9] });
    let ones = 0;
    for (const p of result) if (p === 1) ones++;
    expect(ones / result.length).toBeGreaterThan(0.8);
  });

  it('honours set() and ban() constraints across resets', () => {
    const topo = grid2d(6, 6);
    const adj = checkerboard();
    const wfc = new Wfc({ topology: topo, adjacency: adj, seed: 5 });
    wfc.set(topo.index(0, 0), 1);
    expect(wfc.run()).toBe('done');
    expect(wfc.result()[0]).toBe(1);
    wfc.reset(99);
    expect(wfc.run()).toBe('done');
    expect(wfc.result()[0]).toBe(1);

    const w2 = new Wfc({ topology: topo, adjacency: adj, seed: 5 });
    w2.ban(topo.index(2, 2), 0);
    expect(w2.run()).toBe('done');
    expect(w2.result()[topo.index(2, 2)]).toBe(1);
  });

  it('propagation collapses cells without observing them', () => {
    const topo = grid2d(4, 4);
    const wfc = new Wfc({ topology: topo, adjacency: checkerboard(), seed: 1 });
    wfc.set(0, 0);
    expect(wfc.status).toBe('done');
    expect(wfc.isCollapsed(topo.index(3, 3))).toBe(true);
    expect(wfc.steps).toBe(0);
  });

  it('bans patterns that have no possible support at init', () => {
    // Pattern 2 can never sit next to anything (no rules mention it) → never placed.
    const adj = adjacencyFromRules({
      patternCount: 3,
      directionCount: 4,
      opposite: DIR4.opposite,
      rules: [0, 1, 2, 3].flatMap((d) => [[0, d, 1], [0, d, 0], [1, d, 1]] as const),
    });
    const topo = grid2d(5, 5);
    const wfc = new Wfc({ topology: topo, adjacency: adj, seed: 1 });
    expect(wfc.possibilities(12)).toEqual([0, 1]);
    expect(wfc.run()).toBe('done');
    expect(Array.from(wfc.result())).not.toContain(2);
  });

  it('backtracking recovers from dead ends', () => {
    // A "3 in a row forbidden" style constraint set that is prone to local dead ends:
    // patterns 0..2, each must differ from its neighbor (graph coloring with 3 colors on a grid).
    const adj = new AdjacencyTable(3, 4, DIR4.opposite);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) for (let d = 0; d < 4; d++) adj.allow(a, d, b, false);
    const topo = grid2d(10, 10);
    const wfc = new Wfc({ topology: topo, adjacency: adj, seed: 11, backtrackDepth: 50, heuristic: 'scanline' });
    expect(wfc.run()).toBe('done');
    assertValid(wfc.result(), topo, adj);
  });

  it('retries with fresh seeds on contradiction', () => {
    const adj = new AdjacencyTable(3, 4, DIR4.opposite);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) for (let d = 0; d < 4; d++) adj.allow(a, d, b, false);
    const topo = grid2d(8, 8);
    const retries: number[] = [];
    const wfc = new Wfc({ topology: topo, adjacency: adj, seed: 2, heuristic: 'mrv' });
    const status = wfc.run({ retries: 200, onRetry: (n) => retries.push(n) });
    expect(status).toBe('done');
    assertValid(wfc.result(), topo, adj);
  });

  it('supports all heuristics', () => {
    const topo = grid2d(6, 6, { periodic: true });
    for (const heuristic of ['entropy', 'mrv', 'scanline'] as const) {
      const result = solve({ topology: topo, adjacency: checkerboard(), seed: 4, heuristic });
      assertValid(result, topo, checkerboard());
    }
  });

  it('works on 3D grids', () => {
    const adj = new AdjacencyTable(2, 6, (d) => (d < 4 ? (d + 2) % 4 : d === 4 ? 5 : 4));
    for (let d = 0; d < 6; d++) adj.allow(0, d, 1, false).allow(1, d, 0, false);
    const topo = grid3d(4, 4, 4, { periodic: true });
    const result = solve({ topology: topo, adjacency: adj, seed: 1 });
    assertValid(result, topo, adj);
  });

  it('works on an arbitrary graph topology (ring)', () => {
    const size = 6;
    const edges = Array.from({ length: size }, (_, i) => [(i + 1) % size, (i - 1 + size) % size]);
    const topo = graphTopology({ size, directionCount: 2, opposite: (d) => 1 - d, edges });
    const adj = adjacencyFromRules({ patternCount: 2, directionCount: 2, opposite: (d) => 1 - d, rules: [[0, 0, 1], [0, 1, 1]] });
    const result = solve({ topology: topo, adjacency: adj, seed: 1 });
    assertValid(result, topo, adj);
  });

  it('exposes probabilities and entropy for rendering', () => {
    const topo = grid2d(3, 3);
    const adj = new AdjacencyTable(2, 4, DIR4.opposite).allowAll();
    const wfc = new Wfc({ topology: topo, adjacency: adj, weights: [1, 3], seed: 1 });
    const p = wfc.probabilities(4);
    expect(p[0]).toBeCloseTo(0.25);
    expect(p[1]).toBeCloseTo(0.75);
    expect(wfc.entropy(4)).toBeGreaterThan(0);
    wfc.step();
    expect(wfc.steps).toBe(1);
  });

  it('rejects mismatched direction counts and bad weights', () => {
    const adj = new AdjacencyTable(2, 6, (d) => d).allowAll();
    expect(() => new Wfc({ topology: grid2d(2, 2), adjacency: adj })).toThrow(/directions/);
    const adj4 = new AdjacencyTable(2, 4, DIR4.opposite).allowAll();
    expect(() => new Wfc({ topology: grid2d(2, 2), adjacency: adj4, weights: [1, 0] })).toThrow(/weight/);
  });

  it('learnAdjacency reproduces stripes from a sample', () => {
    const sampleTopo = grid2d(4, 2, { periodic: true });
    const learned = learnAdjacency({ sample: ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'], topology: sampleTopo });
    expect(learned.patterns).toEqual(['a', 'b']);
    expect(learned.weights).toEqual([4, 4]);
    const out = grid2d(8, 4, { periodic: true });
    const result = solve({ topology: out, adjacency: learned.adjacency, weights: learned.weights, seed: 9 });
    for (let c = 0; c < out.size; c++) {
      const [x, y] = out.coords(c);
      // vertical stripes: same column → same value, adjacent columns differ
      expect(result[c]).toBe(result[out.index(x, 0)]);
      expect(result[c]).not.toBe(result[out.index((x + 1) % 8, y)]);
    }
  });
});
