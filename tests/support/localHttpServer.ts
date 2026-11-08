import { createServer, type RequestListener } from 'node:http';

import { listeningPort } from './listeningPort';

export async function whileServingLocally<T>(handler: RequestListener, run: (origin: string) => Promise<T>): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  try {
    return await run(`http://127.0.0.1:${listeningPort(server)}`);
  } finally {
    await new Promise<void>((closed) => server.close(() => closed()));
  }
}
