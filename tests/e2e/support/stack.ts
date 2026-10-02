import { resolveAppUrl } from '../run-smoke-lib.mjs';

export const APP_URL = resolveAppUrl(process.env);
export const API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? `${APP_URL.replace(/\/$/, '')}/api`;
