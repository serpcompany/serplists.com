export const D1_REFUSAL = 'D1 is unavailable';

const TABLE_SIZES ={ templates: 50, checklist_runs: 120, users: 20, audit_events: 7, template_versions: 3, team_invites: 1 };

export const LOCAL_D1_STAND_IN_FILES = {
  'register-local-d1-stand-in.mjs': [
    "import { register } from 'node:module';",
    "register('./local-d1-stand-in-hooks.mjs', import.meta.url);",
    '',
  ].join('\n'),
  'local-d1-stand-in-hooks.mjs': [
    "const standIn = new URL('./local-d1-stand-in.mjs', import.meta.url).href;",
    'export async function resolve(specifier, context, nextResolve) {',
    "  return specifier === 'wrangler' ? { url: standIn, shortCircuit: true } : nextResolve(specifier, context);",
    '}',
    '',
  ].join('\n'),
  'local-d1-stand-in.mjs': [
    `const refusal = ${JSON.stringify(D1_REFUSAL)};`,
    `const tableSizes = ${JSON.stringify(TABLE_SIZES)};`,
    'const statement = () => ({ bind: () => statement(), all: async () => { throw new Error(refusal); }, first: async () => tableSizes });',
    'export async function getPlatformProxy() {',
    '  return { env: { DB: { prepare: () => statement() } }, dispose: async () => undefined };',
    '}',
    '',
  ].join('\n'),
};
