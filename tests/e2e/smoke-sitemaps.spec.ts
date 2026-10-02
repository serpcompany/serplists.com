import { expect, test } from "@playwright/test";
import { capturedGroup } from "../support/elements";
import { APP_URL } from "./support/stack";
import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";

const sitemapSchema = readFileSync(new URL("../fixtures/sitemap.xsd", import.meta.url), "utf8");
const sitemapIndexSchema = readFileSync(new URL("../fixtures/siteindex.xsd", import.meta.url), "utf8");
const EMPTY_REGISTRY_CATEGORY_PAGES = [
  "https://serplists.com/categories/engineering/",
  "https://serplists.com/categories/compliance/",
];
const PRIVATE_TEMPLATE_PAGES = [
  "https://serplists.com/profile/admin/internal-publishing-checklist/",
  "https://serplists.com/profile/admin/shared-growth-launch-checklist/",
  "https://serplists.com/profile/jane/client-reporting-qa-checklist/",
];
const SHARDS_THE_INDEX_NEVER_LISTED = ["profiles/999999", "templates/2", "templates/999", "categories/2"];
const CACHE_DIRECTIVES_THAT_STORE = /^(public|immutable|s-maxage=|stale-|max-age=(?!0$))/;

async function expectSchemaValid(xml: string, schema: string, fileName: string) {
  const result = await validateXML({ xml: [{ fileName, contents: xml }], schema: [schema] });
  expect(result.errors, result.rawOutput).toEqual([]);
  expect(result.valid, result.rawOutput).toBe(true);
}

