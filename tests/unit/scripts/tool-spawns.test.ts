import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Scripts must launch pnpm, npx and local tools through scripts/lib/run-tool.mjs.
// On Windows "npx" and "pnpm" are .cmd shims: spawning them by name without a shell
// fails with ENOENT, and spawning "npx.cmd" without a shell fails with EINVAL.

const repoRoot = process.cwd();
const HELPER = 'scripts/lib/run-tool.mjs';
const SCRIPT_EXTENSIONS = /\.(mjs|cjs|js|ts)$/;
const SHIM_NAME_LITERAL = /(["'`])((?:npx|pnpm|pnpx)(?:\.cmd|\.exe)?)\1/g;

function listFiles(directory: string): string[] {
  return readdirSync(path.join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listFiles(relativePath);
    return SCRIPT_EXTENSIONS.test(entry.name) ? [relativePath] : [];
  });
}

function findShimNames(source: string): string[] {
  return [...source.matchAll(SHIM_NAME_LITERAL)].map((match) => {
    const line = source.slice(0, match.index).split('\n').length;
    return `line ${line}: ${match[0]}`;
  });
}

describe('tool spawns', () => {
  it('flags pnpm and npx named as a command', () => {
    expect(findShimNames('spawn("npx", ["wrangler"]);')).toEqual(['line 1: "npx"']);
    expect(findShimNames('function run(c, a) { execFileSync(c, a); }\nrun("pnpm", ["exec", "tsx"]);')).toEqual([
      'line 2: "pnpm"',
    ]);
    expect(findShimNames("const command = win ? 'npx.cmd' : 'npx';")).toEqual(["line 1: 'npx.cmd'", "line 1: 'npx'"]);
    expect(findShimNames('console.log("Run pnpm install first");')).toEqual([]);
  });

  it('launches pnpm, npx and local tools only through scripts/lib/run-tool.mjs', () => {
    const files = [...listFiles('scripts'), ...listFiles('tests/e2e')].filter((file) => file !== HELPER);
    const offenders = files.flatMap((file) =>
      findShimNames(readFileSync(path.join(repoRoot, file), 'utf8')).map((hit) => `${file} ${hit}`),
    );

    expect(
      offenders,
      'Launch local tools (wrangler, tsx, vite, ...) with execTool/spawnTool and pnpm with execPnpm from scripts/lib/run-tool.mjs.',
    ).toEqual([]);
  });
});
