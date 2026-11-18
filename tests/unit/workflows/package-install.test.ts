import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const permissionsSchema = z.record(z.string()).optional();
const workflowSchema = z
  .object({
    on: z.record(z.unknown()),
    permissions: permissionsSchema,
    jobs: z.record(
      z.object({ uses: z.string().optional(), permissions: permissionsSchema, steps: z.array(workflowStepSchema).optional() }).passthrough(),
    ),
  })
  .passthrough();

const REGISTRY = 'https://npm.pkg.github.com';
const FILES = readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name));
const workflows = FILES.map((file) => ({ file, workflow: workflowSchema.parse(readWorkflowFile(`.github/workflows/${file}`)) }));

const installingJobs = workflows.flatMap(({ file, workflow }) =>
  Object.entries(workflow.jobs)
    .filter(([, job]) => (job.steps ?? []).some((step) => step.run?.startsWith('pnpm install')))
    .map(([id, job]) => ({ file, id, job, permissions: job.permissions ?? workflow.permissions, called: 'workflow_call' in workflow.on })),
);

describe('installing @serpcompany/verify, a private GitHub Packages package, in every workflow', () => {
  it('sends the @serpcompany scope to GitHub Packages from the repository .npmrc, with no token in it', () => {
    const npmrc = readFileSync('.npmrc', 'utf8');

    expect(npmrc.split(/\r?\n/)).toContain(`@serpcompany:registry=${REGISTRY}`);
    expect(npmrc).not.toMatch(/_authToken/);
  });

  it('finds the jobs that install', () => {
    expect(installingJobs.map(({ file, id }) => `${file}:${id}`)).toEqual(
      expect.arrayContaining(['ci.yml:quality', 'ci.yml:db-parity', 'browser-tests.yml:browser-tests', 'deploy-staging.yml:deploy']),
    );
  });

  it.each(installingJobs)('$file job $id points setup-node at GitHub Packages and installs with the job token', ({ job }) => {
    const steps = job.steps ?? [];
    const install = steps.findIndex((step) => step.run?.startsWith('pnpm install'));
    const setupNode = steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));

    expect(setupNode).toBeGreaterThanOrEqual(0);
    expect(setupNode).toBeLessThan(install);
    expect(steps[setupNode]?.with).toMatchObject({ 'registry-url': REGISTRY, scope: '@serpcompany' });
    expect(steps[install]?.env).toMatchObject({ NODE_AUTH_TOKEN: '${{ github.token }}' });
  });

  it.each(installingJobs)('$file job $id grants packages: read', ({ permissions }) => {
    expect(permissions).toMatchObject({ packages: 'read' });
  });

  it.each(installingJobs.filter(({ called }) => called))('every caller of $file grants packages: read, since a called workflow only narrows', ({ file }) => {
    const callers = workflows.flatMap(({ workflow }) =>
      Object.values(workflow.jobs)
        .filter((job) => job.uses === `./.github/workflows/${file}`)
        .map((job) => job.permissions ?? workflow.permissions),
    );

    expect(callers.length).toBeGreaterThan(0);
    for (const permissions of callers) expect(permissions).toMatchObject({ packages: 'read' });
  });
});
