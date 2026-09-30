import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

// The weekly doc-gardening job in .github/workflows/maintenance.yml. The action stops at
// Claude's first result, so the job keeps subagents in the foreground, and a guard after
// Claude's step fails the job when Claude did not finish, instead of a silent green run.

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string()).optional(),
  with: z.record(z.unknown()).optional(),
});
const workflowSchema = z.object({ jobs: z.record(z.object({ steps: z.array(stepSchema).optional() })) });

const steps = Object.values(
  workflowSchema.parse(yaml.load(readFileSync('.github/workflows/maintenance.yml', 'utf8'))).jobs,
).flatMap((job) => job.steps ?? []);
const gardenIndex = steps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action'));
const gardenStep = steps[gardenIndex];
const guardIndex = steps.findIndex((step) =>
  Object.values(step.env ?? {}).some((value) => value.includes(`steps.${gardenStep?.id}.outputs.execution_file`)),
);
const guard = steps[guardIndex];

const workDir = mkdtempSync(path.join(tmpdir(), 'doc-gardening-guard-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

// Runs the guard step's code as the workflow does, against an execution log.
const runGuard = (executionLog: unknown) => {
  const scriptPath = path.join(workDir, 'guard.cjs');
  writeFileSync(scriptPath, guard?.run ?? '');
  let executionFile = '';
  if (executionLog !== undefined) {
    executionFile = path.join(workDir, 'execution.json');
    writeFileSync(executionFile, JSON.stringify(executionLog));
  }
  const child = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, EXECUTION_FILE: executionFile },
  });
  return { status: child.status, output: `${child.stdout}${child.stderr}` };
};

const resultEntry = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 12,
  total_cost_usd: 0.4,
  permission_denials: [],
  result: 'No doc drift found',
  ...overrides,
});

describe('weekly doc gardening workflow', () => {
  it('keeps subagents in the foreground and leaves the repository MCP servers out', () => {
    expect(gardenStep?.id).toBe('garden');
    expect(gardenStep?.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1');
    expect(String(gardenStep?.with?.claude_args)).toContain('--strict-mcp-config');
  });

  it('runs a guard after Claude that reads its execution log', () => {
    expect(guard?.run).toBeTruthy();
    expect(guardIndex).toBeGreaterThan(gardenIndex);
  });

  it('passes when Claude finished, and shows what Claude said', () => {
    const { status, output } = runGuard([{ type: 'system', subtype: 'init' }, resultEntry()]);
    expect(status).toBe(0);
    expect(output).toContain('No doc drift found');
  });

  it('fails when the run left no log, no result, or ended in an error', () => {
    expect(runGuard(undefined).status).not.toBe(0);
    expect(runGuard([{ type: 'system', subtype: 'init' }]).status).not.toBe(0);
    expect(runGuard([resultEntry({ is_error: true, subtype: 'error_max_turns' })]).status).not.toBe(0);
  });

  it('fails when Claude ended with subagents still running', () => {
    const { status, output } = runGuard([
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ id: 'task-1' }] },
      resultEntry(),
    ]);
    expect(status).not.toBe(0);
    expect(output).toContain('background task');
  });

  it('fails and names the command when Claude was denied a tool', () => {
    const { status, output } = runGuard([
      resultEntry({
        permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'gh pr create --title docs' } }],
      }),
    ]);
    expect(status).not.toBe(0);
    expect(output).toContain('gh pr create');
  });
});
