import { describe, expect, it, vi } from 'vitest';

import { BILLING_UNAVAILABLE_MESSAGE, createApiError } from '@/lib/api-errors';
import { buildDefaultRunName } from '@/lib/runs/runName';

import {
  createDashboardTemplateRun,
  finishDashboardTemplateRun,
  reportDashboardTemplateRunFailure,
} from '@/features/dashboard-templates/useDashboardTemplatesModel';

describe('createDashboardTemplateRun', () => {
  it('creates a run from the requested template and returns its run id', async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-9' });

    const result = await createDashboardTemplateRun(
      {
        runName: 'Audit sprint',
        templateId: 'template-1',
        templateTitle: 'Content Audit',
      },
      { createRun },
    );

    expect(createRun).toHaveBeenCalledWith({
      templateId: 'template-1',
      runName: 'Audit sprint',
    });
    expect(result).toEqual({
      kind: 'ok',
      runId: 'run-9',
    });
  });

  it("returns the Organization that owns the new run, so the page can open it there", async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-9', teamId: 'team-1' });

    const result = await createDashboardTemplateRun(
      { templateId: 'template-1', templateTitle: 'Content Audit' },
      { createRun },
    );

    expect(result).toStrictEqual({ kind: 'ok', runId: 'run-9', teamId: 'team-1' });
  });

  it('names a run left blank after the template and start time, as the dialog shows', async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-10' });
    const now = new Date('2026-09-28T10:15:00.000Z');

    for (const runName of [undefined, '', '   ']) {
      createRun.mockClear();
      await createDashboardTemplateRun(
        { now, runName, templateId: 'template-1', templateTitle: 'Moving Checklist' },
        { createRun },
      );

      expect(createRun).toHaveBeenCalledWith({
        templateId: 'template-1',
        runName: buildDefaultRunName('Moving Checklist', now),
      });
    }
    expect(buildDefaultRunName('Moving Checklist', now)).toMatch(/^Moving Checklist - /);
  });

  it('trims a typed run name', async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-11' });

    await createDashboardTemplateRun(
      { runName: '  Spring move  ', templateId: 'template-1', templateTitle: 'Moving Checklist' },
      { createRun },
    );

    expect(createRun).toHaveBeenCalledWith({ templateId: 'template-1', runName: 'Spring move' });
  });

  it('returns an error when the run mutation resolves without an id', async () => {
    const createRun = vi.fn().mockResolvedValue(null);

    const result = await createDashboardTemplateRun(
      {
        templateId: 'template-1',
        templateTitle: 'Content Audit',
      },
      { createRun },
    );

    expect(result).toEqual({
      kind: 'error',
      message: 'Failed to create checklist run.',
    });
  });

  it('normalizes thrown mutation errors into a user-facing error result', async () => {
    const createRun = vi.fn().mockRejectedValue(new Error('Mutation failed'));

    const result = await createDashboardTemplateRun(
      {
        templateId: 'template-1',
        templateTitle: 'Content Audit',
      },
      { createRun },
    );

    expect(result).toEqual({
      kind: 'error',
      message: 'Mutation failed',
    });
  });
});

