import path from 'node:path';

import { noSourceTextReads } from '../../../scripts/eslint-rules/no-source-text-reads.mjs';
import { typescriptRuleTester } from '../../support/ruleTester';

const aTestFile = path.join(process.cwd(), 'tests', 'unit', 'lib', 'sample.test.ts');
const reads = (named: string) => ({ messageId: 'behaviorNotText', data: { path: named } });
const inATest = (name: string, code: string) => ({ name, code, filename: aTestFile });

typescriptRuleTester().run('no-source-text-reads', noSourceTextReads, {
  valid: [
    inATest('reading harness configuration', "readFileSync('package.json', 'utf8');"),
    inATest(
      'reading data the app ships as JSON',
      "JSON.parse(readFileSync('src/data/public-template-packs/foundational-checklists.json', 'utf8'));",
    ),
    inATest('reading a test fixture', "readFileSync(new URL('../../fixtures/sitemap.xsd', import.meta.url), 'utf8');"),
    inATest(
      'reading a file of the same name in a throwaway repository',
      "const repo = mkdtempSync('x'); readFileSync(path.join(repo, 'functions/sitemap/bundled-catalog.generated.json'), 'utf8');",
    ),
    inATest('writing a source-named file into a throwaway repository', "writeFileSync(path.join(repo, 'src/views/Index.tsx'), '');"),
    inATest('checking that a route file exists', "existsSync(new URL('../../../src/app/(site)/page.tsx', import.meta.url));"),
    inATest('importing a module to run it', "import { applyStoredTheme } from '@/lib/theme';"),
    inATest('importing a fixture as raw text', "import schema from '../../fixtures/sitemap.xsd?raw';"),
    inATest('listing the browser specs, which are tests', "readdirSync(path.join(repoRoot, 'tests/e2e'));"),
    inATest(
      'reading a file whose path the test cannot know',
      "const read = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8'); read(process.argv[2]);",
    ),
  ],
  invalid: [
    { ...inATest('a literal path', "readFileSync('src/app/layout.tsx', 'utf8');"), errors: [reads('src/app/layout.tsx')] },
    {
      ...inATest(
        'a path joined to the repository root',
        "const repoRoot = process.cwd(); readFileSync(path.join(repoRoot, 'functions/api/[[route]].ts'), 'utf8');",
      ),
      errors: [reads('functions/api/[[route]].ts')],
    },
    {
      ...inATest('a stylesheet through a URL', "readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8');"),
      errors: [reads('src/app/globals.css')],
    },
    {
      ...inATest(
        'a template literal with an unknown folder',
        'readFileSync(new URL(`../../../src/app/${group}/layout.tsx`, import.meta.url), "utf8");',
      ),
      errors: [reads('src/app/*/layout.tsx')],
    },
    {
      ...inATest('a path in a const', "const LAYOUT = 'src/app/layout.tsx'; readFileSync(LAYOUT, 'utf8');"),
      errors: [reads('src/app/layout.tsx')],
    },
    {
      ...inATest(
        'a path a wrapper function receives',
        "const readSource = (file: string) => readFileSync(path.join(root, file), 'utf8'); readSource('src/views/Pricing.tsx');",
      ),
      errors: [reads('src/views/Pricing.tsx')],
    },
    {
      ...inATest('a path from a loop over literals', "for (const page of ['src/app/a/page.tsx']) readFileSync(page, 'utf8');"),
      errors: [reads('src/app/a/page.tsx')],
    },
    {
      ...inATest(
        'a path a local function builds',
        "const appFile = (route: string) => new URL(`../../../src/app/${route}`, import.meta.url); readFileSync(appFile('layout.tsx'), 'utf8');",
      ),
      errors: [reads('src/app/layout.tsx')],
    },
    {
      ...inATest('promises.readFile', "await fs.promises.readFile('src/lib/theme.ts', 'utf8');"),
      errors: [reads('src/lib/theme.ts')],
    },
    { ...inATest('a walk of src', "readdirSync('src', { recursive: true });"), errors: [reads('src')] },
    {
      ...inATest('a walk of an API folder', "readdirSync(path.resolve(__dirname, '../../../functions/api/handlers'));"),
      errors: [reads('functions/api/handlers')],
    },
    {
      ...inATest(
        'each file a walk found in a source folder',
        "const dir = 'src/components'; for (const name of names) readFileSync(path.join(dir, name), 'utf8');",
      ),
      errors: [reads('src/components/*')],
    },
    { ...inATest('a ?raw import through the alias', "import layout from '@/app/layout.tsx?raw';"), errors: [reads('src/app/layout.tsx')] },
    {
      ...inATest('a relative ?raw import', "import db from '../../../functions/api/db.ts?raw';"),
      errors: [reads('functions/api/db.ts')],
    },
    { ...inATest('a dynamic ?raw import', "await import('@functions/api/db.ts?raw');"), errors: [reads('functions/api/db.ts')] },
    {
      ...inATest('a raw import.meta.glob', "import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default' });"),
      errors: [reads('src/**/*.tsx')],
    },
  ],
});
