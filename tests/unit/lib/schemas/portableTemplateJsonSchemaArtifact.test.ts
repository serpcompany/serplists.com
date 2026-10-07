import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH,
  buildPortableTemplatePackJsonSchema,
} from '../../../../scripts/lib/portableTemplateJsonSchema';

describe('portable template JSON Schema artifact', () => {
  it('matches the generated schema from the canonical Zod contract', () => {
    const artifactPath = path.join(process.cwd(), PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH);
    const artifact: unknown = JSON.parse(readFileSync(artifactPath, 'utf8'));

    expect(artifact).toEqual(buildPortableTemplatePackJsonSchema());
  });
});
