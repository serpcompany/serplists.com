import { type DevSession, findOpenPort, isPortAvailable, isProcessAlive } from "../dev-auto-lib";

export type WebhookForwardTarget = { url: string; source: "env" | "session" | "predicted" };
type IsAlive = (pid: number | null) => boolean;

const WEBHOOK_PATH = "/api/stripe/webhook";

function webhookUrlForPort(port: number): string {
  return `http://localhost:${port}${WEBHOOK_PATH}`;
}

function liveSessionPort(session: DevSession | null | undefined, isAlive: IsAlive = isProcessAlive): number | null {
  if (!session) return null;
  return isAlive(session.pid) ? session.port : null;
}

export async function resolveWebhookForwardTarget({
  envUrl,
  session,
  isAlive = isProcessAlive,
  portAvailable = isPortAvailable,
}: {
  envUrl: string | undefined;
  session: DevSession | null | undefined;
  isAlive?: IsAlive;
  portAvailable?: (port: number) => Promise<boolean>;
}): Promise<WebhookForwardTarget> {
  const explicit = envUrl?.trim();
  if (explicit) {
    let parsed: URL | null;
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

export function retargetForDevSession(
  target: WebhookForwardTarget,
  session: DevSession | null | undefined,
  isAlive: IsAlive = isProcessAlive,
): string | null {
  if (target.source === "env") return null;
  const port = liveSessionPort(session, isAlive);
  if (!port) return null;
  const url = webhookUrlForPort(port);
  return url === target.url ? null : url;
}
