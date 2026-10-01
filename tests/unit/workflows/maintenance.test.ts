import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

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
const guardIndex = steps.findIndex(
  (step) =>
    step.run !== undefined &&
    Object.values(step.env ?? {}).some((value) => value.includes(`steps.${gardenStep?.id}.outputs.execution_file`)),
);
const guard = steps[guardIndex];

const REPO = 'serpcompany/serplists.com';
const STARTED_AT = '2026-10-05T14:00:00Z';
const minutesAfterStart = (minutes: number) => new Date(Date.parse(STARTED_AT) + minutes * 60_000).toISOString();
type OpenPr = { number: number; ref: string; createdAt: string };

const workDir = mkdtempSync(path.join(tmpdir(), 'doc-gardening-guard-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const runGuard = async (executionLog: unknown, openPrs: OpenPr[] = [], status = 200) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const listsPrs = url.pathname === `/repos/${REPO}/pulls` && url.searchParams.get('base') === 'staging';
    response.writeHead(listsPrs ? status : 404, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        listsPrs && status === 200
          ? openPrs.map((pr) => ({ number: pr.number, head: { ref: pr.ref }, created_at: pr.createdAt }))
          : { message: 'Not allowed' },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const scriptPath = path.join(workDir, 'guard.cjs');
    writeFileSync(scriptPath, guard?.run ?? '');
    let executionFile = '';
    if (executionLog !== undefined) {
      executionFile = path.join(workDir, 'execution.json');
      writeFileSync(executionFile, JSON.stringify(executionLog));
    }
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        EXECUTION_FILE: executionFile,
        GARDENING_STARTED_AT: STARTED_AT,
        GITHUB_API_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'test-token',
      },
    });
    let output = '';
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    return await new Promise<{ status: number | null; output: string }>((resolve) => {
      child.on('close', (code) => resolve({ status: code, output }));
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const resultEntry = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 12,
  total_cost_usd: 0.4,
  permission_denials: [],
  result: 'I fixed one stale doc and opened a PR into staging.',
  ...overrides,
});
const openedNow: OpenPr = { number: 41, ref: 'chore/doc-gardening-2026-10-05', createdAt: minutesAfterStart(3) };
const openedLastWeek: OpenPr = { number: 39, ref: 'chore/doc-gardening-2026-09-28', createdAt: minutesAfterStart(-7 * 24 * 60) };
const deniedCommit = {
  permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'git checkout -b chore/doc-gardening && git commit -m "x"' } }],
};

describe('weekly doc gardening workflow', () => {
  it('keeps subagents in the foreground and leaves the repository MCP servers out', () => {
    expect(gardenStep?.id).toBe('garden');
    expect(gardenStep?.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1');
    expect(String(gardenStep?.with?.claude_args)).toContain('--strict-mcp-config');
  });

  it('adds no attribution to the commits and PRs it makes', () => {
    const settings = z
      .object({ attribution: z.object({ commit: z.literal(false), pr: z.literal(false) }) })
      .safeParse(JSON.parse(String(gardenStep?.with?.settings ?? '{}')));
    expect(settings.success).toBe(true);
  });

  it('runs a guard after Claude that reads its log and the open PRs', () => {
    expect(guard?.run).toBeTruthy();
    expect(guardIndex).toBeGreaterThan(gardenIndex);
    expect(guard?.env?.GITHUB_TOKEN).toBe('${{ github.token }}');
    const startIndex = steps.findIndex((step) => step.run?.includes('GARDENING_STARTED_AT='));
    expect(startIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeLessThan(gardenIndex);
  });

  it('passes when Claude opened a gardening PR during the run', async () => {
    const { status, output } = await runGuard([resultEntry()], [openedNow]);
    expect(status).toBe(0);
    expect(output).toContain('opened #41');
  });

  it('passes when Claude found no doc drift', async () => {
    const { status } = await runGuard([resultEntry({ result: 'No doc drift found' })]);
    expect(status).toBe(0);
  });

  it("passes when last week's gardening PR is still open and Claude left it alone", async () => {
    const { status, output } = await runGuard(
      [resultEntry({ result: 'A gardening PR is already open (#39), so I stopped.' })],
      [openedLastWeek],
    );
    expect(status).toBe(0);
    expect(output).toContain('#39');
  });

  it('fails when Claude finished without any of those outcomes, and shows what it said', async () => {
    const { status, output } = await runGuard([resultEntry({ result: 'Done.' })], [openedLastWeek]);
    expect(status).not.toBe(0);
    expect(output).toContain('Done.');
  });

  it('warns but passes when a refused command was retried and the PR still opened', async () => {
    const { status, output } = await runGuard([resultEntry(deniedCommit)], [openedNow]);
    expect(status).toBe(0);
    expect(output).toContain('::warning');
    expect(output).toContain('git checkout -b');
  });

  it('fails and names the command when a denial left the job undone', async () => {
    const { status, output } = await runGuard([resultEntry({ ...deniedCommit, result: 'Stopped.' })]);
    expect(status).not.toBe(0);
    expect(output).toContain('git checkout -b');
  });

  it('fails when the run left no log, no result, or ended in an error', async () => {
    expect((await runGuard(undefined)).status).not.toBe(0);
    expect((await runGuard([{ type: 'system', subtype: 'init' }])).status).not.toBe(0);
    expect((await runGuard([resultEntry({ is_error: true, subtype: 'error_max_turns' })])).status).not.toBe(0);
  });

  it('fails when Claude ended with subagents still running', async () => {
    const { status, output } = await runGuard([
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ id: 'task-1' }] },
      resultEntry(),
    ]);
    expect(status).not.toBe(0);
    expect(output).toContain('background task');
  });

  it('fails when it cannot list the open PRs', async () => {
    const { status, output } = await runGuard([resultEntry()], [], 403);
    expect(status).not.toBe(0);
    expect(output).toContain('Could not list the open PRs');
  });
});
