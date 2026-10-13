import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { listeningPort } from './listeningPort';

export type SentRequest = { method: string; path: string; query: URLSearchParams; body: string };
type Answer = { status: number; body: unknown };
export type Route = (request: SentRequest) => Answer | undefined;
type ScriptRun = { status: number | null; output: string; requests: SentRequest[] };

const NOT_FOUND: Answer = { status: 404, body: { message: 'Not Found' } };
const KEPT_VARIABLES = ['PATH', 'SYSTEMROOT', 'WINDIR'];

function standInFor(route: Route, requests: SentRequest[]) {
  return (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const url = new URL(incoming.url ?? '/', 'http://stand-in');
      const sent = { method: incoming.method ?? 'GET', path: url.pathname, query: url.searchParams, body: Buffer.concat(chunks).toString() };
      requests.push(sent);
      const { status, body } = route(sent) ?? NOT_FOUND;
      outgoing.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    });
  };
}

function onlyTheseVariables(env: Record<string, string>): NodeJS.ProcessEnv {
  const unset = Object.fromEntries(
    Object.keys(process.env)
      .filter((name) => !KEPT_VARIABLES.includes(name.toUpperCase()))
      .map((name): [string, undefined] => [name, undefined]),
  );
  return { ...process.env, ...unset, ...env };
}

export async function runAgainstAGitHubStandIn(
  command: { script: string; args?: string[] },
  env: Record<string, string>,
  route: Route,
): Promise<ScriptRun> {
  const requests: SentRequest[] = [];
  const api = createServer(standInFor(route, requests));
  await new Promise<void>((listening) => api.listen(0, '127.0.0.1', listening));
  const apiUrl = `http://127.0.0.1:${listeningPort(api)}`;
  const script = spawn(process.execPath, [command.script, ...(command.args ?? [])], {
    env: onlyTheseVariables({ GITHUB_API_URL: apiUrl, GITHUB_TOKEN: 'test-token', ...env }),
  });
  let output = '';
  script.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  script.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const status = await new Promise<number | null>((exited) => script.on('close', exited));
  await new Promise<void>((closed) => api.close(() => closed()));
  return { status, output, requests };
}
