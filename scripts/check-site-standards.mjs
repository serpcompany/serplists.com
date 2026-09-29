// Checks a running site against the SERP URL and environment standards, the way a crawler and
// the deploy workflow see it:
//   node scripts/check-site-standards.mjs <base-url> <staging|production> [--local]
// - Canonical pages and files answer 200. A page without its slash, and a file with one, answer
//   308 to the canonical form in one hop. The API is never redirected, with or without a slash.
// - The sitemaps list only canonical URLs; robots.txt, X-Robots-Tag and Tag Manager match the
//   environment (production may be indexed; staging is noindex, disallowed, without analytics).
// - Other hosts answer 308 to the environment's host in one hop, and the smoke-test header
//   exempts a workers.dev host. On a deployed workers.dev URL every other request carries the
//   header; with --local (a local `opennextjs-cloudflare preview`) the other hosts are sent as
//   a Host header to the local server instead.
// Exits 1 if any check fails.
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

export const SMOKE_TEST_HEADER = "x-serplists-smoke-test";

const CANONICAL_ORIGINS = { production: "https://serplists.com", staging: "https://staging.serplists.com" };

// A seeded page of each kind the app has, in canonical form.
const PAGES = ["/", "/about/", "/pricing/", "/templates/", "/categories/", "/features/template-builder/", "/login/", "/profile/serp/ultimate-camping-checklist/"];
const FILES = ["/robots.txt", "/sitemap.xml", "/sitemaps/pages/1.xml"];
const API = ["/api/health", "/api/auth/get-session", "/api/mcp", "/api/stripe/webhook"];

