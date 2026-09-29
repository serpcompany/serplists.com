// Argument parsing for scripts/ui-snapshot.mjs (pnpm run ui:snap), kept apart from
// the Playwright code so it can be unit tested.
import path from "node:path";
import { parseArgs } from "node:util";

export const UI_SNAP_USAGE =
  "Usage: pnpm run ui:snap -- [route] [--login <email>] [--password <password>] [--mobile] " +
  "[--out <file.png|file.jpg>] [--base <app url>] [--api <api url, default <app url>/api>]\n" +
  "Flags may come before or after the route. Write the route without a leading slash (dashboard/templates).";

const OPTIONS = {
  mobile: { type: "boolean", default: false },
  login: { type: "string" },
  password: { type: "string" },
  out: { type: "string" },
  base: { type: "string" },
  api: { type: "string" },
};

// Extensions Playwright saves as an image. Its lookup is case-sensitive, so .PNG fails.
const SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".jpe"];

/**
 * The screenshot path and the accessibility YAML beside it (`dash.jpg` gives
 * `dash.aria.yml`). Throws for an extension Playwright cannot save, and never
 * returns a YAML path that would overwrite the screenshot.
 */
export function resolveSnapshotPaths(outArg, slug) {
  const outPath = outArg ?? path.join("tmp", "snapshots", `${slug}.png`);
  const { dir, name, ext } = path.parse(outPath);
  if (!SCREENSHOT_EXTENSIONS.includes(ext)) {
    throw new Error(`--out must end in ${SCREENSHOT_EXTENSIONS.join(", ")} (lowercase), got "${outPath}".`);
  }
  const ariaPath = path.join(dir, `${name}.aria.yml`);
  if (path.resolve(ariaPath) === path.resolve(outPath)) {
    throw new Error(`--out "${outPath}" would be overwritten by the accessibility YAML.`);
  }
  return { outPath, ariaPath };
}

/**
 * Reads ui:snap arguments in any order. Throws on an unknown flag, a flag with no
 * value, more than one route, or an --out that is not a .png or .jpg file, instead
 * of quietly snapshotting another page or losing the screenshot.
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
    ...resolveSnapshotPaths(values.out, slug),
    mobile: values.mobile,
    login: values.login,
    password: values.password,
    base: values.base,
    api: values.api,
  };
}
