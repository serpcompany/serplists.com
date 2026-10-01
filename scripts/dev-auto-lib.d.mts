import type { ProcessInfo } from "./lib/process-info.mjs";
import type { Invocation } from "./lib/run-tool.mjs";

export type DevSession = { port: number; pid: number | null; startedAt: number | null };
export type DevServerConfig = {
  port: number;
  origin: string;
  bindings: { FRONTEND_URL: string; CORS_ALLOWED_ORIGINS: string; BETTER_AUTH_SECRET: string };
};
type Env = Record<string, string | undefined>;
type OwnershipCheck = (pid: number | null, startedAt: number | null) => Promise<boolean>;

export const DEFAULT_DEV_PORT: number;
export const PORT_SEARCH_LIMIT: number;
export const DEV_SESSION_PATH: string;
export const START_TIME_TOLERANCE_MS: number;
export const DEV_FALLBACK_AUTH_SECRET: string;

export function buildCorsAllowedOrigins(existingValue: string | undefined, origin: string): string;
export function buildDevServerConfig(options: { port: number; baseEnv?: Env }): DevServerConfig;
export function buildDevServerCommand(options: {
  config: DevServerConfig;
  baseEnv?: Env;
  execPath?: string;
}): Invocation & { label: string; env: Env };
export function isPortAvailable(port: number): Promise<boolean>;
export function findOpenPort(options?: {
  preferredPort?: number;
  searchLimit?: number;
  portAvailabilityChecker?: (port: number) => Promise<boolean>;
}): Promise<number>;
export function isProcessAlive(pid: number | null, kill?: (target: number, signal: number) => unknown): boolean;
export function isOwnedDevProcess(
  pid: number | null,
  startedAt: number | null,
  options?: { isAlive?: (pid: number) => boolean; readInfo?: (pid: number) => Promise<ProcessInfo | null> },
): Promise<boolean>;
export function readDevSession(sessionPath?: string): DevSession | null;
export function writeDevSession(session: unknown, sessionPath?: string): void;
export function removeDevSession(sessionPath?: string): void;
export function resolveDevServerPort(options?: {
  existingSession?: unknown;
  preferredPort?: number;
  searchLimit?: number;
  portAvailabilityChecker?: (port: number) => Promise<boolean>;
  processLivenessChecker?: OwnershipCheck;
}): Promise<{ port: number; running: boolean; pid?: number | null }>;
export function releaseDevSession(options: { pid: number; sessionPath?: string }): DevSession | null;
export function stopDevSession(options: {
  session: { pid: number | null; startedAt: number | null };
  isOwned?: OwnershipCheck;
  killTree?: (pid: number) => void;
  removeSession?: () => void;
}): Promise<{ stopped: number[]; skipped: number[]; failed: Array<{ pid: number; message: string }> }>;
