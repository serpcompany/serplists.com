import { describe, expect, it } from 'vitest';

import { getPublicTemplateSaveLabels } from '@/components/template/publicTemplateSaveLabels';

const signedInPersonal = {
  isAuthenticated: true,
  isBillingError: false,
  isBillingLoading: false,
  isProUser: true,
  isSaving: false,
  isTeamWorkspace: false,
  isWorkspaceLoading: false,
};

describe('getPublicTemplateSaveLabels', () => {
  it('shows the plain labels to a Pro user', () => {
    expect(getPublicTemplateSaveLabels(signedInPersonal)).toEqual({
      footer: 'Copy to Library',
      header: 'Save',
    });
  });

  it('says a Free Personal user will be asked to upgrade', () => {
    expect(getPublicTemplateSaveLabels({ ...signedInPersonal, isProUser: false })).toEqual({
      footer: 'Upgrade to copy template',
      header: 'Upgrade to save',
    });
  });

  it('says the plan is loading instead of guessing it', () => {
    expect(
      getPublicTemplateSaveLabels({ ...signedInPersonal, isBillingLoading: true, isProUser: false })
        .footer,
    ).toBe('Checking plan...');
  });

  it('never asks for an upgrade when the plan check failed, since no plan is known', () => {
    expect(
      getPublicTemplateSaveLabels({ ...signedInPersonal, isBillingError: true, isProUser: false }),
    ).toEqual({ footer: 'Copy to Library', header: 'Save' });
  });

  it('never asks an Organization, a signed-out visitor or an unconfirmed context to upgrade', () => {
    for (const params of [
      // Until a stored Organization is confirmed, the plan loaded is Personal's.
      { ...signedInPersonal, isProUser: false, isWorkspaceLoading: true },
      { ...signedInPersonal, isProUser: false, isTeamWorkspace: true },
      { ...signedInPersonal, isAuthenticated: false, isProUser: false },
    ]) {
      expect(getPublicTemplateSaveLabels(params)).toEqual({
        footer: 'Copy to Library',
        header: 'Save',
      });
    }
  });

  it('shows progress first, whatever the plan', () => {
    expect(
      getPublicTemplateSaveLabels({ ...signedInPersonal, isProUser: false, isSaving: true }),
    ).toEqual({ footer: 'Copying...', header: 'Saving...' });
  });
});
