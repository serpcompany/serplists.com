import { resolveAppUrl } from '../run-smoke-lib.mjs';

// The stack the browser tests run against: the OpenNext build of the app in workerd
// (tests/e2e/preview-server.mjs), with the pages and the API on one origin.
// tests/e2e/run-smoke.mjs picks the port and seeds the D1 it runs on.
export const APP_URL = resolveAppUrl(process.env);
export const API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? `${APP_URL.replace(/\/$/, '')}/api`;
