import { vi } from 'vitest';

vi.mock('@opennextjs/aws/adapters/config/index.js', async () => (await import('./nextRouting')).openNextBuildConfig());

export { loadBuiltRoutes, nextServerRedirect, workerRedirect } from './nextRouting';
export type { RedirectResult, RequestOptions } from './nextRouting';
