import type { TemplateHistoryEvent } from '@/lib/api';

// How the run page's history lists each change: the action, when, and who made it.
const runHistoryActionLabels: Record<string, string> = {
  'checklist_run.created': 'Created run',
  'checklist_run.updated': 'Updated run',
  'checklist_run.deleted': 'Archived run',
};

export const formatRunHistoryAction = (action: string): string =>
  runHistoryActionLabels[action] ?? action;

export const formatRunHistoryTime = (value?: string): string => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getRunHistoryActorName = (entry: TemplateHistoryEvent): string => {
  const humanName = entry.actor?.name || entry.actor?.username || entry.actor?.email || 'Unknown user';
  const metadata = entry.metadata;

  if (
    isRecord(metadata)
    && metadata.source === 'mcp'
    && typeof metadata.personalRunKeyName === 'string'
    && metadata.personalRunKeyName.trim()
  ) {
    return `${metadata.personalRunKeyName.trim()} via MCP · authorized by ${humanName}`;
  }

  return humanName;
};
