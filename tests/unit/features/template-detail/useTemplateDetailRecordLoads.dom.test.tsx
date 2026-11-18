import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/queryCache';

import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';
import { settle } from '../../../support/queryHookProbe';

const apiMock = vi.hoisted(() => ({
  getTemplateBySlug: vi.fn(),
  getTemplateById: vi.fn(),
  getProfileById: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: apiMock }));

import { useTemplateDetailRecord, type TemplateDetailRecord } from '@/features/template-detail/useTemplateDetailRecord';

type RecordOptions = Parameters<typeof useTemplateDetailRecord>[0];

const publicRow = (slug: string, title: string) => ({
  id: `${slug}-id`,
  title,
  sections: [],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-09-01T00:00:00.000Z',
  is_public: true,
  slug,
  version: 1,
});

let queryClient: QueryClient;
let unmount: () => void = () => undefined;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  Object.values(apiMock).forEach((mock) => mock.mockReset());
});
afterEach(() => {
  unmount();
  queryClient.clear();
});

async function openTheRecord(options: RecordOptions) {
  let record: TemplateDetailRecord | undefined;
  function Page({ shown }: { shown: RecordOptions }) {
    record = useTemplateDetailRecord(shown);
    return null;
  }
  const tree = (shown: RecordOptions) => (
    <QueryClientProvider client={queryClient}>
      <Page shown={shown} />
    </QueryClientProvider>
  );
  const rendered = await renderSettled(tree(options));
  unmount = rendered.unmount;
  return {
    current: () => {
      if (!record) throw new Error('The template page did not render');
      return record;
    },
    show: (next: RecordOptions) => act(async () => rendered.rerender(tree(next))),
  };
}

describe('the record behind a template page', () => {
  it('shows the template now asked for, not a slower answer for the one before it', async () => {
    const firstAnswer = deferred<ReturnType<typeof publicRow>>();
    apiMock.getTemplateBySlug.mockImplementation((slug: string) =>
      slug === 'camping' ? firstAnswer.promise : Promise.resolve(publicRow(slug, 'Moving Day')),
    );
    const page = await openTheRecord({ identifier: 'camping', mode: 'public', ownerUsername: 'alice' });

    await page.show({ identifier: 'moving-day', mode: 'public', ownerUsername: 'alice' });
    await act(settle);
    await act(async () => {
      firstAnswer.resolve(publicRow('camping', 'Camping'));
      await settle();
    });

    expect(page.current().template?.title).toBe('Moving Day');
    expect(page.current().loading).toBe(false);
  });

  it('loads a private template again when asked to', async () => {
    apiMock.getTemplateById.mockResolvedValueOnce({ ...publicRow('audit', 'Audit'), is_public: false });
    apiMock.getTemplateById.mockResolvedValueOnce({ ...publicRow('audit', 'Audit v2'), is_public: false });
    const page = await openTheRecord({ identifier: 'template-1', mode: 'private', userId: 'user-1' });
    await act(settle);

    await act(async () => {
      page.current().reload();
      await settle();
    });
    await act(settle);

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(2);
    expect(page.current().template?.title).toBe('Audit v2');
  });

  it('leaves the page loading when a change lands before the template has loaded', async () => {
    apiMock.getTemplateById.mockReturnValue(deferred().promise);
    const page = await openTheRecord({ identifier: 'template-1', mode: 'private', userId: 'user-1' });

    await act(async () =>
      page.current().updateTemplate((current) => (current === null ? null : { ...current, isPublic: true })),
    );

    expect(queryClient.getQueryData(queryKeys.templateDetail('template-1', 'user-1'))).toBeUndefined();
    expect(page.current().loading).toBe(true);
  });
});
