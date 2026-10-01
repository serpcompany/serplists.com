import { vi } from 'vitest';

vi.mock('next/navigation', async () => (await import('./nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('./nextNavigation')).nextLinkMock);

export { navigation } from './nextNavigation';
