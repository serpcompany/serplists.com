import bundledTemplateCatalog from '../../sitemap/bundled-catalog.generated.json';
import { generateSlug, looksLikeTemplateId } from './slug';

const bundledStarterSlugs = new Set(
  bundledTemplateCatalog.templates
    .map((template) => generateSlug(template.slug))
    .filter(Boolean),
);

export function isReservedTemplateSlug(slug: string): boolean {
  const normalized = generateSlug(slug);
  return bundledStarterSlugs.has(normalized) || looksLikeTemplateId(normalized);
}
