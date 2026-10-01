export type SiteEnvironment = "production" | "staging";

export interface SiteResponse {
  status: number;
  location: string | null;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: string;
}

export type SiteRequest = (
  url: string,
  options: { host?: string | undefined; headers: Record<string, string> },
) => Promise<SiteResponse>;

export interface SiteStandardsResult {
  passed: number;
  failed: number;
  lines: string[];
}

export const SMOKE_TEST_HEADER: string;

export function getWithoutFollowingRedirects(
  url: string,
  options?: { host?: string | undefined; headers?: Record<string, string>; timeoutMs?: number },
): Promise<SiteResponse>;
export function checkSiteStandards(options: {
  baseUrl: string;
  siteEnv: SiteEnvironment;
  local?: boolean;
  request?: SiteRequest;
}): Promise<SiteStandardsResult>;
