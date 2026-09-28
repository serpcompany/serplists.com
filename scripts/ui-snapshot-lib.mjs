// Argument parsing for scripts/ui-snapshot.mjs (pnpm run ui:snap), kept apart from
// the Playwright code so it can be unit tested.
import path from "node:path";
import { parseArgs } from "node:util";

export const UI_SNAP_USAGE =
  "Usage: pnpm run ui:snap -- [route] [--login <email>] [--password <password>] [--mobile] " +
  "[--out <file.png>] [--base <frontend url>] [--api <api url>]\n" +
  "Flags may come before or after the route. Write the route without a leading slash (dashboard/templates).";

const OPTIONS = {
  mobile: { type: "boolean", default: false },
  login: { type: "string" },
  password: { type: "string" },
  out: { type: "string" },
  base: { type: "string" },
  api: { type: "string" },
};

/**
 * Reads ui:snap arguments in any order. Throws on an unknown flag, a flag with no
 * value, or more than one route, instead of quietly snapshotting another page.
 */
export function parseUiSnapArgs(argv) {
  let parsed;
  try {
    // pnpm forwards the `--` separator; parseArgs would treat everything after it as a route.
    parsed = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    if (error?.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      throw new Error(`Unknown flag ${/'([^']+)'/.exec(error.message)?.[1] ?? ""}.`, { cause: error });
    }
    throw error;
  }
  const { values, positionals } = parsed;

  if (positionals.length > 1) {
    throw new Error(`Expected one route, got ${positionals.length}: ${positionals.join(" ")}.`);
  }

  // Routes may omit the leading slash (`dashboard`), which Git Bash would otherwise rewrite into a file path.
  const routeArg = positionals[0] ?? "";
  const routePath = routeArg.startsWith("/") ? routeArg : `/${routeArg}`;
  const slug = routePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

  return {
    routePath,
    slug,
    outPath: values.out ?? path.join("tmp", "snapshots", `${slug}.png`),
    mobile: values.mobile,
    login: values.login,
    password: values.password,
    base: values.base,
    api: values.api,
  };
}
