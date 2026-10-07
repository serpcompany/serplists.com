import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  type TemplateDetailRecord,
  useTemplateDetailRecord,
} from '@/features/template-detail/useTemplateDetailRecord';
import { queryKeys } from '@/lib/queryCache';
import type { ChecklistTemplate } from '@/types/checklist';

import { createQueryClientWithAppDefaults } from '../../../support/appQueryClient';

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

const key = queryKeys.templateDetail('template-1', 'user-1');

const renderOnceFromTheCache = (queryClient: QueryClient) => {
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

    const record = renderOnceFromTheCache(queryClient);

    expect(record.template).toEqual(template);
    expect(record.loading).toBe(false);
    expect(record.notFound).toBe(false);
    expect(record.loadError).toBeNull();
  });

  it('keeps showing the loaded template, without the spinner that would unmount open dialogs, while it refetches in the background', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, template);
    queryClient.getQueryCache().find({ queryKey: key })?.setState({ fetchStatus: 'fetching' });

    const record = renderOnceFromTheCache(queryClient);

    expect(record.template).toEqual(template);
    expect(record.loading).toBe(false);
  });

  it('never reads the workspace list, even when it holds the template', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['templates', 'user-1', 'personal'], [template]);

    const record = renderOnceFromTheCache(queryClient);

    expect(record.template).toBeNull();
    expect(record.loading).toBe(true);
  });

  it('reports a template the server says is gone as not found while that answer is fresh', () => {
    const queryClient = createQueryClientWithAppDefaults();
    queryClient.setQueryData(key, null);

    const record = renderOnceFromTheCache(queryClient);

    expect(record.notFound).toBe(true);
    expect(record.loading).toBe(false);
    expect(record.template).toBeNull();
  });

  it('shows loading, not not found, while a cached gone answer is refetched, since the template may have been restored elsewhere', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, null);
    queryClient.getQueryCache().find({ queryKey: key })?.setState({ fetchStatus: 'fetching' });

    const record = renderOnceFromTheCache(queryClient);

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

    const record = renderOnceFromTheCache(queryClient);

    expect(record.loadError).toBe('HTTP 503');
    expect(record.notFound).toBe(false);
    expect(record.loading).toBe(false);
  });

  it('applies an accepted change to the cached template only when it is still that template', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, template);
    const record = renderOnceFromTheCache(queryClient);

    record.updateTemplate((current) =>
      current?.id === 'template-1' ? { ...current, isPublic: true } : current,
    );
    record.updateTemplate((current) =>
      current?.id === 'template-2' ? { ...current, isPublic: false } : current,
    );

    expect(queryClient.getQueryData<ChecklistTemplate>(key)?.isPublic).toBe(true);
  });
});
