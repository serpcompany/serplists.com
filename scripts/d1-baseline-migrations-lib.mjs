import { parse } from "smol-toml";
import { z } from "zod";

const d1DatabaseSchema = z.object({
  binding: z.string().min(1),
  database_name: z.string().optional(),
  database_id: z.string().optional(),
  preview_database_id: z.string().optional(),
});

const d1DatabasesSchema = z.array(d1DatabaseSchema).default([]);
const wranglerD1Schema = z.object({
  d1_databases: d1DatabasesSchema,
  env: z.object({ production: z.object({ d1_databases: d1DatabasesSchema }).default({}) }).default({}),
});

export function readD1Databases(toml) {
  const config = wranglerD1Schema.parse(parse(toml));
  return { topLevel: config.d1_databases, production: config.env.production.d1_databases };
}

function readArg(argv, name) {
  const prefix = `${name}=`;
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const arg = argv[index];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) {
      const value = argv[index + 1];
      return value && !value.startsWith("--") ? value : "";
    }
  }
  return null;
}

export function parseBaselineArgs(argv, env) {
  const isRemote = argv.includes("--remote");
  return {
    isRemote,
    databaseName: readArg(argv, "--database") || env.D1_DATABASE_NAME || "",
    throughMigration: readArg(argv, "--through"),
    shouldExecute: argv.includes("--execute"),
    allowProduction: argv.includes("--allow-production"),
    usePreview: argv.includes("--preview"),
    cloudflareEnv: env.CLOUDFLARE_ENV || "",
  };
}

const refuse = (error) => ({ ok: false, error });

export function resolveBaselineTarget({ databaseName, isRemote, usePreview, allowProduction, cloudflareEnv, d1 }) {
  if (!isRemote) {
    return { ok: true, environment: "local", databaseId: null, label: `${databaseName} (local)` };
  }
  if (cloudflareEnv) {
    return refuse(
      `CLOUDFLARE_ENV=${cloudflareEnv} makes wrangler read another environment's D1 bindings. Unset it before a remote baseline.`,
    );
  }
  if (usePreview && allowProduction) {
    return refuse("Pass either --preview (staging) or --allow-production (production), not both.");
  }
  if (!usePreview && !allowProduction) {
    return refuse(
      `A remote baseline needs --preview (staging) or --allow-production (production). Without --preview, wrangler sends ${databaseName} to its database_id.`,
    );
  }

  const productionIds = new Set(
    [...d1.topLevel, ...d1.production].map((entry) => entry.database_id).filter(Boolean),
  );
  if (productionIds.size === 0) return refuse("wrangler.toml has no production D1 database_id.");

  const configured = d1.topLevel.find(
    (entry) => entry.database_id && (entry.database_name === databaseName || entry.binding === databaseName),
  );

  if (usePreview) {
    const databaseId = configured?.preview_database_id;
    if (!databaseId) {
      return refuse(
        `${databaseName} has no preview_database_id in the top-level [[d1_databases]] of wrangler.toml. Use --database DB --preview for staging.`,
      );
    }
    if (productionIds.has(databaseId)) {
      return refuse(`The preview database for ${databaseName} is the production database (${databaseId}).`);
    }
    return { ok: true, environment: "staging", databaseId, label: `staging ${databaseName} --preview (${databaseId})` };
  }

  const productionEntryByItsOwnNameOrId = d1.production.find(
    (entry) => entry.database_name === databaseName || entry.database_id === databaseName,
  );
  const databaseId = configured?.database_id ?? productionEntryByItsOwnNameOrId?.database_id;
  if (!databaseId || !productionIds.has(databaseId)) {
    return refuse(
      `--allow-production is only for the production database, and ${databaseName} does not resolve to it. Use --database DB --preview for staging.`,
    );
  }
  return { ok: true, environment: "production", databaseId, label: `PRODUCTION ${databaseName} (${databaseId})` };
}
