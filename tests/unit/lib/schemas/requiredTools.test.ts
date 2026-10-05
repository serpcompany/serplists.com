import { describe, expect, it } from 'vitest';

import {
  readRequiredTools,
  REQUIRED_TOOL_NAME_MAX,
  REQUIRED_TOOL_URL_MAX,
  REQUIRED_TOOLS_MAX,
  requiredToolsSchema,
  toStoredRequiredTools,
} from '@/lib/schemas/requiredTools';

const timeTracker = { name: 'Time tracker', url: 'https://example.com/track', required: true };
const slides = { name: 'Slides', url: 'http://example.com/slides?deck=1#intro', required: false };

const urlOfLength = (length: number) => {
  const prefix = 'https://example.com/';
  return `${prefix}${'a'.repeat(length - prefix.length)}`;
};

const firstIssue = (tools: unknown) => {
  const result = requiredToolsSchema.safeParse(tools);
  return result.success ? null : result.error.issues[0]?.message;
};

describe('a Template\'s Required tools, each a name, an http or https URL, and required or optional', () => {
  it('accepts tools with a name, a web URL in any letter case, and a required flag', () => {
    const tools = [timeTracker, slides, { name: 'Wiki', url: 'HTTPS://Example.com/日本', required: true }];

    expect(requiredToolsSchema.parse(tools)).toEqual(tools);
  });

  it('reads a tool without a required flag as required, and drops keys a tool does not have', () => {
    expect(requiredToolsSchema.parse([{ name: 'Timer', url: 'https://example.com', note: 'x' }])).toEqual([
      { name: 'Timer', url: 'https://example.com', required: true },
    ]);
  });

  it.each([
    ['a script URL', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<b>hi</b>'],
    ['a mail link', 'mailto:team@example.com'],
    ['an FTP URL', 'ftp://example.com/file'],
    ['a URL with no host', 'https://'],
    ['a URL with no scheme', 'example.com/track'],
    ['a URL with a space', 'https://example.com/time tracker'],
    ['a URL that starts with a space', ' https://example.com'],
    ['a URL with a quote', 'https://example.com/"onmouseover'],
  ])('refuses %s', (_label, url) => {
    expect(firstIssue([{ ...timeTracker, url }])).toBe('Tool URLs must start with http:// or https://');
  });

  it('refuses a tool with no name or a blank one', () => {
    expect(firstIssue([{ ...timeTracker, name: '' }])).toBe('Give each tool a name');
    expect(firstIssue([{ ...timeTracker, name: '   ' }])).toBe('Give each tool a name');
  });

  it(`keeps names to ${REQUIRED_TOOL_NAME_MAX} characters, URLs to ${REQUIRED_TOOL_URL_MAX} and a list to ${REQUIRED_TOOLS_MAX} tools`, () => {
    expect(firstIssue([{ ...timeTracker, name: 'n'.repeat(REQUIRED_TOOL_NAME_MAX) }])).toBeNull();
    expect(firstIssue([{ ...timeTracker, name: 'n'.repeat(REQUIRED_TOOL_NAME_MAX + 1) }])).toBe('Tool names must be 80 characters or fewer');
    expect(firstIssue([{ ...timeTracker, url: urlOfLength(REQUIRED_TOOL_URL_MAX) }])).toBeNull();
    expect(firstIssue([{ ...timeTracker, url: urlOfLength(REQUIRED_TOOL_URL_MAX + 1) }])).toBe('Tool URLs must be 2048 characters or fewer');
    expect(firstIssue(Array.from({ length: REQUIRED_TOOLS_MAX }, () => timeTracker))).toBeNull();
    expect(firstIssue(Array.from({ length: REQUIRED_TOOLS_MAX + 1 }, () => timeTracker))).toBe('Add 20 tools or fewer');
  });
});

describe('the stored Required tools column', () => {
  it('stores nothing for no tools, and the tools with trimmed names otherwise', () => {
    expect(toStoredRequiredTools(undefined)).toBeNull();
    expect(toStoredRequiredTools([])).toBeNull();
    expect(toStoredRequiredTools([{ ...timeTracker, name: '  Time tracker ' }, slides])).toBe(
      JSON.stringify([timeTracker, slides]),
    );
  });

  it('reads the stored JSON, or a list, back into tools', () => {
    expect(readRequiredTools(toStoredRequiredTools([timeTracker, slides]))).toEqual([timeTracker, slides]);
    expect(readRequiredTools([slides])).toEqual([slides]);
  });

  it('reads no tools from an empty column or text that is not a JSON list', () => {
    for (const stored of [null, undefined, '', 'not json', '{"name":"Timer"}', 42]) expect(readRequiredTools(stored)).toEqual([]);
  });

  it(`skips a stored tool it cannot read and stops at ${REQUIRED_TOOLS_MAX}, never failing the Template that holds them`, () => {
    const stored = JSON.stringify([
      { name: 'Unsafe', url: 'javascript:alert(1)', required: true },
      'Timer',
      null,
      ...Array.from({ length: REQUIRED_TOOLS_MAX + 5 }, (_, index) => ({ ...slides, name: `Tool ${index}` })),
    ]);

    const tools = readRequiredTools(stored);

    expect(tools).toHaveLength(REQUIRED_TOOLS_MAX);
    expect(tools[0]).toEqual({ ...slides, name: 'Tool 0' });
  });
});
