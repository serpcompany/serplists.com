import { describe, expect, it } from 'vitest';

import { checkDependencies, cruise } from '../../../../scripts/checks/dependencies';
import { scratchRepository } from './scratch';

const RULE_COMMENT = 'Screens never call the transport: move the request into the feature that owns it.';
const config = `module.exports = {
  forbidden: [
    {
      name: "screens-do-not-call-transport",
      severity: "error",
      comment: "${RULE_COMMENT}",
      from: { path: "^src/screen\\\\.js$" },
      to: { path: "^src/transport\\\\.js$" },
    },
  ],
};
`;

const project = (screen: string) =>
  scratchRepository('dependencies', {
    '.dependency-cruiser.cjs': config,
    'src/screen.js': screen,
    'src/feature.js': "import { send } from './transport.js';\nexport const load = () => send();\n",
    'src/transport.js': 'export const send = () => 1;\n',
  });

describe('the dependency check', { timeout: 60_000 }, () => {
  it("fails an import a rule forbids, and prints the rule's comment, which says where the code belongs", () => {
    const report = cruise(project("import { send } from './transport.js';\nexport const screen = send;\n"), '.dependency-cruiser.cjs', ['src']);
    expect(report[0]).toBe('error screens-do-not-call-transport: src/screen.js → src/transport.js');
    expect(report.join(' ').replace(/\s+/g, ' ')).toContain(RULE_COMMENT);
  });

  it('passes imports the rules allow', () => {
    expect(cruise(project("import { load } from './feature.js';\nexport const screen = load;\n"), '.dependency-cruiser.cjs', ['src'])).toEqual([]);
  });

  it('leaves a run alone whose paths hold none of the code it cruises', () => {
    expect(checkDependencies('a folder it never reads', ['docs/agents'])).toEqual([]);
  });
});
