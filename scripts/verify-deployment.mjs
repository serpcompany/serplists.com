import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const DEPLOYMENT_PROBE_PATHS = ["/api/health", "/api/templates"];

async function probe(url, { fetchImpl, timeoutMs }) {
  try {
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel().catch(() => {});
    return { status: response.status };
  } catch (error) {
    return { status: null, reason: error?.cause?.code ?? error?.name ?? "request failed" };
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
}) {
  if (!baseUrl) {
    log("::warning::Deployment URL not found in wrangler output; skipping post-deploy checks.");
    return 0;
  }

  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    let result = { status: null, reason: "not probed" };
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      result = await probe(url, { fetchImpl, timeoutMs });
      if (result.status === 200 || attempt === attempts) break;
      await sleep(retryDelayMs);
    }

    const { status } = result;
    if (status === 200) {
      log(`${url} -> 200`);
    } else if (status === null) {
      log(`::error::${url} gave no response (${result.reason}) after deploy. Check the Pages deployment logs and bindings.`);
      return 1;
    } else if (status >= 500) {
      log(`::error::${url} returned ${status} after deploy. Check the Pages deployment logs and bindings.`);
      return 1;
    } else {
      log(`::warning::${url} returned ${status} (access policy?); could not verify.`);
    }
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await verifyDeployment({ baseUrl: process.env.DEPLOY_URL?.trim() });
}
