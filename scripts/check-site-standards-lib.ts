import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

import { errorMessage } from "./lib/error-message";

export const SMOKE_TEST_HEADER = "x-serplists-smoke-test";

export const siteEnvironmentSchema = z.enum(["production", "staging"]);
export type SiteEnvironment = z.infer<typeof siteEnvironmentSchema>;

export interface SiteResponse {
  status: number;
  location: string | null;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: string;
}

export type SiteRequest = (
  url: string,
  options: { host?: string | undefined; headers: Record<string, string> },
) => Promise<SiteResponse>;

export interface SiteStandardsResult {
  passed: number;
  failed: number;
  lines: string[];
}

type SiteGetOptions = { host?: string | undefined; sendSmokeTestHeader?: boolean };

const CANONICAL_ORIGINS: Record<SiteEnvironment, string> = {
  production: "https://serplists.com",
  staging: "https://staging.serplists.com",
};

const ONE_SEEDED_PAGE_OF_EACH_KIND = ["/", "/about/", "/pricing/", "/templates/", "/categories/", "/features/template-builder/", "/login/", "/profile/serp/ultimate-camping-checklist/"];
const FILES = ["/robots.txt", "/sitemap.xml", "/sitemaps/pages/1.xml"];
const API = ["/api/health", "/api/auth/get-session", "/api/mcp", "/api/stripe/webhook"];
const API_THAT_ANSWERS = ["/api/health", "/api/templates"];
const LOCAL_STAND_IN_FOR_A_WORKERS_DEV_HOST = "serp-checklists-check.serp.workers.dev";

function siteUnderCheck(base: URL, request: SiteRequest) {
  const origin = base.origin;
  const onWorkersDev = base.hostname.endsWith(".workers.dev");
  const get = (path: string, { host, sendSmokeTestHeader = onWorkersDev }: SiteGetOptions = {}) =>
    request(`${origin}${path}`, { host, headers: sendSmokeTestHeader ? { [SMOKE_TEST_HEADER]: "1" } : {} });

  const lines: string[] = [];
  let failed = 0;
  const check = (ok: boolean, message: string) => {
    lines.push(`${ok ? "ok  " : "FAIL"} ${message}`);
    if (!ok) failed += 1;
  };
  const expectStatus = async (path: string, want: number) => {
    const { status } = await get(path);
    check(status === want, `${status} ${path}${status === want ? "" : ` (want ${want})`}`);
  };
  const expectRedirect = async (path: string, want: string, options?: SiteGetOptions) => {
    const { status, location } = await get(path, options);
    const ok = status === 308 && location === want;
    check(ok, `${path}${options?.host ? ` on ${options.host}` : ""} -> ${status} ${location ?? ""}${ok ? "" : ` (want 308 ${want})`}`);
  };
  const result = (): SiteStandardsResult => ({ passed: lines.length - failed, failed, lines });
  return { base, origin, onWorkersDev, get, check, expectStatus, expectRedirect, result };
}

type SiteUnderCheck = ReturnType<typeof siteUnderCheck>;

const locsIn = (xml: string) => z.array(z.string()).parse([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));

async function checkTheOtherFormRedirectsInOneHop({ origin, expectRedirect }: SiteUnderCheck) {
  for (const page of ONE_SEEDED_PAGE_OF_EACH_KIND.filter((path) => path !== "/")) await expectRedirect(page.slice(0, -1), `${origin}${page}`);
  await expectRedirect("/login?next=%2Fdashboard%2F", `${origin}/login/?next=%2Fdashboard%2F`);
  for (const file of FILES) await expectRedirect(`${file}/`, `${origin}${file}`);
}

async function checkTheApiIsNeverRedirected({ get, check }: SiteUnderCheck) {
  for (const path of [...API, ...API.map((apiPath) => `${apiPath}/`)]) {
    const { status } = await get(path);
    check(status < 300 || status >= 400, `${status} ${path} (the API is never redirected)`);
  }
}