/** One GET without following redirects: { status, location (absolute), headers, body }. */
export function requestOnce(url, { host, headers = {}, timeoutMs = 30_000 } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      { method: "GET", headers: { ...headers, ...(host ? { host } : {}) }, timeout: timeoutMs },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const location = response.headers.location
            ? new URL(response.headers.location, `${target.protocol}//${host ?? target.host}`).href
            : null;
          resolve({ status: response.statusCode ?? 0, location, headers: response.headers, body });
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error(`timed out: ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

/**
 * Runs every check against `baseUrl` for `siteEnv` and returns { passed, failed, lines }.
 * `request(url, { host, headers })` is requestOnce, or a stand-in in tests.
 */
export async function checkSiteStandards({ baseUrl, siteEnv, local = false, request = requestOnce }) {
  const base = new URL(baseUrl);
  const origin = base.origin;
  const canonicalOrigin = CANONICAL_ORIGINS[siteEnv];
  if (!canonicalOrigin) throw new Error(`Unknown environment ${siteEnv}: use staging or production`);
  const onWorkersDev = base.hostname.endsWith(".workers.dev");
  // On a workers.dev URL every request but the host checks carries the smoke-test header.
  const get = (path, { host, smokeTest = onWorkersDev } = {}) =>
    request(`${origin}${path}`, { host, headers: smokeTest ? { [SMOKE_TEST_HEADER]: "1" } : {} });

  const lines = [];
  let failed = 0;
  const check = (ok, message) => {
    lines.push(`${ok ? "ok  " : "FAIL"} ${message}`);
    if (!ok) failed += 1;
  };
  const expectStatus = async (path, want) => {
    const { status } = await get(path);
    check(status === want, `${status} ${path}${status === want ? "" : ` (want ${want})`}`);
  };
  const expectRedirect = async (path, want, options) => {
    const { status, location } = await get(path, options);
    const ok = status === 308 && location === want;
    check(ok, `${path}${options?.host ? ` on ${options.host}` : ""} -> ${status} ${location ?? ""}${ok ? "" : ` (want 308 ${want})`}`);
  };

  for (const path of [...PAGES, ...FILES]) await expectStatus(path, 200);

  // SERP URL standard: the other form of a page or a file redirects, in one hop.
  for (const page of PAGES.filter((path) => path !== "/")) await expectRedirect(page.slice(0, -1), `${origin}${page}`);
  await expectRedirect("/login?next=%2Fdashboard%2F", `${origin}/login/?next=%2Fdashboard%2F`);
  for (const file of FILES) await expectRedirect(`${file}/`, `${origin}${file}`);

  // The API answers at the path it is called with: never a redirect, with or without a slash.
  for (const path of [...API, ...API.map((apiPath) => `${apiPath}/`)]) {
    const { status } = await get(path);
    check(status < 300 || status >= 400, `${status} ${path} (the API is never redirected)`);
  }

  // Sitemaps list only canonical URLs: sitemap files without a slash, pages with one.
  const index = (await get("/sitemap.xml")).body;
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  check(children.length > 0 && children.every((loc) => /^https:\/\/serplists\.com\/sitemaps\/[a-z]+\/\d+\.xml$/.test(loc)), `the sitemap index lists ${children.length} unslashed .xml files on serplists.com`);
  for (const child of children) {
    const { body } = await get(new URL(child).pathname);
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const bad = locs.filter((loc) => !/^https:\/\/serplists\.com\/(?:[^?#]*\/)?$/.test(loc));
    check(locs.length > 0 && bad.length === 0, `${new URL(child).pathname} lists ${locs.length} slashed page URLs${bad.length ? `; not canonical: ${bad.slice(0, 3).join(", ")}` : ""}`);
  }

  // Environment: only production may be indexed or load analytics.
  const robots = (await get("/robots.txt")).body;
  const home = await get("/");
  const staticFile = await get("/og-default.png");
  const noindex = (response) => /noindex/i.test(String(response.headers["x-robots-tag"] ?? ""));
  const tagManager = /googletagmanager\.com\/gtm\.js/.test(home.body);
  if (siteEnv === "production") {
    check(/^Allow: \/$/m.test(robots) && !/^Disallow: \/$/m.test(robots), "robots.txt allows crawling");
    check(/^Sitemap: https:\/\/serplists\.com\/sitemap\.xml$/m.test(robots), "robots.txt lists https://serplists.com/sitemap.xml");
    check(!noindex(home), "pages send no X-Robots-Tag noindex");
    check(!noindex(staticFile), "static files send no X-Robots-Tag noindex");
    check(tagManager, "pages load Tag Manager");
  } else {
    check(/^Disallow: \/$/m.test(robots) && !/^Allow:/m.test(robots), "robots.txt disallows crawling");
    check(!/^Sitemap:/m.test(robots), "robots.txt lists no sitemap");
    check(noindex(home), "pages send X-Robots-Tag noindex");
    check(noindex(staticFile), "static files send X-Robots-Tag noindex");
    check(!tagManager, "pages load no Tag Manager");
  }

  // Canonical hosts: one hop to the environment's host, in canonical form. A deployed
  // workers.dev URL is asked directly; a local preview is sent the host as a Host header.
  if (onWorkersDev || local) {
    const workersDev = local ? { host: "serp-checklists-check.serp.workers.dev" } : {};
    for (const [path, canonical] of [["/about", "/about/"], ["/robots.txt/", "/robots.txt"], ["/api/mcp", "/api/mcp"]]) {
      await expectRedirect(path, `${canonicalOrigin}${canonical}`, { ...workersDev, smokeTest: false });
    }
    const smokeTest = await get("/about/", { ...workersDev, smokeTest: true });
    check(smokeTest.status === 200, `${smokeTest.status} /about/ on ${workersDev.host ?? base.host} with ${SMOKE_TEST_HEADER}`);
  }
  if (local) {
    await expectRedirect("/pricing", "https://serplists.com/pricing/", { host: "www.serplists.com" });
    await expectRedirect("/", "https://serplists.com/", { host: "www.serplists.com" });
  }

  return { passed: lines.length - failed, failed, lines };
}

async function main() {
  const [baseUrl, siteEnv] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!baseUrl || !siteEnv) {
    console.error("usage: node scripts/check-site-standards.mjs <base-url> <staging|production> [--local]");
    process.exit(2);
  }
  const result = await checkSiteStandards({ baseUrl, siteEnv, local: process.argv.includes("--local") });
  result.lines.forEach((line) => console.log(line));
  console.log(`${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
