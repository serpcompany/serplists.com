import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// patches/wrangler@<version>.patch makes wrangler's dev proxy forward a request once more
// when workerd closed its idle connection to the worker under it, instead of answering 503
// "Your worker restarted mid-request" or holding a GET (cloudflare/workers-sdk#14641,
// docs/RELIABILITY.md). pnpm applies it on install; these checks fail if it stops applying,
// for example after a wrangler upgrade that leaves package.json pointing at the old version.

const require = createRequire(import.meta.url);
const wranglerDir = path.dirname(require.resolve('wrangler/package.json'));
const { version } = JSON.parse(readFileSync(path.join(wranglerDir, 'package.json'), 'utf8')) as { version: string };
const { pnpm } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  pnpm?: { patchedDependencies?: Record<string, string> };
};

describe("wrangler's dev proxy patch", () => {
  it('is listed for the installed wrangler version, in an LF patch file that exists', () => {
    const patchFile = pnpm?.patchedDependencies?.[`wrangler@${version}`];
    expect(patchFile, `package.json has no pnpm.patchedDependencies entry for wrangler@${version}`).toBeDefined();
    expect(existsSync(patchFile!), `${patchFile} is missing`).toBe(true);
    expect(readFileSync(patchFile!, 'utf8')).not.toContain('\r');
  });

  it('is applied to the ProxyWorker.js that wrangler dev runs', () => {
    const proxyWorker = readFileSync(path.join(wranglerDir, 'wrangler-dist', 'ProxyWorker.js'), 'utf8');
    expect(proxyWorker).toContain('serplists patch (TD-24');
    expect(proxyWorker).toContain('forward(retryRequest)');
  });
});
