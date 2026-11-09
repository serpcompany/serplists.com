import { describe, expect, it } from 'vitest';

import { flagValueAt } from '../../../scripts/lib/cli-flags';

const valueOf = (argv: string[], name: string) => flagValueAt(argv, argv.indexOf(name));

describe('flagValueAt', () => {
  it('reads the value after a flag', () => {
    expect(valueOf(['--env', 'staging', '--json'], '--env')).toBe('staging');
  });

  it('answers null for a flag the command line does not have', () => {
    expect(valueOf(['--json'], '--env')).toBeNull();
  });

  it('answers an empty value for a flag given without one, last or followed by another flag', () => {
    expect(valueOf(['--json', '--env'], '--env')).toBe('');
    expect(valueOf(['--env', '--json'], '--env')).toBe('');
  });
});
