import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { followTemplateActionResult } from '@/features/template-detail/templateActionOutcome';
import type { TemplateDetailActionResult } from '@/features/template-detail/useTemplateDetailModel';
import type { PageVisit } from '@/lib/navigation/pageVisit';

const visit = (current: boolean): PageVisit => ({ isCurrent: () => current });

const handlers = () => ({
  loginRequired: vi.fn(),
  upgradeRequired: vi.fn(),
  succeeded: vi.fn(),
});

beforeEach(() => {
  toastMocks.error.mockClear();
  toastMocks.success.mockClear();
});

// Start Run, Copy/Save and Share on the template pages await a request and then move
// the user: to the new run or template, to sign-in, or to checkout. A user who left
// the page meanwhile was pulled back to that destination.
describe('followTemplateActionResult', () => {
  it.each<[string, TemplateDetailActionResult]>([
    ['a created run', { kind: 'ok', runId: 'run-1' }],
    ['a copied template', { kind: 'ok', templateId: 'template-9' }],
    ['a sign-in redirect', { kind: 'login_required' }],
    ['a checkout redirect', { kind: 'upgrade_required' }],
  ])('does not follow %s once the user has left the page', async (_label, result) => {
    const spies = handlers();

    await followTemplateActionResult(result, visit(false), spies);

    expect(spies.succeeded).not.toHaveBeenCalled();
    expect(spies.loginRequired).not.toHaveBeenCalled();
    expect(spies.upgradeRequired).not.toHaveBeenCalled();
  });

  it('still reports a failure after the user left', async () => {
    const spies = handlers();

    await followTemplateActionResult({ kind: 'error', message: 'Run limit reached' }, visit(false), spies);

    expect(toastMocks.error).toHaveBeenCalledWith('Run limit reached');
  });

  it('follows each outcome while the user is still on the page', async () => {
    const spies = handlers();

    await followTemplateActionResult({ kind: 'ok', runId: 'run-1' }, visit(true), spies);
    await followTemplateActionResult({ kind: 'login_required' }, visit(true), spies);
    await followTemplateActionResult({ kind: 'upgrade_required' }, visit(true), spies);
    await followTemplateActionResult({ kind: 'error', message: 'Nope' }, visit(true), spies);

    expect(spies.succeeded).toHaveBeenCalledWith({ kind: 'ok', runId: 'run-1' });
    expect(spies.loginRequired).toHaveBeenCalledTimes(1);
    expect(spies.upgradeRequired).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith('Nope');
  });

  it('waits for the upgrade flow to finish', async () => {
    let finished = false;
    const spies = {
      ...handlers(),
      upgradeRequired: vi.fn(async () => {
        await Promise.resolve();
        finished = true;
      }),
    };

    await followTemplateActionResult({ kind: 'upgrade_required' }, visit(true), spies);

    expect(finished).toBe(true);
  });
});
