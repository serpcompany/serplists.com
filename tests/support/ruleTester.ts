import { Linter, type Rule, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import { z } from 'zod';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const javascriptRuleTester = () => new RuleTester();

export const typescriptRuleTester = () =>
  new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } });

type ParsedForESLint = ReturnType<typeof tseslint.parser.parseForESLint> & { visitorKeys?: unknown };

const eslintParseResult = z.custom<Linter.ESLintParseResult>((parsed) => typeof parsed === 'object' && parsed !== null && 'ast' in parsed);

export const typescriptParserThatEdits = (edit: (parsed: ParsedForESLint) => ParsedForESLint): Linter.Parser => ({
  meta: { name: 'typescript-eslint, edited' },
  parseForESLint: (code: string) => eslintParseResult.parse(edit(tseslint.parser.parseForESLint(code))),
});

export const linesReportedBy = (rule: Rule.RuleModule, code: string, { parser = tseslint.parser, filename = 'file.ts' }: { parser?: Linter.Parser; filename?: string } = {}) =>
  new Linter({ configType: 'flat' })
    .verify(code, [{ files: ['**/*.ts'], languageOptions: { parser }, plugins: { probe: { rules: { rule } } }, rules: { 'probe/rule': 'error' } }], { filename })
    .map((message) => (message.ruleId === 'probe/rule' ? message.line : `${String(message.ruleId)}: ${message.message}`));
