import { describe, expect, it, vi } from 'vitest';

import {
  buildTemplateExportFile,
  exportTemplateFile,
  getTemplateExportLabel,
} from '@/features/template-detail/templateExport';
import type { TemplateDetailBillingState } from '@/features/template-detail/useTemplateDetailModel';
import { parseTemplatesFromData } from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';

const buildTemplate = (
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Launch Checklist',
  description: 'Ship it.',
  type: 'recipe',
  sections: [
    {
      id: 'section-1',
      title: 'Prep',
      items: [
        {
          id: 'item-1',
          title: 'Write the notes',
          contents: [{ id: 'content-1', type: 'text', value: 'Summarize.' }],
        },
      ],
    },
  ],
  userId: 'user-1',
  teamId: 'team-1',
  ownerProfile: { username: 'alice' },
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: true,
  slug: 'launch-checklist',
  seoTitle: 'Launch SEO title',
  seoDescription: 'Launch SEO description',
  categories: ['Work'],
  tags: ['launch'],
  rules: [
    {
      id: 'rule-1',
      type: 'required-field',
      path: 'sections[].items[].title',
      value: 'Every item needs a title',
      severity: 'error',
    },
  ],
  version: 3,
  ...overrides,
});

const billing = (
  overrides: Partial<TemplateDetailBillingState> = {},
): TemplateDetailBillingState => ({
  billingEnabled: true,
  isLoading: false,
  isPro: true,
  ...overrides,
});

describe('template detail export', () => {
  it('builds a portable pack that Import Templates accepts', () => {
    const { pack } = buildTemplateExportFile(buildTemplate());
    const downloaded = JSON.parse(JSON.stringify(pack)) as unknown;

    expect(pack.kind).toBe('serplists-template-pack');
    expect(pack.templates[0]).not.toHaveProperty('userId');
    expect(pack.templates[0]).not.toHaveProperty('teamId');
    expect(pack.templates[0]).not.toHaveProperty('ownerProfile');

    const { templates } = parseTemplatesFromData(downloaded);
    expect(templates).toHaveLength(1);
    expect(templates[0]).toEqual(
      expect.objectContaining({
        title: 'Launch Checklist',
        type: 'recipe',
        isPublic: true,
        seoTitle: 'Launch SEO title',
        seoDescription: 'Launch SEO description',
        categories: ['Work'],
        tags: ['launch'],
      }),
    );
    expect(templates[0]?.rules).toHaveLength(1);
    expect(templates[0]?.sections[0]?.items[0]?.title).toBe('Write the notes');
  });

  it('names the file after the slug, or the id when the slug is empty', () => {
    expect(buildTemplateExportFile(buildTemplate()).filename).toBe(
      'launch-checklist.json',
    );
    expect(buildTemplateExportFile(buildTemplate({ slug: '' })).filename).toBe(
      'template-1.json',
    );
    expect(buildTemplateExportFile(buildTemplate({ slug: '   ' })).filename).toBe(
      'template-1.json',
    );
    expect(
      buildTemplateExportFile(buildTemplate({ slug: '', id: 'a/b:c' })).filename,
    ).toBe('a-b-c.json');
  });

  it('downloads the pack only on a paid plan', () => {
    const download = vi.fn();

    const result = exportTemplateFile({
      billingState: billing(),
      download,
      template: buildTemplate({ slug: '' }),
    });

    expect(result).toEqual({ kind: 'ok', assetWarnings: 0 });
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ kind: 'serplists-template-pack' }),
    );
    expect(download.mock.calls[0]?.[1]).toBe('template-1.json');
  });

  it('asks a Free plan to upgrade instead of downloading', () => {
    const download = vi.fn();

    expect(
      exportTemplateFile({
        billingState: billing({ isPro: false }),
        download,
        template: buildTemplate(),
      }),
    ).toEqual({ kind: 'upgrade_required' });
    expect(
      exportTemplateFile({
        billingState: billing({ isLoading: true, isPro: false }),
        download,
        template: buildTemplate(),
      }).kind,
    ).toBe('error');
    expect(download).not.toHaveBeenCalled();
  });

  it('labels the menu item for the plan', () => {
    expect(getTemplateExportLabel(billing())).toBe('Export JSON');
    expect(getTemplateExportLabel(billing({ isPro: false }))).toBe(
      'Upgrade to export',
    );
    expect(getTemplateExportLabel(billing({ isLoading: true }))).toBe(
      'Checking plan...',
    );
  });

  it('counts uploaded files the export leaves out', () => {
    const result = exportTemplateFile({
      billingState: billing(),
      download: vi.fn(),
      template: buildTemplate({
        sections: [
          {
            id: 'section-1',
            title: 'Media',
            items: [
              {
                id: 'item-1',
                title: 'Photo',
                contents: [
                  {
                    id: 'content-1',
                    type: 'image',
                    uploadType: 'upload',
                    value: '/api/uploads/file?key=abc',
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(result).toEqual({ kind: 'ok', assetWarnings: 1 });
  });
});
