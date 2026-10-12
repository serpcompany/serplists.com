import { clientErrorReportSchema, scrubClientErrorReport } from '../../../src/lib/schemas/clientErrorReport';
import type { Env } from '../types';
import { crossSiteJsonRefusal } from '../utils/cross-site-guard';
import { log } from '../utils/logger';
import { readJsonPayload } from '../utils/request-json';
import { jsonError } from '../utils/response';

export async function handleClientErrors(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    const response = jsonError('Method not allowed', 405);
    response.headers.set('Allow', 'POST');
    return response;
  }

  const refusal = crossSiteJsonRefusal(request, env);
  if (refusal === 'unsupported_media_type') return jsonError('Send the error report as JSON.', 415, { code: refusal });
  if (refusal === 'origin_not_allowed') return jsonError('Origin not allowed', 403, { code: refusal });

  const read = await readJsonPayload(request, clientErrorReportSchema, 'Invalid error report');
  if ('response' in read) return read.response;

  const report = scrubClientErrorReport(read.payload);
  log('error', 'client_error', {
    kind: report.kind,
    errorName: report.name,
    errorMessage: report.message,
    stack: report.stack,
    path: report.path,
    release: report.release,
  });
  return new Response(null, { status: 204 });
}
