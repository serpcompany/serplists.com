import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarkdownBlock } from '@/components/shared/MarkdownBlock';
import { markdownTableCell } from '@/../scripts/lib/markdownTableCell';

afterEach(cleanup);

const renderedRow = (value: string) => {
  render(<MarkdownBlock value={`| Default | Key |\n| --- | --- |\n| ${markdownTableCell(value)} | PK |`} />);
  return screen.getAllByRole('cell').map((cell) => cell.textContent);
};

describe('markdownTableCell', () => {
  it.each([
    ['a JSON default, whose backslashes would otherwise escape its quotes away', '"[\\"templates:read\\",\\"runs:read\\"]"'],
    ['a pipe, which would otherwise end the cell', 'a | b'],
    ['a backslash before a pipe', 'a\\|b'],
    ['a trailing backslash', 'C:\\'],
  ])('renders %s as the value itself, in its own cell', (_case, value) => {
    expect(renderedRow(value)).toEqual([value, 'PK']);
  });

  it('keeps a value with line breaks on its one row', () => {
    expect(renderedRow('first\nsecond')).toEqual(['first second', 'PK']);
  });
});
