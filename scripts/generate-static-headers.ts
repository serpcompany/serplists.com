// Writes public/_headers for this build: the headers Workers Static Assets gives the static
// files it serves without running the Worker, from src/lib/http/securityHeaders.ts, noindex
// unless SITE_ENV=production. `pnpm run build` runs it before `next build`, and OpenNext copies
// public/ into the Worker's assets, so each environment's build carries its own. Generated at
// every build and never committed (.gitignore).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderStaticHeaders } from '../src/lib/http/securityHeaders';
import { isProductionSite } from '../src/lib/seo/siteOrigin';

const outputPath = path.join(process.cwd(), 'public', '_headers');
const production = isProductionSite();

await writeFile(outputPath, renderStaticHeaders({ production }), 'utf8');
console.log(`Wrote public/_headers for a ${production ? 'production' : 'non-production'} build (SITE_ENV=${process.env.SITE_ENV ?? ''})`);
