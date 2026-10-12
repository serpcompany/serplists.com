import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { claudeStep, guardAfter, runNodeStep } from '../../support/claudeWorkflows';
import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const jobsSchema = z.object({ jobs: z.record(z.object({ steps: z.array(workflowStepSchema).optional() })) });

const claudeJobs = readdirSync('.github/workflows')
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .flatMap((name) =>
    Object.entries(jobsSchema.parse(readWorkflowFile(`.github/workflows/${name}`)).jobs).flatMap(([job, { steps = [] }]) =>
      steps.some((step) => step.uses?.startsWith('anthropics/claude-code-action')) ? [{ job: `${name} ${job}`, steps }] : [],
    ),
  );
const cases = claudeJobs.map(({ job, steps }) => {
  const claude = claudeStep(steps).step;
  return [job, claude.id ?? '', guardAfter(steps, claude).step] as const;
});

describe('the check after each Claude step in CI', () => {
  it('is found for every job that runs Claude', () => {
    expect(cases.map(([job]) => job)).toEqual(['claude.yml claude', 'code-review.yml review', 'maintenance.yml doc-gardening', 'maintenance.yml code-gardening']);
  });

  it.each(cases)('runs when Claude fails, so the job shows why: %s', (_job, id, guard) => {
    expect(guard.if).toBe(`\${{ !cancelled() && steps.${id}.outcome != 'skipped' }}`);
  });

  it.each(cases)('says the Claude step failed before Claude ran when it left no log: %s', async (_job, id, guard) => {
    expect(guard.env?.['CLAUDE_OUTCOME']).toBe(`\${{ steps.${id}.outcome }}`);
    const { status, output } = await runNodeStep(guard, { EXECUTION_FILE: '', CLAUDE_OUTCOME: 'failure' }, () => undefined);

    expect(status).not.toBe(0);
    expect(output).toContain('failed before Claude ran');
  });
});
