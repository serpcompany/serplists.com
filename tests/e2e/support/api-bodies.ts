import { z } from 'zod';

export { apiRunSchema, createdRunSchema, runShareCreatedSchema } from '../../../src/lib/schemas/apiRuns';
import { apiTemplateSchema } from '../../../src/lib/schemas/apiTemplates';

export { apiTemplateSchema };
export { savedTemplateSchema } from '../../../src/lib/schemas/apiTemplates';
export { updatedTeamSchema } from '../../../src/lib/schemas/teamResponses';

export const jsonRecord = z.record(z.unknown());

export const apiTemplateRows = z.array(apiTemplateSchema);

const storedTask = z
  .object({
    id: z.string().nullish(),
    title: z.string().nullish(),
    isCompleted: z.boolean().nullish(),
    notes: z.string().nullish(),
    contents: z.array(z.object({ subItems: z.array(z.object({ isCompleted: z.boolean().nullish() }).passthrough()).nullish() }).passthrough()).nullish(),
  })
  .passthrough();

const storedSections = z.array(z.object({ items: z.array(storedTask) }).passthrough());

export const sectionsOfStoredItems = (items: unknown) =>
  storedSections.parse(typeof items === 'string' ? JSON.parse(items) : items);

export const templateVersion = z.object({ version: z.number() }).passthrough();

export const createdOrganization = z.object({ id: z.string(), name: z.string() }).passthrough();
