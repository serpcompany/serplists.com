import path from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { z } from "zod";

export const UI_SNAP_USAGE =
  "Usage: pnpm run ui:snap -- [route] [--login <email>] [--password <password>] [--mobile] " +
  "[--out <file.png|file.jpg>] [--base <app url>] [--api <api url, default <app url>/api>]\n" +
  "Flags may come before or after the route. Write the route without a leading slash (dashboard/templates).";

interface SnapshotPaths {
  outPath: string;
  ariaPath: string;
}

export interface UiSnapArgs extends SnapshotPaths {
  routePath: string;
  slug: string;
  mobile: boolean;
  login: string | undefined;
  password: string | undefined;
  base: string | undefined;
  api: string | undefined;
}

const OPTIONS = {
  mobile: { type: "boolean", default: false },
  login: { type: "string" },
  password: { type: "string" },
  out: { type: "string" },
  base: { type: "string" },
  api: { type: "string" },
} satisfies ParseArgsConfig["options"];

const EXTENSIONS_PLAYWRIGHT_SAVES_AS_AN_IMAGE = [".png", ".jpg", ".jpeg", ".jpe"];

const unknownOptionErrorSchema = z.object({ code: z.literal("ERR_PARSE_ARGS_UNKNOWN_OPTION"), message: z.string() });

function resolveSnapshotPaths(outArg: string | undefined, slug: string): SnapshotPaths {
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

function parseUiSnapOptions(args: string[]) {
  try {
    return parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    const unknownOption = unknownOptionErrorSchema.safeParse(error);
    if (unknownOption.success) {
      throw new Error(`Unknown flag ${/'([^']+)'/.exec(unknownOption.data.message)?.[1] ?? ""}.`, { cause: error });
    }
    throw error;
  }
}

export function parseUiSnapArgs(argv: readonly string[]): UiSnapArgs {
  const argsWithoutTheSeparatorPnpmForwards = argv.filter((arg) => arg !== "--");
  const { values, positionals } = parseUiSnapOptions(argsWithoutTheSeparatorPnpmForwards);

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
