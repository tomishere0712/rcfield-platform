/* global __dirname */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const jestBin = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const supportsNoWebStorage =
  spawnSync(process.execPath, ['--no-webstorage', '-e', ''], { stdio: 'ignore' }).status === 0;

const nodeArgs = supportsNoWebStorage ? ['--no-webstorage'] : [];
const result = spawnSync(process.execPath, [...nodeArgs, jestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
