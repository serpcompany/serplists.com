export const DEPLOYMENT_PROBE_PATHS: string[];

export function verifyDeployment(options: {
  baseUrl: string | undefined;
  paths?: string[];
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: (url: string, init: { redirect: "manual"; signal: AbortSignal }) => Promise<Response>;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (line: string) => unknown;
}): Promise<number>;
