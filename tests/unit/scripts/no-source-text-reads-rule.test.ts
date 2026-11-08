import path from 'node:path';

import { noSourceTextReads } from '../../../scripts/eslint-rules/no-source-text-reads';
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
    inATest('reading standard input', "readFileSync(0, 'utf8');"),
    inATest('a path destructured from options the test cannot know', "const { file } = options; readFileSync(file, 'utf8');"),
    inATest('importing a module a factory call returns', "createRequire(import.meta.url)('./fixture.json');"),
    inATest('importing source modules with import.meta.glob to run them', "import.meta.glob('/src/**/*.tsx', { eager: true });"),
    inATest('globbing fixtures as raw text', "import.meta.glob('../../fixtures/*.xsd', { query: '?raw', import: 'default' });"),
    inATest('a raw import from a package', "import css from 'some-package/dist/theme.css?raw';"),
    inATest('a raw import of a source-named file outside the repository', "import outside from '../../../../elsewhere/src/a.ts?raw';"),
    inATest('a dynamic import of a computed specifier', 'await import(modulePath);'),
    inATest(
      'reading a file whose path the test cannot know',
      "const read = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8'); read(process.argv[2]);",
    ),
    inATest('a path in a declared const that has no value', "declare const LAYOUT: string; readFileSync(LAYOUT, 'utf8');"),
    inATest('a glob whose query it cannot read', "import.meta.glob('/src/**/*.ts', { query: rawQuery });"),
    inATest('a const that names itself, without following it forever', "const dir = path.join(dir, 'x'); readFileSync(dir, 'utf8');"),
    inATest('a file without an extension in a source folder', "readFileSync('functions/Dockerfile', 'utf8');"),
    inATest('a path an anonymous default export reads', "export default function (file: string) { return readFileSync(file, 'utf8'); }"),
    inATest('a path a callback reads', "files.map((file) => readFileSync(file, 'utf8'));"),
    inATest('a read with no path', 'readFileSync();'),
    inATest(
      'a path a local function builds from an argument it destructures, which it does not follow',
      "const appFile = ({ route }: Page) => `src/app/${route}`; readFileSync(appFile(page), 'utf8');",
    ),
    inATest('a dynamic import of a literal that names no module', 'await import(42);'),
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
      ...inATest('a path concatenated to the repository root', "readFileSync(repoRoot + '/src/lib/theme.ts', 'utf8');"),
      errors: [reads('src/lib/theme.ts')],
    },
    {
      ...inATest(
        'a path a URL names through fileURLToPath',
        "readFileSync(fileURLToPath(new URL('../../../src/app/layout.tsx', import.meta.url)), 'utf8');",
      ),
      errors: [reads('src/app/layout.tsx')],
    },
    {
      ...inATest(
        'a path from a loop over spread names and a literal',
        "for (const page of [...pages, 'src/app/b/page.tsx']) readFileSync(page, 'utf8');",
      ),
      errors: [reads('src/app/b/page.tsx')],
    },
    {
      ...inATest(
        'a path a function declaration receives',
        "function readSource(file: string) { return readFileSync(path.join(root, file), 'utf8'); } readSource('functions/api/db.ts');",
      ),
      errors: [reads('functions/api/db.ts')],
    },
    {
      ...inATest('a raw import.meta.glob in the older as: raw form', "import.meta.glob('/functions/**/*.ts', { as: 'raw' });"),
      errors: [reads('functions/**/*.ts')],
    },
    {
      ...inATest(
        'each source pattern of a raw import.meta.glob',
        "import.meta.glob(['/src/lib/*.ts', '../../fixtures/*.xsd', '@functions/api/*.ts'], { query: '?raw' });",
      ),
      errors: [reads('src/lib/*.ts'), reads('functions/api/*.ts')],
    },
    {
      ...inATest('a raw import.meta.glob', "import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default' });"),
      errors: [reads('src/**/*.tsx')],
    },
    {
      ...inATest('a template literal with arithmetic in it', 'readFileSync(`src/app/${index * 2}.ts`, "utf8");'),
      errors: [reads('src/app/*.ts')],
    },
    {
      ...inATest(
        'a path a wrapper receives beside options it destructures, once it is given one',
        "const readSource = (file: string, { encoding }: Options) => readFileSync(file, encoding); readSource(); readSource('src/lib/theme.ts', options);",
      ),
      errors: [reads('src/lib/theme.ts')],
    },
    {
      ...inATest('the source pattern of a raw import.meta.glob with a hole in its list', "import.meta.glob(['/src/lib/*.ts', , ], { query: '?raw' });"),
      errors: [reads('src/lib/*.ts')],
    },
  ],
});
