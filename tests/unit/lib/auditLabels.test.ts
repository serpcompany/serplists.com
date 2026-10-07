import { describe, expect, it } from 'vitest';

import {
  ORGANIZATION_ACTIVITY_LABELS,
  RUN_HISTORY_LABELS,
  TEMPLATE_HISTORY_LABELS,
  formatAuditAction,
  getAuditActorName,
} from '@/lib/auditLabels';
import { AUDIT_ACTIONS, RUN_AUDIT_ACTIONS, TEMPLATE_AUDIT_ACTIONS } from '@/lib/schemas/auditActions';

const surfaces = [
  ['run Changelog', RUN_HISTORY_LABELS, RUN_AUDIT_ACTIONS],
  ['Template Changelog', TEMPLATE_HISTORY_LABELS, [...TEMPLATE_AUDIT_ACTIONS, 'template.versioned']],
  ['Organization activity', ORGANIZATION_ACTIVITY_LABELS, AUDIT_ACTIONS],
] as const;

describe('audit action labels', () => {
  it.each(surfaces)('the %s labels every action it can show', (_surface, labels, actions) => {
    for (const action of actions) {
      const label = formatAuditAction(labels, action);
      expect(label, action).not.toBe(action);
      expect(label, action).not.toContain('.');
      expect(label.trim(), action).not.toBe('');
    }
  });

  it('shows an unknown action as words, never as a dotted id', () => {
    expect(formatAuditAction(RUN_HISTORY_LABELS, 'checklist_run.share_expired')).toBe('Share expired');
    expect(formatAuditAction(RUN_HISTORY_LABELS, 'toString')).toBe('ToString');
  });
});

describe('getAuditActorName', () => {
  const nobody = { userId: null, name: null, username: null, email: null };

  it('names a guest who edited a run through its share link', () => {
    expect(getAuditActorName(nobody, { source: 'public_share' })).toBe('Guest via shared link');
  });

  it('names a signed-in user who edited through the share link', () => {
    expect(getAuditActorName({ userId: 'user-1', name: 'Jane' }, { source: 'public_share' })).toBe('Jane');
  });

  it('keeps "Unknown user" for an actor that no longer exists', () => {
    expect(getAuditActorName(nobody, undefined)).toBe('Unknown user');
    expect(getAuditActorName(undefined, {})).toBe('Unknown user');
  });

  it('formats MCP updates with the Run Key and the authorizing user', () => {
    expect(
      getAuditActorName({ userId: 'user-1', email: 'jane@example.com' }, { source: 'mcp', personalRunKeyName: ' Codex ' }),
    ).toBe('Codex via MCP · authorized by jane@example.com');
  });

  it('uses the given fallback for an actor with no name', () => {
    expect(getAuditActorName({ userId: 'user-9' }, undefined, 'user-9')).toBe('user-9');
  });
});
