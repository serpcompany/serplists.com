import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  baseModel,
  contextCreateTemplate,
  contextUpdateTemplate,
  mockUseTemplateDetailModel,
  moreMenuItemProps,
  renderTemplateDetail,
  resetTemplateDetailPageMocks,
  userStillOnThePage,
  visibilitySwitchProps,
} from '../../support/templateDetailPage';
import { templatePayloadSchema } from '../../../functions/api/utils/payloads';
import { toast } from 'sonner';
import { handleUpgradeRequiredForContext, navigateToLoginWithReturnPath } from '@/lib/access-flow';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

beforeEach(resetTemplateDetailPageMocks);

describe('TemplateDetail Duplicate', () => {
  const duplicateWithTitle = async (title: string) => {
    contextCreateTemplate.mockResolvedValue({ id: 'tpl-2' });
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), title },
    });

    renderTemplateDetail();
    const duplicate = moreMenuItemProps.find((props) =>
      [props.children].flat(Infinity).includes('Duplicate'),
    );
    await (duplicate?.onClick as () => Promise<void>)();

    return contextCreateTemplate.mock.calls.at(-1)?.[0] as { title: string };
  };

  it('keeps the copy of a title near the limit within what the API accepts', async () => {
    const payload = await duplicateWithTitle('a'.repeat(158));

    expect(payload.title.length).toBeLessThanOrEqual(160);
    expect(payload.title.endsWith(' Copy')).toBe(true);
    expect(templatePayloadSchema.safeParse({ title: payload.title }).success).toBe(true);
  });

  it('names a short title copy "<title> Copy"', async () => {
    const payload = await duplicateWithTitle('Launch');

    expect(payload.title).toBe('Launch Copy');
  });
});

const chooseExportJson = async () => {
  const exportItem = moreMenuItemProps.find((props) => [props.children].flat(Infinity).includes('Export JSON'));
  await (exportItem?.onClick as () => Promise<void>)();
};

describe('TemplateDetail export after a failed plan check', () => {
  it('offers Export JSON, not an upgrade, and checks the plan again on click', async () => {
    vi.mocked(handleUpgradeRequiredForContext).mockClear();
    const refetchBilling = vi.fn();
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: true, isLoading: false, isPro: false },
      refetchBilling,
    });

    const html = renderTemplateDetail();
    await chooseExportJson();

    expect(html).not.toContain('Upgrade to export');
    expect(refetchBilling).toHaveBeenCalledTimes(1);
    expect(handleUpgradeRequiredForContext).not.toHaveBeenCalled();
  });
});

describe('TemplateDetail export of a template the portable format cannot hold', () => {
  it('shows the reason instead of a success message', async () => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), title: 'Launch plan', sections: [] },
    });

    renderTemplateDetail();
    await chooseExportJson();

    expect(toast.error).toHaveBeenCalledWith(
      'No templates exported. Not exported: Launch plan (Template has no sections with tasks)',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('TemplateDetail visibility', () => {
  it('shows the visibility of the template the model holds', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), isPublic: false },
    });

    const html = renderTemplateDetail();

    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('>Public<');
  });

  it('changes visibility through the model, which keeps the template and its version in step', async () => {
    const setVisibility = vi.fn().mockResolvedValue({ kind: 'ok' });
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), setVisibility });

    renderTemplateDetail();
    const onCheckedChange = visibilitySwitchProps.at(-1)?.onCheckedChange as (value: boolean) => Promise<void>;
    await onCheckedChange(false);

    expect(setVisibility).toHaveBeenCalledWith(false);
    expect(contextUpdateTemplate).not.toHaveBeenCalled();
  });

  const flipTheSwitchThenAnswerThatTheSessionExpired = async (whileSaving: () => void) => {
    let answer: (result: { kind: 'login_required' }) => void = () => {};
    const setVisibility = vi.fn(
      () => new Promise((resolve) => { answer = resolve; }),
    );
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), setVisibility });

    renderTemplateDetail();
    const onCheckedChange = visibilitySwitchProps.at(-1)?.onCheckedChange as (value: boolean) => Promise<void>;
    const flipped = onCheckedChange(true);
    whileSaving();
    answer({ kind: 'login_required' });
    await flipped;
    expect(setVisibility).toHaveBeenCalledWith(true);
  };

  it('sends an expired session to sign-in while the user is still on the page', async () => {
    userStillOnThePage.current = true;

    await flipTheSwitchThenAnswerThatTheSessionExpired(() => {});

    expect(navigateToLoginWithReturnPath).toHaveBeenCalledTimes(1);
  });

  it('does not pull a user who has left the page back to sign-in when a late answer says the session expired', async () => {
    userStillOnThePage.current = true;

    await flipTheSwitchThenAnswerThatTheSessionExpired(() => {
      userStillOnThePage.current = false;
    });

    expect(navigateToLoginWithReturnPath).not.toHaveBeenCalled();
  });
});
