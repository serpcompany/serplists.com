import { describe, expect, it } from 'vitest';

import {
  getRunStartedMessage,
  getTemplateDuplicatedMessage,
  nameOtherTemplateDestination,
  resolveTemplateDestinationTeamId,
} from '@/lib/templateDestination';

// A private template of Organization B opened while Organization A or Personal is active gets
// its Runs and copies in B. The success toast names B, or the user would look for the Run or
// copy in the active context's lists and not find it.

const teams = [
  { id: 'team-a', name: 'Acme Agency' },
  { id: 'team-b', name: 'Beta Studio' },
];
const privateTeamBTemplate = { isPublic: false, teamId: 'team-b' };

describe('template destination', () => {
  it('sends Runs and copies of a private Organization template to its own Organization', () => {
    expect(resolveTemplateDestinationTeamId(privateTeamBTemplate, 'team-a')).toBe('team-b');
    expect(resolveTemplateDestinationTeamId(privateTeamBTemplate, undefined)).toBe('team-b');
    expect(resolveTemplateDestinationTeamId({ isPublic: true, teamId: 'team-b' }, 'team-a')).toBe('team-a');
    expect(resolveTemplateDestinationTeamId({ isPublic: false }, undefined)).toBeUndefined();
  });

  it.each([
    ['Organization A', 'team-a'],
    ['Personal', undefined],
  ])('names the other Organization while %s is active', (_label, activeTeamId) => {
    const organization = nameOtherTemplateDestination(privateTeamBTemplate, activeTeamId, teams);

    expect(organization).toBe('Beta Studio');
    expect(getRunStartedMessage(organization)).toBe('Run started in Beta Studio');
    expect(getTemplateDuplicatedMessage(organization)).toBe('Template duplicated in Beta Studio');
  });

  it('keeps the plain messages when the Run or copy goes to the active context', () => {
    const cases = [
      nameOtherTemplateDestination(privateTeamBTemplate, 'team-b', teams),
      nameOtherTemplateDestination({ isPublic: true, teamId: 'team-b' }, 'team-a', teams),
      nameOtherTemplateDestination({ isPublic: false }, undefined, teams),
    ];

    expect(cases).toEqual([undefined, undefined, undefined]);
    expect(getRunStartedMessage(undefined)).toBe('Checklist run created');
    expect(getTemplateDuplicatedMessage(undefined)).toBe('Template duplicated');
  });

  it("falls back to the template's Organization when the teams list does not name it", () => {
    expect(nameOtherTemplateDestination(privateTeamBTemplate, 'team-a', [])).toBe("the template's Organization");
    expect(nameOtherTemplateDestination(privateTeamBTemplate, 'team-a', undefined)).toBe("the template's Organization");
  });
});
