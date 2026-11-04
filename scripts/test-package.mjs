import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this check with npm run test:package after npm run build');
const scratchRoot = resolve(tmpdir());
const scratch = mkdtempSync(join(scratchRoot, 'wfc-package-'));
assert.equal(dirname(scratch), scratchRoot);
const run = (args, cwd = scratch) => execFileSync(process.execPath, args, { cwd, encoding: 'utf8' });

try {
  const [pack] = JSON.parse(run([npm, 'pack', '--json', '--pack-destination', scratch], process.cwd()));
  const files = new Set(pack.files.map(file => file.path));
  for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/cjs/index.js', 'dist/cjs/index.d.ts', 'dist/cjs/package.json', 'LICENSE']) {
    assert.ok(files.has(file), `Missing package file: ${file}`);
  }
  writeFileSync(join(scratch, 'package.json'), '{"private":true}');
  run([npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(scratch, pack.filename)]);

  const check = `
    const topology = grid2d(2, 2);
    const adjacency = new AdjacencyTable(1, 4, DIR4.opposite).allowAll();
    const result = solve({ topology, adjacency });
    if (result.length !== 4 || result.some(value => value !== 0)) throw new Error('Invalid result');
  `;
  run(['--input-type=module', '-e', `import { solve, grid2d, AdjacencyTable, DIR4 } from '@quokkaquery/wfc'; ${check}`]);
  run(['--no-experimental-require-module', '-e', `const { solve, grid2d, AdjacencyTable, DIR4 } = require('@quokkaquery/wfc'); ${check}`]);

  const consumer = `
    import { Wfc, grid2d, AdjacencyTable, DIR4 } from '@quokkaquery/wfc';
    const wfc: Wfc = new Wfc({ topology: grid2d(2, 2), adjacency: new AdjacencyTable(1, 4, DIR4.opposite).allowAll() });
    const result: Int32Array = wfc.result();
  `;
  writeFileSync(join(scratch, 'consumer.mts'), consumer);
  writeFileSync(join(scratch, 'consumer.cts'), consumer);
  run([require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'consumer.mts', 'consumer.cts']);
  console.log('Packed ESM and CommonJS runtime and declaration checks passed.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
