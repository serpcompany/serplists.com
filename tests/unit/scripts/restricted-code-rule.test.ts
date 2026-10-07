import path from 'node:path';

import { restrictedCode } from '../../../scripts/eslint-rules/restricted-code';
import { typescriptRuleTester } from '../../support/ruleTester';

const COPY = "navigator.clipboard.writeText('x');";
const CLIPBOARD = {
  selector: "MemberExpression[property.name='clipboard']",
  message: 'Copy with copyTextToClipboard.',
  owners: ['src/lib/clipboard.ts'],
};
const NO_DEBUGGER_NAMES = { selector: "Identifier[name='debuggerName']", message: 'Name it for what it holds.' };
const inFile = (file: string) => path.join(process.cwd(), ...file.split('/'));

typescriptRuleTester().run('restricted-code', restrictedCode, {
  valid: [
    { name: 'code no convention matches', code: 'copyTextToClipboard("x");', options: [[CLIPBOARD]], filename: inFile('src/views/Share.tsx') },
    { name: 'the code in the module that owns it', code: COPY, options: [[CLIPBOARD]], filename: inFile('src/lib/clipboard.ts') },
    { name: 'no conventions', code: COPY, options: [[]], filename: inFile('src/views/Share.tsx') },
  ],
  invalid: [
    {
      name: 'the code outside its owner, with the convention message',
      code: COPY,
      options: [[CLIPBOARD]],
      filename: inFile('src/views/Share.tsx'),
      errors: [{ message: CLIPBOARD.message }],
    },
    {
      name: 'a module of the same name in another folder',
      code: COPY,
      options: [[CLIPBOARD]],
      filename: inFile('src/features/clipboard.ts'),
      errors: [{ message: CLIPBOARD.message }],
    },
    {
      name: 'every convention whose selector matches, with no owner meaning nowhere',
      code: 'const debuggerName = 1; navigator.clipboard.readText();',
      options: [[CLIPBOARD, NO_DEBUGGER_NAMES]],
      filename: inFile('src/lib/clipboard.ts'),
      errors: [{ message: NO_DEBUGGER_NAMES.message }],
    },
    {
      name: 'two conventions on the same selector',
      code: COPY,
      options: [[CLIPBOARD, { ...CLIPBOARD, message: 'Show the text too.', owners: [] }]],
      filename: inFile('src/views/Share.tsx'),
      errors: [{ message: CLIPBOARD.message }, { message: 'Show the text too.' }],
    },
  ],
});
