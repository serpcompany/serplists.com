import { assert, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';
import { readWranglerToml } from '../../support/wranglerToml';

const CLOUDFLARE_SECRETS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_API_KEY'];
const deployWorkflowSchema = z.object({
  on: z.object({ workflow_call: z.object({ secrets: z.record(z.object({ required: z.boolean() })) }) }),
  jobs: z.object({
    deploy: z.object({
      concurrency: z.object({ group: z.string(), 'cancel-in-progress': z.boolean() }),
      permissions: z.record(z.string()),
      env: z.record(z.string()),
      steps: z.array(workflowStepSchema),
    }),
  }),
});
const ciJobs = z
  .object({
    jobs: z.record(
      z
        .object({
          name: z.string().optional(),
          needs: z.union([z.string(), z.array(z.string())]).optional(),
          if: z.string().optional(),
          uses: z.string().optional(),
          permissions: z.record(z.string()).optional(),
          secrets: z.record(z.string()).optional(),
          steps: z.array(workflowStepSchema).optional(),
        })
        .passthrough(),
    ),
  })
  .parse(readWorkflowFile('.github/workflows/ci.yml')).jobs;

const callerOf = (workflow: string) => {
  const callers = Object.values(ciJobs).filter((job) => job.uses === `./.github/workflows/${workflow}`);
  expect(callers).toHaveLength(1);
  const [caller] = callers;
  assert.exists(caller, `no job of ci.yml calls ${workflow}`);
  return caller;
};
const listedName = (workflow: string) => `${callerOf(workflow).name ?? ''} / deploy`;

const ENVIRONMENTS = [
  { name: 'staging', workflow: 'deploy-staging.yml', branch: 'staging', migrationGate: 'pnpm run verify:staging', wranglerEnv: 'preview', database: 'serp-checklists-staging-db' },
  { name: 'production', workflow: 'deploy-production.yml', branch: 'main', migrationGate: 'pnpm run verify:prod:d1', wranglerEnv: 'production', database: 'serp-checklists-db' },
] as const;

describe.each(ENVIRONMENTS)('the $name deploy', ({ name, workflow, branch, migrationGate, wranglerEnv, database }) => {
  const { on, jobs } = deployWorkflowSchema.parse(readWorkflowFile(`.github/workflows/${workflow}`));
  const deployJob = jobs.deploy;
  const steps = deployJob.steps;
  const indexOfStepRunning = (command: string) => steps.findIndex((step) => step.run?.includes(command));
  const indexOfAction = (action: string) => steps.findIndex((step) => step.uses === `./.github/actions/${action}`);

  it(`runs from CI only on a push to ${branch}, after the quality gate and the schema parity check pass, given only the Cloudflare secrets`, () => {
    const caller = callerOf(workflow);

    expect([caller.needs].flat()).toEqual(expect.arrayContaining(['quality', 'db-parity']));
    expect(caller.if).toBe(`github.event_name == 'push' && github.ref_name == '${branch}'`);
    expect(caller.secrets).toEqual(Object.fromEntries(CLOUDFLARE_SECRETS.map((secret) => [secret, `\${{ secrets.${secret} }}`])));
    expect(Object.keys(on.workflow_call.secrets)).toEqual(CLOUDFLARE_SECRETS);
    expect(caller.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(deployJob.permissions).toEqual({ contents: 'read', actions: 'read' });
  });

  it('runs one at a time, never cancelled part way', () => {
    expect(deployJob.concurrency).toEqual({ group: `deploy-${name}`, 'cancel-in-progress': false });
  });

  it('starts, right after the checkout, by refusing to deploy from an old run started again, finding later runs of its own job by the name GitHub lists', () => {
    const guard = indexOfAction('latest-run');

    expect(steps[0]?.uses).toMatch(/^actions\/checkout@/);
    expect(guard).toBe(1);
    expect(steps[guard]?.with).toEqual({ workflow: 'ci.yml', job: listedName(workflow) });
  });

  it(`refuses to deploy while ${name} D1 has migrations it has not applied`, () => {
    const gate = indexOfStepRunning(migrationGate);

    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(indexOfStepRunning('pnpm run build:worker'));
    expect(gate).toBeLessThan(indexOfStepRunning('opennextjs-cloudflare deploy'));
  });

  it(`builds as ${name}, with Agent Access shown and the commit it deploys as its release`, () => {
    expect(deployJob.env['SITE_ENV']).toBe(name);
    expect(deployJob.env['NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED']).toBe('true');
    expect(deployJob.env['NEXT_PUBLIC_RELEASE_COMMIT']).toBe('${{ github.sha }}');
    expect(indexOfStepRunning('pnpm run build:worker')).toBeGreaterThan(-1);
  });

  it(`restores the Next.js build cache of ${name}'s builds before it installs and builds`, () => {
    const cache = steps.findIndex((step) => step.uses?.startsWith('actions/cache@'));

    expect(steps[cache]?.with?.['path']).toBe('.next/cache');
    expect(String(steps[cache]?.with?.['key'])).toMatch(new RegExp(`^next-build-${name}-`));
    expect(cache).toBeLessThan(indexOfStepRunning('pnpm install'));
  });

  it(`deploys the ${wranglerEnv} environment, which wrangler.toml binds to ${name}'s D1`, () => {
    const deployStep = steps.find((step) => step.id === 'deploy');

    expect(deployStep?.run).toContain(`opennextjs-cloudflare deploy --env ${wranglerEnv}`);
    expect(readWranglerToml().env[wranglerEnv].d1_databases).toContainEqual(expect.objectContaining({ binding: 'DB', database_name: database }));
  });

  it('hands the Cloudflare credentials only to the migrations check and the deploy, so installing and building never see them', () => {
    const holding = steps.filter((step) => JSON.stringify(step).includes('secrets.'));

    expect(JSON.stringify(deployJob.env)).not.toContain('secrets.');
    expect(holding.map((step) => step.run ?? '')).toEqual([migrationGate, expect.stringContaining('opennextjs-cloudflare deploy')]);
    for (const step of holding) expect(Object.keys(step.env ?? {})).toEqual(CLOUDFLARE_SECRETS);
  });

  it('fails when the deploy prints no workers.dev URL, so an unchecked deployment never passes', () => {
    expect(steps.find((step) => step.id === 'deploy')?.run).toMatch(/if \[ -z "\$url" \]; then[\s\S]*exit 1/);
  });

  it(`keeps the ${wranglerEnv} environment's workers.dev address on, which wrangler turns off for an environment with routes unless it is set`, () => {
    expect(readWranglerToml().env[wranglerEnv].workers_dev).toBe(true);
  });

  it('smoke-tests the new deployment for the commit it deployed, then checks it against the site standards', () => {
    const deployIndex = steps.findIndex((step) => step.id === 'deploy');
    const smoke = steps.find((step) => step.run === 'node --import tsx scripts/verify-deployment.ts');
    const standards = steps.find((step) => step.run === `node --import tsx scripts/check-site-standards.ts "$DEPLOY_URL" ${name}`);
    assert.exists(smoke, 'no step runs the smoke test');
    assert.exists(standards, 'no step checks the site standards');

    expect(smoke.env).toEqual({ DEPLOY_URL: '${{ steps.deploy.outputs.url }}', RELEASE_COMMIT: '${{ github.sha }}' });
    expect(standards.env).toEqual({ DEPLOY_URL: '${{ steps.deploy.outputs.url }}' });
    expect(steps.indexOf(smoke)).toBeGreaterThan(deployIndex);
    expect(steps.indexOf(standards)).toBeGreaterThan(steps.indexOf(smoke));
  });
});

describe('the production deploy', () => {
  const { steps } = deployWorkflowSchema.parse(readWorkflowFile('.github/workflows/deploy-production.yml')).jobs.deploy;
  const gate = steps.findIndex((step) => step.uses === './.github/actions/staging-verified');

  it("refuses, before it installs anything, files whose staging deploy didn't pass, finding that job by the name GitHub lists", () => {
    expect(gate).toBe(2);
    expect(steps[gate]?.with).toEqual({ workflow: 'ci.yml', job: listedName('deploy-staging.yml'), branch: 'staging' });
  });
});

describe('a failed deploy', () => {
  const report = ciJobs['deploy-failed'];

  it('opens or updates the issue of the environment whose deploy failed, with the only write token CI holds', () => {
    assert.exists(report, 'ci.yml has no deploy-failed job');
    const action = report.steps?.find((step) => step.uses === './.github/actions/deploy-failed');

    expect(report.needs).toEqual(['deploy-staging', 'deploy-production']);
    expect(report.if).toBe("always() && contains(needs.*.result, 'failure')");
    expect(report.permissions).toEqual({ contents: 'read', issues: 'write' });
    expect(action?.with?.['environment']).toBe("${{ needs.deploy-staging.result == 'failure' && 'staging' || 'production' }}");
    expect(Object.entries(ciJobs).filter(([, job]) => Object.values(job.permissions ?? {}).includes('write')).map(([id]) => id)).toEqual(['deploy-failed']);
  });
});

describe('the domains each Worker serves', () => {
  it('keeps serplists.com and www.serplists.com on the production Worker and staging.serplists.com on the staging one, through zone routes every deploy reattaches', () => {
    const config = readWranglerToml();

    expect(config.env.production['routes']).toEqual([
      { pattern: 'serplists.com/*', zone_name: 'serplists.com' },
      { pattern: 'www.serplists.com/*', zone_name: 'serplists.com' },
    ]);
    expect(config.env.preview['routes']).toEqual([{ pattern: 'staging.serplists.com/*', zone_name: 'serplists.com' }]);
  });
});
