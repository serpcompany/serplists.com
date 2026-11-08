import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplateEditorAccessNotices } from '@/components/template-editor/TemplateEditorAccessNotices';
import { resolveTemplateSaveFailureNotice } from '@/features/template-editor/templateEditorAccess';

import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

const personalWithBilling = { isOrganization: false, billingEnabled: true };

async function renderTheNotice(
  failure: Parameters<typeof resolveTemplateSaveFailureNotice>[0],
  isStartingCheckout = false,
  context = personalWithBilling,
) {
  const handlers = { onUpgrade: vi.fn(), onSignIn: vi.fn() };
  await renderSettled(
    <TemplateEditorAccessNotices
      draft={null}
      isStartingCheckout={isStartingCheckout}
      notice={resolveTemplateSaveFailureNotice(failure, context)}
      onDiscardDraft={vi.fn()}
      onRestoreDraft={vi.fn()}
      {...handlers}
    />,
  );
  return handlers;
}

describe('the notice when the template editor cannot save', () => {
  it('offers Upgrade to Pro when the template limit stops a save', async () => {
    const handlers = await renderTheNotice({ kind: 'upgrade_required', message: 'Template limit reached.' });

    expect(screen.getByText('Upgrade to Pro to save this template')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    });

    expect(handlers.onUpgrade).toHaveBeenCalledTimes(1);
    expect(handlers.onSignIn).not.toHaveBeenCalled();
  });

  it('disables the button and says checkout is opening while it opens', async () => {
    await renderTheNotice({ kind: 'upgrade_required', message: 'Template limit reached.' }, true);

    expect(screen.getByRole('button', { name: 'Opening checkout...' })).toHaveProperty('disabled', true);
  });

  it('offers Sign in when the session ended', async () => {
    const handlers = await renderTheNotice({ kind: 'auth_required', message: 'Signed out' });

    expect(screen.getByText('Sign in to save this template.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    expect(handlers.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('offers no button when an Organization reaches its plan limit, which only its owners can change', async () => {
    await renderTheNotice({ kind: 'upgrade_required', message: 'Template limit reached.' }, false, {
      isOrganization: true,
      billingEnabled: true,
    });

    expect(screen.getByText('Organization plan limit')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
