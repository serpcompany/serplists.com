// Run with Node 22 --experimental-vm-modules --test. Execute the actual runner
// source with synthetic process/provider boundaries; no child command is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as url from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import * as teardown from './smoke-teardown-lib.mjs';
import * as environment from './smoke-environment-lib.mjs';

const source = fs.readFileSync(new URL('../run-playwright-smoke.mjs', import.meta.url), 'utf8');

test('pinned Wrangler 4.54.0 source allocates Pages and bundle temps inside the owned cwd', () => {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('wrangler/package.json');
  assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).version, '4.54.0', 'Revalidate temp ownership when upgrading Wrangler');
  const cli = fs.readFileSync(path.join(path.dirname(manifest), 'wrangler-dist/cli.js'), 'utf8');
  const paths = cli.slice(cli.indexOf('function getWranglerHiddenDirPath('), cli.indexOf('var import_signal_exit2;', cli.indexOf('function getWranglerHiddenDirPath(')));
  const pages = cli.slice(cli.indexOf('function getPagesProjectRoot('), cli.indexOf('var RUNNING_BUILDERS,', cli.indexOf('function getPagesProjectRoot(')));
  assert(paths && pages);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'wrangler-source-proof-')));
  fs.mkdirSync(path.join(root, '.wrangler/tmp'), { recursive: true });
  fs.writeFileSync(path.join(root, '.wrangler/tmp/retained'), 'retained');
  const ownership = teardown.createSmokeWorkspace({ repoRoot: root });
  fs.writeFileSync(path.join(ownership.root, 'package.json'), '{"private":true}');
  const context = vm.createContext({
    process: { cwd: () => ownership.root }, path7__namespace: { default: path },
    fs21__namespace: { default: fs }, __name: fn => fn,
    import_signal_exit2: { default: () => () => {} },
    findUpSync2: filename => {
      for (let directory = ownership.root; ; directory = path.dirname(directory)) {
        if (fs.existsSync(path.join(directory, filename))) return path.join(directory, filename);
        if (path.dirname(directory) === directory) return undefined;
      }
    },
  });
  try {
    const result = vm.runInContext(`let projectRootCache, projectRootCacheCwd, tmpDirCache, tmpDirCacheProjectRoot; ${paths}\n${pages}\n({pages: getPagesTmpDir(), bundle: getWranglerTmpDir(undefined, 'bundle').path})`, context);
    for (const directory of [result.pages, result.bundle]) {
      assert(directory.startsWith(path.join(ownership.root, '.wrangler/tmp') + path.sep));
      fs.writeFileSync(path.join(directory, 'owned'), 'owned');
    }
    const report = teardown.cleanupSmokeState({ repoRoot: root, ownership, statePath: ownership.statePath,
      transientPaths: ownership.transientPaths, reportPath: path.join(root, 'tmp/data-reports/source-proof.json') });
    assert.equal(report.verdict, 'pass');
    assert.equal(fs.readFileSync(path.join(root, '.wrangler/tmp/retained'), 'utf8'), 'retained');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
for (const failure of ['initialize', 'inventory', 'migration', 'ledger', 'fixture', 'build', 'copy', 'spawn-throw', 'spawn-error', 'child-failure', 'child-signal', 'cache-tamper', 'report', 'success']) {
  test(`actual runner preserves retained state and removes owned resources: ${failure}`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'smoke-runner-proof-')));
    const shared = path.join(root, '.wrangler/tmp');
    let released = 0;
    let ownedRoot;
    let started = false;
    const calls = [];
    const errors = [];
    for (const dir of [shared, path.join(root, 'db/migrations'), path.join(root, 'dist'), path.join(root, '.wrangler/smoke-state'), path.join(root, 'tmp/playwright-pages-runtime')]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(shared, 'retained'), 'unrelated build');
    fs.writeFileSync(path.join(root, '.wrangler/smoke-state/retained'), 'old state');
    fs.writeFileSync(path.join(root, 'tmp/playwright-pages-runtime/retained'), 'old runtime');
    fs.writeFileSync(path.join(root, 'db/migrations/0001_fixture.sql'), '-- synthetic');
    fs.writeFileSync(path.join(root, 'wrangler.toml'), 'pages_build_output_dir = "dist"\nmigrations_dir = "db/migrations"\n');
    const fakeProcess = { argv: ['node', 'runner'], env: failure === 'report' ? { PLAYWRIGHT_TEARDOWN_REPORT: path.join(root, 'outside.json') } : {}, platform: process.platform, execPath: process.execPath, exitCode: 0 };
    const context = vm.createContext({ process: fakeProcess, console: { log() {}, error(message) { errors.push(message); } } });
    const execFileSync = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'git' && args[0] === 'ls-files') return 'wrangler.toml\0';
      if (command === 'git') return 'synthetic-commit';
      const cwdIndex = args.indexOf('--cwd');
      if (cwdIndex >= 0) {
        ownedRoot = args[cwdIndex + 1];
        assert.match(ownedRoot, /smoke-invocation-/);
        assert.equal(fs.readFileSync(path.join(ownedRoot, 'package.json'), 'utf8'), '{"private":true}');
        const config = args[args.indexOf('--config') + 1];
        assert.equal(config, path.join(ownedRoot, 'wrangler.toml'));
        assert.match(fs.readFileSync(config, 'utf8'), /pages_build_output_dir = "pages"/);
        assert.equal(args[args.indexOf('--persist-to') + 1], path.join(ownedRoot, 'state'));
        const transient = path.join(ownedRoot, '.wrangler/tmp/pages-synthetic');
        fs.mkdirSync(transient, { recursive: true });
        fs.writeFileSync(path.join(transient, 'bundle'), 'owned Wrangler artifact');
        fs.mkdirSync(path.join(ownedRoot, 'state'), { recursive: true });
        fs.writeFileSync(path.join(shared, 'concurrent'), 'concurrent build');
      }
      if (failure === 'migration' && args.includes('migrations')) throw new Error('migration failure');
      if (args.includes('--json')) return JSON.stringify([{ results: failure === 'ledger' ? [] : [{ name: '0001_fixture.sql' }] }]);
      if (failure === 'fixture' && args.includes('--file')) throw new Error('fixture failure');
      if (command === 'sh') {
        const output = args[1].match(/--outdir (\S+)/)?.[1];
        assert(output);
        assert.equal(path.relative(process.cwd(), output), path.relative(root, path.join(ownedRoot, 'pages/_worker.js')));
      }
      if (failure === 'build' && command === 'sh') throw new Error('build failure');
      return '';
    };
    const spawn = (command, args, options) => {
      started = true;
      assert.equal(command, 'pnpm');
      const env = options.env;
      assert.equal(path.resolve(root, env.PLAYWRIGHT_WRANGLER_CWD), ownedRoot);
      assert.equal(env.PLAYWRIGHT_WRANGLER_PERSIST_TO, path.join(ownedRoot, 'state'));
      assert.equal(env.TMPDIR, path.join(ownedRoot, 'os-tmp'));
      // Same configuration builder used by playwright.config.ts.
      const commands = environment.buildPlaywrightServerCommands({ isolated: true,
        wranglerCwd: env.PLAYWRIGHT_WRANGLER_CWD,
        workerPath: env.PLAYWRIGHT_WORKER_PATH,
        persistPath: path.relative(root, env.PLAYWRIGHT_WRANGLER_PERSIST_TO) });
      assert.match(commands.api, /--cwd \.wrangler\/smoke-invocation-\w+ pages dev pages /);
      assert.match(commands.api, /--persist-to state /);
      assert(commands.api.includes(`--env-file ${path.resolve('tests/fixtures/playwright-safe.env')}`));
      if (failure === 'spawn-throw') throw new Error('spawn failure');
      if (failure === 'cache-tamper') {
        const cacheRoot = path.join(root, 'tmp/data-build-cache');
        const [fingerprint] = fs.readdirSync(cacheRoot);
        fs.writeFileSync(path.join(cacheRoot, fingerprint, 'unexpected-private-file'), 'must fail cache integrity');
      }
      const child = new EventEmitter();
      queueMicrotask(() => {
        if (failure === 'spawn-error') child.emit('error', new Error('spawn error'));
        else child.emit('close', failure === 'child-failure' ? 1 : 0, failure === 'child-signal' ? 'SIGTERM' : null);
      });
      return child;
    };
    const modules = {
      'node:child_process': { execFileSync, spawn }, 'node:crypto': crypto,
      'node:fs': { ...fs,
        writeFileSync: (...args) => { if (failure === 'initialize') throw new Error('initialize failure'); return fs.writeFileSync(...args); },
        cpSync: (...args) => {
          if (failure === 'copy') throw new Error('copy failure');
          const sourcePath = String(args[0]);
          if (sourcePath.startsWith(`${root}${path.sep}`)
              && sourcePath.endsWith(`${path.sep}pages${path.sep}_worker.js`)
              && !fs.existsSync(sourcePath)) {
            fs.mkdirSync(sourcePath, { recursive: true });
            fs.writeFileSync(path.join(sourcePath, 'index.js'), 'synthetic worker');
          }
          return fs.cpSync(...args);
        } },
      'node:path': { default: path }, 'node:url': url,
      './data/route-coverage-evidence.mjs': { routeFragmentDirectory: () => 'tmp/data-reports/fragments', finalizeRouteCoverage() {}, assertRouteInventory() { if (failure === 'inventory') throw new Error('inventory failure'); } },
      './data/prepare-sanitized-smoke.mjs': { prepareSanitizedSmoke() { throw new Error('not requested'); } },
      './data/sanitized-state-lib.mjs': Object.fromEntries(['captureSanitizedState', 'verifySanitizedRefusalPreservation', 'validateSanitizedCohortProof', 'validateSanitizedStateBinding'].map(name => [name, () => { throw new Error('not requested'); }])),
      './dev-auto-lib.mjs': { findOpenPortPair: async () => ({ frontendPort: 4173, apiPort: 8788 }) },
      './data/smoke-environment-lib.mjs': environment,
      './data/smoke-teardown-lib.mjs': teardown,
      './data/smoke-run-lock-lib.mjs': { acquireSmokeRunLock: async () => () => { released++; } },
      './data/runtime-gate-contract.mjs': { browserGateArguments: () => ({ gating: false, args: [] }) },
      './data/migration-range-lib.mjs': { normalizeMigrationRange: () => ({ from: null, to: null }) },
      './data/seed-local.ts': {
        applyLocalSeedProfile: async () => { if (failure === 'fixture') throw new Error('fixture failure'); },
        locateMigratedDatabase: () => path.join(ownedRoot, 'state', 'fixture.sqlite'),
      },
      '../db/seeds/index.ts': { applyRouteCoverageSeed: async () => {} },
      './data/sqlite-proxy.ts': { createSQLiteProxy: () => ({}) },
      'node:sqlite': { DatabaseSync: class { close() {} } },
    };
    try {
      const runner = new vm.SourceTextModule(source, { context, initializeImportMeta(meta) { meta.url = url.pathToFileURL(path.join(root, 'scripts/run-playwright-smoke.mjs')).href; } });
      await runner.link(specifier => {
        const exports = modules[specifier];
        assert(exports, `Unexpected import ${specifier}`);
        return new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, { context });
      });
      await runner.evaluate();
      assert.equal(fakeProcess.exitCode, failure === 'success' ? 0 : 1, errors.join('\n'));
      if (failure === 'success') assert.deepEqual(errors, []);
      else if (failure === 'ledger') assert.match(errors.join('\n'), /migration ledger/);
      else if (!['child-failure', 'child-signal'].includes(failure)) assert.match(errors.join('\n'), new RegExp(failure.split('-')[0]));
      assert.equal(released, 1);
      assert.equal(fs.readFileSync(path.join(shared, 'retained'), 'utf8'), 'unrelated build');
      assert.equal(fs.readFileSync(path.join(root, '.wrangler/smoke-state/retained'), 'utf8'), 'old state');
      assert.equal(fs.readFileSync(path.join(root, 'tmp/playwright-pages-runtime/retained'), 'utf8'), 'old runtime');
      if (ownedRoot) assert.equal(fs.readFileSync(path.join(shared, 'concurrent'), 'utf8'), 'concurrent build');
      assert.deepEqual(fs.readdirSync(path.join(root, '.wrangler')).sort(), ['smoke-state', 'tmp']);
      if (failure === 'report') {
        assert.match(errors.join('\n'), /cleanup verdict=pass, leakedStatePaths=0/);
        assert.equal(fs.existsSync(path.join(root, 'outside.json')), false);
      } else {
        const report = JSON.parse(fs.readFileSync(path.join(root, 'tmp/data-reports/browser-smoke-teardown.json'), 'utf8'));
        assert.equal(report.verdict, 'pass');
        assert.equal(report.leakedStatePaths, 0);
      }
      if (failure === 'success') assert(started);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
