import http from "node:http";
import https from "node:https";
import { z } from "zod";

import { checkSiteStandardsUntilItPasses, type SiteResponse, siteEnvironmentSchema } from "./check-site-standards-lib";

function getWithoutFollowingRedirects(
  url: string,
  { host, headers }: { host?: string | undefined; headers: Record<string, string> },
): Promise<SiteResponse> {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      { method: "GET", headers: { ...headers, ...(host ? { host } : {}) }, timeout: 30_000 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          const absoluteLocation = response.headers.location
            ? new URL(response.headers.location, `${target.protocol}//${host ?? target.host}`).href
            : null;
          resolve({ status: z.number().int().parse(response.statusCode), location: absoluteLocation, headers: response.headers, body });
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error(`timed out: ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

const [baseUrl, siteEnv] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!baseUrl || !siteEnv) {
  console.error("usage: node --import tsx scripts/check-site-standards.ts <base-url> <staging|production> [--local]");
  process.exit(2);
}
const environment = siteEnvironmentSchema.safeParse(siteEnv);
if (!environment.success) throw new Error(`Unknown environment ${siteEnv}: use staging or production`);
const result = await checkSiteStandardsUntilItPasses(
  { baseUrl, siteEnv: environment.data, local: process.argv.includes("--local"), request: getWithoutFollowingRedirects },
  {
    onRetry: (attempt, reason) =>
      console.log(`${reason}; a new deployment can answer 404 or not answer at all for its first seconds, so checking again in 20s (attempt ${attempt} of 3).`),
  },
);
result.lines.forEach((line) => console.log(line));
console.log(`${result.passed} passed, ${result.failed} failed`);
process.exit(result.failed ? 1 : 0);
