import { describe, expect, it } from 'vitest';
import { canUseTemplateAsRunSource } from '@functions/api/utils/template-access';

// Which template content may be copied into a run: at creation, sharing, and revalidation.

const personal = (overrides: Record<string, unknown> = {}) => ({
  owner_type: 'user',
  team_id: null,
  user_id: 'owner',
  is_public: false,
  deleted_at: null,
  ...overrides,
});
const organization = (overrides: Record<string, unknown> = {}) => personal({
  owner_type: 'team',
  team_id: 'org-1',
  ...overrides,
});

describe('canUseTemplateAsRunSource', () => {
  it.each([
    ['public Personal template, another user', personal({ is_public: true }), 'caller', null, true],
    ['public template stored as 1', personal({ is_public: 1 }), 'caller', 'org-9', true],
    ['own private Personal template, Personal run', personal({ user_id: 'caller' }), 'caller', null, true],
    ['own private Personal template, Organization run', personal({ user_id: 'caller' }), 'caller', 'org-1', true],
    ['another user\'s private Personal template', personal(), 'caller', null, false],
    ['another member\'s private Personal template, Organization run', personal(), 'caller', 'org-1', false],
    ['private Organization template, same Organization run', organization(), 'caller', 'org-1', true],
    ['private Organization template, Personal run', organization(), 'caller', null, false],
    ['private Organization template, another Organization run', organization(), 'caller', 'org-2', false],
    ['Organization template without an Organization falls back to its owner', organization({ team_id: null, user_id: 'caller' }), 'caller', null, true],
    ['archived public template', personal({ is_public: true, deleted_at: '2026-01-01T00:00:00.000Z' }), 'caller', null, false],
    ['private Personal template, anonymous caller', personal({ user_id: 'owner' }), null, null, false],
  ])('%s', (_label, template, userId, runTeamId, expected) => {
    expect(canUseTemplateAsRunSource(template, { userId, runTeamId })).toBe(expected);
  });
});
