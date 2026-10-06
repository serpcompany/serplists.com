import { jsonError } from './response';
import { refusalResponse, writeRefusal, type WriteRefusal } from './write-refusal';

type LimitContext = 'personal' | 'organization';
export type LimitResource = 'active_runs' | 'templates';

const LIMIT_TEXT: Record<LimitResource, { label: string; items: string }> = {
  active_runs: { label: 'Active run', items: 'checklist runs' },
  templates: { label: 'Template', items: 'templates' },
};

export function limitReachedRefusal(params: {
  resource: LimitResource;
  teamId: string | null;
  action: 'create' | 'restore' | 'reopen' | 'save';
  limit: number;
  current: number;
}): WriteRefusal {
  const context: LimitContext = params.teamId ? 'organization' : 'personal';
  const { label, items } = LIMIT_TEXT[params.resource];
  const remedy = context === 'organization' ? 'This Organization needs a paid plan' : 'Upgrade to Pro';

  return writeRefusal(`${label} limit reached. ${remedy} to ${params.action} more ${items}.`, 403, {
    code: 'limit_reached',
    details: { limit: params.limit, current: params.current, resource: params.resource, context },
  });
}

export function limitReachedResponse(params: Parameters<typeof limitReachedRefusal>[0]): Response {
  return refusalResponse(limitReachedRefusal(params));
}

export function personalProRequiredResponse(action: string): Response {
  return jsonError(`Upgrade to Pro to ${action}.`, 403, { code: 'upgrade_required' });
}
