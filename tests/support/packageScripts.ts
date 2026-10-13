import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const packageScripts = z
  .object({ scripts: z.record(z.string()) })
  .parse(JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))).scripts;
