import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { SMOKE_TEST_HEADER } from "../src/lib/seo/siteOrigin";

export const DEPLOYMENT_PROBE_PATHS = ["/api/health", "/api/templates"];

type ProbeFetch = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;
type ProbeResult = { status: number } | { status: null; reason: string };

const failedRequestSchema = z.object({
  cause: z.object({ code: z.string() }).passthrough().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
});

function whyTheRequestFailed(error: unknown): string {
  const failure = failedRequestSchema.safeParse(error);
  if (!failure.success) return "request failed";
  return failure.data.cause?.code ?? failure.data.name ?? "request failed";
}

async function probe(url: string, { fetchImpl, timeoutMs }: { fetchImpl: ProbeFetch; timeoutMs: number }): Promise<ProbeResult> {
  try {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { [SMOKE_TEST_HEADER]: "1" },
    });
    await response.body?.cancel().catch(() => {});
    return { status: response.status };
  } catch (error) {
    return { status: null, reason: whyTheRequestFailed(error) };
  }
}

export async function verifyDeployment({
  baseUrl,
  paths = DEPLOYMENT_PROBE_PATHS,
  attempts = 6,
  retryDelayMs = 10_000,
  timeoutMs = 30_000,
  fetchImpl = fetch,
  sleep = delay,
  log = console.log,
}: {
  baseUrl: string | undefined;
  paths?: string[];
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: ProbeFetch;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (line: string) => unknown;
}): Promise<number> {
  if (!baseUrl) {
    log("::warning::Deployment URL not found in wrangler output; skipping post-deploy checks.");
    return 0;
  }

  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    let result: ProbeResult = { status: null, reason: "not probed" };
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      result = await probe(url, { fetchImpl, timeoutMs });
      if (result.status === 200 || attempt === attempts) break;
      await sleep(retryDelayMs);
    }

    if (result.status === 200) {
      log(`${url} -> 200`);
    } else if (result.status === null) {
      log(`::error::${url} gave no response (${result.reason}) after deploy. Check the Worker's deployment logs and bindings.`);
      return 1;
    } else if (result.status >= 500) {
      log(`::error::${url} returned ${result.status} after deploy. Check the Worker's deployment logs and bindings.`);
      return 1;
    } else {
      log(`::warning::${url} returned ${result.status} (access policy?); could not verify.`);
    }
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await verifyDeployment({ baseUrl: process.env["DEPLOY_URL"]?.trim() });
}
