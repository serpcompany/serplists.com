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
  metadataOfItsAuditEvent?: unknown,
): TemplateHistoryVersion => ({
  action,
  actor: { name: 'Alice', userId: null, username: null, email: null },
  createdAt: at(minute),
  id,
  metadata: metadataOfItsAuditEvent,
  version: versionNumber,
});

const event = (
  id: string,
  action: string,
  minute: number,
  metadata?: unknown,
  actorName = 'Alice',
): TemplateHistoryEvent => ({
  action,
  actor: { name: actorName, userId: null, username: null, email: null },
  createdAt: at(minute),
  metadata,
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
          event('e5', 'template.restored', 5, undefined, 'Bob'),
          event('e4', 'template.deleted', 4),
          event('e3', 'template.updated', 3),
          event('e2', 'template.updated', 2, { visibility: 'public' }),
          event('e1', 'template.created', 1),
        ],
      ),
    );

    expect(timeline.map((entry) => entry.label)).toEqual([
      'Restored template',
      'Deleted template',
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
      history([], [event('e1', 'template.updated', 1, { visibility: 'private' })]),
    );

    expect(timeline.map((entry) => entry.label)).toEqual(['Made template private']);
  });

  it('keeps an update without a version that changed more than visibility as an update', () => {
    const timeline = buildTemplateHistoryTimeline(
      history([], [event('e1', 'template.updated', 1, { source: 'editor' })]),
    );

    expect(timeline.map((entry) => entry.label)).toEqual(['Updated template']);
  });

  it('labels the version that a visibility change wrote, as the API versions those too, by that change', () => {
    const timeline = buildTemplateHistoryTimeline(
      history(
        [version('v3', 3, 'template.updated', 3, { visibility: 'public' }), version('v2', 2, 'template.updated', 2)],
        [event('e3', 'template.updated', 3, { visibility: 'public' }), event('e2', 'template.updated', 2)],
      ),
    );

    expect(timeline.map((entry) => entry.label)).toEqual(['Made template public', 'Updated template v2']);
  });

  it("names the Run Key behind an Agent's change the way the run's Changelog does", () => {
    const agent = { source: 'mcp', personalRunKeyId: 'key-1', personalRunKeyName: 'Codex SOP Writer' };
    const timeline = buildTemplateHistoryTimeline(
      history(
        [
          version('v2', 2, 'template.updated', 2, agent),
          version('v1', 1, 'template.created', 1, agent),
        ],
        [
          event('e3', 'template.deleted', 3),
          event('e2', 'template.updated', 2, agent),
          event('e1', 'template.created', 1, agent),
        ],
      ),
    );

    expect(timeline.map(({ label, actorName }) => [label, actorName])).toEqual([
      ['Deleted template', 'Alice'],
      ['Updated template v2', 'Codex SOP Writer via MCP · authorized by Alice'],
      ['Created template v1', 'Codex SOP Writer via MCP · authorized by Alice'],
    ]);
  });

  it("names an Agent's change that recorded no version by its Run Key too", () => {
    const timeline = buildTemplateHistoryTimeline(
      history([], [event('e1', 'template.updated', 1, { source: 'mcp', personalRunKeyName: 'Codex' }, 'Bob')]),
    );

    expect(timeline[0]?.actorName).toBe('Codex via MCP · authorized by Bob');
  });

  it('keeps an event that only shares its time with a version of another action', () => {
    const timeline = buildTemplateHistoryTimeline(
      history([version('v1', 1, 'template.created', 1)], [event('e1', 'template.deleted', 1)]),
    );

    expect(timeline).toHaveLength(2);
  });

  it('shows at most the display limit, from the newest', () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event(`e${index}`, 'template.updated', index, { visibility: index % 2 === 0 ? 'public' : 'private' }),
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

  it('is empty for no history, tolerates unreadable metadata, and reads an action it has no label for as words, never a dotted id', () => {
    expect(buildTemplateHistoryTimeline(null)).toEqual([]);
    expect(
      buildTemplateHistoryTimeline(
        history([], [event('e1', 'template.updated', 1, 'not json'), event('e2', 'template.custom', 2)]),
      ).map((entry) => entry.label),
    ).toEqual(['Custom', 'Updated template']);
  });
});

describe('getTemplateHistoryQueryKey', () => {
  it('sits under the templates key, so every template change refreshes the Changelog', () => {
    expect(getTemplateHistoryQueryKey('tpl-1', 'user-1', undefined).slice(0, 1)).toEqual([
      'templates',
    ]);
  });
});
