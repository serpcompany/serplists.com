// Response headers for every page and API response, set in next.config.ts. The Worker renders
// pages, so Cloudflare's public/_headers file (which only covers static assets) cannot set them.

const CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.googletagmanager.com https://static.cloudflareinsights.com https://analytics.ahrefs.com",
  "frame-src 'self' https://www.googletagmanager.com https://www.youtube.com https://www.youtube-nocookie.com https://clipy.online",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: http: ws: wss:",
  "media-src 'self' blob: https:",
];

/** The policy for the deployed hosts, the same as public/_headers gives static files. */
export const CONTENT_SECURITY_POLICY = [...CONTENT_SECURITY_POLICY_DIRECTIVES, 'upgrade-insecure-requests'].join('; ');

/**
 * The policy for a server on http://localhost (next dev, `pnpm preview`, the browser tests),
 * without upgrade-insecure-requests: the browser applies it to the redirects the app's own
 * navigations follow (/dashboard to /dashboard/templates) and asks for https://localhost,
 * which nothing serves.
 */
export const LOCAL_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY_DIRECTIVES.join('; ');

/** Hostnames of local servers, as an anchored next.config.ts `has` host pattern. */
export const LOCAL_HOSTS = 'localhost|127\\.0\\.0\\.1';

/** Every header but the Content-Security-Policy, which depends on the host (next.config.ts). */
export const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
