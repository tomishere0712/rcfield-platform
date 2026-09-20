const { execSync } = require('node:child_process');

const port = process.argv[2];

if (!port) {
  console.error('Usage: node scripts/kill-port.js <port>');
  process.exit(1);
}

function run(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function killOnWindows() {
  const output = run(`netstat -ano -p tcp | findstr :${port}`);
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    const localAddress = columns[1] || '';
    const state = columns[3] || '';
    const pid = columns[4];

    if (localAddress.endsWith(`:${port}`) && state === 'LISTENING' && pid) {
      pids.add(pid);
    }
  }

  for (const pid of pids) {
    run(`taskkill /PID ${pid} /F`);
    console.log(`Killed process ${pid} on port ${port}`);
  }
}

function killOnUnix() {
  const output = run(`lsof -ti:${port}`);
  const pids = output.split(/\s+/).filter(Boolean);

  for (const pid of pids) {
    run(`kill -9 ${pid}`);
    console.log(`Killed process ${pid} on port ${port}`);
  }
}

try {
  if (process.platform === 'win32') {
    killOnWindows();
  } else {
    killOnUnix();
  }
} catch {
  // No process is listening on the port, or the platform command is unavailable.
}
