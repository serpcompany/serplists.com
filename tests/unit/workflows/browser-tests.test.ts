import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const browserJob = z
  .object({ jobs: z.object({ 'browser-tests': z.object({ 'runs-on': z.string(), steps: z.array(workflowStepSchema) }) }) })
  .parse(readWorkflowFile('.github/workflows/browser-tests.yml')).jobs['browser-tests'];

const ciSteps = z
  .object({ jobs: z.record(z.object({ steps: z.array(workflowStepSchema).optional() })) })
  .parse(readWorkflowFile('.github/workflows/ci.yml'))
  .jobs;

const stepRunning = (command: string) => browserJob.steps.findIndex((step) => step.run?.includes(command));
const HEAVY_COMMANDS = ['build:worker', 'test:smoke', 'test:e2e', 'playwright'];

describe('the browser tests workflow', () => {
  it('builds the production Worker from full history on the standard runner, naming the commit under test as its release, before any browser test', () => {
    const build = stepRunning('pnpm run build:worker');

    expect(browserJob['runs-on']).toBe('ubuntu-latest');
    expect(browserJob.steps[0]?.with?.['fetch-depth']).toBe(0);
    expect(browserJob.steps[build]?.env).toEqual({ SITE_ENV: 'production', NEXT_PUBLIC_RELEASE_COMMIT: '${{ github.sha }}' });
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(stepRunning('test:e2e:full'));
  });

  it('restores the Next.js build cache of production builds before it installs and builds', () => {
    const cache = browserJob.steps.findIndex((step) => step.uses?.startsWith('actions/cache@'));

    expect(browserJob.steps[cache]?.with?.['path']).toBe('.next/cache');
    expect(String(browserJob.steps[cache]?.with?.['key'])).toMatch(/^next-build-production-/);
    expect(cache).toBeLessThan(stepRunning('pnpm install'));
  });

  it('runs every browser spec on every pull request and in the merge queue, on the build it just made', () => {
    const suite = browserJob.steps.filter((step) => /test:(smoke|e2e)/.test(step.run ?? ''));

    expect(suite).toEqual([expect.objectContaining({ run: 'pnpm run test:e2e:full -- --skip-build' })]);
    expect(suite[0]?.if).toBeUndefined();
  });

  it('keeps the traces, videos and screenshots of a failed run', () => {
    const upload = browserJob.steps.find((step) => step.uses?.startsWith('actions/upload-artifact'));

    expect(upload?.if).toBe('failure()');
    expect(upload?.with?.['path']).toBe('tests/test-results/');
  });

  it('leaves the build and the browser tests out of CI, whose deploy jobs build for their environment', () => {
    const heavySteps = Object.values(ciSteps)
      .flatMap((job) => job.steps ?? [])
      .filter((step) => HEAVY_COMMANDS.some((command) => step.run?.includes(command)));

    expect(heavySteps).toEqual([]);
  });
});
