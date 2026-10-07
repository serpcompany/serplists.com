import type { ReactNode } from 'react';
import { vi } from 'vitest';

const PassThrough = ({ children }: { children: ReactNode }) => children;

export const appShell = {
  auth: {} as object,
  templates: {} as object,
  workspace: {} as object,
};

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => appShell.auth }));
vi.mock('@/contexts/AuthProvider', () => ({ AuthProvider: PassThrough }));
vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => appShell.templates,
  useTemplates: () => appShell.templates,
}));
vi.mock('@/contexts/TemplatesProvider', () => ({ TemplatesProvider: PassThrough }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => appShell.workspace }));
vi.mock('@/contexts/WorkspaceProvider', () => ({ WorkspaceProvider: PassThrough }));
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: PassThrough }));
vi.mock('@/components/RequireAuth', () => ({ default: PassThrough }));
vi.mock('@/components/DevLoginBar', () => ({ DevLoginBar: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => <i data-toaster="" /> }));
vi.mock('@/components/ui/tooltip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/tooltip')>()),
  TooltipProvider: PassThrough,
}));
vi.mock('@/lib/analytics', () => ({ analytics: new Proxy({}, { get: () => vi.fn(() => []) }) }));
