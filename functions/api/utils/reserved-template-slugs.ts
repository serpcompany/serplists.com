import bundledTemplateCatalog from '../../sitemap/bundled-catalog.generated.json';
import { generateSlug, looksLikeTemplateId } from './slug';

// Slugs no user Template is handed, so create, import, clone and a slug change get the
// id suffix instead (template-insert.ts, PUT /api/templates/:id):
// - Bundled starter Templates (src/data/public-template-packs, published as /profile/serp/<slug>)
//   live in the app bundle, not D1, so the D1 unique index cannot see their slugs. The set
//   comes from the generated sitemap catalog, which CI keeps in sync with the packs, so a
//   new starter is reserved automatically.
// - A UUID: /profile/<user>/<uuid> is read as a template id, so a Template with that slug
//   would have a public URL that never loads.
const reservedTemplateSlugs = new Set(
  bundledTemplateCatalog.templates
    .map((template) => generateSlug(template.slug))
    .filter(Boolean),
);

export function isReservedTemplateSlug(slug: string): boolean {
  const normalized = generateSlug(slug);
  return reservedTemplateSlugs.has(normalized) || looksLikeTemplateId(normalized);
}
