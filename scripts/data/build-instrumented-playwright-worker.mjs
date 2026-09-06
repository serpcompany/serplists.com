import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  createRouteQueryInstrumentationPlugin,
  discoverRouteQueryUnits,
  routeQuerySourceDigest,
} from './route-query-units-lib.mjs';

export const ROUTE_QUERY_SNAPSHOT_PATH = '/__test-only/route-query-units';

const execFileAsync = promisify(execFile);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  });
}

export function resolveInstrumentedOutput({ repoRoot, outputPath }) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedOutput = path.resolve(outputPath);
  const relative = path.relative(resolvedRoot, resolvedOutput).replaceAll('\\', '/');
  assert(
    resolvedOutput.startsWith(path.join(resolvedRoot, 'tmp') + path.sep) ||
      /^\.wrangler\/smoke-invocation-[a-zA-Z0-9]+\/pages\/_worker\.js$/.test(relative),
    'Instrumented Playwright Worker must use repository tmp/ or an isolated smoke invocation',
  );
  return resolvedOutput;
}

export async function buildInstrumentedPlaywrightWorker({ repoRoot, outputPath }) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedOutput = resolveInstrumentedOutput({ repoRoot, outputPath });
  const require = createRequire(path.join(resolvedRoot, 'package.json'));
  const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
  const { build } = wranglerRequire('esbuild');
  const sourceDigest = routeQuerySourceDigest(discoverRouteQueryUnits(resolvedRoot));
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  const intermediateDirectory = mkdtempSync(path.join(path.dirname(resolvedOutput), '.pages-router-'));
  try {
    // Wrangler 4.54.0 Pages temp discovery walks up from cwd to package.json.
    // Own its project root as well as --outdir, including on build failure.
    writeFileSync(path.join(intermediateDirectory, 'package.json'), '{"private":true}');
    const functionsDirectory = path.join(resolvedRoot, 'functions');
    const routerDirectory = path.join(intermediateDirectory, 'router');
    const wranglerLogDirectory = path.join(intermediateDirectory, 'wrangler-logs');
    mkdirSync(wranglerLogDirectory, { recursive: true });
    const wranglerCli = path.join(path.dirname(wranglerRequire.resolve('wrangler/package.json')), 'wrangler-dist/cli.js');
    const externalSources = sourceFiles(functionsDirectory)
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
      .sort();
    assert(externalSources.length > 0, 'Expected Pages Functions source files to externalize');

    await execFileAsync(process.execPath, [
      wranglerCli,
      'pages', 'functions', 'build', functionsDirectory,
      '--outdir', routerDirectory,
      '--fallback-service', 'ASSETS',
      ...externalSources.flatMap((file) => ['--external', file]),
    ], {
      cwd: intermediateDirectory,
      env: {PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:wranglerLogDirectory},
      maxBuffer: 10 * 1024 * 1024,
    });

    const generatedRouterPath = path.join(routerDirectory, 'index.js');
    const result = await build({
      stdin: {
        contents: `
          import pagesWorker from ${JSON.stringify(generatedRouterPath)};
          import { createRouteQueryRuntime } from './scripts/data/route-query-runtime.mjs';
          globalThis.__SERPLISTS_D1_COVERAGE__ = createRouteQueryRuntime('${sourceDigest}');
          export default {
            ...pagesWorker,
            async fetch(request, env, context) {
              if (new URL(request.url).pathname === '${ROUTE_QUERY_SNAPSHOT_PATH}') {
                return Response.json(globalThis.__SERPLISTS_D1_COVERAGE__.snapshot());
              }
              return pagesWorker.fetch(request, env, context);
            }
          };
        `,
        resolveDir: resolvedRoot,
        loader: 'js',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd', 'worker', 'browser'],
      external: ['node:*'],
      target: 'es2022',
      logLevel: 'silent',
      plugins: [createRouteQueryInstrumentationPlugin({ repoRoot: resolvedRoot })],
    });
    assert.equal(result.outputFiles.length, 1, 'Expected one instrumented Worker bundle');
    writeFileSync(resolvedOutput, result.outputFiles[0].text);
    return { outputPath: resolvedOutput, sourceDigest };
  } finally {
    rmSync(intermediateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const outputIndex = process.argv.indexOf('--output');
  assert(outputIndex >= 0 && process.argv[outputIndex + 1], 'Pass --output under repository tmp/');
  const built = await buildInstrumentedPlaywrightWorker({ repoRoot, outputPath: process.argv[outputIndex + 1] });
  console.log(JSON.stringify({ kind: 'test-only-instrumented-pages-worker', ...built }));
}
