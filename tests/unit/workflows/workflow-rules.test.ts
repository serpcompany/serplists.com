import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const jobSchema = z
  .object({
    name: z.string().optional(),
    if: z.string().optional(),
    needs: z.union([z.string(), z.array(z.string())]).optional(),
    uses: z.string().optional(),
    'timeout-minutes': z.number().optional(),
    permissions: z.record(z.string()).optional(),
    steps: z.array(workflowStepSchema).optional(),
  })
  .passthrough();
type Job = z.infer<typeof jobSchema>;
const workflowSchema = z
  .object({
    on: z.record(z.unknown()),
    permissions: z.record(z.string()).optional(),
    concurrency: z.object({ group: z.string(), 'cancel-in-progress': z.union([z.boolean(), z.string()]) }).partial().optional(),
    jobs: z.record(jobSchema),
  })
  .passthrough();
const actionSchema = z.object({
  inputs: z.record(z.object({ default: z.string().optional() }).passthrough()),
  runs: z.object({ using: z.literal('composite'), steps: z.array(workflowStepSchema) }),
});
const pullRequestTrigger = z.object({ types: z.array(z.string()) }).passthrough();

const WORKFLOWS = readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name)).map((name) => `.github/workflows/${name}`);
const ACTIONS = readdirSync('.github/actions', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `.github/actions/${entry.name}/action.yml`);
const workflow = (path: string) => workflowSchema.parse(readWorkflowFile(path));
const action = (path: string) => actionSchema.parse(readWorkflowFile(path));
const needsOf = (job: Job) => [job.needs ?? []].flat();

const READY_PULL_REQUEST = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
const RUN_GROUP = "${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}";
const PUSHES_IN_ORDER_GROUP =
  "${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.event_name == 'push' && format('push-{0}', github.ref) || github.run_id }}";
const REQUIRABLE = [
  { file: 'ci.yml', gate: 'ci-passed', name: 'CI passed', checks: ['quality', 'db-parity'], types: READY_PULL_REQUEST, group: PUSHES_IN_ORDER_GROUP },
  { file: 'browser-tests.yml', gate: 'browser-tests-passed', name: 'Browser tests passed', checks: ['browser-tests'], types: READY_PULL_REQUEST, group: RUN_GROUP },
  {
    file: 'pull-request.yml',
    gate: 'pull-request-passed',
    name: 'Pull request passed',
    checks: ['base', 'title', 'issue-link', 'fix-test', 'evidence'],
    types: ['opened', 'edited', 'reopened', 'synchronize', 'ready_for_review'],
    group: RUN_GROUP,
  },
];
const GATE_STEP = {
  name: 'Every job passed, or had nothing to check',
  if: "contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')",
  run: 'exit 1',
};

describe.each(REQUIRABLE)('$file, a check a merge can wait for', ({ file, gate, name, checks, types, group }) => {
  const { on, concurrency, jobs } = workflow(`.github/workflows/${file}`);

  it('starts on every pull request, again when one is marked ready, and in the merge queue, with no path filter', () => {
    const trigger = pullRequestTrigger.parse(on['pull_request']);

    expect(trigger.types).toEqual(types);
    expect(Object.keys(trigger)).toEqual(['types']);
    expect(Object.keys(on)).toContain('merge_group');
  });

  it("cancels a pull request's superseded run, never a run in the merge queue or one in progress on a branch", () => {
    expect(concurrency).toEqual({ group, 'cancel-in-progress': "${{ github.event_name == 'pull_request' }}" });
  });

  it(`ends in "${name}", which always reports and fails when a check failed or was cancelled`, () => {
    expect(jobs[gate]).toEqual({ name, if: 'always()', needs: checks, 'runs-on': 'ubuntu-latest', 'timeout-minutes': 5, steps: [GATE_STEP] });
  });

  it('leaves out of that job only what runs on a push', () => {
    const onPush = (id: string): boolean => {
      const job = jobs[id];
      return job !== undefined && ((job.if ?? '').includes("github.event_name == 'push'") || (needsOf(job).length > 0 && needsOf(job).every(onPush)));
    };

    expect(Object.keys(jobs).filter((id) => id !== gate && !checks.includes(id) && !onPush(id))).toEqual([]);
  });
});

