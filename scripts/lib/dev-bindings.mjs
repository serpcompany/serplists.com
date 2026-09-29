// `pnpm run dev:all` picks the dev server's port when it starts, so the Worker vars that name
// the server (FRONTEND_URL, CORS_ALLOWED_ORIGINS) cannot come from .dev.vars. The launcher
// (scripts/dev-auto-lib.mjs) passes them to `next dev` as JSON in DEV_BINDINGS_VARIABLE, and
// next.config.ts sets them on the bindings the API reads.
import { z } from "zod";

export const DEV_BINDINGS_VARIABLE = "SERPLISTS_DEV_BINDINGS";

const devBindingsSchema = z.record(z.string(), z.string());

/** The vars in the variable's value; {} when it is unset. Throws on anything but a JSON object of strings. */
export function parseDevBindings(raw) {
  if (!raw) return {};
  return devBindingsSchema.parse(JSON.parse(raw));
}

/**
 * Sets the vars dev:all passed over the bindings that getCloudflareContext() hands the API in
 * `next dev` (from wrangler.toml and .dev.vars). next.config.ts calls it once
 * initOpenNextCloudflareForDev() has set up the bindings. Next.js also loads the config in a
 * process that serves no requests and has no bindings; there it does nothing. Returns true
 * when it set any.
 */
export function applyDevBindings(processEnv, getContext) {
  const bindings = parseDevBindings(processEnv[DEV_BINDINGS_VARIABLE]);
  if (Object.keys(bindings).length === 0) return false;

  let context;
  try {
    context = getContext();
  } catch {
    return false;
  }
  Object.assign(context.env, bindings);
  return true;
}
