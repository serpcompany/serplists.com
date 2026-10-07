import { z } from 'zod';
import { mockEnv, PRO_PLAN, resetToASignedOutVisitorOnTheFreePlan, signInWithPlans, TEAM_PLAN } from './apiHandlerMocks';
import { handleTemplates } from '@functions/api/handlers/templates';
import { apiRequest } from './apiRequest';
import { storedTask } from './storedJson';

export { dbMocks, expectTheOrganizationOwnsIt, expectTheOrganizationPlanChecked, mockEnv } from './apiHandlerMocks';

const exportedTemplate = z
  .object({
    title: z.string(),
    type: z.unknown(),
    visibility: z.unknown(),
    seoTitle: z.unknown(),
    seoDescription: z.unknown(),
    rules: z.unknown(),
    sections: z.array(z.object({ id: z.unknown(), title: z.unknown(), items: z.array(storedTask) }).passthrough()),
  })
  .passthrough();
const packManifest = z
  .object({ totalTemplates: z.unknown(), skippedTemplates: z.unknown(), includesRules: z.unknown() })
  .passthrough();
export const packBody = z
  .object({ kind: z.unknown(), schemaVersion: z.unknown(), templates: z.array(exportedTemplate), manifest: packManifest })
  .passthrough();
export const importBody = z
  .object({ imported: z.number(), total: z.unknown(), successes: z.unknown(), failed: z.unknown() })
  .passthrough();

export function resetPortableTemplatesHandlerMocks() {
  resetToASignedOutVisitorOnTheFreePlan();
  signInWithPlans('user-123', PRO_PLAN, TEAM_PLAN);
}

type PackOptions = { teamId?: string; schemaVersion?: string };

export const importPack = (templates: unknown[], { teamId, schemaVersion = '2.0.0' }: PackOptions = {}) =>
  handleTemplates(
    apiRequest(`templates/backup${teamId ? `?teamId=${teamId}` : ''}`, 'POST', {
      kind: 'serplists-template-pack',
      schemaVersion,
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates,
    }),
    mockEnv,
  );
