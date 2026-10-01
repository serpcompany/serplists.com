import { z } from 'zod';
import { mockEnv, PRO_PLAN, resetToASignedOutVisitorOnTheFreePlan, signInWithPlans, TEAM_PLAN } from './apiHandlerMocks';
import { handleTemplates } from '@functions/api/handlers/templates';

export { dbMocks, mockEnv } from './apiHandlerMocks';

const exportedTemplate = z
  .object({
    title: z.string(),
    sections: z.array(z.object({ items: z.array(z.record(z.unknown())) }).passthrough()),
  })
  .passthrough();
export const packBody = z.object({ templates: z.array(exportedTemplate), manifest: z.record(z.unknown()) }).passthrough();
export const importBody = z.object({ imported: z.number() }).passthrough();

export function resetPortableTemplatesHandlerMocks() {
  resetToASignedOutVisitorOnTheFreePlan();
  signInWithPlans('user-123', PRO_PLAN, TEAM_PLAN);
}

export const importPack = (templates: unknown[]) =>
  handleTemplates(
    new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates,
      }),
    }),
    mockEnv,
  );
