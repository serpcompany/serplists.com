import type { Server } from 'node:net';

export function listeningPort(server: Pick<Server, 'address'>): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`Expected the server to listen on a TCP port, but its address is ${String(address)}.`);
  }
  return address.port;
}
