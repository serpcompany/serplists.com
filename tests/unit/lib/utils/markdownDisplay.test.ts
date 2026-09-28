import { describe, expect, it } from 'vitest';

import { expandLegacyEscapedNewlines } from '@/lib/utils/markdownDisplay';

// Text is shown as saved. The one exception is the legacy shape of the official seed:
// a single-line text block with literal backslash-n pairs standing in for line breaks.
// Anything else that contains a backslash followed by n (code, Windows paths) must
// survive untouched.

const BS = '\\';

describe('expandLegacyEscapedNewlines', () => {
  it('leaves text that has real line breaks exactly as saved', () => {
    const typed = [
      'Save the export to C:\\new_folder\\notes.txt',
      '',
      '```c',
      'printf("hi\\n");',
      '```',
      'Inline: `printf("a\\n")`',
    ].join('\n');

    expect(expandLegacyEscapedNewlines(typed)).toBe(typed);
    expect(expandLegacyEscapedNewlines('first\r\nsecond \\n kept')).toBe('first\r\nsecond \\n kept');
  });

  it('expands the single-line seed shape into line breaks', () => {
    expect(
      expandLegacyEscapedNewlines(
        '- Verify `robots.txt` returns `200`.\\n- Confirm paths.\\n\\nUseful: https://example.com',
      ),
    ).toBe('- Verify `robots.txt` returns `200`.\n- Confirm paths.\n\nUseful: https://example.com');
    expect(expandLegacyEscapedNewlines('one\\r\\ntwo')).toBe('one\ntwo');
  });

  it('never touches a backslash-n inside inline code', () => {
    expect(expandLegacyEscapedNewlines('Run `printf("a\\n")` then\\nsubmit')).toBe(
      'Run `printf("a\\n")` then\nsubmit',
    );
    expect(expandLegacyEscapedNewlines('Use ``a ` b\\n`` here\\nnext')).toBe(
      'Use ``a ` b\\n`` here\nnext',
    );
  });

  it('keeps an escaped backslash before n', () => {
    expect(expandLegacyEscapedNewlines(`a${BS}${BS}n b`)).toBe(`a${BS}${BS}n b`);
    expect(expandLegacyEscapedNewlines(`a${BS}${BS}${BS}nb`)).toBe(`a${BS}${BS}\nb`);
  });

  it('does not let an escaped backtick open a code span', () => {
    expect(expandLegacyEscapedNewlines('tick \\` here\\nnext `x`')).toBe(
      'tick \\` here\nnext `x`',
    );
  });

  it('treats an unmatched backtick run as plain text', () => {
    expect(expandLegacyEscapedNewlines('a ` b\\nc')).toBe('a ` b\nc');
  });

  it('returns text without a backslash-n unchanged', () => {
    expect(expandLegacyEscapedNewlines('Plain text')).toBe('Plain text');
    expect(expandLegacyEscapedNewlines('')).toBe('');
  });
});
