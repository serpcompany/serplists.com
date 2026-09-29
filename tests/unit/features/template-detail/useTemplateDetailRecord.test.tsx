import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { getTemplateDetailQueryKey } from '@/features/template-detail/templateDetailQuery';
import {
  type TemplateDetailRecord,
  useTemplateDetailRecord,
} from '@/features/template-detail/useTemplateDetailRecord';
import type { ChecklistTemplate } from '@/types/checklist';

const template: ChecklistTemplate = {
  id: 'template-1',
  title: 'Camping Checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  version: 3,
};

const key = getTemplateDetailQueryKey('template-1', 'user-1');

// Renders once on the server: no effect or fetch runs, so the record reflects the cache.
const renderRecord = (queryClient: QueryClient) => {
  let record: TemplateDetailRecord | undefined;
  const Probe = () => {
    record = useTemplateDetailRecord({
      identifier: 'template-1',
      mode: 'private',
      userId: 'user-1',
    });
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  if (!record) throw new Error('record not rendered');
  return record;
};

describe('private template detail record', () => {
  it('shows the loaded template from its own query', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, template);

    const record = renderRecord(queryClient);

    expect(record.template).toEqual(template);
    expect(record.loading).toBe(false);
    expect(record.notFound).toBe(false);
    expect(record.loadError).toBeNull();
  });

  // A background refetch (an invalidation, or the reload after an edit conflict) must not
  // swap the page for its spinner, which would unmount open dialogs.
  it('keeps showing the loaded template while it refetches in the background', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, template);
    queryClient.getQueryCache().find({ queryKey: key })?.setState({ fetchStatus: 'fetching' });

    const record = renderRecord(queryClient);

    expect(record.template).toEqual(template);
    expect(record.loading).toBe(false);
  });

  it('never reads the workspace list, even when it holds the template', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['templates', 'user-1', 'personal'], [template]);

    const record = renderRecord(queryClient);

    expect(record.template).toBeNull();
    expect(record.loading).toBe(true);
  });

  it('reports a template the server says is gone as not found', () => {
    // A fresh answer (the app keeps answers fresh for 60s), so nothing refetches it.
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    queryClient.setQueryData(key, null);

    const record = renderRecord(queryClient);

    expect(record.notFound).toBe(true);
    expect(record.loading).toBe(false);
    expect(record.template).toBeNull();
  });

  // A cached "gone" answer (the template was archived, then restored elsewhere) is being
  // checked again: wait for the answer instead of saying it does not exist.
  it('shows loading, not not found, while a cached gone answer is refetched', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, null);
    queryClient.getQueryCache().find({ queryKey: key })?.setState({ fetchStatus: 'fetching' });

    const record = renderRecord(queryClient);

    expect(record.loading).toBe(true);
    expect(record.notFound).toBe(false);
  });

  it('offers Try again, not not found, when refetching a cached gone answer fails', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    queryClient.setQueryData(key, null);
    queryClient.getQueryCache().find({ queryKey: key })?.setState({
      error: new Error('HTTP 503'),
      status: 'error',
    });

    const record = renderRecord(queryClient);

    expect(record.loadError).toBe('HTTP 503');
    expect(record.notFound).toBe(false);
    expect(record.loading).toBe(false);
  });

  it('applies an accepted change to the cached template only when it is still that template', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, template);
    const record = renderRecord(queryClient);

    record.updateTemplate((current) =>
      current?.id === 'template-1' ? { ...current, isPublic: true } : current,
    );
    record.updateTemplate((current) =>
      current?.id === 'template-2' ? { ...current, isPublic: false } : current,
    );

    expect(queryClient.getQueryData<ChecklistTemplate>(key)?.isPublic).toBe(true);
  });
});
