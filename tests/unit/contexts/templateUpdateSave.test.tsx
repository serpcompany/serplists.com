import { QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

const apiMock = vi.hoisted(() => ({ updateTemplate: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMock }));
import { aTemplatesProviderForEachTest, launchChecklist, savePayloadOf } from '../../support/templatesProviderHarness';

const template = launchChecklist();

const renderTemplatesProvider = aTemplatesProviderForEachTest();
const renderProvider = () =>
  renderTemplatesProvider((client) => client.setQueryData(['templates', 'user-1', 'personal'], [template]));

const settledWithin = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise.then((value) => ({ value })), new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))]);

describe('updateTemplate', () => {
  afterEach(() => {
    apiMock.updateTemplate.mockReset();
  });

  it('resolves with the stored version without reloading the workspace list, leaving it stale for the pages that show it', async () => {
    apiMock.updateTemplate.mockResolvedValue({ version: 4, slug: 'launch-checklist' });
    const { client, context } = renderProvider();
    const listRequestThatNeverAnswers = vi.fn(() => new Promise<ChecklistTemplate[]>(() => {}));
    const unsubscribe = new QueryObserver(client, {
      queryKey: ['templates', 'user-1', 'personal'],
      queryFn: listRequestThatNeverAnswers,
      staleTime: 5 * 60 * 1000,
    }).subscribe(() => {});

    const outcome = await settledWithin(context.updateTemplate({ ...savePayloadOf(template), title: 'Launch Checklist v2' }), 200);

    expect(outcome).toEqual({ value: { version: 4, slug: 'launch-checklist' } });
    expect(listRequestThatNeverAnswers).not.toHaveBeenCalled();
    expect(client.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
    unsubscribe();
  });
});
