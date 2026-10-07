import type { z } from "zod";

import { env } from "@/env";
import { ApiError, createApiError, UNREADABLE_RESPONSE_CODE, UNREADABLE_RESPONSE_MESSAGE } from "@/lib/api-errors";
import { reportUnauthorizedResponse } from "@/lib/unauthorizedResponses";
import { resolveApiBaseUrl } from "@/lib/apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl({
  configuredUrl: env.NEXT_PUBLIC_API_URL,
  pageHostname: typeof window === 'undefined' ? undefined : window.location.hostname,
});

export type ResponseSchema<Output> = z.ZodType<Output, z.ZodTypeDef, unknown>;

export const getAgentMcpEndpoint = (origin?: string): string => {
  const endpoint = `${API_BASE_URL}/mcp`;
  if (/^https?:\/\//i.test(endpoint) || !origin) return endpoint;
  return new URL(endpoint, origin).toString();
};

const unreadableResponse = (status: number, cause: unknown, issues: unknown): ApiError =>
  new ApiError({ status, message: UNREADABLE_RESPONSE_MESSAGE, code: UNREADABLE_RESPONSE_CODE, details: { issues }, cause });

async function readResponse<Output>(response: Response, schema: ResponseSchema<Output>): Promise<Output> {
  if (!response.ok) {
    if (response.status === 401) reportUnauthorizedResponse();
    const errorBody: unknown = await response.json().catch(() => undefined);
    throw createApiError(response.status, errorBody);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw unreadableResponse(response.status, error, []);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unreadableResponse(response.status, parsed.error, parsed.error.issues);
  return parsed.data;
}

export async function apiRequest<Output>(
  endpoint: string,
  schema: ResponseSchema<Output>,
  options: RequestInit = {},
): Promise<Output> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  return readResponse(response, schema);
}

export async function apiFormDataRequest<Output>(
  endpoint: string,
  formData: FormData,
  schema: ResponseSchema<Output>,
): Promise<Output> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {},
    body: formData,
    credentials: 'include',
  });
  return readResponse(response, schema);
}
