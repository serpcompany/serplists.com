import { findOpenPort, isPortAvailable, isProcessAlive } from "../dev-auto-lib.mjs";

const WEBHOOK_PATH = "/api/stripe/webhook";

export function webhookUrlForPort(port) {
  return `http://localhost:${port}${WEBHOOK_PATH}`;
}

export function liveSessionPort(session, isAlive = isProcessAlive) {
  if (!session) return null;
  return isAlive(session.pid) ? session.port : null;
}

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

export function retargetForDevSession(target, session, isAlive = isProcessAlive) {
  if (target.source === "env") return null;
  const port = liveSessionPort(session, isAlive);
  if (!port) return null;
  const url = webhookUrlForPort(port);
  return url === target.url ? null : url;
}
