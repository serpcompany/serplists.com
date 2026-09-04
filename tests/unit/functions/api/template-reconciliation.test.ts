import { describe, expect, it } from 'vitest';

import {
  calculateRunProgress,
  reconcileRunSections,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';

const originalRun = [
  {
    id: 'section-content',
    title: 'Content',
    items: [
      {
        id: 'item-copy',
        title: 'Write copy',
        description: 'Old instructions',
        isCompleted: true,
        notes: 'Approved by Devin',
        contents: [
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'sub-short', title: 'Short description', isCompleted: true },
              { id: 'sub-long', title: 'Long description', isCompleted: false },
            ],
          },
        ],
      },
      {
        id: 'item-retired',
        title: 'Create legacy badge',
        isCompleted: true,
        notes: 'Kept for audit history',
      },
    ],
  },
];

describe('template run reconciliation', () => {
  it('preserves run-owned state by stable identity while applying additions, renames, reorders, and removals', () => {
    const evolvedTemplate = [
      {
        id: 'section-content',
        title: 'Launch content',
        items: [
          {
            id: 'item-media',
            title: 'Create screenshots',
            isCompleted: true,
          },
          {
            id: 'item-copy',
            title: 'Write listing copy',
            description: 'New instructions',
            contents: [
              {
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'sub-long', title: 'Full description' },
                  { id: 'sub-tagline', title: 'Tagline', isCompleted: true },
                  { id: 'sub-short', title: 'Short copy' },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = reconcileRunSections(originalRun, evolvedTemplate, []);

    expect(result.sections[0].title).toBe('Launch content');
    expect(result.sections[0].items.map((item) => item.id)).toEqual([
      'item-media',
      'item-copy',
    ]);
    expect(result.sections[0].items[0].isCompleted).toBe(false);
    expect(result.sections[0].items[1]).toMatchObject({
      id: 'item-copy',
      title: 'Write listing copy',
      description: 'New instructions',
      isCompleted: true,
      notes: 'Approved by Devin',
    });
    expect(result.sections[0].items[1].contents[0].subItems).toEqual([
      { id: 'sub-long', title: 'Full description', isCompleted: false },
      { id: 'sub-tagline', title: 'Tagline', isCompleted: false },
      { id: 'sub-short', title: 'Short copy', isCompleted: true },
    ]);
    expect(result.retired).toEqual([
      expect.objectContaining({
        kind: 'item',
        sectionId: 'section-content',
        item: expect.objectContaining({ id: 'item-retired', notes: 'Kept for audit history' }),
      }),
    ]);
    expect(calculateRunProgress(result.sections)).toBe(40);
  });

  it('archives removed sub-items without counting them toward readiness', () => {
    const evolvedTemplate = [
      {
        id: 'section-content',
        title: 'Content',
        items: [
          {
            id: 'item-copy',
            title: 'Write copy',
            contents: [
              {
                type: 'subItems',
                value: '',
                subItems: [{ id: 'sub-short', title: 'Short description' }],
              },
            ],
          },
        ],
      },
    ];

    const result = reconcileRunSections(originalRun, evolvedTemplate, []);

    expect(result.retired).toEqual([
      expect.objectContaining({ kind: 'subItem', subItem: expect.objectContaining({ id: 'sub-long' }) }),
      expect.objectContaining({ kind: 'item', item: expect.objectContaining({ id: 'item-retired' }) }),
    ]);
    expect(calculateRunProgress(result.sections)).toBe(100);
  });

  it('rejects missing or duplicate identities at every template level', () => {
    expect(validateStableTemplateIdentities([{ title: 'No id', items: [] }])).toMatch(/section/i);
    expect(validateStableTemplateIdentities([
      {
        id: 'section-1',
        title: 'Section',
        items: [
          { id: 'item-1', title: 'One' },
          { id: 'item-1', title: 'Duplicate' },
        ],
      },
    ])).toMatch(/duplicate item/i);
    expect(validateStableTemplateIdentities([
      {
        id: 'section-1',
        title: 'Section',
        items: [
          {
            id: 'item-1',
            title: 'One',
            contents: [{ type: 'subItems', value: '', subItems: [{ title: 'No id' }] }],
          },
        ],
      },
    ])).toMatch(/sub-item/i);
  });

  it('preserves legacy id-less progress on the first template evolution', () => {
    const legacyRun = [
      {
        title: 'Content',
        items: [
          {
            title: 'Write copy',
            isCompleted: true,
            notes: 'Legacy note',
            contents: [{
              type: 'subItems',
              value: '',
              subItems: [{ title: 'Short copy', isCompleted: true }],
            }],
          },
        ],
      },
    ];
    const firstEvolution = [
      {
        title: 'Renamed content section',
        items: [
          {
            title: 'Renamed copy task',
            contents: [{
              type: 'subItems',
              value: '',
              subItems: [{ title: 'Renamed short copy' }, { title: 'New long copy' }],
            }],
          },
          { title: 'New screenshots' },
        ],
      },
    ];

    const result = reconcileRunSections(legacyRun, firstEvolution, []);

    expect(result.sections[0]).toMatchObject({ id: 'legacy-section-1', title: 'Renamed content section' });
    expect(result.sections[0].items[0]).toMatchObject({
      id: 'legacy-item-1-1',
      title: 'Renamed copy task',
      isCompleted: true,
      notes: 'Legacy note',
    });
    expect(result.sections[0].items[0].contents[0].subItems).toEqual([
      expect.objectContaining({ id: 'legacy-subitem-1-1-1', isCompleted: true }),
      expect.objectContaining({ id: 'legacy-subitem-1-1-2', isCompleted: false }),
    ]);
    expect(result.sections[0].items[1]).toMatchObject({
      id: 'legacy-item-1-2',
      isCompleted: false,
    });
  });

  it('normalizes a legacy flat run before reconciling its first sectioned template edit', () => {
    const flatRun = [
      {
        title: 'Publish listing',
        isCompleted: true,
        notes: 'Submitted copy is approved',
      },
    ];
    const sectionedTemplate = [
      {
        id: '1',
        title: 'Checklist',
        items: [
          { id: '1-1', title: 'Publish renamed listing' },
          { id: '1-2', title: 'Upload new screenshots' },
        ],
      },
    ];

    const result = reconcileRunSections(flatRun, sectionedTemplate, []);

    expect(result.retired).toEqual([]);
    expect(result.sections).toEqual([
      expect.objectContaining({
        id: '1',
        items: [
          expect.objectContaining({
            id: 'legacy-item-1-1',
            title: 'Publish renamed listing',
            isCompleted: true,
            notes: 'Submitted copy is approved',
          }),
          expect.objectContaining({
            id: '1-2',
            title: 'Upload new screenshots',
            isCompleted: false,
          }),
        ],
      }),
    ]);
  });
});
