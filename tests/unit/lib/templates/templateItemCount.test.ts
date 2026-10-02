import { describe, expect, it } from 'vitest';

import { countTemplateItems } from '@/lib/templates/templateItemCount';
import type { ChecklistTemplate } from '@/types/checklist';

describe('countTemplateItems', () => {
  it('counts the tasks of every section, and neither the sub-tasks nor the text and media blocks inside a task', () => {
    const template: Pick<ChecklistTemplate, 'sections'> = {
      sections: [
        {
          id: 'prep',
          title: 'Prep',
          items: [
            {
              id: 'pack',
              title: 'Pack the bag',
              contents: [
                { type: 'text', value: 'Use the checklist on the door.' },
                { type: 'image', value: 'https://example.com/bag.png' },
                {
                  type: 'subItems',
                  value: '',
                  subItems: [
                    { id: 'tent', title: 'Tent' },
                    { id: 'stove', title: 'Stove' },
                  ],
                },
              ],
            },
            { id: 'fuel', title: 'Buy fuel' },
          ],
        },
        { id: 'empty', title: 'Nothing yet', items: [] },
        { id: 'trip', title: 'Trip', items: [{ id: 'drive', title: 'Drive' }] },
      ],
    };

    expect(countTemplateItems(template)).toBe(3);
  });

  it('is zero for a Template with no sections', () => {
    expect(countTemplateItems({ sections: [] })).toBe(0);
  });
});
