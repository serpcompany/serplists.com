import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { assert, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readWranglerToml } from '../../support/wranglerToml';

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string()).optional(),
});
const deployWorkflowSchema = z.object({
  on: z.object({ workflow_call: z.unknown() }),
  jobs: z.object({ deploy: z.object({ env: z.record(z.string()), steps: z.array(stepSchema) }) }),
});
const ciWorkflowSchema = z.object({
  jobs: z.record(
    z.object({
      needs: z.union([z.string(), z.array(z.string())]).optional(),
      if: z.string().optional(),
      uses: z.string().optional(),
      secrets: z.unknown().optional(),
    }),
  ),
});

const deployJob = deployWorkflowSchema.parse(yaml.load(readFileSync('.github/workflows/deploy-staging.yml', 'utf8'))).jobs.deploy;
const steps = deployJob.steps;
const ciJobs = ciWorkflowSchema.parse(yaml.load(readFileSync('.github/workflows/ci.yml', 'utf8'))).jobs;

const indexOfStepRunning = (command: string) => steps.findIndex((step) => step.run?.includes(command));

describe('the staging deploy', () => {
  it('runs from CI only on a push to staging, after the quality gate and the schema parity check pass', () => {
    const callers = Object.values(ciJobs).filter((job) => job.uses === './.github/workflows/deploy-staging.yml');

    expect(callers).toHaveLength(1);
    const [caller] = callers;
    expect([caller?.needs].flat()).toEqual(expect.arrayContaining(['quality', 'db-parity']));
    expect(caller?.if).toContain("github.event_name == 'push'");
    expect(caller?.if).toContain("github.ref_name == 'staging'");
    expect(caller?.secrets).toBe('inherit');
  });

  it('refuses to deploy while staging D1 has migrations it has not applied', () => {
    const gate = indexOfStepRunning('pnpm run verify:staging');

    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(indexOfStepRunning('pnpm run build:worker'));
    expect(gate).toBeLessThan(indexOfStepRunning('opennextjs-cloudflare deploy'));
  });

  it('builds as staging, kept out of search engines, with Agent Access shown', () => {
    expect(deployJob.env.SITE_ENV).toBe('staging');
    expect(deployJob.env.NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED).toBe('true');
    expect(indexOfStepRunning('pnpm run build:worker')).toBeGreaterThan(-1);
  });

  it("deploys the preview environment, which wrangler.toml binds to staging's D1", () => {
    const deployStep = steps.find((step) => step.id === 'deploy');

    expect(deployStep?.run).toContain('opennextjs-cloudflare deploy --env preview');
    expect(readWranglerToml().env.preview.d1_databases).toContainEqual(
      expect.objectContaining({ binding: 'DB', database_name: 'serp-checklists-staging-db' }),
    );
  });

  it('fails when the deploy prints no workers.dev URL, so an unchecked deployment never passes', () => {
    const deployStep = steps.find((step) => step.id === 'deploy');

    expect(deployStep?.run).toMatch(/if \[ -z "\$url" \]; then[\s\S]*exit 1/);
  });

  it('checks the new deployment responds and meets the site standards', () => {
    const deployIndex = steps.findIndex((step) => step.id === 'deploy');
    for (const command of ['node scripts/verify-deployment.mjs', 'node scripts/check-site-standards.mjs "$DEPLOY_URL" staging']) {
      const probe = steps.find((step) => step.run?.trim() === command);
      assert.exists(probe, `no step runs ${command}`);
      expect(probe.env?.DEPLOY_URL).toBe('${{ steps.deploy.outputs.url }}');
      expect(steps.indexOf(probe)).toBeGreaterThan(deployIndex);
    }
  });
});
