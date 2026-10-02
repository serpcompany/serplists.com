import { env } from "@/env";
import { createApiError } from "@/lib/api-errors";
import { reportUnauthorizedResponse } from "@/lib/unauthorizedResponses";
import { resolveApiBaseUrl } from "@/lib/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl({
  configuredUrl: env.NEXT_PUBLIC_API_URL,
  pageHostname: typeof window === 'undefined' ? undefined : window.location.hostname,
});

export const getAgentMcpEndpoint = (origin?: string): string => {
  const endpoint = `${API_BASE_URL}/mcp`;
  if (/^https?:\/\//i.test(endpoint) || !origin) return endpoint;
  return new URL(endpoint, origin).toString();
};

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) reportUnauthorizedResponse();
    const error = await response.json().catch(() => undefined);
    throw createApiError(response.status, error);
  }

  return response.json() as Promise<T>;
}

export async function apiFormDataRequest<T>(endpoint: string, formData: FormData): Promise<T> {
  const headers: HeadersInit = {};

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) reportUnauthorizedResponse();
    const error = await response.json().catch(() => undefined);
    throw createApiError(response.status, error);
  }

  return response.json() as Promise<T>;
}
