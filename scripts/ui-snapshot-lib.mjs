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

const EXTENSIONS_PLAYWRIGHT_SAVES_AS_AN_IMAGE = [".png", ".jpg", ".jpeg", ".jpe"];

export function resolveSnapshotPaths(outArg, slug) {
  const outPath = outArg ?? path.join("tmp", "snapshots", `${slug}.png`);
  const { dir, name, ext } = path.parse(outPath);
  if (!EXTENSIONS_PLAYWRIGHT_SAVES_AS_AN_IMAGE.includes(ext)) {
    throw new Error(`--out must end in ${EXTENSIONS_PLAYWRIGHT_SAVES_AS_AN_IMAGE.join(", ")} (lowercase), got "${outPath}".`);
  }
  const ariaPath = path.join(dir, `${name}.aria.yml`);
  if (path.resolve(ariaPath) === path.resolve(outPath)) {
    throw new Error(`--out "${outPath}" would be overwritten by the accessibility YAML.`);
  }
  return { outPath, ariaPath };
}

export function parseUiSnapArgs(argv) {
  const argsWithoutTheSeparatorPnpmForwards = argv.filter((arg) => arg !== "--");
  let parsed;
  try {
    parsed = parseArgs({
      args: argsWithoutTheSeparatorPnpmForwards,
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