describe('every workflow', () => {
  it('is found, with the actions this repository defines', () => {
    expect(WORKFLOWS).toEqual(expect.arrayContaining(['.github/workflows/ci.yml', '.github/workflows/pull-request.yml']));
    expect(ACTIONS).toEqual(['deploy-failed', 'latest-run', 'staging-verified'].map((name) => `.github/actions/${name}/action.yml`));
  });

  it.each(WORKFLOWS)('%s gives each job a time limit, or calls a workflow whose jobs have one', (path) => {
    for (const [id, job] of Object.entries(workflow(path).jobs)) {
      if (job.uses?.startsWith('./.github/workflows/')) continue;
      expect(job['timeout-minutes'], `${path}: ${id}`).toBeGreaterThan(0);
    }
  });

  it.each([...WORKFLOWS, ...ACTIONS])('%s takes its Node version from .node-version', (path) => {
    expect(readFileSync(path, 'utf8')).not.toMatch(/node-version:/);
    const steps = path.includes('/actions/') ? action(path).runs.steps : Object.values(workflow(path).jobs).flatMap((job) => job.steps ?? []);
    for (const step of steps.filter((each) => each.uses?.startsWith('actions/setup-node@'))) {
      expect(step.with?.['node-version-file'], path).toBe('.node-version');
    }
  });

  it('.node-version names one version', () => {
    expect(readFileSync('.node-version', 'utf8')).toMatch(/^\d+(\.\d+){0,2}\n$/);
  });
});

const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const PINS_TABLE = readFileSync('docs/agents/ci-deploys.md', 'utf8').split('\n');
const usesIn = (steps: readonly z.infer<typeof workflowStepSchema>[]): string[] =>
  steps.flatMap((step) => (step.uses === undefined ? [] : step.uses.startsWith('./') ? usesIn(action(`${step.uses.slice(2)}/action.yml`).runs.steps) : [step.uses]));
const holdsASecretOrAWriteToken = (job: Job, workflowPermissions: Record<string, string> = {}) =>
  JSON.stringify(job).includes('secrets.') || Object.values(job.permissions ?? workflowPermissions).includes('write');
const pinnedActions = (path: string) => {
  const steps = path.includes('/actions/') ? action(path).runs.steps : Object.values(workflow(path).jobs).flatMap((job) => job.steps ?? []);
  return steps.flatMap((step) => (step.uses !== undefined && PINNED.test(step.uses) ? [step.uses] : []));
};

describe('actions pinned by commit', () => {
  it.each(WORKFLOWS)('%s runs every action at a pinned commit in each job that holds a secret or a write token', (path) => {
    const { permissions, jobs } = workflow(path);
    for (const [id, job] of Object.entries(jobs).filter(([, each]) => holdsASecretOrAWriteToken(each, permissions))) {
      for (const used of usesIn(job.steps ?? [])) expect(used, `${path}: ${id}`).toMatch(PINNED);
    }
  });

  it('lists each pinned commit in the table of docs/agents/ci-deploys.md, beside every file that uses it', () => {
    for (const path of [...WORKFLOWS, ...ACTIONS]) {
      for (const used of pinnedActions(path)) {
        const [name, commit] = used.split('@');
        const row = PINS_TABLE.find((line) => line.startsWith(`| \`${name}\` | \`${commit}\` |`));
        expect(row, `${used} in ${path}`).toBeDefined();
        expect(row, `${used} in ${path}`).toContain(`\`${path}\``);
      }
    }
  });

  it('names no commit in that table that nothing uses', () => {
    const inUse = new Set([...WORKFLOWS, ...ACTIONS].flatMap(pinnedActions));
    const rows = PINS_TABLE.flatMap((line) => {
      const found = /^\| `([\w./-]+)` \| `([0-9a-f]{40})` \|/.exec(line);
      return found ? [`${found[1]}@${found[2]}`] : [];
    });

    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) expect(inUse, row).toContain(row);
  });
});

describe.each(ACTIONS)('the %s action', (path) => {
  const { inputs, runs } = action(path);
  const script = path.replace(/^\.github\/actions\/([^/]+)\/action\.yml$/, '$1.cjs');

  it('runs its script with Node, handing it every input through the environment and none through the command', () => {
    const [step] = runs.steps;

    expect(runs.steps).toHaveLength(1);
    expect(step?.run).toBe(`node "$GITHUB_ACTION_PATH/${script}"`);
    expect(Object.values(step?.env ?? {}).sort()).toEqual(Object.keys(inputs).map((input) => `\${{ inputs.${input} }}`).sort());
  });

  it('uses the workflow token unless it is given another', () => {
    expect(inputs['token']?.default).toBe('${{ github.token }}');
  });
});
