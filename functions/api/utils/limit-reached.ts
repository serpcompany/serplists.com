import { jsonError } from './response';

// The 403 every Free-plan limit returns. Personal and Organization plans are evaluated
// separately: a Personal Pro plan never lifts an Organization's limit, and Organization plans
// are not sold at checkout. So the message and `details.context` follow the context whose
// limit was hit, and only a Personal limit tells the user to upgrade to Pro. Clients branch on
// `details.context`, never on the message text.

export type LimitContext = 'personal' | 'organization';
export type LimitResource = 'active_runs' | 'templates';

const LIMIT_TEXT: Record<LimitResource, { label: string; items: string }> = {
  active_runs: { label: 'Active run', items: 'checklist runs' },
  templates: { label: 'Template', items: 'templates' },
};

export function limitReachedResponse(params: {
  resource: LimitResource;
  /** The Organization whose limit was checked, or null for a Personal limit. */
  teamId: string | null;
  /** Completes "... to <action> more <items>." */
  action: 'create' | 'restore' | 'reopen' | 'save';
  limit: number;
  current: number;
}): Response {
  const context: LimitContext = params.teamId ? 'organization' : 'personal';
  const { label, items } = LIMIT_TEXT[params.resource];
  const remedy = context === 'organization' ? 'This Organization needs a paid plan' : 'Upgrade to Pro';

  return jsonError(`${label} limit reached. ${remedy} to ${params.action} more ${items}.`, 403, {
    code: 'limit_reached',
    details: { limit: params.limit, current: params.current, resource: params.resource, context },
  });
}

/**
 * The 403 for a Personal action that needs Pro whatever the counts (not a Free-plan limit).
 * Only Personal actions use it: an Organization's plan is never lifted by Personal Pro.
 */
export function personalProRequiredResponse(action: string): Response {
  return jsonError(`Upgrade to Pro to ${action}.`, 403, { code: 'upgrade_required' });
}
