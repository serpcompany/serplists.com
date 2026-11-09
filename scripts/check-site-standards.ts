import { pathToFileURL } from "node:url";

import { checkSiteStandardsUntilItPasses, siteEnvironmentSchema } from "./check-site-standards-lib";

export {
  checkSiteStandards,
  checkSiteStandardsUntilItPasses,
  getWithoutFollowingRedirects,
  type SiteEnvironment,
  type SiteRequest,
  type SiteResponse,
  type SiteStandardsResult,
  SMOKE_TEST_HEADER,
} from "./check-site-standards-lib";

async function main() {
  const [baseUrl, siteEnv] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!baseUrl || !siteEnv) {
    console.error("usage: node --import tsx scripts/check-site-standards.ts <base-url> <staging|production> [--local]");
    process.exit(2);
  }
  const environment = siteEnvironmentSchema.safeParse(siteEnv);
  if (!environment.success) throw new Error(`Unknown environment ${siteEnv}: use staging or production`);
  const result = await checkSiteStandardsUntilItPasses(
    { baseUrl, siteEnv: environment.data, local: process.argv.includes("--local") },
    {
      onRetry: (attempt, reason) =>
        console.log(`${reason}; a new deployment can answer 404 or not answer at all for its first seconds, so checking again in 20s (attempt ${attempt} of 3).`),
    },
  );
  result.lines.forEach((line) => console.log(line));
  console.log(`${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
