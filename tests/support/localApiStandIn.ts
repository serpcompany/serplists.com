import { createServer, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';

import { listeningPort } from './listeningPort';

export type ReceivedRequest = { method: string; url: URL; headers: IncomingHttpHeaders; body: string };
export type StandInAnswer = { status: number; body: unknown; headers?: Record<string, string> };
export type StandInRoute = (request: ReceivedRequest, origin: string) => StandInAnswer;

async function received(incoming: IncomingMessage, origin: string): Promise<ReceivedRequest> {
  let body = '';
  for await (const chunk of incoming) body += String(chunk);
  return { method: incoming.method ?? 'GET', url: new URL(incoming.url ?? '/', origin), headers: incoming.headers, body };
}

function answerOf(route: StandInRoute, request: ReceivedRequest, origin: string): StandInAnswer {
  try {
    return route(request, origin);
  } catch (error) {
    return { status: 500, body: { standInError: error instanceof Error ? error.message : String(error) } };
  }
}

export async function withLocalApiStandIn<Result>(
  route: StandInRoute,
  whileListening: (origin: string, requests: readonly ReceivedRequest[]) => Promise<Result>,
): Promise<Result> {
  const requests: ReceivedRequest[] = [];
  let origin = '';
  const server = createServer((incoming, outgoing) => {
    void received(incoming, origin).then((request) => {
      requests.push(request);
      const { status, body, headers = {} } = answerOf(route, request, origin);
      outgoing.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  origin = `http://127.0.0.1:${listeningPort(server)}`;
  try {
    return await whileListening(origin, requests);
  } finally {
    await new Promise<void>((closed) => server.close(() => closed()));
  }
}
