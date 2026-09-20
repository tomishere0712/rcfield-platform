/* global __dirname */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const eslintBin = path.join(__dirname, '..', 'node_modules', 'eslint', 'bin', 'eslint.js');
const userArgs = process.argv.slice(2);
const args = userArgs.length > 0 ? userArgs : ['.'];

const result = spawnSync(process.execPath, [eslintBin, ...args, '--max-warnings=0'], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.status === 0) {
  console.log('ESLint passed: 0 errors, 0 warnings.');
}

process.exit(result.status ?? 1);
