import { spawn, spawnSync } from 'node:child_process';

const userArgs = process.argv.slice(2);
const hasFilter = userArgs.some((arg) => arg === '--filter' || arg === '-F' || arg.startsWith('--filter=') || arg.startsWith('-F='));
const turboArgs = hasFilter ? userArgs : ['--filter=docs', ...userArgs];

const build = spawnSync('pnpm', ['run', 'build', '--filter=./packages/*'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const child = spawn('pnpm', ['turbo', 'run', 'dev', '--concurrency=100', ...turboArgs], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});