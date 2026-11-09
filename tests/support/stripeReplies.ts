import { vi } from 'vitest';

export function stripeAnswers(...bodies: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const body of bodies) fetchMock.mockResolvedValueOnce(body);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
