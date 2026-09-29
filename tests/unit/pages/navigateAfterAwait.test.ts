import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const listSourceFiles = (dir: string): string[] =>
  readdirSync(new URL(`../../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return listSourceFiles(relative);
      return /\.tsx?$/.test(entry.name) ? [relative] : [];
    },
  );

// The body of `const <name> = async ...` up to its closing `};` at the same indent.
const handlerBody = (source: string, name: string): string => {
  const match = new RegExp(`^( *)const ${name} = async\\b`, 'm').exec(source);
  if (!match) {
    throw new Error(`Handler ${name} not found`);
  }

  const end = source.indexOf(`\n${match[1]}};`, match.index);
  return source.slice(match.index, end);
};

// The arguments of every `<name>(...)` call in a body, up to the matching paren.
const callArguments = (body: string, name: string): string[] => {
  const calls: string[] = [];
  const pattern = new RegExp(`\\b${name}\\(`, 'g');
  for (let match = pattern.exec(body); match; match = pattern.exec(body)) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < body.length && depth > 0) {
      if (body[index] === '(') depth += 1;
      if (body[index] === ')') depth -= 1;
      index += 1;
    }
    calls.push(body.slice(match.index + match[0].length, index - 1));
  }
  return calls;
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
  // The model opens a new run; the page reports a failure (sign-in or checkout).
  ['src/features/dashboard-templates/useDashboardTemplatesModel.ts', ['createRunFromTemplate']],
  ['src/pages/Templates.tsx', ['handleRunSubmit']],
  ['src/components/TemplateBackup.tsx', ['exportAll', 'handleConfirmImport']],
  ['src/pages/ChecklistRun.tsx', ['handleCompleteRun']],
];

// Failure reporters that can send the user to sign-in or checkout. After an await they
// must be given the visit, so they do neither once it has ended.
const FAILURE_REPORTERS = [
  'reportDashboardTemplateRunFailure',
  'handleBackupFailure',
  'handleAccessFailure',
];

// Helpers that navigate to sign-in or start a checkout redirect.
const REDIRECT_HELPER =
  /\b(?:handleUpgradeRequiredForContext|navigateToLoginWithReturnPath|startBillingCheckout|handleAccessFailure|reportDashboardTemplateRunFailure)\b/;

// Files that use those helpers only on a direct click, never after an await.
const DIRECT_CLICK_ONLY: Record<string, string> = {
  // Defines the helpers.
  'src/lib/access-flow.ts': 'defines them',
  // The editor's Upgrade and Sign in buttons; its save goes through saveTemplateForVisit.
  'src/features/template-editor/useTemplateEditorAccess.ts': 'notice buttons',
};

describe('navigation after a request', () => {
  it.each(HANDLERS)('%s acts on late results only while the user is still there', (path, names) => {
    const source = readSource(path);

    expect(source).toContain('usePageVisit()');
    for (const name of names) {
      const body = handlerBody(source, name);
      expect(body, name).toContain('beginVisit()');
      expect(body, name).toMatch(
        /isCurrent\(\)|followTemplateActionResult\(|finishDashboardTemplateRun\(|saveTemplateForVisit\(|reportDashboardTemplateRunFailure\(|handleBackupFailure\(/,
      );
      for (const reporter of FAILURE_REPORTERS) {
        for (const args of callArguments(body, reporter)) {
          expect(args, `${name} -> ${reporter}`).toMatch(/\bvisit\b/);
        }
      }
    }
  });

  it('every page that can redirect to sign-in or checkout tracks the page visit', () => {
    const unguarded = listSourceFiles('src').filter((file) => {
      if (file in DIRECT_CLICK_ONLY) return false;
      const source = readSource(file);
      return REDIRECT_HELPER.test(source) && !source.includes('usePageVisit()');
    });

    expect(unguarded).toEqual([]);
  });
});
