import { jsonError } from './response';

export type LimitContext = 'personal' | 'organization';
export type LimitResource = 'active_runs' | 'templates';

const LIMIT_TEXT: Record<LimitResource, { label: string; items: string }> = {
  active_runs: { label: 'Active run', items: 'checklist runs' },
  templates: { label: 'Template', items: 'templates' },
};

export function limitReachedResponse(params: {
  resource: LimitResource;
  teamId: string | null;
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

export function personalProRequiredResponse(action: string): Response {
  return jsonError(`Upgrade to Pro to ${action}.`, 403, { code: 'upgrade_required' });
}
