# XML sitemap standards for SERP Lists

Research date: 2026-09-04. This note uses primary sources only.

## Decision summary

- A sitemap index must enumerate the actual URL sitemap shards. For this project, use stable, numbered, file-like shard URLs such as `/sitemaps/categories/1.xml`, `/sitemaps/categories/2.xml`, and so on, and list every shard directly in the root `/sitemap.xml` index.
- Do **not** make `/sitemap.xml` point to a category sitemap index. Google reports nested sitemap indexes as an error: an index may list sitemap files, not another index. If a separate category index is kept for operational reasons, submit it separately rather than nesting it.
- Query-string shard URLs such as `/categories/sitemap.xml?page=2` are not forbidden by the Sitemap Protocol. A sitemap location is a URI, and Google says sitemap files may be named anything whose characters are allowed in a URL. However, neither Google nor the protocol defines query parameters as a pagination mechanism. Stable numbered paths are the clearer project convention for shard identity, cache behavior, auditing, and Search Console reporting. This preference is an implementation recommendation, not a claim that query-string sitemap URLs are invalid.
- Each URL sitemap is limited to 50,000 URLs and 50 MB (52,428,800 bytes) **uncompressed**. Each sitemap index is limited to 50,000 sitemap locations and 50 MB uncompressed. A lower internal shard cap is valid.
- On a URL entry, `<loc>` is required. `<lastmod>`, `<changefreq>`, and `<priority>` are optional in the protocol and XSD. Missing `priority` or `changefreq` is not an audit defect; Google and Bing explicitly say they ignore both.
- Add `<lastmod>` only when it can be derived accurately. It should represent the page's last **significant** content change, not the time the sitemap response was generated. It may be present for some entries and absent for others.
- On a sitemap-index entry, `<lastmod>` is also optional and means the modification time of the corresponding sitemap file, not the modification time of an arbitrary page within it.

## Correct shard and index structure

Google's current large-sitemap guidance says to split an oversized sitemap into sitemap files below the limits, then list those files in a sitemap index. The index requires `<sitemapindex>`, one `<sitemap>` per child file, and an absolute `<loc>` for each child. Referenced sitemap files must be on the same site (unless cross-site submission is configured) and in the index's directory or below it.

The Sitemap Protocol imposes no semantic filename pattern. Google likewise says a sitemap file can have any name whose characters are valid in a URL. Numbered filenames are therefore a convention, not a protocol requirement.

Recommended SERP Lists shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://serplists.com/sitemaps/categories/1.xml</loc>
    <lastmod>2026-09-04</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://serplists.com/sitemaps/categories/2.xml</loc>
    <lastmod>2026-09-04</lastmod>
  </sitemap>
