import { describe, expect, it } from 'vitest';
import { sanitizeLogPath } from '../../../../functions/api/utils/log-path';

const TOKEN = 'SECRET-tok_123';

describe('sanitizeLogPath', () => {
  it.each([
    [`auth/reset-password/${TOKEN}`, 'auth/reset-password/:token'],
    [`auth/reset-password/${TOKEN}/`, 'auth/reset-password/:token'],
    [`auth/reset-password//${TOKEN}`, 'auth/reset-password/:token'],
    [`auth/reset-password/${TOKEN}/extra`, 'auth/reset-password/:token'],
    [`checklists/shared/${TOKEN}`, 'checklists/shared/:token'],
    [`checklists/shared/${TOKEN}/anything/${TOKEN}`, 'checklists/shared/:token'],
    [`checklists//shared/${TOKEN}`, 'checklists/shared/:token'],
    [`checklists/shared/${encodeURIComponent(`${TOKEN}/?#`)}`, 'checklists/shared/:token'],
    [`Checklists/Shared/${TOKEN}`, 'Checklists/Shared/:token'],
    [`/checklists/shared/${TOKEN}`, 'checklists/shared/:token'],
    [`teams/invites/${TOKEN}/accept`, 'teams/invites/:token/accept'],
    [`teams/invites/${TOKEN}/accept/`, 'teams/invites/:token/accept'],
    [`teams/invites/${TOKEN}`, 'teams/invites/:token'],
  ])('redacts %s', (input, expected) => {
    const output = sanitizeLogPath(input);
    expect(output).toBe(expected);
    expect(output).not.toContain(TOKEN);
  });

  it.each([
    'auth/reset-password',
    'auth/reset-password/',
    'auth/get-session',
    'checklists/shared',
    'checklists/run-123',
    'teams/invites/pending',
    'teams/invites/pending/invite-123/accept',
    'teams/team-1/invites/invite-123',
    'templates/abc',
    'health',
    '',
  ])('leaves %s unchanged', (input) => {
    expect(sanitizeLogPath(input)).toBe(input);
  });

  it('returns an empty string for a non-string value', () => {
    expect(sanitizeLogPath(undefined as unknown as string)).toBe('');
  });
});
