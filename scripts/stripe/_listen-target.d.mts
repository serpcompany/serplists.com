import type { DevSession } from "../dev-auto-lib.mjs";

export type WebhookForwardTarget = { url: string; source: "env" | "session" | "predicted" };
type IsAlive = (pid: number | null) => boolean;

export function webhookUrlForPort(port: number): string;
export function liveSessionPort(session: DevSession | null | undefined, isAlive?: IsAlive): number | null;
export function resolveWebhookForwardTarget(options: {
  envUrl: string | undefined;
  session: DevSession | null | undefined;
  isAlive?: IsAlive;
  portAvailable?: (port: number) => Promise<boolean>;
}): Promise<WebhookForwardTarget>;
export function retargetForDevSession(
  target: WebhookForwardTarget,
  session: DevSession | null | undefined,
  isAlive?: IsAlive,
): string | null;
