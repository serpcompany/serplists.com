import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Pages Next.js prerenders at build time (the marketing pages and sign-in forms) are read from
// the Worker's static assets, and cache interception answers them without loading the Next.js
// server, so they cost the Worker almost no CPU. Every other page renders per request and the
// app never revalidates on a timer, which the read-only static assets cache cannot do.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
