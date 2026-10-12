import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { z } from 'zod';

import { elementAt, valueAt } from './elements';
import { throwawayRepositoryEnvironment } from './throwawayGitRepository';
import { readWorkflowFile, runNodeScript, withAFakeGitHubApi, workflowStepSchema } from './workflowGuards';

export function gitIn(folder: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd: folder,
    encoding: 'utf8',
    env: throwawayRepositoryEnvironment(),
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

export type WorkflowStep = z.infer<typeof workflowStepSchema>;

const jobSchema = z.object({
  if: z.string().optional(),
  concurrency: z.object({ group: z.string(), 'cancel-in-progress': z.union([z.boolean(), z.string()]).optional() }).optional(),
  'timeout-minutes': z.number().optional(),
  permissions: z.record(z.string()).optional(),
  env: z.record(z.string()).optional(),
  steps: z.array(workflowStepSchema).optional(),
});

const workflowSchema = z.object({ on: z.record(z.unknown()), concurrency: z.unknown().optional(), jobs: z.record(jobSchema) });

type Workflow = z.infer<typeof workflowSchema>;

export const CLAUDE_WORKFLOWS = ['.github/workflows/claude.yml', '.github/workflows/code-review.yml', '.github/workflows/maintenance.yml'];

export const readWorkflow = (file: string): Workflow => workflowSchema.parse(readWorkflowFile(file));

export const jobOf = (workflow: Workflow, name: string) => valueAt(workflow.jobs, name);

export const stepsOf = (workflow: Workflow, name: string): WorkflowStep[] => jobOf(workflow, name).steps ?? [];

const found = (steps: readonly WorkflowStep[], index: number) => ({ step: elementAt(steps, index), index });

export const claudeStep = (steps: readonly WorkflowStep[]) =>
  found(steps, steps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action')));

export function guardAfter(steps: readonly WorkflowStep[], claude: WorkflowStep) {
  const output = `steps.${claude.id ?? ''}.outputs.execution_file`;
  return found(steps, steps.findIndex((step) => step.run !== undefined && Object.values(step.env ?? {}).some((value) => value.includes(output))));
}

export const stepNamed = (steps: readonly WorkflowStep[], name: string) => found(steps, steps.findIndex((step) => step.name === name));

const toolList = (step: WorkflowStep, flag: string) =>
  (new RegExp(`${flag}\\s+"([^"]*)"`).exec(String(step.with?.['claude_args'] ?? ''))?.[1] ?? '')
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);

export const allowedTools = (step: WorkflowStep) => toolList(step, '--allowedTools');

export const disallowedTools = (step: WorkflowStep) => toolList(step, '--disallowedTools');

export type Answer = { status: number; body: unknown };
export type Route = (url: URL, method: string, body: string) => Answer | undefined;
type SentRequest = { method: string; path: string; body: string };
type StepRun = { status: number | null; output: string; requests: SentRequest[]; files: Record<string, string | undefined> };

export async function runNodeStep(
  step: WorkflowStep,
  env: Record<string, string>,
  route: Route,
  { files = {}, cwd }: { files?: Record<string, string>; cwd?: string } = {},
): Promise<StepRun> {
  const scriptFolder = mkdtempSync(path.join(tmpdir(), 'workflow-step-'));
  const folder = cwd ?? scriptFolder;
  const requests: SentRequest[] = [];
  try {
    const paths = new Map(
      Object.entries(files).map(([name, text]): [string, string] => {
        const file = path.join(folder, name);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, text);
        return [name, file];
      }),
    );
    const script = path.join(scriptFolder, 'step.cjs');
    writeFileSync(script, step.run ?? '');
    const resolved = Object.fromEntries(Object.entries(env).map(([name, value]) => [name, paths.get(value) ?? value]));
    const { status, output } = await withAFakeGitHubApi(
      (url, response, request) => {
        requests.push({ method: request.method, path: url.pathname, body: request.body });
        const answer = route(url, request.method, request.body) ?? { status: 404, body: { message: 'Not Found' } };
        response.writeHead(answer.status, { 'content-type': 'application/json' });
        response.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
      },
      (apiUrl) =>
        runNodeScript(
          script,
          { GITHUB_API_URL: apiUrl, GITHUB_ENV: '', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', GITHUB_TOKEN: 'test-token', ...resolved },
          ['stdout', 'stderr'],
          { cwd: folder },
        ),
    );
    const written = Object.fromEntries([...paths].map(([name, file]) => [name, existsSync(file) ? readFileSync(file, 'utf8') : undefined]));
    return { status, output, requests, files: written };
  } finally {
    rmSync(scriptFolder, { recursive: true, force: true });
  }
}

type Fields = Record<string, unknown>;
type ResultEntry = (overrides?: Fields) => Fields;

export const claudeResult =
  (defaults: Fields): ResultEntry =>
  (overrides = {}) => ({ type: 'result', subtype: 'success', is_error: false, permission_denials: [], ...defaults, ...overrides });

export const minutesAfter = (start: string, minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString();

export const deniedCommand = (command: string): Fields => ({ permission_denials: [{ tool_name: 'Bash', tool_input: { command } }] });

export function executionLog(log: unknown): { env: { EXECUTION_FILE: string }; files: Record<string, string> } {
  if (log === undefined) return { env: { EXECUTION_FILE: '' }, files: {} };
  return { env: { EXECUTION_FILE: 'log.json' }, files: { 'log.json': JSON.stringify(log) } };
}

const subagentStillRunning = {
  type: 'system',
  subtype: 'background_tasks_changed',
  tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'Check the rules' }],
};

const tokenRefused = {
  is_error: true,
  num_turns: 1,
  total_cost_usd: 0,
  modelUsage: {},
  api_error_status: 401,
  result: 'Failed to authenticate: OAuth token revoked. Please log in again or contact your administrator.',
};

export async function expectFailureUnlessClaudeFinished(run: (log: unknown) => Promise<StepRun>, result: ResultEntry) {
  expect((await run(undefined)).status).not.toBe(0);
  expect((await run([{ type: 'system', subtype: 'init' }])).status).not.toBe(0);
  expect((await run([result({ is_error: true, subtype: 'error_max_turns' })])).status).not.toBe(0);
  const refused = await run([result(tokenRefused)]);
  expect(refused.status).not.toBe(0);
  expect(refused.output).toContain('OAuth token revoked');
  expect(refused.output).toContain('renew the CLAUDE_CODE_OAUTH_TOKEN secret');
  const stopped = await run([subagentStillRunning, result()]);
  expect(stopped.status).not.toBe(0);
  expect(stopped.output).toContain('background task');
}
