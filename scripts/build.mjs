import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

for (const args of [[], ['--module', 'CommonJS', '--moduleResolution', 'Node', '--outDir', 'dist/cjs']]) {
  const result = spawnSync(process.execPath, [tsc, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Applies to both the JavaScript and declaration files in this directory.
writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