test("@smoke sitemap index and every listed shard pass the public XML audit", async ({ request }) => {
  const pagesOrigin = new URL(APP_URL).origin;
  const indexResponse = await request.get(`${pagesOrigin}/sitemap.xml`);
  const indexXml = await indexResponse.text();
  const childLocations = Array.from(
    indexXml.matchAll(/<loc>(https:\/\/serplists\.com\/sitemaps\/(?:pages|categories|profiles|templates)\/\d+\.xml)<\/loc>/g),
    (match) => capturedGroup(match, 1),
  );
  const shardLastmods = Array.from(
    indexXml.matchAll(/<loc>(https:\/\/serplists\.com\/sitemaps\/(?:pages|categories|profiles|templates)\/\d+\.xml)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g),
    (match) => [capturedGroup(match, 1), capturedGroup(match, 2)],
  );

  expect(indexResponse.ok()).toBe(true);
  expect(indexResponse.headers()["content-type"]).toContain("application/xml");
  expect(indexXml).toContain("<sitemapindex");
  expect(indexXml).not.toContain("?page=");
  expect(indexXml).not.toContain("/sitemaps/static/");
  expect(childLocations.length).toBeGreaterThan(0);
  const rootEntryCount = indexXml.match(/<sitemap>/g)?.length ?? 0;
  expect(childLocations).toHaveLength(rootEntryCount);
  expect(indexXml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(rootEntryCount);
  expect(rootEntryCount).toBeLessThanOrEqual(50_000);
  expect(new TextEncoder().encode(indexXml).byteLength).toBeLessThanOrEqual(50 * 1024 * 1024);
  await expectSchemaValid(indexXml, sitemapIndexSchema, "sitemap-index.xml");

  const robotsResponse = await request.get(`${pagesOrigin}/robots.txt`);
  expect(robotsResponse.ok()).toBe(true);
  expect(await robotsResponse.text()).toContain("Sitemap: https://serplists.com/sitemap.xml");
  const allPageLocations = new Set<string>();
  const pageLocationsByShard = new Map<string, string[]>();

  for (const childLocation of childLocations) {
    const localLocation = childLocation.replace("https://serplists.com", pagesOrigin);
    const childResponse = await request.get(localLocation);
    const childXml = await childResponse.text();
    const pageLocations = Array.from(
      childXml.matchAll(/<loc>(https:\/\/serplists\.com\/[^<]*)<\/loc>/g),
      (match) => capturedGroup(match, 1),
    );
    const lastmods = Array.from(
      childXml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g),
      (match) => capturedGroup(match, 1),
    );
    pageLocationsByShard.set(childLocation, pageLocations);

    expect(childResponse.ok(), childLocation).toBe(true);
    expect(childResponse.headers()["content-type"]).toContain("application/xml");
    expect(childXml).toContain("<urlset");
    expect(childXml).not.toContain("<sitemapindex");
    expect(pageLocations.length).toBeGreaterThan(0);
    expect(pageLocations.length).toBeLessThanOrEqual(25_000);
    expect(new TextEncoder().encode(childXml).byteLength).toBeLessThanOrEqual(50 * 1024 * 1024);
    expect(lastmods).toHaveLength(pageLocations.length);
    for (const location of pageLocations) {
      expect(allPageLocations.has(location), `duplicate URL ${location}`).toBe(false);
      allPageLocations.add(location);
    }
    expect(lastmods.every((value) => Number.isFinite(Date.parse(value)))).toBe(true);
    if (childLocation.includes("/sitemaps/categories/")) {
      const shardDateInIndex = Date.parse(shardLastmods.find(([loc]) => loc === childLocation)?.[1] ?? "");
      const newestEntryInShard = Math.max(...lastmods.map((value) => Date.parse(value)));
      expect(shardDateInIndex, childLocation).toBeGreaterThanOrEqual(newestEntryInShard);
    }
    expect(childXml).not.toContain("<priority>");
    expect(childXml).not.toContain("<changefreq>");
    await expectSchemaValid(childXml, sitemapSchema, new URL(childLocation).pathname);

    const headResponse = await request.head(localLocation);
    expect(headResponse.status(), childLocation).toBe(200);
    expect(headResponse.headers()["content-type"]).toContain("application/xml");
    expect(headResponse.headers()["cache-control"]).toContain("s-maxage=86400");
    expect(await headResponse.text()).toBe("");
  }

  expect(allPageLocations).toContain("https://serplists.com/profile/admin/");
  expect(allPageLocations).toContain(
    "https://serplists.com/profile/admin/sample-technical-seo-audit-checklist/",
  );
  expect(allPageLocations).toContain("https://serplists.com/categories/seo/");
  const listedWithoutTheirTrailingSlash = [...allPageLocations].filter((location) => !location.endsWith("/"));
  expect(listedWithoutTheirTrailingSlash).toEqual([]);
  for (const unlisted of [...EMPTY_REGISTRY_CATEGORY_PAGES, ...PRIVATE_TEMPLATE_PAGES]) {
    expect(allPageLocations).not.toContain(unlisted);
  }

  const unchangedIndexResponse = await request.get(`${pagesOrigin}/sitemap.xml`);
  const unchangedIndexXml = await unchangedIndexResponse.text();
  const unchangedShardLastmods = Array.from(
    unchangedIndexXml.matchAll(/<loc>(https:\/\/serplists\.com\/sitemaps\/(?:pages|categories|profiles|templates)\/\d+\.xml)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g),
    (match) => [capturedGroup(match, 1), capturedGroup(match, 2)],
  );
  expect(unchangedIndexResponse.ok()).toBe(true);
  expect(unchangedShardLastmods).toEqual(shardLastmods);

  for (const childLocation of childLocations) {
    const localLocation = childLocation.replace("https://serplists.com", pagesOrigin);
    const unchangedChildXml = await (await request.get(localLocation)).text();
    const unchangedPageLocations = Array.from(
      unchangedChildXml.matchAll(/<loc>(https:\/\/serplists\.com\/[^<]*)<\/loc>/g),
      (match) => capturedGroup(match, 1),
    );
    expect(unchangedPageLocations, childLocation).toEqual(pageLocationsByShard.get(childLocation));
  }

  for (const unpublished of SHARDS_THE_INDEX_NEVER_LISTED) {
    const unpublishedResponse = await request.get(`${pagesOrigin}/sitemaps/${unpublished}.xml`);
    expect(unpublishedResponse.status(), unpublished).toBe(404);
    const directives = (unpublishedResponse.headers()["cache-control"] ?? "").split(",").map((directive) => directive.trim());
    expect(directives, unpublished).toContain("no-store");
    expect(directives.filter((directive) => CACHE_DIRECTIVES_THAT_STORE.test(directive)), unpublished).toEqual([]);
  }
  expect((await request.get(`${pagesOrigin}/sitemaps/static.xml`, { maxRedirects: 0 })).status()).toBe(308);
  expect((await request.get(`${pagesOrigin}/categories/sitemap.xml`, { maxRedirects: 0 })).status()).toBe(308);
});
