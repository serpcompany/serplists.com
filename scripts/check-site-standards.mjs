import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

export const SMOKE_TEST_HEADER = "x-serplists-smoke-test";

const CANONICAL_ORIGINS = { production: "https://serplists.com", staging: "https://staging.serplists.com" };

const ONE_SEEDED_PAGE_OF_EACH_KIND = ["/", "/about/", "/pricing/", "/templates/", "/categories/", "/features/template-builder/", "/login/", "/profile/serp/ultimate-camping-checklist/"];
const FILES = ["/robots.txt", "/sitemap.xml", "/sitemaps/pages/1.xml"];
const API = ["/api/health", "/api/auth/get-session", "/api/mcp", "/api/stripe/webhook"];
const LOCAL_STAND_IN_FOR_A_WORKERS_DEV_HOST = "serp-checklists-check.serp.workers.dev";

export function getWithoutFollowingRedirects(url, { host, headers = {}, timeoutMs = 30_000 } = {}) {
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
          const absoluteLocation = response.headers.location
            ? new URL(response.headers.location, `${target.protocol}//${host ?? target.host}`).href
            : null;
          resolve({ status: response.statusCode ?? 0, location: absoluteLocation, headers: response.headers, body });
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error(`timed out: ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

function siteUnderCheck(base, request) {
  const origin = base.origin;
  const onWorkersDev = base.hostname.endsWith(".workers.dev");
  const get = (path, { host, sendSmokeTestHeader = onWorkersDev } = {}) =>
    request(`${origin}${path}`, { host, headers: sendSmokeTestHeader ? { [SMOKE_TEST_HEADER]: "1" } : {} });

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
  const result = () => ({ passed: lines.length - failed, failed, lines });
  return { base, origin, onWorkersDev, get, check, expectStatus, expectRedirect, result };
}

async function checkTheOtherFormRedirectsInOneHop({ origin, expectRedirect }) {
  for (const page of ONE_SEEDED_PAGE_OF_EACH_KIND.filter((path) => path !== "/")) await expectRedirect(page.slice(0, -1), `${origin}${page}`);
  await expectRedirect("/login?next=%2Fdashboard%2F", `${origin}/login/?next=%2Fdashboard%2F`);
  for (const file of FILES) await expectRedirect(`${file}/`, `${origin}${file}`);
}

async function checkTheApiIsNeverRedirected({ get, check }) {
  for (const path of [...API, ...API.map((apiPath) => `${apiPath}/`)]) {
    const { status } = await get(path);
    check(status < 300 || status >= 400, `${status} ${path} (the API is never redirected)`);
  }
}

async function checkSitemapsListOnlyCanonicalUrls({ get, check }) {
  const index = (await get("/sitemap.xml")).body;
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  check(children.length > 0 && children.every((loc) => /^https:\/\/serplists\.com\/sitemaps\/[a-z]+\/\d+\.xml$/.test(loc)), `the sitemap index lists ${children.length} unslashed .xml files on serplists.com`);
  for (const child of children) {
    const { body } = await get(new URL(child).pathname);
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const bad = locs.filter((loc) => !/^https:\/\/serplists\.com\/(?:[^?#]*\/)?$/.test(loc));
    check(locs.length > 0 && bad.length === 0, `${new URL(child).pathname} lists ${locs.length} slashed page URLs${bad.length ? `; not canonical: ${bad.slice(0, 3).join(", ")}` : ""}`);
  }
}

async function checkOnlyProductionIsIndexedOrLoadsAnalytics({ get, check }, siteEnv) {
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
}

async function checkOtherHostsRedirectToTheCanonicalHost({ base, onWorkersDev, get, check, expectRedirect }, { canonicalOrigin, local }) {
  if (onWorkersDev || local) {
    const workersDevHost = local ? { host: LOCAL_STAND_IN_FOR_A_WORKERS_DEV_HOST } : {};
    for (const [path, canonical] of [["/about", "/about/"], ["/robots.txt/", "/robots.txt"], ["/api/mcp", "/api/mcp"]]) {
      await expectRedirect(path, `${canonicalOrigin}${canonical}`, { ...workersDevHost, sendSmokeTestHeader: false });
    }
    const smokeTest = await get("/about/", { ...workersDevHost, sendSmokeTestHeader: true });
    check(smokeTest.status === 200, `${smokeTest.status} /about/ on ${workersDevHost.host ?? base.host} with ${SMOKE_TEST_HEADER}`);
  }
  if (local) {
    await expectRedirect("/pricing", "https://serplists.com/pricing/", { host: "www.serplists.com" });
    await expectRedirect("/", "https://serplists.com/", { host: "www.serplists.com" });
  }
}

export async function checkSiteStandards({ baseUrl, siteEnv, local = false, request = getWithoutFollowingRedirects }) {
  const base = new URL(baseUrl);
  const canonicalOrigin = CANONICAL_ORIGINS[siteEnv];
  if (!canonicalOrigin) throw new Error(`Unknown environment ${siteEnv}: use staging or production`);
  const site = siteUnderCheck(base, request);

  for (const path of [...ONE_SEEDED_PAGE_OF_EACH_KIND, ...FILES]) await site.expectStatus(path, 200);
  await checkTheOtherFormRedirectsInOneHop(site);
  await checkTheApiIsNeverRedirected(site);
  await checkSitemapsListOnlyCanonicalUrls(site);
  await checkOnlyProductionIsIndexedOrLoadsAnalytics(site, siteEnv);
  await checkOtherHostsRedirectToTheCanonicalHost(site, { canonicalOrigin, local });

  return site.result();
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
