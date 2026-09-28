import { describe, expect, it } from 'vitest';

import { getPublicTemplateSaveLabels } from '@/components/template/publicTemplateSaveLabels';

const signedInPersonal = {
  isAuthenticated: true,
  isBillingLoading: false,
  isProUser: true,
  isSaving: false,
  isTeamWorkspace: false,
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

  it('never asks an Organization or a signed-out visitor to upgrade', () => {
    for (const params of [
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
