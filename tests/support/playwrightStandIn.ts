import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { REPO_ROOT } from '../../scripts/lib/run-tool';

const realPlaywright = pathToFileURL(createRequire(path.join(REPO_ROOT, 'package.json')).resolve('@playwright/test')).href.replace(/\.js$/, '.mjs');

const RECORD = 'playwright-stand-in.jsonl';

const browserStandIn =
  [
    'import { appendFileSync, writeFileSync } from "node:fs";',
    `export { devices } from ${JSON.stringify(realPlaywright)};`,
    '',
    `const record = (entry) => appendFileSync(${JSON.stringify(RECORD)},\`\${JSON.stringify(entry)}\\n\`);`,
    'const all = (html, pattern) => [...html.matchAll(pattern)].map((match) => match[1]);',
    '',
    'function aPage() {',
    '  const listeners = new Map();',
    '  const emit = (event, value) => (listeners.get(event) ?? []).forEach((listener) => listener(value));',
    '  const loaded = { url: "about:blank", html: "" };',
    '  const responded = (response) => emit("response", { status: () => response.status, url: () => response.url, request: () => ({ method: () => "GET" }) });',
    '  return {',
    '    on: (event, listener) => listeners.set(event, [...(listeners.get(event) ?? []), listener]),',
    '    async goto(url, options) {',
    '      record({ goto: url, options });',
    '      const response = await fetch(url);',
    '      Object.assign(loaded, { url: response.url, html: await response.text() });',
    '      responded(response);',
    '      for (const source of all(loaded.html, /\\ssrc="([^"]+)"/g)) responded(await fetch(new URL(source, response.url)));',
    '      for (const text of all(loaded.html, /<script>console\\.error\\("([^"]*)"\\)<\\/script>/g)) emit("console", { type: () => "error", text: () => text });',
    '      for (const text of all(loaded.html, /<script>console\\.log\\("([^"]*)"\\)<\\/script>/g)) emit("console", { type: () => "log", text: () => text });',
    '      for (const text of all(loaded.html, /<script>throw new Error\\("([^"]*)"\\)<\\/script>/g)) emit("pageerror", new Error(text));',
    '      return response;',
    '    },',
    '    async screenshot(options) {',
    '      record({ screenshot: options });',
    '      writeFileSync(options.path, `a screenshot of ${loaded.url}`);',
    '    },',
    '    locator: (selector) => ({',
    '      ariaSnapshot: async () => {',
    '        record({ ariaSnapshotOf: selector });',
    '        return all(loaded.html, /<h1>([^<]*)<\\/h1>/g).map((heading) => `- heading "${heading}" [level=1]`).join("\\n");',
    '      },',
    '    }),',
    '    url: () => loaded.url,',
    '    title: async () => all(loaded.html, /<title>([^<]*)<\\/title>/g).join(""),',
    '  };',
    '}',
    '',
    'const signIn = async (url, { data, headers }) => {',
    '  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) });',
    '  return { ok: () => response.ok, status: () => response.status };',
    '};',
    '',
    'export const chromium = {',
    '  async launch() {',
    '    record({ launched: true });',
    '    return {',
    '      async newContext(options) {',
    '        record({ context: options });',
    '        return { request: { post: signIn }, newPage: async () => aPage() };',
    '      },',
    '      async close() {',
    '        record({ closed: true });',
    '      },',
    '    };',
    '  },',
    '};',
    '',
  ].join('\n');

export const PLAYWRIGHT_STAND_IN = {
  '@playwright/test': {
    'package.json': JSON.stringify({ name: '@playwright/test', version: '0.0.0-stand-in', type: 'module', exports: './index.mjs' }),
    'index.mjs': browserStandIn,
  },
};

const recordedSchema = z.array(z.record(z.unknown()));

export const whatTheBrowserWasAskedIn = (folder: string) =>
  recordedSchema.parse(
    readFileSync(path.join(folder, RECORD), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line): unknown => JSON.parse(line)),
  );