async function checkSitemapsListOnlyCanonicalUrls({ get, check }: SiteUnderCheck) {
  const index = (await get("/sitemap.xml")).body;
  const children = locsIn(index);
  check(children.length > 0 && children.every((loc) => /^https:\/\/serplists\.com\/sitemaps\/[a-z]+\/\d+\.xml$/.test(loc)), `the sitemap index lists ${children.length} unslashed .xml files on serplists.com`);
  for (const child of children) {
    const { body } = await get(new URL(child).pathname);
    const locs = locsIn(body);
    const bad = locs.filter((loc) => !/^https:\/\/serplists\.com\/(?:[^?#]*\/)?$/.test(loc));
    check(locs.length > 0 && bad.length === 0, `${new URL(child).pathname} lists ${locs.length} slashed page URLs${bad.length ? `; not canonical: ${bad.slice(0, 3).join(", ")}` : ""}`);
  }
}

async function checkOnlyProductionIsIndexedOrLoadsAnalytics({ get, check }: SiteUnderCheck, siteEnv: SiteEnvironment) {
  const robots = (await get("/robots.txt")).body;
  const home = await get("/");
  const staticFile = await get("/og-default.png");
  const noindex = (response: SiteResponse) => /noindex/i.test(String(response.headers["x-robots-tag"] ?? ""));
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

async function checkOtherHostsRedirectToTheCanonicalHost(
  { base, onWorkersDev, get, check, expectRedirect }: SiteUnderCheck,
  { canonicalOrigin, local }: { canonicalOrigin: string; local: boolean },
) {
  if (onWorkersDev || local) {
    const workersDevHost = local ? LOCAL_STAND_IN_FOR_A_WORKERS_DEV_HOST : undefined;
    const onTheWorkersDevHost = workersDevHost === undefined ? {} : { host: workersDevHost };
    for (const [path, canonical] of [["/about", "/about/"], ["/robots.txt/", "/robots.txt"], ["/api/mcp", "/api/mcp"]] as const) {
      await expectRedirect(path, `${canonicalOrigin}${canonical}`, { ...onTheWorkersDevHost, sendSmokeTestHeader: false });
    }
    const smokeTest = await get("/about/", { ...onTheWorkersDevHost, sendSmokeTestHeader: true });
    check(smokeTest.status === 200, `${smokeTest.status} /about/ on ${workersDevHost ?? base.host} with ${SMOKE_TEST_HEADER}`);
  }
  if (local) {
    await expectRedirect("/pricing", "https://serplists.com/pricing/", { host: "www.serplists.com" });
    await expectRedirect("/", "https://serplists.com/", { host: "www.serplists.com" });
  }
}

export async function checkSiteStandards({
  baseUrl,
  siteEnv,
  local = false,
  request,
}: {
  baseUrl: string;
  siteEnv: SiteEnvironment;
  local?: boolean;
  request: SiteRequest;
}): Promise<SiteStandardsResult> {
  const base = new URL(baseUrl);
  const canonicalOrigin = CANONICAL_ORIGINS[siteEnv];
  const site = siteUnderCheck(base, request);

  for (const path of [...ONE_SEEDED_PAGE_OF_EACH_KIND, ...FILES, ...API_THAT_ANSWERS]) await site.expectStatus(path, 200);
  await checkTheOtherFormRedirectsInOneHop(site);
  await checkTheApiIsNeverRedirected(site);
  await checkSitemapsListOnlyCanonicalUrls(site);
  await checkOnlyProductionIsIndexedOrLoadsAnalytics(site, siteEnv);
  await checkOtherHostsRedirectToTheCanonicalHost(site, { canonicalOrigin, local });

  return site.result();
}

type RetryOptions = {
  attempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<unknown>;
  onRetry?: (attempt: number, reason: string) => void;
};

type AttemptOutcome = { result: SiteStandardsResult } | { error: unknown };

async function attemptSiteStandards(options: Parameters<typeof checkSiteStandards>[0]): Promise<AttemptOutcome> {
  try {
    return { result: await checkSiteStandards(options) };
  } catch (error) {
    return { error };
  }
}

const whyTheAttemptFailed = (outcome: AttemptOutcome): string =>
  "result" in outcome
    ? `${outcome.result.failed} check(s) failed`
    : `the site did not answer (${errorMessage(outcome.error)})`;

export async function checkSiteStandardsUntilItPasses(
  options: Parameters<typeof checkSiteStandards>[0],
  { attempts = 3, retryDelayMs = 20_000, sleep = delay, onRetry = () => {} }: RetryOptions = {},
): Promise<SiteStandardsResult> {
  let outcome = await attemptSiteStandards(options);
  for (let attempt = 1; !("result" in outcome && outcome.result.failed === 0) && attempt < attempts; attempt += 1) {
    onRetry(attempt + 1, whyTheAttemptFailed(outcome));
    await sleep(retryDelayMs);
    outcome = await attemptSiteStandards(options);
  }
  if ("error" in outcome) throw outcome.error;
  return outcome.result;
}
