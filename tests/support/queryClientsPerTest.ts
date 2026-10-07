import { QueryClient } from '@tanstack/react-query';
import { afterEach } from 'vitest';

export function queryClientsClearedAfterEachTest() {
  const clients: QueryClient[] = [];
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });
  return () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return client;
  };
}
