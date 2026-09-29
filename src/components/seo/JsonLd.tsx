/**
 * Structured data for search engines, rendered by a page's server component. `<` is escaped,
 * so text a user wrote (a template title) can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
