import { z } from 'zod';

import type {
  TemplateHistoryEvent,
  TemplateHistoryResponse,
  TemplateHistoryVersion,
} from '@/lib/api';
import { formatAuditAction, getAuditActorName, TEMPLATE_HISTORY_LABELS } from '@/lib/auditLabels';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/schemas/historyLimits';
import { queryKeys } from '@/lib/queryCache';
import { parseDbTimestamp } from '@/lib/utils/dbTimestamp';

const TEMPLATE_HISTORY_DISPLAY_LIMIT = HISTORY_DISPLAY_LIMIT;

export type TemplateHistoryTimelineEntry = {
  actorName: string;
  createdAt: string;
  key: string;
  label: string;
};

export const getTemplateHistoryQueryKey = (
  templateId: string | undefined,
  userId: string | undefined,
  teamId: string | undefined,
) => queryKeys.templateHistoryFor(templateId ?? 'none', userId, teamId);

const visibilityChangeSchema = z.object({ visibility: z.enum(['public', 'private']) }).passthrough();

const getVisibilityLabel = (entry: TemplateHistoryVersion | TemplateHistoryEvent): string | null => {
  if (entry.action !== 'template.updated') return null;
  const change = visibilityChangeSchema.safeParse(entry.metadata);
  if (!change.success) return null;
  return change.data.visibility === 'public' ? 'Made template public' : 'Made template private';
};

const getActorName = (entry: TemplateHistoryVersion | TemplateHistoryEvent): string =>
  getAuditActorName(entry.actor, entry.metadata);

const getVersionLabel = (version: TemplateHistoryVersion): string =>
  getVisibilityLabel(version) ?? `${formatAuditAction(TEMPLATE_HISTORY_LABELS, version.action)} v${version.version}`;

const getEventLabel = (event: TemplateHistoryEvent): string =>
  getVisibilityLabel(event) ?? formatAuditAction(TEMPLATE_HISTORY_LABELS, event.action);

const getWriteKey = (entry: { action: string; createdAt: string }): string =>
  `${entry.action}|${entry.createdAt}`;

const getTime = (value: string): number => parseDbTimestamp(value)?.getTime() ?? 0;

type RankedEntry = TemplateHistoryTimelineEntry & { rank: number; time: number };

export const buildTemplateHistoryTimeline = (
  history: TemplateHistoryResponse | null | undefined,
  limit: number = TEMPLATE_HISTORY_DISPLAY_LIMIT,
): TemplateHistoryTimelineEntry[] => {
  if (!history) {
    return [];
  }

  const versionedWriteKeys = new Set(history.versions.map(getWriteKey));
  const entries: RankedEntry[] = [
    ...history.versions.map((version) => ({
      actorName: getActorName(version),
      createdAt: version.createdAt,
      key: `version-${version.id}`,
      label: getVersionLabel(version),
      rank: 0,
      time: getTime(version.createdAt),
    })),
    ...history.events
      .filter((event) => !versionedWriteKeys.has(getWriteKey(event)))
      .map((event) => ({
        actorName: getActorName(event),
        createdAt: event.createdAt,
        key: `event-${event.id}`,
        label: getEventLabel(event),
        rank: 1,
        time: getTime(event.createdAt),
      })),
  ];

  return entries
    .sort(
      (left, right) =>
        right.time - left.time ||
        left.rank - right.rank ||
        left.key.localeCompare(right.key),
    )
    .slice(0, limit)
    .map(({ rank: _rank, time: _time, ...entry }) => entry);
};
