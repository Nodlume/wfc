import { describe, expect, it } from 'vitest';
import { flipMatch, exactMatch } from './adjacency.js';
import { overlappingModel, sampleFromText } from './overlapping.js';
import { solve } from './solver.js';
import { rotateSockets, tileset } from './tiled.js';
import { DIR4, grid2d } from './topology.js';

describe('overlappingModel', () => {
  it('reproduces a checkerboard sample exactly', () => {
    const sample = sampleFromText(`
      ab
      ba
    `);
    const model = overlappingModel({ sample, n: 2, width: 10, height: 6, periodicOutput: true, symmetry: 1 });
    expect(model.colors).toEqual(['a', 'b']);
    expect(model.patterns.length).toBe(2);
    const wfc = model.createSolver({ seed: 1 });
    expect(wfc.run()).toBe('done');
    const out = model.decode(wfc.result());
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 10; x++) {
        const expected = (x + y) % 2 === 0 ? out[0] : out[0] === 'a' ? 'b' : 'a';
        expect(out[x + y * 10]).toBe(expected);
      }
  });

  it('generates locally-similar output from a maze-like sample', () => {
    const sample = sampleFromText(`
      #########
      #.......#
      #.#####.#
      #.#...#.#
      #.#.#.#.#
      #.#...#.#
      #.#####.#
      #.......#
      #########
    `);
    const model = overlappingModel({ sample, n: 3, width: 24, height: 24, periodicInput: true, symmetry: 8 });
    expect(model.patterns.length).toBeGreaterThan(2);
    const wfc = model.createSolver({ seed: 42, backtrackDepth: 20 });
    const status = wfc.run({ retries: 20 });
    expect(status).toBe('done');
    const out = model.decode(wfc.result());
    expect(out.every((c) => c === '#' || c === '.')).toBe(true);
    // Every N×N window of the output must be one of the learned patterns.
    const patternSet = new Set(model.patterns.map((p) => p.join(',')));
    const colorIdx = new Map(model.colors.map((c, i) => [c, i]));
    for (let y = 0; y + 3 <= 24; y++)
      for (let x = 0; x + 3 <= 24; x++) {
        const win: number[] = [];
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) win.push(colorIdx.get(out[x + dx + (y + dy) * 24]!)!);
        expect(patternSet.has(win.join(','))).toBe(true);
      }
  });

  it('colorDistribution sums to 1 for uncollapsed cells', () => {
    const sample = sampleFromText(`
      ab
      ba
    `);
    const model = overlappingModel({ sample, n: 2, width: 4, height: 4, symmetry: 1 });
    const wfc = model.createSolver({ seed: 1 });
    const dist = model.colorDistribution(wfc, 0);
    expect(dist[0] + dist[1]).toBeCloseTo(1);
    expect(model.patternsWithColor(0).length).toBe(1);
  });
});

describe('tileset', () => {
  it('rotates sockets clockwise', () => {
    expect(rotateSockets(['u', 'r', 'd', 'l'], 1)).toEqual(['l', 'u', 'r', 'd']);
    expect(rotateSockets(['u', 'r', 'd', 'l'], 2)).toEqual(['d', 'l', 'u', 'r']);
    expect(rotateSockets(['u', 'r', 'd', 'l'], 3)).toEqual(['r', 'd', 'l', 'u']);
  });

  it('deduplicates symmetric rotations and builds a valid adjacency', () => {
    const ts = tileset([
      { name: 'blank', sockets: ['0', '0', '0', '0'] },
      { name: 'straight', sockets: ['1', '0', '1', '0'], rotations: true },
      { name: 'corner', sockets: ['1', '1', '0', '0'], rotations: true },
      { name: 'cross', sockets: ['1', '1', '1', '1'], rotations: true },
    ]);
    expect(ts.variantsOf(0).length).toBe(1);
    expect(ts.variantsOf(1).length).toBe(2);
    expect(ts.variantsOf(2).length).toBe(4);
    expect(ts.variantsOf(3).length).toBe(1);
    expect(ts.tiles.length).toBe(8);
    expect(ts.adjacency.isSymmetric()).toBe(true);

    const topo = grid2d(12, 12);
    const result = solve({ topology: topo, adjacency: ts.adjacency, weights: ts.weights, seed: 3 });
    for (let c = 0; c < topo.size; c++) {
      const right = topo.neighbor(c, DIR4.RIGHT);
      if (right >= 0) expect(ts.tiles[result[c]].sockets[DIR4.RIGHT]).toBe(ts.tiles[result[right]].sockets[DIR4.LEFT]);
      const down = topo.neighbor(c, DIR4.DOWN);
      if (down >= 0) expect(ts.tiles[result[c]].sockets[DIR4.DOWN]).toBe(ts.tiles[result[down]].sockets[DIR4.UP]);
    }
  });

  it('splitWeight divides weight among variants', () => {
    const ts = tileset([{ name: 'corner', sockets: ['1', '1', '0', '0'], rotations: true, weight: 2 }], { splitWeight: true });
    expect(ts.weights).toEqual([0.5, 0.5, 0.5, 0.5]);
  });
});

describe('socket matchers', () => {
  it('exactMatch compares labels', () => {
    expect(exactMatch('a', 'a')).toBe(true);
    expect(exactMatch('a', 'b')).toBe(false);
  });
  it('flipMatch pairs X with Xf and symmetric labels with themselves', () => {
    expect(flipMatch('1s', '1s')).toBe(true);
    expect(flipMatch('2', '2f')).toBe(true);
    expect(flipMatch('2f', '2')).toBe(true);
    expect(flipMatch('2', '2')).toBe(false);
    expect(flipMatch('2f', '2f')).toBe(false);
    expect(flipMatch('2', '3f')).toBe(false);
  });
});