describe('finishDashboardTemplateRun', () => {
  const run = { kind: 'ok' as const, runId: 'run-9' };

  it('opens the new run while the user is still on the page', () => {
    const closeLauncher = vi.fn();
    const navigate = vi.fn();

    finishDashboardTemplateRun(run, { isCurrent: () => true }, { closeLauncher, navigate });

    expect(closeLauncher).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/dashboard/runs/run-9/');
  });

  it("opens an Organization's new run in that Organization", () => {
    const navigate = vi.fn();

    finishDashboardTemplateRun({ ...run, teamId: 'team-1' }, { isCurrent: () => true }, { closeLauncher: vi.fn(), navigate });

    expect(navigate).toHaveBeenCalledWith('/dashboard/organization/team-1/runs/run-9/');
  });

  it('does not pull a user who left the page, with Back for example, to the new run, and still closes the launcher since the run exists', () => {
    const closeLauncher = vi.fn();
    const navigate = vi.fn();

    finishDashboardTemplateRun(run, { isCurrent: () => false }, { closeLauncher, navigate });

    expect(navigate).not.toHaveBeenCalled();
    expect(closeLauncher).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a failed run', () => {
    const closeLauncher = vi.fn();
    const navigate = vi.fn();

    finishDashboardTemplateRun(
      { kind: 'error', message: 'Failed' },
      { isCurrent: () => true },
      { closeLauncher, navigate },
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(closeLauncher).not.toHaveBeenCalled();
  });
});

describe('createDashboardTemplateRun access failures', () => {
  const runLimitMessage =
    'Active run limit reached. Upgrade to Pro to create more checklist runs.';

  const runWithFailure = (error: unknown) =>
    createDashboardTemplateRun(
      { templateId: 'template-1', templateTitle: 'Content Audit' },
      { createRun: vi.fn().mockRejectedValue(error) },
    );

  it('returns upgrade_required when the run limit is reached', async () => {
    const result = await runWithFailure(
      createApiError(403, { error: runLimitMessage, code: 'limit_reached' }),
    );

    expect(result).toEqual({ kind: 'upgrade_required', message: runLimitMessage });
  });

  it('returns upgrade_required when the context needs a paid plan', async () => {
    const result = await runWithFailure(
      createApiError(403, { error: 'Upgrade required', code: 'upgrade_required' }),
    );

    expect(result).toEqual({ kind: 'upgrade_required', message: 'Upgrade required' });
  });

  it('returns login_required when the session has expired', async () => {
    const result = await runWithFailure(createApiError(401, { error: 'Unauthorized' }));

    expect(result).toEqual({ kind: 'login_required' });
  });

  it('keeps a plain 403 without a code as an error, not an upgrade', async () => {
    const result = await runWithFailure(createApiError(403, { error: 'Forbidden' }));

    expect(result).toEqual({ kind: 'error', message: 'Forbidden' });
  });

  it('reports billing_unavailable with the billing message', async () => {
    const result = await runWithFailure(
      createApiError(503, { error: 'Billing down', code: 'billing_unavailable' }),
    );

    expect(result).toEqual({ kind: 'error', message: BILLING_UNAVAILABLE_MESSAGE });
  });
});

describe('reportDashboardTemplateRunFailure', () => {
  const current = { isCurrent: () => true };
  const left = { isCurrent: () => false };
  const buildActions = (upgradeResult = true) => ({
    navigateToLogin: vi.fn(),
    showError: vi.fn(),
    upgrade: vi.fn().mockResolvedValue(upgradeResult),
  });

  it('starts the upgrade flow instead of showing the limit message', async () => {
    const actions = buildActions(true);

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'upgrade_required', message: 'Active run limit reached.' },
      current,
      actions,
    );

    expect(actions.upgrade).toHaveBeenCalledTimes(1);
    expect(actions.showError).not.toHaveBeenCalled();
    expect(actions.navigateToLogin).not.toHaveBeenCalled();
    expect(redirecting).toBe(true);
  });

  it('reports when the upgrade flow did not redirect', async () => {
    const actions = buildActions(false);

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'upgrade_required', message: 'Active run limit reached.' },
      current,
      actions,
    );

    expect(redirecting).toBe(false);
  });

  it('sends an expired session to login', async () => {
    const actions = buildActions();

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'login_required' },
      current,
      actions,
    );

    expect(actions.navigateToLogin).toHaveBeenCalledTimes(1);
    expect(actions.showError).not.toHaveBeenCalled();
    expect(actions.upgrade).not.toHaveBeenCalled();
    expect(redirecting).toBe(false);
  });

  it('shows other errors exactly once', async () => {
    const actions = buildActions();

    await reportDashboardTemplateRunFailure(
      { kind: 'error', message: 'Failed to create checklist run.' },
      current,
      actions,
    );

    expect(actions.showError).toHaveBeenCalledTimes(1);
    expect(actions.showError).toHaveBeenCalledWith('Failed to create checklist run.');
    expect(actions.upgrade).not.toHaveBeenCalled();
  });

  it('does not start checkout once the user has left My Templates, so it never pulls them from the page they moved to', async () => {
    const actions = buildActions(true);

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'upgrade_required', message: 'Active run limit reached.' },
      left,
      actions,
    );

    expect(actions.upgrade).not.toHaveBeenCalled();
    expect(actions.navigateToLogin).not.toHaveBeenCalled();
    expect(redirecting).toBe(false);
  });

  it('does not go to sign-in once the user has left the page', async () => {
    const actions = buildActions();

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'login_required' },
      left,
      actions,
    );

    expect(actions.navigateToLogin).not.toHaveBeenCalled();
    expect(actions.upgrade).not.toHaveBeenCalled();
    expect(redirecting).toBe(false);
  });

  it('still reports a plain error after the user has left the page', async () => {
    const actions = buildActions();

    await reportDashboardTemplateRunFailure(
      { kind: 'error', message: 'Failed to create checklist run.' },
      left,
      actions,
    );

    expect(actions.showError).toHaveBeenCalledWith('Failed to create checklist run.');
  });
});
