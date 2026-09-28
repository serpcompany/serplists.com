import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// The body of `const <name> = async ...` up to its closing `};` at the same indent.
const handlerBody = (source: string, name: string): string => {
  const match = new RegExp(`^( *)const ${name} = async\\b`, 'm').exec(source);
  if (!match) {
    throw new Error(`Handler ${name} not found`);
  }

  const end = source.indexOf(`\n${match[1]}};`, match.index);
  return source.slice(match.index, end);
};

// These handlers await a request and then move the user (to a new run or template,
// back to a list, to sign-in or checkout). React Router still runs a navigate() from a
// page the user already left, so each one starts a page visit before the request and
// acts on the result only while that visit is current (see usePageVisit).
const HANDLERS: Array<[string, string[]]> = [
  ['src/pages/TemplateEditor.tsx', ['handleSave']],
  [
    'src/pages/TemplateDetail.tsx',
    ['handleStartRun', 'handleShare', 'handleCloneTemplate', 'handleDelete'],
  ],
  ['src/pages/PublicTemplate.tsx', ['handleStartRun', 'handleSaveTemplate']],
  ['src/features/dashboard-templates/useDashboardTemplatesModel.ts', ['createRunFromTemplate']],
  ['src/pages/ChecklistRun.tsx', ['handleCompleteRun']],
];

describe('navigation after a request', () => {
  it.each(HANDLERS)('%s acts on late results only while the user is still there', (path, names) => {
    const source = readSource(path);

    expect(source).toContain('usePageVisit()');
    for (const name of names) {
      const body = handlerBody(source, name);
      expect(body, name).toContain('beginVisit()');
      expect(body, name).toMatch(/isCurrent\(\)|followTemplateActionResult\(|finishDashboardTemplateRun\(/);
    }
  });
});
