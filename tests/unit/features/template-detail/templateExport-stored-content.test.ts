import { describe, expect, it, vi } from 'vitest';

import { mapApiTemplateToChecklistTemplate } from '@/features/template-detail/templateDetailMappers';
import { exportTemplateFile } from '@/features/template-detail/templateExport';
import { apiTemplateSchema } from '@/lib/schemas/apiTemplates';
import type { PortableTemplatePack } from '@/lib/schemas/checklistSchema';
import { firstOf } from '../../../support/elements';

describe('template detail export of content a lenient import stored, which the declared types rule out', () => {
  it('exports a template whose content block id is a number, as a lenient import can store, with the id as text', () => {
    const download = vi.fn<(pack: PortableTemplatePack, filename: string) => void>();
    const stored: unknown = {
      id: 'template-1',
      title: 'Launch plan',
      items: JSON.stringify([{
        id: 'section-1',
        title: 'Prep',
        items: [{ id: 'item-1', title: 'Write', contents: [{ id: 7, type: 'text', value: 'Hi' }] }],
      }]),
      user_id: 'user-1',
      created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
      is_public: true,
    };

    const result = exportTemplateFile({
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: true },
      download,
      template: mapApiTemplateToChecklistTemplate(apiTemplateSchema.parse(stored), 'launch-plan'),
    });

    expect(result.kind).toBe('ok');
    expect(download).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(firstOf(download.mock.calls)[0])).toContain('"id":"7"');
  });
});
