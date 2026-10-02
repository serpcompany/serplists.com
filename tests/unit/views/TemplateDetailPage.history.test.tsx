import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseModel,
  mockUseTemplateDetailModel,
  renderTemplateDetail,
  resetTemplateDetailPageMocks,
} from '../../support/templateDetailPage';
import { mapApiTemplateToChecklistTemplate } from '@/features/template-detail/templateDetailMappers';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import type { TemplateDetailHistoryState } from '@/features/template-detail/useTemplateDetailModel';
import type { HistoryEvent, TemplateHistoryVersion } from '@/lib/schemas/historyResponses';

beforeEach(resetTemplateDetailPageMocks);

const historyOf = ({ events, versions }: { events: HistoryEvent[]; versions: TemplateHistoryVersion[] }): TemplateDetailHistoryState => ({
  data: { events, subject: { id: 'user-1', type: 'user' }, templateId: 'tpl-1', versions },
  isError: false,
  isLoading: false,
});

const actorNamed = (name: string): HistoryEvent['actor'] => ({ userId: null, email: null, name, username: null });

const createdByJohn = (id: string, extra: Partial<HistoryEvent> = {}): HistoryEvent => ({
  action: 'template.created',
  actor: actorNamed('John Example'),
  createdAt: '2026-07-03T12:00:00.000Z',
  id,
  ...extra,
});

const versionCreatedByJohn = (id: string, version: number, extra: Partial<HistoryEvent> = {}): TemplateHistoryVersion => ({
  ...createdByJohn(id, extra),
  version,
});

const ZONE_FAR_FROM_UTC = 'Asia/Tokyo';
const STORED_AT_8_30_PM_UTC_ON_JULY_5 = '2026-07-05 20:30:00';
const withNarrowNoBreakSpacesAsSpaces = (text: string) => text.replace(/\u202f/g, ' ');

describe('TemplateDetail dates', () => {
  const originalTz = process.env['TZ'];
  beforeEach(() => {
    process.env['TZ'] = ZONE_FAR_FROM_UTC;
  });
  afterEach(() => {
    process.env['TZ'] = originalTz;
  });

  it('reads zoneless timestamps as UTC and never shows Invalid Date', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      history: historyOf({
        events: [],
        versions: [versionCreatedByJohn('version-1', 1, { createdAt: STORED_AT_8_30_PM_UTC_ON_JULY_5 })],
      }),
      template: {
        ...buildV0DemoPrivateTemplate(),
        createdAt: STORED_AT_8_30_PM_UTC_ON_JULY_5,
        updatedAt: 'not a timestamp',
      },
    });

    const html = withNarrowNoBreakSpacesAsSpaces(renderTemplateDetail());

    expect(html).toContain('7/6/2026');
    expect(html).toContain('Jul 6, 2026, 5:30 AM');
    expect(html).not.toContain('7/5/2026');
    expect(html).not.toContain('Invalid Date');
  });
});

describe('TemplateDetail Changelog', () => {
  it('shows a restore and a Share next to the versions, without repeating a version', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      history: historyOf({
        events: [
          {
            action: 'template.restored',
            actor: actorNamed('Bob Editor'),
            createdAt: '2026-07-05T12:00:00.000Z',
            id: 'event-3',
          },
          {
            action: 'template.updated',
            actor: actorNamed('John Example'),
            createdAt: '2026-07-04T12:00:00.000Z',
            metadata: { visibility: 'public' },
            id: 'event-2',
          },
          createdByJohn('event-1'),
        ],
        versions: [versionCreatedByJohn('version-1', 1)],
      }),
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Restored template');
    expect(html).toContain('Bob Editor');
    expect(html).toContain('Made template public');
    expect(html).toContain('Created template v1');
    expect(html.match(/Created template/g)).toHaveLength(1);
    expect(html.indexOf('Restored template')).toBeLessThan(html.indexOf('Made template public'));
    expect(html.indexOf('Made template public')).toBeLessThan(html.indexOf('Created template v1'));
  });

  it("names the Run Key behind an Agent's edit and the user who authorized it", () => {
    const agent = { source: 'mcp', personalRunKeyId: 'key-1', personalRunKeyName: 'Codex SOP Writer' };
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      history: historyOf({
        events: [
          {
            action: 'template.updated',
            actor: actorNamed('John Example'),
            createdAt: '2026-07-04T12:00:00.000Z',
            id: 'event-2',
            metadata: agent,
          },
          createdByJohn('event-1'),
        ],
        versions: [
          {
            action: 'template.updated',
            actor: actorNamed('John Example'),
            createdAt: '2026-07-04T12:00:00.000Z',
            id: 'version-2',
            metadata: agent,
            version: 2,
          },
          versionCreatedByJohn('version-1', 1, { metadata: null }),
        ],
      }),
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Updated template v2');
    expect(html).toContain('Codex SOP Writer via MCP · authorized by John Example');
    expect(html.match(/via MCP/g)).toHaveLength(1);
    expect(html.indexOf('Codex SOP Writer via MCP')).toBeLessThan(html.indexOf('Created template v1'));
  });
});

describe('TemplateDetail stats', () => {
  const templateMappedFromAnApiRow = () =>
    mapApiTemplateToChecklistTemplate(
      {
        created_at: '2026-07-03T12:00:00.000Z',
        id: 'tpl-1',
        is_public: 0,
        items: JSON.stringify([
          { id: 's1', items: [{ id: 'i1', title: 'One' }, { id: 'i2', title: 'Two' }], title: 'First' },
          { id: 's2', items: [{ id: 'i3', title: 'Three' }], title: 'Second' },
        ]),
        slug: 'launch',
        title: 'Launch',
        updated_at: '2026-07-04T12:00:00.000Z',
        user_id: 'user-1',
        version: 3,
      },
      'launch',
    );
  const statLabels = (html: string) =>
    [...html.matchAll(/<p class="text-xs text-muted-foreground">([^<]+)<\/p>/g)].map(
      (match) => match[1],
    );

  it('shows only metrics the loaded template really has, never placeholder zeros', () => {
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), template: templateMappedFromAnApiRow() });

    const html = renderTemplateDetail();
    const labels = statLabels(html);

    expect(labels).toContain('Total Tasks');
    expect(labels).not.toContain('Views');
    expect(labels).not.toContain('Copies');
    expect(labels).not.toContain('Runs');
    expect(html).toMatch(/>3<\/p><p class="text-xs text-muted-foreground">Total Tasks</);
  });
});
