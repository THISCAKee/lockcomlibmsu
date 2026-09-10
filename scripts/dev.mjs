import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(adminRoot, '..', '..');

function readLocalEnv() {
  const envFile = join(adminRoot, '.env.local');
  if (!existsSync(envFile)) return {};

  return Object.fromEntries(
    readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const separator = line.indexOf('=');
        if (separator < 1) return null;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
        return [key, value];
      })
      .filter(Boolean),
  );
}

const localEnv = readLocalEnv();

const services = [
  {
    name: 'API',
    command: 'dotnet',
    args: [
      'run',
      '--project',
      join(repositoryRoot, 'src', 'LockComputer.Server', 'LockComputer.Server.csproj'),
      '--urls',
      'http://localhost:5071',
    ],
    cwd: repositoryRoot,
    display: 'dotnet run --project src/LockComputer.Server/LockComputer.Server.csproj --urls http://localhost:5071',
    environment: {
      ...localEnv,
      ASPNETCORE_ENVIRONMENT: 'Development',
      DOTNET_ENVIRONMENT: 'Development',
    },
  },
  {
    name: 'Admin',
    command: process.execPath,
    args: [join(adminRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3000'],
    cwd: adminRoot,
    display: 'next dev -p 3000',
    environment: {},
  },
];

export function describeServices() {
  return services.map(service => `${service.name}: ${service.display}`).join('\n');
}

function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function run() {
  if (process.argv.includes('--dry-run')) {
    console.log(describeServices());
    return;
  }

  console.log('Starting LockComputer development services:');
  console.log(describeServices());

  const children = services.map(service => {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: { ...process.env, ...service.environment },
      stdio: 'inherit',
    });
    child.on('error', error => {
      console.error(`${service.name} could not start: ${error.message}`);
      shutdown(1);
    });
    child.on('exit', code => {
      if (!stopping) shutdown(code ?? 1);
    });
    return child;
  });

  let stopping = false;
  function shutdown(exitCode) {
    if (stopping) return;
    stopping = true;
    for (const child of children) terminateProcessTree(child);
    process.exitCode = exitCode;
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) run();
