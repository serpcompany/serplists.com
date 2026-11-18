import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_DEV_VARS_OR_DOTENV_FILES, withLocalD1 } from '../../../scripts/data/local-d1';
import { REPO_ROOT } from '../../../scripts/lib/run-tool';
import { D1DatabaseDouble } from '../../support/d1Doubles';

class D1ThatIsNeverQueried extends D1DatabaseDouble {
  prepare(): never {
    throw new Error('this local D1 stand-in is never queried');
  }
}

const { platform } = vi.hoisted(() => {
  const state: { asked: unknown[]; disposed: number } = { asked: [], disposed: 0 };
  return { platform: state };
});

vi.mock('wrangler', () => ({
  getPlatformProxy: (options: unknown) => {
    platform.asked.push(options);
    return Promise.resolve({
      env: { DB: new D1ThatIsNeverQueried() },
      dispose: () => {
        platform.disposed += 1;
        return Promise.resolve();
      },
    });
  },
}));

const askedFor = (persist: unknown) => ({
  configPath: path.join(REPO_ROOT, 'wrangler.toml'),
  envFiles: NO_DEV_VARS_OR_DOTENV_FILES,
  persist,
  remoteBindings: false,
});

describe("the local D1 the data scripts open through wrangler's platform proxy", () => {
  beforeEach(() => {
    platform.asked = [];
    platform.disposed = 0;
  });

  it("keeps its data where wrangler keeps this checkout's local D1 when no folder is named, then closes the proxy", async () => {
    await expect(withLocalD1(undefined, () => Promise.resolve('done'))).resolves.toBe('done');

    expect(platform.asked).toEqual([askedFor(true)]);
    expect(platform.disposed).toBe(1);
  });

  it("keeps its data in the named folder's v3 state, and closes the proxy when the work fails", async () => {
    await expect(withLocalD1('tmp/e2e-d1', () => Promise.reject(new Error('the seed failed')))).rejects.toThrow('the seed failed');

    expect(platform.asked).toEqual([askedFor({ path: path.resolve(REPO_ROOT, 'tmp/e2e-d1', 'v3') })]);
    expect(platform.disposed).toBe(1);
  });
});
