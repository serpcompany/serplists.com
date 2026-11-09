import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { scenarios } from '../../scripts/d1-profile-lib';
import { buildScriptInvocation } from '../../scripts/lib/run-tool';
import { OPEN_NEXT_CLI_STAND_IN } from '../fixtures/openNextCliStandIn';
import { aCopyOfTheCheckoutWithAStandInPackage, type CopyWithAStandInPackage } from './checkoutCopyWithAStandInPackage';
import { type ReceivedRequest, type StandInAnswer, withLocalApiStandIn } from './localApiStandIn';
import { parseJsonText } from './storedJson';

type OpenNextBuild = 'leaves the worker' | 'fails' | 'leaves nothing';

export type ProfiledStatement = { sql: string; rowsRead: number; rowsWritten: number; rowsReturned: number };

type ProfiledWorker = {
  statementsOf?: Record<string, readonly ProfiledStatement[]>;
  instead?: Record<string, StandInAnswer>;
};

export type ProfileRun = { status: number | null; stdout: string; stderr: string; requests: ReceivedRequest[]; calls: string[][] };

type ProfileRunOptions = { args: readonly string[]; build?: OpenNextBuild; worker?: ProfiledWorker; preloads?: readonly string[] };

export const STORED_RESOURCE = {
  sections: [{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task one' }] }],
  version: 3,
  revision: 7,
};

const SESSION_COOKIE = 'better-auth.session_token';

const AFTER_THE_TSX_LOADER = 2;

const signInBody = z.object({ email: z.string(), password: z.string() });

const callOfTheStandIn = z.array(z.string());

export function aCopyWithAStandInOpenNext(): CopyWithAStandInPackage {
  return aCopyOfTheCheckoutWithAStandInPackage({
    name: '@opennextjs/cloudflare',
    files: {
      'package.json': JSON.stringify({ name: '@opennextjs/cloudflare', bin: { 'opennextjs-cloudflare': 'cli.mjs' } }),
      'cli.mjs': OPEN_NEXT_CLI_STAND_IN,
    },
  });
}

const actorOf = (request: ReceivedRequest): string => /better-auth\.session_token=(\w+)-session/.exec(request.headers.cookie ?? '')?.[1] ?? 'anon';

function d1QueryLine(statement: ProfiledStatement, requestId: string): string {
  return JSON.stringify({ level: 'info', message: 'd1_query', requestId, ...statement, durationMs: 1, release: 'local', timestamp: '2026-11-08T00:00:00.000Z' });
}

type Answered = { label: string; answer: StandInAnswer };

function signIn(request: ReceivedRequest): Answered {
  const { email } = parseJsonText(request.body, signInBody);
  const user = email.replace(/@.*/, '');
  return {
    label: `sign-in ${email}`,
    answer: { status: 200, body: { user: { email } }, headers: { 'set-cookie': `${SESSION_COOKIE}=${user}-session; Path=/; HttpOnly; SameSite=Lax` } },
  };
}

function aProfiledWorker({ statementsOf = {}, instead = {} }: ProfiledWorker) {
  const timesAsked = new Map<string, number>();
  const scenarioAsked = (request: ReceivedRequest): Answered => {
    const asked = `${request.method} ${request.url.pathname}${request.url.search} ${actorOf(request)}`;
    const times = timesAsked.get(asked) ?? 0;
    timesAsked.set(asked, times + 1);
    const scenario = scenarios().filter((each) => `${each.method ?? 'GET'} ${each.path} ${each.actor}` === asked)[times];
    if (scenario) return { label: scenario.name, answer: { status: scenario.expectedStatus, body: { ok: true } } };
    if (request.method === 'GET') return { label: `setup GET ${request.url.pathname}`, answer: { status: 200, body: STORED_RESOURCE } };
    return { label: `unexpected ${asked}`, answer: { status: 404, body: { error: 'Not found' } } };
  };
  let served = 0;
  return (request: ReceivedRequest): StandInAnswer => {
    served += 1;
    const { label, answer } =
      request.url.pathname === '/api/health'
        ? { label: 'health', answer: { status: 200, body: { status: 'ok' } } }
        : request.url.pathname === '/api/auth/sign-in/email'
          ? signIn(request)
          : scenarioAsked(request);
    const chosen = instead[label] ?? answer;
    const requestId = `request-${served}`;
    const lines = [
      ...(statementsOf[label] ?? []).map((statement) => d1QueryLine(statement, requestId)),
      JSON.stringify({ level: 'info', message: 'api_request', requestId, path: request.url.pathname, status: chosen.status }),
    ];
    return { ...chosen, headers: { ...chosen.headers, 'x-worker-log': JSON.stringify(lines) } };
  };
}

export const profileOutput = (copy: CopyWithAStandInPackage, file: string): string => path.join(copy.root, 'tmp', 'd1-profile', file);

export function preloadInTheCopy(copy: CopyWithAStandInPackage, files: Record<string, string>, preload: string): string {
  const folder = path.join(copy.root, 'tmp', 'stand-ins');
  mkdirSync(folder, { recursive: true });
  for (const [file, source] of Object.entries(files)) writeFileSync(path.join(folder, file), source);
  return path.join(folder, preload);
}

function callsOf(copy: CopyWithAStandInPackage): string[][] {
  const calls = path.join(copy.standInFolder, 'calls.jsonl');
  if (!existsSync(calls)) return [];
  return readFileSync(calls, 'utf8').split('\n').filter((line) => line.length > 0).map((line) => parseJsonText(line, callOfTheStandIn));
}

export async function runTheProfile(
  copy: CopyWithAStandInPackage,
  { args, build = 'leaves the worker', worker = {}, preloads = [] }: ProfileRunOptions,
): Promise<ProfileRun> {
  rmSync(profileOutput(copy, ''), { recursive: true, force: true });
  rmSync(path.join(copy.standInFolder, 'calls.jsonl'), { force: true });
  return withLocalApiStandIn(aProfiledWorker(worker), async (origin, requests) => {
    writeFileSync(path.join(copy.standInFolder, 'plan.json'), JSON.stringify({ build, worker: origin }));
    const invocation = buildScriptInvocation(path.join(copy.root, 'scripts', 'd1-profile.ts'), args, { repoRoot: copy.root });
    const preloadFlags = preloads.flatMap((preload) => ['--import', pathToFileURL(preload).href]);
    const commandLine = [...invocation.args.slice(0, AFTER_THE_TSX_LOADER), ...preloadFlags, ...invocation.args.slice(AFTER_THE_TSX_LOADER)];
    const child = spawn(invocation.command, commandLine, { cwd: copy.root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const [stdout, stderr, status] = await Promise.all([
      text(child.stdout),
      text(child.stderr),
      new Promise<number | null>((exited, failed) => {
        child.once('error', failed);
        child.once('close', exited);
      }),
    ]);
    return { status, stdout, stderr, requests: [...requests], calls: callsOf(copy) };
  });
}

export function previewPortOf(run: ProfileRun): number {
  const preview = run.calls.find(([command]) => command === 'preview') ?? [];
  return Number(preview[preview.indexOf('--port') + 1]);
}

export async function answersOn(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/api/health`);
    return true;
  } catch {
    return false;
  }
}