</sitemapindex>
```

Every child above must return a `<urlset>`, not another `<sitemapindex>`. Google's current Search Console troubleshooting documentation explicitly classifies nested sitemap indexes as an incorrect format. This current rule supersedes contradictory historical Google blog material.

Sources: [Google: manage sitemaps with sitemap index files](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps), [Google Search Console: nested sitemap index error](https://support.google.com/webmasters/answer/7451001), [Sitemaps.org protocol](https://www.sitemaps.org/protocol.html).

## Limits, encoding, location, and URLs

- URL sitemap: at most 50,000 `<url>` entries and 50 MB uncompressed.
- Sitemap index: at most 50,000 `<sitemap>` locations and 50 MB uncompressed.
- Files must be UTF-8 encoded. Gzip is allowed, but the uncompressed size remains the governing limit.
- Sitemap URL values must be fully qualified absolute URLs and XML entity-escaped. Google attempts to crawl the URLs exactly as listed.
- Include canonical URLs intended for search results, not redirect, deleted, private, or alternate duplicate URLs.
- A root-level sitemap has site-wide path scope. A sitemap below a directory ordinarily applies only to URLs at or below that directory unless it is submitted through Search Console; keeping the index at the site root avoids accidental scope restrictions.

Sources: [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Sitemaps.org protocol](https://www.sitemaps.org/protocol.html).

## Metadata semantics

### URL entries

The official sitemap XSD defines this order and optionality:

1. `<loc>` — required.
2. `<lastmod>` — optional; an `xsd:date` or `xsd:dateTime` in W3C Datetime form.
3. `<changefreq>` — optional.
4. `<priority>` — optional, decimal `0.0` through `1.0`.

Google uses accurate `<lastmod>` as a possible crawl-scheduling signal. It says the value should reflect the last significant modification, such as changes to primary content, structured data, or links. It is fine to omit `<lastmod>` for pages whose modification time cannot be determined confidently, including some aggregate pages. Google may stop trusting consistently inaccurate values.

Bing likewise advises using the true page-content modification time, preferably with an ISO 8601 timestamp when precision is available, and specifically warns against using sitemap-generation time.

Google and Bing both ignore `<changefreq>` and `<priority>`. They may remain schema-valid, but adding them does not supply a useful search-engine signal. Tests and auditors should not require them.

Sources: [official sitemap XSD](https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd), [Google on `lastmod`, `changefreq`, and `priority`](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping), [Bing on sitemap freshness](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search).

### Sitemap-index entries

The official index XSD requires `<loc>` and makes `<lastmod>` optional. Here `<lastmod>` identifies when the corresponding **sitemap file** was modified. Google says this value may help schedule that sitemap for crawling.

For dynamically generated sitemap endpoints, the accurate implementation is to derive the index-entry date from a stable source representing when that shard's output meaningfully changed—for example, the greatest significant content update among records in the shard, or a deployment/content-manifest modification time for static shards. Do not stamp every request with the current time. This derivation is a project recommendation based on the protocol semantics; the specifications do not prescribe a database algorithm.

Sources: [official sitemap-index XSD](https://www.sitemaps.org/schemas/sitemap/0.9/siteindex.xsd), [Google sitemap-index reference](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps).

## Validation and automated-test expectations

Validate every generated fixture and representative endpoint at the public HTTP seam:

1. Response is successful and parses as XML with no leading junk.
2. XML declaration uses UTF-8 and the root has the exact namespace `http://www.sitemaps.org/schemas/sitemap/0.9`.
3. Root indexes validate against the official `siteindex.xsd`; child URL sitemaps validate against `sitemap.xsd`.
4. An index contains only `<sitemap>` children with one absolute `<loc>` each; every referenced child resolves successfully and its root is `<urlset>`, never `<sitemapindex>`.
5. Each URL entry has exactly one absolute, canonical, entity-escaped `<loc>`; reject duplicate, redirect, private, deleted, and noncanonical inventory.
6. Assert no URL sitemap exceeds 50,000 entries or 52,428,800 uncompressed bytes, and no index exceeds the corresponding limits. Do not rely on XSD validation alone for these numeric limits; the official XSD documents them in annotations rather than enforcing a 50,000 `maxOccurs` bound.
7. If `<lastmod>` is present, validate it as W3C date/dateTime and assert it comes from the page/shard source of truth rather than wall-clock generation time. Do not require it where accuracy is unavailable.
8. Do not require `<priority>` or `<changefreq>`. If retained, validate their XSD value constraints, but recognize they are ignored by Google and Bing.
9. Check representative production URLs in Google Search Console after release for fetch, parse, nesting, path, and URL errors; local schema validation cannot prove crawler accessibility or canonical correctness.

Google's Search Console error reference specifically calls out oversized files, nested indexes, missing/duplicate tags, incorrect namespace, leading whitespace, unescaped characters, disallowed URL paths/domains, and HTTP fetch failures.

Sources: [Google Search Console sitemap errors](https://support.google.com/webmasters/answer/7451001), [official sitemap XSD](https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd), [official sitemap-index XSD](https://www.sitemaps.org/schemas/sitemap/0.9/siteindex.xsd).
