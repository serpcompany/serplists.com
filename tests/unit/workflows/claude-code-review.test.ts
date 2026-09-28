import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

// Tools the code-review plugin needs, copied from the `allowed-tools` frontmatter of
// https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md
// plus Task, which the plugin uses to launch its review subagents. Update this list
// when the plugin changes; a tool missing from claude_args is denied at runtime.
const PLUGIN_TOOLS = [
  'Bash(gh issue view:*)',
  'Bash(gh search:*)',
  'Bash(gh issue list:*)',
  'Bash(gh pr comment:*)',
  'Bash(gh pr diff:*)',
  'Bash(gh pr view:*)',
  'Bash(gh pr list:*)',
  'mcp__github_inline_comment__create_inline_comment',
  'Task',
];

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  if: z.string().optional(),
  uses: z.string().optional(),
  shell: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string()).optional(),
  with: z.record(z.unknown()).optional(),
});
const workflowSchema = z.object({
  jobs: z.object({ review: z.object({ steps: z.array(stepSchema) }) }),
});

const steps = workflowSchema.parse(
  yaml.load(readFileSync('.github/workflows/claude-code-review.yml', 'utf8')),
).jobs.review.steps;
const reviewIndex = steps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action'));
const reviewStep = steps[reviewIndex];

const findGuard = () => {
  const outputRef = `steps.${reviewStep.id}.outputs.execution_file`;
  const guardIndex = steps.findIndex((step) =>
    Object.values(step.env ?? {}).some((value) => value.includes(outputRef)),
  );
  const guard = steps[guardIndex];
  const envName = Object.entries(guard?.env ?? {}).find(([, value]) => value.includes(outputRef))?.[0];
  return { guard, guardIndex, envName };
};

const workDir = mkdtempSync(path.join(tmpdir(), 'claude-review-guard-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const runGuard = (executionLog: unknown) => {
  const { guard, envName } = findGuard();
  const scriptPath = path.join(workDir, 'guard.cjs');
  writeFileSync(scriptPath, guard.run ?? '');
  let executionFile = '';
  if (executionLog !== undefined) {
    executionFile = path.join(workDir, 'execution.json');
    writeFileSync(executionFile, JSON.stringify(executionLog));
  }
  const result = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, [envName ?? 'EXECUTION_FILE']: executionFile },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const resultEntry = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 12,
  permission_denials: [],
  ...overrides,
});

describe('Claude code review workflow', () => {
  it('allows every tool the code-review plugin uses', () => {
    expect(reviewStep?.id, 'the review step needs an id so later steps can read its outputs').toBeTruthy();
    const claudeArgs = String(reviewStep.with?.claude_args ?? '');
    const allowList = claudeArgs.match(/--allowedTools\s+"([^"]+)"/)?.[1] ?? '';
    const allowed = new Set(allowList.split(',').map((tool) => tool.trim()));

    for (const tool of PLUGIN_TOOLS) {
      expect(allowed.has(tool), `claude_args does not allow ${tool}`).toBe(true);
    }
  });

  it('runs a guard after the review that reads its execution log', () => {
    const { guard, guardIndex, envName } = findGuard();

    expect(guard, 'no step reads the review execution_file output').toBeDefined();
    expect(guardIndex).toBeGreaterThan(reviewIndex);
    expect(envName).toBeTruthy();
    expect(guard.shell).toBe('node {0}');
    expect(guard.if ?? '').toContain("env.HAS_REVIEW_TOKEN == 'true'");
  });

  it('fails the job when Claude was denied a tool', () => {
    const { status, output } = runGuard([
      { type: 'system', subtype: 'init' },
      resultEntry({
        permission_denials: [
          { tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'gh pr view 245' } },
        ],
      }),
    ]);

    expect(status).not.toBe(0);
    expect(output).toContain('::error');
    expect(output).toContain('Bash');
  });

  it('fails the job when the run ended in an error or left no log', () => {
    expect(runGuard([resultEntry({ is_error: true, subtype: 'error_max_turns' })]).status).not.toBe(0);
    expect(runGuard([{ type: 'system', subtype: 'init' }]).status).not.toBe(0);
    expect(runGuard(undefined).status).not.toBe(0);
  });

  it('passes a review that finished without denials', () => {
    const { status, output } = runGuard([{ type: 'system', subtype: 'init' }, resultEntry()]);

    expect(output).not.toContain('::error');
    expect(status).toBe(0);
  });
});
