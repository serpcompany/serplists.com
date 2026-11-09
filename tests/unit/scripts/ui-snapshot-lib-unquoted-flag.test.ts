import type { ParseArgsConfig } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import { parseUiSnapArgs } from '../../../scripts/ui-snapshot-lib';
import { errorThrownBy } from '../../support/thrownError';

const unquoted = vi.hoisted(() => Object.assign(new TypeError('Unknown option -x'), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' }));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    parseArgs: (config: ParseArgsConfig) => {
      if (config.args?.includes('-x')) throw unquoted;
      return actual.parseArgs(config);
    },
  };
});

describe('parseUiSnapArgs with a Node.js whose parser quotes no flag in its message', () => {
  it('still refuses the unknown flag, naming none, with the parser error as the cause', () => {
    const thrown = errorThrownBy(() => parseUiSnapArgs(['dashboard', '-x']));

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({ message: 'Unknown flag .', cause: unquoted });
  });
});
