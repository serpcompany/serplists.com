import { expect } from 'vitest';
import { z } from 'zod';

import { buildPortableTemplatePackJsonSchema } from '../../scripts/lib/portableTemplateJsonSchema';

export const portableTemplatePackJsonSchema = () =>
  z.object({ $id: z.string() }).catchall(z.unknown()).parse(buildPortableTemplatePackJsonSchema());

export function expectThePortableSeoFieldsAndOneRule(template: {
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
  rules?: unknown[] | undefined;
}) {
  expect(template.seoTitle).toBe('Portable SEO Title');
  expect(template.seoDescription).toBe('Portable SEO Description');
  expect(template.rules).toHaveLength(1);
}
