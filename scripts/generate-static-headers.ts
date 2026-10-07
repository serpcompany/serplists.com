import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderStaticHeaders } from '../src/lib/http/securityHeaders';
import { isProductionSite } from '../src/lib/seo/siteOrigin';

const outputPath = path.join(process.cwd(), 'public', '_headers');
const production = isProductionSite();

await writeFile(outputPath, renderStaticHeaders({ production }), 'utf8');
console.log(`Wrote public/_headers for a ${production ? 'production' : 'non-production'} build (SITE_ENV=${process.env['SITE_ENV'] ?? ''})`);
