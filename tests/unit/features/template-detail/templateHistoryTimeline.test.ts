import { describe, expect, it } from 'vitest';

import {
  buildTemplateHistoryTimeline,
  getTemplateHistoryQueryKey,
} from '@/features/template-detail/templateHistoryTimeline';
import type {
  TemplateHistoryEvent,
  TemplateHistoryResponse,
  TemplateHistoryVersion,
} from '@/lib/api';

const at = (minute: number) => `2026-07-03T12:${String(minute).padStart(2, '0')}:00.000Z`;

const version = (
  id: string,
  versionNumber: number,
  action: string,
  minute: number,
): TemplateHistoryVersion => ({
  action,
  actor: { name: 'Alice' },
  createdAt: at(minute),
  id,
  version: versionNumber,
});

const event = (
  id: string,
  action: string,
  minute: number,
  diff?: unknown,
  actorName = 'Alice',
): TemplateHistoryEvent => ({
  action,
  actor: { name: actorName },
  createdAt: at(minute),
  diff,
  id,
});

const history = (
  versions: TemplateHistoryVersion[],
  events: TemplateHistoryEvent[],
): TemplateHistoryResponse => ({
  events,
  subject: { id: 'user-1', type: 'user' },
  templateId: 'tpl-1',
  versions,
});

describe('buildTemplateHistoryTimeline', () => {
  it('shows archive, restore and visibility changes between versions, newest first', () => {
    const timeline = buildTemplateHistoryTimeline(
      history(
        [version('v2', 2, 'template.updated', 3), version('v1', 1, 'template.created', 1)],
        [
          event('e5', 'template.restored', 5, { deleted_at: null, is_public: false }, 'Bob'),
          event('e4', 'template.deleted', 4, { deleted_at: at(4), is_public: false }),
          event('e3', 'template.updated', 3, { title: 'Renamed' }),
          event('e2', 'template.updated', 2, { is_public: true }),
          event('e1', 'template.created', 1, { title: 'Launch' }),
        ],
      ),
    );

    expect(timeline.map((entry) => entry.label)).toEqual([
      'Restored template',
      'Archived template',
      'Updated template v2',
      'Made template public',
      'Created template v1',
    ]);
    expect(timeline[0]?.actorName).toBe('Bob');
    expect(timeline.map((entry) => entry.key)).toEqual([
      'event-e5',
      'event-e4',
      'version-v2',
      'event-e2',
      'version-v1',
    ]);
  });

  it('labels a switch to private', () => {
    const timeline = buildTemplateHistoryTimeline(
      history([], [event('e1', 'template.updated', 1, { is_public: false })]),
    );

    expect(timeline.map((entry) => entry.label)).toEqual(['Made template private']);
  });

  it('keeps an update without a version that changed more than visibility as an update', () => {
    const timeline = buildTemplateHistoryTimeline(
      history([], [event('e1', 'template.updated', 1, { is_public: true, title: 'New' })]),
    );

    expect(timeline.map((entry) => entry.label)).toEqual(['Updated template']);
  });

  it('keeps an event that only shares its time with a version of another action', () => {
    const timeline = buildTemplateHistoryTimeline(
      history([version('v1', 1, 'template.created', 1)], [event('e1', 'template.deleted', 1)]),
    );

    expect(timeline).toHaveLength(2);
  });

  it('shows at most the display limit, from the newest', () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event(`e${index}`, 'template.updated', index, { is_public: index % 2 === 0 }),
    );

    const timeline = buildTemplateHistoryTimeline(history([], events));

    expect(timeline).toHaveLength(8);
    expect(timeline[0]?.key).toBe('event-e11');
    expect(timeline[7]?.key).toBe('event-e4');
  });

  it('still shows events for a template that has no versions', () => {
    const timeline = buildTemplateHistoryTimeline(
      history([], [event('e1', 'template.created', 1), event('e2', 'template.imported', 2)]),
    );

    expect(timeline.map((entry) => entry.label)).toEqual(['Imported template', 'Created template']);
  });

  it('is empty for no history and tolerates unreadable diffs', () => {
    expect(buildTemplateHistoryTimeline(null)).toEqual([]);
    expect(
      buildTemplateHistoryTimeline(
        history([], [event('e1', 'template.updated', 1, 'not json'), event('e2', 'template.custom', 2)]),
      ).map((entry) => entry.label),
    ).toEqual(['template.custom', 'Updated template']);
  });
});

describe('getTemplateHistoryQueryKey', () => {
  it('sits under the templates key, so every template change refreshes the Changelog', () => {
    expect(getTemplateHistoryQueryKey('tpl-1', 'user-1', undefined).slice(0, 1)).toEqual([
      'templates',
    ]);
  });
});
