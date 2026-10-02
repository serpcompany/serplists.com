import { describe, expect, it, vi } from 'vitest';

import { exportTemplateFile } from '@/features/template-detail/templateExport';

describe('template detail export of content a lenient import stored, which the declared types rule out', () => {
  it('exports a template whose content block id is a number, as a lenient import can store, with the id as text', () => {
    const download = vi.fn();

    const result = exportTemplateFile({
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: true },
      download,
      template: {
        id: 'template-1',
        title: 'Launch plan',
        sections: [{
          id: 'section-1',
          title: 'Prep',
          items: [{ id: 'item-1', title: 'Write', contents: [{ id: 7, type: 'text', value: 'Hi' }] }],
        }],
        userId: 'user-1',
        createdAt: '2026-04-18T00:00:00.000Z',
        updatedAt: '2026-04-18T00:00:00.000Z',
        isPublic: true,
      },
    });

    expect(result.kind).toBe('ok');
    expect(download).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(download.mock.calls[0]?.[0])).toContain('"id":"7"');
  });
});
