import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const browserTestsWorkflow = z
  .object({
    on: z.record(z.object({ branches: z.array(z.string()).optional() }).nullable()),
    jobs: z.object({
      'browser-tests': z.object({ 'runs-on': z.string(), steps: z.array(workflowStepSchema) }),
    }),
  })
  .parse(readWorkflowFile('.github/workflows/browser-tests.yml'));

const ciSteps = z
  .object({ jobs: z.record(z.object({ steps: z.array(workflowStepSchema).optional() })) })
  .parse(readWorkflowFile('.github/workflows/ci.yml'))
  .jobs;

const browserJob = browserTestsWorkflow.jobs['browser-tests'];
const stepRunning = (command: string) => browserJob.steps.findIndex((step) => step.run?.includes(command));
const HEAVY_COMMANDS = ['build:worker', 'test:smoke', 'test:e2e', 'playwright'];

describe('the browser tests workflow', () => {
  it('runs only on pull requests into main and staging', () => {
    expect(Object.keys(browserTestsWorkflow.on)).toEqual(['pull_request']);
    expect(browserTestsWorkflow.on['pull_request']?.branches).toEqual(expect.arrayContaining(['main', 'staging']));
  });

  it('builds the production Worker on the standard runner before any browser test', () => {
    const build = stepRunning('pnpm run build:worker');

    expect(browserJob['runs-on']).toBe('ubuntu-latest');
    expect(browserJob.steps[build]?.env?.['SITE_ENV']).toBe('production');
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(stepRunning('test:smoke'));
    expect(build).toBeLessThan(stepRunning('test:e2e:full'));
  });

  it('runs the smoke tests on pull requests into staging and every spec on pull requests into main', () => {
    const smoke = browserJob.steps[stepRunning('test:smoke')];
    const full = browserJob.steps[stepRunning('test:e2e:full')];

    expect(smoke?.if).toBe("github.base_ref != 'main'");
    expect(full?.if).toBe("github.base_ref == 'main'");
    expect([smoke?.run, full?.run]).toEqual([expect.stringContaining('--skip-build'), expect.stringContaining('--skip-build')]);
  });

  it('keeps the traces, videos and screenshots of a failed run', () => {
    const upload = browserJob.steps.find((step) => step.uses?.startsWith('actions/upload-artifact'));

    expect(upload?.if).toBe('failure()');
    expect(upload?.with?.['path']).toBe('tests/test-results/');
  });

  it('leaves the build and the browser tests out of CI, which runs on every push', () => {
    const heavySteps = Object.values(ciSteps)
      .flatMap((job) => job.steps ?? [])
      .filter((step) => HEAVY_COMMANDS.some((command) => step.run?.includes(command)));

    expect(heavySteps).toEqual([]);
  });
});
