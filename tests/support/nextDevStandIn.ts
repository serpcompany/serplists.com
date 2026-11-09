import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { parseJsonText } from './storedJson';

export const NEXT_DEV_STAND_IN_MODE = 'NEXT_DEV_STAND_IN';
export const NEXT_DEV_STAND_IN_UPSTREAM = 'NEXT_DEV_STAND_IN_UPSTREAM';
export const NEXT_DEV_READY = 'Ready on http://localhost:';
const RECORD = 'tmp/next-dev-stand-in.json';

const standInScript = [
  'import { writeFileSync } from "node:fs";',
  'import { createServer, request } from "node:http";',
  '',
  'const port = Number(process.argv[process.argv.indexOf("--port") + 1]);',
  `const upstream = process.env.${NEXT_DEV_STAND_IN_UPSTREAM};`,
  'const { PORT, FORCE_COLOR, SERPLISTS_DEV_BINDINGS } = process.env;',
  `writeFileSync(${JSON.stringify(RECORD)}, JSON.stringify({ pid: process.pid, args: process.argv.slice(2), PORT, FORCE_COLOR, SERPLISTS_DEV_BINDINGS }));`,
  '',
  'const relay = (incoming, outgoing) => {',
  '  const forwarded = request(new URL(incoming.url, upstream), { method: incoming.method, headers: incoming.headers }, (answer) => {',
  '    const requestId = answer.headers["x-request-id"] ?? null;',
  '    console.log(JSON.stringify({ route: `${incoming.method} ${incoming.url}`, status: answer.statusCode, requestId }));',
  '    outgoing.writeHead(answer.statusCode, answer.headers);',
  '    answer.pipe(outgoing);',
  '  });',
  '  incoming.pipe(forwarded);',
  '};',
  '',
  'const answer = (incoming, outgoing) => {',
  '  const url = new URL(incoming.url, "http://localhost");',
  '  if (url.pathname !== "/exit") return outgoing.writeHead(200, { "content-type": "application/json" }).end(\'{"status":"ok"}\');',
  '  console.error(`\\u001b[31mnext dev exits with ${url.searchParams.get("code")}\\u001b[39m`);',
  '  outgoing.end("bye", () => process.exit(Number(url.searchParams.get("code"))));',
  '};',
  '',
  `if (process.env.${NEXT_DEV_STAND_IN_MODE} === "silent") setInterval(() => undefined, 60_000);`,
  `else createServer(upstream ? relay : answer).listen(port, "127.0.0.1", () => console.log(\`\\u001b[32m✓\\u001b[39m ${NEXT_DEV_READY}\${port}\`));`,
  '',
].join('\n');

export const NEXT_DEV_STAND_IN = {
  next: {
    'package.json': JSON.stringify({ name: 'next', version: '0.0.0-stand-in', type: 'module', bin: { next: 'next-dev-stand-in.mjs' } }),
    'next-dev-stand-in.mjs': standInScript,
  },
};

const recordSchema = z.object({
  pid: z.number(),
  args: z.array(z.string()),
  PORT: z.string().optional(),
  FORCE_COLOR: z.string().optional(),
  SERPLISTS_DEV_BINDINGS: z.string().optional(),
});

export const nextDevRecordIn = (folder: string) => path.join(folder, RECORD);

export const whatNextDevWasStartedWith = (folder: string) => parseJsonText(readFileSync(nextDevRecordIn(folder), 'utf8'), recordSchema);

const sessionSchema = z.object({ port: z.number(), pid: z.number().nullable(), startedAt: z.number().nullable() });

export const devSessionPath = (folder: string) => path.join(folder, 'tmp', 'dev-session.json');

export const theDevSessionIn = (folder: string) => parseJsonText(readFileSync(devSessionPath(folder), 'utf8'), sessionSchema);
