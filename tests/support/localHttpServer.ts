import { createServer, type RequestListener } from 'node:http';
import type { Server } from 'node:net';

import { listeningPort } from './listeningPort';

export async function whileListeningLocally<T>(server: Server, origin: (port: number) => string, run: (origin: string) => Promise<T>): Promise<T> {
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  try {
    return await run(origin(listeningPort(server)));
  } finally {
    await new Promise<void>((closed) => server.close(() => closed()));
  }
}

export function whileServingLocally<T>(handler: RequestListener, run: (origin: string) => Promise<T>): Promise<T> {
  return whileListeningLocally(createServer(handler), (port) => `http://127.0.0.1:${port}`, run);
}
