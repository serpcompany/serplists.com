import { describe, expect, it } from 'vitest';

import { proseLines } from '../../../../scripts/checks/doc-rules/markdown';
import { checkLines, productCheckProblems, quotedTitles } from '../../../../scripts/checks/doc-rules/product-checks';
import { hasTitle, isTestFile, testTitles } from '../../../../scripts/checks/doc-rules/test-titles';

const SPEC = 'tests/e2e/templates.spec.ts';
const READS = 'tests/unit/functions/api/template-reads.test.ts';
const CARD = 'src/components/checklist-library/TemplateCard.test.tsx';

const testSources: Record<string, string> = {
  [SPEC]: [
    "test.describe('duplicating', () => {",
    "  test('@smoke duplicating a template names the copy with Copy', async () => {});",
    "  test(`a runner sees a read-only notice on ${'a Run'}`, async () => {});",
    "  test.step('a step is not a test', async () => {});",
    '});',
  ].join('\n'),
  [READS]: [
    "describe('template reads', () => {",
    "  it('returns the public catalog when no scope is given', () => {});",
    "  it.each([1, 2])('reads page %s', () => {});",
    '});',
  ].join('\n'),
  [CARD]: "it('names the Organization that owns a Template', () => {});",
};

const context = {
  isRepositoryFile: (file: string) => file in testSources,
  titlesOf: (file: string) => testTitles(file, testSources[file] ?? ''),
};

const doc = (...lines: string[]) =>
  productCheckProblems(
    proseLines(
      [
        '# Templates',
        '',
        `Abbreviations: **Templates spec** is \`${SPEC}\`, **Template reads** is`,
        `\`${READS}\`, and **Template card** is \`${CARD}\`.`,
        '',
        ...lines,
      ].join('\n'),
    ),
    context,
  );

describe('the tests a product doc can name', () => {
  it('are the files Vitest and Playwright run, in tests/ and beside the code in src/', () => {
    expect([SPEC, READS, CARD, 'tests/unit/functions/r2.test.mjs'].every(isTestFile)).toBe(true);
    expect(['tests/support/apiRequest.ts', 'src/lib/progress.ts', 'tests/e2e/run-smoke.ts'].some(isTestFile)).toBe(false);
  });

  it("are titled by the first argument of it, test, describe and each, with a template literal's fixed parts in order", () => {
    const titles = testTitles(SPEC, testSources[SPEC] ?? '');
    expect(hasTitle(titles, 'duplicating')).toBe(true);
    expect(hasTitle(titles, 'a runner sees a read-only notice on a shared Run')).toBe(true);
    expect(hasTitle(titles, 'a step is not a test')).toBe(false);
    expect(hasTitle(testTitles(READS, testSources[READS] ?? ''), 'reads page %s')).toBe(true);
  });

  it('may leave out a Playwright tag and wrap across lines', () => {
    const titles = testTitles(SPEC, testSources[SPEC] ?? '');
    expect(hasTitle(titles, 'duplicating a template\n  names the copy with Copy')).toBe(true);
    expect(hasTitle(titles, '@smoke duplicating a template names the copy with Copy')).toBe(true);
  });
});

describe('a check line', () => {
  it('names one abbreviation and one or more quoted titles joined by a comma or "and", wrapped or not', () => {
    expect(quotedTitles('"one", "two, with a comma" and "three says "hi"".')).toEqual(['one', 'two, with a comma', 'three says "hi"']);
    expect(checkLines(proseLines('- Check: Templates spec, "a runner sees"\n  and "an editor can save".'))).toEqual([
      { line: 1, abbreviation: 'Templates spec', titles: ['a runner sees', 'an editor can save'] },
    ]);
  });

  it('passes when every title is a test in the file its abbreviation names, src/ tests included', () => {
    expect(
      doc(
        '- A template can be duplicated.',
        '  - Check: Templates spec, "duplicating a template names the copy with Copy" and "duplicating".',
        '- Check: Template reads, "returns the public catalog when no scope is given".',
        '- Check: Template card, "names the Organization that owns a Template".',
        '- No automated check yet.',
      ),
    ).toEqual([]);
  });

  it("fails a title no test in the file has, saying to give the doc the test's new title or restore the test", () => {
    expect(doc('- Check: Template reads, "returns the catalog"')).toEqual([
      {
        line: 6,
        problem: `names "returns the catalog" in ${READS}, and no test there has that title: give the doc the test's new title, or restore the test`,
      },
    ]);
  });

  it('fails an abbreviation the doc does not define, and a line with no quoted title', () => {
    expect(doc('- Check: Billing spec, "charges once".', '- Check: Templates spec, duplicating.').map(({ problem }) => problem)).toEqual([
      "names Billing spec, which the doc's Abbreviations line doesn't define: add **Billing spec** is `<test file>` to it",
      'is a check line without a quoted test title: write - Check: <Abbreviation>, "<test title>"',
    ]);
  });

  it('fails an abbreviation that names a file that is not a test in the repository', () => {
    const problems = productCheckProblems(
      proseLines('Abbreviations: **Gone spec** is `tests/e2e/gone.spec.ts`, and **Helper** is `tests/support/apiRequest.ts`.'),
      context,
    );
    expect(problems.map(({ problem }) => problem)).toEqual([
      "names tests/e2e/gone.spec.ts as Gone spec, which isn't a test file in the repository: name the test file its checks come from",
      "names tests/support/apiRequest.ts as Helper, which isn't a test file in the repository: name the test file its checks come from",
    ]);
  });
});
