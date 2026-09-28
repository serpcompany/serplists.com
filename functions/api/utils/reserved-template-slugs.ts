import bundledTemplateCatalog from '../../sitemap/bundled-catalog.generated.json';
import { generateSlug } from './slug';

// Bundled starter Templates (src/data/public-template-packs, published as /profile/serp/<slug>)
// live in the app bundle, not D1, so the D1 unique index cannot see their slugs. Treat them as
// taken so no user Template is handed one. The set comes from the generated sitemap catalog,
// which CI keeps in sync with the packs, so a new starter is reserved automatically.
const reservedTemplateSlugs = new Set(
  bundledTemplateCatalog.templates
    .map((template) => generateSlug(template.slug))
    .filter(Boolean),
);

export function isReservedTemplateSlug(slug: string): boolean {
  return reservedTemplateSlugs.has(generateSlug(slug));
}
