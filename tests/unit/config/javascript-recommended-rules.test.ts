import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

const rulesReported = async (code: string, filePath: string): Promise<(string | null)[]> => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId);
};

describe("ESLint's recommended JavaScript rules on .js, .mjs and .cjs files", { timeout: 30_000 }, () => {
  it.each([
    ['scripts/lib/sample.mjs', 'export const port = defaultPort + 1;\n'],
    ['scripts/sample.js', 'export const port = defaultPort + 1;\n'],
    ['tests/e2e/sample.mjs', 'export const port = defaultPort + 1;\n'],
    ['sample.config.js', 'export const port = defaultPort + 1;\n'],
    ['scripts/sample.cjs', 'module.exports = { port: defaultPort + 1 };\n'],
  ])('refuses a name nothing defines in %s, which would throw a ReferenceError when it runs', async (filePath, code) => {
    expect(await rulesReported(code, filePath)).toContain('no-undef');
  });

  it.each(['window.location.href', 'document.title', 'localStorage.length'])(
    'refuses the browser global in %s in a Node script',
    async (expression) => {
      expect(await rulesReported(`export const value = ${expression};\n`, 'scripts/lib/sample.mjs')).toContain('no-undef');
    },
  );

  it.each(['__dirname', 'require("node:path")', 'module.exports'])(
    'refuses %s in an ES module, where Node defines no CommonJS wrapper variables',
    async (expression) => {
      expect(await rulesReported(`export const value = ${expression};\n`, 'scripts/lib/sample.mjs')).toContain('no-undef');
    },
  );

  it("lets a script use Node's own globals", async () => {
    const code = 'export const run = async () => { await fetch(process.env["URL"] ?? ""); return structuredClone(Buffer.from("x")); };\n';
    expect(await rulesReported(code, 'scripts/lib/sample.mjs')).toEqual([]);
  });

  it('lets a .cjs file use require and module.exports', async () => {
    const code = 'const path = require("node:path");\nmodule.exports = { root: path.join(__dirname, "src") };\n';
    expect(await rulesReported(code, 'sample.cjs')).toEqual([]);
  });

  it('refuses the rest of the recommended set too, such as an unused variable and a control character in a regular expression', async () => {
    const code = 'const unused = 1;\nexport const strip = (text) => text.replace(/\\u001B\\[0m/g, "");\n';
    expect(await rulesReported(code, 'scripts/lib/sample.mjs')).toEqual(['no-unused-vars', 'no-control-regex']);
  });
});
