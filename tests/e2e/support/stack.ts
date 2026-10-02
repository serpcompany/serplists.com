import { resolveAppUrl } from '../run-smoke-lib';

export const APP_URL = resolveAppUrl(process.env);
export const API_BASE_URL = process.env['PLAYWRIGHT_API_URL'] ?? `${APP_URL.replace(/\/$/, '')}/api`;
