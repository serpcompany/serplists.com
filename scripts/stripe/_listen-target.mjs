import { findOpenPort, isPortAvailable, isProcessAlive } from "../dev-auto-lib.mjs";

// Every clone or worktree runs its own dev server on a free port (dev-auto), so the Stripe
// listener must forward to this checkout's API. A fixed default port can belong to another
// worktree, whose API has a different signing secret and local D1.

const WEBHOOK_PATH = "/api/stripe/webhook";

export function webhookUrlForPort(port) {
  return `http://localhost:${port}${WEBHOOK_PATH}`;
}

/**
 * The port of this checkout's running dev server (tmp/dev-session.json), which serves the
 * API too, or null when its launcher is not alive.
 */
export function liveSessionPort(session, isAlive = isProcessAlive) {
  if (!session) return null;
  return isAlive(session.pid) ? session.port : null;
}

/**
 * Where `stripe listen` forwards events, in priority order:
 * - `env`: STRIPE_LOCAL_WEBHOOK_URL, when set;
 * - `session`: the API of this checkout's running dev server;
 * - `predicted`: the port dev:all would pick now, when the listener starts first.
 */
export async function resolveWebhookForwardTarget({
  envUrl,
  session,
  isAlive = isProcessAlive,
  portAvailable = isPortAvailable,
}) {
  const explicit = envUrl?.trim();
  if (explicit) {
    let parsed;
    try {
      parsed = new URL(explicit);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      throw new Error(`STRIPE_LOCAL_WEBHOOK_URL must be an http(s) URL, got "${explicit}".`);
    }
    return { url: parsed.toString(), source: "env" };
  }

  const port = liveSessionPort(session, isAlive);
  if (port) return { url: webhookUrlForPort(port), source: "session" };

  const predicted = await findOpenPort({ portAvailabilityChecker: portAvailable });
  return { url: webhookUrlForPort(predicted), source: "predicted" };
}

/**
 * The URL to forward to instead of `target` once this checkout's dev server runs on another
 * port, or null to keep forwarding where it does. An explicit STRIPE_LOCAL_WEBHOOK_URL is
 * never changed.
 */
export function retargetForDevSession(target, session, isAlive = isProcessAlive) {
  if (target.source === "env") return null;
  const port = liveSessionPort(session, isAlive);
  if (!port) return null;
  const url = webhookUrlForPort(port);
  return url === target.url ? null : url;
}
