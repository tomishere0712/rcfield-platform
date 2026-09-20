/* global __dirname */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const tscBin = path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc');
const userArgs = process.argv.slice(2);
const args = userArgs.length > 0 ? userArgs : ['--noEmit'];

const result = spawnSync(process.execPath, [tscBin, ...args], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.status === 0) {
  console.log('TypeScript passed: 0 type errors.');
}

process.exit(result.status ?? 1);
