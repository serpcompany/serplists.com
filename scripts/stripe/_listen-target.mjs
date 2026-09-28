import { findOpenPortPair, isPortAvailable, isProcessAlive } from "../dev-auto-lib.mjs";

// Every clone or worktree runs its own dev stack on a free port pair (dev-auto), so the
// Stripe listener must forward to this checkout's API. A fixed default port can belong
// to another worktree, whose API has a different signing secret and local D1.

const WEBHOOK_PATH = "/api/stripe/webhook";

export function webhookUrlForApiPort(apiPort) {
  return `http://localhost:${apiPort}${WEBHOOK_PATH}`;
}

/**
 * The API port reserved by this checkout's running dev stack (tmp/dev-session.json),
 * or null when none of its processes is alive. A live frontend-only session counts:
 * dev:api reuses its pair.
 */
export function liveSessionApiPort(session, isAlive = isProcessAlive) {
  if (!session) return null;
  const running = [session.allPid, session.apiPid, session.frontendPid].some((pid) => isAlive(pid));
  return running ? session.apiPort : null;
}

/**
 * Where `stripe listen` forwards events, in priority order:
 * - `env`: STRIPE_LOCAL_WEBHOOK_URL, when set;
 * - `session`: the API of this checkout's running dev stack;
 * - `predicted`: the API port dev:all would pick now, when the listener starts first.
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

  const apiPort = liveSessionApiPort(session, isAlive);
  if (apiPort) return { url: webhookUrlForApiPort(apiPort), source: "session" };

  const pair = await findOpenPortPair({ portAvailabilityChecker: portAvailable });
  return { url: webhookUrlForApiPort(pair.apiPort), source: "predicted" };
}

/**
 * The URL to forward to instead of `target` once this checkout's dev stack runs on
 * another API port, or null to keep forwarding where it does. An explicit
 * STRIPE_LOCAL_WEBHOOK_URL is never changed.
 */
export function retargetForDevSession(target, session, isAlive = isProcessAlive) {
  if (target.source === "env") return null;
  const apiPort = liveSessionApiPort(session, isAlive);
  if (!apiPort) return null;
  const url = webhookUrlForApiPort(apiPort);
  return url === target.url ? null : url;
}
