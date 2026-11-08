export const apiLine = (fields: Record<string, unknown>) =>
  JSON.stringify({ level: 'info', timestamp: '2026-09-30T18:58:38.000Z', ...fields });

export const apiRequest = (requestId: string, method: string, apiPath: string, status: number, durationMs: number, timestamp: string) =>
  apiLine({ message: 'api_request', requestId, method, path: apiPath, status, durationMs, timestamp });
