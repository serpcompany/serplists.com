import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';

import { DevLoginBar } from '@/components/DevLoginBar';
import { createFakeContainer } from '../../fixtures/fakeDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({ ok: true }),
    user: null,
  }),
}));

let root: Root | null = null;
const fakeDom = aFakeDomForEachTest(navigation.window);
const unmountThePreviousBar = () => act(() => root?.unmount());

const textAfterMountingAt = async (url: string) => {
  unmountThePreviousBar();
  navigation.reset(url);
  const container = createFakeContainer();
  root = fakeDom.track(createRoot(container as unknown as HTMLElement));
  await act(async () => root?.render(<DevLoginBar />));
  return container.textContent;
};

describe("DevLoginBar, which shows the page's port and so renders only after mount", () => {
  it('stays hidden on blank template editor routes', async () => {
    expect(await textAfterMountingAt('/dashboard/templates/new')).toBe('');
    expect(await textAfterMountingAt('/dashboard/templates/new/')).toBe('');
  });

  it('stays hidden on authenticated dashboard routes used for design QA', async () => {
    expect(await textAfterMountingAt('/dashboard')).toBe('');
    expect(await textAfterMountingAt('/dashboard/templates/')).toBe('');
    expect(await textAfterMountingAt('/dashboard/runs/run-1/')).toBe('');
  });

  it('still renders on the login route in development', async () => {
    expect(await textAfterMountingAt('/login')).toContain('DEV MODE');
    expect(await textAfterMountingAt('/login/')).toContain('DEV MODE');
  });

  it('renders nothing on the server, so hydration matches', () => {
    navigation.reset('/login/');

    expect(renderToStaticMarkup(<DevLoginBar />)).toBe('');
  });
});
