const { execSync } = require('child_process');
const { copyFileSync, existsSync } = require('fs');
const { join } = require('path');

const rootDir = join(__dirname, '..');

const run = (command, options = {}) => {
  execSync(command, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...options.env },
  });
};

const runQuiet = (command) => {
  execSync(command, { cwd: rootDir, stdio: 'ignore', shell: true });
};

const ensureEnvFile = () => {
  const envPath = join(rootDir, '.env');
  const examplePath = join(rootDir, '.env.example');

  if (!existsSync(envPath) && existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
    console.log('[setup] Created .env from .env.example');
  }
};

const ensureDockerIsReady = () => {
  try {
    runQuiet('docker --version');
  } catch {
    throw new Error('Docker CLI is not installed or not available in PATH.');
  }

  try {
    runQuiet('docker compose version');
  } catch {
    throw new Error('Docker Compose is not available. Install Docker Desktop with Compose v2.');
  }

  try {
    runQuiet('docker info');
  } catch {
    throw new Error('Docker is not running. Start Docker Desktop, wait until it is ready, then run npm run up:all again.');
  }
};

const waitForHealthy = (containerName, timeoutMs = 180000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const status = execSync(
        `docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}" ${containerName}`,
        { encoding: 'utf8', shell: true },
      ).trim();

      if (status === 'healthy' || status === 'running') {
        return;
      }

      if (status === 'unhealthy') {
        throw new Error(`${containerName} is unhealthy`);
      }
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
    }
  }

  throw new Error(`Timed out waiting for ${containerName}`);
};

try {
  ensureEnvFile();
  ensureDockerIsReady();

  console.log('[1/5] Starting postgres, redis, and NLU service...');
  run('docker compose up -d --build postgres redis nlu-service');

  console.log('[2/5] Waiting for postgres, redis, and NLU to become healthy...');
  waitForHealthy('rcfeild_postgres');
  waitForHealthy('rcfeild_redis');
  waitForHealthy('rcfeild_nlu');

  console.log('[3/5] Running database migrations...');
  run('npm run migration:run', {
    env: {
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: process.env.DB_NAME ?? 'rcfeild_db',
      DB_USERNAME: process.env.DB_USERNAME ?? 'postgres',
      DB_PASSWORD: process.env.DB_PASSWORD ?? 'postgres',
    },
  });

  console.log('[4/5] Starting backend...');
  run('docker compose up -d --build backend');

  console.log('[5/5] Waiting for backend to become healthy...');
  waitForHealthy('rcfeild_backend');

  console.log('\nReady:');
  console.log('Swagger UI: http://localhost:3000/api-docs');
  console.log('Health:     http://localhost:3000/api/v1/health');
} catch (error) {
  console.error('\n[up:all] Failed to start stack.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
