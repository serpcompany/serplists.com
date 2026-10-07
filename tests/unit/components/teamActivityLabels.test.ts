import { describe, expect, it } from 'vitest';

import { formatTeamActivityAction } from '@/components/account/teamActivityLabels';
import { AUDIT_ACTIONS } from '@/lib/schemas/auditActions';

describe('formatTeamActivityAction', () => {
  it('labels self-service membership changes', () => {
    expect(formatTeamActivityAction('team_invite.declined')).toBe('Invite declined');
    expect(formatTeamActivityAction('team_member.left')).toBe('Member left');
  });

  it('labels a revalidated Organization Run instead of showing its raw id', () => {
    expect(formatTeamActivityAction('checklist_run.revalidated')).toBe('Run revalidated');
  });

  it('has a readable label for every audit action the API writes', () => {
    for (const action of AUDIT_ACTIONS) {
      const label = formatTeamActivityAction(action);
      expect(label, action).not.toBe(action);
      expect(label, action).not.toMatch(/[._]/);
      expect(label, action).not.toMatch(/\b(team|Team|workspace|Workspace)\b/);
    }
  });

  it('turns an action it does not know into readable text, so rows written by older or newer deploys never show a dotted id', () => {
    expect(formatTeamActivityAction('foo_bar.baz_qux')).toBe('Foo bar baz qux');
    expect(formatTeamActivityAction('checklist_run.archived_forever')).toBe('Run archived forever');
    expect(formatTeamActivityAction('team.renamed')).toBe('Organization renamed');
    expect(formatTeamActivityAction('team_invite.resent')).toBe('Invite resent');
    expect(formatTeamActivityAction('')).toBe('Activity');
  });
});
