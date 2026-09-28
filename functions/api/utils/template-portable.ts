import { log } from './logger';
import { jsonError } from './response';
import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackLooseEnvelopeSchema,
  type PortableChecklistTemplate,
} from '../../../src/lib/schemas/checklistSchema';
import { parsePortableTemplate } from '../../../src/lib/schemas/portableTemplateNormalize';
import { buildPortablePackManifest, type PortableSkippedTemplate } from '../../../src/lib/schemas/portableTemplatePack';

// Portable packs are written and read through the same normalizer as the client, so an
// export always passes the importer's schema (docs/product-specs/portable-templates.md).

// A parsed templates row; the portable schema validates each field.
export type PortableExportSource = {
  id: unknown;
  title: unknown;
  description: unknown;
  type: unknown;
  seoTitle: unknown;
  seoDescription: unknown;
  rules?: unknown[];
  sections: unknown[];
  categories: unknown[];
  tags: unknown[];
  isPublic: boolean;
  slug: unknown;
};

/** Builds GET /api/templates/backup's portable pack. Templates that cannot be made valid are reported in the manifest. */
export function buildPortableTemplatePack(templates: PortableExportSource[], exportedBy: string | undefined) {
  const exported: PortableChecklistTemplate[] = [];
  const skippedTemplates: PortableSkippedTemplate[] = [];

  for (const template of templates) {
    const result = parsePortableTemplate({
      title: template.title,
      description: template.description || '',
      type: template.type,
      seoTitle: template.seoTitle || '',
      seoDescription: template.seoDescription || '',
      rules: template.rules,
      sections: template.sections,
      categories: template.categories,
      tags: template.tags,
      visibility: template.isPublic ? 'public' : 'private',
      slug: template.slug || undefined,
    });
    if (result.success) {
      exported.push(result.data);
    } else {
      skippedTemplates.push({ title: result.title, reason: result.reason });
      log('warn', 'portable_export_template_skipped', { templateId: template.id });
    }
  }

  return {
    kind: 'serplists-template-pack',
    schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    templates: exported,
    manifest: buildPortablePackManifest(exported, skippedTemplates),
  };
}

export type PortableImportFailure = { index: number; title: string; reason: string; code: 'invalid_sections' };

/**
 * Parses a POSTed portable pack. Envelope problems reject the file; each template is
 * normalized and validated on its own, so an invalid one becomes a per-template failure.
 */
export function parsePortableTemplatePackImport(body: unknown):
  | { response: Response }
  | { templates: PortableChecklistTemplate[]; sourceIndexes: number[]; failures: PortableImportFailure[] } {
  const envelope = portableTemplatePackLooseEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return { response: jsonError(envelope.error.issues[0]?.message || 'Invalid portable template pack payload', 400) };
  }
  if (envelope.data.schemaVersion !== PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION) {
    return {
      response: jsonError(`Unsupported portable template schema version: ${envelope.data.schemaVersion}`, 400, {
        code: 'unsupported_portable_schema_version',
      }),
    };
  }

  const templates: PortableChecklistTemplate[] = [];
  const sourceIndexes: number[] = [];
  const failures: PortableImportFailure[] = [];
  envelope.data.templates.forEach((raw, index) => {
    const result = parsePortableTemplate(raw);
    if (result.success) {
      templates.push(result.data);
      sourceIndexes.push(index);
    } else {
      failures.push({ index, title: result.title, reason: result.reason, code: 'invalid_sections' });
    }
  });

  return { templates, sourceIndexes, failures };
}
